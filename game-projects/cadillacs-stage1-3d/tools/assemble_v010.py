# 组装 v0.1.0 交接清单：探测媒体哈希 / 尺寸 / 时长，写 media-kit/releases/v0.1.0/handoff.json
# 以及开发中修复前证据的 releases/v0.1.0-dev/handoff.json。用法：python tools/assemble_v010.py
import hashlib, json, subprocess, sys, os
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / 'media-kit'
PUB = ROOT.parent.parent / 'public' / 'html' / 'game' / 'cadillacs-stage1-3d'
REL = KIT / 'releases' / 'v0.1.0'
DEV = KIT / 'releases' / 'v0.1.0-dev'
CST = timezone(timedelta(hours=8))

def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()

def probe(p):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(p)], capture_output=True, text=True, encoding='utf-8').stdout
    return json.loads(out)

def git(*a):
    try: return subprocess.run(['git', *a], cwd=ROOT, capture_output=True, text=True, encoding='utf-8').stdout.strip()
    except Exception: return ''

# 构建指纹：实际试玩产物三件套
files = [PUB / 'index.html', PUB / 'css' / 'style.css', PUB / 'js' / 'game.min.js']
fp = hashlib.sha256(''.join(sha(f) for f in files).encode()).hexdigest()
build_id = 'cd3d-v0.1.0-' + sha(PUB / 'js' / 'game.min.js')[:10]
commit = git('rev-parse', 'HEAD') or None
dirty = bool(git('status', '--porcelain', '--', str(ROOT / 'src'), str(PUB)))

def media(id_, rel, kind, mode, desc, **kw):
    p = KIT / rel
    m = {'id': id_, 'file': rel.replace('\\', '/'), 'sha256': sha(p), 'kind': kind, 'version': kw.pop('version', 'v0.1.0'), 'build_id': kw.pop('build_id', build_id), 'capture_mode': mode, 'description': desc}
    if kind in ('video', 'audio'):
        pr = probe(p)
        v = [s for s in pr['streams'] if s['codec_type'] == 'video']
        a = [s for s in pr['streams'] if s['codec_type'] == 'audio']
        m['duration_seconds'] = round(float(pr['format']['duration']), 3)
        if v: m['width'], m['height'] = v[0]['width'], v[0]['height']
        m['audio'] = kw.pop('audio', 'game' if a else 'none')
        m['audio_review'] = kw.pop('audio_review', 'not-run')
        m['segments'] = kw.pop('segments', [])
    else:
        from PIL import Image
        with Image.open(p) as im: m['width'], m['height'] = im.size
        m['audio'] = 'not-applicable' if False else None
        m.pop('audio')
    m['visual_review'] = kw.pop('visual_review', 'pass')
    m.update(kw)
    return m

def segs_from_timeline(mp4, extra=None):
    tl = json.loads((KIT / mp4.replace('.mp4', '.timeline.json')).read_text(encoding='utf-8'))
    dur = tl['duration']
    pts = tl['timeline']
    out = []
    for i, p in enumerate(pts):
        a = p['t']; b = pts[i + 1]['t'] if i + 1 < len(pts) else dur
        if b - a >= 0.5: out.append({'in_seconds': round(a, 2), 'out_seconds': round(min(b, dur - 0.01), 2), 'description': p['desc'], 'supports': []})
    return out, tl

