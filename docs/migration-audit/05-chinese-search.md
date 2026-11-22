# 中文搜索漏掉标题匹配

**优先级：高**

在站内搜索输入「欧洲」。旧站第一页有 10 条结果，新站当时只有 3 条，分别是挪威篇、英国和爱尔兰篇、荷兰篇。瑞典篇、奥地利篇、西班牙篇等标题含「欧洲」的公开文章未出现在结果里。[旧站结果](https://dmesg.app/search/%E6%AC%A7%E6%B4%B2) · [本地复验](http://localhost:4321/search/%E6%AC%A7%E6%B4%B2)

英文 `Cloudflare` 搜索和第二页当时可用，可用于回归比较。另有旧搜索书签 `/?s=欧洲` 在新站直接显示首页，需要纳入旧 URL 兼容复验。[英文搜索](http://localhost:4321/search/Cloudflare) · [英文结果第二页](http://localhost:4321/search/Cloudflare/page/2) · [旧式搜索入口](http://localhost:4321/?s=%E6%AC%A7%E6%B4%B2)

复验以标题包含「欧洲」的已发布文章能被检索到为准，同时核对首页搜索入口、分页与无结果提示。
