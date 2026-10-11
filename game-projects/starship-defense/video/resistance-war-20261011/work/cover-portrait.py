"""Render the approved cover design at Douyin's 3:4 ratio without clipping text."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
width, height = 1080, 1440
source = Image.open(root / 'cover-src-cannon.png').convert('RGB')
# Preserve the cannon and gate at the same centered composition.
crop_width = int(source.height * width / height)
left = (source.width - crop_width) // 2
canvas = source.crop((left, 0, left + crop_width, source.height)).resize((width, height), Image.Resampling.LANCZOS)
draw = ImageDraw.Draw(canvas)
draw.rectangle((0, 0, width, 352), fill='#0e1410')
draw.rectangle((0, 1116, width, height), fill='#0e1410')
draw.line((0, 352, width, 352), fill='#d59b37', width=3)
draw.line((0, 1116, width, 1116), fill='#d59b37', width=3)

def line(text, y, size, color, bold=True):
    path = 'C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc'
    face = ImageFont.truetype(path, size)
    while draw.textbbox((0, 0), text, font=face)[2] > width - 96:
        size -= 1
        face = ImageFont.truetype(path, size)
    draw.text((width // 2, y), text, fill=color, font=face, anchor='mm')

line('虫潮围城 · 抗战战役 · 亮剑名场面', 85, 38, '#8be1ca')
line('平安县城，开炮！', 210, 118, '#ffe39b')
line('三章名场面', 1182, 58, '#f2f6ec')
line('全程正常规则通关', 1264, 58, '#f2f6ec')
line('电脑手机都行 · 简介附试玩入口', 1360, 38, '#cfd8c6', False)
output = root.parent / 'final/douyin-zh/cover-portrait-3x4.png'
canvas.save(output)
print(output)
