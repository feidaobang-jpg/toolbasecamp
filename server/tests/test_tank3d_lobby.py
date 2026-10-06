"""v2 directory/password/four-seat protocol regression tests."""
import sys
from contextlib import ExitStack
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_rooms_api import router
from tank3d_lobby import Room, listing, rooms

app = FastAPI()
app.include_router(router)
URL = '/game/tank-coop/ws?game=tank3d-v2'


def until(ws, kind):
    for _ in range(50):
        message = ws.receive_json()
        if message['type'] == kind:
            return message
    raise AssertionError(kind)


def test_directory_is_paginated_and_password_filtered():
    try:
        for n in range(25):
            code = f'test-{n}'
            rooms[code] = Room(code, code, 4, {}, b'', b'hash' if n % 2 else b'')
        first, second = listing(), listing(2)
        assert first['total'] == 25 and len(first['rooms']) == 20
        assert len(second['rooms']) == 5 and second['page'] == 2
        assert listing(99)['page'] == 2
        locked = listing(1, 'locked')
        assert locked['total'] == 12 and all(r['hasPassword'] for r in locked['rooms'])
        assert all(not r['hasPassword'] for r in listing(1, 'open')['rooms'])
        assert all('key' not in r and 'salt' not in r for r in first['rooms'])
    finally:
        for code in list(rooms):
            if code.startswith('test-'):
                rooms.pop(code)


def test_four_seats_password_readiness_relay_and_guest_departure():
    with TestClient(app) as client, ExitStack() as stack:
        observer = stack.enter_context(client.websocket_connect(URL)); observer.receive_json()
        observer.send_json({'type': 'list', 'passwordFilter': 'locked'})
        assert until(observer, 'rooms')['total'] == 0
        host = stack.enter_context(client.websocket_connect(URL)); host.receive_json()
        host.send_json({'type': 'create', 'name': '房主', 'roomName': '测试', 'maxPlayers': 4, 'password': 'test-secret'})
        room = until(host, 'joined')['room']
        public = until(observer, 'rooms')
        assert public['rooms'][0]['hasPassword']
        assert 'test-secret' not in str(public)
        guests = []
        for slot in range(1, 4):
            guest = stack.enter_context(client.websocket_connect(URL)); guest.receive_json()
            guest.send_json({'type': 'join', 'code': room['code'], 'password': 'wrong'})
            assert '密码不正确' in until(guest, 'error')['message']
            guest.send_json({'type': 'join', 'code': room['code'], 'password': 'test-secret'})
            assert until(guest, 'joined')['slot'] == slot
            guests.append(guest)
        host.send_json({'type': 'start'})
        assert '准备' in until(host, 'error')['message']
        for guest in guests:
            guest.send_json({'type': 'ready', 'ready': True})
            until(guest, 'roster')
        # Flush readiness through host roster before sending start.
        while not all(p['ready'] for p in until(host, 'roster')['room']['players']):
            pass
        host.send_json({'type': 'start'})
        started = until(host, 'start')
        assert started['config']['playerCount'] == 4
        assert started['config']['playerSlots'] == [0, 1, 2, 3]
        for guest in guests:
            assert until(guest, 'start') == started
        guests[2].send_json({'type': 'input', 'slot': 0, 'input': {'dir': 3, 'firePressed': True}})
        assert until(host, 'input')['slot'] == 3
        host.send_json({'type': 'state', 'state': {'frame': 50}})
        for guest in guests:
            assert until(guest, 'state')['state'] == {'frame': 50}
        guests[1].send_json({'type': 'leave'})
        assert until(host, 'player_left')['slot'] == 2
        guests[2].send_json({'type': 'ping', 'at': 777})
        assert until(guests[2], 'pong')['at'] == 777
        host.send_json({'type': 'leave'})
        assert '房主' in until(guests[0], 'ended')['message']


def test_unlocked_room_and_legacy_protocol_isolation():
    with TestClient(app) as client, client.websocket_connect(URL) as host:
        host.receive_json(); host.send_json({'type': 'create', 'maxPlayers': 2})
        room = until(host, 'joined')['room']
        assert not room['hasPassword']
        with client.websocket_connect('/game/tank-coop/ws?game=tank3d-v1') as legacy:
            legacy.receive_json(); legacy.send_json({'type': 'join', 'code': room['code']})
            assert '不存在' in until(legacy, 'error')['message']
        with client.websocket_connect(URL) as guest:
            guest.receive_json(); guest.send_json({'type': 'join', 'code': room['code']})
            assert until(guest, 'joined')['slot'] == 1
            with client.websocket_connect(URL) as extra:
                extra.receive_json(); extra.send_json({'type': 'join', 'code': room['code']})
                assert '已满' in until(extra, 'error')['message']
