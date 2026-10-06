"""Objective media checks and final-cut visual review sheets."""
import json,subprocess,hashlib,re
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parent;Q=R/'qa';Q.mkdir(exist_ok=True);V=R.parent/'final/bilibili-zh/gameplay-zh-final.mp4'
timeline=json.loads((R/'edit/shared-zh/timeline.json').read_text(encoding='utf-8'))
align=json.loads((R/'edit/shared-zh/alignment.json').read_text(encoding='utf-8'))
assert all(x['start']<x['end']<=timeline['duration'] for x in align)
assert all(a['end']<=b['start']+.001 for a,b in zip(align,align[1:]))
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(V)],encoding='utf-8'))
v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['codec_name'],v['pix_fmt'])==(1920,1080,'h264','yuv420p')
assert a['codec_name']=='aac';assert abs(float(probe['format']['duration'])-timeline['duration'])<.1
p=subprocess.run(['ffmpeg','-hide_banner','-threads','4','-i',str(V),'-vf','blackdetect=d=0.08:pix_th=0.08','-af','ebur128=peak=true','-f','null','-'],capture_output=True,encoding='utf-8',errors='replace')
assert p.returncode==0,p.stderr[-2000:]
(Q/'decode-audio-black.log').write_text(p.stderr,encoding='utf-8')
black=re.findall(r'black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)',p.stderr)
summary=p.stderr[p.stderr.rfind('Summary:'):];print(summary,flush=True)
result={'complete_decode':'pass','subtitle_order':'pass','codec':'pass','black_intervals':black,'loudness_summary':summary,'duration':probe['format']['duration'],'video_sha256':hashlib.sha256(V.read_bytes()).hexdigest(),'audio_subjective_listening':'not-run'}
(Q/'technical.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
font=ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',18)
points=[]
for s in timeline['segments']:
    for t,tag in [(s['final_in']+.6,'start'),((s['final_in']+s['final_out'])/2,'middle'),(s['final_out']-.7,'end')]:points.append((t,s['id']+' '+tag))
for page in range((len(points)+11)//12):
    out=Image.new('RGB',(1920,1180),'#101820');d=ImageDraw.Draw(out)
    for i,(t,tag) in enumerate(points[page*12:(page+1)*12]):
        frame=Q/f'frame-{t:07.2f}.jpg'
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(V),'-frames:v','1',str(frame)],check=True)
        x=(i%3)*640;y=(i//3)*295
        # Full frame fitted into 640x360 is stored separately; review sheet fits the full image into 480x270.
        out.paste(Image.open(frame).resize((480,270)),(x+80,y));d.text((x+10,y+272),f'{t:.2f}s  {tag}',font=font,fill='#E4F2F3')
    out.save(Q/f'review-{page+1}.jpg',quality=95)
print('TECHNICAL AND REVIEW SHEETS COMPLETE',flush=True)
