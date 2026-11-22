import { extractPlainText } from "emdash";
import { getDb } from "emdash/runtime";

interface SearchablePost {
  id: string;
  title: string | null;
  content: string | null;
  status: string;
  deleted_at: string | null;
  published_at: string | null;
}

export async function searchPostIds(query: string): Promise<string[]> {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];

  const db = (await getDb()).$extendTables<{ ec_posts: SearchablePost }>();
  const posts = await db.selectFrom("ec_posts")
    .select(["id", "title", "content"])
    .where("status", "=", "published")
    .where("deleted_at", "is", null)
    .orderBy("published_at", "desc")
    .orderBy("id", "desc")
    .execute();

  const titleMatches: string[] = [];
  const bodyMatches: string[] = [];
  for (const post of posts) {
    if (post.title?.toLowerCase().includes(keyword)) {
      titleMatches.push(post.id);
    } else if (extractPlainText(post.content).toLowerCase().includes(keyword)) {
      bodyMatches.push(post.id);
    }
  }
  return [...titleMatches, ...bodyMatches];
}
