# -*- coding: utf-8 -*-
# 截取苍云岭原声：每段首尾淡入淡出，段间留 0.22 秒；按均值响度补到 -15 dB 并限幅；单声道 44.1kHz 48kbps mp3
import subprocess, sys, json, re, tempfile, os
from pathlib import Path
from clips import CLIPS
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
only = sys.argv[2:]
TMP = Path('cut'); TMP.mkdir(exist_ok=True)
def run(a): return subprocess.run(a, capture_output=True, text=True, encoding='utf-8', errors='replace')
meta = []
for cid, (src, segs, txt) in CLIPS.items():
    if only and cid not in only: continue
    parts = []
    for i, (s, e) in enumerate(segs):
        w = TMP / f'{cid}_{i}.wav'
        d = e - s
        af = f'afade=t=in:st=0:d=0.05,afade=t=out:st={max(0, d - 0.14):.3f}:d=0.14'
        r = run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{s:.3f}', '-t', f'{d:.3f}', '-i', src, '-vn', '-ac', '1', '-ar', '44100', '-af', af, str(w)])
        assert r.returncode == 0, r.stderr
        parts.append(w)
    joined = TMP / f'{cid}.wav'
    if len(parts) == 1:
        joined.write_bytes(parts[0].read_bytes())
    else:
        # 段间插 0.22 秒静音
        inputs, fl = [], ''
        for i, pth in enumerate(parts):
            inputs += ['-i', str(pth)]
        n = len(parts)
        sil = ''.join(f'[{i}:a]apad=pad_dur=0.22[p{i}];' for i in range(n - 1))
        cat = ''.join(f'[p{i}]' for i in range(n - 1)) + f'[{n - 1}:a]'
        r = run(['ffmpeg', '-v', 'error', '-y'] + inputs + ['-filter_complex', sil + cat + f'concat=n={n}:v=0:a=1[o]', '-map', '[o]', str(joined)])
        assert r.returncode == 0, r.stderr
    vd = run(['ffmpeg', '-i', str(joined), '-af', 'volumedetect', '-f', 'null', '-'])
    mean = float(re.search(r'mean_volume: (-?[\d.]+)', vd.stderr).group(1))
    gain = -15.0 - mean
    mp3 = OUT / f'{cid}.mp3'
    r = run(['ffmpeg', '-v', 'error', '-y', '-i', str(joined), '-af', f'volume={gain:.2f}dB,alimiter=limit=0.84:attack=3:release=60', '-ac', '1', '-ar', '44100', '-b:a', '48k', str(mp3)])
    assert r.returncode == 0, r.stderr
    dur = float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(mp3)]).stdout.strip())
    meta.append({'id': cid, 'src': 'BV1Ef421B7CK' if 'BV1Ef421B7CK' in src else 'BV1BS411w7AU', 'segments': [[round(s, 2), round(e, 2)] for s, e in segs], 'text': txt, 'seconds': round(dur, 2), 'bytes': mp3.stat().st_size, 'gain_db': round(gain, 1)})
    print(f'{cid:16s} {dur:5.2f}s {mp3.stat().st_size // 1024:4d}KB gain {gain:+.1f}')
Path('cut_meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
print('total', sum(m['bytes'] for m in meta) // 1024, 'KB', round(sum(m['seconds'] for m in meta), 1), 's')
