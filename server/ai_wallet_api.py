"""AI wallet admin credit + user redeem-code + referral APIs."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from ai_wallet import (
    bind_invited_by,
    create_redeem_codes,
    credit_balance,
    delete_user_account,
    ensure_invite_code,
    find_user_id_by_account,
    list_commission_withdrawals,
    list_redeem_codes,
    list_users_wallet,
    redeem_code,
    referral_me,
    request_commission_withdraw,
    resolve_inviter_id,
    settle_commission_withdrawal,
    wallet_public,
)
from feishu_notify import SITE_BASE_URL, mask_contact, notify_feishu_text_async

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


class WithdrawBody(BaseModel):
    amountCny: float = Field(..., gt=0, le=100000)
    note: str = Field("", max_length=255)


class SettleBody(BaseModel):
    amountCny: float = Field(..., gt=0, le=100000)
    note: str = Field("", max_length=255)


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


@router.get("/admin/users")
def admin_list_users(
    q: str = "",
    page: int = 1,
    page_size: int = 20,
    admin: dict = Depends(_admin),
):
    _ = admin
    conn = _conn()
    try:
        out = list_users_wallet(conn, q=q, page=page, page_size=page_size)
        out["success"] = True
        return out
    finally:
        conn.close()


@router.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, admin: dict = Depends(_admin)):
    conn = _conn()
    try:
        out = delete_user_account(conn, int(user_id), actor_admin_id=int(admin["id"]))
        out["success"] = True
        return out
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
def admin_list_codes(
    status: str = "unused",
    page: int = 1,
    page_size: int = 20,
    admin: dict = Depends(_admin),
):
    _ = admin
    conn = _conn()
    try:
        out = list_redeem_codes(conn, status=status, page=page, page_size=page_size)
        out["success"] = True
        return out
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


@router.get("/referral/me")
def referral_status(user: dict = Depends(_user)):
    conn = _conn()
    try:
        out = referral_me(conn, int(user["id"]), site_base=SITE_BASE_URL)
        out["success"] = True
        return out
    finally:
        conn.close()


@router.post("/referral/ensure-code")
def referral_ensure_code(user: dict = Depends(_user)):
    conn = _conn()
    try:
        code = ensure_invite_code(conn, int(user["id"]))
        out = referral_me(conn, int(user["id"]), site_base=SITE_BASE_URL)
        out["success"] = True
        out["inviteCode"] = code
        return out
    finally:
        conn.close()


@router.post("/referral/withdraw")
async def referral_withdraw(body: WithdrawBody, user: dict = Depends(_user)):
    if router.is_admin(user):  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=400,
            detail="Admin accounts do not use commission withdraw.",
        )
    conn = _conn()
    try:
        out = request_commission_withdraw(
            conn,
            int(user["id"]),
            body.amountCny,
            note=body.note or "",
        )
        out["success"] = True
    finally:
        conn.close()

    contact = mask_contact(
        email=out.get("email"),
        phone=out.get("phone"),
        guest_name=out.get("account"),
    )
    text = (
        f"【佣金提现申请】\n"
        f"用户：{contact}\n"
        f"金额：¥{out['amountCny']:.2f}\n"
        f"当前佣金余额：¥{out['commissionCny']:.2f}\n"
        f"申请ID：{out['id']}\n"
        f"请微信打款后到后台「佣金兑现」核销。\n"
        f"{SITE_BASE_URL}/html/admin/private/ai-wallet.html"
    )
    try:
        await notify_feishu_text_async(text, key=f"wd:{out['id']}")
    except Exception:
        pass
    return out


@router.get("/admin/withdrawals")
def admin_list_withdrawals(
    status: str = "pending",
    page: int = 1,
    page_size: int = 20,
    admin: dict = Depends(_admin),
):
    _ = admin
    conn = _conn()
    try:
        out = list_commission_withdrawals(
            conn, status=status, page=page, page_size=page_size
        )
        out["success"] = True
        return out
    finally:
        conn.close()


@router.post("/admin/withdrawals/{withdrawal_id}/settle")
def admin_settle_withdrawal(
    withdrawal_id: int,
    body: SettleBody,
    admin: dict = Depends(_admin),
):
    conn = _conn()
    try:
        out = settle_commission_withdrawal(
            conn,
            int(withdrawal_id),
            amount=body.amountCny,
            admin_id=int(admin["id"]),
            note=body.note or "",
        )
        out["success"] = True
        return out
    finally:
        conn.close()
