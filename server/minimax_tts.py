"""TTS: DashScope Qwen (default, cheap) + optional MiniMax speech-2.8.

Billing = vendor list × AI_PRICE_MARKUP, charge on success only.

Qwen:
  - qwen3-tts-flash: ¥0.8 / 10k chars (system voices, max ~600 chars/req)
  - qwen3-tts-vc-2026-01-22: ¥0.8 / 10k (cloned voices)
  - clone create: ¥0.01 / voice (charged on create)

MiniMax:
  - speech-2.8-turbo: ¥2 / 10k; speech-2.8-hd: ¥3.5 / 10k
  - clone unlock: ¥9.9 on first successful T2A with that voice
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
from recipe_ai import DASHSCOPE_API_KEY

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/tts", tags=["tts"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@zhengxiaohui.cn").lower()
MINIMAX_API_KEY = (os.environ.get("MINIMAX_API_KEY") or "").strip()
MINIMAX_API_BASE = (
    os.environ.get("MINIMAX_TTS_API_BASE")
    or os.environ.get("MINIMAX_VIDEO_API_BASE")
    or "https://api.minimaxi.com"
).strip().rstrip("/")
DASHSCOPE_HTTP_API = (
    os.environ.get("DASHSCOPE_HTTP_API_URL")
    or "https://dashscope.aliyuncs.com/api/v1"
).strip().rstrip("/")

TTS_TIMEOUT = float(os.environ.get("MINIMAX_TTS_TIMEOUT", "120"))
CLONE_TIMEOUT = float(os.environ.get("MINIMAX_TTS_CLONE_TIMEOUT", "180"))
MAX_CLONE_UPLOAD = int(os.environ.get("TTS_MAX_CLONE_BYTES", str(15 * 1024 * 1024)))

PROVIDER_QWEN = "qwen"
PROVIDER_MINIMAX = "minimax"
DEFAULT_PROVIDER = PROVIDER_QWEN

QWEN_FLASH = "qwen3-tts-flash"
QWEN_VC = "qwen3-tts-vc-2026-01-22"
MM_TURBO = "speech-2.8-turbo"
MM_HD = "speech-2.8-hd"

DEFAULT_MODEL = QWEN_FLASH
LIST_RATE_PER_10K = {
    QWEN_FLASH: Decimal("0.8"),
    QWEN_VC: Decimal("0.8"),
    MM_TURBO: Decimal("2"),
    MM_HD: Decimal("3.5"),
}
MODEL_MAX_CHARS = {
    QWEN_FLASH: 600,
    QWEN_VC: 600,
    MM_TURBO: 5000,
    MM_HD: 5000,
}
CLONE_FEE = {
    PROVIDER_QWEN: Decimal("0.01"),
    PROVIDER_MINIMAX: Decimal("9.9"),
}
QWEN_CLONE_ON_CREATE = True  # charge clone fee when enrollment succeeds

SH_TZ = ZoneInfo("Asia/Shanghai")
_mm_voice_cache: Dict[str, Any] = {"at": 0.0, "voices": []}

QWEN_SYSTEM_VOICES = [
    {"voice_id": "Cherry", "voice_name": "芊悦 Cherry", "description": "阳光积极、亲切自然女声"},
    {"voice_id": "Serena", "voice_name": "苏瑶 Serena", "description": "温柔女声"},
    {"voice_id": "Ethan", "voice_name": "晨煦 Ethan", "description": "阳光男声"},
    {"voice_id": "Chelsie", "voice_name": "千雪 Chelsie", "description": "二次元女声"},
    {"voice_id": "Momo", "voice_name": "茉儿 Momo", "description": "活泼女声"},
    {"voice_id": "Vivian", "voice_name": "小薇 Vivian", "description": "清晰女声"},
    {"voice_id": "Moon", "voice_name": "月华 Moon", "description": "温柔女声"},
    {"voice_id": "Maia", "voice_name": "四月 Maia", "description": "知性女声"},
    {"voice_id": "Kai", "voice_name": "凯 Kai", "description": "沉稳男声"},
    {"voice_id": "Nofish", "voice_name": "不吃鱼", "description": "设计师风男声"},
    {"voice_id": "Jennifer", "voice_name": "Jennifer", "description": "美式女声"},
    {"voice_id": "Ryan", "voice_name": "Ryan", "description": "美式男声"},
    {"voice_id": "Katerina", "voice_name": "Katerina", "description": "俄语风女声"},
    {"voice_id": "Elias", "voice_name": "Elias", "description": "英式男声"},
]

MM_FALLBACK_VOICES = [
    {"voice_id": "male-qn-qingse", "voice_name": "青涩青年", "description": "清朗青年男声"},
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


def qwen_configured() -> bool:
    return bool(DASHSCOPE_API_KEY)


def minimax_configured() -> bool:
    return bool(MINIMAX_API_KEY)


def tts_configured() -> bool:
    return qwen_configured() or minimax_configured()


def _provider_of_model(model: str) -> str:
    if model in (QWEN_FLASH, QWEN_VC):
        return PROVIDER_QWEN
    if model in (MM_TURBO, MM_HD):
        return PROVIDER_MINIMAX
    return DEFAULT_PROVIDER


def _normalize_provider(provider: Optional[str]) -> str:
    p = (provider or DEFAULT_PROVIDER).strip().lower()
    if p in (PROVIDER_QWEN, PROVIDER_MINIMAX):
        return p
    return DEFAULT_PROVIDER


def _normalize_model(model: Optional[str], provider: Optional[str] = None) -> str:
    mid = (model or "").strip()
    if mid in LIST_RATE_PER_10K:
        return mid
    p = _normalize_provider(provider)
    return QWEN_FLASH if p == PROVIDER_QWEN else MM_TURBO


def _max_chars(model: str) -> int:
    return int(MODEL_MAX_CHARS.get(model, 600))


def list_price_for_chars(model: str, chars: int) -> Decimal:
    mid = model if model in LIST_RATE_PER_10K else DEFAULT_MODEL
    rate = LIST_RATE_PER_10K[mid]
    n = max(0, int(chars))
    if n <= 0:
        return money(0)
    return money(rate * Decimal(n) / Decimal(10000))


def pricing_public() -> dict:
    markup = float(AI_MARKUP)
    models = []
    for mid, rate in LIST_RATE_PER_10K.items():
        list_p = float(rate)
        models.append(
            {
                "id": mid,
                "provider": _provider_of_model(mid),
                "listPer10kCny": list_p,
                "userPer10kCny": float(user_price_cny(list_p)),
                "maxChars": _max_chars(mid),
            }
        )
    return {
        "markup": markup,
        "models": models,
        "cloneFee": {
            PROVIDER_QWEN: {
                "listCny": float(CLONE_FEE[PROVIDER_QWEN]),
                "userCny": float(user_price_cny(CLONE_FEE[PROVIDER_QWEN])),
                "when": "create",
            },
            PROVIDER_MINIMAX: {
                "listCny": float(CLONE_FEE[PROVIDER_MINIMAX]),
                "userCny": float(user_price_cny(CLONE_FEE[PROVIDER_MINIMAX])),
                "when": "first_synth",
            },
        },
    }


def get_tts_config() -> dict:
    return {
        "configured": tts_configured(),
        "qwenConfigured": qwen_configured(),
        "minimaxConfigured": minimax_configured(),
        "defaultProvider": DEFAULT_PROVIDER,
        "defaultModel": DEFAULT_MODEL,
        "providers": [
            {
                "id": PROVIDER_QWEN,
                "models": [QWEN_FLASH],
                "cloneModel": QWEN_VC,
                "configured": qwen_configured(),
            },
            {
                "id": PROVIDER_MINIMAX,
                "models": [MM_TURBO, MM_HD],
                "cloneModel": MM_TURBO,
                "configured": minimax_configured(),
            },
        ],
        "paid": True,
        "pricing": pricing_public(),
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
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            voice_id VARCHAR(191) NOT NULL,
            label VARCHAR(128) NULL,
            provider VARCHAR(16) NOT NULL DEFAULT 'minimax',
            synth_model VARCHAR(64) NULL,
            clone_fee_charged TINYINT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            UNIQUE KEY uq_tts_voice (voice_id),
            KEY idx_tts_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    for stmt in (
        "ALTER TABLE tts_cloned_voices ADD COLUMN provider VARCHAR(16) NOT NULL DEFAULT 'minimax'",
        "ALTER TABLE tts_cloned_voices ADD COLUMN synth_model VARCHAR(64) NULL",
    ):
        try:
            cur.execute(stmt)
        except Exception:
            pass


def _billable_chars(text: str) -> int:
    s = text or ""
    return max(1, len(re.sub(r"\s+", "", s))) if s.strip() else 0


def _mm_headers_json() -> dict:
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
                status = 429 if code == 1002 else 502
                if code == 1004:
                    status = 503
                if code == 2038:
                    status = 403
                raise HTTPException(
                    status_code=status,
                    detail=f"{base_msg}: [{code}] {msg or 'error'}",
                )
    raise HTTPException(
        status_code=502,
        detail=f"{base_msg}: HTTP {resp.status_code} — {(resp.text or '')[:300]}",
    )


def _check_mm(data: dict, resp: httpx.Response, what: str) -> None:
    base_resp = data.get("base_resp") or {}
    if isinstance(base_resp, dict) and base_resp.get("status_code") not in (None, 0):
        _raise_mm(data, resp, what)


async def _fetch_bytes(url: str) -> Tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        ctype = (r.headers.get("content-type") or "audio/mpeg").split(";")[0].strip()
        return r.content, ctype or "audio/mpeg"


def _hex_audio_to_b64(hex_audio: str) -> Tuple[str, str]:
    raw = bytes.fromhex(hex_audio.strip())
    return base64.b64encode(raw).decode("ascii"), "audio/mpeg"


async def _synthesize_qwen(*, text: str, model: str, voice_id: str) -> dict:
    if not qwen_configured():
        raise HTTPException(status_code=503, detail="DashScope is not configured (DASHSCOPE_API_KEY).")
    payload = {
        "model": model,
        "input": {
            "text": text,
            "voice": voice_id,
            "language_type": "Chinese",
        },
    }
    url = f"{DASHSCOPE_HTTP_API}/services/aigc/multimodal-generation/generation"
    async with httpx.AsyncClient(timeout=TTS_TIMEOUT) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        try:
            data = resp.json()
        except Exception:
            data = {}
        if resp.status_code >= 400:
            msg = ""
            if isinstance(data, dict):
                msg = str(data.get("message") or data.get("code") or "")[:240]
            raise HTTPException(
                status_code=502,
                detail=f"Qwen TTS failed: HTTP {resp.status_code} {msg}".strip(),
            )
        if not isinstance(data, dict):
            raise HTTPException(status_code=502, detail="Qwen TTS returned invalid JSON")
        # DashScope sometimes returns 200 with code field
        code = data.get("code")
        if code and str(code) not in ("", "200", "Success"):
            raise HTTPException(
                status_code=502,
                detail=f"Qwen TTS failed: [{code}] {data.get('message') or ''}".strip(),
            )
        output = data.get("output") or {}
        audio = (output.get("audio") or {}) if isinstance(output, dict) else {}
        b64 = ""
        ctype = "audio/wav"
        if isinstance(audio, dict):
            raw_b64 = audio.get("data") or ""
            if isinstance(raw_b64, str) and raw_b64.strip():
                b64 = raw_b64.strip()
            else:
                aurl = audio.get("url") or ""
                if isinstance(aurl, str) and aurl.startswith("http"):
                    raw, ctype = await _fetch_bytes(aurl)
                    b64 = base64.b64encode(raw).decode("ascii")
        if not b64:
            raise HTTPException(status_code=502, detail="Qwen TTS returned no audio")
        usage = data.get("usage") or {}
        chars = int(usage.get("characters") or _billable_chars(text) or 1)
        return {
            "audioBase64": b64,
            "contentType": ctype,
            "extra": {"usage_characters": chars},
        }


async def _synthesize_mm(
    *,
    text: str,
    model: str,
    voice_id: str,
    speed: float = 1.0,
    emotion: Optional[str] = None,
    language_boost: Optional[str] = "Chinese",
) -> dict:
    if not minimax_configured():
        raise HTTPException(status_code=503, detail="MiniMax is not configured (MINIMAX_API_KEY).")
    payload: Dict[str, Any] = {
        "model": model,
        "text": text,
        "stream": False,
        "output_format": "hex",
        "voice_setting": {
            "voice_id": voice_id,
            "speed": speed,
            "vol": 1,
            "pitch": 0,
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
            headers=_mm_headers_json(),
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
        _check_mm(data, resp, "TTS")
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


async def _upload_mm_clone_file(client: httpx.AsyncClient, data: bytes, filename: str) -> int:
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
    _check_mm(body if isinstance(body, dict) else {}, resp, "file upload")
    file_obj = (body or {}).get("file") or {}
    fid = file_obj.get("file_id")
    if fid is None:
        raise HTTPException(status_code=502, detail="MiniMax upload returned no file_id")
    return int(fid)


async def _clone_qwen(*, data: bytes, filename: str, preferred: str) -> str:
    if not qwen_configured():
        raise HTTPException(status_code=503, detail="DashScope is not configured (DASHSCOPE_API_KEY).")
    lower = (filename or "").lower()
    mime = "audio/mpeg"
    if lower.endswith(".wav"):
        mime = "audio/wav"
    elif lower.endswith(".m4a"):
        mime = "audio/mp4"
    # Base64 data URI must stay under ~10MB encoded; reject oversized
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio is too large for Qwen clone (max ~8MB)")
    b64 = base64.b64encode(data).decode("ascii")
    data_uri = f"data:{mime};base64,{b64}"
    pref = re.sub(r"[^A-Za-z0-9_]", "", preferred or "voice")[:16] or "voice"
    if not pref[0].isalpha():
        pref = "v" + pref[:15]
    payload = {
        "model": "qwen-voice-enrollment",
        "input": {
            "action": "create",
            "target_model": QWEN_VC,
            "preferred_name": pref,
            "audio": {"data": data_uri},
        },
    }
    url = f"{DASHSCOPE_HTTP_API}/services/audio/tts/customization"
    async with httpx.AsyncClient(timeout=CLONE_TIMEOUT) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        try:
            body = resp.json()
        except Exception:
            body = {}
        if resp.status_code >= 400:
            msg = ""
            if isinstance(body, dict):
                msg = str(body.get("message") or body.get("code") or "")[:240]
            raise HTTPException(
                status_code=502,
                detail=f"Qwen voice clone failed: HTTP {resp.status_code} {msg}".strip(),
            )
        out = (body or {}).get("output") or {}
        voice = out.get("voice") if isinstance(out, dict) else None
        if not voice:
            raise HTTPException(status_code=502, detail="Qwen clone returned no voice id")
        return str(voice)


async def _load_mm_system_voices() -> List[dict]:
    now = time.time()
    if _mm_voice_cache["voices"] and now - float(_mm_voice_cache["at"]) < 3600:
        return list(_mm_voice_cache["voices"])
    if not minimax_configured():
        return list(MM_FALLBACK_VOICES)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{MINIMAX_API_BASE}/v1/get_voice",
                headers=_mm_headers_json(),
                json={"voice_type": "system"},
            )
            data = resp.json() if resp.content else {}
            if resp.status_code >= 400 or not isinstance(data, dict):
                return list(MM_FALLBACK_VOICES)
            _check_mm(data, resp, "get_voice")
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
                desc = str(desc_list[0] or "") if isinstance(desc_list, list) and desc_list else ""
                out.append({"voice_id": vid, "voice_name": name, "description": desc})
            if not out:
                out = list(MM_FALLBACK_VOICES)

            def _rank(v: dict) -> int:
                s = (v.get("voice_id") or "") + (v.get("voice_name") or "")
                return 0 if ("Chinese" in s or "男" in s or "女" in s) else 1

            out.sort(key=_rank)
            _mm_voice_cache["at"] = now
            _mm_voice_cache["voices"] = out
            return list(out)
    except Exception as exc:
        print(f"[tts] get_voice failed: {exc}")
        return list(MM_FALLBACK_VOICES)


def _user_clones(user_id: int, provider: Optional[str] = None) -> List[dict]:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_tts_tables(cur)
            if provider:
                cur.execute(
                    """
                    SELECT voice_id, label, provider, synth_model, clone_fee_charged, created_at
                    FROM tts_cloned_voices
                    WHERE user_id=%s AND provider=%s
                    ORDER BY id DESC
                    """,
                    (user_id, provider),
                )
            else:
                cur.execute(
                    """
                    SELECT voice_id, label, provider, synth_model, clone_fee_charged, created_at
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
                    "provider": r.get("provider") or PROVIDER_MINIMAX,
                    "synthModel": r.get("synth_model") or "",
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
                SELECT id, voice_id, label, provider, synth_model, clone_fee_charged
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


