# 组装 media-kit/releases/v0.1/handoff.json：事实部分手写在这里，媒体的 sha256 / 尺寸 / 时长由文件探测。
import hashlib, json, os, subprocess
from PIL import Image
KIT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'media-kit'))
REL = 'releases/v0.1'
CAP = REL + '/captures/'
Q = os.path.join(KIT, REL, 'qa')
build = json.load(open(os.path.join(Q, 'build.json')))
BUILD_ID = 'v0.1-' + build['fingerprint'].split(':')[1][:12]
tl = json.load(open(os.path.join(KIT, CAP, 'full-run-timeline.json')))
desk = json.load(open(os.path.join(Q, 'desktop.json')))
mob = json.load(open(os.path.join(Q, 'mobile.json')))
perf = json.load(open(os.path.join(Q, 'perf.json')))
bots = json.load(open(os.path.join(Q, 'bot-runs.json')))
scan = json.load(open(os.path.join(Q, 'full-run-frame-scan.json')))

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
OFF_NOTE = '手动时钟：每 1/30 秒推进 2 个逻辑步并渲染一帧，page.screenshot 截图（含 DOM HUD）；无头 Chromium + SwiftShader；操作由 bot 通过真实键盘事件发出（?test=1 读取快照决策，?clean=1 隐藏键位提示，?q=high）；无限命、演示模式关闭；seed=41'
AUD_NOTE = '音轨不是实时录音：记录每次音效调用的游戏时间，由游戏自身的 WebAudio 合成函数在 OfflineAudioContext 中离线渲染后混入，事件与画面逐帧对齐（抽查炸 H0、炸大门、阵亡、通关四处，电平峰值都在事件后 0.05～0.1 秒内）'

