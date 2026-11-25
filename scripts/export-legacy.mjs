import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, posix, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { escapeAttribute, escapeText } from "entities";
import { defaultTreeAdapter, parse, parseFragment, serialize } from "parse5";

const { values } = parseArgs({ options: { output: { type: "string" } } });
if (!values.output) throw new Error("Usage: npm run export:legacy -- --output /path/to/new-directory");
const output = resolve(values.output);
const local = new URL(`http://127.0.0.1:${process.env.PORT || 4321}`);
const site = new URL(process.env.EMDASH_SITE_URL || local);
const sourceSite = new URL(process.env.EMDASH_SITE_URL || "https://dmesg.app");
const mediaPath = "/_emdash/api/media/file/";
const owners = new Set([site.origin, local.origin, `http://localhost:${local.port}`]);
for (const origin of (process.env.LEGACY_ASSET_ORIGINS || "").split(/\s*,\s*/).filter(Boolean)) {
  owners.add(new URL(origin).origin);
}

function publishedPages() {
  const database = (process.env.EMDASH_DATABASE_URL || "file:./data/sqlite/emdash.db").replace(/^file:/, "");
  const db = new DatabaseSync(database, { readOnly: true, timeout: 5000 });
  try {
    const entries = collection => db.prepare(`
      SELECT slug FROM ec_${collection}
      WHERE status = 'published' AND deleted_at IS NULL
      ORDER BY published_at DESC, slug
    `).all();
    const posts = entries("posts");
    if (!posts.length) throw new Error("No published posts. Refusing to produce an empty archive.");
    return [...posts.map(({ slug }) => ({ slug, post: true })),
      ...entries("pages").map(({ slug }) => ({ slug, post: false }))].map(({ slug, post }) => {
      if (!slug || slug === "." || slug === ".." || /[\/\\\x00-\x1f]/.test(slug)) {
        throw new Error(`Unsupported slug: ${JSON.stringify(slug)}`);
      }
      const encoded = encodeURIComponent(slug);
      return {
        slug, post, encoded,
        path: post ? `/${encoded}.html` : `/${encoded}`,
        file: post ? `${slug}.html` : `${slug}/index.html`,
      };
    });
  } finally {
    db.close();
  }
}

const pages = publishedPages();
const routes = new Map([["/", "index.html"], ["/posts", "index.html"]]);
for (const page of pages) {
  if (routes.has(page.path) || page.slug === "_assets" || page.file === "index.html") {
    throw new Error(`Conflicting archive path: ${page.path}`);
  }
  routes.set(page.path, page.file);
  routes.set(`/${page.post ? "posts" : "pages"}/${page.encoded}`, page.file);
}

function relativeLink(from, to) {
  const directory = dirname(to);
  const target = to.endsWith("/index.html") ? directory : to;
  const relative = posix.relative(posix.dirname(from), target);
  const href = relative.split("/").map(encodeURIComponent).join("/") || ".";
  return to.endsWith("/index.html") ? `${href}/` : href;
}

function webUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url;
  } catch { /* Leave unsupported references alone. */ }
}

const assets = new Map();
const external = new Set();
function assetLink(value, base, from) {
  if (!value || value.startsWith("#")) return value;
  const url = webUrl(value, base);
  if (!url) return value;
  const hash = url.hash;
  url.hash = "";
  // A configured WebP proxy uses the same media pathname as the local origin.
  if (url.pathname.startsWith(mediaPath)) {
    url.protocol = local.protocol;
    url.host = local.host;
  }
  if (!owners.has(url.origin)) {
    external.add(url.origin);
    return value;
  }
  const download = [site.origin, local.origin, `http://localhost:${local.port}`].includes(url.origin)
    ? new URL(url.pathname + url.search, local)
    : url;
  const key = download.href;
  if (!assets.has(key)) {
    const extension = extname(url.pathname).match(/^\.[a-z0-9]{1,10}$/i)?.[0] || "";
    const digest = createHash("sha256").update(download.origin === local.origin
      ? download.pathname + download.search : key).digest("hex");
    assets.set(key, { download, file: `_assets/${digest}${extension}` });
  }
  return relativeLink(from, assets.get(key).file) + hash;
}

