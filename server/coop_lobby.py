"""Shared cooperative rooms; Tank v2 remains wire-compatible with older clients."""
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
GAMES = {
    'tank': {'title': '坦克大战', 'protocol': 'tank3d-v2', 'maxPlayers': 4, 'path': 'tank-3d'},
    'jackal': {'title': '赤色要塞', 'protocol': 'jackal3d-v1', 'maxPlayers': 4, 'path': 'jackal-stage1-3d'},
    'cadillacs': {'title': '恐龙快打', 'protocol': 'cadillacs3d-v1', 'maxPlayers': 4, 'path': 'cadillacs-stage1-3d'},
    'starship': {'title': '虫潮围城', 'protocol': 'starship-v1', 'maxPlayers': 4, 'path': 'starship-defense'},
}
def bounded(value, low, high, default):
    return max(low, min(high, value)) if type(value) is int else default

def game_config(game, raw):
    if game == 'tank':
        return config(raw)
    raw = raw if isinstance(raw, dict) else {}
    settings = {'lives': 'classic' if raw.get('lives') == 'classic' else 'inf',
            'armor': 'classic' if raw.get('armor') == 'classic' else 'std',
            'dur': raw.get('dur') if raw.get('dur') in ('std', 'easy', 'classic') else 'std',
            'gun': 'follow' if raw.get('gun') == 'follow' else 'up',
            'stage': bounded(raw.get('stage'), 1, 2, 1),
            'area': bounded(raw.get('area'), 0, 7, 0),
            'hero': bounded(raw.get('hero'), 0, 3, 0),
            'seed': secrets.randbelow(1000000), 'demo': False, 'coop': True}
    if game == 'starship':
        # 虫潮对战：1 对 1 到 4 对 4，房间人数上限 = 两队座位数，空座位由房主那台电脑补电脑；客户端按 mode 开局。
        settings['mode'] = 'versus' if raw.get('mode') == 'versus' else 'coop'
        if settings['mode'] == 'versus':
            settings['size'] = bounded(raw.get('size'), 1, 4, 1)
            settings['diff'] = raw.get('diff') if raw.get('diff') in ('easy', 'normal', 'hard') else 'normal'
    return settings

def clean_team(value):
    return value if value in ('blue', 'red') else 'auto'

def clean_input(source):
    data = {}
    for key in ('x', 'y', 'z', 'look', 'aim', 'yaw', 'pitch'):
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-1, min(1, n)) if key in ('x', 'y', 'z') else max(-1000, min(1000, n))
    length = math.hypot(data.get('x', 0), data.get('z', 0))
    if length > 1:
        data['x'] /= length; data['z'] /= length
    for key in ('fire', 'firePressed', 'bomb', 'bombPressed', 'atk', 'jump', 'mega', 'run', 'motion', 'lane', 'autoFire', 'autoAim', 'fp', 'rise', 'lower'):
        data[key] = source.get(key) is True
    direction = source.get('dir')
    data['dir'] = direction if type(direction) is int and -1 <= direction <= 7 else -1
    data['edges'] = [k for k in source.get('edges', []) if k in ('atk','jump','mega','dash','fireTap','bombTap','interact','grenade','heal')][:12] if isinstance(source.get('edges'), list) else []
    return data

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
    game: str = 'tank'
    peers: dict = field(default_factory=dict)
    started: bool = False
    seq: int = 0
    features: bool = False
    kicked: set = field(default_factory=set)

    def public(self):
        return {'game': self.game, 'gameTitle': GAMES[self.game]['title'], 'protocol': GAMES[self.game]['protocol'], 'code': self.code, 'name': self.name, 'maxPlayers': self.capacity,
                'hasPassword': bool(self.key), 'started': self.started,
                'settings': self.settings, 'canJoin': self.features,
                'players': [{'slot': p.slot, 'name': p.name, 'ready': p.ready, 'hero': getattr(p, 'hero', 0), 'ai': getattr(p, 'ai', False), 'team': getattr(p, 'team', 'auto')}
                            for p in self.peers.values()]}

    async def broadcast(self, message, guests_only=False):
        await asyncio.gather(*(p.send(message) for p in list(self.peers.values())
                               if not guests_only or p.slot != 0), return_exceptions=True)


def listing(page=1, password='all', game='tank'):
    selected = [r for r in rooms.values() if (game == 'all' or r.game == game) and (password == 'all' or bool(r.key) == (password == 'locked'))]
    total = len(selected)
    page = max(1, min(page, max(1, math.ceil(total / 20))))
    return {'type': 'rooms', 'rooms': [r.public() for r in selected[(page - 1) * 20:page * 20]],
            'page': page, 'pageSize': 20, 'total': total, 'password': password, 'maxPlayers': GAMES.get(game, {}).get('maxPlayers', MAX_PLAYERS), 'game': game,
            'counts': {k: sum(r.game == k for r in rooms.values()) for k in GAMES}}


async def publish_directory():
    await asyncio.gather(*(p.send(listing(page, password, game)) for p, page, password, game in list(watchers.values())),
                         return_exceptions=True)