# ---------- 全程录像的全局分段（视频时间，秒） ----------
G_SEG = [
  (0.0, 3.0, '主菜单：标题镜头掠过海滩，键盘 Enter 开始', ['F-DESKTOP']),
  (3.0, 4.7, '登陆艇开场，「第一关 · 海滩登陆」横幅', ['F-DRIVE']),
  (4.7, 8.6, '机枪向北连发，手雷炸毁营房 H0，放出 2 名俘虏', ['F-MG', 'F-BOMB', 'F-POW', 'F-DESTRUCT']),
  (11.5, 17.6, '沿海滩推进、击毙步兵，炸开 H1，接到闪光俘虏后武器升级为火箭', ['F-ENEMY', 'F-UPGRADE', 'F-POW']),
  (19.8, 21.0, '火箭摧毁机枪巢', ['F-BOMB', 'F-ENEMY']),
  (23.4, 29.6, '炸开营地大门，依次记录检查点「营地外」「营地内」', ['F-DESTRUCT', 'F-LIVES']),
  (29.4, 31.2, '摧毁营地炮台；营房 B1 与油桶连环爆炸', ['F-DESTRUCT', 'F-ENEMY']),
  (34.0, 37.6, '吉普被击毁，车上 8 名俘虏散落；在「营地内」检查点闪烁复活', ['F-LIVES', 'F-POW']),
  (43.3, 45.0, '摧毁机枪巢，炸开 B2，闪光俘虏再次升级武器', ['F-UPGRADE', 'F-DESTRUCT']),
  (50.0, 58.6, '离开营地、过桥（检查点「南岸」「北岸」），河上有炮艇', ['F-ENEMY', 'F-LIVES']),
  (59.4, 60.6, '北岸油桶连爆', ['F-DESTRUCT']),
  (68.8, 77.0, '火箭逐块炸塌岩崖', ['F-DESTRUCT', 'F-BOMB']),
  (102.4, 107.2, '阵亡后在北岸复活；手雷击毁守桥坦克，坦克里的闪光俘虏升级武器', ['F-LIVES', 'F-UPGRADE', 'F-ENEMY']),
  (114.8, 118.0, '检查点「崖顶」；炸开 H2，击毙军官', ['F-POW', 'F-ENEMY']),
  (127.6, 129.6, '炸出林角隐藏星并拾取（+3000 分、护盾）', ['F-STAR']),
  (130.8, 138.4, '进入丛林：火箭清理步兵与军官，炸开 H3', ['F-ENEMY', 'F-POW']),
  (146.0, 149.0, '被坦克炮弹击毁，在丛林检查点复活', ['F-LIVES']),
  (155.4, 159.2, '击毁巡逻坦克，油桶连爆', ['F-ENEMY', 'F-DESTRUCT']),
  (160.2, 170.0, '最后阵地：炸开 H4、闪光俘虏升级，火箭击毁两辆坦克', ['F-POW', 'F-UPGRADE', 'F-ENEMY']),
  (173.2, 181.2, '直升机坪：19 名俘虏逐个跑上直升机（每名 +500）', ['F-POW']),
  (182.0, 188.4, '检查点「场地入口」，路障升起，BOSS 横幅与警报', ['F-BOSS']),
  (188.4, 204.7, 'Boss：蓝色坦克依次开进；火箭击毁第一辆；吉普阵亡并在场地内复活；其余三辆被击毁', ['F-BOSS', 'F-LIVES']),
  (204.6, 209.3, '「第一关完成！」横幅，救援直升机降落', ['F-RESULT']),
  (209.3, 213.36, '结算：19/19 送达、救援奖励 38000、总分 69600', ['F-RESULT'])
]
parts = sorted(f for f in os.listdir(os.path.join(KIT, CAP)) if f.startswith('full-run-16x9.part'))
media = []
t0 = 0.0
for k, f in enumerate(parts):
    p = os.path.join(KIT, CAP, f); info = probe(p); t1 = t0 + info['dur']
    segs = []
    for a, b, d, facts in G_SEG:
        lo, hi = max(a, t0), min(b, t1)
        if hi - lo > 0.3: segs.append({'in_seconds': round(lo - t0, 3), 'out_seconds': round(hi - t0, 3), 'description': d + ('（接续上一段）' if a < t0 else '') + ('（下一段继续）' if b > t1 else ''), 'facts': facts})
    media.append({'id': 'M01-%02d' % (k + 1), 'file': CAP + f, 'sha256': sha(p), 'kind': 'video', 'version': 'v0.1', 'build_id': BUILD_ID, 'capture_mode': OFF,
                  'description': '完整一局 16:9 母版第 %d/%d 段（源 %.2f～%.2f 秒）。1280×720 30fps H.264 CRF18 + AAC。原片约 97 MB，超过写回本机的单文件 20 MB 上限，按关键帧无损切成 %d 段；用同目录 full-run-16x9.concat.txt 可无损拼回（已验证拼回 6401 帧）。%s。%s。' % (k + 1, len(parts), t0, t1, len(parts), OFF_NOTE, AUD_NOTE),
                  'width': info['w'], 'height': info['h'], 'duration_seconds': round(info['dur'], 3), 'frame_rate': info['fps'], 'source_offset_seconds': round(t0, 3),
                  'audio': 'game', 'visual_review': 'pass', 'audio_review': 'not-run', 'segments': segs})
    t0 = t1

def vid(mid, f, desc, segs, audio='game'):
    p = os.path.join(KIT, CAP, f); i = probe(p)
    return {'id': mid, 'file': CAP + f, 'sha256': sha(p), 'kind': 'video', 'version': 'v0.1', 'build_id': BUILD_ID, 'capture_mode': OFF, 'description': desc,
            'width': i['w'], 'height': i['h'], 'duration_seconds': round(i['dur'], 3), 'frame_rate': i['fps'], 'audio': audio, 'visual_review': 'pass', 'audio_review': 'not-run', 'segments': segs}
