import { describe, expect, it } from "vitest";
import {
  buildRunReportBody,
  parseReport,
  totalsByMetric,
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
