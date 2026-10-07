# v2.5.3 · 切区域同曲 BGM 不再重头播（2026-10-07）

## 改动（体验修复）
- `main.js` 事件处理 `case 'area'`：`audio.music(e.theme, false)`。同主题区域往返（1-2 奖励房间水管进出）不再把 underground BGM 掐断重播；跨主题（地下↔地面）仍正常切换。用户实测报告"从水管上来 BGM 播放 2 次"，根因即 area 事件无条件 restart。
- 1-2 出口区（overworld）→ 1-3 开局同一首 overworld 两次起播为原作式行为（旗杆处按设定停曲），本次不改。
- 网站入口 `main.js?v=2.5.3`。本地 ?test=1 插桩验证：同主题 area 事件 0 次新启动，跨主题 1 次。

## 渠道状态
- 网站：已合并推送并部署核验（见 git 台账）。
- Toy 39043286960128：包 sha256 07d7506e695a7263…，2026-10-07 提交审核 status=auditing，预览 https://www.bilibili.com/toy/preview/preview_3f7aT9DC/index.html 。
- B站视频简介：普通体验修复，并入下次有意义更新。
