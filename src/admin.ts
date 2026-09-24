/**
 * Listing the GA4 accounts and properties a credential can see, through the
 * Google Analytics Admin API `accountSummaries.list`.
 *
 * Reference: https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list
 * (page size default 50, maximum 200; `nextPageToken` is omitted on the last
 * page; the `analytics.readonly` scope is enough).
 */

/** A property as listed under an account. */
export interface PropertyEntry {
  /** Numeric property id, without the "properties/" prefix. */
  id: string;
  name: string;
  /** GA4 property type, e.g. PROPERTY_TYPE_ORDINARY or PROPERTY_TYPE_SUBPROPERTY. */
  type?: string;
}

/** An account and the properties under it that the caller can see. */
export interface AccountEntry {
  /** Numeric account id, without the "accounts/" prefix. */
  id: string;
  name: string;
  properties: PropertyEntry[];
}

/** The slice of an `accountSummaries.list` response we read. */
export interface AccountSummariesResponse {
  accountSummaries?: {
    account?: string;
    displayName?: string;
    propertySummaries?: { property?: string; displayName?: string; propertyType?: string }[];
  }[];
  nextPageToken?: string;
}

const ADMIN_URL = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";

/** Largest page the API allows. */
const PAGE_SIZE = 200;

/** Stop following page tokens after this many pages (a guard, not a limit anyone should reach). */
const MAX_PAGES = 100;

/** Fetch every page of `accountSummaries.list` (network). */
export async function listAccountSummaries(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<AccountSummariesResponse[]> {
  const pages: AccountSummariesResponse[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL(ADMIN_URL);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const res = await fetchFn(url.toString(), { headers: { authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`accountSummaries.list failed (HTTP ${res.status}): ${text.slice(0, 400)}`);
    }
    const page = JSON.parse(text) as AccountSummariesResponse;
    pages.push(page);
    pageToken = page.nextPageToken;
    if (!pageToken) {
      return pages;
    }
  }
  throw new Error(`accountSummaries.list returned more than ${MAX_PAGES} pages; stopping`);
}

/** Merge `accountSummaries.list` pages into accounts with bare numeric ids (pure). */
export function parseAccountSummaries(pages: AccountSummariesResponse[]): AccountEntry[] {
  return pages.flatMap((page) =>
    (page.accountSummaries ?? []).map((summary) => ({
      id: (summary.account ?? "").replace(/^accounts\//, ""),
      name: summary.displayName ?? "",
      properties: (summary.propertySummaries ?? []).map((p) => ({
        id: (p.property ?? "").replace(/^properties\//, ""),
        name: p.displayName ?? "",
        ...(p.propertyType ? { type: p.propertyType } : {}),
      })),
    })),
  );
}
