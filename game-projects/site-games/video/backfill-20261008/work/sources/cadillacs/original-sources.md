# 来源

- 游戏：恐龙快打 · 第一关 3D 重置版 v0.1.0。录制时本地服务读到的 game.min.js sha256 1c5227d2b8ea3651ad2ddd74b027685cdc661d5d296c96a17630d856bd6cfbc1（录制 10:53:40 开始时页面加载的是已提交的 v3（index.html ?v=3，sha256 1c5227d2…）；录制期间另一会话于 11:01:56 用未提交的「触屏按住拖动转视角」改动重建了 game.min.js（3c1d0dbe…），录像脚本结束时读到的是新文件，已更正。两者电脑键盘玩法与画面一致，差异只在手机触屏转视角。）
- 录像：record_views.cjs —— Playwright + 系统 Edge，页面内 qa/bot.js 依据实时快照决定移动/出招/转头，派发真实键盘事件；按计划在 15.8 / 39.17 / 48.37 / 68.03 / 101.03 / 152.77 / 174.1 / 218.7 / 236.7 秒用真实 C 键切换视角（调度规则在脚本里）。穆斯塔法，seed 7，默认规则（无限命、耐久标准、未开演示/无敌），一局打完整关，未跳关、未瞬移、未刷道具。1920×1080 逐帧截图 30fps；音轨为同局声音事件用 OfflineAudioContext 离线重新合成（游戏自身音乐音效，非外加）。
- 原片：capture/views-run-1080p.mp4（305.6 s，只留本机不入库）；事件与视角切换时间：capture/views-run-1080p.timeline.json。
- 成片全部镜头来自这一局；镜头顺序与时间对照见 script.md 与 edit/shared-zh/timeline.json。开头第一人称开枪片段（124–133 s）在时间上晚于第二段侧视开场，属于先放亮点的剪辑，解说未称其为连续过程。
- 解说、字体、封面：见 publish/bilibili-zh/credits.txt、audio/shared-zh/voice.json、edit/bilibili-zh/covers/design.json。
- 链接核验（2026-10-05）：Toy https://www.bilibili.com/toy/feidao-cadillacs-3d/index.html → 200，toy mylist 状态 published / PUBLIC；网站 https://www.zhengxiaohui.cn/html/game/cadillacs-stage1-3d/index.html → 200；投票页 https://www.zhengxiaohui.cn/game-vote.html → 200，/api/game-votes/options 含 cadillacs-stage1-3d。
