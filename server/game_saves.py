"""Authenticated game checkpoints with revision checks and three recovery snapshots."""
from __future__ import annotations

import json
import math
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

router = APIRouter(prefix='/game/saves', tags=['game-saves'])
security = HTTPBearer(auto_error=False)
MAX_BYTES = 65536
WEAPONS = {'lmg','shotgun','launcher','flamer','laser','plasma','rpg','missilePod','smg','rifle','minigun','sniper','missile','railgun'}
BUILDINGS = {'antiAir','wall','mgTurret','cannonTurret','teslaTurret','sniperTurret','bunker','cryoTurret','mortarTurret'}
VEHICLES = {'jeep','tank','mech','heli'}
_login_attempts = defaultdict(deque)


class GameSaveCors:
    """Only these bearer-authenticated endpoints are callable from hosted H5 games.

    No cookies or credentialed CORS; the rest of the site's origin policy is unchanged.
    Must be installed outside the site's global CORSMiddleware to handle preflight.
    """
    def __init__(self, app):
        self.app = app
        self.games = CORSMiddleware(app, allow_origins=['*'], allow_credentials=False,
                                    allow_methods=['GET','PUT','POST'],
                                    allow_headers=['Authorization','Content-Type'], max_age=600)

    async def __call__(self, scope, receive, send):
        app = self.games if scope.get('path','').startswith('/game/saves/') else self.app
        await app(scope, receive, send)


def wire(get_conn, require_db, get_current_user, login):
    router.get_conn, router.require_db = get_conn, require_db
    router.get_current_user, router.login = get_current_user, login