async def coop_lobby_ws(socket: WebSocket, game='tank'):
    await socket.accept()
    if game not in GAMES:
        await socket.close(code=1008)
        return
    spec = GAMES[game]
    room = None
    peer = Peer(socket, -1, '')
    counts = {}
    window = time.monotonic()
    try:
        await peer.send({'type': 'hello', 'protocol': spec['protocol'], 'game': game, 'maxPlayers': spec['maxPlayers']})
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
            if counts[kind] > (90 if kind in ('input', 'state') else 16 if kind == 'control' else 6):
                continue
            if kind == 'ping':
                await peer.send({'type': 'pong', 'at': msg.get('at')})
            elif kind == 'list':
                page = msg.get('page', 1)
                page = page if type(page) is int and page > 0 else 1
                password_filter = msg.get('passwordFilter', 'all')
                if password_filter not in ('all', 'locked', 'open'):
                    password_filter = 'all'
                watchers[id(socket)] = (peer, page, password_filter, game)
                await peer.send(listing(page, password_filter, game))
            elif kind in ('create', 'join'):
                if room:
                    await peer.send({'type': 'error', 'message': '请先退出当前房间'})
                    continue
                password = str(msg.get('password') or '')
                if len(password) > 32:
                    await peer.send({'type': 'error', 'message': '房间密码最多32个字符'})
                    continue
                peer.name = str(msg.get('name') or '坦克手')[:12]
                peer.identity = str(msg.get('identity') or secrets.token_hex(16))[:64]
                if kind == 'create':
                    if len(rooms) >= 128:
                        await peer.send({'type': 'error', 'message': '房间繁忙，请稍后重试'})
                        continue
                    code = f'{secrets.randbelow(1000000):06d}'
                    while code in rooms:
                        code = f'{secrets.randbelow(1000000):06d}'
                    capacity = msg.get('maxPlayers', spec['maxPlayers'])
                    capacity = capacity if type(capacity) is int and 2 <= capacity <= spec['maxPlayers'] else spec['maxPlayers']
                    salt = secrets.token_bytes(16)
                    settings = game_config(game, msg.get('config'))
                    if settings.get('mode') == 'versus':
                        capacity = 2 * settings.get('size', 1)
                    candidate = Room(code, str(msg.get('roomName') or peer.name + '的房间')[:32],
                                     capacity, settings, salt,
                                     password_key(password, salt) if password else b'', game=game)
                    rooms[code] = candidate
                    candidate.features = msg.get('liveJoin') is True
                    peer.hero = candidate.settings.get('hero', 0)
                    peer.team = clean_team((msg.get('config') or {}).get('team') if isinstance(msg.get('config'), dict) else None)
                    peer.slot = 0; peer.ready = True
                else:
                    code = str(msg.get('code') or '').strip()
                    candidate = rooms.get(code)
                    error = ('房间不存在或已结束' if not candidate or candidate.game != game else
                             '房主版本较旧，请在开局前加入或让房主更新' if candidate.started and not candidate.features else
                             '你已被房主移出本房间' if peer.identity in candidate.kicked else
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
                    peer.ready = candidate.started
                    peer.hero = bounded((msg.get('config') or {}).get('hero') if isinstance(msg.get('config'), dict) else 0, 0, 3, 0)
                    peer.team = clean_team((msg.get('config') or {}).get('team') if isinstance(msg.get('config'), dict) else None)
                room = candidate
                room.peers[peer.slot] = peer
                watchers[id(socket)] = (peer, 1, 'all', game)
                await peer.send({'type': 'joined', 'slot': peer.slot, 'room': room.public()})
                await room.broadcast({'type': 'roster', 'room': room.public()})
                if room.started:
                    start = dict(room.settings)
                    start['playerChoices'] = {str(s): getattr(p, 'hero', 0) for s, p in room.peers.items()}
                    start['playerTeams'] = {str(s): getattr(p, 'team', 'auto') for s, p in room.peers.items()}
                    start['playerSlots'] = sorted(room.peers)
                    start['playerCount'] = max(room.peers) + 1
                    await peer.send({'type': 'start', 'config': start, 'lateJoin': True})
                    await room.broadcast({'type': 'player_joined', 'slot': peer.slot, 'hero': peer.hero, 'team': peer.team, 'name': peer.name, 'message': f'{peer.name}中途加入'})
                await publish_directory()
            elif kind == 'ready' and room and not room.started:
                peer.ready = msg.get('ready') is True
                peer.hero = bounded(msg.get('hero'), 0, 3, 0)
                if 'team' in msg:
                    peer.team = clean_team(msg.get('team'))
                await room.broadcast({'type': 'roster', 'room': room.public()})
                await publish_directory()
            elif kind == 'pick' and room and not room.started and (peer.slot == 0 or not peer.ready):
                # 开局前改选队伍/兵种（房主始终就绪，所以单独一条消息；客人准备后锁定）
                peer.team = clean_team(msg.get('team'))
                peer.hero = bounded(msg.get('hero'), 0, 3, getattr(peer, 'hero', 0))
                await room.broadcast({'type': 'roster', 'room': room.public()})
                await publish_directory()
            elif kind == 'start' and room:
                if peer.slot != 0:
                    await peer.send({'type': 'error', 'message': '由房主开始游戏'})
                elif len(room.peers) < 2 or not all(p.ready for p in room.peers.values()):
                    await peer.send({'type': 'error', 'message': '至少两人，所有队友准备后开始'})
                elif not room.started:
                    room.started = True
                    start = dict(room.settings)
                    start['playerChoices'] = {str(s): getattr(p, 'hero', start.get('hero', 0)) for s, p in room.peers.items()}
                    start['playerTeams'] = {str(s): getattr(p, 'team', 'auto') for s, p in room.peers.items()}
                    start['playerSlots'] = sorted(room.peers)
                    start['playerCount'] = max(room.peers) + 1
                    await room.broadcast({'type': 'start', 'config': start})
                    await publish_directory()
            elif kind == 'input' and room and room.started and peer.slot != 0:
                source = msg.get('input')
                if not isinstance(source, dict):
                    continue
                if game == 'tank':
                    direction = source.get('dir', -1); angle = source.get('look')
                    data = {'dir': direction if type(direction) is int and -1 <= direction <= 3 else -1,
                            'fire': source.get('fire') is True, 'firePressed': source.get('firePressed') is True,
                            'look': max(-1000, min(1000, angle)) if type(angle) in (int, float) and math.isfinite(angle) else None}
                else:
                    data = clean_input(source)
                data['activity'] = source.get('activity') is True
                await room.peers[0].send({'type': 'input', 'slot': peer.slot, 'input': data})
            elif kind == 'control' and room and room.started and peer.slot == 0:
                target = room.peers.get(msg.get('slot')) if type(msg.get('slot')) is int else None
                if target and getattr(target, 'ai', False) != (msg.get('ai') is True):
                    target.ai = msg.get('ai') is True
                    await room.broadcast({'type': 'control', 'slot': target.slot, 'ai': target.ai,
                                          'message': f'{target.name}：30秒未操作，电脑队友接管' if target.ai else f'{target.name}已回来，恢复真人操作'})
            elif kind == 'kick' and room and peer.slot == 0:
                target = room.peers.get(msg.get('slot')) if type(msg.get('slot')) is int else None
                if target and target.slot != 0:
                    room.kicked.add(target.identity)
                    if len(room.kicked) > 64:
                        room.kicked.pop()
                    room.peers.pop(target.slot)
                    try:
                        await target.send({'type': 'ended', 'message': '你已被房主移出房间'})
                    except (WebSocketDisconnect, RuntimeError, asyncio.TimeoutError):
                        pass
                    await room.broadcast({'type': 'player_left', 'slot': target.slot, 'message': f'{target.name}已被房主移出房间'})
                    await room.broadcast({'type': 'roster', 'room': room.public()})
                    try:
                        await target.socket.close(code=1000)
                    except (WebSocketDisconnect, RuntimeError, asyncio.TimeoutError):
                        pass
                    await publish_directory()
            elif kind == 'state' and room and room.started and peer.slot == 0:
                if isinstance(msg.get('state'), dict):
                    room.seq += 1
                    await room.broadcast({'type': 'state', 'seq': room.seq, 'state': msg['state']}, guests_only=True)
            elif kind == 'action' and room and room.started:
                if msg.get('action') in ('pause', 'resume', 'restart', 'retry', 'tally', 'next'):
                    if msg['action'] in ('restart', 'retry', 'next') and peer.slot != 0:
                        continue
                    await room.peers[0].send({'type': 'action', 'action': msg['action'], 'slot': peer.slot})
            elif kind == 'command' and room and room.started:
                command = msg.get('command')
                if isinstance(command, dict) and len(json.dumps(command)) <= 4096:
                    await room.peers[0].send({'type': 'command', 'slot': peer.slot, 'command': command})
            elif kind == 'leave':
                break
    except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError):
        pass
    finally:
        watchers.pop(id(socket), None)
        if room and rooms.get(room.code) is room and room.peers.get(peer.slot) is peer:
            room.peers.pop(peer.slot, None)
            if peer.slot == 0:
                rooms.pop(room.code, None)
                await room.broadcast({'type': 'ended', 'message': '房主已离线，房间结束；请重新建房'})
                await asyncio.gather(*(p.socket.close(code=1000) for p in room.peers.values()), return_exceptions=True)
            elif room.started:
                await room.broadcast({'type': 'player_left', 'slot': peer.slot, 'message': f'{peer.name}已离线，其余队友可继续'})
                await room.broadcast({'type': 'roster', 'room': room.public()})
            else:
                await room.broadcast({'type': 'roster', 'room': room.public()})
            await publish_directory()
        try:
            await socket.close()
        except (RuntimeError, WebSocketDisconnect):
            pass
