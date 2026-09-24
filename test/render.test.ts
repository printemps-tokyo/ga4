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

const channels: Report = {
  metricNames: ["sessions"],
  dimensionNames: ["sessionDefaultChannelGroup"],
  rows: [
    { dimensions: ["Organic Search"], metrics: [900] },
    { dimensions: ["Direct"], metrics: [400] },
  ],
};

describe("renderMarkdown", () => {
  it("shows totals, a daily table, and top pages", () => {
    const md = renderMarkdown({ propertyId: "123", days: 7, daily, topPages });
    expect(md).toContain("# GA4 property 123 — last 7 complete days (excluding today)");
    expect(md).toContain("- Users: 1,500"); // 1200 + 300
    expect(md).toContain("- Pageviews: 5,100"); // 4000 + 1100
    expect(md).toContain("| Date | Users | Sessions | Pageviews | New users |");
    expect(md).toContain("| 2026-06-15 | 1,200 | 1,500 | 4,000 | 800 |");
    expect(md).toContain("## Top pages");
    expect(md).toContain("1. / — 3,000");
  });

  it("renders a Channels section when a channels report is given", () => {
    const md = renderMarkdown({ propertyId: "123", days: 7, daily, channels });
    expect(md).toContain("## Channels");
    expect(md).toContain("1. Organic Search — 900");
    expect(md).toContain("2. Direct — 400");
  });

  it("omits the Channels section when no channels report is given", () => {
    const md = renderMarkdown({ propertyId: "123", days: 7, daily });
    expect(md).not.toContain("## Channels");
  });

  it("labels rate metrics as not summable in Totals", () => {
    const md = renderMarkdown({
      propertyId: "123",
      days: 7,
      daily: {
        metricNames: ["sessions", "bounceRate"],
        dimensionNames: ["date"],
        rows: [
          { dimensions: ["20260615"], metrics: [100, 0.4] },
          { dimensions: ["20260616"], metrics: [50, 0.6] },
        ],
      },
    });
    expect(md).toContain("- Sessions: 150");
    expect(md).toContain("- bounceRate: avg n/a (rate metric)");
    expect(md).not.toContain("- bounceRate: 1");
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

  it("emits a channels array when a channels report is given", () => {
    const parsed = JSON.parse(renderJson({ propertyId: "123", days: 7, daily, channels }));
    expect(parsed.channels).toEqual([
      { channel: "Organic Search", sessions: 900 },
      { channel: "Direct", sessions: 400 },
    ]);
  });

  it("omits the channels field when no channels report is given", () => {
    const parsed = JSON.parse(renderJson({ propertyId: "123", days: 7, daily }));
    expect(parsed).not.toHaveProperty("channels");
  });

  it("emits null totals for rate metrics", () => {
    const parsed = JSON.parse(
      renderJson({
        propertyId: "123",
        days: 7,
        daily: {
          metricNames: ["sessions", "engagementRate"],
          dimensionNames: ["date"],
          rows: [{ dimensions: ["20260615"], metrics: [100, 0.7] }],
        },
      }),
    );
    expect(parsed.totals).toEqual({ sessions: 100, engagementRate: null });
  });
});

describe("GA4 totals in the output", () => {
  const withTotals: Report = {
    metricNames: ["totalUsers", "sessions", "bounceRate"],
    dimensionNames: ["date"],
    rows: [
      { dimensions: ["20260923"], metrics: [154, 184, 0.6] },
      { dimensions: ["20260924"], metrics: [238, 286, 0.7] },
    ],
    totals: [369, 471, 0.658],
  };
  const channelsWithTotal: Report = {
    metricNames: ["sessions"],
    dimensionNames: ["sessionDefaultChannelGroup"],
    rows: [
      { dimensions: ["Organic Search"], metrics: [257] },
      { dimensions: ["Unassigned"], metrics: [162] },
      { dimensions: ["Cross-network"], metrics: [117] },
    ],
    totals: [471],
  };

  it("uses GA4's totals, including a period-level rate", () => {
    const md = renderMarkdown({ propertyId: "1", days: 3, daily: withTotals });
    expect(md).toContain("- Users: 369");
    expect(md).toContain("- Sessions: 471");
    expect(md).toContain("- bounceRate: 65.8%");
    // Daily rate cells are percentages too, not rounded to 0 or 1.
    expect(md).toContain("| 2026-09-23 | 154 | 184 | 60.0% |");
  });

  it("shows the channel total and explains rows that add up to more", () => {
    const md = renderMarkdown({ propertyId: "1", days: 3, daily: withTotals, channels: channelsWithTotal });
    expect(md).toContain("Total sessions: 471");
    expect(md).toContain("Rows add up to 536");
  });

  it("does not add the note when rows do not exceed the total", () => {
    const md = renderMarkdown({
      propertyId: "1",
      days: 3,
      daily: withTotals,
      channels: { ...channelsWithTotal, totals: [536] },
    });
    expect(md).toContain("Total sessions: 536");
    expect(md).not.toContain("Rows add up to");
  });

  it("emits GA4's totals and the channel total in JSON", () => {
    const parsed = JSON.parse(renderJson({ propertyId: "1", days: 3, daily: withTotals, channels: channelsWithTotal }));
    expect(parsed.totals).toEqual({ totalUsers: 369, sessions: 471, bounceRate: 0.658 });
    expect(parsed.channelsTotalSessions).toBe(471);
    expect(parsed.channels).toHaveLength(3);
  });
});
