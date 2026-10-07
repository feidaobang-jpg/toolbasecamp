"""Two Bilibili covers using exact crops from the recorded game, no generated models."""
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageEnhance,ImageOps
W=Path(__file__).resolve().parent;F=W.parent/'final/bilibili-zh';S=W/'edit/bilibili-zh/covers';S.mkdir(parents=True,exist_ok=True);F.mkdir(parents=True,exist_ok=True)
src=W/'qa/retimed-source/009.00.jpg';original=Image.open(src).convert('RGB')
hero_source=W/'capture/cover-close-host.png';close=Image.open(hero_source).convert('RGB')
gold=close.crop((752,406,1022,679));blue=close.crop((1524,399,1822,669))
def font(n):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
for width,height,name in [(1440,1080,'cover-home-4x3'),(1920,1080,'cover-space-16x9')]:
    background=ImageOps.fit(original,(width,height));background=ImageEnhance.Brightness(background).enhance(.33);im=background.convert('RGBA');d=ImageDraw.Draw(im)
    d.rounded_rectangle((55,52,455,134),radius=18,fill='#e9ddb8');d.text((85,63),'坦克大战',font=font(61),fill='#1e3926')
    title='能联机了！';size=152 if width==1440 else 171;d.text((70,166),title,font=font(size),fill='#fff1a6',stroke_width=7,stroke_fill='#14271e')
    d.text((78,374),'2–4人，一起守老鹰',font=font(62),fill='#FFFFFF',stroke_width=3,stroke_fill='#15271e')
    gap=160 if width==1440 else 280;box=400;center=width//2
    positions=[(center-gap//2-box,530,'1P','#ffd873',gold),(center+gap//2,530,'2P','#69d2ef',blue)]
    for x,y,label,color,pic in positions:
        d.rounded_rectangle((x,y,x+box,y+400),radius=34,fill='#101414',outline=color,width=6)
        d.text((x+28,y+24),label,font=font(55),fill=color)
        hero=ImageOps.contain(pic,(305,292));im.alpha_composite(hero.convert('RGBA'),(x+(box-hero.width)//2,y+88))
    d.text((width//2,995),'双人联机实战 · 房间码邀请',font=font(45),fill='#f6edd3',anchor='mm')
    im.convert('RGB').save(F/(name+'.jpg'),quality=96);im.save(S/(name+'-master.png'))
    im.convert('RGB').resize((320,round(320*height/width))).save(S/(name+'-thumbnail.jpg'),quality=94)
(S/'design.json').write_text(json.dumps({'source':str(src.relative_to(W)),'source_time_seconds':9,'hero_source':str(hero_source.relative_to(W)),'hero_evidence':'cover-capture.json; actual near-view co-op spawn, no gameplay modifications','method':'recorded screenshot background darkened; two exact native close-view tank crops in graphic panels; not an untreated screenshot','gold_crop':[752,406,1022,679],'blue_crop':[1524,399,1822,669],'copy':['坦克大战','能联机了！','2–4人，一起守老鹰'],'font':'Microsoft YaHei Bold'},ensure_ascii=False,indent=2),encoding='utf-8')
print('covers complete')
