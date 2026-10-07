# lobby-hint1 · 联机大厅改为手动建房（普通补丁）

- 分类：普通补丁（联机入口交互与说明），玩法未变。
- 改动：坦克大战自建大厅（`public/html/game/tank-3d/main.js`）不再自动点「创建房间」；`?coop=create` 进来只打开大厅并提示"填好昵称、房间名称与密码后点「创建房间」建房"；邀请链接 `?coop=六位房号` 公开房自动加入、密码房提示填密码、房间不在线或已满/已开局时分别说明原因；已在房间时面板显示房间号并收起建房表单，避免"灰按钮点了没反应"。共享模块 `public/js/game/coop.js` 同步改动，包内 `coop-shared.js` 由 `build-toy.mjs` 带入。
- 验证：`game-projects/site-games/qa/coop-lobby-entry.cjs` 本地真实双浏览器 10/10（不静默建房＋提示、手动建房、面板显示房间号并收起表单、邀请链接自动加入名单 0/1、不存在房间说明原因、密码房提示与填对能进）；线上站点复测 10/10，走正式 `wss://www.zhengxiaohui.cn/api`。
- 渠道：
  - 网站：主线提交 `1dd01fd5`，线上 `html/game/tank-3d/main.js` 与本地同尺寸同内容（67,886 B，含 `intentHint` / `autoJoinInvite`），`js/game/coop.js` 线上 24,274 B 与本地一致，页面引用令牌 `?v=1dd01fd5`。
  - Toy `39043249461248`（feidao-tank-3d）：按 `lobby-hint1` 提交审核（2026-10-07 21:52），预览 `https://www.bilibili.com/toy/preview/preview_bA1HMTC7/index.html` 已按 1280×720 与 390×844 双视口实测（大厅可开、手动建房得到房间号、面板显示房间号并收起建房表单、无脚本报错），slug、PUBLIC 可见性与视频绑定（BV1Wqaz6AEJb、BV1TepK69Eet）未改。**2026-10-07 21:56 复核：`toy mylist` 与公开入口 `https://www.bilibili.com/toy/feidao-tank-3d/index.html` 均为该包，双视口复测 10/10 通过，判定审核通过并已公开生效。** 此前待审的 `lobby-scroll1` / `coop-live2` 联机改动同在本包内，一并生效。
  - TapTap：本次未新增打包同步，沿用上一版待合并记录。
  - B站简介：普通补丁，累计到下一次有意义的简介更新，一句话文案备在 `media-kit/bilibili-sync.json`；本会话无创作中心登录态，未提交。
