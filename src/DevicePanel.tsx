import React, { useEffect, useState } from "react";
type Api = (path: string, body?: unknown, method?: string) => Promise<any>;
export function DevicePanel({ api }: { api: Api }) {
  const [info, setInfo] = useState<any>(null),
    [code, setCode] = useState<any>(null),
    [error, setError] = useState("");
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  useEffect(() => {
    api("/devices")
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, []);
  if (info?.cloud)
    return (
      <section className="provider">
        <h3>云端同步</h3>
        <p>手机和电脑打开同一网址，登录后共用日程、对话和学习记录。</p>
        <p className="muted">
          打开、切回页面或恢复网络时更新；修改后保存，不定时轮询。
        </p>
        <a href={info.origin}>{info.origin}</a>
        <p>
          <button
            onClick={async () => {
              await api("/logout", {});
              location.assign("/connect");
            }}
          >
            退出此设备
          </button>
        </p>
      </section>
    );
  return (
    <section className="provider">
      <h3>手机与电脑互通</h3>
      <p className="muted">
        当前为本机版本，打开或切回页面时更新数据。局域网连接仍需电脑开机并处于同一Wi-Fi；云端部署完成后可跨网络使用。
      </p>
      {local ? (
        <>
          {info?.urls.map((url: string) => (
            <p key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            </p>
          ))}
          <p className="muted">
            {info?.enabled ? "局域网已开启" : "局域网未开启"} · 已配对
            {info?.count || 0}台设备
          </p>
          <button
            className="primary"
            disabled={!info?.enabled}
            onClick={async () => {
              try {
                setCode(await api("/devices/pairing", {}));
                setError("");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            生成手机配对码
          </button>
          {code && (
            <p style={{ padding: "12px", fontSize: 20, letterSpacing: 2 }}>
              <strong>{code.code}</strong>
              <small
                style={{ display: "block", fontSize: 11, letterSpacing: 0 }}
              >
                10分钟内有效，仅能使用一次。在手机连接页输入。
              </small>
            </p>
          )}
          <button
            onClick={async () => {
              try {
                await api("/devices/revoke", {});
                setCode(null);
                setInfo(await api("/devices"));
                setError("已撤销全部手机连接");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            撤销全部手机连接
          </button>
        </>
      ) : (
        <p>此设备已连接电脑。可在电脑端撤销访问权限。</p>
      )}
      <p className="muted">
        当前是同一局域网的HTTP连接，请在可信Wi-Fi下使用；手机浏览器可能禁用麦克风，可用手机键盘语音输入。外网访问尚未配置。
      </p>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
