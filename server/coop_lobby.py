"""Shared cooperative rooms; Tank v2 remains wire-compatible with older clients."""
import asyncio
import hashlib
import hmac
import json
import math
import re
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
    # 枪火战地联机合作：最多 12 名真人同在蓝方打红方电脑，空位由房主那台补电脑兵；房主算电脑兵与伤害，客人自己算走位
    'zhandi': {'title': '枪火战地', 'protocol': 'zhandi-v1', 'maxPlayers': 12, 'path': 'qianghuo-zhandi'},
    # 枪火爆破：5 对 5 回合制（歼灭玩法 6 对 6），真人可分警察（blue）/ 匪徒（red）两边对打，空位由房主那台补电脑；做法同战地（房主算、客人报）
    # 房间上限按玩法：爆破 10 人、歼灭 12 人（建房时按 rule 收窄）
    'baopo': {'title': '枪火爆破', 'protocol': 'baopo-v1', 'maxPlayers': 12, 'path': 'qianghuo-baopo'},
    # 枪火生化：开局全员人类、随机出母体僵尸的感染玩法，最多 12 人；房主算电脑兵、感染和回合，客人报走位（做法同爆破）
    # team 字段表示「想当」：red 想当僵尸（开局优先当母体）、blue 想当人类
    'shenghua': {'title': '枪火生化', 'protocol': 'shenghua-v1', 'maxPlayers': 12, 'path': 'qianghuo-shenghua'},
    # 植物大战僵尸 3D：最多 4 人守同一片院子，各附身一株植物；房主算全部，客人用 input 报走位、command 报种植 / 附身。
    # 关卡编号放在通用设置的 stage / area 里（li = (stage-1)*8 + area），不需要额外字段
    'zhiwu': {'title': '植物大战僵尸3D', 'protocol': 'zhiwu-v1', 'maxPlayers': 4, 'path': 'zhiwu-dazhan-jiangshi'},
    # 废狱捉迷藏：最多 4 人一起躲，大壮由房主那台的电脑来找；客人位置朝向用 input 的 look / aim / yaw 报（不走会被归一化的 x / z），
    # 躲进出来、扔石子、爬通风管用 command 报
    'feiyu': {'title': '废狱捉迷藏', 'protocol': 'feiyu-v1', 'maxPlayers': 4, 'path': 'feiyu-zhuomicang'},
    # 枪火搜打撤：最多 8 人进同一张图搜刮撤离；房主算电脑兵、伤害和战利品箱，客人报走位开火（字段同战地再加血量 / 枪 / 撤离），
    # 拿箱子、丢东西、送队友走 command；背包和仓库各存各的本机
    'soudache': {'title': '枪火搜打撤', 'protocol': 'soudache-v1', 'maxPlayers': 8, 'path': 'qianghuo-soudache'},
    # 方块大陆：最多 4 人，用房主的存档世界；房主算怪物、时间、流水和作物，客人自己走位、挖放方块先本机生效再用 command 报，
    # 客人每帧报位置朝向、收到的改动编号 ack 和事件编号 ea（见 clean_fangkuai）；config 只带世界模式
    'fangkuai': {'title': '方块大陆', 'protocol': 'fangkuai-v1', 'maxPlayers': 4, 'path': 'fangkuai-dalu'},
    # 孢子房车「联机守车」：最多 4 人守同一辆房车打波次尸潮；房主算怪、房车、机炮、波次和全队废料，
    # 客人报位置朝向血量和开枪计数（见 clean_baozi），命中 / 手雷 / 购买 / 救人走 command 批量报给房主
    'baozi': {'title': '孢子房车', 'protocol': 'baozi-v1', 'maxPlayers': 4, 'path': 'baozi-fangche'},
    # 国道狂飙「联机竞速」：最多 6 人同跑一条国道；房主算车流和电脑车手，客人报自己的路程 s、横向 d、速度、车型、离地高度和是否冲线（见 clean_guodao）
    'guodao': {'title': '国道狂飙', 'protocol': 'guodao-v1', 'maxPlayers': 6, 'path': 'guodao-kuangbiao'},
    # 霓虹湾：最多 4 人同城开放世界；房主算全城的车、行人、警察、通缉和任务，客人每帧报自己的位置和自己开的车（见 clean_nihong），
    # 开枪 / 上车 / 捡东西攒成一批走 command（每批最多 40 条，每秒 5 批以内）
    'nihong': {'title': '霓虹湾', 'protocol': 'nihong-v1', 'maxPlayers': 8, 'path': 'nihong-wan'},
    # 现代战争：最多 4 人一起打同一个任务（空战 / 坦克战 / 海战 / 联合作战）；房主算电脑、伤害、导弹和任务进度，
    # 客人每帧报自己开的载具（位置、姿态、炮塔、车型 vk、出击次数 life、事件编号 ea，见 clean_xiandai），开火 / 导弹 / 干扰弹攒成一批走 command
    'xiandai': {'title': '现代战争', 'protocol': 'xiandai-v1', 'maxPlayers': 4, 'path': 'xiandai-zhanzheng'},
}
BAOPO_MAPS = ('dust2', 'dust', 'aztec', 'inferno', 'train')
# 生化多一张专用防守图（围城哨站），不进爆破
SHENGHUA_MAPS = BAOPO_MAPS + ('fort',)
ZHANDI_MAPS = ('desert', 'snow', 'island', 'ruins', 'canyon', 'farm', 'railDepot', 'containerPort', 'forestCamp', 'radarStation', 'dryRiver', 'sihangWarehouse', 'beachAssault', 'archipelago', 'megaTower', 'airfield', 'canalHarbor', 'damSite', 'random')
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
            'stage': bounded(raw.get('stage'), 1, 9, 1),   # 各游戏关卡数不同（赤色要塞已有第三关），客户端按自己的关卡数再夹一次
            'area': bounded(raw.get('area'), 0, 7, 0),
            'hero': bounded(raw.get('hero'), 0, 3, 0),
            'seed': secrets.randbelow(1000000), 'demo': False, 'coop': True}
    if game == 'zhandi':
        return {'map': raw.get('map') if raw.get('map') in ZHANDI_MAPS else 'desert',
                'mapSeed': bounded(raw.get('mapSeed'), 0, 99999, 0),
                'diff': raw.get('diff') if raw.get('diff') in ('easy', 'normal', 'hard') else 'normal',
                'hero': bounded(raw.get('hero'), 0, 3, 0), 'demo': False, 'coop': True}
    if game == 'soudache':
        return {'map': raw.get('map') if raw.get('map') in ZHANDI_MAPS else 'desert',
                'mapSeed': bounded(raw.get('mapSeed'), 0, 99999, 0),
                'diff': raw.get('diff') if raw.get('diff') in ('easy', 'normal', 'hard') else 'normal',
                'limit': raw.get('limit') if raw.get('limit') in (15, 20, 30, 45) else 20,
                'hero': 0, 'demo': False, 'coop': True}
    if game == 'baopo':
        return {'map': raw.get('map') if raw.get('map') in BAOPO_MAPS else 'dust2',
                'rule': 'elim' if raw.get('rule') == 'elim' else 'bomb',
                'diff': raw.get('diff') if raw.get('diff') in ('easy', 'normal', 'hard') else 'normal',
                'match': 'std' if raw.get('match') == 'std' else 'short',
                'respawn': 'instant' if raw.get('respawn') == 'instant' else 'round',
                'hero': 0, 'demo': False, 'coop': True}
    if game == 'shenghua':
        return {'map': raw.get('map') if raw.get('map') in SHENGHUA_MAPS else 'dust2',
                'diff': raw.get('diff') if raw.get('diff') in ('easy', 'normal', 'hard') else 'normal',
                'match': 'std' if raw.get('match') == 'std' else 'short',
                'hero': 0, 'demo': False, 'coop': True}
    if game == 'xiandai':
        return {'mis': raw.get('mis') if raw.get('mis') in XIANDAI_MISSIONS else 'j1',
                'diff': raw.get('diff') if raw.get('diff') in ('easy', 'normal', 'hard') else 'normal', 'demo': False, 'coop': True}
    if game == 'guodao':
        return {'route': raw.get('route') if raw.get('route') in ('g1', 'xueling', 'gebi') else 'g1', 'demo': False, 'coop': True}
    if game == 'baozi':
        return {'diff': 'normal', 'demo': False, 'coop': True}
    if game == 'nihong':
        return {'demo': False, 'coop': True}
    if game == 'fangkuai':
        return {'mode': raw.get('mode') if raw.get('mode') in ('creative', 'survival', 'farm') else 'survival', 'demo': False, 'coop': True}
    if game == 'starship':
        # 虫潮对战：1 对 1 到 4 对 4，房间人数上限 = 两队座位数，空座位由房主那台电脑补电脑；客户端按 mode 开局。
        # mode 'zerg'：虫族联机对抗，房主当母虫、客人当人类指挥官（客人走位放 input 的 look / aim，刷兵建塔走 command）
        settings['mode'] = raw.get('mode') if raw.get('mode') in ('versus', 'zerg') else 'coop'
        if settings['mode'] == 'zerg':
            settings['diff'] = raw.get('diff') if raw.get('diff') in ('easy', 'normal', 'hard', 'nightmare') else 'normal'
        if settings['mode'] == 'versus':
            settings['rules'] = 'bank' if raw.get('rules') == 'bank' else 'conquest'
            settings['size'] = bounded(raw.get('size'), 1, 4, 1)
            settings['diff'] = raw.get('diff') if raw.get('diff') in ('easy', 'normal', 'hard') else 'normal'
    return settings

