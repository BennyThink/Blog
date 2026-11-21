# 01 · 本地基础环境

状态：已完成。

目标：建立可重复启动、重建后数据不丢失的 EmDash 示例环境。

## 已完成

- [x] 使用现有官方 Blog 模板，站点标题设为「土豆不好吃」。
- [x] Astro server 输出，Node.js standalone 适配器。
- [x] SQLite 数据库与本地媒体存储。
- [x] 多阶段 Dockerfile，非 root 用户运行。
- [x] `docker-compose.yml`，仅绑定本机端口 4321。
- [x] bind mount：`./data:/app/data`、`./uploads:/app/uploads`。
- [x] 将原 named volumes 的现有示例数据停机复制到本地目录。
- [x] 首页、后台初始化资源、容器重建与数据持久化检查通过。
- [x] WordPress 目录排除在镜像之外，线上旧站保持原样。

## 操作

```sh
# 已有 .env 时保留现有密钥
docker compose up -d --build
docker compose ps
npm run verify:docker
```

首页：`http://localhost:4321/`；后台：`http://localhost:4321/_emdash/admin`。

数据库位于 `data/emdash.db`，媒体位于 `uploads/`。两个目录均已忽略提交；Linux 部署时需保证容器 UID/GID 1000:1000 有写权限。

## 验收与遗留

8 篇示例文章、1 个页面、7 张本地图片；重建后记录与媒体哈希一致，SQLite 完整性检查通过。具体证据见 [验收记录](verification.md)。

管理员 Passkey 尚待所有者注册；已登录后的编辑测试在第 06 步完成。原 named volumes 保留作回退副本，当前服务仅使用 bind mount。

下一步：[02 · 旧站盘点与功能取舍](02-inventory.md)。