MOB_NOTE = 'Chromium 设备模拟（isMobile/hasTouch，DPR2，Pixel 8 UA）+ CDP 多点触摸事件驱动虚拟摇杆与 J/K 键；bot 只做决策，再换算成摇杆方向；手动时钟逐帧渲染（?q=high）；音轨同样按事件离线渲染；非真机'
media.append(vid('M02', 'mobile-landscape-touch.mp4', '手机横屏 844×390（截图 1688×780）触控录像，可见左摇杆位移、J/K 按下状态、右侧 C 视角键与右上角暂停/全屏。' + MOB_NOTE + '。', [
  {'in_seconds': 0.0, 'out_seconds': 1.5, 'description': '手机横屏菜单：紧凑两列、触屏操作说明、返回游戏列表', 'facts': ['F-MOBILE', 'F-LIST']},
  {'in_seconds': 1.5, 'out_seconds': 3.2, 'description': '触摸「开始游戏」，登陆艇开场（未自动全屏）', 'facts': ['F-MOBILE', 'F-DISPLAY']},
  {'in_seconds': 3.2, 'out_seconds': 6.8, 'description': '摇杆驾驶 + 按住 J 机枪；K 手雷炸开 H0，接上 2 名俘虏', 'facts': ['F-MOBILE', 'F-BOMB', 'F-POW']},
  {'in_seconds': 6.8, 'out_seconds': 9.1, 'description': '连续按 K 抛手雷、击毙步兵；吉普被击毁', 'facts': ['F-MOBILE', 'F-BOMB', 'F-LIVES']},
  {'in_seconds': 9.1, 'out_seconds': 11.2, 'description': '在海滩检查点闪烁复活', 'facts': ['F-LIVES']},
  {'in_seconds': 11.2, 'out_seconds': 17.5, 'description': '复活后摇杆继续驾驶（bot 驶向西侧海滩，是自动化寻路的结果，不是游戏行为）', 'facts': ['F-MOBILE']}]))
media.append(vid('M03', 'mobile-portrait-rotated.mp4', '手机竖屏 390×844（截图 780×1688）物理画面：开始后游戏容器自动旋转为横屏布局，触控坐标做逆变换。不是 16:9 母版，画面在竖屏里是侧躺的。' + MOB_NOTE + '。', [
  {'in_seconds': 0.0, 'out_seconds': 1.5, 'description': '竖屏菜单正常显示（不旋转、没有横屏阻断提示）', 'facts': ['F-MOBILE']},
  {'in_seconds': 1.5, 'out_seconds': 3.2, 'description': '触摸开始后自动旋转为横屏布局，登陆艇开场', 'facts': ['F-MOBILE', 'F-DISPLAY']},
  {'in_seconds': 3.2, 'out_seconds': 9.1, 'description': '旋转布局下摇杆、J、K 操作：炸开 H0、接俘虏，随后被击毁', 'facts': ['F-MOBILE', 'F-POW']},
  {'in_seconds': 9.1, 'out_seconds': 13.5, 'description': '复活并继续驾驶', 'facts': ['F-LIVES', 'F-MOBILE']}]))
p = os.path.join(KIT, CAP, 'full-run-audio.flac')
media.append({'id': 'A01', 'file': CAP + 'full-run-audio.flac', 'sha256': sha(p), 'kind': 'audio', 'version': 'v0.1', 'build_id': BUILD_ID, 'capture_mode': OFF,
              'description': 'M01 的无损游戏音轨（48 kHz 立体声 FLAC，与 M01 源时间轴完全对齐，0～3 秒为菜单静音段）。' + AUD_NOTE + '。整体约 -21 dBFS，峰值约 -3 dBFS。', 'width': None, 'height': None,
              'duration_seconds': round(probe(p)['dur'], 3), 'audio': 'game', 'visual_review': 'not-applicable', 'audio_review': 'not-run', 'segments': [{'in_seconds': 3.0, 'out_seconds': 213.36, 'description': '关卡进行曲 → Boss 曲 → 通关乐句，含全部音效', 'facts': ['F-AUDIO']}]})

