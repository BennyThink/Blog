# 生产站点 URL 与索引设置

**优先级：阻塞切站**

公开验收时，238 篇文章的 canonical 和 `og:url`、站点地图、robots.txt 与 RSS 都指向 `http://localhost:4321`。从公开页面点击「站长登录」，服务器也返回了指向 `localhost:4321` 的 302。外部访客会被带到自己的机器，订阅器和爬虫也会拿到本机地址。文章同时带有 `noindex, nofollow`。

| 检查项 | 本地复验 |
| --- | --- |
| 文章 HTML 中的 canonical、`og:url` 和 robots 元标签 | [文章样例](http://localhost:4321/nfc-clone.html) |
| Sitemap 声明及站点地图各级链接 | [robots.txt](http://localhost:4321/robots.txt) · [站点地图](http://localhost:4321/sitemap.xml) · [文章站点地图](http://localhost:4321/sitemap-posts.xml) · [页面站点地图](http://localhost:4321/sitemap-pages.xml) |
| RSS 的频道、条目和自引用地址 | [RSS](http://localhost:4321/rss.xml) |
| 未登录时后台入口返回的 `Location` | [站长登录](http://localhost:4321/_emdash/admin) |

Dockerfile 的构建参数 `EMDASH_SITE_URL` 默认是 `http://localhost:4321`，部署工作流未传入该参数。检查生产镜像构建与运行时使用的公开 URL。[Dockerfile](../../Dockerfile#L6) · [镜像构建工作流](../../.github/workflows/deploy.yml#L38)

本地开发使用 `localhost:4321` 是预期行为。切站验收要在最终公开地址上检查上表，确认生成的绝对链接与登录跳转使用正式域名，并在开放收录时关闭暂存模式。
