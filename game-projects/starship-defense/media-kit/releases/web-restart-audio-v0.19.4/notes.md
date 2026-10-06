# web-restart-audio-v0.19.4 暂停后「重开本关」恢复声音（2026-10-06 夜）

用户在恐龙快打发现「暂停后点重新开始没有 BGM」，要求检查其他游戏。虫潮同样中招：暂停时 `AudioSys.pause(true)` 挂起整个音频，暂停菜单「🔄 重开本关」走 `restartLevel()` → `startPrep()`，没有解除，重开后背景音乐和音效全无；副本进行中暂停再重开走 `operations.finish(false)`，同一问题。基于 web-controls-inset-v0.19.3（另一任务的虚拟按键内移）。

- `restartLevel()` 开头 `AudioSys.pause(false)`，覆盖普通关卡和副本撤离两条路径。`game.compat.js` 用 `build-compat.mjs` 重建，与上一版相比只多这一处（+13 字节）。
- 验证：`game-projects/site-games/qa/restart-audio.cjs`（修复前线上「重开本关」后 suspended、音量 0；修复后 running、有声音输出）；`verify-keyboard.cjs` 16/19，失败三项（职业卡片方向键、开始按钮、放置建筑）在线上旧版同样失败，属于旧断言，与本次无关（`qa-keyboard/`、`qa-keyboard-live/`）。
