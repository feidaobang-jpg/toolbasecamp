#!/bin/bash
# One-shot fix when toolbasecamp.com serves stale HTML/JS (e.g. old ai-recipe UI).
set -euo pipefail

WEB_ROOT=/var/www/toolbasecamp
REPO_DIR="${REPO_DIR:-/opt/toolbasecamp-src}"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "Cloning repo to $REPO_DIR ..."
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone --depth 1 https://github.com/feidaobang-jpg/toolbasecamp.git "$REPO_DIR"
fi

cd "$REPO_DIR"
git fetch origin master
git reset --hard origin/master

VER="$(git rev-parse --short HEAD)"
while IFS= read -r -d '' f; do
  perl -pi -e "s/(href=\"[^\"]*\\.css)(?:\\?[^\"]*)?\"/\$1?v=${VER}\"/g; s/(src=\"[^\"]*\\.js)(?:\\?[^\"]*)?\"/\$1?v=${VER}\"/g" "$f"
done < <(find public -type f -name '*.html' -print0)

rsync -av --delete public/ "$WEB_ROOT/"

echo "=== Verify ai-recipe page ==="
grep -q 'recipe-ingredient-tags' "$WEB_ROOT/html/life/ai-recipe.html"
grep -q 'ai-recipe.js?v=' "$WEB_ROOT/html/life/ai-recipe.html"
echo "OK: static site updated to $VER"
echo "Purge Cloudflare cache for toolbasecamp.com, then hard-refresh."
