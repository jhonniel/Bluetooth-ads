import type { BluetoothStatus, CampaignStatus, StationCommandStatus, StationStatus } from "@bpa/shared";
import { cn } from "@/lib/utils";
import {
  BLUETOOTH_STATUS_META,
  CAMPAIGN_STATUS_META,
  COMMAND_STATUS_META,
  STATION_STATUS_META,
  type Tone,
} from "@/lib/labels";

const toneClasses: Record<Tone, { badge: string; dot: string }> = {
  success: { badge: "border-success/30 bg-success/10 text-success", dot: "bg-success" },
  info: { badge: "border-info/30 bg-info/10 text-info", dot: "bg-info" },
  warning: { badge: "border-warning/40 bg-warning/10 text-amber-700 dark:text-warning", dot: "bg-warning" },
  danger: { badge: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: { badge: "border-border bg-muted text-foreground/80", dot: "bg-foreground/50" },
  muted: { badge: "border-border bg-muted/60 text-muted-foreground", dot: "bg-muted-foreground/60" },
};

export function StatusIndicator({ tone, label, pulse, className, title }: { tone: Tone; label: string; pulse?: boolean; className?: string; title?: string }) {
  const classes = toneClasses[tone];
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", classes.badge, className)}
    >
      <span className="relative flex size-1.5">
        {pulse ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", classes.dot)} /> : null}
        <span className={cn("relative inline-flex size-1.5 rounded-full", classes.dot)} />
      </span>
      {label}
    </span>
  );
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const meta = CAMPAIGN_STATUS_META[status];
  return <StatusIndicator tone={meta.tone} label={meta.label} pulse={status === "ACTIVE"} />;
}

export function StationStatusBadge({ status }: { status: StationStatus }) {
  const meta = STATION_STATUS_META[status];
  return <StatusIndicator tone={meta.tone} label={meta.label} pulse={status === "ONLINE"} />;
}

export function BluetoothStatusBadge({ status, stale }: { status: BluetoothStatus; stale?: boolean }) {
  const meta = BLUETOOTH_STATUS_META[status];
  if (stale) {
    return <StatusIndicator tone="muted" label={`${meta.label} (last report)`} title="The station is offline; this is the last reported Bluetooth state." />;
  }
  return <StatusIndicator tone={meta.tone} label={meta.label} pulse={status === "ADVERTISING"} title={meta.description} />;
}

export function CommandStatusBadge({ status }: { status: StationCommandStatus }) {
  const meta = COMMAND_STATUS_META[status];
  return <StatusIndicator tone={meta.tone} label={meta.label} />;
}
