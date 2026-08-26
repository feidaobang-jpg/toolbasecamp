"""AI Music — MiniMax Music + 逍遥 Suno; charge on success.

Models:
  - music-3.0-free: vendor ¥0/song → user ¥0
  - music-3.0: vendor ¥1/song → user ¥2 (× AI_PRICE_MARKUP, default 2)
  - suno-v4.5: vendor ≈¥0.67 → user ≈¥1.34 (逍遥 lk888)

Env: MINIMAX_API_KEY and/or LK888_API_KEY.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import subprocess
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ai_wallet import (
    AI_MARKUP,
    get_balance,
    money,
    require_can_afford,
    try_charge,
    user_price_cny,
    wallet_public,
)
from lk888_music import generate_suno_music, is_suno_model, lk888_music_configured
from recipe_ai import DEEPSEEK_API_KEY, _call_deepseek

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/music", tags=["music"])

CN_TZ = ZoneInfo("Asia/Shanghai")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@zhengxiaohui.cn").lower()
ADMIN_PHONE = (os.environ.get("ADMIN_PHONE") or "").strip()
MINIMAX_API_KEY = (os.environ.get("MINIMAX_API_KEY") or "").strip()
MINIMAX_MUSIC_API_URL = (
    os.environ.get("MINIMAX_MUSIC_API_URL") or "https://api.minimaxi.com/v1/music_generation"
).strip().rstrip("/")
MINIMAX_LYRICS_API_URL = (
    os.environ.get("MINIMAX_LYRICS_API_URL") or "https://api.minimaxi.com/v1/lyrics_generation"
).strip().rstrip("/")
MUSIC_TIMEOUT = float(os.environ.get("MINIMAX_MUSIC_TIMEOUT") or os.environ.get("FUN_MUSIC_TIMEOUT") or "360")
LYRICS_TIMEOUT = float(os.environ.get("MINIMAX_LYRICS_TIMEOUT") or "90")
DEFAULT_MODEL = (os.environ.get("MINIMAX_MUSIC_MODEL") or "music-3.0-free").strip() or "music-3.0-free"

# Vendor list price CNY per song (MiniMax paygo + 逍遥 Suno)
LIST_PRICE_PER_SONG = {
    "music-3.0-free": Decimal("0"),
    "music-3.0": Decimal("1.0"),
    # Xiaoyao Suno v4.5 ≈ ⚡0.67 → user ≈ ¥1.34 with default markup 2
    "suno-v4.5": Decimal("0.67"),
}
ALLOWED_MODELS = frozenset(LIST_PRICE_PER_SONG.keys())

RESULT_TTL_SEC = 24 * 3600
TMP_DIR = Path(os.environ.get("FUN_MUSIC_TMP_DIR") or (Path(__file__).resolve().parent / "tmp_music"))
TMP_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR = Path(
    os.environ.get("MUSIC_PUBLIC_DIR")
    or "/var/lib/toolbasecamp/public-music"
)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
TRADITIONAL_DIR = Path(
    os.environ.get("TRADITIONAL_MUSIC_DIR")
    or "/var/lib/toolbasecamp/traditional-music"
)
TRADITIONAL_DIR.mkdir(parents=True, exist_ok=True)
TRADITIONAL_MANIFEST = TRADITIONAL_DIR / "manifest.json"
_traditional_manifest_cache: tuple[float, list] = (0.0, [])
TRADITIONAL_PREVIEW_BITRATE = (os.environ.get("TRADITIONAL_PREVIEW_BITRATE") or "48k").strip()
TRADITIONAL_UPLOAD_MAX_MB = max(5, int(os.environ.get("TRADITIONAL_UPLOAD_MAX_MB") or "50"))

_results: Dict[str, Dict[str, Any]] = {}


def _ensure_music_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS music_tracks (
            id VARCHAR(32) PRIMARY KEY,
            user_id BIGINT NOT NULL,
            title VARCHAR(160) NOT NULL DEFAULT '',
            prompt TEXT,
            lyrics MEDIUMTEXT,
            model VARCHAR(64) NOT NULL,
            duration_sec INT NOT NULL DEFAULT 0,
            content_type VARCHAR(64) NOT NULL DEFAULT 'audio/mpeg',
            file_ext VARCHAR(8) NOT NULL DEFAULT '.mp3',
            file_name VARCHAR(80) NOT NULL,
            is_public TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            INDEX idx_music_public_created (is_public, created_at),
            INDEX idx_music_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )


def _insert_public_track(
    *,
    track_id: str,
    user_id: int,
    title: str,
    prompt: str,
    lyrics: str,
    model: str,
    duration: int,
    content_type: str,
    file_ext: str,
    file_name: str,
) -> None:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_music_schema(cur)
            cur.execute(
                """
                INSERT INTO music_tracks (
                    id, user_id, title, prompt, lyrics, model, duration_sec,
                    content_type, file_ext, file_name, is_public, created_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, 1, %s
                )
                """,
                (
                    track_id,
                    int(user_id),
                    (title or "")[:160],
                    prompt or "",
                    lyrics or "",
                    model,
                    int(duration or 0),
                    content_type,
                    file_ext,
                    file_name,
                    _now_utc_naive().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
    finally:
        conn.close()


def _now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _format_created_at_cn(created: Any) -> str:
    """DB stores UTC naive; show Asia/Shanghai for the music hub."""
    if created is None:
        return ""
    if isinstance(created, str):
        s = created.strip().replace("T", " ")
        try:
            created = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return s
    if not hasattr(created, "year"):
        return str(created)
    if getattr(created, "tzinfo", None) is not None:
        dt = created.astimezone(CN_TZ)
    else:
        dt = created.replace(tzinfo=timezone.utc).astimezone(CN_TZ)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _public_file_path(file_name: str) -> Path:
    name = Path(str(file_name or "")).name
    if not name or name != str(file_name) or ".." in name:
        raise HTTPException(status_code=400, detail="Invalid music file")
    path = (PUBLIC_DIR / name).resolve()
    if not str(path).startswith(str(PUBLIC_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid music file")
    return path


def _wire(get_conn, require_db, get_current_user, require_admin=None, get_optional_user=None):
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]
    router.require_admin = require_admin  # type: ignore[attr-defined]
    router.get_optional_user = get_optional_user  # type: ignore[attr-defined]


def _user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    return router.get_current_user(creds)  # type: ignore[attr-defined]


def _optional_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    fn = getattr(router, "get_optional_user", None)
    if fn:
        return fn(creds)
    return None


def _admin_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    user = router.get_current_user(creds)  # type: ignore[attr-defined]
    req = getattr(router, "require_admin", None)
    if req:
        req(user)
    elif not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _conn():
    router.require_db()  # type: ignore[attr-defined]
    return router.get_conn()  # type: ignore[attr-defined]


def _is_admin(user: dict) -> bool:
    if not user:
        return False
    if user.get("role") == "admin":
        return True
    if (user.get("email") or "").lower() == ADMIN_EMAIL:
        return True
    if ADMIN_PHONE and (user.get("phone") or "").strip() == ADMIN_PHONE:
        return True
    return False


def _mask_phone(raw: str) -> str:
    """Public list: show 158****0726 style masking."""
    s = re.sub(r"\D", "", str(raw or ""))
    if len(s) >= 11:
        return s[:3] + "****" + s[-4:]
    if len(s) >= 7:
        return s[:2] + "****" + s[-2:]
    if s:
        return "****"
    return "—"


def _creator_public(row: dict) -> Dict[str, str]:
    nick = str(row.get("creator_nickname") or "").strip()
    phone_raw = str(row.get("creator_phone") or "").strip()
    email = str(row.get("creator_email") or "").strip()
    if not nick:
        nick = phone_raw or email or ""
    phone = _mask_phone(phone_raw) if phone_raw else "—"
    return {
        "creatorNickname": nick or "—",
        "creatorPhone": phone,
    }


def fun_music_configured() -> bool:
    return bool(MINIMAX_API_KEY) or lk888_music_configured()


def _provider_for_model(model: str) -> str:
    if is_suno_model(model):
        return "lk888"
    return "minimax"


def _sanitize_title(raw: str, *, max_len: int = 40) -> str:
    t = (raw or "").strip()
    t = t.strip("\"'`「」『』《》【】[]()（）").strip()
    t = " ".join(t.split())
    # Drop common model prefixes
    for prefix in ("歌名：", "歌名:", "标题：", "标题:", "Title:", "title:"):
        if t.lower().startswith(prefix.lower()):
            t = t[len(prefix) :].strip()
    if not t:
        return ""
    # One line only
    t = t.splitlines()[0].strip()
    if len(t) > max_len:
        t = t[:max_len].rstrip("，,.-— ")
    return t


def _normalize_lyrics_for_minimax(raw: str) -> str:
    """
    Format lyrics before MiniMax music_generation to reduce sing-vs-text drift.
    - Canonical structure tags ([Verse] not [verse])
    - Blank line after each tag
    - Split overly long lines at Chinese punctuation
    """
    tag_keys = {
        "intro": "Intro",
        "verse": "Verse",
        "pre-chorus": "Pre-Chorus",
        "pre chorus": "Pre-Chorus",
        "prechorus": "Pre-Chorus",
        "chorus": "Chorus",
        "hook": "Hook",
        "bridge": "Bridge",
        "outro": "Outro",
        "interlude": "Interlude",
        "inst": "Inst",
        "instrumental": "Instrumental",
        "solo": "Solo",
        "drop": "Drop",
        "break": "Break",
        "breakdown": "Breakdown",
        "build-up": "Build-up",
        "build up": "Build-up",
        "transition": "Transition",
        "post-chorus": "Post-Chorus",
        "post chorus": "Post-Chorus",
    }
    out: list[str] = []
    for line in str(raw or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        t = line.strip()
        if not t:
            if out and out[-1] != "":
                out.append("")
            continue
        m = re.match(r"^\[([^\]]+)\]\s*$", t, re.I)
        if m:
            inner = m.group(1).strip()
            rest = ""
            m2 = re.match(r"^([A-Za-z][A-Za-z\s-]*?)(?:\s+(\d+.*))?$", inner)
            if m2:
                key = m2.group(1).strip().lower().replace(" ", "-")
                canon = tag_keys.get(key, m2.group(1).strip().title())
                if m2.group(2):
                    rest = " " + m2.group(2).strip()
                t = f"[{canon}{rest}]"
            else:
                t = f"[{inner}]"
            if out and out[-1] != "":
                out.append("")
            out.append(t)
            out.append("")
            continue
        if t.startswith("(") and t.endswith(")"):
            out.append(t)
            continue
        if len(t) > 40:
            chunks = re.split(r"([，。！？；、])", t)
            buf = ""
            for i in range(0, len(chunks), 2):
                piece = chunks[i] + (chunks[i + 1] if i + 1 < len(chunks) else "")
                piece = piece.strip()
                if not piece:
                    continue
                if len(buf) + len(piece) > 36 and buf:
                    out.append(buf)
                    buf = piece
                else:
                    buf = (buf + piece) if buf else piece
            if buf:
                out.append(buf)
        else:
            out.append(t)
    text = "\n".join(out).strip()
    return text[:3500]


_LYRIC_SECTION_TAG_RE = re.compile(
    r"^\[(Intro|Verse|Pre[-\s]?Chorus|Chorus|Interlude|Bridge|Outro|Post[-\s]?Chorus|"
    r"Transition|Break|Hook|Build[-\s]?Up|Inst|Solo|Drop|Instrumental|Breakdown)[^\]]*\]\s*$",
    re.I,
)


def _parse_lyric_sections(raw: str) -> list:
    sections: list[dict] = []
    tag: Optional[str] = None
    lines: list[str] = []
    for line in str(raw or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        t = line.strip()
        if not t:
            continue
        if _LYRIC_SECTION_TAG_RE.match(t):
            if tag is not None or lines:
                sections.append({"tag": tag, "lines": lines})
            tag = t
            lines = []
        else:
            lines.append(t)
    if tag is not None or lines:
        sections.append({"tag": tag, "lines": lines})
    return sections


def _section_content_fp(lines: list[str]) -> str:
    parts: list[str] = []
    for ln in lines:
        t = ln.strip()
        if not t:
            continue
        if t.startswith("(") and t.endswith(")") and len(t) < 48:
            continue
        parts.append(re.sub(r"\s+", " ", t).casefold())
    return "\n".join(parts)


def _dedupe_identical_lyric_sections(raw: str) -> str:
    """Drop 2nd/3rd sections whose sung text is identical to an earlier section."""
    sections = _parse_lyric_sections(raw)
    if len(sections) <= 1:
        return str(raw or "").strip()
    seen: set[str] = set()
    out: list[str] = []
    for sec in sections:
        fp = _section_content_fp(sec["lines"])
        if fp:
            if fp in seen:
                continue
            seen.add(fp)
        elif sec.get("tag"):
            empty_key = sec["tag"].casefold() + "::empty"
            if empty_key in seen:
                continue
            seen.add(empty_key)
        tag = sec.get("tag")
        if tag:
            if out:
                out.append("")
            out.append(tag)
        out.extend(sec["lines"])
    return "\n".join(out).strip()


def _finalize_lyrics_text(raw: str) -> str:
    text = _normalize_lyrics_for_minimax(raw)
    text = _dedupe_identical_lyric_sections(text)
    return text[:3500]


def _short_title_from_prompt(prompt: str) -> str:
    """First style tag only — never use the whole prompt as song title."""
    raw = (prompt or "").strip()
    if not raw:
        return "AI Music"
    first = re.split(r"[,，、;/｜|]+", raw, maxsplit=1)[0].strip()
    t = _sanitize_title(first, max_len=16)
    return t or "AI Music"


def _display_title_and_prompt(title: Any, prompt: Any) -> tuple:
    """Return (song_title, prompt) for API/UI; heal legacy rows that stored prompt as title."""
    t = (str(title) if title is not None else "").strip()
    p = (str(prompt) if prompt is not None else "").strip()
    legacy = False
    if not t:
        legacy = True
    elif p and (t == p or t.rstrip("…") == p[: len(t.rstrip("…"))]):
        # title was copied from prompt (full or truncated with …)
        legacy = True
    elif len(t) >= 24 and ("," in t or "，" in t) and not p:
        # very old: only title field filled with style dump
        p = t
        legacy = True
    elif p and len(t) >= 28 and t in p:
        legacy = True
    if legacy:
        t = _short_title_from_prompt(p) if p else "AI Music"
    if not t:
        t = "AI Music"
    return t, p


def _fallback_title_from_lyrics_or_prompt(lyrics: str, prompt: str) -> str:
    for line in (lyrics or "").splitlines():
        s = line.strip()
        if not s:
            continue
        if re.match(r"^\[.+\]$", s):
            continue
        if s.startswith("(") and s.endswith(")"):
            continue
        s = _sanitize_title(s, max_len=24)
        if s and len(s) >= 2:
            return s
    return _short_title_from_prompt(prompt)


async def _auto_title_deepseek(*, lyrics: str, prompt: str, instrumental: bool) -> str:
    """When user left title empty: DeepSeek short title from lyrics/prompt. Free of MiniMax title."""
    if not DEEPSEEK_API_KEY:
        return _fallback_title_from_lyrics_or_prompt(lyrics, prompt)
    style = (prompt or "").strip()[:400]
    ly = (lyrics or "").strip()[:1200]
    if instrumental:
        user_msg = (
            "请根据下面的纯音乐风格描述，起一个简短中文歌名（2–12字）。"
            "只输出歌名本身，不要引号、不要解释、不要换行。\n\n"
            f"风格：{style or '氛围纯音乐'}"
        )
    elif ly:
        user_msg = (
            "请根据下面的歌词（可参考风格），起一个简短中文歌名（2–12字）。"
            "只输出歌名本身，不要引号、不要解释、不要换行。\n\n"
            f"风格：{style or '未注明'}\n\n歌词：\n{ly}"
        )
    else:
        user_msg = (
            "请根据下面的歌曲风格描述，起一个简短中文歌名（2–12字）。"
            "只输出歌名本身，不要引号、不要解释、不要换行。\n\n"
            f"风格：{style or '流行歌曲'}"
        )
    try:
        raw = await _call_deepseek(
            [
                {
                    "role": "system",
                    "content": "你是华语流行音乐企划，擅长起短而有画面感的歌名。",
                },
                {"role": "user", "content": user_msg},
            ],
            use_json_mode=False,
            max_tokens=32,
            temperature=0.8,
            timeout=20.0,
        )
        title = _sanitize_title(raw or "", max_len=40)
        if title:
            return title
    except Exception:
        pass
    return _fallback_title_from_lyrics_or_prompt(lyrics, prompt)


async def _auto_lyrics_deepseek(*, prompt: str) -> str:
    """Fallback when MiniMax lyrics API is unavailable."""
    if not DEEPSEEK_API_KEY:
        return ""
    style = (prompt or "").strip()[:500] or "华语流行"
    try:
        raw = await _call_deepseek(
            [
                {
                    "role": "system",
                    "content": (
                        "你是华语流行作词人。请写完整歌词，使用结构标签如 [Verse]/[Chorus]/[Bridge]/[Outro]。"
                        "只输出歌词正文，不要歌名、不要解释。"
                    ),
                },
                {
                    "role": "user",
                    "content": f"请根据风格写一首可演唱的完整歌词：\n{style}",
                },
            ],
            use_json_mode=False,
            max_tokens=1200,
            temperature=0.85,
            timeout=60.0,
        )
        text = (raw or "").strip()
        if len(text) >= 20:
            return text[:3500]
    except Exception:
        pass
    return ""


async def _fetch_minimax_lyrics(
    client: httpx.AsyncClient,
    *,
    prompt: str,
    title: str,
    headers: Dict[str, str],
) -> Dict[str, str]:
    """
    MiniMax music_generation does NOT return lyric text even with lyrics_optimizer.
    Call lyrics_generation first so we can store & display lyrics.
    """
    body: Dict[str, Any] = {
        "mode": "write_full_song",
        "prompt": (prompt or "").strip()[:2000] or "Mandarin pop song",
    }
    if title:
        body["title"] = title[:120]
    resp = await client.post(MINIMAX_LYRICS_API_URL, headers=headers, json=body, timeout=LYRICS_TIMEOUT)
    try:
        data = resp.json() if resp.content else {}
    except Exception:
        data = {}
    base = data.get("base_resp") if isinstance(data.get("base_resp"), dict) else {}
    if resp.status_code >= 400 or (isinstance(base, dict) and base.get("status_code") not in (None, 0)):
        raise HTTPException(status_code=502, detail=_minimax_error_detail(data, resp))
    lyrics = str(data.get("lyrics") or "").strip()
    song_title = _sanitize_title(str(data.get("song_title") or ""), max_len=40)
    style_tags = str(data.get("style_tags") or "").strip()
    if not lyrics:
        raise HTTPException(status_code=502, detail="MiniMax lyrics API returned empty lyrics.")
    return {"lyrics": lyrics[:3500], "song_title": song_title, "style_tags": style_tags}


async def _ensure_lyrics_text(
    client: httpx.AsyncClient,
    *,
    prompt: str,
    title: str,
    headers: Dict[str, str],
) -> Dict[str, str]:
    """Return lyrics (+ optional title) for auto-lyrics mode."""
    try:
        return await _fetch_minimax_lyrics(client, prompt=prompt, title=title, headers=headers)
    except HTTPException:
        # Prefer DeepSeek over failing the whole song when lyrics API is down/paid-only.
        ly = await _auto_lyrics_deepseek(prompt=prompt)
        if ly:
            return {"lyrics": ly, "song_title": "", "style_tags": ""}
        raise
    except Exception:
        ly = await _auto_lyrics_deepseek(prompt=prompt)
        if ly:
            return {"lyrics": ly, "song_title": "", "style_tags": ""}
        raise HTTPException(status_code=502, detail="Failed to generate lyrics before music.")


def _list_price(model: str) -> Decimal:
    return money(LIST_PRICE_PER_SONG.get((model or "").strip(), LIST_PRICE_PER_SONG["music-3.0"]))


def pricing_public() -> dict:
    models = []
    for mid, list_p in LIST_PRICE_PER_SONG.items():
        models.append(
            {
                "id": mid,
                "listPriceCny": float(list_p),
                "userPriceCny": float(user_price_cny(list_p)),
            }
        )
    return {
        "provider": "minimax+lk888",
        "defaultModel": DEFAULT_MODEL if DEFAULT_MODEL in ALLOWED_MODELS else "music-3.0-free",
        "models": models,
        "markup": float(AI_MARKUP),
        # Back-compat fields for older clients
        "model": DEFAULT_MODEL,
        "listEstCny": float(_list_price(DEFAULT_MODEL)),
        "userEstCny": float(user_price_cny(_list_price(DEFAULT_MODEL))),
        "minimaxConfigured": bool(MINIMAX_API_KEY),
        "lk888Configured": lk888_music_configured(),
    }


def get_fun_music_config() -> dict:
    return {
        "configured": fun_music_configured(),
        "provider": "minimax+lk888",
        "model": DEFAULT_MODEL,
        "apiUrl": MINIMAX_MUSIC_API_URL,
        "pricing": pricing_public(),
    }


def _wallet_for(user: dict) -> dict:
    conn = _conn()
    try:
        return wallet_public(conn, user, is_admin=_is_admin(user))
    finally:
        conn.close()


def _assert_can_afford(user: dict, list_price: Decimal) -> None:
    if _is_admin(user):
        return
    # Free model: login only, no balance required
    if user_price_cny(list_price) <= 0:
        return
    conn = _conn()
    try:
        require_can_afford(conn, int(user["id"]), list_price)
    finally:
        conn.close()


def _charge_success(user: dict, list_price: Decimal, *, meta: dict) -> Optional[float]:
    if _is_admin(user):
        return None
    charge = user_price_cny(list_price)
    if charge <= 0:
        conn = _conn()
        try:
            return float(get_balance(conn, int(user["id"])))
        finally:
            conn.close()
    provider = str(meta.get("provider") or "minimax")
    conn = _conn()
    try:
        new_bal = try_charge(
            conn,
            int(user["id"]),
            charge,
            reason="ai_music",
            meta={
                **meta,
                "listPriceCny": float(list_price),
                "chargedCny": float(charge),
                "provider": provider,
            },
        )
        if new_bal is None:
            raise HTTPException(status_code=402, detail="Insufficient AI balance")
        return float(new_bal)
    finally:
        conn.close()


def _purge_old_results() -> None:
    now = time.time()
    dead = [rid for rid, meta in _results.items() if now - float(meta.get("created") or 0) > RESULT_TTL_SEC]
    public_root = str(PUBLIC_DIR.resolve())
    for rid in dead:
        meta = _results.pop(rid, None) or {}
        path = meta.get("path")
        if not path:
            continue
        # Never delete durable public tracks from disk via TTL purge
        try:
            resolved = str(Path(path).resolve())
            if resolved.startswith(public_root) or meta.get("public"):
                continue
        except Exception:
            pass
        try:
            Path(path).unlink(missing_ok=True)
        except Exception:
            pass


def _parse_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    s = str(value).strip().lower()
    if s in ("1", "true", "yes", "on", "y"):
        return True
    if s in ("0", "false", "no", "off", "n", ""):
        return False
    return default


def _hex_to_bytes(hex_str: str) -> bytes:
    s = (hex_str or "").strip()
    if s.startswith("0x") or s.startswith("0X"):
        s = s[2:]
    if not s:
        raise ValueError("empty audio hex")
    if len(s) % 2:
        s = "0" + s
    return bytes.fromhex(s)


def _minimax_error_detail(data: dict, resp: httpx.Response) -> str:
    base = data.get("base_resp") if isinstance(data.get("base_resp"), dict) else {}
    code = base.get("status_code")
    msg = (base.get("status_msg") or "").strip()
    if code == 1008:
        return (
            "MiniMax provider balance insufficient (1008). "
            "Top up the MiniMax account at platform.minimaxi.com "
            "(even music-*-free still requires a funded MiniMax account)."
        )
    if code == 1002:
        return "MiniMax rate limited (1002). Please retry later or use music-3.0."
    if code == 2049 or code == 1004:
        return "MiniMax API key invalid or unauthorized. Check MINIMAX_API_KEY."
    if code not in (None, 0) or msg:
        return f"MiniMax error {code}: {msg or 'failed'}"
    if resp.status_code >= 400:
        return (resp.text[:400] if resp.text else resp.reason_phrase) or f"HTTP {resp.status_code}"
    return "MiniMax music generation failed"


@router.get("/status")
def music_status(user: dict = Depends(_user)):
    return {
        "configured": fun_music_configured(),
        "provider": "minimax+lk888",
        "isAdmin": _is_admin(user),
        "wallet": _wallet_for(user),
        "pricing": pricing_public(),
        "apiUrlHost": MINIMAX_MUSIC_API_URL.split("/")[2] if "://" in MINIMAX_MUSIC_API_URL else "",
        "inviteNote": False,
    }


@router.post("/generate")
async def music_generate(
    prompt: str = Form(""),
    lyrics: str = Form(""),
    instrumental: str = Form("0"),
    lyrics_optimizer: str = Form("0"),
    format: str = Form("mp3"),
    model: str = Form(""),
    title: str = Form(""),
    public: str = Form("1"),
    user: dict = Depends(_user),
):
    if not fun_music_configured():
        raise HTTPException(
            status_code=503,
            detail="Music is not configured (need MINIMAX_API_KEY and/or LK888_API_KEY).",
        )

    use_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if use_model not in ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model. Use one of: {', '.join(sorted(ALLOWED_MODELS))}",
        )
    suno = is_suno_model(use_model)
    if suno and not lk888_music_configured():
        raise HTTPException(
            status_code=503,
            detail="逍遥 AI is not configured (LK888_API_KEY) for Suno.",
        )
    if (not suno) and not MINIMAX_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="MiniMax is not configured (MINIMAX_API_KEY).",
        )

    prompt_text = (prompt or "").strip()
    lyrics_text = (lyrics or "").strip()
    title_text = (title or "").strip()[:120]
    is_instrumental = _parse_bool(instrumental, default=False)
    use_lyrics_optimizer = _parse_bool(lyrics_optimizer, default=False)
    is_public = _parse_bool(public, default=True)
    fmt = (format or "mp3").strip().lower()
    if fmt not in ("mp3", "wav", "pcm"):
        fmt = "mp3"
    # Suno returns mp3/wav via download URL; force mp3 storage when unsure
    if suno and fmt == "pcm":
        fmt = "mp3"

    if is_instrumental:
        if not prompt_text:
            raise HTTPException(status_code=400, detail="Please enter a music prompt for instrumental.")
        if len(prompt_text) > 2000:
            raise HTTPException(status_code=400, detail="Prompt is too long (max 2000 characters).")
        lyrics_text = ""
        use_lyrics_optimizer = False
    elif suno:
        # Suno can AI-write lyrics from style prompt alone (empty lyrics).
        if not prompt_text and not lyrics_text and not use_lyrics_optimizer:
            raise HTTPException(
                status_code=400,
                detail="Please enter a style prompt and/or lyrics for Suno.",
            )
        if lyrics_text and len(lyrics_text) > 3500:
            raise HTTPException(status_code=400, detail="Lyrics are too long.")
        if prompt_text and len(prompt_text) > 2000:
            raise HTTPException(status_code=400, detail="Prompt is too long (max 2000 characters).")
        # Auto-lyrics = leave lyrics empty for Suno (no MiniMax lyrics call)
        if use_lyrics_optimizer and not lyrics_text:
            if not prompt_text:
                raise HTTPException(status_code=400, detail="Please enter a prompt or lyrics.")
            use_lyrics_optimizer = False
    else:
        if lyrics_text:
            if len(lyrics_text) > 3500:
                raise HTTPException(status_code=400, detail="Lyrics are too long.")
            use_lyrics_optimizer = False
        elif use_lyrics_optimizer:
            if not prompt_text:
                raise HTTPException(status_code=400, detail="Please enter a prompt or lyrics.")
        else:
            raise HTTPException(status_code=400, detail="Please enter lyrics (or enable auto lyrics).")
        if prompt_text and len(prompt_text) > 2000:
            raise HTTPException(status_code=400, detail="Prompt is too long (max 2000 characters).")

    list_price = _list_price(use_model)
    _assert_can_afford(user, list_price)
    provider = _provider_for_model(use_model)

    if suno:
        try:
            audio_bytes, ctype, ext, duration = await generate_suno_music(
                prompt=prompt_text or "pop song",
                lyrics=lyrics_text,
                instrumental=is_instrumental,
            )
            if not title_text:
                title_text = await _auto_title_deepseek(
                    lyrics=lyrics_text,
                    prompt=prompt_text,
                    instrumental=is_instrumental,
                )
            _purge_old_results()
            result_id = secrets.token_hex(16)
            file_name = f"{result_id}{ext}"
            path = (PUBLIC_DIR if is_public else TMP_DIR) / file_name
            path.write_bytes(audio_bytes)

            charged_cny = 0.0
            try:
                bal_after = _charge_success(
                    user,
                    list_price,
                    meta={
                        "model": use_model,
                        "duration": duration,
                        "instrumental": is_instrumental,
                        "resultId": result_id,
                        "title": title_text,
                        "public": is_public,
                        "provider": provider,
                    },
                )
                if not _is_admin(user):
                    charged_cny = float(user_price_cny(list_price))
                if is_public:
                    _insert_public_track(
                        track_id=result_id,
                        user_id=int(user["id"]),
                        title=title_text or "AI Music",
                        prompt=prompt_text,
                        lyrics=lyrics_text,
                        model=use_model,
                        duration=duration,
                        content_type=ctype,
                        file_ext=ext,
                        file_name=file_name,
                    )
            except HTTPException:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass
                raise

            _results[result_id] = {
                "user_id": int(user["id"]),
                "created": time.time(),
                "path": str(path),
                "content_type": ctype,
                "ext": ext,
                "model": use_model,
                "duration": duration,
                "list_price": float(list_price),
                "charged": charged_cny,
                "prompt": prompt_text,
                "lyrics": lyrics_text,
                "title": title_text,
                "public": is_public,
                "provider": provider,
            }
            wallet = _wallet_for(user)
            out: Dict[str, Any] = {
                "success": True,
                "resultId": result_id,
                "provider": provider,
                "model": use_model,
                "duration": duration,
                "listPriceCny": float(list_price),
                "userPriceCny": float(user_price_cny(list_price)),
                "chargedCny": charged_cny,
                "lyrics": lyrics_text,
                "prompt": prompt_text,
                "title": title_text,
                "public": is_public,
                "contentType": ctype,
                "proxyUrl": f"/music/result/{result_id}",
                "downloadUrl": f"/music/result/{result_id}?download=1",
                "wallet": wallet,
                "aiWallet": wallet,
                "balanceCny": wallet.get("balanceCny"),
            }
            if is_public:
                out["publicId"] = result_id
                out["publicStreamUrl"] = f"/music/public/{result_id}"
                out["publicDownloadUrl"] = f"/music/public/{result_id}?download=1"
            if bal_after is not None:
                out["balanceCny"] = bal_after
            return out
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Suno generation failed: {exc}") from exc

    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json",
    }

    body: Dict[str, Any] = {
        "model": use_model,
        "stream": False,
        "output_format": "hex",
        "is_instrumental": is_instrumental,
        "aigc_watermark": False,
        "audio_setting": {
            "sample_rate": 44100,
            "bitrate": 256000,
            "format": fmt,
        },
    }
    if prompt_text:
        body["prompt"] = prompt_text
    if is_instrumental:
        body["prompt"] = prompt_text

    try:
        async with httpx.AsyncClient(timeout=MUSIC_TIMEOUT) as client:
            # music_generation never returns lyric text — resolve lyrics first when auto mode.
            if (not is_instrumental) and use_lyrics_optimizer and not lyrics_text:
                pack = await _ensure_lyrics_text(
                    client,
                    prompt=prompt_text,
                    title=title_text,
                    headers=headers,
                )
                lyrics_text = pack.get("lyrics") or ""
                if not title_text and pack.get("song_title"):
                    title_text = pack["song_title"]
                use_lyrics_optimizer = False

            if not is_instrumental:
                if lyrics_text:
                    lyrics_text = _finalize_lyrics_text(lyrics_text)
                    body["lyrics"] = lyrics_text
                elif use_lyrics_optimizer:
                    # Last resort: vendor may still sing, but we cannot display lyrics.
                    body["lyrics_optimizer"] = True

            resp = await client.post(MINIMAX_MUSIC_API_URL, headers=headers, json=body)
            try:
                data = resp.json() if resp.content else {}
            except Exception:
                data = {}

            base = data.get("base_resp") if isinstance(data.get("base_resp"), dict) else {}
            if resp.status_code >= 400 or (isinstance(base, dict) and base.get("status_code") not in (None, 0)):
                raise HTTPException(status_code=502, detail=_minimax_error_detail(data, resp))

            payload = data.get("data") if isinstance(data.get("data"), dict) else {}
            audio_hex = str(payload.get("audio") or "").strip()
            if not audio_hex:
                raise HTTPException(status_code=502, detail="MiniMax returned no audio data.")

            try:
                audio_bytes = _hex_to_bytes(audio_hex)
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"Invalid audio hex from MiniMax: {exc}") from exc
            if not audio_bytes:
                raise HTTPException(status_code=502, detail="MiniMax returned empty audio.")

            extra = data.get("extra_info") if isinstance(data.get("extra_info"), dict) else {}
            duration_ms = int(extra.get("music_duration") or 0)
            duration = max(1, int(round(duration_ms / 1000.0))) if duration_ms > 0 else 0
            if duration < 1:
                duration = max(1, int(len(audio_bytes) / 32000))

            # Prefer model-returned lyrics when auto-generated
            out_lyrics = lyrics_text
            for candidate in (
                payload.get("lyrics"),
                payload.get("lyric"),
                extra.get("lyrics") if isinstance(extra, dict) else None,
                (data.get("analysis_info") or {}).get("lyrics")
                if isinstance(data.get("analysis_info"), dict)
                else None,
            ):
                if candidate and str(candidate).strip():
                    out_lyrics = str(candidate).strip()
                    break
            lyrics_text = out_lyrics

            # MiniMax music_generation does not return a title. Empty title → DeepSeek (or fallback).
            if not title_text:
                title_text = await _auto_title_deepseek(
                    lyrics=lyrics_text,
                    prompt=prompt_text,
                    instrumental=is_instrumental,
                )

            if fmt == "wav":
                ctype = "audio/wav"
                ext = ".wav"
            elif fmt == "pcm":
                ctype = "audio/L16"
                ext = ".pcm"
            else:
                ctype = "audio/mpeg"
                ext = ".mp3"

            _purge_old_results()
            result_id = secrets.token_hex(16)
            file_name = f"{result_id}{ext}"
            if is_public:
                path = PUBLIC_DIR / file_name
            else:
                path = TMP_DIR / file_name
            path.write_bytes(audio_bytes)

            charged_cny = 0.0
            try:
                bal_after = _charge_success(
                    user,
                    list_price,
                    meta={
                        "model": use_model,
                        "duration": duration,
                        "instrumental": is_instrumental,
                        "resultId": result_id,
                        "title": title_text,
                        "public": is_public,
                        "provider": provider,
                    },
                )
                if not _is_admin(user):
                    charged_cny = float(user_price_cny(list_price))
                if is_public:
                    display_title = title_text or "AI Music"
                    _insert_public_track(
                        track_id=result_id,
                        user_id=int(user["id"]),
                        title=display_title,
                        prompt=prompt_text,
                        lyrics=lyrics_text,
                        model=use_model,
                        duration=duration,
                        content_type=ctype,
                        file_ext=ext,
                        file_name=file_name,
                    )
            except HTTPException:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass
                raise

            _results[result_id] = {
                "user_id": int(user["id"]),
                "created": time.time(),
                "path": str(path),
                "content_type": ctype,
                "ext": ext,
                "model": use_model,
                "duration": duration,
                "list_price": float(list_price),
                "charged": charged_cny,
                "prompt": prompt_text,
                "lyrics": lyrics_text,
                "title": title_text,
                "public": is_public,
                "provider": provider,
                "balance_after": bal_after,
            }
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Music generation timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Music generation failed: {exc}") from exc

    wallet = _wallet_for(user)
    out = {
        "success": True,
        "resultId": result_id,
        "provider": provider,
        "model": use_model,
        "duration": duration,
        "listPriceCny": float(list_price),
        "userPriceCny": float(user_price_cny(list_price)),
        "chargedCny": charged_cny,
        "lyrics": lyrics_text,
        "prompt": prompt_text,
        "title": title_text,
        "public": is_public,
        "contentType": ctype,
        "proxyUrl": f"/music/result/{result_id}",
        "downloadUrl": f"/music/result/{result_id}?download=1",
        "wallet": wallet,
        "aiWallet": wallet,
        "balanceCny": wallet.get("balanceCny"),
    }
    if is_public:
        out["publicId"] = result_id
        out["publicStreamUrl"] = f"/music/public/{result_id}"
        out["publicDownloadUrl"] = f"/music/public/{result_id}?download=1"
    return out


@router.get("/public/list")
def music_public_list(
    limit: int = 50,
    offset: int = 0,
    viewer: Optional[dict] = Depends(_optional_user),
):
    lim = max(1, min(500, int(limit or 50)))
    off = max(0, int(offset or 0))
    can_admin = _is_admin(viewer) if viewer else False
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_music_schema(cur)
            cur.execute("SELECT COUNT(*) AS c FROM music_tracks WHERE is_public=1")
            total_row = cur.fetchone() or {}
            total = int(total_row.get("c") or 0)
            cur.execute(
                """
                SELECT m.id, m.title, m.prompt, m.lyrics, m.model, m.duration_sec,
                       m.content_type, m.created_at, m.file_name, m.user_id,
                       u.nickname AS creator_nickname,
                       u.phone AS creator_phone,
                       u.email AS creator_email
                FROM music_tracks m
                LEFT JOIN users u ON u.id = m.user_id
                WHERE m.is_public=1
                ORDER BY m.created_at DESC
                LIMIT %s OFFSET %s
                """,
                (lim, off),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    items = []
    for row in rows:
        tid = str(row.get("id") or "")
        file_name = str(row.get("file_name") or (tid + ".mp3"))
        try:
            path = _public_file_path(file_name)
        except HTTPException:
            continue
        if not path.is_file():
            # Orphan DB row after deploy wipe — hide from list
            continue
        created = row.get("created_at")
        ly = (row.get("lyrics") or "").strip()
        if ly:
            ly = _dedupe_identical_lyric_sections(ly)
        song_title, song_prompt = _display_title_and_prompt(row.get("title"), row.get("prompt"))
        creator = _creator_public(row)
        items.append(
            {
                "id": tid,
                "title": song_title,
                "prompt": song_prompt[:400],
                "lyrics": ly,
                "model": row.get("model") or "",
                "duration": int(row.get("duration_sec") or 0),
                "contentType": row.get("content_type") or "audio/mpeg",
                "createdAt": _format_created_at_cn(created),
                "creatorNickname": creator["creatorNickname"],
                "creatorPhone": creator["creatorPhone"],
                "streamUrl": f"/music/public/{tid}",
                "downloadUrl": f"/music/public/{tid}?download=1",
            }
        )
    return {
        "success": True,
        "items": items,
        "limit": lim,
        "offset": off,
        "total": total,
        "canAdmin": can_admin,
    }


@router.delete("/public/{track_id}")
def music_public_delete(track_id: str, admin: dict = Depends(_admin_user)):
    tid = "".join(ch for ch in str(track_id or "") if ch.isalnum())
    if len(tid) < 16:
        raise HTTPException(status_code=404, detail="Music not found")
    conn = _conn()
    file_name = ""
    try:
        with conn.cursor() as cur:
            _ensure_music_schema(cur)
            cur.execute(
                """
                SELECT file_name FROM music_tracks
                WHERE id=%s AND is_public=1
                LIMIT 1
                """,
                (tid,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Music not found")
            file_name = str(row.get("file_name") or "")
            cur.execute("DELETE FROM music_tracks WHERE id=%s", (tid,))
    finally:
        conn.close()
    if file_name:
        try:
            path = _public_file_path(file_name)
            if path.is_file():
                path.unlink()
        except Exception:
            pass
    _results.pop(tid, None)
    return {"success": True, "deletedId": tid}


def _ascii_filename(stem: str, ext: str, *, fallback: str = "ai-music") -> str:
    """HTTP Content-Disposition must be latin-1 safe; keep ASCII-only names."""
    import re

    e = str(ext or ".mp3")
    if not e.startswith("."):
        e = "." + e
    raw = str(stem or "").strip()
    ascii_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip("-._")[:60]
    if not ascii_stem:
        ascii_stem = fallback
    return f"{ascii_stem}{e}"


def _invalidate_traditional_cache() -> None:
    global _traditional_manifest_cache
    _traditional_manifest_cache = (0.0, [])


def _save_traditional_manifest(items: list) -> None:
    TRADITIONAL_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "items": items}
    TRADITIONAL_MANIFEST.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _invalidate_traditional_cache()


def _next_traditional_id(items: list) -> str:
    max_n = 0
    for row in items:
        tid = str(row.get("id") or "")
        m = re.fullmatch(r"t(\d+)", tid)
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"t{max_n + 1:03d}"


def _normalize_source_name(name: str) -> str:
    return Path(str(name or "")).name.strip().lower()


def _traditional_source_exists(items: list, orig_name: str) -> bool:
    key = _normalize_source_name(orig_name)
    if not key:
        return False
    for row in items:
        if _normalize_source_name(str(row.get("source") or "")) == key:
            return True
    return False


def _parse_upload_filename(name: str) -> tuple[str, str]:
    stem = Path(str(name or "")).stem.strip()
    if not stem:
        return "", "未命名"
    if "-" in stem:
        artist, title = stem.split("-", 1)
        artist = artist.strip()
        title = title.strip()
        title = re.split(r"-(?=[《])|《", title)[0].strip() or title
        return artist, title or stem
    return "", stem


def _ffmpeg_available() -> bool:
    return bool(shutil.which("ffmpeg"))


def _probe_duration_sync(path: Path) -> int:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe or not path.is_file():
        return 0
    try:
        out = subprocess.check_output(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return max(0, int(float(out or 0)))
    except Exception:
        return 0


def _make_preview_mp3(src: Path, dst: Path) -> bool:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not src.is_file():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(src),
                "-codec:a",
                "libmp3lame",
                "-b:a",
                TRADITIONAL_PREVIEW_BITRATE,
                "-ac",
                "2",
                "-ar",
                "44100",
                str(dst),
            ],
            check=True,
            timeout=600,
        )
        return dst.is_file() and dst.stat().st_size > 0
    except Exception:
        return False


async def _lookup_lyrics_deepseek(*, artist: str, title: str) -> str:
    """Best-effort lyrics via DeepSeek (no web crawler)."""
    if not DEEPSEEK_API_KEY:
        return ""
    artist = (artist or "").strip()
    title = (title or "").strip()
    if not title:
        return ""
    label = f"{artist}《{title}》" if artist else f"《{title}》"
    try:
        raw = await _call_deepseek(
            [
                {
                    "role": "system",
                    "content": (
                        "你是华语流行歌词助手。用户给出歌手与歌名时，若你知道该曲常见公开歌词，"
                        "按行输出完整歌词正文；不要标题、不要解释、不要 Markdown。"
                        "若不确定或无法提供可靠歌词，只输出一个空行。"
                    ),
                },
                {
                    "role": "user",
                    "content": f"请输出歌曲 {label} 的歌词正文（仅歌词）：",
                },
            ],
            use_json_mode=False,
            max_tokens=2000,
            temperature=0.2,
            timeout=45.0,
        )
        text = (raw or "").strip()
        if len(text) < 12:
            return ""
        return text[:8000]
    except Exception:
        return ""


async def _lookup_artist_deepseek(*, title: str) -> str:
    """Deprecated: traditional uploads only use「歌手-歌名」from the filename."""
    return ""


def _traditional_public_item(row: dict, *, include_lyrics: bool = True) -> dict:
    tid = str(row.get("id") or "").strip()
    preview = str(row.get("previewFile") or "").strip()
    ly = str(row.get("lyrics") or "")
    item = {
        "id": tid,
        "title": str(row.get("title") or tid).strip() or tid,
        "artist": str(row.get("artist") or "").strip(),
        "duration": int(row.get("duration") or 0),
        "contentType": str(row.get("contentType") or "audio/mpeg"),
        "hasPreview": bool(preview),
        "hasLyrics": bool(ly.strip()),
        "source": str(row.get("source") or "").strip(),
        "streamUrl": f"/music/traditional/{tid}",
        "previewUrl": f"/music/traditional/{tid}",
        "fullUrl": f"/music/traditional/{tid}?full=1",
        "downloadUrl": f"/music/traditional/{tid}?download=1",
    }
    if include_lyrics:
        item["lyrics"] = ly
    else:
        item["lyricsPreview"] = ly[:120] + ("…" if len(ly) > 120 else "")
    return item


def _traditional_admin_item(row: dict) -> dict:
    tid = str(row.get("id") or "").strip()
    full_name = str(row.get("file") or "").strip()
    preview_name = str(row.get("previewFile") or "").strip()
    full_path = TRADITIONAL_DIR / full_name if full_name else None
    preview_path = TRADITIONAL_DIR / preview_name if preview_name else None
    ly = str(row.get("lyrics") or "")
    return {
        **_traditional_public_item(row),
        "source": str(row.get("source") or ""),
        "createdAt": str(row.get("createdAt") or ""),
        "fullBytes": full_path.stat().st_size if full_path and full_path.is_file() else 0,
        "previewBytes": preview_path.stat().st_size if preview_path and preview_path.is_file() else 0,
        "lyricsPreview": ly[:120] + ("…" if len(ly) > 120 else ""),
        "hasLyrics": bool(ly.strip()),
    }


def _load_traditional_manifest() -> list:
    global _traditional_manifest_cache
    now = time.time()
    cached_at, cached_items = _traditional_manifest_cache
    if cached_items and now - cached_at < 30:
        return cached_items
    if not TRADITIONAL_MANIFEST.is_file():
        _traditional_manifest_cache = (now, [])
        return []
    try:
        raw = json.loads(TRADITIONAL_MANIFEST.read_text(encoding="utf-8"))
        items = raw.get("items") if isinstance(raw, dict) else raw
        if not isinstance(items, list):
            items = []
        _traditional_manifest_cache = (now, items)
        return items
    except Exception:
        _traditional_manifest_cache = (now, [])
        return []


def _traditional_track_row(track_id: str) -> Optional[dict]:
    tid = re.sub(r"[^a-zA-Z0-9_-]", "", str(track_id or ""))[:48]
    if not tid:
        return None
    for row in _load_traditional_manifest():
        if str(row.get("id") or "") == tid:
            return row
    return None


@router.get("/traditional/admin/list")
def music_traditional_admin_list(limit: int = 500, offset: int = 0, admin: dict = Depends(_admin_user)):
    del admin
    all_items = _load_traditional_manifest()
    lim = max(1, min(int(limit or 500), 1000))
    off = max(0, int(offset or 0))
    items = [_traditional_admin_item(row) for row in all_items[off : off + lim] if row.get("id")]
    return {
        "success": True,
        "items": items,
        "limit": lim,
        "offset": off,
        "total": len(all_items),
        "ffmpegAvailable": _ffmpeg_available(),
    }


@router.delete("/traditional/admin/{track_id}")
def music_traditional_admin_delete(track_id: str, admin: dict = Depends(_admin_user)):
    del admin
    tid = re.sub(r"[^a-zA-Z0-9_-]", "", str(track_id or ""))[:48]
    if not tid:
        raise HTTPException(status_code=404, detail="Music not found")
    items = _load_traditional_manifest()
    row = _traditional_track_row(tid)
    if not row:
        raise HTTPException(status_code=404, detail="Music not found")
    for fname in {str(row.get("file") or ""), str(row.get("previewFile") or "")}:
        if not fname or fname != Path(fname).name or ".." in fname:
            continue
        path = TRADITIONAL_DIR / fname
        if path.is_file():
            try:
                path.unlink()
            except Exception:
                pass
    new_items = [it for it in items if str(it.get("id") or "") != tid]
    _save_traditional_manifest(new_items)
    return {"success": True, "deletedId": tid}


@router.post("/traditional/admin/reparse-from-source")
def music_traditional_reparse_from_source(admin: dict = Depends(_admin_user)):
    """Re-parse artist/title from stored source filename (歌手-歌名.mp3)."""
    del admin
    items = _load_traditional_manifest()
    changed = 0
    skipped = 0
    for row in items:
        src = str(row.get("source") or "").strip()
        if not src:
            skipped += 1
            continue
        artist, title = _parse_upload_filename(src)
        old_artist = str(row.get("artist") or "").strip()
        old_title = str(row.get("title") or "").strip()
        if artist == old_artist and title == old_title:
            continue
        row["artist"] = artist
        row["title"] = title
        changed += 1
    if changed:
        _save_traditional_manifest(items)
    return {
        "success": True,
        "changed": changed,
        "skipped": skipped,
        "total": len(items),
    }


@router.post("/traditional/admin/{track_id}/meta")
async def music_traditional_update_meta(
    track_id: str,
    artist: str = Form(""),
    title: str = Form(""),
    admin: dict = Depends(_admin_user),
):
    """Manually set artist/title when source filename was wrong."""
    del admin
    tid = re.sub(r"[^a-zA-Z0-9_-]", "", str(track_id or ""))[:48]
    if not tid:
        raise HTTPException(status_code=404, detail="Music not found")
    items = _load_traditional_manifest()
    row = None
    for it in items:
        if str(it.get("id") or "") == tid:
            row = it
            break
    if not row:
        raise HTTPException(status_code=404, detail="Music not found")
    new_title = (title or "").strip()
    new_artist = (artist or "").strip()
    # Title optional: admin “改歌手” only sends artist.
    if new_title:
        row["title"] = new_title[:200]
    row["artist"] = new_artist[:120]
    _save_traditional_manifest(items)
    return {"success": True, "item": _traditional_admin_item(row)}


@router.post("/traditional/admin/upload")
async def music_traditional_admin_upload(
    file: UploadFile = File(...),
    fetch_lyrics: int = Form(0),
    admin: dict = Depends(_admin_user),
):
    del admin
    orig_name = Path(str(file.filename or "upload.mp3")).name
    if not orig_name.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only MP3 files are supported")
    raw = await file.read()
    max_bytes = TRADITIONAL_UPLOAD_MAX_MB * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large (max {TRADITIONAL_UPLOAD_MAX_MB}MB)")
    if len(raw) < 1024:
        raise HTTPException(status_code=400, detail="File too small")

    items = _load_traditional_manifest()
    if _traditional_source_exists(items, orig_name):
        raise HTTPException(status_code=409, detail=f"Already uploaded: {orig_name}")
    tid = _next_traditional_id(items)
    artist, title = _parse_upload_filename(orig_name)
    full_name = f"{tid}.mp3"
    preview_name = f"{tid}.preview.mp3"
    full_path = TRADITIONAL_DIR / full_name
    preview_path = TRADITIONAL_DIR / preview_name
    TRADITIONAL_DIR.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(raw)

    preview_ok = _make_preview_mp3(full_path, preview_path)
    if not preview_ok:
        preview_name = full_name

    lyrics = ""
    if int(fetch_lyrics or 0):
        lyrics = await _lookup_lyrics_deepseek(artist=artist, title=title)

    duration = _probe_duration_sync(full_path)
    created = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    row = {
        "id": tid,
        "title": title,
        "artist": artist,
        "file": full_name,
        "previewFile": preview_name,
        "lyrics": lyrics,
        "duration": duration,
        "contentType": "audio/mpeg",
        "source": orig_name,
        "createdAt": _format_created_at_cn(created),
    }
    items.append(row)
    _save_traditional_manifest(items)
    return {
        "success": True,
        "item": _traditional_admin_item(row),
        "previewGenerated": preview_ok,
        "lyricsFetched": bool(lyrics.strip()),
    }


@router.get("/traditional/list")
def music_traditional_list(limit: int = 100, offset: int = 0):
    all_items = _load_traditional_manifest()
    lim = max(1, min(int(limit or 100), 500))
    off = max(0, int(offset or 0))
    items = []
    for row in all_items[off : off + lim]:
        tid = str(row.get("id") or "").strip()
        if not tid:
            continue
        items.append(_traditional_public_item(row, include_lyrics=False))
    return {
        "success": True,
        "items": items,
        "limit": lim,
        "offset": off,
        "total": len(all_items),
    }


@router.get("/traditional/{track_id}/meta")
def music_traditional_meta(track_id: str):
    tid = re.sub(r"[^a-zA-Z0-9_-]", "", str(track_id or ""))[:48]
    if not tid:
        raise HTTPException(status_code=404, detail="Music not found")
    row = _traditional_track_row(tid)
    if not row:
        raise HTTPException(status_code=404, detail="Music not found")
    return {"success": True, "item": _traditional_public_item(row, include_lyrics=True)}


@router.get("/traditional/{track_id}")
def music_traditional_file(track_id: str, download: int = 0, full: int = 0):
    tid = re.sub(r"[^a-zA-Z0-9_-]", "", str(track_id or ""))[:48]
    if not tid:
        raise HTTPException(status_code=404, detail="Music not found")
    row = _traditional_track_row(tid)
    if not row:
        raise HTTPException(status_code=404, detail="Music not found")
    if download:
        fname = str(row.get("file") or "").strip()
    elif full:
        fname = str(row.get("file") or "").strip()
    else:
        preview = str(row.get("previewFile") or "").strip()
        fname = preview or str(row.get("file") or "").strip()
    if not fname or fname != Path(fname).name or ".." in fname:
        raise HTTPException(status_code=404, detail="Music file missing")
    path = TRADITIONAL_DIR / fname
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Music file missing")
    ext = path.suffix or ".mp3"
    filename = _ascii_filename(tid, ext, fallback=f"traditional-{tid}")
    headers = {
        "Content-Disposition": (
            f'{"attachment" if download else "inline"}; filename="{filename}"'
        ),
    }
    if not download:
        headers["Cache-Control"] = "public, max-age=86400"
        headers["Accept-Ranges"] = "bytes"
    return FileResponse(
        path,
        media_type=str(row.get("contentType") or "audio/mpeg"),
        headers=headers,
    )


@router.get("/public/{track_id}")
def music_public_file(track_id: str, download: int = 0):
    tid = "".join(ch for ch in str(track_id or "") if ch.isalnum())
    if len(tid) < 16:
        raise HTTPException(status_code=404, detail="Music not found")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_music_schema(cur)
            cur.execute(
                """
                SELECT file_name, content_type, file_ext, title
                FROM music_tracks
                WHERE id=%s AND is_public=1
                LIMIT 1
                """,
                (tid,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Music not found")
    path = _public_file_path(str(row.get("file_name") or ""))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Music file missing")
    ext = row.get("file_ext") or path.suffix or ".mp3"
    # Prefer stable id for header safety; Chinese titles break latin-1 headers.
    filename = _ascii_filename(f"ai-music-{tid}", ext, fallback=f"ai-music-{tid}")
    headers = {
        "Content-Disposition": (
            f'{"attachment" if download else "inline"}; filename="{filename}"'
        ),
    }
    if not download:
        headers["Cache-Control"] = "public, max-age=86400"
    return FileResponse(
        path,
        media_type=str(row.get("content_type") or "audio/mpeg"),
        headers=headers,
    )


@router.get("/result/{result_id}")
def music_result(
    result_id: str,
    download: int = 0,
    user: dict = Depends(_user),
):
    _purge_old_results()
    meta = _results.get(result_id)
    if not meta:
        # Fall back to durable public track owned by caller
        tid = "".join(ch for ch in str(result_id or "") if ch.isalnum())
        conn = _conn()
        try:
            with conn.cursor() as cur:
                _ensure_music_schema(cur)
                cur.execute(
                    """
                    SELECT user_id, file_name, content_type, file_ext
                    FROM music_tracks WHERE id=%s LIMIT 1
                    """,
                    (tid,),
                )
                row = cur.fetchone()
        finally:
            conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Music result expired or not found")
        if int(row.get("user_id") or 0) != int(user["id"]) and not _is_admin(user):
            raise HTTPException(status_code=403, detail="Forbidden")
        path = _public_file_path(str(row.get("file_name") or ""))
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Music file missing")
        filename = f"ai-music-{tid}{row.get('file_ext') or '.mp3'}"
        headers = {}
        if download:
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        else:
            headers["Content-Disposition"] = f'inline; filename="{filename}"'
        return FileResponse(
            path,
            media_type=str(row.get("content_type") or "audio/mpeg"),
            headers=headers,
            filename=filename if download else None,
        )
    if int(meta.get("user_id") or 0) != int(user["id"]) and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    path = Path(str(meta.get("path") or ""))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Music file missing")
    filename = f"ai-music-{result_id}{meta.get('ext') or '.mp3'}"
    headers = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    else:
        headers["Content-Disposition"] = f'inline; filename="{filename}"'
    return FileResponse(
        path,
        media_type=str(meta.get("content_type") or "audio/mpeg"),
        headers=headers,
        filename=filename if download else None,
    )
