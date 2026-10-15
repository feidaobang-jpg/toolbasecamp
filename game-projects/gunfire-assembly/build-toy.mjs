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
const UPDATE_SRC = fs.readFileSync(path.join(SOURCE, 'update-history.js'), 'utf-8');

const BASE_FILES = ['index.html', 'boot.js', 'game.compat.js', 'combat-controls.css', 'author-home.js', 'base.css', 'icon.svg', 'vendor/LICENSE.txt'];
// 抗战战役「亮剑战役」重做版（第一章苍云岭、第三章平安县城）：同包内的独立页面（入口、样式、兼容包与按章节分组的原声语音）；
// pingan/index.html 只剩一个跳转页，照顾旧链接
const LIANGJIAN_FILES = ['liangjian/index.html', 'liangjian/style.css', 'liangjian/game.compat.js', 'pingan/index.html',
  ...fs.readdirSync(path.join(SOURCE, 'liangjian/assets/voice')).sort().filter(n => !/^l_|^lines\.json$/.test(n)).map(n => 'liangjian/assets/voice/' + n)];
// 本机合成的 124 句台词（l_*.mp3 与 lines.json）同样只放网站：2026-10-15 去掉配乐和更新记录里的曲目后 0.8.x 仍被
// “内容审核未通过”秒拒，这批合成语音是剩下的新增素材；Toy 包里缺这些文件时游戏只显示字幕
// 电视剧原版配乐（liangjian/assets/bgm）只放网站：2026-10-15 带配乐的 0.8.0 包被 Toy 以“内容审核未通过”退回，
// Toy 包不带配乐，游戏找不到配乐文件时自动退回原来的合成鼓点
const RUNTIME_FILES = [...BASE_FILES, ...LIANGJIAN_FILES];
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
  // 语音清单也去掉合成台词（l_*）：2026-10-15 只删文件、清单仍列着它们的包同样被退回，清单回到只有原声的包通过
  const voiceIndex = path.join(PACKAGE, 'liangjian/assets/voice/index.json');
  const voices = JSON.parse(fs.readFileSync(voiceIndex, 'utf-8'));
  for (const ch of Object.keys(voices)) voices[ch] = voices[ch].filter(id => !id.startsWith('l_'));
  fs.writeFileSync(voiceIndex, JSON.stringify(voices), 'utf-8');
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
  if (!bundled.includes('"gfs_save_"')) throw new Error('Rebuild game.compat.js before packaging: save namespace not found');
  // Toy 的云档与本地档都按作品隔离，键名换不换都不影响别的游戏；这里把 gfs_save_ 落回
  // 0.4.1 之前一直在用的 toy-gunfire-v1-sst_save_，是为了已发布的 Toy 玩家更新后本地进度、
  // 自动备份和「这一成绩已提交」状态一字不变。网站上两款分家靠的是源码里的 gfs_save_，不是这里。
  let packaged = bundled.replaceAll('"gfs_save_"', '"toy-gunfire-v1-sst_save_"');
  if (packaged === bundled) throw new Error('Save prefix rewrite did not apply');
  // Toy 包不带电视剧原版配乐，更新记录里点名原版配乐的那一行对 Toy 版不属实；2026-10-15 去掉配乐文件后 0.8.0
  // 仍被“内容审核未通过”退回，点名的电视剧曲目是剩下的疑点。Toy 包里删掉这一行，标题去掉“原版配乐”。
  const esc = s => s.replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
  const musicLine = UPDATE_SRC.match(/'(亮剑三章换上电视剧原版配乐[^']*)',\n/)[1];
  for (const [from, to] of [[`"${esc(musicLine)}",`, ''], [esc('亮剑原版配乐、台词配音'), esc('亮剑台词配音')]]) {
    if (!packaged.includes(from)) throw new Error('Toy update-notes rewrite did not apply: ' + from.slice(0, 40));
    packaged = packaged.replace(from, to);
  }
  fs.writeFileSync(compatPath, packaged, 'utf-8');
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
