"""平安县城 v0.5.0 双封面：真实实机帧裁切放大 + 排版（非原始截图，工程记录见 sources.md）。"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

W = Path(__file__).resolve().parent
SRC = W / 'capture'
OUT = W.parent / 'final/bilibili-zh'
MASTER = W / 'cover-src'
OUT.mkdir(parents=True, exist_ok=True)
MASTER.mkdir(parents=True, exist_ok=True)

FRAMES = {n: json.loads((SRC / f'{n}.json').read_text('utf-8'))['frames'] for n in ('full', 'rescue', 'mg', 'lobby')}
FONT_BOLD = 'C:/Windows/Fonts/msyhbd.ttc'
FONT_HEI = 'C:/Windows/Fonts/simhei.ttf'
MAIN = '开炮，还是救人？'
SUB = '平安县城 · 双结局'
TAG = '枪火集结 · 抗战战役'


def frame(source, t):
    fr = FRAMES[source]
    i = min(range(len(fr)), key=lambda k: abs(fr[k]['t'] - t))
    return Image.open(SRC / f'{source}-frames' / fr[i]['file']).convert('RGB'), fr[i]['t']


def text(draw, xy, s, size, fill, font=FONT_BOLD, stroke=6, anchor='mm'):
    draw.text(xy, s, font=ImageFont.truetype(font, size), fill=fill, stroke_width=stroke,
              stroke_fill=(8, 8, 10), anchor=anchor)


def build(name, source, t, crop, size, layout, panel=None):
    wide, actual = frame(source, t)
    im = wide.crop(crop)
    im = im.resize(size, Image.LANCZOS)
    im = ImageEnhance.Color(im).enhance(1.12)
    im = ImageEnhance.Contrast(im).enhance(1.06)
    w, h = size
    if layout == 'bottom':
        base = im.convert('RGB')
        d = ImageDraw.Draw(base, 'RGBA')
        d.rectangle((0, h * .60, w, h), fill=(6, 6, 10, 150))
        d.polygon([(0, h * .60), (w, h * .66), (w, h), (0, h)], fill=(6, 6, 10, 130))
        text(d, (w * .5, h * .765), MAIN, int(h * .128), (255, 246, 232), stroke=int(h * .0075))
        text(d, (w * .5, h * .885), SUB, int(h * .055), (255, 214, 120), font=FONT_HEI, stroke=int(h * .004))
        text(d, (w * .5, h * .055), TAG, int(h * .036), (238, 238, 238), font=FONT_HEI, stroke=int(h * .003))
    else:  # 16:9：真实城楼特写放大置于右侧，左侧留给文案
        wide, _ = frame(source, t)
        base = wide.filter(ImageFilter.GaussianBlur(14)).resize(size)
        base = ImageEnhance.Brightness(base).enhance(.5)
        panel = wide.crop(panel).resize((int(w * .46), int(h * 1.02)), Image.LANCZOS)
        base = base.convert('RGB')
        base.paste(panel, (int(w * .50), 0))
        d = ImageDraw.Draw(base, 'RGBA')
        d.polygon([(0, 0), (w * .56, 0), (w * .44, h), (0, h)], fill=(6, 6, 10, 165))
        text(d, (w * .045, h * .44), MAIN, int(h * .115), (255, 246, 232), stroke=int(h * .007), anchor='lm')
        text(d, (w * .047, h * .60), SUB, int(h * .052), (255, 214, 120), font=FONT_HEI, stroke=int(h * .0035), anchor='lm')
        text(d, (w * .047, h * .10), TAG, int(h * .034), (238, 238, 238), font=FONT_HEI, stroke=int(h * .003), anchor='lm')
    base.save(MASTER / f'{name}-master.jpg', quality=95)
    base.resize((320, int(320 * h / w)), Image.LANCZOS).save(MASTER / f'{name}-thumb320.jpg', quality=90)
    base.save(OUT / f'{name}.jpg', quality=93)
    print(name, size, 'src', source, round(actual, 1), 'crop', crop)


if __name__ == '__main__':
    # 4:3 首页推荐：城楼上的秀芹与山本（抉择过场），裁掉上方 HUD 后放大
    build('cover-home-4x3', 'full', 76.0, (500, 175, 1580, 985), (1440, 1080), 'bottom')
    # 16:9 个人空间：同一场戏的城楼特写置于右侧，左侧文案
    build('cover-space-16x9', 'full', 76.0, (0, 0, 1920, 1080), (1920, 1080), 'side',
          panel=(690, 250, 1330, 1010))
