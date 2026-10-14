"""v0.5.0（枪火集结 0.2.3）平安县城 · 秀芹双结局：由实机合成帧 + IndexTTS 真实时间戳重建 B站成片。

素材：capture/{full,classic 路线, rescue 改写路线, mg 机枪接管补拍, lobby 大厅入口}
用法：python work/render.py
"""
from pathlib import Path
import json, math, subprocess, wave, struct

W = Path(__file__).resolve().parent
F = W.parent / 'final/bilibili-zh'
T = W / 'tmp'
E = W / 'edit'
A = W / 'audio/shared-zh'
for p in (F, T, E):
    p.mkdir(parents=True, exist_ok=True)

plan = json.loads((W / 'units.json').read_text('utf-8'))
capture = {n: json.loads((W / 'capture' / f'{n}.json').read_text('utf-8')) for n in ['full', 'rescue', 'mg', 'lobby']}

# (源, 源内起始秒, 时长[None=段内剩余], 游戏音增益[None=用段落默认])
shots = {
 '01-hook':   [('full', 61.4, 4.2, 0.34), ('full', 87.6, 4.4, 0.42), ('full', 108.2, None, 0.34)],
 '02-entry':  [('lobby', 0.3, 3.4, 0.10), ('lobby', 3.7, 3.6, 0.10), ('full', 0.6, None, 0.12)],
 '03-outside':[('full', 1.6, 4.4), ('full', 15.2, 4.2), ('mg', 24.4, None)],
 '04-controls':[('full', 11.2, 4.4), ('full', 7.6, 3.6), ('full', 113.6, None)],
 '05-escort': [('full', 25.6, 4.0), ('full', 33.2, 3.6), ('full', 43.6, None)],
 '06-cannon': [('full', 48.8, 4.0), ('full', 54.4, 3.6), ('full', 58.0, None)],
 '07-xiuqin': [('full', 61.0, 4.6, 0.5), ('full', 74.2, 4.0, 0.5), ('full', 80.4, None, 0.62)],
 '08-classic':[('full', 93.4, 3.6, 0.5), ('full', 100.6, 4.0, 0.62), ('full', 108.0, None, 0.6)],
 '09-rescue': [('rescue', 62.6, 3.6, 0.3), ('rescue', 99.6, 4.4, 0.24), ('rescue', 397.6, None, 0.2)],
 '10-street': [('full', 115.6, 3.4), ('full', 475.4, 3.0), ('full', 478.2, None)],
 '11-boss':   [('full', 483.6, 4.2), ('full', 495.6, 4.2), ('rescue', 364.4, None)],
 '12-ending': [('full', 504.6, 4.0), ('full', 509.6, 4.2), ('rescue', 409.6, None)],
}
# 段落在解说结束后再留一段只听游戏原声的尾巴
tails = {'07-xiuqin': 2.6, '08-classic': 2.2}
default_gain = {
 '01-hook': 0.34, '02-entry': 0.10, '03-outside': 0.16, '04-controls': 0.16,
 '05-escort': 0.16, '06-cannon': 0.20, '07-xiuqin': 0.5, '08-classic': 0.55,
 '09-rescue': 0.2, '10-street': 0.18, '11-boss': 0.18, '12-ending': 0.14,
}

labels = {
 '01-hook': '意大利炮 · 城楼上的秀芹 · 两条结局',
 '02-entry': '入口：枪火集结 → 抗战战役 → 第三章 平安县城',
 '03-outside': '① 先拿下城外机枪阵地',
 '04-controls': '手动瞄准 · C 切越肩 / 第一人称',
 '05-escort': '② 护送意大利炮 · 护住炮组',
 '06-cannon': '③ 上炮调仰角 · 对准再开火',
 '07-xiuqin': '新增：城门一开，秀芹被押上城楼（电视剧原声）',
 '08-classic': '原作结局：朝城楼开炮 · 城楼塌了',
 '09-rescue': '改写结局：冲进城门 · 救下秀芹',
 '10-street': '④ 巷战 · 军火库缴获歪把子',
 '11-boss': '⑤ 守备队部 · 决战山本一木',
 '12-ending': '实机结果：两条路线都打到结算',
}
notes = {
 '03-outside': '机枪接管为分段实机补拍 · 正常耐久 / 无限命',
 '09-rescue': '改写结局路线实机补拍 · 正常耐久 / 无限命',
 '10-street': '巷战与军火库为同一局内节选',
 '11-boss': '救人线山本满血，秀芹绑在院内木桩',
}


