import assert from "node:assert/strict";
import test from "node:test";
import { createPlugin } from "../src/plugins/dmesg-theme.ts";
import { getPageCacheStats, invalidateCachedPosts, invalidatePageCache, registerCachedPost, serveCachedPage } from "../src/theme/page-cache.ts";

const home = "/";
const post = "/article.html";
const status = (response) => response.headers.get("X-Emdash-Cache");
const html = (body = "page") => new Response(body, { headers: { "Content-Type": "text/html" } });

function client({ settings = {}, recordView = () => {} } = {}) {
  return (path, render = () => html(), options) => {
    const url = new URL(path, "https://example.test");
    const request = new Request(url, options);
    return serveCachedPage({
      url, request,
      routePattern: url.pathname.endsWith(".html") ? "/[slug].html" : "/",
      locals: { emdash: { handlePublicPluginApiRoute: async () => ({ success: true, data: settings }) } },
      cookies: {
        has: (name) => request.headers.get("cookie")?.split(";").some(cookie => cookie.trim().startsWith(name + "=")) ?? false,
        *headers() {},
      },
    }, () => render(request), recordView);
  };
}

test("home uses the configured TTL and personalized requests bypass the cached copy", async (t) => {
  invalidatePageCache();
  t.mock.method(Date, "now", () => now);
  let now = 1_000;
  const get = client({ settings: { pageCachePostTtlSeconds: 60 } });
  assert.equal(status(await get(home)), "MISS");
  now += 59_999;
  assert.equal(status(await get(home)), "HIT");
  assert.equal(status(await get(home, undefined, { headers: { Cookie: "_ga=test; _ga_ABC123=test" } })), "HIT");
  assert.equal(status(await get(home, undefined, { headers: { Cookie: "_ga=test; unrelated=test" } })), "HIT");
  assert.equal(status(await get(home, undefined, { headers: { Cookie: "other=test; astro-session=test" } })), "BYPASS");
  assert.equal(status(await get(home, undefined, { headers: { Cookie: "emdash-edit-mode=true" } })), "BYPASS");
  now += 1;
  assert.equal(status(await get(home)), "MISS");
});

test("post updates clear both pages and an in-flight render cannot refill the cache", async () => {
  invalidatePageCache();
  const get = client();
  await get(home);
  const hooks = createPlugin().hooks;
  await hooks["content:afterSave"].handler({ collection: "posts", content: { status: "published" } });
  assert.equal(status(await get(home)), "MISS");

  const response = await get(post, async () => {
    await hooks["content:afterDelete"].handler({ collection: "posts" });
    return html("old");
  });
  assert.equal(status(response), "BYPASS");
  const updated = await get(post, () => html("updated"));
  assert.equal(status(updated), "MISS");
  assert.equal(await updated.text(), "updated");
});

test("a cached article keeps recording visits until its configured TTL expires", async (t) => {
  invalidatePageCache();
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const recorded = [];
  const get = client({ settings: { pageCachePostTtlSeconds: 60 }, recordView: id => recorded.push(id) });
  const render = (request) => {
    registerCachedPost(request, "post-id", true);
    return html();
  };

  assert.equal(status(await get(post, render)), "MISS");
  now += 59_999;
  assert.equal(status(await get(post, render)), "HIT");
  assert.deepEqual(recorded, ["post-id"]);
  now++;
  assert.equal(status(await get(post, render)), "MISS");
});

test("home and article TTL both default to 3600 seconds", async (t) => {
  invalidatePageCache();
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const get = client();
  assert.equal(status(await get(home)), "MISS");
  assert.equal(status(await get(post)), "MISS");
  now += 3_599_999;
  assert.equal(status(await get(home)), "HIT");
  assert.equal(status(await get(post)), "HIT");
  now++;
  assert.equal(status(await get(home)), "MISS");
  assert.equal(status(await get(post)), "MISS");
});

test("the shared byte budget evicts the least recently used page", async () => {
  invalidatePageCache();
  const before = getPageCacheStats(true, 1);
  const get = client({ settings: { pageCacheSizeMiB: 1 } });
  const render = () => html("文".repeat(180_000));
  assert.equal(status(await get(home, render)), "MISS");
  assert.equal(status(await get(post, render)), "MISS");
  assert.equal(status(await get(post, render)), "HIT");
  assert.equal(status(await get(home, render)), "MISS");
  const filled = getPageCacheStats(true, 1);
  assert.equal(filled.retainedBytes, 540_000);
  assert.equal(filled.homeEntries, 1);
  assert.equal(filled.postEntries, 0);
  assert.equal(filled.evictions - before.evictions, 2);
  assert.equal(filled.hits - before.hits, 1);
  assert.equal(filled.misses - before.misses, 3);

  invalidatePageCache();
  assert.deepEqual(getPageCacheStats(true, 1), { ...filled, retainedBytes: 0, homeEntries: 0 });
});


test("invalidating a comment's post preserves the homepage and other articles", async () => {
  invalidatePageCache();
  const get = client();
  const otherPost = "/other.html";
  const renderPost = (id) => (request) => {
    registerCachedPost(request, id, false);
    return html();
  };

  await get(home);
  await get(post, renderPost("article"));
  await get(otherPost, renderPost("other"));
  invalidateCachedPosts(["article"]);

  assert.equal(status(await get(home)), "HIT");
  assert.equal(status(await get(otherPost)), "HIT");
  assert.equal(status(await get(post, renderPost("article"))), "MISS");
});
