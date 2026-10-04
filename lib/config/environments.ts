import type { EnvironmentCatalog } from "@/lib/types";

const ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const POOL_CAP = 5;
const TIMEOUT_CAP_MS = 120_000;

export type PoolSettings = {
  poolMax: number;
  timeoutMs: number;
  connectionTimeoutMs: number;
  maxRows: number;
  maxResponseBytes: number;
  maxQueryChars: number;
};

function integerFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  return Math.min(max, Math.max(min, Number(raw)));
}

export function listEnvironments(): string[] {
  const names: string[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("DATABASE_") || key === "DATABASE_URL") continue;
    if (!value?.trim()) continue;
    const name = key.slice("DATABASE_".length);
    if (!ENVIRONMENT_NAME.test(name)) continue;
    names.push(name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

export function getConnectionString(environment: string): string | null {
  if (!listEnvironments().includes(environment)) return null;
  const value = process.env[`DATABASE_${environment}`]?.trim();
  return value || null;
}

export function confirmEnvironmentNames(environments: string[]): string[] {
  const raw = process.env.SQL_TOOL_CONFIRM_ENVIRONMENTS ?? "PROD";
  const configured = new Set(
    raw
      .split(",")
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean),
  );
  return environments.filter((name) => configured.has(name.toUpperCase()));
}

function defaultPoolMax(environment: string): number {
  if (environment === "PROD") return 1;
  if (environment === "DEV") return 3;
  if (environment === "QAS") return 2;
  return 2;
}

function defaultTimeoutMs(environment: string): number {
  if (environment === "PROD") return 15_000;
  if (environment === "DEV") return 30_000;
  if (environment === "QAS") return 20_000;
  return 20_000;
}

export function poolSettings(environment: string): PoolSettings {
  const poolFallback =
    environment === "PROD"
      ? integerFromEnv("SQL_TOOL_POOL_MAX_PROD", 1, 1, POOL_CAP)
      : environment === "DEV"
        ? integerFromEnv("SQL_TOOL_POOL_MAX_DEV", 3, 1, POOL_CAP)
        : environment === "QAS"
          ? integerFromEnv("SQL_TOOL_POOL_MAX_QAS", 2, 1, POOL_CAP)
          : integerFromEnv("SQL_TOOL_POOL_MAX", defaultPoolMax(environment), 1, POOL_CAP);

  const timeoutFallback =
    environment === "PROD"
      ? integerFromEnv("SQL_TOOL_TIMEOUT_MS_PROD", 15_000, 1_000, TIMEOUT_CAP_MS)
      : environment === "DEV"
        ? integerFromEnv("SQL_TOOL_TIMEOUT_MS_DEV", 30_000, 1_000, TIMEOUT_CAP_MS)
        : environment === "QAS"
          ? integerFromEnv("SQL_TOOL_TIMEOUT_MS_QAS", 20_000, 1_000, TIMEOUT_CAP_MS)
          : integerFromEnv("SQL_TOOL_TIMEOUT_MS", defaultTimeoutMs(environment), 1_000, TIMEOUT_CAP_MS);

  return {
    poolMax: integerFromEnv(`SQL_TOOL_POOL_MAX_${environment}`, poolFallback, 1, POOL_CAP),
    timeoutMs: integerFromEnv(`SQL_TOOL_TIMEOUT_MS_${environment}`, timeoutFallback, 1_000, TIMEOUT_CAP_MS),
    connectionTimeoutMs: integerFromEnv("SQL_TOOL_CONNECTION_TIMEOUT_MS", 4_000, 500, 30_000),
    maxRows: integerFromEnv("SQL_TOOL_MAX_ROWS", 10_000, 1, 50_000),
    maxResponseBytes: integerFromEnv("SQL_TOOL_MAX_RESPONSE_BYTES", 5_000_000, 1_024, 20_000_000),
    maxQueryChars: integerFromEnv("SQL_TOOL_MAX_QUERY_CHARS", 100_000, 1, 500_000),
  };
}

export function environmentCatalog(): EnvironmentCatalog {
  const environments = listEnvironments();
  return {
    environments,
    confirmEnvironments: confirmEnvironmentNames(environments),
    maxRows: poolSettings(environments[0] ?? "DEV").maxRows,
  };
}

export function dataDirectory(): string {
  const configured = process.env.SQL_TOOL_DATA_DIR?.trim();
  return configured || `${process.cwd()}/data`;
}
