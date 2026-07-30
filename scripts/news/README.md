# Tool Basecamp 资讯子站（news.toolbasecamp.com）

## 架构

- 爬虫：`build_news.py`（RSS → DeepSeek → MySQL `news_articles` → 静态 HTML）
- 静态根目录：`/var/www/toolbasecamp-news`
- 脚本部署目录：`/opt/toolbasecamp-news`
- 密钥：复用 `/etc/toolbasecamp-api.env` 的 `DEEPSEEK_API_KEY`（可选覆盖 `/etc/toolbasecamp-news.env`）

## 首次安装（VPS）

```bash
# 1. 代码由 CI rsync 到 /opt/toolbasecamp-news；或手动：
# rsync -avz scripts/news/ root@vps:/opt/toolbasecamp-news/

# 2. Cloudflare DNS：news A → VPS IP，橙色云

# 3. Nginx + 证书
sudo bash /opt/toolbasecamp-deploy/patch-nginx-news.sh

# 4. 依赖 + 占位首页
sudo bash /opt/toolbasecamp-deploy/install-news-cron.sh

# 5. 手动首跑（需 DEEPSEEK_API_KEY）
sudo /opt/toolbasecamp-news/run_news.sh
```

## Linux 定时（不要用宝塔再配一份）

`install-news-cron.sh` 会写入 root crontab：

```cron
30 7 * * * /opt/toolbasecamp-news/run_news.sh
```

日志：`/var/log/toolbasecamp-news.log`

仅从库重生成页面（改模板后）：

```bash
sudo NEWS_HOME=/opt/toolbasecamp-news /opt/toolbasecamp-news/run_news.sh --regen-only
```

## 本地烟雾测试（无 DB / 无 API）

```bash
cd scripts/news
python build_news.py --smoke /tmp/tbc-news-smoke
```

## 清理策略

库内最多保留 100 条（可用环境变量 `NEWS_MAX_TOTAL` 覆盖）；超额时删除旧行及对应 `articles/*.html`、封面图。
