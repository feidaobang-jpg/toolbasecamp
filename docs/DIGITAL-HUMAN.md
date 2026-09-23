# 数字人 / 对口型（本地唇形同步）

网站后台「家里电脑」分组里的**数字人 / 对口型**工具：上传人物图 + 输入台词，
家里电脑本机合成语音并驱动口型，输出说话视频。**素材不出内网，零 API 费用。**

## 整条链路

```
人物图 ─┬─▶ 第 1 阶段：TTS（本地 IndexTTS-2.5 / Edge-TTS）─▶ speech.wav
        └─▶ 第 2 阶段：静帧视频（ffmpeg 或 Wan2.2 I2V）────▶ base.mp4
                                                            │
                        第 3 阶段：唇形同步引擎 ◀───────────┘ base.mp4 + speech.wav
                        （MuseTalk / LatentSync / Wav2Lip）
                                    │
                                    ▼
                    output/lipsync/{date}_dh_*/talking.mp4
```

第 3 阶段是「数字人」真正的核心：口型引擎同时吃**视频**和**音频**，
逐帧重绘嘴部。所以静态图必须先变成视频——这就是第 2 阶段存在的原因。
（第 2 阶段选 `still` 时用 ffmpeg 锁帧生成，秒级完成、不占显存；选 `wan` 时走已有的 Wan2.2 I2V 工作流，画面会带自然动作，但慢且吃显存。）

## 家里电脑要装什么

三个引擎都是**独立项目**，装在各自目录（沿用 `index-tts` / `image-to-3d` 的约定：
各自 `.venv` + `.tbc_ready` 就绪标记）。装一个就能用。

| 引擎 | 目录 | 特点 | 建议 |
|------|------|------|------|
| `musetalk` | `D:\sd\musetalk` | 速度最快，≥8GB 显存可跑，几十秒视频约 1–3 分钟 | **首选** |
| `latentsync` | `D:\sd\latentsync` | 扩散式，细节最好，耗时明显更长 | 追求画质 |
| `wav2lip` | `D:\sd\wav2lip` | 极快，但嘴部仅 96px，糊 | 先看效果 |

### 安装

在 `comfyui-api-server` 目录下执行：

```bat
python scripts\setup_lipsync.py --engine musetalk
```

脚本会：建 venv → 克隆官方仓库 → 装依赖（torch 走 CUDA 轮子）→ 核对权重清单。
**权重文件不会自动下**（体积大、国内网络常卡）。按各仓库 README 下载后核对：

| 引擎 | 权重放置 |
|------|----------|
| musetalk | `models/musetalkV15/unet.pth`、`models/musetalkV15/musetalk.json`、`models/whisper/pytorch_model.bin`、`models/whisper/{config,preprocessor_config}.json`、`models/sd-vae/diffusion_pytorch_model.bin`、`models/sd-vae/config.json`、`models/dwpose/dw-ll_ucoco_384.pth`、`models/face-parse-bisent/{79999_iter.pth,resnet18-5c106cde.pth}` |
| latentsync | `checkpoints/latentsync_unet.pt`、`checkpoints/whisper/tiny.pt`、`checkpoints/vae/diffusion_pytorch_model.safetensors` |
| wav2lip | `checkpoints/wav2lip_gan.pth` |

> MuseTalk 的 `models/syncnet/latentsync_syncnet.pt` 只在**训练/评测**时用，推理不需要，别白下 1.6GB。

权重放好后写就绪标记（脚本会先核对清单，缺文件会列出来）：

```bat
python scripts\setup_lipsync.py --engine musetalk --mark-ready
```

#### 权重完整性校验（强烈建议）

**不要只看文件大小。** 分块并发下载器为了多线程写入，会先把目标文件**预分配成完整大小**
（稀疏文件），于是 `文件大小 == 期望大小` 在**只写了几 KB** 时也成立。只看大小会把残缺文件
放行，症状是引擎跑到一半报权重加载失败，很难查。

用 HF 官方元数据来比对：

