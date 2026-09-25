import { test } from "node:test";
import assert from "node:assert/strict";
import { executeSql } from "../server/sql-runner.ts";
import { lessons } from "../server/sql-content.ts";
test("every lesson passes sample and variant with its reference query", async () => {
  for (const l of lessons) {
    const r = await executeSql(l.answer, l.id, true);
    assert.equal(r.passed, true, JSON.stringify(r));
  }
});
test("SQL executor refuses writes, attached files and multiple queries; accepts semicolons in strings", async () => {
  for (const sql of [
    "DELETE FROM orders",
    "ATTACH DATABASE 'file.db' AS extra",
    "SELECT 1; SELECT 2",
    "SELECT load_extension('evil')",
  ]) {
    const r = await executeSql(sql, "filter");
    assert.ok(r.error, sql);
  }
  const r = await executeSql("SELECT ';' AS punctuation", "filter");
  assert.deepEqual(r.rows, [[";"]]);
});
test("submission checks output names and values; syntax errors return useful feedback", async () => {
  assert.equal(
    (await executeSql("SELECT 1 AS id, 100 AS amount", "filter", true)).passed,
    false,
  );
  assert.ok((await executeSql("SELEC id FROM orders", "filter")).error);
  assert.equal(
    (await executeSql("SELECT id,amount FROM orders", "filter")).passed,
    undefined,
  );
});
test("unbounded recursive query is interrupted", async () => {
  const began = Date.now();
  await assert.rejects(
    executeSql(
      "WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x) SELECT sum(n) FROM x",
      "filter",
    ),
    /超时/,
  );
  assert.ok(Date.now() - began < 9000);
});
