"""可复现的 1080p 剪辑：按 timeline-plan.json 逐段取镜头，配音时长决定每段长度，字幕时间来自配音的真实时间戳。

用法：python render.py <配音目录> <输出标签>
  配音目录  audio/shared-zh（Edge 云希，正式）或 audio/draft-sapi（系统自带语音，只出画面样片）
  输出标签  final（写入 ../final/<平台>/）或 draft（写入 tmp/draft/，文件名带「样片」）
三个版本：bilibili-zh（结尾讲 Toy 入口，烧录字幕）、douyin-zh（通用结尾，烧录字幕）、youtube-zh（通用结尾，不烧字幕，另出中文 SRT）。
"""
import json, re, subprocess, sys, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

R = Path(__file__).resolve().parent
VOICE = R / (sys.argv[1] if len(sys.argv) > 1 else 'audio/shared-zh')
TAG = sys.argv[2] if len(sys.argv) > 2 else 'final'
DRAFT = TAG != 'final'
E = R / 'edit' / ('shared-zh' if not DRAFT else 'draft'); E.mkdir(parents=True, exist_ok=True)
MK = R.parent.parent.parent / 'media-kit'
FONT = 'C:/Windows/Fonts/msyhbd.ttc'
VOICE_GAIN = float(sys.argv[3]) if len(sys.argv) > 3 else 1.3   # 人声相对游戏声的增益，最后整体再做响度归一


def run(args): subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] + args, check=True)
def duration(p): return float(json.loads(subprocess.check_output(['ffprobe', '-v', 'quiet', '-show_format', '-of', 'json', str(p)]))['format']['duration'])
def has_audio(p): return bool(json.loads(subprocess.check_output(['ffprobe', '-v', 'quiet', '-select_streams', 'a', '-show_streams', '-of', 'json', str(p)]))['streams'])
def stamp(t): return f'{int(t // 3600)}:{int(t % 3600 // 60):02}:{t % 60:05.2f}'
def srtstamp(t): return f'{int(t // 3600):02}:{int(t % 3600 // 60):02}:{int(t % 60):02},{round(t % 1 * 1000):03}'
def clean(s): return ''.join(re.findall(r'[\w\u4e00-\u9fff]', s))
def font(n): return ImageFont.truetype(FONT, n)


def label_png(text, name):
    """左上角的说明标签（开发中画面 / 改动前 / 改动后），透明底，叠在镜头上。"""
    p = E / f'label-{name}.png'
    im = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = font(40); w = d.textlength(text, font=f)
    d.rounded_rectangle((56, 118, 56 + w + 56, 118 + 76), radius=18, fill=(20, 28, 40, 215), outline=(255, 211, 77, 255), width=3)
    d.text((84, 130), text, font=f, fill=(255, 241, 208, 255))
    im.save(p); return p


def endcard(kind):
    p = E / f'endcard-{kind}.png'
    im = Image.new('RGB', (1920, 1080), '#12283a'); d = ImageDraw.Draw(im)
    d.rounded_rectangle((110, 105, 1810, 955), radius=35, fill='#1b3a52', outline='#8fb2c9', width=3)
    d.text((180, 170), '赤色要塞 3D', font=font(106), fill='#fff2ca')
    d.text((185, 332), '第三关 · 港口 已上线　　海滩登陆 / 废墟城 / 港口', font=font(44), fill='#bfe0f2')
    d.line((185, 425, 1735, 425), fill='#6f97b0', width=3)
    if kind == 'bili':
        d.text((185, 480), '点击视频下方的 Toy 入口，直接试玩', font=font(53), fill='#fff2ca')
        d.text((185, 585), '投票与愿望单：百宝箱 → 游戏 → 自研游戏投票榜', font=font(39), fill='#d3dfe8')
    else:
        d.text((185, 480), '网页版电脑手机都能玩，入口见简介', font=font(53), fill='#fff2ca')
        d.text((185, 585), '原作一共六关，下一关想先看哪个，评论里告诉我', font=font(39), fill='#d3dfe8')
    d.text((185, 885), '粉丝向非官方重制 · 原作版权归 Konami 所有', font=font(25), fill='#a9bed0')
    im.save(p); return p