def clean_team(value):
    return value if value in ('blue', 'red') else 'auto'

# 自由文字聊天（2026-11-07 植僵试点过审后推广）：全部房间类型都开放，客户端发送前过 Toy checkInputSafety
CHAT_GAMES = tuple(GAMES)
CHAT_MAX = 30          # 单条最多 30 个字
CHAT_GAP = 2.5         # 两条之间至少隔 2.5 秒
# 兜底拦截：链接、联系方式、导流词。主判定在客户端的 Toy checkInputSafety，这里只防绕过客户端直接发的。
CHAT_BLOCK = re.compile(
    r'(https?|www\.|\.com|\.cn|\.net|\.top|\.xyz|qq|vx|v信|微信|威信|薇信|wx|加群|进群|加我|私聊|扣扣|企鹅|二维码|代练|充值|返利|兼职|刷单)'
    r'|\d[\d\s\-_.]{4,}\d',
    re.IGNORECASE)

def clean_chat(value):
    if not isinstance(value, str):
        return ''
    text = ''.join(ch for ch in value if ch.isprintable() and ch not in '<>')
    text = re.sub(r'\s+', ' ', text).strip()[:CHAT_MAX]
    if not text or CHAT_BLOCK.search(text):
        return ''
    return text

def clean_input(source):
    data = {}
    for key in ('x', 'y', 'z', 'look', 'aim', 'yaw', 'pitch'):
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-1, min(1, n)) if key in ('x', 'y', 'z') else max(-1000, min(1000, n))
    length = math.hypot(data.get('x', 0), data.get('z', 0))
    if length > 1:
        data['x'] /= length; data['z'] /= length
    for key in ('fire', 'firePressed', 'bomb', 'bombPressed', 'atk', 'jump', 'mega', 'run', 'motion', 'lane', 'autoFire', 'autoAim', 'fp', 'rise', 'lower', 'crouch', 'prone'):
        data[key] = source.get(key) is True
    seq = source.get('seq')
    if type(seq) is int and 0 < seq < 2 ** 31:
        data['seq'] = seq   # 赤色要塞加入者本机预测：房主回传处理到的输入序号
    direction = source.get('dir')
    data['dir'] = direction if type(direction) is int and -1 <= direction <= 7 else -1
    data['edges'] = [k for k in source.get('edges', []) if k in ('atk','jump','mega','dash','fireTap','bombTap','interact','grenade','heal')][:12] if isinstance(source.get('edges'), list) else []
    return data

