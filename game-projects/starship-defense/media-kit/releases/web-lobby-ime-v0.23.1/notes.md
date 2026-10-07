# web-lobby-ime-v0.23.1 — 联机大厅输入法方向修复（共享修复，主任务记录）

- 与四款合作游戏同一任务修复：手机竖屏时游戏面板靠 CSS 旋转成假横屏，系统输入法仍按真实竖屏弹出，键盘与面板方向不匹配。
- 共享 `public/js/game/landscape-typing.js`（新增）：大厅文本框聚焦时尝试进入全屏并 `screen.orientation.lock('landscape')`，系统真实转横屏后键盘随之变横屏；不支持/被拒（如 iOS）时提示"键盘按竖屏方向弹出，建议先把手机转为横屏再输入"。
- 共享 `coop.js` 在 `CooperativeLobby` 构造时安装（覆盖虫潮等 remake 游戏）；tank-3d `main.js` 自行安装；tank_battle.html 与 jackal/cadillacs/starship 的 index.html 内联同款安装器（Toy/TapTap 包自包含）。
- 相关共享模块 import 缓存版本统一 bump 为 `?v=ime-live1`（与主线赤色要塞四人合作任务的 coop-live 系列合并后取新号）；三款打包产物按合并后源码重建。
- 分类：普通修复（不影响打开/存档，影响手机端大厅输入体验）。
- 渠道：网站已部署并核验（landscape-typing.js / main.js / coop.js / 各 index.html 线上均含新代码，2026-10-07）。
- Toy：虫潮围城 38678478981120 以 `chongchao-qianshao.zip`（web-coop-v0.23.1）提交审核，2026-10-07，状态 auditing；预览实测菜单/联机入口正常。
