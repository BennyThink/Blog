import type { APIContext } from "astro";
import { commentContent, commentContentPath } from "./comment-links";

type InboxItem = {
  id: string;
  collection: string;
  contentId: string;
  status: string;
};

export async function addCommentContent(response: Response, locals: APIContext["locals"]): Promise<Response> {
  const db = locals.emdash?.db;
  if (!db || !response.ok) return response;
  const result = await response.clone().json() as { data: { items: InboxItem[] } };
  const items = result.data.items;
  const entries = await Promise.all((["posts", "pages"] as const).map(async collection => {
    const ids = [...new Set(items.filter(item => item.collection === collection).map(item => item.contentId))];
    const rows = ids.length ? await commentContent(db, collection).where("id", "in", ids).execute() : [];
    return new Map(rows.map(row => [row.id, row]));
  }));
  const content = { posts: entries[0], pages: entries[1] };
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return Response.json({
    ...result,
    data: {
      ...result.data,
      items: items.map(item => {
        const collection = item.collection;
        if (collection !== "posts" && collection !== "pages") return item;
        const entry = content[collection].get(item.contentId);
        if (!entry) return item;
        const path = entry.status === "published" && entry.slug ? commentContentPath(collection, entry.slug) : null;
        const threaded = collection === "posts" || entry.slug === "message";
        const id = encodeURIComponent(item.id);
        return {
          ...item,
          contentTitle: entry.title?.trim() || entry.slug,
          contentHref: path && threaded && item.status === "approved" ? `${path}?comment-id=${id}#comment-${id}` : path,
          canReply: Boolean(path && threaded),
        };
      }),
    },
  }, { headers });
}
