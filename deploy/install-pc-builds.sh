#!/usr/bin/env bash
# Install PC builds crawler under /opt/toolbasecamp-pcbuilds
set -euo pipefail

PC_HOME="${PC_HOME:-/opt/toolbasecamp-pcbuilds}"
WEB_ROOT="${PC_WEB_ROOT:-/var/www/toolbasecamp}"

mkdir -p "$PC_HOME" "$WEB_ROOT/data" /var/log
if [[ ! -f "$PC_HOME/build_pc.py" ]]; then
  echo "ERROR: $PC_HOME/build_pc.py missing — deploy must rsync scripts/pc-builds first."
  exit 1
fi

chmod +x "$PC_HOME/run_pc.sh" 2>/dev/null || true
python3 -m venv "$PC_HOME/.venv"
"$PC_HOME/.venv/bin/pip" install -q -U pip
"$PC_HOME/.venv/bin/pip" install -q -r "$PC_HOME/requirements.txt"

# Seed JSON from web root if crawler data empty and public already has a file
if [[ ! -f "$WEB_ROOT/data/pc_builds.json" && -f "$PC_HOME/data/pc_builds.json" ]]; then
  cp "$PC_HOME/data/pc_builds.json" "$WEB_ROOT/data/pc_builds.json"
fi

ln -sfn "$PC_HOME/run_pc.sh" /usr/local/bin/tbc-pcbuilds
echo "PC builds install OK. Local crawl recommended; server: tbc-pcbuilds --generate"
