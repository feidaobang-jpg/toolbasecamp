# web-tool-global (Tool Basecamp)

Global site: **https://toolbasecamp.com**

## Structure

```
web-tool-global/
├── public/                 # Static site → /var/www/toolbasecamp
├── server/                 # FastAPI → /opt/toolbasecamp-api
└── deploy/                 # nginx, systemd, webhook scripts
```

## Deploy

Push to Gitee `master` → webhook → server `git pull` + deploy.

```powershell
git add .
git commit -m "feat: ..."
git push origin master
```

Rollback: `git checkout <commit>` then push again (or run `webhook-deploy.sh` on server).

Server deploy log:

```bash
tail -f /var/log/toolbasecamp-deploy.log
```

---

## First-time setup

All server steps run in **DigitalOcean Web Console** (no local SSH required).

### Step 1 — Bootstrap server

Upload `deploy/` to the server once via Web Console file paste, or clone the repo after Step 2.

If starting from a bare droplet, run in Web Console:

```bash
bash /opt/toolbasecamp-deploy/bootstrap-server.sh
```

### Step 2 — Configure Gitee webhook deploy

```bash
bash /opt/toolbasecamp-deploy/setup-gitee-webhook.sh
```

The script will:

1. Generate deploy key `/root/.ssh/gitee_deploy`
2. Print the **public key** — add in Gitee: **仓库 → 管理 → 部署公钥**
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

### Step 4 — API + MySQL (if not done by setup)

```bash
bash /opt/toolbasecamp-deploy/install-api.sh
bash /opt/toolbasecamp-deploy/install-mysql.sh
nano /etc/toolbasecamp-api.env
systemctl restart toolbasecamp-api
```

### Manual redeploy on server

```bash
bash /opt/toolbasecamp-deploy/webhook-deploy.sh
```

---

## Environment (`/etc/toolbasecamp-api.env`)

| Variable | Description |
|----------|-------------|
| `DB_*` | MySQL connection |
| `JWT_SECRET` | Change in production |
| `ADMIN_EMAIL` | Guestbook admin |
| `GITEE_WEBHOOK_SECRET` | Webhook password (from setup script) |
| `GITEE_REPO_PATH` | Default `/opt/composite` |
| `GITEE_DEPLOY_BRANCH` | Default `master` |
| `DEPLOY_SCRIPT` | Default `/opt/toolbasecamp-deploy/webhook-deploy.sh` |

Nginx config reference: `deploy/nginx-toolbasecamp.conf`

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
