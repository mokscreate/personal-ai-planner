import { futureRecurrences, assertFutureRecurrences } from "./scheduling.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  emptyPlan,
  applyOperations,
  validatePlan,
  type Plan,
  type Operation,
} from "../shared/domain.ts";
export class Store {
  db: DatabaseSync;
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(join(dir, "planner.sqlite"));
    this.db.exec(
      `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, role TEXT, content TEXT, images TEXT, created TEXT); CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, revision INTEGER, base INTEGER, status TEXT, content TEXT); CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, result TEXT);`,
    );
    if (!this.get("plan")) this.set("plan", emptyPlan());
    this.set("schema", 1);
  }
  get<T = any>(key: string): T | undefined {
    const r = this.db
      .prepare("SELECT value FROM kv WHERE key=?")
      .get(key) as any;
    return r ? JSON.parse(r.value) : undefined;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare("INSERT OR REPLACE INTO kv VALUES (?,?)")
      .run(key, JSON.stringify(value));
  }
  plan(): Plan {
    return this.get("plan")!;
  }
  command(version: number, ops: Operation[], key: string) {
    return this.transaction(() => {
      const prior = this.db
        .prepare("SELECT result FROM requests WHERE id=?")
        .get(key) as any;
      if (prior) return this.plan();
      const before = this.plan();
      if (version !== before.version)
        throw Error("数据已更新，请刷新后重新操作");
      const after = applyOperations(before, ops);
      this.record(before);
      after.version = before.version + 1;
      this.set("plan", after);
      this.db.prepare("INSERT INTO requests VALUES (?,?)").run(key, "ok");
      return after;
    });
  }
  record(p: Plan, adoptedDraftId?: string, sqlSnapshot?: { studyPlan: any }) {
    this.db.prepare("INSERT INTO history(value) VALUES (?)").run(
      JSON.stringify({
        ...p,
        ...(adoptedDraftId ? { _adoptedDraftId: adoptedDraftId } : {}),
        ...(sqlSnapshot ? { _sqlSnapshot: sqlSnapshot } : {}),
      }),
    );
    this.db.exec(
      "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 20)",
    );
  }
  undo(version: number) {
    return this.transaction(() => {
      const current = this.plan();
      if (current.version !== version) throw Error("数据已更新，请刷新");
      const row = this.db
        .prepare("SELECT * FROM history ORDER BY id DESC LIMIT 1")
        .get() as any;
      if (!row) throw Error("没有可撤销的操作");
      const p = JSON.parse(row.value);
      const draftId = p._adoptedDraftId;
      delete p._adoptedDraftId;
      if (p._sqlSnapshot) {
        const learning = this.get("sql:learning") || {};
        if (p._sqlSnapshot.studyPlan)
          learning.studyPlan = p._sqlSnapshot.studyPlan;
        else delete learning.studyPlan;
        this.set("sql:learning", learning);
        delete p._sqlSnapshot;
      }
      p.version = current.version + 1;
      this.set("plan", p);
      if (draftId)
        this.db
          .prepare(
            "UPDATE drafts SET status='pending',base=?,revision=revision+1 WHERE id=? AND status='applied'",
          )
          .run(p.version, draftId);
      this.db.prepare("DELETE FROM history WHERE id=?").run(row.id);
      return p;
    });
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  message(role: string, content: string, images: string[] = []) {
    this.db
      .prepare("INSERT INTO messages VALUES (?,?,?,?,?)")
      .run(
        randomUUID(),
        role,
        content,
        JSON.stringify(images),
        new Date().toISOString(),
      );
  }
  messages() {
    return (
      this.db.prepare("SELECT * FROM messages ORDER BY rowid").all() as any[]
    ).map((r) => ({ ...r, images: JSON.parse(r.images) }));
  }
  draft(operations: Operation[]) {
    operations = futureRecurrences(operations, this.plan());
    const d = {
      id: randomUUID(),
      revision: 0,
      base: this.plan().version,
      status: "pending",
      operations,
    };
    this.db
      .prepare("INSERT INTO drafts VALUES (?,?,?,?,?)")
      .run(d.id, d.revision, d.base, d.status, JSON.stringify(operations));
    return d;
  }
  drafts() {
    return (
      this.db
        .prepare(
          "SELECT * FROM drafts WHERE status='pending' ORDER BY rowid DESC",
        )
        .all() as any[]
    ).map((r) => ({ ...r, operations: JSON.parse(r.content) }));
  }
  saveDraft(id: string, revision: number, operations: Operation[]) {
    const r = this.db
      .prepare("SELECT * FROM drafts WHERE id=? AND status='pending'")
      .get(id) as any;
    if (!r || r.revision !== revision) throw Error("草稿已变化，请重新打开");
    if (!Array.isArray(operations) || operations.length > 100)
      throw Error("草稿条目无效");
    this.db
      .prepare("UPDATE drafts SET revision=revision+1,content=? WHERE id=?")
      .run(JSON.stringify(operations), id);
  }
  applyDraft(id: string, revision: number) {
    return this.transaction(() => {
      const r = this.db
        .prepare("SELECT * FROM drafts WHERE id=?")
        .get(id) as any;
      if (!r) throw Error("草稿不存在");
      if (r.status === "applied") return this.plan();
      if (r.status !== "pending" || r.revision !== revision)
        throw Error("草稿已变化");
      const p = this.plan();
      if (r.base !== p.version) throw Error("日历已变化，请先重新核对草稿");
      const operations = JSON.parse(r.content);
      assertFutureRecurrences(operations, p);
      for (const op of operations)
        if (
          op.type === "task" &&
          !p.tasks.some((t) => t.id === op.value?.id) &&
          p.tasks.some(
            (t) =>
              t.title === op.value?.title &&
              (t.dueDate || "") === (op.value?.dueDate || "") &&
              (t.projectId || "") === (op.value?.projectId || ""),
          )
        )
          throw Error("发现同名同截止日期任务，请编辑草稿区分或丢弃重复条目");
      const next = applyOperations(p, operations);
      this.record(p, id);
      next.version++;
      this.set("plan", next);
      this.db.prepare("UPDATE drafts SET status='applied' WHERE id=?").run(id);
      return next;
    });
  }
  rebase(id: string, revision: number) {
    const r = this.db
      .prepare(
        "SELECT * FROM drafts WHERE id=? AND revision=? AND status='pending'",
      )
      .get(id, revision) as any;
    if (!r) throw Error("草稿已变化");
    applyOperations(this.plan(), JSON.parse(r.content));
    this.db
      .prepare("UPDATE drafts SET base=?,revision=revision+1 WHERE id=?")
      .run(this.plan().version, id);
  }
  restore(value: any) {
    const p = validatePlan(value.plan);
    return this.transaction(() => {
      this.record(this.plan());
      p.version = this.plan().version + 1;
      this.set("plan", p);
      return p;
    });
  }
  close() {
    this.db.close();
  }
}
