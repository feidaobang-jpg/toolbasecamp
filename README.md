# Tool Basecamp

Global site: **https://toolbasecamp.com**

## Structure

```
toolbasecamp/
├── public/                 # Static site → /var/www/toolbasecamp
├── server/                 # FastAPI → /opt/toolbasecamp-api
└── deploy/                 # nginx, systemd, server scripts
```

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

### One-time: GitHub Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|-------|
| `DO_HOST` | `134.209.221.228` |
| `DO_USER` | `root` |
| `DO_SSH_KEY` | Private key that can SSH into the server |

Add the matching **public key** to the server (`/root/.ssh/authorized_keys`) via Web Console.

Manual re-run: Actions → **Deploy Tool Basecamp** → **Run workflow**.

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

---

## Verify

- https://toolbasecamp.com
- https://toolbasecamp.com/tool.html
- `curl https://toolbasecamp.com/api/health`
