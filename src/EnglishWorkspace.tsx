import React, { useEffect, useRef, useState } from "react";
import { CanvasPanel } from "./CanvasPanel";
import {
  BookOpen,
  CalendarDays,
  Check,
  Plus,
  Upload,
  Download,
  Play,
} from "lucide-react";
import {
  englishSchema,
  parseTranscript,
  type EnglishState,
  type Material,
} from "../shared/english";
import {
  localDate,
  periodComplete,
  type Plan,
  type Task,
  type Operation,
} from "../shared/domain";
import "./sql-overview.css";
import "./english.css";
type Api = (path: string, body?: unknown, method?: string) => Promise<any>;
const englishModules = [
  {
    id: "listening",
    title: "课堂听力与阅读",
    intro:
      "用课堂原音与文字稿理解内容，标记没听懂的片段，复听后用自己的话概括。",
    task: "精听一个课堂片段",
    minutes: 30,
  },
  {
    id: "speaking",
    title: "口语表达",
    intro:
      "在 Codex 语音对话中练习。网页保存目标与完成情况，不自动读取其他对话。",
    task: "完成一次口语练习",
    minutes: 20,
  },
  {
    id: "vocabulary",
    title: "词汇与表达",
    intro:
      "在你的背词 APP 中学习；课堂词汇可整理导出。学习量与用时按个人情况调整。",
    task: "完成今日背词 APP 任务",
    minutes: 40,
  },
  {
    id: "writing",
    title: "写作与复述",
    intro: "用英语写一段课堂摘要或复述，再将不自然的表达整理进复习记录。",
    task: "完成一段课堂英文摘要",
    minutes: 20,
  },
];
function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function EnglishWorkspace({
  api,
  plan,
  command,
  onEdit,
  area = "english",
  onNavigate,
  onCalendar,
}: {
  area?: "english" | "course";
  onCalendar: (date:string,time?:string)=>void;
  onNavigate: (area: "english" | "course") => void;
  api: Api;
  plan: Plan;
  command: (ops: Operation[]) => Promise<boolean>;
  onEdit: (task: Task) => void;
}) {
  const isCourse = area === "course";
  const modules = isCourse
    ? [
        {
          id: "course",
          title: "课程材料与笔记",
          intro:
            "按课程保存课堂原音、文字稿与笔记；需要练英语时，可把片段中的表达提取到英语词汇本。",
          task: "整理一节课的笔记",
          minutes: 30,
        },
        {
          id: "review",
          title: "预习与复习",
          intro: "围绕本周教学内容整理疑问和知识点，阶段性复习。",
          task: "完成本周课程复习",
          minutes: 45,
        },
        {
          id: "assignment",
          title: "作业与考试",
          intro: "记录老师要求、截止日期及准备事项；确认后再安排进日历。",
          task: "完成课程作业",
          minutes: 60,
        },
      ]
    : englishModules;
  const [state, setState] = useState<EnglishState | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(isCourse ? "course" : "listening"),
    [tab, setTab] = useState(isCourse ? "canvas" : "overview"),
    [material, setMaterial] = useState<Material | null>(null);
  const [title, setTitle] = useState(""),
    [course, setCourse] = useState(""),
    [transcript, setTranscript] = useState(""),
    [audioFile, setAudioFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<any[]>([]),
    [extractText, setExtractText] = useState("");
  const [taskTitle, setTaskTitle] = useState(modules[0].task),
    [minutes, setMinutes] = useState(30),
    [mode, setMode] = useState("timed"),
    [cadence, setCadence] = useState("once"),
    [due, setDue] = useState("");
  const player = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    api("/english")
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);
  async function save(next: EnglishState) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api("/english", next, "PUT");
      setState(saved);
      setNotice("已保存到工作台");
      return true;
    } catch (e: any) {
      setError(e.message + "；当前输入仍保留");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function addMaterial() {
    if (!state || !title.trim()) {
      setError("请填写材料名称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let audioId: string | undefined;
      if (audioFile) {
        const token = (await api("/session")).token;
        const extension = audioFile.name.split(".").pop()?.toLowerCase();
        const mime = (
          {
            mp3: "audio/mpeg",
            m4a: "audio/mp4",
            wav: "audio/wav",
            ogg: "audio/ogg",
            webm: "audio/webm",
          } as any
        )[extension || ""];
        if (!mime) throw Error("录音支持 MP3、M4A、WAV、OGG、WebM");
        setNotice("正在保存录音，请保持页面打开…");
        const response = await fetch("/api/english/audio", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-planner-token": token,
            "x-audio-type": mime,
          },
          body: audioFile,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "录音保存失败");
        audioId = result.id;
      }
      const m: Material = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
              (
                +c ^
                (crypto.getRandomValues(new Uint8Array(1))[0] &
                  (15 >> (+c / 4)))
              ).toString(16),
            ),
        title: title.trim(),
        course,
        audioId,
        segments: parseTranscript(transcript),
      };
      if (await save({ ...state, materials: [...state.materials, m] })) {
        setMaterial(m);
        setTitle("");
        setCourse("");
        setTranscript("");
        setAudioFile(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!state)
    return (
      <main className="sql-overview">
        <p>{error || "正在读取学习记录…"}</p>
      </main>
    );
  const tasks = plan.tasks.filter((t) => t.learningArea === area),
    current = modules.find((m) => m.id === selected)!;
  const learningPlan = isCourse ? state.coursePlan : state;
  const updatePlan = (
    patch: Partial<{ goal: string; weeklyHours: number; finish: string }>,
  ) =>
    setState(
      isCourse
        ? { ...state, coursePlan: { ...state.coursePlan, ...patch } }
        : { ...state, ...patch },
    );
  return (
    <main className="sql-overview english-workspace">
      <header className="sql-header">
        <h1>{isCourse ? "课程学习" : "英语学习"}</h1>
        <nav className="sql-page-tabs">
          {isCourse && <button className={tab === "canvas" ? "active" : ""} onClick={() => setTab("canvas")}>Canvas 课程</button>}
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            总览与目录
          </button>
          {isCourse && (
            <button
              className={tab === "materials" ? "active" : ""}
              onClick={() =>
                isCourse ? setTab("materials") : onNavigate("course")
              }
            >
              录音与个人材料
            </button>
          )}
          {!isCourse && (
            <button
              className={tab === "words" ? "active" : ""}
              onClick={() => setTab("words")}
            >
              词汇导出
            </button>
          )}
        </nav>
        <span className="sql-engine">
          {isCourse ? "课程、作业与考试 · 独立计划" : "英语提升 · 独立学习计划"}
        </span>
      </header>
      <div className="overview-scroll">
        {isCourse && tab === "canvas" && <CanvasPanel api={api} plan={plan} command={command} onEdit={onEdit} onCalendar={onCalendar} />}
        {(error || notice) && (
          <p
            className={error ? "english-error" : "english-notice"}
            role="status"
          >
            {error || notice}
          </p>
        )}
        {tab === "overview" && (
          <>
            <section className="overview-intro">
              <div>
                <span className="overview-kicker">YOUR LEARNING ROADMAP</span>
                <h2>
                  {isCourse
                    ? "把每门课的学习与进度放在一起"
                    : "持续提升听说读写"}
                </h2>
                <p>
                  {isCourse ? "按课程管理录音、文字稿、预习复习与作业，独立记录课程目标和任务。" : "听说读写共同推进。背词在原来的 APP 中完成，口语在 Codex 语音中练习；这里管理英语计划与记录。"}
                </p>
              </div>
              <div className="overview-progress">
                <b>
                  {tasks.filter((t) => periodComplete(t)).length}
                  <small> / {tasks.length}</small>
                </b>
                <span>当前周期已确认的任务</span>
              </div>
            </section>
            <section className="sql-plan">
              <h3>
                <CalendarDays size={18} /> 安排学习节奏
              </h3>
              <div className="english-form-grid">
                <label>
                  阶段目标
                  <textarea
                    value={learningPlan.goal}
                    onChange={(e) => updatePlan({ goal: e.target.value })}
                  />
                </label>
                <label>
                  {isCourse ? "每周课程学习（小时）" : "每周时段学习（小时，不含灵活背词）"}
                  <input
                    type="number"
                    min="0"
                    max={isCourse ? 80 : 50}
                    step="0.5"
                    value={learningPlan.weeklyHours}
                    onChange={(e) =>
                      updatePlan({ weeklyHours: Number(e.target.value) })
                    }
                  />
                  <small>0表示暂未设定；三个学习方向独立安排。</small>
                </label>
                <label>
                  阶段复盘日期
                  <input
                    type="date"
                    value={learningPlan.finish}
                    onChange={(e) => updatePlan({ finish: e.target.value })}
                  />
                </label>
              </div>
              <button
                className="primary"
                disabled={busy}
                onClick={() => save(state)}
              >
                {isCourse ? "保存课程目标" : "保存英语目标"}
              </button>
            </section>
            <section className="english-columns">
              <aside className="english-card">
                <h3>完整学习目录</h3>
                {modules.map((m, i) => (
                  <button
                    className={
                      selected === m.id
                        ? "english-module active"
                        : "english-module"
                    }
                    key={m.id}
                    onClick={() => {
                      setSelected(m.id);
                      setTaskTitle(m.task);
                      setMinutes(m.minutes);
                      setMode(m.id === "vocabulary" ? "flexible" : "timed");
                      setCadence(m.id === "vocabulary" ? "daily" : "once");
                    }}
                  >
                    <span>0{i + 1}</span>
                    <strong>{m.title}</strong>
                  </button>
                ))}
              </aside>
              <section className="english-card">
                <h2>{current.title}</h2>
                <p>{current.intro}</p>
                {selected === "speaking" && (
                  <>
                    <textarea
                      aria-label="口语练习提示"
                      readOnly
                      value="请和我练习英语口语。我目前当前水平。先让我完整回答，再纠正最影响表达的两三个问题，给出自然说法；围绕日常生活或课堂主题，每次问一个问题。最后总结本次需要复习的表达。"
                    />
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            "请和我练习英语口语。我目前当前水平。先让我完整回答，再纠正两三个主要问题，给出自然说法。每次问一个问题，最后总结复习表达。",
                          );
                          setNotice("已复制，粘贴到你的 Codex 语音对话即可");
                        } catch {
                          setError("无法复制，请手动复制上方提示");
                        }
                      }}
                    >
                      复制练习提示
                    </button>
                  </>
                )}
                {(selected === "listening" || selected === "course") && (
                  <button
                    onClick={() =>
                      isCourse ? setTab("materials") : onNavigate("course")
                    }
                  >
                    <BookOpen size={16} />
                    打开课堂材料
                  </button>
                )}
                <h3>添加学习任务</h3>
                <div className="english-form-grid">
                  <label>
                    任务名称
                    <input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    参考分钟
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    安排方式
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option value="timed">时段任务 · 先进入待安排清单</option>
                      <option value="flexible">灵活任务 · 不占日历</option>
                    </select>
                  </label>
                  {mode === "flexible" && (
                    <label>
                      目标周期
                      <select
                        value={cadence}
                        onChange={(e) => setCadence(e.target.value)}
                      >
                        <option value="once">一次</option>
                        <option value="daily">每日</option>
                        <option value="weekly">每周</option>
                      </select>
                    </label>
                  )}
                  <label>
                    截止日期（可留空）
                    <input
                      type="date"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  className="primary"
                  disabled={busy || !taskTitle.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const id =
                        "english-" +
                        Date.now() +
                        "-" +
                        Math.random().toString(36).slice(2);
                      if (
                        await command([
                          {
                            type: "task",
                            value: {
                              id,
                              title: taskTitle,
                              learningArea: area,
                              arrangement: mode,
                              cadence: mode === "flexible" ? cadence : "once",
                              startsOn: localDate(),
                              duration: minutes,
                              notes: current.intro,
                              dueDate: due,
                            },
                          },
                        ])
                      )
                        setNotice("已加入任务总表，尚未改动日历");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Plus size={16} />
                  确认加入清单
                </button>
              </section>
            </section>
            <section className="english-card">
              <h3>{isCourse ? "课程任务总表" : "英语任务总表"}</h3>
              <p>灵活任务按每日或每周独立确认；过期不自动移到明天。</p>
              {!tasks.length && (
                <p className="muted">还没有任务，从上方目录添加。</p>
              )}
              {tasks.map((t) => (
                <div className="english-task" key={t.id}>
                  <button
                    aria-label={"确认完成：" + t.title}
                    disabled={periodComplete(t)}
                    onClick={() => command([{ type: "complete", id: t.id }])}
                  >
                    {periodComplete(t) ? <Check size={17} /> : "○"}
                  </button>
                  <button onClick={() => onEdit(t)}>{t.title}</button>
                  <small>
                    {t.arrangement === "flexible"
                      ? `灵活 · ${t.cadence === "daily" ? "每日" : t.cadence === "weekly" ? "每周" : "一次"}`
                      : "时段任务"}{" "}
                    · {t.duration}分钟{t.dueDate ? " · 截止 " + t.dueDate : ""}
                  </small>
                </div>
              ))}
            </section>
          </>
        )}
        {tab === "materials" && (
          <>
            <section className="overview-intro">
              <div>
                <h2>课堂原音与文字稿</h2>
                <p>
                  上传到工作台电脑保存。带时间戳的 SRT / VTT 或 [00:12:30]
                  文字可定位原音；纯文字保留内容，并可手动标定起点。
                </p>
              </div>
            </section>
            <section className="english-card">
              <h3>
                <Upload size={18} />
                添加材料
              </h3>
              <div className="english-form-grid">
                <label>
                  材料名称
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  关联课程（可选）
                  <input
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                  />
                </label>
                <label>
                  课堂录音（最大512MB）
                  <input
                    type="file"
                    accept=".mp3,.m4a,.wav,.ogg,.webm"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                  />
                </label>
                <label>
                  导入文字稿
                  <input
                    type="file"
                    accept=".txt,.srt,.vtt"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 2 * 1024 * 1024) {
                          setError("文字稿需小于2MB");
                          return;
                        }
                        setTranscript(await file.text());
                      }
                    }}
                  />
                </label>
              </div>
              <label>
                文字稿（也可粘贴）
                <textarea
                  rows={6}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                />
              </label>
              <p className="muted">
                本版使用你提供的文字稿；未自动转写或自动对齐无时间戳文字。音频与文字须来自同一节课。
              </p>
              <button className="primary" disabled={busy} onClick={addMaterial}>
                {busy ? "保存中…" : "保存材料"}
              </button>
            </section>
            <div className="english-columns">
              <aside className="english-card">
                <h3>材料目录 · {state.materials.length}</h3>
                {state.materials.map((m) => (
                  <button
                    className="english-module"
                    key={m.id}
                    onClick={() => {
                      setMaterial(m);
                      setDraft([]);
                      setExtractText("");
                    }}
                  >
                    {m.title}
                    <small>{m.course}</small>
                  </button>
                ))}
              </aside>
              <section className="english-card">
                {material ? (
                  <>
                    <h2>{material.title}</h2>
                    {material.audioId ? (
                      <audio
                        ref={player}
                        controls
                        preload="metadata"
                        src={"/api/english/audio/" + material.audioId}
                      />
                    ) : (
                      <p>这份材料未附录音。</p>
                    )}
                    <p>
                      点击播放按钮回听；无时间戳的段落可填写开始秒数，或先播放到对应位置再标定。
                    </p>
                    <div className="transcript-lines">
                      {material.segments.map((line, i) => (
                        <div className="transcript-line" key={i}>
                          <button
                            aria-label={"播放第" + (i + 1) + "段"}
                            disabled={line.start === null || !material.audioId}
                            onClick={() => {
                              if (player.current && line.start !== null) {
                                player.current.currentTime = line.start;
                                void player.current
                                  .play()
                                  .catch(() =>
                                    setError("录音无法播放，请检查文件格式"),
                                  );
                              }
                            }}
                          >
                            <Play size={14} />
                            {line.start === null
                              ? "待定位"
                              : Math.floor(line.start / 60) +
                                ":" +
                                String(Math.floor(line.start % 60)).padStart(
                                  2,
                                  "0",
                                )}
                          </button>
                          <textarea
                            aria-label={"第" + (i + 1) + "段文字"}
                            value={line.text}
                            onChange={(e) =>
                              setMaterial({
                                ...material,
                                segments: material.segments.map((s, j) =>
                                  j === i ? { ...s, text: e.target.value } : s,
                                ),
                              })
                            }
                          />
                          <input
                            aria-label={"第" + (i + 1) + "段开始秒数"}
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="秒"
                            value={line.start ?? ""}
                            onChange={(e) =>
                              setMaterial({
                                ...material,
                                segments: material.segments.map((s, j) =>
                                  j === i
                                    ? {
                                        ...s,
                                        start:
                                          e.target.value === ""
                                            ? null
                                            : Number(e.target.value),
                                      }
                                    : s,
                                ),
                              })
                            }
                          />
                          <button
                            disabled={!material.audioId}
                            onClick={() =>
                              setMaterial({
                                ...material,
                                segments: material.segments.map((s, j) =>
                                  j === i
                                    ? {
                                        ...s,
                                        start: player.current?.currentTime || 0,
                                      }
                                    : s,
                                ),
                              })
                            }
                          >
                            标定
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      disabled={busy}
                      className="primary"
                      onClick={() =>
                        save({
                          ...state,
                          materials: state.materials.map((m) =>
                            m.id === material.id ? material : m,
                          ),
                        })
                      }
                    >
                      保存文字与定位
                    </button>
                    <h3>提取到英语词汇本</h3>
                    <p>
                      选择要练习的片段粘贴在下方，最多2万字符。发送到你配置的模型，先预览再采用。
                    </p>
                    <textarea
                      rows={4}
                      value={extractText}
                      onChange={(e) => setExtractText(e.target.value)}
                      placeholder="粘贴本次片段…"
                    />
                    <button
                      disabled={busy || !extractText.trim()}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          setDraft(
                            (
                              await api("/english/extract", {
                                text: extractText,
                              })
                            ).items,
                          );
                        } catch (e: any) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      生成可编辑词汇草稿
                    </button>
                    {draft.map((w, i) => (
                      <div className="english-word" key={i}>
                        <input
                          aria-label={"词汇" + (i + 1)}
                          value={w.word}
                          onChange={(e) =>
                            setDraft(
                              draft.map((x, j) =>
                                j === i ? { ...x, word: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <input
                          aria-label={"释义" + (i + 1)}
                          value={w.meaning}
                          onChange={(e) =>
                            setDraft(
                              draft.map((x, j) =>
                                j === i ? { ...x, meaning: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <button
                          onClick={() =>
                            setDraft(draft.filter((_, j) => j !== i))
                          }
                        >
                          移除
                        </button>
                        <p>{w.example}</p>
                      </div>
                    ))}
                    {!!draft.length && (
                      <button
                        disabled={busy}
                        className="primary"
                        onClick={async () => {
                          if (
                            await save({
                              ...state,
                              vocabulary: [
                                ...state.vocabulary,
                                ...draft.map((w) => ({
                                  ...w,
                                  source: material.title,
                                })),
                              ],
                            })
                          )
                            setDraft([]);
                        }}
                      >
                        确认采用词汇
                      </button>
                    )}
                  </>
                ) : (
                  <p>从左侧选择一份课堂材料。</p>
                )}
              </section>
            </div>
          </>
        )}
        {tab === "words" && (
          <section className="english-card">
            <h2>课堂词汇本</h2>
            <p>
              先导出通用词表。你之前的 APP 导入模板尚未找到，专用格式待核验。
            </p>
            <button
              onClick={() =>
                download(
                  "课堂单词.txt",
                  [...new Set(state.vocabulary.map((w) => w.word))].join("\n"),
                )
              }
            >
              <Download size={16} />
              纯单词 TXT
            </button>
            <button
              onClick={() =>
                download(
                  "课堂词汇.csv",
                  [
                    ["单词", "释义", "原句", "来源"],
                    ...state.vocabulary.map((w) => [
                      w.word,
                      w.meaning,
                      w.example,
                      w.source,
                    ]),
                  ]
                    .map((row) =>
                      row
                        .map((v) => '"' + v.replace(/"/g, '""') + '"')
                        .join(","),
                    )
                    .join("\r\n"),
                  "text/csv",
                )
              }
            >
              导出完整 CSV
            </button>
            {state.vocabulary.map((w, i) => (
              <div className="english-word" key={i}>
                <strong>{w.word}</strong>
                <span>{w.meaning}</span>
                <p>{w.example}</p>
                <small>{w.source}</small>
              </div>
            ))}
            {!state.vocabulary.length && (
              <p>还没有采用的词汇，可先从课堂材料提取。</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
