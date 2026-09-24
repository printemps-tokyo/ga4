import { describe, expect, it } from "vitest";
import { listAccountSummaries, parseAccountSummaries } from "../src/admin.js";
import { renderAccountsJson, renderAccountsMarkdown } from "../src/render.js";

// Shaped like a real accountSummaries.list response.
const page1 = {
  accountSummaries: [
    {
      account: "accounts/376860786",
      displayName: "printemps.tokyo",
      propertySummaries: [
        { property: "properties/515368721", displayName: "blog.printemps.tokyo", propertyType: "PROPERTY_TYPE_ORDINARY" },
        { property: "properties/555503720", displayName: "cars.printemps.tokyo", propertyType: "PROPERTY_TYPE_ORDINARY" },
      ],
    },
  ],
  nextPageToken: "next",
};
const page2 = {
  accountSummaries: [
    {
      account: "accounts/100",
      displayName: "other",
      propertySummaries: [{ property: "properties/200", displayName: "sub", propertyType: "PROPERTY_TYPE_SUBPROPERTY" }],
    },
    { account: "accounts/101", displayName: "empty" },
  ],
};

function fakeFetch(pages: unknown[], seen: string[], status = 200): typeof fetch {
  let i = 0;
  return (async (url: string | URL | Request) => {
    seen.push(String(url));
    const body = JSON.stringify(pages[i++] ?? {});
    return new Response(body, { status });
  }) as typeof fetch;
}

describe("listAccountSummaries", () => {
  it("follows nextPageToken until the last page", async () => {
    const seen: string[] = [];
    const pages = await listAccountSummaries("tok", fakeFetch([page1, page2], seen));
    expect(pages).toHaveLength(2);
    expect(seen[0]).toBe("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
    expect(seen[1]).toContain("pageToken=next");
  });

  it("throws with the API's message on an HTTP error", async () => {
    const failing = (async () =>
      new Response('{"error":{"message":"Admin API has not been used in project"}}', { status: 403 })) as typeof fetch;
    await expect(listAccountSummaries("tok", failing)).rejects.toThrow(/HTTP 403.*Admin API has not been used/);
  });
});

describe("parseAccountSummaries", () => {
  it("merges pages and strips resource prefixes", () => {
    const accounts = parseAccountSummaries([page1, page2]);
    expect(accounts.map((a) => a.id)).toEqual(["376860786", "100", "101"]);
    expect(accounts[0]?.properties[1]).toEqual({
      id: "555503720",
      name: "cars.printemps.tokyo",
      type: "PROPERTY_TYPE_ORDINARY",
    });
    expect(accounts[2]?.properties).toEqual([]);
  });

  it("returns no accounts for an empty response", () => {
    expect(parseAccountSummaries([{}])).toEqual([]);
  });
});

describe("renderAccounts", () => {
  const accounts = parseAccountSummaries([page1, page2]);

  it("prints one table per account, marking non-ordinary properties", () => {
    const md = renderAccountsMarkdown(accounts);
    expect(md).toContain("## printemps.tokyo (376860786)");
    expect(md).toContain("| cars.printemps.tokyo | 555503720 |");
    expect(md).toContain("| sub (subproperty) | 200 |");
    expect(md).toContain("## empty (101)\n\nNo properties visible in this account.");
  });

  it("explains how to get access when nothing is visible", () => {
    expect(renderAccountsMarkdown([])).toContain("No accounts are visible to these credentials");
  });

  it("emits the accounts as JSON", () => {
    const parsed = JSON.parse(renderAccountsJson(accounts));
    expect(parsed.accounts[0].properties[0]).toEqual({
      id: "515368721",
      name: "blog.printemps.tokyo",
      type: "PROPERTY_TYPE_ORDINARY",
    });
  });
});
