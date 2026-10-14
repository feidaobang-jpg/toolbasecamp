"""Build contact sheets from captured frames so the editor can pick exact timecodes."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

W = Path(__file__).resolve().parent
OUT = W / 'qa' / 'sheets'
OUT.mkdir(parents=True, exist_ok=True)


def pick(frames, t):
    best = min(range(len(frames)), key=lambda i: abs(frames[i]['t'] - t))
    return best


def sheet(name, times, cols=4, cell=(640, 360)):
    d = json.loads((W / 'capture' / f'{name}.json').read_text('utf-8'))
    fr = d['frames']
    rows = (len(times) + cols - 1) // cols
    canvas = Image.new('RGB', (cols * cell[0], rows * (cell[1] + 26)), 'black')
    dr = ImageDraw.Draw(canvas)
    for i, t in enumerate(times):
        idx = pick(fr, t)
        img = Image.open(W / 'capture' / f'{name}-frames' / fr[idx]['file']).resize(cell)
        x, y = (i % cols) * cell[0], (i // cols) * (cell[1] + 26)
        canvas.paste(img, (x, y))
        dr.text((x + 6, y + cell[1] + 4), f'{t:.1f}s -> frame {idx} actual {fr[idx]["t"]:.1f}s', fill='yellow')
    p = OUT / f'{name}-{times[0]:.0f}-{times[-1]:.0f}.jpg'
    canvas.save(p, quality=88)
    print(p)


if __name__ == '__main__':
    sheet('full', list(range(0, 130, 8)))
    sheet('full', list(range(130, 300, 14)))
    sheet('full', list(range(300, 532, 20)))
    sheet('rescue', list(range(90, 170, 6)))
    sheet('rescue', list(range(170, 417, 22)))
    sheet('lobby', [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.0])
