# 本期来源与复现

- 主题：网友愿望11「双人对战塔防」兑现。原需求、source=user、11票来自2026-10-08公开API，快照qa/board-before.json；页面当前已分待实现8与已兑现1。
- 游戏：虫潮围城web-versus-teams-v0.27.0；录制代码来自本任务工作区主线基线ff52a166（游戏文件未修改），网站愿望状态提交e53324f5已上线。游戏模式由Claude开发；本聊天Codex接管发布验证和视频制作。
- 所有本期玩法镜头重新在当前浏览器构建录制，1920×1080原生画布，CDP高质量JPEG帧及原始时间戳；保留帧、原始音频与raw.mp4。最终30fps含实际低于30fps来源的重复帧，不称实时60fps。
- qa=1只供读取状态和禁云档，未设置无敌、刷钱、改血量、瞬移或跳时钟。使用普通点击和按键，比赛testMode=false/time_scale=1。自动按键录制不等于八位真人实战验收。
- 一对一：1个玩家席位对简单电脑，13:27自然击破红方核心获胜；四对四：1个玩家席位加7个简单电脑，15:00按76%对91%判负。不同场次在解说与画面标签中注明；单位出兵、队伍转账是独立新局普通规则操作演示。
- 4v4首场角色在岩石边部分时间卡住，坏镜头没有剪成有效移动或新玩法演示；保留完整日志和实际失败结算。第二次1v1修正录制路线，只改外部录制脚本，未改游戏规则。
- 声音：游戏原始程序音效由Web Audio捕获，不含桌面或其他应用声音；本期未使用外部曲库音乐。Edge-TTS云希zh-CN-YunxiNeural，+0%，全段真实WordBoundary保留。未克隆真人声音。Edge为在线合成服务。
- 字幕：中文按实际WordBoundary；英文逐语义组对齐，附件与中文同音轨时间基准，未使用自动翻译作为交付。B站/抖音烧录；YouTube解说字幕为SRT附件，画面场次标签保留。
- 字体：本机已安装的Microsoft YaHei用于渲染，不分发字体文件。封面使用本次真实战斗帧及原生排版，保留covers.py与gameplay-source.jpg，不用生成画面代替实机。
- 当前模型不支持音频输入（工具明确返回不支持），完成响度、峰值、解码、时间戳与画面检查，不宣称已主观试听；最终用户审片需确认人声与混音。
- YouTube官方缩略图与字幕帮助于2026-10-08核对： https://support.google.com/youtube/answer/72431?hl=zh-Hans 与 https://support.google.com/youtube/answer/2734796?hl=zh-Hans 。B站/抖音布局沿用当天已成功发布旧片的对应入口，实际本期上传前重读账号及分类。
- 渲染入口：本机已有D:/project/toolbasecamp/comfyui-api-server/.venv/Scripts/python.exe运行work/render.py；ffmpeg/ffprobe已安装。成片与工程均能从本期目录解析素材。重新录制可在仓库同分支运行capture.cjs；渲染无需联网。
- 历史初稿保存在work/history/review-v1，不是本期投稿入口。当前唯一投稿入口为final各平台目录。
