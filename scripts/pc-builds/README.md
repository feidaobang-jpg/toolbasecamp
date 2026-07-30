# 装机推荐

ZOL 网友方案 → DeepSeek 生成低/中/高配 → **MySQL `pc_builds`** → 主站 `/api/pcbuilds/list`。

- 年份：默认 `datetime.now().year`（可用 `PC_BUILDS_ZOL_YEAR` 覆盖）
- 数量：每档默认 5 套（共约 15），`PC_BUILDS_PER_TIER` 可调
- **不再生成 AI 长点评**，只保留短说明 `summary`

## 本地更新（推荐爬取）

```bash
cd scripts/pc-builds
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# 配置与 API 相同的 DB_* / DEEPSEEK_API_KEY
python build_pc.py --crawl --clean
```

## 服务器

```bash
sudo bash /opt/toolbasecamp-deploy/install-pc-builds.sh
sudo bash /opt/toolbasecamp-deploy/fix-pcbuilds-api.sh   # 若 /api/pcbuilds/* 404
tbc-pcbuilds --crawl --clean   # 云 IP 可能被 ZOL 拦
```