SHOT = [
  ('S01', 's-title-menu.png', '桌面主菜单（1280×720）：标题、规则、键位、选项、版权说明', ['F-DESKTOP', 'F-LIST'], OFF),
  ('S02', 's-intro-landing.png', '登陆艇开场与「第一关 · 海滩登陆」横幅', ['F-DRIVE'], OFF),
  ('S03', 's-hut-h0-blown.png', '手雷炸毁营房 H0 的瞬间', ['F-BOMB', 'F-DESTRUCT'], OFF),
  ('S04', 's-pow-pickup.png', '俘虏跑出营房，吉普接人', ['F-POW'], OFF),
  ('S05', 's-upgrade-rocket.png', '接到闪光俘虏：「武器升级：火箭」横幅', ['F-UPGRADE'], OFF),
  ('S06', 's-gate-blown.png', '营地大门被炸开（横幅 + 检查点提示）', ['F-DESTRUCT', 'F-LIVES'], OFF),
  ('S07', 's-player-down.png', '吉普被击毁，提示车上俘虏散落', ['F-LIVES', 'F-POW'], OFF),
  ('S08', 's-respawn.png', '在检查点闪烁复活', ['F-LIVES'], OFF),
  ('S09', 's-star-revealed.png', '林角隐藏星被炸出', ['F-STAR'], OFF),
  ('S10', 's-heli-delivery.png', '直升机坪送达俘虏', ['F-POW'], OFF),
  ('S11', 's-boss-fight.png', 'Boss 战：蓝色坦克开进、BOSS 血条', ['F-BOSS'], OFF),
  ('S12', 's-boss-damaged.png', 'Boss 坦克受击（蓝 → 棕）', ['F-BOSS'], OFF),
  ('S13', 's-stage-clear.png', '「第一关完成！」与救援直升机', ['F-RESULT'], OFF),
  ('S14', 's-result.png', '结算表', ['F-RESULT'], OFF),
  ('S15', 's-camera-oblique.png', '视角：斜俯视（默认），木桥', ['F-CAMERA'], OFF),
  ('S16', 's-camera-top.png', '视角：俯视', ['F-CAMERA'], OFF),
  ('S17', 's-camera-low.png', '视角：近景斜视', ['F-CAMERA'], OFF),
  ('S18', 's-pause-menu.png', '桌面暂停菜单', ['F-DESKTOP'], OFF),
  ('S19', 's-demo-badge-fps.png', '演示模式红色标识与帧率显示（实时渲染，SwiftShader 下的低帧率数字不代表真实设备）', ['F-DEMO', 'F-DISPLAY'], 'realtime-automation'),
  ('S20', 's-m-land-menu.png', '手机横屏菜单（844×390，DPR3）', ['F-MOBILE', 'F-LIST'], 'realtime-automation'),
  ('S21', 's-m-land-play.png', '手机横屏游戏：左摇杆、J/K/C、右上角暂停/全屏', ['F-MOBILE'], OFF),
  ('S22', 's-m-land-multitouch.png', '三指同时：摇杆 + 按住 J + K 抛手雷', ['F-MOBILE', 'F-BOMB'], OFF),
  ('S23', 's-m-land-pause.png', '手机横屏暂停菜单（两列）', ['F-MOBILE'], OFF),
  ('S24', 's-m-port-menu.png', '手机竖屏菜单（390×844）', ['F-MOBILE'], 'realtime-automation'),
  ('S25', 's-m-port-play.png', '手机竖屏开始后自动旋转为横屏布局', ['F-MOBILE', 'F-DISPLAY'], OFF),
  ('S26', 's-m-port-pause.png', '旋转布局下的暂停菜单', ['F-MOBILE'], OFF)
]
for mid, f, d, facts, mode in SHOT:
    p = os.path.join(KIT, CAP, f); w, h = Image.open(p).size
    media.append({'id': mid, 'file': CAP + f, 'sha256': sha(p), 'kind': 'screenshot', 'version': 'v0.1', 'build_id': BUILD_ID, 'capture_mode': mode,
                  'description': d + ('。手动时钟渲染（qa/shots.js、extras.js、mobile.js），bot 或脚本操作' if mode == OFF else '。实时渲染，脚本操作'), 'width': w, 'height': h, 'duration_seconds': None,
                  'audio': 'none', 'visual_review': 'pass', 'audio_review': 'not-applicable', 'segments': [], 'facts': facts})

