import type { CampaignStatus } from "@bpa/shared";

export interface CampaignSchedule {
  status: CampaignStatus;
  startAt: Date | null;
  endAt: Date | null;
}

export interface RankedCampaign extends CampaignSchedule {
  id: number;
  priority: number;
}

/**
 * The stored status reflects administrator intent (draft, paused, archived) and the last observed
 * schedule state. ACTIVE/SCHEDULED are re-derived from the schedule so a campaign is never served
 * before it starts or after it ends, even if the background status sync has not run yet.
 */
export function effectiveCampaignStatus(campaign: CampaignSchedule, now: Date): CampaignStatus {
  if (campaign.status !== "ACTIVE" && campaign.status !== "SCHEDULED") return campaign.status;
  if (campaign.endAt && campaign.endAt <= now) return "EXPIRED";
  if (campaign.startAt && campaign.startAt > now) return "SCHEDULED";
  return "ACTIVE";
}

export function isCampaignLive(campaign: CampaignSchedule, now: Date): boolean {
  return effectiveCampaignStatus(campaign, now) === "ACTIVE";
}

/** Status a campaign moves to when an administrator activates it. */
export function statusOnActivate(campaign: Pick<CampaignSchedule, "startAt" | "endAt">, now: Date): "ACTIVE" | "SCHEDULED" {
  if (campaign.endAt && campaign.endAt <= now) {
    throw new Error("Campaign end date is in the past. Update the schedule before activating.");
  }
  return campaign.startAt && campaign.startAt > now ? "SCHEDULED" : "ACTIVE";
}

/**
 * Recomputes a running campaign's status after its schedule was edited. Other statuses are kept;
 * an expired campaign whose end date is extended stays expired until explicitly re-activated.
 */
export function statusAfterScheduleChange(campaign: CampaignSchedule, now: Date): CampaignStatus {
  if (campaign.status !== "ACTIVE" && campaign.status !== "SCHEDULED") return campaign.status;
  return effectiveCampaignStatus({ ...campaign, status: "ACTIVE" }, now);
}

/**
 * Chooses the single campaign a station advertises. A pinned target wins when it is live;
 * otherwise the highest priority live campaign, then the most recently started, then the oldest record.
 */
export function selectCampaignForStation<T extends RankedCampaign>(campaigns: T[], targetCampaignId: number | null, now: Date): T | null {
  const live = campaigns.filter((campaign) => isCampaignLive(campaign, now));
  if (live.length === 0) return null;
  if (targetCampaignId !== null) {
    const target = live.find((campaign) => campaign.id === targetCampaignId);
    if (target) return target;
  }
  return [...live].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aStart = a.startAt?.getTime() ?? 0;
    const bStart = b.startAt?.getTime() ?? 0;
    if (bStart !== aStart) return bStart - aStart;
    return a.id - b.id;
  })[0]!;
}

/** Earliest future moment at which the live selection may change (a start or an end). */
export function nextScheduleChange(campaigns: CampaignSchedule[], now: Date): Date | null {
  let next: number | null = null;
  for (const campaign of campaigns) {
    if (campaign.status !== "ACTIVE" && campaign.status !== "SCHEDULED") continue;
    for (const moment of [campaign.startAt, campaign.endAt]) {
      if (moment && moment > now && (next === null || moment.getTime() < next)) next = moment.getTime();
    }
  }
  return next === null ? null : new Date(next);
}
