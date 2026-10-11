# 素材与许可（zerg-mode-20261010）

## 游戏与版本

- 游戏：虫潮围城（game_id chongchao-qianshao），`game-projects/starship-defense/`
- 录制时线上版本：`web-zerg-corpse-spinfix-v0.33.3`
  - 线上入口 https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1
  - 2026-10-11 复核：`index.html` 200、`zerg-mode.js` 200（首行注释即"虫族模式（实验玩法）"）、
    `game.compat.js` 内含 `btnZerg` 两处 → 虫族模式入口已在线上生效
- 玩法源码：`public/html/game/starship-defense/zerg-mode.js`（母虫 950HP/5 命、生物量收入、蜕皮 +35%、召唤成本 60/90/40）
- 虫族模式开发来源：分支 `qoder/chongchao-zerg-mode-20261010`（`media-kit/feedback-ledger.json` 第 774 行 `fixed_in`），
  由网友"我不是abbie"2026-10-10 评论 rpid 点名提出
- Toy 状态：`toy.review_status = auditing`，公开版本仍是 `web-resistance-v0.33.0` → 本期文案只给网站入口

## 录像来源

- 唯一实机素材：`work/capture/zerg-run7/`（5829 帧 JPEG + `frames.json` 真实时间戳 + `game-audio.wav`）
- 采集方式：Playwright + 本机 msedge（`--use-angle=d3d11`），`Page.startScreencast` 取帧，
  `MediaRecorder` 通过 `addInitScript` 挂在 `AudioNode.prototype.connect` 上录游戏原声
- 输入全部为真实键盘事件；`__gameQA` 钩子只读；`gameplay_modified:false`、`time_scale:1`、`normal_rule_inputs_only:true`
- 由 `work/make-clip.cjs` 按真实时间戳拼成 `clip.mp4`（30fps CFR，跨度 256.3s），剪辑只从中取区间
- 其余 7 局（run1–run6b、run8）保留在 `work/capture/` 作为"未能通关"的证据，不用于成片

## 生成资产与许可

- 解说配音：Microsoft Edge TTS，音色 `zh-CN-YunxiNeural`，语速 +0%（`work/audio/tts_gen.py`，edge_tts 7.2.8）
  - 属合成语音，已在各平台 `disclosures.synthetic_narration` 声明
- 字幕与封面字体：本机 `C:/Windows/Fonts/msyh.ttc` / `msyhbd.ttc`（微软雅黑），仅用于本机渲染输出
- 画面内所有元素（模型、HUD、音效）均为《虫潮围城》自研资产，无第三方素材、无外部音乐
- 封面文字为排版文本，非生成图像；封面底图 100% 取自 run7 实机帧
- 未使用任何付费素材、AI 生成画面或第三方配音

## 各平台适用范围

- B站：成片（烧录中文字幕）+ 4:3/16:9 双封面 + 中文文案
- 抖音：同 B站 片源 + 4:3 横版 / 3:4 竖版封面 + 中文文案（无B站站内路径）
- YouTube：无烧录字幕的同内容母版 + 中英侧挂 SRT + 中文文案与英文本地化字段；试玩入口统一 `games.html`
- 三平台均不含 TapTap 口径；不宣称 Toy 已上线本模式
