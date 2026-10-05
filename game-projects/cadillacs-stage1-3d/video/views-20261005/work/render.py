"""v2 视角版成片：按每段配音真实时长切实机镜头，逐词时间戳烧录字幕，人声侧链压低游戏声，两遍 loudnorm。
镜头源全部来自 capture/views-run-1080p.mp4（同一局、源时间码见 PLAN）。换配音后重跑本脚本即可按新音轨重排。"""
import json, re, subprocess, hashlib, math, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
R = Path(__file__).resolve().parent
SRC = R / 'capture/views-run-1080p.mp4'
E = R / 'edit/shared-zh'; E.mkdir(parents=True, exist_ok=True)
A = R / 'audio/shared-zh'
F = R.parent / 'final/bilibili-zh'; F.mkdir(parents=True, exist_ok=True)
FINAL = F / '恐龙快打3D-第一人称打第一关.mp4'
FPS, LEAD, SR = 30, 0.25, 48000
REUSE = os.environ.get('REUSE') == '1'  # PLAN 未改时复用已切好的片段
def run(a):
    p = subprocess.run(['ffmpeg', '-hide_banner', '-y', *map(str, a)], cwd=R, capture_output=True, encoding='utf-8', errors='replace')
    if p.returncode: raise RuntimeError(p.stderr[-3000:])
    return p.stderr
def fr(t): return round(t * FPS) / FPS
def font(n): return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', n)

# 每段：dur（成片秒数）与镜头 [源入点, 时长]；最后一个镜头不足时冻结末帧补齐（只用于静止的结算画面）。
PLAN = [
 ('01-hook',       9.3, [(124.0, None)]),                                  # 第一人称：揍布雷德→左轮连开→胖子
 ('02-side',      12.0, [(3.0, None)]),                                    # 选人→第一关标题→维斯放话跳楼→手下围上
 ('03-front',     17.6, [(15.0, None)]),                                   # C 切正视（15.8）；29.9 背后来人、30.3 挨打
 ('04-fp',         9.4, [(38.9, None)]),                                   # C 切第一人称（39.17）；47.27 踹门
 ('05-hall-front',17.4, [(68.0, 6.6), (84.6, None)]),                      # 正视走廊开门出人；被夹在门边倒下 92.15，复活震倒
 ('06-hall-fp',   14.9, [(98.6, 7.0), (133.3, None)]),                     # 切第一人称（101.03）拿刀布雷德；胖子挤上来
 ('07-boss-intro',13.8, [(151.0, 3.0), (194.0, None)]),                    # 撞窗跳到第47街；维斯与岩跳龙，203.8 变橙
 ('08-boss-front',10.2, [(204.8, None)]),                                  # 正视 Boss；210.8 被扑倒
 ('09-boss-fp',   16.0, [(217.3, None)]),                                  # 切第一人称（218.7）；224 镜头钻进恐龙嘴里（bug）；230.4 挨拳、232.88 倒下
 ('10-boss-side', 14.2, [(236.2, 4.4), (247.6, 6.2), (287.0, None)]),      # 切回侧视（236.7）；248 飞踢；289.25 维斯倒下
 ('11-result',     9.8, [(293.9, 2.8), (300.6, None)]),                    # 体力奖励（294.5 出字）→ 结算面板 122400、倒下 3 次
 ('12-bug',        9.0, [(176.2, None)]),                                  # 正视贴墙镜头进墙（176.8、180.4）
 ('13-outro',     31.4, 'triptych'),
]
TRIP = {  # 三联画各自的源区间（同一局里各视角的实际游玩）
 'side':  [(238.4, 29.4)],
 'front': [(16.0, 22.4), (188.0, 7.0)],
 'fp':    [(41.4, 5.5), (124.0, 9.3), (133.3, 7.9), (219.6, 6.7)],
}
cfg = json.loads((R / 'narration.json').read_text(encoding='utf-8'))
segs = {s['id']: s for s in cfg['segments']}
clean = lambda s: ''.join(re.findall(r'[\w\u4e00-\u9fff]', s))
def phrases(s): return [p for p in re.findall(r'[^，。！？；：]+[，。！？；：]?', s) if clean(p)]

