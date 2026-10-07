# 联机大厅手动建房补丁 · 四款联机游戏共同记录（2026-10-07）

- 改动位置：共享大厅 `public/js/game/coop.js`（赤色要塞 / 恐龙快打 / 虫潮前哨）＋坦克大战自建大厅 `public/html/game/tank-3d/main.js`；三款的打包产物 `js/game.min.js` / `game.compat.js` 已按源码重建，重建后与提交内容逐字节一致。
- 行为：`?coop=create` 只进大厅不静默建房并提示先填信息；已在房间时创建/加入按钮为可见锁定态（`aria-disabled`），点击说明"你已在房间 XXXXXX，请先点「退出房间」"；邀请链接 `?coop=六位房号` 公开房自动加入、密码房提示填密码、满员/已开局/不在线分别说明原因。
- 回归脚本（本目录 `coop-lobby-entry.cjs`）：本地真实双浏览器＋本地大厅服务 43/43（恐龙快打、赤色要塞、坦克大战、虫潮前哨各 11、11、10、11）；线上站点复测 22/22（赤色要塞、坦克大战走正式 `wss://www.zhengxiaohui.cn/api`）。
- 用法：
  ```
  python -m uvicorn coop_hub_qa:app --port 8792      # 临时放在系统临时目录，只挂 /game/coop，用完删
  python -m http.server 8766 --directory public
  PLAYWRIGHT_PATH=<项目内 playwright> GAMES_BASE=http://127.0.0.1:8766/ \
    GAMES_ONLY=jackal,tank,cadillacs,starship node game-projects/site-games/qa/coop-lobby-entry.cjs
  ```
- 限制：Edge 在本机会拦 `ws://127.0.0.1`，QA 用 Playwright 自带 Chromium；桌面双视口模拟不等于真机多点触控与真机性能验证。
