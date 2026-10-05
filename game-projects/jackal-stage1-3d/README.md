# 赤色要塞 · 第一关 3D 重置版（jackal-stage1-3d）

FC《赤色要塞》（Jackal）第一关的 3D 网页重置版（当前 v0.5.3：默认 3 格护甲 + 营房修理包，可在菜单「耐久」切回原作的「经典一发」）。用 Three.js r152 渲染，美术是原创的 Q 版低模程序化模型，音乐和音效是实时合成的原创内容。源码是 ES 模块，用 esbuild 打包成一个普通脚本，双击 `index.html` 也能玩。

2026-10-03 从 `D:\project\claude\test`（无 Git）搬进本仓库，上架网站游戏列表和 B 站 Toy。

## 目录

| 位置 | 内容 |
| --- | --- |
| `public/html/game/jackal-stage1-3d/` | 公开运行文件：`index.html`、`css/`、`js/game.min.js`（打包产物）、`js/THREE-LICENSE.txt` |
| `public/games.html` | 网站游戏列表（游戏内「返回游戏列表」指向这里；卡片在 `public/js/config.js`，封面 `public/assets/game/thumbs/jackal-stage1-3d.jpg`） |
| `game-projects/jackal-stage1-3d/src/` | 源码：`main.js` 入口与界面，`game.js` 玩法，`level.js` 关卡数据，`world.js` 场景，`models.js` 模型，`fx.js` 特效，`audio.js` 音频，`input.js` 输入，`camera.js` 镜头，`core.js` 公共工具 |
| `game-projects/jackal-stage1-3d/vendor/` | 固定版本依赖：Three.js r152 的 `three.module.js` 和 `BufferGeometryUtils.js`（MIT，见 `LICENSE.txt`） |
| `game-projects/jackal-stage1-3d/tools/build.mjs` | 构建脚本；`build-toy.mjs` 从网站运行文件生成 Toy 包（去掉指向本站的链接，输出到不入库的 `dist/`）；`build_artifact.py` 生成单文件托管版；`assemble_v0x.py` 组装各版本交接清单 |
| `game-projects/jackal-stage1-3d/qa/` | Playwright 验收、自动试玩 bot、测帧和录制脚本 |
| `game-projects/jackal-stage1-3d/media-kit/` | 开发 → 视频交接包（game.json、overview.md、sources.json、releases/v0.1/、v0.2/、v0.2.1/…）；截图录像只留本机，不入库 |

## 构建

```powershell
cd D:\project\toolbasecamp\game-projects\jackal-stage1-3d
npm i esbuild@0.28.2      # 只需一次
node tools/build.mjs      # 输出到 public/html/game/jackal-stage1-3d/js/game.min.js
node tools/build-toy.mjs  # Toy 包：dist/toy-<版本>/package（不上传）
```

`three` 通过 esbuild 的 alias 指向 `vendor/three.module.js`，不需要再装 three。改了源码重新构建后，递增 `index.html` 里 `js/game.min.js?v=` 的版本号。

## 运行

```powershell
cd D:\project\toolbasecamp\public
python -m http.server 8766
# 浏览器打开 http://127.0.0.1:8766/html/game/jackal-stage1-3d/index.html
```

也可以直接双击 `index.html`（打包后不是 ES Module，也不加载外部资源）。

URL 参数：`?seed=N` 固定随机种子；`?test=1` 暴露自动化钩子 `window.__JK_TEST__`；`?clean=1` 隐藏桌面键位提示（录制用）；`?q=high|low` 强制画质（测试用）。

## 操作

- 电脑：W/A/S/D（或方向键）8 向移动；J（或空格）机枪（默认跟随车头，可在菜单切「原作朝上」），按住连发；K 手雷 / 火箭，朝车头方向发射；C 切换视角（斜俯视 / 俯视 / 近景斜视 / 战术远景 / 低位正视 / 第一人称）；Esc 或 Enter 暂停；F 全屏。菜单里用 ↑↓ 选择、←→ 调整（命数、耐久等）、Enter 确认。
- 第一人称（v0.5.3）：在驾驶位转头，拖动与 Q/E 慢速连续旋转（最多 60°/秒）；横移、倒车不让视线随车头甩动，车身平滑转向。W/摇杆上沿视线前进，边移动边转头会更新移动方向；默认机枪与手雷/火箭沿视线，明确选择“原作朝上”的机枪仍保持朝北。
- 拖动画面空白处转视角：电脑鼠标、手机触屏均可；第三人称相机环绕吉普，第一人称在驾驶位转头，场景物体不旋转。所有预设右拖右看、左拖左看；C切换预设回正，暂停/失焦/切模式/调整尺寸清空输入。
- 手机：左侧浮动摇杆；右下仅两个实际动作键，J机枪在左、K手雷/火箭在右，等大76px圆键水平对齐、间隔12px。右上角C切换视角、Ⅱ暂停；竖屏开始后自动旋转为横屏。设置可立即切换自动识别/电脑键鼠/手机触屏并保留本局。

## 验收脚本

先装 `npm i playwright@1.56`，在 `public` 目录启动上面的 HTTP 服务，再到 `qa/` 下运行（脚本默认地址是 `http://127.0.0.1:8766/...`，可以用环境变量 `JK_BASE` 改）：

- `node touch-view.js`：逐帧视线连续性/角速度、六预设方向与相机移动映射、三指并行、模式切换（Edge/CDP模拟，非真机）
- `node desktop.js`：桌面纯键盘验收（80 项，含 v0.2 护甲 / 修理包 / 经典一发）
- `node mobile.js`：手机设备模拟 + 多点触控验收（33 项）
- `node botrun.js <seed>`：手动时钟下让 bot 打完整关，输出结果和事件摘要（`DODGE=0` 关闭躲子弹，`ARMOR=classic` 用经典一发）
- `node shots_v02.js`：v0.2 护甲相关截图
- `node perf.js`：实时测帧（云端只有软件渲染，结果不代表真实设备）
- `node record.js <seed> <输出目录>`：16:9 离线逐帧录制，并按事件离线渲染同场音轨
- `node record_mobile.js <输出目录>`：手机横屏、竖屏旋转的触控录像（离线逐帧）

`lib.js` 默认用 Playwright 自带 Chromium + SwiftShader（适合没有 GPU 的云端）。本机没装 Playwright 浏览器时设 `JK_CHANNEL=msedge` 用系统 Edge，`JK_GPU=1` 改用真显卡。脚本输出写在 `qa/out/`，用完删掉，不入库。
