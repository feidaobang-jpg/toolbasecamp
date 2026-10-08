#!/usr/bin/env bash
# 输出本次部署需要处理的路径分组（key=true|false，供 GitHub Actions 的 $GITHUB_OUTPUT 使用）。
# 用法：detect-deploy-changes.sh <比较基准提交> <当前提交>
# 基准一般是服务器记录的上次成功部署提交；为空、全零或不在历史里时全部按已变更处理（宁可多部署）。
set -euo pipefail

BASE="${1:-}"
HEAD="${2:-HEAD}"
KEYS="public server deploy portal_news portal_pcbuilds workflow"

if [[ -z "$BASE" || "$BASE" =~ ^0+$ ]] || ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  echo "No usable diff base '${BASE}'; treat every group as changed." >&2
  for k in $KEYS; do echo "$k=true"; done
  exit 0
fi

FILES="$(git diff --name-only "$BASE" "$HEAD")"
echo "Changed files ${BASE:0:8}..${HEAD:0:8}: $(printf '%s\n' "$FILES" | grep -c . || true)" >&2

# 用 here-string 而非管道：grep -q 提前退出会让 printf 收到 SIGPIPE，在 pipefail 下被误判为未匹配。
has() { if grep -qE "$1" <<<"$FILES"; then echo true; else echo false; fi; }

echo "public=$(has '^public/')"
echo "server=$(has '^server/')"
echo "deploy=$(has '^deploy/')"
echo "portal_news=$(has '^(scripts/news/|deploy/(nginx-toolbasecamp-news\.conf|patch-nginx-news\.sh|news-portal-inject\.snippet|install-news-cron\.sh)$)')"
echo "portal_pcbuilds=$(has '^(scripts/pc-builds/|deploy/(install-pc-builds\.sh|fix-pcbuilds-api\.sh)$)')"
echo "workflow=$(has '^\.github/workflows/deploy\.yml$')"
