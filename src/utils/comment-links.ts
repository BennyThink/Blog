import type { getDb } from "emdash/runtime";

type Db = Awaited<ReturnType<typeof getDb>>;
type ContentRow = { id: string; slug: string | null; title: string | null; status: string; deleted_at: string | null };
export const commentPageSize = 30;

export function isCommentCollection(value: string): value is "posts" | "pages" {
  return value === "posts" || value === "pages";
}

export function commentContent(db: Db, collection: "posts" | "pages") {
  return db.$extendTables<{ ec_posts: ContentRow; ec_pages: ContentRow }>()
    .selectFrom(collection === "posts" ? "ec_posts" : "ec_pages")
    .select(["id", "slug", "title", "status"]).where("deleted_at", "is", null);
}

export function commentContentPath(collection: "posts" | "pages", slug: string) {
  return collection === "posts" ? `/${encodeURIComponent(slug)}.html` : `/${encodeURIComponent(slug)}`;
}

export function approvedComments(db: Db, collection: string, contentId: string) {
  return db.selectFrom("_emdash_comments").where("collection", "=", collection)
    .where("content_id", "=", contentId).where("status", "=", "approved");
}

export async function findApprovedThread(db: Db, collection: string, contentId: string, id: string) {
  const approved = approvedComments(db, collection, contentId);
  const seen = new Set<string>();
  let currentId: string | null = id;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const row = await approved.select(["id", "parent_id", "created_at"])
      .where("id", "=", currentId).executeTakeFirst();
    if (!row || !row.parent_id) return row ?? null;
    currentId = row.parent_id;
  }
  return null;
}

export async function findCommentPage(db: Db, collection: string, contentId: string, id: string) {
  const root = await findApprovedThread(db, collection, contentId, id);
  if (!root) return null;
  const newer = await approvedComments(db, collection, contentId).where("parent_id", "is", null)
    .where(eb => eb.or([
      eb("created_at", ">", root.created_at),
      eb.and([eb("created_at", "=", root.created_at), eb("id", ">", root.id)]),
    ])).select(({ fn }) => fn.countAll().as("count")).executeTakeFirstOrThrow();
  return Math.floor(Number(newer.count) / commentPageSize) + 1;
}
