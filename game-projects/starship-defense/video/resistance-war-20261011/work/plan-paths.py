"""抗战战役路径预计算。

精确复刻游戏 collision() 规则（resistance-campaign.js:87）：
    collision(x,z,r) = 越界 或 任一未禁用碰撞体的 AABB 扩张 r 后包含 (x,z)
用 step=1 的四方向 A*（不允许斜穿，从根上消除拐角切割导致的卡死），
再做保碰撞安全的折线简化，输出各章各阶段目标点的 waypoint 序列。
"""
import json, os, heapq

D = r"D:/project/toolbasecamp-video-resistance-war/game-projects/starship-defense/video/resistance-war-20261011/work/probe"
OUT = r"D:/project/toolbasecamp-video-resistance-war/game-projects/starship-defense/video/resistance-war-20261011/work/paths.json"

WALK_R = 0.5   # 玩家步行半径（游戏用 .42，取略保守值）
MOUNT_R = 0.9  # 骑乘半径（游戏用 .75）
STEP = 1.0


class Map:
    def __init__(self, bounds, colliders, disabled_keys=()):
        self.bounds = bounds
        # 记录哪些碰撞体属于已被摧毁的可破坏物
        self.colliders = []
        for c in colliders:
            self.colliders.append((c['x'], c['z'], c['w'], c['d'], c.get('key')))
        self.disabled = set(disabled_keys)

    def blocked(self, x, z, r):
        b = self.bounds
        if x < b['minX'] + 2 or x > b['maxX'] - 2 or z < b['minZ'] + 2 or z > b['maxZ'] - 2:
            return True
        for cx, cz, w, d, key in self.colliders:
            if key is not None and key in self.disabled:
                continue
            if abs(x - cx) < w / 2 + r and abs(z - cz) < d / 2 + r:
                return True
        return False


def load_map(chapter, phase):
    """按阶段还原地图：phase0 文件含完整碰撞体与可破坏物尺寸，
    各阶段文件含该阶段已 dead 的可破坏物，用来禁用对应碰撞体。"""
    p0 = json.load(open(f"{D}/map-ch{chapter}-phase0.json", encoding='utf-8'))
    bounds = p0['bounds']
    # 可破坏物 -> 碰撞体匹配（按 x/z/w/d）
    dsize = {d['key']: (round(d['x'], 1), round(d['z'], 1), round(d['cw'], 1), round(d['cd'], 1))
             for d in p0['destructibles']}
    colliders = []
    for c in p0['colliders']:
        key = None
        for k, (dx, dz, dw, dd) in dsize.items():
            if (round(c['x'], 1), round(c['z'], 1), round(c['w'], 1), round(c['d'], 1)) == (dx, dz, dw, dd):
                key = k
                break
        colliders.append({**c, 'key': key})

    # 该阶段已摧毁的可破坏物
    dead = set()
    if phase == 0:
        for d in p0['destructibles']:
            if d['dead']:
                dead.add(d['key'])
    else:
        pf = f"{D}/map-ch{chapter}-phase{phase}.json"
        if os.path.exists(pf):
            pd = json.load(open(pf, encoding='utf-8'))
            for d in pd.get('destructibles', []):
                if d.get('dead'):
                    dead.add(d['key'])
    return Map(bounds, colliders, dead), p0


def astar(m, start, goal, r):
    x0 = round(start[0] / STEP) * STEP
    z0 = round(start[1] / STEP) * STEP
    gx = round(goal[0] / STEP) * STEP
    gz = round(goal[1] / STEP) * STEP
    b = m.bounds
    nx = lambda x: max(int((b['minX'] + 2 - x0) / STEP), min(int((b['maxX'] - 2 - x0) / STEP), round((x - x0) / STEP)))
    nz = lambda z: max(int((b['minZ'] + 2 - z0) / STEP), min(int((b['maxZ'] - 2 - z0) / STEP), round((z - z0) / STEP)))
    W = int((b['maxX'] - 2 - (b['minX'] + 2)) / STEP) + 2
    H = int((b['maxZ'] - 2 - (b['minZ'] + 2)) / STEP) + 2
    X = lambda i: x0 + i * STEP
    Z = lambda j: z0 + j * STEP

    si, sj = nx(start[0]), nz(start[1])
    ei, ej = nx(goal[0]), nz(goal[1])
    if si == ei and sj == ej:
        return [(goal[0], goal[1])]
    # 目标点本身若被占（如交通壕目标压在墙上），向外找最近可站格
    if m.blocked(X(ei), Z(ej), r):
        found = None
        for rad in range(1, 12):
            for di in range(-rad, rad + 1):
                for dj in range(-rad, rad + 1):
                    if max(abs(di), abs(dj)) != rad:
                        continue
                    ii, jj = ei + di, ej + dj
                    if 0 <= ii < W and 0 <= jj < H and not m.blocked(X(ii), Z(jj), r):
                        # 必须仍满足游戏过关距离（离原目标 < 阈值），这里控制在 6 米内
                        if ((X(ii) - goal[0]) ** 2 + (Z(jj) - goal[1]) ** 2) ** .5 < 6.2:
                            found = (ii, jj)
                            break
                if found:
                    break
            if found:
                break
        if not found:
            return None
        ei, ej = found

    start_i = si + int((b['minX'] + 2 - x0) / STEP) if False else si
    # 用绝对索引，避免偏移混乱
    def idx(i, j):
        return (j - int((b['minZ'] + 2 - z0) / STEP)) * W + (i - int((b['minX'] + 2 - x0) / STEP))
    off_i = int((b['minX'] + 2 - x0) / STEP)
    off_j = int((b['minZ'] + 2 - z0) / STEP)
    s = (si - off_i, sj - off_j)
    e = (ei - off_i, ej - off_j)
    if s[0] < 0 or s[1] < 0 or e[0] < 0 or e[1] < 0 or s[0] >= W or s[1] >= H or e[0] >= W or e[1] >= H:
        return None

    g = {s: 0.0}
    par = {s: None}
    pq = [(abs(s[0] - e[0]) + abs(s[1] - e[1]), 0.0, s)]
    closed = set()
    while pq:
        _, gc, cur = heapq.heappop(pq)
        if cur in closed:
            continue
        closed.add(cur)
        if cur == e:
            break
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = (cur[0] + di, cur[1] + dj)
            if nb[0] < 0 or nb[1] < 0 or nb[0] >= W or nb[1] >= H or nb in closed:
                continue
            wx, wz = X(nb[0] + off_i), Z(nb[1] + off_j)
            if m.blocked(wx, wz, r):
                continue
            ng = gc + 1.0
            if ng < g.get(nb, 1e18):
                g[nb] = ng
                par[nb] = cur
                heapq.heappush(pq, (ng + abs(nb[0] - e[0]) + abs(nb[1] - e[1]), ng, nb))
    if e not in par:
        return None
    path = []
    k = e
    while k is not None:
        path.append((X(k[0] + off_i), Z(k[1] + off_j)))
        k = par[k]
    path.reverse()
    path[-1] = (goal[0], goal[1]) if not m.blocked(goal[0], goal[1], r) else path[-1]
    return path


