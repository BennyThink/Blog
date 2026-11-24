import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlugin } from '../src/plugins/dmesg-theme.ts';
function context(values = {}) {
  const state = new Map();
  return {
    settings: { get: async key => values[key] ?? null },
    kv: { get: async key => state.get(key) ?? null, set: async (key, value) => state.set(key, value), delete: async key => state.delete(key), compareAndSet: async (key, _revision, value) => {
      if (state.has(key)) return { applied: false }; state.set(key, value); return { applied: true, revision: '1' };
    } },
    log: { error() {} }, state,
  };
}
const plugin = createPlugin();
const before = plugin.hooks['content:beforePublish'].handler;
const after = plugin.hooks['content:afterPublish'].handler;
const fresh = { collection: 'posts', content: { id: 'new-post', slug: 'new-post', publishedAt: null, data: { title: '新文章' } }, origin: { source: 'api' }, actor: { id: 'owner', role: 1 } };
test('imports, system writes, existing published posts and disabled notifications never arm a notification', async () => {
  for (const event of [{ ...fresh, origin: { source: 'system' } }, { ...fresh, origin: { source: 'plugin', pluginId: 'importer' } }, { ...fresh, content: { ...fresh.content, publishedAt: '2025-01-01' } }, { ...fresh, actor: undefined }]) {
    const ctx = context({ telegramEnabled: true }); await before(event, ctx); assert.equal(ctx.state.size, 0);
  }
  const ctx = context(); await before(fresh, ctx); assert.equal(ctx.state.size, 0);
});
test('first human publish sends once, with mock transport only; repeated publish does not resend', async () => {
  const ctx = context({ telegramEnabled: true, telegramBotToken: 'test-token', telegramChannelId: 'test-chat' });
  ctx.site = { url: 'https://example.test' };
  const sent = [];
  ctx.http = { fetch: async (url, options) => {
    if (url.endsWith('/sendMessage')) sent.push(JSON.parse(options.body));
    return Response.json({ ok: true });
  } };
  await before(fresh, ctx); await after(fresh, ctx); await after(fresh, ctx);
  const published = { ...fresh, content: { ...fresh.content, publishedAt: '2026-11-24T00:00:00Z' } };
  await before(published, ctx); await after(published, ctx);
  assert.equal(sent.length, 1); assert.match(sent[0].text, /https:\/\/example.test\/new-post.html/);
  assert.equal(ctx.state.get('eligible:new-post'), undefined);
});
test('public settings are allowlisted and exclude HTML, blacklists and credentials', async () => {
  const ctx = context({ searchPlaceholder: '查找', headCode: '<script>secret()</script>', blockedEmails: 'private@example.test', TELEGRAM_BOT_TOKEN: 'secret' });
  const data = await plugin.routes.settings.handler(ctx);
  assert.equal(data.searchPlaceholder, '查找');
  assert.equal('headCode' in data, false); assert.equal('blockedEmails' in data, false); assert.equal('TELEGRAM_BOT_TOKEN' in data, false);
});
test('avatar lookup exposes nothing for pending comments or unpublished content', async () => {
  const ctx = context(); ctx.input = { id: 'comment-1' };
  ctx.comments = { get: async () => ({ status: 'pending', authorEmail: 'private@example.test' }) };
  assert.equal(await plugin.routes.avatar.handler(ctx), null);
  ctx.comments.get = async () => ({ status: 'approved', authorEmail: 'private@example.test', collection: 'posts', contentId: 'draft' });
  ctx.content = { get: async () => ({ status: 'draft' }) };
  assert.equal(await plugin.routes.avatar.handler(ctx), null);
});
test('human-scheduled new post is armed, imported schedule is not, system publish clears stale eligibility', async () => {
  const ctx = context({ telegramEnabled: true });
  await plugin.hooks['content:beforeSchedule'].handler({ ...fresh, scheduledAt: '2030-01-01T00:00:00Z' }, ctx);
  await before({ ...fresh, origin: { source: 'scheduler' }, actor: undefined }, ctx);
  assert.equal(ctx.state.get('eligible:new-post'), true);
  await before({ ...fresh, origin: { source: 'system' }, actor: undefined }, ctx);
  assert.equal(ctx.state.has('eligible:new-post'), false);
  const imported = context({ telegramEnabled: true });
  await before({ ...fresh, origin: { source: 'scheduler' }, actor: undefined }, imported);
  assert.equal(imported.state.size, 0);
});