def audio_of(sid):
    for ext in ('.mp3', '.wav'):
        if (VOICE / (sid + ext)).exists(): return VOICE / (sid + ext)
    raise SystemExit(f'缺少配音：{VOICE / sid}')


def word_spans(sid, text, dur):
    """把配音的词边界换成（字符起点, 字符终点, 开始秒, 结束秒），字符位置按去掉标点后的文字计。"""
    marks = json.loads((VOICE / (sid + '.json')).read_text(encoding='utf-8-sig'))['marks']
    spans = []
    if marks and 'pos' in marks[0]:   # 系统语音 / 本地逐句合成：给的是原文里的字符位置和音频位置
        for i, m in enumerate(marks):
            a = len(clean(text[:m['pos']])); b = a + len(clean(text[m['pos']:m['pos'] + m['chars']]))
            start = m['offset'] / 1e7; end = marks[i + 1]['offset'] / 1e7 if i + 1 < len(marks) else dur
            if m.get('duration'): end = start + m['duration'] / 1e7   # 逐句合成知道每句的真实时长
            if b > a: spans.append((a, b, start, min(end, dur)))
    else:                              # Edge：按顺序的词与起止时间
        pos = 0
        for m in marks:
            size = len(clean(m['text'])); spans.append((pos, pos + size, m['offset'] / 1e7, (m['offset'] + m['duration']) / 1e7)); pos += size
    return spans


config = json.loads((R / 'narration.json').read_text(encoding='utf-8'))
plan = json.loads((R / 'timeline-plan.json').read_text(encoding='utf-8'))
texts = {s['id']: s['text'] for s in config['segments']}
SRC = plan['sources']
ASS_HEAD = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', 'ScaledBorderAndShadow: yes', '[V4+ Styles]',
            'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
            'Style: Default,Microsoft YaHei,50,&H00FFFFFF,&H00FFFFFF,&H00251B12,&H90000000,-1,0,0,0,100,100,0,0,1,3.2,1.2,2,80,80,60,1',
            '[Events]', 'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text']


