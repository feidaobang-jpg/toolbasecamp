# 组装 media-kit/releases/v0.2/handoff.json：事实部分手写在这里，媒体的 sha256 / 尺寸 / 时长由文件探测。
# 用法：python3 tools/assemble_v02.py   （先跑 build 指纹、复制 qa 与 captures）
import hashlib, json, os, subprocess
from PIL import Image
KIT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'media-kit'))
REL = 'releases/v0.2'
CAP = REL + '/captures/'
Q = os.path.join(KIT, REL, 'qa')
V01 = 'releases/v0.1/handoff.json'
build = json.load(open(os.path.join(Q, 'build.json')))
BUILD_ID = 'v0.2-' + build['fingerprint'].split(':')[1][:12]
desk = json.load(open(os.path.join(Q, 'desktop.json')))
mob = json.load(open(os.path.join(Q, 'mobile.json')))
bots = json.load(open(os.path.join(Q, 'bot-runs.json')))
shots = json.load(open(os.path.join(Q, 'shots.json')))
tl = json.load(open(os.path.join(KIT, CAP, 'armor-demo-timeline.json')))
old = json.load(open(os.path.join(KIT, V01)))

def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''): h.update(c)
    return h.hexdigest()
def probe(p):
    o = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', p]))
    v = next((s for s in o['streams'] if s['codec_type'] == 'video'), None)
    return {'w': v and v['width'], 'h': v and v['height'], 'dur': float(o['format']['duration']), 'fps': v and v['r_frame_rate'], 'audio': any(s['codec_type'] == 'audio' for s in o['streams'])}

OFF = 'offline-render'
OFF_NOTE = '手动时钟：每 1/30 秒推进 2 个逻辑步并渲染一帧，page.screenshot 截图（含 DOM HUD）；无头 Chromium + SwiftShader；操作由 bot 通过真实键盘事件发出（?test=1 读取快照决策，?clean=1 隐藏键位提示，?q=high）；无限命、标准 3 格护甲、演示模式关闭；seed=11；bot 关闭了躲子弹（DODGE=0），所以会比较容易中弹，这是为了把受击与修理都拍进来，不代表正常玩家水平'
AUD_NOTE = '音轨不是实时录音：记录每次音效调用的游戏时间，由游戏自身的 WebAudio 合成函数在 OfflineAudioContext 中离线渲染后混入'

media = []
# ---------- 护甲演示录像（片段由 timeline.json 核对后手写） ----------
SEG = json.load(open(os.path.join(KIT, CAP, 'armor-demo-segments.json')))
p = os.path.join(KIT, CAP, 'armor-demo-16x9.mp4'); info = probe(p)
media.append({'id': 'M01', 'file': CAP + 'armor-demo-16x9.mp4', 'sha256': sha(p), 'kind': 'video', 'version': 'v0.2', 'build_id': BUILD_ID, 'capture_mode': OFF,
              'description': 'v0.2 护甲演示（16:9，1280×720 30fps H.264 CRF20 + AAC 192k；CRF18 版约 25 MB，超过写回本机的 20 MB 上限，所以用 CRF20 单文件）：开局到第一次被击毁并复活，包含营房掉修理包、受击扣甲与闪红、捡修理包、炮弹受击、残甲黑烟、第 3 次中弹被击毁、复活补满。这一局经过的检查点护甲都是满的，所以没有「检查点补满」镜头（见截图 S07）。%s。%s。' % (OFF_NOTE, AUD_NOTE),
              'width': info['w'], 'height': info['h'], 'duration_seconds': round(info['dur'], 3), 'frame_rate': info['fps'], 'audio': 'game', 'visual_review': 'pass', 'audio_review': 'not-run',
              'segments': SEG})
