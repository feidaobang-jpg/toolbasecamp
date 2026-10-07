"""Jackal supports real 2–4 person rooms and enforces each seat's input authority."""
import sys
from pathlib import Path
from contextlib import ExitStack

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_rooms_api import hub_router
from test_coop_lobby import until

app = FastAPI()
app.include_router(hub_router)

@pytest.mark.parametrize('capacity', [2, 3, 4])
def test_jackal_capacity_and_all_seat_inputs(capacity):
    url = '/game/coop/ws?game=jackal'
    with TestClient(app) as client, ExitStack() as stack:
        host = stack.enter_context(client.websocket_connect(url))
        assert host.receive_json()['maxPlayers'] == 4
        host.send_json({'type': 'create', 'maxPlayers': capacity})
        room = until(host, 'joined')['room']
        assert room['maxPlayers'] == capacity
        guests = []
        for slot in range(1, capacity):
            guest = stack.enter_context(client.websocket_connect(url))
            guest.receive_json()
            guest.send_json({'type': 'join', 'code': room['code']})
            assert until(guest, 'joined')['slot'] == slot
            guest.send_json({'type': 'ready', 'ready': True})
            guests.append(guest)
        extra = stack.enter_context(client.websocket_connect(url))
        extra.receive_json()
        extra.send_json({'type': 'join', 'code': room['code']})
        assert '已满' in until(extra, 'error')['message']
        while not all(p['ready'] for p in until(host, 'roster')['room']['players']):
            pass
        host.send_json({'type': 'start'})
        start = until(host, 'start')
        assert start['config']['playerSlots'] == list(range(capacity))
        for slot, guest in enumerate(guests, 1):
            assert until(guest, 'start') == start
            guest.send_json({'type': 'input', 'slot': 0, 'input': {'dir': slot, 'fire': True}})
            message = until(host, 'input')
            assert message['slot'] == slot and message['input']['fire']
        host.send_json({'type': 'leave'})
        for guest in guests:
            assert '房主' in until(guest, 'ended')['message']
