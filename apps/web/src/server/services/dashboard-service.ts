import "server-only";
import { effectiveCampaignStatus } from "@/server/domain/campaign-rules";
import { effectiveStationStatus, heartbeatCutoff } from "@/server/domain/station-health";
import { auditRepository } from "@/server/repositories/audit-repository";
import { campaignRepository } from "@/server/repositories/campaign-repository";
import { eventRepository } from "@/server/repositories/event-repository";
import { stationLogRepository } from "@/server/repositories/station-log-repository";
import { stationRepository } from "@/server/repositories/station-repository";
import { analyticsService, ctr } from "./analytics-service";
import { settingsService } from "./settings-service";

export interface ActivityItem {
  id: string;
  at: Date;
  kind: "audit" | "station";
  level: "INFO" | "WARN" | "ERROR";
  title: string;
  actor: string | null;
  href: string | null;
}

export const dashboardService = {
  async overview() {
    const now = new Date();
    await campaignRepository.syncScheduledStatuses(now);
    const settings = await settingsService.getSystemSettings();

    const [byStatus, stationTotal, stationsOnline, allTime, report, stationOverview, recentCampaigns, audits, stationLogs] = await Promise.all([
      campaignRepository.countByStatus(),
      stationRepository.countAll(),
      stationRepository.countOnline(heartbeatCutoff(now, settings.offlineThresholdSeconds)),
      eventRepository.countsByType(null),
      analyticsService.report({}),
      stationRepository.overview(6),
      campaignRepository.recent(6),
      auditRepository.recent(10),
      stationLogRepository.recentAcrossStations(10),
    ]);

    const campaignTotal = byStatus.reduce((sum, row) => sum + row._count._all, 0);
    const activeCampaigns = byStatus.find((row) => row.status === "ACTIVE")?._count._all ?? 0;

    const activity: ActivityItem[] = [
      ...audits.map((a) => ({
        id: `a${a.id}`,
        at: a.createdAt,
        kind: "audit" as const,
        level: "INFO" as const,
        title: a.summary,
        actor: a.user?.name ?? null,
        href:
          a.entityType === "campaign" && a.entityId
            ? `/campaigns/${a.entityId}`
            : a.entityType === "station" && a.entityId
              ? `/stations/${a.entityId}`
              : null,
      })),
      ...stationLogs.map((l) => ({
        id: `s${l.id}`,
        at: l.createdAt,
        kind: "station" as const,
        level: l.level,
        title: `${l.station.name}: ${l.message}`,
        actor: null,
        href: `/stations/${l.station.stationCode}`,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 10);

    return {
      stats: {
        campaignTotal,
        activeCampaigns,
        stationTotal,
        stationsOnline,
        impressions: allTime.notification_displayed,
        clicks: allTime.notification_clicked,
        detections: allTime.beacon_detected,
        ctr: ctr(allTime.notification_clicked, allTime.notification_displayed),
      },
      last30Days: report,
      stations: stationOverview.map((s) => ({ ...s, effectiveStatus: effectiveStationStatus(s, now, settings.offlineThresholdSeconds) })),
      recentCampaigns: recentCampaigns.map((c) => ({ ...c, effectiveStatus: effectiveCampaignStatus(c, now) })),
      activity,
    };
  },
};
