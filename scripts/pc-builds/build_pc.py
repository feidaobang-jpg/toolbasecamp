#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tool Basecamp 装机推荐：ZOL → DeepSeek → MySQL（pc_builds）

年份按本机当前年动态取；不写 AI 长点评。
建议本地爬取：python build_pc.py --crawl --clean
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional

import pymysql
import requests
from bs4 import BeautifulSoup

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORK_DIR = os.path.join(SCRIPT_DIR, "data")
ZOL_RAW_FILE = os.path.join(WORK_DIR, "zol_raw_builds.json")
AI_TREND_FILE = os.path.join(WORK_DIR, "ai_trending_builds.json")

DEEPSEEK_API_KEY = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
DEEPSEEK_API_URL = os.environ.get(
    "DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions"
).strip()
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()

ZOL_YEAR = int(os.environ.get("PC_BUILDS_ZOL_YEAR") or datetime.now().year)
MAX_ZOL_PAGES = int(os.environ.get("PC_BUILDS_ZOL_PAGES", "3"))
# 每档目标套数（低/中/高）
BUILDS_PER_TIER = int(os.environ.get("PC_BUILDS_PER_TIER", "5"))


def format_price(price_str: Any) -> str:
    if not price_str:
        return "¥0"
    match = re.search(r"\d+", str(price_str))
    if match:
        return f"¥{match.group()}"
    return str(price_str)


def parse_price(val: Any) -> int:
    m = re.search(r"\d+", str(val or ""))
    return int(m.group()) if m else 0


def host_price_of(parts: List[Dict[str, Any]]) -> int:
    total = 0
    for part in parts or []:
        name = str(part.get("name") or "")
        if any(k in name for k in ("显示器", "键鼠", "外设", "耳机", "音响")):
            continue
        total += parse_price(part.get("price"))
    return total


def infer_tier(host_price: int, tags: Optional[List[str]] = None) -> str:
    tags = tags or []
    joined = " ".join(tags)
    if host_price < 4500:
        return "entry"
    if host_price < 9000:
        return "mid"
    if any(k in joined for k in ("入门", "低配")) and host_price < 5500:
        return "entry"
    return "high"


