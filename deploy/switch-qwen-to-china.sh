#!/bin/bash
# Ensure DashScope env points at Beijing (华北2). Defaults in code are already CN;
# use this to fix a leftover US URL in /etc/toolbasecamp-api.env.
# Run on server: bash /opt/toolbasecamp-deploy/switch-qwen-to-china.sh
#
# Does NOT rewrite DASHSCOPE_API_KEY — use a 百炼华北2（北京） key.
set -euo pipefail

ENV_FILE=/etc/toolbasecamp-api.env

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

echo "=== Before ==="
grep -E '^(DASHSCOPE_|QWEN_|WAN_|IMAGE_EDIT_)' "$ENV_FILE" || true

backup="${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "$backup"
echo "Backup: $backup"

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
set_kv IMAGE_EDIT_DASHSCOPE_API_URL "https://dashscope.aliyuncs.com/api/v1"
set_kv WAN_IMAGE_EDIT_MODEL "wan2.6-image"
# Drop obsolete qwen-image default if present
if grep -q "^QWEN_IMAGE_EDIT_MODEL=" "$ENV_FILE"; then
  sed -i '/^QWEN_IMAGE_EDIT_MODEL=/d' "$ENV_FILE"
  echo "Removed obsolete QWEN_IMAGE_EDIT_MODEL (edit uses WAN_IMAGE_EDIT_MODEL)."
fi
set_kv WAN_I2V_MODEL "wan2.7-i2v-2026-04-25"
if grep -q "^WAN_DASHSCOPE_API_URL=" "$ENV_FILE"; then
  sed -i '/^WAN_DASHSCOPE_API_URL=/d' "$ENV_FILE"
  echo "Removed obsolete WAN_DASHSCOPE_API_URL (video now uses IMAGE_EDIT_DASHSCOPE_API_URL)."
fi

echo ""
echo "=== After ==="
grep -E '^(DASHSCOPE_|QWEN_|WAN_|IMAGE_EDIT_)' "$ENV_FILE" || true

echo ""
echo "IMPORTANT:"
echo "  1. DASHSCOPE_API_KEY is shared (识图 / 图生图 / 图生视频). Use 百炼华北2（北京） key."
echo "  2. Wan i2v: wan2.7-i2v-2026-04-25 via IMAGE_EDIT_DASHSCOPE_API_URL."
echo ""
systemctl restart toolbasecamp-api
sleep 2
echo "=== Health ==="
curl -s http://127.0.0.1:8001/health
echo ""
echo "Done. Expect recipe.dashscope_region=cn and wan model wan2.7-i2v-*"
