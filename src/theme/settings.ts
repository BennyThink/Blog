import type { SettingField } from "emdash";

export const maxPageCacheMiB = 128;

export function isPageCacheSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maxPageCacheMiB;
}

export const publicDefaults = {
  proxyUrl: "",
  pageCacheEnabled: true, pageCacheSizeMiB: 24,
  announcements: "", fortunes: true, searchPlaceholder: "搜索文章…",
  commentPlaceholder: "写下你的想法…", keywords: "", description: "",
  titleSeparator: " | ", copyright: "未经许可，请勿转载。", copyrightEnabled: true,
  footerText: "",
  telegramChannel: "", email: "", github: "", twitter: "", telegram: "",
  pangu: true, lightbox: true, transparentNav: true,
};
export type ThemeSettings = typeof publicDefaults;
export const settingsSchema: Record<string, SettingField> = {
  pageCacheEnabled: { type: "boolean", label: "启用页面缓存", default: publicDefaults.pageCacheEnabled },
  pageCacheSizeMiB: { type: "number", label: "缓存容量（MiB）", default: publicDefaults.pageCacheSizeMiB, min: 1, max: maxPageCacheMiB },
  telegramEnabled: { type: "boolean", label: "启用 Telegram 文章与评论通知", default: false },
  telegramBotToken: { type: "secret", label: "Telegram Bot Token" },
  telegramChannelId: { type: "string", label: "Telegram 频道 ID" },
  telegramOwnerId: { type: "string", label: "Telegram Owner ID" },
  announcements: { type: "string", label: "公告（每行一条，纯文本）", multiline: true },
  fortunes: { type: "boolean", label: "动态格言", default: true },
  searchPlaceholder: { type: "string", label: "搜索框占位文本", default: publicDefaults.searchPlaceholder },
  commentPlaceholder: { type: "string", label: "评论占位文本", default: publicDefaults.commentPlaceholder },
  keywords: { type: "string", label: "网站关键词" },
  description: { type: "string", label: "网站描述（页面无摘要时使用）" },
  titleSeparator: { type: "string", label: "标题分隔符", default: " | " },
  copyright: { type: "string", label: "文章版权声明", multiline: true, default: publicDefaults.copyright },
  copyrightEnabled: { type: "boolean", label: "显示文章版权", default: true },
  footerText: { type: "string", label: "页脚版权栏 HTML（仅可信 HTML）", multiline: true },
  telegramChannel: { type: "url", label: "Telegram 频道地址" },
  email: { type: "email", label: "联系邮箱" },
  github: { type: "url", label: "GitHub 地址" },
  twitter: { type: "url", label: "Twitter 地址" },
  telegram: { type: "string", label: "Telegram 用户名（不含 @）" },
  pangu: { type: "boolean", label: "中英文自动间距", default: true },
  lightbox: { type: "boolean", label: "正文图片灯箱", default: true },
  transparentNav: { type: "boolean", label: "半透明导航", default: true },
  headCode: { type: "string", label: "头部公共代码（仅可信 HTML）", multiline: true },
  analyticsCode: { type: "string", label: "流量统计代码（仅可信 HTML）", multiline: true },
  footerCode: { type: "string", label: "页尾公共代码（仅可信 HTML）", multiline: true },
  requireChinese: { type: "boolean", label: "评论须含汉字并过滤日文", default: false },
  blockedKeywords: { type: "string", label: "评论关键词黑名单（每行一项）", multiline: true },
  blockedEmails: { type: "string", label: "评论邮箱黑名单（每行一项）", multiline: true },
  maxLinkLength: { type: "number", label: "评论内链接最大长度（0 不限制）", default: 0, min: 0 },
  mixedAvatars: { type: "boolean", label: "启用混合评论头像（关闭后使用默认头像）", default: true },
  qqAvatars: { type: "boolean", label: "优先使用 QQ 邮箱头像", default: true },
	  akismetApiKey: { type: "secret", label: "Akismet API Key（留空关闭）" },
	proxyUrl: { type: "url", label: "WebP Cloud Services Proxy URL（留空关闭）" },
};

export async function readPublicSettings(settings: { get<T>(key: string): Promise<T | null> }): Promise<ThemeSettings> {
  const entries = await Promise.all(Object.entries(publicDefaults).map(async ([key, fallback]) => {
    const value = await settings.get(key);
    if (key === "pageCacheSizeMiB") return [key, isPageCacheSize(value) ? value : fallback];
    return [key, typeof value === typeof fallback ? value : fallback];
  }));
  return Object.fromEntries(entries) as ThemeSettings;
}

const perRequestSettings = new WeakMap<Request, Promise<ThemeSettings>>();

export async function getThemeSettings(locals: App.Locals, request: Request): Promise<ThemeSettings> {
  const cached = perRequestSettings.get(request);
  if (cached) return cached;
  const pending = loadThemeSettings(locals, request);
  perRequestSettings.set(request, pending);
  return pending;
}

async function loadThemeSettings(locals: App.Locals, request: Request): Promise<ThemeSettings> {
  const result = await locals.emdash.handlePublicPluginApiRoute("dmesg-theme", "GET", "/settings", request);
  if (!result.success || !result.data) return { ...publicDefaults };
  return { ...publicDefaults, ...result.data as Partial<ThemeSettings> };
}

export function safeSocialUrl(value: string): string | undefined {
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) ? u.href : undefined; }
  catch { return undefined; }
}