def db_connect():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "toolbasecamp"),
        password=os.environ.get("DB_PASSWORD", "toolbasecamp"),
        database=os.environ.get("DB_NAME", "toolbasecamp"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def ensure_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS pc_builds (
            id VARCHAR(64) PRIMARY KEY,
            title VARCHAR(512) NOT NULL,
            summary TEXT NULL,
            price_range VARCHAR(128) NULL,
            tier VARCHAR(16) NOT NULL,
            tags_json JSON NULL,
            parts_json JSON NOT NULL,
            recommended_monitor_json JSON NULL,
            host_price INT NOT NULL DEFAULT 0,
            sort_price INT NOT NULL DEFAULT 0,
            year SMALLINT NOT NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'seed',
            created_at DOUBLE NOT NULL,
            updated_at DOUBLE NOT NULL,
            KEY idx_pc_tier_sort (tier, sort_price),
            KEY idx_pc_year (year)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def upsert_build(cur, item: Dict[str, Any], source: str = "ai") -> None:
    parts = item.get("parts") or []
    tags = list(item.get("tags") or [])
    host = int(item.get("host_price") or host_price_of(parts))
    tier = str(item.get("tier") or infer_tier(host, tags))
    if tier not in ("entry", "mid", "high"):
        tier = infer_tier(host, tags)
    tier_label = {"entry": "低配", "mid": "中配", "high": "高配"}[tier]
    if tier_label not in tags:
        tags.insert(0, tier_label)
    now = time.time()
    year = int(item.get("year") or ZOL_YEAR)
    bid = str(item.get("id") or "").strip()
    if not bid:
        return
    cur.execute(
        """
        INSERT INTO pc_builds (
            id, title, summary, price_range, tier, tags_json, parts_json,
            recommended_monitor_json, host_price, sort_price, year, source,
            created_at, updated_at
        ) VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
        )
        ON DUPLICATE KEY UPDATE
            title=VALUES(title),
            summary=VALUES(summary),
            price_range=VALUES(price_range),
            tier=VALUES(tier),
            tags_json=VALUES(tags_json),
            parts_json=VALUES(parts_json),
            recommended_monitor_json=VALUES(recommended_monitor_json),
            host_price=VALUES(host_price),
            sort_price=VALUES(sort_price),
            year=VALUES(year),
            source=VALUES(source),
            updated_at=VALUES(updated_at)
        """,
        (
            bid,
            item.get("title") or bid,
            item.get("summary") or "",
            item.get("price_range") or "",
            tier,
            json.dumps(tags, ensure_ascii=False),
            json.dumps(parts, ensure_ascii=False),
            json.dumps(item.get("recommended_monitor") or {}, ensure_ascii=False),
            host,
            host,
            year,
            source,
            now,
            now,
        ),
    )


def prune_ai_per_tier(cur, keep: int = BUILDS_PER_TIER) -> None:
    for tier in ("entry", "mid", "high"):
        cur.execute(
            """
            SELECT id FROM pc_builds
            WHERE tier=%s AND source='ai'
            ORDER BY updated_at DESC
            """,
            (tier,),
        )
        rows = cur.fetchall() or []
        for extra in rows[keep:]:
            cur.execute("DELETE FROM pc_builds WHERE id=%s", (extra["id"],))


def crawl_zol_data() -> None:
    print(f">>> [爬虫] 抓取 ZOL {ZOL_YEAR} 网友装机方案…")
    builds: List[Dict[str, Any]] = []
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://zj.zol.com.cn/",
    }
    for page in range(1, MAX_ZOL_PAGES + 1):
        url = f"https://zj.zol.com.cn/list_t{ZOL_YEAR}_l1_2_{page}.html"
        print(f"    第 {page} 页: {url}")
        try:
            resp = requests.get(url, headers=headers, timeout=15)
            if resp.status_code != 200:
                print(f"    - 请求失败: {resp.status_code}")
                continue
            resp.encoding = "gbk"
            soup = BeautifulSoup(resp.text, "html.parser")
            main_ul = soup.find("ul", class_="show-list") or soup.find("ul", class_="list")
            if not main_ul:
                print("    - 未找到列表容器")
                continue
            items = main_ul.find_all("li", recursive=False)
            print(f"    - {len(items)} 个配置单")
            for item in items:
                try:
                    title_tag = item.find("p", class_="tit")
                    if not title_tag:
                        continue
                    title_a = title_tag.find("a")
                    if not title_a:
                        continue
                    title = title_a.get_text().strip()
                    detail_url = "https://zj.zol.com.cn" + title_a["href"]
                    author, date = "Unknown", ""
                    total_box = item.find("p", class_="total-box")
                    if total_box:
                        user_span = total_box.find("span", class_="user")
                        if user_span and user_span.find("a"):
                            author = user_span.find("a").get_text().strip()
                        date_span = total_box.find("span", class_="date")
                        if date_span:
                            date = date_span.get_text().strip()
                    price = 0
                    for p_tag in item.find_all(class_="price"):
                        p_text = p_tag.get_text().strip()
                        if "¥" in p_text or re.search(r"\d+", p_text):
                            match = re.search(r"(\d+)", p_text.replace(",", ""))
                            if match:
                                price = int(match.group(1))
                                break
                    parts = []
                    for link in item.find_all("a", href=True):
                        href = link["href"]
                        text = link.get_text().strip()
                        if "detail.zol.com.cn" in href and text != title and len(text) > 2:
                            if not any(p["name"] == text for p in parts):
                                parts.append({"name": text, "url": href})
                    if not parts:
                        continue
                    builds.append(
                        {
                            "title": title,
                            "url": detail_url,
                            "author": author,
                            "date": date,
                            "total_price": price,
                            "parts": parts,
                        }
                    )
                except Exception:
                    continue
            time.sleep(1)
        except Exception as e:
            print(f"    - 抓取出错: {e}")
    os.makedirs(WORK_DIR, exist_ok=True)
    with open(ZOL_RAW_FILE, "w", encoding="utf-8") as f:
        json.dump(builds, f, ensure_ascii=False, indent=2)
    print(f"    完成 {len(builds)} 条 → {ZOL_RAW_FILE}")


def _deepseek_json(prompt: str, system: str, timeout: int = 180) -> str:
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("缺少 DEEPSEEK_API_KEY")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
    }
    data = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
    }
    resp = requests.post(DEEPSEEK_API_URL, headers=headers, json=data, timeout=timeout)
    if resp.status_code != 200:
        raise RuntimeError(f"API {resp.status_code}: {resp.text[:200]}")
    content = resp.json()["choices"][0]["message"]["content"]
    return content.replace("```json", "").replace("```", "").strip()


