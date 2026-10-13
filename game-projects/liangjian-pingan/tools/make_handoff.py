# -*- coding: utf-8 -*-
"""汇总 v0.1.0 的交接清单：构建指纹、实机截图/录像的哈希与属性、各验收脚本的结果。
用法（仓库根目录）：python game-projects/liangjian-pingan/tools/make_handoff.py
"""
import hashlib, json, subprocess, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'game-projects' / 'liangjian-pingan'
PUB = ROOT / 'public' / 'html' / 'game' / 'liangjian-pingan'
KIT = GAME / 'media-kit'
REL = KIT / 'releases' / 'v0.1.0'
CAP = REL / 'captures'
QA = GAME / 'qa'


def sha(p):
    h = hashlib.sha256(); h.update(Path(p).read_bytes()); return h.hexdigest()


def fingerprint():
    h = hashlib.sha256(); n = 0
    for f in sorted(PUB.rglob('*')):
        if f.is_file():
            h.update(f.relative_to(PUB).as_posix().encode()); h.update(f.read_bytes()); n += 1
    return h.hexdigest(), n


def probe(p):
    try:
        out = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate:format=duration', '-of', 'json', str(p)])
        d = json.loads(out); s = d['streams'][0]
        a = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', str(p)]).decode().strip()
        return {'width': s['width'], 'height': s['height'], 'fps': s.get('avg_frame_rate'), 'duration_seconds': round(float(d['format'].get('duration') or 0), 1), 'audio': 'game' if a else 'none'}
    except Exception as e:
        return {'probe_error': str(e)}


def png_size(p):
    b = Path(p).read_bytes()[:24]
    return int.from_bytes(b[16:20], 'big'), int.from_bytes(b[20:24], 'big')


def load(name):
    p = QA / name
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else None


fp, nfiles = fingerprint()
build_id = 'local-' + fp[:12]
commit = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip() or None
dirty = bool(subprocess.run(['git', '-C', str(ROOT), 'status', '--porcelain', '--', 'public/html/game/liangjian-pingan'], capture_output=True, text=True).stdout.strip())

shots = [
    ('menu', 'qa/smoke-menu.png', '主菜单与全部选项（电脑 1280×720）'),
    ('menu-phone', 'qa/menu-844x346.png', '手机横屏紧凑主菜单（844×346 触控模拟，DPR2）'),
    ('menu-portrait', 'qa/menu-390x844.png', '手机竖屏打开即旋转成横屏的主菜单（390×844 触控模拟）'),
    ('view-tilt', 'qa/view-0.png', '斜俯视'), ('view-top', 'qa/view-1.png', '战术俯视'), ('view-chase', 'qa/view-2.png', '正视'), ('view-fp', 'qa/view-3.png', '第一人称'),
    ('cannon-tilt', 'qa/cannon-view-0.png', '操炮·斜俯视，弹道线与落点圈'), ('cannon-fp', 'qa/scene-cannon-fp.png', '操炮·第一人称（炮手视角）'),
    ('fire', 'qa/play-shells-1.png', '第一炮：“开炮！”大字与弹幕'), ('tower', 'qa/play-tower-1.png', '城楼被轰塌'),
    ('cavalry', 'qa/scene-cavalry-tilt.png', '骑兵连冲锋'), ('dash', 'qa/scene-dash-chase.png', '亮剑突进'),
    ('yidalipao', 'qa/play-phase2-start.png', '第二阶段开场：“意大利炮呢？”'), ('loot', 'qa/play-loot-1.png', '缴获军火库：“发财了！”'),
    ('clash', 'qa/play-clash-1.png', '与山本拼刀成功'), ('won', 'qa/play-won-1.png', '胜利升旗'), ('result', 'qa/play-result.png', '结算战报'),
    ('street', 'qa/scene-gate-tunnel-chase.png', '从城门洞看城内主街（正视）'), ('hq', 'qa/scene-hq-chase.png', '守备队部决战（正视）'),
    ('touch-play', 'qa/play-844x390.png', '手机横屏游玩布局（触控模拟）'), ('touch-portrait', 'qa/play-390x844.png', '手机竖屏旋转后的游玩布局（触控模拟）'),
    ('fade', 'qa/sheet-fix.jpg', '遮挡淡化、炮手视角等修复后的联系表'),
]
media = []
for mid, rel, desc in shots:
    p = CAP / rel
    if not p.exists():
        continue
    w, h = png_size(p) if p.suffix == '.png' else (None, None)
    media.append({'id': mid, 'file': f'releases/v0.1.0/captures/{rel}', 'sha256': sha(p), 'kind': 'screenshot', 'version': 'v0.1.0', 'build_id': build_id, 'capture_mode': 'realtime-automation', 'description': desc + '（Edge 无头 + 本机显卡；脚本摆位或脚本按键，手动步进后截图）', 'width': w, 'height': h, 'duration_seconds': None, 'audio': 'none', 'visual_review': 'pass', 'audio_review': 'not-applicable', 'segments': []})
