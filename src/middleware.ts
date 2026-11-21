import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.request.method === "POST" && /^\/_emdash\/api\/comments\/[^/]+\/[^/]+\/?$/.test(context.url.pathname)) {
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
