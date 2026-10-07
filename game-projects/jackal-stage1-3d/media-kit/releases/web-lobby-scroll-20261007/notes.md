# web-lobby-scroll-20261007 — 联机大厅手机触摸无法滚动（共享修复，本站包已更新）

- 与虫潮围城同一任务修复（详见 starship-defense `releases/web-lobby-scroll-v0.22.2/notes.md`）：游戏页 `*{touch-action:none}` 命中共享大厅卡片后代，手机端"往下翻不了"。
- 共享 `coop.js`：大厅卡片及后代恢复 `touch-action:auto`，大厅打开时临时放开祖先容器的 none、关闭还原；本游戏 `js/game.min.js` 已重建，页面引用 bump `?v=lobby-scroll1`。
- 分类：严重修复（影响手机端联机入口操作）。
- 渠道：网站随本提交部署核验；Toy/TapTap 同步状态以本游戏 `media-kit/game.json`、`taptap-sync.json` 与主任务记录为准，下次相关任务读取。
