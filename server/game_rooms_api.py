"""Tank Battle coop rooms — create/join with password, max 8 players.

Gameplay state sync is host-relayed over the same WebSocket (clients send
input; host broadcasts snapshots). Voice chat is NOT included here.
"""

from __future__ import annotations

import asyncio
import json
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/game/tank-coop", tags=["tank-coop"])

MAX_PLAYERS = 8
ROOM_IDLE_SEC = 3600
CODE_LEN = 6


@dataclass
class Player:
    pid: str
    name: str
    ws: WebSocket
    ready: bool = False
    is_host: bool = False


@dataclass
class Room:
    code: str
    password: str
    players: Dict[str, Player] = field(default_factory=dict)
    started: bool = False
    level: int = 1
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def host(self) -> Optional[Player]:
        for p in self.players.values():
            if p.is_host:
                return p
        return next(iter(self.players.values()), None)

    def roster(self) -> List[dict]:
        out = []
        for i, p in enumerate(self.players.values()):
            out.append({
                "pid": p.pid,
                "name": p.name,
                "ready": p.ready,
                "host": p.is_host,
                "slot": i,
            })
        return out


_rooms: Dict[str, Room] = {}
_lock = asyncio.Lock()


def _new_code() -> str:
    """6-digit numeric room code, e.g. 482017."""
    while True:
        code = f"{secrets.randbelow(1_000_000):06d}"
        if code not in _rooms:
            return code


async def _broadcast(room: Room, payload: dict, exclude: Optional[str] = None) -> None:
    dead: List[str] = []
    raw = json.dumps(payload, ensure_ascii=False)
    for pid, p in list(room.players.items()):
        if exclude and pid == exclude:
            continue
        try:
            await p.ws.send_text(raw)
        except Exception:
            dead.append(pid)
    for pid in dead:
        room.players.pop(pid, None)


async def _send(ws: WebSocket, payload: dict) -> None:
    await ws.send_text(json.dumps(payload, ensure_ascii=False))


def _room_public(room: Room) -> dict:
    return {
        "code": room.code,
        "players": room.roster(),
        "started": room.started,
        "level": room.level,
        "maxPlayers": MAX_PLAYERS,
        "needPassword": bool(room.password),
    }


async def _cleanup_idle() -> None:
    now = time.time()
    dead = [c for c, r in _rooms.items() if now - r.updated_at > ROOM_IDLE_SEC and not r.players]
    for c in dead:
        _rooms.pop(c, None)


@router.get("/health")
async def health():
    return {"ok": True, "rooms": len(_rooms), "maxPlayers": MAX_PLAYERS}