```bat
python scripts\setup_lipsync.py --engine musetalk --verify          :: 比 size，秒级
python scripts\setup_lipsync.py --engine musetalk --verify --deep   :: 再比 sha256，最可信
```

`--mark-ready` 现在也会先做一次 size 校验，不合格就不写标记。

实测踩到过：`dwpose/dw-ll_ucoco_384.pth` 本地 23.8 MB（应为 406.9 MB）、
`face-parse-bisent/*.pth` 两个也都不完整——这些都是"旧下载器静默跳过"留下的残缺文件。

### MuseTalk 实装要点（2026-09 在 4060 Ti 16GB 上跑通）

官方 README 写的 torch 2.0.1 不是随便定的——**只有 torch ≤2.1 才有 mmcv 的预编译轮子**，
否则 mmcv 会走源码编译、需要 MSVC + CUDA Toolkit，基本装不成。稳妥组合：

```bat
:: 1) Python 3.10（不是 3.11/3.12，官方就是按 3.10 发的轮子）
:: 2) torch 2.0.1+cu118
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 ^
    --index-url https://download.pytorch.org/whl/cu118
:: 3) mmcv 直接装预编译轮子（cu118 / torch2.0.0 / cp310 / win_amd64）
pip install https://download.openmmlab.com/mmcv/dist/cu118/torch2.0.0/mmcv-2.0.1-cp310-cp310-win_amd64.whl
:: 4) mmengine / mmdet / mmpose
pip install mmengine mmdet==3.1.0 mmpose==1.1.0
```

三个容易踩的坑：

1. **`chumpy` 装不上** — 它是 mmpose 的依赖，setup.py 里 `import pip`，构建隔离环境下会失败。
   先 `pip install pip setuptools wheel`，再 `pip install --no-build-isolation chumpy`。
2. **`No module named 'pkg_resources'`** — mmengine 的 `get_installed_path()` 还在用 `pkg_resources`，
   而 setuptools 82+ 已移除它。必须钉 `setuptools<81`。
3. **`numpy` 被拉成 2.x** — torch 2.0.1 不兼容 numpy 2，装完要确认是 `numpy==1.23.5`（官方 requirements 的钉版）。

**ffmpeg 是硬依赖**：MuseTalk 用 `ffmpeg` 命令拆帧/合帧，且要求 ffmpeg 在 `PATH` 里，
或者把**目录**传给 `--ffmpeg_path`（目录里必须有个叫 `ffmpeg.exe` 的文件）。
worker 的探测顺序：`FFMPEG_PATH` → `PATH` → 引擎目录下 `ffmpeg-4.4-amd64-static/` → `D:\sd\ffmpeg\bin`
→ 用 venv 自带的 imageio-ffmpeg 二进制改名落地。本机已放在 `D:\sd\ffmpeg\bin\`。

### 下载权重：国内网络怎么快点

单线程从 HF 拉只有 200–350 KB/s，3.4GB 的 unet 要几小时。两条实测有效的路：

- **Xet 协议**：`pip install hf_xet` 后走 HF 官方缓存（`hf_hub_download`），不要再设
  `HF_HUB_ENABLE_HF_TRANSFER=1`——hf_transfer 会遮蔽 Xet。
- **分块并发**：把文件切成 N 段并发拉，实测 8 路能把 335 KB/s 提到 2.2 MB/s 以上。
  注意**不要用临时分片文件**——本机有「安全删除」保护，程序清理临时文件时会被拦下并中断整个进程；
  分块直接 seek 写入同一个目标文件即可。

> 目录可用环境变量覆盖：`MUSETALK_ROOT` / `LATENTSYNC_ROOT` / `WAV2LIP_ROOT`。

## 网站上的入口

- 页面：`public/html/admin/private/home-pc/digital-human.html`
- 脚本：`public/js/admin/home-pc/digital-human.js`
- 入口注册：`public/js/config.js` → `privateToolsConfig.groups[homePc]`
  （侧边栏 `home-pc-nav.js` 会自动读取该分组，无需另改）

管理员登录后从「后台 → 家里电脑」进入。未就绪的引擎在下拉框里会标注「（未就绪）」。

> 该页面是手写的（和 `tts.html` / `i2v.html` 一样），**不在** `deploy/gen-home-pc-pages.py` 的
> 生成清单里，改页面直接改 HTML 即可。

## API 一览

`comfyui-api-server` 下的 `lipsync_pipeline.py`，路由前缀 `/lipsync`（同时提供 `/api/lipsync`）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/lipsync/defaults` | 引擎清单、就绪状态、运动模式、TTS 是否可用 |
| GET | `/lipsync/status` | 引擎就绪状态简版 |
| POST | `/lipsync/start` | 提交任务（multipart），返回 `task_id` |
| GET | `/lipsync/task/{task_id}` | 轮询进度 + 日志 |
| POST | `/lipsync/cancel/{task_id}` | 取消 |
| GET | `/lipsync/history` | 历史记录（扫 `output/lipsync/`） |
| POST | `/lipsync/delete` | 删除某个任务目录 |
| POST | `/lipsync/open-dir` | 在资源管理器打开任务目录 |

