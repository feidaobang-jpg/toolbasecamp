"""Shared lobby isolation, input authority, directory paging and host-only lifecycle."""
import sys
from pathlib import Path
from contextlib import ExitStack

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_rooms_api import router, hub_router
from coop_lobby import rooms, clean_input

app = FastAPI()
app.include_router(router)
app.include_router(hub_router)

def until(ws, kind):
    for _ in range(100):
        msg = ws.receive_json()
        if msg['type'] == kind:
            return msg
    raise AssertionError(kind)

def test_movement_is_bounded_and_non_finite_inputs_are_dropped():
    value = clean_input({'x': 1000, 'z': 1000, 'look': float('nan'), 'dir': 999,
                         'fire': 'yes', 'edges': ['delete', 'atk'] * 100})
    assert abs(value['x'] ** 2 + value['z'] ** 2 - 1) < 1e-8
    assert 'look' not in value and value['dir'] == -1 and not value['fire']
    assert len(value['edges']) <= 12 and set(value['edges']) == {'atk'}

@pytest.mark.parametrize('game,protocol,capacity', [
    ('tank', 'tank3d-v2', 4), ('jackal', 'jackal3d-v1', 4),
    ('cadillacs', 'cadillacs3d-v1', 4), ('starship', 'starship-v1', 4),
])
def test_shared_rooms_relay_authority_and_game_isolation(game, protocol, capacity):
    url = '/game/coop/ws?game=' + game
    with TestClient(app) as client, ExitStack() as stack:
        host = stack.enter_context(client.websocket_connect(url))
        assert host.receive_json()['protocol'] == protocol
        host.send_json({'type': 'create', 'name': 'host', 'maxPlayers': capacity,
                        'config': {'hero': 2, 'demo': True}, 'password': 'secret'})
        room = until(host, 'joined')['room']
        assert room['game'] == game and room['maxPlayers'] == capacity
        assert not room['settings']['demo']
        listing = client.get('/game/coop/rooms?game=' + game).json()
        assert any(r['code'] == room['code'] for r in listing['rooms'])
        assert 'secret' not in str(listing) and 'key' not in str(listing)
        other = 'jackal' if game != 'jackal' else 'cadillacs'
        wrong = stack.enter_context(client.websocket_connect('/game/coop/ws?game=' + other))
        wrong.receive_json()
        wrong.send_json({'type': 'join', 'code': room['code'], 'password': 'secret'})
        assert '不存在' in until(wrong, 'error')['message']
        guest = stack.enter_context(client.websocket_connect(url)); guest.receive_json()
        guest.send_json({'type': 'join', 'code': room['code'], 'password': 'secret'})
        assert until(guest, 'joined')['slot'] == 1
        guest.send_json({'type': 'ready', 'ready': True, 'hero': 3})
        while not all(p['ready'] for p in until(host, 'roster')['room']['players']):
            pass
        host.send_json({'type': 'start'})
        started = until(host, 'start')['config']
        assert started['playerChoices']['1'] == 3
        assert started['playerSlots'] == [0, 1]
        until(guest, 'start')
        guest.send_json({'type': 'input', 'slot': 0, 'input': {'dir': 2, 'x': 1, 'edges': ['atk']}})
        message = until(host, 'input')
        assert message['slot'] == 1
        # Unauthorized state and restart never become authoritative.
        guest.send_json({'type': 'state', 'state': {'fake': True}})
        guest.send_json({'type': 'action', 'action': 'restart'})
        guest.send_json({'type': 'action', 'action': 'pause'})
        assert until(host, 'action')['action'] == 'pause'
        host.send_json({'type': 'state', 'state': {'frame': 123}})
        assert until(guest, 'state')['state'] == {'frame': 123}
        guest.send_json({'type': 'command', 'command': {'kind': 'build', 'id': 'wall'}})
        assert until(host, 'command')['slot'] == 1
        host.send_json({'type': 'leave'})
        assert '房主' in until(guest, 'ended')['message']

def test_old_tank_and_hub_share_the_same_room_directory():
    with TestClient(app) as client, client.websocket_connect('/game/tank-coop/ws?game=tank3d-v2') as host:
        host.receive_json(); host.send_json({'type': 'create'})
        room = until(host, 'joined')['room']
        with client.websocket_connect('/game/coop/ws?game=tank') as guest:
            guest.receive_json(); guest.send_json({'type': 'join', 'code': room['code']})
            assert until(guest, 'joined')['room']['code'] == room['code']

def test_unknown_directory_game_is_rejected():
    with TestClient(app) as client:
        assert client.get('/game/coop/rooms?game=unknown').status_code == 400

