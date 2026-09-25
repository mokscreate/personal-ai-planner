import React, { useEffect, useState } from "react";
import { assignmentName, canvasDeadline, type Snapshot, type Assignment } from "./CanvasPanel";
export function useCanvasDeadlines(api: (p:string,b?:unknown)=>Promise<any>, enabled: boolean) {
  const [data,setData] = useState<Snapshot|null>(null), [error,setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true, busy = false;
    const load = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy=true;
      try { const cached = await api("/canvas"); if(active) setData(cached); if(cached.connected) { const fresh=await api("/canvas/sync",{}); if(active) { setData(fresh); setError(""); } } }
      catch { if(active) setError("Canvas 暂未更新，显示上次同步的截止日期"); }
      finally {busy=false;}
    };
    void load(); window.addEventListener("focus",load); document.addEventListener("visibilitychange",load);
    return () => {active=false;window.removeEventListener("focus",load);document.removeEventListener("visibilitychange",load);};
  },[enabled]);
  return {data,error};
}
export function deadlineWindow(due: string, date: string) {
  const end=Date.parse(due), start=end-3600000, day=Date.parse(date+"T00:00:00+08:00");
  if (!Number.isFinite(end) || end<=day || start>=day+86400000) return null;
  return {start:Math.max(0,(start-day)/60000),end:Math.min(1440,(end-day)/60000)};
}
export function CanvasDeadlines({data,date,hourHeight,onSelect}: {data:Snapshot|null;date:string;hourHeight:number;onSelect:(a:Assignment & {course:string})=>void}) {
  if(!data?.connected) return null;
  const items=data.courses.flatMap(c=>c.assignments.filter(a=>a.due).map(a=>({...a,course:c.code,window:deadlineWindow(a.due!,date)}))).filter(a=>a.window && a.window.end>480);
  return <>{items.map(a=> {
    const w=a.window!, peers=items.filter(b=>b.window!.start<w.end && b.window!.end>w.start), lane=peers.indexOf(a), count=peers.length;
    const label=`${a.course} · ${assignmentName(a.title)}`, due=canvasDeadline(a.due);
    return <button type="button" className="event-block canvas-deadline-block" key={a.id}
      style={{top:(Math.max(480,w.start)-480)/60*hourHeight,height:Math.max(12,(w.end-Math.max(480,w.start))/60*hourHeight-3),left:`calc(${lane/count*100}% + 3px)`,width:`calc(${100/count}% - 6px)`,right:"auto"}}
      onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSelect(a);}} onDoubleClick={e=>e.stopPropagation()}
      title={`${label} · ${due.date} ${due.time}截止 · 截止前1小时${a.submitted?' · 已提交':''}`}>
      <strong>{a.submitted?'✓ ':''}{label}</strong><span>{due.time} 截止</span>
    </button>;
  })}</>;
}
