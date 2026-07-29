# Admin-only tools (not listed in public tools hub).

Register in `public/js/config.js` → `privateToolsConfig`.

## Stock picks

- Page: `stock-picks.html` — 月K启动 / 尾盘低吸
- API (admin JWT required):
  - `GET /api/stocks/recommend-monthly-recovery`
  - `GET /api/stocks/recommend-tail-buy`

Server module: `server/stocks.py` (needs `requests`, `pandas` on the API host).

## Android

Under `android/`:

- strings.xml 翻译、文件批量重命名（百度翻译，仅自用页加载密钥脚本）
- MVP / Adapter / 下拉刷新分页代码生成（项目模板）

Public developer hub already has JSON→Java; layout XML→findView is public under `html/dev/layout-converter.html`.
