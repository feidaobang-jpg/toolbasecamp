#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tool Basecamp 装机推荐：ZOL 网友方案 → DeepSeek 趋势分析 → public/data/pc_builds.json

建议本地执行爬取（云 IP 易被 ZOL 拦截）：
  python build_pc.py --crawl --clean

服务器可只刷新点评/合并：
  python build_pc.py --generate
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
from collections import Counter
from typing import Any, Dict, List

import requests
from bs4 import BeautifulSoup

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
WORK_DIR = os.path.join(SCRIPT_DIR, "data")

PC_BUILD_DATA_FILE = os.environ.get(
    "PC_BUILDS_JSON",
    os.path.join(REPO_ROOT, "public", "data", "pc_builds.json"),
)
ZOL_RAW_FILE = os.path.join(WORK_DIR, "zol_raw_builds.json")
AI_TREND_FILE = os.path.join(WORK_DIR, "ai_trending_builds.json")

DEEPSEEK_API_KEY = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
DEEPSEEK_API_URL = os.environ.get(
    "DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions"
).strip()
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()

ZOL_YEAR = int(os.environ.get("PC_BUILDS_ZOL_YEAR", "2026"))
MAX_ZOL_PAGES = int(os.environ.get("PC_BUILDS_ZOL_PAGES", "3"))
TEST_MODE = os.environ.get("PC_BUILDS_TEST", "").strip() in ("1", "true", "yes")


def format_price(price_str: Any) -> str:
    if not price_str:
        return "¥0"
    match = re.search(r"\d+", str(price_str))
    if match:
        return f"¥{match.group()}"
    return str(price_str)


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

                    author = "Unknown"
                    date = ""
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
                    if price == 0 and total_box:
                        price_match = re.search(r"¥\s*(\d+)", total_box.get_text())
                        if price_match:
                            price = int(price_match.group(1))

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


def _deepseek_json(prompt: str, system: str, timeout: int = 120) -> Any:
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
    content = content.replace("```json", "").replace("```html", "").replace("```", "").strip()
    return content


def analyze_trends_and_generate() -> None:
    print(">>> [分析] DeepSeek 生成 2026 推荐配置…")
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
你是一位专业的电脑硬件分析师。以下是 {ZOL_YEAR} 年国内主流装机站（ZOL）网友配置里的热门配件统计。

【热门通用配件】
{top_parts_str}

【热门显示器】
{top_monitors_str}

请结合 {ZOL_YEAR} 年行情，构思 3 套当前最主流的装机推荐方案。

要求：
1. 基于数据但高于数据：热门款若已过时，替换为同价位更优新品。
2. 方案定位：
   - 方案A：入门性价比（约3000-4500元），网游/办公。
   - 方案B：主流甜点（约5500-8000元），2K 游戏。
   - 方案C：高端进阶（约10000-16000元），高画质/轻生产力。
3. 为每套额外推荐一款具体显示器型号（不要塞进 parts）。
4. 严格输出 JSON 数组，字段：
   - id, title, summary, price_range, tags
   - parts: [{{"name","model","price"}}]
   - recommended_monitor: {{"model","price"}}
   - review: HTML 点评（约 300 字，用 p/ul/li/strong）
直接输出 JSON，不要 markdown。
"""
    try:
        content = _deepseek_json(prompt, "你是一个只输出标准 JSON 的硬件助手。")
        recommendations = json.loads(content)
        os.makedirs(WORK_DIR, exist_ok=True)
        with open(AI_TREND_FILE, "w", encoding="utf-8") as f:
            json.dump(recommendations, f, ensure_ascii=False, indent=2)
        print(f"    已写入 {AI_TREND_FILE}")
    except Exception as e:
        print(f"    分析失败: {e}")


def merge_ai_recommendations() -> None:
    print(">>> [合并] 合并 AI 推荐到主数据…")
    if not os.path.exists(AI_TREND_FILE):
        print(f"    缺少 {AI_TREND_FILE}")
        return

    main_builds: List[Dict[str, Any]] = []
    if os.path.exists(PC_BUILD_DATA_FILE):
        with open(PC_BUILD_DATA_FILE, "r", encoding="utf-8") as f:
            main_builds = json.load(f)

    with open(AI_TREND_FILE, "r", encoding="utf-8") as f:
        ai_builds = json.load(f)

    original = [b for b in main_builds if "AI热推" not in b.get("tags", [])]
    processed = []
    for build in ai_builds:
        build.setdefault("tags", [])
        if "AI热推" not in build["tags"]:
            build["tags"].insert(0, "AI热推")
        if "ZOL趋势" not in build["tags"]:
            build["tags"].append("ZOL趋势")
        for part in build.get("parts", []):
            if "price" in part:
                part["price"] = format_price(part["price"])
        if not str(build.get("id", "")).startswith("ai-"):
            build["id"] = f"ai-{build['id']}"
        processed.append(build)

    final_builds = processed + original
    os.makedirs(os.path.dirname(PC_BUILD_DATA_FILE) or ".", exist_ok=True)
    with open(PC_BUILD_DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(final_builds, f, ensure_ascii=False, indent=2)
    print(f"    合并完成，共 {len(final_builds)} 套 → {PC_BUILD_DATA_FILE}")


def clean_temp_data() -> None:
    print(">>> [清理] 临时文件与重复 ID…")
    if os.path.exists(PC_BUILD_DATA_FILE):
        with open(PC_BUILD_DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        seen = set()
        unique = []
        for item in data:
            iid = item.get("id")
            if iid in seen:
                print(f"    - 去掉重复 ID: {iid}")
                continue
            seen.add(iid)
            unique.append(item)
        with open(PC_BUILD_DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(unique, f, ensure_ascii=False, indent=2)

    for fpath in (ZOL_RAW_FILE, AI_TREND_FILE):
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
                print(f"    - 已删除 {fpath}")
            except OSError:
                pass


def call_deepseek_review_build(build: Dict[str, Any]) -> str:
    print(f"正在点评: {build.get('title', '')[:40]}…")
    parts_list = "\n".join(
        [f"- {p['name']}: {p['model']} ({p['price']})" for p in build.get("parts", [])]
    )
    prompt = f"""