# 战地客人每帧上报：自己的位置朝向姿势（客人自己算走位）、载具操纵、以及开火 / 手雷 / 部署等计数器（丢包也不会漏）
ZHANDI_NUM = ('px', 'py', 'pz', 'yaw', 'pitch', 'mx', 'my', 'st', 'mv', 'aim', 'sl', 'kit', 'shot', 'nade', 'nx', 'nz', 'mine', 'gad',
              'use', 'uv', 'life', 'rd', 'rn', 'tg')
ZHANDI_BOOL = ('ads', 'run', 'og', 'fire', 'up', 'down', 'demo')

def clean_zhandi(source):
    data = {}
    for key in ZHANDI_NUM:
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-100000, min(100000, n))
    for key in ZHANDI_BOOL:
        data[key] = source.get(key) is True
    return data

# 方块大陆客人上报：自己的位置朝向、动作位 an、手里的东西、外观编号、血量、收到的改动编号 ack / 事件编号 ea
FANGKUAI_NUM = ('px', 'py', 'pz', 'yaw', 'pitch', 'an', 'held', 'lk', 'sh', 'hr', 'hp', 'ack', 'ea', 'seq')

# 霓虹湾客人上报：位置朝向、开的车（编号 vid、朝向、速度、车况、炮塔）、血量、动作位 an、枪 wp、角色 ch / 衣服 of、事件编号 ea
NIHONG_NUM = ('px', 'py', 'pz', 'yaw', 'pitch', 'vid', 'vyaw', 'vx', 'vz', 'vhp', 'tu', 'hp', 'an', 'wp', 'ch', 'of', 'ea', 'seq')

