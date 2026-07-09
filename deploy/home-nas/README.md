# NAS 子站（PDF + 翻译）+ Cloudflare Tunnel

Win11 Docker Desktop 跑吃内存服务，经 **同一 Tunnel** 暴露子域，家里不用开 443。

**完整步骤：** [docs/CLOUDFLARE-TUNNEL-NAS.md](../../docs/CLOUDFLARE-TUNNEL-NAS.md)

## 迁移顺序

| 步骤 | 子域 | Docker 服务 | VPS 收尾 |
|------|------|-------------|----------|
| ✅ 1 | `pdf` | `pdf-proxy:80` | `stop-vps-pdf-after-nas-migration.sh` |
| ▶ 2 | `translate` | `translate-proxy:80` | `stop-vps-translate-after-nas-migration.sh` |
| 3 | `hoppscotch` | （待加） | 待加 |

---

## 第 2 步：迁移 translate（当前）

### Cloudflare Tunnel 加一条 Public Hostname

Zero Trust → 你的 Tunnel → **Public Hostname** → Add：

| 字段 | 值 |
|------|-----|
| Subdomain | `translate` |
| Domain | `toolbasecamp.com` |
| Type | HTTP |
| URL | `translate-proxy:80` |

删除 DNS 里旧的 `translate` **A 记录**（若有）。

### NAS PowerShell

```powershell
cd D:\toolbasecamp\deploy\home-nas
powershell -ExecutionPolicy Bypass -File .\setup-nginx-translate.ps1
docker compose up -d
docker compose ps
```

首次启动 LibreTranslate 约 **2～5 分钟**（下载 en/zh 模型）。

验证：`https://translate.toolbasecamp.com` → 翻译页 + 顶部返回条。

### VPS 释放内存（外网正常后）

```bash
sudo bash /opt/toolbasecamp-deploy/stop-vps-translate-after-nas-migration.sh
free -h
```

内存预计从 ~55% 再降到 ~35～40%。

---

## 第 1 步：PDF（已完成可跳过）

### Cloudflare Tunnel

Public Hostname：`pdf.toolbasecamp.com` → `pdf-proxy:80`

### NAS

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-nginx-pdf.ps1
docker compose up -d
```

VPS：`sudo bash /opt/toolbasecamp-deploy/stop-vps-pdf-after-nas-migration.sh`

---

## 打开慢（4～6 秒）说明与优化

**原因（实测）：**

| 阶段 | PDF | 翻译 |
|------|-----|------|
| 首包 HTML（TTFB） | ~2.5～3s | ~2～3s |
| 主要 JS/CSS | Stirling 单包 ~3.4MB | 多文件（vue/materialize/app…） |
| 路径 | 浏览器 → Cloudflare → **家里 Tunnel** → Docker | 同上 |

慢的主因不是 VPS，而是 **Tunnel 多一跳 + 家里上行带宽**；翻译比 PDF 更慢，因为 **每个静态文件都要单独走一遍 Tunnel**（之前未单独缓存静态资源）。

**已做 / 可做优化：**

1. **翻译 nginx 静态资源独立 location**（`nginx-translate.conf.template`）— 跳过 sub_filter、保留 gzip、7 天 Cache-Control，便于 CF 边缘缓存。
2. **HTML 注入后 gzip**（pdf / translate proxy）。
3. **主站 preconnect translate**（`public/index.html`）。
4. **NAS 保活**（可选）：`install-nas-warmup-task.ps1` 每 5 分钟 ping 两个子站，避免 JVM/模型冷启动。
5. **Cloudflare Cache Rules**（可选）：`pdf.toolbasecamp.com` / `translate.toolbasecamp.com` 对 `*.js` `*.css` `/static/*` 设 **Cache Everything，Edge TTL 7 天**（HTML 保持 Bypass）。
6. **二次访问**会明显快于首次（PDF 的 `/assets/*.js` 已有 `Cf-Cache-Status: HIT`）。

**无法彻底消除的：** Tunnel 物理延迟（约 1～3s TTFB）、Stirling 大包体积。若必须 <2s 首屏，只能把子站迁回 VPS 或上 CF Argo Smart Routing（付费）。

更新 nginx 后 NAS 执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-nginx-translate.ps1
powershell -ExecutionPolicy Bypass -File .\setup-nginx-pdf.ps1
docker compose restart pdf-proxy translate-proxy
```

---

## 文件说明

| 文件 | 作用 |
|------|------|
| `docker-compose.yml` | PDF + 翻译 + cloudflared |
| `setup-nginx-pdf.ps1` / `setup-nginx-translate.ps1` | 生成 nginx 注入配置 |
| `warm-nas-portals.ps1` / `install-nas-warmup-task.ps1` | 定时保活（可选） |
| `stop-vps-*-after-nas-migration.sh` | VPS 侧停对应 Docker |

## 常用命令

```powershell
docker compose logs libretranslate --tail 40
docker compose restart translate-proxy cloudflared
docker compose pull && docker compose up -d
```
