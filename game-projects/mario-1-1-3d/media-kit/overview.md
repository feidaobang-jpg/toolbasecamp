# 超级玛丽 3D 重制版：第一关（mario-1-1-3d）

「万物皆可游戏」系列。FC《超级马里奥兄弟》1-1 的 3D 化网页 Demo：问号砖、蘑菇、
水管、两个深坑、阶梯与旗杆城堡，玩法规则照搬原作（小马力奥一触即死、蘑菇变大、
踩敌、100 金币 1-UP、旗杆高度+时间奖励）。

- 入口：`public/html/game/mario-1-1-3d/index.html`
- 引擎：Three.js 0.170.0 同源 vendor，全程序化美术与音效，零构建
- 架构：`world.js` 确定性玩法（无 THREE/DOM）→ `scene.js` 渲染 → `main.js` 输入/循环/HUD → `audio.js` 振荡器音效
- 双端：键盘（A/D 跑、W/S 纵深、K/W/空格 跳、J 加速）+ 手机横屏虚拟摇杆/动作键/相机盘
- 游戏中心：`tools.mario113d.*`，条目在动作扮演组头部，缩略图 `assets/game/thumbs/mario-1-1-3d.jpg`

## 与旧版 mario-3d 的关系

旧版 `mario-3d` 是更早的一次尝试（仍在游戏中心上架，两者并列）。本版按
web-game-maker 技能的完整流程重做：确定性玩法层 + 纯逻辑模拟测试 + 浏览器级 QA +
media-kit 交接包。

## QA 摘要

- `qa/world-sim.mjs`：10 项断言全过（推进/顶砖金币/蘑菇变大/踩敌/坑死复活/
  大状态碎砖/小状态顶砖/旗杆通关/超时/100 金币 1-UP）
- `qa/render-check.cjs`：Edge headless（SwiftShader）desktop/mobile 双视口 60fps、
  零页面报错；shots/stages/video 场景全过
- QA 实际抓到并修复 3 个 Bug：
  1. `renderer.render()` 忘调，画面全空（draw_calls=0）
  2. `createWorld` 复制 blocks 后 SOLIDS 仍引用原始对象，顶砖状态永不更新
  3. `coinsLive` 缺 `z` 字段，NaN 比较导致金币永远拾取不到
  4. flagWalk 胜利行走被普通移动的边界 clamp 抵消，永远到不了城堡门
- 录像：`releases/v0.1.0/captures/m1-motion.webm`（CDP 截流 139 帧 @15fps 合成）