def ensure_game_save_tables(cur):
    cur.execute('''CREATE TABLE IF NOT EXISTS game_save_slots (
        user_id BIGINT NOT NULL, game_id VARCHAR(64) NOT NULL,
        revision VARCHAR(64) NULL, document MEDIUMTEXT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, game_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')


def _user(creds=Depends(security)):
    return router.get_current_user(creds)


def validate_save(d):
    def num(v, lo=0, hi=1e12):
        return type(v) in (int,float) and math.isfinite(v) and lo <= v <= hi
    def integer(v, lo, hi):
        return type(v) is int and lo <= v <= hi
    def optional_list(key, limit, check):
        return key not in d or isinstance(d[key],list) and len(d[key]) <= limit and all(check(x) for x in d[key])
    def safe(v, depth=0):
        if depth > 12: return False
        if isinstance(v,dict): return len(v) <= 120 and all(k not in ('__proto__','constructor','prototype') and len(k) <= 120 and safe(x,depth+1) for k,x in v.items())
        if isinstance(v,list): return len(v) <= 120 and all(safe(x,depth+1) for x in v)
        if isinstance(v,str): return len(v) <= 500
        if type(v) in (int,float): return math.isfinite(v)
        return v is None or type(v) is bool
    if not isinstance(d,dict) or not safe(d) or d.get('testMode') is not False: return False
    if d.get('cls') not in ('gunner','rifle','medic'): return False
    if d.get('difficulty','normal') not in ('normal','hard','casual'): return False
    if not all(integer(d.get(k),1,n) for k,n in [('loop',100000),('chapter',10),('level',10)]): return False
    if not all(num(d.get(k),0,1e15 if k=='time' else 1e12) for k in ('gold','score','time')): return False
    if 'campaignId' in d and (not isinstance(d['campaignId'],str) or not 1 <= len(d['campaignId']) <= 80): return False
    if not isinstance(d.get('weapons'),list) or not 1 <= len(d['weapons']) <= 30 or not all(isinstance(x,str) and x in WEAPONS for x in d['weapons']): return False
    if not isinstance(d.get('curWeapon'),str) or d['curWeapon'] not in WEAPONS: return False
    if 'items' in d and (not isinstance(d['items'],dict) or not num(d['items'].get('medkit'),0,100000)): return False
    if 'weaponLv' in d and (not isinstance(d['weaponLv'],dict) or not all(k in WEAPONS and integer(v,0,10) for k,v in d['weaponLv'].items())): return False
    if 'squadCount' in d and not integer(d['squadCount'],0,4): return False
    limit = 64 if d['loop']==1 else 80 if d['loop']==2 else 96
    if not optional_list('buildings',limit,lambda b:isinstance(b,dict) and isinstance(b.get('k'),str) and b['k'] in BUILDINGS and all(num(b.get(k),lo,hi) for k,lo,hi in [('x',-120,120),('z',-80,340),('r',-1e6,1e6),('hp',0,1e8)])): return False
    if not optional_list('vehiclesOwned',4,lambda x:isinstance(x,str) and x in VEHICLES): return False
    if not optional_list('squadGear',4,lambda g:isinstance(g,dict) and integer(g.get('weapon'),0,5) and integer(g.get('armor'),0,5)): return False
    if not optional_list('pendingDrops',32,lambda x:isinstance(x,dict) and x.get('type') in ('item','vehicle','squad') and isinstance(x.get('id'),str)): return False
    return True


async def _body(request):
    raw = bytearray()
    async for part in request.stream():
        raw.extend(part)
        if len(raw) > MAX_BYTES: raise HTTPException(413,'存档数据过大，未覆盖已有进度')
    try: data=json.loads(raw)
    except (ValueError,UnicodeError): raise HTTPException(400,'数据格式不正确')
    if not isinstance(data,dict): raise HTTPException(400,'数据格式不正确')
    return data


def _connection():
    router.require_db()
    return router.get_conn()


def read_slot(user_id):
    conn=_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT document FROM game_save_slots WHERE user_id=%s AND game_id=%s',(user_id,'starship-defense'))
            row=cur.fetchone()
        return json.loads(row['document']) if row and row['document'] else {'current':None,'backups':[]}
    finally: conn.close()


def write_slot(user_id, save, expected):
    conn=_connection()
    try:
        conn.begin()
        with conn.cursor() as cur:
            # Insert then lock the same row even for two concurrent first saves.
            cur.execute('INSERT IGNORE INTO game_save_slots (user_id,game_id) VALUES (%s,%s)',(user_id,'starship-defense'))
            cur.execute('SELECT revision,document FROM game_save_slots WHERE user_id=%s AND game_id=%s FOR UPDATE',(user_id,'starship-defense'))
            row=cur.fetchone()
            if row['revision'] != expected: raise HTTPException(409,'云端进度已变化，请重新查看后再选择；已有云档未被覆盖')
            prior=json.loads(row['document']) if row['document'] else {'current':None,'backups':[]}
            record={'schema':2,'game':'starship-defense','revision':str(uuid.uuid4()),'saved_at':datetime.now(timezone.utc).isoformat(),'save':save}
            backups=([prior['current']] if prior['current'] else [])+prior.get('backups',[])
            result={'current':record,'backups':backups[:3]}
            cur.execute('UPDATE game_save_slots SET revision=%s,document=%s WHERE user_id=%s AND game_id=%s',
                        (record['revision'],json.dumps(result,ensure_ascii=False,allow_nan=False),user_id,'starship-defense'))
        conn.commit()
        return result
    except Exception:
        conn.rollback();raise
    finally: conn.close()


def response(data):
    return JSONResponse(data,headers={'Cache-Control':'private, no-store'})


@router.get('/starship-defense')
def get_save(user=Depends(_user)):
    return response({**read_slot(user['id']),'account_id':user['id']})


@router.put('/starship-defense')
async def put_save(request: Request, user=Depends(_user)):
    data=await _body(request)
    revision=data.get('expected_revision')
    if 'expected_revision' not in data or revision is not None and (not isinstance(revision,str) or len(revision)>64): raise HTTPException(400,'请先读取当前云档版本')
    if not validate_save(data.get('save')): raise HTTPException(400,'存档内容异常，未覆盖已有进度')
    return response(await run_in_threadpool(write_slot,user['id'],data['save'],revision))


@router.post('/login')
async def save_login(request: Request):
    now=time.monotonic();ip=request.client.host if request.client else 'unknown'
    if len(_login_attempts)>2000:
        for key in list(_login_attempts):
            if not _login_attempts[key] or now-_login_attempts[key][-1]>60: del _login_attempts[key]
    attempts=_login_attempts[ip]
    while attempts and now-attempts[0]>60: attempts.popleft()
    if len(attempts)>=10: raise HTTPException(429,'登录尝试过于频繁，请稍后重试')
    attempts.append(now);data=await _body(request)
    if not isinstance(data.get('account'),str) or not isinstance(data.get('password'),str) or len(data['account'])>255 or not 1 <= len(data['password'])<=200: raise HTTPException(400,'请输入网站账号与密码')
    return response(await run_in_threadpool(router.login,{'account':data['account'],'password':data['password']}))
