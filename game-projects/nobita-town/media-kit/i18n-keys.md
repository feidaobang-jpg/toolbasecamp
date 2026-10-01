# nobita-town i18n keys（nobitaTown.*）

- 站点 locale 文件（`public/js/locales/zh-CN.js` / `en.js`）本游戏未改动；游戏页面在 `index.html` 内嵌 `window.GAME_I18N` 兜底字典，并在启动时把全部 key 合并进 `window.TB_LOCALES`（`zh-CN.nobitaTown` / `en.nobitaTown`）。
- 站点接入时只需把下表 key 原样写入两个 locale 文件（同一嵌套路径 `nobitaTown.*`），写入后删除页面内合并逻辑即可无缝切换；不写入也完全正常（兜底字典生效）。
- 参数占位符：`{n}`（数字）。

## 全量 key 对照（共 56 条）

| key | zh-CN | en |
|---|---|---|
| nobitaTown.title | 哆啦A梦小镇漫游 | Nobita Town Wander |
| nobitaTown.kicker | 同人 3D 漫游 · 收集 7 枚记忆铃铛 | FAN-MADE 3D STROLL · FIND 7 MEMORY BELLS |
| nobitaTown.intro | 傍晚的小镇等着你：以中央广场为起点，逛遍 7 处熟悉的地点、点亮路牌，再把藏在各处的 7 枚「记忆铃铛」收进口袋。漫步没有失败，比比谁逛得又全又快。 | The town glows in the evening light: start at the central plaza, visit 7 familiar spots, light up their signs and pocket the 7 hidden memory bells. No way to lose — just wander far and fast. |
| nobitaTown.start | Enter · 开始漫游 | Enter · Start the stroll |
| nobitaTown.replay | Enter · 再逛一次 | Enter · Wander again |
| nobitaTown.back | 游戏中心 | Game hub |
| nobitaTown.pause | 暂停 | Pause |
| nobitaTown.resume | 继续 | Resume |
| nobitaTown.paused | 已暂停 | Paused |
| nobitaTown.full | 全屏 | Fullscreen |
| nobitaTown.fullFail | 此浏览器不支持全屏，游戏仍可正常游玩。 | Fullscreen is not supported here — the game stays playable. |
| nobitaTown.soundOn | 音效：开 | Sound: on |
| nobitaTown.soundOff | 音效：关 | Sound: off |
| nobitaTown.touch | 触屏控制 | Touch controls |
| nobitaTown.note | 同人风格致敬演示 · 程序化美术与音效 · 与原作官方无关 | Fan-made tribute demo · Procedural art & sound · Not affiliated with the original |
| nobitaTown.fileWarn | 本地双击打开（file://）无法加载 3D 模块，请使用网站地址或 HTTP 本地服务。 | Opening from file:// cannot load the 3D module — use the website or a local HTTP server. |
| nobitaTown.move | 移动（相对镜头） | Move (camera relative) |
| nobitaTown.run | 加速跑 | Run (hold) |
| nobitaTown.jump | 跳跃 | Jump |
| nobitaTown.interact | 互动 / 点亮路牌 | Interact / light the sign |
| nobitaTown.camera | 切换镜头 · 回默认 | Camera presets · reset |
| nobitaTown.startPause | 开始 / 暂停 | Start / Pause |
| nobitaTown.help | WASD 移动 · Shift 加速 · K 跳 · J 互动 · Q/E 镜头 · C 回正 · Esc 暂停 | WASD move · Shift run · K jump · J interact · Q/E camera · C reset · Esc pause |
| nobitaTown.hudBells | 铃铛 | Bells |
| nobitaTown.hudTime | 时间 | Time |
| nobitaTown.hudScore | 得分 | Score |
| nobitaTown.plaza | 中央广场 | Central Plaza |
| nobitaTown.promptJ | 按 J 互动 | Press J to interact |
| nobitaTown.touchTalk | 互动 | Talk |
| nobitaTown.touchJump | 跳 | Jump |
| nobitaTown.signLit | 路牌已点亮 {n}/7 | Sign lit {n}/7 |
| nobitaTown.bellGot | 收到记忆铃铛 {n}/7 · +100 | Memory bell {n}/7 · +100 |
| nobitaTown.resultKicker | 漫游完成 | STROLL COMPLETE |
| nobitaTown.resultTitle | 你把小镇逛了个遍！ | You wandered the whole town! |
| nobitaTown.statTime | 总用时 | Total time |
| nobitaTown.statDistance | 里程 | Distance |
| nobitaTown.statSteps | 步数 | Steps |
| nobitaTown.statBells | 记忆铃铛 | Memory bells |
| nobitaTown.statVisits | 点亮路牌 | Signs lit |
| nobitaTown.statBonus | 时间奖励 | Time bonus |
| nobitaTown.statTotal | 总分 | Total score |
| nobitaTown.statBest | 最高纪录 | Best |
| nobitaTown.newRecord | 新纪录！ | New best! |
| nobitaTown.loadError | 3D 模块加载失败，请刷新重试。 | Failed to load the 3D module — refresh to retry. |
| nobitaTown.place_nobita | 大雄家 | Nobita's House |
| nobitaTown.place_nobita_desc | 日式两层小屋和熟悉的院门，放学回家的起点。 | A two-storey Japanese home with the familiar garden gate. |
| nobitaTown.place_school | 学校 | School |
| nobitaTown.place_school_desc | 校舍、旗杆和红色的操场跑道，上课铃在记忆里回响。 | Schoolhouse, flagpole and the red running track. |
| nobitaTown.place_park | 公园 | Park |
| nobitaTown.place_park_desc | 滑梯与戏水池，午后在这里消磨掉一整个夏天。 | A slide and a paddling pool for long summer afternoons. |
| nobitaTown.place_lot | 空地 | The Empty Lot |
| nobitaTown.place_lot_desc | 水泥管堆和木料堆，最好的秘密基地候选人。 | Concrete pipes and lumber — prime secret-base real estate. |
| nobitaTown.place_shops | 商店街 | Shopping Street |
| nobitaTown.place_shops_desc | 拱廊下一排小店，雨天的屋檐下总能躲一躲。 | Small shops under one arcade roof, dry on rainy days. |
| nobitaTown.place_shrine | 神社小坡 | Shrine Hill |
| nobitaTown.place_shrine_desc | 石阶尽头的鸟居剪影，新年许愿的第一站。 | A torii silhouette at the top of the stone steps. |
| nobitaTown.place_river | 河边堤坝 | Riverside Levee |
| nobitaTown.place_river_desc | 草坡缓缓滑向河面，最适合发呆和放风筝。 | A grassy slope sliding toward the river — perfect for daydreams. |

## 使用位置速查

- HTML `data-i18n`：title、kicker、intro、fileWarn、move、run、jump、interact、camera、startPause、start、back、soundOn、pause、full、touch、note、hudBells、hudTime、hudScore、touchTalk、touchJump。
- JS 动态（`t()`）：replay、resume、paused、fullFail、soundOff、plaza、promptJ、help、signLit、bellGot、resultKicker、resultTitle、stat*（6 条）、newRecord、loadError、place_*（含 _desc 共 14 条）。
- 路牌 canvas 纹理：`place_nobita` / `place_school` / `place_park` / `place_lot` / `place_shops` / `place_shrine` / `place_river`（切语言时重绘）。
