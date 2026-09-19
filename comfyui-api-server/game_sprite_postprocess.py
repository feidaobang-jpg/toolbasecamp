"""
游戏精灵后处理：透明包围盒 → 固定画布脚底/中线对齐 → 精灵表 + meta.json。
可单独用人工 PNG 测；流水线主路径也会调用。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from PIL import Image

if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.Resampling.LANCZOS


def alpha_bbox(im: Image.Image, threshold: int = 8) -> Optional[Tuple[int, int, int, int]]:
    """返回非透明像素包围盒 (left, top, right, bottom)，right/bottom 为开区间。"""
    rgba = im.convert("RGBA")
    alpha = rgba.split()[-1]
    mask = alpha.point(lambda a: 255 if a > threshold else 0)
    box = mask.getbbox()
    return box


def estimate_foot_center(
    im: Image.Image, threshold: int = 8
) -> Tuple[float, float, Tuple[int, int, int, int]]:
    """
    估脚底中点：包围盒底边中点；返回 (cx, foot_y, bbox)。
    foot_y 为包围盒 bottom（开区间底，即最底不透明像素下一行）。
    """
    box = alpha_bbox(im, threshold)
    if not box:
        w, h = im.size
        return w / 2.0, float(h), (0, 0, w, h)
    l, t, r, b = box
    cx = (l + r) / 2.0
    return cx, float(b), box


def align_to_canvas(
    im: Image.Image,
    canvas_w: int,
    canvas_h: int,
    *,
    threshold: int = 8,
    pixel_art: bool = False,
    max_content_ratio: float = 0.88,
) -> Image.Image:
    """
    将主体缩放到画布内，脚底贴画布底边附近、水平中线对齐。
    """
    src = im.convert("RGBA")
    cw = max(8, int(canvas_w))
    ch = max(8, int(canvas_h))
    box = alpha_bbox(src, threshold)
    if not box:
        out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        return out

    cropped = src.crop(box)
    bw, bh = cropped.size
    max_w = max(1, int(cw * max_content_ratio))
    max_h = max(1, int(ch * max_content_ratio))
    scale = min(max_w / bw, max_h / bh, 1.0)
    nw = max(1, int(round(bw * scale)))
    nh = max(1, int(round(bh * scale)))
    resample = Image.Resampling.NEAREST if pixel_art else Image.Resampling.LANCZOS
    resized = cropped.resize((nw, nh), resample)

    out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    # 脚底对齐：内容底边贴到 canvas 底边留 2% padding
    pad_y = max(1, int(round(ch * 0.02)))
    x = int(round((cw - nw) / 2.0))
    y = ch - pad_y - nh
    if y < 0:
        y = 0
    out.paste(resized, (x, y), resized)
    return out


def build_horizontal_sheet(
    frames: Sequence[Image.Image],
    *,
    padding: int = 0,
) -> Image.Image:
    """横向精灵表：同高同宽帧并排。"""
    if not frames:
        raise ValueError("no frames for sheet")
    w, h = frames[0].size
    pad = max(0, int(padding))
    n = len(frames)
    sheet_w = n * w + max(0, n - 1) * pad
    sheet = Image.new("RGBA", (sheet_w, h), (0, 0, 0, 0))
    x = 0
    for fr in frames:
        f = fr.convert("RGBA")
        if f.size != (w, h):
            f = f.resize((w, h), Image.Resampling.NEAREST)
        sheet.paste(f, (x, 0), f)
        x += w + pad
    return sheet


def frame_rects(
    count: int, frame_w: int, frame_h: int, *, padding: int = 0
) -> List[Dict[str, int]]:
    pad = max(0, int(padding))
    rects = []
    x = 0
    for i in range(count):
        rects.append({"i": i, "x": x, "y": 0, "w": frame_w, "h": frame_h})
        x += frame_w + pad
    return rects


def write_meta_json(
    path: Path,
    *,
    char_id: str,
    canvas_w: int,
    canvas_h: int,
    fps: int,
    view: str = "side",
    pixel_art: bool = False,
    animations: Dict[str, Any],
    anchor: Optional[Dict[str, float]] = None,
) -> None:
    """
    animations: { anim_name: { "frames": N, "sheet": "sheets/x.png", "rects": [...], "fps": n } }
    """
    meta = {
        "char_id": char_id,
        "view": view,
        "canvas": {"w": int(canvas_w), "h": int(canvas_h)},
        "fps": int(fps),
        "pixel_art": bool(pixel_art),
        "anchor": anchor
        or {
            "x": 0.5,
            "y": 1.0,
            "note": "foot center; map to AnimatedSprite2D offset / CollisionShape2D manually",
        },
        "animations": animations,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def process_animation_frames(
    frame_paths: Sequence[Path],
    out_dir: Path,
    anim_name: str,
    *,
    canvas_w: int = 256,
    canvas_h: int = 256,
    fps: int = 8,
    pixel_art: bool = False,
    sheet_padding: int = 0,
    threshold: int = 8,
) -> Dict[str, Any]:
    """
    读入帧 → 对齐 → 写 frames/<anim>/NN.png + sheets/<anim>.png。
    返回该动画的 meta 片段。
    """
    frames_dir = out_dir / "frames" / anim_name
    sheets_dir = out_dir / "sheets"
    frames_dir.mkdir(parents=True, exist_ok=True)
    sheets_dir.mkdir(parents=True, exist_ok=True)

    aligned: List[Image.Image] = []
    for i, p in enumerate(frame_paths):
        im = Image.open(p).convert("RGBA")
        a = align_to_canvas(
            im, canvas_w, canvas_h, threshold=threshold, pixel_art=pixel_art
        )
        dest = frames_dir / f"{i:02d}.png"
        a.save(dest, "PNG")
        aligned.append(a)

    if not aligned:
        raise ValueError(f"no frames for animation {anim_name}")

    sheet = build_horizontal_sheet(aligned, padding=sheet_padding)
    sheet_rel = f"sheets/{anim_name}.png"
    sheet.save(out_dir / sheet_rel, "PNG")
    fw, fh = aligned[0].size
    return {
        "frames": len(aligned),
        "fps": int(fps),
        "sheet": sheet_rel.replace("\\", "/"),
        "frame_dir": f"frames/{anim_name}",
        "rects": frame_rects(len(aligned), fw, fh, padding=sheet_padding),
    }


def pack_project_meta(
    out_dir: Path,
    char_id: str,
    anim_metas: Dict[str, Dict[str, Any]],
    *,
    canvas_w: int,
    canvas_h: int,
    fps: int,
    pixel_art: bool = False,
    view: str = "side",
) -> Path:
    meta_path = out_dir / "meta.json"
    write_meta_json(
        meta_path,
        char_id=char_id,
        canvas_w=canvas_w,
        canvas_h=canvas_h,
        fps=fps,
        view=view,
        pixel_art=pixel_art,
        animations=anim_metas,
    )
    return meta_path
