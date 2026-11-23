import assert from "node:assert/strict";
import test from "node:test";
import { createPlugin } from "../src/plugins/dmesg-theme.ts";
import { invalidatePageCache, registerCachedPostView, serveCachedPage } from "../src/theme/page-cache.ts";

const home = "/";
const post = "/article.html";
const status = (response) => response.headers.get("X-Emdash-Cache");
const html = (body = "page") => new Response(body, { headers: { "Content-Type": "text/html" } });

function client({ settings = {}, views = { record() {}, version: () => 0 } } = {}) {
  return (path, render = () => html(), options) => {
    const url = new URL(path, "https://example.test");
    const request = new Request(url, options);
    return serveCachedPage({
      url, request,
      routePattern: url.pathname.endsWith(".html") ? "/[slug].html" : "/",
      locals: { emdash: { handlePublicPluginApiRoute: async () => ({ success: true, data: settings }) } },
      cookies: { *headers() {} },
    }, () => render(request), views);
  };
}

test("home expires after three minutes and personalized requests bypass the cached copy", async (t) => {
  invalidatePageCache();
  t.mock.method(Date, "now", () => now);
  let now = 1_000;
  const get = client();
  assert.equal(status(await get(home)), "MISS");
  now += 179_999;
  assert.equal(status(await get(home)), "HIT");
  assert.equal(status(await get(home, undefined, { headers: { Cookie: "session=test" } })), "BYPASS");
  now += 1;
  assert.equal(status(await get(home)), "MISS");
});

test("post updates clear both pages and an in-flight render cannot refill the cache", async () => {
  invalidatePageCache();
  const get = client();
  await get(home);
  const hooks = createPlugin().hooks;
  await hooks["content:afterSave"].handler({ collection: "posts" });
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

test("a post hit records a view, and a counter flush refreshes article HTML only", async () => {
  invalidatePageCache();
  const recorded = [];
  let version = 0;
  const get = client({ views: { record: id => recorded.push(id), version: () => version } });
  await get(home);
  const render = (request) => {
    registerCachedPostView(request, "post-id");
    return html();
  };
  assert.equal(status(await get(post, render)), "MISS");
  assert.equal(status(await get(post, render)), "HIT");
  assert.deepEqual(recorded, ["post-id"]);
  version++;
  assert.equal(status(await get(post, render)), "MISS");
  assert.equal(status(await get(home)), "HIT");
});

test("the shared byte budget evicts the least recently used page", async () => {
  invalidatePageCache();
  const get = client({ settings: { pageCacheSizeMiB: 1 } });
  const render = () => html("文".repeat(180_000));
  assert.equal(status(await get(home, render)), "MISS");
  assert.equal(status(await get(post, render)), "MISS");
  assert.equal(status(await get(post, render)), "HIT");
  assert.equal(status(await get(home, render)), "MISS");
});