def run(args):
    subprocess.run(args, check=True, encoding='utf-8', errors='replace')


def writewav(p, data):
    with wave.open(str(p), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(24000); f.writeframes(data)


def ass_t(s):
    c = round(s * 100)
    return f'{c//360000}:{c//6000%60:02}:{c//100%60:02}.{c%100:02}'


def srt_t(s):
    c = round(s * 1000)
    return f'{c//3600000:02}:{c//60000%60:02}:{c//1000%60:02},{c%1000:03}'


timeline, subs, texts, audio, game_audio = [], [], [], [], []
clips = []
cursor = 0.0
for seg in plan['segments']:
    sid = seg['id']
    meta = json.loads((A / f'{sid}.json').read_text('utf-8'))
    with wave.open(str(A / f'{sid}.wav'), 'rb') as f:
        raw = f.readframes(f.getnframes())
    dur = math.ceil((len(raw) / 48000 + .5) * 30) / 30 + tails.get(sid, 0.0)
    if sid == '12-ending':
        dur += 1.6
    voice = b'\0\0' * 4800 + raw
    voice += b'\0\0' * (round(dur * 24000) - len(voice) // 2)
    audio.append(voice)
    for m in meta['marks']:
        st = cursor + .2 + m['offset'] / 1e7
        subs.append((st, st + m['duration'] / 1e7, m['text']))
    texts.append((cursor, cursor + dur, 'Label', labels[sid]))
    if sid in notes:
        texts.append((cursor, cursor + dur, 'Note', notes[sid]))
    if sid == '01-hook':
        texts.append((0, dur, 'Note', 'v0.5.0 · 枪火集结 0.2.3 · 实机自动化操作 / 剪辑节选'))
    if sid == '12-ending':
        texts.append((cursor, cursor + dur, 'Card',
                      r'已完成：护炮 · 轰城 · 城楼秀芹 · 双结局\N原作：开炮轰塌城楼｜改写：冲进城门救人\N下一步：瞄准手感与真机试玩｜哔哩哔哩 Toy 入口见简介'))
    local = 0.0
    for k, (source, start, d, *rest) in enumerate(shots[sid]):
        gain = rest[0] if rest and rest[0] is not None else default_gain[sid]
        if k == len(shots[sid]) - 1:
            d = dur - local
        if d <= 0:
            raise ValueError((sid, d))
        n = len(timeline)
        key = f'{source}-{start:.2f}-{d:.3f}'
        cl = T / f'shot-{n:02}-{key}.ffconcat'
        dst = T / f'shot-{n:02}-{key}.mp4'
        clips.append(dst)
        fr = capture[source]['frames']
        end = min(start + d, fr[-1]['t'])
        selected = [x for x in fr if start <= x['t'] < end]
        if not selected:
            raise ValueError((sid, start, end))
        lines = ['ffconcat version 1.0']
        for i, f in enumerate(selected):
            nxt = selected[i + 1]['t'] if i + 1 < len(selected) else end
            p = (W / 'capture' / f'{source}-frames' / f['file']).resolve().as_posix()
            lines += [f"file '{p}'", f'duration {max(.001, nxt - f["t"]):.6f}']
        lines.append(f"file '{p}'")
        cl.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        if not dst.exists():
            run(['ffmpeg', '-v', 'error', '-y', '-safe', '0', '-f', 'concat', '-i', str(cl),
                 '-vf', f'fps=30,tpad=stop_mode=clone:stop_duration={d},trim=duration={d},setpts=PTS-STARTPTS,format=yuv420p',
                 '-an', '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '18', '-b:v', '0', str(dst)])
        ga = T / f'game-{n:02}.wav'
        available = end - start
        src_audio = W / 'capture' / f'{source}-game-audio.webm'
        if not src_audio.exists():          # 大厅镜头没有游戏音轨，补静音
            gsize = round(d * 24000) * 2
            if not ga.exists():
                ga.write_bytes(b'RIFF' + struct.pack('<I', 36 + gsize) + b'WAVEfmt ' +
                               struct.pack('<IHHIIHH', 16, 1, 1, 24000, 48000, 2, 16) +
                               b'data' + struct.pack('<I', gsize) + b'\0' * gsize)
        elif not ga.exists():
            run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(src_audio),
                 '-t', str(min(d, available)), '-af', f'volume={gain}', '-ar', '24000', '-ac', '1', str(ga)])
        with wave.open(str(ga), 'rb') as f:
            g = f.readframes(f.getnframes())
        size = round(d * 24000) * 2
        g = g[:size] + b'\0' * max(0, size - len(g))
        game_audio.append(g)
        timeline.append({'segment': sid, 'source': source, 'source_in': start, 'source_out': end,
                         'in_seconds': cursor + local, 'duration': d, 'game_gain': gain,
                         'capture_mode': 'realtime-automation', 'freeze_tail_seconds': max(0, d - available)})
        local += d
    cursor += dur

writewav(E / 'narration.wav', b''.join(audio))
writewav(E / 'game-track.wav', b''.join(game_audio))
(E / 'timeline.json').write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding='utf-8')

ass = '''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Sub,Microsoft YaHei,46,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,80,80,245,1
Style: Label,Microsoft YaHei,34,&H0082DAFF,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,7,42,42,118,1
Style: Note,Microsoft YaHei,23,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,2,1,7,42,42,167,1
Style: Card,Microsoft YaHei,45,&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,3,2,0,5,80,80,40,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
for a, b, t in subs:
    ass += f'Dialogue: 2,{ass_t(a)},{ass_t(b)},Sub,,0,0,0,,{{\\an2\\pos(960,835)}}{t}\n'
for a, b, s, t in texts:
    ass += f'Dialogue: 1,{ass_t(a)},{ass_t(b)},{s},,0,0,0,,{t}\n'
(E / 'captions.ass').write_text(ass, encoding='utf-8-sig')
(E / 'captions.srt').write_text('\n\n'.join(f'{i+1}\n{srt_t(a)} --> {srt_t(b)}\n{t}' for i, (a, b, t) in enumerate(subs)) + '\n', encoding='utf-8')

concat = T / 'edit.ffconcat'
concat.write_text('ffconcat version 1.0\n' + ''.join(f"file '{c.as_posix()}'\n" for c in clips), encoding='utf-8')
run(['ffmpeg', '-v', 'error', '-y', '-safe', '0', '-f', 'concat', '-i', str(concat), '-c', 'copy', str(T / 'picture.mp4')])
run(['ffmpeg', '-v', 'error', '-y', '-i', str(E / 'narration.wav'), '-i', str(E / 'game-track.wav'),
     '-filter_complex', f'[0:a]volume=1.0[v];[v][1:a]amix=inputs=2:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=9,afade=t=out:st={cursor-1.3}:d=1.3[m]',
     '-map', '[m]', str(E / 'mix.wav')])
run(['ffmpeg', '-v', 'error', '-y', '-i', str(T / 'picture.mp4'), '-i', str(E / 'mix.wav'),
     '-vf', f"scale=in_range=pc:out_range=tv,format=yuv420p,ass=edit/captions.ass,fade=t=out:st={cursor-1.2}:d=1.2",
     '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '18', '-b:v', '0', '-pix_fmt', 'yuv420p',
     '-color_range', 'tv', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
     '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
     '-movflags', '+faststart', '-t', str(cursor), str(F / 'gameplay-zh-final.mp4')])
print('rendered', round(cursor, 2), 'seconds', len(timeline), 'shots')
