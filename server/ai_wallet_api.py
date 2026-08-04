"""AI wallet admin credit + user redeem-code APIs."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from ai_wallet import (
    create_redeem_codes,
    credit_balance,
    find_user_id_by_account,
    list_redeem_codes,
    redeem_code,
    wallet_public,
)

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/wallet", tags=["wallet"])


def _wire(get_conn, require_db, get_current_user, require_admin, is_admin_fn):
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]
    router.require_admin = require_admin  # type: ignore[attr-defined]
    router.is_admin = is_admin_fn  # type: ignore[attr-defined]


def _user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    router.require_db()  # type: ignore[attr-defined]
    return router.get_current_user(creds)  # type: ignore[attr-defined]


def _admin(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    user = _user(creds)
    router.require_admin(user)  # type: ignore[attr-defined]
    return user


def _conn():
    return router.get_conn()  # type: ignore[attr-defined]


class CreditBody(BaseModel):
    account: str = Field(..., min_length=1, max_length=128)
    amountCny: float = Field(..., gt=0, le=10000)
    note: str = Field("", max_length=128)


class CreateCodesBody(BaseModel):
    amountCny: float = Field(..., gt=0, le=10000)
    count: int = Field(1, ge=1, le=50)
    note: str = Field("", max_length=128)


class RedeemBody(BaseModel):
    code: str = Field(..., min_length=4, max_length=40)


@router.post("/admin/credit")
def admin_credit(body: CreditBody, admin: dict = Depends(_admin)):
    conn = _conn()
    try:
        uid = find_user_id_by_account(conn, body.account)
        bal = credit_balance(
            conn,
            uid,
            body.amountCny,
            reason="admin_credit",
            meta={
                "account": body.account.strip(),
                "note": (body.note or "").strip() or None,
                "byAdminId": int(admin["id"]),
            },
        )
        return {
            "success": True,
            "userId": uid,
            "creditedCny": float(body.amountCny),
            "balanceCny": float(bal),
        }
    finally:
        conn.close()


@router.post("/admin/codes")
def admin_create_codes(body: CreateCodesBody, admin: dict = Depends(_admin)):
    conn = _conn()
    try:
        codes = create_redeem_codes(
            conn,
            amount=body.amountCny,
            count=body.count,
            note=body.note or "",
            created_by=int(admin["id"]),
        )
        return {"success": True, "codes": codes}
    finally:
        conn.close()


@router.get("/admin/codes")
def admin_list_codes(limit: int = 40, admin: dict = Depends(_admin)):
    _ = admin
    conn = _conn()
    try:
        return {"success": True, "codes": list_redeem_codes(conn, limit=limit)}
    finally:
        conn.close()


@router.post("/redeem")
def user_redeem(body: RedeemBody, user: dict = Depends(_user)):
    if router.is_admin(user):  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=400,
            detail="Admin accounts have unlimited balance; redeem is not needed.",
        )
    conn = _conn()
    try:
        out = redeem_code(conn, int(user["id"]), body.code)
        out["success"] = True
        out["aiWallet"] = wallet_public(conn, user, is_admin=False)
        return out
    finally:
        conn.close()
