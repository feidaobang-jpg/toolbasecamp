"""Compose covers from this episode's actual game frame; no generated gameplay art."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
import json,shutil
R=Path(__file__).resolve().parent;F=R.parent/'final';E=R/'edit/covers';E.mkdir(parents=True,exist_ok=True)
SRC=R/'capture/vehicle-02/01-opening/000300.jpg'
BOLD='C:/Windows/Fonts/msyhbd.ttc'
def font(size):return ImageFont.truetype(BOLD,size)
def compose(size,name):
 w,h=size;s=h/1080
 im=ImageOps.fit(Image.open(SRC).convert('RGB').crop((270,230,1535,952)),size,centering=(.63,.57)).convert('RGBA')
 shade=Image.new('RGBA',size);d=ImageDraw.Draw(shade)
 for x in range(w):
  alpha=int(230*max(0,1-x/(w*.78)))+20
  d.line((x,0,x,h),fill=(9,23,28,min(255,alpha)))
 d.rectangle((0,int(h*.78),w,h),fill=(9,23,28,220))
 im=Image.alpha_composite(im,shade);d=ImageDraw.Draw(im)
 left=int(70*s);top=int(80*s)
 d.rounded_rectangle((left,top,left+int(460*s),top+int(70*s)),radius=int(15*s),fill='#183b43',outline='#7bd7c5',width=2)
 d.text((left+int(22*s),top+int(9*s)),'虫潮围城 · 战地模式',font=font(int(34*s)),fill='#d6f5ed')
 d.text((left,int(236*s)),'只剩',font=font(int(102*s)),fill='white',stroke_width=2,stroke_fill='#102a31')
 d.text((left,int(332*s)),'3票',font=font(int(210*s)),fill='#ffe082',stroke_width=4,stroke_fill='#102a31')
 d.text((left,int(610*s)),'抢点险胜！',font=font(int(76*s)),fill='white',stroke_width=2,stroke_fill='#102a31')
 d.text((left,int(898*s)),'杀敌更少，也能赢？',font=font(int(57*s)),fill='#c8f3e6')
 d.rectangle((left,int(1038*s),w-int(70*s),int(1044*s)),fill='#6dc7b1')
 dst=E/name;im.convert('RGB').save(dst,quality=93,subsampling=0)
 thumb=im.convert('RGB').resize((320,round(320*h/w)),Image.Resampling.LANCZOS);thumb.save(E/(Path(name).stem+'-thumb.jpg'))
 return dst
wide=compose((1920,1080),'master-16x9.jpg');home=compose((1440,1080),'master-4x3.jpg')
for v in ['bilibili-zh','douyin-zh','youtube-zh']:(F/v).mkdir(parents=True,exist_ok=True)
shutil.copy2(home,F/'bilibili-zh/cover-home-4x3.jpg');shutil.copy2(wide,F/'bilibili-zh/cover-space-16x9.jpg')
shutil.copy2(wide,F/'douyin-zh/cover-horizontal-16x9.jpg');shutil.copy2(wide,F/'youtube-zh/cover-zh-16x9.jpg')
(E/'cover-source.json').write_text(json.dumps({'source':str(SRC.relative_to(R)),'source_type':'current real game screenshot, separate normal-rule tank match','crop':[270,230,1535,952],'text':['虫潮围城 · 战地模式','只剩3票','抢点险胜！','杀敌更少，也能赢？'],'result_evidence':'capture/match-01/real-result.png','method':'native typography and crop, no synthetic objects or model-detail enhancement','font':'installed Microsoft YaHei, no font redistribution'},ensure_ascii=False,indent=2),encoding='utf-8')
print('COVERS DONE: 1440x1080 and 1920x1080')
