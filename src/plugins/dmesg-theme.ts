import { definePlugin } from "emdash";
import type { PluginAdminConfig } from "emdash";
import { createHash } from "node:crypto";
import { readPublicSettings, settingsSchema } from "../theme/settings.ts";
import { rejectsComment, type CommentRules } from "./comment-rules.ts";
import { portableTextBlocks } from "./portable-text/config.mjs";

export function createPlugin() {
  return definePlugin({
    id: "dmesg-theme", displayName: "土豆 · 主题与功能", version: "0.1.0",
    description: "旧站主题适配、公告、SEO、评论规则及首次发布通知。",
    storage: { likes: { indexes: ["postId"] } },
    capabilities: ["hooks.page-fragments:register", "users:read", "comments:read", "content:read", "hooks.content-policy:register"],
    admin: { settingsSchema, portableTextBlocks: portableTextBlocks as PluginAdminConfig["portableTextBlocks"] },
    routes: {
      "like-count": {
        public: true,
        methods: ["GET"],
        handler: async (route) => {
          const input = route.input && typeof route.input === "object" ? route.input as Record<string, unknown> : {};
          const postId = input.postId;
          if (typeof postId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(postId)) return { ok: false, error: "INVALID_POST" };
          const post = await route.content!.get("posts", postId);
          if (!post || post.status !== "published") return { ok: false, error: "POST_NOT_FOUND" };
          const count = await route.storage.likes.count({ postId });
          const browserId = input.browserId;
          const alreadyLiked = typeof browserId === "string" && /^[a-f0-9-]{36}$/i.test(browserId)
            ? await route.storage.likes.exists(createHash("sha256").update(`${postId}:${browserId}`).digest("hex"))
            : false;
          return { ok: true, count, alreadyLiked };
        },
      },
      like: {
        public: true,
        methods: ["POST"],
        request: { body: "json" },
        handler: async (route) => {
          const input = route.input && typeof route.input === "object" ? route.input as Record<string, unknown> : {};
          const postId = input.postId;
          const browserId = input.browserId;
          if (typeof postId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(postId) ||
              typeof browserId !== "string" || !/^[a-f0-9-]{36}$/i.test(browserId)) {
            return { ok: false, error: "INVALID_INPUT" };
          }
          const post = await route.content!.get("posts", postId);
          if (!post || post.status !== "published") return { ok: false, error: "POST_NOT_FOUND" };

          // One durable vote per browser identity and post, even if the browser marker is cleared.
          const voteId = createHash("sha256").update(`${postId}:${browserId}`).digest("hex");
          const result = await route.storage.likes.compareAndSet(voteId, null, { postId });
          const count = await route.storage.likes.count({ postId });
          return { ok: true, liked: result.applied, count };
        },
      },
      settings: { public: true, methods: ["GET"], handler: async (ctx) => readPublicSettings(ctx.settings) },
      avatar: { public: true, methods: ["GET"], handler: async (ctx) => {
        if ((await ctx.settings.get<boolean>("mixedAvatars")) === false) return null;
        const input = ctx.input && typeof ctx.input === "object" ? ctx.input as Record<string, unknown> : {};
        if (typeof input.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.id)) return null;
        const comment = await ctx.comments!.get(input.id);
        if (!comment || comment.status !== "approved") return null;
        const content = await ctx.content!.get(comment.collection, comment.contentId);
        if (!content || content.status !== "published") return null;
        const email = comment.authorEmail.trim().toLowerCase();
        const hash = createHash("md5").update(email).digest("hex");
        const qqEnabled = (await ctx.settings.get<boolean>("qqAvatars")) !== false;
        const qq = qqEnabled ? /^([1-9][0-9]{4,11})@qq\.com$/.exec(email)?.[1] : undefined;
        // Use a stable per-email fallback so the selected local avatar survives reloads.
        const fallback = Number.parseInt(hash.slice(0, 8), 16) % 19 + 1;
        return { qq: qq ? `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=100` : null,
          gravatar: `https://www.gravatar.com/avatar/${hash}?s=80&d=404`,
          fallback: `/theme/avatars/${fallback}.png` };
      } },
    },
    hooks: {
      "page:metadata": async (_event, ctx) => {
        const keywords = await ctx.settings.get<string>("keywords");
        return keywords ? { kind: "meta", name: "keywords", content: keywords } : null;
      },
      "page:fragments": async (_event, ctx) => {
        const fragments = [];
        for (const [key, placement] of [["headCode", "head"], ["analyticsCode", "body:end"], ["footerCode", "body:end"]] as const) {
          const html = await ctx.settings.get<string>(key);
          if (html) fragments.push({ kind: "html" as const, placement, key: `dmesg-${key}`, html });
        }
        return fragments;
      },
      "comment:beforeCreate": async (event, ctx) => {
        if (event.comment.collection === "pages") {
          const page = await ctx.content!.get("pages", event.comment.contentId);
          if (page?.slug !== "message") return false;
        }
        // Only CMS users exist; do not apply visitor filters to the owner.
        if (event.comment.authorUserId) return;
        const defaults: CommentRules = { requireChinese: false, blockedKeywords: "", blockedEmails: "", blockedIpHashes: "", blockLinks: false, maxLinkLength: 0 };
        const rules = Object.fromEntries(await Promise.all(Object.entries(defaults).map(async ([key, fallback]) => {
          const value = await ctx.settings.get(key);
          return [key, typeof value === typeof fallback ? value : fallback];
        }))) as unknown as CommentRules;
        if (rejectsComment(event.comment, rules)) return false;
      },
      "content:beforeSchedule": async (event, ctx) => {
        if (event.collection !== "posts" || event.content.publishedAt || !event.actor) return;
        if (!["api", "mcp", "visual-editor"].includes(event.origin.source)) return;
        if (await ctx.settings.get<boolean>("telegramEnabled")) await ctx.kv.set(`eligible:${event.content.id}`, true);
      },
      "content:beforePublish": async (event, ctx) => {
        if (event.collection !== "posts") return;
        const key = `eligible:${event.content.id}`;
        // A human-scheduled first publication may retain its marker for the scheduler.
        if (event.origin.source === "scheduler" && !event.content.publishedAt) return;
        await ctx.kv.delete(key);
        // Imports/system/plugin writes never receive an eligibility marker.
        if (!["api", "mcp", "visual-editor"].includes(event.origin.source)) return;
        if (event.content.publishedAt || !event.actor) return;
        if (!(await ctx.settings.get<boolean>("telegramEnabled"))) return;
        await ctx.kv.set(key, true);
      },
      "content:afterPublish": { timeout: 10000, errorPolicy: "continue", handler: async (event, ctx) => {
        if (event.collection !== "posts") return;
        const id = String(event.content.id);
        if (!(await ctx.kv.get(`eligible:${id}`))) return;
        await ctx.kv.delete(`eligible:${id}`);
        if (!(await ctx.settings.get<boolean>("telegramEnabled"))) return;
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        const siteUrl = process.env.EMDASH_SITE_URL;
        if (!token || !chatId || !siteUrl || !event.content.slug) return;
        // Claim once before sending; never duplicate on an updated live revision.
        const claim = await ctx.kv.compareAndSet(`notified:${id}`, null, "attempted");
        if (!claim.applied) return;
        const data = event.content.data as Record<string, unknown>;
        const url = new URL(`/${encodeURIComponent(String(event.content.slug))}.html`, siteUrl).href;
        try {
          const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: `新的博文《 ${data.title ?? ""} 》发布了\n${url}` }),
            signal: AbortSignal.timeout(8000),
          });
          const result = await response.json() as { ok?: boolean };
          if (!response.ok || !result.ok) throw new Error("delivery failed");
          await ctx.kv.set(`notified:${id}`, "sent");
        } catch { ctx.log.error("Telegram 通知未确认送达；为避免重复发送，不自动重试。", { contentId: id }); }
      } },
    },
  });
}
