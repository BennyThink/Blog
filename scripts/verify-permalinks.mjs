import assert from 'node:assert/strict';

const origin = process.env.EMDASH_VERIFY_URL || 'http://localhost:4321';
async function get(path, status = 200) {
  const response = await fetch(new URL(path, origin), { redirect: 'manual' });
  assert.equal(response.status, status, path);
  return response;
}
const article = await (await get('/nfc-clone.html')).text();
assert.ok(article.includes(`rel="canonical" href="${new URL('/nfc-clone.html', origin).href}"`));
assert.match(article, /<h1[^>]*>[^<]*我只是想复制/);
const legacy = await get('/posts/nfc-clone?utm_source=migration', 301);
assert.equal(new URL(legacy.headers.get('location'), origin).pathname, '/nfc-clone.html');
assert.equal(new URL(legacy.headers.get('location'), origin).search, '?utm_source=migration');
for (const path of ['/definitely-missing-permalink-probe.html', '/posts/definitely-missing-permalink-probe']) {
  await get(path, 404);
}
for (const path of ['/', '/posts', '/search/NFC', '/nfc-clone.html']) {
  const html = await (await get(path)).text();
  assert.doesNotMatch(html, /href="\/posts\/[^"#?]+"/, `Old article links in ${path}`);
}
const search = await (await get('/search/NFC')).text();
assert.match(search, /href="\/nfc-clone\.html"/);
const feed = await (await get('/rss.xml')).text();
const links = [...feed.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map(match => match[1]);
assert.ok(links.length > 0);
for (const link of links) {
  assert.match(new URL(link).pathname, /^\/[^/]+\.html$/);
}
const sitemap = await (await get('/sitemap-posts.xml')).text();
assert.match(sitemap, /\/nfc-clone\.html/);
assert.doesNotMatch(sitemap, /\/posts\/nfc-clone/);
const about = await (await get('/about')).text();
assert.ok(about.includes(`rel="canonical" href="${new URL('/about', origin).href}"`));
assert.match(about, /class="article-heading"[\s\S]*?<h1\b/);
assert.match(about, /class="article-reading"[\s\S]*?class="prose"/);
const legacyPage = await get('/pages/about?utm_source=migration', 301);
assert.equal(new URL(legacyPage.headers.get('location'), origin).href, new URL('/about?utm_source=migration', origin).href);
await get('/pages/definitely-missing-permalink-probe', 404);
const pageSitemap = await (await get('/sitemap-pages.xml')).text();
assert.ok(pageSitemap.includes(`<loc>${new URL('/about', origin).href}</loc>`));
console.log('PASS: article and page permalinks, legacy redirects, missing routes, cards, search, sidebar, RSS, and sitemaps');
