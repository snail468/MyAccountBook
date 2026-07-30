# 源素材

这里放的是**加工前**的原始素材，不参与构建、不会被打进镜像。

应用实际使用的是 `public/` 下已处理好的副本：

| 源文件 | 对应产物 |
|---|---|
| `网站图标.jpg` / `网站图标1.jpg` | `public/favicon.png`、`public/icon-192.png`、`public/icon-512.png` |
| `首页音效.mp3` | `public/audio/home.mp3` |
| `其它全局音效.mp3` | `public/audio/global.mp3` |
| `普通账本和旅游账本.txt` | 需求笔记，无产物 |

改图标或音效时改这里的源文件，再重新导出到 `public/`。
之前这些文件散在仓库根目录，容易被误认为构建需要的东西。
