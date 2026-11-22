import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, fontProviders, sessionDrivers } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { Features } from "lightningcss";
import { fileURLToPath } from "node:url";

export default defineConfig({
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
                componentsEntry: fileURLToPath(new URL("./src/plugins/portable-text/index.ts", import.meta.url)),
                portableTextBlocks: [
                    ...[
                        ["v_notice", "绿色通知", "sc_notice"], ["v_error", "红色警告", "sc_error"],
                        ["v_warn", "黄色提醒", "sc_warn"], ["v_tips", "灰色提示", "sc_tips"],
                        ["v_blue", "蓝色提示", "sc_blue"], ["v_act", "蓝边文本框", "sc_act"],
                    ].map(([type, label]) => ({ type, label, category: "WordPress 提示框", icon: "info", fields: [
                        { type: "text_input", action_id: "content", label: "内容", multiline: true },
                    ] })),
                    ...[
                        ["alert_success", "Alert 绿色成功提示"], ["alert_info", "Alert 蓝色信息提示"],
                        ["alert_warning", "Alert 黄色警告提示"], ["alert_error", "Alert 红色错误提示"],
                    ].map(([type, label]) => ({ type, label, category: "WordPress Alert", icon: "info", fields: [
                        { type: "text_input", action_id: "content", label: "内容", multiline: true },
                    ] })),
                    ...[
                        ["gb", "绿色按钮"], ["bb", "蓝色按钮"], ["yb", "黄色按钮"], ["lhb", "透明按钮"],
                    ].map(([type, label]) => ({ type: `${type}_button`, label, category: "WordPress 按钮", icon: "link", fields: [
                        { type: "text_input", action_id: "label", label: "按钮文字" },
                        { type: "text_input", action_id: "href", label: "链接地址" },
                    ] })),
                    ...[
                        ["dm", "演示链接"], ["dl", "下载链接"], ["gt", "开源项目链接"],
                    ].map(([type, label]) => ({ type: `wp_${type}`, label, category: "WordPress 链接", icon: "link", fields: [
                        { type: "text_input", action_id: "content", label: "链接文字" },
                        { type: "text_input", action_id: "href", label: "链接地址" },
                    ] })),
                    ...[
                        ["video", "视频"], ["audio", "音频"],
                    ].map(([type, label]) => ({ type: `wp_${type}`, label, category: "WordPress 媒体", icon: "video", fields: [
                        { type: "text_input", action_id: "src", label: "媒体地址" },
                        { type: "toggle", action_id: "play", label: "自动播放" },
                    ] })),
                    { type: "wp_netmusic", label: "网易云音乐", category: "WordPress 媒体", icon: "video", fields: [
                        { type: "text_input", action_id: "id", label: "歌曲 ID" },
                        { type: "toggle", action_id: "play", label: "自动播放" },
                    ] },
                    { type: "wp_collapse", label: "折叠内容", category: "WordPress 内容块", icon: "info", fields: [
                        { type: "text_input", action_id: "title", label: "标题" },
                        { type: "text_input", action_id: "content", label: "内容", multiline: true },
                    ] },
                    { type: "wp_dltable", label: "下载信息面板", category: "WordPress 下载", icon: "link", fields: [
                        { type: "text_input", action_id: "file", label: "文件名称" },
                        { type: "text_input", action_id: "size", label: "文件大小" },
                        { type: "text_input", action_id: "content", label: "下载地址或链接", multiline: true },
                    ] },
                    { type: "wp_fanctdl", label: "弹窗下载卡片", category: "WordPress 下载", icon: "link", fields: [
                        { type: "text_input", action_id: "filename", label: "文件名称" },
                        { type: "text_input", action_id: "filesize", label: "文件大小" },
                        { type: "text_input", action_id: "href", label: "主下载地址" },
                        { type: "text_input", action_id: "filedown", label: "下载按钮文字" },
                        { type: "text_input", action_id: "content", label: "备用地址或说明", multiline: true },
                    ] },
                    ...[
                        ["demo", "代码演示链接"], ["download", "单页下载链接"],
                    ].map(([type, label]) => ({ type: `wp_${type}`, label, category: "WordPress 链接", icon: "link", fields: [
                        { type: "text_input", action_id: "content", label: "链接文字" },
                        { type: "text_input", action_id: "href", label: "链接地址" },
                    ] })),
                    { type: "wp_nextpage", label: "分页分隔线", category: "WordPress 内容块", icon: "info", fields: [
                        { type: "text_input", action_id: "label", label: "分隔提示（可选）" },
                    ] },
                    ...[
                        ["wp_mark", "黄色高亮文字"], ["wp_center", "居中文本"], ["wp_indent", "首行缩进段落"],
                    ].map(([type, label]) => ({ type, label, category: "WordPress 格式", icon: "info", fields: [
                        { type: "text_input", action_id: "content", label: "文字", multiline: true },
                    ] })),
                    ...[
                        ["reply", "回复后可见内容"], ["secret", "密码保护内容"],
                    ].map(([type, label]) => ({ type: `wp_${type}`, label, category: "WordPress 受限内容", icon: "info", fields: [
                        { type: "text_input", action_id: "content", label: "受限内容", multiline: true },
                        ...(type === "secret" ? [{ type: "text_input", action_id: "key", label: "密码" }] : []),
                    ] })),
                    ...[
                        ["phpcode", "PHP 代码（仅展示）"], ["neilian", "旧站文章内链（需检查 ID）"],
                    ].map(([type, label]) => ({ type: `wp_${type}`, label, category: "WordPress 旧内容", icon: "code", fields: [
                        { type: "text_input", action_id: type === "phpcode" ? "file" : "ids", label: type === "phpcode" ? "旧 PHP 文件名" : "旧文章 ID" },
                        ...(type === "phpcode" ? [] : [{ type: "text_input", action_id: "content", label: "说明" }]),
                    ] })),
                ],
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