function rewriteCss(css, base, from) {
  return css
    .replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)"']+))\s*\)/gi,
      (match, double, single, plain) => {
        const original = double ?? single ?? plain;
        const link = assetLink(original, base, from);
        return link === original ? match : `url("${link}")`;
      })
    .replace(/(@import\s+)(["'])([^"']+)\2/gi,
      (_, prefix, quote, value) => prefix + quote + assetLink(value, base, from) + quote);
}

const attachment = /\.(?:pdf|zip|gz|7z|rar|txt|csv|docx?|xlsx?|pptx?|png|jpe?g|webp|gif|svg|avif|ico|mp[34]|ogg|webm|wav)$/i;
const resourceAttributes = {
  img: ["src", "data-src", "data-original"], source: ["src"], video: ["src", "poster"],
  audio: ["src"], track: ["src"], embed: ["src"], object: ["data"], image: ["href", "xlink:href"],
};

function addArchiveMetadata(doc, path) {
  const html = doc.childNodes.find(node => node.tagName === "html");
  const head = html.childNodes.find(node => node.tagName === "head");
  const body = html.childNodes.find(node => node.tagName === "body");
  for (const node of [...head.childNodes]) {
    if (node.tagName === "meta" && node.attrs.some(attr =>
      attr.name === "name" && attr.value.trim().toLowerCase() === "robots")) {
      defaultTreeAdapter.detachNode(node);
    }
  }
  const [robots] = parseFragment('<meta name="robots" content="noindex">').childNodes;
  defaultTreeAdapter.appendChild(head, robots);

  const original = new URL(path, sourceSite);
  const [notice] = parseFragment(
    `<aside aria-label="归档说明" style="padding:0.65rem 1rem;text-align:center;border-bottom:1px solid currentColor">这是「土豆不好吃」博客的官方备份。<a href="${escapeAttribute(original.href)}" style="text-decoration:underline">原站 ${escapeText(original.host)}</a></aside>`,
  ).childNodes;
  if (body.childNodes.length) defaultTreeAdapter.insertBefore(body, notice, body.childNodes[0]);
  else defaultTreeAdapter.appendChild(body, notice);
}

function rewriteHtml(html, page) {
  const doc = parse(html);
  const base = new URL(page.path, site);
  let title = page.slug;
  function visit(node) {
    const { tagName, attrs = [] } = node;
    const attr = name => attrs.find(item => item.name === name);
    const rel = attr("rel")?.value.split(/\s+/) || [];
    if (tagName === "title") title = node.childNodes[0]?.value || title;
    // The live share widget depends on its script and legacy icon font.
    if (tagName === "link" && attr("href")?.value === "/theme/article-share.min.css" ||
      tagName === "button" && attr("class")?.value.split(/\s+/).includes("article-share-button")) return false;
    if (tagName === "img" && !attr("src") && attr("data-src")) {
      attrs.push({ name: "src", value: attr("data-src").value });
    }
    if (tagName === "script" || tagName === "base" || tagName === "form" ||
      tagName === "meta" && attr("http-equiv")?.value.toLowerCase() === "refresh" ||
      tagName === "link" && rel.some(value => ["modulepreload", "preload", "preconnect", "dns-prefetch"].includes(value))) return false;
    for (const a of attrs) {
      if (resourceAttributes[tagName]?.includes(a.name) ||
        tagName === "link" && a.name === "href" && rel.some(value => value === "stylesheet" || value.includes("icon"))) {
        a.value = assetLink(a.value, base, page.file);
        if (tagName === "link" && rel.includes("stylesheet")) {
          node.attrs = node.attrs.filter(item => item.name !== "integrity");
        }
      }
      if (["img", "source"].includes(tagName) && ["srcset", "data-srcset"].includes(a.name)) {
        // Data URLs can contain commas, so keep inlined sources intact.
        if (!a.value.includes("data:")) a.value = a.value.split(",").map(candidate =>
          candidate.trim().replace(/^\S+/, url => assetLink(url, base, page.file))).join(", ");
      }
      if (a.name === "style") a.value = rewriteCss(a.value, base, page.file);
      if (tagName === "a" && a.name === "href" && !a.value.startsWith("#")) {
        const url = webUrl(a.value, base);
        if (!url) continue;
        const target = owners.has(url.origin) && routes.get(url.pathname.replace(/\/$/, "") || "/");
        if (target) a.value = relativeLink(page.file, target) + url.hash;
        else if (url.pathname.startsWith(mediaPath) || owners.has(url.origin) &&
          (attr("download") || url.pathname.startsWith("/wp-content/uploads/") || attachment.test(url.pathname))) {
          a.value = assetLink(a.value, base, page.file);
        } else a.value = url.href;
      }
    }
    if (tagName === "style") for (const child of node.childNodes) {
      if (child.nodeName === "#text") child.value = rewriteCss(child.value, base, page.file);
    }
    if (node.childNodes) node.childNodes = node.childNodes.filter(visit);
    return true;
  }
  visit(doc);
  addArchiveMetadata(doc, page.path);
  return { title, html: serialize(doc) };
}

async function request(url, { page = false, fallback } = {}) {
  const options = { redirect: "manual", signal: AbortSignal.timeout(60_000),
    headers: page ? { "X-Dmesg-Legacy": "1" } : {} };
  let response = await fetch(url, options);
  if (!response.ok && fallback && fallback.origin !== url.origin) {
    await response.body?.cancel();
    response = await fetch(fallback, { ...options, signal: AbortSignal.timeout(60_000) });
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response;
}

await mkdir(dirname(output), { recursive: true });
const stage = await mkdtemp(`${output}.tmp-`);
try {
  const links = { posts: [], pages: [] };
  for (const page of pages) {
    const response = await request(new URL(page.path, local), { page: true });
    if (!response.headers.get("content-type")?.startsWith("text/html")) {
      throw new Error(`Expected HTML at ${page.path}`);
    }
    const rendered = rewriteHtml(await response.text(), page);
    const file = resolve(stage, page.file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, rendered.html);
    const href = escapeText(relativeLink("index.html", page.file));
    links[page.post ? "posts" : "pages"].push(`<li><a href="${href}">${escapeText(rendered.title)}</a></li>`);
  }

  await mkdir(resolve(stage, "_assets"));
  for (const { download, file } of assets.values()) {
    const fallback = download.origin === local.origin && !download.pathname.startsWith(mediaPath)
      ? new URL(download.pathname + download.search, site) : undefined;
    const response = await request(download, { fallback });
    const type = response.headers.get("content-type") || "";
    const destination = resolve(stage, file);
    if (type.startsWith("text/css")) {
      const base = new URL(download.pathname + download.search, download.origin === local.origin ? site : download);
      await writeFile(destination, rewriteCss(await response.text(), base, file));
    } else {
      if (type.startsWith("text/html") && !/\.html?$/i.test(download.pathname)) {
        await response.body?.cancel();
        throw new Error(`Expected a file, got HTML at ${download}`);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
    }
  }
  const index = parse(`<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>土豆不好吃 · 归档</title>
<style>body{margin:2rem auto;padding:0 1rem;max-width:56rem;font:1rem/1.7 system-ui;color-scheme:light dark}</style>
<h1>土豆不好吃 · 归档</h1>
<h2>页面</h2><ul>${links.pages.join("\n")}</ul>
<h2>文章</h2><ul>${links.posts.join("\n")}</ul></html>\n`);
  addArchiveMetadata(index, "/");
  await writeFile(resolve(stage, "index.html"), serialize(index));
  await writeFile(resolve(stage, "robots.txt"), "User-agent: *\nAllow: /\n");
  await rename(stage, output);
  console.log(`Exported ${pages.length} pages and ${assets.size} assets to ${output}`);
  if (external.size) console.log(`External assets left as links: ${[...external].sort().join(", ")}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
