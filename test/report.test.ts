import { describe, expect, it } from "vitest";
import {
  buildRunReportBody,
  parseReport,
  totalsByMetric,
  reportTotals,
  isRateMetric,
  formatGaDate,
  DEFAULT_METRICS,
} from "../src/report.js";
import { normalizePropertyId } from "../src/api.js";

describe("buildRunReportBody", () => {
  it("builds a daily request with a trailing date range and date ordering", () => {
    const body = buildRunReportBody({
      days: 7,
      metrics: DEFAULT_METRICS,
      dimensions: ["date"],
      orderByDimensionAsc: "date",
    });
    // 7daysAgo..yesterday covers exactly 7 complete days, excluding today.
    expect(body.dateRanges).toEqual([{ startDate: "7daysAgo", endDate: "yesterday" }]);
    expect(body.metrics).toEqual([
      { name: "totalUsers" },
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "newUsers" },
    ]);
    expect(body.dimensions).toEqual([{ name: "date" }]);
    expect(body.orderBys).toEqual([{ desc: false, dimension: { dimensionName: "date" } }]);
  });

  it("builds a top-pages request ordered by a metric, with a limit", () => {
    const body = buildRunReportBody({
      days: 30,
      metrics: ["screenPageViews"],
      dimensions: ["pagePath"],
      limit: 5,
      orderByMetricDesc: "screenPageViews",
    });
    expect(body.dateRanges).toEqual([{ startDate: "30daysAgo", endDate: "yesterday" }]);
    expect(body.limit).toBe("5");
    expect(body.orderBys).toEqual([{ desc: true, metric: { metricName: "screenPageViews" } }]);
  });

  it("builds a channels request grouped by default channel group", () => {
    const body = buildRunReportBody({
      days: 7,
      metrics: ["sessions"],
      dimensions: ["sessionDefaultChannelGroup"],
      limit: 10,
      orderByMetricDesc: "sessions",
    });
    expect(body.dateRanges).toEqual([{ startDate: "7daysAgo", endDate: "yesterday" }]);
    expect(body.dimensions).toEqual([{ name: "sessionDefaultChannelGroup" }]);
    expect(body.limit).toBe("10");
    expect(body.orderBys).toEqual([{ desc: true, metric: { metricName: "sessions" } }]);
  });
});

describe("parseReport / totalsByMetric", () => {
  const response = {
    dimensionHeaders: [{ name: "date" }],
    metricHeaders: [{ name: "totalUsers" }, { name: "sessions" }],
    rows: [
      { dimensionValues: [{ value: "20260615" }], metricValues: [{ value: "10" }, { value: "12" }] },
      { dimensionValues: [{ value: "20260616" }], metricValues: [{ value: "5" }, { value: "9" }] },
    ],
  };

  it("normalizes headers and numeric rows", () => {
    const report = parseReport(response);
    expect(report.metricNames).toEqual(["totalUsers", "sessions"]);
    expect(report.dimensionNames).toEqual(["date"]);
    expect(report.rows[0]).toEqual({ dimensions: ["20260615"], metrics: [10, 12] });
  });

  it("sums each metric column", () => {
    expect(totalsByMetric(parseReport(response))).toEqual([15, 21]);
  });

  it("handles an empty response", () => {
    const report = parseReport({});
    expect(report.rows).toEqual([]);
    expect(totalsByMetric(report)).toEqual([]);
  });
});

describe("isRateMetric", () => {
  it("recognizes known rate metrics, including suffixed key-event rates", () => {
    expect(isRateMetric("bounceRate")).toBe(true);
    expect(isRateMetric("engagementRate")).toBe(true);
    expect(isRateMetric("sessionKeyEventRate:purchase")).toBe(true);
  });

  it("leaves additive metrics alone", () => {
    expect(isRateMetric("sessions")).toBe(false);
    expect(isRateMetric("screenPageViews")).toBe(false);
  });
});

describe("formatGaDate", () => {
  it("formats YYYYMMDD and leaves other values alone", () => {
    expect(formatGaDate("20260621")).toBe("2026-06-21");
    expect(formatGaDate("(other)")).toBe("(other)");
  });
});

describe("normalizePropertyId", () => {
  it("strips an optional properties/ prefix", () => {
    expect(normalizePropertyId("properties/123456789")).toBe("123456789");
    expect(normalizePropertyId(" 987654321 ")).toBe("987654321");
  });
});

describe("GA4 totals (metricAggregations: TOTAL)", () => {
  it("requests totals only when asked", () => {
    const base = { days: 3, metrics: ["sessions"], dimensions: ["date"] };
    expect(buildRunReportBody(base)).not.toHaveProperty("metricAggregations");
    expect(buildRunReportBody({ ...base, withTotals: true }).metricAggregations).toEqual(["TOTAL"]);
  });

  // Shape and numbers from a real response for property 555503720: two days
  // of 154 and 238 users are 369 distinct users over the range, not 392.
  const response = {
    dimensionHeaders: [{ name: "date" }],
    metricHeaders: [{ name: "totalUsers" }, { name: "sessions" }, { name: "bounceRate" }],
    rows: [
      { dimensionValues: [{ value: "20260923" }], metricValues: [{ value: "154" }, { value: "184" }, { value: "0.6" }] },
      { dimensionValues: [{ value: "20260924" }], metricValues: [{ value: "238" }, { value: "286" }, { value: "0.7" }] },
    ],
    totals: [
      {
        dimensionValues: [{ value: "RESERVED_TOTAL" }],
        metricValues: [{ value: "369" }, { value: "471" }, { value: "0.658" }],
      },
    ],
  };

  it("parses GA4's totals row", () => {
    expect(parseReport(response).totals).toEqual([369, 471, 0.658]);
  });

  it("prefers GA4's deduplicated totals over column sums", () => {
    const report = parseReport(response);
    expect(totalsByMetric(report).slice(0, 2)).toEqual([392, 470]);
    expect(reportTotals(report)).toEqual([369, 471, 0.658]);
  });

  it("falls back to sums, with null for rate metrics, without GA4 totals", () => {
    const withoutTotals = { ...response, totals: undefined };
    expect(reportTotals(parseReport(withoutTotals))).toEqual([392, 470, null]);
  });
});
