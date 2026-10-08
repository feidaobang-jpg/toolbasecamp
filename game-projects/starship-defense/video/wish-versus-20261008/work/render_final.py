"""Re-export final overlays from the verified picture/audio master; no timeline or audio change."""
from pathlib import Path
import json,subprocess,os,sys
sys.stdout.reconfigure(encoding='utf-8')
R=Path(__file__).resolve().parent;E=R/'edit/shared-zh';F=R.parent/'final'
duration=json.loads((E/'timeline.json').read_text(encoding='utf-8'))['duration']
os.chdir(E)
for variant,subtitle,name in [('bilibili-zh','captions.ass','gameplay-zh-final.mp4'),('youtube-zh','labels.ass','gameplay-youtube-final.mp4')]:
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i','picture-with-game-audio.mp4','-i',str(R/'audio/shared-zh/final-mix.wav'),'-map','0:v','-map','1:a','-vf',f'ass={subtitle},fade=t=out:st={duration-1.5}:d=1.5','-t',str(duration),'-c:v','h264_nvenc','-preset','p5','-cq','17','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(F/variant/name)],check=True)
 print('FINAL OVERLAY',variant,flush=True)
source=F/'bilibili-zh/gameplay-zh-final.mp4';target=F/'douyin-zh/gameplay-zh-final.mp4'
target.unlink();os.link(source,target)
