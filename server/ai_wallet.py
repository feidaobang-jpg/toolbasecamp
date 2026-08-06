"""Per-user AI image wallet: signup gift + markup charges on successful generation."""

from __future__ import annotations

import json
import os
import secrets
import string
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from fastapi import HTTPException

AI_GIFT_CNY = Decimal(os.environ.get("AI_BALANCE_GIFT", "5"))
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
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_redeem_codes (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            code VARCHAR(32) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            note VARCHAR(128) NULL,
            created_by BIGINT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            redeemed_by BIGINT NULL,
            redeemed_at TIMESTAMP NULL DEFAULT NULL,
            UNIQUE KEY uk_ai_redeem_code (code),
            INDEX idx_ai_redeem_unused (redeemed_by, id),
            FOREIGN KEY (redeemed_by) REFERENCES users(id) ON DELETE SET NULL
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
            detail="Insufficient balance. Please top up.",
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
                f"Insufficient balance. Need ¥{need}, have ¥{bal}. "
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


def credit_balance(
    conn,
    user_id: int,
    amount: Any,
    *,
    reason: str,
    meta: Optional[dict] = None,
) -> Decimal:
    """Add funds (admin top-up / redeem). Returns balance after."""
    amt = money(amount)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            "SELECT ai_balance FROM users WHERE id=%s FOR UPDATE",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        bal = money(money(row.get("ai_balance")) + amt)
        cur.execute(
            "UPDATE users SET ai_balance=%s WHERE id=%s",
            (str(bal), user_id),
        )
        _ledger(cur, user_id, amt, bal, reason, meta)
        return bal

    return _tx(conn, _run)


def find_user_id_by_account(conn, account: str) -> int:
    acc = (account or "").strip()
    if not acc:
        raise HTTPException(status_code=400, detail="Account is required")

    def _run(cur):
        ensure_wallet_schema(cur)
        if "@" in acc:
            cur.execute(
                "SELECT id FROM users WHERE LOWER(email)=LOWER(%s) LIMIT 1",
                (acc,),
            )
        else:
            phone = acc.replace(" ", "").replace("-", "")
            cur.execute(
                "SELECT id FROM users WHERE phone=%s LIMIT 1",
                (phone,),
            )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return int(row["id"])

    return _tx(conn, _run)


def list_users_wallet(
    conn,
    *,
    q: str = "",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Admin list of users with balance. Search by email or phone only."""
    size = max(1, min(int(page_size or 20), 50))
    pg = max(1, int(page or 1))
    offset = (pg - 1) * size
    keyword = (q or "").strip()

    def _run(cur):
        ensure_wallet_schema(cur)
        where = ""
        params: list = []
        if keyword:
            like = f"%{keyword}%"
            where = "WHERE email LIKE %s OR phone LIKE %s"
            params = [like, like]

        cur.execute(f"SELECT COUNT(*) AS c FROM users {where}", params)
        total = int((cur.fetchone() or {}).get("c") or 0)

        cur.execute(
            f"""
            SELECT id, email, phone, role, ai_balance, created_at
            FROM users
            {where}
            ORDER BY id DESC
            LIMIT %s OFFSET %s
            """,
            params + [size, offset],
        )
        rows = cur.fetchall() or []
        uids = [int(r["id"]) for r in rows]
        stats_by_uid: dict[int, dict] = {}
        if uids:
            placeholders = ",".join(["%s"] * len(uids))
            cur.execute(
                f"""
                SELECT user_id,
                       COALESCE(SUM(CASE WHEN reason='admin_credit' THEN delta ELSE 0 END), 0) AS credited,
                       COALESCE(SUM(CASE WHEN reason='redeem_code' THEN delta ELSE 0 END), 0) AS redeemed,
                       COALESCE(SUM(CASE WHEN reason='signup_gift' THEN delta ELSE 0 END), 0) AS gifted,
                       COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent
                FROM ai_balance_ledger
                WHERE user_id IN ({placeholders})
                GROUP BY user_id
                """,
                uids,
            )
            for s in cur.fetchall() or []:
                if not isinstance(s, dict):
                    continue
                stats_by_uid[int(s["user_id"])] = {
                    "creditedCny": float(money(s.get("credited"))),
                    "redeemedCny": float(money(s.get("redeemed"))),
                    "giftedCny": float(money(s.get("gifted"))),
                    "spentCny": float(money(s.get("spent"))),
                }

        items = []
        for r in rows:
            email = (r.get("email") or "").strip()
            phone = (r.get("phone") or "").strip()
            account = email or phone or "—"
            uid = int(r["id"])
            st = stats_by_uid.get(
                uid,
                {
                    "creditedCny": 0.0,
                    "redeemedCny": 0.0,
                    "giftedCny": 0.0,
                    "spentCny": 0.0,
                },
            )
            items.append(
                {
                    "id": uid,
                    "account": account,
                    "email": email or None,
                    "phone": phone or None,
                    "role": r.get("role") or "user",
                    "balanceCny": float(money(r.get("ai_balance"))),
                    "createdAt": str(r.get("created_at") or ""),
                    "creditedCny": st["creditedCny"],
                    "redeemedCny": st["redeemedCny"],
                    "giftedCny": st["giftedCny"],
                    "spentCny": st["spentCny"],
                }
            )
        pages = max(1, (total + size - 1) // size) if total else 1
        return {
            "users": items,
            "total": total,
            "page": pg,
            "pageSize": size,
            "pages": pages,
            "q": keyword,
        }

    return _tx(conn, _run)


def delete_user_account(conn, user_id: int, *, actor_admin_id: int) -> dict:
    """Hard-delete a non-admin user. Related rows cascade / SET NULL via FKs."""
    uid = int(user_id)
    actor = int(actor_admin_id)
    if uid == actor:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            "SELECT id, email, phone, role FROM users WHERE id=%s FOR UPDATE",
            (uid,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        role = (row.get("role") or "user").strip().lower()
        if role == "admin":
            raise HTTPException(status_code=400, detail="Cannot delete admin accounts")
        email = (row.get("email") or "").strip()
        phone = (row.get("phone") or "").strip()
        account = email or phone or str(uid)
        cur.execute("DELETE FROM users WHERE id=%s AND role<>'admin'", (uid,))
        if cur.rowcount != 1:
            raise HTTPException(status_code=400, detail="Delete failed")
        return {"deletedUserId": uid, "account": account}

    return _tx(conn, _run)


def _gen_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    # Avoid ambiguous chars
    alphabet = alphabet.replace("O", "").replace("0", "").replace("I", "").replace("1", "")
    raw = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"TBC-{raw[:5]}-{raw[5:]}"


def create_redeem_codes(
    conn,
    *,
    amount: Any,
    count: int,
    note: str = "",
    created_by: Optional[int] = None,
) -> list[dict]:
    amt = money(amount)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    n = int(count or 0)
    if n < 1 or n > 50:
        raise HTTPException(status_code=400, detail="Count must be 1–50")

    def _run(cur):
        ensure_wallet_schema(cur)
        out: list[dict] = []
        for _ in range(n):
            code = None
            for _try in range(8):
                candidate = _gen_code()
                cur.execute("SELECT id FROM ai_redeem_codes WHERE code=%s", (candidate,))
                if not cur.fetchone():
                    code = candidate
                    break
            if not code:
                raise HTTPException(status_code=500, detail="Failed to generate unique code")
            cur.execute(
                """
                INSERT INTO ai_redeem_codes (code, amount, note, created_by)
                VALUES (%s, %s, %s, %s)
                """,
                (code, str(amt), (note or "").strip()[:128] or None, created_by),
            )
            out.append({"code": code, "amountCny": float(amt), "note": note or None})
        return out

    return _tx(conn, _run)


def list_redeem_codes(
    conn,
    *,
    status: str = "unused",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """List redeem codes with filter + pagination.

    status: all | unused | used
    """
    st = (status or "unused").strip().lower()
    if st not in ("all", "unused", "used"):
        st = "unused"
    size = max(1, min(int(page_size or 20), 50))
    pg = max(1, int(page or 1))
    offset = (pg - 1) * size

    def _account_label(email, phone) -> Optional[str]:
        ph = str(phone or "").strip()
        em = str(email or "").strip()
        return ph or em or None

    def _run(cur):
        ensure_wallet_schema(cur)
        where = ""
        if st == "unused":
            where = "WHERE redeemed_by IS NULL"
        elif st == "used":
            where = "WHERE redeemed_by IS NOT NULL"

        cur.execute(f"SELECT COUNT(*) AS c FROM ai_redeem_codes {where}")
        total_row = cur.fetchone() or {}
        total = int(total_row.get("c") or 0)

        cur.execute(
            f"""
            SELECT code, amount, note, created_at, redeemed_by, redeemed_at
            FROM ai_redeem_codes
            {where}
            ORDER BY id DESC
            LIMIT %s OFFSET %s
            """,
            (size, offset),
        )
        rows = cur.fetchall() or []

        uids = sorted(
            {
                int(r["redeemed_by"])
                for r in rows
                if isinstance(r, dict) and r.get("redeemed_by")
            }
        )
        account_by_uid: dict[int, Optional[str]] = {}
        if uids:
            placeholders = ",".join(["%s"] * len(uids))
            cur.execute(
                f"SELECT id, email, phone FROM users WHERE id IN ({placeholders})",
                uids,
            )
            for u in cur.fetchall() or []:
                if not isinstance(u, dict):
                    continue
                account_by_uid[int(u["id"])] = _account_label(
                    u.get("email"), u.get("phone")
                )

        items = []
        for r in rows:
            uid = int(r["redeemed_by"]) if r.get("redeemed_by") else None
            account = account_by_uid.get(uid) if uid else None
            items.append(
                {
                    "code": r.get("code"),
                    "amountCny": float(money(r.get("amount"))),
                    "note": r.get("note"),
                    "createdAt": str(r.get("created_at") or ""),
                    "redeemed": bool(uid),
                    "redeemedBy": uid,
                    "redeemedAccount": account,
                    "redeemedAt": str(r.get("redeemed_at") or "") if r.get("redeemed_at") else None,
                }
            )
        pages = max(1, (total + size - 1) // size) if total else 1
        return {
            "codes": items,
            "total": total,
            "page": pg,
            "pageSize": size,
            "pages": pages,
            "status": st,
        }

    return _tx(conn, _run)


def redeem_code(conn, user_id: int, code: str) -> dict:
    raw = (code or "").strip().upper().replace(" ", "")
    if not raw:
        raise HTTPException(status_code=400, detail="Redeem code is required")

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            """
            SELECT id, code, amount, redeemed_by
            FROM ai_redeem_codes
            WHERE code=%s
            FOR UPDATE
            """,
            (raw,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Invalid redeem code")
        if row.get("redeemed_by"):
            raise HTTPException(status_code=400, detail="Redeem code already used")
        amt = money(row.get("amount"))
        cur.execute(
            "SELECT ai_balance FROM users WHERE id=%s FOR UPDATE",
            (user_id,),
        )
        urow = cur.fetchone()
        if not urow:
            raise HTTPException(status_code=404, detail="User not found")
        bal = money(money(urow.get("ai_balance")) + amt)
        cur.execute(
            "UPDATE users SET ai_balance=%s WHERE id=%s",
            (str(bal), user_id),
        )
        cur.execute(
            """
            UPDATE ai_redeem_codes
            SET redeemed_by=%s, redeemed_at=CURRENT_TIMESTAMP
            WHERE id=%s AND redeemed_by IS NULL
            """,
            (user_id, int(row["id"])),
        )
        if cur.rowcount != 1:
            raise HTTPException(status_code=400, detail="Redeem code already used")
        _ledger(
            cur,
            user_id,
            amt,
            bal,
            "redeem_code",
            {"code": raw, "amountCny": float(amt)},
        )
        return {"balanceCny": float(bal), "creditedCny": float(amt), "code": raw}

    return _tx(conn, _run)
