// 从网站运行文件生成 Toy 独立包（不分叉玩法、不上传）：去掉指向本站的「返回游戏列表」与站点图标
// 用法：node game-projects/cadillacs-stage1-3d/tools/build-toy.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(project, '../..');
const source = join(root, 'public/html/game/cadillacs-stage1-3d');
const meta = JSON.parse(readFileSync(join(project, 'media-kit/game.json'), 'utf8'));
const version = meta.current_version;
const out = join(project, 'dist', 'toy-' + version, 'package');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const rel = (base, p) => relative(base, p).replaceAll('\\', '/');
const expected = ['sounds/cd-hit.wav', 'sounds/cd-dash.wav', 'sounds/cd-dashhit.wav', 'sounds/cd-shout-mustapha.wav', 'sounds/cd-bodyfall.wav', 'sounds/cd-go.wav', 'sounds/cd-finisher-jack.wav', 'sounds/cd-finisher-hannah.wav', 'sounds/cd-finisher-mustapha.wav', 'sounds/cd-finisher-mess.wav', 'sounds/cd-mega-jack.wav', 'sounds/cd-mega-hannah.wav', 'sounds/cd-mega-mustapha.wav', 'sounds/cd-mega-mess.wav', 'sounds/boss.mp3', 'sounds/boss2.mp3', 'sounds/forest.mp3', 'sounds/hall.mp3', 'sounds/roof.mp3', 'sounds/select.mp3', 'sounds/street.mp3', 'sounds/swamp.mp3', 'css/style.css', 'index.html', 'js/THREE-LICENSE.txt', 'js/game.min.js'].sort();
const found = walk(source).map(p => rel(source, p)).sort();
if (JSON.stringify(found) !== JSON.stringify(expected)) throw Error('Unexpected runtime files: ' + found.join(', '));

for (const name of expected.filter(n => n !== 'index.html')) {
  mkdirSync(dirname(join(out, name)), { recursive: true });
  cpSync(join(source, name), join(out, name));
}
let html = readFileSync(join(source, 'index.html'), 'utf8');
const before = html;
html = html
  .replace(/\s*<link rel="icon" href="\.\.\/\.\.\/\.\.\/favicon\.svg"[^>]*>/, '')
  .replace('data-list-url="../../../games.html"', 'data-list-url="index.html"')
  .replace(/\s*<a data-act="list" class="list-link" href="\.\.\/\.\.\/\.\.\/games\.html">返回游戏列表<\/a>/g, '')
  .replace(`<br><a href="../../../games.html" style="color:#fff">返回游戏列表</a>`, '');
if (html === before || /\.\.\/\.\.\/\.\.\//.test(html)) throw Error('Site-only links left in Toy index.html');
writeFileSync(join(out, 'index.html'), html, 'utf8');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest = {
  version,
  source: 'public/html/game/cadillacs-stage1-3d',
  source_sha256: Object.fromEntries(expected.map(n => [n, sha(join(source, n))])),
  files: Object.fromEntries(expected.map(n => [n, sha(join(out, n))])),
  status: 'built_not_submitted'
};
const manifestPath = join(project, 'media-kit/releases', 'toy-' + version, 'toy-build.json');
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ package: out, files: expected.length, manifest: manifestPath }));