def cut(t0, dur, out, freeze=0.0):
    if REUSE and out.exists() and out.with_suffix('.wav').exists(): return
    vf = 'fps=30,format=yuv420p' + (f',tpad=stop_mode=clone:stop_duration={freeze:.3f}' if freeze > 0 else '')
    n = round((dur + freeze) * FPS)
    run(['-ss', f'{t0:.3f}', '-i', SRC, '-vf', vf, '-frames:v', n, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', out])
    af = f'aresample={SR},apad,atrim=duration={dur + freeze:.4f},afade=t=in:d=0.03,afade=t=out:st={dur + freeze - 0.08:.4f}:d=0.08'
    run(['-ss', f'{t0:.3f}', '-i', SRC, '-vn', '-af', af, '-ac', '2', '-ar', SR, out.with_suffix('.wav')])

def triptych(dur, out):
    if REUSE and out.exists() and out.with_suffix('.wav').exists(): return
    bg = Image.new('RGB', (1920, 1080), '#17121f'); d = ImageDraw.Draw(bg)
    d.text((960, 92), '一关，三种视角', font=font(64), fill='#ffd98a', anchor='mm')
    xs = [40, 660, 1280]; W, H, Y = 600, 338, 190
    for x, lab in zip(xs, ['侧视（默认，原作画面）', '正视（主角身后）', '第一人称（主角眼睛）']):
        d.rounded_rectangle((x - 6, Y - 6, x + W + 6, Y + H + 6), radius=10, outline='#c9a44a', width=3)
        d.text((x + W / 2, Y + H + 44), lab, font=font(34), fill='#ffe9c4', anchor='mm')
    bg.save(E / 'outro-bg.png')
    info = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0)); d = ImageDraw.Draw(info)
    d.rounded_rectangle((260, 870, 1660, 1030), radius=18, fill=(40, 30, 64, 235), outline='#8f76b8', width=2)
    d.text((960, 912), '试玩：简介里的网站 / B站 Toy 链接（电脑、手机都能玩）', font=font(36), fill='#ffe9c4', anchor='mm')
    d.text((960, 966), '投票 / 愿望单：百宝箱 → 游戏 → 自研游戏投票榜', font=font(32), fill='#cfc3e8', anchor='mm')
    d.text((960, 1008), '粉丝向非官方重置 · 原作版权归 Capcom 及原著方所有', font=font(20), fill='#a99cc9', anchor='mm')
    info.save(E / 'outro-info.png')
    panes = []
    for k in ('side', 'front', 'fp'):
        parts = []
        for i, (t0, ln) in enumerate(TRIP[k]):  # 最后一段补足到结尾时长
            if i == len(TRIP[k]) - 1: ln = fr(dur - sum(x[1] for x in TRIP[k][:-1]))
            p = E / f'trip-{k}-{i}.mp4'; cut(t0, ln, p); parts.append(p)
        (E / f'trip-{k}.txt').write_text('\n'.join(f"file '{p.name}'" for p in parts), encoding='utf-8')
        run(['-f', 'concat', '-safe', '0', '-i', E / f'trip-{k}.txt', '-c', 'copy', E / f'trip-{k}.mp4']); panes.append(E / f'trip-{k}.mp4')
    info_at = segs['13-outro']['_info_at']
    fc = (f'[1:v]scale={W}:{H}:flags=lanczos[a];[2:v]scale={W}:{H}:flags=lanczos[b];[3:v]scale={W}:{H}:flags=lanczos[c];'
          f'[4:v]format=rgba,fade=t=in:st={info_at:.2f}:d=0.4:alpha=1[i];'
          f'[0:v][a]overlay={xs[0]}:{Y}[o1];[o1][b]overlay={xs[1]}:{Y}[o2];[o2][c]overlay={xs[2]}:{Y}[o3];[o3][i]overlay=0:0,fps=30,format=yuv420p[v]')
    run(['-loop', 1, '-framerate', 30, '-i', E / 'outro-bg.png', '-i', panes[0], '-i', panes[1], '-i', panes[2], '-loop', 1, '-framerate', 30, '-i', E / 'outro-info.png',
         '-filter_complex', fc, '-map', '[v]', '-frames:v', round(dur * FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', out])
    run(['-i', E / 'trip-side-0.wav', '-af', f'volume=0.6,apad,atrim=duration={dur:.4f}', '-ac', 2, '-ar', SR, out.with_suffix('.wav')])

def stamp(t): cs = round(t * 100); return f'{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}'
def srt(t): ms = round(t * 1000); return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'

ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '[V4+ Styles]',
       'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
       'Style: Default,Microsoft YaHei,50,&H00FFFFFF,&H00FFFFFF,&H00101018,&H90000000,-1,0,0,0,100,100,0,0,1,3.2,1,2,90,90,280,1',
       '[Events]', 'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text']
subs, timeline, parts, offset = [], [], [], 0.0
for sid, dur, shots in PLAN:
    seg = segs[sid]; dur = fr(dur)
    vj = json.loads((A / f'{sid}.json').read_text(encoding='utf-8'))
    marks = vj['marks']; last = (marks[-1]['offset'] + marks[-1]['duration']) / 1e7
    assert dur >= LEAD + last + 0.3, (sid, dur, last)
    # 逐词时间戳 → 短语字幕（读音稿与字幕文本按同样的标点结构一一对应）
    spans, pos = [], 0
    for w in marks:
        n = len(clean(w['text'])); spans.append((pos, pos + n, w['offset'] / 1e7, (w['offset'] + w['duration']) / 1e7)); pos += n
    tmap = seg.get('tts', {}); pos = 0; seg_subs = []
    for line in seg['lines']:
        tp, dp = phrases(tmap.get(line, line)), phrases(line)
        assert len(tp) == len(dp), (sid, line)
        for t, dsp in zip(tp, dp):
            n = len(clean(t)); ww = [s for s in spans if s[1] > pos and s[0] < pos + n]; pos += n
            text = dsp.rstrip('，。；：')
            seg_subs.append({'start': offset + LEAD + ww[0][2], 'end': offset + LEAD + ww[-1][3], 'text': text, 'segment': sid, 'timing_source': 'Edge WordBoundary'})
    for i, s in enumerate(seg_subs):  # 显示到下一句开始前（最多多留 0.6 秒），保证阅读时间
        nxt = seg_subs[i + 1]['start'] if i + 1 < len(seg_subs) else offset + dur - 0.1
        s['end'] = min(max(s['end'] + 0.15, s['end']), nxt - 0.02) if i + 1 < len(seg_subs) else min(s['end'] + 0.6, nxt)
    subs += seg_subs
    if sid == '13-outro':  # 信息条在“现在电脑和手机都能玩”出现
        seg['_info_at'] = next(s['start'] for s in seg_subs if s['text'].startswith('现在电脑')) - offset - 0.1
    # 画面与游戏声
    p = E / f'{sid}.mp4'; shot_log = []
    if shots == 'triptych':
        triptych(dur, p); shot_log.append({'source': 'triptych', 'panes': TRIP})
    else:
        sub_parts, left = [], dur
        for i, (t0, ln) in enumerate(shots):
            last_shot = i == len(shots) - 1
            ln = fr(left if last_shot else ln)
            avail = 305.5 - t0
            freeze = max(0.0, ln - avail) if last_shot else 0.0
            sp = E / f'{sid}-{i}.mp4'; cut(t0, ln - freeze, sp, freeze); sub_parts.append(sp); left -= ln
            shot_log.append({'source': 'capture/views-run-1080p.mp4', 'source_in': t0, 'source_out': round(t0 + ln - freeze, 3), 'freeze_last_frame': round(freeze, 3), 'final_in': round(offset + dur - left - ln, 3), 'final_out': round(offset + dur - left, 3)})
        (E / f'{sid}.txt').write_text('\n'.join(f"file '{q.name}'" for q in sub_parts), encoding='utf-8')
        run(['-f', 'concat', '-safe', '0', '-i', E / f'{sid}.txt', '-c', 'copy', p])
        wl =E / f'{sid}-a.txt'; wl.write_text('\n'.join(f"file '{q.with_suffix('.wav').name}'" for q in sub_parts), encoding='utf-8')
        run(['-f', 'concat', '-safe', '0', '-i', wl, '-c:a', 'pcm_s16le', p.with_suffix('.wav')])
    # 人声：延迟 LEAD 后补齐到段长
    run(['-i', A / f'{sid}.mp3', '-af', f'aresample={SR},adelay={int(LEAD * 1000)}:all=1,apad,atrim=duration={dur:.4f}', '-ac', 2, '-ar', SR, E / f'{sid}-voice.wav'])
    parts.append(sid)
    timeline.append({'id': sid, 'final_in': round(offset, 3), 'final_out': round(offset + dur, 3), 'duration': dur, 'voice': f'audio/shared-zh/{sid}.mp3', 'voice_last_word_end': round(last, 3), 'lines': seg['lines'], 'shots': shot_log})
    offset += dur
    print('segment', sid, dur, flush=True)

total = round(offset, 3)
panel = next(sh for t in timeline if t['id'] == '11-result' for sh in t['shots'] if sh['source_in'] == 300.6)
for i, s in enumerate(subs):  # 结算面板居中（底边约 y=908），这段字幕移到面板下方
    s['y'] = 1010 if panel['final_in'] - 0.05 <= s['start'] < panel['final_out'] else 800
    ass.append(f"Dialogue: 0,{stamp(s['start'])},{stamp(s['end'])},Default,,0,0,0,,{{\\an2\\pos(960,{s['y']})}}{s['text']}")
(E / 'captions.ass').write_text('\n'.join(ass) + '\n', encoding='utf-8-sig')
(E / 'captions.srt').write_text('\n\n'.join(f"{i + 1}\n{srt(s['start'])} --> {srt(s['end'])}\n{s['text']}" for i, s in enumerate(subs)) + '\n', encoding='utf-8-sig')
(E / 'alignment.json').write_text(json.dumps(subs, ensure_ascii=False, indent=1), encoding='utf-8')
(E / 'timeline.json').write_text(json.dumps({'source': 'capture/views-run-1080p.mp4', 'fps': FPS, 'lead': LEAD, 'total': total, 'segments': timeline}, ensure_ascii=False, indent=1), encoding='utf-8')
for name, ext in (('picture', '.mp4'), ('game', '.wav'), ('voice', '-voice.wav')):
    (E / f'{name}.txt').write_text('\n'.join(f"file '{sid}{ext}'" for sid in parts), encoding='utf-8')
run(['-f', 'concat', '-safe', '0', '-i', E / 'picture.txt', '-c', 'copy', E / 'picture.mp4'])
run(['-f', 'concat', '-safe', '0', '-i', E / 'game.txt', '-c:a', 'pcm_s16le', E / 'game.wav'])
run(['-f', 'concat', '-safe', '0', '-i', E / 'voice.txt', '-c:a', 'pcm_s16le', E / 'voice.wav'])
mix = (f'[0:a]volume=1.0,asplit=2[v][sc];[1:a]volume=0.20[g];[g][sc]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=250[gd];'
       f'[v][gd]amix=inputs=2:duration=first:normalize=0,afade=t=out:st={total - 1.2:.3f}:d=1.2[m]')
run(['-i', E / 'voice.wav', '-i', E / 'game.wav', '-filter_complex', mix, '-map', '[m]', '-ar', SR, '-ac', 2, E / 'mix-raw.wav'])
log = run(['-i', E / 'mix-raw.wav', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json', '-f', 'null', '-'])
m = json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}', log)[-1])
norm = (f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
        f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
run(['-i', E / 'mix-raw.wav', '-af', norm + f',aresample={SR}', '-ar', SR, '-ac', 2, E / 'mix-final.wav'])
run(['-i', E / 'picture.mp4', '-i', E / 'mix-final.wav', '-vf', f"scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709:flags=lanczos,format=yuv420p,ass=edit/shared-zh/captions.ass:fontsdir=C\\\\:/Windows/Fonts,fade=t=out:st={total - 1.2:.3f}:d=1.2,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709",
     '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
     '-c:a', 'aac', '-b:a', '192k', '-ar', SR, '-movflags', '+faststart', '-t', f'{total:.3f}', FINAL])
sha = hashlib.sha256(FINAL.read_bytes()).hexdigest()
(R / 'qa').mkdir(exist_ok=True)
(R / 'qa/render.json').write_text(json.dumps({'final': str(FINAL.relative_to(R.parent)), 'sha256': sha, 'duration': total, 'loudnorm_pass1': m}, ensure_ascii=False, indent=1), encoding='utf-8')
print('FINAL', FINAL, total, sha)
