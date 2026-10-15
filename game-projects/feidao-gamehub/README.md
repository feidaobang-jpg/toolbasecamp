# 飞刀班长游戏合集（feidao-gamehub）

B站 Toy 平台的「游戏合集」入口页（仿 GameHub 形态）：一个独立的 COLLECTION Toy，网格展示全部自制游戏，点击卡片跳转到对应 Toy 试玩。

## 机制

- `package/index.html`（内联 CSS/JS）+ 共用作者主页跳转 `package/author-home.js` + 本地封面 `package/assets/`，无构建步骤。
- 跳转优先用 Toy SDK：`<script src="https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js">` 提供 `globalThis.toy.navigate({ type: 'toy', id: slug })`；SDK 不在场（本地预览等）时退回 `window.open('https://www.bilibili.com/toy/<slug>/index.html')`。参考火山哥哥 GameHub（toy_id 5780350732288）的实现。
- 游戏清单内联在页面 `GAMES` 数组里：slug、标题、分类（3D 重制 / 经典休闲 / 策略塔防）、简介、标签、封面（本地 assets，源为各 Toy 的 poster）。绑定了实机视频的游戏卡片带「▶ 实机视频」角标，点角标新开视频页。
- 卡片封面如加载失败会显示占位图案，不阻塞页面。

## 维护

新增已公开 Toy 游戏时，必须在本次发布收尾中更新此合集：在 `GAMES` 数组加一项（slug 用 `toy mylist --json` 里的 URL 路径），放入该游戏当前真实封面 `package/assets/<slug>.png`（或 .jpg），核对名称、分类与玩法说明，预览验证卡片及实际跳转后提交合集审核。仅有未公开预览、映射不明或当次禁止发布时记录待办，不添加不可玩的入口。新游戏没有已确认视频时不填 `video`；只有核实对应 BV 后才补角标。

2026-10-05：恐龙快打的已过审实机视频 `BV18XHW66E55` 已核验绑定到 Toy `40412421031936`，合集卡片补上同一 BV 的视频角标。

2026-10-13：加入独立游戏《枪火集结》（Toy 43022175699968，slug `feidao-gunfire`），按用户要求移除西游降魔入口。西游降魔明确排除，不因历史记录或自动比对重新加入。更新赤色要塞、玛丽和恐龙快打的当前关卡说明。合集不含作者网站、网站投票或网站账号入口；作者主页只通往B站。

2026-10-14：枪火集结卡片补上已核实绑定的实机视频角标 `BV12ypy68EZz`（平安县城 v0.5.0 双结局那期），玩法说明按重做版第三章更正为"战地模式争夺据点、抗战战役三章打到平安县城、操炮轰城门、城楼秀芹两种结局"，删掉已失实的"步行第一人称作战，载具第三人称跟随"。预览与线上均用无头 Edge 进内层 frame 实测：14 张卡片齐全、角标新开该 BV、点卡片经官方 SDK 跳出 `feidao-gunfire`。合集 13:51:22 提审、13:53:51 复核 published。证据见 `media-kit/releases/gunfire-video-badge-20261014/release.json`。

2026-10-15：8 款休闲小游戏（宝石迷阵、连连看、泡泡龙、飞行鸟、青蛙祖玛、百战天虫、打砖块、叠叠乐）的 Toy 已在 10-13 之后下架（`toy mylist` 由 15 件降到 7 件，CLI 无删除命令，判定为 Toy 后台手动删除或平台下架），合集里这 8 张卡片点开即 404，已全部从 `GAMES` 移除，分类筛选同步去掉空的「经典休闲」。封面 `poster.jpg` 重做为「6 款自制游戏」，与 `toy mylist` 当前 6 款游戏一致。同轮把自网站 `public/js/config.js` 的「益智休闲」整组摘掉（8 条 `toyUrl` 全部 404）；`public/html/game/*.html` 网页版文件和 `game-projects/**` 源码保留，只断导航，不做批量删除。

合集固定 Toy ID 为 `40495283951616`、slug 为 `feidao-games`；更新保留原ID、地址、可见性与视频绑定，作品写锁同普通Toy。写前重读最新主线、当前公开合集和 `toy mylist --json`，核对新增/下架/明确排除项，禁止旧清单覆盖其他任务的新卡片。同一轮合并成一次合集更新，提交后分别记录审核和公开核验状态。不创建定时同步任务。

## 发布 / 更新

```powershell
cd D:\project\toolbasecamp\game-projects\feidao-gamehub
toy update <toy-id> package --json        # 生成预览
toy update <toy-id> package --json --yes  # 核对后提交审核
```

首次发布用 `toy create package --title 飞刀班长游戏合集 --slug feidao-games --category COLLECTION --visibility public --poster poster.jpg --icon icon.png`。`poster.jpg`（1200×900）与 `icon.png`（500×500）：封面源文件是本目录根的 `poster-source.html`（引用 `package/assets/` 里的当前游戏截图），改数量或换卡片后用无头浏览器按 1200×900 截图导出即可；图标改动需另做。
