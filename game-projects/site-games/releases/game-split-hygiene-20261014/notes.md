# 虫潮围城 / 枪火集结 拆分后的收尾清理（2026-10-14）

用户先问两款要不要合并成「大厅选游戏、再选模式」，看过玩法差异后决定**保持分开**：虫潮做自动瞄准的建造塔防，枪火做手动瞄准的第一人称枪战。分开的前提是两款不再互相读写进度、不再互相残留代码。本目录记录为此做的三项清理。

涉及版本：虫潮围城 0.38.6 → **0.38.7**，枪火集结 0.4.0 → **0.4.1**。

## 1. 存档命名空间分开（枪火 848d7a8d）

缺陷：两款同在 `zhengxiaohui.cn` 域下，localStorage 按域共享，枪火直接复用了虫潮的 `chongchao-*` 键和 `sst_save_` 战役档前缀。虫潮的视角预设已精简成 3 档加第一人称，枪火还留着 5 档，玩家在一款里换视角会把另一款的偏好顶掉；走到战役存档路径时枪火还会直接覆盖虫潮的 `sst_save_auto`。云档标识和导出备份的 `game` 字段也都是 `starship-defense`，玩家备份文件混在一起无法分辨。

改法（只动枪火，虫潮一行不改）：

- 视角 `chongchao-person` → `gunfire-person`，昼夜 `chongchao-daylight` → `gunfire-daylight`， conquest 记录 → `gunfire-conquest-record-v1`，战役档前缀 `sst_save_` → `gfs_save_`，对战记录 → `gunfire-versus-record-v1`。
- 首次启动时把上述三把旧键**复制**过来（只复制，不删除、不覆盖已存在的新键），老玩家从枪火带过来的偏好不丢；虫潮自己的键保持原值。
- 云档与导出备份标识改 `gunfire-assembly`；Toy SDK 存档键改 `gunfire_normal_v1/auto_v2/previous_v2`、设备键 `gunfire_device_`；Toy 入口常量与绑定视频改枪火自己的 `feidao-gunfire` / `BV1Lfp76KEDd`。
- 按设计**继续共用**的四把通用输入键不动：`chongchao-keybindings-v1`、`chongchao-combat-controls-v1`、`chongchao-touch-layout-v1`、`chongchao-device-mode`。键位、战斗手感、触摸布局、设备模式是跨款一致的体验，不是进度。

复现与验证：`game-projects/site-games/qa/save-namespace-split.cjs`（真实开局、真实调用生产 `setCamMode`、真实打一把战地，17 项全通过）。要点是先确认「在枪火换过视角后回虫潮，虫潮仍是玩家自己存的第一人称」和「虫潮的战役自动档一字未改」，再确认迁移只搬一次。证据 `save-namespace-split.json`。

## 2. 删掉两款互相残留的死代码（a613a5e4）

两款拆分后各自留着对方已搬走的玩法，代码在跑、入口点不到，还会改写本不该碰的存档。

- 虫潮删抗战战役：`resistance-campaign.js`、`resistance-ui.js`、`resistance-assets.js` 三个模块连同 `game.js` 里 21 处 `warOn()` / `resistanceCampaign` 分支一起移除，`__gameQA` 不再暴露 `resistanceCampaign`，`NAV_ROOTS` 收成 `acidMenu,rvResult`。玩家可见文案同步（`combat-controls.js` 的说明改成只写战地）。过期脚本 `verify-resistance.cjs`、`verify-resistance-aim.cjs` 与 `package.json` 里对应的 `test:resistance*` 一并删除。
- 枪火删虫族模式与房车生存：`zerg-mode.js`（53KB）、`rv-breakout.js`（26KB）、`rv-town.js`（9KB）删除，`game.js` 里 64 处相关分支清除并把因此断掉的 `if/else` 链补好（两处悬空 `else` 只有构建能查出来）；`index.html` 去掉 `#zergHud` 与 `.zerg-mode` 样式；`NAV_ROOTS` 去掉 rv/zerg 条目。
- **没有**跟着删的两处，理由写清楚：虫潮的 `battlefield-*` 与 `vsMenu` 仍可通过联机房间（`settings.mode==='versus'` → `selectVersusRules`）进入，是活路径；枪火的 `warMenu/warResult` 是它自己的抗战战役，不是残留。

