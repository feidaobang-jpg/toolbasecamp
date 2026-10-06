# 2026-10-06 暂停后重开没有声音（跨游戏排查）与恐龙快打第二关可走范围

用户反馈：「恐龙快打暂停游戏后点击重新开始，BGM 没有播放？这个问题要检查其他几个游戏有没有，还要记录 game-maker。」「第二关为什么只有上半屏幕可以人物走动进入，下半屏无法进入？」

## 暂停重开无声

- 原因：暂停时把整个 AudioContext 挂起（suspend），「继续」会恢复，但「重新开始 / 重开本关」直接开新局，没有清掉暂停标志，新的一局 BGM 和音效全部静音（不只是 BGM）。
- 排查范围：已发布 Toy 的 3D 游戏。

| 游戏 | 线上（修复前） | 处理 |
| --- | --- | --- |
| 恐龙快打 v0.5.4 | 重开后 AudioContext 一直 suspended，音量 0 | `startGame()` 先 `A.musicDuck(false)` |
| 赤色要塞 v0.7.8 | 同上 | `startGame()` / `nextStage()` 先 `A.musicDuck(false)` |
| 虫潮围城 web-restart-audio-v0.19.4 | 「重开本关」后 suspended | `restartLevel()` 开头 `AudioSys.pause(false)`（副本撤离同一路径） |
| 坦克大战 | 正常（`restartStage` 已 `audio.pause(false)`） | 不改 |
| 超级玛丽 | 正常（`restartLevel` 已 `audio.pause(false)`） | 不改 |
| 西游降魔 | 暂停面板只有「继续」，无重开 | 不适用 |

- 回归脚本：`game-projects/site-games/qa/restart-audio.cjs`（真实点击开始 → 暂停 → 重开；AudioContext running、时钟在走、扬声器出口实测音量）。修复前线上结果 `qa/out/restart-audio-live*`（本机），修复后本地 29/29。
- game-maker 技能已记录（「2026-10-06 暂停重开声音与可走范围」一节、`references/controls-and-display.md` 暂停一节）；写入时持有 `skill-write.lock`。

## 第二关可走范围

- 原因：第二关三段与第一关用同一纵深（z −2.3～2.5），但第一关前排下方有楼顶边缘 / 路沿等明显边界，第二关地面、草和水一直铺到画面底部，可走范围只到画面约 60% 高，看起来下半屏能走却进不去。
- 处理：第二关可走纵深加到 z 4.0（前排在画面约 83% 高）；取景仍按原来 z 2.5 那一排算（`camZ1`），观察点抬高 1 米（`camTy`）让地面整体下移；前排更靠近镜头时锁屏左右边界按透视收窄（`nearInset`），角色不出画；外沿放一排灌丛 / 芦苇 / 碎石骨头标出边界。第一关不变。
- 回归：恐龙快打 `qa/depth.js`（真实按键走到最前 / 最里 / 左右两端，投影检查）。
