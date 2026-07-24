"""Public FX rate proxy (avoids browser CORS / blocked upstream)."""

from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/fx", tags=["fx"])

ALLOWED = frozenset({"CNY", "USD", "EUR", "JPY", "HKD", "GBP", "AUD", "CAD", "SGD", "KRW"})
TIMEOUT = float(os.environ.get("FX_TIMEOUT", "12"))


def _norm(code: str) -> str:
    return (code or "").strip().upper()


@router.get("/rate")
async def fx_rate(
    from_currency: str = Query(..., alias="from", min_length=3, max_length=3),
    to_currency: str = Query(..., alias="to", min_length=3, max_length=3),
):
    src = _norm(from_currency)
    dst = _norm(to_currency)
    if src not in ALLOWED or dst not in ALLOWED:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    if src == dst:
        return {"from": src, "to": dst, "rate": 1.0, "source": "identity"}

    rate: Optional[float] = None
    source = ""
    errors: list[str] = []

    # 1) Frankfurter (ECB)
    try:
        url = f"https://api.frankfurter.app/latest?from={src}&to={dst}"
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url)
            data = resp.json() if resp.content else {}
            if resp.status_code < 400 and isinstance(data, dict):
                rates = data.get("rates") or {}
                if dst in rates:
                    rate = float(rates[dst])
                    source = "frankfurter"
    except Exception as exc:
        errors.append(f"frankfurter:{exc}")

    # 2) Fallback open.er-api.com (no key, USD base often)
    if rate is None:
        try:
            url = f"https://open.er-api.com/v6/latest/{src}"
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(url)
                data = resp.json() if resp.content else {}
                if (
                    resp.status_code < 400
                    and isinstance(data, dict)
                    and data.get("result") == "success"
                ):
                    rates = data.get("rates") or {}
                    if dst in rates:
                        rate = float(rates[dst])
                        source = "open-er-api"
        except Exception as exc:
            errors.append(f"open-er-api:{exc}")

    if rate is None or rate <= 0:
        raise HTTPException(
            status_code=502,
            detail="Unable to fetch live FX rate. Please enter a manual rate.",
        )
    return {"from": src, "to": dst, "rate": rate, "source": source}