包体（`game.compat.js`，esbuild iife/chrome58/minify 后）：虫潮 1,345,621 → **1,280,293** 字节，枪火 1,233,246（合并基线，线上原为 1,232,981）→ **1,149,209** 字节。入口 `index.html` 68,492 / 68,352 字节，仍远低于 100KB 建议线。

复验：`game-projects/site-games/qa/mode-boot.cjs` 16 项全通过——虫潮六种模式（基地防守、守塔对战、房车生存、虫族模式、酸液围场、自由测试）和枪火大厅／战地／抗战三章都用真实点击（先展开 `<details>` 与更多面板，再点二级面板的开战键）进入并断言到对应状态；最后两项是「已删代码不留痕」：虫潮最终包里搜不到 `warReticle/warResult/warMenu`，枪火包里搜不到 `chongchao-rv-breakout-v1`/`chongchao-zerg-best-v2`，DOM 里没有 `#btnResistance`/`#zergHud`。证据 `mode-boot.json`。

## 3. 共用模块收成一份规范源（da1a3995）

两款目录里有 24 个模块逐字节相同（键位、存档读写与校验、触控布局、战场资源与配色、各类视效与单位视觉、对战与运营逻辑等），此前是复制两份各改各的，改一处常忘另一处。

- 规范源放 `game-projects/site-games/shared/`，游戏目录**保留运行时副本**：Toy 打包与 `./xxx.js` 子路径加载都按目录取文件，不能改成跨目录 import。
- `sync-shared.mjs` 默认只做校验：逐字节比对两份副本与规范源（sha256 前 12 位），并把任何未在清单归类的顶层 `.js` 报 `UNCLASSIFIED`、以 1 退出。`--write` 把规范源铺回两款，`--adopt <游戏> <文件…>` 把某款里真实需要的改动收回规范源再对齐，`--bootstrap` 只在建立清单时用。
- `shared-modules.json` 的 `perGame` 逐个写明 12 个确实分叉的模块和原因：`game.js` 是两款玩法本身（不是漂移，不合并）、`game.compat.js` 是构建产物、`cloud-save.js`/`save-panel.js` 是本次分开的存档标识、`toy-platform.js` 是 Toy 键与入口、`combat-controls.js` 是抗战文案删除后的差异、`update-history.js` 是各自版本、其余是地形高度/洞穴深度/手动弹药装填等玩法参数差异。今后新增分叉必须在清单里写原因，不能靠再复制一份规避检查。
- 验证：`--bootstrap` 建立 → 默认检查退出 0；负例（往规范源 `key-bindings.js` 尾部加一个换行）报 `DRIFT key-bindings.js：starship-defense 与规范源不一致，gunfire-assembly 与规范源不一致` 并退出 1；还原后回到 0；`--write` 跑完 `git status public/html` 无变化，说明本次收成规范源**没有引入任何行为差异**。

## 4. 换存档键时保住老玩家已有的档（11140d63）

网站侧的行为回归覆盖不到 Toy 打包和「旧文件能不能继续用」，这三处是从最终包体倒推出来的：

- `build-toy.mjs` 的守卫原来要求包里必须含 `"sst_save_"`，换键后直接报错拦住了打包（这条守卫是有用的，包没构建成功就发不出去）。改查 `"gfs_save_"`，但**重写目标继续用已发布版本一直在用的 `toy-gunfire-v1-sst_save_`**：Toy 的存档本来就按作品隔离，键名换新只会把 0.4.0 玩家的本地进度、`auto-backup` 和「这一成绩已提交」状态清零，换不了任何好处。
- `toy-platform.js` 的云档键换成 `gunfire_*` 后，读取保留 `chongchao_*` 兜底（含旧的按设备记录），新档一律写 `gunfire_*`，第一次云备份就自然迁过去；备份列表按记录去重，不把同一份列两遍。
- `save-panel.js` 的导入原来只认 `gunfire-assembly`，玩家以前导出的备份标的是 `starship-defense`，会被当成格式错误拒掉；现在两个标识都收，内容照样过 `validate`。导出文件名顺带改成「枪火集结-存档-」。

## 已知缺口与未验证项（如实保留）

