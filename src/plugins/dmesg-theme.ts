import { getPageCacheStats, invalidateCachedPosts, invalidatePageCache } from "../theme/page-cache.ts";
import { cancelPagePrewarm, getPagePrewarmStatus, queuePostPrewarm, runPagePrewarm } from "../theme/page-prewarm.ts";
import { definePlugin } from "emdash";
import type { PluginAdminConfig, PluginContext } from "emdash";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getRequestContext } from "emdash";
import { readPublicSettings, settingsSchema } from "../theme/settings.ts";
import { rejectsComment, type CommentRules } from "./comment-rules.ts";
import { portableTextBlocks } from "./portable-text/config.mjs";
import { lookupIpLocation } from "./ip-location.ts";

export function createPlugin() {
  return definePlugin({
    id: "dmesg-theme", displayName: "土豆皮", version: "0.1.0",
    description: "旧站主题适配、公告、SEO、评论规则及 Telegram 通知。",
    storage: { likes: { indexes: ["postId"] } },
    capabilities: ["hooks.page-fragments:register", "users:read", "comments:read", "content:read", "hooks.content-policy:register", "network:request"],
    allowedHosts: ["api.telegram.org", "rest.akismet.com"],
    admin: {
      pages: [{ path: "/settings", label: "主题设置", icon: "settings" }],
      widgets: [{ id: "page-cache", title: "页面缓存", size: "half" }],
      settingsSchema,
      portableTextBlocks: portableTextBlocks as PluginAdminConfig["portableTextBlocks"],
    },
    routes: {
      "page-cache": {
        permission: "plugins:manage",
        methods: ["GET", "POST"],
        request: { body: "none" },
        handler: async (ctx) => {
          const [enabled, capacity] = await Promise.all([
            ctx.settings.get("pageCacheEnabled"),
            ctx.settings.get("pageCacheSizeMiB"),
          ]);
          if (ctx.request.method === "POST") {
            cancelPagePrewarm();
            invalidatePageCache();
          }
          return getPageCacheStats(enabled, capacity);
        },
      },
      "page-cache-prewarm": {
        permission: "plugins:manage",
        methods: ["GET", "POST"],
        request: { body: "none" },
        handler: async (ctx) => {
          if (ctx.request.method === "POST") {
            void runPagePrewarm(new URL(ctx.request.url).host).catch(() => {});
          }
          return getPagePrewarmStatus();
        },
      },
      "telegram-webhook": {
        public: true,
        methods: ["POST"],
        request: { body: "json" },
        handler: async (route) => {
          const token = await getTelegramToken(route);
          const ownerId = String(await route.settings.get<string>("telegramOwnerId") ?? "").trim();
          const enabled = await route.settings.get<boolean>("telegramEnabled");
          const expected = token ? telegramWebhookSecret(token) : "";
          const supplied = route.request.headers.get("x-telegram-bot-api-secret-token") ?? "";
          if (!enabled || !token || !ownerId || !constantTimeEqual(supplied, expected)) return { ok: true };

          const update = route.input && typeof route.input === "object" ? route.input as TelegramUpdate : {};
          const message = update.message;
          if (!message || String(message.from?.id ?? "") !== ownerId || !message.chat?.id || !message.reply_to_message?.message_id) return { ok: true };

          const updateKey = `telegram:handled:${update.update_id ?? ""}`;
          if (update.update_id !== undefined) {
            const claim = await route.kv.compareAndSet(updateKey, null, "processing");
            if (!claim.applied) return { ok: true };
          }
          let completed = false;
          try {
            const mappingKey = `telegram:comment:${message.chat.id}:${message.reply_to_message.message_id}`;
            const mapping = await route.kv.get<TelegramCommentMapping>(mappingKey);
            const body = message.text?.trim();
            if (!mapping || !body || body.startsWith("/")) { completed = true; return { ok: true }; }

            const siteUrl = route.site.url;
            const emailDomain = new URL(siteUrl).hostname || "localhost.local";
            const endpoint = new URL(`/_emdash/api/comments/${encodeURIComponent(mapping.collection)}/${encodeURIComponent(mapping.contentId)}`, siteUrl);
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({
                authorName: "站长",
                authorEmail: `telegram-owner@${emailDomain}`,
                body,
                parentId: mapping.commentId,
              }),
              signal: AbortSignal.timeout(10000),
            });
            const result = await response.json() as { success?: boolean; data?: { status?: string }; error?: { code?: string } };
            if (!response.ok || result.success === false) {
              route.log.warn("Telegram 回复未能创建为站点评论。", { code: result.error?.code ?? "COMMENT_CREATE_FAILED" });
              return { ok: true };
            }
            completed = true;
            return { ok: true };
          } catch {
            route.log.error("处理 Telegram 回复失败。", { updateId: update.update_id });
            return { ok: true };
          } finally {
            if (update.update_id !== undefined) {
              if (completed) await route.kv.set(updateKey, "done");
              else await route.kv.delete(updateKey);
            }
          }
        },
      },
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
          let result: { applied: boolean };
          let count: number;
          try {
            result = await route.storage.likes.compareAndSet(voteId, null, { postId });
            count = await route.storage.likes.count({ postId });
          } catch (error) {
            route.log.error("主题点赞数据读写失败。", {
              postId,
              operation: "save_or_count_like",
              message: error instanceof Error ? error.message : "unknown",
            });
            return { ok: false, error: "LIKE_STORAGE_FAILED" };
          }
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
      "content:afterSave": async ({ collection, content }) => {
        if (collection !== "posts") return;
        invalidatePageCache();
        if (content.status === "published" && typeof content.slug === "string") queuePostPrewarm(content.slug);
      },
      "content:afterDelete": async ({ collection }) => { if (collection === "posts") invalidatePageCache(); },
      "content:afterUnpublish": async ({ collection }) => { if (collection === "posts") invalidatePageCache(); },
      "content:afterRestore": async ({ collection }) => { if (collection === "posts") invalidatePageCache(); },
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
        if (/^telegram-owner@/i.test(event.comment.authorEmail)) return;
        if (event.comment.collection === "pages") {
          const page = await ctx.content!.get("pages", event.comment.contentId);
          if (page?.slug !== "message") return false;
        }
        // Only CMS users exist; do not apply visitor filters to the owner.
        if (event.comment.authorUserId) return;
        const defaults: CommentRules = { requireChinese: false, blockedKeywords: "", blockedEmails: "", maxLinkLength: 0 };
        const rules = Object.fromEntries(await Promise.all(Object.entries(defaults).map(async ([key, fallback]) => {
          const value = await ctx.settings.get(key);
          return [key, typeof value === typeof fallback ? value : fallback];
        }))) as unknown as CommentRules;
        if (rejectsComment(event.comment, rules)) return false;
        const apiKey = String(await ctx.settings.get<string>("akismetApiKey") ?? "").trim();
        if (!apiKey) return;
        const params = new URLSearchParams({
          api_key: apiKey,
          blog: ctx.site.url,
          // EmDash stores only an IP hash in comment events; never send that hash as if it were a raw IP.
          user_ip: getRequestContext()?.commentClientIp ?? "",
          user_agent: event.comment.userAgent ?? "",
          comment_type: event.comment.parentId ? "reply" : "comment",
          comment_author: event.comment.authorName,
          comment_author_email: event.comment.authorEmail,
          comment_content: event.comment.body,
          blog_lang: "zh-CN",
          blog_charset: "UTF-8",
        });
        const content = await ctx.content!.get(event.comment.collection, event.comment.contentId);
        if (content?.slug) params.set("permalink", new URL(event.comment.collection === "posts" ? `/${encodeURIComponent(content.slug)}.html` : `/pages/${encodeURIComponent(content.slug)}`, ctx.site.url).href);
        try {
          const response = await ctx.http!.fetch("https://rest.akismet.com/1.1/comment-check", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params,
            signal: AbortSignal.timeout(8000),
          });
          const verdict = (await response.text()).trim().toLowerCase();
          if (verdict === "true") return false;
          if (verdict !== "false") ctx.log.warn("Akismet 返回无法识别的结果，评论继续按站点现有规则处理。", { status: response.status });
        } catch (error) {
          ctx.log.warn("Akismet 请求失败，评论继续按站点现有规则处理。", {
            collection: event.comment.collection,
            contentId: event.comment.contentId,
            message: error instanceof Error ? error.message : "unknown",
          });
        }
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
        invalidatePageCache();
        if (typeof event.content.slug === "string" && event.content.slug) queuePostPrewarm(event.content.slug);
        const id = String(event.content.id);
        if (!(await ctx.kv.get(`eligible:${id}`))) return;
        await ctx.kv.delete(`eligible:${id}`);
        if (!(await ctx.settings.get<boolean>("telegramEnabled"))) return;
        const token = await getTelegramToken(ctx);
        const chatId = String(await ctx.settings.get<string>("telegramChannelId") ?? "").trim();
        if (!token || !chatId || !event.content.slug) return;
        await registerTelegramWebhook(ctx, token);
        const data = event.content.data as Record<string, unknown>;
        const url = new URL(`/${encodeURIComponent(String(event.content.slug))}.html`, ctx.site.url).href;
        try {
          await telegramApi(ctx, token, "sendMessage", { chat_id: chatId, text: `新的博文《${data.title ?? ""}》发布了\n${url}` });
          ctx.log.info("Telegram 文章通知发送成功。", { contentId: id });
        } catch (error) { ctx.log.error("Telegram 文章通知发送失败。", { contentId: id, message: error instanceof Error ? error.message : "unknown" }); }
      } },
      "comment:afterModerate": async ({ comment }) => {
        if (comment.collection === "posts") invalidateCachedPosts([comment.contentId]);
      },
      "comment:afterCreate": async (event, ctx) => {
        if (event.content.collection === "posts") invalidateCachedPosts([event.content.id]);
        if (event.comment.status === "spam" || /^telegram-owner@/i.test(event.comment.authorEmail)) return;
        if (!(await ctx.settings.get<boolean>("telegramEnabled"))) return;
        const token = await getTelegramToken(ctx);
        const ownerId = String(await ctx.settings.get<string>("telegramOwnerId") ?? "").trim();
        if (!token || !ownerId) return;
        if (!(await registerTelegramWebhook(ctx, token))) return;
        const postUrl = new URL(`/${encodeURIComponent(event.content.slug)}.html#comment-${encodeURIComponent(event.comment.id)}`, ctx.site.url).href;
        try {
          const clientIp = getRequestContext()?.commentClientIp ?? null;
          const location = await lookupIpLocation(clientIp);
          const sent = await telegramApi(ctx, token, "sendMessage", {
            chat_id: ownerId,
            text: `新评论 · ${event.content.title ?? "文章"}\n${event.comment.authorName}：${event.comment.body}\nIP：${clientIp ?? "未知"}\n位置：${location}\n${postUrl}\n\n直接回复此消息即可在网站评论。`,
          }) as { message_id?: number; chat?: { id?: number } };
          if (sent.message_id !== undefined) {
            await ctx.kv.set(`telegram:comment:${sent.chat?.id ?? ownerId}:${sent.message_id}`, {
              commentId: event.comment.id,
              collection: event.comment.collection,
              contentId: event.comment.contentId,
              slug: event.content.slug,
            } satisfies TelegramCommentMapping);
          }
          ctx.log.info("Telegram 评论私信发送成功。", { commentId: event.comment.id });
        } catch (error) { ctx.log.error("Telegram 评论私信发送失败。", { commentId: event.comment.id, message: error instanceof Error ? error.message : "unknown" }); }
      },
    },
  });
}

