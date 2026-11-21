import { Kysely } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { SchemaRegistry } from 'emdash';

// Idempotent local schema migration; never reapply seed over imported content.
const db = new Kysely({ dialect: createDialect({ url: 'file:./data/sqlite/emdash.db' }) });
try {
  const registry = new SchemaRegistry(db);
  const posts = await db.selectFrom('_emdash_collections').select(['url_pattern']).where('slug', '=', 'posts').executeTakeFirst();
  if (posts?.url_pattern === '/posts/{slug}') {
    await registry.updateCollection('posts', { urlPattern: '/{slug}.html' });
    console.log('Updated posts URL pattern to /{slug}.html');
  } else if (posts?.url_pattern !== '/{slug}.html') {
    throw new Error('Unexpected posts URL pattern; review before migrating');
  }
  const pages = await db.selectFrom('_emdash_collections').select('url_pattern').where('slug', '=', 'pages').executeTakeFirst();
  if (pages?.url_pattern === '/pages/{slug}') {
    await registry.updateCollection('pages', { urlPattern: '/{slug}' });
    console.log('Updated pages URL pattern to /{slug}');
  }
  const widgets = await db.selectFrom('_emdash_widgets').select(['id', 'component_props']).where('component_id', '=', 'core:recent-posts').execute();
  for (const widget of widgets) {
    const props = JSON.parse(widget.component_props || '{}');
    if (!props.urlTemplate || props.urlTemplate === '/posts/:slug') {
      await db.updateTable('_emdash_widgets').set({ component_props: JSON.stringify({ ...props, urlTemplate: '/:slug.html' }) }).where('id', '=', widget.id).execute();
    }
  }
} finally {
  await db.destroy();
}
