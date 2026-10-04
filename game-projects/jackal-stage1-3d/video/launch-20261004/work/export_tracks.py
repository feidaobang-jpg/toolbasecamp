"""Export editable narration and final mix from the saved timeline."""
import subprocess,json
from pathlib import Path
R=Path(__file__).resolve().parent;A=R/'audio/shared-zh'
t=json.loads((R/'edit/shared-zh/timeline.json').read_text(encoding='utf-8'))
args=[];f=[]
for i,s in enumerate(t):
 args+=['-i',str(R/s['audio'])]
 f.append(f'[{i}:a]aresample=48000,adelay=250:all=1,apad,atrim=duration={s["duration"]},asetpts=PTS-STARTPTS[a{i}]')
f.append(''.join(f'[a{i}]' for i in range(len(t)))+f'concat=n={len(t)}:v=0:a=1[out]')
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y']+args+['-filter_complex',';'.join(f),'-map','[out]','-c:a','pcm_s16le',str(A/'narration-dry.wav')],check=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(R.parent/'final/bilibili-zh/赤色要塞-双关卡上架介绍.mp4'),'-vn','-c:a','pcm_s16le',str(A/'final-mix.wav')],check=True)
