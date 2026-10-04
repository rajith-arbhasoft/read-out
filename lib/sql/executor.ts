import type { QueryResult } from "@/lib/types";
import { poolSettings } from "@/lib/config/environments";
import { withClient } from "@/lib/database/pools";
import {
  DatabaseBusyError,
  DatabaseConnectionError,
  DatabaseSqlError,
  QueryTimeoutError,
  ResultLimitError,
  UnexpectedQueryError,
  sanitizeSqlError,
} from "@/lib/sql/errors";

const CONNECT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ECONNRESET",
  "28P01",
  "28000",
  "3D000",
  "57P01",
  "57P03",
  "08000",
  "08001",
  "08006",
]);

export async function executeReadOnlyQuery(
  environment: string,
  sql: string,
): Promise<Omit<QueryResult, "durationMs">> {
  const settings = poolSettings(environment);
  try {
    return await withClient(environment, async (client) => {
      await client.query("BEGIN READ ONLY");
      await client.query(`DECLARE sql_tool_cursor NO SCROLL CURSOR FOR ${sql}`);

      const columns: string[] = [];
      const rows: Record<string, unknown>[] = [];
      let bytes = 0;
      let sawFields = false;

      while (true) {
        const batch = await client.query({
          text: "FETCH FORWARD 500 FROM sql_tool_cursor",
          rowMode: "array",
        });

        if (!sawFields) {
          columns.push(...uniqueColumnNames(batch.fields.map((field) => field.name)));
          bytes = Buffer.byteLength(JSON.stringify(columns), "utf8");
          sawFields = true;
        }

        if (batch.rows.length === 0) break;

        for (const raw of batch.rows) {
          if (rows.length >= settings.maxRows) throw new ResultLimitError();
          const row = toRow(columns, raw as unknown[]);
          bytes += Buffer.byteLength(JSON.stringify(row), "utf8") + 1;
          if (bytes > settings.maxResponseBytes) throw new ResultLimitError();
          rows.push(row);
        }
      }

      await client.query("COMMIT");
      return { environment, columns, rows, rowCount: rows.length };
    });
  } catch (error) {
    throw mapDatabaseError(error, environment);
  }
}

function uniqueColumnNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    return `${name} (${count + 1})`;
  });
}

function toRow(columns: string[], values: unknown[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  columns.forEach((column, index) => {
    row[column] = normalizeValue(values[index]);
  });
  return row;
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) {
    if (value.length > 256) return `<binary ${value.length} bytes>`;
    return `\\x${value.toString("hex")}`;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = normalizeValue(nested);
    }
    return output;
  }
  return value;
}

function mapDatabaseError(error: unknown, environment: string): Error {
  if (
    error instanceof QueryTimeoutError ||
    error instanceof ResultLimitError ||
    error instanceof DatabaseBusyError ||
    error instanceof DatabaseConnectionError ||
    error instanceof DatabaseSqlError
  ) {
    return error;
  }

  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";

  if (code === "57014" || /canceling statement due to statement timeout|query read timeout/i.test(message)) {
    return new QueryTimeoutError();
  }
  if (/timeout exceeded when trying to connect/i.test(message) || code === "53300") {
    return new DatabaseBusyError();
  }
  if (CONNECT_CODES.has(code) || /postgresql:\/\/|postgres:\/\//i.test(message)) {
    return new DatabaseConnectionError(environment);
  }

  const safe = sanitizeSqlError(message);
  if (safe && code) return new DatabaseSqlError(safe);
  if (safe && /does not exist|syntax error|cannot|permission denied|invalid/i.test(safe)) {
    return new DatabaseSqlError(safe);
  }
  return new UnexpectedQueryError();
}
