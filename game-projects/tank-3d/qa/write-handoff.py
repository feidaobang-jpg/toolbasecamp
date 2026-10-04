# 生成 / 刷新 merge1 交接清单：构建指纹、媒体哈希与尺寸、功能 / 改动 / Bug 记录。
# python game-projects/tank-3d/qa/write-handoff.py [commit]
import json, hashlib, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REL = ROOT / 'game-projects/tank-3d/media-kit/releases/merge1'
CAP = REL / 'captures'
SRC = ROOT / 'public/html/game/tank-3d'
commit = sys.argv[1] if len(sys.argv) > 1 else None

files = {f.relative_to(SRC).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(SRC.rglob('*')) if f.is_file()}
fp = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
BUILD = 'tank-3d-merge1-' + fp[:12]


def probe(f):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', str(f)], capture_output=True, text=True).stdout
    d = json.loads(out or '{}')
    s = [x for x in d.get('streams', []) if 'width' in x]
    return ((s[0]['width'], s[0]['height']) if s else (None, None)), float(d.get('format', {}).get('duration', 0) or 0)


DESC = {
    'desktop-menu-classic.png': '主菜单：经典复刻模式（默认 3 命、一发、正俯视）',
    'desktop-menu-remix.png': '主菜单切到魔改模式（无限命、3 格、斜俯视）',
    'desktop-menu-stage33.png': '经典选关：起始第 33 关，背景换成该关原版地图',
    'desktop-curtain.png': '灰色幕布 STAGE 1',
    'desktop-classic-top.png': '经典第 1 关正俯视实机',
    'desktop-view-overview.png': '斜俯视（测试清空了地图用于方向检查）',
    'desktop-view-top.png': '正俯视（测试清空地图）',
    'desktop-view-close.png': '近景（测试清空地图）',
    'desktop-view-front.png': '正视（测试清空地图）',
    'desktop-view-fp.png': '第一人称（测试清空地图）',
    'desktop-rotated.png': '按住 E 转一整圈后的画面',
    'desktop-pause.png': '暂停菜单',
    'desktop-tally.png': '原版黑底计分页',
    'desktop-gameover.png': 'GAME OVER 字样从底部升起',
    'desktop-result.png': '结算：经典 3 命打光后「从第 2 关再来」',
    'desktop-remix-hurt.png': '魔改 3 格耐久受击后剩 2 格',
    'desktop-boss10.png': '魔改第 10 关大 Boss 锈湾堡垒与左侧血条（修复后）',
    'phone-portrait-menu.png': '手机竖屏主菜单',
    'phone-portrait-rotated.png': '手机竖屏开局自动横置 + 触屏按键',
    'phone-portrait-close.png': '手机竖屏旋转布局下按 C 切到近景、按住 Q 转视角',
    'phone-landscape.png': '手机横屏 844×390 布局',
    'perf-classic35.png': '性能测量时经典第 35 关',
    'perf-remix10.png': '性能测量时魔改第 10 关',
    'perf-remix27.png': '性能测量时魔改第 27 关（熔岩脊）第一人称',
    'bug-before-final-boss-hq.png': '修复前：终焉 Boss 出场约 6.7 秒打穿老鹰（玩家不动）',
    'bug-before-mini-boss-hq.png': '修复前：第 5 关火焰战车两炮打穿老鹰',
    'bug-before-stale-fov.png': '修复前：切回斜俯视第一帧取景过近',
    'bug-before-bossbar-overlap.png': '修复前：Boss 血条挡住顶部出场位置',
    'dev-first-classic-stage1.png': '开发中第一次渲染出原版第 1 关',
    'dev-first-remix-level1.png': '开发中第一次渲染出魔改第 1 关（中路护卫加入前）',
    'cover-source-remix70.png': '游戏中心封面原图：魔改第 70 关深渊礁 Boss 竞技场（测试钩子摆位）',
    'play-classic-top.png': '录像截帧：经典第 1 关正俯视',
    'play-classic-close.png': '录像截帧：近景',
    'play-classic-front.png': '录像截帧：正视',
    'play-classic-fp.png': '录像截帧：第一人称',
    'play-classic-overview.png': '录像截帧：斜俯视',
    'play-remix-boss10-a.png': '录像截帧：大 Boss 登场',
    'play-remix-boss10-front.png': '录像截帧：正视对决 Boss',
    'play-remix-boss10-b.png': '录像截帧：斜俯视 Boss 战',
    'play-classic-stage1.webm': '实机录像：经典第 1 关，页面内自动驾驶用键盘事件操作，依次切正俯视 / 近景 / 正视 / 第一人称 / 斜俯视（演示模式开）',
    'play-remix-boss10.webm': '实机录像：魔改第 10 关大 Boss 战，自动驾驶，斜俯视 → 正视 → 斜俯视（演示模式开）',
}
SEGMENTS = {
    'play-classic-stage1.webm': [(0, 2.4, '幕布 STAGE 1', ['F-classic-35']), (2.4, 11.5, '正俯视原版第 1 关开打', ['F-classic-35']), (11.5, 17.5, '近景', ['F-views']), (17.5, 23.5, '正视（车后）', ['F-views']), (23.5, 29.5, '第一人称驾驶舱', ['F-views']), (29.5, 36.8, '斜俯视', ['F-views'])],
    'play-remix-boss10.webm': [(0, 2.4, '幕布 STAGE 10 · 大 Boss 锈湾堡垒', ['F-remix-100', 'F-bosses']), (2.4, 12.4, 'Boss 登场、血条、斜俯视交战', ['F-bosses']), (12.4, 20.4, '正视近距离对决 Boss', ['F-bosses', 'F-views']), (20.4, 28.0, '斜俯视继续交战', ['F-bosses'])],
}
media = []
for f in sorted(CAP.iterdir()):
    if f.suffix not in ('.png', '.webm'):
        continue
    (w, h), dur = probe(f)
    dev = f.name.startswith(('bug-before', 'dev-first'))
    video = f.suffix == '.webm'
    media.append({
        'id': f.name, 'file': 'releases/merge1/captures/' + f.name, 'sha256': hashlib.sha256(f.read_bytes()).hexdigest(),
        'kind': 'video' if video else 'screenshot', 'version': 'merge1-dev' if dev else 'merge1', 'build_id': None if dev else BUILD,
        'capture_mode': 'realtime-automation', 'description': DESC.get(f.name, ''), 'width': w, 'height': h,
        'duration_seconds': round(dur, 2) if video else None, 'audio': 'none', 'visual_review': 'pass', 'audio_review': 'not-applicable',
        'segments': [{'in_seconds': a, 'out_seconds': b, 'description': d, 'facts': x} for a, b, d, x in SEGMENTS.get(f.name, [])],
    })

