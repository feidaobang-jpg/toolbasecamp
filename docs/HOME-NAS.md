# 家用 NAS（Win11 + Docker Desktop）部署指南

把吃内存的子站（PDF、翻译等）从 VPS 迁到家里 32GB 小主机，VPS 只留主站 + API + 轻量静态站。

**Docker Desktop 完全可行**，适合先跑起来；长期 7×24 稳定可再迁到 WSL2 里的纯 Linux Docker 或独立 Linux VM。

---

## Docker Desktop 行不行？

| 项目 | 说明 |
|------|------|
| **结论** | ✅ 可以，个人/小流量足够 |
| **引擎** | 必须用 **WSL2 后端**（Linux 容器），不要开 Windows 容器 |
| **Win11 禁更新** | ✅ 有利于减少意外重启；另在 Docker Desktop 里关掉自动更新 |
| **32GB 内存** | 在 `%UserProfile%\.wslconfig` 里给 WSL 分配 20～24GB，留 8GB 给 Windows |
| **和 VPS 脚本** | 同一套 `docker run` / compose 思路，端口改为 `127.0.0.1:8080` 等 |

---

## 一次性准备（Win11 NAS）

### 1. 启用 WSL2

PowerShell **管理员**：

```powershell
wsl --install -d Ubuntu
```

重启后进入 Ubuntu 完成用户名密码。Docker Desktop 安装时选 **Use WSL2 based engine**。

### 2. 限制 WSL 内存（重要）

文件：`C:\Users\<你的用户名>\.wslconfig`

```ini
[wsl2]
memory=24GB
processors=8
swap=8GB
localhostForwarding=true
```

保存后 PowerShell：

```powershell
wsl --shutdown
```

再打开 Docker Desktop。

### 3. Docker Desktop 设置

- **General** → ✅ Start Docker Desktop when you log in  
- **General** → ✅ Use the WSL 2 based engine  
- **Resources → WSL Integration** → 对 Ubuntu 开启集成  
- **Software updates** → 关闭自动更新（与 Win11 禁更新一致，避免半夜重启）  
- **Docker Engine** → 可设 `"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}` 防止日志撑满磁盘  

### 4. 电源与睡眠

- 控制面板 → 电源 → **从不睡眠**（至少「接通电源时」）  
- 网卡属性 → 取消「允许计算机关闭此设备以节约电源」  
- 可选：BIOS 里 **AC 断电恢复后自动开机**

### 5. 外网访问（不要只靠 DDNS 端口转发）

优先 **Cloudflare Tunnel**（`cloudflared` 容器或 Windows 服务）：

- 家里 **不用开 443 端口**  
- `pdf.toolbasecamp.com` 在 Cloudflare 指到 Tunnel  
- 国内手机访问与主站一致（橙云）  

备选：**Tailscale** 组网，VPS nginx `proxy_pass` 到 NAS 的 `100.x.x.x`（见下文混合架构）。

---

## 建议迁移顺序

| 顺序 | 服务 | 大致内存 | VPS 脚本参考 |
|------|------|----------|--------------|
| 1 | Stirling PDF | ~1.3GB | `deploy/install-stirling-pdf.sh` |
| 2 | LibreTranslate | ~2～4GB | `deploy/install-libretranslate.sh` |
| 3 | Hoppscotch | ~0.5～1GB | `deploy/install-hoppscotch.sh` |

迁完 PDF + 翻译后，VPS 4GB 占用通常可从 ~75% 降到 ~40～50%。

---

## NAS 上跑 Stirling PDF（示例）

在 Docker Desktop 或 WSL Ubuntu 里：

```bash
# tessdata 目录先建好（OCR 用）
mkdir -p /opt/toolbasecamp-stirling/tessdata

docker run -d --name stirling-pdf --restart unless-stopped \
  --memory 2048m --memory-swap 2560m \
  -p 127.0.0.1:8080:8080 \
  -v stirling-data:/configs \
  -v /opt/toolbasecamp-stirling/tessdata:/usr/share/tessdata \
  -e SECURITY_ENABLELOGIN=false \
  -e SECURITY_CSRFDISABLED=true \
  -e SYSTEM_ENABLEONBOARDING=false \
  -e TESSERACT_LANGS=eng,chi_sim \
  -e JAVA_TOOL_OPTIONS="-Xms512m -Xmx1536m" \
  -e UI_APPNAME="PDF Toolkit" \
  docker.stirlingpdf.com/stirlingtools/stirling-pdf
```

NAS 内存宽裕，可把 `--memory` / `-Xmx` 比 VPS 略调高，减少 OOM。

本地验证：`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/`

---

## 混合架构示意

```text
用户 → Cloudflare（橙云）
         │
    ┌────┴────────────────────┐
    │ VPS 1～2GB               │
    │ toolbasecamp.com + API   │
    │ chef / dev 静态          │
    └────┬────────────────────┘
         │  Cloudflare Tunnel  或  Tailscale
    ┌────┴────────────────────┐
    │ Win11 NAS + Docker Desktop │
    │ pdf / translate / hoppscotch │
    └─────────────────────────┘
```

**VPS 侧**：关掉对应 Docker，nginx 可删除 pdf vhost 或改为反代（若用 Tailscale）。

**DNS**：`pdf` 记录指 Tunnel 公网主机名，或仍指 VPS 由 VPS 反代到 NAS。

---

## Docker Desktop 的注意点

1. **首次登录 Windows 用户后 Docker 才启动** — 可设自动登录或计划任务启动 Docker Desktop。  
2. **家宽上行** — PDF 上传/download 速度受上传带宽限制，自用可接受。  
3. **Win 重启** — 禁系统更新后仍可能因驱动、手动重启中断；容器设 `--restart unless-stopped`。  
4. **备份** — 定期备份 Docker volumes（`stirling-data` 等）到 NAS 其它盘。  
5. **安全** — 不要对公网裸暴露 RDP/3389；用 Tunnel/Tailscale 即可。

---

## 何时不用 Docker Desktop？

- 要 **无人值守跑几年** → 单独装 **Linux VM（Proxmox/Hyper-V）** 里跑原生 Docker  
- 要 **和 VPS 同一套 bash deploy** → Linux VM 可直接 rsync `deploy/` 执行  

Docker Desktop 是 **最省事的起点**；稳定后再迁 Linux 也不迟，数据在 volume 里迁移简单。

---

## 相关文档

- VPS 侧 PDF：`README.md` → PDF portal  
- DNS 橙云：`deploy/check-pdf-dns.sh`  
- 内存紧张时优先迁：`pdf` → `translate`
