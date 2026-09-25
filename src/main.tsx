import { assignmentName, canvasDeadline, requirementText, type Assignment } from "./CanvasPanel";
import { EnglishWorkspace } from "./EnglishWorkspace";
import { CanvasDeadlines, useCanvasDeadlines } from "./CanvasDeadlines";
import { DevicePanel } from "./DevicePanel";
import { SqlWorkspace } from "./SqlWorkspace";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  GraduationCap,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Undo2,
  Settings,
  PanelLeftClose,
  PanelRightClose,
  Sparkles,
  ArrowUp,
  Mic,
  Square,
  ImagePlus,
  X,
  Check,
  Clock3,
  Inbox,
  BookOpen,
  MessageCircle,
  Search,
  ArrowUpRight,
  RotateCcw,
  Trash2,
  Download,
  Upload,
  MoreHorizontal,
  GripVertical,
  FolderPlus,
} from "lucide-react";
import {
  periodComplete,
  addDays,
  occurrences,
  eventSchema,
  localDate,
  mins,
  clock,
  slots,
  isDue,
  activeTaskIds,
  applyOperations,
  type Plan,
  type Slot,
  type Task,
  type Operation,
} from "../shared/domain";
import "./style.css";
import "./theme.css";
let session = "";
async function api(
  path: string,
  body?: unknown,
  method?: string,
  retry = true,
) {
  const res = await fetch("/api" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", "x-planner-token": session },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json();
  if (res.status === 401 && path !== "/pair") location.assign("/connect");
  if (res.status === 403 && j.code === "SESSION_EXPIRED" && retry) {
    session = (await api("/session", undefined, undefined, false)).token;
    return api(path, body, method, false);
  }
  if (!res.ok) throw Error(j.error || "请求失败");
  return j;
}
const uuid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("");
const labels: Record<string, string> = {
  title: "名称",
  date: "日期",
  start: "开始",
  end: "结束",
  dueDate: "截止日期",
  dueTime: "截止时间（可留空）",
  duration: "预计分钟",
  notes: "备注 / 待补充信息",
  progress: "已完成进度",
  until: "学期结束日期",
  repeat: "每周重复",
  at: "跟进时间",
  context: "下次需要讨论什么",
  projectId: "所属项目",
  taskId: "关联任务",
  id: "ID",
};
const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function fieldDate(d: string) {
  return d ? d.replace("T", " ").slice(0, 16) : "";
}
function localInput(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return localDate(d) + "T" + clock(d.getHours() * 60 + d.getMinutes());
}
type Data = {
  plan: Plan;
  messages: any[];
  drafts: any[];
  configs: any;
  composer: { text: string; images: string[] };
  dataDir: string;
  cloud?: boolean;
  syncRevision: string;
};
function App() {
  const [canvasDetail, setCanvasDetail] = useState<(Assignment & {course:string}) | null>(null);
  const [data, setData] = useState<Data | null>(null),
    [start, setStart] = useState(localDate()),
    [now, setNow] = useState(new Date()),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [left, setLeft] = useState(() => window.innerWidth >= 1100),
    [right, setRight] = useState(false),
    [panel, setPanel] = useState("ai"),
    [view, setView] = useState("calendar"),
    [filter, setFilter] = useState("todo"),
    [query, setQuery] = useState(""),
    [project, setProject] = useState(""),
    [editor, setEditor] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [images, setImages] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [zoom, setZoom] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [drag, setDrag] = useState<any>(null),
    [recording, setRecording] = useState(false),
    [transcribing, setTranscribing] = useState(false),
    [projectName, setProjectName] = useState("");
  const canvasDeadlines = useCanvasDeadlines(api, ready);
  useEffect(() => {
    if (right && panel === "detail" && editor) {
      const input = document.querySelector<HTMLInputElement>('.detail-scroll input[data-field="title"]');
      input?.focus({preventScroll:true});
    }
  }, [editor?.value?.id, right, panel]);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 600);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 600px)");
    const change = () => {
      setIsMobile(query.matches);
      setDrag(null);
      setPreview(null);
      if (query.matches) {
        setLeft(false);
        setRight(false);
      }
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const [hourHeight, setHourHeight] = useState(() => {
    try {
      const n = Number(localStorage.getItem("calendar-hour-height"));
      return n >= 32 && n <= 112 ? n : 48;
    } catch {
      return 48;
    }
  });
  const heightRef = useRef(hourHeight);
  function resizeHours(next: number, pointerY?: number) {
    const el = calendar.current;
    const old = heightRef.current;
    const value = Math.max(32, Math.min(112, next));
    if (value === old) return;
    const y = el
      ? pointerY === undefined
        ? el.clientHeight / 2
        : pointerY - el.getBoundingClientRect().top
      : 0;
    const time = el ? (el.scrollTop + y - 12) / old : 0;
    heightRef.current = value;
    setHourHeight(value);
    try {
      localStorage.setItem("calendar-hour-height", String(value));
    } catch {}
    requestAnimationFrame(() => {
      if (el) el.scrollTop = Math.max(0, time * value + 12 - y);
    });
  }
  useEffect(() => {
    const el = calendar.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY)
        resizeHours(heightRef.current + (e.deltaY < 0 ? 8 : -8), e.clientY);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [ready]);
  const calendar = useRef<HTMLDivElement>(null),
    cols = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLInputElement>(null),
    messagesEnd = useRef<HTMLDivElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    recordTimer = useRef<any>(null),
    cancelRecord = useRef(false),
    edgeTime = useRef(0),
    verticalEdgeTime = useRef(0),
    pointerGesture = useRef({ x: 0, y: 0, moved: false }),
    suppressBlockClickUntil = useRef(0),
    lastWheel = useRef(0),
    composerSeq = useRef(Promise.resolve());
  async function refresh() {
    const s = await api("/state");
    setData((previous) =>
      previous && previous.plan.version > s.plan.version ? previous : s,
    );
    return s;
  }
  useEffect(() => {
    (async () => {
      try {
        session = (await api("/session")).token;
        const s = await refresh();
        setText(s.composer.text);
        setImages(s.composer.images);
        setReady(true);
      } catch (e: any) {
        setError(e.message);
      }
    })();
    const timer = setInterval(() => setNow(new Date()), 30000);
    let syncing = false;
    let lastSync = 0;
    const focus = async () => {
      if (document.hidden || syncing || Date.now() - lastSync < 1000) return;
      syncing = true;
      lastSync = Date.now();
      setNow(new Date());
      try {
        session = (await api("/session")).token;
        await refresh();
      } catch (e: any) {
        setError("同步失败，当前编辑内容保留，请恢复网络后重试：" + e.message);
      } finally {
        syncing = false;
      }
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    window.addEventListener("pageshow", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      window.removeEventListener("pageshow", focus);
      document.removeEventListener("visibilitychange", focus);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      composerSeq.current = composerSeq.current
        .catch(() => {})
        .then(() => api("/composer", { text, images }, "PUT"))
        .then(() => {})
        .catch((e) => setError("输入保存失败：" + e.message));
    }, 350);
    return () => clearTimeout(timer);
  }, [text, images, ready]);
  useEffect(() => {
    const container = messagesEnd.current?.parentElement;
    if (container)
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [data?.messages.length, busy]);
  async function action(fn: () => Promise<any>, msg = "已保存") {
    setError("");
    setPending(true);
    try {
      await fn();
      await refresh();
      if (msg) {
        setNotice(msg);
        setTimeout(() => setNotice(""), 2800);
      }
      return true;
    } catch (e: any) {
      setError(e.message);
      await refresh().catch(() => {});
      return false;
    } finally {
      setPending(false);
    }
  }
  async function command(operations: Operation[]) {
    if (!data) return false;
    return action(() =>
      api("/command", { version: data.plan.version, key: uuid(), operations }),
    );
  }
  function openNew(kind = "task", date = "", time = "", endTime = "") {
    setEditor({
      kind,
      value:
        kind === "event"
          ? {
              id: uuid(),
              title: "",
              date: date || localDate(),
              start: time || "09:00",
              end: clock(Math.min(1440, mins(time || "09:00") + 60)),
              repeat: false,
              until: "",
              notes: "",
              skip: [],
            }
          : {
              id: uuid(),
              title: "",
              projectId: project,
              notes: "",
              dueDate: "",
              dueTime: "",
              duration: endTime && time ? mins(endTime) - mins(time) : 30,
              status: "todo",
              progress: "",
            },
      date,
      start: time,
      end: endTime || (time ? clock(Math.min(1440, mins(time) + 30)) : ""),
      scope: "once",
    });
    if (isMobile) setLeft(false);
    setRight(true);
    setPanel("detail");
  }
  function editTask(t: Task, slot?: Slot) {
    setEditor({
      kind: "task",
      value: { ...t },
      block: slot ? data?.plan.blocks.find((b) => b.id === slot.id) : null,
      date: slot?.date || "",
      start: slot?.start || "",
      end: slot?.end || "",
    });
    if (isMobile) setLeft(false);
    setRight(true);
    setPanel("detail");
  }
  function editSlot(s: Slot) {
    if (!data) return;
    if (s.kind === "task") {
      const t = data.plan.tasks.find((t) => t.id === s.taskId);
      if (t) editTask(t, s);
    } else {
      const e = data.plan.events.find((e) => e.id === s.id)!;
      setEditor({
        kind: "event",
        value: { ...e, date: s.date },
        original: e,
        instanceDate: s.date,
        scope: "once",
      });
      setRight(true);
      setPanel("detail");
    }
  }
  async function saveEditor() {
    if (!editor || !data || pending) return;
    if (
      editor.kind === "task" &&
      (editor.date || editor.start || editor.end) &&
      !(editor.date && editor.start && editor.end)
    ) {
      setError("请完整填写安排日期、开始及结束；暂不安排时请留空。");
      return;
    }
    let ops: Operation[] = [];
    if (editor.kind === "task") {
      ops.push({ type: "task", value: editor.value });
      if (editor.value.arrangement === "flexible") {
        for (const b of data.plan.blocks.filter(
          (b) => b.taskId === editor.value.id && b.status === "planned",
        ))
          ops.push({ type: "deleteBlock", id: b.id });
      }
      if (editor.date && editor.start && editor.end)
        ops.push({
          type: "block",
          value: {
            id: editor.block?.id || uuid(),
            taskId: editor.value.id,
            date: editor.date,
            start: editor.start,
            end: editor.end,
            status: editor.block?.status || "planned",
          },
        });
    } else if (editor.kind === "follow") {
      ops = [{ type: "followup", value: editor.value }];
    } else {
      const original = editor.original;
      if (original?.repeat) {
        if (editor.scope === "once") {
          ops.push(
            {
              type: "skipEvent",
              id: original.id,
              date: editor.instanceDate,
              scope: "once",
            },
            {
              type: "event",
              value: {
                ...editor.value,
                id: uuid(),
                repeat: false,
                until: "",
                skip: [],
              },
            },
          );
        } else {
          ops.push(
            {
              type: "skipEvent",
              id: original.id,
              date: editor.instanceDate,
              scope: "future",
            },
            {
              type: "event",
              value: {
                ...editor.value,
                id: uuid(),
                skip: original.skip.filter(
                  (d: string) => d >= editor.instanceDate,
                ),
              },
            },
          );
        }
      } else ops = [{ type: "event", value: editor.value }];
    }
    if (await command(ops)) {
      setRight(false);
      setEditor(null);
      setPanel("ai");
    }
  }
  async function send() {
    if (busy || (!text.trim() && !images.length)) return;
    setBusy(true);
    setError("");
    const sentText = text,
      sentImages = [...images];
    try {
      await api("/chat", { text: sentText, images: sentImages });
      setText((current) => (current === sentText ? "" : current));
      setImages((current) => current.filter((id) => !sentImages.includes(id)));
      await refresh();
    } catch (e: any) {
      setError(e.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files).slice(0, 4 - images.length)) {
      try {
        if (file.size > 8 * 1024 * 1024) throw Error("每张图片最多8MB");
        const buf = await file.arrayBuffer();
        let binary = "";
        new Uint8Array(buf).forEach((x) => (binary += String.fromCharCode(x)));
        const r = await api("/images", { mime: file.type, data: btoa(binary) });
        setImages((prev) => [...prev, r.id].slice(0, 4));
        setPanel("ai");
        setRight(true);
      } catch (e: any) {
        setError(e.message);
      }
    }
  }
  async function voice() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    if (!data?.configs.speech?.model) {
      setPanel("settings");
      setRight(true);
      setNotice("语音转文字需要单独配置转写服务，保存后即可使用。");
      return;
    }
    setError("");
    cancelRecord.current = false;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      );
      const rec = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        clearTimeout(recordTimer.current);
        stream.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (cancelRecord.current) return;
        setTranscribing(true);
        try {
          const blob = new Blob(chunks, { type: rec.mimeType });
          const arr = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          arr.forEach((x) => (binary += String.fromCharCode(x)));
          const r = await api("/transcribe", {
            data: btoa(binary),
            mime: blob.type,
          });
          setText((v) => v + (v ? "\n" : "") + r.text);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      setRecording(true);
      recordTimer.current = setTimeout(() => rec.stop(), 120000);
    } catch {
      setError("无法使用麦克风，请检查浏览器权限或改用文字输入");
    }
  }
  function followTask(t: Task) {
    setEditor({
      kind: "follow",
      value: {
        id: uuid(),
        taskId: t.id,
        at: new Date(Date.now() + 2 * 86400000).toISOString(),
        context: `继续安排「${t.title}」：${t.notes}`,
        status: "pending",
      },
    });
    if (isMobile) setLeft(false);
    setRight(true);
    setPanel("detail");
  }
  const plan = data?.plan;
  const allSlots = plan ? slots(plan) : [];
  const visibleDates = Array.from({ length: isMobile ? 3 : 7 }, (_, i) =>
    addDays(start, i),
  );
  const active = plan ? activeTaskIds(plan) : new Set();
  const due = plan?.blocks.filter((b) => isDue(b, now)) || [];
  const follow =
    plan?.followups.filter(
      (f) => f.status === "pending" && Date.parse(f.at) <= now.getTime(),
    ) || [];
  let list =
    plan?.tasks.filter(
      (t) =>
        (filter === "done"
          ? periodComplete(t)
          : filter === "all"
            ? true
            : !periodComplete(t) && !active.has(t.id)) &&
        (!project || t.projectId === project) &&
        (!query || t.title.includes(query) || t.notes.includes(query)),
    ) || [];
  list.sort(
    (a, b) =>
      Number(b.status === "unfinished") - Number(a.status === "unfinished") ||
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
  );
  function dragOps(d: any, date: string, startMin: number, endMin: number) {
    if (!plan) return [];
    if (d.type === "new") {
      return [
        {
          type: "block",
          value: {
            id: "preview-block",
            taskId: d.id,
            date,
            start: clock(startMin),
            end: clock(endMin),
            status: "planned",
          },
        },
      ] as Operation[];
    }
    const s = d.slot as Slot;
    if (s.kind === "task") {
      const b = plan.blocks.find((x) => x.id === s.id)!;
      return [
        {
          type: "block",
          value: { ...b, date, start: clock(startMin), end: clock(endMin) },
        },
      ];
    }
    const ev = plan.events.find((x) => x.id === s.id)!;
    if (ev.repeat)
      return [
        { type: "skipEvent", id: ev.id, date: s.date, scope: "once" },
        {
          type: "event",
          value: {
            ...ev,
            id: "preview-event",
            date,
            start: clock(startMin),
            end: clock(endMin),
            repeat: false,
            until: "",
            skip: [],
          },
        },
      ];
    return [
      {
        type: "event",
        value: { ...ev, date, start: clock(startMin), end: clock(endMin) },
      },
    ];
  }
  function scrollDragEdge(e: React.PointerEvent, box: DOMRect, grid: DOMRect) {
    const el = calendar.current;
    if (
      !el ||
      e.clientX < grid.left ||
      e.clientX > grid.right ||
      e.clientY < box.top ||
      e.clientY > box.bottom
    ) {
      verticalEdgeTime.current = 0;
      return;
    }
    const direction =
      e.clientY < box.top + 24 ? -1 : e.clientY > box.bottom - 24 ? 1 : 0;
    if (!direction) {
      verticalEdgeTime.current = 0;
      return;
    }
    const now = performance.now();
    if (!verticalEdgeTime.current) {
      verticalEdgeTime.current = now;
      return;
    }
    if (now - verticalEdgeTime.current < 40) return;
    verticalEdgeTime.current = now;
    el.scrollTop += direction * 6;
  }
  function dragAt(e: React.PointerEvent) {
    if (!drag || !cols.current || !calendar.current || !plan) return;
    const gesture = pointerGesture.current;
    if (!gesture.moved) {
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 6) return;
      gesture.moved = true;
    }
    const r = cols.current.getBoundingClientRect();
    if (drag.type === "create") {
      const box = calendar.current.getBoundingClientRect();
      const minute = Math.max(
        480,
        Math.min(
          1440,
          480 + Math.round((e.clientY - r.top) / (hourHeight / 2)) * 30,
        ),
      );
      const s = Math.min(drag.anchor, minute);
      const en = Math.min(1440, Math.max(drag.anchor + 30, minute));
      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom;
      const collision = allSlots.some(
        (x) => x.date === drag.date && s < mins(x.end) && en > mins(x.start),
      );
      const moved = Math.abs(e.clientY - drag.y) > 5;
      setPreview(
        moved
          ? {
              date: drag.date,
              start: s,
              end: en,
              valid: inside && !collision,
              why: collision ? "该时段已有安排" : "请在日历内选择时段",
            }
          : null,
      );
      scrollDragEdge(e, box, r);
      return;
    }
    let col = Math.floor(
      (e.clientX - r.left) / (r.width / visibleDates.length),
    );
    col = Math.max(0, Math.min(visibleDates.length - 1, col));
    const minute =
      Math.round(
        (((e.clientY - r.top) / hourHeight) * 60 +
          480 -
          (drag.resize ? 0 : drag.offset || 0)) /
          30,
      ) * 30;
    const s = drag.resize
      ? mins(drag.slot.start)
      : Math.max(480, Math.min(1410, minute));
    const en = drag.resize
      ? Math.min(1440, Math.max(s + 30, minute))
      : s + drag.duration;
    const date = drag.resize ? drag.slot.date : visibleDates[col];
    const ops = dragOps(drag, date, s, en);
    const box = calendar.current.getBoundingClientRect();
    const inside =
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= box.top &&
      e.clientY <= box.bottom;
    let valid = en <= 1440 && inside,
      why = inside ? "超出当天时间" : "请拖到日历内的空闲位置";
    if (valid)
      try {
        applyOperations(plan, ops);
      } catch (err: any) {
        valid = false;
        why = err.message;
      }
    setPreview({ date, start: s, end: en, valid, why, ops });
    scrollDragEdge(e, box, r);
    if (inside && !drag.resize && Date.now() - edgeTime.current > 850) {
      if (e.clientX > r.right - 30) {
        setStart((v) => addDays(v, 1));
        edgeTime.current = Date.now();
      } else if (e.clientX < r.left + 30) {
        setStart((v) => addDays(v, -1));
        edgeTime.current = Date.now();
      }
    }
  }
  async function endDrag() {
    if (!drag) return;
    const p = preview;
    const moved = pointerGesture.current.moved;
    suppressBlockClickUntil.current = Date.now() + 350;
    setDrag(null);
    setPreview(null);
    if (!moved) {
      if (drag.type === "slot" && !drag.resize) editSlot(drag.slot);
      return;
    }
    if (drag.type === "create") {
      if (p?.valid) openNew("task", p.date, clock(p.start), clock(p.end));
      return;
    }
    if (p?.valid) {
      const ops = p.ops.map((o: any) => ({
        ...o,
        value: o.value
          ? {
              ...o.value,
              id: o.value.id?.startsWith("preview-") ? uuid() : o.value.id,
            }
          : undefined,
      }));
      await command(ops);
    }
  }
  function beginDrag(e: React.PointerEvent, d: any) {
    if (e.button !== 0 || (isMobile && e.pointerType === "touch")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerGesture.current = { x: e.clientX, y: e.clientY, moved: false };
    setDrag(d);
    setPreview(null);
    edgeTime.current = Date.now();
    verticalEdgeTime.current = 0;
  }
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrag(null);
        setPreview(null);
        setZoom(null);
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "z" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        if (plan)
          action(() => api("/undo", { version: plan.version }), "已撤销");
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [plan?.version]);
  if (!data)
    return (
      <div className="loading">
        <CalendarDays size={36} />
        <h2>间序</h2>
        <p>{error || "正在打开你的工作台…"}</p>
        {error && <button onClick={() => location.reload()}>重新连接</button>}
      </div>
    );
  return (
    <div
      className="app"
      onPointerMove={dragAt}
      onPointerUp={() => void endDrag()}
      onPointerCancel={() => {
        setDrag(null);
        setPreview(null);
      }}
    >
      <nav className="rail">
        <div className="brand">间</div>
        <button
          className={view === "calendar" ? "rail-active" : ""}
          title="日历"
          onClick={() => {
            setView("calendar");
            if (isMobile) {
              setRight(false);
              setLeft(false);
            }
          }}
        >
          <CalendarDays />
        </button>
        <button
          className={view === "sql" ? "rail-active" : ""}
          title="SQL学习"
          onClick={() => {
            setView("sql");
          }}
        >
          <BookOpen />
        </button>
        <button
          className={view === "english" ? "rail-active" : ""}
          title="英语学习"
          onClick={() => {
            setView("english");
          }}
        >
          <MessageCircle />
        </button>
        <button
          title="课程学习"
          className={view === "course" ? "rail-active" : ""}
          onClick={() => setView("course")}
        >
          <GraduationCap />
        </button>
        <div className="rail-bottom">
          <button
            title="设置"
            onClick={() => {
              setView("calendar");
              setPanel("settings");
              setRight(true);
            }}
          >
            <Settings />
          </button>
          <span className="avatar">我</span>
        </div>
      </nav>
      <div className="workspace">
        {(error || notice) && (
          <div
            className={"statusbar " + (error ? "error" : "")}
            role={error ? "alert" : "status"}
          >
            {error || notice}
            <button
              onClick={() => {
                setError("");
                setNotice("");
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div
          className="content"
          style={{ display: view === "calendar" ? undefined : "none" }}
        >
          {left && (
            <aside className="sidebar">
              <div className="section-heading">
                <span>我的清单</span>
                <button title="收起清单" onClick={() => setLeft(false)}>
                  <PanelLeftClose size={17} />
                </button>
              </div>
              <div className="search">
                <Search size={15} />
                <input
                  aria-label="搜索事项"
                  placeholder="搜索事项"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="tabs">
                {[
                  ["todo", "待安排"],
                  ["all", "全部"],
                  ["done", "已完成"],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    className={filter === k ? "selected" : ""}
                    onClick={() => setFilter(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {(due.length > 0 || follow.length > 0) && (
                <div className="attention">
                  <b>
                    需要你的确认 <span>{due.length + follow.length}</span>
                  </b>
                  {due.map((b) => (
                    <button
                      key={b.id}
                      onClick={() =>
                        editTask(
                          data.plan.tasks.find((t) => t.id === b.taskId)!,
                          allSlots.find((s) => s.id === b.id),
                        )
                      }
                    >
                      <Clock3 size={13} />
                      {data.plan.tasks.find((t) => t.id === b.taskId)?.title}
                      <small>待确认</small>
                    </button>
                  ))}
                  {follow.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setText(
                          `继续讨论任务：${data.plan.tasks.find((t) => t.id === f.taskId)?.title}\n之前的问题：${f.context}`,
                        );
                        setRight(true);
                        setPanel("ai");
                      }}
                    >
                      <Sparkles size={13} />
                      {data.plan.tasks.find((t) => t.id === f.taskId)?.title}
                      <small>待跟进</small>
                    </button>
                  ))}
                </div>
              )}
              <div className="section-mini">
                <span>项目</span>
                <FolderPlus size={14} />
              </div>
              <select
                aria-label="项目筛选"
                className="project-select"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">所有事项</option>
                {data.plan.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <form
                className="project-add"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    projectName.trim() &&
                    (await command([
                      {
                        type: "project",
                        value: { id: uuid(), title: projectName },
                      },
                    ]))
                  )
                    setProjectName("");
                }}
              >
                <input
                  aria-label="新项目名称"
                  placeholder="添加一个项目"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
                <button title="添加项目">
                  <Plus size={15} />
                </button>
              </form>
              <div className="section-mini">
                <span>
                  {filter === "todo" ? "待安排事项" : "事项"} · {list.length}
                </span>
                <button title="添加事项" onClick={() => openNew()}>
                  <Plus size={15} />
                </button>
              </div>
              <div className="task-list">
                {list.map((t) => (
                  <div
                    className={
                      "task-card " +
                      (t.status === "unfinished" ? "unfinished" : "")
                    }
                    key={t.id}
                  >
                    <div className="task-title">
                      <button
                        className="check-button"
                        title="完成任务"
                        onClick={() =>
                          command([{ type: "complete", id: t.id }])
                        }
                      >
                        {periodComplete(t) ? <Check size={13} /> : null}
                      </button>
                      <button className="task-name" onClick={() => editTask(t)}>
                        {t.title}
                      </button>
                      {t.arrangement !== "flexible" && (
                        <span
                          className="grab"
                          title="拖到日历"
                          onPointerDown={(e) =>
                            beginDrag(e, {
                              type: "new",
                              id: t.id,
                              duration: t.duration,
                            })
                          }
                        >
                          <GripVertical size={16} />
                        </span>
                      )}
                    </div>
                    <div className="task-meta">
                      <span>
                        {t.status === "unfinished" ? "未完成 · " : ""}
                        {t.duration}分钟{" "}
                        {t.arrangement === "flexible"
                          ? `· 灵活 · ${t.cadence === "daily" ? "每日" : t.cadence === "weekly" ? "每周" : "一次"}`
                          : ""}
                      </span>
                      {t.dueDate && <span>{t.dueDate.slice(5)} 截止</span>}
                    </div>
                    {t.progress && (
                      <small className="progress-note">{t.progress}</small>
                    )}
                  </div>
                ))}
                {!list.length && (
                  <div className="empty-list">
                    <Inbox size={27} />
                    <p>给想做的事一个位置</p>
                    <small>
                      新建事项，或交给AI整理
                      <br />
                      再拖到合适的时间
                    </small>
                  </div>
                )}
              </div>
              <button className="add-dashed" onClick={() => openNew()}>
                <Plus size={15} />
                添加待办
              </button>
              <div className="sidebar-foot">
                <span className="dot" />
                {data.cloud ? "自动保存在云端" : "自动保存在工作台电脑"}
              </div>
            </aside>
          )}
          <main
            className={
              "calendar-main " + (hourHeight < 48 ? "compact-hours" : "")
            }
            style={
              {
                "--hour-height": `${hourHeight}px`,
                "--calendar-days": visibleDates.length,
              } as React.CSSProperties
            }
          >
            <div className="calendar-toolbar">
              <div className="date-title">
                {!left && (
                  <button title="展开清单" onClick={() => setLeft(true)}>
                    <Inbox size={17} />
                  </button>
                )}
                <h2>
                  {new Date(start + "T12:00:00").getFullYear()}年
                  {new Date(start + "T12:00:00").getMonth() + 1}月
                </h2>
                <span>
                  {start.slice(5).replace("-", "/")} —{" "}
                  {addDays(start, visibleDates.length - 1)
                    .slice(5)
                    .replace("-", "/")}
                </span>
              </div>
              <div className="calendar-controls">
                <div className="calendar-scale" aria-label="日历行距缩放">
                  <button
                    title="缩小行距（Ctrl＋滚轮向下）"
                    aria-label="缩小行距"
                    disabled={hourHeight <= 32 || !!drag}
                    onClick={() => resizeHours(hourHeight - 8)}
                  >
                    −
                  </button>
                  <button
                    title="恢复默认行距"
                    aria-label="恢复默认行距"
                    disabled={!!drag}
                    onClick={() => resizeHours(48)}
                  >
                    {Math.round((hourHeight / 64) * 100)}%
                  </button>
                  <button
                    title="放大行距（Ctrl＋滚轮向上）"
                    aria-label="放大行距"
                    disabled={hourHeight >= 112 || !!drag}
                    onClick={() => resizeHours(hourHeight + 8)}
                  >
                    ＋
                  </button>
                </div>
                <button
                  title="前一天"
                  onClick={() => setStart(addDays(start, -1))}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="today-button"
                  onClick={() => {
                    setStart(localDate());
                    calendar.current?.scrollTo({ top: 0 });
                  }}
                >
                  今天
                </button>
                <button
                  title="后一天"
                  onClick={() => setStart(addDays(start, 1))}
                >
                  <ChevronRight size={17} />
                </button>
                <input
                  aria-label="选择起始日期"
                  type="date"
                  value={start}
                  onInput={(e) =>
                    e.currentTarget.value && setStart(e.currentTarget.value)
                  }
                />
                <button
                  title="撤销"
                  disabled={pending}
                  onClick={() =>
                    action(
                      () => api("/undo", { version: data.plan.version }),
                      "已撤销",
                    )
                  }
                >
                  <Undo2 size={16} />
                </button>
                <button
                  className="primary calendar-add"
                  title="新建事项"
                  onClick={() => openNew()}
                >
                  <Plus size={16} />
                  <span>新建</span>
                </button>
                {!right && (
                  <button
                    title="展开AI助手"
                    onClick={() => {
                      setRight(true);
                      setPanel("ai");
                    }}
                  >
                    <Sparkles size={18} />
                  </button>
                )}
              </div>
            </div>
            <div className="day-head">
              <div className="timezone">
                UTC{-new Date().getTimezoneOffset() / 60 >= 0 ? "+" : ""}
                {-new Date().getTimezoneOffset() / 60}
              </div>
              {visibleDates.map((d) => (
                <div
                  className={"day " + (d === localDate() ? "current" : "")}
                  key={d}
                >
                  <span>{week[new Date(d + "T12:00:00").getDay()]}</span>
                  <b>{Number(d.slice(8))}</b>
                </div>
              ))}
            </div>

            {allSlots.some(
              (s) => visibleDates.includes(s.date) && mins(s.start) < 480,
            ) && (
              <div className="outside-hours">
                <span>08:00之前</span>
                {allSlots
                  .filter(
                    (s) => visibleDates.includes(s.date) && mins(s.start) < 480,
                  )
                  .map((s) => (
                    <button key={s.key} onClick={() => editSlot(s)}>
                      {s.date.slice(5)} {s.start} {s.title}
                    </button>
                  ))}
              </div>
            )}
            <div
              className="calendar-scroll"
              ref={calendar}
              onWheel={(e) => {
                const el = e.currentTarget;
                if (e.ctrlKey || drag) return;
                const bottom =
                    el.scrollTop + el.clientHeight >= el.scrollHeight - 3,
                  top = el.scrollTop < 2;
                if (
                  ((bottom && e.deltaY > 0) || (top && e.deltaY < 0)) &&
                  Date.now() - lastWheel.current > 900
                ) {
                  lastWheel.current = Date.now();
                  if ((el as any).edgeReady) {
                    setStart((s) => addDays(s, e.deltaY > 0 ? 1 : -1));
                    (el as any).edgeReady = false;
                  } else (el as any).edgeReady = true;
                } else if (!bottom && !top) (el as any).edgeReady = false;
              }}
            >
              <div className="calendar-body">
                <div className="time-labels">
                  {Array.from({ length: 17 }, (_, i) => (
                    <span key={i} style={{ top: i * hourHeight }}>
                      {String(i + 8).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
                <div className="columns" ref={cols}>
                  {visibleDates.map((d) => (
                    <div
                      key={d}
                      className={
                        "day-column " +
                        (d === localDate() ? "today-column" : "")
                      }
                      onClick={(e) => {
                        if (
                          !isMobile ||
                          (e.target as HTMLElement).closest(".event-block")
                        )
                          return;
                        const r = e.currentTarget.getBoundingClientRect();
                        const m = Math.max(
                          480,
                          Math.min(
                            1410,
                            480 +
                              Math.floor(
                                (e.clientY - r.top) / (hourHeight / 2),
                              ) *
                                30,
                          ),
                        );
                        openNew("task", d, clock(m));
                      }}
                      onPointerDown={(e) => {
                        if (
                          e.button !== 0 ||
                          (isMobile && e.pointerType === "touch") ||
                          pending ||
                          (e.target as HTMLElement).closest(".event-block")
                        )
                          return;
                        const r = e.currentTarget.getBoundingClientRect();
                        const anchor = Math.max(
                          480,
                          Math.min(
                            1410,
                            480 +
                              Math.floor(
                                (e.clientY - r.top) / (hourHeight / 2),
                              ) *
                                30,
                          ),
                        );
                        beginDrag(e, {
                          type: "create",
                          date: d,
                          anchor,
                          y: e.clientY,
                        });
                      }}
                      onDoubleClick={(e) => {
                        if ((e.target as HTMLElement).closest(".event-block"))
                          return;
                        const r = e.currentTarget.getBoundingClientRect();
                        const m = Math.max(
                          480,
                          Math.min(
                            1410,
                            480 +
                              Math.floor(
                                (e.clientY - r.top) / (hourHeight / 2),
                              ) *
                                30,
                          ),
                        );
                        openNew("task", d, clock(m));
                      }}
                    >
                      {Array.from({ length: 16 }, (_, i) => (
                        <div className="hour-cell" key={i} />
                      ))}
                      <CanvasDeadlines data={canvasDeadlines.data} date={d} hourHeight={hourHeight} onSelect={a => { setCanvasDetail(a); setPanel("canvasDetail"); setRight(true); }} />
                      {allSlots
                        .filter((s) => s.date === d && mins(s.end) > 480)
                        .map((s) => {
                          const dueSlot =
                            s.kind === "task" &&
                            isDue(
                              data.plan.blocks.find((b) => b.id === s.id)!,
                              now,
                            );
                          return (
                            <div
                              key={s.key}
                              title={`${s.title} ${s.start}–${s.end}`}
                              className={`event-block ${s.kind} ${s.status} ${s.highlight === "yellow" ? "highlight-yellow" : ""} ${dueSlot ? "awaiting" : ""}`}
                              style={{
                                top:
                                  ((Math.max(480, mins(s.start)) - 480) / 60) *
                                  hourHeight,
                                height: Math.max(
                                  12,
                                  ((mins(s.end) -
                                    Math.max(480, mins(s.start))) /
                                    60) *
                                    hourHeight -
                                    3,
                                ),
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  Date.now() >= suppressBlockClickUntil.current
                                )
                                  editSlot(s);
                              }}
                              tabIndex={0}
                              aria-label={`${s.title}，${s.start}至${s.end}，查看详情`}
                              onKeyDown={(e) => {
                                if (e.target !== e.currentTarget) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  editSlot(s);
                                }
                              }}
                            >
                              <div
                                className="block-drag"
                                onPointerDown={(e) =>
                                  beginDrag(e, {
                                    type: "slot",
                                    slot: s,
                                    duration: mins(s.end) - mins(s.start),
                                    offset: Math.max(
                                      0,
                                      ((e.clientY -
                                        e.currentTarget.getBoundingClientRect()
                                          .top) /
                                        hourHeight) *
                                        60,
                                    ),
                                  })
                                }
                              >
                                <strong>{s.title}</strong>
                                <small>
                                  {s.start}–{s.end}
                                  {dueSlot ? " · 待确认" : ""}
                                </small>
                              </div>
                              <button
                                className="block-open"
                                title="编辑安排"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  editSlot(s);
                                }}
                              >
                                <MoreHorizontal size={13} />
                              </button>
                              <div
                                className="resize-handle"
                                title="拖动调整时长"
                                onPointerDown={(e) =>
                                  beginDrag(e, {
                                    type: "slot",
                                    slot: s,
                                    resize: true,
                                  })
                                }
                              />
                            </div>
                          );
                        })}
                      {d === localDate() && now.getHours() >= 8 && (
                        <div
                          className="now-line"
                          style={{
                            top:
                              ((now.getHours() * 60 + now.getMinutes() - 480) /
                                60) *
                              hourHeight,
                          }}
                        >
                          <i />
                        </div>
                      )}
                      {!drag && editor && panel === "detail" && right && !editor.block && !editor.original &&
                        !data.plan.tasks.some(t=>t.id===editor.value.id) && !data.plan.events.some(t=>t.id===editor.value.id) &&
                        (editor.kind === "task" ? editor.date : editor.value.date) === d && (() => {
                          const startTime = editor.kind === "task" ? editor.start : editor.value.start;
                          const endTime = editor.kind === "task" ? editor.end : editor.value.end;
                          if (!startTime || !endTime || mins(endTime) <= mins(startTime)) return null;
                          return <div className="drag-preview pending-selection" style={{top:((Math.max(480,mins(startTime))-480)/60)*hourHeight,height:Math.max(12,((mins(endTime)-Math.max(480,mins(startTime)))/60)*hourHeight)}}>
                            <strong>{startTime}—{endTime}</strong><small>{editor.value.title || "新建事项 · 待保存"}</small>
                          </div>;
                        })()}
                      {preview?.date === d && (
                        <div
                          className={
                            "drag-preview " + (!preview.valid ? "invalid" : "")
                          }
                          style={{
                            top: ((preview.start - 480) / 60) * hourHeight,
                            height:
                              ((preview.end - preview.start) / 60) * hourHeight,
                          }}
                        >
                          {preview.valid ? (
                            <Check size={16} />
                          ) : (
                            <X size={18} />
                          )}
                          <span>
                            {clock(preview.start)}—
                            {clock(preview.end)}
                          </span>
                          {!preview.valid && <small>{preview.why}</small>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <footer className="calendar-footer">
              <span>
                <i className="legend-task" />
                待办安排 <i className="legend-event" />
                固定事件
              </span>
              <span>
                {isMobile
                  ? "点空白新建 · 点事项编辑 · 上下滑动时间"
                  : "拖选时间新建（也可双击） · 拖动至边缘跨日 · 半小时吸附"}
              </span>
            </footer>
          </main>
          {right && (
            <aside className="assistant">
              <div className="section-heading">
                <span>
                  <Sparkles size={17} />
                  {panel === "ai"
                    ? "AI 规划助手"
                    : panel === "settings"
                      ? "工作台设置"
                      : (panel === "detail" || panel === "canvasDetail")
                        ? "事项详情"
                        : panel === "sql"
                          ? "SQL 学习"
                          : "英语学习"}
                </span>
                <button title="收起右侧" onClick={() => setRight(false)}>
                  <PanelRightClose size={17} />
                </button>
              </div>
              {panel !== "ai" && (
                <button className="back-ai" onClick={() => setPanel("ai")}>
                  <ChevronLeft size={14} />
                  返回助手
                </button>
              )}
              {panel === "ai" && (
                <>
                  <div className="assistant-scroll">
                    {data.messages.length === 0 && (
                      <div className="ai-intro">
                        <div className="sparkle-square">
                          <Sparkles size={23} />
                        </div>
                        <h3>一起，把计划理清楚。</h3>
                        <p>
                          发来一张图片，或说说你的安排。
                          <br />
                          我会整理成草稿，由你确认后采用。
                        </p>
                        <div className="intro-pills">
                          <span>图片识别</span>
                          <span>语音输入</span>
                          <span>安排讨论</span>
                        </div>
                      </div>
                    )}
                    {follow.map((f) => (
                      <div className="follow-card" key={f.id}>
                        <b>
                          <Clock3 size={14} />
                          之前暂缓的事情
                        </b>
                        <p>
                          {
                            data.plan.tasks.find((t) => t.id === f.taskId)
                              ?.title
                          }
                        </p>
                        <small>{f.context}</small>
                        <div>
                          <button
                            onClick={() => setText(`继续讨论：${f.context}`)}
                          >
                            继续讨论
                          </button>
                          <button
                            onClick={() => {
                              setEditor({
                                kind: "follow",
                                value: {
                                  ...f,
                                  at: new Date(
                                    Date.now() + 86400000,
                                  ).toISOString(),
                                },
                              });
                              setPanel("detail");
                            }}
                          >
                            延后
                          </button>
                          <button
                            onClick={() =>
                              command([{ type: "closeFollowup", id: f.id }])
                            }
                          >
                            不再跟进
                          </button>
                        </div>
                      </div>
                    ))}
                    {data.messages.map((m) => (
                      <div key={m.id} className={"message " + m.role}>
                        <div className="message-label">
                          {m.role === "user" ? "你" : "间序 AI"}
                        </div>
                        {m.images.map((id: string) => (
                          <img
                            className="chat-image"
                            key={id}
                            src={"/api/images/" + id}
                            onClick={() => setZoom(id)}
                          />
                        ))}
                        <p>{m.content}</p>
                      </div>
                    ))}
                    {data.drafts.map((d) => (
                      <Draft
                        key={d.id}
                        draft={d}
                        plan={data.plan}
                        run={action}
                      />
                    ))}
                    {busy && (
                      <div className="thinking">
                        <span />
                        正在理解你的安排…
                      </div>
                    )}
                    <div ref={messagesEnd} />
                  </div>
                  <div
                    className="composer"
                    onDragOver={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      void upload(e.dataTransfer.files);
                    }}
                  >
                    {images.length > 0 && (
                      <div className="image-tray">
                        {images.map((id) => (
                          <div key={id}>
                            <img
                              src={"/api/images/" + id}
                              onClick={() => setZoom(id)}
                            />
                            <button
                              title="移除图片"
                              onClick={() =>
                                setImages(images.filter((x) => x !== id))
                              }
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <textarea
                      aria-label="给AI的消息"
                      placeholder="输入想法，或把图片拖到这里…"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onPaste={(e) => {
                        const fs = Array.from(e.clipboardData.files);
                        if (fs.length) {
                          e.preventDefault();
                          void upload(fs);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div className="composer-tools">
                      <div>
                        <button
                          title="添加图片"
                          onClick={() => picker.current?.click()}
                        >
                          <ImagePlus size={18} />
                        </button>
                        <button
                          title={recording ? "停止并转写" : "语音转文字"}
                          className={recording ? "recording" : ""}
                          disabled={transcribing}
                          onClick={() => void voice()}
                        >
                          {recording ? <Square size={16} /> : <Mic size={18} />}
                        </button>
                        {recording && (
                          <button
                            title="取消录音"
                            onClick={() => {
                              cancelRecord.current = true;
                              recorder.current?.stop();
                            }}
                          >
                            <X size={15} />
                          </button>
                        )}
                        <span>
                          {recording
                            ? "录音中 · 最多2分钟"
                            : transcribing
                              ? "转写中…"
                              : "Ctrl + Enter 发送"}
                        </span>
                      </div>
                      <button
                        title="发送"
                        className="send"
                        disabled={busy || (!text.trim() && !images.length)}
                        onClick={() => void send()}
                      >
                        <ArrowUp size={18} />
                      </button>
                    </div>
                    <input
                      hidden
                      ref={picker}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        if (e.target.files) void upload(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <div className="privacy-line">
                      内容发给你配置的模型 · 采用前不会改动日历
                    </div>
                  </div>
                </>
              )}
              {panel === "settings" && (
                <SettingsPanel data={data} run={action} onError={setError} />
              )}
              {panel === "canvasDetail" && canvasDetail && <div className="assistant-scroll canvas-item-detail">
                <small>{canvasDetail.course} · 作业截止</small>
                <h2>{assignmentName(canvasDetail.title)}</h2>
                <p>{canvasDetail.title}</p>
                <h3>截止时间</h3>
                <p>{Object.values(canvasDeadline(canvasDetail.due)).join(" ")}（UTC+8）</p>
                <p>日历显示截止前一小时；截止日期来自 Canvas。</p>
                <p>{canvasDetail.submitted ? "Canvas 已记录提交" : "Canvas 尚未记录提交"}</p>
                <h3>作业要求</h3>
                <div style={{whiteSpace:"pre-wrap",lineHeight:1.8}}>{requirementText(canvasDetail.description) || "官网作业页没有正文，请查看课程资料或关联项目。"}</div>
                <p><a href={canvasDetail.url} target="_blank" rel="noreferrer">在 Canvas 查看作业及附件 ↗</a></p>
              </div>}
              {panel === "detail" && editor && (
                <div className="detail-scroll" onKeyDown={e => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type === "text") {
                    e.preventDefault(); if (!pending) void saveEditor();
                  }
                }}>
                  <div className="editor-heading">
                    <span className="eyebrow">
                      {editor.kind === "event"
                        ? "FIXED EVENT"
                        : editor.kind === "follow"
                          ? "FOLLOW UP"
                          : "TASK DETAILS"}
                    </span>
                    <h3>
                      {editor.kind === "follow"
                        ? "稍后再讨论"
                        : editor.value.title || "新建事项"}
                    </h3>
                  </div>
                  {!editor.original &&
                    !editor.block &&
                    editor.kind !== "follow" &&
                    !data.plan.tasks.some((t) => t.id === editor.value.id) && (
                      <div className="tabs">
                        <button
                          className={editor.kind === "task" ? "selected" : ""}
                          onClick={() =>
                            openNew("task", editor.date, editor.start)
                          }
                        >
                          待办任务
                        </button>
                        <button
                          className={editor.kind === "event" ? "selected" : ""}
                          onClick={() =>
                            openNew("event", editor.date, editor.start)
                          }
                        >
                          固定事件
                        </button>
                      </div>
                    )}
                  {editor.original?.repeat && (
                    <label className="field">
                      修改范围
                      <select
                        value={editor.scope}
                        onChange={(e) =>
                          setEditor({ ...editor, scope: e.target.value })
                        }
                      >
                        <option value="once">仅这一次</option>
                        <option value="future">这一次及以后</option>
                      </select>
                    </label>
                  )}
                  {editor.kind === "task" && (
                    <>
                      <label className="field">
                        安排方式
                        <select
                          value={editor.value.arrangement || "timed"}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              value: {
                                ...editor.value,
                                arrangement: e.target.value,
                                cadence: "once",
                              },
                              ...(e.target.value === "flexible"
                                ? { date: "", start: "", end: "" }
                                : {}),
                            })
                          }
                        >
                          <option value="timed">
                            时段任务 · 可以安排进日历
                          </option>
                          <option value="flexible">
                            灵活任务 · 只在清单显示
                          </option>
                        </select>
                      </label>
                      {editor.value.arrangement === "flexible" && (
                        <label className="field">
                          目标周期
                          <select
                            value={editor.value.cadence || "once"}
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                value: {
                                  ...editor.value,
                                  cadence: e.target.value,
                                  startsOn:
                                    editor.value.startsOn || localDate(),
                                },
                              })
                            }
                          >
                            <option value="once">一次完成</option>
                            <option value="daily">每日目标</option>
                            <option value="weekly">每周目标</option>
                          </select>
                        </label>
                      )}
                    </>
                  )}
                  <Fields
                    value={editor.value}
                    kind={editor.kind}
                    plan={data.plan}
                    onChange={(value) => setEditor({ ...editor, value })}
                  />
                  {editor.kind === "task" &&
                    editor.value.arrangement !== "flexible" && (
                      <>
                        <div className="divider-label">
                          工作时间 · 可暂不安排
                        </div>
                        <div className="field-row">
                          <label className="field">
                            日期
                            <input
                              type="date"
                              value={editor.date}
                              onInput={(e) =>
                                setEditor({
                                  ...editor,
                                  date: e.currentTarget.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="field-row">
                          <label className="field">
                            开始
                            <input
                              type="time"
                              value={editor.start}
                              onInput={(e) =>
                                setEditor({
                                  ...editor,
                                  start: e.currentTarget.value,
                                  end: clock(
                                    Math.min(
                                      1440,
                                      mins(e.currentTarget.value || "09:00") +
                                        editor.value.duration,
                                    ),
                                  ),
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            结束
                            <input
                              value={editor.end}
                              placeholder="18:00 / 24:00"
                              onChange={(e) =>
                                setEditor({ ...editor, end: e.target.value })
                              }
                            />
                          </label>
                        </div>
                      </>
                    )}
                  <button
                    className="primary wide"
                    disabled={pending}
                    onClick={() => void saveEditor()}
                  >
                    <Check size={16} />
                    保存{editor.kind === "follow" ? "跟进时间" : "事项"}
                  </button>
                  {editor.kind === "task" &&
                    data.plan.tasks.some((t) => t.id === editor.value.id) && (
                      <div className="detail-actions">
                        <button
                          onClick={() =>
                            command([{ type: "complete", id: editor.value.id }])
                          }
                        >
                          <Check size={15} />
                          完成任务
                        </button>
                        <button onClick={() => followTask(editor.value)}>
                          <Clock3 size={15} />
                          稍后跟进
                        </button>
                        {editor.block && (
                          <button
                            onClick={async () => {
                              if (
                                await command([
                                  {
                                    type: "return",
                                    id: editor.block.id,
                                    value: { progress: editor.value.progress },
                                  },
                                ])
                              ) {
                                setEditor(null);
                                setPanel("ai");
                              }
                            }}
                          >
                            <RotateCcw size={15} />
                            未完成，退回清单
                          </button>
                        )}
                        <button
                          className="danger"
                          onClick={async () => {
                            if (
                              await command([
                                { type: "deleteTask", id: editor.value.id },
                              ])
                            ) {
                              setEditor(null);
                              setPanel("ai");
                            }
                          }}
                        >
                          <Trash2 size={15} />
                          删除任务（可撤销）
                        </button>
                      </div>
                    )}
                  {editor.kind === "event" &&
                    data.plan.events.some((e) => e.id === editor.value.id) && (
                      <button
                        className="danger wide"
                        onClick={async () => {
                          if (
                            await command([
                              {
                                type: editor.original?.repeat
                                  ? "skipEvent"
                                  : "deleteEvent",
                                id: editor.value.id,
                                date: editor.instanceDate,
                                scope: editor.scope,
                              },
                            ])
                          ) {
                            setEditor(null);
                            setPanel("ai");
                          }
                        }}
                      >
                        取消
                        {editor.original?.repeat && editor.scope === "future"
                          ? "本次及以后"
                          : "本次"}
                        事件（可撤销）
                      </button>
                    )}
                </div>
              )}
            </aside>
          )}
        </div>
        <div
          style={{
            display: view === "sql" ? "flex" : "none",
            flex: 1,
            minHeight: 0,
          }}
        >
          <SqlWorkspace
            api={api}
            planVersion={data.plan.version}
            syncRevision={data.syncRevision}
            onPlanChange={refresh}
          />
        </div>
        {(view === "english" || view === "course") && (
          <EnglishWorkspace
            onCalendar={(date,time)=>{setStart(date);setView("calendar");setTimeout(()=>calendar.current?.scrollTo({top:Math.max(0,((mins(time || "12:00")-480)/60-2)*hourHeight)}),0);}}
            key={view}
            area={view === "course" ? "course" : "english"}
            onNavigate={setView}
            api={api}
            plan={data.plan}
            command={command}
            onEdit={(t) => {
              setView("calendar");
              editTask(t);
            }}
          />
        )}
      </div>
      {zoom && (
        <div className="image-viewer" onClick={() => setZoom(null)}>
          <button title="关闭图片">
            <X />
          </button>
          <img src={"/api/images/" + zoom} />
        </div>
      )}
    </div>
  );
}
function Fields({
  value,
  kind,
  plan,
  onChange,
}: {
  value: any;
  kind: string;
  plan: Plan;
  onChange: (v: any) => void;
}) {
  const fields =
    kind === "task"
      ? [
          "title",
          "projectId",
          "dueDate",
          "dueTime",
          "duration",
          "notes",
        ]
      : kind === "event"
        ? [
            "title",
            "date",
            "start",
            "end",
            "repeat",
            ...(value.repeat ? ["until"] : []),
            "notes",
          ]
        : kind === "follow"
          ? ["taskId", "at", "context"]
          : kind === "project"
            ? ["title"]
            : kind === "block"
              ? ["taskId", "date", "start", "end"]
              : Object.keys(value).filter(
                  (k) => !["id", "status", "skip"].includes(k),
                );
  return (
    <>
      {fields.map((k) => (
        <label
          className={"field " + (k === "repeat" ? "checkbox-field" : "")}
          key={k}
        >
          {labels[k] || k}
          {k === "repeat" ? (
            <input
              type="checkbox"
              checked={!!value[k]}
              onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
            />
          ) : ["projectId", "taskId"].includes(k) ? (
            <select
              value={value[k] || ""}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            >
              <option value="">
                {k === "projectId" ? "独立事项" : "选择任务"}
              </option>
              {(k === "projectId" ? plan.projects : plan.tasks).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          ) : ["notes", "context", "progress"].includes(k) ? (
            <textarea
              value={value[k] || ""}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            />
          ) : (
            <input
              data-field={k}
              type={
                ["date", "dueDate", "until"].includes(k)
                  ? "date"
                  : k === "at"
                    ? "datetime-local"
                    : k === "duration"
                      ? "number"
                      : "text"
              }
              placeholder={
                ["start", "end", "dueTime"].includes(k) ? "HH:mm" : ""
              }
              value={k === "at" ? localInput(value[k]) : (value[k] ?? "")}
              onInput={(e) =>
                onChange({
                  ...value,
                  [k]:
                    k === "duration"
                      ? Number(e.currentTarget.value)
                      : k === "at"
                        ? e.currentTarget.value
                          ? new Date(e.currentTarget.value).toISOString()
                          : ""
                        : e.currentTarget.value,
                })
              }
            />
          )}
        </label>
      ))}
    </>
  );
}
function Draft({
  draft,
  plan,
  run,
}: {
  draft: any;
  plan: Plan;
  run: (f: () => Promise<any>, msg?: string) => Promise<boolean>;
}) {
  const [ops, setOps] = useState<any[]>(draft.operations),
    [selected, setSelected] = useState<number[]>(
      draft.operations.map((_: any, i: number) => i),
    ),
    [open, setOpen] = useState(false),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState("");
  const revision = useRef(draft.revision),
    currentOps = useRef(ops),
    chain = useRef(Promise.resolve());
  currentOps.current = ops;
  useEffect(() => {
    revision.current = Math.max(revision.current, draft.revision);
  }, [draft.revision]);
  async function persist(values: any[]) {
    const work = chain.current
      .catch(() => {})
      .then(async () => {
        await api(
          "/drafts/" + draft.id,
          { revision: revision.current, operations: values },
          "PATCH",
        );
        revision.current++;
      });
    chain.current = work;
    await work;
  }
  useEffect(() => {
    if (!dirty) return;
    const snapshot = ops;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await persist(snapshot);
        if (currentOps.current === snapshot) setDirty(false);
        setSaveError("");
      } catch (e: any) {
        setSaveError("草稿保存失败：" + e.message);
      } finally {
        setSaving(false);
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [ops, dirty]);
  const repeatDates = (o: any): string[] | null => {
    if (o.type !== "event" || !o.value?.repeat) return null;
    try {
      return occurrences(eventSchema.parse(o.value));
    } catch {
      return null;
    }
  };
  const recurring = ops.filter((o) => o.type === "event" && o.value?.repeat);
  const datesValid = recurring.every((o) => repeatDates(o) !== null);
  const lessonCount = recurring.reduce(
    (n, o) => n + (repeatDates(o)?.length || 0),
    0,
  );
  const names: Record<string, string> = {
    task: "待办",
    event: "固定事件",
    followup: "跟进",
    project: "项目",
    block: "时间安排",
    deleteTask: "删除任务",
    skipEvent: "取消事件",
    complete: "完成任务",
  };
  return (
    <div className="draft-card">
      <div className="draft-top">
        <span>
          <Sparkles size={14} />
          待采用草稿
        </span>
        <small>
          {saving ? "保存中…" : dirty ? "编辑中" : ops.length + "项规则"}
        </small>
      </div>
      <p>核对或修改后再采用，日历尚未变化。</p>
      {recurring.length > 0 && (
        <p className="recurrence-total">
          {recurring.length}门每周重复课程
          {datesValid
            ? ` · 共${lessonCount}节（已扣除停课日）`
            : " · 请补全有效日期"}
          ，采用后会展开到每周日历。
        </p>
      )}
      {ops.map((o, i) => (
        <div className="draft-item" key={i}>
          <label>
            <input
              type="checkbox"
              checked={selected.includes(i)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, i]
                    : selected.filter((n) => n !== i),
                )
              }
            />
            <b>
              {o.value?.title ||
                plan.tasks.find((t) => t.id === (o.id || o.value?.taskId))
                  ?.title ||
                names[o.type] ||
                o.type}
            </b>
          </label>
          {o.type === "event" && o.value?.repeat ? (
            <div className="recurrence-summary">
              <small>
                每{week[new Date(o.value.date + "T12:00:00").getDay()]} ·{" "}
                {o.value.start}–{o.value.end}
              </small>
              <small>
                {o.value.date} 至 {o.value.until || "待填写结束日期"} ·{" "}
                {repeatDates(o)?.length ?? "待核对"}节
              </small>
              {!!o.value.skip?.length && (
                <small>停课：{o.value.skip.join("、")}</small>
              )}
              {repeatDates(o) && (
                <details>
                  <summary>查看每次上课日期</summary>
                  <p>{repeatDates(o)!.join("、")}</p>
                </details>
              )}
            </div>
          ) : (
            <small>
              {names[o.type] || o.type}{" "}
              {o.value?.date || o.value?.dueDate || ""} {o.value?.start || ""}
              {o.value?.end ? "–" + o.value.end : ""}{" "}
              {o.value?.at ? fieldDate(localInput(o.value.at)) : ""}
            </small>
          )}
          {open &&
            (o.value ? (
              <Fields
                kind={o.type === "followup" ? "follow" : o.type}
                plan={{
                  ...plan,
                  projects: [
                    ...plan.projects,
                    ...ops
                      .filter((x) => x.type === "project")
                      .map((x) => x.value),
                  ],
                  tasks: [
                    ...plan.tasks,
                    ...ops.filter((x) => x.type === "task").map((x) => x.value),
                  ],
                }}
                value={o.value}
                onChange={(v) => {
                  setOps(ops.map((x, n) => (n === i ? { ...x, value: v } : x)));
                  setDirty(true);
                }}
              />
            ) : (
              <div className="mutate-description">
                目标：{o.id} {o.date} {o.scope === "future" ? "及以后" : ""}
              </div>
            ))}
        </div>
      ))}
      {saveError && <p role="alert">{saveError}</p>}
      <div className="draft-actions">
        <button onClick={() => setOpen(!open)}>
          {open ? "收起编辑" : "编辑内容"}
        </button>
        <button
          disabled={saving || !selected.length}
          className="primary"
          onClick={async () => {
            setSaving(true);
            setDirty(false);
            try {
              await run(async () => {
                await persist(ops.filter((_, i) => selected.includes(i)));
                await api("/drafts/" + draft.id + "/apply", {
                  revision: revision.current,
                });
              }, "已采用，日历已更新");
            } finally {
              setSaving(false);
            }
          }}
        >
          采用所选
        </button>
      </div>
      {draft.base !== plan.version && (
        <button
          className="recheck"
          disabled={saving}
          onClick={() =>
            run(async () => {
              await chain.current;
              await api("/drafts/" + draft.id + "/recheck", {
                revision: revision.current,
              });
              revision.current++;
            }, "已按最新日历核对，请再次采用")
          }
        >
          日历已变化 · 重新核对草稿
        </button>
      )}
      <button
        className="text-button"
        onClick={() =>
          run(() => api("/drafts/" + draft.id + "/discard", {}), "已丢弃草稿")
        }
      >
        丢弃草稿
      </button>
    </div>
  );
}
function SettingsPanel({
  data,
  run,
  onError,
}: {
  data: Data;
  run: (f: () => Promise<any>, msg?: string) => Promise<boolean>;
  onError: (s: string) => void;
}) {
  const [configs, setConfigs] = useState<any>(structuredClone(data.configs)),
    [result, setResult] = useState(""),
    [restore, setRestore] = useState<any>(null),
    [testing, setTesting] = useState(false);
  return (
    <div className="settings-scroll">
      <DevicePanel api={api} />
      <h3>连接你的 AI</h3>
      <p className="muted">
        支持兼容 Chat Completions
        与音频转写接口。服务地址使用服务商提供的基础地址（例如
        https://api.deepseek.com），不要添加
        /chat/completions。语音转写需单独配置。
      </p>
      {[
        ["chat", "图片与对话"],
        ["speech", "语音转文字"],
      ].map(([k, l]) => (
        <section className="provider" key={k}>
          <h4>
            {l}
            <span>{data.configs[k]?.hasKey ? "密钥已保护" : "未设置密钥"}</span>
          </h4>
          {[
            ["base", "服务地址", "https://…/v1"],
            ["model", "模型名称", "服务商提供的模型名称"],
            ["key", "API Key", "留空保留现有密钥"],
          ].map(([f, label, ph]) => (
            <label className="field" key={f}>
              {label}
              <input
                type={f === "key" ? "password" : "text"}
                autoComplete="off"
                value={configs[k]?.[f] || ""}
                placeholder={ph}
                onInput={(e) =>
                  setConfigs({
                    ...configs,
                    [k]: { ...configs[k], [f]: e.currentTarget.value },
                  })
                }
              />
            </label>
          ))}
          <div className="provider-buttons">
            <button
              className="primary"
              onClick={async () => {
                if (
                  await run(
                    () => api("/config/" + k, configs[k], "PUT"),
                    "配置已保存",
                  )
                )
                  setConfigs({ ...configs, [k]: { ...configs[k], key: "" } });
              }}
            >
              保存配置
            </button>
            <button
              onClick={() =>
                run(() => api("/config/" + k, {}, "DELETE"), "已移除配置和密钥")
              }
            >
              移除
            </button>
          </div>
          {k === "chat" && (
            <>
              <button
                disabled={testing}
                className="wide"
                onClick={async () => {
                  setTesting(true);
                  try {
                    setResult((await api("/test-chat", {})).text);
                  } catch (e: any) {
                    onError(e.message);
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                {testing ? "正在测试连接…" : "测试文字连接"}
              </button>
              <label className="file-button">
                选择图片测试视觉
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  disabled={testing}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setTesting(true);
                    try {
                      let s = "";
                      new Uint8Array(await f.arrayBuffer()).forEach(
                        (x) => (s += String.fromCharCode(x)),
                      );
                      const im = await api("/images", {
                        mime: f.type,
                        data: btoa(s),
                      });
                      setResult(
                        (await api("/test-vision", { id: im.id })).text,
                      );
                    } catch (err: any) {
                      onError(err.message);
                    } finally {
                      setTesting(false);
                    }
                  }}
                />
              </label>
            </>
          )}
          {k === "speech" && (
            <p className="muted">
              保存后，返回助手点击麦克风录一小段话测试。转写结果可修改后发送。
            </p>
          )}
        </section>
      ))}
      {result && <div className="test-result">{result}</div>}
      <h3>数据与备份</h3>
      <p className="muted">
        自动保存目录：{data.dataDir}
        <br />
        备份含图片、日程、对话、草稿和学习记录，不含API
        Key。课堂录音原文件另存于数据目录的 audio 文件夹，请与此目录一起备份。
      </p>
      <button
        className="wide"
        onClick={async () => {
          try {
            const b = await api("/backup");
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(b)], { type: "application/json" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = `planner-backup-${localDate()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (e: any) {
            onError(e.message);
          }
        }}
      >
        <Download size={15} />
        导出备份
      </button>
      <label className="file-button">
        <Upload size={15} />
        选择备份恢复
        <input
          type="file"
          hidden
          accept="application/json"
          onChange={async (e) => {
            try {
              const f = e.target.files?.[0];
              if (f) setRestore(JSON.parse(await f.text()));
            } catch {
              onError("无法读取备份");
            }
          }}
        />
      </label>
      {restore && (
        <div className="restore-confirm">
          <p>恢复会替换当前日程和对话。恢复前将自动保存快照。</p>
          <button
            className="primary"
            onClick={async () => {
              if (
                await run(
                  () => api("/restore", restore),
                  "恢复成功，请刷新页面",
                )
              ) {
                setRestore(null);
                location.reload();
              }
            }}
          >
            确认恢复
          </button>
          <button onClick={() => setRestore(null)}>取消</button>
        </div>
      )}
      <p className="muted">
        当前时区：{Intl.DateTimeFormat().resolvedOptions().timeZone}
        <br />
        跟随本机时区，关闭网页不提醒。
      </p>
      <button
        className="wide danger"
        onClick={() =>
          run(
            () => api("/shutdown", {}),
            "本地服务已退出，可用桌面快捷方式重新打开",
          )
        }
      >
        退出本地服务
      </button>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
