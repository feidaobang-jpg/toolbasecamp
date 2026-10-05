"""B 站双封面：实机第一人称截帧（capture/views-run-1080p.mp4 第 221.0 秒，Boss 战岩跳龙与维斯）+ 排版。
只做轻微放大裁掉 HUD、加暗角与文字，不改画面内容。"""
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
R = Path(__file__).resolve().parent
F = R.parent / 'final/bilibili-zh'; F.mkdir(parents=True, exist_ok=True)
C = R / 'covers'; C.mkdir(exist_ok=True)
SRC_T = 221.0
src = C / f'src-{SRC_T}.jpg'
if not src.exists():
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(SRC_T), '-i', str(R / 'capture/views-run-1080p.mp4'), '-frames:v', '1', '-q:v', '2', str(src)], check=True)
base = Image.open(src).convert('RGB')
def font(n): return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', n)
def text(d, xy, s, size, fill, anchor='la', stroke=10):
    d.text(xy, s, font=font(size), fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill='#1a0f08')
def pill(d, xy, s, size, anchor):
    f = font(size); x0, y0, x1, y1 = d.textbbox(xy, s, font=f, anchor=anchor)
    d.rounded_rectangle((x0 - 22, y0 - 12, x1 + 22, y1 + 14), radius=(y1 - y0) // 2 + 12, fill=(28, 18, 44, 230), outline='#ffd23f', width=3)
    d.text(xy, s, font=f, fill='#ffe9c4', anchor=anchor)
def shade(size, box_fn):
    m = Image.new('L', size, 0); box_fn(ImageDraw.Draw(m)); return m.filter(ImageFilter.GaussianBlur(60))

# 16:9 个人空间封面：裁掉顶部 HUD 后放大 1.11 倍，文字放右上天空区
sp = base.crop((96, 98, 96 + 1728, 98 + 972)).resize((1920, 1080), Image.LANCZOS)
dark = Image.new('RGB', sp.size, '#0d0712')
sp = Image.composite(dark, sp, shade(sp.size, lambda d: d.rectangle((1330, -100, 2100, 640), fill=165)))
d = ImageDraw.Draw(sp, 'RGBA')
text(d, (1880, 70), '恐龙快打 · 第一关 3D', 48, '#ffffff', 'ra', 7)
text(d, (1880, 140), '钻进主角', 150, '#ffd23f', 'ra')
text(d, (1880, 310), '眼睛里打', 150, '#ffd23f', 'ra')
pill(d, (1868, 520), '侧视 · 正视 · 第一人称', 40, 'rm')
sp.save(F / 'cover-space-16x9.jpg', quality=93)

# 4:3 首页推荐封面：同一帧取中间 4:3（恐龙牙、维斯、拳头都在），文字放顶部
hm = base.crop((250, 98, 250 + 1296, 98 + 972)).resize((1440, 1080), Image.LANCZOS)
hm = Image.composite(Image.new('RGB', hm.size, '#0d0712'), hm, shade(hm.size, lambda d: d.rectangle((-100, -100, 1540, 250), fill=175)))
d = ImageDraw.Draw(hm, 'RGBA')
text(d, (720, 30), '恐龙快打 · 第一关 3D', 50, '#ffffff', 'ma', 7)
text(d, (720, 100), '钻进主角眼睛里打', 128, '#ffd23f', 'ma')
pill(d, (60, 1010), '侧视 · 正视 · 第一人称', 40, 'lm')
hm.save(F / 'cover-home-4x3.jpg', quality=93)
for n in ('cover-space-16x9.jpg', 'cover-home-4x3.jpg'):
    im = Image.open(F / n); print(n, im.size, round(im.size[0] / im.size[1], 4))
# 缩略图可读性测试图（只放 work/tmp，不交付）
t = R / 'tmp/review'; t.mkdir(parents=True, exist_ok=True)
Image.open(F / 'cover-space-16x9.jpg').resize((320, 180), Image.LANCZOS).save(t / 'thumb-16x9.jpg')
Image.open(F / 'cover-home-4x3.jpg').resize((320, 240), Image.LANCZOS).save(t / 'thumb-4x3.jpg')
