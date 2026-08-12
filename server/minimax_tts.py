"""MiniMax Speech TTS (speech-2.8) + voice cloning.

Billing (vendor list × AI_PRICE_MARKUP), charge on success only:
- speech-2.8-turbo: ¥2 / 10k chars
- speech-2.8-hd: ¥3.5 / 10k chars
- voice clone fee: ¥9.9 on first successful T2A with that voice
  (clone API preview charges TTS chars only; does not activate the ¥9.9 fee)
"""

from __future__ import annotations

import base64
import os
import re
import secrets
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ai_wallet import (
    AI_MARKUP,
    money,
    require_can_afford,
    try_charge,
    user_price_cny,
    wallet_public,
)

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/tts", tags=["tts"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@toolbasecamp.com").lower()
MINIMAX_API_KEY = (os.environ.get("MINIMAX_API_KEY") or "").strip()
MINIMAX_API_BASE = (
    os.environ.get("MINIMAX_TTS_API_BASE")
    or os.environ.get("MINIMAX_VIDEO_API_BASE")
    or "https://api.minimaxi.com"
).strip().rstrip("/")
TTS_TIMEOUT = float(os.environ.get("MINIMAX_TTS_TIMEOUT", "120"))
CLONE_TIMEOUT = float(os.environ.get("MINIMAX_TTS_CLONE_TIMEOUT", "180"))
MAX_TEXT_CHARS = int(os.environ.get("TTS_MAX_TEXT_CHARS", "5000"))
MAX_CLONE_UPLOAD = int(os.environ.get("TTS_MAX_CLONE_BYTES", str(15 * 1024 * 1024)))
DEFAULT_MODEL = "speech-2.8-turbo"
MODELS = ("speech-2.8-turbo", "speech-2.8-hd")
LIST_RATE_PER_10K = {
    "speech-2.8-turbo": Decimal("2"),
    "speech-2.8-hd": Decimal("3.5"),
}
CLONE_FEE_LIST = Decimal("9.9")
SH_TZ = ZoneInfo("Asia/Shanghai")

_system_voice_cache: Dict[str, Any] = {"at": 0.0, "voices": []}

FALLBACK_SYSTEM_VOICES = [
    {
        "voice_id": "male-qn-qingse",
        "voice_name": "青涩青年",
        "description": "清朗青年男声",
    },
    {
        "voice_id": "Chinese (Mandarin)_Reliable_Executive",
        "voice_name": "沉稳高管",
        "description": "沉稳可靠的中年男性高管",
    },
    {
        "voice_id": "Chinese (Mandarin)_News_Anchor",
        "voice_name": "新闻女声",
        "description": "专业播音腔女声",
    },
    {
        "voice_id": "Chinese (Mandarin)_HK_Flight_Attendant",
        "voice_name": "空乘女声",
        "description": "亲切空乘风格女声",
    },
    {
        "voice_id": "Chinese (Mandarin)_Lyrical_Voice",
        "voice_name": "抒情女声",
        "description": "柔和抒情女声",
    },
]


def tts_configured() -> bool:
    return bool(MINIMAX_API_KEY)


def get_tts_config() -> dict:
    return {
        "configured": tts_configured(),
        "api_base": MINIMAX_API_BASE,
        "models": list(MODELS),
        "defaultModel": DEFAULT_MODEL,
        "maxTextChars": MAX_TEXT_CHARS,
        "paid": True,
        "pricing": pricing_public(),
    }


def pricing_public() -> dict:
    markup = float(AI_MARKUP)
    models = []
    for mid in MODELS:
        list_p = float(LIST_RATE_PER_10K[mid])
        models.append(
            {
                "id": mid,
                "listPer10kCny": list_p,
                "userPer10kCny": float(user_price_cny(list_p)),
            }
        )
    clone_list = float(CLONE_FEE_LIST)
    return {
        "markup": markup,
        "models": models,
        "cloneFeeListCny": clone_list,
        "cloneFeeUserCny": float(user_price_cny(clone_list)),
        "billingNote": "chars",
    }


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


