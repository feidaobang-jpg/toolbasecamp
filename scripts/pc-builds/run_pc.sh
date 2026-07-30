#!/usr/bin/env bash
# Tool Basecamp PC builds runner (VPS or local).
set -euo pipefail

PC_HOME="${PC_HOME:-/opt/toolbasecamp-pcbuilds}"
WEB_ROOT="${PC_WEB_ROOT:-/var/www/toolbasecamp}"
VENV="${PC_VENV:-$PC_HOME/.venv}"
ENV_FILE="${PC_ENV_FILE:-/etc/toolbasecamp-api.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export PC_BUILDS_JSON="${PC_BUILDS_JSON:-$WEB_ROOT/data/pc_builds.json}"
mkdir -p "$(dirname "$PC_BUILDS_JSON")" "$PC_HOME/data"

cd "$PC_HOME"
if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -U pip
  "$VENV/bin/pip" install -q -r "$PC_HOME/requirements.txt"
fi

exec "$VENV/bin/python" "$PC_HOME/build_pc.py" "$@"