p = os.path.join(KIT, CAP, 'armor-demo-audio.flac')
media.append({'id': 'A01', 'file': CAP + 'armor-demo-audio.flac', 'sha256': sha(p), 'kind': 'audio', 'version': 'v0.2', 'build_id': BUILD_ID, 'capture_mode': OFF,
              'description': 'M01 的无损游戏音轨（48 kHz 立体声 FLAC，与 M01 时间轴完全对齐，0～3 秒为菜单静音段），含 v0.2 新增的受击音与修理音。' + AUD_NOTE + '。', 'width': None, 'height': None,
              'duration_seconds': round(probe(p)['dur'], 3), 'audio': 'game', 'visual_review': 'not-applicable', 'audio_review': 'not-run',
              'segments': [{'in_seconds': s['in_seconds'], 'out_seconds': s['out_seconds'], 'description': s['description'] + '（音效）', 'facts': s['facts'] + ['F-AUDIO']} for s in SEG if s.get('audio_cue')]})

HOOK = '测试捷径：'
SHOT = [
  ('S01', 's-v02-title-armor-option.png', '主菜单新增「耐久：标准 3 格 / 经典一发」，键盘焦点在该项（1280×720）', ['F-ARMOR', 'F-DESKTOP'], None),
  ('S02', 's-v02-hut-kit-drop.png', '键盘扔手雷炸开营房 H0：俘虏跑出，同时弹出黄色修理包（绿色光圈）', ['F-ARMOR', 'F-POW', 'F-DESTRUCT'], '用测试钩子把吉普传送到 H0 南侧并给 3 秒无敌，手雷由键盘 K 发出'),
  ('S03', 's-v02-hit-flash.png', '敌弹命中：吉普闪白、画面四周闪红，HUD 护甲 3 → 2', ['F-ARMOR'], '敌弹由测试钩子 bulletsAt 放在吉普西侧 3 米处，命中判定与受击流程是游戏本身的'),
  ('S04', 's-v02-armor1-smoke.png', '只剩 1 格护甲：HUD 护甲变红，车尾冒深色烟', ['F-ARMOR'], '第 2 发敌弹同样由测试钩子放置'),
  ('S05', 's-v02-kit-ahead.png', '修理包在吉普前方（外观与营房掉落的相同）', ['F-ARMOR'], '修理包由测试钩子 kitAt 放置；拍摄前给了短暂无敌防止被周围敌人打掉，截图那一帧已关闭'),
  ('S06', 's-v02-kit-picked.png', '键盘 W 开过修理包：护甲 1 → 2，提示「修理包：护甲 +1」', ['F-ARMOR'], '同上，短暂无敌在截图那一帧关闭'),
  ('S07', 's-v02-checkpoint-refill.png', '经过检查点「营地外」：护甲自动补满，提示「检查点：营地外 · 护甲已补满」', ['F-ARMOR', 'F-LIVES'], '用测试钩子把护甲设为 1 格、传送到检查点南侧 2.4 米并给无敌，之后键盘 W 开过检查点；截图那一帧关闭无敌'),
  ('S08', 's-v02-title-classic.png', '主菜单切到「耐久：经典一发」', ['F-ARMOR', 'F-DESKTOP'], None),
  ('S09', 's-v02-classic-hud.png', '经典一发开局：HUD 只有 1 格金色并标注「一发」', ['F-ARMOR'], None),
  ('S10', 's-v02-result.png', '标准 3 格通关结算：结算说明里写「无限命 · 标准 3 格护甲 · 受击 4 次 · 修理包 2 个」（seed 41，bot 带躲子弹，0 阵亡）', ['F-ARMOR', 'F-RESULT'], 'qa/botrun.js 手动时钟逻辑推进，只在结算时渲染一帧截图（?q=high）'),
  ('S11', 's-v02-m-land-play.png', '手机横屏（844×390，DPR3）：HUD 命数卡片下的 3 格护甲，不压右上角按钮', ['F-ARMOR', 'F-MOBILE'], 'qa/mobile.js 设备模拟，?q=low'),
  ('S12', 's-v02-m-port-play.png', '手机竖屏开始后自动旋转为横屏布局，护甲卡片完整可见', ['F-ARMOR', 'F-MOBILE'], 'qa/mobile.js 设备模拟，?q=low'),
]
for mid, f, d, facts, hook in SHOT:
    p = os.path.join(KIT, CAP, f); w, h = Image.open(p).size
    media.append({'id': mid, 'file': CAP + f, 'sha256': sha(p), 'kind': 'screenshot', 'version': 'v0.2', 'build_id': BUILD_ID, 'capture_mode': OFF,
                  'description': d + '。手动时钟渲染后 page.screenshot（qa/shots_v02.js 等）' + ('；' + HOOK + hook if hook else '；全程键盘操作'), 'width': w, 'height': h, 'duration_seconds': None,
                  'audio': 'none', 'visual_review': 'pass', 'audio_review': 'not-applicable', 'segments': [], 'facts': facts})

