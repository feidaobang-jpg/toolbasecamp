"""
本机 ComfyUI output 目录分类约定。

新任务写入子目录；历史扫描同时兼容根目录旧文件夹（不自动 bulk 迁移）。

output/
  trailers/
  series/          # 剧集已用
  game_sprites/
  text_to_video/
  images/          # 预留
  music/           # 预留
  sfx/             # 预留
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable, List, Optional

CATEGORIES = (
    "trailers",
    "series",
    "game_sprites",
    "text_to_video",
    "images",
    "music",
    "sfx",
)

# 根目录下这些名字视为分类目录本身，不当作旧任务
_CATEGORY_NAMES = set(CATEGORIES)


def category_dir(root: Path, category: str, *, ensure: bool = True) -> Path:
    cat = (category or "").strip().strip("/\\")
    if cat not in _CATEGORY_NAMES:
        raise ValueError(f"unknown output category: {category}")
    d = Path(root) / cat
    if ensure:
        d.mkdir(parents=True, exist_ok=True)
    return d


def ensure_reserved_dirs(root: Path) -> None:
    """创建分类与预留空目录（images/music/sfx 等）。"""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    for cat in CATEGORIES:
        (root / cat).mkdir(parents=True, exist_ok=True)


def alloc_under(
    root: Path,
    category: str,
    base_name: str,
) -> str:
    """
    在 category 下分配唯一目录名，返回相对 output_root 的路径（POSIX）：
    如 game_sprites/2026-09-02_22-18_gs_hero
    """
    cat = category_dir(root, category, ensure=True)
    base = (base_name or "task").strip().replace("\\", "/").split("/")[-1]
    if not base:
        base = "task"
    if not (cat / base).exists():
        return f"{category}/{base}"
    for i in range(1, 1000):
        candidate = f"{base}_{i:02d}"
        if not (cat / candidate).exists():
            return f"{category}/{candidate}"
    import uuid

    return f"{category}/{base}_{uuid.uuid4().hex[:6]}"


def resolve_task_dir(root: Path, folder: str) -> Optional[Path]:
    """
    解析任务目录：支持相对路径 trailers/xxx、根目录旧名 xxx、或绝对路径名片段。
    """
    root = Path(root)
    name = (folder or "").strip().replace("\\", "/")
    if not name or name in (".", "..") or ".." in name.split("/"):
        return None
    # 已是相对分类路径
    p = root / name
    if p.is_dir():
        return p
    # 仅文件名：先试根目录，再试各分类
    leaf = Path(name).name
    if leaf and leaf not in _CATEGORY_NAMES:
        flat = root / leaf
        if flat.is_dir():
            return flat
        for cat in CATEGORIES:
            cand = root / cat / leaf
            if cand.is_dir():
                return cand
    return None


def list_task_dirs(
    root: Path,
    category: str,
    *,
    legacy_pred: Optional[Callable[[Path], bool]] = None,
    limit: int = 24,
) -> List[Path]:
    """
    列出 category 下任务目录，并可选合并根目录旧任务（legacy_pred）。
    按 mtime 降序，去重（同一 inode/路径只保留一次）。
    """
    root = Path(root)
    if not root.exists():
        return []
    try:
        lim = max(1, min(120, int(limit)))
    except Exception:
        lim = 24

    found: List[Path] = []
    seen = set()

    def _add(p: Path) -> None:
        try:
            key = str(p.resolve())
        except Exception:
            key = str(p)
        if key in seen:
            return
        if not p.is_dir():
            return
        if p.name in _CATEGORY_NAMES and p.parent == root:
            return
        seen.add(key)
        found.append(p)

    cat = root / category
    if cat.is_dir():
        for p in cat.iterdir():
            if p.is_dir() and not p.name.startswith("_") and p.name != "projects":
                _add(p)

    if legacy_pred:
        for p in root.iterdir():
            if not p.is_dir() or p.name.startswith("_"):
                continue
            if p.name in _CATEGORY_NAMES:
                continue
            try:
                if legacy_pred(p):
                    _add(p)
            except Exception:
                continue

    found.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return found[:lim]


def rel_to_root(root: Path, path: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(Path(root).resolve())).replace("\\", "/")
    except Exception:
        return Path(path).name


def folder_public_key(task_dir: Path, root: Optional[Path] = None) -> str:
    """用于 /output/{key}/… 的相对路径；兼容分类子目录与根目录旧任务。"""
    d = Path(task_dir)
    if root is not None:
        return rel_to_root(root, d)
    if d.parent.name in _CATEGORY_NAMES:
        return f"{d.parent.name}/{d.name}".replace("\\", "/")
    return d.name
