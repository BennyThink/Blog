import type { APIContext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { getRequestContext } from "emdash";
import { invalidateCachedPosts, invalidatePageCache, serveCachedPage } from "./theme/page-cache";
import { getThemeSettings, isPageCacheSize, isPostCacheTtl, isPrewarmTime, maxPageCacheMiB } from "./theme/settings";
import { cancelPagePrewarm, getPrewarmPlan, initializePagePrewarm, prewarmPlanPath, refreshPrewarmSchedule } from "./theme/page-prewarm";
import { recordPostView } from "./utils/post-views";

const publicPostComments = /^\/_emdash\/api\/comments\/posts\/([\w-]+)\/?$/;
const adminComments = /^\/_emdash\/api\/admin\/comments(?:\/|$)/;
const adminCommentItem = /^\/_emdash\/api\/admin\/comments\/([\w-]+)(?:\/status)?\/?$/;
const adminCommentBulk = /^\/_emdash\/api\/admin\/comments\/bulk\/?$/;
const cacheMutationPath = /^\/_emdash\/api\/(?:content|revisions|visual-editing|admin|import|menus|settings|site|taxonomies|widget-areas)(?:[/.]|$)/;
const themeSettingsPath = /^\/_emdash\/api\/admin\/plugins\/dmesg-theme\/settings\/?$/;

async function getAffectedPosts({ request, url, locals }: APIContext): Promise<string[]> {
  if (!locals.user || !locals.emdash?.db) return [];
  const item = adminCommentItem.exec(url.pathname);
  let ids: string[] = [];
  if (request.method === "POST" && adminCommentBulk.test(url.pathname)) {
    const body = await request.clone().json().catch(() => null);
    if (Array.isArray(body?.ids) && body.ids.length <= 100) {
      ids = body.ids.filter((id: unknown): id is string => typeof id === "string");
    }
  } else if (item && /^(PUT|PATCH|DELETE)$/.test(request.method)) {
    ids = [item[1]];
  }
  if (!ids.length) return [];

  const rows = await locals.emdash.db.selectFrom("_emdash_comments")
    .select("content_id").distinct().where("collection", "=", "posts")
    .where("id", "in", ids).execute();
  return rows.map(row => row.content_id);
}

export const onRequest = defineMiddleware(async (context, next) => {
  initializePagePrewarm();
  if (context.url.pathname === prewarmPlanPath) return getPrewarmPlan(context);

  const startedAt = Date.now();
  let response: Response | undefined;
  if (context.request.method === "POST" && /^\/_emdash\/api\/comments\/[^/]+\/[^/]+\/?$/.test(context.url.pathname)) {
    const requestContext = getRequestContext();
    if (requestContext) {
      if (context.request.headers.get("content-type")?.includes("application/json")) {
        const body = await context.request.clone().json().catch(() => null);
        requestContext.commentNotifyOnReply = body?.notifyOnReply === "1";
        if (typeof body?.parentId === "string") requestContext.commentReplyTargetId = body.parentId;
      }
      const cfIp = context.request.headers.get("cf-connecting-ip")?.trim();
      const forwardedFor = context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const candidate = cfIp || forwardedFor || context.clientAddress;
      requestContext.commentClientIp = candidate && /^[\da-fA-F.:]+$/.test(candidate) ? candidate.replace(/^::ffff:/, "") : null;
    }
    const blocked = (process.env.COMMENT_BLOCKED_IPS ?? "").split(",").map(value => value.trim()).filter(Boolean);
    if (blocked.length) {
      // Use the adapter's peer address; do not trust caller-supplied forwarding headers.
      let address = "";
      try { address = context.clientAddress.replace(/^::ffff:/, ""); } catch { /* Adapter has no peer address. */ }
      if (blocked.includes(address)) response = Response.json({ success: false, error: { code: "COMMENT_REJECTED", message: "评论不符合本站规则。" } }, { status: 403 });
    }
  }
  const { request, url } = context;
  if (request.method === "PUT" && themeSettingsPath.test(url.pathname) && context.locals.user) {
    const submitted = await request.clone().json().catch(() => null);
    const size = submitted?.values?.pageCacheSizeMiB;
    if (size !== undefined && !isPageCacheSize(size)) {
      response = Response.json({
        success: false,
        error: { code: "INVALID_REQUEST", message: `缓存容量必须是 1 到 ${maxPageCacheMiB} 之间的整数。` },
      }, { status: 400 });
    }
    const ttl = submitted?.values?.pageCachePostTtlSeconds;
    if (ttl !== undefined && !isPostCacheTtl(ttl)) {
      response = Response.json({
        success: false,
        error: { code: "INVALID_REQUEST", message: "页面缓存有效期必须为正整数秒。" },
      }, { status: 400 });
    }
    const time = submitted?.values?.pageCachePrewarmTime;
    if (time !== undefined && !isPrewarmTime(time)) {
      response = Response.json({
        success: false,
        error: { code: "INVALID_REQUEST", message: "请选择有效的预缓存时间。" },
      }, { status: 400 });
    }
  }
  const commentAdminRequest = adminComments.test(url.pathname);
  const affectedPosts = commentAdminRequest
    ? await getAffectedPosts(context).catch((error) => {
      console.error("Could not resolve posts for comment cache invalidation", error);
      return [];
    })
    : [];
  response ??= await serveCachedPage(context, next, recordPostView);
  if (response.ok && /^(POST|PUT|PATCH|DELETE)$/.test(request.method)) {
    const commentPost = request.method === "POST" && publicPostComments.exec(url.pathname);
    if (commentPost) invalidateCachedPosts([commentPost[1]]);
    else if (commentAdminRequest) invalidateCachedPosts(affectedPosts);
    else if (cacheMutationPath.test(url.pathname)) invalidatePageCache();
    if (request.method === "PUT" && themeSettingsPath.test(url.pathname)) {
      try {
        const settings = await getThemeSettings(context.locals, request);
        if (!settings.pageCacheEnabled) cancelPagePrewarm();
        await refreshPrewarmSchedule(settings);
      } catch (error) {
        console.warn("Could not apply page prewarm settings", error);
      }
    }
  }
  const cfIp = context.request.headers.get("cf-connecting-ip")?.trim();
  const clientIp = cfIp && /^[\da-fA-F.:]+$/.test(cfIp) ? cfIp.replace(/^::ffff:/, "") : "unknown";
  console.log(JSON.stringify({
    type: "http_access",
    timestamp: new Date().toISOString(),
    clientIp,
    userAgent: context.request.headers.get("user-agent") ?? "unknown",
    method: context.request.method,
    path: context.url.pathname,
    status: response.status,
    durationMs: Date.now() - startedAt,
  }));
  return response;
});
