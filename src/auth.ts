/**
 * Service-account authentication for the GA4 Data and Admin APIs.
 *
 * The token exchange itself is shared with the sibling tools
 * (src/shared/google-auth.ts); this file only fixes the scope.
 */

import { requestServiceAccountToken, type ServiceAccount } from "./shared/google-auth.js";
import type { Sleep } from "./shared/http.js";

export { base64url, buildJwtClaim, createAssertion } from "./shared/google-auth.js";

/** Read-only Google Analytics access; enough for runReport and accountSummaries. */
export const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** Exchange a service-account assertion for an access token (network). */
export function requestAccessToken(
  sa: ServiceAccount,
  fetchFn: typeof fetch = fetch,
  iatSec: number = Math.floor(Date.now() / 1000),
  sleep?: Sleep,
): Promise<string> {
  return requestServiceAccountToken(sa, ANALYTICS_SCOPE, fetchFn, iatSec, sleep);
}
