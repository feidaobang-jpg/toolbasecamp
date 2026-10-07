# v0.9.5 · 联机大厅改为手动建房（普通补丁）

- 分类：普通补丁（联机入口交互与说明），玩法与关卡未变。
- 改动：共享大厅 `public/js/game/coop.js` 进入本包 —— `?coop=create` 只打开大厅并提示先填昵称/房间名称/人数/密码再点「创建房间」，不再静默建房；已在房间时「创建房间 / 加入房间」改成可见锁定态（`aria-disabled`）且仍可点，点击说明"你已在房间 XXXXXX，请先点「退出房间」再加入其他房间"；邀请链接 `?coop=六位房号` 公开房自动加入、密码房提示填密码、满员/已开局/不在线分别说明原因。本包同时包含 v0.9.4 的旧 WebView 玩家标识兼容（恐龙快打启动失败修复）。
- 验证：`game-projects/site-games/qa/coop-lobby-entry.cjs` 本地真实双浏览器 11/11；重建后的 `js/game.min.js`（820,090 B）与提交内容逐字节一致。
- 渠道：
  - 网站：主线提交 `1dd01fd5`，线上 `html/game/cadillacs-stage1-3d/js/game.min.js` 820,090 B、页面引用令牌 `?v=1dd01fd5` 已核验。
  - Toy `40412421031936`（feidao-cadillacs-3d）：按 v0.9.5 提交审核（2026-10-07 21:52），预览 `https://www.bilibili.com/toy/preview/preview_Hy2hKSFi/index.html` 已按 1280×720 与 390×844 双视口实测（大厅可开、手动建房、锁定态说明、无脚本报错）；slug、可见性与视频绑定未改动。**2026-10-07 21:56 复核：公开入口 `https://www.bilibili.com/toy/feidao-cadillacs-3d/index.html` 双视口复测 12/12 通过，判定审核通过并已公开生效；v0.9.4 的旧 WebView 玩家标识启动修复随本包一并生效。**
  - TapTap：本次未重新打包同步，v0.9.4 的启动修复重建仍待下一次 TapTap 批次。
  - B站简介：普通补丁，累计到下一次有意义的简介更新，文案备在 `media-kit/bilibili-sync.json`。
