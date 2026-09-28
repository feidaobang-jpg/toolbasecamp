# 官方 ComfyUI-main 迁移指南（家里电脑 API）

从 Aki 整合包迁到 **官方 [ComfyUI](https://github.com/comfyanonymous/ComfyUI)**（你已有 `D:\sd\ComfyUI-main`），只装 **toolbasecamp「家里电脑」API 真正用到** 的节点与模型。

`comfyui-api-server` **不用改**，仍连 `127.0.0.1:8188`。

---

## 推荐目录

```text
D:\sd\ComfyUI-main\          ← git clone 官方仓库
  .venv\                     ← ComfyUI 专用虚拟环境（与 API 的 Python 分开）
  custom_nodes\              ← 只装下面清单里的
  models\                    ← 可从 Aki 拷/软链，避免重复下载

D:\project\toolbasecamp\comfyui-api-server\   ← API :5000，不变
```

**不要**把 Aki 整包 `custom_nodes` 拷过来；只迁 **models** 和 **你确认能跑的工作流所需插件**。

---

## 一次性安装（Windows）

在 **PowerShell / cmd**（非 Aki 内置终端）：

```bat
cd /d D:\sd\ComfyUI-main
git pull

python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

（CUDA 版本按你显卡驱动选 [PyTorch 官网](https://pytorch.org) 命令；上例为 CUDA 12.4 示例。）

安装 **ComfyUI-Manager**（后续装节点用）：

```bat
cd custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
```

---

## 必装自定义节点（按 API 功能）

在 ComfyUI 里打开 **Manager → Install Custom Nodes**，搜索下表 **仓库名** 安装，装完 **Restart ComfyUI**。

| 后台功能 | 工作流文件 | 仓库（Manager 搜） | 关键节点 |
|----------|------------|-------------------|----------|
| **去背景** | `rembg.json` | **ComfyUI-Inspyrenet-Rembg** | `InspyrenetRembg` |
| **描述抠图** | `qwen_describe_cutout.json` | **Comfyui_Object_Detect_QWen_VL** | `DownloadAndLoadQwenModel`, `QwenVLDetection`, `BBoxesToSAM2` |
| | | **ComfyUI-segment-anything-2**（kijai） | `DownloadAndLoadSAM2Model`, `Sam2Segmentation` |
| | | **ComfyUI_LayerStyle**（或 LayerStyle 系列） | `LayerMask: LoadSAM2Model`, `LayerMask: SAM2UltraV2` |
| | | **ComfyUI-Easy-Use**（可选） | `easy showAnything`（仅预览，可换 `PreviewImage`） |
| **老照片修复** | `【All In One】Qwen-Image-Edit-…` | **ComfyUI-KJNodes** | `ImageConcanate` |
| | | **rgthree-comfy**（可选） | `Image Comparer`（工作流里有，非必须可删节点） |
| **文生图 / 图生图 / 文字配图·成片** | `z_image_turbo*.json` | **无额外插件**（ComfyUI 需较新版本） | `UNETLoader`, `EmptySD3LatentImage`, `ModelSamplingAuraFlow` 等为**内置** |

未接入 API、可忽略：`kontext-remove-watermark.json`（去水印，前端未接）。

### 安装后 pip（若 Manager 报缺依赖）

在 **ComfyUI-main 的 venv** 里，进入对应 `custom_nodes/xxx` 目录执行：

```bat
D:\sd\ComfyUI-main\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`ComfyUI-Inspyrenet-Rembg` 若启动报 `albucore` 等缺包，同样用 **main 的 venv** 装，不要用 Aki 的 embedded Python。

---

## 模型文件（可从 Aki 复制）

在 Aki 里搜同名文件，复制到 **ComfyUI-main** 对应目录（路径以官方为准）：

### Z-Image Turbo（文生图 / 图生图 / 文字配图·成片）

| 文件 | 目录 |
|------|------|
| `z_image_turbo_bf16.safetensors`（或 FP8/GGUF 版） | `models/diffusion_models/` |
| `qwen_3_4b.safetensors` | `models/text_encoders/` |
| `ae.safetensors` | `models/vae/` |

工作流里 UNET / CLIP / VAE _loader 下拉要选对上述文件名。

### Qwen-Image-2.1 · 7B（文生图 / 图生图多模型对比）

后台「文生图」「图生图」新增可选模型 `qwen-image-2.1:7b`，可与 Z-Image Turbo / Qwen-Rapid-AIO **多选、排队生成、并排对比**（同一提示词、同一种子）。

**权重自动发现**：API 不硬编码文件名，而是启动后到 ComfyUI 的 `object_info` 里按关键字匹配。把下表文件放进对应目录并**重启 ComfyUI** 即可；未就位时前端会自动置灰该模型并提示缺哪个文件。

| 用途 | 文件名含其一即可 | 目录 |
|------|------------------|------|
| 主模型（diffusion） | `qwen_image_2_1` / `qwen-image-2.1` | `models/diffusion_models/` |
| 文本编码器（CLIP） | `qwen_2.5_vl_7b` / `qwen3_vl_8b` | `models/text_encoders/` |
| VAE | `qwen_image_vae` | `models/vae/` |

对应工作流：`work-flow/qwen_image_21_t2i.json`（文生图）、`work-flow/qwen_image_21_img2img.json`（图生图）。

采样默认 20 步 / cfg 2.5 / euler+simple，可用环境变量覆盖：`QWEN21_STEPS`、`QWEN21_CFG`、`QWEN21_SAMPLER`、`QWEN21_SCHEDULER`、`QWEN21_MEGAPIXELS`。

CLIPLoader 的 `type` 需较新版本 ComfyUI 支持 `qwen_image`；版本过旧无此类型时提交会由 ComfyUI 明确报错，提示升级。

### 老照片修复（Qwen All-In-One）

工作流使用 `CheckpointLoaderSimple`，需要 **AIO 整包 checkpoint**（与 Aki 里该工作流选的同名 `.safetensors`）：

→ `models/checkpoints/`

（具体文件名打开 `work-flow/【All In One】Qwen-Image-Edit-Rapid-AIO-v10-老照片修复.json` 里节点默认值，或 Aki 里加载成功后看 checkpoint 名。）

### 描述抠图

- Qwen2.5-VL：首次运行 **DownloadAndLoadQwenModel** 会自动下到 `models/Qwen/`（需磁盘与网络）
- SAM2：由 **segment-anything-2** 节点按需下载

### 去背景

Inspyrenet 首次运行 **自动下载** 权重，无需手拷。

---

## 启动方式

**一键启动（推荐）**：

```bat
D:\project\toolbasecamp\comfyui-api-server\start-all.bat
```

会依次做：起 ComfyUI（后台隐藏，等 8188 就绪）→ 起 API（本窗口前台）。
两边都已在跑时不会重复启动。

**手动启动**（**先 ComfyUI，再 API**，顺序固定）：

```bat
:: 1) ComfyUI 8188
D:\project\toolbasecamp\comfyui-api-server\scripts\start-comfyui-main.bat

:: 2) API 5000
D:\project\toolbasecamp\comfyui-api-server\start-server.bat
```

`start-comfyui-main.bat` 默认根目录 `D:\sd\ComfyUI-main`，可用环境变量覆盖：

```bat
set COMFYUI_ROOT=E:\path\to\ComfyUI-main
```

后台自启（`run-comfyui-hidden.vbs` → `run-comfyui-autostart.bat`）默认带
`--lowvram --cache-none --reserve-vram 0.8`（16GB 显存友好），
可在 `local.env` 里用 `COMFYUI_EXTRA_ARGS` 覆盖。

---

## 自检

ComfyUI 起来后：

```bat
D:\sd\ComfyUI-main\venv\Scripts\python.exe D:\project\toolbasecamp\comfyui-api-server\scripts\verify-comfyui-nodes.py
```

会对照 `work-flow/*.json` 检查 `127.0.0.1:8188` 是否注册全部 `class_type`。

浏览器：

```text
http://127.0.0.1:8188
http://127.0.0.1:5000/health          ← 应含 "comfyui": true（需最新 app.py + 重启 API）
https://comfy.zhengxiaohui.cn/health
```

后台 **家里电脑** 各页顶栏变绿后，按功能各测一次。

---

## 与 Aki 并存

| 规则 | 说明 |
|------|------|
| 同时只开 **一个** 8188 | main 或 Aki，不要两个一起开 |
| 模型可共享 | 同一盘拷或 `mklink /J` 联接 `models\checkpoints` 等 |
| 插件不共享 | main 的 `custom_nodes` 单独维护一份清单（本文） |
| API 不变 | 始终 `COMFYUI_SERVER_ADDRESS = 127.0.0.1:8188` |

Aki 可保留作备份，日常只用 **main + 本清单**。

---

## 建议迁移顺序

1. 装 main + venv + Manager，**只装 InspyrenetRembg** → 测 **去背景**
2. 拷 Z-Image 三件套 → 测 **文生图**
3. 装 Qwen 老照片 AIO checkpoint + KJNodes → 测 **老照片修复**
4. 装 Qwen-VL + SAM2 + LayerStyle → 测 **描述抠图**
5. 测 **文字配图 / 文字成片**（依赖 Z-Image + edge-tts 在 API 侧）
6. 确认无误后 **关掉 Aki 自启**，main 设登录启动（可选）

---

## 常见问题

**Q: Manager 里节点装完仍 UNKNOWN？**  
A: 完全退出 ComfyUI 再开；看启动终端红色 Import failed；在 **main 的 venv** 里补 `pip install -r requirements.txt`。

**Q: `/health` 200 但抠图 500？**  
A: 看 API 黑窗：`Node 'InspyrenetRembg' not found` = 插件未装进 **当前占 8188 的那套** ComfyUI。

**Q: 官方 main 和 Aki 哪个对开发友好？**  
A: main：`git pull`、venv 独立、节点少、日志清晰；适合固定 API + 固定 JSON 工作流。Aki 适合手点试百种流。

**Q: 所有 venv 同时报 `No Python at '...'` / `uv trampoline failed to spawn Python`？**  
A: 这是 **Windows 用户配置文件被换过**导致的（本机 2026-09 从 `ZhengXiaoHui` 变成 `37818`，
`C:\Users\ZhengXiaoHui` 整个目录没了）。venv 的 `pyvenv.cfg` 里 `home=` 指向的 base Python 不存在了，
于是启动器直接罢工——**site-packages 里的包其实都还在**，不用重装。

修法（以 ComfyUI 为例，版本必须对上，包是 cp311 就不能换 3.12）：

```bat
:: 1) 用 uv 装一个同小版本的 Python（原 venv 是 3.11.6）
uv python install 3.11

:: 2) 备份并改写 venv\pyvenv.cfg，把 home / executable / command 指向新 Python
::    路径形如 C:\Users\<你>\AppData\Roaming\uv\python\cpython-3.11-windows-x86_64-none
:: 3) 验证
D:\sd\ComfyUI-main\venv\Scripts\python.exe -c "import torch;print(torch.__version__, torch.cuda.is_available())"
```

`uv` 本身可能还在：`C:\Users\<你>\.local\bin\uv.exe`。装完 Python 后无需重建 venv，
改 `pyvenv.cfg` 即可（其他 venv：`index-tts/.venv` 要 3.11.13，`hunyuan3d`/`stable-audio-open` 要 3.12）。

**Q: 下载/安装脚本中途莫名中断，日志里出现 `SAFE_DELETE_...`？**  
A: 本机有「安全删除」保护，程序清理临时文件时会被拦下并 fail-closed 中断整个进程。
凡是会自己删临时目录/锁文件的下载器（如 `huggingface-cli download --local-dir`）都可能中招。
改成分块直接写入目标文件、不产生临时文件即可绕过。
