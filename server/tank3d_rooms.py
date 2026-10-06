"""Two-player Tank 3D rooms. Host owns simulation; this service relays inputs.

Kept separate from the legacy 2D protocol. No accounts or persistent player data.
Leaving either seat ends the match; host migration is deliberately unsupported.
"""
import asyncio
import json
import math
import secrets
from dataclasses import dataclass, field

from fastapi import WebSocket, WebSocketDisconnect

PROTOCOL = "tank3d-v1"
MAX_MESSAGE = 131072
rooms = {}


@dataclass
class Peer:
    socket: WebSocket
    slot: int
    name: str
    ready: bool = False
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send(self, data):
        async with self.send_lock:
            await asyncio.wait_for(self.socket.send_json(data), 3)


@dataclass
class Room:
    code: str
    peers: dict = field(default_factory=dict)
    started: bool = False
    seq: int = 0

    def public(self):
        return {"code": self.code, "started": self.started,
                "players": [{"slot": p.slot, "name": p.name, "ready": p.ready}
                            for p in self.peers.values()]}

    async def broadcast(self, message):
        await asyncio.gather(*(p.send(message) for p in list(self.peers.values())),
                             return_exceptions=True)


def config(raw):
    raw = raw if isinstance(raw, dict) else {}
    mode = "remix" if raw.get("mode") == "remix" else "classic"
    try:
        stage = max(1, min(100 if mode == "remix" else 35, int(raw.get("stage", 1))))
    except (ValueError, TypeError, OverflowError):
        stage = 1
    return {"mode": mode, "stage": stage, "cycle": 1, "score": 0,
            "lives": "inf" if raw.get("lives") == "inf" else "classic",
            "armor": "std" if raw.get("armor") == "std" else "classic",
            "seed": secrets.randbelow(1000000), "demo": False, "coop": True}


async def tank3d_ws(socket: WebSocket):
    await socket.accept()
    room = peer = None
    window = asyncio.get_running_loop().time()
    counts = {}
    try:
        await socket.send_json({"type": "hello", "protocol": PROTOCOL})
        while True:
            raw = await asyncio.wait_for(socket.receive_text(), 40)
            if len(raw.encode("utf-8")) > MAX_MESSAGE:
                await socket.close(code=1009)
                break
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                await socket.send_json({"type": "error", "message": "消息格式不正确"})
                continue
            if not isinstance(msg, dict):
                continue
            kind = msg.get("type")
            if not isinstance(kind, str):
                continue
            now = asyncio.get_running_loop().time()
            if now - window >= 1:
                counts = {}
                window = now
            counts[kind] = counts.get(kind, 0) + 1
            if counts[kind] > (90 if kind in ("input", "state") else 12):
                continue
            if kind == "ping":
                await socket.send_json({"type": "pong", "at": msg.get("at")})
            elif kind in ("create", "join"):
                if room:
                    await peer.send({"type": "error", "message": "请先退出当前房间"})
                    continue
                name = str(msg.get("name") or "玩家")[:12]
                if kind == "create":
                    if len(rooms) >= 256:
                        await socket.send_json({"type": "error", "message": "房间繁忙，请稍后重试"})
                        continue
                    code = f"{secrets.randbelow(1000000):06d}"
                    while code in rooms:
                        code = f"{secrets.randbelow(1000000):06d}"
                    candidate = Room(code)
                    rooms[code] = candidate
                    slot = 0
                else:
                    code = str(msg.get("code") or "").strip()
                    candidate = rooms.get(code) if len(code) == 6 and code.isascii() and code.isdigit() else None
                    error = ("房间不存在或已结束" if not candidate else
                             "房间已满（最多两人）" if len(candidate.peers) >= 2 else
                             "本局已经开始，请等房主重新建房" if candidate.started else None)
                    if error:
                        await socket.send_json({"type": "error", "message": error})
                        continue
                    slot = 1
                room = candidate
                peer = Peer(socket, slot, name, ready=slot == 0)
                room.peers[slot] = peer
                await peer.send({"type": "joined", "slot": slot, "room": room.public()})
                await room.broadcast({"type": "roster", "room": room.public()})
            elif kind == "ready" and room and not room.started:
                peer.ready = bool(msg.get("ready"))
                await room.broadcast({"type": "roster", "room": room.public()})
            elif kind == "start" and room:
                if peer.slot != 0:
                    await peer.send({"type": "error", "message": "由房主开始游戏"})
                elif len(room.peers) != 2 or not all(p.ready for p in room.peers.values()):
                    await peer.send({"type": "error", "message": "等待好友加入并准备"})
                elif not room.started:
                    room.started = True
                    await room.broadcast({"type": "start", "config": config(msg.get("config"))})
            elif kind == "input" and room and room.started and peer.slot == 1:
                source = msg.get("input")
                if not isinstance(source, dict):
                    continue
                direction = source.get("dir", -1)
                angle = source.get("look")
                data = {"dir": direction if type(direction) is int and -1 <= direction <= 3 else -1,
                        "fire": source.get("fire") is True,
                        "firePressed": source.get("firePressed") is True, "look": None}
                if type(angle) in (int, float) and math.isfinite(angle):
                    data["look"] = max(-1000, min(1000, angle))
                await room.peers[0].send({"type": "input", "input": data})
            elif kind == "state" and room and room.started and peer.slot == 0:
                state = msg.get("state")
                if isinstance(state, dict) and 1 in room.peers:
                    room.seq += 1
                    await room.peers[1].send({"type": "state", "seq": room.seq, "state": state})
            elif kind == "action" and room and room.started:
                if msg.get("action") in ("pause", "resume", "restart", "retry", "tally"):
                    await room.peers[0].send({"type": "action", "action": msg["action"], "slot": peer.slot})
            elif kind == "leave":
                break
    except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError):
        pass
    finally:
        if room and rooms.get(room.code) is room:
            rooms.pop(room.code, None)
            room.peers.pop(peer.slot, None)
            await room.broadcast({"type": "ended", "message": "房主已离线，房间结束" if peer.slot == 0 else "好友已离线，房间结束；可重新邀请"})
            await asyncio.gather(*(p.socket.close(code=1000) for p in room.peers.values()), return_exceptions=True)
        try:
            await socket.close()
        except (RuntimeError, WebSocketDisconnect):
            pass
