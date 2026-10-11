import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET as getSummary } from "../app/api/logs/summary/route";
import { GET as getLog } from "../app/api/logs/[id]/route";
import {
  defaultBucket,
  likePattern,
  parseBucket,
  parseGroupLimit,
  parseMinMs,
  parsePage,
  parseSharedQuery,
} from "../lib/logs/query";
import { bucketStart, fillBuckets } from "../lib/logs/series";

const NOW = new Date("2026-10-02T12:00:00.000Z");

function params(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values);
}

describe("log query", () => {
  it("defaults to the last 24 hours", () => {
    const query = parseSharedQuery(params({}), NOW);
    assert.equal(query.from.toISOString(), "2026-10-01T12:00:00.000Z");
    assert.equal(query.to.toISOString(), NOW.toISOString());
    assert.equal(query.level, null);
    assert.equal(defaultBucket(query), "hour");
  });

  it("rejects a range longer than 14 days and accepts exactly 14 days", () => {
    const exactFrom = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    assert.doesNotThrow(() => parseSharedQuery(params({ from: exactFrom, to: NOW.toISOString() }), NOW));

    const wideFrom = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000 - 1).toISOString();
    assert.throws(
      () => parseSharedQuery(params({ from: wideFrom, to: NOW.toISOString() }), NOW),
      /14 days/,
    );
  });

  it("rejects inverted and invalid dates", () => {
    assert.throws(() => parseSharedQuery(params({ from: NOW.toISOString(), to: NOW.toISOString() }), NOW), /before/);
    assert.throws(() => parseSharedQuery(params({ from: "yesterday" }), NOW), /Invalid from date/);
  });

  it("maps level names and numeric thresholds", () => {
    assert.deepEqual(parseSharedQuery(params({ level: "debug" }), NOW).level, { match: "eq", value: 20 });
    assert.deepEqual(parseSharedQuery(params({ level: "info" }), NOW).level, { match: "eq", value: 30 });
    assert.deepEqual(parseSharedQuery(params({ level: "warn" }), NOW).level, { match: "eq", value: 40 });
    assert.deepEqual(parseSharedQuery(params({ level: "error" }), NOW).level, { match: "gte", value: 50 });
    assert.deepEqual(parseSharedQuery(params({ level: "fatal" }), NOW).level, { match: "eq", value: 60 });
    assert.deepEqual(parseSharedQuery(params({ level: "20" }), NOW).level, { match: "gte", value: 20 });
    assert.throws(() => parseSharedQuery(params({ level: "trace" }), NOW), /Invalid level/);
  });

  it("accepts methods and status codes or classes", () => {
    const query = parseSharedQuery(params({ method: "post", statusCode: "4xx" }), NOW);
    assert.equal(query.method, "POST");
    assert.deepEqual(query.status, { match: "range", from: 400, to: 500 });
    assert.deepEqual(parseSharedQuery(params({ statusCode: "500" }), NOW).status, { match: "eq", value: 500 });
    assert.throws(() => parseSharedQuery(params({ method: "OPTIONS" }), NOW), /Invalid method/);
    assert.throws(() => parseSharedQuery(params({ statusCode: "nope" }), NOW), /Invalid statusCode/);
  });

  it("keeps the url filter as a path prefix", () => {
    const query = parseSharedQuery(
      params({ url: "https://qc.example/qc/api/v1/tasks?page=2", q: "Timeout" }),
      NOW,
    );
    assert.equal(query.urlPrefix, "/qc/api/v1/tasks");
    assert.equal(query.message, "Timeout");
    assert.equal(likePattern("100%_done", "contains"), "%100\\%\\_done%");
  });

  it("chooses day buckets at 48 hours and validates paging", () => {
    const from = new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const query = parseSharedQuery(params({ from, to: NOW.toISOString() }), NOW);
    assert.equal(defaultBucket(query), "day");
    assert.equal(parseBucket(params({ bucket: "minute" }), query), "minute");
    assert.throws(() => parseBucket(params({ bucket: "week" }), query), /Invalid bucket/);
    assert.deepEqual(parsePage(params({})), { page: 1, limit: 50 });
    assert.throws(() => parsePage(params({ limit: "101" })), /Invalid limit/);
    assert.equal(parseGroupLimit(params({})), 20);
    assert.equal(parseMinMs(params({})), 1000);
  });
});

describe("log dashboard gate", () => {
  it("rejects log routes when the dashboard is off", async () => {
    const previous = process.env.SQL_TOOL_ENABLE_LOG_DASHBOARD;
    delete process.env.SQL_TOOL_ENABLE_LOG_DASHBOARD;
    try {
      const summary = await getSummary(new Request("http://localhost/api/logs/summary"));
      const detail = await getLog(new Request("http://localhost/api/logs/1"), {
        params: Promise.resolve({ id: "8f1c0c3e-1b2a-4d5e-9f00-a1b2c3d4e5f6" }),
      });
      assert.equal(summary.status, 404);
      assert.equal(detail.status, 404);
    } finally {
      if (previous === undefined) delete process.env.SQL_TOOL_ENABLE_LOG_DASHBOARD;
      else process.env.SQL_TOOL_ENABLE_LOG_DASHBOARD = previous;
    }
  });
});

describe("riyadh buckets", () => {
  it("fills empty hour buckets and keeps fatal inside error", () => {
    const from = new Date("2026-10-01T18:10:00.000Z");
    const to = new Date("2026-10-01T20:00:00.000Z");
    const points = fillBuckets(from, to, "hour", [
      {
        at: new Date("2026-10-01T19:00:00.000Z"),
        debug: 0,
        info: 4,
        warn: 1,
        error: 2,
        fatal: 1,
      },
    ]);
    assert.deepEqual(
      points.map((point) => point.at),
      ["2026-10-01T18:00:00.000Z", "2026-10-01T19:00:00.000Z"],
    );
    assert.equal(points[0]?.info, 0);
    assert.equal(points[1]?.error, 2);
    assert.equal(points[1]?.fatal, 1);
  });

  it("starts day buckets at midnight in Asia/Riyadh", () => {
    const from = new Date("2026-10-01T20:30:00.000Z");
    assert.equal(bucketStart(from, "day").toISOString(), "2026-09-30T21:00:00.000Z");
    const points = fillBuckets(from, new Date("2026-10-01T22:30:00.000Z"), "day", []);
    assert.deepEqual(
      points.map((point) => point.at),
      ["2026-09-30T21:00:00.000Z", "2026-10-01T21:00:00.000Z"],
    );
  });
});
