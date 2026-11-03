import { Bluetooth, ExternalLink } from "lucide-react";

/** Approximation of how the mobile app renders the promotional notification. */
export function NotificationPreview({
  title,
  message,
  imageUrl,
  ctaLabel,
  organizationName = "Beacon Ads",
}: {
  title: string;
  message: string;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  organizationName?: string;
}) {
  return (
    <div className="rounded-2xl border bg-muted/40 p-4">
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Notification preview</p>
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="flex items-start gap-3 p-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bluetooth className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{organizationName}</span>
              <span>now</span>
            </div>
            <p className="truncate text-sm font-semibold">{title || "Notification title"}</p>
            <p className="line-clamp-3 text-sm text-muted-foreground">{message || "Your notification message appears here."}</p>
          </div>
        </div>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-provided hosts
          <img src={imageUrl} alt="" className="aspect-[2/1] w-full border-t object-cover" />
        ) : null}
        {ctaLabel ? (
          <div className="flex items-center gap-1.5 border-t px-3 py-2 text-sm font-medium text-info">
            <ExternalLink className="size-3.5" />
            {ctaLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
