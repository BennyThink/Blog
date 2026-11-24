import { randomUUID } from "node:crypto";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { finished } from "node:stream/promises";
import type { APIContext } from "astro";
import { postPath } from "../utils/post-url.ts";
import { getThemeSettings, isPrewarmTime, type ThemeSettings } from "./settings.ts";

const token = randomUUID();
const warmHeader = "X-Dmesg-Prewarm";
export const prewarmPlanPath = "/__dmesg-prewarm-plan";
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
type WarmSettings = Pick<ThemeSettings, "pageCacheEnabled" | "pageCachePrewarm" | "pageCachePrewarmTime">;
interface WarmPlan extends WarmSettings { paths: string[] }
interface WarmResult { completed: number; failed: number; capacityReached?: boolean; disabled?: boolean; cancelled?: boolean }

let active: { controller: AbortController; result: Promise<WarmResult>; all: boolean } | undefined;
let lastResult: (WarmResult & { finishedAt: string }) | undefined;
let lastError: string | undefined;
let currentSettings: WarmSettings | undefined;
let poll: ReturnType<typeof setInterval> | undefined;
let pendingUpdate: ReturnType<typeof setTimeout> | undefined;
const updatedPosts = new Set<string>();
let initialized = false;
let lastDailyRun = 0;

export function isPrewarmRequest(request: Request) {
  return request.headers.get(warmHeader) === token;
}

export async function getPrewarmPlan(context: APIContext) {
  if (!isPrewarmRequest(context.request) || !context.locals.emdash) {
    return new Response(null, { status: 404 });
  }
  const settings = await getThemeSettings(context.locals, context.request);
  const { pageCacheEnabled, pageCachePrewarm, pageCachePrewarmTime } = settings;
  const { getDb } = await import("emdash/runtime");
  const posts = pageCacheEnabled && context.url.searchParams.has("all") ? await (await getDb())
    .$extendTables<{ ec_posts: { slug: string; status: string; published_at: string | null; deleted_at: string | null } }>()
    .selectFrom("ec_posts").select("slug")
    .where("status", "=", "published").where("deleted_at", "is", null)
    .orderBy("published_at", "desc").orderBy("slug", "asc").execute() : [];
  return Response.json({
    pageCacheEnabled, pageCachePrewarm, pageCachePrewarmTime,
    paths: ["/", ...posts.map(post => postPath(post.slug))],
  } satisfies WarmPlan, { headers: { "Cache-Control": "no-store" } });
}

function localRequest(path: string, signal?: AbortSignal, host?: string): Promise<IncomingMessage> {
  const origin = process.env.DMESG_PREWARM_ORIGIN;
  if (!origin) return Promise.reject(new Error("预缓存暂不可用，请通过项目的启动命令运行网站。"));

  const url = new URL(origin);
  const [pathname, search] = path.split("?");
  url.pathname = pathname;
  url.search = search ?? "";
  const headers = { [warmHeader]: token, ...(host ? { Host: host } : {}) };
  // Preserve the browser's cache key while connecting only to this local listener.
  const timeout = AbortSignal.timeout(15_000);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    request(url, { headers, signal: signal ? AbortSignal.any([signal, timeout]) : timeout }, resolve)
      .on("error", reject).end();
  });
}

async function loadPlan(signal?: AbortSignal, all = false): Promise<WarmPlan> {
  const response = await localRequest(all ? prewarmPlanPath + "?all=1" : prewarmPlanPath, signal);
  if (response.statusCode !== 200) {
    response.resume();
    throw new Error("无法读取预缓存页面列表。");
  }
  response.setEncoding("utf8");
  let body = "";
  for await (const chunk of response) body += chunk;
  return JSON.parse(body) as WarmPlan;
}

