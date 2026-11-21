# 固定链接兼容

状态：已完成，2026-11-21 本地容器验收通过。

文章采用旧 WordPress 的 `/{slug}.html` 地址，保持 Astro 服务端渲染。`.html` 是路由后缀，不会生成每篇文章的静态文件。

| 请求 | 行为 |
| --- | --- |
| `/nfc-clone.html` | 返回文章，canonical 使用此路径 |
| `/posts/nfc-clone` | 301 到 `/nfc-clone.html`，保留查询参数 |
| `/posts` | 文章列表 |
| 不存在的文章 | 404 |

## 实现位置

- `src/pages/[slug].html.astro`：正式文章路由，沿用原文章布局与 CMS 查询。
- `src/pages/posts/[slug].ts`：查询文章存在后返回 301。
- `src/utils/post-url.ts`：卡片、搜索和 RSS 共用的文章链接函数。
- `src/layouts/Base.astro`：LiveSearch 的 posts routeMap。
- `seed/seed.json`：新环境的集合 URL 规则和最近文章组件链接模板。
- `scripts/migrate-post-urls.mjs`：现有数据库的幂等迁移，入口脚本在服务启动前执行。

迁移只将 posts 的旧 `/posts/{slug}` 规则改为 `/{slug}.html`，并更新使用默认文章路径的最近文章组件。遇到其他集合 URL 规则会停止启动并提示检查，避免覆盖另行定制的设置。已自定义的侧栏链接模板不自动覆盖。

文章 slug、正文、发布日期、评论、媒体和管理员不随此次路由调整修改；独立页面仍用 `/pages/{slug}`，分类、标签和媒体路由保持现有结构。

## 验证

```sh
ASTRO_TELEMETRY_DISABLED=1 npm run typecheck
docker compose up -d --build
node scripts/verify-permalinks.mjs
```

路由验收检查 NFC 示例、旧路径单跳 301、查询参数、无效文章 404、首页/列表/搜索/侧栏链接、RSS 和 posts sitemap。

本次实际重建容器后再次通过上述检查及持久化验收。迁移前后文章、页面、评论、媒体、管理员和 Passkey 的记录哈希一致；当前为 249 篇文章、10 个页面、1,375 条媒体记录，SQLite 完整性检查为 ok。类型检查 0 错误、0 警告。

现有数据库的迁移前备份保存在 `data/sqlite/backups/before-html-permalinks-*.db`。回退需要同时回退代码和集合 URL 配置；不要在仍有新增内容时直接用旧备份覆盖当前数据库。

## 后续范围

仍需单独盘点旧站独立页面、分类、标签、“说说”和其他 URL。导入正文及菜单中指向 `dmesg.app` 的绝对链接没有批量替换；正式上线前根据最终域名和内容映射验收。
