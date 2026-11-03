import "server-only";
import type { Prisma } from "@prisma/client";
import type { MobileCampaign, MobileCampaignQuery, MobileCampaignsResponse, MobileEvent, MobileEventsResponse } from "@bpa/shared";
import { hashDeviceToken } from "@/lib/crypto";
import { NotFoundError } from "@/lib/errors";
import { rateLimiter } from "@/lib/rate-limit";
import { isCampaignLive } from "@/server/domain/campaign-rules";
import { evaluateEligibility, isWithinQuietHours, startOfDayInTimeZone } from "@/server/domain/notification-policy";
import { campaignRepository } from "@/server/repositories/campaign-repository";
import { eventRepository } from "@/server/repositories/event-repository";
import { stationRepository } from "@/server/repositories/station-repository";
import { settingsService } from "./settings-service";
import { storageService } from "./storage-service";

const MAX_EVENT_AGE_MS = 7 * 86_400_000;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const SCHEDULE_TOLERANCE_MS = 15 * 60_000;

export const mobileService = {
  /**
   * Campaigns a detected beacon currently represents. Only live campaigns assigned to the beacon's
   * station are returned. When a device token is supplied, server-side frequency capping is evaluated.
   */
  async campaignsForBeacon(beaconId: string, query: MobileCampaignQuery): Promise<MobileCampaignsResponse> {
    const station = await stationRepository.findByBeacon(beaconId);
    if (!station) throw new NotFoundError("Unknown beacon.");

    const now = new Date();
    await campaignRepository.syncScheduledStatuses(now);
    const [notification, system] = await Promise.all([settingsService.getNotificationSettings(), settingsService.getSystemSettings()]);

    let campaigns = (await campaignRepository.assignedToStation(station.id)).filter(
      (c) => c.advertisement && !c.advertisement.deletedAt && isCampaignLive(c, now),
    );
    if (query.key !== undefined) campaigns = campaigns.filter((c) => c.beaconKey === query.key);

    const minRssi = station.minRssi ?? notification.minRssi;
    const quietHoursActive =
      notification.quietHoursEnabled && isWithinQuietHours(now, notification.quietHoursStart, notification.quietHoursEnd, system.timezone);

    let lastDisplayed = new Map<number, Date>();
    let todayByCampaign = new Map<number, number>();
    let todayTotal = 0;
    if (query.device && campaigns.length) {
      const deviceHash = hashDeviceToken(query.device);
      const dayStart = startOfDayInTimeZone(now, system.timezone);
      const [history, last] = await Promise.all([
        eventRepository.displayHistory(deviceHash, dayStart),
        eventRepository.lastDisplayedPerCampaign(deviceHash, campaigns.map((c) => c.id)),
      ]);
      todayTotal = history.length;
      todayByCampaign = history.reduce((map, e) => map.set(e.campaignId, (map.get(e.campaignId) ?? 0) + 1), new Map<number, number>());
      lastDisplayed = new Map(last.filter((row) => row._max.occurredAt).map((row) => [row.campaignId, row._max.occurredAt!]));
    }

    const expiresAt = new Date(now.getTime() + notification.notificationExpirationMinutes * 60_000);
    const result: MobileCampaign[] = campaigns.map((campaign) => {
      const ad = campaign.advertisement!;
      const cooldownMinutes = campaign.cooldownMinutes ?? notification.defaultCooldownMinutes;
      const maxNotificationsPerDay = campaign.maxNotificationsPerDay ?? notification.maxNotificationsPerDay;
      const reason = query.device
        ? evaluateEligibility({
            now,
            rssi: query.rssi ?? null,
            minRssi,
            quietHoursActive,
            lastDisplayedAt: lastDisplayed.get(campaign.id) ?? null,
            cooldownMinutes,
            displayedTodayAllCampaigns: todayTotal,
            globalMaxPerDay: notification.maxNotificationsPerDay,
            displayedTodayForCampaign: todayByCampaign.get(campaign.id) ?? 0,
            campaignMaxPerDay: campaign.maxNotificationsPerDay,
          })
        : null;
      return {
        id: campaign.uuid,
        beaconKey: campaign.beaconKey,
        priority: campaign.priority,
        endAt: campaign.endAt?.toISOString() ?? null,
        notification: {
          title: ad.title,
          message: ad.message,
          imageUrl: storageService.toAbsoluteUrl(ad.imageUrl),
          description: ad.description,
          landingUrl: ad.landingUrl,
          ctaLabel: ad.ctaLabel,
          expiresAt: (campaign.endAt && campaign.endAt < expiresAt ? campaign.endAt : expiresAt).toISOString(),
        },
        policy: { cooldownMinutes, maxNotificationsPerDay },
        eligibility: reason ? { eligible: reason === "ok", reason } : { eligible: null, reason: "not_evaluated" },
      };
    });

    return {
      beaconId: station.beaconIdentifier,
      station: { name: station.name, location: station.location },
      proximity: { minRssi },
      quietHours: { active: quietHoursActive },
      campaigns: result,
      serverTime: now.toISOString(),
    };
  },

  /**
   * Records events reported by the mobile app. An impression is only ever a notification the app
   * reports as displayed; beacon broadcasts are never counted. Events must reference a campaign
   * assigned to the reported beacon's station and fall within the campaign schedule.
   */
  async recordEvents(events: MobileEvent[]): Promise<MobileEventsResponse> {
    const now = new Date();
    const notification = await settingsService.getNotificationSettings();
    const deviceLimiter = rateLimiter("mobile-device-events", 200, 60 * 60_000);

    const beaconIds = [...new Set(events.map((e) => e.beaconId))];
    const campaignUuids = [...new Set(events.map((e) => e.campaignId))];
    const [stations, campaigns] = await Promise.all([
      stationRepository.findManyByBeacons(beaconIds),
      campaignRepository.findManyByUuids(campaignUuids),
    ]);
    const stationByBeacon = new Map(stations.map((s) => [s.beaconIdentifier, s.id]));
    const campaignByUuid = new Map(campaigns.map((c) => [c.uuid, c]));
    const assignments = await campaignRepository.assignments(
      campaigns.map((c) => c.id),
      stations.map((s) => s.id),
    );
    const assigned = new Set(assignments.map((a) => `${a.campaignId}:${a.stationId}`));

    const rejected: MobileEventsResponse["rejected"] = [];
    const candidates: Prisma.AdvertisingEventCreateManyInput[] = [];

    events.forEach((event, index) => {
      const occurredAt = event.occurredAt ? new Date(event.occurredAt) : now;
      if (occurredAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) return rejected.push({ index, reason: "occurred_in_future" });
      if (now.getTime() - occurredAt.getTime() > MAX_EVENT_AGE_MS) return rejected.push({ index, reason: "too_old" });

      const stationId = stationByBeacon.get(event.beaconId);
      if (!stationId) return rejected.push({ index, reason: "unknown_beacon" });
      const campaign = campaignByUuid.get(event.campaignId);
      if (!campaign || campaign.status === "DRAFT") return rejected.push({ index, reason: "unknown_campaign" });
      if (!assigned.has(`${campaign.id}:${stationId}`)) return rejected.push({ index, reason: "campaign_not_assigned_to_beacon" });
      const startsOk = !campaign.startAt || occurredAt.getTime() >= campaign.startAt.getTime() - SCHEDULE_TOLERANCE_MS;
      const endsOk = !campaign.endAt || occurredAt.getTime() <= campaign.endAt.getTime() + SCHEDULE_TOLERANCE_MS;
      if (!startsOk || !endsOk) return rejected.push({ index, reason: "outside_campaign_schedule" });

      const deviceHash = hashDeviceToken(event.deviceToken);
      if (!deviceLimiter.consume(deviceHash).allowed) return rejected.push({ index, reason: "device_rate_limited" });

      candidates.push({
        campaignId: campaign.id,
        stationId,
        eventType: event.type,
        anonymousDeviceToken: deviceHash,
        rssi: event.rssi ?? null,
        platform: event.platform ?? null,
        appVersion: event.appVersion ?? null,
        occurredAt,
      });
    });

    let duplicates = 0;
    let accepted = candidates;
    if (notification.duplicatePreventionEnabled && candidates.length) {
      const windowMs = notification.duplicateWindowSeconds * 1000;
      const earliest = Math.min(...candidates.map((c) => (c.occurredAt as Date).getTime())) - windowMs;
      const existing = await eventRepository.recentForDevices(
        [...new Set(candidates.map((c) => c.anonymousDeviceToken))],
        [...new Set(candidates.map((c) => c.campaignId))],
        new Date(earliest),
      );
      const seen = existing.map((e) => ({ key: `${e.anonymousDeviceToken}:${e.campaignId}:${e.eventType}`, at: e.occurredAt.getTime() }));
      accepted = [];
      for (const candidate of candidates) {
        const key = `${candidate.anonymousDeviceToken}:${candidate.campaignId}:${candidate.eventType}`;
        const at = (candidate.occurredAt as Date).getTime();
        if (seen.some((s) => s.key === key && Math.abs(s.at - at) < windowMs)) {
          duplicates++;
          continue;
        }
        seen.push({ key, at });
        accepted.push(candidate);
      }
    }

    if (accepted.length) {
      await eventRepository.createMany(accepted);
    }
    return { accepted: accepted.length, duplicates, rejected };
  },
};
