# Admin-only tools (not listed in public tools hub).

Register in `public/js/config.js` → `privateToolsConfig`.

Top nav shows a single admin entry「后台」; stats / ladder live as cards inside this hub.

## Site ops

- Page: `../site-stats.html` — PV/UV and feature event ranking
- Page: `ladder-update.html` — manual scrape of 快科技天梯
- API (admin JWT):
  - `GET /api/ladder/status`
  - `POST /api/ladder/refresh`
  - `GET /api/ladder/{id}` (public cache for live pages)

Server module: `server/ladder.py` (needs `requests`, `beautifulsoup4`).

## Stock picks

- Page: `stock-picks.html` — 月K启动 / 强势弹性（隔夜）
- API (admin JWT required):
  - `GET /api/stocks/recommend-monthly-recovery`
  - `GET /api/stocks/recommend-tail-buy`（强势弹性；strategy=`strong_momentum`）

Server module: `server/stocks.py` (needs `requests`, `pandas` on the API host).

Android 工具已全部公开，见首页「Android」分类。

## 家里电脑（ComfyUI）

- 文档：`../../docs/COMFY-HOME-PC.md`
- 页面目录：`home-pc/`（后台分组「家里电脑」）
- API：`siteConfig.homePcApiBase` → `https://comfy.zhengxiaohui.cn`
- 服务端：仓库根目录 `comfyui-api-server/`（仅在家里 Windows 运行，不进 VPS API）
