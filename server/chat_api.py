"""Support chat HTTP + WebSocket API."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Optional, Set

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from chat import (
    admin_unread_total,
    get_or_create_thread,
    get_thread_for_admin,
    list_messages,
    list_threads_admin,
    mark_read,
    post_message,
    thread_owner_id,
    user_unread_total,
)

from feishu_notify import SITE_BASE_URL, mask_contact, notify_feishu_text_async

security = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/chat", tags=["chat"])


def _wire(get_conn, require_db, get_current_user, require_admin, is_admin_fn, decode_token, fetch_user_by_id):
    router.get_conn = get_conn  # type: ignore[attr-defined]
    router.require_db = require_db  # type: ignore[attr-defined]
    router.get_current_user = get_current_user  # type: ignore[attr-defined]
    router.require_admin = require_admin  # type: ignore[attr-defined]
    router.is_admin = is_admin_fn  # type: ignore[attr-defined]
    router.decode_token = decode_token  # type: ignore[attr-defined]
    router.fetch_user_by_id = fetch_user_by_id  # type: ignore[attr-defined]


def _user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    router.require_db()  # type: ignore[attr-defined]
    return router.get_current_user(creds)  # type: ignore[attr-defined]


def _admin(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    user = _user(creds)
    router.require_admin(user)  # type: ignore[attr-defined]
    return user


def _conn():
    return router.get_conn()  # type: ignore[attr-defined]


class SendBody(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    threadId: Optional[int] = None


class Hub:
    def __init__(self) -> None:
        self._user_ws: dict[int, Set[WebSocket]] = {}
        self._admin_ws: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect_user(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._user_ws.setdefault(user_id, set()).add(ws)

    async def connect_admin(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._admin_ws.add(ws)

    async def disconnect(self, ws: WebSocket, user_id: Optional[int], is_admin: bool) -> None:
        async with self._lock:
            if is_admin:
                self._admin_ws.discard(ws)
            if user_id is not None:
                bucket = self._user_ws.get(user_id)
                if bucket:
                    bucket.discard(ws)
                    if not bucket:
                        self._user_ws.pop(user_id, None)

    async def _send(self, ws: WebSocket, payload: dict) -> None:
        try:
            await ws.send_text(json.dumps(payload, ensure_ascii=False))
        except Exception:
            pass

    async def broadcast_message(self, msg: dict, owner_user_id: int) -> None:
        payload = {"type": "message", "message": msg}
        async with self._lock:
            targets = list(self._user_ws.get(owner_user_id, set())) + list(self._admin_ws)
        for ws in targets:
            await self._send(ws, payload)

    async def broadcast_read(self, data: dict, owner_user_id: int) -> None:
        payload = {"type": "read", **data}
        async with self._lock:
            targets = list(self._user_ws.get(owner_user_id, set())) + list(self._admin_ws)
        for ws in targets:
            await self._send(ws, payload)


hub = Hub()


@router.get("/unread")
def chat_unread(user: dict = Depends(_user)):
    conn = _conn()
    try:
        admin = bool(router.is_admin(user))  # type: ignore[attr-defined]
        if admin:
            n = admin_unread_total(conn)
        else:
            n = user_unread_total(conn, int(user["id"]))
        return {"success": True, "unread": n, "isAdmin": admin}
    finally:
        conn.close()


@router.get("/thread")
def my_thread(user: dict = Depends(_user)):
    if router.is_admin(user):  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=400,
            detail="Admins use /chat/admin/threads",
        )
    conn = _conn()
    try:
        th = get_or_create_thread(conn, int(user["id"]))
        unread = user_unread_total(conn, int(user["id"]))
        return {
            "success": True,
            "threadId": int(th["id"]),
            "userId": int(th["user_id"]),
            "unread": unread,
        }
    finally:
        conn.close()


@router.get("/messages")
def my_messages(
    before_id: Optional[int] = None,
    limit: int = 40,
    user: dict = Depends(_user),
):
    if router.is_admin(user):  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Use admin thread messages")
    conn = _conn()
    try:
        th = get_or_create_thread(conn, int(user["id"]))
        tid = int(th["id"])
        msgs = list_messages(conn, thread_id=tid, before_id=before_id, limit=limit)
        return {"success": True, "threadId": tid, "messages": msgs}
    finally:
        conn.close()


@router.post("/messages")
async def send_my_message(body: SendBody, user: dict = Depends(_user)):
    if router.is_admin(user):  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Use admin reply endpoint")
    conn = _conn()
    try:
        th = get_or_create_thread(conn, int(user["id"]))
        msg = post_message(
            conn,
            thread_id=int(th["id"]),
            sender_id=int(user["id"]),
            body=body.body,
            as_admin=False,
        )
    finally:
        conn.close()
    await hub.broadcast_message(msg, int(user["id"]))

    # Feishu notify: ping admin about new incoming user messages (rate-limited).
    try:
        sender_label = mask_contact(
            email=user.get("email"),
            phone=user.get("phone"),
        )
        snippet = (msg.get("body") or "").strip().replace("\n", " ")
        if len(snippet) > 120:
            snippet = snippet[:120] + "…"
        text = (
            f"[私聊] 新消息：{sender_label}\n"
            f"{snippet}\n"
            f"后台：{SITE_BASE_URL}/html/admin/private/chat-inbox.html"
        )
        asyncio.create_task(
            notify_feishu_text_async(text, key=f"chat:{int(user['id'])}")
        )
    except Exception:
        pass
    return {"success": True, "message": msg}


@router.post("/read")
async def mark_my_read(user: dict = Depends(_user)):
    if router.is_admin(user):  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Use admin read endpoint")
    conn = _conn()
    try:
        th = get_or_create_thread(conn, int(user["id"]))
        out = mark_read(
            conn, thread_id=int(th["id"]), reader_id=int(user["id"]), as_admin=False
        )
    finally:
        conn.close()
    await hub.broadcast_read(
        {"threadId": out["threadId"], "lastReadId": out["lastReadId"], "by": "user"},
        int(user["id"]),
    )
    return {"success": True, **out}


@router.get("/admin/threads")
def admin_threads(
    page: int = 1,
    page_size: int = 20,
    admin: dict = Depends(_admin),
):
    _ = admin
    conn = _conn()
    try:
        out = list_threads_admin(conn, page=page, page_size=page_size)
        out["success"] = True
        out["unreadTotal"] = admin_unread_total(conn)
        return out
    finally:
        conn.close()


@router.get("/admin/threads/{thread_id}/messages")
def admin_thread_messages(
    thread_id: int,
    before_id: Optional[int] = None,
    limit: int = 40,
    admin: dict = Depends(_admin),
):
    _ = admin
    conn = _conn()
    try:
        meta = get_thread_for_admin(conn, thread_id)
        msgs = list_messages(
            conn, thread_id=thread_id, before_id=before_id, limit=limit
        )
        return {"success": True, "thread": meta, "messages": msgs}
    finally:
        conn.close()


@router.post("/admin/threads/{thread_id}/messages")
async def admin_reply(
    thread_id: int,
    body: SendBody,
    admin: dict = Depends(_admin),
):
    conn = _conn()
    try:
        owner = thread_owner_id(conn, thread_id)
        msg = post_message(
            conn,
            thread_id=thread_id,
            sender_id=int(admin["id"]),
            body=body.body,
            as_admin=True,
        )
    finally:
        conn.close()
    await hub.broadcast_message(msg, owner)
    return {"success": True, "message": msg}


@router.post("/admin/threads/{thread_id}/read")
async def admin_mark_read(thread_id: int, admin: dict = Depends(_admin)):
    conn = _conn()
    try:
        owner = thread_owner_id(conn, thread_id)
        out = mark_read(
            conn, thread_id=thread_id, reader_id=int(admin["id"]), as_admin=True
        )
    finally:
        conn.close()
    await hub.broadcast_read(
        {"threadId": out["threadId"], "lastReadId": out["lastReadId"], "by": "admin"},
        owner,
    )
    return {"success": True, **out}


def _ws_user_from_token(token: str) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = router.decode_token(token)  # type: ignore[attr-defined]
    except Exception:
        raise HTTPException(status_code=401, detail="Session expired")
    uid = int(payload.get("sub") or 0)
    if uid <= 0:
        raise HTTPException(status_code=401, detail="Session expired")
    user = router.fetch_user_by_id(uid)  # type: ignore[attr-defined]
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.websocket("/ws")
async def chat_ws(websocket: WebSocket, token: str = Query("")):
    try:
        router.require_db()  # type: ignore[attr-defined]
        user = _ws_user_from_token(token)
    except HTTPException:
        await websocket.close(code=4401)
        return
    except Exception:
        await websocket.close(code=1011)
        return

    is_adm = bool(router.is_admin(user))  # type: ignore[attr-defined]
    uid = int(user["id"])
    if is_adm:
        await hub.connect_admin(websocket)
    else:
        await hub.connect_user(uid, websocket)

    try:
        await websocket.send_text(
            json.dumps({"type": "hello", "userId": uid, "isAdmin": is_adm})
        )
        while True:
            raw = await websocket.receive_text()
            # Client may send ping; ignore payload
            if raw in ("ping", '{"type":"ping"}'):
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await hub.disconnect(websocket, uid if not is_adm else None, is_adm)
