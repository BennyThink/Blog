import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, fontProviders, sessionDrivers } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { Features } from "lightningcss";
import { fileURLToPath } from "node:url";

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
		plugins: [themePluginCard],
		optimizeDeps: {
			rolldownOptions: { plugins: [themePluginCard] },
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
