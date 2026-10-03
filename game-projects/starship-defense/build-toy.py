"""Build a self-contained Toy package; never upload or update a published Toy."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/html/game/starship-defense'
OUT = ROOT / 'dist/toy/chongchao-qianshao'
PACKAGE = OUT / 'package'
GAME = json.loads((Path(__file__).parent / 'media-kit/game.json').read_text('utf-8'))
VERSION = GAME['current_version']


def build():
    # This is a generated package, never a source directory. Rebuild only inside our fixed output root.
    expected = ROOT / 'dist/toy/chongchao-qianshao/package'
    if PACKAGE.resolve() != expected.resolve() or not PACKAGE.resolve().is_relative_to(ROOT.resolve()):
        raise RuntimeError('Unexpected package output path')
    if PACKAGE.exists():
        shutil.rmtree(PACKAGE)
    PACKAGE.mkdir(parents=True, exist_ok=True)
    # All game modules are now bundled. Exclude unused legacy assets and any other in-progress files.
    runtime_files = [SOURCE / name for name in ('index.html', 'boot.js', 'game.compat.js', 'combat-controls.css', 'icon.svg', 'vendor/LICENSE.txt')]
    for source in runtime_files:
        dest = PACKAGE / source.relative_to(SOURCE)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
    text = (PACKAGE / 'index.html').read_text('utf-8')
    text = text.replace('../../../games.html', 'https://www.zhengxiaohui.cn/games.html')
    text = text.replace('<script src="../../../js/game/thumb-preview.js"></script>', '')
    (PACKAGE / 'index.html').write_text(text, 'utf-8')
    bundled = (PACKAGE / 'game.compat.js').read_text('utf-8')
    if '"sst_save_"' not in bundled:
        raise RuntimeError('Rebuild game.compat.js before packaging: save namespace not found')
    (PACKAGE / 'game.compat.js').write_text(bundled.replace('"sst_save_"', '"toy-chongchao-v1-sst_save_"'), 'utf-8')
    archive = OUT / 'chongchao-qianshao.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for source in runtime_files:
            rel = source.relative_to(SOURCE)
            z.write(PACKAGE / rel, str(rel).replace('\\', '/'))
    manifest = {
        'title': GAME['name'], 'slug': 'chongchao-qianshao',
        'version': VERSION, 'source': str(SOURCE.relative_to(ROOT)),
        'zip_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
        'files': {str(p.relative_to(SOURCE)).replace('\\', '/'): hashlib.sha256((PACKAGE / p.relative_to(SOURCE)).read_bytes()).hexdigest() for p in runtime_files},
        'status': 'built_not_submitted', 'published_toy_unchanged': True,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps({'output': str(OUT), 'zip_bytes': archive.stat().st_size, 'status': 'built_not_submitted'}, ensure_ascii=False))


if __name__ == '__main__':
    build()