@router.websocket("/ws")
async def tank_coop_ws(websocket: WebSocket):
    await websocket.accept()
    pid = secrets.token_hex(4)
    room: Optional[Room] = None
    me: Optional[Player] = None

    try:
        await _send(websocket, {"type": "hello", "pid": pid, "maxPlayers": MAX_PLAYERS})
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send(websocket, {"type": "error", "message": "bad_json"})
                continue
            mtype = msg.get("type")
            async with _lock:
                await _cleanup_idle()

                if mtype == "ping":
                    await _send(websocket, {"type": "pong"})
                    continue

                if mtype == "create":
                    if room is not None:
                        await _send(websocket, {"type": "error", "message": "already_in_room"})
                        continue
                    name = str(msg.get("name") or "Player")[:16]
                    password = str(msg.get("password") or "")[:32]
                    code = _new_code()
                    room = Room(code=code, password=password)
                    me = Player(pid=pid, name=name, ws=websocket, is_host=True, ready=False)
                    room.players[pid] = me
                    _rooms[code] = room
                    room.updated_at = time.time()
                    await _send(websocket, {
                        "type": "joined",
                        "you": pid,
                        "room": _room_public(room),
                        "hostPid": pid,
                        "lateJoin": False,
                    })
                    continue

                if mtype == "join":
                    if room is not None:
                        await _send(websocket, {"type": "error", "message": "already_in_room"})
                        continue
                    raw_code = str(msg.get("code") or "").strip()
                    digits = "".join(ch for ch in raw_code if ch.isdigit())
                    code = digits.zfill(6)[-6:] if digits else ""
                    password = str(msg.get("password") or "")[:32]
                    name = str(msg.get("name") or "Player")[:16]
                    r = _rooms.get(code)
                    if not r:
                        await _send(websocket, {"type": "error", "message": "room_not_found"})
                        continue
                    if r.password and r.password != password:
                        await _send(websocket, {"type": "error", "message": "bad_password"})
                        continue
                    if len(r.players) >= MAX_PLAYERS:
                        await _send(websocket, {"type": "error", "message": "room_full"})
                        continue
                    # 允许开局后中途加入（房主收到 roster 后刷出新坦克）
                    room = r
                    me = Player(pid=pid, name=name, ws=websocket, is_host=False, ready=False)
                    room.players[pid] = me
                    room.updated_at = time.time()
                    host = room.host()
                    await _send(websocket, {
                        "type": "joined",
                        "you": pid,
                        "room": _room_public(room),
                        "hostPid": host.pid if host else "",
                        "lateJoin": bool(room.started),
                    })
                    await _broadcast(room, {
                        "type": "roster",
                        "room": _room_public(room),
                        "lateJoinPid": pid if room.started else "",
                    }, exclude=pid)
                    continue

                if mtype == "ready":
                    if not room or not me:
                        await _send(websocket, {"type": "error", "message": "not_in_room"})
                        continue
                    me.ready = bool(msg.get("ready", True))
                    room.updated_at = time.time()
                    await _broadcast(room, {"type": "roster", "room": _room_public(room)})
                    continue

                if mtype == "start":
                    if not room or not me or not me.is_host:
                        await _send(websocket, {"type": "error", "message": "host_only"})
                        continue
                    if len(room.players) < 1:
                        await _send(websocket, {"type": "error", "message": "need_players"})
                        continue
                    room.started = True
                    room.level = int(msg.get("level") or 1)
                    room.updated_at = time.time()
                    host = room.host()
                    await _broadcast(room, {
                        "type": "start",
                        "room": _room_public(room),
                        "hostPid": host.pid if host else pid,
                        "seed": int(time.time()) & 0xFFFFFFFF,
                    })
                    continue

                # Relay gameplay messages (input / state / chat text)
                if mtype in ("input", "state", "event", "chat"):
                    if not room or not me:
                        continue
                    room.updated_at = time.time()
                    payload = dict(msg)
                    payload["from"] = pid
                    # Host state → everyone else; client input → host only
                    if mtype == "state":
                        if not me.is_host:
                            continue
                        await _broadcast(room, payload, exclude=pid)
                    elif mtype == "input":
                        host = room.host()
                        if host and host.pid != pid:
                            try:
                                await host.ws.send_text(json.dumps(payload, ensure_ascii=False))
                            except Exception:
                                pass
                        else:
                            await _broadcast(room, payload, exclude=pid)
                    else:
                        await _broadcast(room, payload, exclude=pid)
                    continue

                if mtype == "leave":
                    break

                await _send(websocket, {"type": "error", "message": "unknown_type"})

    except WebSocketDisconnect:
        pass
    finally:
        async with _lock:
            if room and pid in room.players:
                was_host = room.players[pid].is_host
                room.players.pop(pid, None)
                room.updated_at = time.time()
                if room.players:
                    if was_host:
                        nxt = next(iter(room.players.values()))
                        nxt.is_host = True
                    await _broadcast(room, {"type": "roster", "room": _room_public(room)})
                else:
                    _rooms.pop(room.code, None)


def wire():
    """No-op hook for main.py symmetry with other routers."""
    return router
