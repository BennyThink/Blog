import type { StoredComment, PluginContext } from "emdash";

import { findCommentPage } from "../utils/comment-links.ts";

type Reply = Pick<StoredComment, "id" | "collection" | "contentId" | "parentId" | "authorName" | "authorEmail" | "body" | "status" | "moderationMetadata">;

function escapeEmailHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function renderReplyEmail(siteName: string, title: string, authorName: string, summary: string, url: URL) {
  const site = escapeEmailHtml(siteName);
  const article = escapeEmailHtml(title);
  const author = escapeEmailHtml(authorName);
  const reply = escapeEmailHtml(summary).replace(/\r\n?|\n/g, "<br>");
  const link = escapeEmailHtml(url.href);
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>你的评论有新回复</title></head>
<body style="margin:0;padding:0;background:#f3f5f4;color:#202824;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${author} 回复了你在《${article}》的评论。</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f4;">
    <tr><td align="center" style="padding:28px 12px;">
      <!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #dce6e0;border-top:4px solid #007858;border-radius:12px;background:#fff;">
        <tr><td style="padding:26px 24px 20px;border-bottom:1px solid #e3eae6;">
          <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#007858;font-weight:bold;">${site}</p>
          <h1 style="margin:0;font-size:28px;line-height:1.35;color:#202824;">你的评论有新回复</h1>
          <p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#44554d;overflow-wrap:anywhere;">《${article}》</p>
        </td></tr>
        <tr><td style="padding:22px 24px 28px;">
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#303e37;overflow-wrap:anywhere;"><strong>${author}</strong> 回复了你</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;">
            <tr><td style="padding:14px 16px;background:#eef6f2;border-left:3px solid #007858;font-size:16px;line-height:1.8;color:#25362e;overflow-wrap:anywhere;word-break:break-word;">${reply}</td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:22px;">
            <tr><td bgcolor="#007858" style="border-radius:6px;mso-padding-alt:12px 20px;">
              <a href="${link}" style="display:inline-block;padding:12px 20px;font-size:15px;line-height:1.4;font-weight:bold;color:#fff;text-decoration:none;mso-padding-alt:0;">查看回复</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="border-top:1px solid #e3eae6;padding:14px 24px;font-size:12px;line-height:1.6;color:#52645b;">你在发表评论时开启了回复邮件通知。</td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

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
    const { withEmDashRuntime } = await import("emdash/middleware");
    const page = await withEmDashRuntime(({ db }) =>
      findCommentPage(db, reply.collection, reply.contentId, reply.id));
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
        html: renderReplyEmail(ctx.site.name, title, reply.authorName, summary, url),
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
