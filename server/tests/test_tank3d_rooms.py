"""Connection-local rooms only; run with pytest server/tests/test_tank3d_rooms.py."""
import sys
import asyncio
from pathlib import Path

from fastapi import FastAPI
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_rooms_api import router
from tank3d_rooms import rooms, tank3d_ws

app = FastAPI()
app.include_router(router)
URL = '/game/tank-coop/ws?game=tank3d-v1'


def test_already_disconnected_socket_closes_without_error():
    # Real ASGI adapters may raise on close after a client has disconnected.
    class DisconnectedSocket:
        async def accept(self):
            pass

        async def send_json(self, data):
            pass

        async def receive_text(self):
            raise WebSocketDisconnect(code=1006)

        async def close(self):
            raise WebSocketDisconnect(code=1006)

    asyncio.run(tank3d_ws(DisconnectedSocket()))


def until(ws, kind):
    for _ in range(10):
        msg = ws.receive_json()
        if msg['type'] == kind:
            return msg
    raise AssertionError(kind)


def test_two_seats_relay_and_leave():
    with TestClient(app) as client, client.websocket_connect(URL) as host:
        assert host.receive_json()['protocol'] == 'tank3d-v1'
        host.send_json({'type': 'create', 'name': '主机'})
        room = until(host, 'joined')['room']
        until(host, 'roster')
        host.send_json({'type': 'start'})
        assert '等待' in until(host, 'error')['message']
        with client.websocket_connect(URL) as guest:
            guest.receive_json()
            guest.send_json({'type': 'join', 'code': room['code'], 'name': '客机'})
            assert until(guest, 'joined')['slot'] == 1
            until(guest, 'roster'); until(host, 'roster')
            with client.websocket_connect(URL) as third:
                third.receive_json()
                third.send_json({'type': 'join', 'code': room['code']})
                assert '已满' in until(third, 'error')['message']
            guest.send_json({'type': 'start'})
            assert '房主' in until(guest, 'error')['message']
            guest.send_json({'type': 'ready', 'ready': True})
            until(guest, 'roster'); until(host, 'roster')
            host.send_json({'type': 'start', 'config': {'mode': 'classic', 'stage': 999, 'demo': True}})
            started = until(host, 'start')
            assert started['config']['stage'] == 35 and not started['config']['demo']
            assert until(guest, 'start') == started
            guest.send_json({'type': 'input', 'input': {'dir': 3, 'look': .5, 'firePressed': True}})
            data = until(host, 'input')['input']
            assert data['dir'] == 3 and data['firePressed'] and data['look'] == .5
            # A guest cannot spoof authoritative state or host slot.
            guest.send_json({'type': 'state', 'state': {'spoof': True}})
            host.send_json({'type': 'state', 'state': {'frame': 45}})
            assert until(guest, 'state')['state'] == {'frame': 45}
            guest.send_json({'type': 'action', 'action': 'pause'})
            assert until(host, 'action')['slot'] == 1
            guest.send_json({'type': 'leave'})
            assert '好友' in until(host, 'ended')['message']
        assert room['code'] not in rooms


def test_invalid_messages_and_legacy_isolation():
    with TestClient(app) as client, client.websocket_connect(URL) as ws:
        ws.receive_json()
        ws.send_text('bad-json')
        assert until(ws, 'error')
        ws.send_json({'type': []})
        ws.send_json({'type': 'join', 'code': 'invalid'})
        assert '不存在' in until(ws, 'error')['message']
        ws.send_json({'type': 'ping', 'at': 123})
        assert until(ws, 'pong')['at'] == 123
        with client.websocket_connect('/game/tank-coop/ws') as old:
            assert 'pid' in old.receive_json()