`/lipsync/start` 表单字段：

| 字段 | 说明 |
|------|------|
| `image` | 人物图（必填，除非传了 `video`） |
| `audio` | 音频；给了就不再走 TTS |
| `video` | 直接给视频（跳过第 2 阶段） |
| `text` | 台词；与 `audio` 二选一 |
| `engine` | `musetalk` / `latentsync` / `wav2lip` |
| `motion` | `still`（默认）/ `wan` / `none` |
| `motion_prompt` | `motion=wan` 时的提示词 |
| `still_zoom` | 静帧推近倍数，默认 `1.0`（完全静止） |
| `voice` / `speed` | TTS 参数 |
| `seed` / `steps` / `guidance` / `musetalk_version` / `bbox_shift` / `resize_factor` | 引擎参数 |

## 怎么再加一个引擎

1. 在 `lipsync_pipeline.py` 的 `_ENGINES` 里加一项（`label` / `root_env` / `default_root`）。
2. 在 `scripts/lipsync_worker.py` 里加一个 `_build_<engine>_cmd` 并接进 `main()` 的分支。
3. 在 `scripts/setup_lipsync.py` 的 `ROOTS` / `REPOS` / `WEIGHTS` 补目录、仓库和权重清单。

前端不用改：引擎下拉框由 `/lipsync/defaults` 动态渲染。

> 各引擎官方 CLI 参数随版本会变。`lipsync_worker.py` 会先探测实际存在的入口和配置再拼命令，
> 并把完整命令打进日志（页面「执行日志」里能看到 `RUN ...`），参数对不上时照着日志改
> `_build_*_cmd` 即可。

## 常见问题

**「引擎退出码非 0」** — 先看页面日志末尾的 `RUN ...` 那行完整命令，再到家里电脑上手动跑一遍，
报错信息通常比日志里更完整。LatentSync 的异常经常只打印在 ComfyUI 终端而不进 ComfyUI 报错框。

**权重路径不对** — 执行 `python scripts\setup_lipsync.py --engine <name> --mark-ready`，
脚本会列出还缺哪些文件。

**第一次跑特别慢** — 首次加载模型会读几 GB 权重，属正常；第二次开始才是稳定的推理耗时。

**音频超过 180 秒** — 单次上限 180 秒（`_MAX_AUDIO_SEC`），超了会被拒。
长文案建议分段生成后用 ffmpeg 拼接。

## 合规提醒

这是**深度合成**功能，用真人肖像生成说话视频有明确的法律边界：

1. 只能对**已获授权**的肖像使用。页面上应保留「已获得肖像权人授权」的确认步骤。
2. 不建议把**他人肖像 + 克隆音色**组合使用——这等同于伪造他人发言，是最高风险场景。
3. 这是站内**管理员私有工具**（`privateToolsConfig`，不在公开工具列表里），本质上不对外开放，
   但如果后续要开放给普通用户，务必先补上显式 AI 标识/水印、内容审核和使用者承诺。
4. 用户素材和成片建议定期清理（`output/lipsync/` 下按任务目录组织，页面上可直接删除）。
