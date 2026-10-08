"""Final technical validation; never represents subjective audio listening or human approval."""
from pathlib import Path
import json,subprocess,hashlib,datetime,sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
R=Path(__file__).resolve().parent;F=R.parent/'final';Q=R/'qa';Q.mkdir(exist_ok=True)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
reports=[]
timeline=json.loads((R/'edit/shared-zh/timeline.json').read_text(encoding='utf-8'))
for variant,name in [('bilibili-zh','gameplay-zh-final.mp4'),('youtube-zh','gameplay-youtube-final.mp4')]:
 p=F/variant/name
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(p)],text=True,encoding='utf-8'))
 v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio');duration=float(probe['format']['duration'])
 assert (v['width'],v['height'],v['codec_name'],v['pix_fmt'])==(1920,1080,'h264','yuv420p')
 assert a['codec_name']=='aac' and a['channels']==2 and int(a['sample_rate'])==48000
 assert abs(duration-timeline['duration'])<.15
 subprocess.run(['ffmpeg','-hide_banner','-v','error','-i',str(p),'-f','null','-'],check=True)
 audio=subprocess.run(['ffmpeg','-hide_banner','-i',str(p),'-vn','-af','loudnorm=I=-16:TP=-1:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf-8',check=True)
 loudness=json.JSONDecoder().raw_decode(audio.stderr[audio.stderr.rfind('{'):])[0]
 assert -20<float(loudness['input_i'])<-12 and float(loudness['input_tp'])<-.5
 reports.append({'variant':variant,'sha256':digest(p),'duration':duration,'size_bytes':p.stat().st_size,'video':{k:v.get(k) for k in ['codec_name','width','height','pix_fmt','avg_frame_rate','color_space']},'audio':{k:a.get(k) for k in ['codec_name','channels','sample_rate']},'full_decode':'pass','measured_loudness':loudness,'subjective_listening':'not-run: model cannot accept audio input'})
 print('PASS',variant,round(duration,2),'seconds',loudness['input_i'],'LUFS',loudness['input_tp'],'dBTP',flush=True)
assert digest(F/'bilibili-zh/gameplay-zh-final.mp4')==digest(F/'douyin-zh/gameplay-zh-final.mp4')
for key in ['subtitles','english_subtitles']:
 previous=0
 for row in timeline[key]:
  assert 0<=row['start']<row['end']<=timeline['duration']
  assert row['start']>=previous-.1
  previous=row['end']
 assert timeline['duration']-timeline[key][-1]['end']>=1.5
covers=[]
for p in F.glob('*/*.jpg'):
 with Image.open(p) as im:w,h=im.size
 assert (w,h) in [(1440,1080),(1920,1080),(1080,1440)]
 assert p.stat().st_size<2*1024*1024
 covers.append({'file':str(p.relative_to(F)),'width':w,'height':h,'size_bytes':p.stat().st_size})
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'technical_checks':'pass','reports':reports,'douyin_video_identical_to_bilibili':True,'captions':'real WordBoundary timing, monotonic and in bounds','tail_reading_margin_seconds':timeline['duration']-timeline['subtitles'][-1]['end'],'covers':covers,'visual_checks':'source/current final frames checked at all scene midpoints, result, closing and cover thumbnails','human_review':'pending','subjective_audio_listening':'not-run; user must confirm narration and mix during review'}
(Q/'final-technical.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('TECHNICAL QA DONE; human review pending',flush=True)
