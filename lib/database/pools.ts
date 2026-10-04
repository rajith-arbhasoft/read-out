import { Pool, type PoolClient } from "pg";
import { getConnectionString, poolSettings } from "@/lib/config/environments";

const globalForPools = globalThis as unknown as { __sqlToolPools?: Map<string, Pool> };
const pools = globalForPools.__sqlToolPools ?? new Map<string, Pool>();
globalForPools.__sqlToolPools = pools;

export function getPool(environment: string): Pool | null {
  const existing = pools.get(environment);
  if (existing) return existing;

  const connectionString = getConnectionString(environment);
  if (!connectionString) return null;

  const settings = poolSettings(environment);
  const pool = new Pool({
    connectionString,
    max: settings.poolMax,
    connectionTimeoutMillis: settings.connectionTimeoutMs,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
    statement_timeout: settings.timeoutMs,
    query_timeout: settings.timeoutMs + 1_000,
    lock_timeout: Math.min(3_000, settings.timeoutMs),
    idle_in_transaction_session_timeout: settings.timeoutMs + 5_000,
    application_name: "sql-internal-tool",
    maxUses: 100,
  });

  pool.on("error", () => {
    console.error(`[sql-tool] pool error env=${environment}`);
  });

  pools.set(environment, pool);
  return pool;
}

export async function withClient<T>(
  environment: string,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPool(environment);
  if (!pool) {
    throw new Error("Unknown environment");
  }

  const client = await pool.connect();
  let discard = false;
  try {
    return await run(client);
  } catch (error) {
    discard = shouldDiscard(error);
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard ? true : undefined);
  }
}

function shouldDiscard(error: unknown): boolean {
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  return (
    code === "57014" ||
    /timeout|connection terminated|econnreset|econnrefused/i.test(`${code} ${message}`)
  );
}