def _wallet_for(user: dict) -> dict:
    conn = _conn()
    try:
        return wallet_public(conn, user, is_admin=_is_admin(user))
    finally:
        conn.close()


def _assert_can_afford(user: dict, list_price: Any) -> None:
    if _is_admin(user):
        return
    conn = _conn()
    try:
        require_can_afford(conn, int(user["id"]), list_price)
    finally:
        conn.close()


def _charge(user: dict, list_price: Any, *, reason: str, meta: dict) -> Optional[float]:
    if _is_admin(user):
        return None
    charge = user_price_cny(list_price)
    if charge <= 0:
        return None
    conn = _conn()
    try:
        new_bal = try_charge(
            conn,
            int(user["id"]),
            charge,
            reason=reason,
            meta={
                **meta,
                "listPriceCny": float(money(list_price)),
                "chargedCny": float(charge),
            },
        )
        if new_bal is None:
            raise HTTPException(
                status_code=402,
                detail="Insufficient balance. Please top up.",
            )
        return float(new_bal)
    finally:
        conn.close()


def _now_utc_naive() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _to_shanghai(utc_naive: Optional[str]) -> str:
    if not utc_naive:
        return ""
    try:
        dt = datetime.strptime(str(utc_naive)[:19], "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=timezone.utc
        )
        return dt.astimezone(SH_TZ).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(utc_naive)


