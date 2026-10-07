"""Running rooms admit players without restarting and restrict moderation/control to host."""
from contextlib import ExitStack
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from game_rooms_api import hub_router
from test_coop_lobby import until

app=FastAPI()
app.include_router(hub_router)

@pytest.mark.parametrize('game', ['tank','jackal','cadillacs','starship'])
def test_live_join_leave_host_control_and_kick(game):
    url='/game/coop/ws?game='+game
    with TestClient(app) as client, ExitStack() as stack:
        def connect(identity):
            ws=stack.enter_context(client.websocket_connect(url));ws.receive_json()
            return ws
        host=connect('host')
        host.send_json({'type':'create','maxPlayers':4,'liveJoin':True,'identity':'host'})
        code=until(host,'joined')['room']['code']
        a=connect('first')
        a.send_json({'type':'join','code':code,'identity':'first'})
        until(a,'joined');a.send_json({'type':'ready','ready':True})
        while not all(p['ready'] for p in until(host,'roster')['room']['players']):pass
        host.send_json({'type':'start'});until(host,'start');until(a,'start')
        b=connect('late')
        b.send_json({'type':'join','code':code,'identity':'late','config':{'hero':2}})
        assert until(b,'joined')['slot']==2
        assert until(b,'start')['lateJoin']
        assert until(host,'player_joined')['hero']==2
        b.send_json({'type':'kick','slot':1})
        b.send_json({'type':'control','slot':1,'ai':True})
        b.send_json({'type':'ping','at':555})
        assert until(b,'pong')['at']==555
        host.send_json({'type':'control','slot':2,'ai':True})
        assert until(b,'control')['ai']
        host.send_json({'type':'control','slot':2,'ai':False})
        assert not until(b,'control')['ai']
        host.send_json({'type':'kick','slot':2})
        assert '移出' in until(b,'ended')['message']
        assert until(host,'player_left')['slot']==2
        banned=connect('late')
        banned.send_json({'type':'join','code':code,'identity':'late'})
        assert '移出' in until(banned,'error')['message']
        replacement=connect('replacement')
        replacement.send_json({'type':'join','code':code,'identity':'replacement'})
        assert until(replacement,'joined')['slot']==2
        assert until(replacement,'start')['config']['playerSlots']==[0,1,2]
        a.send_json({'type':'leave'})
        assert until(host,'player_left')['slot']==1
        host.send_json({'type':'leave'})
        assert '房主' in until(replacement,'ended')['message']


def test_kicking_an_already_closed_target_does_not_end_host(monkeypatch):
    from tank3d_rooms import Peer
    original=Peer.send
    async def send(self,data):
        if data.get('type')=='ended' and '移出' in data.get('message',''):
            raise RuntimeError('target closed before acknowledgement')
        return await original(self,data)
    monkeypatch.setattr(Peer,'send',send)
    with TestClient(app) as client, ExitStack() as stack:
        host=stack.enter_context(client.websocket_connect('/game/coop/ws?game=jackal'));host.receive_json()
        host.send_json({'type':'create','liveJoin':True})
        code=until(host,'joined')['room']['code']
        guest=stack.enter_context(client.websocket_connect('/game/coop/ws?game=jackal'));guest.receive_json()
        guest.send_json({'type':'join','code':code});until(guest,'joined')
        until(host,'roster');until(host,'roster')
        host.send_json({'type':'kick','slot':1})
        assert until(host,'player_left')['slot']==1
        assert len(until(host,'roster')['room']['players'])==1
        host.send_json({'type':'ping','at':123})
        assert until(host,'pong')['at']==123
