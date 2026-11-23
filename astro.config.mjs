import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, fontProviders, sessionDrivers } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { Features } from "lightningcss";
import { fileURLToPath } from "node:url";
import { activatePrewarmListener } from "./scripts/prewarm-listener.mjs";

const themePluginCard = {
	name: "dmesg-theme-plugin-card",
	enforce: "pre",
	transform(code, id) {
		if (!id.endsWith("/@emdash-cms/admin/dist/index.js")) return;

		// EmDash uses the same metadata for its shortcut buttons, sidebar, and settings API.
		// Change only the two card actions so the theme's own settings page remains registered.
		for (const field of ["hasSettings", "hasAdminPages"]) {
			const shortcut = `plugin.${field} && plugin.enabled && /* @__PURE__ */ jsx(RouterLinkButton, {`;
			if (code.split(shortcut).length !== 2) {
				this.error(`The EmDash plugin card changed. Review the ${field} shortcut customization.`);
			}
			code = code.replace(shortcut, `plugin.id !== "dmesg-theme" && ${shortcut}`);
		}
		return { code, map: null };
	},
};

const postsDateColumns = {
	name: "dmesg-posts-date-columns-and-sort",
	enforce: "pre",
	transform(code, id) {
		if (!id.endsWith("/@emdash-cms/admin/dist/index.js")) return;

		// Reuse the admin's server-side sorting and date formatting for the Posts list.
		const publicationLabel = '_t({ id: "vaizKG", message: "Publication date" })';
		const colSpan = "const colSpan = (i18n$10 ? 5 : 4) + listColumns.length + extensionColumns.length + (bulkEnabled ? 1 : 0)";
		const edits = [
			{
				before: 'field: manifest?.collections[collection]?.dateField ?? "updatedAt",',
				after: 'field: collection === "posts" ? "publishedAt" : (manifest?.collections[collection]?.dateField ?? "updatedAt"),',
			},
			{
				before: `${colSpan};`,
				after: `${colSpan} + (collection === "posts" ? 1 : 0);`,
			},
			{
				before: 'const dateSortField = dateField ?? "updatedAt";\n\tconst sortFields = [',
				after: `const dateSortField = dateField ?? "updatedAt";
	const dateColumnLabel = collection === "posts" && dateSortField === "updatedAt"
		? lingui.locale.startsWith("zh") ? "更新日期" : "Updated date"
		: _t({ id: "mYGY3B", message: "Date" });
	const sortFields = [
		...(collection === "posts" && dateSortField !== "publishedAt"
			? [{ field: "publishedAt", label: ${publicationLabel} }]
			: []),`,
			},
			{
				before: "extensionColumns.map((column) => /* @__PURE__ */ jsx(ExtensionColumnHeader, {",
				after: `collection === "posts" && jsx(SortableTh, {
							field: "publishedAt",
							sort,
							onSortChange,
							label: ${publicationLabel},
							...tertiaryColumn
						}),
						extensionColumns.map((column) => /* @__PURE__ */ jsx(ExtensionColumnHeader, {`,
			},
			{
				before: "extensionColumns?.map(({ pluginId, extension }) => {",
				after: `collection === "posts" && jsx("td", {
				className: "whitespace-nowrap text-kumo-subtle",
				...tertiaryColumn,
				children: jsx("bdi", {
					children: item.publishedAt
						? formatDate(parseTimestamp(item.publishedAt), lingui.locale)
						: "—"
				})
			}),
			extensionColumns?.map(({ pluginId, extension }) => {`,
			},
		];
		for (const { before, after } of edits) {
			if (code.split(before).length !== 2) {
				this.error("The EmDash content list changed. Review the Posts publication date column.");
			}
			code = code.replace(before, () => after);
		}
		// Match the existing date label in both the table header and sort menu.
		const dateColumnLabels = /(field: dateSortField,\s+(?:sort,\s+onSortChange,\s+)?label: )_t\(\{\s+id: "mYGY3B",\s+message: "Date"\s+\}\)/g;
		if ([...code.matchAll(dateColumnLabels)].length !== 2) {
			this.error("The EmDash content list changed. Review the Posts date column label.");
		}
		code = code.replace(dateColumnLabels, "$1dateColumnLabel");
		return { code, map: null };
	},
};

export default defineConfig({
	site: process.env.EMDASH_SITE_URL || "http://localhost:4321",
	output: "server",
	session: {
		driver: sessionDrivers.fsLite({ base: "./data/sessions" }),
	},
	adapter: node({
		mode: "standalone",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	vite: {
		plugins: [themePluginCard, postsDateColumns],
		optimizeDeps: {
			rolldownOptions: { plugins: [themePluginCard, postsDateColumns] },
		},
		css: {
			// Keep light-dark() native so the footer theme switcher works in
			// production. For older browsers, Lightning CSS otherwise rewrites
			// it into variables that follow only prefers-color-scheme, which the
			// :root.light / :root.dark color-scheme rules in Base.astro can't
			// reach. Browsers without light-dark() get the light fallback in
			// tokens.css.
			lightningcss: { exclude: Features.LightDark },
		},
	},
	integrations: [
		react(),
		{
			name: "dmesg-page-prewarm",
			hooks: {
				"astro:server:setup": ({ server }) => {
					if (server.httpServer) activatePrewarmListener(server.httpServer, server.config.server.https ? "https" : "http");
				},
			},
		},
		emdash({
			plugins: [{
                id: "dmesg-theme", version: "0.1.0", format: "native",
                entrypoint: fileURLToPath(new URL("./src/plugins/dmesg-theme.ts", import.meta.url)),
                adminEntry: fileURLToPath(new URL("./src/plugins/admin.tsx", import.meta.url)),
                componentsEntry: fileURLToPath(new URL("./src/plugins/portable-text/index.ts", import.meta.url)),
                options: {},
            }],
			database: sqlite({ url: process.env.EMDASH_DATABASE_URL || "file:./data/sqlite/emdash.db" }),
			storage: local({
				directory: "./data/uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
	devToolbar: { enabled: false },
});
