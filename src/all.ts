import type { AccountEntry } from "./admin.js";
import type { Report } from "./types.js";

/** One property's totals for `ga4 --all`, or why they could not be read. */
export interface PropertyTotals {
  accountId: string;
  accountName: string;
  propertyId: string;
  propertyName: string;
  /** Metric values in the order of the requested metric names; absent on error. */
  values?: number[];
  error?: string;
}

/** Runs one report for a property. Injected so the fan-out can be tested without the network. */
export type PropertyReporter = (propertyId: string) => Promise<Report>;

/** How many properties are queried at once. */
const CONCURRENCY = 4;

/**
 * Totals for every property under `accounts`, in listing order.
 *
 * `report` is expected to run a report with no dimensions, so its single row
 * holds GA4's range totals (users and sessions deduplicated across the whole
 * range). A property with no data returns no rows and gets zeros. A failing
 * property records its error and does not stop the others.
 */
export async function collectTotals(
  accounts: AccountEntry[],
  metricNames: string[],
  report: PropertyReporter,
): Promise<PropertyTotals[]> {
  const jobs = accounts.flatMap((a) =>
    a.properties.map((p) => ({
      accountId: a.id,
      accountName: a.name,
      propertyId: p.id,
      propertyName: p.name,
    })),
  );
  const results: PropertyTotals[] = new Array(jobs.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const i = next++;
      const job = jobs[i]!;
      try {
        const r = await report(job.propertyId);
        const row = r.totals ?? r.rows[0]?.metrics ?? [];
        results[i] = { ...job, values: metricNames.map((_m, col) => row[col] ?? 0) };
      } catch (err) {
        results[i] = { ...job, error: (err as Error).message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return results;
}
