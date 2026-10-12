# -*- coding: utf-8 -*-
"""超级玛丽 3D 1-4 库巴城堡 —— 母版拼接、配音混音、烧字幕与验收。

输入：
  <MEDIA>/capture/<seg>.mp4            六段实机母版（1920x1080 60fps 或 844x390）+ capture/<seg>/capture.json
  <MEDIA>/audio/shared-zh/<id>.wav/.json 逐行解说配音（含实测时长）
  work/narration.json                  镜头表：源区间 + 每行解说文本
输出：
  <MEDIA>/edit/shotNN-*.mp4            逐镜头中间片
  <MEDIA>/master/mario-1-4-master.mp4  母版（烧中文字幕、含混音）
  <MEDIA>/final/<variant>/             三平台成片、封面位、字幕、publish.json
  work/qa/render-qa.json               技术验收证据（时长/流/黑帧/静音/响度/抽查帧）

做法沿用 rv-town / resistance-war 已验证流程：镜头长度按配音实测时长回推，
字幕时间取该行音频的真实时长（不是估算），人声优先、游戏声侧链压低，综合响度 -15 LUFS。
"""
import json, os, subprocess, sys, shutil
from pathlib import Path

R = Path(__file__).resolve().parent                      # work/
MEDIA = Path(os.environ.get('MEDIA_DIR', 'D:/project/task-artifacts/mario-stage4-video-20261012'))
CAP, AUD = MEDIA / 'capture', MEDIA / 'audio' / 'shared-zh'
EDIT, MASTER, FINAL, QA = MEDIA / 'edit', MEDIA / 'master', MEDIA / 'final', R / 'qa'
for d in (EDIT, MASTER, FINAL, QA, QA / 'frames'):
    d.mkdir(parents=True, exist_ok=True)

cfg = json.loads((R / 'narration.json').read_text(encoding='utf-8'))
LINE_GAP, LEAD, TAIL = 0.15, 0.30, 0.45          # 行间停顿 / 镜头留白
SUB_Y = 300                                        # ASS 底边距：字幕落在画面高约 72% 处


def ff(args, check=True):
    p = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and p.returncode:
        raise SystemExit('ffmpeg 失败：\n' + ' '.join(map(str, args)) + '\n' + (p.stderr or '')[-2000:])
    return p


def probe(p):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(p)], text=True)
    return json.loads(out)


def dur(p):
    return float(probe(p)['format']['duration'])


def has_audio(p):
    return any(s['codec_type'] == 'audio' for s in probe(p)['streams'])


def meta(line_id):
    j = AUD / (line_id + '.json')
    if not j.exists():
        raise SystemExit(f'缺少配音 {j}，先跑 voice_indextts.py / Edge 配音')
    return json.loads(j.read_text(encoding='utf-8'))


# ---------- 1. 镜头时长与源区间（按配音实测回推） ----------
seg_dur = {s: dur(CAP / (s + '.mp4')) for s in {sh['src'] for sh in cfg['shots']}}
shots, cursor = [], 0.0
for i, sh in enumerate(cfg['shots']):
    lines = []
    t = cursor + LEAD
    for ln in sh['lines']:
        m = meta(ln['id'])
        lines.append({'id': ln['id'], 'text': ln['text'], 'en': ln.get('en', ''), 'start': round(t - cursor, 3), 'dur': m['duration']})
        t += m['duration'] + LINE_GAP
    speech = (t - LINE_GAP) - (cursor + LEAD)
    need = round(speech + LEAD + TAIL, 3)
    src, sin, sout = sh['src'], float(sh['in']), float(sh['out'])
    eps = 0.05                                              # 帧对齐浮点误差，别因为差 0.0001 秒就判源不够
    if sout - sin < need - eps:                             # 先往后延长
        sout = min(seg_dur[src], sin + need)
    if sout - sin < need - eps:                             # 再往前挪
        sin = max(0.0, sout - need)
    if sout - sin < need - eps:
        raise SystemExit(f'{sh["id"]} 源 {src} 不够长（需 {need}，有 {sout - sin}）')
    sout = min(sout, sin + need)                            # 够长就按需要收口，不多留素材
    shots.append({'id': sh['id'], 'src': src, 'in': round(sin, 3), 'out': round(sout, 3), 'len': round(sout - sin, 3),
                  'master_start': round(cursor, 3), 'speech': round(speech, 3), 'lines': lines})
    cursor += sout - sin
