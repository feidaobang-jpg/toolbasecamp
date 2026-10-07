# v0.10.3 · 联机大厅改为手动建房（普通补丁）

- 分类：普通补丁（联机入口交互与说明），不含玩法改动。
- 改动内容：
  1. 大厅卡片与游戏内的「创建房间」链接（`?coop=create`）进来只打开联机大厅并把昵称输入框旁的提示写成"填好昵称、房间名称、人数和密码后点「创建房间」"，不再静默建房；此前玩家进大厅就看到一个已经建好的房间，看不懂状态、也不知道别人能不能进。
  2. 已在房间里时，「创建房间 / 加入房间」不再是点了没反应的灰色 `disabled` 按钮，而是带 `aria-disabled` 的可见锁定态，点击会给原因和下一步："你已在房间 XXXXXX，请先点「退出房间」再创建新房间 / 再加入其他房间"。
  3. 邀请链接 `?coop=六位房号`：公开房自动加入；密码房提示填密码；房间已满、已在游戏中不支持中途加入、房间不在线或已结束时分别给出可读原因，不会误建房。
  4. 重新打开大厅时，若已在房间，状态行会直接说明"你已在房间 XXXXXX，可用下方准备 / 开始合作 / 复制邀请链接 / 退出房间"。
- 涉及文件：`public/js/game/coop.js`（共享大厅，四款联机游戏共用）、`public/html/game/tank-3d/main.js`（坦克大战自建大厅同样去掉自动点创建）、本游戏 `js/game.min.js` 重新打包。缓存令牌 `?v=lobby-hint1`，HTML 令牌由部署流水线改写为提交号。
- 验证：
  - 新增回归 `game-projects/site-games/qa/coop-lobby-entry.cjs`，本地真实双浏览器 + 本地大厅服务：赤色要塞 11/11 通过（`?coop=create` 不建房并提示、手动建房、锁定态仍可点且会说明、邀请链接公开房自动加入名单 0/1、不存在房间说明原因、密码房提示填密码且填对能进）。
  - 线上站点复测：`GAMES_BASE=https://www.zhengxiaohui.cn/` 同一脚本赤色要塞 11/11 通过，连的是正式 `wss://www.zhengxiaohui.cn/api` 大厅。
- 渠道：
  - 网站：提交并推送主线 `1dd01fd5`；线上 `js/game/coop.js`、`html/game/jackal-stage1-3d/js/game.min.js` 与本地构建逐字节一致（`fbd2416f727c…`），页面引用令牌已刷新为 `?v=1dd01fd5`。
  - Toy `39863936092160`（feidao-jackal-3d）：按 v0.10.3 提交审核，预览 `https://www.bilibili.com/toy/preview/preview_6EJHjzyO/index.html` 经 1280×720 与 390×844 双视口实测（菜单可开、手动建房、锁定态说明、退出后恢复、开局正常、无脚本报错）；提交后包内 `js/game.min.js` 与线上同一文件同哈希，slug、可见性、视频绑定（BV1EyHz6wE5u）未改动。公开入口 `https://www.bilibili.com/toy/feidao-jackal-3d/index.html` 双视口复测 12/12 通过，判定审核通过并已生效；上一版 v0.10.2（联机车头与卡顿修复）随本包一并生效。
  - TapTap：本次为共享大厅前端补丁，未新增打包同步；沿用上一版待合并记录。
  - B站简介（BV1EyHz6wE5u）：属交互说明类普通补丁，累计到下一次有意义的简介更新，一句话文案已备在 `media-kit/bilibili-sync.json` 的 `pending_updates`；本会话浏览器无创作中心登录态，未向平台提交。
