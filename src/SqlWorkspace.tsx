import { SqlOverview } from "./SqlOverview";
import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Check,
  ChevronRight,
  Lightbulb,
  Database,
  Code2,
  History,
  Sparkles,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import "./sql.css";
type Api = (path: string, body?: unknown, method?: string) => Promise<any>;
export function SqlWorkspace({
  api,
  planVersion,
  syncRevision,
  onPlanChange,
}: {
  api: Api;
  planVersion: number;
  syncRevision: string;
  onPlanChange: () => Promise<any>;
}) {
  const [page, setPage] = useState("overview"),
    [data, setData] = useState<any>(null),
    [id, setId] = useState("filter"),
    [sql, setSql] = useState(""),
    [tab, setTab] = useState("result"),
    [table, setTable] = useState("users"),
    [hints, setHints] = useState<string[]>([]),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [coaching, setCoaching] = useState(false),
    [advice, setAdvice] = useState(""),
    [error, setError] = useState(""),
    [save, setSave] = useState("已保存");
  const current = useRef(id),
    drafts = useRef<Record<string, string>>({}),
    queue = useRef(Promise.resolve()),
    request = useRef(0);
  useEffect(() => {
    api("/sql/state")
      .then((d) => {
        setData(d);
        drafts.current = d.learning.drafts;
        setSql(d.learning.drafts.filter || "");
        setAdvice(d.learning.advice.filter || "");
        return api("/sql/hints/filter");
      })
      .then((r) => setHints(r.hints))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    api("/sql/state")
      .then((d) => setData(d))
      .catch((e) => setError(e.message));
  }, [planVersion, syncRevision]);
  function change(value: string) {
    setSql(value);
    setResult(null);
    setAdvice("");
    drafts.current[id] = value;
    setSave("保存中…");
    const target = id;
    queue.current = queue.current
      .catch(() => {})
      .then(() => api("/sql/draft", { id: target, sql: value }, "PUT"))
      .then(() => {
        if (current.current === target) setSave("已保存");
      })
      .catch((e) => {
        setSave("保存失败");
        setError(e.message);
      });
  }
  function choose(next: string) {
    if (busy || coaching) return;
    current.current = next;
    setId(next);
    if (window.innerWidth <= 600)
      requestAnimationFrame(() =>
        document
          .querySelector(".sql-exercise")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    setSql(drafts.current[next] || "");
    setResult(null);
    setAdvice(data.learning.advice[next] || "");
    setHints([]);
    setError("");
    setTab("result");
    setSave("已保存");
    const n = ++request.current;
    api("/sql/hints/" + next)
      .then((r) => {
        if (n === request.current) setHints(r.hints);
      })
      .catch((e) => setError(e.message));
  }
  async function run(submit: boolean) {
    if (busy || !sql.trim()) return;
    setBusy(true);
    setError("");
    setTab("result");
    try {
      await queue.current;
      const r = await api("/sql/run", { id, sql, submit });
      setResult(r);
      setSave("已保存");
      setData((d: any) => ({ ...d, learning: r.learning }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function hint() {
    const target = id;
    try {
      const r = await api("/sql/hint", { id });
      if (current.current === target) setHints(r.hints);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function coach() {
    setCoaching(true);
    setError("");
    try {
      const r = await api("/sql/coach", { id, sql });
      setAdvice(r.text);
      setData((d: any) => ({
        ...d,
        learning: {
          ...d.learning,
          advice: { ...d.learning.advice, [id]: r.text },
        },
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCoaching(false);
    }
  }
  if (!data)
    return (
      <main className="sql-loading">{error || "正在打开SQL练习空间…"}</main>
    );
  const lesson = data.lessons.find((l: any) => l.id === id),
    attempts = data.learning.attempts.filter((a: any) => a.lessonId === id),
    passed = new Set(
      data.learning.attempts
        .filter((a: any) => a.submitted && a.passed)
        .map((a: any) => a.lessonId),
    );
  const selectedTable = data.tables.find((t: any) => t.name === table),
    index = data.lessons.findIndex((l: any) => l.id === id);
  if (page === "overview")
    return (
      <SqlOverview
        planVersion={planVersion}
        onPlanChange={onPlanChange}
        learning={data.learning}
        api={api}
        onLearning={(learning) => setData((d: any) => ({ ...d, learning }))}
        onPractice={(next) => {
          if (next) choose(next);
          setPage("practice");
        }}
      />
    );
  return (
    <main className="sql-page">
      <header className="sql-header">
        <div>
          <h1>SQL 学习</h1>
          <button onClick={() => setPage("overview")}>返回学习目录</button>
          <span>可选：粘贴外部SQL进行SQLite校验。</span>
        </div>
        <span className="sql-engine">
          <span />
          SQLite · 本地练习
        </span>
        <div className="sql-progress">
          <b>{passed.size}</b> / {data.lessons.length} 题通过
        </div>
      </header>
      <div className="sql-layout">
        <aside className="sql-roadmap">
          <div className="sql-section-label">
            学习路线 <BookOpen size={15} />
          </div>
          <h2>业务查询基础</h2>
          <p>用户 · 订单 · 访问</p>
          <div className="sql-track">
            <i
              style={{ width: (passed.size / data.lessons.length) * 100 + "%" }}
            />
          </div>
          {data.lessons.map((l: any, i: number) => (
            <button
              key={l.id}
              className={"sql-lesson " + (l.id === id ? "active" : "")}
              onClick={() => choose(l.id)}
              disabled={busy || coaching}
            >
              <span
                className={"sql-number " + (passed.has(l.id) ? "done" : "")}
              >
                {passed.has(l.id) ? (
                  <Check size={14} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <span>
                <small>{l.stage.split(" · ")[1]}</small>
                <strong>{l.title}</strong>
                <em>
                  {l.level} · 建议{l.minutes}分钟
                </em>
              </span>
            </button>
          ))}
          <div className="sql-roadmap-note">
            随时停下，随时继续。
            <br />
            代码和练习记录自动保存在本机。
          </div>
        </aside>
        <section className="sql-exercise">
          <div className="sql-problem">
            <div className="sql-problem-meta">
              <span>练习 {String(index + 1).padStart(2, "0")}</span>
              <span>{lesson.level}</span>
              {passed.has(id) && <span className="sql-passed">已通过</span>}
            </div>
            <h2>{lesson.title}</h2>
            <p>{lesson.description}</p>
            <div className="sql-columns">
              返回字段{" "}
              {lesson.columns.map((c: string) => (
                <code key={c}>{c}</code>
              ))}
            </div>
          </div>
          <div className="sql-editor-bar">
            <span>
              <Code2 size={16} />
              查询编辑器
            </span>
            <small>{save} · Ctrl + Enter 运行</small>
          </div>
          <div className="sql-editor">
            <div aria-hidden="true" className="sql-lines">
              {sql.split("\n").map((_: string, i: number) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              aria-label="SQL查询"
              value={sql}
              spellCheck={false}
              placeholder={"-- 从这里开始编写SQL\nSELECT ...\nFROM ..."}
              disabled={busy || coaching}
              onChange={(e) => change(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void run(false);
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart,
                    end = el.selectionEnd;
                  change(sql.slice(0, start) + "  " + sql.slice(end));
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 2;
                  });
                }
              }}
            />
          </div>
          <div className="sql-run-bar">
            <small>只读示例数据 · 不影响日程</small>
            <div>
              <button
                onClick={() => run(false)}
                disabled={busy || coaching || !sql.trim()}
              >
                <Play size={14} />
                {busy ? "执行中…" : "运行"}
              </button>
              <button
                className="primary"
                onClick={() => run(true)}
                disabled={busy || !sql.trim()}
              >
                <Check size={15} />
                提交检查
              </button>
            </div>
          </div>
          {error && (
            <div role="alert" className="sql-error">
              {error}
            </div>
          )}
          <div className="sql-result-tabs">
            <button
              className={tab === "result" ? "active" : ""}
              onClick={() => setTab("result")}
            >
              <Database size={14} />
              运行结果
            </button>
            <button
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              <History size={14} />
              本题记录 <span>{attempts.length}</span>
            </button>
          </div>
          <div className="sql-result-panel">
            {tab === "result" ? (
              result ? (
                <>
                  <div
                    role="status"
                    className={
                      "sql-feedback " +
                      (result.passed
                        ? "success"
                        : result.error
                          ? "failure"
                          : "")
                    }
                  >
                    {result.error || result.feedback}
                  </div>
                  {result.rows && (
                    <>
                      <div className="sql-result-count">
                        {result.rows.length} 行 · {result.columns.length} 列
                      </div>
                      <ResultTable
                        columns={result.columns}
                        rows={result.rows}
                      />
                    </>
                  )}
                  {result.passed && index < data.lessons.length - 1 && (
                    <button
                      className="sql-next"
                      onClick={() => choose(data.lessons[index + 1].id)}
                    >
                      下一题：{data.lessons[index + 1].title}
                      <ArrowRight size={15} />
                    </button>
                  )}
                </>
              ) : (
                <div className="sql-result-empty">
                  <Database size={25} />
                  <h3>让第一条查询跑起来</h3>
                  <p>运行查看结果，提交后检查正确性。</p>
                </div>
              )
            ) : attempts.length ? (
              attempts.map((a: any) => (
                <article className="sql-attempt" key={a.id}>
                  <div>
                    <b>
                      {a.error
                        ? "执行出错"
                        : a.submitted
                          ? a.passed
                            ? "检查通过"
                            : "尚未通过"
                          : "已运行"}
                    </b>
                    <time>{new Date(a.at).toLocaleString("zh-CN")}</time>
                  </div>
                  <small>已使用 {a.hints} 条提示</small>
                  <pre>{a.sql}</pre>
                  {a.error && <p>{a.error}</p>}
                  <button
                    disabled={busy}
                    onClick={() => {
                      change(a.sql);
                      setTab("result");
                      setResult(null);
                    }}
                  >
                    恢复这次代码
                  </button>
                </article>
              ))
            ) : (
              <div className="sql-result-empty">
                <History size={25} />
                <p>每次运行和提交都会保存在这里。</p>
              </div>
            )}
          </div>
        </section>
        <aside className="sql-context">
          <div className="sql-section-label">
            数据字典 <Database size={15} />
          </div>
          <p className="sql-dataset-note">虚构电商数据 · 每道题使用同一组表</p>
          <div className="sql-table-tabs">
            {data.tables.map((t: any) => (
              <button
                key={t.name}
                className={table === t.name ? "active" : ""}
                onClick={() => setTable(t.name)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <h3>
            {selectedTable.label} <small>{selectedTable.rows.length}行</small>
          </h3>
          <div className="sql-schema">
            {selectedTable.columns.map((c: string, i: number) => (
              <div key={c}>
                <code>{c}</code>
                <span>
                  {selectedTable.types[i]}
                  {c === "id"
                    ? " · 主键"
                    : c === "user_id"
                      ? " → users.id"
                      : ""}
                </span>
              </div>
            ))}
          </div>
          <details className="sql-preview">
            <summary>
              查看示例数据 <ChevronRight size={13} />
            </summary>
            <ResultTable
              columns={selectedTable.columns}
              rows={selectedTable.rows}
            />
          </details>
          <p className="sql-data-note">
            status：paid 已付款 / pending 待付款 / refunded
            已退款。金额单位：元。用户注册渠道与订单渠道是不同字段。
          </p>
          <section className="sql-hints">
            <div className="sql-section-label">
              <span>
                <Lightbulb size={16} />
                分步提示
              </span>
              <small>
                {hints.length}/{lesson.hintCount}
              </small>
            </div>
            {hints.map((h, i) => (
              <p key={i}>
                <b>{i + 1}.</b> {h}
              </p>
            ))}
            <button onClick={hint} disabled={hints.length >= lesson.hintCount}>
              {hints.length >= lesson.hintCount
                ? "已查看全部提示"
                : hints.length
                  ? "再给一点提示"
                  : "给我一点提示"}
            </button>
          </section>
          <section className="sql-coach">
            <div className="sql-section-label">
              <span>
                <Sparkles size={16} />
                AI 学习教练
              </span>
            </div>
            <p>帮你理解当前查询，给出下一步思路。</p>
            <button onClick={coach} disabled={coaching || busy || !sql.trim()}>
              {coaching ? "正在分析…" : "分析我的 SQL"}
            </button>
            <small>使用设置中的模型；仅发送本题与代码。</small>
            {advice && <div className="sql-advice">{advice}</div>}
          </section>
        </aside>
      </div>
    </main>
  );
}
function ResultTable({ columns, rows }: { columns: string[]; rows: any[][] }) {
  return (
    <div className="sql-data-table">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{v === null ? <i>NULL</i> : String(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>查询成功，结果为空。</p>}
    </div>
  );
}
