"""Proxy for TianAPI (天行数据) life-content endpoints. API key stays server-side."""

from __future__ import annotations

import os
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/life", tags=["life"])

TIANAPI_BASE = os.environ.get("TIANAPI_BASE", "https://apis.tianapi.com").rstrip("/")
TIANAPI_KEY = os.environ.get("TIANAPI_KEY", "").strip()
TIANAPI_TIMEOUT = float(os.environ.get("TIANAPI_TIMEOUT", "15"))

# Whitelist: path segment after base, matches mini-program config.apis
ALLOWED_APIS = frozenset(
    {
        # 心语
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
        # 生活
        "msdl",
        "duilian",
        "mingyan",
        "lzmy",
        "mgjuzi",
        "qingshi",
        "verse",
        "dictum",
        # 娱乐
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
        # 谜语
        "riddle",
        "zimi",
        "slogan",
        "caichengyu",
        "caizimi",
        "cityriddle",
        # 学习
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

# Query params clients may forward (besides key)
ALLOWED_PARAMS = frozenset({"word", "num", "page", "typeid", "yuan"})


@router.get("/status")
def life_status():
    return {
        "configured": bool(TIANAPI_KEY),
        "apis": sorted(ALLOWED_APIS),
    }


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

    url = f"{TIANAPI_BASE}/{api_id}/index?{urlencode(params)}"
    try:
        with httpx.Client(timeout=TIANAPI_TIMEOUT) as client:
            resp = client.get(url)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"TianAPI request failed: {exc}") from exc

    try:
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Invalid TianAPI response") from exc

    code = data.get("code")
    if code is not None and int(code) != 200:
        msg = data.get("msg") or data.get("message") or "TianAPI error"
        raise HTTPException(status_code=400, detail=str(msg))

    return {"result": data.get("result"), "code": code}
