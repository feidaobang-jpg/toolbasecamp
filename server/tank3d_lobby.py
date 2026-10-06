"""Public/private-password Tank 3D lobby; v1 two-player rooms stay separate."""
import asyncio
import hashlib
import hmac
import json
import math
import secrets
import time
from collections import deque
from dataclasses import dataclass, field

from fastapi import WebSocket, WebSocketDisconnect
from tank3d_rooms import Peer, config

PROTOCOL = 'tank3d-v2'
MAX_PLAYERS = 4
rooms = {}
watchers = {}
failed_passwords = {}


def password_key(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 30000)


@dataclass
class Room:
    code: str
    name: str
    capacity: int
    settings: dict
    salt: bytes
    key: bytes
    peers: dict = field(default_factory=dict)
    started: bool = False
    seq: int = 0

    def public(self):
        return {'code': self.code, 'name': self.name, 'maxPlayers': self.capacity,
                'hasPassword': bool(self.key), 'started': self.started,
                'settings': self.settings,
                'players': [{'slot': p.slot, 'name': p.name, 'ready': p.ready}
                            for p in self.peers.values()]}

    async def broadcast(self, message, guests_only=False):
        await asyncio.gather(*(p.send(message) for p in list(self.peers.values())
                               if not guests_only or p.slot != 0), return_exceptions=True)


def listing(page=1, password='all'):
    selected = [r for r in rooms.values() if password == 'all' or bool(r.key) == (password == 'locked')]
    total = len(selected)
    page = max(1, min(page, max(1, math.ceil(total / 20))))
    return {'type': 'rooms', 'rooms': [r.public() for r in selected[(page - 1) * 20:page * 20]],
            'page': page, 'pageSize': 20, 'total': total, 'password': password, 'maxPlayers': MAX_PLAYERS}


async def publish_directory():
    await asyncio.gather(*(p.send(listing(page, password)) for p, page, password in list(watchers.values())),
                         return_exceptions=True)


