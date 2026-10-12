# 超级玛丽 3D · 1-4 库巴城堡视频｜事实来源与依据（sources.md）

本集解说稿与投稿文案的每一条陈述都能落到下面某个来源；没有来源的话一律不写。

## 1. 游戏本体与版本状态

- `game-projects/mario-3d/media-kit/game.json`
  - 当前版本 `v2.6.0-preview1`，Toy ID `39043286960128`，slug `feidao-mario-3d`，状态 `published`
  - 开发模型记录（`development_model`）：v2.5.0-preview1 为 Codex（具体模型未记录）；历史 v2.0.0 为 Claude Opus 5.5，更早版本为 GPT-6 Astra
  - 1-4 所在任务分支：`claude/mario-stage4-20261010`
- 游戏代码与素材：`public/html/game/mario-3d/`（Three.js 程序化生成，无外部美术资产）
- 测试入口：`?test=1` + `window.__MARIO_TEST__`，`?level=1-4&q=high&clean=1`，localStorage 命名空间 `mario3d-v2:`

## 2. 关卡几何与统计（解说里的数字）

- `game-projects/mario-3d/media-kit/releases/v2.6.0-preview1/notes.md`
  - 160 列城堡、4 处岩浆、7 根火棒、6 块隐藏金币砖、13 格吊桥
  - QA 46/46 通过
  - 通关路线：穿过火棒走廊 → 顶出隐藏金币砖 → 跳上桥上方浮台、从库巴头顶过去碰到斧头 → 断链塌桥、库巴坠岩浆
  - DFS 可达性校验：322 个状态节点、136 段按键序列、零受伤路线
  - notes.md 原文即写明「录像由已验证的按键路线驱动，不是人手操作」——本集沿用同一表述
- 操作说明（电脑 I 冲刺 / K 跳 / J 火球需火焰花 / U 下蹲 / C 切视角 / Q、E 转镜头；手机摇杆 + 2×2 动作键、竖屏自动转横屏）取自当前构建源码与项目交互规范（game-maker `controls-and-display.md`）

## 3. 录制与画面来源

- 采集脚本：`work/capture.cjs`（Playwright + Edge headless，CDP `Page.startScreencast` JPEG → `frames.ffconcat` → ffmpeg h264_nvenc cq 18 / 60 fps，手动时钟 120 逻辑步/秒）
- 按键路线：`work/plan/stage4-heroic.json`，由 `work/probe-full.cjs` 在实时页面逐段验证
- 视角预设：side / front / fp / top（`oblique`、轨道机位因相机相对移动造成倒走而弃用）
- 素材清单与时长、体积：由 `work/build-records.py` 从 `capture/*.mp4` 实测写入 `work/run-state.json`
- 封面：`work/covers.py` 从**未经字幕烧录**的 `capture/heroic-side.mp4` 取帧（4:3 用 20.0 s 火棒走廊，16:9 用 35.5 s 跳桥＋库巴），排版用 PIL；取帧坐标与理由记录在 `work/edit/covers/source.json`，其中 `gameplay_features_generated: false` —— 没有在封面上添加游戏里不存在的东西

## 4. 配音与音乐

- 引擎：本地 IndexTTS-2.5（`D:/sd/index-tts`，uv CPython 3.11 + PYTHONPATH 调用），脚本 `work/voice_indextts.py`
- 参考音色为本地合成的中性男声，**不是微软官方云希**；未克隆任何真实人物声音
- 原计划用 Edge-TTS `zh-CN-YunxiNeural`，本机直连与代理均返回 403，因此换引擎并在全部平台文案、credits、披露项中写明
- 音乐与音效：游戏内原版城堡 BGM 与音效，随游戏原声轨一起录制，侧链压低后与解说混音；无外部曲目

## 5. 外链（2026-10-12 curl 核验，全部 200）

- Toy 试玩（完整 `/index.html`）：见 `work/packaging.py` 的 `TOY` 常量
- 游戏直链：`WEB`；游戏列表：`HUB`；投票/愿望单：`VOTE`；B 站话题「哔哩哔哩Toy创意挑战」topic_id 1346285：`TOPIC`
- 链接常量只在 `work/packaging.py` 定义一处，`qa.md` 与审片页都从该文件读取，避免文案与记录不一致

## 6. 平台规则依据

- `C:/Users/37818/.claude/skills/game-video/references/delivery.md`：`final/<variant>/` 为唯一投稿入口、publish.json schema_version 2 字段、交付清单、qa.md / run-state.json / sources.md 工程记录
- `C:/Users/37818/.claude/skills/game-video/references/toy-operations.md`：标签必须含 `bilibilitoy`；禁用 3D游戏/网页游戏/童年游戏/万物皆可游戏/动作游戏/AI辅助开发；AI 作品加 `AI` 与实际模型名；话题「哔哩哔哩Toy创意挑战」；Toy 视频必须交付置顶评论，简介与评论各放一次完整 `/index.html` Toy 链接

## 7. 明确不写进视频的内容

- 不宣称真人手操、不宣称真机验收、不使用「官方云希音色」说法
- 不引用旧片 BV1guep6NELt（2026-09-15，仅早期 1-1）作为本集依据
- 不涉及 TapTap 分发状态（项目当前默认不发布 TapTap）
- 玩家反馈相关的 TODO 不写进文案，等用户看过后再指示
