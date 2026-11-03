"use client";

import { Download, Loader2 } from "lucide-react";
import { AsyncSelect } from "@/components/common/async-select";
import { useUrlParams } from "@/components/common/url-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { searchCampaignsAction, searchStationsAction } from "@/app/(dashboard)/search-actions";

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AnalyticsFilters({
  view,
  today,
}: {
  view: {
    from: string;
    to: string;
    granularity: "day" | "week" | "month";
    campaign: { uuid: string; name: string } | null;
    station: { code: string; name: string } | null;
  };
  today: string;
}) {
  const { searchParams, setParams, pending } = useUrlParams();
  const exportHref = `/api/analytics/export?${new URLSearchParams({
    from: view.from,
    to: view.to,
    granularity: view.granularity,
    ...(view.campaign ? { campaign: view.campaign.uuid } : {}),
    ...(view.station ? { station: view.station.code } : {}),
  }).toString()}`;

  const presets = [
    { label: "7 days", from: shift(today, -6) },
    { label: "30 days", from: shift(today, -29) },
    { label: "90 days", from: shift(today, -89) },
    { label: "This month", from: `${today.slice(0, 8)}01` },
  ];

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={view.from} max={view.to} onChange={(e) => e.target.value && setParams({ from: e.target.value })} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={view.to} min={view.from} max={today} onChange={(e) => e.target.value && setParams({ to: e.target.value })} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label>Report</Label>
          <Select value={view.granularity} onValueChange={(value) => setParams({ granularity: value })}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label>Campaign</Label>
          <AsyncSelect
            value={view.campaign ? { value: view.campaign.uuid, label: view.campaign.name } : null}
            onChange={(option) => setParams({ campaign: option?.value ?? null })}
            search={searchCampaignsAction}
            placeholder="All campaigns"
            searchPlaceholder="Campaign name"
          />
        </div>
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label>Station</Label>
          <AsyncSelect
            value={view.station ? { value: view.station.code, label: view.station.name } : null}
            onChange={(option) => setParams({ station: option?.value ?? null })}
            search={searchStationsAction}
            placeholder="All stations"
            searchPlaceholder="Name, code or location"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            variant={view.from === preset.from && view.to === today ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setParams({ from: preset.from, to: today })}
          >
            {preset.label}
          </Button>
        ))}
        {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        <div className="flex-1" />
        {searchParams.toString() ? (
          <Button variant="ghost" size="sm" onClick={() => setParams({ from: null, to: null, granularity: null, campaign: null, station: null })}>
            Reset filters
          </Button>
        ) : null}
        <Button variant="outline" size="sm" asChild>
          <a href={exportHref}>
            <Download /> Export CSV
          </a>
        </Button>
      </div>
    </div>
  );
}
