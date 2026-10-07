# web-lobby-hint-v0.23.2 · 联机大厅改为手动建房（普通补丁）

- 分类：普通补丁（联机入口交互与说明），玩法、兵种与关卡未变。
- 改动：共享大厅 `public/js/game/coop.js` 被 `game.compat.js` 内联进本包 —— `?coop=create` 只打开大厅并提示"填好昵称、房间名称、人数和密码后点「创建房间」"，不再静默建房；已在房间时创建/加入按钮改为可见锁定态（`aria-disabled`）且仍可点，点击说明"你已在房间 XXXXXX，请先点「退出房间」再加入其他房间"；邀请链接 `?coop=六位房号` 公开房自动加入、密码房提示填密码、满员/已开局/不在线分别给出原因。
- 本包同时带入此前已上线网站但尚未单独送审 Toy 的累计联机改动（2–4 人建房、中途加入、闲置 30 秒电脑接管、房主踢人，即 web-coop 系列）。
- 验证：`game-projects/site-games/qa/coop-lobby-entry.cjs` 本地真实双浏览器 11/11；重建后的 `game.compat.js`（944,003 B）与线上文件同尺寸、含大厅新逻辑。
- 渠道：
  - 网站：主线提交 `1dd01fd5`；线上 `html/game/starship-defense/game.compat.js` 944,003 B 与本地一致，页面引用令牌 `?v=1dd01fd5`。
  - Toy `38678478981120`（chongchao-qianshao）：按 `web-lobby-hint-v0.23.2` 提交审核（2026-10-07 21:52），zip `dist/toy/chongchao-qianshao/chongchao-qianshao.zip`，`sha256 aeaa75be…570042`；预览 `https://www.bilibili.com/toy/preview/preview_yjhO8hti/index.html`，实测预览 `https://www.bilibili.com/toy/preview/preview_LBAHTRrN/index.html` 已按 1280×720 与 390×844 双视口通过（大厅可开、手动建房、锁定态说明、无脚本报错）。slug、PUBLIC 可见性、视频绑定未改动，包内存档命名空间仍为 `toy-chongchao-v1-sst_save_`。**2026-10-07 21:56 复核：公开入口 `https://www.bilibili.com/toy/chongchao-qianshao/index.html` 双视口复测 12/12 通过（首跑因页面加载超时，复跑通过），判定审核通过并已公开生效；此前累计未送审的 web-coop 联机改动随本包一并生效。**
  - TapTap：本次未重新打包同步。
  - B站简介：普通补丁，累计到下一次有意义的简介更新（现有公开说明仍是联机 2–4 人版本），文案备在 `media-kit/bilibili-sync.json`。
