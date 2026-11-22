# 土豆不好吃 · EmDash 迁移项目

本阶段使用官方 Blog 示例数据，线上 WordPress 保持原样。

运行、数据目录、验收与后续导出说明见 [迁移说明](docs/migration.md)。

逐步迁移清单见 [迁移步骤](docs/README.md)。Compose 文件为 `docker-compose.yml`，通过 bind mount 将数据库和媒体保存在项目的 `data/` 目录（含 `sqlite/`、`uploads/`、`sessions/`）。

```sh
npm run secrets:init  # 仅首次生成 .env；已有密钥时跳过
docker compose up -d --build
```

首页：http://localhost:4321/

后台：http://localhost:4321/_emdash/admin

留言板使用 `/message` 页面及其关联评论。Docker 启动时会更新已有数据库的留言配置。直接用 `npm run dev` 启动恢复后的本地数据库时，先运行 `node scripts/migrate-post-urls.mjs`。

图片代理可在后台「插件 → 土豆 · 主题与功能」设置 `WebP Cloud Services Proxy URL`（例如 `https://7bc5d24.webp.ee`）。留空时图片继续使用 EmDash 原始媒体地址；填写后，本站媒体 URL 的主机名会替换为该代理地址，并保留原路径与查询参数。

---

# EmDash Blog Template

A clean, minimal blog built with [EmDash](https://github.com/emdash-cms/emdash). Runs on any Node.js server with SQLite and local file storage.

![Blog template homepage](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-light-desktop.jpg)

## What's Included

- Featured post hero on the homepage
- Post archive with reading time estimates
- Category and tag archives
- Full-text search
- RSS feed
- SEO metadata and JSON-LD
- Dark/light mode

## Pages

| Page | Route |
|---|---|
| Homepage | `/` |
| All posts | `/posts` |
| Single post | `/posts/:slug` |
| Category archive | `/category/:slug` |
| Tag archive | `/tag/:slug` |
| Search | `/search` |
| Static pages | `/:slug` |
| 404 | fallback |

## Screenshots

| | Desktop | Mobile |
|---|---|---|
| Light | ![homepage light desktop](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-light-desktop.jpg) | ![homepage light mobile](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-light-mobile.jpg) |
| Dark | ![homepage dark desktop](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-dark-desktop.jpg) | ![homepage dark mobile](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-dark-mobile.jpg) |

## Infrastructure

- **Runtime:** Node.js
- **Database:** SQLite (local file)
- **Storage:** Local filesystem
- **Framework:** Astro with `@astrojs/node`

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:4321/_emdash/admin and complete the setup wizard. EmDash runs database migrations and applies the blog seed during setup. The site is available at http://localhost:4321.

## Want Cloudflare Instead?

See the [Cloudflare variant](../blog-cloudflare) for a version that deploys to Cloudflare Workers with D1 and R2.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/emdash-cms/templates/tree/main/blog-cloudflare)

## See Also

- [All templates](../)
- [EmDash documentation](https://docs.emdashcms.com/)
