# Admin-only tools (not listed in public tools hub).

Register in `public/js/config.js` → `privateToolsConfig`.

## Stock picks

- Page: `stock-picks.html` — 月K启动 / 尾盘低吸
- API (admin JWT required):
  - `GET /api/stocks/recommend-monthly-recovery`
  - `GET /api/stocks/recommend-tail-buy`

Server module: `server/stocks.py` (needs `requests`, `pandas` on the API host).

Android 工具已全部公开，见首页「Android」分类。
