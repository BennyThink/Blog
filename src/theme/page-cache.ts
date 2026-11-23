import type { APIContext } from "astro";
import { getRequestContext } from "emdash";
import { getThemeSettings } from "./settings.ts";

const homeTtl = 3 * 60_000;
const postTtl = 5 * 60_000;
const cacheHeader = "X-Emdash-Cache";

interface CachedPage {
  body: ArrayBuffer;
  headers: Headers;
  expiresAt: number;
  postId?: string;
  viewsVersion: number;
}

const pages = new Map<string, CachedPage>();
const postViews = new WeakMap<Request, string>();
let retainedBytes = 0;
let generation = 0;

export function invalidatePageCache() {
  generation++;
  pages.clear();
  retainedBytes = 0;
}

export function registerCachedPostView(request: Request, postId: string) {
  postViews.set(request, postId);
}

function removePage(key: string, page: CachedPage) {
  pages.delete(key);
  retainedBytes -= page.body.byteLength;
}

function withCacheHeader(response: Response, status: string) {
  const headers = new Headers(response.headers);
  headers.set(cacheHeader, status);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function serveCachedPage(context: APIContext, next: () => Promise<Response>, views: {
  record: (id: string) => void;
  version: () => number;
}) {
  const { locals, request, url } = context;
  const home = url.pathname === "/";
  const post = context.routePattern === "/[slug].html";
  if (!home && !post) return next();

  const scope = getRequestContext();
  if (!locals.emdash || locals.user || scope?.preview || scope?.editMode || scope?.dbIsIsolated
    || request.method !== "GET" || url.search || request.headers.has("cookie")
    || request.headers.has("origin") || request.headers.has("authorization") || request.headers.has("range")
    || request.headers.has("if-none-match") || request.headers.has("if-modified-since")) {
    return withCacheHeader(await next(), "BYPASS");
  }

  const key = url.origin + url.pathname;
  const viewsVersion = post ? views.version() : 0;
  const page = pages.get(key);
  if (page) {
    removePage(key, page);
    if (page.expiresAt > Date.now() && page.viewsVersion === viewsVersion) {
      pages.set(key, page);
      retainedBytes += page.body.byteLength;
      if (page.postId) views.record(page.postId);
      return withCacheHeader(new Response(page.body, { headers: page.headers }), "HIT");
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
    return withCacheHeader(response, "BYPASS");
  }

  const body = await response.arrayBuffer();
  const rendered = new Response(body, { headers, statusText: response.statusText });
  const budget = settings.pageCacheSizeMiB * 1024 * 1024;
  if (body.byteLength === 0 || body.byteLength > budget || generation !== renderGeneration) {
    return withCacheHeader(rendered, "BYPASS");
  }

  const previous = pages.get(key);
  if (previous) removePage(key, previous);
  pages.set(key, {
    body,
    headers: new Headers(headers),
    expiresAt: Date.now() + (home ? homeTtl : postTtl),
    postId: postViews.get(request),
    viewsVersion,
  });
  retainedBytes += body.byteLength;
  for (const [oldestKey, oldest] of pages) {
    if (retainedBytes <= budget) break;
    removePage(oldestKey, oldest);
  }
  return withCacheHeader(rendered, "MISS");
}
