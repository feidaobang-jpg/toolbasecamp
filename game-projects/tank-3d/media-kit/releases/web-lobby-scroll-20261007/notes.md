# web-lobby-scroll-20261007 — 联机大厅手机触摸无法滚动（共享修复，本站包已更新）

- 与虫潮围城同一任务修复（详见 starship-defense `releases/web-lobby-scroll-v0.22.2/notes.md`）：游戏页 `*{touch-action:none}` / `#stage{touch-action:none}` 挡住大厅面板触摸滚动，玩家反馈"往下翻不了"。
- 坦克大战 3D：`style.css` 为 `.overlay .panel` 及后代恢复 `touch-action:auto`，并用 `body:has(.overlay:not([hidden])) #stage` 放开祖先；QA 390×844 scrollTop 0→208、底部按钮可达。
- 赤色要塞 / 恐龙快打：共享 `coop.js` 修复已重建进各自 `js/game.min.js`，页面引用 bump `?v=lobby-scroll1`。
- 分类：严重修复（影响手机端联机入口操作）。
- 渠道：网站随本提交部署核验；Toy/TapTap 同步状态以本游戏 `media-kit/game.json`、`taptap-sync.json` 与主任务记录为准，下次相关任务读取。
