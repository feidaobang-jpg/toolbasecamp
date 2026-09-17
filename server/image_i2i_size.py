"""Shared I2I output size helpers: keep input aspect ratio within each vendor's limits."""

from __future__ import annotations

import math
from io import BytesIO
from typing import Optional, Sequence, Tuple


def ref_image_wh(image_bytes: bytes) -> Optional[Tuple[int, int]]:
    try:
        from PIL import Image

        im = Image.open(BytesIO(image_bytes))
        im.load()
        w, h = im.size
        if w > 0 and h > 0:
            return int(w), int(h)
    except Exception:
        return None
    return None


def first_ref_wh(refs: Sequence[bytes]) -> Optional[Tuple[int, int]]:
    for raw in refs or ():
        if not raw:
            continue
        wh = ref_image_wh(raw)
        if wh:
            return wh
    return None


def _clamp_aspect(aspect: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, aspect))


def pixel_size_star(
    output_size: str,
    ref_wh: Optional[Tuple[int, int]],
    *,
    pro: bool = False,
    min_side: int = 64,
    max_area: int = 2048 * 2048,
    min_area: int = 512 * 512,
    aspect_lo: float = 1.0 / 8.0,
    aspect_hi: float = 8.0,
) -> str:
    """DashScope-style `W*H`, preserving ref aspect."""
    want_2k = (output_size or "2K").strip().upper() != "1K"
    if want_2k:
        target_area = float(1664 * 1664) if pro else float(2048 * 2048)
        target_area = max(target_area, 2_250_001.0)
    else:
        target_area = float(1024 * 1024)

    rw, rh = 1024, 1024
    if ref_wh and ref_wh[0] > 0 and ref_wh[1] > 0:
        rw, rh = int(ref_wh[0]), int(ref_wh[1])
    aspect = _clamp_aspect(rw / float(rh), aspect_lo, aspect_hi)

    ow = max(min_side, int(round(math.sqrt(target_area * aspect))))
    oh = max(min_side, int(round(math.sqrt(target_area / aspect))))
    area = ow * oh
    if area > max_area:
        scale = math.sqrt(max_area / float(area))
        ow = max(min_side, int(round(ow * scale)))
        oh = max(min_side, int(round(oh * scale)))
        area = ow * oh
    if area < min_area:
        scale = math.sqrt(min_area / float(max(area, 1)))
        ow = max(min_side, int(round(ow * scale)))
        oh = max(min_side, int(round(oh * scale)))
        area = ow * oh
    if want_2k and area <= 2_250_000:
        scale = math.sqrt(2_250_001.0 / float(area))
        ow2 = max(min_side, int(math.ceil(ow * scale)))
        oh2 = max(min_side, int(math.ceil(oh * scale)))
        if ow2 * oh2 <= max_area:
            ow, oh = ow2, oh2
    return f"{ow}*{oh}"


# Seedream 5.0 Lite documented 2K presets (WxH). Prefer nearest preset (safer than raw math).
_SEEDREAM_2K: list[Tuple[float, int, int]] = [
    (1 / 1, 2048, 2048),
    (4 / 3, 2304, 1728),
    (3 / 4, 1728, 2304),
    (16 / 9, 2848, 1600),
    (9 / 16, 1600, 2848),
    (3 / 2, 2496, 1664),
    (2 / 3, 1664, 2496),
    (21 / 9, 3136, 1344),
]

# GPT Image 1 discrete sizes (legacy). GPT Image 2 / 2.5 also accept custom WxH.
_GPT_SIZES: list[Tuple[float, str]] = [
    (1.0, "1024x1024"),
    (1024 / 1536, "1024x1536"),
    (1536 / 1024, "1536x1024"),
]

# Banana / Gemini media aspect ratios.
_BANANA_AR: list[Tuple[float, str]] = [
    (1.0, "1:1"),
    (2 / 3, "2:3"),
    (3 / 2, "3:2"),
    (3 / 4, "3:4"),
    (4 / 3, "4:3"),
    (9 / 16, "9:16"),
    (16 / 9, "16:9"),
]


def _nearest(aspect: float, options: Sequence[Tuple[float, ...]]) -> Tuple:
    best = options[0]
    best_d = abs(math.log(aspect / best[0]))
    for opt in options[1:]:
        d = abs(math.log(aspect / opt[0]))
        if d < best_d:
            best, best_d = opt, d
    return best


def _snap16(n: int) -> int:
    return max(16, int(round(n / 16.0)) * 16)


