import { handle, readQuery } from "@/lib/api-response";
import { requireApiUser } from "@/server/http";
import { analyticsQuerySchema, analyticsService } from "@/server/services/analytics-service";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  const text = String(value);
  // Prefix formula-like values so spreadsheets do not evaluate them.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const GET = handle("analytics.export", async (request: Request) => {
  await requireApiUser("analytics:read");
  const report = await analyticsService.report(readQuery(request, analyticsQuerySchema));
  const lines: string[] = [];
  const row = (...cells: (string | number)[]) => lines.push(cells.map(csvCell).join(","));

  row("Report", `${report.view.granularity} report ${report.view.from} to ${report.view.to}`);
  row("Campaign filter", report.view.campaign?.name ?? "All campaigns");
  row("Station filter", report.view.station?.name ?? "All stations");
  lines.push("");
  row("Period", "Beacon detections", "Impressions", "Clicks", "CTR");
  for (const p of report.series) row(p.bucket, p.detections, p.impressions, p.clicks, (p.ctr * 100).toFixed(2) + "%");
  lines.push("");
  row("Campaign", "Beacon detections", "Impressions", "Clicks", "CTR");
  for (const c of report.campaigns) row(c.name, c.detections, c.impressions, c.clicks, (c.ctr * 100).toFixed(2) + "%");
  lines.push("");
  row("Station", "Location", "Beacon detections", "Impressions", "Clicks", "CTR");
  for (const s of report.stations) row(s.name, s.location ?? "", s.detections, s.impressions, s.clicks, (s.ctr * 100).toFixed(2) + "%");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analytics-${report.view.from}-to-${report.view.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
