# 家里电脑 ComfyUI（comfy.zhengxiaohui.cn）

自用：网站后台「家里电脑」分组里的页面，通过 Cloudflare Tunnel 连接本机 `comfyui-api-server`（默认 `:5000`）+ ComfyUI（`:8188`）。

## 架构

```text
手机/外地浏览器 → 主站静态页（后台 · 家里电脑）
        ↓ HTTPS
comfy.zhengxiaohui.cn（Cloudflare Tunnel）
        ↓
家里 NAS：cloudflared connector
        ↓ 局域网 HTTP
GPU 电脑（静态 IP）：comfyui-api-server :5000
        ↓ 本机
ComfyUI :8188 + 本地模型
```

> **connector 在 NAS、API 在另一台电脑时**：Tunnel 的 Service URL **不要**填 `127.0.0.1:5000`（那是 NAS 自己）。应填 GPU 电脑的 **局域网静态 IP**，例如 `http://192.168.1.88:5000`。  
> 只有 cloudflared 和 `comfyui-api-server` **跑在同一台机器** 时，才用 `http://127.0.0.1:5000`。

前端 API 地址：`public/js/config.js` → `siteConfig.homePcApiBase`（默认 `https://comfy.zhengxiaohui.cn`）。本机调试 `localhost` 时自动改 `http://localhost:5000`。

## 家里电脑上要跑的

1. **ComfyUI** 监听 `127.0.0.1:8188`
2. **comfyui-api-server**（仓库根目录 `comfyui-api-server/`）：
   ```bat
   cd comfyui-api-server
   install-dependencies.bat   :: 首次
   start-server.bat
   ```
3. 浏览器本机自测：`http://localhost:5000/health`

## Cloudflare Tunnel（你需要做一次）

在 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks → Tunnels**：

| 字段 | 值 |
|------|-----|
| Subdomain | `comfy` |
| Domain | `zhengxiaohui.cn` |
| Type | HTTP |
| URL | `http://<GPU电脑局域网静态IP>:5000`（例：`http://192.168.1.88:5000`） |

**同一台机器跑 connector + API 时** 才可填 `http://127.0.0.1:5000`。

家里安装 `cloudflared` 并运行 connector（可与现有 NAS tunnel 同账号，新建一条 Public Hostname 即可）。

### 局域网还需确认

1. GPU 电脑给 **固定局域网 IP**（路由器 DHCP 保留或手动静态）。
2. `comfyui-api-server` 已监听 `0.0.0.0:5000`（仓库默认如此），NAS 能访问：`http://<GPU_IP>:5000/health`。
3. **Windows 防火墙** 放行入站 TCP **5000**（来源可限局域网网段，如 `192.168.1.0/24`）。
4. ComfyUI 仍只需本机 `127.0.0.1:8188`，不必对局域网暴露。

验证：

```bash
curl -s https://comfy.zhengxiaohui.cn/health
```

应返回 `{"status":"ok",...}`。

> Tunnel 需支持 **WebSocket**（老照片修复页）。Cloudflare 默认支持；若中间有自建 nginx，需配置 `Upgrade` / `Connection` 头。

## 后台入口

登录管理员 → **后台** → **家里电脑**：

| 页面 | 说明 |
|------|------|
| 去背景 / 批量处理 | rembg + 批量缩放裁边 |
| 文生图 / 图生图 | Z-Image Turbo |
| 描述抠图 | Qwen 按描述抠图 |
| 老照片修复 | Qwen All-In-One |
| 文字配图 / 文字成片 | 分句生图；成片含 TTS + 合成 |

图标 / 封面仍在公开「媒体」工具里，纯前端，不走本服务。

## 可选：DeepSeek 画面提示词

文字配图/成片可在 `comfyui-api-server` 环境变量设 `DEEPSEEK_API_KEY`，用于批量写文生图提示词；无密钥时用规则拼接。

## 重新生成 HTML 壳

若改了 composite 源页面，可运行：

```bash
python deploy/gen-home-pc-pages.py
```

（需本机 Python 3。）
