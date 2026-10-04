// 生成 B 站 Toy 独立包（只打包，不发布）：node game-projects/tank-3d/build-toy.mjs
// 网站版引用的 ../../../vendor 等路径改成包内相对路径；Toy 里没有本站游戏列表和 2D 联机版，去掉这两类外链。
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = join(root, 'public/html/game/tank-3d');
const meta = JSON.parse(readFileSync(join(root, 'game-projects/tank-3d/media-kit/game.json'), 'utf8'));
const version = meta.current_version;
const out = join(root, 'game-projects/tank-3d/dist', version, 'package');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const writes = new Set();
function write(name, text) { const p = join(out, name); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text, 'utf8'); writes.add(name); }
function copy(from, name) { const p = join(out, name); mkdirSync(dirname(p), { recursive: true }); cpSync(from, p); writes.add(name); }
for (const name of readdirSync(source)) {
  const full = join(source, name);
  if (statSync(full).isDirectory()) {
    if (name !== 'sounds') throw Error('Unexpected runtime folder: ' + name);
    for (const f of readdirSync(full)) { if (!f.endsWith('.mp3')) throw Error('Unexpected sound: ' + f); copy(join(full, f), 'sounds/' + f); }
    continue;
  }
  if (!/\.(js|html|css)$/.test(name)) throw Error('Unexpected runtime asset: ' + name);
  let text = readFileSync(full, 'utf8')
    .replaceAll('../../../vendor/three/0.170.0/build/three.module.js', './vendor/three.module.js')
    .replaceAll('../../../favicon.svg', './favicon.svg');
  if (name === 'index.html') {
    text = text.replace(/\s*<a data-act="coop"[^>]*>[\s\S]*?<\/a>/g, '').replace(/\s*<a data-act="list"[^>]*>[\s\S]*?<\/a>/g, '')
      .replaceAll('data-list-url="../../../games.html"', 'data-list-url="./index.html"').replace(' data-coop-url="../tank_battle.html"', '')
      .replaceAll('href="../../../games.html"', 'href="./index.html"').replaceAll('返回游戏列表</a>', '重新载入</a>');
  }
  if (name === 'main.js') text = text.replace("app.getAttribute('data-list-url') || '../../../games.html'", "app.getAttribute('data-list-url') || './index.html'");
  if (/\.\.\/\.\.\//.test(text)) throw Error('Package file still points outside the package: ' + name);
  write(name, text);
}
copy(join(root, 'public/vendor/three/0.170.0/build/three.module.js'), 'vendor/three.module.js');
copy(join(root, 'public/favicon.svg'), 'favicon.svg');
// 打包目录里不允许混进别的生成残留
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]); }
for (const p of walk(out)) if (!writes.has(relative(out, p).replaceAll('\\', '/'))) throw Error('Unexpected package file: ' + p);
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const files = Object.fromEntries([...writes].sort().map(n => [n, sha(join(out, n))]));
const packageHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
const manifest = { version, toyId: meta.toy && meta.toy.id, slug: meta.toy && meta.toy.slug, source: 'public/html/game/tank-3d', package: relative(root, out).replaceAll('\\', '/'), files, packageHash, status: 'built_not_submitted' };
const manifestPath = join(root, 'game-projects/tank-3d/media-kit/releases', version, 'toy-build.json');
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ package: out, files: writes.size, packageHash, manifest: manifestPath }));
