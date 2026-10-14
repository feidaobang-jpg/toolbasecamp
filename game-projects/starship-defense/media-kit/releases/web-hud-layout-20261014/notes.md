# 虫潮围城 0.38.4 · 主战役 HUD 重排（战场中间清空）

## 需求（用户 2026-10-14）

用户附手机截图：「虫潮界面合理布局一下，中间很多被面板遮挡了，你看看精简，合并放四周还是啥。」
截图里叠在战场中间的有：保存状态胶囊、整段「本章提示」、右列经济/战术读数伸到画面中部、城门互动提示、绿色开战按钮。

## 改法：四类信息各归一条边

| 区域 | 内容 | 说明 |
| --- | --- | --- |
| 左竖栏 `#hudLeft`（新增，在 `#hud` 之后） | 周目/章节/环境、生命与基地条、小地图、本章短提示、保存状态胶囊 | 原来这些散在左上、顶部居中、底部居中三处，会互相压 |
| 右上 `#hudRight` | 金币/分数/击杀/背包/小队/母皇/波次读数 | 手机上只留读数，命令按钮移出 |
| 顶部条带（手机） | 武器栏 `#weaponBar` | 从「底部居中」挪到左栏与右上读数之间的空档 |
| 底部备战条 `#prepDock`（新增） | 「战术部署」「队友」+「准备完毕，开战」 | 桌面仍顶部居中（开战在上、命令行在下）；手机放底部安全带 |

配套改动：

- 本章完整说明（复活规则、整备键位、母皇早杀/晚杀取舍、副本与自由测试说明）新增 `chapterBriefing()`，渲染进「战术部署」面板的 `#tacticsChapterTip`；战场里 `showHint` 只留一行短提示，键位一律走 `keyBindings.label()`。
- 手机上「战术部署」「队友」从 `#hud`(z10) 移出到 `#prepDock`(z30)，避开全屏转视角拖拽层 `#lookZone`(z20) 吞触摸的老问题（见本机记忆 chongchao-touch-hud-dual-entry）。
- 保存胶囊淡出后连高度一起收起（`.save-health.faded` 折叠），并把小地图缩到 84px、隐藏常态的「基地耐久归零即失败」与基地距离引导（受袭/危急时仍显示），让左竖栏停在摇杆上方。
- 战地/银行对战：`#stage.versus-mode #prepDock{display:none}`，枪槽恢复原来的居中顶部位（不套用主战役的左对齐条带）。
- 版本 0.38.3 → 0.38.4，`game.compat.js?v=fb0384`，重建 esbuild 兼容包。

替代关系：0.38.2 的「手机右栏挪到动作键左侧」由本次布局取代（右栏回到右上角，命令按钮进底部备战条）。

## 遮挡测量（同视口对照）

测量脚本 `game-projects/starship-defense/qa/hud-layout.cjs`：按舞台逻辑像素取每个 HUD 元素的盒子，两两求交（跳过父子），并统计「中心战场区」（横向 20%–80%、纵向 8%–92%）被盖住的并集比例，再用 `elementFromPoint` + 真实点击验证触屏命令按钮可点。备战态固定摆出最容易叠在一起的三类瞬时提示（本章提示、城门互动提示、保存胶囊）。

视口：1280×720、1366×625（电脑矮窗口）、844×390、800×390、390×844（竖屏旋转）、740×360。

| 视口 | 改前重叠 | 改前中心遮挡 | 改后重叠 | 改后中心遮挡 |
| --- | --- | --- | --- | --- |
| desktop | 2（提示×城门提示、状态×小地图） | 28.6% | 0 | 25.4% |
| desktopShort | 3 | 36.1% | 0 | 32.7% |
| phone 844×390 | 5（右栏×提示、右栏×大标题、胶囊×枪槽、右栏×胶囊、提示×大标题） | 37.3% | 0 | 35.6% |
| phoneCompact | 5 | 36.6% | 0 | 34.7% |
| phonePortrait | 5 | 37.3% | 0 | 35.7% |
| phoneTall | 5 | 37.0% | 0 | 35.4% |

「改前」数据取自 `origin/master` 同版本代码（临时目录 `public/html/game/sd-hud-before/`，验证后已删除）。中心遮挡比例没有大幅下降，是因为该区域把常驻的武器栏、底部备战条与右列读数都算进去了；真正的变化是**面板不再互相叠压、也不再出现糊住战场中部的文字块**（见 `before-*.png` / `after-*.png` 同视口对照）。

