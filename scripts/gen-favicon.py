from PIL import Image, ImageDraw, ImageFont
import os

out = os.path.join(os.path.dirname(__file__), '..', 'public')
out = os.path.abspath(out)


def make(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = max(2, size // 5)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=(37, 99, 235, 255))
    try:
        font = ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', max(10, int(size * 0.42)))
    except Exception:
        font = ImageFont.load_default()
    text = 'TB'
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] + size * 0.02
    d.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    return img.convert('RGBA')


make(32).save(os.path.join(out, 'favicon-32.png'))
make(180).save(os.path.join(out, 'apple-touch-icon.png'))

images = [make(16), make(32), make(48)]
ico_path = os.path.join(out, 'favicon.ico')
images[0].save(ico_path, format='ICO', append_images=images[1:])
print('ico bytes', os.path.getsize(ico_path))

svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" '
    'role="img" aria-label="Tool Basecamp">'
    '<rect width="64" height="64" rx="14" fill="#2563eb"/>'
    '<text x="32" y="42" text-anchor="middle" '
    'font-family="Arial, Helvetica, sans-serif" font-size="28" '
    'font-weight="700" fill="#fff">TB</text>'
    '</svg>\n'
)
with open(os.path.join(out, 'favicon.svg'), 'w', encoding='utf-8') as f:
    f.write(svg)
print('done', out)
