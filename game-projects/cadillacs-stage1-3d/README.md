# 恐龙快打 · 第一、二关 3D 重置版（cadillacs-stage1-3d）

Capcom 1993 年街机《恐龙快打》（Cadillacs and Dinosaurs）的 3D 网页重置版（当前 v0.6.0，目录名沿用 stage1 以保持网址、存档和 Toy 绑定不变）：

- 第一关「海上都市 CITY IN THE SEA」：楼顶 → 大楼内部 → 第 47 街，Boss 维斯·T 和岩跳龙。
- 第二关「沼泽森林 THE SWAMP FOREST」：凯迪拉克开进偷猎者森林，三角龙哈克冲撞、胖子想吵醒熟睡的霸王龙希瓦特 → 跳崖落进齐腰深的泥沼 MUD SWAMP，格特从水里冒出、上岸遇链锤兵拉什·T → 黄昏的恐龙尸骸地，Boss 屠夫（双刀、满屏乱跳、屁股坐、不断叫手下）。

四位主角（杰克、汉娜、穆斯塔法、梅斯）按原作选人画面的能力值与配色还原。打完第一关会像街机一样直接接第二关；主菜单「起始关卡」也能直接选第二关。用 Three.js r170（站内 `public/vendor/three/0.170.0`）渲染。画风是这款自己的硬派写实路线（v0.5.2 按用户选择改回，第二关同款）：写实比例角色、卡通色阶着色（MeshToonMaterial）+ 黑色法线外扩描边、带噪点 / 裂缝 / 青苔的程序化写实贴图、偏暗的对比光照。v0.5.0 曾短暂改成赤色要塞式哑光 Q 版，用户对比后认为旧版「更暗更写实」更好。音乐采用原版录音（第二关：In the Poachers' Forest / Ancient Earth / Trap of Silence / Boss 2），缺项音效 WebAudio 合成。源码是 ES 模块，用 esbuild 打成一个普通脚本，双击 `index.html` 也能玩。

## 目录

| 位置 | 内容 |
| --- | --- |
| `public/html/game/cadillacs-stage1-3d/` | 公开运行文件：`index.html`、`css/style.css`、`js/game.min.js`（打包产物）、`js/THREE-LICENSE.txt` |
| `public/games.html` | 网站游戏列表（卡片在 `public/js/config.js`，封面 `public/assets/game/thumbs/cadillacs-stage1-3d.jpg`，标题在 `public/js/locales/zh-CN.js` 的 `tools.cadillacs3d`） |
| `src/` | 源码：`main.js` 入口与界面（起始关卡、头像、结算），`game.js` 玩法（招式、抓投、武器、敌人 AI、维斯 / 屠夫 Boss、三角龙与霸王龙、步枪兵、链锤、泥沼减速、波次、过场、关卡衔接），`level.js` 两关六个区域与数值，`world.js` 六个区域的场景，`models.js` 程序化模型（人形、岩跳龙 / 霸王龙同一骨架、三角龙、凯迪拉克、武器道具），`anim.js` 关键姿势动画，`camera.js` 镜头，`fx.js` 特效，`audio.js` 音效与音乐，`input.js` 键盘与触屏，`core.js` 公共工具 |
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

URL 参数：`?seed=N` 固定随机种子；`?test=1` 暴露自动化钩子 `window.__CD_TEST__`；`?clean=1` 隐藏桌面键位提示（录制用）；`?q=high|low` 强制画质；`?area=0..5` 直接从某个区域开始（测试用：0 楼顶、1 大楼内部、2 第 47 街、3 偷猎者森林、4 泥沼、5 恐龙尸骸地）。

## 操作

