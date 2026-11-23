import { defineMiddleware } from "astro:middleware";
import { getRequestContext } from "emdash";
import { invalidatePageCache, serveCachedPage } from "./theme/page-cache";
import { isPageCacheSize, maxPageCacheMiB } from "./theme/settings";
import { getPostViewsVersion, recordPostView } from "./utils/post-views";

const cacheMutationPath = /^\/_emdash\/api\/(?:content|revisions|visual-editing|admin|import|menus|settings|site|taxonomies|widget-areas|comments)(?:[/.]|$)/;
const themeSettingsPath = /^\/_emdash\/api\/admin\/plugins\/dmesg-theme\/settings\/?$/;

export const onRequest = defineMiddleware(async (context, next) => {
  const startedAt = Date.now();
  let response: Response | undefined;
  if (context.request.method === "POST" && /^\/_emdash\/api\/comments\/[^/]+\/[^/]+\/?$/.test(context.url.pathname)) {
    const requestContext = getRequestContext();
    if (requestContext) {
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
  }
  response ??= await serveCachedPage(context, next, { record: recordPostView, version: getPostViewsVersion });
  if (response.ok && /^(POST|PUT|PATCH|DELETE)$/.test(request.method) && cacheMutationPath.test(url.pathname)) {
    invalidatePageCache();
  }
  const cfIp = context.request.headers.get("cf-connecting-ip")?.trim();
  const clientIp = cfIp && /^[\da-fA-F.:]+$/.test(cfIp) ? cfIp.replace(/^::ffff:/, "") : "unknown";
  console.log(JSON.stringify({
    type: "http_access",
    timestamp: new Date().toISOString(),
    clientIp,
    method: context.request.method,
    path: context.url.pathname,
    status: response.status,
    durationMs: Date.now() - startedAt,
  }));
  return response;
});