def clean_nihong(source):
    data = {}
    for key in NIHONG_NUM:
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-1e9, min(1e9, n))
    return data

# 现代战争客人上报：位置、姿态（yaw / pitch / roll）、炮塔转角 ty / 炮管俯仰 tp、车型 vk、速度 sp、出击次数 life、事件编号 ea、标志位 fl、阵亡 dd
XIANDAI_MISSIONS = ('a1', 'a2', 'a3', 't1', 't2', 't3', 's1', 's2', 's3', 'j1')
XIANDAI_NUM = ('px', 'py', 'pz', 'yaw', 'pitch', 'roll', 'ty', 'tp', 'vk', 'sp', 'life', 'ea', 'fl', 'dd', 'seq')

def clean_xiandai(source):
    data = {}
    for key in XIANDAI_NUM:
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-1e9, min(1e9, n))
    return data

# 孢子房车联机守车客人上报：位置朝向、血量、倒地位 an、手里的枪 wp、开枪计数 f、收到的事件编号 ea
BAOZI_NUM = ('px', 'pz', 'yaw', 'hp', 'an', 'wp', 'f', 'ea', 'seq')

GUODAO_NUM = ('s', 'd', 'v', 'vid', 'y', 'fin', 'seq')

def clean_guodao(source):
    data = {}
    for key in GUODAO_NUM:
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-1000000, min(1000000, n))
    return data

def clean_baozi(source):
    data = {}
    for key in BAOZI_NUM:
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-100000, min(100000, n))
    return data

def clean_fangkuai(source):
    data = {}
    for key in FANGKUAI_NUM:
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-1e9, min(1e9, n))
    return data

# 搜打撤客人上报：战地字段 + 血量上限 mh、累计回血 ha、手里的枪 gw、撤离 ex / 自己判定阵亡 dd 计数
SOUDACHE_NUM = ZHANDI_NUM + ('mh', 'ha', 'gw', 'ex', 'dd')

def clean_soudache(source):
    data = {}
    for key in SOUDACHE_NUM:
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-100000, min(100000, n))
    for key in ZHANDI_BOOL:
        data[key] = source.get(key) is True
    return data

# 爆破客人上报：在战地字段上加投掷物种类 nk（1 高爆 / 2 闪光 / 3 烟雾）；安包拆包走 use 计数器，买东西走 command
BAOPO_NUM = ZHANDI_NUM + ('nk',)

