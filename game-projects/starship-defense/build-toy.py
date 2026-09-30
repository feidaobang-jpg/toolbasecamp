"""Build an independent Toy edition from the existing website game (stdlib only)."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/html/game/starship_defense.html'
OUT = ROOT / 'dist/toy/chongchao-qianshao'
PACKAGE = OUT / 'package'


def build():
    PACKAGE.mkdir(parents=True, exist_ok=True)
    text = SOURCE.read_text(encoding='utf-8')
    marker = '<script src="../../js/game/thumb-preview.js"></script>'
    if text.count(marker) != 1:
        raise ValueError('Website capture adapter changed; review export before publishing')
    text = text.split(marker)[0] + '</body>\n</html>\n'
    text = text.replace('星河战队', '虫潮前哨')
    text = text.replace("const SAVE_PREFIX='", "const SAVE_PREFIX='toy-chongchao-v1-")
    # Keep the Three.js MIT notice and split the library without rewriting its bytes.
    scripts = list(re.finditer(r'<script>([\s\S]*?)</script>', text))
    if len(scripts) != 2 or 'Three.js r152' not in scripts[0][1]:
        raise ValueError('Unexpected source script structure')
    library, game = scripts
    (PACKAGE / 'three.min.js').write_text(library[1], encoding='utf-8')
    (PACKAGE / 'game.js').write_text(game[1], encoding='utf-8')
    text = text[:game.start()] + '<script src="./game.js"></script>\n<script src="./toy-adapter.js"></script>' + text[game.end():]
    text = text[:library.start()] + '<script src="./three.min.js"></script>' + text[library.end():]
    text = text.replace('<style>', '<style>\n#btnTest{display:none!important;}\n#toyControls{position:absolute;right:8px;top:96px;z-index:45;display:flex;gap:8px;}\n#toyControls button{padding:6px 12px;font-size:12px;}\n')
    text = text.replace('<canvas id="c3d"></canvas>', '<canvas id="c3d"></canvas>\n<div id="toyControls"><button class="mbtn" id="toyMute" aria-pressed="false">静音 M</button><button class="mbtn" id="toyFull">全屏 F</button></div>')
    text = text.replace('守 卫 基 地</div>', '守 卫 基 地 · 试 玩 版</div>')
    text = text.replace('Mobile Infantry trooper (虫潮前哨步兵)', 'procedural low-poly outpost soldier')
    text = text.replace('选择兵种</h2>', '守住基地，挡下虫潮</h2>')
    text = text.replace('🚀 开始新游戏', '🚀 开始守卫')
    (PACKAGE / 'index.html').write_text(text, encoding='utf-8')
    adapter = Path(__file__).with_name('toy-adapter.js').read_text(encoding='utf-8')
    (PACKAGE / 'toy-adapter.js').write_text(adapter, encoding='utf-8')
    archive = OUT / 'chongchao-qianshao.zip'
    license_text = Path(__file__).with_name('THREE-LICENSE.txt').read_text(encoding='utf-8')
    (PACKAGE / 'THREE-LICENSE.txt').write_text(license_text, encoding='utf-8')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in ('index.html', 'three.min.js', 'game.js', 'toy-adapter.js'):
            z.write(PACKAGE / name, name)
        z.write(PACKAGE / 'THREE-LICENSE.txt', 'THREE-LICENSE.txt')
    manifest = {
        'title': '虫潮前哨：守卫基地', 'slug': 'chongchao-qianshao',
        'version': 'toy-v0.1.0', 'source': str(SOURCE.relative_to(ROOT)),
        'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'zip_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
        'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in PACKAGE.iterdir() if p.is_file()},
        'status': 'built_not_submitted',
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'output': str(OUT), 'zip_bytes': archive.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    build()
