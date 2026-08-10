"""MiniMax Music Generation — sync generate + charge on success.

Models:
  - music-3.0-free: vendor ¥0/song → user ¥0
  - music-3.0: vendor ¥1/song → user ¥2 (× AI_PRICE_MARKUP, default 2)

Env: MINIMAX_API_KEY (required). Optional MINIMAX_MUSIC_API_URL, MINIMAX_MUSIC_TIMEOUT.
"""

from __future__ import annotations

import os
import re
import secrets
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, Form, HTTPException
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
from recipe_ai import DEEPSEEK_API_KEY, _call_deepseek

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/music", tags=["music"])

CN_TZ = ZoneInfo("Asia/Shanghai")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@toolbasecamp.com").lower()
MINIMAX_API_KEY = (os.environ.get("MINIMAX_API_KEY") or "").strip()
MINIMAX_MUSIC_API_URL = (
    os.environ.get("MINIMAX_MUSIC_API_URL") or "https://api.minimaxi.com/v1/music_generation"
).strip().rstrip("/")
MUSIC_TIMEOUT = float(os.environ.get("MINIMAX_MUSIC_TIMEOUT") or os.environ.get("FUN_MUSIC_TIMEOUT") or "360")
DEFAULT_MODEL = (os.environ.get("MINIMAX_MUSIC_MODEL") or "music-3.0-free").strip() or "music-3.0-free"

# Vendor list price CNY per song (MiniMax paygo)
LIST_PRICE_PER_SONG = {
    "music-3.0-free": Decimal("0"),
    "music-3.0": Decimal("1.0"),
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


def _wire(get_conn, require_db, get_current_user):
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]


def _user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    return router.get_current_user(creds)  # type: ignore[attr-defined]


def _conn():
    router.require_db()  # type: ignore[attr-defined]
    return router.get_conn()  # type: ignore[attr-defined]


def _is_admin(user: dict) -> bool:
    return user.get("role") == "admin" or (user.get("email") or "").lower() == ADMIN_EMAIL


def fun_music_configured() -> bool:
    return bool(MINIMAX_API_KEY)


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
        "provider": "minimax",
        "defaultModel": DEFAULT_MODEL if DEFAULT_MODEL in ALLOWED_MODELS else "music-3.0-free",
        "models": models,
        "markup": float(AI_MARKUP),
        # Back-compat fields for older clients
        "model": DEFAULT_MODEL,
        "listEstCny": float(_list_price(DEFAULT_MODEL)),
        "userEstCny": float(user_price_cny(_list_price(DEFAULT_MODEL))),
    }


def get_fun_music_config() -> dict:
    return {
        "configured": fun_music_configured(),
        "provider": "minimax",
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
                "provider": "minimax",
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
        "provider": "minimax",
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
            detail="MiniMax is not configured (MINIMAX_API_KEY).",
        )

    use_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if use_model not in ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model. Use one of: {', '.join(sorted(ALLOWED_MODELS))}",
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

    if is_instrumental:
        if not prompt_text:
            raise HTTPException(status_code=400, detail="Please enter a music prompt for instrumental.")
        if len(prompt_text) > 2000:
            raise HTTPException(status_code=400, detail="Prompt is too long (max 2000 characters).")
        lyrics_text = ""
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
    else:
        if lyrics_text:
            body["lyrics"] = lyrics_text
        if use_lyrics_optimizer:
            body["lyrics_optimizer"] = True

    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=MUSIC_TIMEOUT) as client:
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
                "lyrics": lyrics_text,
                "prompt": prompt_text,
                "title": title_text,
                "public": is_public,
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
        "provider": "minimax",
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
def music_public_list(limit: int = 50, offset: int = 0):
    lim = max(1, min(100, int(limit or 50)))
    off = max(0, int(offset or 0))
    conn = _conn()
    try:
        with conn.cursor() as cur:
            _ensure_music_schema(cur)
            cur.execute(
                """
                SELECT id, title, prompt, lyrics, model, duration_sec, content_type, created_at, file_name
                FROM music_tracks
                WHERE is_public=1
                ORDER BY created_at DESC
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
        song_title, song_prompt = _display_title_and_prompt(row.get("title"), row.get("prompt"))
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
                "streamUrl": f"/music/public/{tid}",
                "downloadUrl": f"/music/public/{tid}?download=1",
            }
        )
    return {"success": True, "items": items, "limit": lim, "offset": off}


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
