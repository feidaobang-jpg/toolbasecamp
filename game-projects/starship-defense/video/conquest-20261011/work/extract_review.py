"""Retain actual final frames at every edit and action point for visual inspection."""
from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parent;Q=R/'qa/frames';Q.mkdir(parents=True,exist_ok=True)
data=json.loads((R/'edit/shared-zh/timeline.json').read_text(encoding='utf-8'))
times=sorted(set([.5,3.2,6.7,data['duration']-3,data['duration']-1.7]+[round((s['start']+s['end'])/2,3) for s in data['shots']]+[round(s['start']+.2,3) for s in data['shots']]))
rows=[]
for i,t in enumerate(times):
 out=Q/f'{i:02d}-{t:.2f}.jpg'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(t),'-i',str(R.parent/'final/bilibili-zh/gameplay-zh-final.mp4'),'-frames:v','1','-q:v','2',str(out)],check=True)
 rows.append({'t':t,'file':str(out.relative_to(R))})
for page in range((len(rows)+11)//12):
 group=rows[page*12:page*12+12];im=Image.new('RGB',(1920,4*390),'#10252e');d=ImageDraw.Draw(im)
 for j,row in enumerate(group):
  x=j%3*640;y=j//3*390;frame=Image.open(R/row['file']);frame.thumbnail((640,360));im.paste(frame,(x,y));d.text((x+8,y+364),f"{row['t']:.2f}s",font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',18),fill='white')
 im.save(Q/f'contact-{page}.jpg',quality=92)
(R/'qa/frame-index.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print('FINAL FRAMES',len(rows))
