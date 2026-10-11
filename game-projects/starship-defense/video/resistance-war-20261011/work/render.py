"""抗战战役·亮剑名场面 —— 三章拼接渲染。

输入：capture/war-ch0|ch1|ch2/raw.mp4（已编码原片）+ 各自 capture.json（事件时间码）
      audio/shared-zh/<id>.mp3 + <id>.json（云希配音 + 真实 WordBoundary）
      narration.json（13 段解说文本）
输出：final/bilibili-zh、douyin-zh、youtube-zh 的成片 + 烧录字幕 + 时间线

做法（沿用 rv-town-20261009 已验证流程）：
- 每段解说的时长 = 该段配音实测时长 + 余量，镜头从对应章 raw.mp4 的事件时间码取源区间；
- 中文烧录字幕用配音 WordBoundary 的真实时间戳，按语义分句；
- 人声优先：游戏声压低到 0.16，侧链压缩避免盖解说；综合响度目标 -16 LUFS。
"""
from pathlib import Path
import json, subprocess, re, wave, math, os, textwrap

R = Path(__file__).resolve().parent
E = R / 'edit' / 'shared-zh'; A = R / 'audio' / 'shared-zh'; FINAL = R.parent / 'final'
E.mkdir(parents=True, exist_ok=True); (E / 'shots').mkdir(exist_ok=True)
for v in ['bilibili-zh', 'douyin-zh', 'youtube-zh']:
    (FINAL / v).mkdir(parents=True, exist_ok=True)


def ff(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], check=True)


