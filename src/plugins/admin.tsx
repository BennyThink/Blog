import React, { useEffect, useState } from "react";
import type { SettingField } from "emdash";
import "./admin.css";

const tabs = [
  { id: "appearance", label: "外观与阅读", keys: [
    "announcements", "fortunes", "searchPlaceholder", "copyrightEnabled", "copyright",
    "footerText", "pangu", "lightbox", "transparentNav",
  ] },
  { id: "seo", label: "SEO", keys: ["keywords", "description", "titleSeparator"] },
  { id: "social", label: "社交与联系", keys: ["telegramChannel", "telegram", "email", "github", "twitter"] },
  { id: "comments", label: "评论与反垃圾", keys: [
    "commentPlaceholder", "requireChinese", "blockedKeywords", "blockedEmails",
    "maxLinkLength", "mixedAvatars", "qqAvatars", "akismetApiKey",
  ] },
  { id: "telegram", label: "Telegram 通知", keys: [
    "telegramEnabled", "telegramBotToken", "telegramChannelId", "telegramOwnerId",
  ] },
  { id: "cache", label: "页面缓存", keys: ["pageCacheEnabled", "pageCacheSizeMiB"] },
  { id: "services", label: "代码与服务", keys: ["headCode", "analyticsCode", "footerCode", "proxyUrl"] },
];

type FieldValue = string | number | boolean | null;
type Draft = Record<string, FieldValue>;
interface Settings {
  schema: Record<string, SettingField>;
  values: Draft;
  secretsSet: Record<string, boolean>;
}
interface Feedback {
  text: string;
  error?: boolean;
}

async function requestSettings(values?: Draft, signal?: AbortSignal): Promise<Settings> {
  const response = await fetch("/_emdash/api/admin/plugins/dmesg-theme/settings", {
    method: values ? "PUT" : "GET",
    headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
    body: values ? JSON.stringify({ values }) : undefined,
    signal,
  });
  const result = await response.json().catch(() => null) as {
    data?: Settings;
    error?: { message?: string };
  } | null;
  if (!response.ok || !result?.data) {
    throw new Error(result?.error?.message ?? "无法读取或保存主题设置，请检查登录状态后重试。");
  }
  return result.data;
}

function SettingsField({ name, field, value, secretSet, onChange }: {
  name: string;
  field: SettingField;
  value: FieldValue | undefined;
  secretSet: boolean;
  onChange: (value: FieldValue) => void;
}) {
  const id = `theme-setting-${name}`;
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (field.type === "boolean") {
    return <label className="theme-settings__toggle">
      <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.currentTarget.checked)} />
      {field.label}
    </label>;
  }

  let input;
  switch (field.type) {
    case "secret":
      input = <>
        <input id={id} type="password" autoComplete="new-password" value={text}
          placeholder={secretSet ? "已配置，留空保留当前值" : "未配置"}
          onChange={(event) => onChange(event.currentTarget.value)} />
        {(secretSet || value === null) && <label className="theme-settings__toggle">
          <input type="checkbox" checked={value === null}
            onChange={(event) => onChange(event.currentTarget.checked ? null : "")} />
          保存时清除密钥
        </label>}
      </>;
      break;
    case "select":
      input = <select id={id} value={text} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">请选择</option>
        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>;
      break;
    case "number":
      input = <input id={id} type="number" value={text} min={field.min} max={field.max} step={name === "pageCacheSizeMiB" ? 1 : "any"}
        required={name === "pageCacheSizeMiB"}
        onChange={(event) => onChange(event.currentTarget.value === "" ? null : event.currentTarget.valueAsNumber)} />;
      break;
    default:
      input = field.type === "string" && field.multiline
        ? <textarea id={id} rows={4} value={text} onChange={(event) => onChange(event.currentTarget.value)} />
        : <input id={id} type={field.type === "string" ? "text" : field.type} value={text}
            placeholder={"placeholder" in field ? field.placeholder : undefined}
            onChange={(event) => onChange(event.currentTarget.value)} />;
  }

  return <div className="theme-settings__field">
    <label htmlFor={id}>{field.label}</label>
    {input}
    {field.description && <small>{field.description}</small>}
  </div>;
}

