import React, {useEffect,useState} from "react";
export function CanvasMaterials({courseId,api}:{courseId:string;api:(p:string)=>Promise<any>}) {
  const [data,setData]=useState<any>(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;setData(null);setError("");api(`/canvas/courses/${courseId}/materials`).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[courseId]);
  return <section className="canvas-materials"><h3>Canvas 课堂材料</h3><p>按老师发布的目录整理。点击材料名称打开原文件或课程页面。</p>
    {error && <p role="alert">{error}</p>}{!data&&!error&&<p role="status">正在读取该课程材料…</p>}
    {data&&<>{data.warnings.map((w:string)=><p key={w} role="status">{w}</p>)}
      {data.modules.map((m:any)=><details key={m.id}><summary>{m.title} · {m.items.length}项</summary><ul>{m.items.map((i:any)=><li key={i.id}>{i.type==="SubHeader"?<strong>{i.title}</strong>:<a href={i.url} target="_blank" rel="noreferrer">{i.title} ↗</a>}</li>)}</ul></details>)}
      <details><summary>全部可访问文件（{data.files.length}份）</summary><ul>{data.files.map((f:any)=><li key={f.id}><a href={f.url} target="_blank" rel="noreferrer">{f.title} ↗</a></li>)}</ul></details>
      {!data.modules.length&&!data.files.length&&<p>没有读取到材料；可能尚未发布或放在外部教学工具里。</p>}
    </>}
  </section>;
}
