# 虫潮前哨：守卫基地 — worlds 资产合并网页版

当前网页版本 web-worlds-v0.4.0。以既有 Three.js 虫潮玩法为主工程，迁入 Breachline 的带动画甲刃虫、重甲精英、虫后、装甲士兵、重装机甲和 Poly Haven 岩石纹理，保留原 Godot 工程。

网站入口：public/html/game/starship-defense/index.html；旧 starship_defense.html 自动进入新版，保留查询参数和本站 sst_save_ 存档键。既有 Toy 已发布版本保持独立，不会因为更新网站自动更新。

操作：WASD 移动、J 射击、K 跳、U 手雷、I 互动、O 商店、L 建造、V 换枪、C 循环镜头、R 开战、Enter 开始/重试、Esc/P 暂停、M 声音、F 手动全屏。手机虚拟摇杆与字母动作键；竖屏开始后旋转游戏布局并逆变换触控。玩家死亡回基地复活并保护3秒；基地损毁仍判失败。

高画质保留近处实时阴影及较高渲染分辨率；流畅档关闭实时阴影并降低绘图尺寸，保留模型纹理和动画。主波次最多48活虫，召唤/分裂也按容量处理，最多160粒子、8具短暂尸体。静态岩石/灌木/山脊/装饰实例化；远处动画24/12Hz，近处60Hz。

本次为资产与表现迁移，并非完整移植 Godot 的50人编制、第一人称鼠标瞄准、地下洞网、全部武器/载具、关卡任务及物理系统。网页版保留自身职业、商店、建造、载具、四名雇佣兵与已有章节流程。机甲已使用迁入模型与动作，坦克、枪械等仍保留网页版程序化模型。

本地服务：Python -m http.server 8765 --bind 127.0.0.1 --directory public；访问 http://127.0.0.1:8765/html/game/starship-defense/index.html。
验收：node game-projects/starship-defense/verify-web.cjs（默认使用本机 Edge 与捆绑 Playwright，可设 BROWSER_EXE/GAME_URL）。QA钩子仅在 ?qa=1 存在；自动化安排和高血量压力场景不能当普通玩家实录。

资源加工：使用含 Pillow 的 Python 运行 import-worlds-assets.py --worlds D:/project/gpt/worlds/breachline；GLB保留网格/骨骼/动作，仅将嵌入贴图缩至1024并压缩。运行资源来源/授权/哈希在公开 assets/sources.json 与 CREDITS.txt；roach.glb改作继续 CC-BY-SA-3.0，其余角色/岩石 CC0，Three.js MIT。

独立 Toy 包：python game-projects/starship-defense/build-toy.py，产物 dist/toy/chongchao-qianshao/chongchao-qianshao.zip。只构建，不上传、不提交审核。包内全部模块/模型/纹理/许可为相对路径，沿用 Toy 已有存档命名空间。

本版媒体与性能记录：media-kit/releases/web-worlds-v0.4.0/。录像为实时浏览器自动化，有QA局面安排，无音轨；真机手机、人工试玩及声音听审未完成。