def ev(feature):
    ids = [m['id'] for m in media if any(feature in s['facts'] for s in m.get('segments', [])) or feature in m.get('facts', [])]
    return ids
FEAT = [('F-DRIVE', '8 向驾驶、转角滑移、碾压步兵、碰撞'), ('F-MG', '机枪固定朝北，按住连发'), ('F-BOMB', '手雷 / 火箭 / 强化火箭，朝车头方向发射'),
  ('F-POW', '炸营房救俘虏、接上车、直升机坪送达；阵亡后俘虏散落可再接'), ('F-UPGRADE', '闪光俘虏升级武器（4 名，其中一名关在守桥坦克里）'),
  ('F-ENEMY', '步兵、军官、机枪巢、地面 / 崖顶炮台、坦克、炮艇'), ('F-DESTRUCT', '营房、大门、沙袋、木箱、油桶连爆、火箭可炸岩崖'), ('F-STAR', '林角隐藏星'),
  ('F-LIVES', '无限命 + 9 个检查点 + 复活保护；经典 3 命可选'), ('F-DEMO', '演示模式（无敌），默认关闭，有标识，不计最高分'),
  ('F-BOSS', '4 辆蓝色坦克：依次开进、追踪、三连发、两段受伤只吃直接命中'), ('F-RESULT', '救援直升机降落、结算、最高分'),
  ('F-CAMERA', 'C 键循环斜俯视 / 俯视 / 近景斜视，移动与射击按相机水平轴映射'), ('F-DESKTOP', '纯键盘菜单与游玩，键位提示'),
  ('F-MOBILE', '左摇杆 + J/K/C 多点触控，竖屏自动旋转与触控逆变换'), ('F-DISPLAY', '铺满视口、安全区、独立全屏按钮、画质自动 / 高 / 流畅、帧率显示'),
  ('F-AUDIO', '程序化音效与原创 BGM，音量保存'), ('F-LIST', '各界面「返回游戏列表」普通链接')]
