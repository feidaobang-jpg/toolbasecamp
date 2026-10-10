# 制作来源

- 成片版本：2026-10-04 02:06 本地录制快照（深色界面与圆润虫族更新；非全功能介绍）。运行入口 `build-current/index.html` 和 `game.compat.js`，全部依赖哈希见 `build-current-manifest.json`。录制后源游戏继续更新，本片不冒称覆盖此后的每项功能。
- 实机：`capture/01-*` 至 `capture/12-*`。浏览器1920×1080实际渲染，CDP JPEG95逐帧按真实时间戳采集，原游戏音频经MediaRecorder记录；原片统一30fps。`qa=1`仅为读取状态与隔离云存档；每段最终状态的 `test` 都为 false，未改血量、金币、敌人或位置。行走、购买、任务、冲刺、上车均为普通玩家输入。
- 剪辑为同一局路线节选，加操作补拍；建造和雇佣顺序为便于讲解有所调整，未宣称无剪辑连续通关。开头有意前置母皇战精彩片段；战斗细节0.5倍慢放有画面标注。
- 录制日志内07的“上车/驾驶”和06的“队友对战母皇”是当时操作意图，实际未成功。剪辑以画面为准：07仅用作步行守城；实际载具镜头为08和12；母皇段不宣称队友到场。
- 原始字幕识别尝试：必剪两次没有产出，保留实际音频后用Groq Whisper large-v3转写。依据真实word时间戳修正专名和同音误识别，未按总时长均分。API说明：https://console.groq.com/docs/speech-to-text 。
- 语音、封面、字体、音效来源见 `publish/bilibili-zh/credits.txt`；图像原件与构图记录在 `edit/bilibili-zh/covers/`。无额外曲库音乐。
- `edit/shared-zh/render.py` 是可继续编辑的正式工程，依赖均相对于work目录；Windows本机字体与ffmpeg/Pillow为运行依赖。Bcut原始bjson只作语音生成来源记录，包含原机器路径；正式渲染无需Bcut草稿或临时缓存。
- Toy、网站与投票入口HTTP核验见 `qa/public-links.json`。话题来自用户技能约束，实际资格与投稿设置尚未核验；本任务未上传、发评论、绑Toy或改旧视频。