def los_free(m, a, b, r):
    """两点连线是否全程可通行（采样步长 0.25m）"""
    dist = ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** .5
    n = max(2, int(dist / 0.25))
    for i in range(n + 1):
        t = i / n
        if m.blocked(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, r):
            return False
    return True


def simplify(m, path, r):
    """保碰撞安全的折线简化：能直线走通的中间点全部丢掉"""
    if not path or len(path) < 3:
        return path
    out = [path[0]]
    i = 0
    while i < len(path) - 1:
        j = len(path) - 1
        while j > i + 1 and not los_free(m, path[i], path[j], r):
            j -= 1
        out.append(path[j])
        i = j
    return out


# ---- 各章各阶段的录制路线（目标点取自 probe 实测的 objectives）----
ROUTES = {
    0: {  # 李家坡 · 交通壕突击
        0: [('trench-standoff', (-7, 52)), ('trench', (-7, 55.5))],
        1: [('left-bunker-front', (-14, 86)), ('right-bunker-front', (14, 91.5))],
        2: [('hilltop', (0, 130))],
    },
    1: {  # 骑兵连 · 冲锋突围
        0: [('horse', (3, -15.5))],
        1: [('charge-line', (0, 62)), ('charge-break', (0, 82))],
        2: [('escort-mid', (0, 100)), ('escort-end', (0, 132))],
    },
    2: {  # 平安县城 · 开炮
        0: [('outpost', (0, 36)), ('street-bunker-front', (-12, 46))],
        1: [('ammo-crate', (-12, 56.5)), ('cannon-rear', (0, 60.5))],
        2: [('cannon-rear', (0, 60.5))],
        3: [('gate-way', (0, 100)), ('hq', (0, 137))],
    },
}

result = {'generated_from': 'probe-war.cjs 实测地图数据', 'collision_rule': 'resistance-campaign.js:87 collision()',
          'grid_step': STEP, 'directions': '4-dir（不允许斜穿）', 'walk_radius': WALK_R, 'mount_radius': MOUNT_R,
          'chapters': {}}

for ch, phases in ROUTES.items():
    result['chapters'][str(ch)] = {'phases': {}}
    for ph, targets in phases.items():
        m, p0 = load_map(ch, ph)
        spawn = p0['playerSpawn'] if ph == 0 else None
        pf = f"{D}/map-ch{ch}-phase{ph}.json"
        if ph > 0 and os.path.exists(pf):
            spawn = json.load(open(pf, encoding='utf-8'))['playerSpawn']
        start = (spawn['x'], spawn['z']) if spawn else (0, -18)
        mounted = (ch == 1 and ph > 0)
        r = MOUNT_R if mounted else WALK_R
        legs = []
        cur = start
        for name, goal in targets:
            raw = astar(m, cur, goal, r)
            if raw is None:
                legs.append({'name': name, 'goal': list(goal), 'reachable': False,
                             'reason': f'A* 未找到从 {tuple(round(v,1) for v in cur)} 到 {goal} 的可行走路线（半径 {r}）'})
                print(f"CH{ch} P{ph} {name}: 不可达  from {cur} -> {goal}")
                continue
            simp = simplify(m, raw, r)
            length = sum(((simp[i+1][0]-simp[i][0])**2+(simp[i+1][1]-simp[i][1])**2)**.5 for i in range(len(simp)-1))
            legs.append({'name': name, 'goal': list(goal), 'reachable': True, 'radius': r,
                         'raw_cells': len(raw), 'waypoints': [[round(x, 2), round(z, 2)] for x, z in simp],
                         'path_length_m': round(length, 1),
                         'est_seconds': round(length / (12 if mounted else 5.7), 1)})
            print(f"CH{ch} P{ph} {name}: {len(raw)}格 -> {len(simp)}个航点, {length:.1f}m, 预计{length/(12 if mounted else 5.7):.0f}s")
            cur = simp[-1] if simp else goal
        result['chapters'][str(ch)]['phases'][str(ph)] = {'spawn': list(start), 'legs': legs}

json.dump(result, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
unreach = [(c, p, l['name']) for c, cv in result['chapters'].items()
           for p, pv in cv['phases'].items() for l in pv['legs'] if not l['reachable']]
print()
print("输出:", OUT)
print("不可达航点:", unreach if unreach else "无")
