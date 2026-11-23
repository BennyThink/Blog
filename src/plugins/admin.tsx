import React, { useEffect, useState } from "react";
import type { getPageCacheStats } from "../theme/page-cache";
import type { getPagePrewarmStatus } from "../theme/page-prewarm";
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
  { id: "cache", label: "页面缓存", keys: ["pageCacheEnabled", "pageCacheSizeMiB", "pageCachePrewarm", "pageCachePrewarmTime"] },
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
        {name !== "pageCachePrewarm" && <option value="">请选择</option>}
        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>;
      break;
    case "number":
      input = <input id={id} type="number" value={text} min={field.min} max={field.max} step={name === "pageCacheSizeMiB" ? 1 : "any"}
        required={name === "pageCacheSizeMiB"}
        onChange={(event) => onChange(event.currentTarget.value === "" ? null : event.currentTarget.valueAsNumber)} />;
      break;
    default:
      input = name === "pageCachePrewarmTime"
        ? <input id={id} type="time" required value={text} onChange={(event) => onChange(event.currentTarget.value)} />
        : field.type === "string" && field.multiline
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

type PageCacheStats = ReturnType<typeof getPageCacheStats>;

async function requestCacheStats(method: "GET" | "POST", signal?: AbortSignal): Promise<PageCacheStats> {
  const response = await fetch("/_emdash/api/plugins/dmesg-theme/page-cache", {
    method, signal, cache: "no-store",
    headers: { "X-EmDash-Request": "1" },
  });
  const result = await response.json().catch(() => null) as {
    data?: PageCacheStats;
    error?: { message?: string };
  } | null;
  if (!response.ok || !result?.data) {
    throw new Error(result?.error?.message ?? "缓存操作失败，请重试。");
  }
  return result.data;
}

const numberFormat = new Intl.NumberFormat("zh-CN");
const mibFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });

function PageCacheMetrics({ stats }: { stats: PageCacheStats }) {
  const eligible = stats.hits + stats.misses;
  return <dl className="page-cache-metrics">
    <div><dt>状态</dt><dd>{stats.enabled ? "已启用" : "已关闭"}</dd></div>
    <div><dt>HTML 用量</dt><dd>{mibFormat.format(stats.retainedBytes / 1024 ** 2)} / {mibFormat.format(stats.capacityBytes / 1024 ** 2)} MiB
      （{percentFormat.format(stats.retainedBytes / stats.capacityBytes)}）</dd></div>
    <div><dt>缓存条目</dt><dd>首页 {numberFormat.format(stats.homeEntries)} · 文章 {numberFormat.format(stats.postEntries)}</dd></div>
    <div><dt>命中率</dt><dd>{eligible ? percentFormat.format(stats.hits / eligible) : "暂无数据"}</dd></div>
    <div><dt>请求统计</dt><dd>命中 {numberFormat.format(stats.hits)} · 未命中 {numberFormat.format(stats.misses)} · 绕过 {numberFormat.format(stats.bypasses)}</dd></div>
    <div><dt>容量淘汰</dt><dd>{numberFormat.format(stats.evictions)}</dd></div>
  </dl>;
}

