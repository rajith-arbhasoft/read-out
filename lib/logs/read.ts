import { queryReadOnly } from "@/lib/sql/executor";
import { fillBuckets } from "@/lib/logs/series";
import { levelName, likePattern, parseBucket, parseGroupLimit, parseMinMs, parsePage } from "@/lib/logs/query";
import type {
  ErrorGroup,
  LogDetail,
  LogImport,
  LogListItem,
  LogPoint,
  LogSummary,
  ParsedLogQuery,
  SlowGroup,
} from "@/lib/logs/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Where = { sql: string; params: unknown[] };

export async function readSummary(environment: string, query: ParsedLogQuery): Promise<LogSummary> {
  const where = sharedWhere(query);
  const [row] = await queryReadOnly(
    environment,
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE level = 20)::int AS debug,
       COUNT(*) FILTER (WHERE level = 30)::int AS info,
       COUNT(*) FILTER (WHERE level = 40)::int AS warn,
       COUNT(*) FILTER (WHERE level >= 50)::int AS error,
       COUNT(*) FILTER (WHERE level = 60)::int AS fatal,
       COUNT(*) FILTER (WHERE status_code BETWEEN 500 AND 599)::int AS http5xx,
       COUNT(*) FILTER (WHERE status_code BETWEEN 400 AND 499)::int AS http4xx,
       AVG(response_time) AS avg_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time) AS p95_ms
     FROM log.logs
     WHERE ${where.sql}`,
    where.params,
  );
  const total = integer(row?.total);
  const error = integer(row?.error);
  return {
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    total,
    debug: integer(row?.debug),
    info: integer(row?.info),
    warn: integer(row?.warn),
    error,
    fatal: integer(row?.fatal),
    errorRate: total === 0 ? 0 : error / total,
    http5xx: integer(row?.http5xx),
    http4xx: integer(row?.http4xx),
    avgResponseTimeMs: rounded(row?.avg_ms),
    p95ResponseTimeMs: rounded(row?.p95_ms),
  };
}

export async function readTimeseries(
  environment: string,
  query: ParsedLogQuery,
  params: URLSearchParams,
): Promise<{ bucket: "minute" | "hour" | "day"; from: string; to: string; points: LogPoint[] }> {
  const bucket = parseBucket(params, query);
  const where = sharedWhere(query);
  const rows = await queryReadOnly(
    environment,
    `SELECT
       (date_trunc($${where.params.length + 1}, timestamp AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh') AS at,
       COUNT(*) FILTER (WHERE level = 20)::int AS debug,
       COUNT(*) FILTER (WHERE level = 30)::int AS info,
       COUNT(*) FILTER (WHERE level = 40)::int AS warn,
       COUNT(*) FILTER (WHERE level >= 50)::int AS error,
       COUNT(*) FILTER (WHERE level = 60)::int AS fatal
     FROM log.logs
     WHERE ${where.sql}
     GROUP BY 1
     ORDER BY 1`,
    [...where.params, bucket],
  );
  return {
    bucket,
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    points: fillBuckets(
      query.from,
      query.to,
      bucket,
      rows.map((row) => ({
        at: asDate(row.at),
        debug: integer(row.debug),
        info: integer(row.info),
        warn: integer(row.warn),
        error: integer(row.error),
        fatal: integer(row.fatal),
      })),
    ),
  };
}

export async function readLogs(
  environment: string,
  query: ParsedLogQuery,
  params: URLSearchParams,
): Promise<{ items: LogListItem[]; page: number; limit: number; total: number }> {
  const page = parsePage(params);
  const where = sharedWhere(query);
  const [countRow] = await queryReadOnly(
    environment,
    `SELECT COUNT(*)::int AS total FROM log.logs WHERE ${where.sql}`,
    where.params,
  );
  const offset = (page.page - 1) * page.limit;
  const rows = await queryReadOnly(
    environment,
    `SELECT id, timestamp, level, message, method, url, status_code, response_time
     FROM log.logs
     WHERE ${where.sql}
     ORDER BY timestamp DESC, id DESC
     LIMIT $${where.params.length + 1}
     OFFSET $${where.params.length + 2}`,
    [...where.params, page.limit, offset],
  );
  return {
    items: rows.map(toListItem),
    page: page.page,
    limit: page.limit,
    total: integer(countRow?.total),
  };
}

export async function readLog(environment: string, id: string): Promise<LogDetail | null> {
  if (!UUID.test(id)) return null;
  const [row] = await queryReadOnly(
    environment,
    `SELECT id, timestamp, level, message, method, url, status_code, response_time,
            req, res, error, context, file_name
     FROM log.logs
     WHERE id = $1`,
    [id],
  );
  if (!row) return null;
  return {
    ...toListItem(row),
    req: row.req ?? null,
    res: row.res ?? null,
    error: row.error ?? null,
    context: row.context ?? null,
    fileName: String(row.file_name ?? ""),
  };
}

export async function readSlowGroups(
  environment: string,
  query: ParsedLogQuery,
  params: URLSearchParams,
): Promise<SlowGroup[]> {
  const minMs = parseMinMs(params);
  const limit = parseGroupLimit(params);
  const where = sharedWhere(query);
  const rows = await queryReadOnly(
    environment,
    `SELECT method, url,
            COUNT(*)::int AS count,
            AVG(response_time) AS avg_ms,
            MAX(response_time)::int AS max_ms
     FROM log.logs
     WHERE ${where.sql}
       AND response_time IS NOT NULL
       AND url IS NOT NULL
     GROUP BY method, url
     HAVING MAX(response_time) >= $${where.params.length + 1}
     ORDER BY MAX(response_time) DESC, COUNT(*) DESC
     LIMIT $${where.params.length + 2}`,
    [...where.params, minMs, limit],
  );
  return rows.map((row) => ({
    method: textOrNull(row.method),
    url: String(row.url),
    count: integer(row.count),
    avgResponseTimeMs: rounded(row.avg_ms),
    maxResponseTimeMs: integer(row.max_ms),
  }));
}

export async function readErrorGroups(
  environment: string,
  query: ParsedLogQuery,
  params: URLSearchParams,
): Promise<ErrorGroup[]> {
  const limit = parseGroupLimit(params);
  const where = sharedWhere(query);
  const rows = await queryReadOnly(
    environment,
    `SELECT method, url,
            COUNT(*)::int AS count,
            MAX(timestamp) AS last_seen
     FROM log.logs
     WHERE ${where.sql}
       AND url IS NOT NULL
       AND (level >= 50 OR status_code >= 500)
     GROUP BY method, url
     ORDER BY COUNT(*) DESC, MAX(timestamp) DESC
     LIMIT $${where.params.length + 1}`,
    [...where.params, limit],
  );
  return rows.map((row) => ({
    method: textOrNull(row.method),
    url: String(row.url),
    count: integer(row.count),
    lastSeen: asDate(row.last_seen).toISOString(),
  }));
}

export async function readImports(environment: string): Promise<LogImport[]> {
  const rows = await queryReadOnly(
    environment,
    `SELECT file_name, status, "offset", last_processed_at, created_at
     FROM log.log_trackers
     ORDER BY last_processed_at DESC NULLS LAST, created_at DESC
     LIMIT 50`,
  );
  return rows.map((row) => ({
    fileName: String(row.file_name ?? ""),
    status: importStatus(row.status),
    offset: String(row.offset ?? "0"),
    lastProcessedAt: row.last_processed_at == null ? null : asDate(row.last_processed_at).toISOString(),
    createdAt: asDate(row.created_at).toISOString(),
  }));
}

function sharedWhere(query: ParsedLogQuery): Where {
  const params: unknown[] = [query.from, query.to];
  const clauses = ["timestamp >= $1", "timestamp < $2"];

  if (query.level) {
    params.push(query.level.value);
    clauses.push(query.level.match === "eq" ? `level = $${params.length}` : `level >= $${params.length}`);
  }
  if (query.method) {
    params.push(query.method);
    clauses.push(`method = $${params.length}`);
  }
  if (query.status?.match === "eq") {
    params.push(query.status.value);
    clauses.push(`status_code = $${params.length}`);
  } else if (query.status?.match === "range") {
    params.push(query.status.from, query.status.to);
    clauses.push(`status_code >= $${params.length - 1} AND status_code < $${params.length}`);
  }
  if (query.urlPrefix) {
    params.push(likePattern(query.urlPrefix, "prefix"));
    clauses.push(`url LIKE $${params.length} ESCAPE '\\'`);
  }
  if (query.message) {
    params.push(likePattern(query.message, "contains"));
    clauses.push(`message ILIKE $${params.length} ESCAPE '\\'`);
  }

  return { sql: clauses.join(" AND "), params };
}

function toListItem(row: Record<string, unknown>): LogListItem {
  return {
    id: String(row.id),
    timestamp: asDate(row.timestamp).toISOString(),
    level: levelName(integer(row.level)),
    message: String(row.message ?? ""),
    method: textOrNull(row.method),
    url: textOrNull(row.url),
    statusCode: row.status_code == null ? null : integer(row.status_code),
    responseTimeMs: row.response_time == null ? null : integer(row.response_time),
  };
}

function importStatus(value: unknown): LogImport["status"] {
  if (value === "processing" || value === "completed" || value === "failed") return value;
  return "failed";
}

function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.trunc(parsed);
}

function rounded(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text === "" ? null : text;
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}