# ---------- 历史证据（v0.1，未改动的功能与改动前对照） ----------
BEFORE = {
  'S01': '改动前对照：v0.1 主菜单没有「耐久」选项',
  'S07': '改动前对照：v0.1 吉普中一发就被击毁（车上俘虏散落）',
  'S08': '改动前对照：v0.1 复活画面，HUD 只有命数没有护甲格',
  'M01-02': '改动前对照：v0.1 录像局源 34.0～37.6 秒，吉普被一发击毁后在检查点复活',
}
historical = []
for m in old['media']:
    reason = BEFORE.get(m['id'], '未改动功能的 v0.1 证据；注意 v0.1 画面里的 HUD 还没有护甲格，玩法规则是中一发即毁')
    historical.append({'id': 'v01-' + m['id'], 'handoff': V01, 'media_id': m['id'], 'reason': reason})

def ev(feature):
    return [m['id'] for m in media if any(feature in s['facts'] for s in m.get('segments', [])) or feature in m.get('facts', [])]
old_ev = {f['id']: f['evidence_ids'] for f in old['feature_inventory']}
FEAT = [('F-DRIVE', '8 向驾驶、转角滑移、碾压步兵、碰撞'), ('F-MG', '机枪固定朝北，按住连发'), ('F-BOMB', '手雷 / 火箭 / 强化火箭，朝车头方向发射'),
  ('F-POW', '炸营房救俘虏、接上车、直升机坪送达；阵亡后俘虏散落可再接'), ('F-UPGRADE', '闪光俘虏升级武器（4 名，其中一名关在守桥坦克里）'),
  ('F-ENEMY', '步兵、军官、机枪巢、地面 / 崖顶炮台、坦克、炮艇'), ('F-DESTRUCT', '营房、大门、沙袋、木箱、油桶连爆、火箭可炸岩崖'), ('F-STAR', '林角隐藏星'),
  ('F-LIVES', '无限命 + 9 个检查点 + 复活保护（复活与检查点补满护甲）；经典 3 命可选'),
  ('F-ARMOR', 'v0.2：3 格护甲、受击闪白 / 四周红边 / 1.2 秒闪烁无敌、残甲黑烟；营房掉修理包（7 个，满甲时留在原地）；检查点与复活补满；可选「经典一发」（修理包改 +300 分）'),
  ('F-DEMO', '演示模式（无敌），默认关闭，有标识，不计最高分'),
  ('F-BOSS', '4 辆蓝色坦克：依次开进、追踪、三连发、两段受伤只吃直接命中'), ('F-RESULT', '救援直升机降落、结算（含耐久模式、受击次数、修理包数）、最高分'),
  ('F-CAMERA', 'C 键循环斜俯视 / 俯视 / 近景斜视，移动与射击按相机水平轴映射'), ('F-DESKTOP', '纯键盘菜单与游玩，键位提示'),
  ('F-MOBILE', '左摇杆 + J/K/C 多点触控，竖屏自动旋转与触控逆变换'), ('F-DISPLAY', '铺满视口、安全区、独立全屏按钮、画质自动 / 高 / 流畅、帧率显示'),
  ('F-AUDIO', '程序化音效与原创 BGM，音量保存；v0.2 新增受击、修理音效'), ('F-LIST', '各界面「返回游戏列表」普通链接')]
feature_inventory = []
for f, d in FEAT:
    ids = ev(f) + ['v01-' + x for x in old_ev.get(f, [])]
    feature_inventory.append({'id': f, 'description': d, 'status': 'implemented', 'evidence_ids': ids})
