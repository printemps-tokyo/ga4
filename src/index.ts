/**
 * Public API for ga4.
 *
 * `ga4` checks a Google Analytics 4 property's recent traffic from the command
 * line. It authenticates with a service account (a signed JWT exchanged for an
 * access token, all via Node's built-in `crypto`), calls the GA4 Data API's
 * runReport, and prints a Markdown or JSON digest. The request builders,
 * response parsers, and renderers are pure functions, exported here for reuse.
 */

export type { ServiceAccount, Report } from "./types.js";

export { base64url, buildJwtClaim, createAssertion, requestAccessToken, ANALYTICS_SCOPE } from "./auth.js";

export {
  DEFAULT_METRICS,
  buildRunReportBody,
  parseReport,
  totalsByMetric,
  reportTotals,
  isRateMetric,
  formatGaDate,
} from "./report.js";
export type { ReportOptions, RunReportResponse } from "./report.js";

export { runReport, normalizePropertyId } from "./api.js";

export {
  renderMarkdown,
  renderJson,
  renderAccountsMarkdown,
  renderAccountsJson,
  renderAllMarkdown,
  renderAllJson,
} from "./render.js";

export { collectTotals } from "./all.js";
export type { PropertyTotals, PropertyReporter } from "./all.js";

export { listAccountSummaries, parseAccountSummaries } from "./admin.js";
export type { AccountEntry, PropertyEntry, AccountSummariesResponse } from "./admin.js";
export type { RenderInput } from "./render.js";
