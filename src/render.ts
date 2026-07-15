import type { Report } from "./types.js";
import { formatGaDate, isRateMetric, totalsByMetric } from "./report.js";

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
  /** Sessions broken down by default channel group (from --channels). */
  channels?: Report;
}

/** Render the GA4 digest as Markdown. */
export function renderMarkdown(input: RenderInput): string {
  const { propertyId, days, daily, topPages, channels } = input;
  const totals = totalsByMetric(daily);
  const lines: string[] = [`# GA4 property ${propertyId} — last ${days} complete days (excluding today)`, ""];

  // Totals summary. Rate metrics (e.g. bounceRate) are not summable, so they
  // are shown as "avg n/a" instead of a meaningless column sum.
  lines.push("## Totals");
  daily.metricNames.forEach((m, i) => {
    lines.push(isRateMetric(m) ? `- ${label(m)}: avg n/a (rate metric)` : `- ${label(m)}: ${num(totals[i] ?? 0)}`);
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

  // Optional traffic-source breakdown.
  if (channels && channels.rows.length > 0) {
    lines.push("## Channels");
    channels.rows.forEach((row, i) => {
      lines.push(`${i + 1}. ${row.dimensions[0] ?? "(unknown)"} — ${num(row.metrics[0] ?? 0)}`);
    });
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}

/** Render the GA4 digest as JSON. */
export function renderJson(input: RenderInput): string {
  const { propertyId, days, daily, topPages, channels } = input;
  const totals = totalsByMetric(daily);
  return (
    JSON.stringify(
      {
        propertyId,
        days,
        // Rate metrics are not summable, so their total is null.
        totals: Object.fromEntries(
          daily.metricNames.map((m, i) => [m, isRateMetric(m) ? null : (totals[i] ?? 0)]),
        ),
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
        ...(channels
          ? {
              channels: channels.rows.map((row) => ({
                channel: row.dimensions[0] ?? "",
                sessions: row.metrics[0] ?? 0,
              })),
            }
          : {}),
      },
      null,
      2,
    ) + "\n"
  );
}
