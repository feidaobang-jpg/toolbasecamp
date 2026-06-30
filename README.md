# web-tool-global (Tool Basecamp)

Global site: **https://toolbasecamp.com**

## Structure

```
web-tool-global/
├── public/                 # Static site → /var/www/toolbasecamp
├── server/                 # FastAPI → /opt/toolbasecamp-api
└── deploy/                 # nginx, systemd, webhook scripts
```

## Deploy methods

| Method | Auto? | Cost | Notes |
|--------|-------|------|-------|
| **Gitee Webhook** (recommended) | Yes on `git push` | Free | `deploy/setup-gitee-webhook.sh` |
| **deploy.ps1** | Manual | Free | Windows, one-shot sync |
| Gitee Go | Yes | Paid | Not required |
| GitHub Actions | Yes | Free | Optional if you use GitHub |

---

## Gitee Webhook auto deploy (free)

Push to Gitee `master` → Gitee calls your server → server `git pull` + deploy.

### Step 1 — First upload (one time, from your PC)

Deploy API + scripts once so the webhook endpoint exists:

```powershell
cd d:\project\composite\web-tool-global\deploy
$env:DO_HOST = "134.209.221.228"
$env:DO_USER = "root"
scp -r ..\server\* "${env:DO_USER}@${env:DO_HOST}:/opt/toolbasecamp-api/"
scp -r ..\deploy\* "${env:DO_USER}@${env:DO_HOST}:/opt/toolbasecamp-deploy/"
ssh "${env:DO_USER}@${env:DO_HOST}" "bash /opt/toolbasecamp-deploy/install-api.sh"
```

Or use `.\deploy.ps1` for the static site only, then `scp` server + deploy as above.

### Step 2 — Server setup (one time, SSH / Web Console)

```bash
bash /opt/toolbasecamp-deploy/setup-gitee-webhook.sh
```

The script will:

1. Generate SSH deploy key `/root/.ssh/gitee_deploy`
2. Print the **public key** — add it in Gitee: **仓库 → 管理 → 部署公钥**
3. Clone `git@gitee.com:zhengxiaohui/composite.git` to `/opt/composite`
4. Write `GITEE_WEBHOOK_SECRET` to `/etc/toolbasecamp-api.env`
5. Run the first deploy

**Save the webhook password** printed at the end.

### Step 3 — Gitee WebHook

Gitee repo **composite** → **管理 → WebHooks → 添加**：

| Field | Value |
|-------|-------|
| URL | `https://toolbasecamp.com/api/webhook/gitee` |
| 密码 | `setup-gitee-webhook.sh` 输出的 Password |
| 事件 | 勾选 **Push** |

Password is sent as header `X-Gitee-Token` (handled automatically).

### Step 4 — Daily workflow

```powershell
cd d:\project\composite
git add .
git commit -m "update toolbasecamp"
git push origin master
```

Gitee triggers webhook → deploy runs in background. Check log on server:

```bash
tail -f /var/log/toolbasecamp-deploy.log
```

### Manual deploy (fallback)

```bash
bash /opt/toolbasecamp-deploy/webhook-deploy.sh
```

---

## First-time server setup

### API + LibreOffice

```bash
mkdir -p /opt/toolbasecamp-api /opt/toolbasecamp-deploy /var/www/toolbasecamp
bash /opt/toolbasecamp-deploy/install-api.sh
```

### MySQL (auth + guestbook)

```bash
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
| `GITEE_WEBHOOK_SECRET` | Webhook password (from setup script) |
| `GITEE_REPO_PATH` | Default `/opt/composite` |
| `GITEE_DEPLOY_BRANCH` | Default `master` |
| `DEPLOY_SCRIPT` | Default `/opt/toolbasecamp-deploy/webhook-deploy.sh` |

### Nginx

Use `deploy/nginx-toolbasecamp.conf` (includes `/api/` proxy).

---

## Manual deploy from Windows

```powershell
cd web-tool-global\deploy
$env:DO_HOST = "134.209.221.228"
$env:DO_USER = "root"
.\deploy.ps1
```

Note: `deploy.ps1` syncs **static files only**. For API changes use webhook deploy or `scp` server files.

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/webhook/gitee` | Gitee push → deploy (secret required) |
| POST | `/api/pdf-to-word` | PDF → DOCX |
| POST | `/api/word-to-pdf` | DOC/DOCX → PDF |
| POST | `/api/auth/register` | Email sign-up |
| POST | `/api/auth/login` | Email login |
| GET/POST | `/api/guestbook/messages` | Guestbook |

---

## Verify

- https://toolbasecamp.com
- https://toolbasecamp.com/tool.html
- `curl https://toolbasecamp.com/api/health`
- After push: `tail /var/log/toolbasecamp-deploy.log` on server