触屏可点性（改前 → 改后）：`tacticsButton` click 超时 → 可点开面板；`squadOrderBtn` click 超时 → 可点切换；`readyBtn` 两版都可点。

战地/银行对战（压上 `versus-mode` 类）：改前手机 5 处重叠、桌面 3 处；改后只剩 3 秒关卡大标题 `#msg` 与枪槽/读数的瞬时相交（大标题本就会浮在 HUD 上，改前同样存在）。

## 回归

- `node verify-readybtn-touch.cjs` → QA-OK（竖屏/横屏开战按钮在底部安全带且真实触摸可开战、建造时暂避、保存胶囊淡出后不吃点击、桌面保持顶部原位）。该脚本原先用 `readyBtn.offsetTop` 判断位置，按钮迁入 `#prepDock` 后 offsetTop 变成相对备战条，已改成按舞台逻辑坐标测量（含竖屏换轴），断言目标不变。
- `node verify-look-keys.cjs` → 17/17（提示文字跟随当前键位）。
- `node verify-panel-scroll.cjs` → 商店/建造面板在 740×360、844×346、1280×720 下均可滚动到首尾，无报错。
- `node verify-cloud-save.mjs` → 26 例通过；`node verify-combat-controls.mjs` → 通过。
- 模式扫描：虫族、房车、银行、战地在压上对应模式类后，六个视口除上述瞬时大标题外无重叠。
- `verify-conquest.cjs` / `verify-acid-arena.cjs` 点的是已从菜单移除的 `#btnVersus` / `#btnAcid`，在 `origin/master` 上同样超时失败，属旧脚本失修，不是本次改动引入。

## 尚未覆盖

桌面浏览器模拟只验证布局与点击，真机的多点触控、曲面屏安全区实际值、低端机帧率仍需手机实测；本次未改动玩法与存档结构。

## 各渠道落地（2026-10-14）

- 主线提交：`b5032f7d`（改动）＋ `98583053`（整合 origin/master），推送后线上 `https://www.zhengxiaohui.cn/html/game/starship-defense/index.html` 已含 `hudLeft` / `prepDock`（部署管道把 `?v=` 改写为 `?v=98583053`，按内容核验）。
- Toy 包：`node build-toy.mjs` → `dist/toy/chongchao-qianshao/chongchao-qianshao.zip`，SHA256 `0dcf451d3ae7765c6fe048bf6c4c4774f22061d2d1c5d264165ec10885ecdea3`，447,800 字节；入口 `index.html` 未压缩 68,409 字节，低于 2026-10-13 通知的 100KB 建议值。存档命名空间已按 Toy 包改写为 `toy-chongchao-v1-sst_save_`。副本留档 `C:/Users/37818/.claude/state/game-releases/artifacts/hud-layout-20261014/chongchao-qianshao-v0.38.4.zip`。
- 包体本身（本地静态服务 + 同一套体检）：六个视口重叠 0、无脚本报错、`tacticsButton`/`squadOrderBtn`/`readyBtn` 均可点 → `qa/toy-report.json`、`qa/toy-*.png`。
- 预览实测：`toy update 38678478981120 <zip> --json` → `preview_VB54BdGe`；体检脚本加了 `FRAME_HOST=bilibilitoy` 以进入预览的 iframe 壳内层，六个视口同样重叠 0、按钮可点、无报错 → `qa/toyPreview-report.json`。
- 提审：`--yes` 一次成功（回执 `status: auditing`，提交时间 2026-10-14T18:31:51+08:00，提交预览 `preview_8jQvlF89`）；34 秒后 `toy mylist` 已是 `published`（mtime 1791973945）。本次没有再遇到 307008。
- 正式入口未登录复测：`https://www.bilibili.com/toy/chongchao-qianshao/index.html` 内层 frame 已带 `#hudLeft`/`#prepDock`，点「开始新游戏」进到备战态后 HUD 正常，手机视口左栏底部 217 < 摇杆顶部 245，无脚本报错 → `qa/onlinePhone-battle.png`、`qa/onlineDesktop-battle.png`。
- 本包同时带上此前只进网站、尚未送审的 0.38.2（网友反馈修正）与 0.38.3（模式入口整理），以及更早被 307008 挡住的 `web-fps-rules-v0.34.0` 内容；`game.json` 的 `pending_toy_merge` 相应标记为已被 0.38.4 取代。
- TapTap：用户未要求，按「默认不发布」未推送。B站视频简介：本次属普通体验改动，未达「≥3 次有意义稳定更新且距上次公开核验 ≥7 天」的合并条件，只记待合并项。
