"""Two separately composed Bilibili covers, based only on this episode's gameplay."""
from pathlib import Path
import subprocess,json
from PIL import Image,ImageDraw,ImageFont,ImageOps
R=Path(__file__).resolve().parent; E=R/'edit/bilibili-zh/covers';E.mkdir(parents=True,exist_ok=True)
F=R.parent/'final/bilibili-zh';F.mkdir(parents=True,exist_ok=True)
def font(n):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
for name,game,t in [('overview','tank-3d',6),('first','starship-defense',82)]:
    subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(R/'capture'/(game+'.mp4')),'-frames:v','1',str(E/(name+'.jpg'))],check=True)
for width,height,purpose in [(1440,1080,'home-4x3'),(1920,1080,'space-16x9')]:
    im=Image.new('RGB',(width,height),'#091820');d=ImageDraw.Draw(im)
    for y in range(height):d.line((0,y,width,y),fill=(9+int(y/height*8),24+int(y/height*12),32+int(y/height*12)))
    d.rounded_rectangle((55,45,350,101),radius=16,fill='#18414a')
    d.text((76,55),'五款游戏 · 实机对照',font=font(28),fill='#A7F1E8')
    d.text((55,117),'换个视角，亲自上场',font=font(94 if width==1440 else 110),fill='#FFFFFF',stroke_width=1)
    d.text((58,246),'按下 C  ·  从看清全局，到第一人称',font=font(34 if width==1440 else 41),fill='#FFD56C')
    gap=38;pad=55;pw=(width-pad*2-gap)//2;ph=490 if width==1440 else 520;top=354
    for x,name,lab in [(pad,'overview','看清全局'),(pad+pw+gap,'first','第一人称')]:
        src=Image.open(E/(name+'.jpg')).convert('RGB')
        # Remove the small HUD; crop the real gameplay without synthesizing detail.
        src=src.crop((140,90,1780,1040))
        pane=ImageOps.fit(src,(pw,ph),method=Image.Resampling.LANCZOS)
        im.paste(pane,(x,top));d.rounded_rectangle((x-2,top-2,x+pw+2,top+ph+2),radius=4,outline='#60D0C9',width=4)
        d.rounded_rectangle((x+16,top+16,x+270,top+77),radius=12,fill='#0B202A')
        d.text((x+36,top+25),lab,font=font(36),fill='#FFFFFF')
    mid=width//2;cy=top+ph//2
    d.polygon([(mid-43,cy-42),(mid+27,cy-42),(mid+27,cy-68),(mid+83,cy),(mid+27,cy+68),(mid+27,cy+42),(mid-43,cy+42)],fill='#FFD56C')
    d.text((width//2,927),'坦克大战  /  超级玛丽  /  赤色要塞',font=font(36 if width==1440 else 43),fill='#FFFFFF',anchor='mm')
    d.text((width//2,982),'恐龙快打  /  虫潮围城',font=font(36 if width==1440 else 43),fill='#FFFFFF',anchor='mm')
    d.text((width-55,1040),'飞刀班长 · Toy 可试玩',font=font(25),fill='#7FA6B0',anchor='rm')
    im.save(F/('cover-'+purpose+'.jpg'),quality=95,subsampling=0)
    im.resize((320,240 if width==1440 else 180),Image.Resampling.LANCZOS).save(E/(purpose+'-thumbnail.jpg'),quality=95)
(E/'design.json').write_text(json.dumps({'copy':'换个视角，亲自上场','source_frames':[{'game':'tank-3d','time':6},{'game':'starship-defense','time':82}],'method':'Pillow typography and crop of actual episode frames; no AI reconstruction','sizes':[[1440,1080],[1920,1080]]},ensure_ascii=False,indent=2),encoding='utf-8')
print('COVERS COMPLETE')