async function warmPages(signal: AbortSignal, host?: string, slugs?: string[]): Promise<WarmResult> {
  const plan = await loadPlan(signal, !slugs);
  const result = { completed: 0, failed: 0 };
  if (!plan.pageCacheEnabled) return { ...result, disabled: true };

  for (const path of slugs ? ["/", ...slugs.map(postPath)] : plan.paths) {
    if (signal.aborted) break;
    try {
      const response = await localRequest(path, signal, host);
      const status = response.headers["x-emdash-cache"];
      response.resume();
      await finished(response, { cleanup: true });
      if (response.headers["x-dmesg-prewarm-capacity"] === "full") return { ...result, capacityReached: true };
      if (response.statusCode === 200 && (status === "HIT" || status === "MISS")) result.completed++;
      else result.failed++;
    } catch {
      if (!signal.aborted) result.failed++;
    }
  }
  return { ...result, cancelled: signal.aborted };
}

export function runPagePrewarm(host?: string, slugs?: string[]): Promise<WarmResult> {
  if (active) {
    if (!slugs && !active.all) return active.result.then(result => result.cancelled ? result : runPagePrewarm(host));
    return active.result;
  }
  const controller = new AbortController();
  lastError = undefined;
  const result = warmPages(controller.signal, host, slugs).then((summary) => {
    lastResult = { ...summary, finishedAt: new Date().toISOString() };
    return summary;
  }).catch(error => {
    if (controller.signal.aborted) return { completed: 0, failed: 0, cancelled: true };
    lastError = error instanceof Error ? error.message : "预缓存失败。";
    throw error;
  }).finally(() => {
    active = undefined;
  });
  active = { controller, result, all: !slugs };
  return result;
}

export function getPagePrewarmStatus() {
  return { running: Boolean(active), lastResult, error: lastError };
}

export function cancelPagePrewarm() {
  active?.controller.abort();
  if (pendingUpdate) clearTimeout(pendingUpdate);
  pendingUpdate = undefined;
  updatedPosts.clear();
}

function backgroundWarm(slugs?: string[]) {
  void runPagePrewarm(process.env.DMESG_PREWARM_HOST, slugs).catch(error => {
    console.warn("Page prewarm failed", error instanceof Error ? error.message : error);
  });
}

function checkDailyPrewarm() {
  const now = new Date();
  if (!currentSettings?.pageCacheEnabled || currentSettings.pageCachePrewarm !== "daily"
    || clock.format(now) !== currentSettings.pageCachePrewarmTime) return;
  const minute = Math.floor(now.getTime() / 60_000);
  if (lastDailyRun === minute) return;
  lastDailyRun = minute;
  backgroundWarm();
}

export async function refreshPrewarmSchedule(settings?: WarmSettings) {
  if (!process.env.DMESG_PREWARM_ORIGIN) return;
  currentSettings = settings ?? await loadPlan();
  if (poll) clearInterval(poll);
  poll = undefined;
  if (!currentSettings.pageCacheEnabled || !isPrewarmTime(currentSettings.pageCachePrewarmTime)) return;
  if (currentSettings.pageCachePrewarm === "daily") {
    poll = setInterval(checkDailyPrewarm, 15_000).unref();
    checkDailyPrewarm();
  }
}

export function initializePagePrewarm() {
  if (initialized || !process.env.DMESG_PREWARM_ORIGIN) return;
  initialized = true;
  void refreshPrewarmSchedule().then(() => {
    if (currentSettings?.pageCacheEnabled && currentSettings.pageCachePrewarm === "startup") backgroundWarm();
  }).catch(error => {
    initialized = false;
    console.warn("Could not read page prewarm settings", error instanceof Error ? error.message : error);
  });
}

export function queuePostPrewarm(slug?: string) {
  if (!currentSettings?.pageCacheEnabled || currentSettings.pageCachePrewarm !== "post") return;
  if (slug) updatedPosts.add(slug);
  if (pendingUpdate) clearTimeout(pendingUpdate);
  pendingUpdate = setTimeout(() => {
    pendingUpdate = undefined;
    if (!currentSettings?.pageCacheEnabled || currentSettings.pageCachePrewarm !== "post") {
      updatedPosts.clear();
      return;
    }
    if (active) queuePostPrewarm();
    else {
      const slugs = [...updatedPosts];
      updatedPosts.clear();
      backgroundWarm(slugs);
    }
  }, 500).unref();
}
