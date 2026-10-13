// Build a self-contained Toy package for 《枪火集结》. Never upload here.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SOURCE = path.join(ROOT, 'public/html/game/gunfire-assembly');
const OUT = path.join(ROOT, 'dist/toy/feidao-gunfire');
const PACKAGE = path.join(OUT, 'package');
const GAME = JSON.parse(fs.readFileSync(path.join(HERE, 'media-kit/game.json'), 'utf-8'));
const VERSION = GAME.current_version;
const SLUG = 'feidao-gunfire';

const BASE_FILES = ['index.html', 'boot.js', 'game.compat.js', 'combat-controls.css', 'author-home.js', 'base.css', 'icon.svg', 'vendor/LICENSE.txt'];
// 抗战战役第三章「平安县城」重做版：同包内的独立页面（入口、样式、兼容包与喊话语音）
const PINGAN_FILES = ['pingan/index.html', 'pingan/style.css', 'pingan/game.compat.js',
  ...fs.readdirSync(path.join(SOURCE, 'pingan/assets/voice')).sort().map(n => 'pingan/assets/voice/' + n)];
const RUNTIME_FILES = [...BASE_FILES, ...PINGAN_FILES];
const sha256 = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function writeZip(archive, entries) {
  const CRC_TABLE = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunks = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf-8');
    const comp = zlib.deflateRawSync(data, {level: 6});
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, comp);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(comp.length, 20); dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, nameBuf]));
    offset += 30 + nameBuf.length + comp.length;
  }
  const dirBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(archive, Buffer.concat([...chunks, dirBuf, end]));
}

export function build() {
  const expected = path.join(ROOT, 'dist/toy/feidao-gunfire/package');
  if (path.resolve(PACKAGE) !== path.resolve(expected)) throw new Error('Unexpected package output path');
  fs.rmSync(PACKAGE, {recursive: true, force: true});
  fs.mkdirSync(PACKAGE, {recursive: true});
  for (const name of RUNTIME_FILES) {
    const dest = path.join(PACKAGE, name);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    const src = name === 'base.css' ? path.join(ROOT, 'public/css/base.css')
      : name === 'author-home.js' ? path.join(ROOT, 'public/js/game/author-home.js')
      : path.join(SOURCE, name);
    fs.copyFileSync(src, dest);
  }
  const indexPath = path.join(PACKAGE, 'index.html');
  let text = fs.readFileSync(indexPath, 'utf-8');
  text = text.replaceAll('../../../js/game/author-home.js', './author-home.js');
  text = text.replaceAll('../../../css/base.css', './base.css');
  text = text.replace(/<script[^>]*thumb-preview\.js[^>]*><\/script>/g, '');
  // Toy 包内没有虫潮目录，也不允许跳作者网站；去掉大厅里的虫潮入口。
  text = text.replace(/<a class="mbtn" href="\.\.\/starship-defense\/index\.html">[^<]*<\/a>/g, '');
  fs.writeFileSync(indexPath, text, 'utf-8');
  const compatPath = path.join(PACKAGE, 'game.compat.js');
  const bundled = fs.readFileSync(compatPath, 'utf-8');
  if (!bundled.includes('"sst_save_"')) throw new Error('Rebuild game.compat.js before packaging: save namespace not found');
  fs.writeFileSync(compatPath, bundled.replaceAll('"sst_save_"', '"toy-gunfire-v1-sst_save_"'), 'utf-8');
  const archive = path.join(OUT, 'feidao-gunfire.zip');
  if (fs.existsSync(archive)) fs.rmSync(archive);
  writeZip(archive, RUNTIME_FILES.map(name => [name, fs.readFileSync(path.join(PACKAGE, name))]));
  const manifest = {
    title: GAME.name, slug: SLUG,
    version: VERSION, source: path.relative(ROOT, SOURCE).split(path.sep).join('/'),
    zip_sha256: sha256(archive),
    files: Object.fromEntries(RUNTIME_FILES.map(name => [name, sha256(path.join(PACKAGE, name))])),
    status: 'built_not_submitted', published_toy_unchanged: true,
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  return {output: OUT, zip_bytes: fs.statSync(archive).size, zip_sha256: manifest.zip_sha256, status: 'built_not_submitted'};
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  console.log(JSON.stringify(build(), null, 2));
}
