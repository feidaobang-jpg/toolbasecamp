#!/bin/bash
# One-shot: mount tank-coop on CN Lighthouse for latency A/B test (IP HTTP).
set -euo pipefail

sudo cp /tmp/game_rooms_api.py /opt/toolbasecamp-api/game_rooms_api.py
sudo mkdir -p /var/www/toolbasecamp/html/game
sudo cp /tmp/tank_battle.html /var/www/toolbasecamp/html/game/tank_battle.html
sudo chown lighthouse:ubuntu /opt/toolbasecamp-api/game_rooms_api.py 2>/dev/null || true

sudo python3 <<'PY'
from pathlib import Path
p = Path("/opt/toolbasecamp-api/main.py")
text = p.read_text(encoding="utf-8")
if "game_rooms_api" in text:
    print("main.py: tank-coop already referenced")
else:
    needle = "app.include_router(life_plans_router)\n"
    insert = (
        "app.include_router(life_plans_router)\n"
        "\n"
        "try:\n"
        "    from game_rooms_api import router as tank_coop_router\n"
        "    app.include_router(tank_coop_router)\n"
        "except Exception as _tank_coop_exc:  # noqa: BLE001\n"
        "    print(\"[tank-coop] router not mounted:\", _tank_coop_exc)\n"
        "\n"
    )
    if needle not in text:
        raise SystemExit("life_plans_router needle not found in main.py")
    p.write_text(text.replace(needle, insert, 1), encoding="utf-8")
    print("main.py: mounted tank-coop router")
PY

sudo bash /tmp/patch-nginx-api.sh

sudo tee /etc/nginx/sites-available/tank-coop-cn-test >/dev/null <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 111.229.172.111 _;

    root /var/www/toolbasecamp;
    index index.html;

    include snippets/toolbasecamp-api.conf;

    location = /tank-cn {
        return 302 /html/game/tank_battle.html;
    }

    location / {
        try_files $uri $uri/ =404;
    }

    gzip on;
    gzip_types text/css application/javascript text/html application/json;
}
EOF
sudo ln -sfn /etc/nginx/sites-available/tank-coop-cn-test /etc/nginx/sites-enabled/tank-coop-cn-test

sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart toolbasecamp-api
sleep 2
systemctl is-active toolbasecamp-api
echo -n "health: "
curl -sS -m 3 http://127.0.0.1:8001/health | head -c 120
echo
curl -sS -m 3 -o /dev/null -w "game:%{http_code}\n" http://127.0.0.1/html/game/tank_battle.html
curl -sS -m 3 -o /dev/null -w "ws-path:%{http_code}\n" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://127.0.0.1/api/game/tank-coop/ws

# Confirm router imported
sudo journalctl -u toolbasecamp-api -n 20 --no-pager | grep -E 'tank-coop|Uvicorn|Error|error' || true
echo "OK: open http://111.229.172.111/tank-cn"
