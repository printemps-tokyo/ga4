import type { Report } from "./types.js";

/** Default metrics for a quick "how much traffic" check. */
export const DEFAULT_METRICS = ["totalUsers", "sessions", "screenPageViews", "newUsers"];

/**
 * Known GA4 rate/percentage metrics (e.g. bounceRate). Summing these across
 * rows is meaningless, so renderers skip them in the Totals section. Matches
 * plain names ("bounceRate") and suffixed key-event rates
 * ("sessionKeyEventRate:purchase").
 */
export function isRateMetric(name: string): boolean {
  return /Rate(:|$)/.test(name);
}

/** Options for building a runReport request body. */
export interface ReportOptions {
  /**
   * Number of trailing complete days to cover. The range is
   * `${days}daysAgo`..yesterday, i.e. exactly `days` full days, excluding
   * today's partial data.
   */
  days: number;
  /** Metric names to request. */
  metrics: string[];
  /** Dimension names to request (e.g. ["date"] or ["pagePath"]). */
  dimensions?: string[];
  /** Max rows to return. */
  limit?: number;
  /** Order rows by this metric, descending (e.g. top pages). */
  orderByMetricDesc?: string;
  /** Order rows by this dimension, ascending (e.g. by date). */
  orderByDimensionAsc?: string;
}

/** Build the JSON body for a GA4 `properties.runReport` call (pure). */
export function buildRunReportBody(opts: ReportOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: `${opts.days}daysAgo`, endDate: "yesterday" }],
    metrics: opts.metrics.map((name) => ({ name })),
  };
  if (opts.dimensions && opts.dimensions.length > 0) {
    body.dimensions = opts.dimensions.map((name) => ({ name }));
  }
  if (opts.limit !== undefined) {
    body.limit = String(opts.limit);
  }
  if (opts.orderByMetricDesc) {
    body.orderBys = [{ desc: true, metric: { metricName: opts.orderByMetricDesc } }];
  } else if (opts.orderByDimensionAsc) {
    body.orderBys = [{ desc: false, dimension: { dimensionName: opts.orderByDimensionAsc } }];
  }
  return body;
}

/** The slice of a runReport response we read. */
export interface RunReportResponse {
  dimensionHeaders?: { name?: string }[];
  metricHeaders?: { name?: string }[];
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
}

/** Parse a GA4 runReport response into a normalized {@link Report} (pure). */
export function parseReport(res: RunReportResponse): Report {
  const metricNames = (res.metricHeaders ?? []).map((h) => h.name ?? "");
  const dimensionNames = (res.dimensionHeaders ?? []).map((h) => h.name ?? "");
  const rows = (res.rows ?? []).map((row) => ({
    dimensions: (row.dimensionValues ?? []).map((d) => d.value ?? ""),
    metrics: (row.metricValues ?? []).map((m) => Number(m.value ?? 0)),
  }));
  return { metricNames, dimensionNames, rows };
}

/** Sum each metric column across every row (pure). */
export function totalsByMetric(report: Report): number[] {
  return report.metricNames.map((_name, col) =>
    report.rows.reduce((sum, row) => sum + (row.metrics[col] ?? 0), 0),
  );
}

/** Format a GA4 `date` dimension value ("YYYYMMDD") as "YYYY-MM-DD". */
export function formatGaDate(value: string): string {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}
