# NAS 上 PDF + Cloudflare Tunnel 一键目录

Win11 Docker Desktop 跑 Stirling-PDF，经 Cloudflare Tunnel 暴露 `pdf.toolbasecamp.com`，无需家里开 443 端口。

**完整图文步骤见：** [docs/CLOUDFLARE-TUNNEL-NAS.md](../../docs/CLOUDFLARE-TUNNEL-NAS.md)

## 快速开始

### 1. Cloudflare 创建 Tunnel（浏览器）

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks → Tunnels**
2. **Create a tunnel** → 选 **Cloudflared** → 命名如 `tbc-home-nas`
3. 复制 **Install connector** 里的 token（形如 `eyJh...`）
4. **Public Hostname** 添加：
   - Subdomain: `pdf`
   - Domain: `toolbasecamp.com`
   - Service type: **HTTP**
   - URL: `pdf-proxy:80`（Docker 内 nginx，见 compose）
5. 保存

### 2. NAS 准备

```powershell
cd D:\toolbasecamp\deploy\home-nas
copy .env.example .env
notepad .env
```

下载 OCR 语言包（PowerShell）：

```powershell
mkdir tessdata -Force
Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata" -OutFile tessdata\eng.traineddata
Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata" -OutFile tessdata\chi_sim.traineddata
```

生成 nginx 配置（注入返回主站顶栏）：

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-nginx-pdf.ps1
```

### 3. 启动

```powershell
docker compose up -d
docker compose ps
docker compose logs -f cloudflared
```

本地测 Stirling：`curl http://127.0.0.1:8080/`（需临时映射端口时见 compose 注释）  
外网测：手机无痕打开 `https://pdf.toolbasecamp.com`

### 4. VPS 释放内存（迁移成功后）

SSH 到 VPS：

```bash
sudo bash /opt/toolbasecamp-deploy/stop-vps-pdf-after-nas-migration.sh
```

Cloudflare DNS：`pdf` 由 Tunnel 接管后，**删除** 原指向 VPS IP 的 A 记录（Tunnel 会自动创建 CNAME）。

---

## 文件说明

| 文件 | 作用 |
|------|------|
| `docker-compose.yml` | Stirling + nginx 注入 + cloudflared |
| `.env.example` | Tunnel token 模板 |
| `nginx-pdf.conf.template` | nginx 反代模板 |
| `setup-nginx-pdf.ps1` | 把 inject snippet 写入 nginx 配置 |
| `stop-vps-pdf-after-nas-migration.sh` | VPS 侧停 Stirling / 关 pdf vhost |

## 常用命令

```powershell
docker compose logs stirling-pdf --tail 50
docker compose restart cloudflared
docker compose down
docker compose pull && docker compose up -d
```