def ensure_tts_tables(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tts_cloned_voices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            voice_id VARCHAR(128) NOT NULL,
            label VARCHAR(128) NULL,
            clone_fee_charged TINYINT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            UNIQUE KEY uq_tts_voice (voice_id),
            KEY idx_tts_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _headers_json() -> dict:
    return {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json",
    }


def _raise_mm(data: Any, resp: httpx.Response, what: str) -> None:
    base_msg = f"MiniMax {what} failed"
    if isinstance(data, dict):
        base_resp = data.get("base_resp") or {}
        if isinstance(base_resp, dict):
            code = base_resp.get("status_code")
            msg = str(base_resp.get("status_msg") or "").strip()
            if code not in (None, 0):
                detail = f"{base_msg}: [{code}] {msg or 'error'}"
                status = 429 if code == 1002 else 502
                if code == 1004:
                    status = 503
                if code == 2038:
                    status = 403
                raise HTTPException(status_code=status, detail=detail)
    raise HTTPException(
        status_code=502,
        detail=f"{base_msg}: HTTP {resp.status_code} — {(resp.text or '')[:300]}",
    )


def _check_base_resp(data: dict, resp: httpx.Response, what: str) -> None:
    base_resp = data.get("base_resp") or {}
    if not isinstance(base_resp, dict):
        return
    code = base_resp.get("status_code")
    if code not in (None, 0):
        _raise_mm(data, resp, what)


def list_price_for_chars(model: str, chars: int) -> Decimal:
    mid = model if model in LIST_RATE_PER_10K else DEFAULT_MODEL
    rate = LIST_RATE_PER_10K[mid]
    n = max(0, int(chars))
    if n <= 0:
        return money(0)
    return money(rate * Decimal(n) / Decimal(10000))


def _billable_chars(text: str) -> int:
    # Approximate: count CJK / alnum like MiniMax word_count; bill on API usage when available.
    s = text or ""
    return max(1, len(re.sub(r"\s+", "", s)))


def _normalize_model(model: Optional[str]) -> str:
    mid = (model or DEFAULT_MODEL).strip()
    if mid not in MODELS:
        return DEFAULT_MODEL
    return mid


def _make_voice_id(user_id: int) -> str:
    # MiniMax: [8,256], start letter, [A-Za-z0-9_-], not end with -/_
    return f"TbcU{int(user_id)}V{secrets.token_hex(8)}"


async def _upload_clone_file(client: httpx.AsyncClient, data: bytes, filename: str) -> int:
    files = {"file": (filename or "clone.mp3", data)}
    form = {"purpose": "voice_clone"}
    resp = await client.post(
        f"{MINIMAX_API_BASE}/v1/files/upload",
        headers={"Authorization": f"Bearer {MINIMAX_API_KEY}"},
        data=form,
        files=files,
        timeout=CLONE_TIMEOUT,
    )
    try:
        body = resp.json()
    except Exception:
        body = {}
    if resp.status_code >= 400:
        _raise_mm(body, resp, "file upload")
    _check_base_resp(body if isinstance(body, dict) else {}, resp, "file upload")
    file_obj = (body or {}).get("file") or {}
    fid = file_obj.get("file_id")
    if fid is None:
        raise HTTPException(status_code=502, detail="MiniMax upload returned no file_id")
    return int(fid)


async def _fetch_bytes(url: str) -> Tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        ctype = (r.headers.get("content-type") or "audio/mpeg").split(";")[0].strip()
        return r.content, ctype or "audio/mpeg"


def _hex_audio_to_b64(hex_audio: str) -> Tuple[str, str]:
    raw = bytes.fromhex(hex_audio.strip())
    return base64.b64encode(raw).decode("ascii"), "audio/mpeg"


async def _synthesize_mm(
    *,
    text: str,
    model: str,
    voice_id: str,
    speed: float = 1.0,
    vol: float = 1.0,
    pitch: int = 0,
    emotion: Optional[str] = None,
    language_boost: Optional[str] = "Chinese",
) -> dict:
    payload: Dict[str, Any] = {
        "model": model,
        "text": text,
        "stream": False,
        "output_format": "hex",
        "voice_setting": {
            "voice_id": voice_id,
            "speed": speed,
            "vol": vol,
            "pitch": pitch,
        },
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": "mp3",
            "channel": 1,
        },
    }
    if emotion:
        payload["voice_setting"]["emotion"] = emotion
    if language_boost:
        payload["language_boost"] = language_boost

    async with httpx.AsyncClient(timeout=TTS_TIMEOUT) as client:
        resp = await client.post(
            f"{MINIMAX_API_BASE}/v1/t2a_v2",
            headers=_headers_json(),
            json=payload,
        )
        try:
            data = resp.json()
        except Exception:
            data = {}
        if resp.status_code >= 400:
            _raise_mm(data, resp, "TTS")
        if not isinstance(data, dict):
            raise HTTPException(status_code=502, detail="MiniMax TTS returned invalid JSON")
        _check_base_resp(data, resp, "TTS")
        audio_hex = ((data.get("data") or {}) if isinstance(data.get("data"), dict) else {}).get(
            "audio"
        )
        if not audio_hex or not isinstance(audio_hex, str):
            raise HTTPException(status_code=502, detail="MiniMax TTS returned no audio")
        b64, ctype = _hex_audio_to_b64(audio_hex)
        extra = data.get("extra_info") or {}
        return {
            "audioBase64": b64,
            "contentType": ctype,
            "extra": extra if isinstance(extra, dict) else {},
        }


async def _load_system_voices() -> List[dict]:
    now = time.time()
    if _system_voice_cache["voices"] and now - float(_system_voice_cache["at"]) < 3600:
        return list(_system_voice_cache["voices"])
    if not tts_configured():
        return list(FALLBACK_SYSTEM_VOICES)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{MINIMAX_API_BASE}/v1/get_voice",
                headers=_headers_json(),
                json={"voice_type": "system"},
            )
            data = resp.json() if resp.content else {}
            if resp.status_code >= 400 or not isinstance(data, dict):
                return list(FALLBACK_SYSTEM_VOICES)
            _check_base_resp(data, resp, "get_voice")
            rows = data.get("system_voice") or []
            out = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                vid = str(row.get("voice_id") or "").strip()
                if not vid:
                    continue
                name = str(row.get("voice_name") or vid).strip()
                desc_list = row.get("description") or []
                desc = ""
                if isinstance(desc_list, list) and desc_list:
                    desc = str(desc_list[0] or "")
                out.append({"voice_id": vid, "voice_name": name, "description": desc})
            if not out:
                out = list(FALLBACK_SYSTEM_VOICES)
            # Prefer Mandarin / Chinese first for default UX
            def _rank(v: dict) -> int:
                s = (v.get("voice_id") or "") + (v.get("voice_name") or "")
                if "Chinese" in s or "男" in s or "女" in s or "青涩" in s:
                    return 0
                return 1

            out.sort(key=_rank)
            _system_voice_cache["at"] = now
            _system_voice_cache["voices"] = out
            return list(out)
    except Exception as exc:
        print(f"[tts] get_voice failed: {exc}")
        return list(FALLBACK_SYSTEM_VOICES)


