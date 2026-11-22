#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apply = process.argv.includes("--apply");
const collections = ["posts", "pages"];
const shortcode = /\[(\/)?(v_notice|v_error|v_warn|v_tips|v_blue|v_act|alert_success|alert_info|alert_warning|alert_error|gb|bb|yb|lhb|dm|dl|gt|video|audio|netmusic|collapse|dltable|fanctdl|demo|download|reply|secret|phpcode|neilian|nextpage|mark|center)([^\]]*)\]/gi;
const key = () => randomBytes(6).toString("hex");

function parseAttributes(value) {
	const attrs = {};
	for (const match of value.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g)) {
		attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
	}
	return attrs;
}

function blockFor(type, attrs, body, parts = []) {
	const base = { _key: key() };
	const rich = parts.length ? { contentParts: parts } : {};
	if (type.startsWith("v_") || type.startsWith("alert_")) return { _type: type, ...base, content: body, ...rich };
	if (["gb", "bb", "yb", "lhb"].includes(type)) return { _type: `${type}_button`, ...base, label: body, href: attrs.href ?? "" };
	if (["dm", "dl", "gt"].includes(type)) return { _type: `wp_${type}`, ...base, content: body, href: attrs.href ?? "" };
	if (type === "video" || type === "audio") return { _type: `wp_${type}`, ...base, src: body, play: attrs.play === "1" };
	if (type === "netmusic") return { _type: "wp_netmusic", ...base, id: body, play: attrs.play === "1" };
	if (type === "collapse") return { _type: "wp_collapse", ...base, title: attrs.title ?? "", content: body, ...rich };
	if (type === "dltable") return { _type: "wp_dltable", ...base, file: attrs.file ?? "", size: attrs.size ?? "", content: body, ...rich };
	if (type === "fanctdl") return { _type: "wp_fanctdl", ...base, filename: attrs.filename ?? "", filesize: attrs.filesize ?? "", href: attrs.href ?? "", filedown: attrs.filedown ?? "", content: body, ...rich };
	if (type === "demo" || type === "download") return { _type: `wp_${type}`, ...base, content: body, ...rich };
	if (type === "reply") return { _type: "wp_reply", ...base, content: body, ...rich };
	if (type === "secret") return { _type: "wp_secret", ...base, content: body, key: attrs.key ?? "", ...rich };
	if (type === "phpcode") return { _type: "wp_phpcode", ...base, file: attrs.file ?? "" };
	if (type === "neilian") return { _type: "wp_neilian", ...base, ids: attrs.ids ?? "" };
	if (type === "nextpage") return { _type: "wp_nextpage", ...base, label: "" };
	if (type === "mark" || type === "center") return { _type: `wp_${type}`, ...base, content: body, ...rich };
	return null;
}

