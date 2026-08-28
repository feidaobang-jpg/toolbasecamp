#!/usr/bin/env python3
"""Generate admin home-pc HTML pages from composite web-tool sources."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMP = Path(r"D:/project/composite/web-tool/html/media")
OUT = ROOT / "public/html/admin/private/home-pc"

PAGES = [
    ("image-processor.html", "remove-background.html", "privateHub.homePc.removeBgTitle", "remove-background.js", "去背景 / 批量处理"),
    ("text-to-image.html", "text-to-image.html", "privateHub.homePc.txt2imgTitle", "text-to-image.js", "文生图"),
    ("image-to-image.html", "image-to-image.html", "privateHub.homePc.img2imgTitle", "image-to-image.js", "图生图"),
    ("describe-cutout.html", "describe-cutout.html", "privateHub.homePc.describeCutoutTitle", "describe-cutout.js", "描述抠图"),
    # photo-restore 已并入图生图；text-to-images 已并入文字成片（输出「生成图片」）；旧 URL 见对应 redirect HTML
    ("text-to-video.html", "text-to-video.html", "privateHub.homePc.textToVideoTitle", "text-to-video.js", "文字成片"),
]

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>{title_fallback} - 后台</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <script src="../../../../vendor/tailwindcss.js?v=homepc1"></script>
  <link href="../../../../vendor/font-awesome/css/all.min.css?v=homepc1" rel="stylesheet" />
  <link rel="stylesheet" href="../../../../css/base.css?v=homepc1" />
  <link rel="stylesheet" href="../../../../css/admin/home-pc.css?v=homepc1" />
  <script src="../../../../js/locales/en.js?v=homepc1"></script>
  <script src="../../../../js/locales/zh-CN.js?v=homepc1"></script>
  <script src="../../../../js/i18n.js?v=homepc1"></script>
  <script src="../../../../js/config.js?v=homepc1"></script>
  <script src="../../../../js/common_ui.js?v=homepc1"></script>
</head>
<body class="bg-gray-50 text-gray-800 min-h-screen flex flex-col font-sans">
  <header class="bg-white border-b border-gray-100 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3 md:gap-8 min-w-0">
      <a href="../../private.html" class="flex items-center gap-2 flex-shrink-0 text-sm text-gray-600 hover:text-blue-600">
        <i class="fas fa-arrow-left"></i> <span data-i18n="privateHub.title">后台</span>
      </a>
      <h1 class="text-base sm:text-lg font-bold text-gray-900 truncate" data-i18n="{title_key}">{title_fallback}</h1>
      <div class="ml-auto flex items-center gap-3 text-sm">
        <span id="auth-label" class="text-gray-500"></span>
        <a id="login-link" href="../../../auth/login.html" class="text-blue-600 hover:underline hidden" data-i18n="auth.login">登录</a>
      </div>
    </div>
  </header>
  <main class="flex-1 px-4 sm:px-6 lg:px-8 py-6 w-full max-w-5xl mx-auto">
    <div id="boot-loading" class="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500" data-i18n="privateHub.homePc.loading">加载中…</div>
    <div id="gate" class="bg-white rounded-2xl border border-gray-100 p-8 text-center hidden">
      <p id="gate-msg" class="text-gray-600 mb-4" data-i18n="privateHub.needAdmin">需要管理员登录后查看</p>
      <a id="gate-login" href="../../../auth/login.html" class="tb-btn inline-flex" data-i18n="auth.login">去登录</a>
    </div>
    <div id="app" class="home-pc-wrap hidden">
      <p class="home-pc-desc" data-i18n="privateHub.homePc.apiHint">连接家里电脑的 ComfyUI API（comfy.zhengxiaohui.cn）。GPU 电脑上启动 ComfyUI 与 comfyui-api-server；Tunnel 在 NAS 时请指向该电脑的局域网 IP。</p>
      <div id="api-status" class="home-pc-status home-pc-status--checking" role="status"></div>
      {body}
    </div>
  </main>
  <script src="../../../../js/admin/private-page-guard.js?v=homepc1"></script>
  <script src="../../../../js/admin/home-pc/home-pc-api.js?v=homepc1"></script>
  <script src="../../../../js/admin/home-pc/home-pc-boot.js?v=homepc1"></script>
  <script src="../../../../js/admin/home-pc/{js_file}?v=homepc1"></script>
</body>
</html>
"""


def extract_body(src_name: str) -> str:
    text = (COMP / src_name).read_text(encoding="utf-8")
    m = re.search(r'<div class="tool-container">(.*)</div>\s*</div>\s*</main>', text, re.S)
    if not m:
        m = re.search(r'<div class="page active">(.*)</div>\s*</main>', text, re.S)
    inner = m.group(1) if m else ""
    inner = re.sub(r"^\s*<h2>.*?</h2>\s*", "", inner, count=1, flags=re.S)
    inner = re.sub(r'^\s*<p class="tool-desc">.*?</p>\s*', "", inner, count=1, flags=re.S)
    inner = re.sub(r'^\s*<p class="text-sm[^"]*"[^>]*>.*?</p>\s*', "", inner, count=1, flags=re.S)
    if not inner.strip().startswith('<div class="tool-container"'):
        inner = f'<div class="tool-container">{inner}</div>'
    return inner.strip()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for src, dst, key, js, title in PAGES:
        body = extract_body(src)
        html = TEMPLATE.format(title_key=key, title_fallback=title, body=body, js_file=js)
        out = OUT / dst
        out.write_text(html, encoding="utf-8")
        raw = out.read_bytes()
        if b"</title>" not in raw:
            raise SystemExit(f"broken title in {dst}")
        raw.decode("utf-8")
        print("wrote", dst)


if __name__ == "__main__":
    main()
