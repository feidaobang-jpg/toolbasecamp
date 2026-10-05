# 飞刀班长游戏合集（feidao-gamehub）

B站 Toy 平台的「游戏合集」入口页（仿 GameHub 形态）：一个独立的 COLLECTION Toy，网格展示全部自制游戏，点击卡片跳转到对应 Toy 试玩。

## 机制

- 单文件 `package/index.html`（内联 CSS/JS）+ 本地封面 `package/assets/`，无构建步骤。
- 跳转优先用 Toy SDK：`<script src="https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js">` 提供 `globalThis.toy.navigate({ type: 'toy', id: slug })`；SDK 不在场（本地预览等）时退回 `window.open('https://www.bilibili.com/toy/<slug>/index.html')`。参考火山哥哥 GameHub（toy_id 5780350732288）的实现。
- 游戏清单内联在页面 `GAMES` 数组里：slug、标题、分类（3D 重置 / 经典休闲 / 策略塔防）、简介、标签、封面（本地 assets，源为各 Toy 的 poster）。绑定了实机视频的游戏卡片带「▶ 实机视频」角标，点角标新开视频页。
- 卡片封面如加载失败会显示占位图案，不阻塞页面。

## 维护

新增游戏时：在 `GAMES` 数组加一项（slug 用 `toy mylist --json` 里的 URL 路径），把该 Toy 的 poster 封面下载到 `package/assets/<slug>.png`（或 .jpg），重名保持一致。全部游戏绑定视频后可给 `video` 字段补 BV 号。

2026-10-05：恐龙快打的已过审实机视频 `BV18XHW66E55` 已核验绑定到 Toy `40412421031936`，合集卡片补上同一 BV 的视频角标。网站按用户当次要求暂撤西游降魔卡片与投票选项；合集中的原 Toy 入口继续保留。

## 发布 / 更新

```powershell
cd D:\project\toolbasecamp\game-projects\feidao-gamehub
toy update <toy-id> package --json        # 生成预览
toy update <toy-id> package --json --yes  # 核对后提交审核
```

首次发布用 `toy create package --title 飞刀班长游戏合集 --slug feidao-games --category COLLECTION --visibility public --poster poster.jpg --icon icon.png`。`poster.jpg`（1200×900）与 `icon.png`（500×500）由仓库根的截图脚本生成，改动后可重做。