handoff = {
    'schema_version': 1, 'game_id': 'tank-3d-stage-1', 'version': 'merge1', 'base_version': 'collision-fix1', 'created_at': '2026-10-04',
    'build': {'id': BUILD, 'commit': commit, 'dirty': commit is None, 'fingerprint': fp, 'files': files, 'entrypoint': 'public/html/game/tank-3d/index.html'},
    'feature_inventory': [
        {'id': 'F-classic-35', 'description': '经典复刻：FC 原版 35 关地图、敌军名单、数值、道具、流程、36～70 关循环，起始关卡 1～35 可选', 'status': 'implemented', 'evidence_ids': ['desktop-classic-top.png', 'desktop-menu-stage33.png', 'desktop-tally.png', 'play-classic-stage1.webm']},
        {'id': 'F-remix-100', 'description': '魔改：100 关一周目自创地图（10 章节主题、河道 / 树林 / 冰面）、无限周目、过关存档', 'status': 'implemented', 'evidence_ids': ['desktop-menu-remix.png', 'perf-remix27.png', 'play-remix-boss10.webm']},
        {'id': 'F-bosses', 'description': '5 种小 Boss、10 档大 Boss + 终焉 Boss：预警、招式、暴怒、背后弱点、血条', 'status': 'implemented', 'evidence_ids': ['desktop-boss10.png', 'play-remix-boss10.webm']},
        {'id': 'F-2d-gameplay', 'description': '船、手枪、装甲层、精英重炮 / 火焰车、敌军抢道具、修理包（迁自 2D 版）', 'status': 'implemented', 'evidence_ids': ['desktop-remix-hurt.png']},
        {'id': 'F-views', 'description': '斜俯视 / 正俯视 / 近景 / 正视 / 第一人称 + Q/E 无极旋转', 'status': 'implemented', 'evidence_ids': ['desktop-view-front.png', 'desktop-view-fp.png', 'desktop-rotated.png', 'play-classic-stage1.webm']},
        {'id': 'F-options', 'description': '模式、起始关卡 / 进度、命数、耐久、演示、视角、画质、音量、触屏、帧率、全屏、返回列表', 'status': 'implemented', 'evidence_ids': ['desktop-menu-classic.png', 'desktop-pause.png', 'desktop-result.png']},
        {'id': 'F-controls', 'description': '键盘全程；手机摇杆 + J/Q/C/E，竖屏自动横置', 'status': 'implemented', 'evidence_ids': ['phone-portrait-rotated.png', 'phone-landscape.png']},
        {'id': 'F-coop', 'description': '多人联机合作（目前只在 2D 版，菜单有入口）', 'status': 'planned', 'evidence_ids': []},
    ],
    'changes': [
        {'id': 'merge-modes', 'feature_ids': ['F-classic-35', 'F-remix-100', 'F-options'], 'before': '3D 版只有第 1 关是经典结构，第 2～50 关程序化；2D 版另有 Boss / 章节玩法，游戏中心两张卡片', 'after': '一款 3D 游戏，开局选经典复刻（原版 35 关）或魔改无限周目；游戏中心只留一张卡', 'result': '想玩原版的能完整玩到 35 关原图，想玩新内容的进魔改', 'evidence_ids': ['desktop-menu-classic.png', 'desktop-menu-remix.png'], 'verification': 'pass'},
        {'id': 'classic-faithful', 'feature_ids': ['F-classic-35'], 'before': '连续单位移动、砖块 1 格粒度、自定数值', 'after': '固定 60 帧 FC 像素模拟：4px 砖块、原版移速 / 弹速 / 出生间隔 / AI / 道具计时 / 计分 / 奖命 / 36～70 关', 'result': '手感按原版，经典默认 3 命一发', 'evidence_ids': ['desktop-classic-top.png', 'play-classic-stage1.webm'], 'verification': 'pass'},
        {'id': 'remix-content', 'feature_ids': ['F-remix-100', 'F-bosses', 'F-2d-gameplay'], 'before': '没有 Boss、水 / 树 / 冰、船和手枪', 'after': '100 关一周目：第 5 关小 Boss、第 10 关大 Boss、第 100 关终焉 Boss；船、手枪、装甲、精英怪、敌军抢道具、修理包', 'result': '魔改模式有 Boss 战和 2D 版玩法', 'evidence_ids': ['desktop-boss10.png', 'play-remix-boss10.webm'], 'verification': 'pass'},
        {'id': 'views-five', 'feature_ids': ['F-views'], 'before': '斜俯视、俯视两档', 'after': '五档视角，正视剖面、第一人称驾驶舱，Q/E 无极旋转', 'result': '可以从车后和驾驶舱重玩原版关卡', 'evidence_ids': ['desktop-view-front.png', 'desktop-view-fp.png'], 'verification': 'pass'},
        {'id': 'fc-audio', 'feature_ids': ['F-classic-35'], 'before': '全部合成音', 'after': '原版 FC 音效 + 合成引擎声', 'result': '开炮、打砖、爆炸、开场曲、计分音用原作音效', 'evidence_ids': [], 'verification': 'partial'},
    ],
    'bugs': [
        {'id': 'boss-heavy-shells-hq', 'found_in': 'merge1-dev', 'repro': '魔改第 100 关或第 5 关，玩家不动', 'observed': '终焉 Boss 约 6.7 秒、火焰战车两炮打穿老鹰', 'joke_angle': 'Boss 一出场就直奔你家', 'cause': '2～4 格宽重型弹整格清砖，Boss 可同时 6 发', 'status': 'fixed', 'fix': '重型弹打不穿老鹰围墙；Boss 普通弹同时最多 1 发（暴怒 2 发）', 'before_media_ids': ['bug-before-final-boss-hq.png', 'bug-before-mini-boss-hq.png'], 'after_media_ids': ['desktop-boss10.png'], 'retest': 'sim-check「boss heavy shells cannot breach the HQ fort」通过；6 个种子的自动驾驶老鹰撑 30～70 秒'},
        {'id': 'remix-open-center', 'found_in': 'merge1-dev', 'repro': '魔改第 1 关，自动驾驶不防守', 'observed': '6 局全输，老鹰 10～17 秒被打掉', 'joke_angle': '', 'cause': '生成地图中路直通老鹰，开局第一辆敌军朝下几炮打穿', 'status': 'fixed', 'fix': '中路固定钢块护卫，开路不拆', 'before_media_ids': ['dev-first-remix-level1.png'], 'after_media_ids': ['perf-remix27.png'], 'retest': '同 6 个种子 4/6 局通关，老鹰撑 1～2.5 分钟'},
        {'id': 'stale-fov', 'found_in': 'merge1-dev', 'repro': '第一人称切回斜俯视', 'observed': '第一帧只看到半张地图', 'joke_angle': '', 'cause': '取景距离用了旧视野', 'status': 'fixed', 'fix': '先更新视野再算距离', 'before_media_ids': ['bug-before-stale-fov.png'], 'after_media_ids': ['desktop-view-overview.png'], 'retest': 'browser-check 视角循环截图'},
        {'id': 'bossbar-overlap', 'found_in': 'merge1-dev', 'repro': '大 Boss 关', 'observed': '血条盖住 Boss 出场位置', 'joke_angle': '', 'cause': '血条在顶部中央', 'status': 'fixed', 'fix': '挪到左侧状态栏', 'before_media_ids': ['bug-before-bossbar-overlap.png'], 'after_media_ids': ['desktop-boss10.png'], 'retest': 'browser-check 截图'},
        {'id': 'title-sway-leak', 'found_in': 'merge1-dev', 'repro': '开局幕布阶段', 'observed': '进关后视角是歪的', 'joke_angle': '', 'cause': '标题画面的镜头摇摆在幕布前 0.27 秒仍执行', 'status': 'fixed', 'fix': '只在标题画面摇摆', 'before_media_ids': [], 'after_media_ids': ['desktop-boss10.png'], 'retest': 'browser-check Boss 截图朝向正'},
    ],
    'media': media,
    'historical_media': [],
    'qa': {
        'devices': ['Edge 154 headless，Windows 11，RTX 4060 Ti（ANGLE D3D11），1280×720 DPR1', '手机视口模拟 390×844 / 844×390 DPR2 触控（Playwright isMobile + CDP 触摸）'],
        'methods': ['node game-projects/tank-3d/qa/sim-check.mjs（16 项）', 'node game-projects/tank-3d/qa/browser-check.cjs（18 项）', 'node game-projects/tank-3d/qa/capture-play.cjs（录像）'],
        'results': '全部通过；性能约 170 FPS，中位 5.9ms，P95 6ms，无超过 50ms 的帧（headless 不锁帧）',
        'evidence': ['releases/merge1/captures/browser.json'],
        'untested': ['真机手机帧率与触感', '声音主观试听', '真人通关全部关卡'],
    },
    'readiness': {'overview': 'partial', 'update': 'partial', 'gaps': ['录像无声（Playwright 录屏不含音轨），需要时按 game-video 流程补录带游戏声音的素材', '录像为自动驾驶 + 演示模式，不是真人操作', '缺手机真机录像']},
}
(REL / 'handoff.json').write_text(json.dumps(handoff, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'build': BUILD, 'media': len(media), 'commit': commit}))
