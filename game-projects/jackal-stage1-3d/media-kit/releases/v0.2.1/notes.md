# v0.2.1 · 搬进 toolbasecamp，上架网站与 Toy

## 目标

用户要求把之前在 `D:\project\claude\test` 里做的赤色要塞第一关 3D（v0.2）搬进 toolbasecamp 仓库，上架网站游戏列表和 B 站 Toy。玩法、关卡、画面都不改。

## 过程

- 先把源码、vendor、qa、media-kit 原样复制到 `game-projects/jackal-stage1-3d/`，在新位置重新构建：`game.min.js` 与原文件字节一致，说明源码和产物对得上，再开始改。
- 运行文件放 `public/html/game/jackal-stage1-3d/`；「返回游戏列表」从 `../index.html` 改成 `../../../games.html`，加站点图标和 `?v=` 版本号。原来的 `cover.jpg` 不再放进运行目录，改为裁成 512×512 的网站卡片封面。
- 网站卡片放在动作组「超级玛丽 3D」后面，标题「赤色要塞 3D：第一关」。Toy 审核通过前卡片只有网站入口，不挂 Toy 链接。
- 新增 `tools/build-toy.mjs`：从网站运行文件生成 Toy 包，去掉三处「返回游戏列表」和加载失败提示里的站内链接、去掉站点图标，其余文件原样复制。

## 搬家时发现的真实问题

在本机用 Edge 跑原来的桌面验收，78/80。其中一项是真问题：本机 Edge 的 `navigator.maxTouchPoints` 报 10，但根本没有触屏（`pointer` / `any-pointer` 都不是 coarse）。游戏原来把 `maxTouchPoints>0` 当成触屏设备，结果在电脑上开局显示摇杆和 J/K/C 触屏按键，键位提示被藏掉（截图 M01）。原来的验收都在云端 Linux 无头 Chromium 上跑，那里 `maxTouchPoints` 是 0，所以一直没暴露。

第一次修复只改成认 `pointer: coarse` 或 `any-pointer: coarse`，无头 Edge 下验收通过。但把 Toy 预览放进 Claude 桌面应用的内置浏览器（用的是本机真实输入设备）一看，菜单仍是触屏说明：这台电脑在真实浏览器里 `any-pointer: coarse` 也为真（有触控类输入），只是主指针是鼠标。无头浏览器看不到真实输入设备，所以第一次修复漏了。

最终修复：不再按硬件猜。开局只看主指针（`pointer: coarse` 才算触屏），之后跟随玩家实际用的输入——真的摸屏幕（`pointerType === 'touch'`）就切到触屏按键，按键盘就切回键位提示。菜单「触屏按键」选「显示 / 隐藏」时仍以玩家选择为准。M02 是无头 Edge 复拍，M04 是本机内置浏览器实测（开局显示键位提示，没有摇杆）。

另一项失败是验收脚本自己的问题：断言里写死了旧的 `../index.html`，已改成新地址。

手机验收在 Edge 上偶发失败 1～4 项「摇杆右→东、上→北」：拖完摇杆马上读坐标，Edge 的 pointermove 要等下一帧才派发，读到的还是上一次的方向。用原 v0.2 构建跑也一样失败，不是游戏问题；在脚本的 `touchApi.move` 后等两帧，之后真显卡和 SwiftShader 都是 33/33。

## 结果

- desktop.js 80/80，mobile.js 33/33，botrun.js 种子 7 通关（0 阵亡、19/19 俘虏、4/4 坦克）
- 网站：https://www.zhengxiaohui.cn/html/game/jackal-stage1-3d/index.html
- Toy：slug `feidao-jackal-3d`，状态见 `game.json` 的 `toy` 字段

## 待办

- Toy 审核通过后：在 `public/js/config.js` 卡片上补 `toyUrl`，并把 `game.json` 的 `toy.review_status` 改为实际状态。
- 真机（手机、带触屏的笔记本）还没测过触屏判断。
