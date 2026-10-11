import type { HttpMethod, LevelFilter, LogBucket, LogLevelName, ParsedLogQuery, StatusFilter } from "@/lib/logs/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 14 * DAY_MS;
const LEVELS: Record<LogLevelName, LevelFilter> = {
  debug: { match: "eq", value: 20 },
  info: { match: "eq", value: 30 },
  warn: { match: "eq", value: 40 },
  error: { match: "gte", value: 50 },
  fatal: { match: "eq", value: 60 },
};
const METHODS = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export class LogQueryError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "LogQueryError";
  }
}

export function parseSharedQuery(params: URLSearchParams, now = new Date()): ParsedLogQuery {
  const from = readDate(params.get("from"), new Date(now.getTime() - DAY_MS), "from");
  const to = readDate(params.get("to"), now, "to");
  if (from.getTime() >= to.getTime()) {
    throw new LogQueryError("from must be before to.");
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new LogQueryError("The time range cannot be longer than 14 days.");
  }

  return {
    from,
    to,
    level: readLevel(params.get("level")),
    method: readMethod(params.get("method")),
    status: readStatus(params.get("statusCode")),
    urlPrefix: readUrlPrefix(params.get("url")),
    message: readMessage(params.get("q")),
  };
}

export function defaultBucket(query: ParsedLogQuery): LogBucket {
  return query.to.getTime() - query.from.getTime() < 48 * 60 * 60 * 1000 ? "hour" : "day";
}

export function parseBucket(params: URLSearchParams, query: ParsedLogQuery): LogBucket {
  const raw = params.get("bucket");
  if (raw === null || raw === "") return defaultBucket(query);
  if (raw === "minute" || raw === "hour" || raw === "day") return raw;
  throw new LogQueryError("Invalid bucket.");
}

export function parsePage(params: URLSearchParams): { page: number; limit: number } {
  return {
    page: readInteger(params.get("page"), 1, 1, 10_000, "page"),
    limit: readInteger(params.get("limit"), 50, 1, 100, "limit"),
  };
}

export function parseGroupLimit(params: URLSearchParams): number {
  return readInteger(params.get("limit"), 20, 1, 50, "limit");
}

export function parseMinMs(params: URLSearchParams): number {
  return readInteger(params.get("minMs"), 1000, 0, 86_400_000, "minMs");
}

export function levelName(level: number): LogLevelName {
  if (level >= 60) return "fatal";
  if (level >= 50) return "error";
  if (level >= 40) return "warn";
  if (level >= 30) return "info";
  return "debug";
}

export function likePattern(value: string, mode: "prefix" | "contains"): string {
  const escaped = value.replace(/[\\%_]/g, (char) => `\\${char}`);
  return mode === "prefix" ? `${escaped}%` : `%${escaped}%`;
}

function readDate(raw: string | null, fallback: Date, label: string): Date {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new LogQueryError(`Invalid ${label} date.`);
  return parsed;
}

function readLevel(raw: string | null): LevelFilter | null {
  if (raw === null || raw.trim() === "") return null;
  const name = raw.trim().toLowerCase();
  if (name in LEVELS) return LEVELS[name as LogLevelName];
  if (/^\d+$/.test(raw.trim())) {
    const value = Number(raw.trim());
    if (value > 1000) throw new LogQueryError("Invalid level.");
    return { match: "gte", value };
  }
  throw new LogQueryError("Invalid level.");
}

function readMethod(raw: string | null): HttpMethod | null {
  if (raw === null || raw.trim() === "") return null;
  const method = raw.trim().toUpperCase();
  if (!METHODS.has(method as HttpMethod)) throw new LogQueryError("Invalid method.");
  return method as HttpMethod;
}

function readStatus(raw: string | null): StatusFilter | null {
  if (raw === null || raw.trim() === "") return null;
  const value = raw.trim().toLowerCase();
  const exact = /^[1-5]\d{2}$/.exec(value);
  if (exact) return { match: "eq", value: Number(value) };
  const band = /^([1-5])xx$/.exec(value);
  if (band) {
    const from = Number(band[1]) * 100;
    return { match: "range", from, to: from + 100 };
  }
  throw new LogQueryError("Invalid statusCode.");
}

function readUrlPrefix(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;
  if (raw.length > 2048) throw new LogQueryError("Invalid url.");
  let path = raw.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      throw new LogQueryError("Invalid url.");
    }
  }
  path = path.split("#")[0]?.split("?")[0]?.trim() ?? "";
  return path || null;
}

function readMessage(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;
  const message = raw.trim();
  if (message.length > 500) throw new LogQueryError("Invalid q.");
  return message;
}

function readInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  if (raw === null || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new LogQueryError(`Invalid ${label}.`);
  const value = Number(raw.trim());
  if (value < min || value > max) throw new LogQueryError(`Invalid ${label}.`);
  return value;
}
