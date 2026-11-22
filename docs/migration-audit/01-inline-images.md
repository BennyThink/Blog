# 正文图片全部未渲染

**优先级：阻塞切站**

逐篇比较 238 篇文章的正文 HTML。旧站有 219 篇文章包含正文图片，共 1,413 张，对应的新站正文没有输出 `<img>`。首页缩略图、特色图和评论头像独立渲染，不计入正文统计。

| 样例 | 旧站正文图片数 | 旧站 | 本地复验 |
| --- | ---: | --- | --- |
| 我的欧洲生活 – 瑞典篇 | 23 | [查看](https://dmesg.app/europe-se.html) | [查看](http://localhost:4321/europe-se.html) |
| 我的欧洲生活 奥地利 | 6 | [查看](https://dmesg.app/europe-at.html) | [查看](http://localhost:4321/europe-at.html) |
| 我只是想复制个门禁卡 | 2 | [查看](https://dmesg.app/nfc-clone.html) | [查看](http://localhost:4321/nfc-clone.html) |

三个样例在本地迁移数据中都有对应的 Portable Text 图片块，验收时抽查的线上媒体文件也返回了 200。当前项目的 `ProxyPortableImage.astro` 将 `node` 传给了 `emdash/ui` 的 `Image`。该导出接收特色图使用的 `image` 属性，正文图片节点对应的组件是 `PTImage`。[正文图片组件](../../src/components/ProxyPortableImage.astro#L2)

复验时检查三篇文章的图片能在正文原位置显示，确认图片请求成功、图片链接与灯箱可用，再批量对照旧站的正文图片数量。
