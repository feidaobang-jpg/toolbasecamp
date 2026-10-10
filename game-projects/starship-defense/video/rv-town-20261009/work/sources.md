# 来源与可重建工程

本期游戏源提交 d7f8b733e991234d3b5ffe901bcc01e000ec6807；runtime SHA-256 9adf204cab731631dcd2c4c4f685699785c020782990e4f3a40bb27ed217e840。录制构建来自该提交，未改玩法。第二场实机正常规则成功，探索 1109米 · 用时 2分30秒 · 搜索 2/6区 · 击退 12只僵尸 · 剩余 314零件。下次可尝试搜全六区再撤离。

Playwright在后台Edge运行原游戏，使用正常键盘/鼠标；QA接口只读位置和结果供路线与证据使用，testMode=false、difficulty=normal，无传送、修改血量/零件、时间缩放或无敌。CDP原生1920×1080采集，3991帧，实际平均24.58帧/秒。输出30fps沿真实时间戳重复帧，无补帧或速度改变，不宣称60fps录像。

正文取work/capture/journey-02/raw.mp4；封面来自同版本第一场96秒实际帧，保留在edit/covers/gameplay-source.jpg。第一场人物被车辆遮挡，因此正文改用第二场；历史剪辑留在history/review-v1，不是本期投稿入口。封面只做真实帧裁切和设计排版，无生成游戏内容。

声音：原游戏WebAudio合成音效，无外部音乐。解说由本机已有Edge-TTS接口生成，zh-CN-YunxiNeural、+0%，无真人声音克隆。逐段MP3、真实WordBoundary JSON、PCM干声和混音保存在audio/shared-zh。字体调用本机Microsoft YaHei，不分发字体文件；未增加外部素材署名义务，平台许可/声明选项发布时再核。

已验证RV城镇开发工具为Codex；game.json中的Claude Opus 5.5只指旧对战模式，不能作为本期RV开发模型。公开文案使用已确认工具名，精确模型尚未核对。

render.py、covers.py、voice.py、encode_capture.py、verify.py、package.py使用相对于work的媒体路径。capture.cjs重录需放回对应仓库并提供本机Playwright；不会在复制出的交付目录误启动游戏。实际剪辑可直接在交付目录从保留的原片和音轨重建，依赖FFmpeg/ffprobe、Python/Pillow及已安装中文字体。Edge-TTS只在重做配音时联网。

当前制作完成、人工审片待定。客观音频验证不能代替人声可懂度与混音听感审查。