function cli(args) {
	const result = execFileSync("npx", ["emdash", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
	return JSON.parse(result);
}

function convertContent(content) {
	if (!Array.isArray(content)) return { content, count: 0 };
	let count = 0;
	const converted = [];
	let capturing = false;
	let captureType = "";
	let captureAttrs = {};
	let notice = "";
	let noticeParts = [];
	for (const block of content) {
		if (block?._type !== "block" || !Array.isArray(block.children)) {
			converted.push(block);
			continue;
		}
		let segment = [];
		const flush = () => {
			if (!segment.length) return;
			converted.push({ ...block, _key: key(), children: segment });
			segment = [];
		};
		const appendNotice = (text, child) => {
			if (!text) return;
			notice += text;
			const marks = Array.isArray(child?.marks) ? child.marks : [];
			const defs = Array.isArray(block.markDefs) ? block.markDefs : [];
			const link = defs.find((definition) => marks.includes(definition._key) && typeof definition.href === "string");
			noticeParts.push({ text, ...(link ? { href: link.href } : {}), strong: marks.includes("strong"), em: marks.includes("em"), underline: marks.includes("underline"), code: marks.includes("code") });
		};
		for (const child of block.children) {
			if (child?._type !== "span" || typeof child.text !== "string") {
				if (capturing && typeof child?.text === "string") appendNotice(child.text, child);
				else segment.push(child);
				continue;
			}
			const sourceText = child.text
				.replace(/<div\s+class=["']alert\s+alert-(success|info|warning|error)["']\s+role=["']alert["']\s*>([\s\S]*?)<\/div>/gi, (_all, style, text) => `[alert_${style}]${text}[/alert_${style}]`)
				.replace(/<mark>([\s\S]*?)<\/mark>/gi, "[mark]$1[/mark]")
				.replace(/<center>([\s\S]*?)<\/center>/gi, "[center]$1[/center]")
				.replace(/<!--\s*nextpage\s*-->/gi, "[nextpage]");
			if (!/\[\/?(?:v_notice|v_error|v_warn|v_tips|v_blue|v_act|alert_success|alert_info|alert_warning|alert_error|gb|bb|yb|lhb|dm|dl|gt|video|audio|netmusic|collapse|dltable|fanctdl|demo|download|reply|secret|phpcode|neilian|nextpage|mark|center)\b/i.test(sourceText)) {
				if (capturing) appendNotice(child.text, child);
				else segment.push(child);
				continue;
			}
			shortcode.lastIndex = 0;
			let cursor = 0;
			let match;
			while ((match = shortcode.exec(sourceText))) {
				const before = sourceText.slice(cursor, match.index);
				if (capturing) appendNotice(before, child);
				else if (before) segment.push({ ...child, _key: key(), text: before });
				const type = match[2].toLowerCase();
				const isClose = Boolean(match[1]);
				// These legacy players are often written as self-closing shortcodes.
				// Treat a paired form as one removable embed; when there is no close
				// tag, drop only the shortcode token so following prose stays intact.
				if (!capturing && !isClose && ["audio", "netmusic"].includes(type)) {
					const closeTag = new RegExp(`\\[\\/${type}\\s*\\]`, "i");
					const closing = closeTag.exec(sourceText.slice(match.index + match[0].length));
					cursor = closing
						? match.index + match[0].length + closing.index + closing[0].length
						: match.index + match[0].length;
					count++;
					continue;
				}
				if (!capturing && !isClose) {
					flush();
					captureType = type;
					captureAttrs = parseAttributes(match[3]);
					notice = "";
					noticeParts = [];
					if (["phpcode", "neilian", "nextpage"].includes(type)) {
						converted.push(blockFor(captureType, captureAttrs, ""));
						captureType = "";
						captureAttrs = {};
						count++;
					} else capturing = true;
				} else if (capturing && isClose && captureType === type) {
					converted.push(blockFor(captureType, captureAttrs, notice, noticeParts));
					capturing = false;
					captureType = "";
					captureAttrs = {};
					notice = "";
					noticeParts = [];
					count++;
				}
				cursor = match.index + match[0].length;
			}
			const after = sourceText.slice(cursor);
			if (capturing) appendNotice(after, child);
			else if (after) segment.push({ ...child, _key: key(), text: after });
		}
		flush();
	}
	if (capturing) {
		converted.push(blockFor(captureType, captureAttrs, notice, noticeParts));
		count++;
	}
	return { content: converted, count };
}

function listAll(collection) {
	const items = [];
	let cursor;
	do {
		const args = ["content", "list", collection, "--json", "--limit", "100"];
		if (cursor) args.push("--cursor", cursor);
		const page = cli(args);
		items.push(...(page.items ?? []));
		cursor = page.nextCursor;
	} while (cursor);
	return items;
}

let total = 0;
const temp = mkdtempSync(join(tmpdir(), "emdash-v-notice-"));
try {
	for (const collection of collections) {
		const items = listAll(collection);
		console.log(`Scanning ${collection}: ${items.length} entries`);
		for (const [index, item] of items.entries()) {
			if (index > 0 && index % 25 === 0) console.log(`Scanned ${index}/${items.length} ${collection}`);
			const entry = cli(["content", "get", collection, item.id, "--raw", "--json"]);
			const result = convertContent(entry.data?.content);
			if (!result.count) continue;
			total += result.count;
			console.log(`${apply ? "Migrating" : "Would migrate"} ${result.count} legacy callout block(s): ${collection}/${entry.slug}`);
			if (!apply) continue;
			const data = { ...entry.data, content: result.content };
			const file = join(temp, `${collection}-${entry.id}.json`);
			writeFileSync(file, JSON.stringify(data));
			const args = ["content", "update", collection, entry.id, `--rev=${entry._rev}`, `--file=${file}`, "--json"];
			if (entry.status !== "published") args.push("--draft");
			cli(args);
		}
	}
} finally {
	rmSync(temp, { recursive: true, force: true });
}
console.log(`${apply ? "Migrated" : "Found"} ${total} legacy callout block(s).${apply ? "" : " Run with --apply to write changes."}`);