def clean_baopo(source):
    data = {}
    for key in BAOPO_NUM:
        n = source.get(key)
        if type(n) in (int, float) and math.isfinite(n):
            data[key] = max(-100000, min(100000, n))
    for key in ZHANDI_BOOL:
        data[key] = source.get(key) is True
    return data

rooms = {}
watchers = {}
failed_passwords = {}
# 联机好友（2026-11-11 枪火试点，客户端 coop-friends.js）：好友码 -> (peer, game, 取当前房间的函数)
# 好友码由客户端本机密钥算出（sha256 取 8 位数字），只收数字不收文字；只在连着大厅 / 房间时算在线
presence = {}
FRIEND_KEY = re.compile(r'[0-9a-f]{32}')
FRIEND_CODE = re.compile(r'\d{8}')


def friend_code(key):
    return f'{int(hashlib.sha256(key.encode()).hexdigest(), 16) % 100000000:08d}'


def friend_view(code):
    entry = presence.get(code)
    if not entry:
        return {'code': code, 'online': False}
    _, game, current = entry
    r = current()
    view = {'code': code, 'online': True, 'game': game, 'gameTitle': GAMES.get(game, {}).get('title', '')}
    if r and rooms.get(r.code) is r:
        view.update({'room': r.code, 'players': len(r.peers), 'max': r.capacity, 'started': r.started, 'canJoin': r.features, 'locked': bool(r.key)})
    return view


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

    def push_state(self, message):
        # 房主快照每秒十几包，每包都是完整状态：某个客人网慢时不排队等，只留最新一包，
        # 发完再补发留下的那包。原先逐包 await，慢的客人会让积压越来越长、画面落后好几秒。
        for p in list(self.peers.values()):
            if p.slot == 0:
                continue
            p.latest_state = message
            task = getattr(p, 'state_task', None)
            if task is None or task.done():
                p.state_task = asyncio.create_task(drain_state(p))


