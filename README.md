# 土豆不好吃 · EmDash 博客

这是一个基于 [EmDash](https://github.com/emdash-cms/emdash) 和 Astro 构建的自托管博客项目。它从 WordPress 迁移而来，保留了原站的文章 URL 和部分主题交互，并加入了 EmDash 插件、归档、评论、搜索、RSS、主题设置和页面缓存等定制功能。

本仓库是完整站点实现，包含站点配置、主题组件和插件，适合用作参考或按需改造。它不是可以直接安装到任意 EmDash 站点的独立主题包。

## 功能

- 响应式首页、文章列表、文章详情、分类、标签、作者和年月归档
- 经典 WordPress 固定链接兼容、RSS、全文搜索和 SEO 元数据
- 文章评论、留言板、文章浏览量和主题设置管理
- WordPress 风格的 Portable Text 内容扩展与迁移辅助脚本
- SQLite 数据库、本地媒体存储和 Docker Compose 自托管配置
- 可配置的页面缓存、缓存预热和媒体代理

## 运行要求

- Node.js 24 或更新版本
- npm
- Docker Desktop / Docker Engine 与 Docker Compose（使用容器部署时）

## 本地开发

```sh
npm ci
mkdir -p data/sqlite
npm run dev
```

打开 <http://localhost:4321/> 查看站点，打开 <http://localhost:4321/_emdash/admin> 进入 EmDash 管理界面。首次启动时根据管理界面的提示完成初始化。

## Docker 部署

首次部署时生成本地密钥，再通过 Compose 从仓库中的 `Dockerfile` 构建并启动服务：

```sh
npm run secrets:init
docker compose up -d --build
```

已有 `.env` 时请沿用原密钥。Compose 默认将站点绑定到 `127.0.0.1:4321`，数据保存在项目的 `data/` 目录中，包括 SQLite 数据库、媒体文件和会话数据。对外提供服务时，请在 `.env` 中将 `EMDASH_SITE_URL` 设为正式地址，再构建镜像，并在反向代理配置 HTTPS。

备份前先停止容器，再备份整个 `data/` 目录；同时安全保存 `.env` 中的加密密钥。恢复时需要使用匹配的密钥和数据目录。

## 评论回复邮件

在 EmDash 后台的「设置 → 邮件」配置并启用发信服务，例如内置 SMTP。新评论表单默认勾选「有回复时邮件通知我」，访客可在提交前取消。站长从网页或 Telegram 回复后，系统在回复公开时按原评论的订阅状态发邮件。Telegram 会显示邮件结果。没有订阅记录的历史评论不会触发回复邮件。

## 初始内容与个性化

`seed/seed.json` 提供文章和页面的内容模型、分类和标签定义、站点默认信息及主导航。新站初始化后，可在 EmDash 管理界面创建文章、导入旧站内容或修改站点设置。

主题样式主要位于 `src/styles/theme.css`，基础设计变量位于 `src/styles/tokens.css`；页面组件在 `src/components/` 和 `src/pages/`，EmDash 插件位于 `src/plugins/`。

旧 WordPress 主题的参考副本位于 `WordPress-root/`，该目录由 `.gitignore` 排除，不包含在仓库中。迁移脚本可帮助处理旧站短代码，但导入后仍应检查含有自定义标签、嵌入媒体或复杂排版的文章。

## 常用命令

```sh
npm run dev             # 启动 Astro 开发服务器
npm run build           # 构建站点
npm run typecheck       # 检查 Astro 和 TypeScript
npm test                # 运行项目测试
npm run verify:docker   # 验证 Docker 部署和持久化
```

更多迁移和部署记录见 [`docs/`](docs/)。其中部分文档记录的是此站点的实际迁移过程，并非通用部署步骤。

## 许可

本仓库的 EmDash 站点代码以 [GNU GPL v2](LICENSE) 发布。
项目基于 EmDash 官方博客模板，并参考及移植了云落的 WordPressGit 主题。

上游代码及随附素材的来源、版权和许可见[第三方资源说明](public/vendor/README.md)。博客文章和照片的授权以各自的声明为准。