def gpt_size_wh(ref_wh: Optional[Tuple[int, int]], output_size: str = "2K") -> str:
    """
    OpenAI-style `WIDTHxHEIGHT` for GPT Image edits.

    GPT Image 2 / 2.5 support custom resolutions (sides multiples of 16, aspect ≤ 3:1,
    pixels in ~[655360, 8294400], max edge ≤ 3840). Prefer matching the reference
    aspect so tall phone screenshots are not forced into 1024x1536 and stretched.
    """
    want_2k = (output_size or "2K").strip().upper() != "1K"
    if not ref_wh or ref_wh[0] <= 0 or ref_wh[1] <= 0:
        return "2048x2048" if want_2k else "1024x1024"

    aspect = _clamp_aspect(ref_wh[0] / float(ref_wh[1]), 1.0 / 3.0, 3.0)
    long_edge = 2048 if want_2k else 1024
    max_edge = 3840
    min_pixels = 655_360
    max_pixels = 8_294_400

    if aspect >= 1.0:
        ow = long_edge
        oh = max(16, int(round(long_edge / aspect)))
    else:
        oh = long_edge
        ow = max(16, int(round(long_edge * aspect)))

    ow, oh = _snap16(ow), _snap16(oh)

    if max(ow, oh) > max_edge:
        scale = max_edge / float(max(ow, oh))
        ow, oh = _snap16(int(ow * scale)), _snap16(int(oh * scale))

    area = ow * oh
    if area > max_pixels:
        scale = math.sqrt(max_pixels / float(area))
        ow, oh = _snap16(int(ow * scale)), _snap16(int(oh * scale))
        area = ow * oh
    if area < min_pixels:
        scale = math.sqrt(min_pixels / float(max(area, 1)))
        ow = _snap16(int(math.ceil(ow * scale)))
        oh = _snap16(int(math.ceil(oh * scale)))
        if max(ow, oh) > max_edge or ow * oh > max_pixels:
            # Extreme aspect after min-pixel bump: fall back to nearest discrete size.
            _ar, size = _nearest(aspect, _GPT_SIZES)
            return size

    # Re-clamp aspect after snaps (keep within 3:1).
    if ow / float(oh) > 3.0:
        ow = _snap16(oh * 3)
    elif oh / float(ow) > 3.0:
        oh = _snap16(ow * 3)

    return f"{ow}x{oh}"


def gpt_size_wh_discrete(ref_wh: Optional[Tuple[int, int]], output_size: str = "2K") -> str:
    """Legacy discrete sizes only (1024 square / portrait / landscape)."""
    if not ref_wh or ref_wh[0] <= 0 or ref_wh[1] <= 0:
        return "1024x1024"
    aspect = ref_wh[0] / float(ref_wh[1])
    _ar, size = _nearest(aspect, _GPT_SIZES)
    return size


def seedream_size_wh(
    output_size: str,
    ref_wh: Optional[Tuple[int, int]],
    *,
    lite: bool = True,
) -> str:
    """
    Seedream `WIDTHxHEIGHT` closest to input aspect.

    Lite docs: total pixels in ~[3.686M, ~10.4M], aspect [1/16, 16].
    UI 1K/2K both map to 2K-tier presets (vendor minimum for lite is 2K).
    """
    _ = output_size  # keep signature; lite floors at 2K presets
    if not ref_wh or ref_wh[0] <= 0 or ref_wh[1] <= 0:
        return "2048x2048"
    aspect = _clamp_aspect(ref_wh[0] / float(ref_wh[1]), 1.0 / 16.0, 16.0)
    _ar, w, h = _nearest(aspect, _SEEDREAM_2K)
    # Extra safety: if custom math ever used, respect lite min area.
    if lite and w * h < 3_686_400:
        scale = math.sqrt(3_686_400 / float(w * h))
        w = max(64, int(math.ceil(w * scale)))
        h = max(64, int(math.ceil(h * scale)))
    return f"{w}x{h}"


def banana_aspect_and_tier(
    ref_wh: Optional[Tuple[int, int]], output_size: str = "2K"
) -> Tuple[str, str]:
    tier = "2K" if (output_size or "2K").strip().upper() != "1K" else "1K"
    if not ref_wh or ref_wh[0] <= 0 or ref_wh[1] <= 0:
        return "1:1", tier
    aspect = ref_wh[0] / float(ref_wh[1])
    _ar, label = _nearest(aspect, _BANANA_AR)
    return label, tier
