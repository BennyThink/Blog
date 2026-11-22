import React, { useEffect, useState } from "react";

interface TelegramSettings {
  enabled: boolean;
  channelId: string;
  ownerId: string;
  tokenConfigured: boolean;
}

async function request(route: string, method: "GET" | "POST", body?: Record<string, unknown>) {
  const response = await fetch(`/_emdash/api/plugins/dmesg-theme/${route}`, {
    method,
    headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const envelope = await response.json() as { success?: boolean; data?: unknown; error?: { message?: string } };
  if (!response.ok || envelope.success === false) throw new Error(envelope.error?.message ?? "请求失败，请稍后重试。");
  return envelope.data as Record<string, unknown>;
}

function TelegramSettingsPage() {
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    request("telegram-settings", "GET").then((value) => {
      if (!active) return;
      const current = value as unknown as TelegramSettings;
      setSettings(current);
      setEnabled(current.enabled);
      setChannelId(current.channelId);
      setOwnerId(current.ownerId);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "无法读取 Telegram 设置。");
    });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const saved = await request("telegram-settings", "POST", {
        enabled,
        channelId,
        ownerId,
        ...(token.trim() ? { token: token.trim() } : {}),
      }) as unknown as TelegramSettings;
      setSettings(saved);
      setToken("");
      if (enabled) {
        const setup = await request("telegram-setup", "POST", {}) as { ok?: boolean; message?: string; error?: string };
        if (!setup.ok) throw new Error(setup.error ?? "设置已保存，但 Webhook 注册失败。");
        setMessage("设置已保存，Telegram Webhook 已注册。");
      } else {
        setMessage("设置已保存，Telegram 通知已关闭。");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: "grid", gap: 6, marginBlock: 16, maxWidth: 520,
  };
  const inputStyle: React.CSSProperties = {
    boxSizing: "border-box", width: "100%", minHeight: 40, padding: "8px 10px",
    border: "1px solid var(--color-border, #cbd5e1)", borderRadius: 5,
    background: "var(--color-surface, white)", color: "var(--color-text, #111827)", font: "inherit",
  };

  return <main style={{ maxWidth: 760, padding: 24 }}>
    <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Telegram 通知</h1>
    <p style={{ margin: "0 0 24px", color: "var(--color-text-secondary, #64748b)" }}>
      首次发布通知频道；新评论私信 Owner，Owner 回复通知即可添加站点评论。
    </p>
    {!settings && !error && <p>正在读取设置…</p>}
    <form onSubmit={save}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} />
        启用 Telegram 文章与评论通知
      </label>
      {enabled && <section style={{ marginTop: 18, padding: 18, border: "1px solid var(--color-border, #e2e8f0)", borderRadius: 8 }}>
        <label style={fieldStyle}>
          <span>Bot Token</span>
          <input style={inputStyle} type="password" autoComplete="new-password" value={token} onChange={(event) => setToken(event.currentTarget.value)} placeholder={settings?.tokenConfigured ? "已配置；留空则保持当前 Token" : "从 BotFather 获取"} />
          <small>Token 加密保存在 EmDash 插件设置中。</small>
        </label>
        <label style={fieldStyle}>
          <span>Channel ID</span>
          <input style={inputStyle} value={channelId} onChange={(event) => setChannelId(event.currentTarget.value)} placeholder="例如 -1001234567890" />
        </label>
        <label style={fieldStyle}>
          <span>Owner ID</span>
          <input style={inputStyle} value={ownerId} onChange={(event) => setOwnerId(event.currentTarget.value)} placeholder="你的 Telegram 数字用户 ID" />
        </label>
        <p style={{ margin: 0, color: "var(--color-text-secondary, #64748b)" }}>
          Webhook 会自动注册到当前 EmDash 站点域名。站点需可从公网通过 HTTPS 访问；Owner 需先主动打开 Bot 私聊。
        </p>
      </section>}
      <button type="submit" disabled={busy || !settings} style={{ marginTop: 20, padding: "9px 16px", border: 0, borderRadius: 5, background: "var(--color-brand, #111827)", color: "white", font: "inherit", cursor: busy ? "wait" : "pointer" }}>
        {busy ? "正在保存…" : "保存设置"}
      </button>
      {message && <p role="status" style={{ color: "#15803d" }}>{message}</p>}
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    </form>
  </main>;
}

export const pages = { "/telegram": TelegramSettingsPage };
