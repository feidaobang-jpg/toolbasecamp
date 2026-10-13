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

- 2026-10-13 起暂停：定时器停用、`config.js` 里的入口分组已移除，页面仍可直接打开；恢复见 `docs/stock-etf-dip.md`。
- Page: `stock-picks.html` — 指数ETF急跌低吸（etf-dip-v1，默认）/ 回调企稳（pullback-v1），按策略版本分别模拟记账
- API (admin JWT required)，`version` 省略时取默认策略:
  - `GET /api/stocks/status?version=`、`GET /api/stocks/preview?version=`、`GET /api/stocks/records?version=`
  - `POST /api/stocks/run`（依次运行全部策略）、`GET /api/stocks/review-export`（默认策略在顶层，其余在 `others`）

Server modules: `server/stocks.py`、`server/stock_strategy.py`、`server/stock_market.py`；说明见 `docs/stock-etf-dip.md`、`docs/stock-pullback.md`。

Android 工具已全部公开，见首页「Android」分类。

## 家里电脑（ComfyUI）

2026-10-11：本地视频生成模块已移除。后台仅保留图片、3D、语音、音乐、音效与静帧配音合成；视频权重、文生视频/图生视频、短片、剧集、数字人和游戏动作生成入口不再提供。已有输出与素材保留。

- 文档：`../../docs/COMFY-HOME-PC.md`
- 页面目录：`home-pc/`（后台分组「家里电脑」）
- API：`siteConfig.homePcApiBase` → `https://comfy.zhengxiaohui.cn`
- 服务端：仓库根目录 `comfyui-api-server/`（仅在家里 Windows 运行，不进 VPS API）
- 迁官方 ComfyUI-main：`docs/COMFYUI-MAIN-SETUP.md`
