# 旧链接与站内入口返回 404

**优先级：高**

238 篇文章的 `/{slug}.html` 主链接均可打开。下列旧地址在 WordPress 可用，迁移站验收时返回 404。

| 类型 | 旧站样例 | 本地复验 | 预期 |
| --- | --- | --- | --- |
| 文章 RSS | [/feed](https://dmesg.app/feed) | [/feed](http://localhost:4321/feed) | 旧订阅地址能继续获取文章 RSS，可重定向至 `/rss.xml`。 |
| 评论 RSS | [/comments/feed](https://dmesg.app/comments/feed) | [/comments/feed](http://localhost:4321/comments/feed) | 旧订阅地址可获取评论 RSS。 |
| 文章分页 | [FFmpeg 第三页](https://dmesg.app/ffmpeg.html/3) | [FFmpeg 第三页](http://localhost:4321/ffmpeg.html/3) | 旧页码落到对应内容。 |
| 分类分页 | [畅言第二页](https://dmesg.app/justsay/page/2) | [畅言第二页](http://localhost:4321/justsay/page/2) | 从旧分页地址能继续查看对应的归档文章。 |
| 日期归档 | [2025 年 10 月](https://dmesg.app/2025/10) | [2025 年 10 月](http://localhost:4321/2025/10) | 旧归档链接打开对应年月的文章。 |
| 评论直链和留言分页 | [文章评论](https://dmesg.app/nfc-clone.html/comment-page-1#comment-6722) · [留言第二页](https://dmesg.app/message/comment-page-2) | [文章评论](http://localhost:4321/nfc-clone.html/comment-page-1#comment-6722) · [留言第二页](http://localhost:4321/message/comment-page-2) | 到达对应的评论或留言页，有旧锚点映射时可定位到该条评论。 |
| 独立页面和文件 | [隐私政策](https://dmesg.app/privacy) · [其他](https://dmesg.app/others) · [PGP 公钥](https://dmesg.app/BennyThink.asc) | [隐私政策](http://localhost:4321/privacy) · [其他](http://localhost:4321/others) · [PGP 公钥](http://localhost:4321/BennyThink.asc) | 可以访问原内容或其迁移后的对应地址。 |

另有两个站内入口需要核对。

- 238 篇文章标题下的作者链接都指向返回 404 的 `/author/benny`。首页的作者链接已经指向可用的「我是谁」。[失效作者页](http://localhost:4321/author/benny) · [作者介绍](http://localhost:4321/about-me)
- 有正文仍通过旧域名请求 `/wp-content/uploads/` 下的文件。以《2020 年终总结》的站内 MP4 为例，旧站返回视频，新站的同路径返回 404。域名切换后要确保这些文件仍可访问。[旧站视频](https://dmesg.app/wp-content/uploads/2020/12/2020122914045013.mp4) · [本地同路径](http://localhost:4321/wp-content/uploads/2020/12/2020122914045013.mp4)

迁移后的留言页已验证可以用「较早留言」翻页。复验兼容入口时，从旧地址直接访问并检查最终落点。[新留言分页](http://localhost:4321/message?comment-page=2#comments)
