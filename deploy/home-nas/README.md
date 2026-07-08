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

## 文件说明

| 文件 | 作用 |
|------|------|
| `docker-compose.yml` | PDF + 翻译 + cloudflared |
| `setup-nginx-pdf.ps1` / `setup-nginx-translate.ps1` | 生成 nginx 注入配置 |
| `stop-vps-*-after-nas-migration.sh` | VPS 侧停对应 Docker |

## 常用命令

```powershell
docker compose logs libretranslate --tail 40
docker compose restart translate-proxy cloudflared
docker compose pull && docker compose up -d
```
