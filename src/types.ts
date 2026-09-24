/** A Google service-account key, as found in the downloaded JSON file. */
export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** A parsed GA4 report: the metric column names plus the data rows. */
export interface Report {
  /** Metric column names, in order (e.g. ["totalUsers", "sessions"]). */
  metricNames: string[];
  /** Dimension column names, in order (e.g. ["date"]). */
  dimensionNames: string[];
  /** One row per result: its dimension values and numeric metric values. */
  rows: { dimensions: string[]; metrics: number[] }[];
  /**
   * Totals computed by GA4 itself (requested with `metricAggregations:
   * ["TOTAL"]`), one per metric. GA4 deduplicates users and sessions across
   * the whole range, so these can be lower than the sum of `rows`, and rate
   * metrics get a real period-level value. Absent when not requested.
   */
  totals?: number[];
}
