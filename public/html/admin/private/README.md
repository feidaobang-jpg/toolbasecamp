# Admin-only tools (not listed in public tools hub).

Register in `public/js/config.js` → `privateToolsConfig`.

## Stock picks

- Page: `stock-picks.html` — 月K启动 / 尾盘低吸
- API (admin JWT required):
  - `GET /api/stocks/recommend-monthly-recovery`
  - `GET /api/stocks/recommend-tail-buy`

Server module: `server/stocks.py` (needs `requests`, `pandas` on the API host).

## Android（需百度翻译的）

Under `android/`:

- strings.xml 翻译
- 文件批量重命名

公开 Android 工具在首页「Android」分类：`html/android/*`、布局转换在 `html/dev/layout-converter.html`。
