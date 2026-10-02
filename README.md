# Treasure Box

Global site: **https://zhengxiaohui.cn**

## Structure

```
toolbasecamp/
├── public/                 # Static site → /var/www/toolbasecamp
├── server/                 # FastAPI → /opt/toolbasecamp-api
└── deploy/                 # nginx, systemd, server scripts
    ├── nginx-toolbasecamp-news.conf      # news.zhengxiaohui.cn
    ├── nginx-toolbasecamp.conf           # main site + toolbasecamp.com legacy
    ├── nginx-legacy-toolbasecamp-redirects.conf  # toolbasecamp.com → zhengxiaohui.cn 301
    ├── patch-nginx-news.sh / expand-zhengxiaohui-portal-certs.sh
    ├── install-news-cron.sh
    └── home-nas/             # Cloudflare Tunnel (home PC / NAS)
```

## Retired portals (2026-10) — 已于 2026-10-02 执行完毕

**pdf / dev / chef / hoppscotch / translate** 五个子站连同站内的「安卓」「开发者」两组工具一起下线，
只保留 **news.zhengxiaohui.cn**（科技资讯）。仓库侧（nginx conf、install/patch 脚本、CI 构建步骤、
首页入口卡片、i18n 文案、sitemap）与线上侧均已清理，下面是实际执行记录，避免以后重复排查。

| 位置 | 已执行 |
|------|--------|
| 仓库 | 69 个文件删除；`.github/workflows/deploy.yml` 去掉 dev/chef 构建与 5 个子站校验步骤 |
| VPS nginx | 卸载 `sites-enabled/toolbasecamp-{dev,chef,hoppscotch}`（备份在 `/root/backup-portal-retire-20261002/nginx/`），`nas-proxy` / `legacy-redirects` 本就未启用 |
| VPS 磁盘 | 删 `/var/www/toolbasecamp-{dev,chef}`、`/opt/toolbasecamp-stirling`，以及 67 个已从仓库移除但被 CI 留在 `/opt/toolbasecamp-deploy` 的脚本 |
| VPS Docker | Hoppscotch 两容器 + `toolbasecamp-hoppscotch_hoppscotch-pgdata` 卷 + `hoppscotch/hoppscotch:2026.6.0` / `postgres:15-alpine` 镜像 + 3 个 env/secret 文件；服务器现已**零容器**，内存 905Mi → 697Mi |
| NAS | `tbc-stirling-pdf` / `tbc-pdf-proxy` / `tbc-libretranslate` / `tbc-translate-proxy` 已 `docker rm -f`；**保留** `tbc-cloudflared` 与 WSL 保活计划任务（ComfyUI 仍走这条 Tunnel） |
| Cloudflare DNS | `dev` / `chef` / `hoppscotch` / `pdf` / `translate` 记录已删，现全部 NXDOMAIN；`@` / `www` / `news` / `comfy` / `nas` 保留 |
| 证书 | `zhengxiaohui.cn` 的 SAN 已收敛为 `zhengxiaohui.cn` + `www` + `news`（certbot 会按整串 SAN 续签，残留域名会让主站续签失败） |

**唯一剩余收尾（不影响可用性）**：Cloudflare Zero Trust → Networks → Tunnels → `home-nas-docker` →
Public Hostname，删掉 `pdf` / `translate` 两条 ingress 残留路由（DNS 已删，这两个域名不可达）。

两个踩过的坑，后续运维注意：

1. CI 用 `rsync` 同步 `deploy/` → `/opt/toolbasecamp-deploy/` **不带 `--delete`**，仓库删文件不会让服务器上的副本消失，必须手动清。
2. 别拿容器的 `com.docker.compose.project.working_dir` 标签当"项目专属目录"直接 `rm -rf` —— 本项目里它是 `/opt/toolbasecamp-deploy`，删它等于删掉 cron 依赖的运维脚本（可从仓库 `tar` + `sudo mv` 恢复，但服务器独有的 `_dump-now.sh` / `_finish-portals.sh` 已丢）。

## Main-site i18n (zhengxiaohui.cn only)

English + 简体中文; browser language auto-detect; header **中文 / EN** toggle. The news portal keeps its own i18n.

**New UI on the main site must add keys to both** `public/js/locales/en.js` and `public/js/locales/zh-CN.js`. See [docs/I18N.md](docs/I18N.md).

## Deploy (GitHub Actions)

Push to GitHub `master` → GitHub Actions rsync to server → restart API.

```powershell
git add .
git commit -m "feat: ..."
git push origin master
```

GitHub push may fail from China when the network is unstable — retry later or use VPN.

Rollback: `git checkout <commit>` then push again.

View deploy runs: GitHub repo → **Actions** tab.

### Hybrid: home NAS / WSL Cloudflare Tunnel

A **Win11 box with Docker Desktop + WSL2** can host memory-heavy services behind one Cloudflare Tunnel
instead of upgrading VPS RAM. Since the 2026-10 portal shutdown this stack only runs `cloudflared`
(the home-PC ComfyUI endpoint `comfy.zhengxiaohui.cn` goes through it) — see
[deploy/home-nas/README.md](deploy/home-nas/README.md) and [docs/COMFY-HOME-PC.md](docs/COMFY-HOME-PC.md).

