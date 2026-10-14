# 枪火集结 0.3.1 · 自动存档不再反复弹提示

与虫潮围城 0.38.6 同一处改动、同一份实现（两款的 `save-store.js`、战役主循环共用同一套写法）：玩家反馈战场上的「本地已保存 · 可选Toy云备份」胶囊每 30 秒顶出来一次。

## 改动

- `save-store.js`：`write(key,d,{rotate,notify=true})`，`notify:false` 仍写盘、仍更新 `status`，但不回调 `onStatus`；校验失败与写盘异常一律照旧提示。
- `game.js`：`autoSave(opts)` 透传 `notify`，主循环 30 秒心跳改成 `autoSave({notify:false})`；买兵建塔、过关、手动存档仍走默认提示。
- 存档键、历史轮转、云备份时机不变；抗战战役与房车模式各自写自己的档，本来就不弹这颗提示。

## 版本与发布

- 网站：`https://www.zhengxiaohui.cn/html/game/gunfire-assembly/`，线上 `update-history.js` 读回 `GAME_VERSION='0.3.1'`。
- Toy `43022175699968`：预览 `preview_hvn6TazZ` 实测通过后同包提审（提交预览 `preview_K4UnyEW1`），2026-10-14 21:15:37 提交、21:17:32 published。
- 大厅与亮剑战役页面代码未改，`liangjian/game.compat.js` 内容哈希不变；本次不新增合集卡片（枪火集结已在「飞刀班长游戏合集」内独立展示）。
- TapTap：未请求同步。B站简介：普通小改，只累计一次稳定更新。

## 验证

`game-projects/starship-defense/verify-save-notice.cjs` 对枪火集结同样跑 6 项，含真实 30 秒心跳期间提示 0 次弹出；本地包、Toy 预览（1280×720 与 844×390）、Toy 正式入口、网站线上入口全绿。未做实体手机真机验收。
