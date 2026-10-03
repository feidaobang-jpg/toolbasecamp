# 把参考 MIDI 转成游戏内的紧凑音符数据（src/music-data.js）。
# MIDI 只作乐谱来源，不随游戏发布、不入库；输出只含音高/时值，由 WebAudio 按 FC 音色重新合成。
# 用法：python tools/music.py <MIDI 目录>
#   需要 vgmusic.com 的 contra-1.mid、G_Probotector_StageComplete.mid、Contra_-_Game_Over.mid
import json, struct, sys, os

def vlq(b, i):
    v = 0
    while True:
        c = b[i]; i += 1
        v = (v << 7) | (c & 0x7f)
        if not c & 0x80: return v, i

def parse(path):
    b = open(path, 'rb').read()
    fmt, ntr, div = struct.unpack('>HHH', b[8:14])
    i = 8 + struct.unpack('>I', b[4:8])[0]
    tracks, tempos = [], []
    for _ in range(ntr):
        ln = struct.unpack('>I', b[i+4:i+8])[0]; j = i + 8; end = j + ln; i = end
        tick = 0; run = None; on = {}; notes = []
        while j < end:
            d, j = vlq(b, j); tick += d
            st = b[j]
            if st == 0xff:
                typ = b[j+1]; l, k = vlq(b, j+2)
                if typ == 0x51: tempos.append((tick, int.from_bytes(b[k:k+l], 'big')))
                j = k + l; continue
            if st in (0xf0, 0xf7):
                l, k = vlq(b, j+1); j = k + l; continue
            if st & 0x80: run = st; j += 1
            ev = run & 0xf0
            if ev in (0x80, 0x90, 0xa0, 0xb0, 0xe0):
                p, v = b[j], b[j+1]; j += 2
                key = (run & 15, p)
                if ev == 0x90 and v > 0: on.setdefault(key, []).append((tick, v))
                elif ev in (0x80, 0x90) and on.get(key):
                    s, vv = on[key].pop(0); notes.append((s, tick - s, p, vv))
            else:
                j += 1
        notes.sort()
        tracks.append(notes)
    return div, tempos, tracks

TPB = 24  # 每拍 24 刻

def pack(notes, div, t0, t1):
    out = []
    for s, d, p, v in notes:
        if s < t0 or s >= t1: continue
        st = round((s - t0) * TPB / div); du = max(1, round(d * TPB / div))
        out += [st, du, p]
    return out

def find_loop(notes, div, period):
    # 找最早的起点 b（以拍计），使 [b, 结尾-period) 内的音符在 period 拍后完全重复
    S = set((s, p) for s, d, p, v in notes)
    last = max(s for s, d, p, v in notes)
    for b in range(0, 64):
        t0 = b * div
        seg = [(s, p) for s, d, p, v in notes if t0 <= s < last - period * div]
        if seg and all((s + period * div, p) in S for s, p in seg): return b
    return 0

def song(path, roles, loop=None, gain=None):
    div, tempos, tracks = parse(path)
    bpm = round(60000000 / tempos[0][1], 2) if tempos else 120
    end = max((n[0] + n[1]) for t in tracks for n in t if t)
    res = {'bpm': bpm, 'tpb': TPB, 'tracks': []}
    if loop:
        lead = tracks[loop['ref']]
        b = find_loop(lead, div, loop['beats'])
        t0, t1 = 0, (b + loop['beats']) * div
        res['loopStart'] = b * TPB; res['loopEnd'] = (b + loop['beats']) * TPB
    else:
        t0, t1 = 0, end + 1
        res['end'] = round(end * TPB / div)
    for idx, role in roles:
        res['tracks'].append({'ch': role, 'n': pack(tracks[idx], div, t0, t1)})
    return res

if __name__ == '__main__':
    src = sys.argv[1]
    songs = {
        # 丛林关：方波 A/B、三角波、噪声鼓；124 拍一循环
        'jungle': song(os.path.join(src, 'contra-1.mid'), [(1, 'p1'), (2, 'p2'), (3, 'tri'), (4, 'drum')], loop={'ref': 1, 'beats': 124}),
        'clear': song(os.path.join(src, 'G_Probotector_StageComplete.mid'), [(1, 'p1'), (3, 'tri'), (4, 'p2'), (5, 'drum')]),
        'over': song(os.path.join(src, 'Contra_-_Game_Over.mid'), [(1, 'p1'), (2, 'p2'), (3, 'tri'), (4, 'drum'), (5, 'drum')]),
    }
    out = os.path.join(os.path.dirname(__file__), '..', 'src', 'music-data.js')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// 由 tools/music.py 从参考 MIDI 生成（vgmusic.com：contra-1.mid by Anthony Bellissimo，G_Probotector_StageComplete.mid by Gecko Yamori，Contra_-_Game_Over.mid by Jedi QuestMaster）。\n')
        f.write('// 只保留音高与时值：每首 tracks[].n = [起始刻, 时长刻, MIDI 音高, ...]，tpb 为每拍刻数。请勿手改，重新生成即可。\n')
        f.write('export const SONGS = ' + json.dumps(songs, separators=(',', ':')) + ';\n')
    for k, s in songs.items():
        print(k, s['bpm'], {t['ch']: len(t['n']) // 3 for t in s['tracks']}, s.get('loopStart'), s.get('loopEnd'), s.get('end'))
    print('wrote', os.path.normpath(out), os.path.getsize(out), 'bytes')
