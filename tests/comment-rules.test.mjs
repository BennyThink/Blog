import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rejectsComment } from '../src/plugins/comment-rules.ts';
const visitor = { authorName: '访客', authorEmail: 'reader@example.test', body: '这个方法很好用。', ipHash: 'abc' };
const defaults = { requireChinese: false, blockedKeywords: '', blockedEmails: '', blockedIpHashes: '', blockLinks: false, maxLinkLength: 0 };
test('empty rules allow Chinese, foreign-language text and technical links', () => {
  assert.equal(rejectsComment(visitor, defaults), false);
  assert.equal(rejectsComment({ ...visitor, body: 'Thank you! https://example.test/docs' }, defaults), false);
});
test('language filter follows the legacy Han requirement and kana filter', () => {
  const rules = { ...defaults, requireChinese: true };
  assert.equal(rejectsComment(visitor, rules), false);
  assert.equal(rejectsComment({ ...visitor, body: 'Thanks!' }, rules), true);
  assert.equal(rejectsComment({ ...visitor, body: '中文テスト' }, rules), true);
});
test('keyword/name, exact email and IP hash lists ignore case and empty lines', () => {
  assert.equal(rejectsComment({ ...visitor, authorName: 'PROMO shop' }, { ...defaults, blockedKeywords: '\n promo \n' }), true);
  assert.equal(rejectsComment(visitor, { ...defaults, blockedEmails: ' READER@EXAMPLE.TEST\n' }), true);
  assert.equal(rejectsComment(visitor, { ...defaults, blockedEmails: 'example.test' }), false);
  assert.equal(rejectsComment(visitor, { ...defaults, blockedIpHashes: 'ABC\n' }), true);
});
test('link rejection and length threshold cover name and body independently', () => {
  assert.equal(rejectsComment({ ...visitor, authorName: 'www.example.test' }, { ...defaults, blockLinks: true }), true);
  assert.equal(rejectsComment({ ...visitor, body: '文档 https://example.test/very-long-path' }, { ...defaults, maxLinkLength: 25 }), true);
  assert.equal(rejectsComment({ ...visitor, body: '文档 https://x.test' }, { ...defaults, maxLinkLength: 25 }), false);
});
