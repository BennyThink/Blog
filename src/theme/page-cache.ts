import type { APIContext } from "astro";
import { getRequestContext } from "emdash";
import { isPrewarmRequest } from "./page-prewarm.ts";
import { getThemeSettings, isPageCacheSize, publicDefaults } from "./settings.ts";

const cacheHeader = "X-Emdash-Cache";

interface CachedPage {
  body: ArrayBuffer;
  headers: Headers;
  expiresAt: number;
  postId?: string;
  countView?: boolean;
  home: boolean;
}

const pages = new Map<string, CachedPage>();
const renderedPosts = new WeakMap<Request, { postId: string; countView: boolean }>();
let retainedBytes = 0;
let generation = 0;
const requests = { HIT: 0, MISS: 0, BYPASS: 0 };
let evictions = 0;

export function getPageCacheStats(enabled: unknown, capacity: unknown) {
  const capacityMiB = isPageCacheSize(capacity) ? capacity : publicDefaults.pageCacheSizeMiB;
  let homeEntries = 0;
  for (const page of pages.values()) {
    if (page.home) homeEntries++;
  }

  return {
    enabled: typeof enabled === "boolean" ? enabled : publicDefaults.pageCacheEnabled,
    capacityBytes: capacityMiB * 1024 * 1024,
    retainedBytes,
    homeEntries,
    postEntries: pages.size - homeEntries,
    hits: requests.HIT,
    misses: requests.MISS,
    bypasses: requests.BYPASS,
    evictions,
  };
}

export function invalidatePageCache() {
  generation++;
  pages.clear();
  retainedBytes = 0;
}

export function invalidateCachedPosts(postIds: readonly string[]) {
  if (!postIds.length) return;
  // A render may not have resolved its post ID yet. Forbid in-flight cache writes.
  generation++;
  const affected = new Set(postIds);
  for (const [key, page] of pages) {
    if (page.postId && affected.has(page.postId)) removePage(key, page);
  }
}

export function registerCachedPost(request: Request, postId: string, countView: boolean) {
  renderedPosts.set(request, { postId, countView });
}

function removePage(key: string, page: CachedPage) {
  pages.delete(key);
  retainedBytes -= page.body.byteLength;
}

function withCacheHeader(response: Response, status: keyof typeof requests, prewarm: boolean) {
  const headers = new Headers(response.headers);
  headers.set(cacheHeader, status);
  if (!prewarm) requests[status]++;
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function serveCachedPage(context: APIContext, next: () => Promise<Response>, recordView: (id: string) => void) {
  const { locals, request, url } = context;
  const home = url.pathname === "/";
  const post = context.routePattern === "/[slug].html";
  if (!home && !post) return next();

  const prewarm = isPrewarmRequest(request);
  const scope = getRequestContext();
  // This site uses Astro's default session cookie name.
  const hasSessionCookie = context.cookies.has("astro-session") || context.cookies.has("emdash-edit-mode");
  if (!locals.emdash || locals.user || scope?.preview || scope?.editMode || scope?.dbIsIsolated
    || request.method !== "GET" || url.search || hasSessionCookie
    || request.headers.has("origin") || request.headers.has("authorization") || request.headers.has("range")
    || request.headers.has("if-none-match") || request.headers.has("if-modified-since")) {
    return withCacheHeader(await next(), "BYPASS", prewarm);
  }

  const key = url.origin + url.pathname;
  const page = pages.get(key);
  if (page) {
    removePage(key, page);
    if (page.expiresAt > Date.now()) {
      pages.set(key, page);
      retainedBytes += page.body.byteLength;
      if (!prewarm && page.postId && page.countView) recordView(page.postId);
      return withCacheHeader(new Response(page.body, { headers: page.headers }), "HIT", prewarm);
    }
  }

  const renderGeneration = generation;
  const settings = await getThemeSettings(locals, request);
  const response = await next();
  const headers = response.headers;
  if (!settings.pageCacheEnabled || response.status !== 200 || !response.body
    || !headers.get("content-type")?.toLowerCase().startsWith("text/html")
    || headers.has("set-cookie") || !context.cookies.headers().next().done
    || /\b(?:private|no-store|no-cache)\b/i.test(headers.get("cache-control") ?? "")
    || headers.get("vary")?.split(",").some(name => !["accept-encoding", "origin"].includes(name.trim().toLowerCase()))
    || generation !== renderGeneration) {
    return withCacheHeader(response, "BYPASS", prewarm);
  }

  const body = await response.arrayBuffer();
  const rendered = new Response(body, { headers, statusText: response.statusText });
  const budget = settings.pageCacheSizeMiB * 1024 * 1024;
  if (body.byteLength === 0 || generation !== renderGeneration || request.signal.aborted) {
    return withCacheHeader(rendered, "BYPASS", prewarm);
  }

  const previous = pages.get(key);
  if (prewarm && retainedBytes - (previous?.body.byteLength ?? 0) + body.byteLength > budget) {
    const now = Date.now();
    for (const [expiredKey, expired] of pages) {
      if (expired.expiresAt <= now) removePage(expiredKey, expired);
    }
    const replacedBytes = pages.get(key)?.body.byteLength ?? 0;
    if (retainedBytes - replacedBytes + body.byteLength > budget) {
      rendered.headers.set("X-Dmesg-Prewarm-Capacity", "full");
      return withCacheHeader(rendered, "BYPASS", prewarm);
    }
  }
  if (body.byteLength > budget) return withCacheHeader(rendered, "BYPASS", prewarm);
  const replaced = pages.get(key);
  if (replaced) removePage(key, replaced);
  pages.set(key, {
    body,
    headers: new Headers(headers),
    expiresAt: Date.now() + settings.pageCachePostTtlSeconds * 1000,
    ...renderedPosts.get(request),
    home,
  });
  retainedBytes += body.byteLength;
  for (const [oldestKey, oldest] of pages) {
    if (retainedBytes <= budget) break;
    removePage(oldestKey, oldest);
    evictions++;
  }
  return withCacheHeader(rendered, "MISS", prewarm);
}
