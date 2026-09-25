import type { FastifyInstance } from "fastify";
import type { Store } from "./store.ts";
import { protect } from "./providers.ts";
import { isLocal } from "./access.ts";
import { z } from "zod";

const origin = "https://canvas.nus.edu.sg";
export async function canvasList(path: string, token: string, request: typeof fetch = fetch) {
  let next = new URL(path, origin).href;
  const rows: any[] = [], seen = new Set<string>();
  while (next) {
    const url = new URL(next);
    if (url.origin !== origin || !url.pathname.startsWith("/api/v1/") || url.username || url.password)
      throw Error("Canvas 返回了不允许的分页地址");
    if (seen.has(next) || seen.size >= 100) throw Error("Canvas 分页异常，请缩小读取范围");
    seen.add(next);
    const response = await request(next, { method: "GET", headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(response.status === 401 ? "Canvas 令牌无效或已过期，请重新连接" : `Canvas 读取失败（${response.status}），请稍后重试或检查权限`);
    const data = await response.json();
    if (!Array.isArray(data)) throw Error("Canvas 返回格式不正确");
    rows.push(...data);
    next = (response.headers.get("link") || "").split(",").map(x => x.match(/<([^>]+)>;\s*rel="next"/)).find(Boolean)?.[1] || "";
  }
  return rows;
}
export function registerCanvas(app: FastifyInstance, store: Store) {
  let running: Promise<any> | null = null;
  const state = () => ({ connected: !!store.get("canvas:credential"), ...(store.get("canvas:cache") || { courses: [], syncedAt: "" }) });
  async function sync(token: string) {
    const courses = await canvasList("/api/v1/courses?enrollment_state=active&per_page=100", token);
    const result = [];
    for (const course of courses.filter(c => Number.isSafeInteger(c.id) && c.name)) {
      const assignments = await canvasList(`/api/v1/courses/${course.id}/assignments?per_page=100&include[]=submission`, token);
      let modules: any[] = [], modulesError = "";
      try { modules = await canvasList(`/api/v1/courses/${course.id}/modules?per_page=100`, token); }
      catch { modulesError = "课程目录暂不可读取，请到 Canvas 查看"; }
      result.push({ modules: modules.map(m => ({ id: m.id, title: m.name, count: m.items_count })), modulesError, id: course.id, name: course.name, code: course.course_code || course.name,
        url: `${origin}/courses/${course.id}`, assignments: assignments.filter(a => Number.isSafeInteger(a.id)).map(a => ({
          description: String(a.description || ""), submissionTypes: a.submission_types || [], points: a.points_possible, allowedExtensions: a.allowed_extensions || [], id: a.id, title: String(a.name || "未命名作业"), due: a.due_at || null,
          url: `${origin}/courses/${course.id}/assignments/${a.id}`,
          submitted: !!a.submission?.submitted_at || ["submitted", "graded", "pending_review"].includes(a.submission?.workflow_state),
        })) });
    }
    const cache = { courses: result, syncedAt: new Date().toISOString() };
    store.set("canvas:cache", cache);
    return cache;
  }
  app.get("/api/canvas", state);
  app.get("/api/canvas/courses/:id/materials", async req => {
    const id = z.coerce.number().int().positive().parse((req.params as any).id);
    const course = state().courses.find((c: any) => c.id === id);
    if (!course) throw Error("请先同步课程");
    const key = `canvas:materials:${id}`;
    const cached = store.get<any>(key);
    if (cached && Date.now() - Date.parse(cached.syncedAt) < 300000) return cached;
    const credential = store.get<string>("canvas:credential");
    if (!credential) throw Error("请先连接 Canvas");
    const token = protect(credential, true), modules = [], warnings = [];
    let files: any[] = [];
    try { files = await canvasList(`/api/v1/courses/${id}/files?per_page=100`, token); }
    catch { warnings.push("文件区暂不可读取；可尝试下方课程目录中的材料。"); }
    for (const m of course.modules || []) {
      try {
        const items = await canvasList(`/api/v1/courses/${id}/modules/${m.id}/items?per_page=100`, token);
        modules.push({ id:m.id, title:m.title, items:items.map(i => ({ id:i.id, title:i.title, type:i.type,
          url: `${origin}/courses/${id}/modules/items/${i.id}` })) });
      } catch { warnings.push(`${m.title}暂不可读取，请到官网核对。`); }
    }
    const result = { syncedAt:new Date().toISOString(), warnings, modules, files:files.filter(f => !f.locked_for_user && !f.hidden_for_user).map(f => ({id:f.id,title:f.display_name || f.filename,size:f.size,url:`${origin}/courses/${id}/files/${f.id}` })) };
    // Partial failure is visible; never replace a good offline snapshot with incomplete data.
    if (warnings.length && cached) return {...cached,warnings};
    if (!warnings.length) store.set(key,result);
    return result;
  });
  app.put("/api/canvas/connection", async req => {
    if (!isLocal(req)) throw Error("请在电脑本机配置 Canvas 令牌");
    if (running) throw Error("正在同步，请稍后再连接");
    const { token } = z.object({ token: z.string().trim().min(20).max(1000).regex(/^[\x21-\x7e]+$/) }).parse(req.body);
    const encrypted = protect(token);
    running = sync(token);
    try { await running; store.set("canvas:credential", encrypted); return state(); }
    finally { running = null; }
  });
  app.post("/api/canvas/sync", async req => {
    if (running) { await running; return state(); }
    const credential = store.get<string>("canvas:credential");
    if (!credential) throw Error("请先连接 Canvas");
    if (!(req.body as any)?.force && Date.now() - Date.parse(state().syncedAt) < 5 * 60 * 1000) return state();
    running = sync(protect(credential, true));
    try { await running; return state(); } finally { running = null; }
  });
}