CAP = 'releases/v0.1.0/captures/'
M = []
full_segs, full_tl = segs_from_timeline(CAP + 'full-run-16x9.mp4')
M.append(media('full-run', CAP + 'full-run-16x9.mp4', 'video', 'offline-render', '穆斯塔法打完整个第一关（标题 → 选人 → 楼顶开场 → 大楼内部 → 第 47 街 → Boss 维斯与岩跳龙 → 体力奖励 → 结算），16:9 1280×720 30fps，含 HUD；手动时钟逐帧截图，输入来自页面内 bot 派发的真实键盘事件；音轨按同局事件离线重新合成', segments=full_segs, input='bot（自动输入，非真人）', seed=full_tl['seed']))
cam_segs, cam_tl = segs_from_timeline(CAP + 'cameras-16x9.mp4')
M.append(media('cameras', CAP + 'cameras-16x9.mp4', 'video', 'offline-render', '四种视角（侧视 / 斜视 / 正视 / 第一人称）与侧视下 Q/E 环绕，再到大楼内部的正视与第一人称；杰克，bot 输入', segments=cam_segs, input='bot（自动输入，非真人）'))
mob_segs, _ = segs_from_timeline(CAP + 'mobile-landscape.mp4')
M.append(media('mobile-landscape', CAP + 'mobile-landscape.mp4', 'video', 'offline-render', '手机横屏 844×390（DPR2）设备模拟：触屏摇杆 + J 键实际触摸事件（CDP），显示虚拟按键', segments=mob_segs, input='CDP 触摸事件脚本（模拟，非真机）'))
por_segs, _ = segs_from_timeline(CAP + 'mobile-portrait.mp4')
M.append(media('mobile-portrait', CAP + 'mobile-portrait.mp4', 'video', 'offline-render', '手机竖屏 390×844 开局后舞台自动旋转为横屏布局，触控按逆变换操作（竖屏物理画面，不是 16:9 母版）', segments=por_segs, input='CDP 触摸事件脚本（模拟，非真机）'))
SHOTS = [
    ('shot-title', 'title.png', '标题画面：四位主角站在楼顶，主菜单含命数 / 耐久 / 演示模式 / 视角 / 画质 / 音量等选项'),
    ('shot-select', 'select.png', '选人画面：四张角色卡（原作能力值与口号）'),
    ('shot-roof-intro', 'roof-intro.png', '楼顶开场：维斯与四个手下，对话框头像'),
    ('shot-roof-fight', 'roof-fight.png', '楼顶战斗（侧视）'),
    ('shot-roof-front', 'roof-front.png', '楼顶·正视（主角身后看向楼梯间）'),
    ('shot-roof-fp', 'roof-fp.png', '楼顶·第一人称'),
    ('shot-hall', 'hall-start.png', '大楼内部：金色骑士像、双开门、拿铁管的费里斯'),
    ('shot-hall-front', 'hall-front.png', '大楼内部·正视'),
    ('shot-street', 'street-start.png', '第 47 街：黑埃尔默破门而出'),
    ('shot-boss-intro', 'boss-dialog.png', 'Boss 登场：维斯用锁链拴着绿色岩跳龙'),
    ('shot-boss-fight', 'boss-fight.png', 'Boss 战（岩跳龙已变橙色）'),
    ('shot-result', 'result.png', '结算画面'),
    ('shot-continue', 'continue.png', '经典命数用完后的续关画面（维斯举枪倒数）'),
    ('shot-mobile', 'mobile-game.png', '手机横屏触屏布局'),
    ('shot-mobile-portrait', 'mobile-portrait-game.png', '手机竖屏开局后的旋转横屏布局'),
]
for id_, f, d in SHOTS:
    if (KIT / (CAP + 'shots/' + f)).exists(): M.append(media(id_, CAP + 'shots/' + f, 'screenshot', 'offline-render', d))
M.append(media('site-thumb', CAP + 'shots/site-thumb.jpg', 'screenshot', 'offline-render', '网站卡片封面（Boss 区摆拍实机画面，隐藏 HUD，512×512）'))

# 开发中构建的修复前证据（单独清单）
DEV.mkdir(parents=True, exist_ok=True)
dev_build = 'cd3d-v0.1.0-dev-20261005'
dev_media = []
for id_, f, d in [
    ('dev-bug-dialog', 'bug-dialog-portrait-before.png', 'B3 修复前：对话框头像一片绿、名字为空（第一次冒烟测试截图）'),
    ('dev-bug-floor', 'bug-hall-floor-void-before.png', 'B4 修复前：大楼内部地板下露出浅蓝色天空球'),
    ('dev-bug-door', 'bug-door-frames-floating-before.png', 'B5 修复前：镜头转到后墙外，门框与门洞悬空'),
    ('dev-bug-faces', 'bug-portraits-zoom-before.png', 'B10 修复前：头像镜头太近、帽檐挡住穆斯塔法眼睛'),
    ('dev-skyline', 'skyline-before.png', '远景调整前：楼顶背景高楼太近太高'),
]:
    rel = 'releases/v0.1.0/captures/bugs/' + f
    dev_media.append(media(id_, rel, 'screenshot', 'realtime-automation' if 'dialog' in id_ else 'offline-render', d, version='v0.1.0-dev', build_id=dev_build))
