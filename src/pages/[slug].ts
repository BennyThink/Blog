import type { APIRoute } from "astro";
import { decodeSlug, getEmDashEntry, getTaxonomyTermsWithCacheHint } from "emdash";

// Legacy WordPress page/category links used root-level slugs.
// Existing named routes and .html article routes keep their own handlers.
export const GET: APIRoute = async context => {
  const slug = decodeSlug(context.params.slug);
  if (!slug) return context.rewrite("/404");
  const page = await getEmDashEntry("pages", slug);
  if (page.entry) {
    if (context.cache?.enabled) context.cache.set(page.cacheHint);
    return context.redirect(`/pages/${encodeURIComponent(slug)}`, 301);
  }
  const categories = await getTaxonomyTermsWithCacheHint("category", { includeCounts: false });
  if (context.cache?.enabled) context.cache.set(categories.cacheHint);
  const category = categories.data.find(term => term.slug === slug);
  if (category) return context.redirect(`/category/${encodeURIComponent(category.slug)}`, 301);
  return context.rewrite("/404");
};