feature_inventory = [{'id': f, 'description': d, 'status': 'implemented', 'evidence_ids': ev(f)} for f, d in FEAT]
for m in media: m.pop('facts', None)
ALL = [f for f, _ in FEAT]
changes = [
  {'id': 'C-001', 'feature_ids': ALL, 'before': '无（新游戏）', 'after': 'FC 赤色要塞第一关的 3D 网页重置版首版', 'user_visible': '可以完整玩完第一关（含 Boss 与结算），电脑键盘和手机触屏都能玩', 'evidence_ids': ['M01-01', 'M01-09', 'M01-10', 'M02', 'M03', 'S14'], 'verification': 'pass（自动试玩通关、桌面 62/62、手机模拟 30/30，见 qa）'},
  {'id': 'C-002', 'feature_ids': ['F-DESTRUCT', 'F-DRIVE'], 'before': '开发构建：烟雾是灰色多面体，像石块；崖顶每块是圆角盒，拼起来像棋盘格；草地是一整片亮绿色，花朵是黑点', 'after': '烟雾改为半透明柔和球体；崖顶改为无缝平顶；草地降饱和并加入草丛；修正花朵颜色', 'user_visible': '爆炸和场景更干净，更像玩具风的统一画面', 'evidence_ids': ['S03', 'S15', 'M01-03'], 'before_evidence_files': ['assets/dev-evidence/smoke-boulders-before-devbuild.png', 'assets/dev-evidence/bluff-tiles-before-devbuild.png'], 'verification': 'pass（目视对比）'},
  {'id': 'C-003', 'feature_ids': ['F-ENEMY', 'F-LIVES', 'F-BOSS'], 'before': '开发构建：步兵子弹 9.5 m/s、射程 15 m；不会躲子弹的 bot 每局阵亡 16～28 次', 'after': '步兵子弹 8.0 m/s、射程 13.5 m；机枪巢、炮台、坦克、Boss 的开火间隔各加长约 0.3～0.5 秒；吉普受击半径缩小约 12%；复活时附近敌人推迟开火', 'user_visible': '压力降低，复活后不会立刻被围射', 'evidence_ids': ['M01-02', 'M01-05'], 'verification': 'partial：带简单躲子弹的 bot 阵亡降到 1～5 次（见 qa/bot-runs.json）；没有真人试玩，不能当作难度结论'}
]
bugs = [
  {'id': 'BUG-001', 'found_in': 'v0.1（开发中）', 'repro_steps': '开局后看海滩左侧的海面', 'observed': '西侧海面有一条横向亮线', 'joke_angle': '', 'cause': '两块半透明海面重叠，重叠处透明度叠加', 'status': 'fixed', 'fix': '合并为一整块海面（陆地会遮住它）', 'before_media_ids': [], 'before_evidence_files': ['assets/dev-evidence/sea-seam-before-devbuild.png'], 'before_note': '修复前截图来自首次冒烟测试的开发构建，代码没有单独保留，没有构建指纹，所以不列入 media', 'after_media_ids': ['S02', 'M01-01'], 'retest': '开场海滩各视角都没有接缝'},
  {'id': 'BUG-002', 'found_in': 'v0.1（开发中）', 'repro_steps': 'bot 试玩 seed 23，在最后一个检查点之后阵亡', 'observed': '在 Boss 入口前反复阵亡：35 次死亡都在 (2, 298)，每次复活约 5.1 秒后又被击毁', 'joke_angle': '复活点正对着 4 名守卫的枪口', 'cause': '检查点「场地入口」的复活位置离 4 名原地守卫只有约 4 米，2.6 秒复活保护一过就被围射', 'status': 'fixed', 'fix': '复活点后移到 (2, 293.5)；复活时 15 米内敌人推迟 2.4～3.4 秒开火、清掉 14 米内敌弹', 'before_media_ids': [], 'before_note': '原始事件日志后来被复测覆盖，只剩会话里的统计摘要；没有修复前的画面', 'after_media_ids': ['M01-09'], 'retest': '最终构建 3 个种子 + 录像局都没有连死；desktop.js 连续 3 次阵亡复活检查通过'},
  {'id': 'BUG-003', 'found_in': 'v0.1（开发中）', 'repro_steps': '拿火箭朝崖顶区域右侧的林角发射', 'observed': '隐藏星不出现，只有手雷能炸出来', 'joke_angle': '', 'cause': '只按爆炸落点判定；树不挡子弹，火箭直接飞过林角，在射程末端才爆炸', 'status': 'fixed', 'fix': '火箭擦过星所在位置 1.7 米内也会让星现身', 'before_media_ids': [], 'after_media_ids': ['S09', 'M01-06'], 'retest': '录像局里火箭让星现身并被拾取（源 128.07 秒）'},
  {'id': 'BUG-004', 'found_in': 'v0.1（开发中）', 'repro_steps': '看草地上的小花', 'observed': '花朵是黑点', 'joke_angle': '', 'cause': '实例颜色下标对负数 x 取模得到 undefined，颜色变成 NaN', 'status': 'fixed', 'fix': '改为非负取模', 'before_media_ids': [], 'before_note': '只在会话里放大检查过修复前截图，没有单独留存', 'after_media_ids': ['S15', 'S16'], 'retest': '花朵显示为黄、粉、白、紫'},
  {'id': 'BUG-005', 'found_in': 'v0.1（开发中）', 'repro_steps': '同一种子、同样 bot 连跑两次', 'observed': '两次结果不同（通关时间 142 秒 vs 254 秒）', 'joke_angle': '', 'cause': '特效和玩法共用随机数，大爆炸第二团火球用 setTimeout 在真实时间里抢随机数；镜头震动的随机偏移影响「敌人是否在画面内」', 'status': 'fixed', 'fix': '特效改用 Math.random；可视区按不抖动的镜头计算', 'before_media_ids': [], 'after_media_ids': [], 'retest': '同一页面配置下两次空跑的事件序列完全一致。注意：录像局多了 3 秒菜单渲染和高画质参数，结果与空跑不同（4 次阵亡、69600 分），录像本身是真实的一局'},
  {'id': 'BUG-006', 'found_in': 'v0.1（开发中）', 'repro_steps': '分析 bot 整局事件日志', 'observed': '最早的营房 H0 被炸事件不见了', 'joke_angle': '', 'cause': '每发机枪弹都记一条事件，日志上限 2000 条，早期事件被挤掉', 'status': 'fixed', 'fix': '机枪只计数不逐条记录', 'before_media_ids': [], 'after_media_ids': [], 'retest': '录像局时间线包含开局全部关键事件'}
]
pr = {r['name']: r for r in perf['runs']}
qa = [
  {'area': '桌面纯键盘', 'device': 'Playwright %s Chromium 无头，SwiftShader 软件渲染，1280×720，?q=low' % desk['env'].split()[1], 'method': 'qa/desktop.js：菜单流程用实时时钟，玩法检查用手动时钟（按键是真实键盘事件）', 'result': '%d/%d 通过' % (desk['pass'], desk['total']), 'evidence': [REL + '/qa/desktop.json'], 'untested': ['真实键盘之外的输入法 / 外接手柄']},
  {'area': '手机触控', 'device': 'Chromium 设备模拟（isMobile/hasTouch，DPR3，Pixel 8 UA），844×390 与 390×844', 'method': 'qa/mobile.js：CDP 多点触摸事件；横屏摇杆 / J / K / C、多点、touchcancel、暂停、全屏、竖屏自动旋转与逆变换、横竖切换', 'result': '%d/%d 通过' % (mob['pass'], mob['total']), 'evidence': [REL + '/qa/mobile.json', 'M02', 'M03'], 'untested': ['真机触控（Android Chrome、iOS Safari）', 'iOS 不支持元素全屏时的回退只按代码判断']},
  {'area': '整关可通关', 'device': '无头 Chromium，1280×720', 'method': 'qa/botrun.js：bot 用真实键盘事件打完整关（手动时钟）', 'result': '3/3 通关：seed 11 送达 19/19、阵亡 5；seed 23 送达 0（bot 任务逻辑超时放弃送达，见 bot-runs.json）、阵亡 4；seed 67 送达 19/19、阵亡 1。录像局 seed 41 送达 19/19、阵亡 4、69600 分', 'evidence': [REL + '/qa/bot-runs.json', 'M01-01'], 'untested': ['真人试玩']},
  {'area': '画面稳定性', 'device': '离线逐帧录像 6401 帧', 'method': '人工抽看 16 帧 + 全帧亮度 / 相邻帧差分扫描（qa/full-run-frame-scan.json）', 'result': 'pass：没有闪烁候选；8 个最大跳变帧都对应转场（开局、4 次复活镜头切换、阵亡爆炸、结算弹出）', 'evidence': [REL + '/qa/full-run-frame-scan.json', 'M01-01'], 'untested': ['真实 GPU 上的阴影 / 抗锯齿表现']},
  {'area': '性能（软件渲染）', 'device': pr['desktop-1280x720-high']['renderer'], 'method': 'qa/perf.js：bot 实时游玩 25 秒，采样 rAF 间隔与每帧 JS 耗时（与录像分开测）', 'result': '1280×720 高画质 %.2f fps（中位 %.0f ms）；1280×720 流畅 %.2f fps；640×360 流畅 %.2f fps；手机模拟 844×390 DPR3 %.2f fps。每帧 JS 约 5～16 ms，瓶颈在软件光栅。绘制调用 70～96 次，三角形约 15～17 万。没有达到 60/30 fps 目标，但这是无 GPU 环境的结果，不能外推到真实设备' % (pr['desktop-1280x720-high']['frameInterval']['fps'], pr['desktop-1280x720-high']['frameInterval']['median_ms'], pr['desktop-1280x720-low']['frameInterval']['fps'], pr['desktop-640x360-low']['frameInterval']['fps'], pr['mobile-emu-844x390-dpr3-auto']['frameInterval']['fps']), 'evidence': [REL + '/qa/perf.json'], 'untested': ['真实显卡测帧（尝试在用户 4060 Ti 电脑的内置浏览器打开托管版，但该浏览器未登录 claude.ai，没有完成）', '真机手机测帧']},
  {'area': '音频', 'device': 'OfflineAudioContext（无头 Chromium）', 'method': '离线渲染的音轨做电平检查与事件对齐抽查', 'result': '音轨存在，整体约 -21 dBFS、峰值约 -3 dBFS；4 处事件对齐抽查通过', 'evidence': ['A01'], 'untested': ['人工听审', '实时播放时的混音（与离线渲染使用同一套合成函数）']},
  {'area': '其他', 'device': '无头 Chromium', 'method': 'qa/filetest.js（file:// 直接打开）、返回游戏列表链接、最高分命名空间', 'result': 'file:// 可运行；三个界面的返回链接都是 ../index.html；演示模式局不计最高分', 'evidence': [REL + '/qa/desktop.json'], 'untested': ['接入 toolbasecamp 网站后的子目录部署']}
]
readiness = {'overview': 'partial', 'update': 'not_applicable', 'gaps': [
  '实机画面是离线逐帧渲染（无 GPU 环境），不是实时录屏；音轨按事件离线渲染，不是实时录音。剪辑时如需「实时试玩」素材，要在有显卡的电脑上补录',
  '音效与音乐没有人工听审', '没有真人试玩录像', '没有真实显卡 / 真机的帧率数据',
  '16:9 母版因写回上限切成 10 段，使用前用 full-run-16x9.concat.txt 无损拼接']}
