"""Recover the first capture's receive-time chronology, then preserve its ending."""
import json,subprocess
from pathlib import Path
W=Path(__file__).resolve().parent
for slug in ['01-host-lobby','02-guest-lobby','03-coop-battle']:
    d=W/'capture'/slug; rows=[];last=-1
    for f in sorted(d.glob('*.jpg')):
        t=f.stat().st_mtime
        # These timestamps are file persistence times from the original capture,
        # within tens of ms of receipt. Frames completing out of order are dropped.
        if t<=last:continue
        rows.append((f.name,t));last=t
    duration=rows[-1][1]-rows[0][1]
    text='ffconcat version 1.0\n'
    for i,(name,t) in enumerate(rows):
        text+=f"file '{name}'\noption framerate 1000\n"
        if i+1<len(rows):text+=f'duration {rows[i+1][1]-t:.9f}\n'
    lst=d/'receive-times.ffconcat';lst.write_text(text,encoding='utf-8')
    target=W/'capture'/f'{slug}-retimed.mp4'
    if not target.exists():
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-threads','4','-safe','0','-f','concat','-i',str(lst),'-i',str(d/'audio.webm'),'-vf','fps=30,format=yuv420p','-c:v','h264_nvenc','-preset','p5','-cq','18','-b:v','0','-c:a','aac','-b:a','192k','-t',str(duration),'-movflags','+faststart',str(target)],check=True)
    note={'source':slug,'method':'original frame file persistence timestamps; drop non-increasing timestamps','duration':duration,'retained_frames':len(rows),'original_frames':len(list(d.glob('*.jpg'))),'raw_images_unchanged':True,'audio_unchanged':True,'limitation':'receive/persistence times, not original GPU frame timestamps; inspect synchronization'}
    (W/'qa'/f'{slug}-retiming.json').write_text(json.dumps(note,ensure_ascii=False,indent=2),encoding='utf-8');print(slug,duration,flush=True)
