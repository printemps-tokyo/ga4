import type { Report } from "./types.js";
import { formatGaDate, totalsByMetric } from "./report.js";

/** Friendly column labels for the common GA4 metric names. */
const METRIC_LABELS: Record<string, string> = {
  totalUsers: "Users",
  activeUsers: "Active users",
  newUsers: "New users",
  sessions: "Sessions",
  screenPageViews: "Pageviews",
  engagedSessions: "Engaged sessions",
};

function label(metric: string): string {
  return METRIC_LABELS[metric] ?? metric;
}

function num(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Inputs for rendering a report digest. */
export interface RenderInput {
  propertyId: string;
  days: number;
  daily: Report;
  topPages?: Report;
}

/** Render the GA4 digest as Markdown. */
export function renderMarkdown(input: RenderInput): string {
  const { propertyId, days, daily, topPages } = input;
  const totals = totalsByMetric(daily);
  const lines: string[] = [`# GA4 property ${propertyId} — last ${days} days`, ""];

  // Totals summary.
  lines.push("## Totals");
  daily.metricNames.forEach((m, i) => {
    lines.push(`- ${label(m)}: ${num(totals[i] ?? 0)}`);
  });
  lines.push("");

  // Daily breakdown (only when a date dimension is present).
  if (daily.dimensionNames[0] === "date" && daily.rows.length > 0) {
    lines.push("## Daily");
    lines.push(`| Date | ${daily.metricNames.map(label).join(" | ")} |`);
    lines.push(`| --- | ${daily.metricNames.map(() => "---:").join(" | ")} |`);
    for (const row of daily.rows) {
      const date = formatGaDate(row.dimensions[0] ?? "");
      lines.push(`| ${date} | ${row.metrics.map(num).join(" | ")} |`);
    }
    lines.push("");
  }

  // Optional top pages.
  if (topPages && topPages.rows.length > 0) {
    lines.push("## Top pages");
    topPages.rows.forEach((row, i) => {
      lines.push(`${i + 1}. ${row.dimensions[0] ?? "(unknown)"} — ${num(row.metrics[0] ?? 0)}`);
    });
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}

/** Render the GA4 digest as JSON. */
export function renderJson(input: RenderInput): string {
  const { propertyId, days, daily, topPages } = input;
  const totals = totalsByMetric(daily);
  return (
    JSON.stringify(
      {
        propertyId,
        days,
        totals: Object.fromEntries(daily.metricNames.map((m, i) => [m, totals[i] ?? 0])),
        daily: daily.rows.map((row) => ({
          date: formatGaDate(row.dimensions[0] ?? ""),
          ...Object.fromEntries(daily.metricNames.map((m, i) => [m, row.metrics[i] ?? 0])),
        })),
        ...(topPages
          ? {
              topPages: topPages.rows.map((row) => ({
                path: row.dimensions[0] ?? "",
                views: row.metrics[0] ?? 0,
              })),
            }
          : {}),
      },
      null,
      2,
    ) + "\n"
  );
}
