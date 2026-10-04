export class QueryRejectedError extends Error {
  readonly status = 400;
  readonly outcome = "rejected" as const;

  constructor(message: string) {
    super(message);
    this.name = "QueryRejectedError";
  }
}

export class QueryTimeoutError extends Error {
  readonly status = 408;
  readonly outcome = "timeout" as const;

  constructor() {
    super("Query execution timed out.");
    this.name = "QueryTimeoutError";
  }
}

export class ResultLimitError extends Error {
  readonly status = 413;
  readonly outcome = "limit" as const;

  constructor() {
    super(
      "Result exceeds the maximum allowed size.\nPlease narrow your query or add a LIMIT clause.",
    );
    this.name = "ResultLimitError";
  }
}

export class DatabaseBusyError extends Error {
  readonly status = 503;
  readonly outcome = "busy" as const;

  constructor() {
    super("The database is busy. Try again shortly.");
    this.name = "DatabaseBusyError";
  }
}

export class DatabaseConnectionError extends Error {
  readonly status = 502;
  readonly outcome = "connection" as const;

  constructor(environment: string) {
    super(`Unable to connect to ${environment} database.`);
    this.name = "DatabaseConnectionError";
  }
}

export class DatabaseSqlError extends Error {
  readonly status = 400;
  readonly outcome = "sql" as const;

  constructor(message: string) {
    super(message);
    this.name = "DatabaseSqlError";
  }
}

export class UnexpectedQueryError extends Error {
  readonly status = 500;
  readonly outcome = "error" as const;

  constructor() {
    super("The query could not be completed.");
    this.name = "UnexpectedQueryError";
  }
}

const SECRET =
  /password|postgresql:\/\/|postgres:\/\/|connection string|secret|token/i;
const PATH = /[a-z]:\\|\/(?:home|users|var|etc|usr|opt|tmp)\//i;

export function sanitizeSqlError(message: string): string | null {
  const line = message.split("\n")[0]?.trim() ?? "";
  if (!line || SECRET.test(line) || PATH.test(line)) return null;
  return line.slice(0, 400);
}
