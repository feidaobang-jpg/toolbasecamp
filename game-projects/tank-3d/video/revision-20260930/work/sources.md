# 制作来源
- 当前游戏build modes1，源码未修改；正常第一关规则。GPU逐帧浏览器采集，1920×1080@30fps，固定种子275机器人键盘操作，不是真人操作实录。
- 实机capture/capture-offline-audio.mp4；相机切换camera/capture-offline-audio.mp4。音效事件经游戏GameAudio/OfflineAudioContext同步重建。
- 老鹰前后图片来自本游戏media-kit历史开发记录，画内标明历史阶段。手机支持来自当前源码与既有QA；没有宣称本次真机体验测试。
- 配音由必剪3.11.25「清冷解说员」生成，未克隆真人。初始正常语速，成片以atempo=0.96轻微放慢并保留音高。音源audio/narration.wav，保存原始必剪源video在audio/bcut-voice-source.mp4。
- 必剪ASR对实际音频识别，生成原生工程edit/bcut-project.bjson；字幕按工程inPoint/outPoint真实时间并除以0.96，不沿用旧Edge时间轴。识别错字依据实际请求稿校正，例：钢墙、3D、老鹰。
- 字体Microsoft YaHei来自Windows本机授权，栅格化导出不分发字体；真实游戏模型与原创程序音效来源见media-kit/sources.json。封面由真实截图加排版，无AI生成图。
- 投稿仅准备文件，没有上传。账号具体投稿页未核对，不宣称已通过平台内预览。AI声明按实际来源设置。
- 制作过程使用game-video与computer-use技能，在本机必剪创建并导出配音工程。没有使用任何账户发布操作。
- 旧版保留在../debut-20260930；另一制作目录debut-20260930-claude未触碰。
