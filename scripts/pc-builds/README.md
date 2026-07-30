# 装机推荐

DeepSeek 直接生成当年低/中/高配 → **MySQL `pc_builds`** → 主站 `/api/pcbuilds/list`。

可选：本地 `--crawl` 先爬 ZOL 热门配件再交给 AI 参考（云 IP 易被拦）。

- 年份：默认 `datetime.now().year`（可用 `PC_BUILDS_ZOL_YEAR` 覆盖）
- 数量：每档默认 5 套（共约 15），`PC_BUILDS_PER_TIER` 可调
- **不再生成 AI 长点评**，只保留短说明 `summary`

## 后台 / 服务器（推荐）

点「更新装机」或：

```bash
sudo bash /opt/toolbasecamp-deploy/install-pc-builds.sh
sudo bash /opt/toolbasecamp-deploy/fix-pcbuilds-api.sh   # 若 /api/pcbuilds/* 404
tbc-pcbuilds --ai --clean
```

## 本地可选：带 ZOL 参考

```bash
cd scripts/pc-builds
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# 配置与 API 相同的 DB_* / DEEPSEEK_API_KEY
python build_pc.py --crawl --clean
```
