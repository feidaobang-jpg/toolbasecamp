# 虫潮围城 0.38.6 · 自动存档不再反复弹提示

## 玩家反馈

用户 2026-10-14 截图问：屏幕上方那颗「本地已保存 · 可选Toy云备份」为什么一直弹出？是定时自动保存吗？要不要改成手动保存或者不弹提示？

## 原因

不是故障，是每 30 秒的心跳自动存档在提示：

- `game.js` 主循环 `if(!Game.testMode&&(saveTimer-=dt)<=0){saveTimer=30;autoSave();}` 每 30 秒存一次盘；买兵、建塔、拆建筑、过关、切后台、关页面也各存一次。
- `LocalSaveStore.write()` 成功后调 `this.message('本地已保存 · 时间')`，`onStatus` 回调 `platformSave.localStatus()` → `save-panel.js` 的 `updateNotice()`，把 `#saveHealth` 的 `faded` 类去掉重新显示，5 秒后再淡出。
- 结果：心跳每 30 秒把提示顶出来一次，约 1/6 的时间挂在战场上，玩家感觉「一直在弹」。

## 取舍

不改成手动保存。浏览器 3D 游戏随时可能被 Toy 外壳或手机浏览器杀掉页面，v0.24.0 的云备份链路本来就是为丢档反馈做的；把保存时机交给玩家会重新引入丢档风险。要改的是提示的呈现，不是保存的时机。用户选定「保留自动存，只砍心跳提示」。

## 改动

- `save-store.js`：`write(key,d,{rotate,notify=true})`。`notify:false` 时仍写盘、仍更新 `this.status`（存档面板要读），但不回调 `onStatus`。校验失败与写盘异常一律照旧提示，`notify` 只压制成功文案。
- `game.js`：`autoSave(opts)`，`opts.notify===false` 透传给 `write`；主循环心跳改为 `autoSave({notify:false})`。买兵/建塔/过关/手动存档等玩家可感知节点仍走默认提示。
- 存档键、历史轮转、`platformSave?.checkpoint(d)` 的云备份时机全部不变。

## 版本与发布

- 网站：`https://www.zhengxiaohui.cn/html/game/starship-defense/`，线上 `update-history.js` 已读回 `GAME_VERSION='0.38.6'`，`game.js`/`game.compat.js` 含 `notify` 分支。
- Toy `38678478981120`：预览 `preview_KrXCWUhp` 实测通过后同包提审（提交预览 `preview_KyAixmdT`），2026-10-14 21:15:29 提交、21:17:08 published，包哈希见 `qa.json`。
- TapTap：本次未请求同步（默认不发布）。
- B站简介：普通小改，不使现有说明失实，只累计一次稳定更新，未达 3 次＋7 天门槛。

## 验证

`game-projects/starship-defense/verify-save-notice.cjs`（本次新增，虫潮与枪火各 6 项）：进场提示会淡出、`notify:false` 静默写盘且提示不弹、事件型存档仍提示且可点、约 5 秒后再淡出、保存失败仍立即提示，以及**真实等主循环 30 秒心跳触发**、用 MutationObserver 记录提示胶囊 class 变化确认期间 0 次弹出。本地包、Toy 预览（1280×720 与 844×390）、Toy 正式入口、网站线上入口各跑一遍全绿。

`verify-cloud-save.mjs` 第 27 项补 store 层 `notify` 语义（静默写入不提示、异常写入必须提示）；`verify-readybtn-touch.cjs` 复跑保留「淡出后不接收点击」的原回归。

未做实体手机真机验收；云备份自动上传默认按需开启，本次只验证本地提示与写盘路径。