- `verify-fps-rules.cjs` 本地已跑通 19 项，但战地入口在 0.4.0 后只留在枪火大厅，虫潮这边改成通过联机房间的 `selectVersusRules('conquest')` 进入同一段代码；顺带修了脚本里早就不存在的 `#keysPause` 选择器（改成暂停菜单里的「游戏设置」）。
- `verify-fps-rules-toy.cjs`、`verify-fps-rules-online.cjs` 本次**没有重跑**（前者要 `PREVIEW_URL`，后者要真实联机服务）。且线上联机脚本仍点虫潮已不存在的 `#btnVersus`——虫潮现在没有任何 UI 路径能开一个 conquest 房间，这是 0.4.0 大厅拆分留下的既有缺口，不是本次删除造成的，登记在这里等后续按产品决定处理，不用假选择器把它糊过去。
- 虫潮其他脚本（`verify-squad-ops.cjs`、`verify-touch-layout.cjs`、`capture-squad-ops.cjs`）也还写着 `#keysPause`，本次未改，碰到对应任务时再修。
- 枪火仍带 5 档视角预设，超出「每款 3D 默认 4 个视角」的规则；这属于产品改动，本次清理没有擅自砍，等用户点头再改。
- 桌面浏览器模拟不等于手机真机验收。

## 5. 各渠道状态

- **网站**：`11140d63` 推送后线上产物按字节核验过——`html/game/gunfire-assembly/game.compat.js` 1,149,511 字节（sha256 前 16 位 `8bd1e552cfc70989`），与本地构建逐字节一致，含 `gunfire-person`、`gfs_save_`、旧的 `chongchao_*` 云档兜底与新导出文件名；`html/game/starship-defense/game.compat.js` 1,280,293 字节，包里搜不到抗战字符串。两款的 `index.html` 里也没有 `#zergHud` / `#btnResistance` 残留。
- **Toy**：同一稳定包各提交一次审核，两款都已过审上线并在正式入口复验。枪火集结 0.4.1（Toy 43022175699968，zip sha256 `a0ae1de9…`，预览 `preview_w9n7dPez` → 提交后回执 `preview_KwxHycAQ`，2026-10-14T22:52:33+08:00 提审，22:54:42 平台 `published`／mtime 1791989682）；虫潮围城 0.38.7（Toy 38678478981120，zip sha256 `44689d87…`，预览 `preview_EEsCwaz1` → 提交后回执 `preview_38BHr3kg`，22:52:37 提审，22:54:27 平台 `published`／mtime 1791989667）。提审时先记 `auditing`，`auditing` 不等于上线；确认 `published` 后对正式入口 `feidao-gunfire` / `chongchao-qianshao` 各复跑一次 `toy-package-check.cjs`，两款 **10/10 通过**（22:57:01 与 22:57:16，证据 `site-games/releases/toy-package-check-20261014/{gunfire,chong}-public.json`：正式入口运行的脚本与本次上传包逐字节一致、已删玩法不在包里、存档前缀仍是 `toy-gunfire-v1-sst_save_` / `toy-chongchao-v1-sst_save_`、主玩法真实点击开局、视角只写自己的键、入口 68,269 / 68,409 字节、手机横屏菜单不裁切、无报错）。`published_*` 基线已推进到这两个版本，各渠道登记见两款 `media-kit/game.json` 的 `toy` 块与 `releases/web-save-ns-split-v0.4.1/handoff.json`、`releases/web-drop-resistance-v0.38.7/handoff.json`。
- **Toy 预览实测**：新增 `game-projects/site-games/qa/toy-package-check.cjs`，每款 10 项全通过（证据 `site-games/releases/toy-package-check-20261014/{gunfire,chong}.json` 与同名截图）。这项检查专门盯「预览里跑的脚本 = 本次构建的包」和「Toy 包内的存档前缀仍是已发布那把」，网站回归覆盖不到这两点。包体预检（`toy_doctor.py`）两款只有一条已知的无 contenthash WARN；入口 `index.html` 未压缩 68,269 / 68,409 字节，在 100KB 建议线内。
- **TapTap**：按 2026-10-10 的规则默认不发布，本次未同步。
- **视频简介**：两款这次都是内部清理与存档正确性修复，未构成「重大版本」，现有简介没有失实表述，按累计节奏记为待合并项，不单独更新。
