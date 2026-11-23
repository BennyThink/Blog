import type { APIRoute } from "astro";
import { decodeSlug, getEmDashEntry } from "emdash";
import { postPath } from "../../utils/post-url";

export const GET: APIRoute = async ({ params, redirect, rewrite, url }) => {
	const slug = decodeSlug(params.slug);
	if (!slug) return rewrite("/404");
	const { entry, error } = await getEmDashEntry("posts", slug);
	if (error) return new Response("Could not load post", { status: 500 });
	if (!entry) return rewrite("/404");
	return redirect(`${postPath(entry.id)}${url.search}`, 301);
};
