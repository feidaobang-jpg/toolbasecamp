#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Treasure Box news crawler: RSS → DeepSeek rewrite → MySQL → static HTML pages.

Run on the VPS only (via scripts/news/run_news.sh / cron).
DeepSeek key: DEEPSEEK_API_KEY from env (e.g. /etc/toolbasecamp-api.env).
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import math
import os
import re
import shutil
import sys
import time
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

import feedparser
import pymysql
import requests
from bs4 import BeautifulSoup
from PIL import Image

# --- Site branding ---
SITE_NAME = "资讯"
SITE_LOGO_TEXT = "资"
NEWS_SECTION_NAME = "科技资讯"
SITE_BASE_URL = os.environ.get("NEWS_SITE_URL", "https://news.zhengxiaohui.cn").rstrip("/")
KEYWORDS = "科技资讯,AI,硬件,显卡,手机,百宝箱"
DESCRIPTION = "海外科技资讯中文编译 — AI、硬件与数码动态，由百宝箱自动整理。"

DEEPSEEK_API_KEY = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
DEEPSEEK_API_URL = os.environ.get(
    "DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions"
).strip()
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()

ITEMS_PER_FEED = int(os.environ.get("NEWS_ITEMS_PER_FEED", "2"))
MAX_TOTAL_ITEMS = int(os.environ.get("NEWS_MAX_TOTAL", "100"))
ITEMS_PER_PAGE = int(os.environ.get("NEWS_ITEMS_PER_PAGE", "15"))

RSS_FEEDS = [
    {"name": "The Verge AI", "url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"},
    {"name": "Tom's Hardware", "url": "https://www.tomshardware.com/feeds/all"},
    {"name": "TechPowerUp", "url": "https://www.techpowerup.com/rss/news"},
    {"name": "GSMArena", "url": "https://www.gsmarena.com/rss-news-reviews.php3"},
    {"name": "Wccftech", "url": "https://wccftech.com/feed/"},
]

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LIST_TEMPLATE_FILE = os.path.join(SCRIPT_DIR, "news_list_template.html")
DETAIL_TEMPLATE_FILE = os.path.join(SCRIPT_DIR, "news_detail_template.html")

