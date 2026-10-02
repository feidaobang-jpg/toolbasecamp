"""Create browser GLBs from the retained Breachline assets, preserving rigs/clips.

Embedded textures are resized and encoded as JPEG; meshes and skin weights stay
unchanged. Source licenses and hashes are recorded with the output assets.
"""
from pathlib import Path
from io import BytesIO
import argparse
import hashlib
import json
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'public/html/game/starship-defense/assets'


def optimize_glb(source, target):
    data = source.read_bytes()
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    document = json.loads(data[20:20 + length])
    offset = 20 + length
    binary_length, kind = struct.unpack_from('<II', data, offset)
    assert kind == 0x004E4942
    original = data[offset + 8:offset + 8 + binary_length]
    # Rebuild all buffer views so discarded original PNG bytes are not shipped.
    image_views = {image['bufferView'] for image in document.get('images', [])}
    binary = bytearray()
    for index, view in enumerate(document['bufferViews']):
        start = view.get('byteOffset', 0)
        block = original[start:start + view['byteLength']]
        if index in image_views:
            image = Image.open(BytesIO(block)).convert('RGB')
            image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            buffer = BytesIO()
            image.save(buffer, format='JPEG', quality=87, optimize=True)
            block = buffer.getvalue()
        binary.extend(b'\0' * (-len(binary) % 4))
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(block)
        binary.extend(block)
    for image in document.get('images', []):
        image['mimeType'] = 'image/jpeg'
    document['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(document, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    target.write_bytes(struct.pack('<III', 0x46546C67, 2, total) +
                       struct.pack('<II', len(encoded), 0x4E4F534A) + encoded +
                       struct.pack('<II', len(binary), 0x004E4942) + binary)
    return {'source_sha256': hashlib.sha256(data).hexdigest(),
            'output_sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'source_bytes': len(data), 'output_bytes': total,
            'animations': [clip['name'] for clip in document.get('animations', [])]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--worlds', type=Path, default=Path('D:/project/gpt/worlds/breachline'))
    args = parser.parse_args()
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((args.worlds / 'source/external-assets/manifest.json').read_text('utf-8'))
    chosen = [('roach', 'roach/roach.glb'), ('scifi_soldier_oga', 'scifi_soldier_oga/soldier.glb'),
              ('elite_roach', 'elite_roach/elite.glb'), ('queen_roach', 'queen_roach/queen.glb'),
              ('mech_skorpio', 'mech_skorpio/mech.glb')]
    records = []
    for asset_id, path in chosen:
        record = next(item for item in manifest if item.get('id') == asset_id).copy()
        record.pop('files', None)
        record.update(optimize_glb(args.worlds / 'game/assets/external' / path,
                                  DEST / Path(path).name))
        record['runtime_file'] = Path(path).name
        record['source_file'] = str(args.worlds / 'game/assets/external' / path)
        record['processing'] = 'Embedded textures resized to <=1024, JPEG quality 87; original geometry, skinning and clips retained.'
        records.append(record)
    rock = args.worlds / 'game/assets/external/coast_rocks_02/coast_rocks_02_coast_rocks_02_diff_2k.jpg'
    image = Image.open(rock).convert('RGB')
    image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    image.save(DEST / 'rock-diffuse.jpg', quality=86, optimize=True)
    rock_record = next(item for item in manifest if item.get('id') == 'coast_rocks_02').copy()
    rock_record.pop('files', None)
    rock_record.update({'runtime_file': 'rock-diffuse.jpg', 'processing': 'Diffuse texture resized to 1024; applied to original procedural terrain/rocks.'})
    records.append(rock_record)
    (DEST / 'sources.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), 'utf-8')
    notices = ['Breachline → 虫潮前哨 browser asset adaptations',
               'Roach: Atmostatic (model), Danimal (rigging, animation, retexturing).',
               'https://opengameart.org/content/roach-game-ready-and-animated',
               'CC-BY-SA-3.0: https://creativecommons.org/licenses/by-sa/3.0/',
               'Adapted by Breachline: subdivision, PBR material and named/baked clips.',
               'Browser adaptation: texture resizing/JPEG compression. roach.glb remains CC-BY-SA-3.0.',
               'Sci-fi soldier: Irondust. https://opengameart.org/content/sci-fi-soldier',
               'CC0: https://creativecommons.org/publicdomain/zero/1.0/',
               'Breachline adaptation: skinning cleanup, military material and authored clips; CC0.',
               'Coast rocks diffuse: Rob Tuytel / Rico Cilliers, Poly Haven.',
               'https://polyhaven.com/a/coast_rocks_02 — CC0.',
               'Three.js r152.2 and addons: Three.js authors, MIT (vendor/LICENSE.txt).']
    (DEST / 'CREDITS.txt').write_text('\n'.join(notices) + '\n', 'utf-8')
    for asset_id, _ in chosen:
        notice = args.worlds / 'source/external-assets' / asset_id / 'LICENSE.txt'
        if notice.exists():
            (DEST / (asset_id + '-LICENSE.txt')).write_text(notice.read_text('utf-8'), 'utf-8')
    print(json.dumps(records, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