for v in sorted(CAP.glob('playthrough-*.webm')):
    pr = probe(v)
    media.append({'id': v.stem, 'file': f'releases/v0.1.0/captures/{v.name}', 'sha256': sha(v), 'kind': 'video', 'version': 'v0.1.0', 'build_id': build_id, 'capture_mode': 'realtime-automation', 'description': '实时运行，由按键脚本从第一阶段打到结算的整局录像（斜俯视，无头浏览器录屏，无声音；不是真人操作）', 'width': pr.get('width'), 'height': pr.get('height'), 'duration_seconds': pr.get('duration_seconds'), 'audio': pr.get('audio', 'none'), 'visual_review': 'not-run', 'audio_review': 'not-applicable', 'segments': [], 'note': '录像完成后若又改过代码，build_id 以录制时为准；本条在最终构建上录制' if not dirty else ''})

views, mobile, options, perf = load('out-views.json'), load('out-mobile.json'), load('out-options.json'), load('out-perf.json')
plays = {a: load(f'out-playthrough-p1-{a}.json') for a in ('std', 'easy', 'one')}
passed = lambda d: None if not d else f"{sum(1 for r in d['results'] if r['ok'])}/{len(d['results'])}"
qa = [
    {'what': '四个视角：移动/射击方向、Q/E 与鼠标拖动转向、纵向限位、C 循环回正、操炮四视角', 'method': 'qa/views.cjs，Edge 无头，真实键盘与鼠标事件 + 手动步进', 'viewport': '1280×720', 'result': passed(views), 'evidence': 'qa/out-views.json'},
    {'what': '电脑五种窗口与手机八种视口的菜单完整性；竖屏旋转；摇杆、动作键、拖动转视角、多点触控；三种操作模式切换；暂停/结算布局', 'method': 'qa/mobile.cjs，Edge 无头，CDP 触控模拟（不是手机真机）', 'viewport': '1366×768、1280×720、1366×625、1280×580、1920×1080；844×390、844×346、800×390、740×360、568×320、390×844、360×780、375×667', 'result': passed(mobile), 'evidence': 'qa/out-mobile.json'},
    {'what': '每个选项的切换/保存/实际效果；命数与耐久；急救包；演示模式；暂停冻结声音、继续/重开/回主菜单后有声；起始阶段直达与继续；炮被打坏后本阶段重来；包内无作者网站地址与账号表单', 'method': 'qa/options.cjs，Edge 无头；声音在输出端挂分析器实测', 'viewport': '1280×720', 'result': passed(options), 'evidence': 'qa/out-options.json'},
    {'what': '自动通关（流程不软锁、无脚本报错；压力参考）', 'method': 'qa/playthrough.cjs，按键脚本走键盘输入层，手动步进；脚本不躲子弹、不用掩体', 'result': {a: (None if not d else {'finished': d['finished'], 'game_seconds': d['gameSeconds'], 'phases': d['phases'], 'deaths': d['final']['deaths'], 'hurt': d['final']['hurt'], 'kills': d['final']['kills'], 'score': d['final']['score'], 'errors': d['errors']}) for a, d in plays.items()}, 'evidence': 'qa/out-playthrough-p1-*.json'},
    {'what': '帧时间（实时运行，脚本边打边测）', 'method': 'qa/perf.cjs', 'result': None if not perf else [{'name': r['name'], 'renderer': r['env']['renderer'], 'dpr': r['env']['dpr'], 'samples': [{k: s[k] for k in ('phase', 'view', 'avgFps', 'medianMs', 'p95Ms', 'maxMs', 'over50ms', 'avgCalls', 'avgTris', 'canvas', 'quality')} for s in r['samples']]} for r in perf['runs']], 'evidence': 'qa/out-perf.json', 'note': '只代表本机 RTX 4060 Ti；“手机模拟”只是视口与像素比，不是手机性能'},
    {'what': '画面巡检：城门洞、房后、巷子、院子、转 180°、骑兵/亮剑/操炮动态；全屏；以 0×0 启动后重排', 'method': 'qa/scenes.cjs + 人工看图（由 AI 查看截图）', 'result': '遮挡淡化、炮手视角、战友挡镜头三处问题已修并复拍；全屏对整页生效；0×0 启动后 1.2 秒内按 844×390 重排', 'evidence': 'captures/qa/scene-*.png、sheet-*.jpg'},
]
untested = ['手机真机（触控、多指、性能、全屏与横屏锁定）', '真人完整试玩与难度手感', '喊话语音的听感（未试听）', '带声音的录像', 'Toy 外壳内运行（本版不发布）', '动态画面的逐帧人工审看（只看了截图）']