- 电脑：W/A/S/D 移动（W 是走向纵深）；J 攻击（连打四下，最后一下击倒；脚下有东西时捡起；拿着武器时使用）；K 跳跃，空中 J 跳踢；U 必杀（或 J+K 同按，命中扣少量体力）；I 冲刺（L / 双击方向键也行），冲刺中 J 是各角色不同的冲刺攻击；走进敌人自动抓住，再按 J 膝撞、第四下或反方向+J 投摔；贴着油桶按 J 举起、再按 J 扔出；C 切换视角（侧视 → 斜视 → 正视 → 第一人称）；Q/E 按住转视角；Esc 暂停。菜单 ↑↓ 选择、←→ 调整、Enter 确认。
- 手机：左侧浮动摇杆；右侧小霸王式 2×2 方阵——下排 J 攻击、K 跳跃，上排 U 必杀、I 冲刺（按住），与键盘位置一致；右上角 C 切换视角与暂停；按住画面拖动无极转视角（不设 Q/E 按钮）。设置里可切「自动识别 / 电脑键鼠 / 手机触屏」。竖屏开局后自动旋转为横屏布局。

## 验收脚本

先在 `public` 目录起服务（`node qa/serve.mjs 8777`），再运行（Playwright 默认取 `D:/project/godot/absurd-3d-daily/node_modules/playwright`，浏览器用系统 Edge + 真显卡；`CD_SWIFT=1` 改软件渲染）：

- `node qa/desktop.js`：桌面纯键盘验收（89 项）
- `node qa/mobile.js`：手机设备模拟 + 多点触控验收（35 项，含竖屏旋转、0×0 启动、2×2 方阵位置、触屏不显示键盘标签）
- `node qa/camera.js [前缀]`：镜头回归（11 项）：正视贴第 47 街后墙 Q/E 转一圈不进墙、主角始终可见；第一人称贴身岩跳龙 / 维斯不黑屏不满屏；侧视锁屏 Boss 战（16:9 与 2.17:1）角色逐顶点投影不出画。`CD_BASE` 指向旧构建、`NO_ASSERT=1` 可得修复前对照
- `node qa/stage2.js`：第二关验收（55 项）：起始关卡选择与保存、凯迪拉克开场、三角龙刨地冲锋、步枪兵预警开枪与跳跃躲避、霸王龙「被吵醒 / 没被吵醒」两条路线、泥沼减速与水中冒出、链锤 3 米外命中、尸骸地、屠夫双刀脱手可捡 / 屁股坐 / 叫手下 / 结算、第一关打完接第二关、重玩回到所选关卡
- `node qa/rotate-stage2.js`：第二关三个区域 Q/E 转一圈、正视、第一人称取景截图（看穿帮）
- `node qa/perf-stage2.js [宽] [高] [high|low]`：第二关三个区域各视角实时测帧
- `node qa/botrun.js <英雄0-3> <种子> [std|easy|classic] [起始关卡 1|2]`：手动时钟让 bot 打完整关（从第一关开始会一路打到第二关结算）
- `node qa/perf.js [宽] [高] [high|low]`：实时测帧
- `node qa/shots.js <英雄> <前缀>`：各区域、各视角截图
- `node qa/feel.js`：打击感回归（16 项）：命中停顿定格在拳脚到位、受击方向、轻 / 重 / 终结三档停顿与音效、挥空声在出手时响、倒地砸地声、挥空连打不吞键、波末慢动作自动恢复
- `node qa/moves-strip.js <前缀> [英雄]` + `python qa/strip-sheet.py <前缀>`：四位英雄连招 / 冲刺攻击 / 下上攻击逐帧截图拼成联系表（新旧对照用）
- `node qa/guns.js`：枪口与子弹回归（火花在枪模型前端、有子弹拖光、子弹飞到才掉血，含偷猎者、维斯）；`node qa/gun-shots.js <前缀>` 逐帧截图对照
- `node qa/depth.js`：可走纵深回归，真实按键走到最前 / 最里 / 左右两端，检查第二关前排在画面约八成高、角色不出画，第一关取景不变
- `node qa/style-shots.js <前缀>`：固定站位摆拍六个场景（选人、楼顶、大楼内部、47 街 Boss、森林、屠夫），新旧画风并排对比用；旧版只有第一关时加 `SCENES=roof,hall,street`
- `node qa/record.js full|cams|mobile|portrait|stage2 <输出.mp4>`：逐帧录像 + 离线渲染同场音轨（离线音轨只有合成回退音乐；stage2 为第二关精华段）
- `node qa/cover.js`：网站卡片封面

脚本输出写在 `qa/out/`，不入库。