def test_starship_versus_rooms_are_one_on_one():
    url = '/game/coop/ws?game=starship'
    with TestClient(app) as client, ExitStack() as stack:
        host = stack.enter_context(client.websocket_connect(url)); host.receive_json()
        host.send_json({'type': 'create', 'name': 'host', 'maxPlayers': 4, 'config': {'hero': 1, 'mode': 'versus'}})
        room = until(host, 'joined')['room']
        assert room['maxPlayers'] == 2 and room['settings']['mode'] == 'versus'
        guest = stack.enter_context(client.websocket_connect(url)); guest.receive_json()
        guest.send_json({'type': 'join', 'code': room['code']})
        assert until(guest, 'joined')['slot'] == 1
        third = stack.enter_context(client.websocket_connect(url)); third.receive_json()
        third.send_json({'type': 'join', 'code': room['code']})
        assert '满' in until(third, 'error')['message']
        guest.send_json({'type': 'ready', 'ready': True, 'hero': 0})
        while not all(p['ready'] for p in until(host, 'roster')['room']['players']):
            pass
        host.send_json({'type': 'start'})
        assert until(host, 'start')['config']['mode'] == 'versus'
        assert until(guest, 'start')['config']['mode'] == 'versus'
        guest.send_json({'type': 'command', 'command': {'kind': 'vsSend', 'id': 'swarm'}})
        assert until(host, 'command')['command'] == {'kind': 'vsSend', 'id': 'swarm'}

def test_starship_versus_team_rooms_seat_two_per_side_and_carry_teams():
    url = '/game/coop/ws?game=starship'
    with TestClient(app) as client, ExitStack() as stack:
        host = stack.enter_context(client.websocket_connect(url)); host.receive_json()
        host.send_json({'type': 'create', 'name': 'host', 'maxPlayers': 2, 'liveJoin': True,
                        'config': {'hero': 0, 'mode': 'versus', 'size': 4, 'team': 'red', 'diff': 'hard'}})
        room = until(host, 'joined')['room']
        assert room['maxPlayers'] == 8 and room['settings']['size'] == 4 and room['settings']['diff'] == 'hard'
        assert room['players'][0]['team'] == 'red'
        guest = stack.enter_context(client.websocket_connect(url)); guest.receive_json()
        guest.send_json({'type': 'join', 'code': room['code'], 'config': {'hero': 2, 'team': 'nonsense'}})
        assert until(guest, 'joined')['room']['players'][1]['team'] == 'auto'
        # 准备前改选队伍；准备时也能带上队伍
        guest.send_json({'type': 'pick', 'team': 'blue', 'hero': 1})
        while [p['team'] for p in until(host, 'roster')['room']['players']][1:] != ['blue']:
            pass
        guest.send_json({'type': 'ready', 'ready': True, 'hero': 1, 'team': 'red'})
        while not all(p['ready'] for p in until(host, 'roster')['room']['players']):
            pass
        # 准备后客人不能再改；房主随时可改
        guest.send_json({'type': 'pick', 'team': 'blue', 'hero': 1})
        host.send_json({'type': 'pick', 'team': 'blue', 'hero': 0})
        players = until(host, 'roster')['room']['players']
        assert [p['team'] for p in players] == ['blue', 'red']
        host.send_json({'type': 'start'})
        config = until(host, 'start')['config']
        assert config['size'] == 4 and config['playerTeams'] == {'0': 'blue', '1': 'red'} and config['playerChoices']['1'] == 1
        late = stack.enter_context(client.websocket_connect(url)); late.receive_json()
        late.send_json({'type': 'join', 'code': room['code'], 'config': {'hero': 0, 'team': 'blue'}})
        assert until(late, 'start')['config']['playerTeams']['2'] == 'blue'
        joined = until(host, 'player_joined')
        assert joined['slot'] == 2 and joined['team'] == 'blue'

def test_starship_versus_size_is_bounded():
    with TestClient(app) as client, client.websocket_connect('/game/coop/ws?game=starship') as host:
        host.receive_json(); host.send_json({'type': 'create', 'config': {'mode': 'versus', 'size': 9, 'diff': 'insane'}})
        room = until(host, 'joined')['room']
        assert room['maxPlayers'] == 8 and room['settings']['size'] == 4 and room['settings']['diff'] == 'normal'

def test_starship_coop_rooms_keep_coop_mode():
    with TestClient(app) as client, client.websocket_connect('/game/coop/ws?game=starship') as host:
        host.receive_json(); host.send_json({'type': 'create', 'maxPlayers': 3, 'config': {'mode': 'nonsense'}})
        room = until(host, 'joined')['room']
        assert room['maxPlayers'] == 3 and room['settings']['mode'] == 'coop'