WEB_ROOT = os.environ.get("NEWS_WEB_ROOT", "/var/www/toolbasecamp-news")
ARTICLES_DIR = os.path.join(WEB_ROOT, "articles")
IMAGES_DIR = os.path.join(WEB_ROOT, "images")
PAGE_DIR = os.path.join(WEB_ROOT, "page")


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
        CREATE TABLE IF NOT EXISTS news_articles (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            source_url VARCHAR(768) NOT NULL,
            source_name VARCHAR(128) NOT NULL DEFAULT '',
            title VARCHAR(512) NOT NULL,
            summary TEXT NULL,
            content_html MEDIUMTEXT NOT NULL,
            cover_path VARCHAR(512) NULL,
            local_path VARCHAR(512) NOT NULL,
            published_at VARCHAR(32) NULL,
            created_at DOUBLE NOT NULL,
            UNIQUE KEY uq_news_source_url (source_url),
            KEY idx_news_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def clean_html(raw_html: str) -> str:
    if not raw_html:
        return ""
    text = re.sub(r"<.*?>", "", raw_html)
    return text.strip().replace("\n", " ")


def article_hash(source_url: str) -> str:
    return hashlib.md5(source_url.encode("utf-8")).hexdigest()


def url_looks_like_author_or_avatar(url: str) -> bool:
    if not url or not isinstance(url, str):
        return True
    u = url.lower()
    keys = (
        "avatar",
        "author",
        "byline",
        "writer",
        "headshot",
        "profile",
        "gravatar",
        "userpic",
        "user-media",
        "/users/",
        "/user/",
        "staff/",
        "portrait",
        "contributor",
        "wp-content/uploads/avatars",
        "/avatars/",
        "emoji",
        "googleusercontent.com",
        "pbs.twimg.com/profile",
        "favicon",
        "sprite",
        "badge",
        "blurple",  # The Verge author portraits
        "sponsor",
        "logo",
        "icon",
    )
    return any(k in u for k in keys)


def url_looks_like_ad_or_promo(url: str) -> bool:
    """Reject affiliate / deal banners (Wccftech Newegg, etc.)."""
    if not url or not isinstance(url, str):
        return True
    u = url.lower()
    keys = (
        "newegg",
        "doubleclick",
        "googlesyndication",
        "googleadservices",
        "amazon-adsystem",
        "adservice",
        "/ads/",
        "/ad/",
        "advert",
        "affiliate",
        "taboola",
        "outbrain",
        "mgid",
        "revcontent",
        "dealofday",
        "deal-of-the-day",
        "dealoftheday",
        "bundle-now",
        "bundlenow",
        "sponsored",
        "promo-banner",
        "promobanner",
        "aorus",
        "x870e-aorus",
    )
    return any(k in u for k in keys)


def img_in_ad_or_related_block(img) -> bool:
    """Skip imgs inside Deal of the Day / related / aside chrome."""
    for p in getattr(img, "parents", []) or []:
        name = getattr(p, "name", None) or ""
        if name in ("aside",):
            return True
        bits = " ".join(
            [
                " ".join(p.get("class") or []),
                str(p.get("id") or ""),
                str(p.get("data-widget") or ""),
                str(p.get("aria-label") or ""),
            ]
        ).lower()
        for k in (
            "ad-",
            "ads-",
            "advert",
            "sponsor",
            "affiliate",
            "deal-of",
            "dealofday",
            "related",
            "further-reading",
            "further_reading",
            "recommended",
            "sidebar",
            "promo",
            "outbrain",
            "taboola",
            "mgid",
            "newegg",
            "partner",
            "noskim",  # Skimlinks affiliate wrapper on Wccftech
            "skimlinks",
            "post-thumb",  # related-story thumbs
        ):
            if k in bits:
                return True
    return False


def img_tag_looks_like_author_or_chrome(img) -> bool:
    """Reject byline avatars / sponsor chrome using alt/class, not only URL."""
    alt = (img.get("alt") or "").strip().lower()
    cls = " ".join(img.get("class") or []).lower()
    src = (img.get("data-src") or img.get("src") or "").lower()
    if url_looks_like_author_or_avatar(src):
        return True
    if url_looks_like_ad_or_promo(src):
        return True
    if img_in_ad_or_related_block(img):
        return True
    # Wccftech desktop/mobile promo pair classes
    if "only-desktop" in cls or "only-mobile" in cls:
        return True
    chrome = ("sponsor", "logo", "icon", "avatar", "author", "byline", "headshot", "promo", "deal")
    if any(k in cls for k in chrome):
        return True
    if any(
        k in alt
        for k in (
            "sponsor",
            "logo",
            "icon",
            "avatar",
            "bundle",
            "newegg",
            "deal of",
            "aorus",
            "gigabyte",
        )
    ):
        return True
    # Person-name alts on The Verge bylines (e.g. "Jay Peters") — short, no scene words
    if alt and len(alt) <= 40 and " " in alt and not any(
        w in alt
        for w in (
            "graphic",
            "collage",
            "photo",
            "image",
            "screenshot",
            "review",
            "hands-on",
            "versus",
            "vs",
            "chip",
            "phone",
            "laptop",
            "gpu",
            "cpu",
            "ai",
            "meta",
            "apple",
            "google",
            "microsoft",
            "nvidia",
            "amd",
            "intel",
            "samsung",
        )
    ):
        # Two/three capitalized-looking name tokens in original alt
        raw_alt = (img.get("alt") or "").strip()
        tokens = raw_alt.split()
        if 2 <= len(tokens) <= 4 and all(t[:1].isupper() for t in tokens if t):
            return True
    return False


def image_is_square_like(path: str, lo: float = 0.85, hi: float = 1.18) -> bool:
    try:
        with Image.open(path) as img:
            if img.height <= 0:
                return False
            ar = img.width / img.height
            return lo <= ar <= hi
    except Exception:
        return False


def image_fingerprint(img: Image.Image) -> str:
    """Average-hash style fingerprint; same photo at different sizes usually matches."""
    gray = img.convert("L").resize((16, 16), Image.Resampling.BILINEAR)
    pixels = list(gray.getdata())
    avg = sum(pixels) / len(pixels)
    bits = "".join("1" if p >= avg else "0" for p in pixels)
    return bits


def image_fingerprint_file(path: str) -> Optional[str]:
    try:
        with Image.open(path) as img:
            return image_fingerprint(img)
    except Exception:
        return None


def fingerprint_distance(a: str, b: str) -> int:
    if not a or not b or len(a) != len(b):
        return 999
    return sum(x != y for x, y in zip(a, b))


def fingerprints_similar(a: Optional[str], b: Optional[str], max_dist: int = 8) -> bool:
    if not a or not b:
        return False
    return fingerprint_distance(a, b) <= max_dist


def local_image_path(rel_or_src: str) -> str:
    """Map images/xxx.jpg or ../images/xxx.jpg to filesystem path."""
    name = os.path.basename((rel_or_src or "").split("?")[0])
    if not name:
        return ""
    return os.path.join(IMAGES_DIR, name)


def download_image(
    url: str,
    min_width: int = 200,
    min_height: int = 100,
    reject_square_hero: bool = False,
    reject_square: bool = False,
) -> str:
    """Download/compress image; return web-relative path images/xxx.jpg or ''."""
    if not url or url_looks_like_author_or_avatar(url) or url_looks_like_ad_or_promo(url):
        return ""
    filename = hashlib.md5(url.encode()).hexdigest() + ".jpg"
    filepath = os.path.join(IMAGES_DIR, filename)
    rel = f"images/{filename}"

    def _passes_geometry(img: Image.Image) -> bool:
        if img.width < min_width or img.height < min_height:
            return False
        aspect_ratio = img.width / img.height
        is_square_like = 0.85 <= aspect_ratio <= 1.18
        if reject_square and is_square_like:
            return False
        is_small_square = is_square_like and img.width < 600
        if min_width >= 300:
            if is_small_square:
                return False
            if 1.2 <= aspect_ratio <= 1.5 and img.width < 400:
                return False
        if reject_square_hero and is_square_like and max(img.width, img.height) <= 900:
            return False
        # Author headshots are often large squares; never use as cover/body when square.
        if reject_square_hero and is_square_like:
            return False
        return True

    def _valid(path: str) -> bool:
        try:
            with Image.open(path) as img:
                img.verify()
            return True
        except Exception:
            return False

    if os.path.exists(filepath):
        if _valid(filepath):
            try:
                with Image.open(filepath) as cached:
                    if _passes_geometry(cached):
                        return rel
            except Exception:
                pass
            # Cached file fails current filters (e.g. old avatar) — don't reuse.
            return ""
        try:
            os.remove(filepath)
        except OSError:
            pass

    os.makedirs(IMAGES_DIR, exist_ok=True)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": url,
    }
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                continue
            content_type = (resp.headers.get("Content-Type") or "").lower()
            if "image" not in content_type:
                raise ValueError(f"invalid content-type: {content_type}")
            img = Image.open(BytesIO(resp.content))
            if img.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            if not _passes_geometry(img):
                return ""
            if img.width > 1200:
                ratio = 1200 / img.width
                img = img.resize((1200, int(img.height * ratio)), Image.Resampling.LANCZOS)
            img.save(filepath, "JPEG", quality=85, optimize=True)
            return rel
        except Exception as e:
            if attempt == 2:
                print(f"图片下载失败 {url}: {e}")
            else:
                time.sleep(2)
    return ""


