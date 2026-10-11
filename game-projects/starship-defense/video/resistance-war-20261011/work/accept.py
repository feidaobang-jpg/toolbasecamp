"""成片技术验收：规格、响度、抽帧、字幕、黑帧/静音检测。"""
import json, subprocess, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
R = Path(__file__).resolve().parent
FINAL = R.parent / 'final'
OUT = R / 'qa'
OUT.mkdir(exist_ok=True)

TARGETS = [
    ('bilibili-zh', 'gameplay-zh-final.mp4'),
    ('douyin-zh', 'gameplay-zh-final.mp4'),
    ('youtube-zh', 'gameplay-youtube-final.mp4'),
]


def probe(f):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                        'format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate',
                        '-of', 'json', str(f)], capture_output=True, text=True, encoding='utf-8', check=True)
    return json.loads(r.stdout)


def loudnorm(f):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(f), '-af',
                        'loudnorm=I=-16:TP=-1:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True, encoding='utf-8')
    s = r.stderr
    return json.JSONDecoder().raw_decode(s[s.rfind('{'):])[0]


def blackdetect(f):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(f), '-vf', 'blackdetect=d=0.6:pix_th=0.10',
                        '-an', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8')
    return [l for l in r.stderr.splitlines() if 'black_start' in l]


def silencedetect(f):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(f), '-af', 'silencedetect=n=-45dB:d=1.2',
                        '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8')
    return [l for l in r.stderr.splitlines() if 'silence_start' in l]


report = {}
print('=== 三平台成片验收 ===')
for variant, name in TARGETS:
    f = FINAL / variant / name
    if not f.exists():
        print(f'  {variant}: 文件缺失 {f}')
        report[variant] = {'missing': str(f)}
        continue
    info = probe(f)
    dur = float(info['format']['duration'])
    size_mb = int(info['format']['size']) / 1048576
    v = next(s for s in info['streams'] if s['codec_type'] == 'video')
    a = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    ln = loudnorm(f)
    report[variant] = {'duration': round(dur, 2), 'size_mb': round(size_mb, 1),
                       'video': f"{v['codec_name']} {v['width']}x{v['height']} {v['r_frame_rate']}",
                       'audio': f"{a['codec_name']} {a.get('channels')}ch {a.get('sample_rate')}",
                       'loudness_I': float(ln['input_i']), 'true_peak': float(ln['input_tp']), 'lra': float(ln['input_lra'])}
    print(f"  {variant}: {dur:.1f}s {size_mb:.1f}MB | {report[variant]['video']} | {report[variant]['audio']} | "
          f"响度 {ln['input_i']} LUFS, TP {ln['input_tp']}, LRA {ln['input_lra']}")

# 黑帧/静音检测（只对 B站版）
bili = FINAL / 'bilibili-zh' / 'gameplay-zh-final.mp4'
if bili.exists():
    bd = blackdetect(bili); sd = silencedetect(bili)
    report['blackdetect'] = bd; report['silencedetect'] = sd
    print(f'  黑帧段: {len(bd)} | 静音段(>1.2s): {len(sd)}')
    for l in bd[:6]: print('   ', l.strip())
    for l in sd[:6]: print('   ', l.strip())

# 抽帧：开头/中段/攻城炮/结尾 + 字幕密集处
bili_frames = {'t02-开场': 2, 't40-交通壕': 40, 't78-炸堡垒': 78, 't118-骑兵冲锋': 118,
               't150-护送': 150, 't172-攻城炮': 172, 't196-结尾卡': 196}
print('=== 抽帧（B站版）===')
for tag, t in bili_frames.items():
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(t), '-i', str(bili),
                    '-frames:v', '1', str(OUT / f'{tag}.png')], check=True)
    sz = (OUT / f'{tag}.png').stat().st_size
    print(f'  {tag} @{t}s -> {sz//1024} KB')

# 字幕文件检查
print('=== 字幕检查 ===')
zh_srt = FINAL / 'youtube-zh' / 'captions-zh.srt'
en_srt = FINAL / 'youtube-zh' / 'captions-en.srt'
for p, lang in [(zh_srt, 'zh'), (en_srt, 'en')]:
    if p.exists():
        txt = p.read_text(encoding='utf-8')
        blocks = [b for b in txt.strip().split('\n\n') if b.strip()]
        print(f'  {lang}: {len(blocks)} 条 | {p.name} {p.stat().st_size//1024}KB')
        report[f'srt_{lang}_count'] = len(blocks)
    else:
        print(f'  {lang}: 缺失')

# SRT 时间递增与不超片长校验
def check_srt(p, dur):
    import re
    txt = p.read_text(encoding='utf-8')
    ts = re.findall(r'(\d\d):(\d\d):(\d\d),(\d\d\d) --> (\d\d):(\d\d):(\d\d),(\d\d\d)', txt)
    prev = -1; issues = []
    for g in ts:
        st = int(g[0])*3600+int(g[1])*60+int(g[2])+int(g[3])/1000
        en = int(g[4])*3600+int(g[5])*60+int(g[6])+int(g[7])/1000
        if en <= st: issues.append(f'起止倒置 @{st}')
        if st < prev-0.01: issues.append(f'起点回退 @{st}')
        if en > dur+0.05: issues.append(f'超出片长 @{en}>{dur}')
        prev = st
    return issues

dur = report.get('youtube-zh', {}).get('duration', 201)
for p in [zh_srt, en_srt]:
    if p.exists():
        iss = check_srt(p, dur)
        print(f'  {p.name} 时间轴校验: {"OK" if not iss else iss[:5]}')
        report[p.name + '_timeline_issues'] = iss

(OUT / 'acceptance-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('\n报告:', OUT / 'acceptance-report.json')