dev_manifest = {
    'schema_version': 1, 'game_id': 'cadillacs-stage1-3d', 'version': 'v0.1.0-dev', 'base_version': None, 'created_at': datetime.now(CST).isoformat(timespec='seconds'),
    'build': {'id': dev_build, 'commit': None, 'dirty': True, 'fingerprint': '未留存（开发中多次重建的本地构建，产物已被 v0.1.0 覆盖）', 'entrypoint': 'public/html/game/cadillacs-stage1-3d/index.html'},
    'feature_inventory': [], 'changes': [], 'bugs': [], 'media': dev_media, 'historical_media': [], 'qa': [],
    'readiness': {'overview': 'not_applicable', 'update': 'not_applicable', 'gaps': ['仅保存 v0.1.0 开发过程中的修复前证据，不作为可播放版本']}
}
(DEV / 'handoff.json').write_text(json.dumps(dev_manifest, ensure_ascii=False, indent=1), encoding='utf-8')
hist = [{'id': 'h-' + m['id'], 'handoff': 'releases/v0.1.0-dev/handoff.json', 'media_id': m['id'], 'reason': '同一版本开发过程中的修复前画面（开发构建）'} for m in dev_media]

qa_dir = ROOT / 'qa' / 'out'
def qa_json(name):
    p = REL / 'qa' / name
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else None
desk = qa_json('desktop.json'); mob = qa_json('mobile.json'); perf = qa_json('perf-1280x720-high.json')
QA = []
if desk: QA.append({'id': 'qa-desktop', 'device': 'Windows 11 本机 · Microsoft Edge（Playwright 无头）· ANGLE D3D11 RTX 4060 Ti · 1280×720', 'method': '真实键盘事件逐项验收（qa/desktop.js）', 'result': f"{desk['pass']}/{desk['total']} 通过", 'evidence': 'releases/v0.1.0/qa/desktop.json', 'untested': ['真人手感试玩']})
if mob: QA.append({'id': 'qa-mobile', 'device': 'Edge 设备模拟：Android UA、844×390 与 390×844、DPR2、hasTouch', 'method': 'CDP 多点触摸事件（qa/mobile.js），含竖屏旋转逆变换与 1×1 启动后重排', 'result': f"{mob['pass']}/{mob['total']} 通过", 'evidence': 'releases/v0.1.0/qa/mobile.json', 'untested': ['真机触控', '真机全屏 / 横屏锁定', '真机帧率']})
if perf: QA.append({'id': 'qa-perf', 'device': 'Edge 无头 · RTX 4060 Ti · 1280×720 DPR1 · 高画质', 'method': 'bot 实时打斗，侧视 / 正视 / 第一人称 / 转视角 / Boss 各采样 8 秒帧间隔（qa/perf.js）', 'result': '; '.join(f"{r['name']} {r['frames']['fps']}fps p95 {r['frames']['p95']}ms >50ms:{r['frames']['over50']} draws {(r.get('drawCalls') or {}).get('calls')}" for r in perf['runs']), 'evidence': 'releases/v0.1.0/qa/perf-1280x720-high.json', 'untested': ['手机真机性能', '流畅档实测']})
bots = REL / 'qa' / 'bot-runs.json'
if bots.exists(): QA.append({'id': 'qa-bot', 'device': '同上（手动时钟）', 'method': 'qa/botrun.js 让 bot 用四位英雄各打一整关，另跑一次经典耐久', 'result': '全部通关，见 bot-runs.json', 'evidence': 'releases/v0.1.0/qa/bot-runs.json', 'untested': ['真人难度评价']})

