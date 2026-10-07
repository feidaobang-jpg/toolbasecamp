# web-lobby-scroll-v0.22.2 — 联机大厅手机触摸无法滚动修复（严重：无法操作）

## 来源
- B站 BV1WbHq6eEBt 评论（用户"主宇宙马克主宇宙马克"，2026-10-07，附截图）："作者，这怎么准备😭"＋"往下翻不了"。
- 现象：手机端打开虫潮围城联机大厅，奶油色弹窗内容超出视口，但手指上下滑动完全无法滚动，"返回游戏"等下方按钮不可达。

## 根因
- 游戏页 `index.html` 用 `*{touch-action:none}` 保证画布手势，该规则同时命中共享大厅 `.coop-card` 及其全部后代；coop.js 里只有 `.coop-panel{touch-action:auto}`，救不了卡片内部，触摸平移被判定为 none。
- 对照实测：线上旧包卡片 computed touch-action 为 `none`，两个方向 CDP 触摸拖拽 scrollTop 均保持 0；本地修复包为 `auto`，正常滚动。
- 坦克大战 3D 自定义 `#lobby` 面板同样被 `#stage{touch-action:none}` 挡住（祖先链），一并修复。

## 改动（共享，四款合作游戏同修）
- `public/js/game/coop.js`：`.coop-card,.coop-card *{touch-action:auto}`；新增 `setPanelVisible()`，大厅打开时临时把祖先链上 computed `touch-action:none` 的容器改为 auto、关闭时还原（覆盖 start/ended/close 全部显隐路径）。
- `public/html/game/tank-3d/style.css`：`.overlay .panel` 及后代 `touch-action:auto`；`body:has(.overlay:not([hidden])) #stage{touch-action:auto}`。
- 重建打包：starship `game.compat.js`、jackal/cadillacs `game.min.js`；页面引用统一 bump 为 `?v=lobby-scroll1`（含 game-online.html/online-hub.js 的 coop.js import）。

## 验证（Playwright+Edge，CDP 触摸拖拽，qa/touch-scroll-results.json）
- 虫潮 390×844 竖持（舞台强制横屏旋转 90°）：scrollTop 0→178，底部"返回游戏"可见可达。
- 虫潮 740×360 不旋转：scrollTop 0→18（全量溢出）。
- 坦克大战 3D 390×844：scrollTop 0→208，底部按钮可见。
- 页面无新增 pageerror；大厅 WS 连接失败不影响面板显隐与滚动。
- 桌面滚轮回归：该视口无溢出，未覆盖；桌面此前即正常，风险低。
- 真机多指触控未验证（桌面模拟），如实记录。

## 渠道状态
- 网站：本提交推送后核验线上部署。
- Toy/TapTap：四款游戏联机大厅同受影响，待按任务节奏同步（虫潮 962354、坦克 962376 已有 TapTap 映射；赤色/恐龙在审）。本次记录为待同步基线。
