# 家里 NAS / WSL 的 Cloudflare Tunnel

Win11 上的 Docker 经 **一条 Tunnel** 暴露子域，家里不用开 443。

> **2026-10 子站下线**：`pdf.zhengxiaohui.cn`（Stirling PDF）与 `translate.zhengxiaohui.cn`
> （LibreTranslate）已停用，对应的 `tbc-stirling-pdf` / `tbc-pdf-proxy` /
> `tbc-libretranslate` / `tbc-translate-proxy` 四个服务、`nginx-pdf.conf` /
> `nginx-translate.conf` 与保活计划任务 `ToolBasecamp-NAS-Portal-Warmup` 都已从本目录移除。
> **`tbc-cloudflared` 保留**：家里电脑的 ComfyUI（`comfy.zhengxiaohui.cn`）仍走这条隧道。
> 清理步骤见仓库根目录 `README.md` 的「子站下线清理」一节。

---

## WSL Docker Engine：启动几分钟后出现 1033

WSL 的 systemd 服务不能独自维持发行版存活。Windows 端应持续运行
`keep-wsl-nas-alive.ps1`，它同步等待 WSL 看门狗，WSL 退出后隔 15 秒重试。
手动运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\project\toolbasecamp\deploy\home-nas\keep-wsl-nas-alive.ps1
```

此进程需要持续运行；日志在 `%LOCALAPPDATA%\ToolBasecamp\wsl-nas-keepalive.log`。
本机已配置 Windows 计划任务 `ToolBasecamp-WSL-NAS-KeepAlive`：当前用户登录后
隐藏运行，无运行时长限制；WSL 子进程退出后 15 秒重试，计划任务失败后每分钟
重试。此外每分钟触发一次启动检查（已经运行则跳过），即使整个 Windows
保活程序被结束，也能由独立的计划任务触发器恢复。运行
`install-wsl-nas-keepalive.ps1` 可安装或更新这两个触发器。
原 `WSL-Docker-Start.bat` 已移出启动文件夹并备份到
`%LOCALAPPDATA%\ToolBasecamp`，避免重复启动。该配置需要用户登录，不是登录前服务。
需要长期暂停时，应在任务计划程序中先禁用、再停止该任务；仅停止会在下次触发时恢复。
脚本只允许一个 Windows 实例，看门狗在 Linux 端也有互斥锁。
`wsl-tunnel-watchdog.sh` 每 30 秒检查容器内部的 `20241/ready`，连续失败
3 次才重启隧道，重启后等待 90 秒。不再根据 `Registered` 日志是否出现
判断连接健康，避免每隔几分钟误重启。该端口无需向公网开放。
当前检查地址适用于本 Compose 的单网络容器和 cloudflared 默认 metrics 端口。

## 常用命令

```powershell
cd D:\project\toolbasecamp\deploy\home-nas
docker compose ps
docker compose logs cloudflared --tail 40
docker compose pull && docker compose up -d
```

## 文件说明

| 文件 | 作用 |
|------|------|
| `docker-compose.yml` | 仅 `cloudflared`（隧道本体） |
| `keep-wsl-nas-alive.ps1` / `install-wsl-nas-keepalive.ps1` / `wsl-tunnel-watchdog.sh` | WSL + 隧道保活 |
| `install-docker-engine-wsl.sh` / `setup-docker-context-wsl.ps1` / `restore-home-nas-wsl.ps1` | WSL Docker 环境搭建与恢复 |
| `wsl-fix-dns-for-tunnel.sh` | 隧道 DNS 解析修复 |
| `clash-tunnel-direct.snippet.yaml` | Clash 直连规则（argotunnel 例外） |
