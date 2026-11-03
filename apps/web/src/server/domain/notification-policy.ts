export type EligibilityReason = "ok" | "too_far" | "quiet_hours" | "cooldown" | "daily_limit" | "campaign_limit";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeOfDay(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid time of day: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

export function minutesOfDayInTimeZone(date: Date, timeZone: string): number {
  const { hour, minute } = zonedParts(date, timeZone);
  return hour * 60 + minute;
}

/** Quiet hours may span midnight (e.g. 22:00-08:00). Equal start and end means no quiet period. */
export function isWithinQuietHours(now: Date, start: string, end: string, timeZone: string): boolean {
  const startMinutes = parseTimeOfDay(start);
  const endMinutes = parseTimeOfDay(end);
  if (startMinutes === endMinutes) return false;
  const current = minutesOfDayInTimeZone(now, timeZone);
  return startMinutes < endMinutes
    ? current >= startMinutes && current < endMinutes
    : current >= startMinutes || current < endMinutes;
}

/** Offset of the time zone from UTC at the given instant, in milliseconds (positive east of UTC). */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Midnight of the current local day in the given time zone, as an absolute instant. */
export function startOfDayInTimeZone(now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - timeZoneOffsetMs(now, timeZone));
}

/** Local calendar date (yyyy-MM-dd) of an instant in the given time zone. */
export function localDateString(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Absolute instant of local midnight for a yyyy-MM-dd date in the given time zone. */
export function zonedMidnight(dateString: string, timeZone: string): Date {
  const [year, month, day] = dateString.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - timeZoneOffsetMs(new Date(guess), timeZone);
  // Re-evaluate the offset at the candidate instant in case a DST change sits in between.
  return new Date(guess - timeZoneOffsetMs(new Date(first), timeZone));
}

export interface EligibilityInput {
  now: Date;
  rssi: number | null;
  minRssi: number;
  quietHoursActive: boolean;
  lastDisplayedAt: Date | null;
  cooldownMinutes: number;
  /** Notifications shown to this device today across all campaigns. */
  displayedTodayAllCampaigns: number;
  globalMaxPerDay: number;
  /** Notifications shown to this device today for this campaign. */
  displayedTodayForCampaign: number;
  campaignMaxPerDay: number | null;
}

/**
 * Server-side frequency capping. The global daily limit caps notifications across all campaigns;
 * a campaign-specific limit additionally caps that campaign. Both must pass.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityReason {
  if (input.rssi !== null && input.rssi < input.minRssi) return "too_far";
  if (input.quietHoursActive) return "quiet_hours";
  if (input.lastDisplayedAt && input.now.getTime() - input.lastDisplayedAt.getTime() < input.cooldownMinutes * 60_000) {
    return "cooldown";
  }
  if (input.displayedTodayAllCampaigns >= input.globalMaxPerDay) return "daily_limit";
  if (input.campaignMaxPerDay !== null && input.displayedTodayForCampaign >= input.campaignMaxPerDay) return "campaign_limit";
  return "ok";
}
