# 本地容器验收记录

日期：2026-11-21（Asia/Shanghai）

环境：Docker Desktop，Linux ARM64 容器；Node.js 24 bookworm slim；锁文件安装的 EmDash 1.5.0、Astro 7.4.13。

- `docker compose up -d --build`：构建并启动成功。
- `npx emdash seed seed/seed.json --validate`：通过。
- `ASTRO_TELEMETRY_DISABLED=1 npm run typecheck`：19 个文件，0 错误、0 警告、0 提示。
- `npm run verify:docker`：PASS。
- 首页、文章列表、后台初始化页面、后台 Astro island 与 React renderer 资源、setup status API：HTTP 200。
- 浏览器检查：首页显示「土豆不好吃」、示例站副标题和文章列表；后台实际渲染 Set up your site 向导，站点标题及副标题已预填。
- 持久化：实际执行 `docker compose up -d --force-recreate --no-build emdash`，确认容器 ID 改变。
- 重建前后：8 篇文章和 1 个页面的完整数据库记录一致；7 条媒体记录一致；7 张本地媒体的 SHA-256 全部一致；媒体 HTTP 下载的字节哈希一致。
- 非 seed 数据：写入随机数据库标记，重建后仍存在且值一致，随后清理测试标记。
- `PRAGMA integrity_check`：ok。
- 容器以 `node` 用户运行；端口绑定 127.0.0.1。

## Bind mount 调整后复验

- Compose 文件改为 `docker-compose.yml`，移除顶层 named volumes 声明。
- 停止容器后，将原数据库（含 WAL/SHM）及媒体复制到项目 `data/`、`uploads/`。
- Docker inspect 确认 `/app/data` 与 `/app/uploads` 均为 `Type: bind`，来源为当前项目的对应目录。
- 使用新配置启动并再次执行 `npm run verify:docker`：PASS。
- 实际替换容器后，8 篇文章、1 个页面、7 条媒体记录及所有媒体哈希一致；随机数据库标记保留，SQLite 完整性为 ok。
- 原 named volumes 未删除，保留为切换时的回退副本，当前容器不再挂载。

当前后台处于尚未注册管理员的初始化状态；未验证已登录后的编辑流程。站点所有者需自行注册 Passkey。生产构建有上游后台 JS chunk 超过 500 kB 的提示，不阻止构建和加载。

## Passkey 注册后的会话存储修复

所有者随后完成了 Passkey 验证，但注册响应和登录均失败。排查发现管理员与 Passkey 各有一条记录，初始化已完成；错误发生在 Astro 将会话写入默认的 `/app/node_modules/.astro/sessions/` 时，日志为 ENOENT。

显式配置 `sessionDrivers.fsLite({ base: "./data/sessions" })`，入口脚本创建该目录，使会话使用现有 data bind mount。保留管理员、Passkey 和内容，重新构建容器。真实指纹登录仍由所有者重试确认。

## 统一 data 目录后复验

当前仅挂载 `./data:/app/data`，子目录为 `sqlite/`、`uploads/`、`sessions/`。SQLite 主文件路径为 `data/sqlite/emdash.db`。

- 先停止容器，再移动数据库主文件、WAL/SHM、全部媒体及原会话；1,379 个文件逐一核对 SHA-256，搬移前后一致。
- 当前本地已包含所有者导入的内容，验证结果为 249 篇文章、10 个页面、1,375 条媒体记录；这些数量含原有示例数据，不代表旧站完整迁移验收通过。
- `npm run verify:docker` 再次通过：实际替换容器，记录哈希、媒体哈希及随机数据库标记保持一致，首页、后台及其资源 HTTP 200。
- 1 个管理员与 1 条 Passkey 记录仍存在；非 root 用户执行 Astro 会话写入、跨请求读取及测试会话清理通过。
- Astro 类型检查 0 错误、0 警告；SQLite integrity_check 为 ok。Docker inspect 确认仅一个 bind mount。
- 验收脚本改为比较完整记录的 SHA-256，避免真实文章较多时将正文全部输出并超出子进程缓冲区。

没有连接或变更线上 WordPress，也没有读取旧 WordPress 配置或导入真实内容。