handoff = {
    'schema_version': 1, 'game_id': 'liangjian-pingan', 'version': 'v0.1.0', 'base_version': None,
    'created_at': datetime.now(timezone(timedelta(hours=8))).isoformat(timespec='seconds'),
    'build': {'id': build_id, 'commit': commit, 'dirty': dirty, 'fingerprint': 'sha256:' + fp + f'（public/html/game/liangjian-pingan 下 {nfiles} 个文件按路径排序连接）', 'entrypoint': 'public/html/game/liangjian-pingan/index.html'},
    'feature_inventory': [
        {'id': 'phase1', 'desc': '第一阶段：端掉两处机枪阵地（正面打不穿、可绕侧/手榴弹/骑兵），拔掉第一处后有一波反扑', 'status': 'implemented', 'evidence_ids': ['view-tilt', 'view-chase']},
        {'id': 'phase2', 'desc': '第二阶段：护送意大利炮到炮位，四波侧翼冲击与掷弹筒红圈；炮被打坏则本阶段重来', 'status': 'implemented', 'evidence_ids': ['yidalipao']},
        {'id': 'phase3', 'desc': '第三阶段：操炮（弹道预览、落点提示），轰掉两个机枪堡和城门，最后轰塌城楼', 'status': 'implemented', 'evidence_ids': ['cannon-tilt', 'cannon-fp', 'fire', 'tower']},
        {'id': 'phase4', 'desc': '第四阶段：巷战，街垒、十字街口机枪阵地、小巷援兵、特工队；军火库缴获换枪', 'status': 'implemented', 'evidence_ids': ['street', 'loot']},
        {'id': 'phase5', 'desc': 'Boss 山本一木：点射、手雷、拔刀突进、两次召唤；亮剑拼刀', 'status': 'implemented', 'evidence_ids': ['hq', 'clash', 'won']},
        {'id': 'skills', 'desc': 'J 射击（自动锁定、实体子弹）/ K 手榴弹 / U 亮剑突进 / I 骑兵连', 'status': 'implemented', 'evidence_ids': ['cavalry', 'dash']},
        {'id': 'memes', 'desc': '开炮、意大利炮、天才、骑兵连进攻、打的就是精锐、富裕的仗、勇者胜、一锅粥等大字/弹幕/喊话', 'status': 'implemented', 'evidence_ids': ['fire', 'yidalipao', 'loot', 'cavalry', 'result']},
        {'id': 'views', 'desc': '四视角 + Q/E + 拖动转视角；遮挡淡化与镜头避让', 'status': 'implemented', 'evidence_ids': ['view-tilt', 'view-top', 'view-chase', 'view-fp', 'fade']},
        {'id': 'cross', 'desc': '自动识别/电脑键鼠/手机触屏；手机竖屏旋转；2×2 动作键与摇杆', 'status': 'implemented', 'evidence_ids': ['menu-phone', 'menu-portrait', 'touch-play', 'touch-portrait']},
        {'id': 'options', 'desc': '起始阶段、命数、耐久、演示、视角、画质、音量、弹幕、触屏按键、帧率、全屏；暂停/结算菜单', 'status': 'implemented', 'evidence_ids': ['menu', 'result']},
        {'id': 'publish', 'desc': '接入网站游戏列表、Toy 打包与提交', 'status': 'planned', 'evidence_ids': []},
    ],
    'changes': [{'id': 'new-game', 'feature_ids': ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'skills', 'memes', 'views', 'cross', 'options'], 'before': '无（新作）', 'after': '完整一关五个阶段可从头打到结算', 'user_visible': '本地可玩的新游戏，用于和《枪火集结》原版同章节对比', 'evidence_ids': [m['id'] for m in media if m['kind'] == 'video'] or ['result'], 'verification': 'automated-pass; human-play not-run'}],
    'bugs': [
        {'id': 'fade-opaque', 'found_in': 'v0.1.0 开发中', 'repro': '斜俯视站到房子北侧或城门洞里', 'observed': '挡住主角的房子、门洞不变透明', 'cause': '材质编译为不透明后透明度被写死，运行中切换透明需触发重新编译', 'status': 'fixed', 'fix': '切换透明标志时设置 needsUpdate；城楼废墟纳入淡化', 'before_media_ids': [], 'after_media_ids': ['fade'], 'retest': '房后、门洞斜俯视与俯视复拍可见主角', 'gap': '修复前的原图已被同名文件覆盖，只留有修复后的联系表'},
        {'id': 'cannon-fp-blocked', 'found_in': 'v0.1.0 开发中', 'repro': '操炮时切到第一人称', 'observed': '整屏被炮盾挡成一块绿色', 'cause': '镜头放在炮盾后方', 'status': 'fixed', 'fix': '镜头移到炮盾前沿、炮管右侧', 'before_media_ids': [], 'after_media_ids': ['cannon-fp'], 'retest': '可见炮管、城墙、弹道与落点'},
        {'id': 'man-and-fire', 'found_in': 'v0.1.0 开发中', 'repro': '炮位旁按住 J', 'observed': '上炮的同一下按键直接把炮打出去', 'cause': '按住状态延续到操炮逻辑', 'status': 'fixed', 'fix': '上炮后须先松开 J', 'before_media_ids': [], 'after_media_ids': [], 'retest': 'views.cjs「上炮那一下按键不会直接开炮」通过'},
        {'id': 'too-easy', 'found_in': 'v0.1.0 首版数值', 'repro': '按键脚本自动通关', 'observed': '1 分 55 秒通关，敌人过脆、支援过强、推炮过快', 'cause': '首版数值', 'status': 'fixed', 'fix': '敌人血量、波次、冷却、Boss 血量整体重调', 'before_media_ids': [], 'after_media_ids': [], 'retest': '同一脚本约 2 分 50 秒；真人手感未测'},
    ],
    'media': media, 'historical_media': [], 'qa': qa,
    'untested': untested,
    'readiness': {'overview': 'partial', 'update': 'not_applicable', 'gaps': ['没有真人操作、带声音的实机录像（现有录像为脚本操作、无音轨）', '语音未试听', '手机真机未测', '本版只在本地，未发布，没有可公开的试玩链接']},
}
(REL / 'handoff.json').write_text(json.dumps(handoff, ensure_ascii=False, indent=1), encoding='utf-8')
print('build', build_id, 'commit', commit, 'dirty', dirty, 'files', nfiles, 'media', len(media))
print('qa', passed(views), passed(mobile), passed(options))
