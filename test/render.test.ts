import { describe, expect, it } from "vitest";
import { renderMarkdown, renderJson } from "../src/render.js";
import type { Report } from "../src/types.js";

const daily: Report = {
  metricNames: ["totalUsers", "sessions", "screenPageViews", "newUsers"],
  dimensionNames: ["date"],
  rows: [
    { dimensions: ["20260615"], metrics: [1200, 1500, 4000, 800] },
    { dimensions: ["20260616"], metrics: [300, 450, 1100, 120] },
  ],
};

const topPages: Report = {
  metricNames: ["screenPageViews"],
  dimensionNames: ["pagePath"],
  rows: [
    { dimensions: ["/"], metrics: [3000] },
    { dimensions: ["/blog/x"], metrics: [800] },
  ],
};

describe("renderMarkdown", () => {
  it("shows totals, a daily table, and top pages", () => {
    const md = renderMarkdown({ propertyId: "123", days: 7, daily, topPages });
    expect(md).toContain("# GA4 property 123 — last 7 days");
    expect(md).toContain("- Users: 1,500"); // 1200 + 300
    expect(md).toContain("- Pageviews: 5,100"); // 4000 + 1100
    expect(md).toContain("| Date | Users | Sessions | Pageviews | New users |");
    expect(md).toContain("| 2026-06-15 | 1,200 | 1,500 | 4,000 | 800 |");
    expect(md).toContain("## Top pages");
    expect(md).toContain("1. / — 3,000");
  });

  it("omits the daily table when there are no rows", () => {
    const md = renderMarkdown({
      propertyId: "1",
      days: 7,
      daily: { metricNames: ["totalUsers"], dimensionNames: ["date"], rows: [] },
    });
    expect(md).toContain("- Users: 0");
    expect(md).not.toContain("## Daily");
  });
});

describe("renderJson", () => {
  it("emits totals and per-day objects keyed by metric name", () => {
    const parsed = JSON.parse(renderJson({ propertyId: "123", days: 7, daily, topPages }));
    expect(parsed.totals).toEqual({ totalUsers: 1500, sessions: 1950, screenPageViews: 5100, newUsers: 920 });
    expect(parsed.daily[0]).toEqual({
      date: "2026-06-15",
      totalUsers: 1200,
      sessions: 1500,
      screenPageViews: 4000,
      newUsers: 800,
    });
    expect(parsed.topPages[0]).toEqual({ path: "/", views: 3000 });
  });
});
