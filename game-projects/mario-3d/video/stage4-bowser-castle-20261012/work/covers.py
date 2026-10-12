# -*- coding: utf-8 -*-
"""超级玛丽 3D 1-4 库巴城堡 —— 封面（真实成片帧 + 原生排版，不生成玩法画面）。

从已渲染母版里抽两帧真实实机（火棒走廊 / 库巴吊桥），裁切放大后用本机微软雅黑排版，
输出 B 站首页 4:3、B 站空间与 YouTube 16:9，并复制到各 final 目录。
"""
import json, os, shutil, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

R = Path(__file__).resolve().parent                       # work/
MEDIA = Path(os.environ.get('MEDIA_DIR', 'D:/project/task-artifacts/mario-stage4-video-20261012'))
MASTER = MEDIA / 'master' / 'mario-1-4-master.mp4'
CAP = MEDIA / 'capture'
FIN, C = MEDIA / 'final', R / 'edit' / 'covers'
C.mkdir(parents=True, exist_ok=True)

# 封面取未烧字幕的原始实机段（母版上挂着解说字幕，直接抽帧会把字幕带进封面）
# 35.5 秒这帧：玛丽在跳、库巴吊在浮台下面、下面是吊桥和岩浆，一眼看得懂这关在干什么
TAKES = {'firebars': ('heroic-side', 20.0), 'bowser': ('heroic-side', 35.5)}


def grab(name, at):
    src = CAP / (TAKES[name][0] + '.mp4')
    out = C / f'frame-{name}.jpg'
    for t in (str(at), str(round(at, 2))):                # 精确 seek 时 ffmpeg 会退回开头，先试快速 seek
        p = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', t, '-i', str(src),
                            '-frames:v', '1', '-q:v', '2', out], capture_output=True, text=True)
        if p.returncode == 0 and out.exists() and out.stat().st_size > 20000:
            return out
        last = p.stderr
    raise SystemExit(f'抽帧失败 {name}@{at}：{last[-400:]}')


def font(n, bold=True):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc', n)


def cover(w, h, name, frame, crop, box):
    """frame: 母版抽出的真实帧；crop: 从 1920x1080 帧里取哪一块（突出主体）；box: 实机画面摆放区"""
    im = Image.new('RGB', (w, h), '#120d10')
    src = Image.open(frame).convert('RGB').crop(crop)
    pw, ph = box[2] - box[0], box[3] - box[1]
    im.paste(ImageOps.fit(src, (pw, ph), method=Image.Resampling.LANCZOS), (box[0], box[1]))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w, h), outline='#2b1d22', width=3)
    left = 70 if w == 1920 else 55
    d.rounded_rectangle((left, 58, left + 640, 122), radius=16, fill='#7a1d1d')
    d.text((left + 22, 65), '超级玛丽 3D · WORLD 1-4', font=font(38), fill='#ffe9c9')
    big = 150 if w == 1920 else 128
    d.text((left, 168), '库巴城堡', font=font(big), fill='#ffd76a', stroke_width=4, stroke_fill='#2a1010')
    d.text((left, 168 + big * 1.18), '砍桥那一刻', font=font(big), fill='#ffffff', stroke_width=4, stroke_fill='#2a1010')
    d.text((left, 168 + big * 2.42), '7 根火棒 · 4 处岩浆 · 13 格吊桥', font=font(44 if w == 1920 else 30, False), fill='#f0dede')
    d.text((left, h - 96), '网页版与哔哩哔哩 Toy 均已上线', font=font(32, False), fill='#d8c3c3')
    im.save(C / name, quality=95, subsampling=0)
    return C / name


f_bowser = grab('bowser', TAKES['bowser'][1])
f_firebars = grab('firebars', TAKES['firebars'][1])
c16 = cover(1920, 1080, 'cover-space-16x9.jpg', f_bowser, (760, 240, 1900, 1080), (900, 120, 1860, 860))
# 4:3 用"火棒＋玛丽"这一帧：火棒在画面左侧 x60~560，玛丽在 x760 附近，取这块方图才带得上主角
c43 = cover(1440, 1080, 'cover-home-4x3.jpg', f_firebars, (60, 160, 960, 1000), (700, 90, 1400, 870))

for v in ('bilibili-zh', 'douyin-zh', 'youtube-zh'):
    (FIN / v).mkdir(parents=True, exist_ok=True)
shutil.copy2(c43, FIN / 'bilibili-zh/cover-home-4x3.jpg')
shutil.copy2(c16, FIN / 'bilibili-zh/cover-space-16x9.jpg')
shutil.copy2(c16, FIN / 'douyin-zh/cover-16x9.jpg')
shutil.copy2(c16, FIN / 'youtube-zh/cover-zh-16x9.jpg')
for p in (c16, c43):                                     # 小图预览：检查缩略图状态下文字是否还认得出
    im = Image.open(p); im.thumbnail((320, 240)); im.save(C / (p.stem + '-thumbnail.jpg'), quality=95)
(C / 'source.json').write_text(json.dumps({
    'source': 'capture/heroic-side.mp4（未烧字幕的实机母版，避免封面带上解说字幕）', 'source_seconds': TAKES,
    'operations': '抽帧自真实实机段，裁切缩放 + 本机微软雅黑原生排版',
    'gameplay_features_generated': False,
    'font': 'C:/Windows/Fonts/msyhbd.ttc / msyh.ttc，字体文件不随包分发',
}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print('封面完成', c43, c16)