for m in media: m.pop('facts', None)
for s in media[0]['segments'] + media[1]['segments']: s.pop('audio_cue', None)

bot = {r['label']: r for r in bots['runs']}
changes = [
  {'id': 'C-101', 'feature_ids': ['F-ARMOR', 'F-LIVES'], 'before': 'v0.1：吉普中一发子弹或炮弹就被击毁（与原作一致）', 'after': '默认 3 格护甲：中弹扣 1 格并有约 1.2 秒闪烁无敌，第 3 次才被击毁；检查点与复活时补满',
   'user_visible': '新手不会一碰就炸；HUD 一眼能看到还剩几格，受击时车身闪白、四周闪红，只剩 1 格时车尾冒黑烟', 'evidence_ids': ['M01', 'S03', 'S04', 'S07', 'v01-S07', 'v01-M01-02'],
   'verification': 'pass（desktop.js 新增 18 项全过：扣甲、无敌期不扣、第 3 次才毁、复活补满、检查点补满等；录像 M01 是真实一局）'},
  {'id': 'C-102', 'feature_ids': ['F-ARMOR', 'F-POW', 'F-DESTRUCT'], 'before': 'v0.1：营房炸开只放出俘虏', 'after': '每个营房炸开时同时弹出一个修理包（全关 7 个）；护甲不满时开过去 +1 格，满甲时留在原地',
   'user_visible': '炸营房多了一层回报，受伤后知道去哪里补', 'evidence_ids': ['M01', 'S02', 'S05', 'S06'], 'verification': 'pass（desktop.js：H0 掉包、满甲不捡、捡包 +1；bot 在 4 个种子上每局都掉落 7 个）'},
  {'id': 'C-103', 'feature_ids': ['F-ARMOR', 'F-DESKTOP', 'F-MOBILE'], 'before': 'v0.1：主菜单只有「命数」等选项，没有耐久选择', 'after': '主菜单新增「耐久：标准 3 格 / 经典一发」（键盘 ←/→ 或触屏点击切换，保存在本地）；经典一发保留原作一发即毁，HUD 显示金色 1 格「一发」',
   'user_visible': '想要原作紧张感的玩家可以一键切回', 'evidence_ids': ['S01', 'S08', 'S09', 'S11', 'v01-S01'], 'verification': 'pass（desktop.js 经典一发三项、mobile.js 触屏切换）'},
  {'id': 'C-104', 'feature_ids': ['F-RESULT', 'F-ARMOR'], 'before': 'v0.1：结算说明只写命数模式', 'after': '结算说明写上命数与耐久模式；标准模式另写受击次数和捡到的修理包数', 'user_visible': '打完能看到这局被打中了几次', 'evidence_ids': ['S10'], 'verification': 'pass（desktop.js 经典模式结算文字检查；S10 为标准模式结算截图）'},
  {'id': 'C-105', 'feature_ids': ['F-ARMOR', 'F-LIVES'], 'before': 'v0.1：同一个会躲子弹的 bot 在 seed 11 / 23 / 67 阵亡 5 / 4 / 1 次', 'after': '标准 3 格：同样的 bot 在 seed 11 / 23 / 67 / 41 都 0 阵亡通关（受击 3 / 2 / 2 / 4 次）；不躲子弹时 seed 11 标准模式阵亡 %d 次、经典一发 %d 次' % (bot['nododge-std11']['deaths'], bot['nododge-classic11']['deaths']),
   'user_visible': '默认难度明显降低；经典一发保留原作压力', 'evidence_ids': [], 'verification': 'partial：只有 bot 数据（qa/bot-runs.json），没有真人试玩，不能当作难度结论'}
]
bugs = [
  {'id': 'BUG-007', 'found_in': 'v0.2（开发中）', 'repro_steps': '用手动时钟逐帧渲染，在吉普中弹后的几帧截图', 'observed': '画面四周的受击红边没有出现', 'joke_angle': '红边闪得太快，录像机还没按下快门就没了', 'cause': '红边用 CSS 动画按真实时间播放 0.45 秒，而离线渲染每帧要约 1 秒', 'status': 'fixed', 'fix': '改由游戏时间驱动透明度（每个逻辑步衰减），实时游玩与逐帧录制一致', 'before_media_ids': [], 'before_note': '修复前的检查截图后来被同名文件覆盖，没有留存', 'after_media_ids': ['S03', 'M01'], 'retest': 'desktop.js「HUD 护甲同步减为 2 格，画面四周闪红」「红边约 0.45 秒后褪去」通过；S03 可见红边'},
  {'id': 'BUG-008', 'found_in': 'v0.2（开发中）', 'repro_steps': '中弹后立即截图', 'observed': '受击闪白的那一帧吉普不见了', 'joke_angle': '', 'cause': '受击后的无敌闪烁会隐藏车身，和 0.22 秒的闪白重叠', 'status': 'fixed', 'fix': '闪白期间不做无敌闪烁', 'before_media_ids': [], 'before_note': '修复前截图被覆盖，没有留存', 'after_media_ids': ['S03'], 'retest': 'S03 中吉普整体闪白可见'},
  {'id': 'BUG-009', 'found_in': 'v0.2（开发中，仅测试钩子）', 'repro_steps': 'desktop.js 先调用测试钩子 kill() 清场，再去炸林角', 'observed': '隐藏星直接消失，「炸出隐藏星」检查失败', 'joke_angle': '清场太彻底，连彩蛋都一起清了', 'cause': '测试钩子 kill() 把隐藏星当作普通实体处理', 'status': 'fixed', 'fix': 'kill() 默认跳过隐藏星（只影响 ?test=1 的测试钩子，玩家版本不受影响）', 'before_media_ids': [], 'after_media_ids': [], 'retest': 'desktop.js 80/80'}
]
qa = [
  {'area': '桌面纯键盘', 'device': 'Playwright %s Chromium 无头，SwiftShader 软件渲染，1280×720，?q=low' % desk['env'].split()[1], 'method': 'qa/desktop.js：菜单流程用实时时钟，玩法检查用手动时钟（按键是真实键盘事件；敌弹和修理包部分由测试钩子放置）', 'result': '%d/%d 通过（v0.1 原有 62 项 + v0.2 新增 18 项）' % (desk['pass'], desk['total']), 'evidence': [REL + '/qa/desktop.json'], 'untested': ['外接手柄']},
  {'area': '手机触控', 'device': 'Chromium 设备模拟（isMobile/hasTouch，DPR3，Pixel 8 UA），844×390 与 390×844', 'method': 'qa/mobile.js：CDP 多点触摸；新增触屏切换「耐久」、横屏 HUD 护甲不压按钮、竖屏旋转后护甲卡片完整可见', 'result': '%d/%d 通过' % (mob['pass'], mob['total']), 'evidence': [REL + '/qa/mobile.json', 'S11', 'S12'], 'untested': ['真机触控']},
  {'area': '整关可通关与难度对比', 'device': '无头 Chromium，1280×720', 'method': 'qa/botrun.js：bot 用真实键盘事件打完整关（手动时钟）；DODGE=0 关闭躲子弹，ARMOR=classic 切到经典一发', 'result': '全部 %d 局通关。会躲子弹 + 标准 3 格：seed 11 / 23 / 67 / 41 阵亡 0 / 0 / 0 / 0；不躲子弹：seed 11 标准阵亡 %d、经典一发阵亡 %d；会躲子弹 + 经典一发 seed 11 阵亡 %d' % (len(bots['runs']), bot['nododge-std11']['deaths'], bot['nododge-classic11']['deaths'], bot['classic11']['deaths']), 'evidence': [REL + '/qa/bot-runs.json'], 'untested': ['真人试玩']},
  {'area': '画面', 'device': '手动时钟渲染截图 + 护甲演示录像', 'method': '人工逐张查看 12 张截图；录像抽看关键事件帧', 'result': 'pass：修理包、HUD 护甲格、红边、闪白、残甲烟都清楚；受击截图里的敌弹是测试钩子放置的，已在描述中标注', 'evidence': ['S02', 'S03', 'S04', 'M01'], 'untested': ['真实 GPU 上的表现']},
  {'area': '性能', 'device': '—', 'method': '本版未重新测帧', 'result': 'not-run：只增加最多 7 个小修理包模型和 HUD 元素，没有新数据，沿用 v0.1 的软件渲染结果作参考', 'evidence': [], 'untested': ['真实显卡 / 真机帧率']},
  {'area': '音频', 'device': 'OfflineAudioContext（无头 Chromium）', 'method': '离线渲染音轨，确认受击 / 修理音出现在对应事件时间', 'result': '受击、修理音效能触发并出现在离线音轨里', 'evidence': ['A01'], 'untested': ['人工听审']},
  {'area': '其他', 'device': '无头 Chromium', 'method': 'qa/filetest.js（file:// 直接打开）', 'result': 'file:// 可运行', 'evidence': [], 'untested': []}
]
readiness = {'overview': 'partial', 'update': 'partial', 'gaps': [
  '实机画面是离线逐帧渲染（无 GPU 环境），不是实时录屏；音轨按事件离线渲染，不是实时录音',
  '护甲演示录像里 bot 关闭了躲子弹，所以中弹频率高于正常玩家',
  '多张截图用了测试钩子（放置敌弹 / 修理包、设护甲、传送、短暂无敌），每张都在描述里写明',
  '改动前对照只有 v0.1 原片（一发即毁、无耐久选项），没有重新拍「改动前」',
  'overview 模式的完整一局录像仍是 v0.1 的（HUD 没有护甲格），v0.2 没有重录完整一局',
  '新音效没有人工听审；没有真人试玩；性能未重新测']}
