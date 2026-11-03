export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

/** Plain module (not "use client") so server components can pass these definitions as props. */
export const SERIES = {
  impressions: { key: "impressions", label: "Impressions", color: "var(--chart-1)" },
  clicks: { key: "clicks", label: "Clicks", color: "var(--chart-2)" },
  detections: { key: "detections", label: "Beacon detections", color: "var(--chart-5)" },
} satisfies Record<string, ChartSeries>;
