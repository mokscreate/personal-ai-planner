import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
export function executeSql(
  sql: string,
  lessonId: string,
  submit = false,
): Promise<any> {
  if (typeof sql !== "string" || !sql.trim() || sql.length > 20000)
    return Promise.reject(Error("请输入SQL，最多20000字符。"));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--max-old-space-size=128",
        "--import",
        "tsx",
        fileURLToPath(new URL("./sql-worker.ts", import.meta.url)),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    let settled = false;
    const finish = (err?: Error, value?: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(Error("查询超时，请检查递归或关联条件后重试。"));
    }, 5000);
    child.stdout.on("data", (b) => {
      output += b;
      if (output.length > 2e6) {
        child.kill();
        finish(Error("结果过大，请限制返回内容。"));
      }
    });
    child.stderr.resume();
    child.on("error", (e) => finish(e));
    child.on("close", () => {
      try {
        finish(undefined, JSON.parse(output));
      } catch {
        finish(Error("查询执行失败，请简化SQL后重试。"));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ sql, lessonId, submit }));
  });
}