def render_segment(seg):
    sid = seg['id']; voice = audio_of(sid); vdur = duration(voice)
    dur = max(vdur + .6, seg.get('min_duration', 0)); lead = .22
    part = E / f'{sid}.mp4'
    spans = word_spans(sid, texts[sid], vdur)
    meta = json.loads((VOICE / (sid + '.json')).read_text(encoding='utf-8-sig'))
    if meta.get('unit_level'): phrases = [m['text'] for m in meta['marks']]   # 逐句合成：字幕就按合成时的句子显示
    else: phrases = [p.strip() for p in re.findall(r'[^，。！？；：]+[，。！？；：]?', texts[sid]) if p.strip()]
    subs = []; pos = 0
    for phrase in phrases:
        size = len(clean(phrase)); ww = [w for w in spans if w[1] > pos and w[0] < pos + size]; pos += size
        if not ww: continue
        subs.append({'start': lead + ww[0][2], 'end': min(dur - .08, lead + ww[-1][3] + .12), 'text': phrase.rstrip('，。；：'), 'id': sid})
    for a, b in zip(subs, subs[1:]):   # 相邻两句不重叠
        b['start'] = max(b['start'], a['start'] + .2); a['end'] = min(a['end'], b['start'] - .03)
    shots = seg['shots']; inputs = []; vf = []; af = []; remaining = dur; idx = 0; pieces = []; cursor = 0; elapsed = 0.0
    for i, sh in enumerate(shots):
        if i == len(shots) - 1: length = remaining
        elif 'phrases' in sh:   # 这个镜头盖住接下来的几句话
            cursor += sh['phrases']; length = min(remaining, max(0.3, subs[min(cursor, len(subs)) - 1]['end'] + 0.08 - elapsed))
        else: length = min(sh['duration'], remaining)
        remaining -= length; elapsed += length
        if length <= 0.05: continue
        src = sh['source']
        if src.startswith('card:'):
            img = endcard(src.split(':')[1]); inputs += ['-loop', '1', '-framerate', '30', '-i', str(img)]; still = True; mute = True
        elif src.endswith('.png'):
            inputs += ['-loop', '1', '-framerate', '30', '-i', str((R / src).resolve() if not src.startswith('mk:') else MK / src[3:])]; still = True; mute = True
        else:
            path = (R / SRC[src]).resolve() if src in SRC else (R / src).resolve()
            inputs += ['-ss', str(sh['in']), '-i', str(path)]; still = False; mute = sh.get('mute') or not has_audio(path)
        v = f'[{idx}:v]trim=duration={length},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30'
        if still and sh.get('zoom'):   # 静态截图慢慢推近一点，免得画面死住
            v = f'[{idx}:v]scale=2304:1296:flags=lanczos,zoompan=z=\'1+0.06*on/{int(length * 30)}\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d={int(length * 30) + 2}:s=1920x1080:fps=30,trim=duration={length},setpts=PTS-STARTPTS,setsar=1'
        k = len(pieces)
        if sh.get('label'):
            lp = label_png(sh['label'], f'{sid}-{i}'); inputs += ['-loop', '1', '-framerate', '30', '-i', str(lp)]
            vf.append(v + f'[b{k}];[b{k}][{idx + 1}:v]overlay=0:0:shortest=1,trim=duration={length},setpts=PTS-STARTPTS[v{k}]'); nxt = idx + 2
        else:
            vf.append(v + f'[v{k}]'); nxt = idx + 1
        af.append((f'anullsrc=r=48000:cl=stereo,atrim=duration={length}[a{k}]' if mute else f'[{idx}:a]atrim=duration={length},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a{k}]'))
        pieces.append({'source': src, 'in': sh.get('in'), 'duration': round(length, 3), 'label': sh.get('label')}); idx = nxt
    n = len(pieces); inputs += ['-i', str(voice)]
    gain = seg.get('game_volume', 0.16)
    filt = ';'.join(vf + af) + ';' + ''.join(f'[v{i}][a{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=1[v][g];[g]volume={gain}[gq];[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={int(lead * 1000)}:all=1,apad,atrim=duration={dur},volume={VOICE_GAIN}[n];[gq][n]amix=inputs=2:normalize=0[a]'
    run(inputs + ['-filter_complex', filt, '-map', '[v]', '-map', '[a]', '-t', str(dur), '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', str(part)])
    return {'id': sid, 'part': part, 'duration': dur, 'voice_seconds': vdur, 'subs': subs, 'pieces': pieces, 'text': texts[sid]}


rendered = {seg['id']: render_segment(seg) for seg in plan['segments']}
for sid, r in rendered.items(): print('segment', sid, round(r['duration'], 2), flush=True)

VARIANTS = {'bilibili-zh': {'end': '13-end-bili', 'burn': True}, 'douyin-zh': {'end': '13-end-generic', 'burn': True}, 'youtube-zh': {'end': '13-end-generic', 'burn': False}}
NAMES = {'bilibili-zh': 'gameplay-zh-final.mp4', 'douyin-zh': 'gameplay-zh-final.mp4', 'youtube-zh': 'gameplay-youtube-final.mp4'}
report = {}
assemblies = {}
for variant, cfg in VARIANTS.items():
    order = [s['id'] for s in plan['segments'] if not s['id'].startswith('13-end')] + [cfg['end']]
    key = cfg['end']
    offset = 0; subs = []; timeline = []
    for sid in order:
        r = rendered[sid]
        for s in r['subs']: subs.append({**s, 'start': offset + s['start'], 'end': offset + s['end'], 'timing_source': 'voice word boundaries'})
        timeline.append({'id': sid, 'start': round(offset, 3), 'end': round(offset + r['duration'], 3), 'voice_seconds': round(r['voice_seconds'], 3), 'text': r['text'], 'shots': r['pieces']})
        offset += r['duration']
    if key not in assemblies:
        (E / f'concat-{key}.txt').write_text('\n'.join(f"file '{rendered[s]['part'].name}'" for s in order), encoding='utf-8')
        run(['-f', 'concat', '-safe', '0', '-i', str(E / f'concat-{key}.txt'), '-c', 'copy', str(E / f'assembly-{key}.mp4')])
        assemblies[key] = E / f'assembly-{key}.mp4'
    ass = ASS_HEAD + [f"Dialogue: 0,{stamp(s['start'])},{stamp(s['end'])},Default,,0,0,0,,{{\\an2\\pos(960,820)}}{s['text']}" for s in subs]
    (E / f'captions-{variant}.ass').write_text('\n'.join(ass), encoding='utf-8-sig')
    (E / f'captions-{variant}.srt').write_text('\n\n'.join(f"{i + 1}\n{srtstamp(s['start'])} --> {srtstamp(s['end'])}\n{s['text']}" for i, s in enumerate(subs)) + '\n', encoding='utf-8-sig')
    (E / f'timeline-{variant}.json').write_text(json.dumps(timeline, ensure_ascii=False, indent=1), encoding='utf-8')
    if DRAFT:
        out_dir = R / 'tmp' / 'draft'; out = out_dir / f'{variant}-画面样片-临时配音.mp4'
    else:
        out_dir = R.parent / 'final' / variant; out = out_dir / NAMES[variant]
    out_dir.mkdir(parents=True, exist_ok=True)
    vfs = []
    if cfg['burn']: vfs.append(f"ass={(E / f'captions-{variant}.ass').relative_to(R).as_posix()}")
    if DRAFT: vfs.append("drawtext=fontfile='C\\:/Windows/Fonts/msyhbd.ttc':text='画面样片 · 临时配音（非正式）':fontsize=34:fontcolor=white@0.85:box=1:boxcolor=black@0.45:boxborderw=12:x=w-tw-40:y=h-th-36")
    vfs.append('scale=in_range=pc:out_range=tv,format=yuv420p')   # 截图来的原片是全范围色彩，成片转成电视范围，免得有的播放器把画面放灰或放暗
    vfs.append(f'fade=t=out:st={offset - 1.0}:d=1.0')
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(assemblies[key]), '-vf', ','.join(vfs), '-af', f'loudnorm=I=-15:TP=-1.5:LRA=9,afade=t=out:st={offset - 1.0}:d=1.0',
           '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '19', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', str(out)]
    subprocess.run(cmd, cwd=R, check=True)
    if not cfg['burn']:   # YouTube：中文与英文可切换字幕，英文沿用同一时间轴
        en = json.loads((R / 'edit/glossary.json').read_text(encoding='utf-8'))['en']
        missing = [s['text'] for s in subs if s['text'] not in en]
        if missing: raise SystemExit('英文字幕缺译文：' + '；'.join(missing))
        (E / f'captions-{variant}-en.srt').write_text('\n\n'.join(f"{i + 1}\n{srtstamp(s['start'])} --> {srtstamp(s['end'])}\n{en[s['text']]}" for i, s in enumerate(subs)) + '\n', encoding='utf-8-sig')
        if not DRAFT:
            (out_dir / 'captions-zh.srt').write_text((E / f'captions-{variant}.srt').read_text(encoding='utf-8-sig'), encoding='utf-8-sig')
            (out_dir / 'captions-en.srt').write_text((E / f'captions-{variant}-en.srt').read_text(encoding='utf-8-sig'), encoding='utf-8-sig')
    report[variant] = {'file': str(out.relative_to(R.parent)).replace('\\', '/'), 'seconds': round(offset, 2), 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'burned_subtitles': cfg['burn'], 'ending': cfg['end'], 'voice_dir': str(VOICE.relative_to(R)).replace('\\', '/')}
    print('FINAL' if not DRAFT else 'DRAFT', variant, out, round(offset, 2), flush=True)
(E / 'render-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
