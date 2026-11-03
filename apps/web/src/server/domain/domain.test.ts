import { describe, expect, it } from "vitest";
import {
  effectiveCampaignStatus,
  nextScheduleChange,
  selectCampaignForStation,
  statusAfterScheduleChange,
  statusOnActivate,
} from "./campaign-rules";
import { evaluateEligibility, isWithinQuietHours, startOfDayInTimeZone } from "./notification-policy";
import { effectiveStationStatus } from "./station-health";
import { resolveCompanyId } from "./beacon-config";

const now = new Date("2026-11-03T06:00:00.000Z");
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe("campaign rules", () => {
  it("derives effective status from the schedule", () => {
    expect(effectiveCampaignStatus({ status: "ACTIVE", startAt: hours(1), endAt: null }, now)).toBe("SCHEDULED");
    expect(effectiveCampaignStatus({ status: "SCHEDULED", startAt: hours(-1), endAt: hours(1) }, now)).toBe("ACTIVE");
    expect(effectiveCampaignStatus({ status: "ACTIVE", startAt: null, endAt: hours(-1) }, now)).toBe("EXPIRED");
    expect(effectiveCampaignStatus({ status: "PAUSED", startAt: null, endAt: null }, now)).toBe("PAUSED");
  });

  it("activates into scheduled or active and refuses past end dates", () => {
    expect(statusOnActivate({ startAt: hours(2), endAt: null }, now)).toBe("SCHEDULED");
    expect(statusOnActivate({ startAt: null, endAt: hours(2) }, now)).toBe("ACTIVE");
    expect(() => statusOnActivate({ startAt: null, endAt: hours(-2) }, now)).toThrow();
  });

  it("keeps non-running statuses when the schedule changes", () => {
    expect(statusAfterScheduleChange({ status: "DRAFT", startAt: null, endAt: hours(-1) }, now)).toBe("DRAFT");
    expect(statusAfterScheduleChange({ status: "EXPIRED", startAt: null, endAt: hours(5) }, now)).toBe("EXPIRED");
    expect(statusAfterScheduleChange({ status: "ACTIVE", startAt: hours(3), endAt: null }, now)).toBe("SCHEDULED");
  });

  it("selects pinned target, then priority", () => {
    const campaigns = [
      { id: 1, priority: 10, status: "ACTIVE" as const, startAt: null, endAt: null },
      { id: 2, priority: 90, status: "ACTIVE" as const, startAt: null, endAt: null },
      { id: 3, priority: 99, status: "PAUSED" as const, startAt: null, endAt: null },
      { id: 4, priority: 100, status: "ACTIVE" as const, startAt: hours(1), endAt: null },
    ];
    expect(selectCampaignForStation(campaigns, null, now)?.id).toBe(2);
    expect(selectCampaignForStation(campaigns, 1, now)?.id).toBe(1);
    expect(selectCampaignForStation(campaigns, 3, now)?.id).toBe(2);
    expect(selectCampaignForStation([], null, now)).toBeNull();
  });

  it("finds the next schedule change", () => {
    const next = nextScheduleChange(
      [
        { status: "ACTIVE", startAt: null, endAt: hours(5) },
        { status: "SCHEDULED", startAt: hours(2), endAt: hours(8) },
        { status: "PAUSED", startAt: hours(1), endAt: null },
      ],
      now,
    );
    expect(next?.toISOString()).toBe(hours(2).toISOString());
  });
});

describe("notification policy", () => {
  it("handles quiet hours across midnight in a time zone", () => {
    // 06:00Z is 14:00 in Manila (UTC+8)
    expect(isWithinQuietHours(now, "22:00", "08:00", "Asia/Manila")).toBe(false);
    expect(isWithinQuietHours(now, "13:00", "15:00", "Asia/Manila")).toBe(true);
    expect(isWithinQuietHours(new Date("2026-11-03T15:30:00Z"), "22:00", "08:00", "Asia/Manila")).toBe(true);
    expect(isWithinQuietHours(now, "10:00", "10:00", "UTC")).toBe(false);
  });

  it("computes local start of day", () => {
    expect(startOfDayInTimeZone(now, "Asia/Manila").toISOString()).toBe("2026-11-02T16:00:00.000Z");
    expect(startOfDayInTimeZone(now, "UTC").toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });

  const base = {
    now,
    rssi: -60,
    minRssi: -75,
    quietHoursActive: false,
    lastDisplayedAt: null,
    cooldownMinutes: 60,
    displayedTodayAllCampaigns: 0,
    globalMaxPerDay: 3,
    displayedTodayForCampaign: 0,
    campaignMaxPerDay: null,
  };

  it("evaluates eligibility in order", () => {
    expect(evaluateEligibility(base)).toBe("ok");
    expect(evaluateEligibility({ ...base, rssi: -90 })).toBe("too_far");
    expect(evaluateEligibility({ ...base, quietHoursActive: true })).toBe("quiet_hours");
    expect(evaluateEligibility({ ...base, lastDisplayedAt: hours(-0.5) })).toBe("cooldown");
    expect(evaluateEligibility({ ...base, lastDisplayedAt: hours(-2) })).toBe("ok");
    expect(evaluateEligibility({ ...base, displayedTodayAllCampaigns: 3 })).toBe("daily_limit");
    expect(evaluateEligibility({ ...base, displayedTodayForCampaign: 1, campaignMaxPerDay: 1 })).toBe("campaign_limit");
  });
});

describe("station health", () => {
  it("derives offline from stale heartbeats", () => {
    expect(effectiveStationStatus({ status: "ONLINE", lastHeartbeat: new Date(now.getTime() - 30_000) }, now, 120)).toBe("ONLINE");
    expect(effectiveStationStatus({ status: "ONLINE", lastHeartbeat: new Date(now.getTime() - 300_000) }, now, 120)).toBe("OFFLINE");
    expect(effectiveStationStatus({ status: "ERROR", lastHeartbeat: new Date(now.getTime() - 10_000) }, now, 120)).toBe("ERROR");
    expect(effectiveStationStatus({ status: "OFFLINE", lastHeartbeat: null }, now, 120)).toBe("OFFLINE");
    // Graceful shutdown: fresh heartbeat but agent reported it is going offline.
    expect(effectiveStationStatus({ status: "OFFLINE", lastHeartbeat: new Date(now.getTime() - 5_000) }, now, 120)).toBe("OFFLINE");
  });
});

describe("company identifier resolution", () => {
  it("prefers station override, then default, then test id in development", () => {
    const base = { format: "MANUFACTURER_DATA" as const, allowTestCompanyId: false };
    expect(resolveCompanyId({ ...base, stationManufacturerId: 0x1234, defaultManufacturerId: 0x0abc }).companyId).toBe(0x1234);
    expect(resolveCompanyId({ ...base, stationManufacturerId: null, defaultManufacturerId: 0x0abc }).companyId).toBe(0x0abc);
    expect(resolveCompanyId({ ...base, stationManufacturerId: null, defaultManufacturerId: null }).error).not.toBeNull();
    const dev = resolveCompanyId({ ...base, allowTestCompanyId: true, stationManufacturerId: null, defaultManufacturerId: null });
    expect(dev).toMatchObject({ companyId: 0xffff, usingTestId: true });
    expect(resolveCompanyId({ format: "IBEACON", allowTestCompanyId: false, stationManufacturerId: null, defaultManufacturerId: null }).companyId).toBe(0x004c);
  });
});
