import { DatabaseSync, constants } from "node:sqlite";
import { dataset, lessons } from "./sql-content.ts";
function singleQuery(sql: string) {
  let quote = "",
    line = false,
    block = false,
    ended = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i],
      n = sql[i + 1];
    if (line) {
      if (c === "\n") line = false;
      continue;
    }
    if (block) {
      if (c === "*" && n === "/") {
        block = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (n === quote) i++;
        else quote = "";
      }
      continue;
    }
    if (c === "-" && n === "-") {
      line = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      block = true;
      i++;
      continue;
    }
    if (/\s/.test(c)) continue;
    if (ended) throw Error("一次只能运行一条查询。");
    if (c === ";") {
      ended = true;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
    } else if (c === "[") {
      quote = "]";
    }
  }
}
function query(sql: string, variant: number) {
  singleQuery(sql);
  const db = new DatabaseSync(":memory:");
  try {
    for (const t of dataset(variant)) {
      db.exec(
        `CREATE TABLE ${t.name} (${t.columns.map((c, i) => c + " " + t.types[i]).join(",")})`,
      );
      const insert = db.prepare(
        `INSERT INTO ${t.name} VALUES (${t.columns.map(() => "?").join(",")})`,
      );
      for (const row of t.rows) insert.run(...row);
    }
    db.exec("PRAGMA query_only=ON");
    const funcs = new Set([
      "count",
      "sum",
      "avg",
      "min",
      "max",
      "round",
      "coalesce",
      "ifnull",
      "nullif",
      "abs",
      "lower",
      "upper",
      "length",
      "substr",
      "substring",
      "trim",
      "replace",
      "date",
      "datetime",
      "strftime",
      "julianday",
      "row_number",
      "rank",
      "dense_rank",
      "lag",
      "lead",
      "first_value",
      "last_value",
      "nth_value",
      "total",
      "printf",
      "like",
      "glob",
      "iif",
    ]);
    db.setAuthorizer((action: number, _a: any, b: any) =>
      [
        constants.SQLITE_SELECT,
        constants.SQLITE_READ,
        constants.SQLITE_RECURSIVE,
      ].includes(action) ||
      (action === constants.SQLITE_FUNCTION &&
        funcs.has(String(b).toLowerCase()))
        ? constants.SQLITE_OK
        : constants.SQLITE_DENY,
    );
    const statement = db.prepare(sql);
    const columns = statement.columns().map((c) => c.name);
    if (!columns.length) throw Error("请编写 SELECT 或 WITH 查询。");
    statement.setReturnArrays(true);
    const rows: any[] = [];
    for (const row of statement.iterate()) {
      if (rows.length >= 500)
        throw Error("结果超过500行，请使用更精确的筛选或 LIMIT。");
      rows.push(row);
    }
    return { columns, rows };
  } finally {
    db.close();
  }
}
function equal(a: any, b: any, ordered: boolean) {
  if (JSON.stringify(a.columns) !== JSON.stringify(b.columns)) return false;
  const x = a.rows.map((r: any) => JSON.stringify(r)),
    y = b.rows.map((r: any) => JSON.stringify(r));
  if (!ordered) {
    x.sort();
    y.sort();
  }
  return JSON.stringify(x) === JSON.stringify(y);
}
let text = "";
for await (const chunk of process.stdin) text += chunk;
try {
  const { sql, lessonId, submit } = JSON.parse(text);
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) throw Error("题目不存在");
  const result = query(sql, 0);
  let passed: boolean | undefined;
  let feedback = "查询运行成功。核对结果后可以提交检查。";
  if (submit) {
    const expected = query(lesson.answer, 0);
    passed = equal(result, expected, lesson.ordered);
    feedback = passed
      ? "示例数据检查通过。"
      : "结果还不正确。请核对列名、筛选条件、重复行和排序。";
    if (passed) {
      passed = equal(query(sql, 1), query(lesson.answer, 1), lesson.ordered);
      feedback = passed
        ? "通过：示例和变体数据检查均正确。"
        : "示例通过，但变体数据未通过。请检查边界情况，避免把示例结果写死。";
    }
  }
  process.stdout.write(JSON.stringify({ ...result, passed, feedback }));
} catch (e: any) {
  process.stdout.write(
    JSON.stringify({
      error: e.message.includes("authorized")
        ? "练习区只允许读取示例表，请使用 SELECT / WITH 和常用SQL函数。"
        : e.message,
    }),
  );
}
