"""Cover typography over an actual recorded fight frame; no generated gameplay."""
from pathlib import Path
import json,shutil
from PIL import Image,ImageDraw,ImageFont,ImageOps
R=Path(__file__).resolve().parent;F=R.parent/'final';C=R/'edit/covers';C.mkdir(parents=True,exist_ok=True)
take='journey-01';cap=json.loads((R/f'capture/{take}/capture.json').read_text(encoding='utf-8'));source_seconds=96.0;frame=min(cap['frames'],key=lambda f:abs(f['timestamp']-cap['started']/1000-source_seconds));source=Image.open(R/f'capture/{take}'/frame['file']).convert('RGB');source.save(C/'gameplay-source.jpg',quality=98)
def font(n,bold=True):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc',n)
def cover(w,h,name):
 im=Image.new('RGB',(w,h),'#101e24');crop=source.crop((640,420,1410,805));pw=1320 if w==1920 else 1060;ph=840 if w==1920 else 760;photo=ImageOps.fit(crop,(pw,ph),method=Image.Resampling.LANCZOS);im.paste(photo,(w-pw,h-ph))
 # Native design panel and a gradual transition keep the game subject visible.
 overlay=Image.new('RGBA',(w,h));d=ImageDraw.Draw(overlay)
 for x in range(w):
  alpha=245 if x<w*.31 else max(0,int(245*(1-(x-w*.31)/(w*.27))))
  if alpha:d.line((x,0,x,h),fill=(12,25,30,alpha))
 im=Image.alpha_composite(im.convert('RGBA'),overlay);d=ImageDraw.Draw(im);left=90 if w==1920 else 65;size=148 if w==1920 else 112
 d.rounded_rectangle((left,70,left+555,133),radius=15,fill='#1d3739');d.text((left+24,77),'虫潮围城 · 房车生存',font=font(36),fill='#9be3cc')
 for y,t in [(185,'开房车'),(185+size*1.32,'进僵尸城')]:d.text((left,y),t,font=font(size),fill='#ffe4a1',stroke_width=3,stroke_fill='#16272e')
 d.text((left,570 if w==1920 else 530),'边搜物资，边找退路',font=font(44 if w==1920 else 36,False),fill='#e4eee7')
 d.rounded_rectangle((left,815,left+(720 if w==1920 else 600),920),radius=22,fill='#ffe3a1');d.text((left+28,828),'能完整撤出来吗？',font=font(58 if w==1920 else 48),fill='#192a2a')
 d.text((left,992),'真实实机 · 哔哩哔哩 Toy 已可试玩',font=font(31,False),fill='#bcd6d0');im.convert('RGB').save(C/name,quality=95,subsampling=0)
cover(1920,1080,'cover-space-16x9.jpg');cover(1440,1080,'cover-home-4x3.jpg')
for v in ['bilibili-zh','douyin-zh','youtube-zh']:(F/v).mkdir(parents=True,exist_ok=True)
shutil.copy2(C/'cover-home-4x3.jpg',F/'bilibili-zh/cover-home-4x3.jpg');shutil.copy2(C/'cover-space-16x9.jpg',F/'bilibili-zh/cover-space-16x9.jpg');shutil.copy2(C/'cover-space-16x9.jpg',F/'douyin-zh/cover-reference-16x9.jpg');shutil.copy2(C/'cover-space-16x9.jpg',F/'youtube-zh/cover-zh-16x9.jpg')
for p in C.glob('cover-*.jpg'):
 im=Image.open(p);im.thumbnail((320,240));im.save(C/(p.stem+'-thumbnail.jpg'),quality=95)
(C/'source.json').write_text(json.dumps({'source':f'capture/{take}/capture.json','frame':frame,'source_seconds':source_seconds,'operations':'crop of actual frame, resize, native typography and gradient','gameplay_features_generated':False,'font':'installed Microsoft YaHei; font file not distributed'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('4:3 and 16:9 covers created')
