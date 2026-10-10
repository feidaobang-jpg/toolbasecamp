# 把 moves-strip.js 的逐帧图拼成每招一张联系表：python qa/strip-sheet.py <前缀> [每行张数]
import json, sys, os
from PIL import Image, ImageDraw
pre = sys.argv[1]; cols = int(sys.argv[2]) if len(sys.argv) > 2 else 6
d = os.path.join(os.path.dirname(__file__), 'out')
idx = json.load(open(os.path.join(d, pre + '-frames.json'), encoding='utf-8'))
groups = {}
for r in idx: groups.setdefault((r['hero'], r['seq']), []).append(r)
for (h, s), rows in groups.items():
    w, hgt = 300, 200
    sheet = Image.new('RGB', (cols * w, ((len(rows) + cols - 1) // cols) * hgt), 'black')
    dr = ImageDraw.Draw(sheet)
    for i, r in enumerate(rows):
        im = Image.open(os.path.join(d, r['file'])).resize((w, hgt))
        x, y = (i % cols) * w, (i // cols) * hgt
        sheet.paste(im, (x, y))
        dr.text((x + 4, y + 2), f"f{r['f']} {r['move'] or r['p']} t{r['mt']} hs{r['hs']} e:{r['e']}", fill='yellow')
    sheet.save(os.path.join(d, f'{pre}-sheet-h{h}-{s}.png'))
    print(f'{pre}-sheet-h{h}-{s}.png')