total = round(cursor, 3)
print('镜头', len(shots), '母版时长', total, '语音合计', round(sum(l['dur'] for s in shots for l in s['lines']), 1))

# ---------- 2. 逐镜头切片统一到 1920x1080/60fps ----------
reuse = os.environ.get('SKIP_CLIPS') == '1'   # 只改混音/字幕时用已剪好的中间片，省一次全量重编码
for s in shots:
    out = EDIT / (s['id'] + '.mp4')
    if reuse and out.exists():
        s['clip'] = str(out)
        continue
    src_file = CAP / (s['src'] + '.mp4')
    vf = 'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=60,format=yuv420p'
    mute = not has_audio(src_file)       # 菜单段录制时没挂录音，补一条静音轨，否则拼接时流数不一致
    args = ['-ss', s['in'], '-i', src_file]
    if mute:
        args += ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']
    args += ['-t', s['len'], '-vf', vf]
    if mute:
        args += ['-map', '0:v:0', '-map', '1:a:0', '-shortest']
    ff(args + ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '18', '-b:v', '0', '-r', '60',
               '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out])
    s['clip'] = str(out)

(EDIT / 'concat.txt').write_text(''.join(f"file '{Path(s['clip']).as_posix()}'\n" for s in shots), encoding='utf-8')
game = EDIT / 'game-track.mp4'
ff(['-f', 'concat', '-safe', '0', '-i', EDIT / 'concat.txt', '-c', 'copy', '-movflags', '+faststart', game])
assert abs(dur(game) - total) < 0.6, f'拼接时长 {dur(game)} 与计划 {total} 不符'

# ---------- 3. 解说轨：逐行 adelay 到母版时间轴后混合 ----------
ins, flt, tags = [], [], []
for s in shots:
    for l in s['lines']:
        n = len(ins) // 2                   # ffmpeg 输入从 0 开始计数，别用 1 基索引，最后一路会越界
        ins += ['-i', AUD / (l['id'] + '.wav')]
        ms = int(round((s['master_start'] + l['start']) * 1000))
        tags.append(f'a{n}')
        flt.append(f'[{n}:a]adelay={ms}|{ms},apad,atrim=0:{total}[{tags[-1]}]')
narr = EDIT / 'narration.wav'
# amix 的输入标签要连续写（[a0][a1]…），duration 是 amix 自己的参数，不能当成下一层滤镜
mix_graph = ''.join(f'[{t}]' for t in tags) + f'amix=inputs={len(tags)}:normalize=0:duration=longest[out]'
ff(ins + ['-filter_complex', ';'.join(flt) + ';' + mix_graph,
          '-map', '[out]', '-t', total, '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', narr])

# ---------- 4. 混音：人声优先，游戏声侧链压低，综合 -15 LUFS ----------
# 要压的是游戏声，被"听见"的是人声，所以分叉的是解说轨（一份当侧链控制、一份出声），不是游戏轨
fc = ('[1:a]asplit=2[k][vo];'
      '[0:a][k]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350:makeup=1[gduck];'
      '[gduck]volume=0.42[gm];'
      '[gm][vo]amix=inputs=2:normalize=0,alimiter=limit=0.95,'
      'loudnorm=I=-15:TP=-1.5:LRA=11[out]')

# ---------- 5. 中文字幕（ASS，时间来自配音实测） ----------
def esc(t):
    return t.replace('{', '(').replace('}', ')')
ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', 'WrapStyle: 2',
       'ScaledBorderAndShadow: yes', '', '[V4+ Styles]',
       'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
       f'Style: CN,Microsoft YaHei,58,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,60,60,{SUB_Y},1',
       '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']


