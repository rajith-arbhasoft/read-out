import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDirectory } from "@/lib/config/environments";
import type { HistoryEntry, SavedQuery } from "@/lib/types";

type SqlValue = string | number | null;

const globalForStore = globalThis as unknown as { __sqlToolStore?: DatabaseSync };

function database(): DatabaseSync {
  if (globalForStore.__sqlToolStore) return globalForStore.__sqlToolStore;
  const directory = dataDirectory();
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, "sql-tool.sqlite"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_queries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      environment TEXT NOT NULL,
      query_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS query_history (
      id TEXT PRIMARY KEY,
      environment TEXT NOT NULL,
      query_text TEXT NOT NULL,
      duration_ms INTEGER,
      row_count INTEGER,
      success INTEGER NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL
    );
  `);
  globalForStore.__sqlToolStore = db;
  return db;
}

function text(value: SqlValue | bigint | undefined): string {
  if (typeof value === "string") return value;
  throw new Error("Unexpected stored value");
}

function nullableText(value: SqlValue | bigint | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new Error("Unexpected stored value");
}

function nullableNumber(value: SqlValue | bigint | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error("Unexpected stored value");
}

function toSavedQuery(row: Record<string, SqlValue | bigint>): SavedQuery {
  return {
    id: text(row.id),
    title: text(row.title),
    description: nullableText(row.description),
    environment: text(row.environment),
    query: text(row.query_text),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function listSavedQueries(): SavedQuery[] {
  const rows = database()
    .prepare(
      `SELECT id, title, description, environment, query_text, created_at, updated_at
       FROM saved_queries
       ORDER BY updated_at DESC`,
    )
    .all() as Array<Record<string, SqlValue | bigint>>;
  return rows.map(toSavedQuery);
}

export function getSavedQuery(id: string): SavedQuery | null {
  const row = database()
    .prepare(
      `SELECT id, title, description, environment, query_text, created_at, updated_at
       FROM saved_queries
       WHERE id = ?`,
    )
    .get(id) as Record<string, SqlValue | bigint> | undefined;
  return row ? toSavedQuery(row) : null;
}

export function insertSavedQuery(input: {
  id: string;
  title: string;
  description: string | null;
  environment: string;
  query: string;
  now: string;
}): SavedQuery {
  database()
    .prepare(
      `INSERT INTO saved_queries
        (id, title, description, environment, query_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.id, input.title, input.description, input.environment, input.query, input.now, input.now);
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    environment: input.environment,
    query: input.query,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function updateSavedQuery(input: {
  id: string;
  title: string;
  description: string | null;
  environment: string;
  query: string;
  now: string;
}): SavedQuery | null {
  const existing = getSavedQuery(input.id);
  if (!existing) return null;
  database()
    .prepare(
      `UPDATE saved_queries
       SET title = ?, description = ?, environment = ?, query_text = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(input.title, input.description, input.environment, input.query, input.now, input.id);
  return {
    ...existing,
    title: input.title,
    description: input.description,
    environment: input.environment,
    query: input.query,
    updatedAt: input.now,
  };
}

export function deleteSavedQuery(id: string): boolean {
  const result = database().prepare("DELETE FROM saved_queries WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

export function recordHistory(input: {
  id: string;
  environment: string;
  query: string;
  durationMs: number | null;
  rowCount: number | null;
  success: boolean;
  error: string | null;
  timestamp: string;
}): void {
  const db = database();
  db.prepare(
    `INSERT INTO query_history
      (id, environment, query_text, duration_ms, row_count, success, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.environment,
    input.query,
    input.durationMs,
    input.rowCount,
    input.success ? 1 : 0,
    input.error,
    input.timestamp,
  );
  db.prepare(
    `DELETE FROM query_history
     WHERE id NOT IN (
       SELECT id FROM query_history ORDER BY created_at DESC LIMIT 200
     )`,
  ).run();
}

export function listHistory(limit = 100): HistoryEntry[] {
  const rows = database()
    .prepare(
      `SELECT id, environment, query_text, duration_ms, row_count, success, error, created_at
       FROM query_history
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as Array<Record<string, SqlValue | bigint>>;

  return rows.map((row) => ({
    id: text(row.id),
    environment: text(row.environment),
    query: text(row.query_text),
    durationMs: nullableNumber(row.duration_ms),
    rowCount: nullableNumber(row.row_count),
    success: row.success === 1 || row.success === 1n,
    error: nullableText(row.error),
    timestamp: text(row.created_at),
  }));
}
