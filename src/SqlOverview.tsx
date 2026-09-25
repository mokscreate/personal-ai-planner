import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ArrowRight,
  Check,
  ExternalLink,
  Download,
  CalendarDays,
} from "lucide-react";
import { chapters, totalHours, studyPlan } from "../shared/sql-curriculum";
import { localDate } from "../shared/domain";
import "./sql-overview.css";
type Api = (path: string, body?: unknown, method?: string) => Promise<any>;
const emptyRecord = {
  read: false,
  externalPassed: false,
  evidence: "",
  confirmed: false,
};
export function SqlOverview({
  learning,
  api,
  onLearning,
  onPractice,
  planVersion,
  onPlanChange,
}: {
  planVersion: number;
  onPlanChange: () => Promise<any>;
  learning: any;
  api: Api;
  onLearning: (v: any) => void;
  onPractice: (id?: string) => void;
}) {
  const detailRef = useRef<HTMLElement>(null);
  const [days, setDays] = useState(learning.studyPlan?.days || 112),
    [start, setStart] = useState(learning.studyPlan?.start || localDate()),
    [selected, setSelected] = useState(
      chapters.find((c) => !learning.chapters?.[c.id]?.confirmed)?.id ||
        "intro",
    ),
    [records, setRecords] = useState<Record<string, typeof emptyRecord>>(
      learning.chapters || {},
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [schedule, setSchedule] = useState<any[]>([]);
  const [dailyPreview, setDailyPreview] = useState<any>(null);
  useEffect(() => {
    setDailyPreview(null);
    api("/sql/schedule")
      .then((r) => setSchedule(r.tasks))
      .catch((e) => setError(e.message));
  }, [planVersion]);
  useEffect(() => {
    setDailyPreview(null);
  }, [start, days, learning]);
  useEffect(() => {
    if (!saving && !detailRef.current?.contains(document.activeElement))
      setRecords(learning.chapters || {});
  }, [learning.chapters]);
  const shownTasks = dailyPreview?.tasks || schedule;
  async function previewDaily() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      setDailyPreview(await api("/sql/plan/preview", { start, days }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  const preview = studyPlan(start || localDate(), days),
    active = chapters.find((c) => c.id === selected)!,
    record = records[selected] || emptyRecord;
  const accepted = learning.studyPlan
    ? studyPlan(learning.studyPlan.start, learning.studyPlan.days)
    : null;
  const changed =
    !accepted || accepted.start !== start || accepted.days !== days;
  const count = chapters.filter((c) => records[c.id]?.confirmed).length;
  const practicePassed =
    active.lessonIds.length > 0 &&
    active.lessonIds.every((id) =>
      learning.attempts.some(
        (a: any) => a.lessonId === id && a.submitted && a.passed,
      ),
    );
  const canConfirm =
    record.read &&
    (practicePassed || (record.externalPassed && record.evidence.trim()));
  async function saveChapter(next: typeof emptyRecord) {
    const id = selected;
    const previous = records[id] || emptyRecord;
    setRecords((r) => ({ ...r, [id]: next }));
    setSaving(true);
    setError("");
    try {
      const r = await api("/sql/chapter/" + id, next, "PUT");
      onLearning(r.learning);
      setNotice("学习记录已保存");
    } catch (e: any) {
      setRecords((r) => ({ ...r, [id]: previous }));
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function adopt() {
    setSaving(true);
    setError("");
    try {
      const r = await api(
        "/sql/plan",
        { start, days, token: dailyPreview?.token },
        "PUT",
      );
      setSchedule(r.tasks);
      setDailyPreview(null);
      await onPlanChange();
      onLearning(r.learning);
      setNotice("每日学习任务已写入日历和章节详情；未排入的任务留在清单。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="sql-overview">
      <header className="sql-header">
        <h1>SQL 学习</h1>
        <nav className="sql-page-tabs">
          <button className="active">总览与目录</button>
          <button onClick={() => onPractice()}>可选网页校验</button>
        </nav>
        <span className="sql-engine">
          {count} / {chapters.length} 章已确认完成
        </span>
      </header>
      <div className="overview-scroll">
        <section className="overview-intro">
          <div>
            <span className="overview-kicker">YOUR LEARNING ROADMAP</span>
            <h2>从零到独立完成业务查询</h2>
            <p>
              目标：独立写业务查询、解释结果、发现错误。网页管理路线和记录，视频负责展开讲解，外部SQL工具负责练习。
            </p>
          </div>
          <div className="overview-progress">
            <b>
              {Math.round((count / chapters.length) * 100)}
              <small>%</small>
            </b>
            <span>按你确认完成的章节计算</span>
            <div>
              <i style={{ width: (count / chapters.length) * 100 + "%" }} />
            </div>
          </div>
        </section>
        <section className="sql-plan">
          <div className="sql-plan-heading">
            <div>
              <h3>
                <CalendarDays size={18} />
                安排学习节奏
              </h3>
              <p>
                整条路线初估{totalHours}
                小时：约30%看讲解、50%练习、20%复习。不是完成保证，也不记录实际计时。
              </p>
            </div>
            <label>
              开始日期
              <input
                type="date"
                aria-label="学习开始日期"
                value={start}
                min={localDate()}
                onInput={(e) => {
                  if (e.currentTarget.value) setStart(e.currentTarget.value);
                }}
              />
            </label>
          </div>
          <div className="plan-sliders">
            <label>
              <span>
                多久学完{" "}
                <b>
                  {days}天 <small>≈ {(days / 30).toFixed(1)}个月</small>
                </b>
              </span>
              <input
                aria-label="完成周期天数"
                type="range"
                min="7"
                max="672"
                step="1"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
              <div className="plan-presets">
                {[30, 60, 90, 112].map((d) => (
                  <button key={d} onClick={() => setDays(d)}>
                    {d === 112 ? "每周3小时" : d / 30 + "个月"}
                  </button>
                ))}
              </div>
            </label>
            <label>
              <span>
                每周投入 <b>约{preview.weeklyHours.toFixed(1)}小时</b>
              </span>
              <input
                aria-label="每周学习小时"
                type="range"
                min="0.5"
                max="48"
                step="0.1"
                value={preview.weeklyHours}
                onChange={(e) =>
                  setDays(
                    Math.max(
                      7,
                      Math.min(
                        672,
                        Math.ceil((totalHours * 7) / Number(e.target.value)),
                      ),
                    ),
                  )
                }
              />
              <small>
                均摊每天约{(preview.dailyHours * 60).toFixed(0)}
                分钟；不是每天必须学习。
              </small>
            </label>
          </div>
          <div className="plan-summary">
            <span>
              {changed ? "待确认预览" : "当前已采用计划"} · {start} →{" "}
              <b>{preview.finish}</b>
              <small>
                每周小时 ≈ {totalHours} × 7 ÷
                周期天数；最后拖动的滑块决定另一个值。
              </small>
            </span>
            <button
              className="primary"
              disabled={saving}
              onClick={previewDaily}
            >
              {saving ? "处理中…" : "预览每日任务"}
            </button>
          </div>
          <p className="plan-footnote">
            点击预览，将剩余章节拆成半小时单位，按日期分摊，优先18:00—22:00，再选08:00—24:00的空闲时段；周四不安排。确认后才写入日历。重新排期替换尚未开始的学习安排，保留已完成、已到时间和退回清单的任务。
          </p>
          {dailyPreview && (
            <section className="daily-plan-preview">
              <h4>每日任务预览 · 尚未写入日历</h4>
              <p>
                新安排 {(dailyPreview.scheduledMinutes / 60).toFixed(1)} 小时 ·
                替换 {dailyPreview.replaced} 个未来任务
                {dailyPreview.unscheduledMinutes > 0
                  ? ` · ${dailyPreview.unscheduledMinutes} 分钟排不下，将放入待办清单`
                  : ""}
                。可以采用后在日历拖动调整。
              </p>
              <div className="study-task-list">
                {dailyPreview.tasks.map((t: any) => (
                  <div className="study-task-row" key={t.id}>
                    <strong>
                      {t.block
                        ? `${t.block.date} ${t.block.start}–${t.block.end}`
                        : `待安排 · 截止 ${t.dueDate}`}
                    </strong>
                    <span>
                      {t.title} · {t.duration}分钟
                    </span>
                  </div>
                ))}
                {!dailyPreview.tasks.length && (
                  <p>全部章节已完成，没有需要安排的任务。</p>
                )}
              </div>
              <button className="primary" disabled={saving} onClick={adopt}>
                确认采用并写入日历
              </button>
              <button disabled={saving} onClick={() => setDailyPreview(null)}>
                取消预览
              </button>
            </section>
          )}
        </section>
        {error && (
          <div role="alert" className="sql-error">
            {error}
          </div>
        )}
        {notice && (
          <p role="status" className="overview-notice">
            {notice}
          </p>
        )}
        <div className="curriculum-layout">
          <section className="curriculum-list">
            <div className="curriculum-title">
              <h3>完整学习目录</h3>
              <span>
                {chapters.length}章 · 约{totalHours}小时
              </span>
            </div>
            {chapters.map((c, i) => {
              const done = records[c.id]?.confirmed;
              const actualDue = shownTasks
                .filter((t: any) => t.sqlChapterId === c.id)
                .map((t: any) => t.block?.date || t.dueDate)
                .sort()
                .at(-1);
              const due =
                ((!changed || dailyPreview) && actualDue) ||
                (changed ? preview : accepted)?.chapters.find(
                  (x) => x.id === c.id,
                )?.due;
              const overdue = !changed && !done && due && due < localDate();
              return (
                <button
                  key={c.id}
                  className={
                    "chapter-row " + (selected === c.id ? "selected" : "")
                  }
                  disabled={saving}
                  onClick={() => {
                    setSelected(c.id);
                    if (window.innerWidth <= 600)
                      requestAnimationFrame(() =>
                        detailRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        }),
                      );
                    setNotice("");
                  }}
                >
                  <span className="chapter-number">
                    {done ? (
                      <Check size={17} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    <strong>{c.title}</strong>
                    <small>{c.topics}</small>
                    <em>
                      {c.hours}小时 ·{" "}
                      {due
                        ? `${changed ? "预览截止" : "计划截止"} ${due}`
                        : "未安排"}
                      {overdue ? " · 已逾期，待调整" : ""}
                    </em>
                  </span>
                  <span className="chapter-status">
                    {done
                      ? "已完成"
                      : records[c.id]?.read
                        ? "学习中"
                        : "未开始"}
                    <ArrowRight size={13} />
                  </span>
                </button>
              );
            })}
          </section>
          <section className="chapter-detail" ref={detailRef}>
            <div className="overview-kicker">
              CHAPTER {String(chapters.indexOf(active) + 1).padStart(2, "0")}
            </div>
            <h3>{active.title}</h3>
            <p className="chapter-goal">学完应能：{active.goal}</p>
            <h4>{dailyPreview ? "每日学习任务（预览）" : "每日学习任务"}</h4>
            <p>
              与日历共用任务；在日历调整时间或标记完成后，这里同步更新。每天打勾不代替最终的章节完成确认。
            </p>
            <div className="study-task-list chapter-schedule">
              {shownTasks
                .filter((t: any) => t.sqlChapterId === active.id)
                .map((t: any) => (
                  <div className="study-task-row" key={t.id}>
                    <strong>
                      {t.block
                        ? `${t.block.date} ${t.block.start}–${t.block.end}`
                        : `待安排 · 截止 ${t.dueDate}`}
                    </strong>
                    <span>
                      {t.title} · {t.duration}分钟 · {t.displayStatus}
                    </span>
                    <small>{t.notes}</small>
                  </div>
                ))}
              {!shownTasks.some((t: any) => t.sqlChapterId === active.id) && (
                <p>尚无每日任务。先预览并采用学习计划。</p>
              )}
            </div>
            <h4>先用几分钟认识这一章</h4>
            <p>{active.intro}</p>
            <pre>{active.example}</pre>
            <label className="chapter-check">
              <input
                type="checkbox"
                checked={record.read}
                disabled={saving}
                onChange={(e) =>
                  saveChapter({
                    ...record,
                    read: e.target.checked,
                    confirmed: false,
                  })
                }
              />
              我已阅读本章简介并理解学习目标
            </label>
            <h4>去B站看讲解</h4>
            <p>
              观看主题：{active.video}
              。按需选看，不必跟完数据库运维、集群等进阶内容。
            </p>
            <a
              href="https://search.bilibili.com/all?keyword=PostgreSQL%20入门"
              target="_blank"
              rel="noreferrer"
            >
              B站搜索 · PostgreSQL入门 <ExternalLink size={12} />
            </a>
            <a
              href="https://www.postgresql.org/docs/current/tutorial.html"
              target="_blank"
              rel="noreferrer"
            >
              补充查阅 · PostgreSQL官方教程 <ExternalLink size={12} />
            </a>
            <h4>在外部工具完成练习</h4>
            <p>{active.check}</p>
            <a
              className="download-practice"
              href="/api/sql/practice-file"
              download
            >
              <Download size={14} />
              下载练习数据 .sql
            </a>
            <small>
              在DBeaver中新建PostgreSQL连接，在空练习库导入。
              网页校验仍使用SQLite，日期函数等语法可能不同。
            </small>
            <label className="chapter-check">
              <input
                type="checkbox"
                disabled={saving}
                checked={record.externalPassed}
                onChange={(e) =>
                  saveChapter({
                    ...record,
                    externalPassed: e.target.checked,
                    confirmed: false,
                  })
                }
              />
              我已在外部工具运行，并自查练习通过
            </label>
            <textarea
              aria-label="外部练习自查记录"
              placeholder="记录使用的工具、结果和你的解释。这里是自查记录，不会冒充自动判题。"
              value={record.evidence}
              disabled={saving}
              onChange={(e) =>
                setRecords((r) => ({
                  ...r,
                  [selected]: {
                    ...record,
                    evidence: e.target.value,
                    confirmed: false,
                  },
                }))
              }
              onBlur={() => saveChapter(record)}
            />
            {practicePassed && (
              <p className="chapter-pass">本章对应的网页练习已通过检查。</p>
            )}
            {active.lessonIds.length > 0 && (
              <button
                className="chapter-optional"
                onClick={() => onPractice(active.lessonIds[0])}
              >
                可选：粘贴SQL到网页复核 <ArrowRight size={13} />
              </button>
            )}
            <button
              className="primary chapter-complete"
              disabled={saving || !canConfirm || record.confirmed}
              onClick={() => saveChapter({ ...record, confirmed: true })}
            >
              {record.confirmed ? "本章已由你确认完成" : "确认本章完成"}
            </button>
            <small>
              需要已阅读＋练习通过（网页检查或有说明的外部自查），最后由你确认。修改记录会重新等待确认。
            </small>
          </section>
        </div>
        <section className="sql-tools">
          <h3>SQL、数据库和工具，不是同一个东西</h3>
          <div>
            <article>
              <h4>SQL是什么？</h4>
              <p>
                一种查询和处理数据的语言。先学通用查询思路，再适应不同数据库的函数和语法差异。
              </p>
            </article>
            <article>
              <h4>学习组合：PostgreSQL + DBeaver</h4>
              <p>
                PostgreSQL负责存储数据和执行查询；DBeaver
                Community是免费开源客户端，用来连接数据库、写SQL和查看结果。
              </p>
              <a href="https://dbeaver.io/" target="_blank" rel="noreferrer">
                DBeaver官网 ↗
              </a>
              <a
                href="https://www.postgresql.org/download/windows/"
                target="_blank"
                rel="noreferrer"
              >
                PostgreSQL下载 ↗
              </a>
            </article>
            <article>
              <h4>其他选择</h4>
              <p>
                当前课程统一使用PostgreSQL与DBeaver。DataGrip和DuckDB作为可选工具了解即可，无需同时安装。
              </p>
              <a
                href="https://www.jetbrains.com/datagrip/"
                target="_blank"
                rel="noreferrer"
              >
                DataGrip ↗
              </a>
              <a href="https://duckdb.org/" target="_blank" rel="noreferrer">
                DuckDB ↗
              </a>
            </article>
          </div>
          <p className="tools-note">
            这里只提供工具路线和官网入口，尚未安装或替你接受软件许可。
          </p>
        </section>
      </div>
    </main>
  );
}
