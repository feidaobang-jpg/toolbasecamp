#!/bin/bash
# Switch DashScope (Qwen vision) from US to China region on the VPS.
# Run on server: bash /opt/toolbasecamp-deploy/switch-qwen-to-china.sh
set -euo pipefail

ENV_FILE=/etc/toolbasecamp-api.env

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

echo "=== Before ==="
grep -E '^(DASHSCOPE_|QWEN_)' "$ENV_FILE" || true

backup="${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "$backup"
echo "Backup: $backup"

# Update or append China endpoints (does NOT change API key — you must set a Beijing key manually)
set_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_kv DASHSCOPE_BASE_URL "https://dashscope.aliyuncs.com/compatible-mode/v1"
set_kv QWEN_VL_MODEL "qwen-vl-plus"
set_kv QWEN_MODEL "qwen-plus"

echo ""
echo "=== After ==="
grep -E '^(DASHSCOPE_|QWEN_)' "$ENV_FILE" || true

echo ""
echo "IMPORTANT:"
echo "  1. Replace DASHSCOPE_API_KEY with a key from 百炼 → 华北2（北京） region."
echo "  2. US-region keys usually do NOT work with dashscope.aliyuncs.com."
echo "  3. VPS is in US — China endpoint may add latency on image detect."
echo ""
systemctl restart toolbasecamp-api
sleep 2
echo "=== Health ==="
curl -s http://127.0.0.1:8001/health
echo ""
echo "Done. Expect recipe.dashscope_region=cn"
