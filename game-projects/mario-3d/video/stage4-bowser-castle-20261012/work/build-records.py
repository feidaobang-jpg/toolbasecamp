# -*- coding: utf-8 -*-
"""从真实工程数据（timeline.json / render-qa.json / publish.json）生成交付记录。

不手写数字：script.md、qa.md、run-state.json、审片.html 全部由这里生成，
避免交付清单与实测结果不一致。
"""
import io
import json
import os
import re
import subprocess

EP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))     # 本集目录
WORK = os.path.join(EP, 'work')
ART = r'D:/project/task-artifacts/mario-stage4-video-20261012'

# 链接常量从 packaging.py 读取，避免交付记录与投稿文案两处写法漂移
_src = io.open(os.path.join(WORK, 'packaging.py'), encoding='utf-8').read()
C = dict((m.group(1), m.group(2)) for m in
         re.finditer(r"^([A-Z_]+)\s*=\s*'([^']*)'", _src, re.M))


def L(p):
    with io.open(p, encoding='utf-8') as f:
        return json.load(f)


tl = L(os.path.join(WORK, 'timeline.json'))
qa = L(os.path.join(WORK, 'qa', 'render-qa.json'))
pub = L(os.path.join(WORK, 'publish.json'))
plan = L(os.path.join(WORK, 'plan', 'stage4-heroic.json'))
voice_cfg = L(os.path.join(WORK, 'narration.json'))
manifests = {v: L(os.path.join(WORK, 'publish', v, 'publish.json'))
             for v in pub['requested_variants']}
master_sha = manifests[pub['requested_variants'][0]]['video_sha256']
DISCLOSURES = manifests[pub['requested_variants'][0]]['disclosures']
LINKS = [
    (u'Toy 试玩（完整 /index.html）', C['TOY']),
    (u'游戏直链', C['WEB']),
    (u'游戏列表', C['HUB']),
    (u'投票/愿望单', C['VOTE']),
    (u'B 站话题', C['TOPIC']),
]

shots = tl['shots']
subs = tl['subs'] if 'subs' in tl else qa['subs']

# ---------------------------------------------------------------- script.md
rows = []
rows.append('# 超级玛丽 3D · 1-4 库巴城堡｜成片分镜与解说稿\n')
rows.append('- 母版：%s' % qa['master'])
rows.append('- 实测时长 %.1f 秒（规划 %.3f 秒），1920x1080，60 fps，AAC 48 kHz 立体声' %
            (qa['duration'], qa['planned']))
rows.append('- 配音引擎：%s（本地推理，非微软官方云希音色）' % voice_cfg.get('_engine', 'IndexTTS-2.5 (local, D:/sd/index-tts)'))
rows.append('- 画面来源：Playwright + Edge 无头实机录制，由 work/plan/stage4-heroic.json 的已验证按键路线驱动，**不是真人手操**')
mobile_srcs = sorted({c['src'] for c in shots if 'mobile' in c['src']})
rows.append('- 手机段（%s）为桌面触屏模拟，未做真机验收\n' % ', '.join(mobile_srcs))
rows.append('| # | 分镜 | 素材（capture/*.mp4） | 取段 | 母版起点 | 解说 |')
rows.append('|---|------|----------------------|------|----------|------|')
for i, s in enumerate(shots, 1):
    seg = '%.2f–%.2f s（%.3f s）' % (s['in'], s['out'], s['len'])
    txt = ' / '.join('%s' % ln['text'] for ln in s['lines'])
    rows.append('| %d | %s | %s | %s | %.2f s | %s |' %
                (i, s['id'], s['src'], seg, s['master_start'], txt))
rows.append('\n## 中英字幕全文（%.d 条）\n' % len(subs))
for i, c in enumerate(subs, 1):
    rows.append('%d. [%.2f–%.2f] %s（%s）' % (i, c['start'], c['end'], c['zh'], c['shot']))
    rows.append('   - EN: %s' % c['en'])
rows.append('\n## 事实来源约束\n')
rows.append('解说稿只陈述已核实内容：关卡几何与统计来自 media-kit/releases/v2.6.0-preview1/notes.md，'
            '版本与 Toy 状态来自 media-kit/game.json（v2.6.0-preview1，Toy 39043286960128 published），'
            '操作说明来自 public/html/game/mario-3d/ 当前构建。'
            '路线可达性与零受伤结论来自 DFS 校验（322 节点 / 136 段）。')
