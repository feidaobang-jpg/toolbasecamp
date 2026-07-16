"""Proxy for TianAPI (天行数据) life-content endpoints. API key stays server-side."""

from __future__ import annotations

import os
import socket
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/life", tags=["life"])

TIANAPI_BASE = os.environ.get("TIANAPI_BASE", "https://apis.tianapi.com").rstrip("/")
TIANAPI_KEY = os.environ.get("TIANAPI_KEY", "").strip()
TIANAPI_TIMEOUT = float(os.environ.get("TIANAPI_TIMEOUT", "8"))

# Whitelist: path segment after base, matches mini-program config.apis
ALLOWED_APIS = frozenset(
    {
        "caihongpi",
        "dujitang",
        "godreply",
        "joke",
        "pyqwenan",
        "saylove",
        "sentence",
        "hsjz",
        "tiangou",
        "wanan",
        "zaoan",
        "msdl",
        "duilian",
        "mingyan",
        "lzmy",
        "mgjuzi",
        "qingshi",
        "verse",
        "dictum",
        "duishici",
        "naowan",
        "scwd",
        "proverb",
        "skl",
        "xiehou",
        "rkl",
        "moodpoetry",
        "decide",
        "mnpara",
        "wenda",
        "riddle",
        "zimi",
        "slogan",
        "caichengyu",
        "caizimi",
        "cityriddle",
        "chengyu",
        "everyday",
        "gjmj",
        "xhzd",
        "enwords",
        "hotword",
        "jfwords",
        "zmsc",
        "songci",
        "poetries",
        "poetry",
    }
)

_UA = (
    "Mozilla/5.0 (compatible; ToolBasecamp/1.0; +https://toolbasecamp.com)"
)


def _force_ipv4():
    """Prefer IPv4 — some VPS have broken/slow IPv6 routes to CN APIs."""
    _orig = socket.getaddrinfo

    def _wrapped(host, port, family=0, type=0, proto=0, flags=0):
        infos = _orig(host, port, socket.AF_INET, type, proto, flags)
        if infos:
            return infos
        return _orig(host, port, family, type, proto, flags)

    socket.getaddrinfo = _wrapped  # type: ignore[assignment]


_force_ipv4()


@router.get("/status")
def life_status():
    return {
        "configured": bool(TIANAPI_KEY),
        "apis": sorted(ALLOWED_APIS),
        "base": TIANAPI_BASE,
        "timeout": TIANAPI_TIMEOUT,
    }


def _fetch_tian(api_id: str, params: dict[str, Any]) -> dict:
    url = f"{TIANAPI_BASE}/{api_id}/index?{urlencode(params)}"
    try:
        with httpx.Client(
            timeout=TIANAPI_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": _UA, "Accept": "application/json"},
        ) as client:
            resp = client.get(url)
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="TianAPI timed out. VPS may not reach apis.tianapi.com — check outbound network.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"TianAPI unreachable: {exc}",
        ) from exc

    try:
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Invalid TianAPI response") from exc

    code = data.get("code")
    if code is not None and int(code) != 200:
        msg = data.get("msg") or data.get("message") or "TianAPI error"
        raise HTTPException(status_code=400, detail=str(msg))
    return data


@router.get("/tian/{api_id}")
def tian_proxy(
    api_id: str,
    word: Optional[str] = Query(None),
    num: Optional[str] = Query(None),
    page: Optional[str] = Query(None),
    typeid: Optional[str] = Query(None),
    yuan: Optional[str] = Query(None),
):
    api_id = (api_id or "").strip().lower()
    if api_id not in ALLOWED_APIS:
        raise HTTPException(status_code=404, detail="Unknown life API")
    if not TIANAPI_KEY:
        raise HTTPException(
            status_code=503,
            detail="TianAPI is not configured (TIANAPI_KEY).",
        )

    params: dict[str, Any] = {"key": TIANAPI_KEY}
    for name, val in (
        ("word", word),
        ("num", num),
        ("page", page),
        ("typeid", typeid),
        ("yuan", yuan),
    ):
        if val is not None and str(val).strip() != "":
            params[name] = str(val).strip()

    data = _fetch_tian(api_id, params)
    return {"result": data.get("result"), "code": data.get("code")}
