import { randomUUID } from "node:crypto";
import {
  DatabaseBusyError,
  DatabaseConnectionError,
  DatabaseSqlError,
  QueryRejectedError,
  QueryTimeoutError,
  ResultLimitError,
  UnexpectedQueryError,
} from "@/lib/sql/errors";
import { executeReadOnlyQuery } from "@/lib/sql/executor";
import { validateReadOnlySql } from "@/lib/sql/validator";
import { isResponse, jsonError, readJson, requireEnvironment } from "@/lib/http";
import { logOperation } from "@/lib/log";
import { recordHistory } from "@/lib/store/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (isResponse(body)) return body;
  if (!body || typeof body !== "object") return jsonError("Request body must be JSON.", 400);

  const payload = body as { environment?: unknown; query?: unknown };
  const environment = requireEnvironment(payload.environment);
  if (isResponse(environment)) return environment;
  if (typeof payload.query !== "string") return jsonError("Enter a SQL query.", 400);

  const started = Date.now();
  try {
    validateReadOnlySql(payload.query);
    const result = await executeReadOnlyQuery(environment, payload.query);
    const durationMs = Date.now() - started;
    finish({
      environment,
      query: payload.query,
      durationMs,
      rowCount: result.rowCount,
      success: true,
      error: null,
      outcome: "ok",
    });
    return Response.json({ ...result, durationMs });
  } catch (error) {
    const durationMs = Date.now() - started;
    const mapped = mapFailure(error);
    finish({
      environment,
      query: payload.query,
      durationMs,
      rowCount: null,
      success: false,
      error: mapped.message,
      outcome: mapped.outcome,
    });
    return jsonError(mapped.message, mapped.status);
  }
}

function mapFailure(error: unknown): { message: string; status: number; outcome: "rejected" | "timeout" | "limit" | "busy" | "connection" | "sql" | "error" } {
  if (
    error instanceof QueryRejectedError ||
    error instanceof QueryTimeoutError ||
    error instanceof ResultLimitError ||
    error instanceof DatabaseBusyError ||
    error instanceof DatabaseConnectionError ||
    error instanceof DatabaseSqlError ||
    error instanceof UnexpectedQueryError
  ) {
    return { message: error.message, status: error.status, outcome: error.outcome };
  }
  return { message: "The query could not be completed.", status: 500, outcome: "error" };
}

function finish(details: {
  environment: string;
  query: string;
  durationMs: number;
  rowCount: number | null;
  success: boolean;
  error: string | null;
  outcome: "ok" | "rejected" | "timeout" | "limit" | "busy" | "connection" | "sql" | "error";
}) {
  logOperation(details);
  try {
    recordHistory({
      id: randomUUID(),
      environment: details.environment,
      query: details.query,
      durationMs: details.durationMs,
      rowCount: details.rowCount,
      success: details.success,
      error: details.error,
      timestamp: new Date().toISOString(),
    });
  } catch {
    console.error("[sql-tool] failed to record history");
  }
}
