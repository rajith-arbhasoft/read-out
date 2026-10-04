import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryRejectedError } from "../lib/sql/errors";
import { validateReadOnlySql } from "../lib/sql/validator";

function rejected(sql: string): string {
  try {
    validateReadOnlySql(sql);
  } catch (error) {
    assert.ok(error instanceof QueryRejectedError);
    return error.message;
  }
  assert.fail(`Expected rejection for: ${sql}`);
}

describe("read-only SQL validation", () => {
  it("allows a single SELECT", () => {
    validateReadOnlySql("SELECT * FROM inspection.inspections WHERE status = 'PENDING'");
    validateReadOnlySql(`
      WITH data AS (
        SELECT * FROM users
      )
      SELECT * FROM data
    `);
    validateReadOnlySql("SELECT 'DROP TABLE users' AS example");
    validateReadOnlySql("SELECT 1; -- trailing comment");
  });

  it("rejects writes and multiple statements", () => {
    assert.match(rejected("INSERT INTO users (id) VALUES (1)"), /INSERT/);
    assert.match(rejected("UPDATE users SET name = 'a'"), /UPDATE/);
    assert.match(rejected("DELETE FROM users"), /DELETE/);
    assert.match(rejected("DROP TABLE users"), /DROP/);
    assert.match(rejected("ALTER TABLE users ADD COLUMN a int"), /ALTER/);
    assert.match(rejected("TRUNCATE users"), /TRUNCATE/);
    assert.match(rejected("CREATE TABLE users (id int)"), /CREATE/);
    assert.match(rejected("GRANT SELECT ON users TO someone"), /GRANT/);
    assert.match(rejected("REVOKE SELECT ON users FROM someone"), /REVOKE/);
    assert.match(rejected("COMMENT ON TABLE users IS 'x'"), /COMMENT/);
    assert.match(rejected("VACUUM users"), /VACUUM/);
    assert.match(rejected("CALL do_something()"), /CALL/);
    assert.match(rejected("DO $$ BEGIN END $$"), /DO/);
    assert.match(rejected("SELECT * FROM users; DELETE FROM users"), /one SQL statement/);
    assert.match(rejected("SELECT * FROM users; DROP TABLE users"), /one SQL statement/);
    assert.match(
      rejected("WITH data AS (DELETE FROM users RETURNING *) SELECT * FROM data"),
      /DELETE/,
    );
    assert.match(rejected("SELECT * FROM users FOR UPDATE"), /locking/);
    assert.match(rejected("SELECT * INTO copy FROM users"), /read-only SELECT/);
    assert.equal(rejected("   "), "Enter a SQL query.");
  });
});