def analyze_trends_and_generate() -> None:
    n = BUILDS_PER_TIER
    print(f">>> [分析] DeepSeek 生成 {ZOL_YEAR} 年低/中/高配各 {n} 套（无长点评）…")
    if not os.path.exists(ZOL_RAW_FILE):
        print(f"    缺少原始数据: {ZOL_RAW_FILE}")
        return
    with open(ZOL_RAW_FILE, "r", encoding="utf-8") as f:
        builds = json.load(f)
    if not builds:
        print("    数据为空")
        return

    parts_pool: List[str] = []
    monitors_pool: List[str] = []
    for build in builds:
        for part in build.get("parts", []):
            name = part["name"].strip()
            if len(name) > 50:
                name = name[:50]
            parts_pool.append(name)
            if "显示器" in name:
                monitors_pool.append(name)
    top_parts_str = "\n".join(
        [f"- {n} (出现 {c} 次)" for n, c in Counter(parts_pool).most_common(50)]
    )
    top_monitors_str = "\n".join(
        [f"- {n} (出现 {c} 次)" for n, c in Counter(monitors_pool).most_common(20)]
    )

    prompt = f"""
你是电脑硬件分析师。以下是 {ZOL_YEAR} 年 ZOL 网友配置热门配件统计。

【热门通用配件】
{top_parts_str}

【热门显示器】
{top_monitors_str}

请输出 JSON 数组，共 {n * 3} 套方案：
- 低配 entry：约 2500–4500 元，{n} 套，偏办公/网游
- 中配 mid：约 5000–8500 元，{n} 套，偏 1080P/2K 游戏
- 高配 high：约 10000–18000 元，{n} 套，偏高画质/轻生产力

要求：
1. 参考热门配件，过时型号换成同价位更优新品。
2. 每套字段：id, title, summary(40字内), price_range, tier(entry|mid|high), tags, parts([name,model,price]), recommended_monitor({{model,price}})
3. 不要写长点评 / review 字段。
4. 直接输出 JSON 数组。
"""
    try:
        content = _deepseek_json(prompt, "你是一个只输出标准 JSON 的硬件助手。")
        recommendations = json.loads(content)
        if not isinstance(recommendations, list):
            raise ValueError("期望 JSON 数组")
        os.makedirs(WORK_DIR, exist_ok=True)
        with open(AI_TREND_FILE, "w", encoding="utf-8") as f:
            json.dump(recommendations, f, ensure_ascii=False, indent=2)
        print(f"    已写入 {len(recommendations)} 套 → {AI_TREND_FILE}")
    except Exception as e:
        print(f"    分析失败: {e}")


def merge_into_db() -> None:
    print(">>> [入库] 写入 MySQL pc_builds…")
    if not os.path.exists(AI_TREND_FILE):
        print(f"    缺少 {AI_TREND_FILE}")
        return
    with open(AI_TREND_FILE, "r", encoding="utf-8") as f:
        ai_builds = json.load(f)
    conn = db_connect()
    try:
        with conn.cursor() as cur:
            ensure_table(cur)
            for build in ai_builds:
                build.setdefault("tags", [])
                if "AI热推" not in build["tags"]:
                    build["tags"].insert(0, "AI热推")
                for part in build.get("parts", []):
                    if "price" in part:
                        part["price"] = format_price(part["price"])
                if not str(build.get("id", "")).startswith("ai-"):
                    build["id"] = f"ai-{build['id']}"
                build["year"] = ZOL_YEAR
                build["host_price"] = host_price_of(build.get("parts") or [])
                if not build.get("tier"):
                    build["tier"] = infer_tier(build["host_price"], build.get("tags"))
                upsert_build(cur, build, source="ai")
            prune_ai_per_tier(cur, BUILDS_PER_TIER)
            cur.execute("SELECT COUNT(*) AS c FROM pc_builds")
            print(f"    入库完成，当前共 {(cur.fetchone() or {}).get('c')} 套")
    finally:
        conn.close()


def clean_temp_data() -> None:
    for fpath in (ZOL_RAW_FILE, AI_TREND_FILE):
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
                print(f"    - 已删除 {fpath}")
            except OSError:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description=f"Tool Basecamp {ZOL_YEAR} 装机推荐 → MySQL")
    parser.add_argument("--crawl", action="store_true", help="爬 ZOL → AI → 入库")
    parser.add_argument("--analyze", action="store_true", help="跳过爬取：AI → 入库")
    parser.add_argument("--generate", action="store_true", help="仅确保表存在（兼容旧按钮）")
    parser.add_argument("--clean", action="store_true", help="清理临时文件")
    args = parser.parse_args()

    print(f"年份={ZOL_YEAR}，每档目标={BUILDS_PER_TIER} 套")

    if args.crawl:
        crawl_zol_data()
        analyze_trends_and_generate()
        merge_into_db()
        if args.clean:
            clean_temp_data()
    elif args.analyze:
        analyze_trends_and_generate()
        merge_into_db()
        if args.clean:
            clean_temp_data()
    elif args.generate:
        conn = db_connect()
        try:
            with conn.cursor() as cur:
                ensure_table(cur)
                cur.execute("SELECT COUNT(*) AS c FROM pc_builds")
                print(f"表就绪，当前 {(cur.fetchone() or {}).get('c')} 套")
        finally:
            conn.close()
    else:
        parser.print_help()

    print("\n>>> 完成")


if __name__ == "__main__":
    main()
