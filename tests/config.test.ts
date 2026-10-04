import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { environmentCatalog, getConnectionString, poolSettings } from "../lib/config/environments";

const SECRET = "postgresql://sql_tool_reader:sql-tool-test-secret@10.99.88.77:5432/application_dev";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("environment configuration", () => {
  it("publishes names only", () => {
    withEnv(
      {
        DATABASE_UNITTEST: SECRET,
        DATABASE_URL: SECRET,
        DATABASE_lowercase: SECRET,
      },
      () => {
        const catalog = environmentCatalog();
        assert.equal(catalog.environments.includes("UNITTEST"), true);
        assert.equal(catalog.environments.includes("URL"), false);
        assert.equal(catalog.environments.includes("lowercase"), false);
        const published = JSON.stringify(catalog);
        assert.equal(published.includes("postgresql://"), false);
        assert.equal(published.includes("sql-tool-test-secret"), false);
        assert.equal(published.includes("10.99.88.77"), false);
        assert.equal(getConnectionString("UNITTEST"), SECRET);
        assert.equal(getConnectionString("HACKER_DB"), null);
        assert.equal(getConnectionString("UNITTEST;DROP"), null);
      },
    );
  });

  it("uses small pools and stricter production limits", () => {
    withEnv(
      {
        SQL_TOOL_POOL_MAX_PROD: undefined,
        SQL_TOOL_POOL_MAX_DEV: undefined,
        SQL_TOOL_POOL_MAX_QAS: undefined,
        SQL_TOOL_POOL_MAX: undefined,
        SQL_TOOL_TIMEOUT_MS_PROD: undefined,
        SQL_TOOL_TIMEOUT_MS_DEV: undefined,
        SQL_TOOL_TIMEOUT_MS_QAS: undefined,
        SQL_TOOL_TIMEOUT_MS: undefined,
        SQL_TOOL_POOL_MAX_UNITTEST: undefined,
        SQL_TOOL_TIMEOUT_MS_UNITTEST: undefined,
      },
      () => {
        assert.equal(poolSettings("PROD").poolMax, 1);
        assert.equal(poolSettings("PROD").timeoutMs, 15_000);
        assert.equal(poolSettings("DEV").poolMax, 3);
        assert.equal(poolSettings("DEV").timeoutMs, 30_000);
        assert.equal(poolSettings("QAS").poolMax, 2);
        assert.equal(poolSettings("QAS").timeoutMs, 20_000);
        assert.equal(poolSettings("UNITTEST").poolMax, 2);
        assert.equal(poolSettings("UNITTEST").timeoutMs, 20_000);
      },
    );
  });

  it("marks PROD for confirmation unless overridden", () => {
    withEnv({ DATABASE_PROD: SECRET, SQL_TOOL_CONFIRM_ENVIRONMENTS: undefined }, () => {
      const catalog = environmentCatalog();
      assert.equal(catalog.confirmEnvironments.includes("PROD"), true);
    });
  });
});
