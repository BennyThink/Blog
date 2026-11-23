import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const compose = (...args) => execFileSync('docker', ['compose', ...args], { encoding: 'utf8' }).trim();
const inside = (code, ...args) => compose('exec', '-T', 'emdash', 'node', '--input-type=module', '-e', code, ...args);
const origin = process.env.EMDASH_VERIFY_URL || 'http://localhost:4321';
async function ready() {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Site did not become ready');
}
async function pages() {
  const home = await fetch(origin);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /土豆不好吃/);
  const admin = await fetch(`${origin}/_emdash/admin`);
  assert.equal(admin.status, 200);
  const html = await admin.text();
  assert.match(html, /<script/);
  // Verify the admin application bundle, not merely an HTML error shell.
  const scripts = [...html.matchAll(/(?:component-url|renderer-url)="([^"]+)"/g)];
  assert.ok(scripts.length >= 2, 'Admin must load its Astro island and React renderer');
  for (const script of scripts) {
    assert.equal((await fetch(new URL(script[1], origin))).status, 200);
  }
  assert.equal((await fetch(`${origin}/_emdash/api/setup/status`)).status, 200);
  assert.equal((await fetch(`${origin}/posts`)).status, 200);
}
const snapshotCode = `
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const db = new DatabaseSync('/app/data/sqlite/emdash.db');
const posts = db.prepare('SELECT * FROM ec_posts ORDER BY id').all();
const pages = db.prepare('SELECT * FROM ec_pages ORDER BY id').all();
const media = db.prepare('SELECT * FROM media ORDER BY id').all();
const files = media.map(m => ({key:m.storage_key, hash:createHash('sha256').update(readFileSync('/app/data/uploads/'+m.storage_key)).digest('hex')}));
const marker = db.prepare("SELECT value FROM options WHERE name = 'migration:persistence_probe'").get();
const recordHash = row => createHash('sha256').update(JSON.stringify(row)).digest('hex');
console.log(JSON.stringify({integrity:db.prepare('PRAGMA integrity_check').get(),posts:posts.map(recordHash),pages:pages.map(recordHash),media:media.map(recordHash),files,marker}));
db.close();`;
await ready();
await pages();
const token = randomUUID();
// A unique value not present in the seed proves the volume survived recreation.
inside(`import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/app/data/sqlite/emdash.db'); db.prepare("INSERT OR REPLACE INTO options(name,value) VALUES ('migration:persistence_probe',?)").run(JSON.stringify(process.argv[1])); db.close();`, token);
const before = JSON.parse(inside(snapshotCode));
assert.ok(before.posts.length > 0, 'Sample posts must exist');
assert.ok(before.media.length > 0, 'Sample media must exist in local storage');
assert.equal(Object.values(before.integrity)[0], 'ok');
const mediaUrl = `${origin}/_emdash/api/media/file/${before.files[0].key}`;
const hashMedia = async () => {
  const response = await fetch(mediaUrl);
  assert.equal(response.status, 200);
  return createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
};
assert.equal(await hashMedia(), before.files[0].hash);
const oldId = compose('ps', '-q', 'emdash');
compose('up', '-d', '--force-recreate', '--no-build', 'emdash');
await ready();
assert.notEqual(compose('ps', '-q', 'emdash'), oldId, 'Container must actually be replaced');
await pages();
assert.deepEqual(JSON.parse(inside(snapshotCode)), before, 'Database and media must survive unchanged');
assert.equal(await hashMedia(), before.files[0].hash);
inside(`import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/app/data/sqlite/emdash.db'); db.prepare("DELETE FROM options WHERE name='migration:persistence_probe'").run(); db.close();`);
console.log(JSON.stringify({result:'PASS',home:200,admin:200,adminBundle:200,posts:before.posts.length,pages:before.pages.length,media:before.media.length,sqliteIntegrity:'ok',containerReplaced:true,uniqueDatabaseMarkerPreserved:true,allMediaHashesPreserved:true}, null, 2));
