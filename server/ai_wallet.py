"""Per-user AI image wallet: signup gift + markup charges on successful generation."""

from __future__ import annotations

import json
import os
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from fastapi import HTTPException

AI_GIFT_CNY = Decimal(os.environ.get("AI_BALANCE_GIFT", "3"))
AI_MARKUP = Decimal(os.environ.get("AI_PRICE_MARKUP", "2"))
MONEY_Q = Decimal("0.01")


def _d(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value or 0))


def money(value: Any) -> Decimal:
    return _d(value).quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def user_price_cny(list_price: Any) -> Decimal:
    """Customer charge = vendor list price × markup."""
    return money(_d(list_price) * AI_MARKUP)


def ensure_wallet_schema(cur) -> None:
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'ai_balance'
        """
    )
    if int((cur.fetchone() or {}).get("c") or 0) == 0:
        cur.execute(
            "ALTER TABLE users ADD COLUMN ai_balance DECIMAL(12,2) NOT NULL DEFAULT 0"
        )
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'ai_gifted'
        """
    )
    if int((cur.fetchone() or {}).get("c") or 0) == 0:
        cur.execute(
            "ALTER TABLE users ADD COLUMN ai_gifted TINYINT(1) NOT NULL DEFAULT 0"
        )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_balance_ledger (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            delta DECIMAL(12,2) NOT NULL,
            balance_after DECIMAL(12,2) NOT NULL,
            reason VARCHAR(64) NOT NULL,
            meta_json TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ai_ledger_user (user_id, id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _ledger(cur, user_id: int, delta: Decimal, balance_after: Decimal, reason: str, meta: Optional[dict] = None):
    cur.execute(
        """
        INSERT INTO ai_balance_ledger (user_id, delta, balance_after, reason, meta_json)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            user_id,
            str(money(delta)),
            str(money(balance_after)),
            reason,
            json.dumps(meta or {}, ensure_ascii=False),
        ),
    )


def _tx(conn, fn):
    """Run fn(cur) inside a short transaction (works even if pool uses autocommit)."""
    prev = conn.get_autocommit()
    conn.autocommit(False)
    try:
        with conn.cursor() as cur:
            out = fn(cur)
        conn.commit()
        return out
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            conn.autocommit(prev)
        except Exception:
            pass


def get_balance(conn, user_id: int) -> Decimal:
    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute("SELECT ai_balance FROM users WHERE id=%s", (user_id,))
        row = cur.fetchone() or {}
        return money(row.get("ai_balance"))

    return _tx(conn, _run)


def ensure_signup_gift(conn, user_id: int) -> Decimal:
    """Grant one-time signup gift if not yet granted. Returns balance after."""

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            "SELECT ai_balance, ai_gifted FROM users WHERE id=%s FOR UPDATE",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        bal = money(row.get("ai_balance"))
        gifted = int(row.get("ai_gifted") or 0)
        if gifted:
            return bal
        gift = money(AI_GIFT_CNY)
        if gift > 0:
            bal = money(bal + gift)
            cur.execute(
                "UPDATE users SET ai_balance=%s, ai_gifted=1 WHERE id=%s",
                (str(bal), user_id),
            )
            _ledger(cur, user_id, gift, bal, "signup_gift", {"giftCny": float(gift)})
        else:
            cur.execute("UPDATE users SET ai_gifted=1 WHERE id=%s", (user_id,))
        return bal

    return _tx(conn, _run)


def require_positive_balance(conn, user_id: int) -> Decimal:
    bal = ensure_signup_gift(conn, user_id)
    if bal <= 0:
        raise HTTPException(
            status_code=402,
            detail="Insufficient AI balance. Please top up.",
        )
    return bal


def require_can_afford(conn, user_id: int, list_price: Any) -> Decimal:
    """Ensure balance covers one successful generation at markup price. Returns balance."""
    bal = require_positive_balance(conn, user_id)
    need = user_price_cny(list_price)
    if bal < need:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Insufficient AI balance. Need ¥{need}, have ¥{bal}. "
                "Please top up or select fewer/cheaper models."
            ),
        )
    return bal


def try_charge(
    conn,
    user_id: int,
    amount: Any,
    *,
    reason: str,
    meta: Optional[dict] = None,
) -> Optional[Decimal]:
    """
    Deduct amount if balance is enough. Returns new balance, or None if insufficient.
    """
    amt = money(amount)
    if amt <= 0:
        return get_balance(conn, user_id)

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            "SELECT ai_balance FROM users WHERE id=%s FOR UPDATE",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        bal = money(row.get("ai_balance"))
        if bal < amt:
            return None
        bal = money(bal - amt)
        cur.execute(
            "UPDATE users SET ai_balance=%s WHERE id=%s",
            (str(bal), user_id),
        )
        _ledger(cur, user_id, -amt, bal, reason, meta)
        return bal

    return _tx(conn, _run)


def wallet_public(conn, user: dict, *, is_admin: bool) -> dict:
    """Shape for /image/status and API responses."""
    if is_admin:
        return {
            "unlimited": True,
            "balanceCny": None,
            "giftCny": float(money(AI_GIFT_CNY)),
            "markup": float(AI_MARKUP),
        }
    uid = int(user["id"])
    bal = ensure_signup_gift(conn, uid)
    return {
        "unlimited": False,
        "balanceCny": float(bal),
        "giftCny": float(money(AI_GIFT_CNY)),
        "markup": float(AI_MARKUP),
    }
