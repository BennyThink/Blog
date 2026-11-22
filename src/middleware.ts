import { defineMiddleware } from "astro:middleware";
import { getRequestContext } from "emdash";

export const onRequest = defineMiddleware(async (context, next) => {
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
      if (blocked.includes(address)) return Response.json({ success: false, error: { code: "COMMENT_REJECTED", message: "评论不符合本站规则。" } }, { status: 403 });
    }
  }
  return next();
});