### One-time: GitHub Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|-------|
| `DO_HOST` | `134.209.221.228` |
| `DO_USER` | `root` |
| `DO_SSH_KEY` | Private key that can SSH into the server |

Add the matching **public key** to the server (`/root/.ssh/authorized_keys`) via Web Console.

Manual re-run: Actions → **Deploy Treasure Box** → **Run workflow**.

---

## First-time server setup

Run in **DigitalOcean Web Console** (no local SSH required).

### Bootstrap

```bash
bash /opt/toolbasecamp-deploy/bootstrap-server.sh
```

### API + MySQL

```bash
mkdir -p /opt/toolbasecamp-api /opt/toolbasecamp-deploy /var/www/toolbasecamp
bash /opt/toolbasecamp-deploy/install-api.sh
bash /opt/toolbasecamp-deploy/install-mysql.sh
nano /etc/toolbasecamp-api.env
systemctl restart toolbasecamp-api
```

### Environment (`/etc/toolbasecamp-api.env`)

| Variable | Description |
|----------|-------------|
| `DB_*` | MySQL connection |
| `JWT_SECRET` | Change in production |
| `ADMIN_EMAIL` | Guestbook admin |
| `DASHSCOPE_API_KEY` | **One key** for Qwen VL, instruct-edit, text-to-image, Wan I2V, **Fun Music**（百炼华北2 北京） |
| `DASHSCOPE_BASE_URL` | Compatible-mode root. Default: `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `IMAGE_EDIT_DASHSCOPE_API_URL` | HTTP API root for **图生图 + 图生视频** (e.g. `https://dashscope.aliyuncs.com/api/v1`) |
| `WAN_I2V_MODEL` | Default: `wan2.7-i2v-2026-04-25` |
| `FUN_MUSIC_WORKSPACE_ID` | Optional 百炼业务空间 ID（推荐 MaaS 域名）；也可用 `FUN_MUSIC_API_URL` |
| `FUN_MUSIC_MODEL` | Default `fun-music-v1`（刊例约 ¥0.002/秒） |
| `AI_PRICE_MARKUP` | Wallet markup on vendor list (default `2`); Wan i2v ¥0.6/s 720P · ¥1/s 1080P；Fun Music × 时长 |
| `QWEN_VL_MODEL` | Default `qwen3-vl-plus` (vision) |
| `DEEPSEEK_API_KEY` | [DeepSeek](https://platform.deepseek.com) API key — **recipe text generation** |
| `DEEPSEEK_MODEL` | Default `deepseek-chat` |
| `DEEPSEEK_BASE_URL` | Default `https://api.deepseek.com` |

Nginx config reference: `deploy/nginx-toolbasecamp.conf`

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/pdf-to-word` | PDF → DOCX |
| POST | `/api/word-to-pdf` | DOC/DOCX → PDF |
| POST | `/api/auth/register` | Email sign-up |
| POST | `/api/auth/login` | Email login |
| GET/POST | `/api/guestbook/messages` | Guestbook |
| GET | `/api/downloads` | Software download hub (public list) |
| GET | `/api/downloads/{id}/file` | Download file (counts a hit; external items 302) |
| * | `/api/downloads/admin/*` | Downloads admin: list / create / edit / delete / chunked upload — see [docs/DOWNLOADS.md](docs/DOWNLOADS.md) |
| POST | `/api/recipe/detect` | Identify ingredients from text and/or photos (Qwen VL) |
| POST | `/api/recipe/generate` | Generate recipe from selected ingredients (DeepSeek) |

### AI Recipe (Qwen + DeepSeek)

- **识图 / detect**: Qwen VL（`DASHSCOPE_API_KEY`，北京 `dashscope.aliyuncs.com`）
- **生成菜谱 / generate**: DeepSeek (`DEEPSEEK_API_KEY`)

**1. DeepSeek（文字生成）**

Register at [platform.deepseek.com](https://platform.deepseek.com) → API Keys → top up balance.

**2. 千问 / 万相（识图、图生图、图生视频）**

[阿里云百炼](https://bailian.console.aliyun.com/) → API Key → **华北2（北京）**。

**3. Server env** (`/etc/toolbasecamp-api.env`):

```bash
# DeepSeek — recipe text generation
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_MODEL=deepseek-chat

# DashScope Beijing — vision / image / video
DASHSCOPE_API_KEY=sk-xxxxxxxx
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
IMAGE_EDIT_DASHSCOPE_API_URL=https://dashscope.aliyuncs.com/api/v1
QWEN_VL_MODEL=qwen3-vl-plus
```

Then:

```bash
systemctl restart toolbasecamp-api
curl -s http://127.0.0.1:8001/health
```

Expect `"text_provider": "deepseek"` and `"vision_provider": "qwen"`.

Example file: `deploy/toolbasecamp-api.env.example`

---

## Verify

- https://zhengxiaohui.cn
- https://zhengxiaohui.cn/html/life/ai-recipe.html
- https://zhengxiaohui.cn/
- https://news.zhengxiaohui.cn
- `curl https://zhengxiaohui.cn/api/health`
