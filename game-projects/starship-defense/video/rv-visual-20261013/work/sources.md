# 制作来源与边界

- 旧版：web-guest-v0.36.9，源提交 b7627cf75568dd469fde1b576683ed1746976283。保全的game.compat.js SHA256：89349e39acbf3fba8048fdf74a2ed0344351d5139f283cbdcd2ba2af94cf1230；HTML由同提交读取。不是历史录屏，而是该构建重演，开头标明旧版重演。
- 新版：web-rv-art-v0.37.4，源码提交8548623d9eafed15069bb138dc20e649eb334f1e，runtime SHA256：dde19925aa58aaeafa99ae26b86b4cfd9d0a43a7e7661683e2a7f65534ffba0c。当前工作区基线ec91d36c，未改游戏运行代码。
- 参考交接：game-projects/starship-defense/media-kit/releases/web-rv-art-v0.37.4/handoff.json，以及media-kit/sources.json。车辆、建筑、光照为游戏现有程序模型；不宣称下载资产或真实材质扫描。
- 新旧美术展示在相同站位使用真实渲染；orbit只控制展示相机，世界暂停，不能充当正常战斗。new-journey来自正常规则开局，通过键盘及菜单操作驾驶、击败僵尸、下车搜索与返回，不改资源、生命、伤害或刷怪。丢弃起始确认菜单约12.7秒，剪掉回车路上路牌遮挡部分。
- 游戏画布1920×1080，MediaRecorder VP9/Opus实时采集。导出H.264/AAC、30fps。仅剪辑、局部裁切、标题字幕与片尾淡出，无AI生成实机片段。原始文件及哈希见capture-manifest.json。
- 封面：基于D:/project/task-artifacts/rv-visual-upgrade-20261013/before-front.png和final-front.png，用ImageGen重新构图。16:9、4:3图片是宣传封面，不冒充未经编辑的截图；车辆轮廓和细节已与实机对比。原生成图片保留在本任务generated_images目录。
- 人声：本地IndexTTS-2.5，使用此前已采用的合成人声参考D:/project/task-artifacts/mario-stage4-video-20261012/work/ref/yunxi-ref-8s.wav，不是微软官方云希或真人授权声明。逐句生成、依据实际PCM样本数定位字幕。主观听审未执行，交用户最终审片。
- 声音：录制游戏自身AudioSys合成声音；未添加外部歌曲。字体Microsoft YaHei来自本机Windows，渲染到视频，无字体文件分发。
- 仅制作B站中文版本；未制作其他平台物料。当前Toy正式入口v0.37.4由浏览器实际读取并截图；活动、免费券、投稿声明及BV绑定在审片通过后的发布阶段办理。
- 可复现剪辑：python work/render.py；输入均在work/capture与work/audio。重录需在相同Git源码工作区运行work/serve.py并通过录制页面启动，播放器/录制服务不是后台任务。