async def tank3d_lobby_ws(socket: WebSocket):
    await socket.accept()
    room = None
    peer = Peer(socket, -1, '')
    counts = {}
    window = time.monotonic()
    try:
        await peer.send({'type': 'hello', 'protocol': PROTOCOL, 'maxPlayers': MAX_PLAYERS})
        while True:
            raw = await asyncio.wait_for(socket.receive_text(), 40)
            if len(raw.encode()) > 131072:
                await socket.close(code=1009)
                break
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                await peer.send({'type': 'error', 'message': '消息格式不正确'})
                continue
            if not isinstance(msg, dict) or not isinstance(msg.get('type'), str):
                continue
            kind = msg['type']
            now = time.monotonic()
            if now - window >= 1:
                counts = {}; window = now
            counts[kind] = counts.get(kind, 0) + 1
            if counts[kind] > (90 if kind in ('input', 'state') else 6):
                continue
            if kind == 'ping':
                await peer.send({'type': 'pong', 'at': msg.get('at')})
            elif kind == 'list':
                page = msg.get('page', 1)
                page = page if type(page) is int and page > 0 else 1
                password_filter = msg.get('passwordFilter', 'all')
                if password_filter not in ('all', 'locked', 'open'):
                    password_filter = 'all'
                watchers[id(socket)] = (peer, page, password_filter)
                await peer.send(listing(page, password_filter))
            elif kind in ('create', 'join'):
                if room:
                    await peer.send({'type': 'error', 'message': '请先退出当前房间'})
                    continue
                password = str(msg.get('password') or '')
                if len(password) > 32:
                    await peer.send({'type': 'error', 'message': '房间密码最多32个字符'})
                    continue
                peer.name = str(msg.get('name') or '坦克手')[:12]
                if kind == 'create':
                    if len(rooms) >= 128:
                        await peer.send({'type': 'error', 'message': '房间繁忙，请稍后重试'})
                        continue
                    code = f'{secrets.randbelow(1000000):06d}'
                    while code in rooms:
                        code = f'{secrets.randbelow(1000000):06d}'
                    capacity = msg.get('maxPlayers', MAX_PLAYERS)
                    capacity = capacity if type(capacity) is int and 2 <= capacity <= MAX_PLAYERS else MAX_PLAYERS
                    salt = secrets.token_bytes(16)
                    candidate = Room(code, str(msg.get('roomName') or peer.name + '的房间')[:32],
                                     capacity, config(msg.get('config')), salt,
                                     password_key(password, salt) if password else b'')
                    rooms[code] = candidate
                    peer.slot = 0; peer.ready = True
                else:
                    code = str(msg.get('code') or '').strip()
                    candidate = rooms.get(code)
                    error = ('房间不存在或已结束' if not candidate else
                             '本局已经开始，暂不支持中途加入' if candidate.started else
                             '房间已满' if len(candidate.peers) >= candidate.capacity else None)
                    if error:
                        await peer.send({'type': 'error', 'message': error})
                        continue
                    if candidate.key:
                        attempt_id = (getattr(socket.client, 'host', ''), code)
                        failures = failed_passwords.setdefault(attempt_id, deque())
                        while failures and now - failures[0] > 60:
                            failures.popleft()
                        if len(failures) >= 5:
                            await peer.send({'type': 'error', 'message': '密码尝试过多，请一分钟后重试'})
                            continue
                        if not hmac.compare_digest(candidate.key, password_key(password, candidate.salt)):
                            failures.append(now)
                            if len(failed_passwords) > 2048:
                                failed_passwords.pop(next(iter(failed_passwords)))
                            await peer.send({'type': 'error', 'message': '房间密码不正确'})
                            continue
                        failed_passwords.pop(attempt_id, None)
                    peer.slot = next(s for s in range(candidate.capacity) if s not in candidate.peers)
                    peer.ready = False
                room = candidate
                room.peers[peer.slot] = peer
                watchers[id(socket)] = (peer, 1, 'all')
                await peer.send({'type': 'joined', 'slot': peer.slot, 'room': room.public()})
                await room.broadcast({'type': 'roster', 'room': room.public()})
                await publish_directory()
            elif kind == 'ready' and room and not room.started:
                peer.ready = bool(msg.get('ready'))
                await room.broadcast({'type': 'roster', 'room': room.public()})
                await publish_directory()
            elif kind == 'start' and room:
                if peer.slot != 0:
                    await peer.send({'type': 'error', 'message': '由房主开始游戏'})
                elif len(room.peers) < 2 or not all(p.ready for p in room.peers.values()):
                    await peer.send({'type': 'error', 'message': '至少两人，所有队友准备后开始'})
                elif not room.started:
                    room.started = True
                    start = config(room.settings)
                    start['playerSlots'] = sorted(room.peers)
                    start['playerCount'] = max(room.peers) + 1
                    await room.broadcast({'type': 'start', 'config': start})
                    await publish_directory()
            elif kind == 'input' and room and room.started and peer.slot != 0:
                source = msg.get('input')
                if not isinstance(source, dict):
                    continue
                direction = source.get('dir', -1); angle = source.get('look')
                data = {'dir': direction if type(direction) is int and -1 <= direction <= 3 else -1,
                        'fire': source.get('fire') is True, 'firePressed': source.get('firePressed') is True,
                        'look': max(-1000, min(1000, angle)) if type(angle) in (int, float) and math.isfinite(angle) else None}
                await room.peers[0].send({'type': 'input', 'slot': peer.slot, 'input': data})
            elif kind == 'state' and room and room.started and peer.slot == 0:
                if isinstance(msg.get('state'), dict):
                    room.seq += 1
                    await room.broadcast({'type': 'state', 'seq': room.seq, 'state': msg['state']}, guests_only=True)
            elif kind == 'action' and room and room.started:
                if msg.get('action') in ('pause', 'resume', 'restart', 'retry', 'tally'):
                    await room.peers[0].send({'type': 'action', 'action': msg['action'], 'slot': peer.slot})
            elif kind == 'leave':
                break
    except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError):
        pass
    finally:
        watchers.pop(id(socket), None)
        if room and rooms.get(room.code) is room:
            room.peers.pop(peer.slot, None)
            if peer.slot == 0:
                rooms.pop(room.code, None)
                await room.broadcast({'type': 'ended', 'message': '房主已离线，房间结束；请重新建房'})
                await asyncio.gather(*(p.socket.close(code=1000) for p in room.peers.values()), return_exceptions=True)
            elif room.started:
                await room.broadcast({'type': 'player_left', 'slot': peer.slot, 'message': f'{peer.name}已离线，其余队友可继续'})
            else:
                await room.broadcast({'type': 'roster', 'room': room.public()})
            await publish_directory()
        try:
            await socket.close()
        except (RuntimeError, WebSocketDisconnect):
            pass
