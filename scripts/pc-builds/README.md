# 装机推荐（2026）

ZOL 网友方案统计 → DeepSeek 生成主流推荐 → `public/data/pc_builds.json` → 主站页面渲染。

## 本地更新（推荐爬取）

云服务器 IP 易被 ZOL 拦截，**爬取请在本地**：

```bash
cd scripts/pc-builds
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
export DEEPSEEK_API_KEY=sk-...
python build_pc.py --crawl --clean
```

生成的 JSON 默认写到仓库 `public/data/pc_builds.json`，提交推送即可上线。

仅刷新点评：

```bash
python build_pc.py --generate
```

## 服务器

脚本目录：`/opt/toolbasecamp-pcbuilds`  
数据文件：`/var/www/toolbasecamp/data/pc_builds.json`

```bash
sudo /opt/toolbasecamp-pcbuilds/run_pc.sh --generate
# 或后台更新页「更新装机」按钮（全量爬取在云上可能失败）
```

环境变量：`DEEPSEEK_API_KEY`（可用 `/etc/toolbasecamp-api.env`）、`PC_BUILDS_ZOL_YEAR`（默认 2026）。
