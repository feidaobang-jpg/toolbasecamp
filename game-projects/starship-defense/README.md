# 虫潮前哨：Q版画风试改

当前网站版本 web-toylook-v0.5.0，待用户确认画风，不将试改结论写入 web-game-maker 技能。

在已有 Three.js 游戏上换成原创程序化圆头装甲兵、彩色甲虫、精英/虫王、飞虫与大型装甲角色。奶白/湖蓝基地、草地与沙色路线、暖色岩石、云朵和花草统一配色。角色采用共享网格及少量部件动画；旧 Godot 模型与来源仍保留，当前网页不再下载这些 GLB 或岩石照片。修正了城门护栏/旗杆将世界坐标再次叠加到父节点造成的悬空。

入口：public/html/game/starship-defense/index.html；旧 starship_defense.html 重定向及 sst_save_ 存档保持兼容。既有 Toy 发布版本仍为 toy-v0.3.0，本次未更新 Toy。

WASD 移动、J 射击、K 跳、U 手雷、I 互动、O 商店、L 建造、V 换枪、C 切换四个镜头、R 开战、Enter 开始/重试、Esc/P 暂停、M 声音、F 手动全屏。手机支持横屏和竖屏自动旋转后的摇杆/多点触控。原关卡、商店、基地失败、玩家复活规则不变。

本地 HTTP：Python -m http.server 8765 --bind 127.0.0.1 --directory public。
验证：node game-projects/starship-defense/verify-web.cjs；node game-projects/starship-defense/verify-toylook.cjs。测试钩子仅 ?qa=1 开启。GAME_URL 可指定线上入口。第一份覆盖11项行为、两档48虫4队友压力及录像；第二份覆盖模型变体、机甲操作和30秒持续移动/射击/切镜头。录像与性能测量分开。

媒体：media-kit/releases/web-toylook-v0.5.0/。真实浏览器自动化截图/录像；压力与变体展示使用明确记录的测试摆位和高血量。normal-play.png 为普通开局操作。没有真机手机性能测试；录像无音轨。

原 Godot 工程 D:/project/gpt/worlds/breachline 保留。本次仅网页美术与相关性能/显示修正，并非全量 Godot 移植，也未增加百人队伍。
