export type LogLevelName = "debug" | "info" | "warn" | "error" | "fatal";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type LogBucket = "minute" | "hour" | "day";

export type LogQuery = {
  from?: string;
  to?: string;
  level?: LogLevelName | number;
  method?: HttpMethod;
  statusCode?: string;
  url?: string;
  q?: string;
};

export type LogSummary = {
  from: string;
  to: string;
  total: number;
  debug: number;
  info: number;
  warn: number;
  error: number;
  fatal: number;
  errorRate: number;
  http5xx: number;
  http4xx: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
};

export type LogPoint = {
  at: string;
  debug: number;
  info: number;
  warn: number;
  error: number;
  fatal: number;
};

export type LogListItem = {
  id: string;
  timestamp: string;
  level: LogLevelName;
  message: string;
  method: string | null;
  url: string | null;
  statusCode: number | null;
  responseTimeMs: number | null;
};

export type LogDetail = LogListItem & {
  req: unknown;
  res: unknown;
  error: unknown;
  context: unknown;
  fileName: string;
};

export type SlowGroup = {
  method: string | null;
  url: string;
  count: number;
  avgResponseTimeMs: number;
  maxResponseTimeMs: number;
};

export type ErrorGroup = {
  method: string | null;
  url: string;
  count: number;
  lastSeen: string;
};

export type LogImport = {
  fileName: string;
  status: "processing" | "completed" | "failed";
  offset: string;
  lastProcessedAt: string | null;
  createdAt: string;
};

export type LevelFilter = { match: "eq" | "gte"; value: number };

export type StatusFilter =
  | { match: "eq"; value: number }
  | { match: "range"; from: number; to: number };

export type ParsedLogQuery = {
  from: Date;
  to: Date;
  level: LevelFilter | null;
  method: HttpMethod | null;
  status: StatusFilter | null;
  urlPrefix: string | null;
  message: string | null;
};
