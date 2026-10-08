"""Native graphic layout using a real gameplay frame; no generated game art."""
from pathlib import Path
import subprocess
from PIL import Image,ImageDraw,ImageFont,ImageOps
R=Path(__file__).resolve().parent;E=R/'edit/covers';E.mkdir(parents=True,exist_ok=True)
FINAL=R.parent/'final';BOLD='C:/Windows/Fonts/msyhbd.ttc';REG='C:/Windows/Fonts/msyh.ttc'
frame=E/'gameplay-source.jpg'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','17','-i',str(R/'capture-1v1/04-late-battle/raw.mp4'),'-frames:v','1',str(frame)],check=True)
def build(w,h,dest):
 raw=Image.open(frame).convert('RGB')
 # Remove captured HUD from the decorative background, preserving actual battlefield geometry.
 raw=raw.crop((260,155,1450,995));im=ImageOps.fit(raw,(w,h),method=Image.Resampling.LANCZOS).convert('RGBA')
 shade=Image.new('RGBA',(w,h));d=ImageDraw.Draw(shade)
 for x in range(w):
  alpha=int(230*(1-x/w)**.55+30);d.line((x,0,x,h),fill=(9,20,31,min(245,alpha)))
 im=Image.alpha_composite(im,shade);d=ImageDraw.Draw(im);s=h/1080
 def F(n,b=True):return ImageFont.truetype(BOLD if b else REG,round(n*s))
 left=round(90*s);top=round(78*s)
 d.rounded_rectangle((left,top,left+round(470*s),top+round(72*s)),radius=round(20*s),fill='#294657')
 d.text((left+round(24*s),top+round(14*s)),'网友愿望 · 11票',font=F(37),fill='#b6f0dc')
 d.text((left,round(240*s)),'愿望榜第一名',font=F(100),fill='#ffffff',stroke_width=round(2*s),stroke_fill='#071824')
 d.text((left,round(375*s)),'做成了对战！',font=F(116),fill='#ffe297',stroke_width=round(2*s),stroke_fill='#071824')
 d.text((left,round(558*s)),'虫潮围城',font=F(51),fill='#d0e7ee')
 bx=left;by=round(680*s);bw=min(w-left*2,round(920*s));bh=round(142*s)
 d.rounded_rectangle((bx,by,bx+bw,by+bh),radius=round(26*s),fill='#173246',outline='#67d8cc',width=max(1,round(3*s)))
 d.text((bx+round(30*s),by+round(22*s)),'1 对 1  →  4 对 4',font=F(68),fill='#f4f8fb')
 d.text((left,round(934*s)),'先升银行，还是先出兵？',font=F(43),fill='#aee9e0')
 im.convert('RGB').save(dest,quality=94,optimize=True)
 # SVG source keeps editable native typography and references the preserved gameplay frame.
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="100%" height="100%" fill="#0b1722"/><text x="{left}" y="{320*s}" font-family="Microsoft YaHei" font-weight="bold" font-size="{100*s}" fill="white">愿望榜第一名</text><text x="{left}" y="{485*s}" font-family="Microsoft YaHei" font-weight="bold" font-size="{116*s}" fill="#ffe297">做成了对战！</text><text x="{left}" y="{620*s}" font-family="Microsoft YaHei" font-size="{51*s}" fill="#d0e7ee">虫潮围城 · 1 对 1 → 4 对 4</text></svg>'''
 (E/(dest.stem+'.svg')).write_text(svg,encoding='utf-8')
 im.convert('RGB').resize((320,round(320*h/w))).save(E/(dest.stem+'-thumb.jpg'))
for platform,w,h,name in [
 ('bilibili-zh',1440,1080,'cover-home-4x3.jpg'),('bilibili-zh',1920,1080,'cover-space-16x9.jpg'),
 ('douyin-zh',1440,1080,'cover-horizontal-4x3.jpg'),('douyin-zh',1080,1440,'cover-portrait-3x4.jpg'),
 ('youtube-zh',1920,1080,'cover-zh-16x9.jpg')]:
 (FINAL/platform).mkdir(parents=True,exist_ok=True)
 build(w,h,FINAL/platform/name)
print('COVERS DONE')