function PageCacheWidget() {
  const [stats, setStats] = useState<PageCacheStats>();
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    requestCacheStats("GET", controller.signal).then(stats => {
      if (!controller.signal.aborted) setStats(stats);
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!stats) return <p role="status">正在读取缓存状态…</p>;
  return <>
    <PageCacheMetrics stats={stats} />
    <p className="page-cache-widget__note">当前 Node 进程，累计统计自进程启动起。</p>
  </>;
}

type PagePrewarmStatus = ReturnType<typeof getPagePrewarmStatus>;

async function requestPrewarm(method: "GET" | "POST", signal?: AbortSignal): Promise<PagePrewarmStatus> {
  const response = await fetch("/_emdash/api/plugins/dmesg-theme/page-cache-prewarm", {
    method, signal, cache: "no-store", headers: { "X-EmDash-Request": "1" },
  });
  const result = await response.json() as { data?: PagePrewarmStatus; error?: { message?: string } };
  if (!response.ok || !result.data) throw new Error(result.error?.message ?? "无法读取预缓存状态。");
  return result.data;
}

function PageCacheStatus() {
  const [stats, setStats] = useState<PageCacheStats>();
  const [pending, setPending] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>();
  const [refresh, setRefresh] = useState(0);
  const [prewarm, setPrewarm] = useState<PagePrewarmStatus>();
  const [starting, setStarting] = useState(false);
  const [prewarmError, setPrewarmError] = useState("");
  const prewarmRunning = prewarm?.running ?? false;

  useEffect(() => {
    if (starting || (prewarm && !prewarmRunning)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      requestPrewarm("GET", controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setPrewarm(result);
        setPrewarmError("");
        if (prewarmRunning && !result.running) setRefresh(previous => previous + 1);
      }).catch(() => {
        if (controller.signal.aborted) return;
        setPrewarmError("无法读取预缓存状态。");
        setPrewarm({ running: false, lastResult: undefined, error: undefined });
      });
    }, prewarmRunning ? 1_000 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [starting, prewarm]);

  async function prewarmNow() {
    setStarting(true);
    setPrewarmError("");
    try {
      setPrewarm(await requestPrewarm("POST"));
    } catch (error) {
      setPrewarmError(error instanceof Error ? error.message : "预缓存失败。");
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    requestCacheStats("GET", controller.signal).then(data => {
      if (!controller.signal.aborted) setStats(data);
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setFeedback({ text: error.message, error: true });
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false);
    });
    return () => controller.abort();
  }, [refresh]);

  async function clear() {
    setPending(true);
    setFeedback(undefined);
    try {
      setStats(await requestCacheStats("POST"));
      setFeedback({ text: "页面缓存已清空。" });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "清空失败，请重试。", error: true });
    } finally {
      setPending(false);
    }
  }

  return <section className="theme-settings__cache" aria-labelledby="page-cache-status" aria-busy={pending}>
    <h2 id="page-cache-status">缓存状态</h2>
    <p>当前 Node 进程，累计统计自进程启动起。</p>
    {stats && <PageCacheMetrics stats={stats} />}
    {pending && !stats && <p role="status">正在读取缓存状态…</p>}
    <div className="theme-settings__cache-actions">
      <button type="button" className="theme-settings__save" disabled={pending} onClick={() => {
        setPending(true);
        setFeedback(undefined);
        setRefresh((previous) => previous + 1);
      }}>刷新统计</button>
      <button type="button" className="theme-settings__save" disabled={pending || !stats} onClick={() => void clear()}>
        清空缓存
      </button>
      <button type="button" className="theme-settings__save" disabled={!stats?.enabled || pending || starting || prewarmRunning} onClick={() => void prewarmNow()}>
        {starting || prewarmRunning ? "预缓存中…" : "立即预缓存"}
      </button>
    </div>
    <p>提前生成首页和最新 20 篇文章，访客打开时更快。</p>
    {(prewarmError || prewarm?.error) && <p role="alert">{prewarmError || prewarm?.error}</p>}
    {!prewarmRunning && !starting && !prewarm?.error && prewarm?.lastResult && <p role="status">
      {prewarm.lastResult.disabled ? "请先启用页面缓存。" : prewarm.lastResult.cancelled ? "预缓存已取消。"
        : `已预缓存 ${prewarm.lastResult.completed} 页${prewarm.lastResult.failed ? `，失败 ${prewarm.lastResult.failed} 页` : ""}。`}
    </p>}
    {feedback && <p role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
  </section>;
}

function ThemeSettingsPage() {
  const [cacheRevision, setCacheRevision] = useState(0);
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
      if (tab.id === "cache") setCacheRevision((revision) => revision + 1);
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
        {active === index && tab.id === "cache" && <PageCacheStatus key={cacheRevision} />}
        {active === index && <form onSubmit={(event) => {
          event.preventDefault();
          void save(tab);
        }}>
          <fieldset disabled={busy} aria-label={tab.label}>
            {tab.keys.filter(key => key !== "pageCachePrewarmTime"
              || (draft.pageCachePrewarm ?? settings.values.pageCachePrewarm) === "daily")
              .map((key) => settings.schema[key] && <SettingsField key={key} name={key}
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
export const widgets = { "page-cache": PageCacheWidget };
