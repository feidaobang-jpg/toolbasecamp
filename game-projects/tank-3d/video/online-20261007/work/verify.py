"""Technical integrity, audio measures, actual time stamps and file checks."""
import json,re,hashlib,subprocess
from pathlib import Path
from PIL import Image
W=Path(__file__).resolve().parent;F=W.parent/'final/bilibili-zh';p=F/'gameplay-zh-final.mp4'
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)],encoding='utf-8'))
v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['codec_name'],v['pix_fmt'])==(1920,1080,'h264','yuv420p');assert a['codec_name']=='aac'
assert v['color_space']=='bt709' and v['color_range']=='tv'
alignment=json.loads((W/'edit/shared-zh/alignment.json').read_text(encoding='utf-8'));duration=float(probe['format']['duration'])
assert all(0<=s['start']<s['end']<duration for s in alignment)
assert all(x['end']<=y['start'] for x,y in zip(alignment,alignment[1:]))
assert all(s['timing_source']=='Edge-TTS WordBoundary' for s in alignment)
sizes={}
for name,ratio in [('cover-home-4x3.jpg',(4,3)),('cover-space-16x9.jpg',(16,9))]:
    im=Image.open(F/name);assert im.width*ratio[1]==im.height*ratio[0];sizes[name]=list(im.size)
command=['ffmpeg','-hide_banner','-i',str(p),'-vf','blackdetect=d=0.5:pix_th=0.04','-af','silencedetect=n=-48dB:d=1.2,loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-']
r=subprocess.run(command,capture_output=True,encoding='utf-8',errors='replace');assert r.returncode==0
(W/'qa/decode-audio-video.txt').write_text('\n'.join(line.rstrip() for line in r.stderr.splitlines())+'\n',encoding='utf-8');measure=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',r.stderr)[-1])
result={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'duration':duration,'probe':probe,'decode':'pass','subtitles':'pass; Edge WordBoundary timestamps, no overlaps/out-of-range','cover_sizes':sizes,'audio_measurement':measure,'black_silence_log':'qa/decode-audio-video.txt','subjective_audio_listening':'not-run; human review required','visual_review':'pending final contact sheet review'}
(W/'qa/verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:result[k] for k in ['duration','sha256','decode','audio_measurement','cover_sizes']},ensure_ascii=False))
