"""Exercise auth, recovery and simultaneous writers against a disposable SQL database.

SQLite is used locally; production InnoDB row locking is separately verified at deploy.
"""
import sys
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.middleware.cors import CORSMiddleware
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import game_saves as saves

SAVE={'testMode':False,'cls':'gunner','campaignId':'test-campaign','loop':1,'chapter':2,'level':3,'gold':1234,'score':200,'weapons':['lmg'],'curWeapon':'lmg','items':{'medkit':2},'time':1000,'buildings':[]}

@pytest.fixture
def client(tmp_path):
    db=tmp_path/'saves.sqlite'
    conn=sqlite3.connect(db);conn.execute('CREATE TABLE game_save_slots (user_id INTEGER,game_id TEXT,revision TEXT,document TEXT,PRIMARY KEY(user_id,game_id))');conn.close()
    class Cursor:
        def __init__(self,conn): self.cur=conn.cursor()
        def __enter__(self): return self
        def __exit__(self,*args): self.cur.close()
        def execute(self,sql,args): return self.cur.execute(sql.replace('%s','?').replace('INSERT IGNORE','INSERT OR IGNORE').replace(' FOR UPDATE',''),args)
        def fetchone(self):
            row=self.cur.fetchone();return dict(row) if row else None
    class Connection:
        def __init__(self): self.conn=sqlite3.connect(db,timeout=10,isolation_level=None);self.conn.row_factory=sqlite3.Row
        def cursor(self): return Cursor(self.conn)
        def begin(self): self.conn.execute('BEGIN IMMEDIATE')
        def commit(self): self.conn.commit()
        def rollback(self): self.conn.rollback()
        def close(self): self.conn.close()
    def user(creds):
        if not creds or creds.credentials not in ('user-a','user-b'): raise HTTPException(401,'Authentication required')
        return {'id':1 if creds.credentials=='user-a' else 2}
    saves.wire(Connection,lambda:None,user,lambda body:{'token':'user-a'})
    app=FastAPI();app.add_middleware(CORSMiddleware,allow_origins=['https://www.zhengxiaohui.cn']);app.add_middleware(saves.GameSaveCors);app.include_router(saves.router)
    with TestClient(app) as c: yield c

def headers(user='a'): return {'Authorization':'Bearer user-'+user}
def put(client,save=SAVE,revision=None,user='a'): return client.put('/game/saves/starship-defense',json={'save':save,'expected_revision':revision},headers=headers(user))

def test_auth_isolation_and_history(client):
    assert client.get('/game/saves/starship-defense').status_code==401
    assert client.put('/game/saves/starship-defense',json={'save':SAVE,'expected_revision':None}).status_code==401
    a=put(client).json()['current'];assert a['save']['gold']==1234
    assert client.get('/game/saves/starship-defense',headers=headers('b')).json()['current'] is None
    assert put(client,revision=a['revision'],user='b').status_code==409
    assert put(client,{**SAVE,'gold':999},user='b').status_code==200
    for level in range(4,9):
        r=put(client,{**SAVE,'level':level},a['revision']);assert r.status_code==200;a=r.json()['current']
    result=client.get('/game/saves/starship-defense',headers=headers()).json()
    assert result['current']['save']['level']==8
    assert [r['save']['level'] for r in result['backups']]==[7,6,5]
    assert put(client,revision='stale').status_code==409
    assert client.get('/game/saves/starship-defense',headers=headers()).json()['current']==a

def test_concurrent_writers_do_not_overwrite_unseen_save(client):
    first=put(client).json()['current']
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda level:put(client,{**SAVE,'level':level},first['revision']),[4,5]))
    assert sorted(r.status_code for r in results)==[200,409]
    state=client.get('/game/saves/starship-defense',headers=headers()).json()
    assert state['current']['save']['level'] in (4,5)
    assert state['backups'][0]['save']==SAVE

@pytest.mark.parametrize('patch',[{'testMode':True},{'loop':100001},{'gold':-1},{'curWeapon':[]},{'weapons':['constructor']},{'campaignId':'x'*81},{'buildings':[{'k':{},'x':0,'z':0,'r':0,'hp':1}]}])
def test_invalid_save_never_replaces_valid_checkpoint(client,patch):
    first=put(client).json()['current']
    assert put(client,{**SAVE,**patch},first['revision']).status_code==400
    assert client.get('/game/saves/starship-defense',headers=headers()).json()['current']==first

def test_size_limit_and_scoped_cors(client):
    assert client.put('/game/saves/starship-defense',content=b'x'*65537,headers=headers()).status_code==413
    preflight=client.options('/game/saves/starship-defense',headers={'Origin':'https://h5.taptap.cn','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'})
    assert preflight.status_code==200 and preflight.headers['access-control-allow-origin']=='*'
    assert 'access-control-allow-credentials' not in preflight.headers
    assert client.options('/auth/login',headers={'Origin':'https://h5.taptap.cn','Access-Control-Request-Method':'POST'}).status_code==400
    assert client.get('/game/saves/starship-defense',headers=headers()).headers['cache-control']=='private, no-store'

def test_legacy_and_large_second_third_loop_saves():
    for loop,count in [(1,64),(2,80),(3,96)]:
        d={**SAVE,'loop':loop,'buildings':[{'k':'wall','x':0,'z':0,'r':0,'hp':500}]*count}
        assert saves.validate_save(d)
        assert not saves.validate_save({**d,'buildings':d['buildings']+[d['buildings'][0]]})
