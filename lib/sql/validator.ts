import { parse } from "pgsql-ast-parser";
import { poolSettings } from "@/lib/config/environments";
import { QueryRejectedError } from "@/lib/sql/errors";

const READ_ONLY = new Set(["select", "union", "union all", "values", "with", "with recursive"]);

const REJECTED = new Set([
  "insert",
  "update",
  "delete",
  "drop table",
  "drop function",
  "alter table",
  "alter index",
  "alter sequence",
  "alter enum",
  "truncate table",
  "create table",
  "create view",
  "create materialized view",
  "create index",
  "create extension",
  "create sequence",
  "create schema",
  "create function",
  "create enum",
  "create composite type",
  "refresh materialized view",
  "comment",
  "do",
  "set",
  "begin",
  "commit",
  "rollback",
  "show",
  "prepare",
  "deallocate",
  "tablespace",
  "raise",
  "start transaction",
]);

const LEADING_FORBIDDEN = new Set([
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "CREATE",
  "GRANT",
  "REVOKE",
  "COMMENT",
  "VACUUM",
  "CALL",
  "DO",
  "COPY",
  "REFRESH",
  "MERGE",
  "REPLACE",
  "EXECUTE",
  "PREPARE",
  "LISTEN",
  "NOTIFY",
  "LOCK",
  "REINDEX",
  "CLUSTER",
  "DISCARD",
  "LOAD",
  "SECURITY",
  "IMPORT",
  "ANALYZE",
  "EXPLAIN",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SET",
  "SHOW",
  "START",
  "DECLARE",
  "FETCH",
  "CLOSE",
  "CHECKPOINT",
]);

function rejectionMessage(statementType: string): string {
  const verb = statementType.split(" ")[0]?.toUpperCase() ?? "THIS";
  return `${verb} statements are not allowed.`;
}

function leadingKeyword(sql: string): string | null {
  let rest = sql.trim();
  while (rest.length > 0) {
    if (rest.startsWith("--")) {
      const newline = rest.indexOf("\n");
      if (newline === -1) return null;
      rest = rest.slice(newline + 1).trim();
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      if (end === -1) return null;
      rest = rest.slice(end + 2).trim();
      continue;
    }
    break;
  }
  const match = /^([A-Za-z]+)/.exec(rest);
  return match ? match[1].toUpperCase() : null;
}

function assertNoWrites(node: unknown): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) assertNoWrites(item);
    return;
  }

  const record = node as Record<string, unknown>;
  if (record.type === "select" && record.for && typeof record.for === "object") {
    throw new QueryRejectedError("Row locking clauses are not allowed.");
  }
  if (typeof record.type === "string" && REJECTED.has(record.type)) {
    throw new QueryRejectedError(rejectionMessage(record.type));
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === "for" && record.type === "select") continue;
    assertNoWrites(value);
  }
}

export function validateReadOnlySql(sql: string): void {
  if (sql.includes("\0")) {
    throw new QueryRejectedError("Only a single read-only SELECT statement is allowed.");
  }

  const trimmed = sql.trim();
  if (!trimmed) throw new QueryRejectedError("Enter a SQL query.");

  const maxChars = poolSettings("DEV").maxQueryChars;
  if (trimmed.length > maxChars) throw new QueryRejectedError("The query is too long.");

  let statements;
  try {
    statements = parse(trimmed);
  } catch {
    const keyword = leadingKeyword(trimmed);
    if (keyword && LEADING_FORBIDDEN.has(keyword)) {
      throw new QueryRejectedError(`${keyword} statements are not allowed.`);
    }
    throw new QueryRejectedError(
      "This SQL could not be validated. Only a single read-only SELECT is allowed.",
    );
  }

  if (statements.length !== 1) {
    throw new QueryRejectedError("Only one SQL statement is allowed.");
  }

  const statement = statements[0];
  if (!READ_ONLY.has(statement.type)) {
    throw new QueryRejectedError(
      REJECTED.has(statement.type)
        ? rejectionMessage(statement.type)
        : "Only a single read-only SELECT statement is allowed.",
    );
  }

  assertNoWrites(statement);
}
