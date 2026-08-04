#!/usr/bin/env python3
"""Generate public/sitemap.xml and public/robots.txt for SEO indexing."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import html


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
SITEMAP_PATH = PUBLIC_DIR / "sitemap.xml"
ROBOTS_PATH = PUBLIC_DIR / "robots.txt"
SITE_URL = "https://toolbasecamp.com"


EXCLUDE_PREFIXES = (
    "html/admin/",
    "html/auth/",
)
EXCLUDE_NAMES = (
    "baidu_verify_",
)


def to_rel_posix(path: Path) -> str:
    return path.relative_to(PUBLIC_DIR).as_posix()


def should_include(path: Path) -> bool:
    rel = to_rel_posix(path)
    if not rel.endswith(".html"):
        return False
    if any(rel.startswith(p) for p in EXCLUDE_PREFIXES):
        return False
    if any(Path(rel).name.startswith(n) for n in EXCLUDE_NAMES):
        return False

    # Skip explicitly noindex pages.
    text = path.read_text(encoding="utf-8", errors="ignore").lower()
    if "noindex" in text:
        return False
    return True


def priority_for(rel: str) -> str:
    if rel == "index.html":
        return "1.0"
    if rel == "html/media/instruct-edit.html":
        return "0.95"
    if rel.startswith("html/media/"):
        return "0.90"
    if rel in {"games.html", "life.html", "cool-sites.html", "about.html"}:
        return "0.85"
    if rel.startswith("html/life/"):
        return "0.82"
    return "0.75"


def build_sitemap(url_paths: list[str]) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for rel in url_paths:
        loc = f"{SITE_URL}/{rel}"
        lines.extend(
            [
                "  <url>",
                f"    <loc>{html.escape(loc, quote=True)}</loc>",
                f"    <lastmod>{now}</lastmod>",
                "    <changefreq>weekly</changefreq>",
                f"    <priority>{priority_for(rel)}</priority>",
                "  </url>",
            ]
        )
    lines.append("</urlset>")
    lines.append("")
    return "\n".join(lines)


def build_robots() -> str:
    return "\n".join(
        [
            "User-agent: *",
            "Allow: /",
            "Disallow: /html/admin/",
            "Disallow: /html/auth/",
            "",
            f"Sitemap: {SITE_URL}/sitemap.xml",
            "",
        ]
    )


def main() -> None:
    html_files = sorted(PUBLIC_DIR.rglob("*.html"))
    urls = sorted({to_rel_posix(p) for p in html_files if should_include(p)})
    if "index.html" in urls:
        urls.remove("index.html")
        urls.insert(0, "index.html")

    SITEMAP_PATH.write_text(build_sitemap(urls), encoding="utf-8")
    ROBOTS_PATH.write_text(build_robots(), encoding="utf-8")
    print(f"Generated sitemap with {len(urls)} URLs -> {SITEMAP_PATH}")
    print(f"Generated robots -> {ROBOTS_PATH}")


if __name__ == "__main__":
    main()