def write(p, o):
    p.write_text(json.dumps(o, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def norm(t):
    return re.sub(r'[^\w\u4e00-\u9fff]', '', t).casefold()


# ---- 三章原片与其事件时间码（视频时间轴，已减去各自 zero 基准）----
CHAPTERS = {'ch0': 'war-ch0', 'ch1': 'war-ch1', 'ch2': 'war-ch2'}
chap_meta = {}
for key, take in CHAPTERS.items():
    cj = R / 'capture' / take / 'capture.json'
    if not cj.exists():
        raise SystemExit(f'缺少 {cj}，请先录制并编码 {take}')
    cap = json.loads(cj.read_text(encoding='utf-8'))
    frames = cap['frames']
    zero = frames[0]['timestamp'] - cap['started'] / 1000
    ev = {row['name']: row['t'] - zero for row in cap['events']}
    shots = {s['name']: {'start': s['startWall'] - zero, 'end': (s['endWall'] or s['startWall']) - zero}
             for s in cap.get('shots', [])}
    chap_meta[key] = {'raw': f'capture/{take}/raw.mp4', 'duration': frames[-1]['timestamp'] - frames[0]['timestamp'] + 1/30,
                      'event': ev, 'shot': shots}
    print(f'{key}: {take} 时长 {chap_meta[key]["duration"]:.1f}s, 事件 {len(ev)}, 镜头 {len(shots)}')

# 便捷取值：优先事件时间码，回退到镜头起点
def ev(ch, name, default=0.0):
    return chap_meta[ch]['event'].get(name, chap_meta[ch]['shot'].get(name, {}).get('start', default))

def shot(ch, name):
    s = chap_meta[ch]['shot'].get(name)
    return (s['start'], s['end']) if s else (0.0, 0.0)


# ---- 镜头映射 spec ----
# 每条: (章, 源入点函数, 时长秒 or None=到段末, 角标文字, 是否静帧)
# 源入点用事件/镜头时间码定位；时长 None 表示填满该段配音的剩余帧数。
cfg = json.loads((R / 'narration.json').read_text(encoding='utf-8'))

# 第1章 ch0 事件锚点
CH0 = {
 'menu':      lambda: shot('ch0','M03-war-menu')[0],
 'brief':     lambda: shot('ch0','M04-ch0-briefing')[0],
 'aim':       lambda: shot('ch0','M29-aim-toggle')[0],
 'advance':   lambda: shot('ch0','M05-ch0-p0-advance')[0],
 'weapon':    lambda: shot('ch0','M06-weapon-switch')[0],
 'order':     lambda: shot('ch0','M07-squad-order')[0],
 'trench':    lambda: shot('ch0','M08-trench-capture')[0],
 'grenadeL':  lambda: shot('ch0','M09-grenade-left-bunker')[0],
 'grenadeR':  lambda: shot('ch0','M10-grenade-right-bunker')[0],
 'hilltop':   lambda: shot('ch0','M11-hilltop-assault')[0],
}
CH1 = {
 'mount':     lambda: shot('ch1','M12-mount')[0],
 'view':      lambda: shot('ch1','M28-view-cycle')[0],
 'charge':    lambda: shot('ch1','M14-cavalry-charge')[0],
 'escort':    lambda: shot('ch1','M16-escort-wagon')[0],
}
CH2 = {
 'outpost':   lambda: shot('ch2','M18-ch2-outpost')[0],
 'street':    lambda: shot('ch2','M19-street-bunker')[0],
 'carry':     lambda: shot('ch2','M20-carry-shell')[0],
 'deliver':   lambda: shot('ch2','M21-deliver-shell')[0],
 'cannon':    lambda: shot('ch2','M23-cannon-aim')[0],
 'fire':      lambda: shot('ch2','M24-cannon-fire')[0],
 'tow':       lambda: shot('ch2','M25-tow-cannon')[0],
 'town':      lambda: shot('ch2','M26-town-assault')[0],
 'result':    lambda: max(0.0, ev('ch2','ch2-result') - 0.5),
}

spec = {
 # 开场钩子：攻城炮轰城门（第3章 M24）+ 骑兵冲锋（第2章 M14）
 '01-hook':        [('ch2', CH2['fire'], 4.5, '平安县城 · 攻城炮破门', False),
                    ('ch1', CH1['charge'], 4.2, '骑兵连 · 冲锋突围', False),
                    ('ch0', CH0['menu'], None, '抗战战役 · 亮剑名场面', False)],
 '02-mode-intro':  [('ch0', CH0['menu'], 5.5, '主菜单 · 三章战役', False),
                    ('ch0', CH0['brief'], None, '第一章 · 李家坡交通壕', False)],
 '03-ch1-trench':  [('ch0', CH0['advance'], 7.5, '沿交通壕推进 · 实战交火', False),
                    ('ch0', CH0['weapon'], 5.0, '按距离换枪 · 三八式/捷克式', False),
                    ('ch0', CH0['order'], None, 'T 下令 · 突击班前压', False)],
 '04-ch1-grenade': [('ch0', CH0['grenadeL'], 8.5, '手雷炸左堡垒 · 站 18m 外', False),
                    ('ch0', CH0['grenadeR'], None, '手雷炸右堡垒 · 250血两发清', False)],
 '05-ch1-hilltop': [('ch0', CH0['trench'], 4.0, '交通壕驻守读秒', False),
                    ('ch0', CH0['hilltop'], None, '坡顶总攻 · 第一章结算', False)],
 '06-ch2-mount':   [('ch1', CH1['mount'], 7.0, '按 I 上马 · 军刀出鞘', False),
                    ('ch1', CH1['view'], None, 'C 切视角 · 骑兵连集结', False)],
 '07-ch2-charge':  [('ch1', CH1['charge'], None, 'K 冲刺 + J 挥刀 · 冲破封锁线', False)],
 '08-ch2-escort':  [('ch1', CH1['escort'], None, '护送运输车 · 抵达撤离点', False)],
 '09-ch3-outpost': [('ch2', CH2['outpost'], 7.0, '第三章 · 城外机枪阵地', False),
                    ('ch2', CH2['street'], None, '手雷拆街道堡垒', False)],
 '10-ch3-shell':   [('ch2', CH2['carry'], 6.0, '搬炮弹 · 人物负重变慢', False),
                    ('ch2', CH2['deliver'], None, '送到攻城炮位', False)],
 '11-ch3-cannon':  [('ch2', CH2['cannon'], 7.5, '操炮 · 落点环对准城门', False),
                    ('ch2', CH2['fire'], None, '开炮三发 · 轰开平安县城门', False)],
 '12-ch3-town':    [('ch2', CH2['town'], None, '突入县城 · 巷战夺守备队部', False)],
 '13-close':       [('ch2', CH2['fire'], 5.0, '战役通关 · 三章名场面', False),
                    ('ch2', CH2['result'], 5.0, '平安县城 · 通关结算', False),
                    ('STILL', None, None, '', True)],
}

# ---- 英文字幕（YouTube 交付）----
english = {
 '01-hook': ['Cavalry company, charge!','This shot is fired at Pingan County town.','I built a new anti-Japanese-war campaign in Swarm Siege,','turning famous scenes into playable levels.'],
 '02-mode-intro': ['The entry is right in the main menu,','called "Anti-Japanese War Campaign".','Three chapters: the trench assault at Lijia Slope,','the cavalry breakout, and shelling Pingan County town.','You play Li Yunlong, with Zhang Dabiao and Sun Desheng as squadmates.'],
 '03-ch1-trench': ['Chapter one is infantry combat.','Push north along the trenches,','facing Japanese infantry all the way.','There are four period weapons here.'],
 '04-ch1-grenade': ['At the foot of the slope are two machine-gun bunkers,','each with 250 health.','Here is a catch: grenades follow an arc,','so standing too close throws them over the bunker.','Fall back beyond sixteen meters,','and two grenades wipe it out.'],
 '05-ch1-hilltop': ['Once the bunkers are down,','assault the hilltop command post.','Hold it for a few seconds and chapter one is clear.','If you liked this fight, drop a like and I will keep going.'],
 '06-ch2-mount': ['Chapter two changes the game: cavalry.','Walk over and press I to mount,','the rifle is stowed and the saber drawn.'],
 '07-ch2-charge': ['Then comes the charge.','Press K to sprint, the horse speed maxes out,','the impact deals heavy damage, then a saber follow-up.','You must cut down at least six on the blockade line.'],
 '08-ch2-escort': ['Breaking through is not the end;','a supply wagon must evacuate.','Guard it and clear enemies,','enemies within nine meters drain its health.','Escort it all the way to the evac point.'],
 '09-ch3-outpost': ['Chapter three, Pingan County town.','First take the outer machine-gun post and street bunker,','same as before, throw grenades from range.'],
 '10-ch3-shell': ['Then the fun part: hauling shells.','Walk to the ammo crate and press I to carry,','the character slows down,','then deliver it to the siege cannon.'],
 '11-ch3-cannon': ['Now man the cannon.','Turn the barrel, adjust elevation,','an impact ring turns red when it lines up on the gate.','Fire! The gate has 750 health,','each shell does 270, three shots blow it open.'],
 '12-ch3-town': ['Once the gate falls,','lead the regiment into town for street fighting','and capture the garrison HQ to finish the campaign.'],
 '13-close': ['This campaign was developed with Codex,','playable in the browser on both PC and phone,','link in the description.','Which would you play first, the cavalry charge or the cannon?','You can also tell me what to make next on the voting page.'],
}

# ---- 逐段生成配音 wav、字幕、镜头 ----
cursor = 0.0; captions = []; en_captions = []; segments = []; shots = []
for seg in cfg['segments']:
    sid = seg['id']
    wav = A / (sid + '.wav')
    ff(['-i', A / (sid + '.mp3'), '-ar', 48000, '-ac', 2, '-c:a', 'pcm_s16le', wav])
    with wave.open(str(wav)) as w:
        vdur = w.getnframes() / w.getframerate()
    # 段总时长 = 配音时长 + 前后余量（结尾段多留 2s 给淡出与收尾卡）
    pad_tail = 2.0 if sid == '13-close' else 0.5
    seg_dur = vdur + 0.34 + pad_tail
    total_frames = math.ceil(seg_dur * 30)

    # 字幕：按配音 WordBoundary 真实时间戳，按标点分句
    marks = json.loads((A / (sid + '.json')).read_text(encoding='utf-8'))['marks']
    assert norm(seg['text']) == ''.join(norm(m['text']) for m in marks), f'{sid} 词边界与文本不符'
    clauses = [x.strip() for x in re.split(r'(?<=[，。？！；])', seg['text']) if x.strip()]
    en = english.get(sid, [])
    # 英文句数需与中文分句对齐；不齐则按整段单条英文兜底
    if len(clauses) != len(en):
        en = [' '.join(en)] * len(clauses) if en else [''] * len(clauses)
    offset = 0; mark_start = 0
    for clause, translated in zip(clauses, en):
        target = offset + len(norm(clause)); last = mark_start; count = offset
        while last < len(marks) and count < target:
            count += len(norm(marks[last]['text'])); last += 1
        st = marks[mark_start]['offset'] / 1e7
        en_t = (marks[last - 1]['offset'] + marks[last - 1]['duration']) / 1e7
        row = {'start': cursor + .12 + st, 'end': min(cursor + total_frames/30 - .05, cursor + .12 + en_t + .07),
               'text': clause, 'segment': sid}
        captions.append(row); en_captions.append({**row, 'text': translated})
        offset = target; mark_start = last
    segments.append({**seg, 'start': cursor, 'end': cursor + total_frames/30, 'duration': total_frames/30,
                     'voice_duration': vdur, 'voice_offset': .12, 'frames': total_frames, 'wav': str(wav.relative_to(R))})

    # 镜头：按 spec 从对应章 raw.mp4 取源区间，填满该段帧数
    remaining = total_frames; local = cursor
    for source_key, in_fn, seconds, label, still in spec[sid]:
        count = remaining if seconds is None else min(remaining, round(seconds * 30))
        if count <= 0:
            continue
        remaining -= count; dur = count / 30; index = len(shots)
        target = E / 'shots' / f'{index:02d}.mp4'
        if still:
            src = str(E / 'closing.png'); src_in = 0
        else:
            ch = source_key; src = chap_meta[ch]['raw']
            src_in = max(0.0, in_fn() if callable(in_fn) else float(in_fn))
            src_in = min(src_in, chap_meta[ch]['duration'] - dur - 0.1)
        s = {'index': index, 'segment': sid, 'chapter': source_key, 'start': local, 'end': local + dur,
             'duration': dur, 'source': src, 'source_in': src_in, 'source_out': src_in + dur,
             'speed': 1, 'label': label, 'still': still}
        shots.append(s)
        if label:
            pass  # label 作为角标在 ASS 里生成
        local += dur
        print(f'shot {sid:16} {source_key:5} in={src_in:6.1f}s dur={dur:.2f}s label={label}', flush=True)
    assert remaining == 0, f'{sid} 镜头未填满：remaining={remaining}'
    cursor += total_frames / 30

# ---- 收尾卡（用章节选择界面做背景：三章卡片正对"三章名场面"主题，且无战斗 HUD 干扰）----
from PIL import Image, ImageDraw, ImageFont
outro_s, _ = shot('ch2', 'M30-outro')
ff(['-ss', f'{outro_s + 3.0:.2f}', '-i', R / chap_meta['ch2']['raw'], '-frames:v', '1', E / '_closing_bg.png'])
im = Image.open(E / '_closing_bg.png').convert('RGBA')
# 深色遮罩压暗章节卡文字，收尾卡三行字垂直居中（字幕在 y≈790，不与第三行重叠）
overlay = Image.new('RGBA', im.size, (12, 18, 14, 236)); im = Image.alpha_composite(im, overlay)
d = ImageDraw.Draw(im)
def font(n):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', n)
for y, text, size, color in [(360, '虫潮围城 · 抗战战役', 76, '#ffe39b'),
                             (500, '三章名场面 · 全程正常规则通关', 44, '#eef4e8'),
                             (630, '网页可玩 · 电脑手机都行', 50, '#8be1ca')]:
    d.text((960, y), text, font=font(size), fill=color, anchor='mt')
im.convert('RGB').save(E / 'closing.png')

# ---- ASS 字幕 ----
def ass_time(t):
    cs = round(t * 100); return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'
def srt_time(t):
    ms = round(t * 1000); return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
def srt(rows):
    out = []
    for i, r in enumerate(rows):
        txt = r['text']
        if re.search('[a-zA-Z]{3}', txt):
            txt = '\n'.join(textwrap.wrap(txt, width=64, break_long_words=False))
        out.append(f'{i+1}\n{srt_time(r["start"])} --> {srt_time(r["end"])}\n{txt}')
    return '\n\n'.join(out) + '\n'

header = '''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,46,&H00FFFFFF,&H00FFFFFF,&H00201810,&H99000000,-1,0,0,0,100,100,0,0,1,3,1,2,150,150,300,1
Style: Label,Microsoft YaHei,30,&H00D7EFEB,&H00FFFFFF,&H00101820,&H99000000,0,0,0,0,100,100,0,0,1,2,0,2,70,70,118,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
ass = header; labels = header
for row in captions:
    # 中文按每行约 20 字换行
    text = '\\N'.join([row['text'][i:i+20] for i in range(0, len(row['text']), 20)])
    ass += f'Dialogue: 1,{ass_time(row["start"])},{ass_time(row["end"])},Default,,0,0,0,,{{\\an2\\pos(960,790)}}{text}\n'
for s in shots:
    if s['label']:
        # 角标放顶部居中（y=160）：战役 HUD 状态栏/武器栏/键位提示都在底部，
        # 顶部中央 y<110 是举枪/操炮按钮，y=160 落在按钮下方的空闲横带
        # （左侧 warHUD ≤342px、右侧小地图 ≥1766px，中间无 UI）。
        line = f'Dialogue: 0,{ass_time(s["start"])},{ass_time(s["end"])},Label,,0,0,0,,{{\\an8\\pos(960,160)}}{s["label"]}\n'
        ass += line; labels += line

# ---- 逐镜头切片 ----
for s in shots:
    full = R / s['source']; dur = s['duration']
    if s['still']:
        args = ['-loop', '1', '-framerate', 30, '-i', full, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
                '-vf', 'format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709']
    else:
        args = ['-ss', f'{s["source_in"]:.3f}', '-i', full, '-filter_complex',
                '[0:v]setpts=PTS-STARTPTS,fps=30,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=8[v];'
                '[0:a]asetpts=PTS-STARTPTS,aresample=48000,apad[a]', '-map', '[v]', '-map', '[a]']
    ff([*args, '-t', f'{dur:.3f}', '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '17', '-pix_fmt', 'yuv420p',
        '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-c:a', 'aac', '-ar', 48000, '-ac', 2, '-b:a', '192k', E / 'shots' / f'{s["index"]:02d}.mp4'])

# ---- 时间线记录 ----
timeline = {'width': 1920, 'height': 1080, 'fps': 30, 'duration': cursor, 'segments': segments,
            'shots': shots, 'subtitles': captions, 'english_subtitles': en_captions,
            'time_scale': 1, 'normal_rules': True, 'chapters': {k: v['raw'] for k, v in chap_meta.items()},
            'sources': [chap_meta[k]['raw'] for k in chap_meta], 'result_screen_hold_only': True}
write(E / 'timeline.json', timeline)
(E / 'captions.ass').write_text(ass, encoding='utf-8')
(E / 'labels.ass').write_text(labels, encoding='utf-8')
(E / 'captions-zh.srt').write_text(srt(captions), encoding='utf-8')
(E / 'captions-en.srt').write_text(srt(en_captions), encoding='utf-8')

# ---- 拼接画面 + 游戏声 ----
(E / 'shots.ffconcat').write_text('\n'.join("file 'shots/%02d.mp4'" % s['index'] for s in shots), encoding='utf-8')
picture = E / 'picture-with-game-audio.mp4'
ff(['-f', 'concat', '-safe', 0, '-i', E / 'shots.ffconcat', '-c', 'copy', picture])

# ---- 配音拼接（按段起点铺到 48k 立体声 PCM）----
pcm = bytearray(round(cursor * 48000) * 4)
for seg in segments:
    with wave.open(str(R / seg['wav'])) as w:
        data = w.readframes(w.getnframes())
    start = round((seg['start'] + seg['voice_offset']) * 48000) * 4
    pcm[start:start + len(data)] = data
with wave.open(str(A / 'narration.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(48000); w.writeframes(pcm)

# ---- 混音：游戏声压低 + 侧链，人声优先；再两遍 loudnorm 到 -16 LUFS ----
fade = cursor - 1.5; mix = A / 'mix-pre.wav'
ff(['-i', picture, '-i', A / 'narration.wav', '-filter_complex',
    f'[0:a]volume=0.16,afade=t=out:st={fade:.2f}:d=1.5[g];'
    f'[1:a]highpass=f=70,asplit=2[v][sc];'
    f'[g][sc]sidechaincompress=threshold=0.025:ratio=6:attack=12:release=180[d];'
    f'[d][v]amix=inputs=2:normalize=0,atrim=0:{cursor:.3f}[a]',
    '-map', '[a]', '-ar', 48000, '-ac', 2, mix])
p = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(mix), '-af',
                    'loudnorm=I=-16:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'],
                   capture_output=True, text=True, encoding='utf-8', check=True)
stats = json.JSONDecoder().raw_decode(p.stderr[p.stderr.rfind('{'):])[0]
write(E / 'loudnorm-pass1.json', stats)
nf = (f"loudnorm=I=-16:TP=-1:LRA=11:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
      f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:"
      f"offset={stats['target_offset']}:linear=true")
ff(['-i', mix, '-af', nf, '-ar', 48000, '-ac', 2, A / 'final-mix.wav'])
ff(['-i', picture, '-vn', '-c:a', 'pcm_s16le', A / 'game-edit.wav'])

# ---- 最终成片：B站/抖音烧中文字幕，YouTube 烧角标（另附可切换字幕）----
os.chdir(E)
for variant, subtitle, file in [('bilibili-zh', 'captions.ass', 'gameplay-zh-final.mp4'),
                                ('douyin-zh', 'captions.ass', 'gameplay-zh-final.mp4'),
                                ('youtube-zh', 'labels.ass', 'gameplay-youtube-final.mp4')]:
    ff(['-i', picture, '-i', str(A / 'final-mix.wav'), '-map', '0:v', '-map', '1:a',
        '-vf', f'ass={subtitle},fade=t=out:st={fade:.2f}:d=1.5', '-t', f'{cursor:.3f}',
        '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '17', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-c:a', 'aac', '-b:a', '192k', '-ar', 48000, '-movflags', '+faststart', FINAL / variant / file])
    print('FINAL', variant, round(cursor, 2), flush=True)

from shutil import copy2
copy2(E / 'captions-zh.srt', FINAL / 'youtube-zh' / 'captions-zh.srt')
copy2(E / 'captions-en.srt', FINAL / 'youtube-zh' / 'captions-en.srt')
print('成片时长', round(cursor, 2), 's；镜头', len(shots), '；字幕', len(captions), '句')
