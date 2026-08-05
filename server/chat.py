"""Support private chat: one thread per user with site admins."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException

MAX_BODY = 2000
LIST_LIMIT = 50
MSG_PAGE = 40


def ensure_chat_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_threads (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL,
            last_message_at TIMESTAMP NULL DEFAULT NULL,
            last_preview VARCHAR(200) NULL,
            user_last_read_id BIGINT NOT NULL DEFAULT 0,
            admin_last_read_id BIGINT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_chat_thread_user (user_id),
            INDEX idx_chat_thread_last (last_message_at),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            thread_id BIGINT NOT NULL,
            sender_id BIGINT NOT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_chat_msg_thread (thread_id, id),
            FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _tx(conn, fn):
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


def _account_label(email, phone) -> str:
    ph = str(phone or "").strip()
    em = str(email or "").strip()
    return ph or em or "—"


def _preview(body: str) -> str:
    s = " ".join((body or "").split())
    return s[:180] + ("…" if len(s) > 180 else "")


def _msg_row(r: dict) -> dict:
    return {
        "id": int(r["id"]),
        "threadId": int(r["thread_id"]),
        "senderId": int(r["sender_id"]),
        "body": r.get("body") or "",
        "createdAt": str(r.get("created_at") or ""),
    }


def get_or_create_thread(conn, user_id: int) -> dict:
    def _run(cur):
        ensure_chat_schema(cur)
        cur.execute(
            """
            SELECT id, user_id, last_message_at, last_preview,
                   user_last_read_id, admin_last_read_id
            FROM chat_threads WHERE user_id=%s
            """,
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                "INSERT INTO chat_threads (user_id) VALUES (%s)",
                (user_id,),
            )
            tid = int(cur.lastrowid)
            cur.execute(
                """
                SELECT id, user_id, last_message_at, last_preview,
                       user_last_read_id, admin_last_read_id
                FROM chat_threads WHERE id=%s
                """,
                (tid,),
            )
            row = cur.fetchone()
        return row

    return _tx(conn, _run)


def _unread_for_user(cur, thread: dict, user_id: int) -> int:
    last = int(thread.get("user_last_read_id") or 0)
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM chat_messages
        WHERE thread_id=%s AND id>%s AND sender_id<>%s
        """,
        (int(thread["id"]), last, user_id),
    )
    return int((cur.fetchone() or {}).get("c") or 0)