async def drain_state(peer):
    while getattr(peer, 'latest_state', None) is not None:
        message, peer.latest_state = peer.latest_state, None
        try:
            await peer.send(message)
        except Exception:
            peer.latest_state = None
            return


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
            elif kind == 'friend_hello':
                key = msg.get('key')
                if isinstance(key, str) and FRIEND_KEY.fullmatch(key):
                    old = getattr(peer, 'friend_code', None)
                    if old and presence.get(old, (None,))[0] is peer:
                        presence.pop(old, None)
                    peer.friend_code = friend_code(key)
                    presence[peer.friend_code] = (peer, game, lambda: room)
                    if len(presence) > 20000:
                        presence.pop(next(iter(presence)))
                    await peer.send({'type': 'friend_me', 'code': peer.friend_code})
            elif kind == 'friend_room':
                # 局内加好友（2026-11-12 枪火玩家「局内联机模式加个加好友的」）：只回同房间里已经亮过好友码的人，房间列表里不带
                if room:
                    await peer.send({'type': 'friend_room', 'list': [{'slot': p.slot, 'code': p.friend_code} for p in list(room.peers.values())
                                                                     if getattr(p, 'friend_code', None)]})
            elif kind == 'friend_status':
                codes = msg.get('codes')
                if isinstance(codes, list):
                    codes = [c for c in codes[:30] if isinstance(c, str) and FRIEND_CODE.fullmatch(c)]
                    await peer.send({'type': 'friend_status', 'list': [friend_view(c) for c in codes]})
            elif kind == 'friend_invite' and room and getattr(peer, 'friend_code', None):
                to = msg.get('to')
                last = getattr(peer, 'invite_at', 0)
                if not (isinstance(to, str) and FRIEND_CODE.fullmatch(to)) or now - last < 3:
                    continue
                peer.invite_at = now
                target = presence.get(to)
                ok = bool(target) and target[0] is not peer
                if ok:
                    await target[0].send({'type': 'friend_invite', 'from': peer.friend_code, 'game': game, 'gameTitle': spec['title'], 'roomCode': room.code, 'locked': bool(room.key)})
                await peer.send({'type': 'friend_invited', 'to': to, 'ok': ok})
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
                # Anonymous clients (including old clients) cannot choose public text.
                anonymous = msg.get('anonymous') is not False
                requested_name = str(msg.get('name') or '').strip()[:12]
                peer.name = '' if anonymous or requested_name in ('', '玩家', '坦克手') else requested_name
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
                    if game == 'baopo' and settings.get('rule') != 'elim':
                        capacity = min(capacity, 10)
                    room_name = '' if anonymous else str(msg.get('roomName') or '').strip()[:32]
                    candidate = Room(code, room_name or '合作房间 · ' + code,
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
                if not peer.name:
                    peer.name = '玩家' + str(peer.slot + 1)
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
                # 房主一个人也能开局：空位由房主的电脑兵补，其他人开局后仍可中途加入。
                if peer.slot != 0:
                    await peer.send({'type': 'error', 'message': '由房主开始游戏'})
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
                elif game == 'zhandi':
                    data = clean_zhandi(source)
                elif game in ('baopo', 'shenghua'):
                    data = clean_baopo(source)
                elif game == 'soudache':
                    data = clean_soudache(source)
                elif game == 'guodao':
                    data = clean_guodao(source)
                elif game == 'baozi':
                    data = clean_baozi(source)
                elif game == 'fangkuai':
                    data = clean_fangkuai(source)
                elif game == 'xiandai':
                    data = clean_xiandai(source)
                elif game == 'nihong':
                    data = clean_nihong(source)
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
                    room.push_state({'type': 'state', 'seq': room.seq, 'state': msg['state']})
            elif kind == 'action' and room and room.started:
                if msg.get('action') in ('pause', 'resume', 'restart', 'retry', 'tally', 'next'):
                    if msg['action'] in ('restart', 'retry', 'next') and peer.slot != 0:
                        continue
                    await room.peers[0].send({'type': 'action', 'action': msg['action'], 'slot': peer.slot})
            elif kind == 'command' and room and room.started:
                command = msg.get('command')
                if isinstance(command, dict) and len(json.dumps(command)) <= 4096:
                    await room.peers[0].send({'type': 'command', 'slot': peer.slot, 'command': command})
            elif kind == 'quick' and room and room.started:
                # 快捷语只允许预设编号（客户端各自持有同一份固定短语），服务端不接收自由文本。
                q = msg.get('msg')
                if type(q) is int and 0 <= q <= 15:
                    await asyncio.gather(*(p.send({'type': 'quick', 'slot': peer.slot, 'msg': q})
                                           for p in list(room.peers.values()) if p is not peer), return_exceptions=True)
            elif kind == 'chat' and room and room.started and game in CHAT_GAMES:
                # 自由文字聊天：客户端发送前已过 Toy 的 checkInputSafety，但那一步在玩家本机，
                # 绕过客户端直接发 WS 的管不住，所以这里再兜一道：限长、限频、去控制符、拦链接和联系方式。
                text = clean_chat(msg.get('text'))
                now = time.monotonic()
                times = getattr(peer, 'chat_times', None)
                if times is None:
                    times = deque(maxlen=8)
                    peer.chat_times = times
                if not text:
                    await peer.send({'type': 'chat_rejected', 'reason': '这条消息不能发送'})
                elif times and now - times[-1] < CHAT_GAP:
                    await peer.send({'type': 'chat_rejected', 'reason': '发得太快了，稍等一下'})
                elif len(times) == times.maxlen and now - times[0] < 60:
                    await peer.send({'type': 'chat_rejected', 'reason': '一分钟内消息太多，歇一会儿'})
                else:
                    times.append(now)
                    await asyncio.gather(*(p.send({'type': 'chat', 'slot': peer.slot, 'text': text})
                                           for p in list(room.peers.values()) if p is not peer), return_exceptions=True)
            elif kind == 'leave':
                break
    except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError):
        pass
    finally:
        watchers.pop(id(socket), None)
        code = getattr(peer, 'friend_code', None)
        if code and presence.get(code, (None,))[0] is peer:
            presence.pop(code, None)
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