def ts(t):
    # ASS 用 H:MM:SS.cc（百分秒），分隔符必须是点；写成冒号会被 libass 当成第四段时间，整条字幕往后挪几秒
    cs = int(round(max(0.0, t) * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f'{h}:{m:02d}:{s:02d}.{cs:02d}'


subs = []
for s in shots:
    for l in s['lines']:
        a, b = s['master_start'] + l['start'], s['master_start'] + l['start'] + l['dur']
        ass.append(f'Dialogue: 0,{ts(a)},{ts(b)},CN,,0,0,0,,{esc(l["text"])}')
        subs.append({'start': round(a, 3), 'end': round(b, 3), 'zh': l['text'], 'en': l['en'], 'shot': s['id']})
(R / 'captions-zh.ass').write_text('\n'.join(ass) + '\n', encoding='utf-8')
# subtitles 滤镜的路径要正斜杠并把冒号转义，否则 Windows 盘符会把滤镜图截断
ass_path = str(R / 'captions-zh.ass').replace('\\', '/').replace(':', '\\:')
master = MASTER / 'mario-1-4-master.mp4'
if not (os.environ.get('REUSE_MASTER') == '1' and master.exists()):
    ff(['-i', game, '-i', narr, '-filter_complex',
        f"[0:v]subtitles=filename='{ass_path}'[v];{fc}",
        '-map', '[v]', '-map', '[out]', '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '18', '-b:v', '0', '-r', '60',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', master])
print('母版', master, round(dur(master), 2), 's')


# ---------- 6. SRT（YouTube 中英可切换） ----------
def srt(items, key):
    lines = []
    for i, x in enumerate(items, 1):
        def f(t):
            ms = int(round(t * 1000))
            return f'{ms // 3600000:02}:{ms % 3600000 // 60000:02}:{ms % 60000 // 1000:02},{ms % 1000:03}'
        lines += [str(i), f'{f(x["start"])} --> {f(x["end"])}', x[key] or ('[EN pending]' if key == 'en' else x['zh']), '']
    return '\n'.join(lines)


(MEDIA / 'captions-zh.srt').write_text(srt(subs, 'zh'), encoding='utf-8')
(MEDIA / 'captions-en.srt').write_text(srt(subs, 'en'), encoding='utf-8')

# ---------- 7. 技术验收 ----------
qa = {'master': str(master), 'planned': total, 'duration': round(dur(master), 3),
      'streams': [{'type': s['codec_type'], 'codec': s.get('codec_name'), 'w': s.get('width'), 'h': s.get('height'),
                   'fps': s.get('r_frame_rate'), 'ch': s.get('channels'), 'sr': s.get('sample_rate')} for s in probe(master)['streams']],
      'shots': [{k: s[k] for k in ('id', 'src', 'in', 'out', 'len', 'master_start', 'speech')} for s in shots],
      'subs': subs[:3] + subs[-3:], 'frames': []}
p = subprocess.run(['ffmpeg', '-hide_banner', '-i', master, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='replace')
qa['loudness'] = [l.strip() for l in (p.stderr or '').splitlines()
                  if ('Summary' in l or ('I:' in l and 'LUFS' in l and 'TARGET' not in l) or 'True peak' in l)][:8]
p2 = subprocess.run(['ffmpeg', '-hide_banner', '-i', master, '-vf', 'blackdetect=d=0.18:pix_th=0.10', '-an', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='replace')
qa['blackdetect'] = [l.strip() for l in (p2.stderr or '').splitlines() if 'black_start' in l][:12]
p3 = subprocess.run(['ffmpeg', '-hide_banner', '-i', narr, '-af', 'silencedetect=n=-45dB:d=3.2', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='replace')
qa['narration_silence_over_3p2s'] = [l.strip() for l in (p3.stderr or '').splitlines() if 'silence_duration' in l][:12]
for s in shots:
    f = QA / 'frames' / (s['id'] + '.jpg')
    ff(['-ss', s['master_start'] + s['len'] * 0.55, '-i', master, '-frames:v', '1', '-q:v', '3', f], check=False)
    qa['frames'].append({'shot': s['id'], 'at': round(s['master_start'] + s['len'] * 0.55, 2), 'file': str(f)})
(QA / 'render-qa.json').write_text(json.dumps(qa, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
(R / 'timeline.json').write_text(json.dumps({'total': total, 'shots': shots, 'subs': subs}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print('验收写入', QA / 'render-qa.json')
print('响度', qa.get('loudness', '未取到'), '| 黑帧段', len(qa['blackdetect']), '| 解说空段>3.2s', len(qa['narration_silence_over_3p2s']))