def fetch_article_content(url: str) -> Tuple[str, str, List[str]]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": url,
    }
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                continue
            soup = BeautifulSoup(resp.text, "html.parser")
            cover_image_url = ""
            meta_image = soup.find("meta", property="og:image")
            if meta_image:
                og_candidate = (meta_image.get("content") or "").strip()
                if (
                    og_candidate
                    and not url_looks_like_author_or_avatar(og_candidate)
                    and not url_looks_like_ad_or_promo(og_candidate)
                ):
                    cover_image_url = og_candidate
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()

            # Prefer <article> so related-story / sidebar thumbs are not pulled in.
            scope = soup.find("article") or soup.find("main") or soup

            all_images: List[str] = []
            seen = set()
            if cover_image_url:
                all_images.append(cover_image_url)
                seen.add(cover_image_url)
            for img in scope.find_all("img"):
                if img_tag_looks_like_author_or_chrome(img):
                    continue
                src = img.get("data-src") or img.get("src") or ""
                src_lower = src.lower()
                if not src or src.startswith("data:") or src.endswith(".svg"):
                    continue
                skip_keywords = [
                    "logo",
                    "icon",
                    "avatar",
                    "author",
                    "profile",
                    "staff",
                    "writer",
                    "byline",
                    "gravatar",
                    "headshot",
                    "portrait",
                    "emoji",
                    "sprite",
                    "badge",
                    "favicon",
                    "googleusercontent",
                    "twimg.com/profile",
                    "blurple",
                    "sponsor",
                    "newegg",
                    "aorus",
                ]
                if any(kw in src_lower for kw in skip_keywords):
                    continue
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = urljoin(url, src)
                elif not src.startswith("http"):
                    continue
                if url_looks_like_author_or_avatar(src):
                    continue
                if src not in seen:
                    all_images.append(src)
                    seen.add(src)
            if not cover_image_url and all_images:
                cover_image_url = all_images[0]
            paragraphs = []
            for p in scope.find_all("p"):
                text = p.get_text().strip()
                if len(text) > 50:
                    paragraphs.append(text)
            full_text = "\n\n".join(paragraphs)
            return full_text[:4000], cover_image_url, all_images
        except Exception as e:
            if attempt == 2:
                print(f"抓取正文失败 {url}: {e}")
            else:
                time.sleep(2)
    return "", "", []


