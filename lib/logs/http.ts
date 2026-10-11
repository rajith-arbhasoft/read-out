import { logDashboardEnabled } from "@/lib/config/environments";
import { isResponse, jsonError, requireEnvironment } from "@/lib/http";
import { LogQueryError, parseSharedQuery } from "@/lib/logs/query";
import type { ParsedLogQuery } from "@/lib/logs/types";
import {
  DatabaseBusyError,
  DatabaseConnectionError,
  DatabaseSqlError,
  QueryTimeoutError,
  ResultLimitError,
  UnexpectedQueryError,
} from "@/lib/sql/errors";

export function logsDisabled(): Response | null {
  if (logDashboardEnabled()) return null;
  return jsonError("Log dashboard is disabled.", 404);
}

export async function withLogQuery(
  request: Request,
  run: (environment: string, query: ParsedLogQuery, params: URLSearchParams) => Promise<unknown>,
): Promise<Response> {
  const disabled = logsDisabled();
  if (disabled) return disabled;

  const params = new URL(request.url).searchParams;
  const environment = requireEnvironment(params.get("environment"));
  if (isResponse(environment)) return environment;

  try {
    const data = await run(environment, parseSharedQuery(params), params);
    return Response.json({ data });
  } catch (error) {
    return logErrorResponse(error);
  }
}

export function logErrorResponse(error: unknown): Response {
  if (error instanceof LogQueryError) return jsonError(error.message, error.status);
  if (
    error instanceof QueryTimeoutError ||
    error instanceof ResultLimitError ||
    error instanceof DatabaseBusyError ||
    error instanceof DatabaseConnectionError ||
    error instanceof DatabaseSqlError ||
    error instanceof UnexpectedQueryError
  ) {
    return jsonError(error.message, error.status);
  }
  return jsonError("The log query could not be completed.", 500);
}