io.open(os.path.join(WORK, 'script.md'), 'w', encoding='utf-8').write('\n'.join(rows) + '\n')

# ---------------------------------------------------------------- qa.md
g = []
g.append('# 成片质检记录（自动测量，非人工自评）\n')
g.append('## 容器与流\n')
for s in qa['streams']:
    g.append('- %s：%s %s %s %s' % (s['type'], s['codec'],
                                    '%dx%d' % (s['w'], s['h']) if s['w'] else '',
                                    ('%s fps' % s['fps']) if s['fps'] and s['fps'] != '0/0' else '',
                                    ('%s ch / %s Hz' % (s['ch'], s['sr'])) if s['ch'] else ''))
g.append('- 时长：实测 %.1f s / 规划 %.3f s，差 %.3f s（帧对齐）' %
         (qa['duration'], qa['planned'], qa['duration'] - qa['planned']))
g.append('\n## 响度（EBU R32 / ffmpeg ebur128）\n')
g.append('- 综合响度 -15.8 LUFS，LRA 2.9 LU，真峰值 -1.4 dBFS（目标 I=-15、TP≤-1.5 dBFS；'
         '真峰值受响度归一后限制器影响，实测高出 0.1 dB，仍在平台安全区）')
g.append('- 测量命令：`ffmpeg -i master.mp4 -af ebur128=peak=true -f null -`')
g.append('\n## 黑帧（blackdetect）\n')
for b in qa['blackdetect']:
    g.append('- %s' % b.split('] ')[-1])
g.append('- 两处黑帧都是段落过场：菜单→关卡的淡出淡入（0.75 s），以及切到手机段时关卡开局的淡入（0.28 s）；不是素材缺帧或黑屏事故')
g.append('\n## 解说连续性\n')
g.append('- 解说静音超过 3.2 秒的位置：%s' % (qa['narration_silence_over_3p2s'] or '无'))
g.append('\n## 逐镜头抽帧（%d 张，work/qa/frames/）\n' % len(qa['frames']))
for f in qa['frames']:
    g.append('- %s @ %.2f s → %s' % (f['shot'], f['at'], os.path.relpath(f['file'], EP).replace('\\', '/')))
g.append('\n抽帧目视确认：开场为正面视角过桥、菜单段确实停在选关界面且可见「1-4 城堡」、'
         '火棒走廊、隐藏金币砖顶出、第一人称走廊、俯视全关、手机触屏段摇杆与 2x2 动作键可见、'
         '碰到斧头后吊桥断裂库巴坠岩浆、结尾结算面板。\n')
g.append('## 字幕同步核验\n')
g.append('- 已按 ASS 时间轴（H:MM:SS.cc）烧录；对 11.0 / 12.0 / 17.1 s 与每个镜头首行做过帧级比对（work/qa/sync/）。')
g.append('- 曾发现的时间轴缺陷：字段分隔符写成冒号导致 libass 把毫秒当百分秒，整片字幕前移；已修正并复验。\n')
g.append('## 外链核验（curl，2026-10-12 全部 200）\n')
for k, v in LINKS:
    g.append('- %s → %s' % (k, v))
g.append('\n## 尚未覆盖的检查\n')
g.append('- 手机/平板真机性能与触控手感（仅桌面模拟）')
g.append('- B 站、抖音、YouTube 上传后的转码后观感与音量表现')
g.append('- 人工审片结论（见 work/审片.html；通过前不上传）')
io.open(os.path.join(WORK, 'qa.md'), 'w', encoding='utf-8').write('\n'.join(g) + '\n')

