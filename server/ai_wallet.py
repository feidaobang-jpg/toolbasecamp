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
REFERRAL_COMMISSION_RATE = Decimal(os.environ.get("REFERRAL_COMMISSION_RATE", "0.10"))
MONEY_Q = Decimal("0.01")
REFERRAL_CREDIT_REASONS = frozenset({"admin_credit", "redeem_code"})


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
            INDEX idx_ai_ledger_created (created_at),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    try:
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'ai_balance_ledger'
              AND INDEX_NAME = 'idx_ai_ledger_created'
            """
        )
        if int((cur.fetchone() or {}).get("c") or 0) == 0:
            cur.execute(
                "CREATE INDEX idx_ai_ledger_created ON ai_balance_ledger (created_at)"
            )
    except Exception as exc:
        print(f"[migrate] idx_ai_ledger_created: {exc}")
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
    for col, col_sql in (
        ("invite_code", "invite_code VARCHAR(16) NULL"),
        ("invited_by", "invited_by BIGINT NULL"),
        ("commission_cny", "commission_cny DECIMAL(12,2) NOT NULL DEFAULT 0"),
    ):
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = %s
            """,
            (col,),
        )
        if int((cur.fetchone() or {}).get("c") or 0) == 0:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN {col_sql}")
            except Exception as exc:
                print(f"[migrate] users.{col}: {exc}")
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND INDEX_NAME = 'uq_users_invite_code'
        """
    )
    if int((cur.fetchone() or {}).get("c") or 0) == 0:
        try:
            cur.execute(
                "CREATE UNIQUE INDEX uq_users_invite_code ON users (invite_code)"
            )
        except Exception as exc:
            print(f"[migrate] uq_users_invite_code: {exc}")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS commission_ledger (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            delta DECIMAL(12,2) NOT NULL,
            balance_after DECIMAL(12,2) NOT NULL,
            reason VARCHAR(64) NOT NULL,
            meta_json TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_commission_ledger_user (user_id, id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS commission_withdrawals (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            note VARCHAR(255) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            settled_at TIMESTAMP NULL DEFAULT NULL,
            settled_by BIGINT NULL,
            INDEX idx_commission_wd_status (status, id),
            INDEX idx_commission_wd_user (user_id, id),
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


def _commission_ledger(
    cur, user_id: int, delta: Decimal, balance_after: Decimal, reason: str, meta: Optional[dict] = None
):
    cur.execute(
        """
        INSERT INTO commission_ledger (user_id, delta, balance_after, reason, meta_json)
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