def insert_images_into_html(html_content: str, image_paths: List[str], img_prefix: str) -> str:
    """img_prefix is '../images/' for detail pages or 'images/' unused here."""
    if not image_paths:
        return html_content
    parts = [p + "</p>" for p in html_content.split("</p>") if p.strip()]
    if not parts:
        return html_content
    num_paragraphs = len(parts)
    num_images = len(image_paths)
    interval = max(1, num_paragraphs // (num_images + 1))
    new_html: List[str] = []
    img_idx = 0
    for i, p in enumerate(parts):
        new_html.append(p)
        if img_idx < num_images and (i + 1) % interval == 0 and i < num_paragraphs - 1:
            name = os.path.basename(image_paths[img_idx])
            new_html.append(
                f'<figure><img src="{img_prefix}{name}" alt="" loading="lazy"></figure>'
            )
            img_idx += 1
    return "".join(new_html)


def dedupe_content_images(html: str) -> str:
    """Drop duplicate / non-content figures (same visual, or square author-style)."""
    if not html:
        return html
    pattern = re.compile(
        r"(<figure\b[^>]*>\s*<img\b[^>]*\bsrc=[\"']([^\"']+)[\"'][^>]*>\s*</figure>)",
        re.I | re.S,
    )
    parts: List[str] = []
    seen_bases: set = set()
    seen_fps: List[str] = []
    pos = 0
    for m in pattern.finditer(html):
        parts.append(html[pos : m.start()])
        src = m.group(2) or ""
        base = os.path.basename(src.split("?")[0])
        drop = False
        local = local_image_path(src)
        if base and base in seen_bases:
            drop = True
        if not drop and local and os.path.isfile(local) and image_is_square_like(local):
            # Author blurple portraits etc. should never stay in body.
            drop = True
        fp = None
        if not drop and base:
            fp = image_fingerprint_file(local) if local else None
            if fp and any(fingerprints_similar(fp, prev) for prev in seen_fps):
                drop = True
        if drop:
            pos = m.end()
            continue
        if base:
            seen_bases.add(base)
        if fp:
            seen_fps.append(fp)
        parts.append(m.group(1))
        pos = m.end()
    parts.append(html[pos:])
    return "".join(parts)


def call_deepseek_compile(title: str, content: str, source: str) -> Optional[Dict[str, Any]]:
    if not DEEPSEEK_API_KEY:
        print("  - 缺少 DEEPSEEK_API_KEY，跳过 AI 编译")
        return None
    print(f"正在 AI 深度编译: {title[:30]}...")
    prompt = f"""
你是一位资深的科技媒体主编。请根据提供的英文科技新闻内容，创作一篇原创的中文深度报道。

原文来源: {source}
原文标题: {title}
原文内容:
{content}

创作要求：
1. 【标题】重新创作，吸引人且符合中文科技圈习惯，严格 30 字以内。
2. 【摘要】一句话总结，80 字以内，用于 SEO。
3. 【正文】完全重写（非直译），600–1000 字；用 HTML（<p>, <h2>, <ul>, <li>, <strong>）；禁止「注：」「本文基于…」等自我说明。
4. 输出 JSON，字段: "title", "summary", "content"。
"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
    }
    data = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "你是一个只输出 JSON 的助手。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"},
    }
    for attempt in range(2):
        try:
            response = requests.post(DEEPSEEK_API_URL, headers=headers, json=data, timeout=90)
            if response.status_code == 200:
                content_str = response.json()["choices"][0]["message"]["content"]
                content_str = content_str.replace("```json", "").replace("```", "")
                content_str = re.sub(
                    r"（注：.*?(本文基于|原创重写|编译自).*?）", "", content_str
                )
                content_str = re.sub(r"<p>（?注：.*?）?</p>", "", content_str)
                return json.loads(content_str)
            if response.status_code == 503:
                time.sleep(5 * (attempt + 1))
                continue
            print(f"  - API 失败: {response.status_code} - {response.text[:200]}")
            if response.status_code >= 500:
                time.sleep(3)
                continue
            return None
        except Exception as e:
            print(f"  - 请求异常: {e}")
            time.sleep(3)
    return None


def row_to_item(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["source_url"],
        "original_link": row["source_url"],
        "source": row["source_name"],
        "date": row.get("published_at") or "",
        "created_at": float(row["created_at"]),
        "cover_image": row.get("cover_path") or "",
        "title": row["title"],
        "desc": row.get("summary") or "",
        "content": row["content_html"],
        "local_url": row["local_path"],
    }


def load_all_items(cur) -> List[Dict[str, Any]]:
    cur.execute(
        "SELECT * FROM news_articles ORDER BY created_at DESC LIMIT %s",
        (MAX_TOTAL_ITEMS,),
    )
    return [row_to_item(r) for r in cur.fetchall()]


def known_urls(cur) -> set:
    cur.execute("SELECT source_url FROM news_articles")
    return {r["source_url"] for r in cur.fetchall()}


def upsert_article(cur, item: Dict[str, Any]) -> None:
    cur.execute(
        """
        INSERT INTO news_articles (
            source_url, source_name, title, summary, content_html,
            cover_path, local_path, published_at, created_at
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
            title=VALUES(title),
            summary=VALUES(summary),
            content_html=VALUES(content_html),
            cover_path=VALUES(cover_path),
            local_path=VALUES(local_path),
            published_at=VALUES(published_at)
        """,
        (
            item["original_link"],
            item["source"],
            item["title"],
            item.get("desc") or "",
            item["content"],
            item.get("cover_image") or "",
            item["local_url"],
            item.get("date") or "",
            item["created_at"],
        ),
    )


def generate_detail_page(item: Dict[str, Any]) -> str:
    with open(DETAIL_TEMPLATE_FILE, "r", encoding="utf-8") as f:
        template = f.read()
    html = template
    replacements = {
        "{{title}}": item["title"],
        "{{site_name}}": SITE_NAME,
        "{{site_logo_text}}": SITE_LOGO_TEXT,
        "{{news_section_name}}": NEWS_SECTION_NAME,
        "{{keywords}}": KEYWORDS,
        "{{description}}": item.get("desc") or DESCRIPTION,
        "{{summary}}": item.get("desc") or "",
        "{{content}}": dedupe_content_images(item.get("content") or ""),
        "{{source}}": item["source"],
        "{{date}}": item["date"],
        "{{original_link}}": item["original_link"],
        "{{main_site}}": "https://zhengxiaohui.cn/",
    }
    for k, v in replacements.items():
        html = html.replace(k, v)
    file_name = f"{article_hash(item['original_link'])}.html"
    os.makedirs(ARTICLES_DIR, exist_ok=True)
    path = os.path.join(ARTICLES_DIR, file_name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return f"articles/{file_name}"


def pagination_html(page: int, total_pages: int, prefix: str) -> str:
    """prefix: '' for index (links to page/N.html), '../' for pages under page/."""
    if total_pages <= 1:
        return ""

    def href(p: int) -> str:
        if p <= 1:
            return f"{prefix}index.html" if prefix else "index.html"
        if prefix:
            return f"{p}.html"
        return f"page/{p}.html"

    def btn(label: str, p: int, active: bool = False, disabled: bool = False) -> str:
        if disabled:
            return f'<span class="page-btn-disabled">{label}</span>'
        if active:
            return f'<span class="page-btn-active">{label}</span>'
        return f'<a href="{href(p)}" class="page-btn">{label}</a>'

    parts = [btn("上一页", page - 1, disabled=page <= 1)]
    pages: List[Any] = []
    if total_pages <= 7:
        pages = list(range(1, total_pages + 1))
    elif page <= 4:
        pages = [1, 2, 3, 4, 5, "...", total_pages]
    elif page >= total_pages - 3:
        pages = [1, "...", total_pages - 4, total_pages - 3, total_pages - 2, total_pages - 1, total_pages]
    else:
        pages = [1, "...", page - 1, page, page + 1, "...", total_pages]
    for p in pages:
        if p == "...":
            parts.append('<span class="page-ellipsis">...</span>')
        else:
            parts.append(btn(str(p), int(p), active=int(p) == page))
    parts.append(btn("下一页", page + 1, disabled=page >= total_pages))
    return '<div class="pagination">' + "".join(parts) + "</div>"


def card_html(item: Dict[str, Any], path_prefix: str) -> str:
    """path_prefix: '' from index, '../' from page/N.html."""
    href = path_prefix + item["local_url"]
    cover = item.get("cover_image") or ""
    if cover:
        img_src = path_prefix + cover
        img_tag = f'<div class="news-cover"><img src="{img_src}" alt="" loading="lazy" decoding="async"></div>'
    else:
        img_tag = '<div class="news-cover news-cover-fallback" aria-hidden="true">📰</div>'
    return f"""
    <a href="{href}" class="news-card">
        {img_tag}
        <div class="news-card-body">
            <h3 class="news-card-title">{item['title']}</h3>
            <p class="news-card-desc">{item.get('desc', '')}</p>
            <div class="news-card-meta">
                <span>{item.get('date', '')}</span>
                <span>|</span>
                <span>{item.get('source', '')}</span>
            </div>
        </div>
    </a>
    """


def write_list_page(items_slice: List[Dict[str, Any]], page: int, total_pages: int, out_path: str, path_prefix: str) -> None:
    with open(LIST_TEMPLATE_FILE, "r", encoding="utf-8") as f:
        template = f.read()
    cards = "".join(card_html(it, path_prefix) for it in items_slice)
    if not cards:
        cards = '<p class="news-empty">暂无资讯，请稍后刷新。</p>'
    pag = pagination_html(page, total_pages, path_prefix)
    title = SITE_NAME if page <= 1 else f"{SITE_NAME} · 第 {page} 页"
    asset_prefix = path_prefix  # '' or '../'
    html = template
    html = html.replace("{{news_items}}", cards)
    html = html.replace("{{pagination}}", pag)
    html = html.replace("{{site_name}}", SITE_NAME)
    html = html.replace("{{site_logo_text}}", SITE_LOGO_TEXT)
    html = html.replace("{{news_section_name}}", NEWS_SECTION_NAME)
    html = html.replace("{{keywords}}", KEYWORDS)
    html = html.replace("{{description}}", DESCRIPTION)
    html = html.replace("{{page_title}}", title)
    html = html.replace("{{main_site}}", "https://zhengxiaohui.cn/")
    html = html.replace("{{home_href}}", f"{path_prefix}index.html" if path_prefix else "index.html")
    html = html.replace("{{asset_prefix}}", asset_prefix)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)


def sync_static_assets() -> None:
    """Copy CSS/JS next to generated HTML under WEB_ROOT."""
    os.makedirs(WEB_ROOT, exist_ok=True)
    for name in ("news.css", "news-stats.js"):
        src = os.path.join(SCRIPT_DIR, name)
        dst = os.path.join(WEB_ROOT, name)
        if os.path.isfile(src):
            shutil.copy2(src, dst)


def generate_list_pages(items: List[Dict[str, Any]]) -> None:
    print("正在生成列表分页...")
    sync_static_assets()
    os.makedirs(WEB_ROOT, exist_ok=True)
    os.makedirs(PAGE_DIR, exist_ok=True)
    total = len(items)
    total_pages = max(1, math.ceil(total / ITEMS_PER_PAGE)) if total else 1
    # Clear old page/*.html except we'll rewrite
    if os.path.isdir(PAGE_DIR):
        for name in os.listdir(PAGE_DIR):
            if name.endswith(".html"):
                try:
                    os.remove(os.path.join(PAGE_DIR, name))
                except OSError:
                    pass
    for page in range(1, total_pages + 1):
        start = (page - 1) * ITEMS_PER_PAGE
        slice_items = items[start : start + ITEMS_PER_PAGE]
        if page == 1:
            write_list_page(slice_items, page, total_pages, os.path.join(WEB_ROOT, "index.html"), "")
        else:
            write_list_page(
                slice_items,
                page,
                total_pages,
                os.path.join(PAGE_DIR, f"{page}.html"),
                "../",
            )
    print(f"列表页完成：共 {total} 条，{total_pages} 页")


def generate_sitemap(items: List[Dict[str, Any]]) -> None:
    print("正在生成 sitemap.xml...")
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    total_pages = max(1, math.ceil(len(items) / ITEMS_PER_PAGE)) if items else 1
    lines.append(
        f"  <url><loc>{SITE_BASE_URL}/</loc><lastmod>{today}</lastmod>"
        f"<changefreq>daily</changefreq><priority>1.0</priority></url>"
    )
    for p in range(2, total_pages + 1):
        lines.append(
            f"  <url><loc>{SITE_BASE_URL}/page/{p}.html</loc><lastmod>{today}</lastmod>"
            f"<changefreq>daily</changefreq><priority>0.7</priority></url>"
        )
    for item in items:
        loc = f"{SITE_BASE_URL}/{item['local_url']}"
        date_str = today
        try:
            date_str = datetime.datetime.strptime(item["date"], "%Y-%m-%d %H:%M").strftime("%Y-%m-%d")
        except Exception:
            pass
        lines.append(
            f"  <url><loc>{loc}</loc><lastmod>{date_str}</lastmod>"
            f"<changefreq>monthly</changefreq><priority>0.5</priority></url>"
        )
    lines.append("</urlset>")
    with open(os.path.join(WEB_ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def prune_old(cur) -> int:
    """Keep newest MAX_TOTAL_ITEMS; delete DB rows and local files for the rest."""
    cur.execute("SELECT id, cover_path, local_path FROM news_articles ORDER BY created_at DESC")
    rows = cur.fetchall()
    if len(rows) <= MAX_TOTAL_ITEMS:
        return 0
    drop = rows[MAX_TOTAL_ITEMS:]
    for row in drop:
        for rel in (row.get("cover_path"), row.get("local_path")):
            if not rel:
                continue
            path = os.path.join(WEB_ROOT, rel.replace("/", os.sep))
            if os.path.isfile(path):
                try:
                    os.remove(path)
                except OSError:
                    pass
        cur.execute("DELETE FROM news_articles WHERE id=%s", (row["id"],))
    print(f"已清理超额旧稿 {len(drop)} 条")
    return len(drop)


def fetch_and_process(cur) -> Tuple[List[Dict[str, Any]], int]:
    existing = known_urls(cur)
    new_count = 0
    print(f"[{datetime.datetime.now()}] 开始抓取 RSS…")
    for conf in RSS_FEEDS:
        print(f"扫描: {conf['name']}…")
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
            }
            resp = requests.get(conf["url"], headers=headers, timeout=30)
            if resp.status_code != 200:
                print(f"  - RSS HTTP {resp.status_code}")
                continue
            feed = feedparser.parse(resp.content)
            if not feed.entries:
                print("  - 无条目")
                continue
            for entry in feed.entries[:ITEMS_PER_FEED]:
                link = entry.link
                if link in existing:
                    continue
                org_title = entry.title
                org_summary = entry.summary if hasattr(entry, "summary") else entry.title
                item: Dict[str, Any] = {
                    "id": link,
                    "original_link": link,
                    "source": conf["name"],
                    "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
                    "created_at": time.time(),
                }
                full_text, cover_image_url, all_image_urls = fetch_article_content(link)
                local_cover = ""
                chosen_cover_url = ""
                seen_c = set()
                candidates = []
                for u in [cover_image_url] + list(all_image_urls):
                    if (
                        not u
                        or u in seen_c
                        or url_looks_like_author_or_avatar(u)
                        or url_looks_like_ad_or_promo(u)
                    ):
                        continue
                    seen_c.add(u)
                    candidates.append(u)
                for cand in candidates:
                    path_try = download_image(cand, reject_square_hero=True)
                    if path_try:
                        local_cover = path_try
                        chosen_cover_url = cand
                        break
                item["cover_image"] = local_cover
                if not item["cover_image"]:
                    print(f"  - 跳过无封面: {org_title[:40]}")
                    continue
                other_images = []
                seen_paths = {local_cover} if local_cover else set()
                seen_fps: List[str] = []
                if local_cover:
                    cfp = image_fingerprint_file(local_image_path(local_cover))
                    if cfp:
                        seen_fps.append(cfp)
                for img_url in [u for u in all_image_urls if u != chosen_cover_url][:8]:
                    if url_looks_like_ad_or_promo(img_url):
                        continue
                    path = download_image(
                        img_url,
                        min_width=300,
                        min_height=200,
                        reject_square=True,
                    )
                    if not path or path in seen_paths:
                        continue
                    fp = image_fingerprint_file(local_image_path(path))
                    if fp and any(fingerprints_similar(fp, prev) for prev in seen_fps):
                        continue
                    seen_paths.add(path)
                    if fp:
                        seen_fps.append(fp)
                    other_images.append(path)
                    if len(other_images) >= 2:
                        break
                if not full_text:
                    full_text = clean_html(org_summary)
                ai_result = call_deepseek_compile(org_title, full_text, conf["name"])
                if not ai_result:
                    print(f"  - AI 失败，跳过: {org_title[:40]}")
                    continue
                item["title"] = (ai_result.get("title") or org_title).strip()
                item["desc"] = (ai_result.get("summary") or clean_html(org_summary)).strip()
                content_html = ai_result.get("content") or ""
                # Cover is for list cards; body gets unique extras only.
                # If no extras, prepend cover once (avoid cover+same-file twice).
                if other_images:
                    content_html = insert_images_into_html(
                        content_html, other_images, "../images/"
                    )
                elif item["cover_image"]:
                    name = os.path.basename(item["cover_image"])
                    content_html = (
                        f'<figure><img src="../images/{name}" alt="" loading="lazy"></figure>\n'
                        + content_html
                    )
                item["content"] = dedupe_content_images(content_html)
                item["local_url"] = generate_detail_page(item)
                upsert_article(cur, item)
                existing.add(link)
                new_count += 1
                print(f"  + 新增: {item['title'][:40]}")
                time.sleep(2)
        except Exception as e:
            print(f"处理 {conf['name']} 失败: {e}")
    prune_old(cur)
    items = load_all_items(cur)
    return items, new_count


def regen_from_db(cur) -> List[Dict[str, Any]]:
    items = load_all_items(cur)
    print(f"从数据库重生成 {len(items)} 条详情页…")
    for item in items:
        cleaned = dedupe_content_images(item.get("content") or "")
        if cleaned != (item.get("content") or ""):
            item["content"] = cleaned
            cur.execute(
                "UPDATE news_articles SET content_html=%s WHERE source_url=%s",
                (cleaned, item["original_link"]),
            )
        generate_detail_page(item)
    return items


def write_placeholder_index() -> None:
    os.makedirs(WEB_ROOT, exist_ok=True)
    generate_list_pages([])
    generate_sitemap([])
    print(f"已写入占位首页: {os.path.join(WEB_ROOT, 'index.html')}")


def run_smoke(out_dir: str) -> None:
    global WEB_ROOT, ARTICLES_DIR, IMAGES_DIR, PAGE_DIR
    WEB_ROOT = out_dir
    ARTICLES_DIR = os.path.join(WEB_ROOT, "articles")
    IMAGES_DIR = os.path.join(WEB_ROOT, "images")
    PAGE_DIR = os.path.join(WEB_ROOT, "page")
    os.makedirs(ARTICLES_DIR, exist_ok=True)
    os.makedirs(IMAGES_DIR, exist_ok=True)
    items = []
    for i in range(20):
        url = f"https://example.com/smoke/{i}"
        item = {
            "id": url,
            "original_link": url,
            "source": "Smoke",
            "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "created_at": time.time() - i,
            "cover_image": "",
            "title": f"烟雾测试文章 {i + 1}",
            "desc": f"摘要 {i + 1}",
            "content": f"<p>正文内容 {i + 1}</p>",
        }
        item["local_url"] = generate_detail_page(item)
        items.append(item)
    items.sort(key=lambda x: x["created_at"], reverse=True)
    generate_list_pages(items)
    generate_sitemap(items)
    assert os.path.isfile(os.path.join(WEB_ROOT, "index.html"))
    assert os.path.isfile(os.path.join(PAGE_DIR, "2.html"))
    print(f"SMOKE OK → {WEB_ROOT}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Treasure Box news builder")
    parser.add_argument("--regen-only", action="store_true", help="Rebuild HTML from MySQL only")
    parser.add_argument("--placeholder", action="store_true", help="Write empty index.html")
    parser.add_argument("--smoke", metavar="DIR", help="Local smoke test into DIR (no DB/API)")
    args = parser.parse_args()

    if args.smoke:
        run_smoke(args.smoke)
        return 0
    if args.placeholder:
        write_placeholder_index()
        return 0

    conn = db_connect()
    try:
        with conn.cursor() as cur:
            ensure_table(cur)
            if args.regen_only:
                items = regen_from_db(cur)
                new_count = 0
            else:
                items, new_count = fetch_and_process(cur)
            generate_list_pages(items)
            generate_sitemap(items)
            print(f"完成。新增 {new_count} 条，当前列表 {len(items)} 条。")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        import traceback

        print(f"脚本失败: {e}")
        traceback.print_exc()
        sys.exit(1)
