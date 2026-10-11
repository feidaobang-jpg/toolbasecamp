# 来源与续接

录制入口：https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1；只读QA观察，不修改游戏状态或难度，正常键鼠操作、默认自动瞄准/自动开火。
运行构建：deployed-08028efe；入口和脚本SHA-256见capture/match-01/build.json、qa/public-sources.json。开始工作区HEAD 29f7f12d08df43feb99d99651613ba2423d73030；网站产物比该快照更新，不将两者混称同一构建。
原片：capture/match-01/01-opening/raw.mp4、02-battle/raw.mp4；补拍capture/vehicle-02/01-opening/raw.mp4。session.json保存真实动作与观察，capture.json保留JPEG截图真实时间戳，capture-receipts.json保存精简事件和结果。
录屏停启之间主战局时间继续前进，存在约150—192秒游戏时间缺口；本期按片段剪辑，未宣称无剪辑全局录像。所有运动镜头原速，结算页使用真实截图定格。
game.json开发记录为Codex（抗战战役、战地据点模式），精确模型版本未知；公开不写Claude或具体GPT型号。
游戏资源来自实际部署的程序化3D场景；未添加外部摄影、角色图或生成动画。封面为此次坦克截图与排版，见edit/covers/cover-source.json。
音轨：本次Web Audio游戏音效和Edge TTS Yunxi普通语速，保存分段MP3、WordBoundary JSON、PCM干声与混音。没有外部BGM，未调用本地模型服务器。
字体：本机Microsoft YaHei，未分发字体文件。未将未经确认的权利或平台投稿声明记为已核验。
渲染：voice.py → index_shots.py → render.py → covers.py → verify_video.py / extract_review.py → package.py。脚本路径相对work，不需要剪辑软件原生工程。
Python依赖edge_tts、Pillow；FFmpeg/ffprobe PATH，h264_nvenc；采集Playwright依赖位置见capture.cjs。
交付只包含本次制作；没有修改游戏、提交Toy游戏包、更新旧稿或创建任何定时任务。
