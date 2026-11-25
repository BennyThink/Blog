import type { StoredComment, PluginContext } from "emdash";
import { withEmDashRuntime } from "emdash/middleware";

type Reply = Pick<StoredComment, "id" | "collection" | "contentId" | "parentId" | "authorName" | "authorEmail" | "body" | "status" | "moderationMetadata">;

export async function sendCommentReplyEmail(ctx: PluginContext, reply: Reply): Promise<string> {
  if (reply.status !== "approved" || !reply.parentId) return "邮件未发送（回复尚未公开）";

  const key = `comment-reply-email:${reply.id}`;
  let claimed = false;
  try {
    // EmDash flattens replies to their thread root. Use the comment actually selected.
    const targetId = reply.moderationMetadata?.dmesgReplyTargetId ?? reply.parentId;
    const target = typeof targetId === "string" ? await ctx.comments?.get(targetId) : null;
    if (!target || target.status !== "approved" || target.collection !== reply.collection || target.contentId !== reply.contentId) {
      return "邮件未发送（原评论不可用）";
    }
    if (target.moderationMetadata?.dmesgNotifyOnReply !== true) return "邮件未发送（对方未订阅）";
    if (target.authorEmail.trim().toLowerCase() === reply.authorEmail.trim().toLowerCase()) {
      return "邮件未发送（回复自己的评论）";
    }
    if (!ctx.email) return "邮件未发送（未配置邮件服务）";

    const content = await ctx.content?.get(reply.collection, reply.contentId);
    if (content?.status !== "published" || !content.slug) return "邮件未发送（文章未公开）";
    const title = typeof content.data.title === "string"
      ? content.data.title.replace(/[\r\n]+/g, " ").trim() || content.slug
      : content.slug;
    const path = reply.collection === "posts" ? `/${encodeURIComponent(content.slug)}.html` : "/message";
    const url = new URL(path, ctx.site.url);
    const page = await withEmDashRuntime(async ({ db }) => {
      const root = await db.selectFrom("_emdash_comments").select(["id", "created_at"])
        .where("id", "=", reply.parentId!).where("status", "=", "approved").executeTakeFirst();
      if (!root) return null;
      const newer = await db.selectFrom("_emdash_comments")
        .where("collection", "=", reply.collection).where("content_id", "=", reply.contentId)
        .where("status", "=", "approved").where("parent_id", "is", null)
        .where(eb => eb.or([
          eb("created_at", ">", root.created_at),
          eb.and([eb("created_at", "=", root.created_at), eb("id", ">", root.id)]),
        ]))
        .select(({ fn }) => fn.countAll().as("count")).executeTakeFirstOrThrow();
      return Math.floor(Number(newer.count) / 30) + 1;
    });
    if (page === null) return "邮件未发送（评论串尚未公开）";
    if (page > 1) url.searchParams.set("comment-page", String(page));
    url.hash = `comment-${reply.id}`;

    claimed = (await ctx.kv.compareAndSet(key, null, "sending")).applied;
    if (!claimed) {
      const state = await ctx.kv.get<string>(key);
      return state === "sent" ? "邮件已发送" : "邮件正在发送";
    }
    const excerpt = Array.from(reply.body);
    const summary = excerpt.length > 500 ? `${excerpt.slice(0, 500).join("")}…` : reply.body;
    try {
      await ctx.email.send({
        to: target.authorEmail,
        subject: `你在《${title}》的评论有新回复`,
        text: `${reply.authorName} 回复了你的评论：\n\n${summary}\n\n查看回复：${url.href}\n\n你在发表评论时开启了回复邮件通知。`,
      });
    } catch {
      await ctx.kv.delete(key);
      ctx.log.warn("评论回复邮件发送失败。", { commentId: reply.id });
      return "邮件发送失败（邮件服务未接受发送，请查看邮件日志）";
    }
    await ctx.kv.set(key, "sent").catch(() => {
      ctx.log.warn("已发送回复邮件，但未能记录发送状态。", { commentId: reply.id });
    });
    return "邮件已发送";
  } catch {
    ctx.log.warn("评论回复邮件处理失败。", { commentId: reply.id });
    return claimed ? "邮件发送失败（无法确认邮件状态）" : "邮件发送失败（无法读取通知所需数据）";
  }
}
