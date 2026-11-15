import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseServerMemoryMessage,
  parseServerPerformanceMessage,
} from "../lib/logs/parse-server-metrics";

describe("parseServerMemoryMessage", () => {
  it("parses MBMB suffix memory snapshots", () => {
    const parsed = parseServerMemoryMessage(
      "server-memory rss=209.58 MBMB heapTotal=199.15 MBMB heapUsed=70.44 MBMB external=5.48 MBMB",
    );
    assert.deepEqual(parsed, {
      rssMb: 209.58,
      heapTotalMb: 199.15,
      heapUsedMb: 70.44,
      externalMb: 5.48,
    });
  });

  it("parses when server-memory appears inside the message", () => {
    const parsed = parseServerMemoryMessage(
      "level=35 server-memory rss=209.58 MBMB heapTotal=199.15 MBMB heapUsed=70.44 MBMB external=5.48 MBMB",
    );
    assert.equal(parsed?.rssMb, 209.58);
    assert.equal(parsed?.heapUsedMb, 70.44);
  });

  it("rejects unrelated messages", () => {
    assert.equal(parseServerMemoryMessage("server-performance uptime=120"), null);
    assert.equal(parseServerMemoryMessage("server-memory rss=1"), null);
  });
});

describe("parseServerPerformanceMessage", () => {
  it("parses generic key=value metrics", () => {
    const parsed = parseServerPerformanceMessage(
      "server-performance eventLoopLagMs=12.5 activeHandles=4 uptimeSec=3600",
    );
    assert.deepEqual(parsed, {
      eventLoopLagMs: 12.5,
      activeHandles: 4,
      uptimeSec: 3600,
    });
  });

  it("rejects memory lines", () => {
    assert.equal(parseServerPerformanceMessage("server-memory rss=1 heapTotal=2 heapUsed=1 external=0"), null);
  });
});