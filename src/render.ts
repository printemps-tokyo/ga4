import type { Report } from "./types.js";
import type { AccountEntry } from "./admin.js";
import type { PropertyTotals } from "./all.js";
import { formatGaDate, isRateMetric, reportTotals, totalsByMetric } from "./report.js";

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

/** A metric value for display: rates (0..1) as a percentage, counts rounded. */
function metricValue(metric: string, value: number): string {
  return isRateMetric(metric) ? `${(value * 100).toFixed(1)}%` : num(value);
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
  const totals = reportTotals(daily);
  const lines: string[] = [`# GA4 property ${propertyId} — last ${days} complete days (excluding today)`, ""];

  // Totals come from GA4 when the report carries them (users and sessions
  // deduplicated across the range, rates computed for the whole period).
  // Without them, rate metrics cannot be summed and show "n/a".
  lines.push("## Totals");
  daily.metricNames.forEach((m, i) => {
    const t = totals[i];
    lines.push(t === null || t === undefined ? `- ${label(m)}: avg n/a (rate metric)` : `- ${label(m)}: ${metricValue(m, t)}`);
  });
  lines.push("");

  // Daily breakdown (only when a date dimension is present).
  if (daily.dimensionNames[0] === "date" && daily.rows.length > 0) {
    lines.push("## Daily");
    lines.push(`| Date | ${daily.metricNames.map(label).join(" | ")} |`);
    lines.push(`| --- | ${daily.metricNames.map(() => "---:").join(" | ")} |`);
    for (const row of daily.rows) {
      const date = formatGaDate(row.dimensions[0] ?? "");
      lines.push(`| ${date} | ${row.metrics.map((v, i) => metricValue(daily.metricNames[i] ?? "", v)).join(" | ")} |`);
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
    const total = channels.totals?.[0];
    if (total !== undefined) {
      lines.push("");
      lines.push(`Total sessions: ${num(total)}`);
      const listed = totalsByMetric(channels)[0] ?? 0;
      if (listed > total) {
        // GA4 counts each session once per range, but one session can appear
        // under more than one row, so the rows can add up to more.
        lines.push(
          `(Rows add up to ${num(listed)}: GA4 deduplicates sessions in the total, and one session can appear in more than one channel row.)`,
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}

/** Render the GA4 digest as JSON. */
export function renderJson(input: RenderInput): string {
  const { propertyId, days, daily, topPages, channels } = input;
  const totals = reportTotals(daily);
  return (
    JSON.stringify(
      {
        propertyId,
        days,
        // GA4's deduplicated totals when available; otherwise column sums,
        // with null for rate metrics, which cannot be summed.
        totals: Object.fromEntries(daily.metricNames.map((m, i) => [m, totals[i] ?? null])),
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
              ...(channels.totals ? { channelsTotalSessions: channels.totals[0] ?? 0 } : {}),
            }
          : {}),
      },
      null,
      2,
    ) + "\n"
  );
}

/** Short label for a non-ordinary property type (subproperty, roll-up). */
function propertyTypeNote(type: string | undefined): string {
  if (!type || type === "PROPERTY_TYPE_ORDINARY" || type === "PROPERTY_TYPE_UNSPECIFIED") {
    return "";
  }
  return ` (${type.replace(/^PROPERTY_TYPE_/, "").toLowerCase()})`;
}

/** Render `--list` output as Markdown: one table of properties per account. */
export function renderAccountsMarkdown(accounts: AccountEntry[]): string {
  const lines: string[] = ["# GA4 accounts and properties", ""];
  if (accounts.length === 0) {
    lines.push(
      "No accounts are visible to these credentials. Add the service account's email to a GA4 account or property (Admin -> Access management).",
    );
    return lines.join("\n") + "\n";
  }
  for (const account of accounts) {
    lines.push(`## ${account.name} (${account.id})`, "");
    if (account.properties.length === 0) {
      lines.push("No properties visible in this account.", "");
      continue;
    }
    lines.push("| Property | ID |", "| --- | --- |");
    for (const p of account.properties) {
      lines.push(`| ${p.name}${propertyTypeNote(p.type)} | ${p.id} |`);
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}

/** Render `--list` output as JSON. */
export function renderAccountsJson(accounts: AccountEntry[]): string {
  return JSON.stringify({ accounts }, null, 2) + "\n";
}

/** Render `--all` output as Markdown: one row per property. */
export function renderAllMarkdown(rows: PropertyTotals[], days: number, metricNames: string[]): string {
  const lines: string[] = [`# GA4 — all properties, last ${days} complete days (excluding today)`, ""];
  if (rows.length === 0) {
    lines.push("No properties are visible to these credentials.");
    return lines.join("\n") + "\n";
  }
  lines.push(`| Account | Property | ID | ${metricNames.map(label).join(" | ")} |`);
  lines.push(`| --- | --- | --- | ${metricNames.map(() => "---:").join(" | ")} |`);
  for (const r of rows) {
    const cells = r.values
      ? r.values.map((v, i) => metricValue(metricNames[i] ?? "", v))
      : metricNames.map(() => "error");
    lines.push(`| ${r.accountName} | ${r.propertyName} | ${r.propertyId} | ${cells.join(" | ")} |`);
  }
  const failed = rows.filter((r) => r.error);
  if (failed.length > 0) {
    lines.push("", "## Errors");
    for (const r of failed) {
      lines.push(`- ${r.propertyName} (${r.propertyId}): ${r.error}`);
    }
  }
  lines.push(
    "",
    "Each row is GA4's own total for that property over the range. Rows are not added up: the same person counts once per property they visit.",
  );
  return lines.join("\n") + "\n";
}

/** Render `--all` output as JSON. */
export function renderAllJson(rows: PropertyTotals[], days: number, metricNames: string[]): string {
  return (
    JSON.stringify(
      {
        days,
        properties: rows.map((r) => ({
          accountId: r.accountId,
          accountName: r.accountName,
          propertyId: r.propertyId,
          propertyName: r.propertyName,
          ...(r.values
            ? { totals: Object.fromEntries(metricNames.map((m, i) => [m, r.values?.[i] ?? 0])) }
            : { error: r.error ?? "unknown error" }),
        })),
      },
      null,
      2,
    ) + "\n"
  );
}