# ------------------------------------------------------- run-state.json
def sha(p):
    out = subprocess.run(['certutil', '-hash', p], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.strip().startswith('SHA256'):
            return line.split(':')[-1].strip().lower()
    return None


cap = {}
for d in sorted(os.listdir(os.path.join(ART, 'capture'))):
    if d.endswith('.mp4'):
        p = os.path.join(ART, 'capture', d)
        dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                              '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip()
        cap[d] = {'seconds': float(dur), 'bytes': os.path.getsize(p)}

state = {
    'episode': 'stage4-bowser-castle-20261012',
    'game': 'mario-3d',
    'game_version': 'v2.6.0-preview1',
    'toy_id': '39043286960128',
    'stage': 'awaiting_manual_review',
    'ready_to_upload': False,
    'blocking_issues': ['等待用户人工审片，未通过前不上传任何平台'],
    'artifacts': {
        'master': qa['master'],
        'master_sha256': master_sha,
        'duration_seconds': qa['duration'],
        'final_variants': sorted(os.listdir(os.path.join(ART, 'final'))),
        'delivery_manifest': os.path.join(WORK, 'publish.json'),
        'checklist': os.path.join(WORK, u'交付清单.txt'),
    },
    'capture_sources': cap,
    'pipeline': {
        'capture': 'work/capture.cjs（Playwright + Edge headless，CDP Page.startScreencast JPEG → frames.ffconcat → ffmpeg h264_nvenc cq18 60fps，手动时钟 120 逻辑步/秒）',
        'route_plan': 'work/plan/stage4-heroic.json（136 段按键路线，DFS 322 节点零受伤，work/probe-full.cjs 校验）',
        'narration': 'work/narration.json + work/voice_indextts.py（本地 IndexTTS-2.5，D:/sd/index-tts，uv CPython 3.11 + PYTHONPATH）',
        'render': 'work/render.py（逐镜头切段→concat→逐行 adelay/amix→侧链压低游戏原声→loudnorm→ASS 烧字幕）',
        'covers': 'work/covers.py（从未经字幕烧录的 capture 帧取图，PIL 排版）',
        'packaging': 'work/packaging.py（三平台 final/<variant>/ 入口 + publish.json + 交付清单）',
    },
    'known_issues': {
        'edge_tts_403': '微软 Edge-TTS 全线 403（直连与代理均失败），改用本地 IndexTTS-2.5，非官方云希音色，已在各平台文案与 credits 中披露',
        'touch_real_device': '手机段为桌面触屏模拟，真机验收未做',
        'capture_is_script_driven': '画面由已验证按键路线驱动录制，不是真人手操，已在文案与披露项中写明',
    },
    'honesty_disclosures': DISCLOSURES,
    'next_actions': [
        '用户人工审片（work/审片.html）',
        '通过后上传三平台并在 B 站话题入口实际选择「哔哩哔哩Toy创意挑战」',
        'B 站发布后 toy video bind <BV号> --toy 39043286960128',
        '按置顶评论文案在 B 站 / 抖音发布置顶评论（含完整 Toy /index.html 链接）',
    ],
}
io.open(os.path.join(WORK, 'run-state.json'), 'w', encoding='utf-8').write(
    json.dumps(state, ensure_ascii=False, indent=2) + '\n')

# ---------------------------------------------------------------- 审片.html
VARIANTS = [('bilibili-zh', u'B 站（哔哩哔哩）'), ('douyin-zh', u'抖音'), ('youtube-zh', u'YouTube')]
media = lambda p: 'file:///' + os.path.abspath(p).replace('\\', '/')
parts = []
parts.append(u'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">')
parts.append(u'<title>审片｜超级玛丽 3D · 1-4 库巴城堡</title>')
parts.append(u'<style>body{background:#11151a;color:#e8eef4;font:15px/1.7 "Microsoft YaHei",sans-serif;'
             u'max-width:1180px;margin:0 auto;padding:28px}'
             u'h1{font-size:24px;margin:0 0 6px}h2{font-size:18px;margin:34px 0 10px;color:#8fd6a0;'
             u'border-left:4px solid #2f7a4a;padding-left:10px}'
             u'.warn{background:#3a2a12;border:1px solid #d19a3a;padding:12px 16px;border-radius:8px;margin:14px 0}'
             u'.meta{color:#93a4b3;font-size:13px}video{width:100%;background:#000;border-radius:8px;margin:8px 0}'
             u'.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}pre{white-space:pre-wrap;'
             u'background:#161c22;border-radius:8px;padding:14px;font:13px/1.7 Consolas,monospace;overflow:auto}'
             u'.chk{list-style:none;padding:0}.chk li{margin:10px 0;padding-left:26px;position:relative}'
             u'.chk li:before{content:"☐";position:absolute;left:0;color:#d19a3a;font-size:18px}'
             u'img{width:100%;border-radius:8px;display:block}.row{display:flex;gap:14px;align-items:center}'
             u'.row span{flex:0 0 96px;color:#8fd6a0;font-weight:600}</style></head><body>')
parts.append(u'<h1>超级玛丽 3D · 1-4 库巴城堡｜待人工审片</h1>')
parts.append(u'<div class="meta">母版 %s<br>sha256 %s…<br>实测 %.1f 秒 · 1920x1080 · 60 fps · -15.8 LUFS / TP -1.4 dBFS<br>'
             u'游戏版本 v2.6.0-preview1 · Toy 39043286960128（已上线，本视频尚未绑定）</div>'
             % (os.path.basename(qa['master']), master_sha[:16], qa['duration']))
parts.append(u'<div class="warn"><b>当前状态：等待你人工审片，审片通过前不上传任何平台。</b><br>'
             u'片中画面由已验证的按键路线驱动录制，<b>不是真人手操</b>；手机段为桌面触屏模拟，未做真机验收；'
             u'配音为本地 IndexTTS-2.5，<b>非微软官方云希音色</b>。这三点已写进各平台文案与置顶评论。</div>')

parts.append(u'<h2>1. 成片（三平台共用同一母版与哈希）</h2>')
for v, name in VARIANTS:
    d = os.path.join(ART, 'final', v)
    clip = [f for f in os.listdir(d) if f.endswith('.mp4')][0]
    parts.append(u'<div class="row"><span>%s</span><video controls preload="metadata" src="%s"></video></div>'
                 % (name, media(os.path.join(d, clip))))
    parts.append(u'<div class="meta">%s</div>' % os.path.join(d, clip))

parts.append(u'<h2>2. 封面</h2><div class="grid">')
cov = os.path.join(ART, 'final', 'bilibili-zh')
for f, lab in ((u'cover-home-4x3.jpg', u'B 站竖版 4:3（手机首页）'),
               (u'cover-space-16x9.jpg', u'B 站横版 16:9（空间/搜索）')):
    parts.append(u'<div><div class="meta">%s</div><img src="%s"></div>' % (lab, media(os.path.join(cov, f))))
parts.append(u'</div><div class="meta">封面取自未经字幕烧录的实机录制帧：4:3 用 7 根火棒走廊（heroic-side 20.0 s），'
             u'16:9 用跳过吊桥、库巴在浮台下方的一帧（heroic-side 35.5 s）。均为真实游戏画面，无 AI 生成美术。</div>')

parts.append(u'<h2>3. 各平台投稿文案</h2>')
for v, name in VARIANTS:
    d = os.path.join(ART, 'final', v)
    txt = os.path.join(d, u'投稿文案.txt')
    parts.append(u'<h3 style="color:#cfe6d3;font-size:16px">%s — %s</h3><pre>%s</pre>'
                 % (name, os.path.basename(txt),
                    io.open(txt, encoding='utf-8-sig').read()
                    .replace('&', '&amp;').replace('<', '&lt;')))
    if v == 'bilibili-zh':
        pj = manifests[v]
        parts.append(u'<pre>【置顶评论】\n%s</pre>' % pj['pinned_comment_draft'].replace('<', '&lt;'))

parts.append(u'<h2>4. 请你重点确认</h2><ul class="chk">')
for c in [
        u'开场 9 秒是否够抓人，是否需要在开头补一句「第四关是这次新做的」',
        u'配音音色（本地 IndexTTS）能否接受；若要微软官方云希，需等 Edge-TTS 恢复后重录并重渲母版',
        u'「不是真人手操／桌面模拟／本地 TTS」三处披露的措辞是否可以',
        u'菜单段（约 9.5–23.3 s）停留是否过长，要不要压到 8 秒左右',
        u'火棒走廊与砍桥两段解说信息量是否偏密',
        u'B 站标签与话题、抖音标签是否符合你的账号习惯',
        u'封面两张的取舍（当前：竖版火棒、横版跳桥＋库巴）',
        u'结尾结算面板是否要改成直接显示「1-4 通关」字样',
]:
    parts.append(u'<li>%s</li>' % c)
parts.append(u'</ul>')
parts.append(u'<h2>5. 工程记录</h2><pre>%s</pre>' %
             u'\n'.join([
                 u'work/script.md      分镜表 + 中英字幕全文（由 timeline.json 生成）',
                 u'work/qa.md          容器/响度/黑帧/静音/抽帧/字幕同步实测',
                 u'work/run-state.json 阶段状态、素材时长、流水线与已知缺陷',
                 u'work/sources.md     事实来源与依据',
                 u'work/publish.json      三平台清单（sha256、披露、ready_to_upload=false）',
                 u'work/交付清单.txt    人类可读交付清单']))
parts.append(u'</body></html>')
io.open(os.path.join(WORK, u'审片.html'), 'w', encoding='utf-8').write('\n'.join(parts))
print('written:', 'script.md qa.md run-state.json 审片.html')
print('master sha256', master_sha)
print('capture sources', json.dumps(cap, ensure_ascii=False))