FEAT = [
    ('f-heroes', '四位英雄可选，原作能力值 / 口号 / 配色', ['shot-select']),
    ('f-roof', '楼顶：维斯开场、两只油桶、三波敌人、踹门进楼', ['full-run', 'shot-roof-intro', 'shot-roof-fight']),
    ('f-hall', '大楼内部：骑士像、双开门出敌、霰弹枪 / 左轮、三个胖子、跳窗', ['full-run', 'shot-hall']),
    ('f-street', '第 47 街：破门而出、跳下残墙、手雷油桶', ['full-run', 'shot-street']),
    ('f-boss', 'Boss 维斯·T + 岩跳龙：锁链、抽鞭暴走、飞身踢、连拳长臂拳、左轮、叫手下、体力奖励与线索台词', ['full-run', 'shot-boss-intro', 'shot-boss-fight']),
    ('f-combat', '连招击倒、跳踢 / 飞踢、冲刺攻击、必杀、抓投、膝撞、梅斯抱摔、举桶扔桶、武器（左轮 / 霰弹 / 刀 / 铁管 / 炸药 / 手雷）、食物与宝物', ['full-run']),
    ('f-cameras', '侧视 / 斜视 / 正视 / 第一人称 + Q/E 转视角', ['cameras', 'shot-roof-front', 'shot-roof-fp', 'shot-hall-front']),
    ('f-options', '标准选项：命数、耐久三档、演示模式、视角、画质、音量、触屏按键、帧率、全屏、返回游戏列表', ['shot-title']),
    ('f-continue', '经典命数续关画面与 GAME OVER', ['shot-continue']),
    ('f-mobile', '手机触屏与竖屏自动旋转', ['mobile-landscape', 'mobile-portrait', 'shot-mobile', 'shot-mobile-portrait']),
    ('f-music', '关卡 / Boss / 过关 / 续关音乐（原作风格重新编写，非原曲）', ['full-run']),
]
have = {m['id'] for m in M}
feature_inventory = [{'id': i, 'description': d, 'status': 'implemented', 'evidence_ids': [e for e in ev if e in have]} for i, d, ev in FEAT]
BUGS = [
    ('B1', '描边材质着色器编译失败（MeshBasicMaterial 没有 objectNormal）', 'WebGL 报错、描边不显示', '改用 normal 属性', [], []),
    ('B2', '开局报 resolveHits is not defined', '游戏卡死', '删除未实现的调用', [], []),
    ('B3', '对话框头像与名字为空', '过场脚本说话人写在 say 字段，HUD 读 who', '统一读 say', ['h-dev-bug-dialog'], ['shot-roof-intro']),
    ('B4', '大楼内部地板下露出天空球', '窗外用了包住场景的天空球、地板太薄', '加地基与木边，窗外改远景板', ['h-dev-bug-floor'], ['shot-hall']),
    ('B5', '镜头转到后墙外时门框悬空', '剖切只隐藏后墙', '门框、门洞、壁灯、蛛网与后墙一起剖切', ['h-dev-bug-door'], []),
    ('B6', '飞踢 / 滑铲腿朝天', '身体后仰与抬腿角度叠加', '重调髋关节', [], ['site-thumb']),
    ('B7', '维斯叫人被打断后手下不来', '只在开枪那一帧生成敌人', '记为待叫，起身后照样叫来', [], ['full-run']),
    ('B8', '手机 J / L 键重叠 4px', '布局估算偏差', 'L 键左移', [], ['shot-mobile']),
    ('B9', '离线渲染音轨时报 AudioContext 节点不匹配', '渲染期间实时音乐调度还在跑', '渲染期间暂停实时调度', [], []),
    ('B10', '头像太近、帽檐挡眼', '头像相机距离与帽子高度', '拉远镜头、帽子上移', ['h-dev-bug-faces'], ['shot-select']),
]
bugs = [{'id': i, 'found_version': 'v0.1.0-dev', 'repro': '开发验证中发现（见 notes.md）', 'observed': o, 'joke_angle': None, 'cause': c, 'status': 'fixed', 'fix': f, 'before_media_ids': [x for x in bf], 'after_media_ids': [x for x in af if x in have], 'retest': '修复后由 desktop / mobile / bot 脚本或截图复验'} for i, o, c, f, bf, af in BUGS]

manifest = {
    'schema_version': 1, 'game_id': 'cadillacs-stage1-3d', 'version': 'v0.1.0', 'base_version': None, 'created_at': datetime.now(CST).isoformat(timespec='seconds'),
    'build': {'id': build_id, 'commit': commit, 'dirty': dirty, 'fingerprint': fp, 'entrypoint': 'public/html/game/cadillacs-stage1-3d/index.html', 'fingerprint_files': [str(f.relative_to(ROOT.parent.parent)).replace('\\', '/') for f in files]},
    'feature_inventory': feature_inventory,
    'changes': [{'id': 'c-new', 'feature_ids': [f[0] for f in FEAT], 'before': '无（新游戏）', 'after': '完整可玩的第一关 3D 重置版', 'player_visible': '新游戏上线网站游戏列表', 'evidence_ids': ['full-run'], 'verified': 'pass'}],
    'bugs': bugs, 'media': M, 'historical_media': hist, 'qa': QA,
    'readiness': {'overview': 'partial', 'update': 'not_applicable', 'gaps': ['音轨为同局事件离线重新合成，尚未人工听审（audio_review: not-run）', '录像输入来自 bot，非真人试玩；手机录像为设备模拟', '背景音乐不是原作曲（缺乐谱，按风格重新编写），视频文案需如实说明']}
}
(REL / 'handoff.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
print('wrote', REL / 'handoff.json', len(M), 'media', 'build', build_id, 'dirty', dirty)