interface TelegramCommentMapping {
  commentId: string;
  collection: string;
  contentId: string;
  slug: string;
}

async function getTelegramToken(ctx: PluginContext): Promise<string | null> {
  return ctx.settings.get<string>("telegramBotToken");
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    from?: { id?: number };
    chat?: { id?: number };
    message_id?: number;
    text?: string;
    reply_to_message?: { message_id?: number };
  };
}

function telegramWebhookSecret(token: string): string {
  return createHmac("sha256", token).update("dmesg-theme:telegram-webhook:v1").digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function telegramApi(ctx: PluginContext, token: string, method: string, payload: Record<string, unknown>): Promise<unknown> {
  if (!ctx.http) throw new Error("Telegram HTTP access is unavailable");
  const response = await ctx.http.fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { ok?: boolean; result?: unknown };
  if (!response.ok || !result.ok) throw new Error(`Telegram request failed (HTTP ${response.status})`);
  return result.result;
}

async function registerTelegramWebhook(ctx: PluginContext, token: string): Promise<boolean> {
  try {
    const url = new URL("/_emdash/api/plugins/dmesg-theme/telegram-webhook", ctx.site.url).href;
    await telegramApi(ctx, token, "setWebhook", {
      url,
      secret_token: telegramWebhookSecret(token),
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });
    return true;
  } catch {
    ctx.log.error("Telegram Webhook 注册失败；请确认站点配置了公网 HTTPS 域名。", {});
    return false;
  }
}
