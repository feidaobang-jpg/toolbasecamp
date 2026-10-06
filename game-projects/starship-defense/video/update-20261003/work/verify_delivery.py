"""Technical QA and representative-frame sheets for the delivered file."""
from pathlib import Path
import json,subprocess,hashlib
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parent;Q=R/'qa';F=R.parent/'final/bilibili-zh';V=F/'gameplay-zh-final.mp4'
def cmd(a):return subprocess.run(a,capture_output=True,text=True,encoding='utf8',errors='replace')
dec=cmd(['ffmpeg','-v','error','-i',str(V),'-f','null','-']);(Q/'full-decode.txt').write_text(dec.stderr or 'PASS: complete video and audio decoded without errors.\n',encoding='utf8')
assert dec.returncode==0 and not dec.stderr,dec.stderr
p=cmd(['ffmpeg','-hide_banner','-i',str(V),'-af','loudnorm=I=-16:TP=-1:LRA=11:print_format=json','-f','null','-'])
stats=json.JSONDecoder().raw_decode(p.stderr[p.stderr.rfind('{'):])[0];(Q/'final-loudness.json').write_text(json.dumps(stats,indent=2),encoding='utf8')
timeline=json.loads((R/'edit/shared-zh/timeline.json').read_text(encoding='utf8'))['shots']
times=[round((s['start']+s['end'])/2,3) for s in timeline]
for page in range((len(times)+11)//12):
 sheet=Image.new('RGB',(1280,264*4),(12,20,25));d=ImageDraw.Draw(sheet)
 for i,t in enumerate(times[page*12:page*12+12]):
  path=Q/f'shot-{page*12+i:02}.jpg'
  x=cmd(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(V),'-frames:v','1','-vf','scale=426:240',str(path)]);assert x.returncode==0
  sheet.paste(Image.open(path),(i%3*426,i//3*264));d.text((i%3*426+8,i//3*264+243),f'shot {page*12+i:02} / {t:.2f}s',fill='white')
 sheet.save(Q/f'final-contact-{page+1}.jpg',quality=95)
for t in [33,58,63,68,99,112,116.3,129,143,154.4,155.5,156.5]:
 cmd(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(V),'-frames:v','1',str(Q/f'final-{t}.jpg')])
thumb=Image.new('RGB',(680,270),(14,23,32));d=ImageDraw.Draw(thumb)
for i,name in enumerate(['cover-home-4x3.jpg','cover-space-16x9.jpg']):
 im=Image.open(F/name);assert im.size==[(1440,1080),(1920,1080)][i];im.thumbnail((320,240));thumb.paste(im,(i*340,0));d.text((i*340+5,246),name,fill='white')
thumb.save(Q/'cover-thumbnails.jpg',quality=95)
m=json.loads((R/'publish/bilibili-zh/publish.json').read_text(encoding='utf8'))
assert hashlib.sha256(V.read_bytes()).hexdigest()==m['video_sha256']
for k in ['video_file','description_file','cover_file']:assert (R/'publish/bilibili-zh'/m[k]).exists()
for c in m['cover_files'].values():assert (R/'publish/bilibili-zh'/c['file']).exists()
assert set(p.name for p in F.iterdir())=={'gameplay-zh-final.mp4','cover-home-4x3.jpg','cover-space-16x9.jpg','投稿文案.txt'}
print('PASS decode/references/cover dimensions/final folder');print('Measured loudness',stats['input_i'],'LUFS; true peak',stats['input_tp'],'dBTP')
