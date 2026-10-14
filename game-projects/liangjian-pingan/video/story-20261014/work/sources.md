# 来源与素材（story-20261014 / 平安县城 v0.5.0 双结局）

## 游戏与版本

- 源码：主线 `public/html/game/gunfire-assembly/pingan/`，采集分支基点 `0eb2ba8d`（枪火集结 0.2.3 / 平安县城 v0.5.0）。
- 版本事实取自 `game-projects/liangjian-pingan/media-kit/releases/v0.5.0/notes.md`：城楼秀芹过场（约 23 秒、可跳过）、双结局（原作开炮塌楼 / 改写冲进城门救人，结局键 `lj_pingan_v1_ending`）、20 句喊话中 17 句为电视剧《亮剑》原声、飘屏弹幕已删除、旧第三章实现已移除。
- 游戏由 Claude Opus 5.5（Claude Code）开发，低模与声音为程序生成；本期未改动任何游戏代码或数值。

## 采集

- `work/capture.cjs` + Playwright + 本机 Edge headless，CDP `Page.startScreencast` 抓 1920×1080 JPEG 帧（按真实时间戳抽帧），游戏音总线用 AudioContext/MediaStreamDestination + MediaRecorder 单独录一条。
- 五个模式：`full`（原作线整局，531s）、`rescue`（改写线整局，417s）、`mg`（接管机枪补拍，34s）、`lobby`（大厅入口，7s）。
- 操作全部走游戏输入层的自动化 bot（无限命、标准耐久），没有修改伤害、没有改存档状态、没有用 DOM 直改代替游玩。
- `mg` 模式对 bot 做了字符串替换补丁，只为把镜头停在阵地机枪上，属于采集脚本，不进入游戏包。

## 解说与字幕

- 解说：本机 IndexTTS-2.5（`D:/sd/index-tts`），参考音 `yunxi-ref-8s.wav`，逐句合成后按真实时长排时间线；不是微软官方云希音色，也不是真人配音。
- 字体：系统 Microsoft YaHei，仅烧录进画面，不随视频分发字体。
- 字幕与解说同源，`work/edit/captions.srt` 与 `captions.ass` 同一次生成。

## 游戏原声

- 07-xiuqin、08-classic 两段把游戏音增益提到 0.5–0.62 并在解说结束后留 2.2–2.6s 静音尾巴，让电视剧原声喊话能被听见。
- 这 17 句原声按用户决定取自 B站公开片段，未取得授权；未额外引入音乐库或其他影视素材。

## 封面

- `work/cover.py` 从本期真实 1080p 帧（full 76.0s 城楼秀芹与山本）裁切重排：4:3 首页图为特写构图，16:9 空间图为同场戏的模糊底 + 右侧放大面板。
- 文案“开炮，还是救人？”“平安县城 · 双结局”“枪火集结 · 抗战战役”为本期排版，母版在 `work/cover-src/`，导出只做尺寸规范化与 JPEG 编码，不是外部生成图。