def _user_clones(user_id: int) -> List[dict]:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_tts_tables(cur)
            cur.execute(
                """
                SELECT voice_id, label, clone_fee_charged, created_at
                FROM tts_cloned_voices
                WHERE user_id=%s
                ORDER BY id DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall() or []
        out = []
        for r in rows:
            out.append(
                {
                    "voice_id": r["voice_id"],
                    "label": r.get("label") or r["voice_id"],
                    "cloneFeeCharged": bool(int(r.get("clone_fee_charged") or 0)),
                    "createdAt": _to_shanghai(r.get("created_at")),
                }
            )
        return out
    finally:
        conn.close()


def _get_clone_row(user_id: int, voice_id: str) -> Optional[dict]:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_tts_tables(cur)
            cur.execute(
                """
                SELECT id, voice_id, label, clone_fee_charged
                FROM tts_cloned_voices
                WHERE user_id=%s AND voice_id=%s
                LIMIT 1
                """,
                (user_id, voice_id),
            )
            return cur.fetchone()
    finally:
        conn.close()


def _mark_clone_fee_charged(user_id: int, voice_id: str) -> None:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_tts_tables(cur)
            cur.execute(
                """
                UPDATE tts_cloned_voices
                SET clone_fee_charged=1
                WHERE user_id=%s AND voice_id=%s
                """,
                (user_id, voice_id),
            )
        conn.commit()
    finally:
        conn.close()


def _insert_clone(user_id: int, voice_id: str, label: str) -> None:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_tts_tables(cur)
            cur.execute(
                """
                INSERT INTO tts_cloned_voices (user_id, voice_id, label, clone_fee_charged, created_at)
                VALUES (%s, %s, %s, 0, %s)
                """,
                (user_id, voice_id, label[:120] if label else voice_id, _now_utc_naive()),
            )
        conn.commit()
    finally:
        conn.close()


@router.get("/status")
async def tts_status(user: dict = Depends(_user)):
    if not tts_configured():
        raise HTTPException(
            status_code=503,
            detail="MiniMax is not configured (MINIMAX_API_KEY).",
        )
    system = await _load_system_voices()
    clones = _user_clones(int(user["id"]))
    return {
        **get_tts_config(),
        "aiWallet": _wallet_for(user),
        "systemVoices": system[:80],
        "clonedVoices": clones,
        "defaultVoiceId": (system[0]["voice_id"] if system else "male-qn-qingse"),
    }


@router.post("/estimate")
async def tts_estimate(
    text: str = Form(...),
    model: str = Form(DEFAULT_MODEL),
    voice_id: str = Form(""),
    user: dict = Depends(_user),
):
    mid = _normalize_model(model)
    plain = (text or "").strip()
    if not plain:
        raise HTTPException(status_code=400, detail="Text is required")
    if len(plain) > MAX_TEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Text too long (max {MAX_TEXT_CHARS} characters)",
        )
    chars = _billable_chars(plain)
    list_p = list_price_for_chars(mid, chars)
    clone_fee = Decimal("0")
    vid = (voice_id or "").strip()
    if vid:
        row = _get_clone_row(int(user["id"]), vid)
        if row and not int(row.get("clone_fee_charged") or 0):
            clone_fee = CLONE_FEE_LIST
    total = money(list_p + clone_fee)
    return {
        "chars": chars,
        "model": mid,
        "listSynthCny": float(list_p),
        "listCloneFeeCny": float(clone_fee),
        "listTotalCny": float(total),
        "userTotalCny": float(user_price_cny(total)),
        "markup": float(AI_MARKUP),
    }


@router.post("/synthesize")
async def tts_synthesize(
    text: str = Form(...),
    model: str = Form(DEFAULT_MODEL),
    voice_id: str = Form(...),
    speed: float = Form(1.0),
    emotion: str = Form(""),
    language_boost: str = Form("Chinese"),
    user: dict = Depends(_user),
):
    if not tts_configured():
        raise HTTPException(
            status_code=503,
            detail="MiniMax is not configured (MINIMAX_API_KEY).",
        )
    plain = (text or "").strip()
    if not plain:
        raise HTTPException(status_code=400, detail="Text is required")
    if len(plain) > MAX_TEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Text too long (max {MAX_TEXT_CHARS} characters)",
        )
    mid = _normalize_model(model)
    vid = (voice_id or "").strip()
    if not vid:
        raise HTTPException(status_code=400, detail="voice_id is required")

    spd = float(speed or 1.0)
    if spd < 0.5:
        spd = 0.5
    if spd > 2.0:
        spd = 2.0
    emo = (emotion or "").strip() or None
    allowed_emo = {
        "happy",
        "sad",
        "angry",
        "fearful",
        "disgusted",
        "surprised",
        "calm",
        "fluent",
        "whisper",
    }
    if emo and emo not in allowed_emo:
        emo = None
    lang = (language_boost or "").strip() or None

    est_chars = _billable_chars(plain)
    list_synth = list_price_for_chars(mid, est_chars)
    clone_fee = Decimal("0")
    clone_row = _get_clone_row(int(user["id"]), vid)
    if clone_row and not int(clone_row.get("clone_fee_charged") or 0):
        clone_fee = CLONE_FEE_LIST
    # Afford check on estimate (actual may be slightly different via usage_characters)
    _assert_can_afford(user, money(list_synth + clone_fee))

    try:
        result = await _synthesize_mm(
            text=plain,
            model=mid,
            voice_id=vid,
            speed=spd,
            emotion=emo,
            language_boost=lang,
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[tts] synthesize: {exc}")
        raise HTTPException(status_code=502, detail=f"TTS failed: {exc}") from exc

    extra = result.get("extra") or {}
    usage = int(extra.get("usage_characters") or est_chars or 1)
    list_synth = list_price_for_chars(mid, usage)
    total_list = money(list_synth + clone_fee)
    bal = _charge(
        user,
        total_list,
        reason="tts_synthesize",
        meta={
            "model": mid,
            "voiceId": vid,
            "chars": usage,
            "cloneFee": float(clone_fee),
            "audioLengthMs": extra.get("audio_length"),
        },
    )
    if clone_fee > 0 and clone_row:
        _mark_clone_fee_charged(int(user["id"]), vid)

    return {
        "audioBase64": result["audioBase64"],
        "contentType": result["contentType"],
        "model": mid,
        "voiceId": vid,
        "chars": usage,
        "listPriceCny": float(total_list),
        "chargedCny": float(user_price_cny(total_list)) if not _is_admin(user) else 0.0,
        "cloneFeeApplied": float(clone_fee) > 0,
        "aiWallet": _wallet_for(user),
        "balanceAfter": bal,
        "extra": {
            "audioLengthMs": extra.get("audio_length"),
            "audioSize": extra.get("audio_size"),
        },
    }


@router.post("/clone")
async def tts_clone(
    file: UploadFile = File(...),
    label: str = Form(""),
    preview_text: str = Form(""),
    model: str = Form(DEFAULT_MODEL),
    user: dict = Depends(_user),
):
    """Upload sample audio, create a cloned voice, return preview (charges TTS chars only)."""
    if not tts_configured():
        raise HTTPException(
            status_code=503,
            detail="MiniMax is not configured (MINIMAX_API_KEY).",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(data) > MAX_CLONE_UPLOAD:
        raise HTTPException(status_code=400, detail="Audio is too large (max 15MB)")
    name = (file.filename or "clone.mp3").lower()
    if not any(name.endswith(ext) for ext in (".mp3", ".m4a", ".wav", ".mpeg")):
        # content-type fallback
        ctype = (file.content_type or "").lower()
        if not any(x in ctype for x in ("audio/", "mpeg", "wav", "mp4")):
            raise HTTPException(
                status_code=400,
                detail="Please upload mp3 / m4a / wav (10s–5min)",
            )

    mid = _normalize_model(model)
    preview = (preview_text or "").strip() or (
        "您好，这是用克隆音色生成的试听效果，听起来自然流畅。"
    )
    if len(preview) > 1000:
        preview = preview[:1000]
    est = list_price_for_chars(mid, _billable_chars(preview))
    _assert_can_afford(user, est)

    voice_id = _make_voice_id(int(user["id"]))
    label_s = (label or "").strip() or f"克隆音色 {voice_id[-6:]}"

    try:
        async with httpx.AsyncClient(timeout=CLONE_TIMEOUT) as client:
            file_id = await _upload_clone_file(client, data, file.filename or "clone.mp3")
            payload = {
                "file_id": file_id,
                "voice_id": voice_id,
                "text": preview,
                "model": mid,
                "language_boost": "Chinese",
                "need_noise_reduction": True,
            }
            resp = await client.post(
                f"{MINIMAX_API_BASE}/v1/voice_clone",
                headers=_headers_json(),
                json=payload,
            )
            try:
                body = resp.json()
            except Exception:
                body = {}
            if resp.status_code >= 400:
                _raise_mm(body, resp, "voice clone")
            if not isinstance(body, dict):
                raise HTTPException(status_code=502, detail="Invalid clone response")
            _check_base_resp(body, resp, "voice clone")
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[tts] clone: {exc}")
        raise HTTPException(status_code=502, detail=f"Voice clone failed: {exc}") from exc

    extra = body.get("extra_info") or {}
    usage = int(extra.get("usage_characters") or _billable_chars(preview))
    list_p = list_price_for_chars(mid, usage)
    bal = _charge(
        user,
        list_p,
        reason="tts_clone_preview",
        meta={"model": mid, "voiceId": voice_id, "chars": usage, "preview": True},
    )
    _insert_clone(int(user["id"]), voice_id, label_s)

    demo_b64 = None
    demo_ctype = "audio/mpeg"
    demo_url = body.get("demo_audio") or ""
    if isinstance(demo_url, str) and demo_url.startswith("http"):
        try:
            raw, demo_ctype = await _fetch_bytes(demo_url)
            demo_b64 = base64.b64encode(raw).decode("ascii")
        except Exception as exc:
            print(f"[tts] demo fetch: {exc}")

    return {
        "voiceId": voice_id,
        "label": label_s,
        "model": mid,
        "chars": usage,
        "listPriceCny": float(list_p),
        "chargedCny": float(user_price_cny(list_p)) if not _is_admin(user) else 0.0,
        "cloneFeePendingUserCny": float(user_price_cny(CLONE_FEE_LIST)),
        "audioBase64": demo_b64,
        "contentType": demo_ctype,
        "aiWallet": _wallet_for(user),
        "balanceAfter": bal,
        "clonedVoices": _user_clones(int(user["id"])),
        "tip": "Clone fee (¥9.9 list) is charged on the first successful synthesis with this voice.",
    }


@router.delete("/voices/{voice_id}")
async def tts_delete_voice(voice_id: str, user: dict = Depends(_user)):
    vid = (voice_id or "").strip()
    if not vid:
        raise HTTPException(status_code=400, detail="voice_id required")
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_tts_tables(cur)
            cur.execute(
                "DELETE FROM tts_cloned_voices WHERE user_id=%s AND voice_id=%s",
                (int(user["id"]), vid),
            )
            if cur.rowcount < 1:
                raise HTTPException(status_code=404, detail="Voice not found")
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "clonedVoices": _user_clones(int(user["id"]))}