def _unread_for_admin(cur, thread: dict) -> int:
    last = int(thread.get("admin_last_read_id") or 0)
    uid = int(thread["user_id"])
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM chat_messages
        WHERE thread_id=%s AND id>%s AND sender_id=%s
        """,
        (int(thread["id"]), last, uid),
    )
    return int((cur.fetchone() or {}).get("c") or 0)


def user_unread_total(conn, user_id: int) -> int:
    def _run(cur):
        ensure_chat_schema(cur)
        cur.execute(
            """
            SELECT id, user_id, user_last_read_id, admin_last_read_id
            FROM chat_threads WHERE user_id=%s
            """,
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            return 0
        return _unread_for_user(cur, row, user_id)

    return _tx(conn, _run)


def admin_unread_total(conn) -> int:
    def _run(cur):
        ensure_chat_schema(cur)
        cur.execute(
            "SELECT id, user_id, user_last_read_id, admin_last_read_id FROM chat_threads"
        )
        rows = cur.fetchall() or []
        total = 0
        for r in rows:
            total += _unread_for_admin(cur, r)
        return total

    return _tx(conn, _run)


def list_messages(
    conn,
    *,
    thread_id: int,
    before_id: Optional[int] = None,
    limit: int = MSG_PAGE,
) -> list[dict]:
    size = max(1, min(int(limit or MSG_PAGE), 100))

    def _run(cur):
        ensure_chat_schema(cur)
        if before_id:
            cur.execute(
                """
                SELECT id, thread_id, sender_id, body, created_at
                FROM chat_messages
                WHERE thread_id=%s AND id<%s
                ORDER BY id DESC
                LIMIT %s
                """,
                (thread_id, int(before_id), size),
            )
        else:
            cur.execute(
                """
                SELECT id, thread_id, sender_id, body, created_at
                FROM chat_messages
                WHERE thread_id=%s
                ORDER BY id DESC
                LIMIT %s
                """,
                (thread_id, size),
            )
        rows = list(reversed(cur.fetchall() or []))
        return [_msg_row(r) for r in rows]

    return _tx(conn, _run)


def mark_read(conn, *, thread_id: int, reader_id: int, as_admin: bool) -> dict:
    def _run(cur):
        ensure_chat_schema(cur)
        cur.execute(
            "SELECT id, user_id, user_last_read_id, admin_last_read_id FROM chat_threads WHERE id=%s",
            (thread_id,),
        )
        th = cur.fetchone()
        if not th:
            raise HTTPException(status_code=404, detail="Thread not found")
        if not as_admin and int(th["user_id"]) != int(reader_id):
            raise HTTPException(status_code=403, detail="Forbidden")
        cur.execute(
            "SELECT COALESCE(MAX(id), 0) AS m FROM chat_messages WHERE thread_id=%s",
            (thread_id,),
        )
        mid = int((cur.fetchone() or {}).get("m") or 0)
        if as_admin:
            cur.execute(
                "UPDATE chat_threads SET admin_last_read_id=%s WHERE id=%s",
                (mid, thread_id),
            )
        else:
            cur.execute(
                "UPDATE chat_threads SET user_last_read_id=%s WHERE id=%s",
                (mid, thread_id),
            )
        return {"threadId": thread_id, "lastReadId": mid}

    return _tx(conn, _run)


def post_message(
    conn,
    *,
    thread_id: int,
    sender_id: int,
    body: str,
    as_admin: bool,
) -> dict:
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")
    if len(text) > MAX_BODY:
        raise HTTPException(status_code=400, detail="Message too long")

    def _run(cur):
        ensure_chat_schema(cur)
        cur.execute(
            "SELECT id, user_id, user_last_read_id, admin_last_read_id FROM chat_threads WHERE id=%s",
            (thread_id,),
        )
        th = cur.fetchone()
        if not th:
            raise HTTPException(status_code=404, detail="Thread not found")
        owner = int(th["user_id"])
        if not as_admin and owner != int(sender_id):
            raise HTTPException(status_code=403, detail="Forbidden")

        cur.execute(
            """
            INSERT INTO chat_messages (thread_id, sender_id, body)
            VALUES (%s, %s, %s)
            """,
            (thread_id, sender_id, text),
        )
        mid = int(cur.lastrowid)
        prev = _preview(text)
        if as_admin:
            cur.execute(
                """
                UPDATE chat_threads
                SET last_message_at=CURRENT_TIMESTAMP, last_preview=%s,
                    admin_last_read_id=%s
                WHERE id=%s
                """,
                (prev, mid, thread_id),
            )
        else:
            cur.execute(
                """
                UPDATE chat_threads
                SET last_message_at=CURRENT_TIMESTAMP, last_preview=%s,
                    user_last_read_id=%s
                WHERE id=%s
                """,
                (prev, mid, thread_id),
            )
        cur.execute(
            """
            SELECT id, thread_id, sender_id, body, created_at
            FROM chat_messages WHERE id=%s
            """,
            (mid,),
        )
        msg = _msg_row(cur.fetchone())
        msg["userId"] = owner
        return msg

    return _tx(conn, _run)


def list_threads_admin(conn, *, page: int = 1, page_size: int = LIST_LIMIT) -> dict:
    size = max(1, min(int(page_size or LIST_LIMIT), 50))
    pg = max(1, int(page or 1))
    offset = (pg - 1) * size

    def _run(cur):
        ensure_chat_schema(cur)
        cur.execute("SELECT COUNT(*) AS c FROM chat_threads")
        total = int((cur.fetchone() or {}).get("c") or 0)
        cur.execute(
            """
            SELECT t.id, t.user_id, t.last_message_at, t.last_preview,
                   t.user_last_read_id, t.admin_last_read_id,
                   u.email, u.phone
            FROM chat_threads t
            JOIN users u ON u.id = t.user_id
            ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
            LIMIT %s OFFSET %s
            """,
            (size, offset),
        )
        rows = cur.fetchall() or []
        items = []
        for r in rows:
            unread = _unread_for_admin(cur, r)
            items.append(
                {
                    "threadId": int(r["id"]),
                    "userId": int(r["user_id"]),
                    "account": _account_label(r.get("email"), r.get("phone")),
                    "lastPreview": r.get("last_preview") or "",
                    "lastMessageAt": str(r.get("last_message_at") or ""),
                    "unread": unread,
                }
            )
        pages = max(1, (total + size - 1) // size) if total else 1
        return {
            "threads": items,
            "total": total,
            "page": pg,
            "pageSize": size,
            "pages": pages,
        }

    return _tx(conn, _run)


def get_thread_for_admin(conn, thread_id: int) -> dict:
    def _run(cur):
        ensure_chat_schema(cur)
        cur.execute(
            """
            SELECT t.id, t.user_id, t.last_message_at, t.last_preview,
                   t.user_last_read_id, t.admin_last_read_id,
                   u.email, u.phone
            FROM chat_threads t
            JOIN users u ON u.id = t.user_id
            WHERE t.id=%s
            """,
            (thread_id,),
        )
        r = cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Thread not found")
        return {
            "threadId": int(r["id"]),
            "userId": int(r["user_id"]),
            "account": _account_label(r.get("email"), r.get("phone")),
            "lastPreview": r.get("last_preview") or "",
            "lastMessageAt": str(r.get("last_message_at") or ""),
            "unread": _unread_for_admin(cur, r),
        }

    return _tx(conn, _run)


def thread_owner_id(conn, thread_id: int) -> int:
    def _run(cur):
        ensure_chat_schema(cur)
        cur.execute("SELECT user_id FROM chat_threads WHERE id=%s", (thread_id,))
        r = cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Thread not found")
        return int(r["user_id"])

    return _tx(conn, _run)
