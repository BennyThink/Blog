import type { APIRoute } from "astro";
import { hasPermission } from "@emdash-cms/auth";
import { getRequestContext, runWithContext } from "emdash";
import { apiError, apiSuccess, handleError, isParseError, parseBody } from "emdash/api/route-utils";
import { createCommentBody } from "emdash/api/schemas";
import { z } from "zod";
import { withEmDashRuntime } from "emdash/middleware";
import { invalidateCachedPosts } from "../theme/page-cache";
import { commentContent, findApprovedThread, isCommentCollection } from "../utils/comment-links";

const replyBody = createCommentBody.pick({ body: true }).extend({
  body: createCommentBody.shape.body.trim().min(1),
  approve: z.boolean().default(false),
});

export const POST: APIRoute = async ({ request, locals, params }) => {
  const user = locals.user;
  if (!user) return apiError("UNAUTHORIZED", "请先登录后台。", 401);
  if (!hasPermission(user, "comments:moderate")) return apiError("FORBIDDEN", "没有评论审核权限。", 403);
  const parsed = await parseBody(request, replyBody);
  if (isParseError(parsed)) return parsed;

  let parentApproved = false;
  try {
    return await withEmDashRuntime(async runtime => {
      const db = runtime.db;
      const target = await db.selectFrom("_emdash_comments")
        .select(["id", "parent_id", "collection", "content_id", "status"])
        .where("id", "=", params.id ?? "").executeTakeFirst();
      if (!target) return apiError("NOT_FOUND", "原评论已不存在。", 404);
      const { collection, content_id: contentId } = target;
      if (!isCommentCollection(collection) || (target.status !== "approved" && target.status !== "pending")) {
        return apiError("COMMENT_NOT_REPLYABLE", "当前评论无法回复。", 409);
      }

      const entry = await commentContent(db, collection).where("id", "=", contentId)
        .where("status", "=", "published").executeTakeFirst();
      const settings = await db.selectFrom("_emdash_collections").select("comments_enabled")
        .where("slug", "=", collection).executeTakeFirst();
      if (!entry?.slug || !settings?.comments_enabled || (collection === "pages" && entry.slug !== "message")) {
        return apiError("COMMENTS_DISABLED", "对应内容未公开或未开放评论。", 409);
      }
      const root = target.parent_id
        ? await findApprovedThread(db, collection, contentId, target.parent_id)
        : target;
      if (!root) return apiError("COMMENT_THREAD_UNAVAILABLE", "请先批准此评论所在的讨论串。", 409);

      if (target.status === "pending") {
        if (!parsed.approve) return apiError("COMMENT_STATUS_CONFLICT", "原评论尚未批准，请刷新后重试。", 409);
        const approved = await runtime.handleCommentModerate(target.id, "approved",
          { id: user.id, name: user.name ?? null }, "pending", request);
        if (!approved) return apiError("NOT_FOUND", "原评论已不存在。", 404);
        parentApproved = true;
        if (collection === "posts") invalidateCachedPosts([contentId]);
      }

      const slug = entry.slug;
      const result = await runWithContext({ editMode: false, ...getRequestContext(), commentReplyTargetId: target.id },
        () => runtime.handleCommentCreate({
          collection,
          contentId,
          parentId: root.id,
          authorUserId: user.id,
          authorName: user.name || "管理员",
          authorEmail: user.email,
          body: parsed.body,
        }, {
          commentsEnabled: true,
          commentsModeration: "all",
          commentsClosedAfterDays: 0,
          commentsAutoApproveUsers: true,
        }, { id: contentId, collection, slug, title: entry.title ?? undefined }),
      );
      if (!result) {
        return apiError("COMMENT_REJECTED", parentApproved ? "原评论已批准，但回复未保存。" : "回复未保存。", 403);
      }

      if (collection === "posts" && result.comment.status === "approved") invalidateCachedPosts([contentId]);
      return apiSuccess({ id: result.comment.id, status: result.comment.status }, 201);
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error &&
      (error.code === "COMMENT_STATUS_CONFLICT" || error.code === "COMMENT_MODERATION_IN_PROGRESS")) {
      return apiError("COMMENT_STATUS_CONFLICT", "原评论状态已变更，请刷新后重试。", 409);
    }
    return handleError(error, parentApproved ? "原评论已批准，提交回复时出错。" : "提交回复时出错。", "COMMENT_REPLY_ERROR");
  }
};
