# Admin-only tools (not listed in public tools hub).

Register in `public/js/config.js` → `privateToolsConfig`.

Top nav shows a single admin entry「自用」; stats / ladder live as cards inside this hub.

## Site ops

- Page: `../site-stats.html` — PV/UV and feature event ranking
- Page: `ladder-update.html` — manual scrape of 快科技天梯
- API (admin JWT):
  - `GET /api/ladder/status`
  - `POST /api/ladder/refresh`
  - `GET /api/ladder/{id}` (public cache for live pages)

Server module: `server/ladder.py` (needs `requests`, `beautifulsoup4`).

## Stock picks

- Page: `stock-picks.html` — 月K启动 / 尾盘低吸
- API (admin JWT required):
  - `GET /api/stocks/recommend-monthly-recovery`
  - `GET /api/stocks/recommend-tail-buy`

Server module: `server/stocks.py` (needs `requests`, `pandas` on the API host).

Android 工具已全部公开，见首页「Android」分类。