function ThemeSettingsPage() {
  const [active, setActive] = useState(0);
  const [settings, setSettings] = useState<Settings>();
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<Record<string, Feedback | undefined>>({});

  useEffect(() => {
    const controller = new AbortController();
    requestSettings(undefined, controller.signal).then(setSettings).catch((error: Error) => {
      if (!controller.signal.aborted) setLoadError(error.message);
    });
    return () => controller.abort();
  }, []);

  function edit(tabId: string, key: string, value: FieldValue) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setFeedback((previous) => ({ ...previous, [tabId]: undefined }));
  }

  async function save(tab: typeof tabs[number]) {
    if (!settings || busy) return;

    const updates: Draft = {};
    for (const key of tab.keys) {
      if (!Object.hasOwn(draft, key)) continue;
      const value = draft[key];
      const field = settings.schema[key];
      if (!field || (field.type === "secret" && value === "")) continue;
      const normalized = value === "" ? null : value;
      if (field.type !== "secret" && normalized === settings.values[key]) continue;
      updates[key] = normalized;
    }
    if (!Object.keys(updates).length) {
      setFeedback((previous) => ({ ...previous, [tab.id]: { text: "没有需要保存的更改。" } }));
      return;
    }

    setBusy(true);
    setFeedback((previous) => ({ ...previous, [tab.id]: undefined }));
    try {
      setSettings(await requestSettings(updates));
      setDraft((previous) => {
        const remaining = { ...previous };
        for (const key of tab.keys) delete remaining[key];
        return remaining;
      });
      setFeedback((previous) => ({ ...previous, [tab.id]: { text: "设置已保存。" } }));
    } catch (error) {
      setFeedback((previous) => ({
        ...previous, [tab.id]: { text: error instanceof Error ? error.message : "保存失败，请重试。", error: true },
      }));
    } finally {
      setBusy(false);
    }
  }

  return <div className="theme-settings">
    <h1>主题设置</h1>
    {loadError && <p role="alert">{loadError}</p>}
    {!settings && !loadError && <p role="status">正在读取设置…</p>}
    {settings && <>
      <div role="tablist" aria-label="设置分类" className="theme-settings__tabs">
        {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab"
          id={`theme-tab-${tab.id}`} aria-controls={`theme-panel-${tab.id}`}
          aria-selected={active === index} tabIndex={active === index ? 0 : -1}
          onClick={() => setActive(index)}
          onKeyDown={(event) => {
            let next: number;
            switch (event.key) {
              case "ArrowLeft": next = (index + tabs.length - 1) % tabs.length; break;
              case "ArrowRight": next = (index + 1) % tabs.length; break;
              case "Home": next = 0; break;
              case "End": next = tabs.length - 1; break;
              default: return;
            }
            event.preventDefault();
            setActive(next);
            document.getElementById(`theme-tab-${tabs[next].id}`)?.focus();
          }}>{tab.label}</button>)}
      </div>
      {tabs.map((tab, index) => <section key={tab.id} role="tabpanel" hidden={active !== index}
        id={`theme-panel-${tab.id}`} aria-labelledby={`theme-tab-${tab.id}`}>
        {active === index && <form onSubmit={(event) => {
          event.preventDefault();
          void save(tab);
        }}>
          <fieldset disabled={busy} aria-label={tab.label}>
            {tab.keys.map((key) => settings.schema[key] && <SettingsField key={key} name={key}
              field={settings.schema[key]} secretSet={settings.secretsSet[key] === true}
              value={Object.hasOwn(draft, key) ? draft[key] : settings.values[key]}
              onChange={(value) => edit(tab.id, key, value)} />)}
            <button className="theme-settings__save" type="submit">{busy ? "正在保存…" : "保存此分类"}</button>
          </fieldset>
          {feedback[tab.id] && <p role={feedback[tab.id]?.error ? "alert" : "status"}>{feedback[tab.id]?.text}</p>}
        </form>}
      </section>)}
    </>}
  </div>;
}

export const pages = { "/settings": ThemeSettingsPage };
