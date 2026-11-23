import type { APIContext } from "astro";
import { getPublicOrigin } from "emdash/api/route-utils";

export function resolveSiteOrigin({ locals, site, url }: Pick<APIContext, "locals" | "site" | "url">): string {
	return getPublicOrigin(site ?? url, locals.emdash?.config);
}