manifest = {
  'schema_version': 1, 'game_id': 'jackal-stage1-3d', 'version': 'v0.2', 'base_version': 'v0.1', 'created_at': '2026-10-02T18:30:00+08:00',
  'build': {'id': BUILD_ID, 'commit': None, 'dirty': False, 'fingerprint': build['fingerprint'], 'entrypoint': 'public/html/game/jackal-stage1-3d/index.html',
            'fingerprint_method': build['method'], 'files_manifest': REL + '/qa/build.json', 'git': '无 Git 仓库', 'base_build': old['build']['id'],
            'source': 'game-projects/jackal-stage1-3d/src（esbuild 0.28.2 打包为 js/game.min.js）',
            'hosted_copy': {'url': 'https://claude.ai/artifact/CkhWeEfGUhWgtxd1xAAwXF', 'note': '同一份 game.min.js 内联进单文件 HTML，去掉「返回游戏列表」入口；私有；不属于本构建指纹'}},
  'feature_inventory': feature_inventory, 'changes': changes, 'bugs': bugs, 'media': media, 'historical_media': historical, 'qa': qa, 'readiness': readiness
}
# 写回本机时传输通道会给 PNG/MP4/FLAC 附加 C2PA：media 的 sha256 用本机副本（已复制回云端），原值记在 cloud_original_sha256
co_path = os.path.join(Q, 'cloud-originals.json')
if os.path.exists(co_path):
    co = json.load(open(co_path))['files']
    for m in media:
        if m['file'] in co and co[m['file']] != m['sha256']: m['cloud_original_sha256'] = co[m['file']]
if build.get('device_fingerprint'):
    manifest['build']['device_fingerprint'] = build['device_fingerprint']
    manifest['build']['fingerprint_note'] = 'fingerprint 是云端实测构建（所有录像、截图和验收都来自它）。本机副本只有 cover.jpg 因 v0.1 写回时附加 C2PA 而字节不同（像素一致），device_fingerprint 是本机副本的指纹。media 的 sha256 是本机副本的值，cloud_original_sha256 是写回前的原值；已逐个核对图片像素与音视频流哈希一致'
json.dump(manifest, open(os.path.join(KIT, REL, 'handoff.json'), 'w'), ensure_ascii=False, indent=1)
print('handoff written:', len(media), 'media +', len(historical), 'historical; build', BUILD_ID)
print('features without current evidence:', [f['id'] for f in feature_inventory if not any(not x.startswith('v01-') for x in f['evidence_ids'])])
