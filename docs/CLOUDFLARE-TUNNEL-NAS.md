# Cloudflare Tunnel + Docker Desktop 分步清单

把 **pdf.toolbasecamp.com** 从 VPS 迁到 Win11 NAS，通过 Cloudflare Tunnel 对外访问。家里 **不用开 443**，**不用 DDNS 端口转发**。

配套文件：`deploy/home-nas/`（docker-compose、脚本）

---

## 架构

```text
手机/电脑
    ↓ HTTPS
Cloudflare 边缘（橙云，自动）
    ↓ 加密隧道
NAS: cloudflared 容器
    ↓ HTTP（Docker 内网）
NAS: pdf-proxy (nginx，注入返回主站顶栏)
    ↓
NAS: stirling-pdf (Stirling-PDF)
```

VPS 继续跑：主站、API、chef、dev 等轻量服务。

---

## 第 0 步：前置条件

- [ ] Win11 NAS 已装 **Docker Desktop**，WSL2 后端正常
- [ ] 已配置 `.wslconfig`（见 [HOME-NAS.md](./HOME-NAS.md)）
- [ ] Cloudflare 账号能管理 **toolbasecamp.com**
- [ ] 域名 DNS 在 Cloudflare（Nameserver 已接入）

---

## 第 1 步：Cloudflare 创建 Tunnel

1. 打开 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. 左侧 **Networks → Connectors → Cloudflare Tunnels**
3. **Create a tunnel** → 类型选 **Cloudflared**
4. 名称填：`tbc-home-nas` → **Save tunnel**
5. 在 **Install connector** 页面，复制 **Token**（一长串 `eyJ...`），先存到记事本
6. 点 **Next**，进入 **Public Hostname**：

| 字段 | 值 |
|------|-----|
| Subdomain | `pdf` |
| Domain | `toolbasecamp.com` |
| Path | （留空） |
| Type | **HTTP** |
| URL | `pdf-proxy:80` |

7. **Additional application settings**（可选）：
   - HTTP Settings → **HTTP Host Header** 设为 `pdf.toolbasecamp.com`（一般默认即可）
8. **Save tunnel**

> **说明：** `pdf-proxy` 是 docker-compose 里的 nginx 服务名。Tunnel 连接器与它在同一 Docker 网络内，用服务名访问。

9. 回到 Cloudflare **DNS** 页，确认出现类似记录：

```text
pdf   CNAME   xxxxx.cfargotunnel.com   Proxied（橙云）
```

若仍有 **pdf → VPS IP 的 A 记录**，请 **删除 A 记录**，只保留 Tunnel 的 CNAME。

---

## 第 2 步：NAS 拉代码 / 复制目录

在 NAS 上任选目录，例如 `D:\toolbasecamp\deploy\home-nas`（git clone 整个仓库亦可）。

---

## 第 3 步：配置环境变量

PowerShell：

```powershell
cd D:\toolbasecamp\deploy\home-nas
copy .env.example .env
notepad .env
```

填入：

```env
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...你的token...
```

---

## 第 4 步：下载 OCR 语言包

```powershell
mkdir tessdata -Force
Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata" -OutFile tessdata\eng.traineddata
Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata" -OutFile tessdata\chi_sim.traineddata
```

---

## 第 5 步：生成 nginx 配置（含返回主站顶栏）

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-nginx-pdf.ps1
```

应输出：`OK: wrote ...\nginx-pdf.conf`

---

## 第 6 步：启动 Docker

```powershell
docker compose up -d
```

等待 Stirling 健康检查通过（首次约 1～2 分钟）：

```powershell
docker compose ps
docker compose logs stirling-pdf --tail 30
docker compose logs cloudflared --tail 20
```

`cloudflared` 日志应出现 `Registered tunnel connection` 之类成功字样。

---

## 第 7 步：验证

### NAS 本机

```powershell
docker compose exec pdf-proxy wget -q -O - http://127.0.0.1/ | Select-String -Pattern "PDF|Stirling|portal-home-bar"
```

### 外网

1. Cloudflare → **Caching → Purge Everything**
2. 手机 **无痕模式** 打开：`https://pdf.toolbasecamp.com`
3. 应看到 PDF Toolkit，顶部有 **← Tool Basecamp** 返回条

---

## 第 8 步：VPS 释放内存

确认外网 pdf 正常后，SSH 到 VPS：

```bash
sudo bash /opt/toolbasecamp-deploy/stop-vps-pdf-after-nas-migration.sh
free -h
```

VPS 内存应从 ~75% 明显下降。

---

## 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| pdf 打不开 / 超时 | DNS 仍指向 VPS A 记录 | 删 A 记录，只留 Tunnel CNAME |
| pdf 502 | Stirling 未就绪 | `docker compose logs stirling-pdf`，等 healthcheck 变 healthy |
| Tunnel 断开 | Token 错误或 NAS 断网 | 检查 `.env` token；`docker compose restart cloudflared` |
| 无返回主站顶栏 | 未跑 setup-nginx-pdf.ps1 | 重跑脚本并 `docker compose restart pdf-proxy` |
| OCR 无中文 | tessdata 缺失 | 重下 `chi_sim.traineddata` 并重启 stirling |
| 大 PDF OCR 524 | Cloudflare 100s 限制 | 拆小文件；与 VPS 灰云问题相同 |

### 查看 Tunnel 是否在线

Zero Trust → Tunnels → `tbc-home-nas` → Status 应为 **Healthy**

### 本地调试（可选）

在 `docker-compose.yml` 的 `pdf-proxy` 下临时加：

```yaml
ports:
  - "127.0.0.1:8081:80"
```

浏览器访问 `http://127.0.0.1:8081` 测 nginx + Stirling。

---

## 以后加 translate / hoppscotch

同一 Tunnel 可再加 Public Hostname：

| 子域 | Docker URL |
|------|------------|
| `translate.toolbasecamp.com` | `translate-proxy:80`（需另起 compose 服务） |
| 或单独 compose 文件 | 同一 `cloudflared` 网络 `external` 连接 |

建议每迁一个服务：Tunnel 加 hostname → NAS 起容器 → VPS 停对应 Docker → 验证 → 再迁下一个。

---

## 安全建议

- `.env` 含 Tunnel token，**不要提交 git**
- 不要对公网开放 Windows RDP
- NAS 设自动登录 + Docker Desktop 开机启动（见 HOME-NAS.md）

---

## 相关链接

- [HOME-NAS.md](./HOME-NAS.md) — Docker Desktop / WSL 基础配置
- [deploy/home-nas/README.md](../deploy/home-nas/README.md) — 命令速查
