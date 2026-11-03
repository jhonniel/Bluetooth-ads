"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelative } from "@/lib/format";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy to clipboard.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

/** Relative time rendered on the client to avoid server/client clock mismatches. */
export function TimeAgo({ value }: { value: Date | string | null }) {
  return (
    <time suppressHydrationWarning dateTime={value ? new Date(value).toISOString() : undefined} title={formatDateTime(value)}>
      {formatRelative(value)}
    </time>
  );
}

export function LocalDateTime({ value }: { value: Date | string | null }) {
  return <span suppressHydrationWarning>{formatDateTime(value)}</span>;
}
