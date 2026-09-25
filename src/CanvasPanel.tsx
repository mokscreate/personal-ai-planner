import { CanvasMaterials } from "./CanvasMaterials";
import React, { useEffect, useRef, useState } from "react";
import type { Operation, Plan } from "../shared/domain";
export type Assignment = { id: number; title: string; due: string | null; url: string; submitted: boolean; description?: string; submissionTypes?: string[]; points?: number };
export type Course = { id: number; name: string; code: string; url: string; assignments: Assignment[]; modules?: {id:number; title:string; count:number}[]; modulesError?:string };
export type Snapshot = { connected: boolean; syncedAt: string; courses: Course[] };
export function canvasDeadline(due: string | null) {
  if (!due) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(due));
  const value = (key: string) => parts.find(p => p.type === key)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}
export function assignmentName(title: string) {
  return title.replace(/TBP Project \(TBP Evaluation\) Part A - Seminar/g, "整体建筑性能评估 · A部分研讨展示")
    .replace(/Individual Reflection/g,"个人反思").replace(/Interim Submission/g,"阶段提交")
    .replace(/Group Project Final Report/g,"小组项目最终报告").replace(/Individual Essay/g,"个人论文")
    .replace(/Individual Assignment/g,"个人作业").replace(/Group Project \(Final Presentation\)/g,"小组项目最终展示")
    .replace(/Group Project \(Report\)/g,"小组项目报告").replace(/In-Class Quiz/g,"课堂测验")
    .replace(/Week (\d+) Minute Paper/g,"第$1周课堂简答");
}
export function requirementText(html = "") {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe").forEach(n => n.remove());
  doc.querySelectorAll("p,li,tr,br").forEach(n => n.append("\n"));
  return (doc.body.textContent || "").replace(/\n[ \t]*\n+/g,"\n\n").trim();
}
function guide(a: Assignment, c: Course) {
  const text = a.description || "";
  if (text.includes("total building performance") && text.includes("1500")) return "小组选择已建成建筑，评估整体建筑性能并提出改进建议。交付：30分钟展示＋10分钟问答、PPT、最多1500词执行摘要，以及每位成员的贡献说明。";
  if (a.title.includes("Individual Reflection") && c.assignments.some(x => (x.description || "").includes("400 words"))) return "关联的 TBP 项目说明要求：约400词个人反思，只选一个最重要的学习收获，解释选择原因和后续实践。此作业页本身没有说明，提交要求请同时核对关联项目。";
  if (text.includes("Exploratory Data Analysis") && text.includes("one to three pages")) return "交三部分：①幻灯片，介绍问题、可用数据、探索性分析与拟用方法；②1–3页论文式说明，包含摘要、引言、相关工作和方法；③代码。老师要求理解并核对自己的内容。";
  if (!text.trim()) return "Canvas 没有填写作业说明。请查看关联项目、课程附件或老师通知，不能仅凭标题确定具体要求。";
  return "点击作业名称查看老师的完整要求，再通过“查看官网及附件”核对附件与评分细则。中文名称为辅助翻译。";
}
export function CanvasPanel({ api, plan, command, onEdit, onCalendar }: { onEdit:(task:Plan["tasks"][number])=>void; onCalendar:(date:string,time?:string)=>void; api: (path: string, body?: unknown, method?: string) => Promise<any>; plan: Plan; command: (ops: Operation[]) => Promise<boolean> }) {
  const [data, setData] = useState<Snapshot | null>(null), [key, setKey] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<{a:Assignment;c:Course}|null>(null);
  const [selected, setSelected] = useState(() => localStorage.getItem("canvas-selected-course") || ""), [history, setHistory] = useState(false);
  const [section,setSection] = useState("assignments");
  const activeCourse = selected && data?.courses.some(c=>String(c.id)===selected) ? selected : String(data?.courses[0]?.id || "");
  useEffect(()=>{if(activeCourse)localStorage.setItem("canvas-selected-course",activeCourse);},[activeCourse]);
  const [draft, setDraft] = useState<{ id: string; title: string; date: string; time: string; url: string } | null>(null);
  useEffect(() => { if (draft) document.querySelector(".canvas-task-draft")?.scrollIntoView({block:"center", behavior:"smooth"}); }, [draft?.id]);
  const inFlight = useRef(false);
  async function refresh(force = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { const current = await api("/canvas"); setData(current); if (current.connected) setData(await api("/canvas/sync", { force })); }
    catch (e: any) { setError(e.message); } finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => {
    void refresh();
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", wake); document.addEventListener("visibilitychange", wake);
    return () => { window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); };
  }, []);
  async function connect() {
    setBusy(true); setError("");
    try { setData(await api("/canvas/connection", { token: key }, "PUT")); setKey(""); setNotice("已连接，课程与作业已读取；尚未加入个人日程。"); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="english-card">
    <h2>我的课程与作业</h2>
    <p>先看要交什么，再安排什么时候做。作业截止前1小时已显示在日历对应时段，可另行安排准备任务。</p>
    <details open={!data?.connected}><summary>{data?.connected ? "更新接入令牌" : "连接课程账号"}</summary>
      <label>Canvas Access Token<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} /></label>
      <p>令牌加密保存在本机，不包含在导出备份中；到期后在这里更换。</p>
      <button className="primary" disabled={busy || !key.trim()} onClick={connect}>连接并读取</button>
    </details>
    {error && <p role="alert" className="english-error">{error}。已有缓存仍保留。</p>}
    {notice && <p role="status">{notice}</p>}
    {detail && section==="assignments" && <section className="canvas-detail english-card" role="region" aria-label="作业详情">
      <button onClick={() => setDetail(null)}>关闭详情</button><p>{detail.c.code}</p>
      <h2>{assignmentName(detail.a.title)}</h2><small>{detail.a.title}（Canvas 原名）</small>
      <h3>这项作业要做什么</h3><p>{guide(detail.a, detail.c)}</p>
      {detail.a.title.includes("TKW") && <p>TKW 是原标题中的缩写，当前资料未确认全称，暂保留原文。</p>}
      <p>截止：{detail.a.due ? Object.values(canvasDeadline(detail.a.due)).join(" ") : "未设置"}（UTC+8）</p>
      <p>提交方式：{detail.a.submissionTypes?.includes("online_upload") ? "在 Canvas 上传文件" : "请以官网要求为准"} · 满分：{detail.a.points ?? "未提供"}分（不是成绩占比）</p>
      <details><summary>展开老师要求原文</summary><div style={{whiteSpace:"pre-wrap"}}>{requirementText(detail.a.description) || "作业页未提供正文"}</div></details>
      <a href={detail.a.url} target="_blank" rel="noreferrer">查看官网及附件 ↗</a>
    </section>}
    {data?.connected && <>
      <p>上次成功同步：{data.syncedAt ? new Date(data.syncedAt).toLocaleString("zh-CN") : "尚未同步"} <button disabled={busy} onClick={() => refresh(true)}>{busy ? "正在同步…" : "立即同步"}</button></p>
      <nav className="canvas-course-tabs" aria-label="选择课程">{data.courses.map(c=><button key={c.id} aria-pressed={String(c.id)===activeCourse} className={String(c.id)===activeCourse?"active":""} onClick={()=>{setSelected(String(c.id));setDetail(null);setDraft(null);}}>{c.code}</button>)}</nav>
      <nav className="canvas-section-tabs" aria-label="课程内容"><button className={section==="assignments"?"active":""} onClick={()=>setSection("assignments")}>作业与日历</button><button className={section==="materials"?"active":""} onClick={()=>setSection("materials")}>课堂材料与目录</button></nav>
      {section==="materials" && activeCourse && <CanvasMaterials key={activeCourse} courseId={activeCourse} api={api} />}
      {section==="assignments" && <>
      <label className="canvas-history"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} />显示已提交及已过期作业</label>
      {data.courses.filter(c => String(c.id) === activeCourse).map(c => {
        const list = c.assignments.filter(a => history || (!a.submitted && (!a.due || new Date(a.due).getTime() >= Date.now()))).sort((a,b)=>(a.due?Date.parse(a.due):Infinity)-(b.due?Date.parse(b.due):Infinity));
        return <section className="english-card canvas-course" key={c.id}><h3><a href={c.url} target="_blank" rel="noreferrer">{c.name}</a></h3>
          <a href={c.url + "/modules"} target="_blank" rel="noreferrer">在 Canvas 查看课程目录与资料</a>
          <details><summary>课程学习目录（{c.modules?.length || 0}章）</summary>{c.modulesError || (c.modules?.length ? c.modules.map(m => <p key={m.id}>{m.title} · {m.count}项材料</p>) : "Canvas 未发布目录；资料可能放在 Files 或 Pages 中。")}</details>
          {!list.length && <p>没有符合当前筛选的作业</p>}
          {list.map(a => { const id = `canvas-${c.id}-${a.id}`, existing = plan.tasks.find(t => t.id === id), due = canvasDeadline(a.due);
            return <div className="english-card" key={a.id}><button className="canvas-assignment-title" onClick={() => {setDetail({a,c}); document.querySelector(".overview-scroll")?.scrollTo({top:0});}}>{assignmentName(a.title)} →</button><small className="canvas-original">{a.title}</small><p>{guide(a,c)}</p><p>{due.date ? `截止：${due.date} ${due.time}` : "未设置截止日期"} · {a.submitted ? "Canvas 已提交" : "Canvas 未记录提交"}</p>
              {due.date && <button onClick={()=>onCalendar(due.date,due.time)}>在日历查看 DDL</button>}
              {existing && <button onClick={()=>onEdit(existing)}>安排 / 查看学习时段</button>}
              {existing && <p>{existing.dueDate !== due.date || existing.dueTime !== due.time ? "官网截止时间与清单不同，请核对后更新" : "已加入个人清单"}</p>}
              <button onClick={() => { setNotice(""); setDraft({ id, title: existing?.title || `${c.code} · ${assignmentName(a.title)}`, date: existing?.dueDate ?? due.date, time: existing?.dueTime ?? due.time, url: a.url }); }}>{existing ? "调整我的学习任务" : "安排准备任务"}</button>
              {existing && <p>已安排：{plan.blocks.filter(b=>b.taskId===id).map(b=>`${b.date} ${b.start}–${b.end}`).join("；") || "还没有学习时段"}</p>}
            </div>; })}</section>;
      })}
      </>}
    </>}
    {draft && <section className="english-card canvas-task-draft"><h3>安排这项作业的准备任务</h3>
      <label>任务名称<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>截止日期<input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
      <label>截止时间<input type="time" value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} /></label>
      <p>只加入待安排清单，保留已有完成状态与日历时段；不会向 Canvas 提交作业。</p>
      <button disabled={busy || !draft.title.trim() || (!!draft.time && !draft.date)} className="primary" onClick={async () => {
        setBusy(true);
        try { const old = plan.tasks.find(t => t.id === draft.id); if (await command([{ type: "task", value: { ...old, id: draft.id, title: draft.title.trim().slice(0, 300), learningArea: "course", dueDate: draft.date, dueTime: draft.time, notes: old?.notes || `Canvas 来源：${draft.url}` } }])) { setDraft(null); setNotice("已确认加入个人清单，可在日历安排学习时段。"); } }
        finally { setBusy(false); }
      }}>加入待安排清单</button><button onClick={() => setDraft(null)}>取消</button>
    </section>}
  </section>;
}