manifest = {
  'schema_version': 1, 'game_id': 'jackal-stage1-3d', 'version': 'v0.1', 'base_version': None, 'created_at': '2026-10-02T14:40:00+08:00',
  'build': {'id': BUILD_ID, 'commit': None, 'dirty': False, 'fingerprint': build['fingerprint'], 'entrypoint': 'public/html/game/jackal-stage1-3d/index.html',
            'fingerprint_method': build['method'], 'files_manifest': REL + '/qa/build.json', 'git': '无 Git 仓库',
            'source': 'game-projects/jackal-stage1-3d/src（esbuild 0.28.2 打包为 js/game.min.js）',
            'hosted_copy': {'url': 'https://claude.ai/artifact/CkhWeEfGUhWgtxd1xAAwXF', 'note': '同一份 game.min.js 内联进单文件 HTML，去掉「返回游戏列表」入口；私有，需要用户自行分享；不属于本构建指纹'}},
  'feature_inventory': feature_inventory, 'changes': changes, 'bugs': bugs, 'media': media, 'historical_media': [], 'qa': qa, 'readiness': readiness
}
json.dump(manifest, open(os.path.join(KIT, REL, 'handoff.json'), 'w'), ensure_ascii=False, indent=1)
print('handoff written:', len(media), 'media; build', BUILD_ID)
missing = [f['id'] for f in feature_inventory if not f['evidence_ids']]
print('features without evidence:', missing)