你是资深硬件编辑。请点评下列 {ZOL_YEAR} 年装机方案，犀利、实用。

标题: {build['title']}
定位: {build.get('summary', '')}
价格: {build.get('price_range', '')}

清单:
{parts_list}

要求：性能搭配、1080P/2K/4K 游戏预期、适用人群、性价比；输出 HTML（p/ul/li/strong），300–500 字，不要 markdown 代码块。
"""
    try:
        return _deepseek_json(prompt, "你是专业的硬件点评专家。", timeout=60)
    except Exception as e:
        print(f"  - 点评失败: {e}")
        return "<p>暂无点评，请稍后再试。</p>"


def enrich_and_save_reviews() -> None:
    """按配置变更刷新 AI 点评，写回 JSON（前端直接读此文件）。"""
    print(">>> [点评] 检查并刷新 AI 点评…")
    if not os.path.exists(PC_BUILD_DATA_FILE):
        print(f"    找不到 {PC_BUILD_DATA_FILE}")
        return
    with open(PC_BUILD_DATA_FILE, "r", encoding="utf-8") as f:
        builds = json.load(f)

    data_changed = False
    for build in builds:
        parts_str = "".join(
            [f"{p['name']}{p['model']}{p['price']}" for p in build.get("parts", [])]
        )
        rec_mon_str = str(build.get("recommended_monitor", ""))
        content_to_hash = f"{build['title']}{build.get('price_range', '')}{parts_str}{rec_mon_str}"
        current_hash = hashlib.md5(content_to_hash.encode()).hexdigest()
        if (
            build.get("review")
            and build.get("review_hash") == current_hash
            and len(str(build.get("review"))) > 10
        ):
            continue
        if TEST_MODE:
            build.setdefault("review", "<p>测试模式跳过点评</p>")
            build["review_hash"] = current_hash
            data_changed = True
            continue
        review_html = call_deepseek_review_build(build)
        if review_html and len(review_html) > 10:
            build["review"] = review_html
            build["review_hash"] = current_hash
            data_changed = True
            time.sleep(1)

    if data_changed:
        with open(PC_BUILD_DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(builds, f, ensure_ascii=False, indent=2)
        print(f"    已更新点评 → {PC_BUILD_DATA_FILE}")
    else:
        print("    点评无需更新")


def main() -> None:
    parser = argparse.ArgumentParser(description="Tool Basecamp 2026 装机推荐")
    parser.add_argument(
        "--crawl",
        action="store_true",
        help="全量：爬 ZOL → AI 分析 → 合并 → 刷新点评",
    )
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="跳过爬取：AI 分析 → 合并 → 刷新点评（需已有 zol_raw）",
    )
    parser.add_argument(
        "--generate",
        action="store_true",
        help="仅根据现有 JSON 刷新缺失/过期点评",
    )
    parser.add_argument("--clean", action="store_true", help="结束后清理临时文件")
    args = parser.parse_args()

    if args.crawl:
        crawl_zol_data()
        analyze_trends_and_generate()
        merge_ai_recommendations()
        if args.clean:
            clean_temp_data()
    elif args.analyze:
        analyze_trends_and_generate()
        merge_ai_recommendations()
        if args.clean:
            clean_temp_data()

    # 默认或显式 --generate：写点评
    if args.crawl or args.analyze or args.generate or not (args.crawl or args.analyze):
        enrich_and_save_reviews()

    print("\n>>> 完成。公开页读取:", PC_BUILD_DATA_FILE)


if __name__ == "__main__":
    main()
