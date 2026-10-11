"""Encode retained native 1080p JPEG screencast frames with original timestamps and audio."""
import json,subprocess,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parent
for directory in sorted(p.parent for p in (ROOT/'capture').rglob('capture.json')):
    metadata=directory/'capture.json'
    if not metadata.exists() or (directory/'raw.mp4').exists(): continue
    data=json.loads(metadata.read_text(encoding='utf-8'));frames=data['frames']
    if not frames: continue
    lines=[]
    for i,frame in enumerate(frames):
        duration=frames[i+1]['timestamp']-frame['timestamp'] if i+1<len(frames) else 1/30
        lines += [f"file '{frame['file']}'",f'duration {max(.001,duration):.6f}']
    lines += [f"file '{frames[-1]['file']}'"]
    (directory/'frames.ffconcat').write_text('\n'.join(lines),encoding='utf-8')
    offset=max(0,frames[0]['timestamp']-data.get('audioStart',data['started'])/1000)
    duration=frames[-1]['timestamp']-frames[0]['timestamp']+1/30
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(directory/'frames.ffconcat')]
    audio=directory/'game-audio.webm'
    if audio.exists():cmd+=['-ss',str(offset),'-i',str(audio)]
    else:cmd+=['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']
    cmd+=['-t',str(duration),'-vf','fps=30','-c:v','h264_nvenc','-preset','p5','-cq','17','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-b:a','192k','-movflags','+faststart',str(directory/'raw.mp4')]
    subprocess.run(cmd,check=True)
    print(directory.name,round(duration,2),'seconds',len(frames),'source frames',flush=True)
