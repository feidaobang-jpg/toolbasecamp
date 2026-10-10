# 移除无人直播功能 live-removal（2026-10-10）

用户明确决定不再做无人直播，本次把《虫潮围城》的直播功能整体移除，不留残余入口。基线为 `web-resistance-aim-v0.33.1`（源提交 `fde6e977`）。普通单机玩法不变，没有新增或改动任何战斗、建造、队友、载具与关卡逻辑。

移除范围共 39 个文件：`game-projects/starship-defense/live/`（服务端、B站鉴权、本地模型解说与测试，17 个）、公网 `public/html/game/starship-defense/live*.html|js|css`（7 个）、`media-kit/releases/live-v0.1.0/`（版本记录与 QA，15 个）。文件送入回收站，同时可从版本历史恢复。

核心脚本 `game.js` 剥离全部 18 处直播耦合点，4708 行减至 4647 行。这些耦合在普通试玩下恒不成立（`liveController` 始终为 `null`、`LIVE_MODE` 始终为 `false`），因此化简后行为等价：删除 `createLiveController` 导入、`LIVE_MODE` 与 `liveController` 声明、`playerAim` 的直播瞄准分支、主循环 `liveController.tick`、启动序列 `setupLiveGame()` 调用与整个函数体（54 行）、页面隐藏与失焦暂停的 `!LIVE_MODE` 条件、Toy 平台初始化的 `if(!LIVE_MODE)` 条件；`updWave` 去掉 `&&!liveController` 后仍在战斗态正常推进。`SAVE_PREFIX` 由三元分支改为常量 `'sst_save_'`，`autoSave` 与 `slotInfo` 只保留 `Game.testMode` / `sandbox_` 分支。保留被存档面板复用的 `savePrefix()` 函数，也保留虫族、抗战、联机等新增玩法的守卫分支。

`build-taptap.mjs` 同步清理 3 处直播补丁：删除 `live-controller.js` 的桩替换、`LIVE_MODE=false` 改写，存档命名空间校验从两种候选收敛为唯一字面量，避免引用已删除文件导致打包失败。`media-kit/game.json` 移除 `live` 段，改记 `live_status: removed` 与本次移除清单及"不再引入"标记。`menu-text-20261009/handoff.json` 中已删文件的哈希属于当时的发布快照，按不追溯改写历史证据的原则保留原样。

产物重建后 `game.compat.js` 为 1138857 字节，SHA-256 `cedef445ac43d039a9a1a854aea999ee9d5e7e034c99a709e9569cac4efd868d`；按项目惯例（内容哈希前 10 位）把 `index.html` 的缓存参数由 `?v=7c1509199a` 递增为 `?v=cedef445ac`，只改这一个引用页，未做全站 cache-bust。

实测（本机隔离静态服务 + Edge headless，`verification.json`、`performance.json`）：`verify-web.cjs` 11 项通过、0 错误，精致/流畅两档约 168 FPS、drawCalls 372/399，覆盖键盘开局、移动、四档相机、商店/建造/暂停、三次死亡复活与保护、基地被毁重开、390×844 旋转触屏摇杆与射击、触屏暂停恢复、QA 空波次过关。另做定向验证确认改动点等价：`LIVE_MODE`、`liveController`、`setupLiveGame` 与 `__CHONGCHAO_LIVE_TEST__` 均已不存在；普通开局 `prep`→`battle`，`playerAim` 返回有效方向，`autoSave` 写入本地存档、`slotInfo` 读回成功，等待 6 秒波次实际推进（spawned 9→12、planIndex 0→3、同屏敌人 15→18），控制台 0 错误。本地服务上 `live.html` 与 `live-console.html` 返回 404，`index.html` 与 `game.compat.js` 返回 200。

未做与限制：未做真人键鼠试玩与手机真机验收；未采集音轨、未人工试听。`verify-save-browser.cjs` 未运行，它硬编码 8941 端口并需要 Toy/TapTap 打包产物；`build-taptap.mjs` 在本工作区未跑通，原因是同级 `game-projects/site-games` 缺 esbuild 依赖（全新工作区未安装），与本次改动无关，其语法检查通过、存档命名空间替换逻辑已单独验证正确。Toy 与 TapTap 包未重新提交，按 2026-10-09 节奏登记 22 点 b-2 批次；直播从未进入这两个渠道的包。

对外影响：本次改动前公网 `live.html` 仍可访问（HTTP 200），但站内导航与 `games.html` 均无指向它的链接，B站简介同步状态为 `deferred`。已绑定 Toy 的四条视频（BV1Ujad6DEuf、BV1WbHq6eEBt、BV1C5HQ6gEvD、BV1xdpx63ETu）投稿文案与简介均无直播相关表述——对 `game-projects/starship-defense/` 全目录检索「无人直播」「AI战地直播」「直播守城」「弹幕」「live.html」只命中本次新增的移除记录与 `menu-text-20261009` 的历史哈希快照，因此没有需要更正的公开表述。移除后由 GitHub Actions `rsync public/` 撤下入口，线上核验结果见 `website.json`。

Toy 与 TapTap 包本身从未包含任何 `live.*` 文件（Toy 白名单只有 `index.html`、`boot.js`、`game.compat.js`、`combat-controls.css`、`icon.svg`、`vendor/LICENSE.txt`；TapTap entries 亦不含），且这些包里 `LIVE_MODE` 由 URL 参数决定、恒为 `false`，因此平台玩家看不到任何变化。但两个包都会 bundle 本次改动的 `game.js`，重新打包后内容哈希必然变化。v0.33.1 的 `channel-batch.json` 已是 `pending_22_batch`，其 `package_note` 要求 22 点从最新已发布主线重新打包并同游戏合并一包；本次移除随之并入该批次，不单独触发一次平台审核，也不改写该既有台账。Toy（ID 38678478981120）与 TapTap（962354）的 `pending` 状态、四条视频简介待办均保持原样，由 b-2 统一处理。