def _insert_clone(
    user_id: int,
    voice_id: str,
    label: str,
    *,
    provider: str,
    synth_model: str,
    clone_fee_charged: int = 0,
) -> None:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            ensure_tts_tables(cur)
            cur.execute(
                """
                INSERT INTO tts_cloned_voices
                (user_id, voice_id, label, provider, synth_model, clone_fee_charged, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    voice_id,
                    (label or voice_id)[:120],
                    provider,
                    synth_model,
                    int(clone_fee_charged),
                    _now_utc_naive(),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def _make_mm_voice_id(user_id: int) -> str:
    return f"TbcU{int(user_id)}V{secrets.token_hex(8)}"


def _require_provider(provider: str) -> None:
    if provider == PROVIDER_QWEN and not qwen_configured():
        raise HTTPException(status_code=503, detail="DashScope is not configured (DASHSCOPE_API_KEY).")
    if provider == PROVIDER_MINIMAX and not minimax_configured():
        raise HTTPException(status_code=503, detail="MiniMax is not configured (MINIMAX_API_KEY).")


@router.get("/status")
async def tts_status(user: dict = Depends(_user)):
    if not tts_configured():
        raise HTTPException(
            status_code=503,
            detail="TTS is not configured (need DASHSCOPE_API_KEY and/or MINIMAX_API_KEY).",
        )
    mm_voices = await _load_mm_system_voices() if minimax_configured() else []
    qwen_default = QWEN_SYSTEM_VOICES[0]["voice_id"] if QWEN_SYSTEM_VOICES else "Cherry"
    return {
        **get_tts_config(),
        "aiWallet": _wallet_for(user),
        "systemVoicesByProvider": {
            PROVIDER_QWEN: QWEN_SYSTEM_VOICES,
            PROVIDER_MINIMAX: mm_voices[:80],
        },
        "clonedVoices": _user_clones(int(user["id"])),
        "defaultVoiceId": qwen_default if qwen_configured() else (
            mm_voices[0]["voice_id"] if mm_voices else "male-qn-qingse"
        ),
    }


@router.post("/synthesize")
async def tts_synthesize(
    text: str = Form(...),
    model: str = Form(DEFAULT_MODEL),
    voice_id: str = Form(...),
    provider: str = Form(DEFAULT_PROVIDER),
    speed: float = Form(1.0),
    emotion: str = Form(""),
    language_boost: str = Form("Chinese"),
    user: dict = Depends(_user),
):
    plain = (text or "").strip()
    if not plain:
        raise HTTPException(status_code=400, detail="Text is required")
    prov = _normalize_provider(provider)
    mid = _normalize_model(model, prov)
    # Provider/model consistency
    if _provider_of_model(mid) != prov:
        mid = QWEN_FLASH if prov == PROVIDER_QWEN else MM_TURBO
    _require_provider(prov)

    vid = (voice_id or "").strip()
    if not vid:
        raise HTTPException(status_code=400, detail="voice_id is required")

    clone_row = _get_clone_row(int(user["id"]), vid)
    if clone_row:
        # Force provider/model for owned clones
        prov = (clone_row.get("provider") or prov).strip() or prov
        if prov == PROVIDER_QWEN:
            mid = QWEN_VC
        elif not mid.startswith("speech-"):
            mid = MM_TURBO

    max_c = _max_chars(mid)
    if len(plain) > max_c:
        raise HTTPException(
            status_code=400,
            detail=f"Text too long for {mid} (max {max_c} characters). Use MiniMax for longer text.",
        )

    spd = float(speed or 1.0)
    spd = min(2.0, max(0.5, spd))
    emo = (emotion or "").strip() or None
    allowed_emo = {
        "happy", "sad", "angry", "fearful", "disgusted",
        "surprised", "calm", "fluent", "whisper",
    }
    if emo and emo not in allowed_emo:
        emo = None

    est_chars = _billable_chars(plain)
    list_synth = list_price_for_chars(mid, est_chars)
    clone_fee = Decimal("0")
    if (
        clone_row
        and (clone_row.get("provider") or "") == PROVIDER_MINIMAX
        and not int(clone_row.get("clone_fee_charged") or 0)
    ):
        clone_fee = CLONE_FEE[PROVIDER_MINIMAX]
    _assert_can_afford(user, money(list_synth + clone_fee))

    try:
        if prov == PROVIDER_QWEN:
            result = await _synthesize_qwen(text=plain, model=mid, voice_id=vid)
        else:
            result = await _synthesize_mm(
                text=plain,
                model=mid,
                voice_id=vid,
                speed=spd,
                emotion=emo,
                language_boost=(language_boost or "").strip() or None,
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
            "provider": prov,
            "model": mid,
            "voiceId": vid,
            "chars": usage,
            "cloneFee": float(clone_fee),
        },
    )
    if clone_fee > 0 and clone_row:
        _mark_clone_fee_charged(int(user["id"]), vid)

    return {
        "audioBase64": result["audioBase64"],
        "contentType": result["contentType"],
        "provider": prov,
        "model": mid,
        "voiceId": vid,
        "chars": usage,
        "listPriceCny": float(total_list),
        "chargedCny": float(user_price_cny(total_list)) if not _is_admin(user) else 0.0,
        "cloneFeeApplied": float(clone_fee) > 0,
        "aiWallet": _wallet_for(user),
        "balanceAfter": bal,
    }


@router.post("/clone")
async def tts_clone(
    file: UploadFile = File(...),
    label: str = Form(""),
    preview_text: str = Form(""),
    provider: str = Form(DEFAULT_PROVIDER),
    model: str = Form(DEFAULT_MODEL),
    user: dict = Depends(_user),
):
    prov = _normalize_provider(provider)
    _require_provider(prov)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(data) > MAX_CLONE_UPLOAD:
        raise HTTPException(status_code=400, detail="Audio is too large (max 15MB)")
    name = (file.filename or "clone.mp3").lower()
    if not any(name.endswith(ext) for ext in (".mp3", ".m4a", ".wav", ".mpeg")):
        ctype = (file.content_type or "").lower()
        if not any(x in ctype for x in ("audio/", "mpeg", "wav", "mp4")):
            raise HTTPException(
                status_code=400,
                detail="Please upload mp3 / m4a / wav",
            )

    label_s = (label or "").strip() or "我的音色"
    preview = (preview_text or "").strip() or "您好，这是用克隆音色生成的试听效果。"
    if len(preview) > 200:
        preview = preview[:200]

    demo_b64 = None
    demo_ctype = "audio/mpeg"
    usage = 0
    list_p = Decimal("0")
    clone_fee_charged = 0
    voice_id = ""
    synth_model = QWEN_VC if prov == PROVIDER_QWEN else _normalize_model(model, prov)

    if prov == PROVIDER_QWEN:
        create_fee = CLONE_FEE[PROVIDER_QWEN]
        preview_est = list_price_for_chars(QWEN_VC, _billable_chars(preview))
        _assert_can_afford(user, money(create_fee + preview_est))
        pref = re.sub(r"[^A-Za-z0-9_]", "", f"u{user['id']}")[:16] or "voice"
        voice_id = await _clone_qwen(data=data, filename=file.filename or "clone.mp3", preferred=pref)
        # Charge create fee immediately
        _charge(
            user,
            create_fee,
            reason="tts_clone_create",
            meta={"provider": prov, "voiceId": voice_id},
        )
        clone_fee_charged = 1
        # Preview with VC model
        try:
            result = await _synthesize_qwen(text=preview, model=QWEN_VC, voice_id=voice_id)
            demo_b64 = result["audioBase64"]
            demo_ctype = result["contentType"]
            usage = int((result.get("extra") or {}).get("usage_characters") or _billable_chars(preview))
            list_p = list_price_for_chars(QWEN_VC, usage)
            _charge(
                user,
                list_p,
                reason="tts_clone_preview",
                meta={"provider": prov, "voiceId": voice_id, "chars": usage},
            )
        except Exception as exc:
            print(f"[tts] qwen clone preview: {exc}")
        _insert_clone(
            int(user["id"]),
            voice_id,
            label_s,
            provider=PROVIDER_QWEN,
            synth_model=QWEN_VC,
            clone_fee_charged=clone_fee_charged,
        )
        total_charged_list = money(create_fee + list_p)
    else:
        mid = synth_model if synth_model in (MM_TURBO, MM_HD) else MM_TURBO
        synth_model = mid
        est = list_price_for_chars(mid, _billable_chars(preview))
        _assert_can_afford(user, est)
        voice_id = _make_mm_voice_id(int(user["id"]))
        async with httpx.AsyncClient(timeout=CLONE_TIMEOUT) as client:
            file_id = await _upload_mm_clone_file(client, data, file.filename or "clone.mp3")
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
                headers=_mm_headers_json(),
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
            _check_mm(body, resp, "voice clone")
        extra = body.get("extra_info") or {}
        usage = int(extra.get("usage_characters") or _billable_chars(preview))
        list_p = list_price_for_chars(mid, usage)
        _charge(
            user,
            list_p,
            reason="tts_clone_preview",
            meta={"provider": prov, "voiceId": voice_id, "chars": usage, "preview": True},
        )
        demo_url = body.get("demo_audio") or ""
        if isinstance(demo_url, str) and demo_url.startswith("http"):
            try:
                raw, demo_ctype = await _fetch_bytes(demo_url)
                demo_b64 = base64.b64encode(raw).decode("ascii")
            except Exception as exc:
                print(f"[tts] demo fetch: {exc}")
        _insert_clone(
            int(user["id"]),
            voice_id,
            label_s,
            provider=PROVIDER_MINIMAX,
            synth_model=mid,
            clone_fee_charged=0,
        )
        total_charged_list = list_p

    pending = (
        0.0
        if clone_fee_charged
        else float(user_price_cny(CLONE_FEE[PROVIDER_MINIMAX]))
    )
    return {
        "provider": prov,
        "voiceId": voice_id,
        "label": label_s,
        "model": synth_model,
        "chars": usage,
        "listPriceCny": float(total_charged_list),
        "chargedCny": float(user_price_cny(total_charged_list)) if not _is_admin(user) else 0.0,
        "cloneFeeCharged": bool(clone_fee_charged),
        "cloneFeePendingUserCny": pending,
        "audioBase64": demo_b64,
        "contentType": demo_ctype,
        "aiWallet": _wallet_for(user),
        "clonedVoices": _user_clones(int(user["id"])),
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
