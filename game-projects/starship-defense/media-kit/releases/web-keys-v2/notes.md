# 电脑键位 v2：CS / 吃鸡式左手布局（虫潮围城 0.39.0 · 枪火集结 0.5.0 · 亮剑页 0.8.0）

日期：2026-10-15（用户 2026-10-14 提出：“所有右手的按键都要改到左手附近，跟 cs、电脑版吃鸡类似”，并要求两款所有模式电脑端默认鼠标接管）。
这是这一轮改动的第 1 批；蹲下 / 趴下、拔刀近战、去掉骑兵连、机枪手接管、增援、平安县城与李家坡的场景修改、原声与配乐在后续批次。

## 默认键位

| 动作 | 新默认 | 旧默认（不显示，没被占用时仍可用） |
|---|---|---|
| 转视角 | 鼠标（默认接管；被拒绝时按住拖动） | Q/E、Y/H（大厅可在键位设置里自己绑，亮剑页取消） |
| 射击 / 放置 | 左键 | J、回车 |
| 举枪 / 开镜 | 右键、Z | O（亮剑页） |
| 跳 / 直升机升高 | 空格 | K |
| 按住跑 | Shift | — |
| 蹲下 / 直升机降低 | C | N |
| 互动 / 上下载具 | F | I |
| 手雷 | G | U |
| 医疗 / 兵种支援 | E | N |
| 换枪 | Q（亮剑页：亮剑） | X |
| 切换视角 | V | C |
| 商店 / 建造 | B / T | O / L |
| 开始虫潮 | X | R |
| 换弹 / 出兵 | R | R |
| 战况 / 队伍 / 测试台 | Tab | T |
| 亮剑页骑兵连 | E | N |

- 键位存档换成 `chongchao-keybindings-v2`（两款仍共用）。布局整体换了，v1 的自定义不沿用；第一次进局在锁定提示里列一次新键（`chongchao-keys-layout-202610`）。亮剑页单独记 `lj_campaign_v1_keys2`，只对以前来过的玩家弹一次提示。
- 第三人称不再主动释放鼠标锁定；战地（虫潮联机房间、枪火大厅）也默认鼠标接管，替代 2026-10-11“战地不使用鼠标锁定”的说法。
- 亮剑跑步：只在往前（含斜前）时生效，速度约走路 1.45 倍；按住开火会先停跑开枪，开镜、换弹时跑不起来。操炮仍是 A/D 转炮口、W/S 调仰角，也可以直接用鼠标。

## 改到的地方

- 两款共用 `key-bindings.js`（规范源 `game-projects/site-games/shared/key-bindings.js`，`sync-shared.mjs` 检查一致）。
- 两款 `combat-controls.js`：电脑鼠标选项只剩“鼠标接管（推荐）/ 按住画面拖动”，旧的“键盘”值换成拖动。
- 两款 `game.js`：鼠标接管判定、锁定提示、各处写死的键名换成 `KL()`（含上下车、门、RV、开局、直升机、战地 / 银行提示、弹匣空提示），Tab 在局内再按一次能关掉联机队伍面板。
- 两款 `index.html` 写死的说明、虫潮 `acid-arena.js`、`rv-breakout.js` 的提示。
- 枪火 `liangjian/`：`input.js`（新映射与 Shift 跑、去掉键盘转视角）、`main.js`（V 切换人称、老玩家提示一次）、`game.js`（跑步、状态条与底部提示）、`ui.js`（菜单 / 暂停说明）、`index.html`（按钮上的电脑键名）、三章章节文件里的提示文字。

## 验收（本地 8795，合并 origin/master 762888b8 后）

- `verify-keys-v2.cjs`：虫潮 21/21、枪火 10/10（`qa-keys-starship.json`、`qa-keys-gunfire.json`）。
- `verify-first-person-mouse.cjs`：通过（`fps-mouse/results.json`）；`verify-combat-controls.mjs` 通过。
- `site-games/qa/mode-boot.cjs` 16/16、`save-namespace-split.cjs` 全部通过、`sync-shared.mjs` OK、`verify-menu.cjs` 各视口通过。
- 亮剑页（`game-projects/liangjian-pingan/qa/`）：`views.cjs` 82/82、`interact.cjs` 19/19、`story.cjs` 19/19、`cy-story.cjs` 26/26、`ljp-story.cjs` 40/40、`options.cjs` 43/43、`mobile.cjs` 107/107、`gunfire-chapters.cjs` 10/10，三章机器人通关（平安县城、苍云岭 hit、李家坡）都通过。`ljp-story.cjs` 和其他脚本并行跑时手榴弹雨瞄准两项会失败，单独跑通过，属于脚本对机器负载敏感，不是本次改动引起。
- 浏览器模拟，不等于手机真机；无头 Edge 允许鼠标锁定，真实浏览器在 Toy 外壳里被拒绝时会退回按住拖动。

## 发布

- 网站：提交 cb8c1a96 部署成功，线上包与主线逐字节一致；线上 `verify-keys-v2.cjs` 虫潮 21/21（`qa-keys-starship-prod.json`）、枪火 10/10（`qa-keys-gunfire-prod.json`），线上亮剑 `interact.cjs` 19/19。
- Toy：预览（虫潮 preview_fenpWdm0、枪火 preview_eKpwX3ij）跑 `toy-package-check.cjs` 10/10 与键位抽查后，2026-10-15 07:42 同包各提交一次，07:45 两款 published；正式入口复跑同一套检查通过（本目录 `toy-public*.json`，枪火的在 `gunfire-assembly/media-kit/releases/web-keys-v2-v0.5.0/`）。
- B站简介：亮剑两条视频（BV1Lfp76KEDd、BV1KFpJ6sEEK）里的“C 切换视角”“Q E Y H 转视角”因本版失实；同一时间主目录有别的会话在改这两条简介，本任务未改，交给用户决定一起改。虫潮旧视频里提到的 J / I / O 旧键仍能用，不算失实。
- 详细记录见同目录 `handoff.json`。
