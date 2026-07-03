# Tool Basecamp

Global site: **https://toolbasecamp.com**

## Structure

```
toolbasecamp/
├── public/                 # Static site → /var/www/toolbasecamp
├── server/                 # FastAPI → /opt/toolbasecamp-api
└── deploy/                 # nginx, systemd, server scripts
    ├── nginx-toolbasecamp-dev.conf   # dev.toolbasecamp.com
    ├── next-tools.ref                # pinned next-tools version
    └── dev-portal-SOURCE.txt         # GPL source attribution
```

## Developer portal (dev.toolbasecamp.com)

The **Developer Toolkit** is a self-hosted build of [next-tools](https://github.com/willjayyyy/next-tools) (GPL-3.0), deployed to `/var/www/toolbasecamp-dev` on the same server. The main site links to it via the Tools hub — no third-party tool site embeds or redirects.

### DNS (one-time)

In Cloudflare (or your DNS provider), add an **A record**:

| Name | Type | Content | Proxy |
|------|------|---------|-------|
| `dev` | A | `134.209.221.228` (same as main site) | Proxied OK |

Do **not** use a redirect rule, Worker, or CNAME-to-root that forwards `dev` to the main homepage — that makes `dev.toolbasecamp.com` show the same page as toolbasecamp.com. After DNS changes, purge Cloudflare cache for `dev.toolbasecamp.com`.

Nginx for the dev subdomain is enabled automatically on each deploy via `deploy/patch-nginx-dev.sh`.

### Version pin

Edit `deploy/next-tools.ref` to bump the next-tools release tag (e.g. `v1.10.3`), then push — GitHub Actions rebuilds and rsyncs the SPA.

### GPL

Deployed files include `SOURCE.txt` and `LICENSE` in the dev web root. See `deploy/dev-portal-SOURCE.txt`.

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
- https://dev.toolbasecamp.com
- `curl https://toolbasecamp.com/api/health`
