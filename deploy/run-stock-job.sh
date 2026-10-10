#!/usr/bin/env bash
# Trusted server entry point; no credentials leave the server.
set -euo pipefail
set -a
source /etc/toolbasecamp-api.env
set +a
cd /opt/toolbasecamp-api
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
exec /opt/toolbasecamp-api/venv/bin/python -B stocks_job.py "$@"
