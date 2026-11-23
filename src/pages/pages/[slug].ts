import type { APIRoute } from "astro";
import { decodeSlug, getEmDashEntry } from "emdash";

export const GET: APIRoute = async ({ params, redirect, rewrite, url }) => {
	const slug = decodeSlug(params.slug);
	if (!slug || slug === "about") return rewrite("/404");
	const { entry, error } = await getEmDashEntry("pages", slug);
	if (error) return new Response("Could not load page", { status: 500 });
	if (!entry) return rewrite("/404");
	return redirect(`/${encodeURIComponent(entry.id)}${url.search}`, 301);
};
