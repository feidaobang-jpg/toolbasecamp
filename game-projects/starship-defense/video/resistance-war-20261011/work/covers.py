"""抗战战役封面生成：真实游戏画面 + 设计排版。

主图：攻城炮落点环对准平安县城门（"城门命中"红环）那一帧——本期最强名场面。
排版：顶部深色标题带（盖住左上 warHUD 与右上按钮的杂乱区）放主标题；
      底部深色带放副标题与试玩信息；中间保留城门+落点环+炮身主体。
输出：cover-4x3.png (1440x1080, B站首页推荐) 与 cover-16x9.png (1920x1080, B站空间/抖音/YouTube)。
不写模型名（用户偏好：模型名只进简介与标签）。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

R = Path(__file__).resolve().parent
SRC = R / 'cover-src-cannon.png'
OUT = R / 'covers'
OUT.mkdir(exist_ok=True)

GOLD = '#ffe39b'
WHITE = '#f2f6ec'
TEAL = '#8be1ca'
BAND = (14, 20, 16, 232)


def font(sz, bold=True):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc', sz)


def make(width, height, out):
    src = Image.open(SRC).convert('RGB')
    # 4:3 时中心裁切；16:9 用全幅
    if width / height < 16 / 9 - 0.01:
        cw = int(height * width / height * (width / height) / (width / height))  # placeholder
        cw = int(round(height * (width / height)))
        cw = width  # 目标宽即裁切宽（高不变 1080）
        left = (src.width - cw) // 2
        src = src.crop((left, 0, left + cw, height))
    else:
        src = src.resize((width, height)) if src.size != (width, height) else src
    im = src.convert('RGBA')
    d = ImageDraw.Draw(im)

    top_h = round(height * 0.245)   # 顶部标题带：盖住 warHUD/右上按钮
    bot_h = round(height * 0.225)   # 底部信息带：盖住状态栏/键位提示/操炮工具
    d.rectangle([0, 0, width, top_h], fill=BAND)
    d.rectangle([0, height - bot_h, width, height], fill=BAND)
    # 细金线分隔
    d.rectangle([0, top_h, width, top_h + 3], fill=(213, 155, 55, 255))
    d.rectangle([0, height - bot_h - 3, width, height - bot_h], fill=(213, 155, 55, 255))

    # 主标题（顶部带内居中）
    t1 = '平安县城，开炮！'
    f1 = font(round(height * 0.105))
    d.text((width // 2, top_h // 2 - round(height * 0.012)), t1, font=f1, fill=GOLD, anchor='mm')
    # 顶部带内小 kicker
    f0 = font(round(height * 0.030))
    d.text((width // 2, round(height * 0.045)), '虫潮围城 · 抗战战役 · 亮剑名场面', font=f0, fill=TEAL, anchor='mm')

    # 底部带：副标题 + 说明
    f2 = font(round(height * 0.052))
    d.text((width // 2, height - bot_h + round(bot_h * 0.34)), '三章名场面 · 全程正常规则通关', font=f2, fill=WHITE, anchor='mm')
    f3 = font(round(height * 0.034), bold=False)
    d.text((width // 2, height - bot_h + round(bot_h * 0.70)), '网页可玩 · 电脑手机都行 · 简介附试玩入口', font=f3, fill='#cfd8c6', anchor='mm')

    im.convert('RGB').save(out, quality=95)
    print(f'{out.name}: {im.width}x{im.height}')


make(1440, 1080, OUT / 'cover-home-4x3.png')
make(1920, 1080, OUT / 'cover-space-16x9.png')

# 缩略图可读性自测（B站 4:3→320x240、16:9→320x180）
for name, tw, th in [('cover-home-4x3.png', 320, 240), ('cover-space-16x9.png', 320, 180)]:
    im = Image.open(OUT / name)
    im.resize((tw, th), Image.LANCZOS).save(OUT / ('thumb-' + name))
    print(f'thumb-{name}: {tw}x{th}')
