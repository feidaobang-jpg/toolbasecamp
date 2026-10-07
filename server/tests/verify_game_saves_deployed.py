"""Production MySQL/API smoke test using one temporary QA account, then cleanup.

Run on the API host with its existing environment. No credentials are printed.
"""
import json
import secrets
import sys
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main

BASE = 'https://www.zhengxiaohui.cn/api/game/saves'
email = 'qa-cloudsave-' + uuid.uuid4().hex + '@example.invalid'
password = secrets.token_urlsafe(24)
uid = None
token = None

def request(method, path, data=None, authenticated=True):
    headers = {'Content-Type': 'application/json', 'Origin': 'https://h5.taptap.cn'}
    if authenticated and token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, data=json.dumps(data).encode() if data is not None else None,
                                 method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.load(r), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, json.load(e), {k.lower(): v for k, v in e.headers.items()}

try:
    conn = main.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('INSERT INTO users (email,password_hash) VALUES (%s,%s)', (email, main.hash_password(password)))
            uid = cur.lastrowid
    finally:
        conn.close()
    status, login, _ = request('POST', '/login', {'account': email, 'password': password}, False)
    assert status == 200 and login.get('token'), 'QA login failed: ' + str(status)
    token = login['token']
    assert request('GET', '/starship-defense', authenticated=False)[0] == 401
    status, first, _ = request('GET', '/starship-defense')
    assert status == 200 and first['current'] is None and first['account_id'] == uid
    save = {'testMode': False, 'cls': 'gunner', 'campaignId': 'deployed-qa', 'loop': 3,
            'chapter': 2, 'level': 3, 'gold': 1234, 'score': 200, 'weapons': ['lmg'],
            'curWeapon': 'lmg', 'time': int(time.time() * 1000),
            'buildings': [{'k': 'wall', 'x': 0, 'z': 0, 'r': 0, 'hp': 500}] * 96}
    status, first, headers = request('PUT', '/starship-defense', {'save': save, 'expected_revision': None})
    assert status == 200, 'First save failed: ' + str(status)
    revision = first['current']['revision']
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda level: request('PUT', '/starship-defense',
                      {'save': {**save, 'level': level}, 'expected_revision': revision}), [4, 5]))
    assert sorted(r[0] for r in results) == [200, 409], 'Concurrent revision checks failed'
    state = request('GET', '/starship-defense')[1]
    assert state['backups'][0]['save'] == save
    for level in range(6, 9):
        status, state, _ = request('PUT', '/starship-defense',
                    {'save': {**save, 'level': level}, 'expected_revision': state['current']['revision']})
        assert status == 200
    assert [r['save']['level'] for r in state['backups']][:2] == [7, 6]
    assert 'no-store' in headers.get('cache-control', '')
    assert headers.get('access-control-allow-origin') == '*'
    print(json.dumps({'passed': True, 'checks': ['public login', 'bearer auth', 'empty new account',
        '96-building legacy limit', 'MySQL concurrent revision protection', 'three cloud backups',
        'H5 scoped CORS', 'private no-store'], 'fixture': 'temporary QA account only'}, ensure_ascii=False))
finally:
    if uid is not None:
        conn = main.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute('DELETE FROM users WHERE id=%s AND email=%s', (uid, email))
                assert cur.rowcount == 1
                cur.execute('SELECT COUNT(*) AS count FROM game_save_slots WHERE user_id=%s', (uid,))
                assert cur.fetchone()['count'] == 0
            print('QA fixture cleanup verified')
        finally:
            conn.close()
