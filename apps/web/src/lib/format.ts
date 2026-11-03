import { formatDistanceToNowStrict } from "date-fns";

const numberFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatCompact(value: number): string {
  return value >= 10_000 ? compactFormat.format(value) : numberFormat.format(value);
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDateTime(value: Date | string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

export function formatDate(value: Date | string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(new Date(value));
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function formatCompanyId(value: number | null | undefined): string {
  return value === null || value === undefined ? "Not configured" : `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function formatBucketLabel(bucket: string, granularity: "day" | "week" | "month"): string {
  const date = new Date(`${bucket}T00:00:00Z`);
  if (granularity === "month") return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  return granularity === "week" ? `Wk of ${label}` : label;
}
