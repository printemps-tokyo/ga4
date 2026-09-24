import { describe, expect, it } from "vitest";
import { collectTotals } from "../src/all.js";
import { renderAllJson, renderAllMarkdown } from "../src/render.js";
import type { AccountEntry } from "../src/admin.js";
import type { Report } from "../src/types.js";

const accounts: AccountEntry[] = [
  {
    id: "376860786",
    name: "printemps.tokyo",
    properties: [
      { id: "555503720", name: "cars.printemps.tokyo" },
      { id: "542450361", name: "sweetpia.printemps.tokyo" },
      { id: "1", name: "broken" },
    ],
  },
];
const metrics = ["totalUsers", "sessions", "screenPageViews"];

const reports: Record<string, Report> = {
  // No dimensions: one row holding the range totals.
  "555503720": { metricNames: metrics, dimensionNames: [], rows: [{ dimensions: [], metrics: [369, 471, 2233] }] },
  // No data in the range: GA4 returns no rows.
  "542450361": { metricNames: metrics, dimensionNames: [], rows: [] },
};

async function fakeReport(id: string): Promise<Report> {
  const r = reports[id];
  if (!r) {
    throw new Error("runReport failed (HTTP 403): no access");
  }
  return r;
}

describe("collectTotals", () => {
  it("keeps listing order, zero-fills empty properties, and records errors", async () => {
    const rows = await collectTotals(accounts, metrics, fakeReport);
    expect(rows.map((r) => r.propertyId)).toEqual(["555503720", "542450361", "1"]);
    expect(rows[0]?.values).toEqual([369, 471, 2233]);
    expect(rows[1]?.values).toEqual([0, 0, 0]);
    expect(rows[2]?.values).toBeUndefined();
    expect(rows[2]?.error).toContain("HTTP 403");
  });

  it("returns nothing when no properties are visible", async () => {
    expect(await collectTotals([], metrics, fakeReport)).toEqual([]);
  });
});

describe("renderAll", () => {
  it("prints one row per property and lists errors", async () => {
    const rows = await collectTotals(accounts, metrics, fakeReport);
    const md = renderAllMarkdown(rows, 3, metrics);
    expect(md).toContain("# GA4 — all properties, last 3 complete days (excluding today)");
    expect(md).toContain("| Account | Property | ID | Users | Sessions | Pageviews |");
    expect(md).toContain("| printemps.tokyo | cars.printemps.tokyo | 555503720 | 369 | 471 | 2,233 |");
    expect(md).toContain("| printemps.tokyo | sweetpia.printemps.tokyo | 542450361 | 0 | 0 | 0 |");
    expect(md).toContain("| printemps.tokyo | broken | 1 | error | error | error |");
    expect(md).toContain("- broken (1): runReport failed (HTTP 403): no access");
  });

  it("emits totals or an error per property in JSON", async () => {
    const rows = await collectTotals(accounts, metrics, fakeReport);
    const parsed = JSON.parse(renderAllJson(rows, 3, metrics));
    expect(parsed.days).toBe(3);
    expect(parsed.properties[0].totals).toEqual({ totalUsers: 369, sessions: 471, screenPageViews: 2233 });
    expect(parsed.properties[2].error).toContain("HTTP 403");
  });
});
