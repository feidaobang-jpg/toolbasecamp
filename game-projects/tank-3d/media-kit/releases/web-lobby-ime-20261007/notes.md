# web-lobby-ime-20261007 — 联机大厅输入法方向修复（Tank 3D 待合并项）

- 共享修复详见 starship-defense `releases/web-lobby-ime-v0.23.1/notes.md`：大厅文本框聚焦时尝试全屏锁横屏，解决手机假横屏下面板横、输入法竖的错位。
- 本游戏改动已上线：`main.js` 安装共享 `landscape-typing.js`（`?v=lt1`），自有 `coop.js` 包装与共享 `coop.js` 引用 bump `?v=ime-live1`；网站部署已核验（2026-10-07）。
- **Toy 待合并**：Tank 3D（39043249461248）当前 `auditing`，在审包为并行任务提交的 coop-live2；本次 ime-live1 改动未单独送审，避免与在审任务竞争。下次本游戏 Toy 提交需按合并后源码重建（build-toy.mjs / build-taptap.mjs 已携带 landscape-typing.js 复制与路径改写），即可把本修复带上。
- 分类：普通修复；网站已生效，Toy 待下次任务顺带同步。
