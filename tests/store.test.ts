import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

process.env.SQL_TOOL_DATA_DIR = mkdtempSync(join(tmpdir(), "sql-tool-"));

describe("saved queries and history", () => {
  it("stores queries without connection details", async () => {
    const { deleteSavedQuery, insertSavedQuery, listHistory, listSavedQueries, recordHistory, updateSavedQuery } =
      await import("../lib/store/metadata");

    const now = "2026-10-03T12:00:00.000Z";
    const saved = insertSavedQuery({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Pending Inspections",
      description: null,
      environment: "QAS",
      query: "SELECT * FROM inspection.inspections WHERE status = 'PENDING'",
      now,
    });
    assert.equal(saved.environment, "QAS");
    assert.equal(listSavedQueries().length, 1);

    const updated = updateSavedQuery({
      ...saved,
      title: "Pending inspections",
      description: "Today",
      query: saved.query,
      now: "2026-10-03T12:05:00.000Z",
    });
    assert.equal(updated?.title, "Pending inspections");
    assert.equal(deleteSavedQuery(saved.id), true);
    assert.equal(listSavedQueries().length, 0);

    recordHistory({
      id: "22222222-2222-4222-8222-222222222222",
      environment: "QAS",
      query: saved.query,
      durationMs: 243,
      rowCount: 152,
      success: true,
      error: null,
      timestamp: now,
    });
    const history = listHistory();
    assert.equal(history[0]?.rowCount, 152);
    assert.equal(JSON.stringify(history).includes("postgresql://"), false);
  });
});
