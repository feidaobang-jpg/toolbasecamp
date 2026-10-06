# 虫潮围城 B站 AI直播

共享普通游戏核心，直播入口为 `public/html/game/starship-defense/live.html`；控制台为 `live-console.html`。当前版本 live-v0.1.0。

## 本机启动

Node.js 22+；在本目录 `npm ci` 后运行 `node server.mjs`，或执行 `start-live.ps1`。默认 http://127.0.0.1:18765 。服务只监听本机，不开放公网端口。

`node install-local.mjs` 将验证过的运行文件安装到 `%LOCALAPPDATA%/ChongchaoLive/app`，不依赖开发worktree。双击其中的「启动虫潮AI直播.cmd」。已有本机配置不会被安装覆盖。

桌面入口使用Windows PowerShell 5.1；中文PowerShell脚本保持UTF-8 BOM与CRLF，安装器会统一处理编码。冷启动探测使用`UseBasicParsing`，无需Internet Explorer初始化；服务启动失败会明确提示日志位置。

配置在 `%LOCALAPPDATA%/ChongchaoLive/config.json`，不在Git或静态目录。修改后退出服务再启动。事件回执在同目录 `events.jsonl`、礼物查重为 `gift-receipts.json`；未确认生效的礼物不自动重放。

桌面启动地址`http://127.0.0.1:18765/`会跳转到完整控制台路径，让相对样式、脚本与直播链接正确加载。`/live.html`短入口也可用；OBS仍使用前述完整直播地址。浏览器入口回归运行`node tests/browser-entry.cjs`，覆盖真实根入口、弹出直播画面、互动与错误日志。

## 已实现玩法

- 15秒整备、300秒守城、12秒结算，胜利或失守后自动下一场；正常伤害与复活，不用无敌演示替代战斗。
- AI独播 / 我操作AI辅助 / 我主持AI操作，本局中切换；AI驾驶采用游戏逻辑，中文主持使用本地Ollama；无模型时明确降级为固定播报。
- 免费弹幕加入或选医疗/工程/突击/机枪组，对应四名现有AI队友，不是每人生成独立角色。每人5秒最多执行一次选组，为该队友恢复最多8点生命。最多200名本场参与者。
- 守城/跟随，每人一票可改票，20秒多数决定，平票守城。
- 维修：基地最多恢复500生命；护盾上限150；坦克：已有则修复，否则部署一辆；轰炸：前线目标半径14米、250伤害，无目标明确回执未执行。
- 身份码鉴权、官方长连与心跳、主播UID16214353核对；真实礼物按msg_id/order_id去重，按数量拆成固定效果回执。只有配置的礼物ID参与支援；不猜测礼物名与价格。
- 模拟事件只允许未连接B站时使用，画面明确显示演示；一台服务只允许一个直播画面执行事件。
- 游戏帧超过8秒无心跳、真实支援回执超时或B站断线：暂停互动，调用官方end关闭场次；可连接OBS时，只停止「虫潮AI直播」当前场景的推流。其它场景不动。end失败会记录状态并停止心跳，须核验B站礼物下线。
- 本机中文TTS（Microsoft Huihui Desktop）；主持麦克风避让只检测本机音量，不录音、不上传。需要本人允许麦克风访问。AI发言先进行游戏范围提示与输出过滤；这不能保证所有生成内容绝对无误。

## 本地模型

已选择官方 `qwen2.5:1.5b`（Apache 2.0，约986MB），Ollama /api/chat。默认CPU推理，避免占用游戏GPU；可在 `ollama.numGpu` 修改后实测。API与Ollama版本以官方文档为准。

若本机代理fake-IP导致Ollama拒绝下载，可用官方registry获取模型manifest、逐个下载列出的blob，逐一SHA256核验，保存到 `.ollama/models/blobs` 及对应manifest；不得用未经核验文件冒充模型。本任务安装记录见release handoff。

## 本人最后需要完成的步骤

1. B站直播开放平台申请开发者权限、项目审核，申请需要的弹幕与礼物事件权限。Toy作品上线不等于直播项目获准。提交玩法演示、规则，以及AI独播/人工辅助的真实运行方式；向平台核实本项目无人值守独播边界。
2. 在本机config的 `bilibili` 中填写官方 `appId/accessKeyId/accessKeySecret`。不要粘贴密钥到聊天或Git。项目支持的专用互动礼物审核后，按正式gift ID填写 `giftMappings`（字段id/name/action；action仅repair/shield/tank/strike）。例如 `[{"id":"实际礼物ID","name":"审核后的名称","action":"repair"}]`，不要直接使用示例字符串。
3. 确认获准AI独播后才设 `approvedForUnattended:true`。这个字段只是本机防误操作开关，不是平台批准证明。未确认时可本地演示；正式连接选择人工辅助或本人主持。
4. 在B站取得自己的主播身份码，在控制台连接。代码会核对UID16214353，不连接其他账号。
5. OBS「场景集合」选择已安装的「虫潮AI直播」。若列表里没有，导入安装目录的 `OBS-虫潮AI直播.json`（场景集合→导入），或在控制台连接OBS WebSocket后「建立专用场景」。在工具→WebSocket服务器设置开启服务，并把密码填写到本机config，以便故障停播与本地录制控制。浏览器源1920×1080、控制音频通过OBS，确认游戏与AI语音均进入混音器；本人声音另加麦克风输入，麦克风避让开关本身不替代OBS收音。
6. 本人设置B站推流地址/密钥，先本地录制检查，随后手动开播。程序不自动开播；普通预览和控制台不是推流画面。真人接管用OBS浏览器源「交互」或专门游戏窗口；避免同时打开两个执行窗口争抢。

## 首批真人直播安排

当前方案使用OBS推流，利用浏览器源与WebSocket配合AI音频和故障停止。真人不必出镜，首批采用游戏画面加本人声音；摄像头小窗可后续再决定。本人主要回应玩家建议、解释当场挑战、点评输赢，常规战况由AI播报。

先试每周3场、每场60分钟，连续两周。优先19:00–20:00，20点后可去健身；若该时段常冲突，则统一试22:00–23:00。用同一观察窗口记录进房、停留、互动与关注，再决定时段和频率。尚无本账号实播数据，时间和频次是试运行建议，不保证涨粉或收益。AI无人值守独播待平台许可与真实接入核验，不自动延长直播或创建定时开播。

## 验证方式

`npm test` 验证轮次/模式、投票、冷却、人数边界、事件去重、官方签名与压缩包解析。
`node tests/browser-smoke.cjs` 需要Playwright与Edge，验证实际游戏、三种模式、支援、胜负重开、暂停与普通游戏回归；`NODE_PATH` 可指向本机已有Playwright模块。`LIVE_TEST_URL` 可指定隔离测试端口。加速时钟仅用于切换验收，实际300秒持续运行另外记录，不将加速测试称为完整实播。

官方资料：
- https://open-live.bilibili.com/document/849b924b-b421-8586-3e5e-765a72ec3840
- https://github.com/bilibili-openplatform/OpenLive_CSharpDemo
- https://docs.ollama.com/api/chat
- https://ollama.com/library/qwen2.5:1.5b
- https://obsproject.com/kb/remote-control-guide

真实B站权限、礼物、推流及平台对AI独播的许可，缺少本人材料时保留为未验证，不能由本地模拟推断。
