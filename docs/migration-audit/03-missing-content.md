# 正文和嵌入内容缺失

**状态：本地已修复（2026-11-22）**

正文从本地 WordPress 数据库原文恢复。按站长要求，音频、网易云音乐及 iframe 播放器不迁移；短片页保留 YouTube 可点击链接。

这类缺失涉及说明文字、表格和播放器，需要逐项和旧文对照。正文图片的渲染问题另见 [正文图片全部未渲染](01-inline-images.md)。

| 页面 | 观测结果 | 旧站 | 本地复验 |
| --- | --- | --- | --- |
| 使用 Python 将海量 MySQL 数据导入 Elastic Search/MongoDB | 已恢复标题、段落、表格、9 段代码和 8 张正文图；音频嵌入已移除。 | [旧站](https://dmesg.app/mysql-es-mongo.html) | [本地复验](http://localhost:4321/mysql-es-mongo.html) |
| 不小心把密码上传到 GitHub 了，怎么办 | 已恢复缺失标题和说明段落；网易云音乐嵌入已移除。 | [旧站](https://dmesg.app/git-password.html) | [本地复验](http://localhost:4321/git-password.html) |
| 双语短片 | 四个 YouTube 地址保留为可点击外链，不加载播放器。 | [旧站](https://dmesg.app/video-clips) | [本地复验](http://localhost:4321/video-clips) |
| 使用 Python 给带合并单元格的 Excel 加一列 | 正文和代码保留；两个 B 站 iframe 不迁移。 | [旧站](https://dmesg.app/python-excel-add-column.html) | [本地复验](http://localhost:4321/python-excel-add-column.html) |

复验时按原文顺序核对标题、段落、表格和代码。媒体播放器按站长要求删除；短片页保留外链。对比时排除旧站自动生成的目录和代码复制按钮。
