# 土豆不好吃：EmDash 迁移工作区

第一阶段仅运行官方 Blog 模板的示例数据。没有连接线上 WordPress、导入真实文章、修改域名或切换流量。

## 当前边界

- 原始模板：EmDash 官方 `templates/blog`（仓库现有代码），保留文章、页面、分类、标签、搜索、RSS 和三栏阅读布局。
- 站点标题为「土豆不好吃」，副标题明确标识示例站。
- 主题参考：`WordPress-root/wp-content/themes/WordPressGit-master`。等待功能清单后再移植；当前不执行或修改旧主题。
- `WordPress-root` 整体排除在镜像构建之外，旧站配置、数据库凭据、插件和文件不会进入镜像。
- 本地地址为 `http://localhost:4321`；Compose 仅绑定 `127.0.0.1`。
- 后台为 `http://localhost:4321/_emdash/admin`。首次进入显示初始化向导，需要站点所有者完成管理员 Passkey 注册。没有预置共享管理员，也没有启用开发认证绕过。
- 评论沿用模板默认开启。正式发布前必须配置审核策略，或一并移除评论开关和界面。

## 运行

需要 Docker Desktop / Docker Engine + Compose，以及 Node.js 24（运行本地工具时）。

```sh
npm ci
npm run secrets:init
# 已有 .env 时跳过上面的密钥生成，保留原密钥。
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 emdash
```

`.env` 中的加密密钥不会提交到 Git，也不会进入镜像；Compose 在启动时注入。备份数据库时也应安全保存该密钥。端口可用 `EMDASH_PORT` 改动，改动时将 `EMDASH_SITE_URL` 一并更新到新的 localhost 地址，再重建镜像。正式域名同样需要在构建和运行时保持一致。

首次使用空 data 目录时，入口脚本通过官方 `emdash seed` CLI 导入示例文章及图片。图片下载到本地 uploads 目录；首次启动需要访问示例图片源。数据库已存在时不重新导入，避免重建容器覆盖编辑内容。初始化中断时检查日志并手动执行相同 seed 命令（默认冲突策略为 skip），不要删除已有数据目录。

## 数据位置与重建

| 内容 | 容器路径 | 宿主机目录（相对项目根目录） |
| --- | --- | --- |
| SQLite 与 WAL/SHM | `/app/data/emdash.db` 及同目录附属文件 | `./data` |
| 本地媒体 | `/app/uploads` | `./uploads` |

Astro 登录会话保存在 `data/sessions/`，与 SQLite 共用 data bind mount。入口脚本确保目录存在；不要改回镜像内的默认缓存目录，否则非 root 容器可能无法保存登录会话。

```sh
# 替换容器并沿用本地目录
docker compose up -d --build --force-recreate
# 停止并删除容器，保留本地目录
docker compose down
# 再启动
docker compose up -d
```

配置文件为 `docker-compose.yml`，使用 bind mount，没有声明 named volumes。`docker compose down` 不会删除本地数据；不要手动删除 `data/` 或 `uploads/`。移动项目时需一起复制这两个目录和 `.env`。

备份时先停止容器，再归档 `data/` 与 `uploads/`，保证 SQLite 主文件和 WAL/SHM 一致；恢复到本地目录后使用对应应用版本和原 `.env` 密钥启动。Linux 宿主机需确保这两个目录对容器 UID/GID 1000:1000 可写；容器继续使用非 root 的 node 用户。

本次已在停机后把原 named volumes 的数据复制到本地目录，再切换到 bind mount。旧 named volumes 保留为回退副本，当前配置不再使用它们。

## 可重复的验收

```sh
ASTRO_TELEMETRY_DISABLED=1 npm run typecheck
npx emdash seed seed/seed.json --validate
npm run verify:docker
```

验收脚本会实际替换运行中的容器，适用于此本地示例站。它验证首页、文章列表、后台 HTML 与 JS 资源、初始化状态 API、SQLite 完整性、文章和页面完整记录、所有媒体文件 SHA-256；另外写入一个不属于 seed 的随机数据库标记，确保重建后保留，再清理标记。可用 `EMDASH_VERIFY_URL` 指定更改后的本地端口。

此阶段的后台验收覆盖初始化向导和资源可达性；所有者注册 Passkey 后，再验收登录及内容编辑。

## 后续需要从线上准备的资料

本阶段不需要导出。进入真实内容迁移前，可由站点所有者在 WordPress 后台「工具 → 导出」选择「所有内容」，下载 WXR/XML；同时准备 `wp-content/uploads/` 的完整压缩包（保留目录结构）。XML 本身不包含图片二进制。

之后一并提供需要保留的主题功能清单，以及现有固定链接格式、菜单和关键页面截图。若需恢复插件专有字段或主题设置，再按功能清单决定是否需要脱敏数据库导出；现在不用提供数据库、线上账号或密钥。

## 依据

- [官方 Blog 模板](https://github.com/emdash-cms/emdash/tree/main/templates/blog)
- [Node.js 部署](https://docs.emdashcms.com/deployment/nodejs/)
- [Seed 与媒体导入](https://docs.emdashcms.com/themes/seed-files/)
- [WordPress 迁移](https://docs.emdashcms.com/migration/from-wordpress/)

API/配置已通过官方文档 MCP `search_docs` 核对，并结合已安装 EmDash 1.5.0 CLI 源码确认参数。
