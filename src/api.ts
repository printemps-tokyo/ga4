import type { RunReportResponse } from "./report.js";

/** Strip an optional "properties/" prefix, leaving the numeric property id. */
export function normalizePropertyId(input: string): string {
  return input.trim().replace(/^properties\//, "");
}

/** Call GA4 `properties.runReport` with a bearer token (network). */
export async function runReport(
  propertyId: string,
  body: Record<string, unknown>,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<RunReportResponse> {
  const id = normalizePropertyId(propertyId);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`runReport failed (HTTP ${res.status}): ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as RunReportResponse;
}
