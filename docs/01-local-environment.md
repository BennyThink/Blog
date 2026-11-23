# 01 · 本地基础环境

状态：已完成，2026-11-21 验收收尾，站点所有者已确认。

目标：建立可重复启动、重建后数据不丢失的 EmDash 示例环境。

## 已完成

- [x] 使用现有官方 Blog 模板，站点标题设为「土豆不好吃」。
- [x] Astro server 输出，Node.js standalone 适配器。
- [x] SQLite 数据库与本地媒体存储。
- [x] 多阶段 Dockerfile，非 root 用户运行。
- [x] `docker-compose.yml`，仅绑定本机端口 4321。
- [x] bind mount：`./data:/app/data`（唯一挂载）。
- [x] 将原 named volumes 的现有示例数据停机复制到本地目录。
- [x] 首页、后台初始化资源、容器重建与数据持久化检查通过。
- [x] 管理员及 Passkey 已创建，修复会话存储目录，后台可用于后续导入。
- [x] 持久化目录统一为 data 下的 sqlite、uploads、sessions。
- [x] 文章固定链接恢复为 `/{slug}.html`，旧 `/posts/{slug}` 返回 301。
- [x] WordPress 目录排除在镜像之外，未切换线上流量。

## 操作

```sh
# 已有 .env 时保留现有密钥
docker compose up -d --build
docker compose ps
npm run verify:docker
```

首页：`http://localhost:4321/`；后台：`http://localhost:4321/_emdash/admin`。

数据库位于 `data/sqlite/emdash.db`，媒体位于 `data/uploads/`，会话位于 `data/sessions/`。整个 data 目录已忽略提交；Linux 部署时需保证容器 UID/GID 1000:1000 有写权限。

## 验收结果

初次使用 8 篇示例文章、1 个页面、7 张本地图片完成环境验收。后续所有者已进行真实内容试导入；最近一次容器重建验收包含 249 篇文章、10 个页面、1,375 条媒体记录，数据库记录与媒体哈希保持一致，SQLite 完整性检查通过。

类型检查、首页、后台资源、会话读写、固定链接及容器重建验证均通过。具体证据见 [验收记录](verification.md) 和 [固定链接兼容](02a-permalinks.md)。

## 后续阶段事项

本阶段无阻塞项。真实内容完整性、导入失败媒体、主题功能和后台编辑全流程分别在后续阶段核对，不因基础环境完成而视为已验收。原 named volumes 只是早期示例环境的回退副本，不是当前真实内容的最新备份。

下一步：[02 · 旧站盘点与功能取舍](02-inventory.md)。