def _maybe_grant_referral_commission(
    cur,
    payer_user_id: int,
    amount: Decimal,
    *,
    source_reason: str,
    meta: Optional[dict] = None,
) -> None:
    """Credit inviter commission when invitee tops up (same DB transaction)."""
    if source_reason not in REFERRAL_CREDIT_REASONS:
        return
    amt = money(amount)
    if amt <= 0:
        return
    rate = money(REFERRAL_COMMISSION_RATE)
    if rate <= 0:
        return
    commission = money(amt * rate)
    if commission <= 0:
        return
    cur.execute(
        "SELECT invited_by FROM users WHERE id=%s",
        (int(payer_user_id),),
    )
    row = cur.fetchone() or {}
    inviter_id = row.get("invited_by")
    if not inviter_id:
        return
    inviter_id = int(inviter_id)
    if inviter_id == int(payer_user_id):
        return
    cur.execute(
        "SELECT commission_cny FROM users WHERE id=%s FOR UPDATE",
        (inviter_id,),
    )
    irow = cur.fetchone()
    if not irow:
        return
    bal = money(money(irow.get("commission_cny")) + commission)
    cur.execute(
        "UPDATE users SET commission_cny=%s WHERE id=%s",
        (str(bal), inviter_id),
    )
    pay_meta = dict(meta or {})
    pay_meta.update(
        {
            "fromUserId": int(payer_user_id),
            "baseCny": float(amt),
            "rate": float(rate),
            "sourceReason": source_reason,
        }
    )
    _commission_ledger(cur, inviter_id, commission, bal, "referral_earn", pay_meta)


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
            "commissionCny": 0.0,
            "giftCny": float(money(AI_GIFT_CNY)),
            "markup": float(AI_MARKUP),
            "referralRate": float(money(REFERRAL_COMMISSION_RATE)),
        }
    uid = int(user["id"])
    bal = ensure_signup_gift(conn, uid)

    def _comm(cur):
        ensure_wallet_schema(cur)
        cur.execute("SELECT commission_cny FROM users WHERE id=%s", (uid,))
        row = cur.fetchone() or {}
        return money(row.get("commission_cny"))

    commission = _tx(conn, _comm)
    return {
        "unlimited": False,
        "balanceCny": float(bal),
        "commissionCny": float(commission),
        "giftCny": float(money(AI_GIFT_CNY)),
        "markup": float(AI_MARKUP),
        "referralRate": float(money(REFERRAL_COMMISSION_RATE)),
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
        _maybe_grant_referral_commission(
            cur, int(user_id), amt, source_reason=reason, meta=meta
        )
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
    """Admin list of users with balance. Search by phone, email, or nickname."""
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
            where = "WHERE email LIKE %s OR phone LIKE %s OR nickname LIKE %s"
            params = [like, like, like]

        cur.execute(f"SELECT COUNT(*) AS c FROM users {where}", params)
        total = int((cur.fetchone() or {}).get("c") or 0)

        cur.execute(
            f"""
            SELECT id, email, phone, nickname, role, ai_balance, commission_cny, created_at
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
            nickname = (r.get("nickname") or "").strip()
            login = email or phone or "—"
            account = nickname or login
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
                    "loginAccount": login,
                    "nickname": nickname or None,
                    "email": email or None,
                    "phone": phone or None,
                    "role": r.get("role") or "user",
                    "balanceCny": float(money(r.get("ai_balance"))),
                    "commissionCny": float(money(r.get("commission_cny"))),
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
    """Hard-delete a user. Related rows cascade / SET NULL via FKs.

    Guards: cannot delete self; cannot delete the last remaining admin.
    Pre-clears record_goods that would block category CASCADE (ON DELETE RESTRICT).
    """
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
            cur.execute("SELECT COUNT(*) AS c FROM users WHERE role='admin'")
            admin_count = int((cur.fetchone() or {}).get("c") or 0)
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete the last admin account",
                )
        email = (row.get("email") or "").strip()
        phone = (row.get("phone") or "").strip()
        account = email or phone or str(uid)

        # Clear invitee bindings pointing at this user (no FK on invited_by).
        try:
            cur.execute(
                "UPDATE users SET invited_by=NULL WHERE invited_by=%s",
                (uid,),
            )
        except Exception:
            pass

        # record_goods.category_id is ON DELETE RESTRICT — clear before user CASCADE.
        try:
            cur.execute(
                """
                DELETE g FROM record_goods g
                INNER JOIN record_goods_categories c ON c.id = g.category_id
                WHERE g.user_id=%s OR c.user_id=%s
                """,
                (uid, uid),
            )
        except Exception:
            # Table may not exist on older DBs
            pass

        cur.execute("DELETE FROM users WHERE id=%s", (uid,))
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
        _maybe_grant_referral_commission(
            cur,
            int(user_id),
            amt,
            source_reason="redeem_code",
            meta={"code": raw, "amountCny": float(amt)},
        )
        return {"balanceCny": float(bal), "creditedCny": float(amt), "code": raw}

    return _tx(conn, _run)


def _gen_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    alphabet = alphabet.replace("O", "").replace("0", "").replace("I", "").replace("1", "")
    raw = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"TB{raw[:4]}{raw[4:]}"


def resolve_inviter_id(conn, invite_code: str) -> Optional[int]:
    code = (invite_code or "").strip().upper().replace(" ", "")
    if not code:
        return None

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            "SELECT id FROM users WHERE UPPER(invite_code)=%s LIMIT 1",
            (code,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Invalid invite code")
        return int(row["id"])

    return _tx(conn, _run)


def bind_invited_by(conn, user_id: int, inviter_id: int) -> None:
    uid = int(user_id)
    iid = int(inviter_id)
    if uid == iid:
        raise HTTPException(status_code=400, detail="Cannot use your own invite code")

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            "SELECT id, invited_by FROM users WHERE id=%s FOR UPDATE",
            (uid,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if row.get("invited_by"):
            return
        cur.execute("SELECT id FROM users WHERE id=%s", (iid,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Invalid invite code")
        cur.execute(
            "UPDATE users SET invited_by=%s WHERE id=%s AND invited_by IS NULL",
            (iid, uid),
        )

    _tx(conn, _run)


def ensure_invite_code(conn, user_id: int) -> str:
    uid = int(user_id)

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            "SELECT invite_code FROM users WHERE id=%s FOR UPDATE",
            (uid,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        existing = (row.get("invite_code") or "").strip()
        if existing:
            return existing
        for _ in range(12):
            code = _gen_invite_code()
            cur.execute("SELECT id FROM users WHERE invite_code=%s", (code,))
            if cur.fetchone():
                continue
            cur.execute(
                "UPDATE users SET invite_code=%s WHERE id=%s",
                (code, uid),
            )
            return code
        raise HTTPException(status_code=500, detail="Failed to generate invite code")

    return _tx(conn, _run)


def referral_me(conn, user_id: int, *, site_base: str = "https://toolbasecamp.com") -> dict:
    uid = int(user_id)
    code = ensure_invite_code(conn, uid)
    base = (site_base or "https://toolbasecamp.com").rstrip("/")

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            "SELECT commission_cny, invited_by FROM users WHERE id=%s",
            (uid,),
        )
        row = cur.fetchone() or {}
        commission = money(row.get("commission_cny"))
        cur.execute(
            """
            SELECT COALESCE(SUM(delta), 0) AS earned
            FROM commission_ledger
            WHERE user_id=%s AND reason='referral_earn'
            """,
            (uid,),
        )
        earned = money((cur.fetchone() or {}).get("earned"))
        cur.execute(
            """
            SELECT id, amount, status, note, created_at, settled_at
            FROM commission_withdrawals
            WHERE user_id=%s
            ORDER BY id DESC
            LIMIT 20
            """,
            (uid,),
        )
        wds = []
        for r in cur.fetchall() or []:
            wds.append(
                {
                    "id": int(r["id"]),
                    "amountCny": float(money(r.get("amount"))),
                    "status": r.get("status") or "pending",
                    "note": r.get("note"),
                    "createdAt": str(r.get("created_at") or ""),
                    "settledAt": str(r.get("settled_at") or "") if r.get("settled_at") else None,
                }
            )
        cur.execute("SELECT COUNT(*) AS c FROM users WHERE invited_by=%s", (uid,))
        invitee_count = int((cur.fetchone() or {}).get("c") or 0)
        return {
            "inviteCode": code,
            "inviteUrl": f"{base}/html/auth/register.html?invite={code}",
            "commissionCny": float(commission),
            "earnedTotalCny": float(earned),
            "inviteeCount": invitee_count,
            "referralRate": float(money(REFERRAL_COMMISSION_RATE)),
            "withdrawals": wds,
            "invitedBy": int(row["invited_by"]) if row.get("invited_by") else None,
        }

    return _tx(conn, _run)


def request_commission_withdraw(conn, user_id: int, amount: Any, *, note: str = "") -> dict:
    uid = int(user_id)
    amt = money(amount)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            "SELECT commission_cny, email, phone, nickname FROM users WHERE id=%s FOR UPDATE",
            (uid,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        bal = money(row.get("commission_cny"))
        if amt > bal:
            raise HTTPException(status_code=400, detail="Insufficient commission")
        # Pending requests already reserved? Keep simple: allow request up to current commission;
        # admin must settle promptly. Optionally sum pending:
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS pending
            FROM commission_withdrawals
            WHERE user_id=%s AND status='pending'
            """,
            (uid,),
        )
        pending = money((cur.fetchone() or {}).get("pending"))
        if money(pending + amt) > bal:
            raise HTTPException(
                status_code=400,
                detail="Insufficient commission (pending withdrawals reserved)",
            )
        cur.execute(
            """
            INSERT INTO commission_withdrawals (user_id, amount, status, note)
            VALUES (%s, %s, 'pending', %s)
            """,
            (uid, str(amt), (note or "").strip()[:255] or None),
        )
        wid = int(cur.lastrowid)
        email = (row.get("email") or "").strip()
        phone = (row.get("phone") or "").strip()
        nick = (row.get("nickname") or "").strip()
        account = nick or phone or email or str(uid)
        return {
            "id": wid,
            "amountCny": float(amt),
            "status": "pending",
            "commissionCny": float(bal),
            "account": account,
            "phone": phone or None,
            "email": email or None,
        }

    return _tx(conn, _run)


def list_commission_withdrawals(
    conn,
    *,
    status: str = "pending",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    st = (status or "pending").strip().lower()
    if st not in ("all", "pending", "paid", "rejected"):
        st = "pending"
    size = max(1, min(int(page_size or 20), 50))
    pg = max(1, int(page or 1))
    offset = (pg - 1) * size

    def _run(cur):
        ensure_wallet_schema(cur)
        where = ""
        params: list = []
        if st != "all":
            where = "WHERE w.status=%s"
            params = [st]
        cur.execute(
            f"SELECT COUNT(*) AS c FROM commission_withdrawals w {where}",
            params,
        )
        total = int((cur.fetchone() or {}).get("c") or 0)
        cur.execute(
            f"""
            SELECT w.id, w.user_id, w.amount, w.status, w.note, w.created_at, w.settled_at,
                   u.email, u.phone, u.nickname, u.commission_cny
            FROM commission_withdrawals w
            JOIN users u ON u.id = w.user_id
            {where}
            ORDER BY w.id DESC
            LIMIT %s OFFSET %s
            """,
            params + [size, offset],
        )
        items = []
        for r in cur.fetchall() or []:
            email = (r.get("email") or "").strip()
            phone = (r.get("phone") or "").strip()
            nick = (r.get("nickname") or "").strip()
            items.append(
                {
                    "id": int(r["id"]),
                    "userId": int(r["user_id"]),
                    "account": nick or phone or email or str(r["user_id"]),
                    "loginAccount": phone or email or None,
                    "amountCny": float(money(r.get("amount"))),
                    "commissionCny": float(money(r.get("commission_cny"))),
                    "status": r.get("status") or "pending",
                    "note": r.get("note"),
                    "createdAt": str(r.get("created_at") or ""),
                    "settledAt": str(r.get("settled_at") or "") if r.get("settled_at") else None,
                }
            )
        pages = max(1, (total + size - 1) // size) if total else 1
        return {
            "withdrawals": items,
            "total": total,
            "page": pg,
            "pageSize": size,
            "pages": pages,
            "status": st,
        }

    return _tx(conn, _run)


def settle_commission_withdrawal(
    conn,
    withdrawal_id: int,
    *,
    amount: Any,
    admin_id: int,
    note: str = "",
) -> dict:
    wid = int(withdrawal_id)
    amt = money(amount)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    def _run(cur):
        ensure_wallet_schema(cur)
        cur.execute(
            """
            SELECT id, user_id, amount, status
            FROM commission_withdrawals
            WHERE id=%s FOR UPDATE
            """,
            (wid,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Withdrawal not found")
        if (row.get("status") or "") != "pending":
            raise HTTPException(status_code=400, detail="Withdrawal already settled")
        uid = int(row["user_id"])
        cur.execute(
            "SELECT commission_cny FROM users WHERE id=%s FOR UPDATE",
            (uid,),
        )
        urow = cur.fetchone()
        if not urow:
            raise HTTPException(status_code=404, detail="User not found")
        bal = money(urow.get("commission_cny"))
        if amt > bal:
            raise HTTPException(status_code=400, detail="Amount exceeds commission balance")
        bal = money(bal - amt)
        cur.execute(
            "UPDATE users SET commission_cny=%s WHERE id=%s",
            (str(bal), uid),
        )
        settle_note = (note or "").strip()[:255] or None
        cur.execute(
            """
            UPDATE commission_withdrawals
            SET status='paid', amount=%s, note=COALESCE(%s, note),
                settled_at=CURRENT_TIMESTAMP, settled_by=%s
            WHERE id=%s
            """,
            (str(amt), settle_note, int(admin_id), wid),
        )
        _commission_ledger(
            cur,
            uid,
            -amt,
            bal,
            "withdraw_settle",
            {
                "withdrawalId": wid,
                "byAdminId": int(admin_id),
                "note": settle_note,
            },
        )
        return {
            "id": wid,
            "userId": uid,
            "amountCny": float(amt),
            "commissionCny": float(bal),
            "status": "paid",
        }

    return _tx(conn, _run)