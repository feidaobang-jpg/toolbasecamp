# 恐龙快打 · 第一关 3D 重置版（cadillacs-stage1-3d）

Capcom 1993 年街机《恐龙快打》（Cadillacs and Dinosaurs）第一关「海上都市 CITY IN THE SEA」的 3D 网页重置版（当前 v0.1.0）。四位主角（杰克、汉娜、穆斯塔法、梅斯）按原作选人画面的能力值与配色还原，从大楼楼顶打进大楼内部、跳窗杀到第 47 街，最后打倒 Boss 维斯·T 和他的岩跳龙。用 Three.js r170（站内 `public/vendor/three/0.170.0`）渲染，角色、场景是程序化低模（卡通着色 + 描边），音乐音效是 WebAudio 实时合成。源码是 ES 模块，用 esbuild 打成一个普通脚本，双击 `index.html` 也能玩。

## 目录

| 位置 | 内容 |
| --- | --- |
| `public/html/game/cadillacs-stage1-3d/` | 公开运行文件：`index.html`、`css/style.css`、`js/game.min.js`（打包产物）、`js/THREE-LICENSE.txt` |
| `public/games.html` | 网站游戏列表（卡片在 `public/js/config.js`，封面 `public/assets/game/thumbs/cadillacs-stage1-3d.jpg`，标题在 `public/js/locales/zh-CN.js` 的 `tools.cadillacs3d`） |
| `src/` | 源码：`main.js` 入口与界面，`game.js` 玩法（招式、抓投、武器、敌人 AI、Boss、波次、过场），`level.js` 关卡与数值，`world.js` 三个区域的场景，`models.js` 程序化模型，`anim.js` 关键姿势动画，`camera.js` 镜头，`fx.js` 特效，`audio.js` 音效与音乐，`input.js` 键盘与触屏，`core.js` 公共工具 |
| `tools/build.mjs` | 构建脚本 |
| `qa/` | Playwright 验收、自动试玩 bot、测帧、截图、录像脚本 |
| `media-kit/` | 开发 → 视频交接包（game.json、overview.md、sources.json、releases/v0.1.0/）；截图录像只留本机，不入库 |

## 构建与运行

```powershell
cd D:\project\toolbasecamp\game-projects\cadillacs-stage1-3d
npm i                     # 只需一次（esbuild 0.28.2）
node tools/build.mjs      # 输出 public/html/game/cadillacs-stage1-3d/js/game.min.js
node qa/serve.mjs 8777    # 本地静态服务（no-store），打开 http://127.0.0.1:8777/html/game/cadillacs-stage1-3d/index.html
```

改了源码重新构建后，递增 `index.html` 里 `js/game.min.js?v=` 的版本号。

URL 参数：`?seed=N` 固定随机种子；`?test=1` 暴露自动化钩子 `window.__CD_TEST__`；`?clean=1` 隐藏桌面键位提示（录制用）；`?q=high|low` 强制画质；`?area=0|1|2` 直接从某个区域开始（测试用）。

## 操作

- 电脑：W/A/S/D 移动（W 是走向纵深）；J 攻击（连打四下，最后一下击倒；脚下有东西时捡起；拿着武器时使用）；K 跳跃，空中 J 跳踢；L 冲刺（或双击方向键），冲刺中 J 是各角色不同的冲刺攻击；J+K 同按或 U 放必杀（命中扣少量体力）；走进敌人自动抓住，再按 J 膝撞、第四下或反方向+J 投摔；贴着油桶按 J 举起、再按 J 扔出；C 切换视角（侧视 → 斜视 → 正视 → 第一人称）；Q/E 按住转视角；Esc 暂停。菜单 ↑↓ 选择、←→ 调整、Enter 确认。
- 手机：左侧浮动摇杆；右侧 J 攻击、K 跳跃、L 冲刺（按住）、U 必杀、C 切换视角、Q/E 转视角；右上角暂停。竖屏开局后自动旋转为横屏布局。

## 验收脚本

先在 `public` 目录起服务（`node qa/serve.mjs 8777`），再运行（Playwright 默认取 `D:/project/godot/absurd-3d-daily/node_modules/playwright`，浏览器用系统 Edge + 真显卡；`CD_SWIFT=1` 改软件渲染）：

- `node qa/desktop.js`：桌面纯键盘验收（88 项）
- `node qa/mobile.js`：手机设备模拟 + 多点触控验收（32 项，含竖屏旋转、0×0 启动）
- `node qa/botrun.js <英雄0-3> <种子> [std|easy|classic]`：手动时钟让 bot 打完整关
- `node qa/perf.js [宽] [高] [high|low]`：实时测帧
- `node qa/shots.js <英雄> <前缀>`：各区域、各视角截图
- `node qa/record.js full|cams|mobile|portrait <输出.mp4>`：逐帧录像 + 离线渲染同场音轨
- `node qa/cover.js`：网站卡片封面

脚本输出写在 `qa/out/`，不入库。
