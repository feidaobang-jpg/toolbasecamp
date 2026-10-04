"""双封面：实机 Boss 战截图 + 文字排版。home 4:3 = 1440x1080，space 16:9 = 1920x1080。"""
from PIL import Image,ImageDraw,ImageFont,ImageOps
from pathlib import Path
R=Path(__file__).resolve().parent
E=R/'edit/bilibili-zh/covers';E.mkdir(parents=True,exist_ok=True)
F=R.parent/'final/bilibili-zh'
SRC=R.parent.parent.parent/'qa/out/cover-a.png'  # 2560x1440 实机摆拍：穆斯塔法飞踢维斯、岩跳龙在旁，HUD 已隐藏
base=Image.open(SRC).convert('RGB')
def font(n):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
def compose(canvas,titles):
 d=ImageDraw.Draw(canvas)
 # 顶部深色渐变带，保证文字可读
 w,h=canvas.size
 grad=Image.new('L',(1,h),0)
 for y in range(h):
  grad.putpixel((0,y),int(160*(1-y/h)) if y<h//2 else 0)
 band=Image.new('RGB',(w,h),'#1a1030')
 canvas=Image.composite(band,canvas,grad.resize((w,h)))
 d=ImageDraw.Draw(canvas)
 y=36
 for i,(t,n,c) in enumerate(titles):
  x=44 if i==0 else 52
  d.text((x,y),t,font=font(n),fill=c,stroke_width=6 if i==0 else 4,stroke_fill='#2a0d0d')
  y+=n+18
 return canvas
home=base.crop((320,0,2240,1440)).resize((1440,1080),Image.LANCZOS)
home=compose(home,[('恐龙快打 3D',132,'#ff5a3c'),('第一关 · 按C切到主角背后',60,'#ffe9c4')])
home.save(F/'cover-home-4x3.jpg',quality=95)
space=base.resize((1920,1080),Image.LANCZOS)
space=compose(space,[('恐龙快打 3D',132,'#ff5a3c'),('第一关 · 按C切到主角背后',60,'#ffe9c4')])
space.save(F/'cover-space-16x9.jpg',quality=95)
# 缩略图自检用
Image.open(F/'cover-home-4x3.jpg').resize((320,240)).save(E/'thumb-4x3.jpg')
Image.open(F/'cover-space-16x9.jpg').resize((320,180)).save(E/'thumb-16x9.jpg')
Image.open(F/'cover-home-4x3.jpg').save(E/'home-source.png')
Image.open(F/'cover-space-16x9.jpg').save(E/'space-source.png')
print('covers done',home.size,space.size)
