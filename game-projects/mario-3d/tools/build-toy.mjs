// 从网站运行文件生成 Toy 独立包（不分叉玩法、不上传）：three.js 随包，去掉指向本站的「返回游戏列表」与站点图标
// 用法：node game-projects/mario-3d/tools/build-toy.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(project, '../..');
const source = join(root, 'public/html/game/mario-3d');
const meta = JSON.parse(readFileSync(join(project, 'media-kit/game.json'), 'utf8'));
const version = process.env.TOY_VERSION || meta.current_version;   // 审核候选版先打包自检时可指定版本号
const out = join(project, 'dist', 'toy-' + version, 'package');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'vendor'), { recursive: true });

const runtime = ['audio.js', 'index.html', 'levels.js', 'main.js', 'models.js', 'scene.js', 'style.css', 'textures.js', 'three.js', 'world.js'];
const ignored = ['file-warning.css','sounds'];   // 旧版遗留，新页面不引用
const found = readdirSync(source).sort();
const unexpected = found.filter(n => !runtime.includes(n) && !ignored.includes(n));
if (unexpected.length || runtime.some(n => !found.includes(n))) throw Error('Unexpected runtime files: ' + found.join(', '));

for (const name of runtime.filter(n => n !== 'index.html' && n !== 'three.js' && n !== 'main.js')) cpSync(join(source, name), join(out, name));
cpSync(join(source,'sounds'),join(out,'sounds'),{recursive:true});
cpSync(join(root,'public/js/game/sample-audio.js'),join(out,'sample-audio.js'));
const audioSource=readFileSync(join(out,'audio.js'),'utf8').replaceAll('../../../js/game/sample-audio.js','./sample-audio.js');
writeFileSync(join(out,'audio.js'),audioSource);
cpSync(join(root, 'public/js/game/drag-look.js'), join(out, 'drag-look.js'));
const mainSrc = readFileSync(join(source, 'main.js'), 'utf8');
// 2026-10-10 起游戏页已去掉「返回游戏列表」，main.js 里不再有列表地址回退；只需改 drag-look 的相对路径
const mainToy = mainSrc.replaceAll('../../../js/game/drag-look.js', './drag-look.js').replace("|| '../../../games.html'", "|| 'index.html'");
if (!mainToy.includes("'./drag-look.js")) throw Error('main.js drag-look import not rewritten');
writeFileSync(join(out, 'main.js'), mainToy, 'utf8');
cpSync(join(root, 'public/vendor/three/0.170.0/build/three.module.js'), join(out, 'vendor/three.module.js'));
cpSync(join(root, 'game-projects/starship-defense/THREE-LICENSE.txt'), join(out, 'vendor/THREE-LICENSE.txt'));
writeFileSync(join(out, 'three.js'), "// 固定版本 Three.js 0.170.0（随 Toy 包）\nexport * from './vendor/three.module.js';\n", 'utf8');

let html = readFileSync(join(source, 'index.html'), 'utf8');
const before = html;
html = html
  .replace(/\s*<link rel="icon" href="\.\.\/\.\.\/\.\.\/favicon\.svg"[^>]*>/, '')
  .replace('data-list-url="../../../games.html"', 'data-list-url="index.html"')
  .replace(/\s*<a data-act="list" class="list-link" href="\.\.\/\.\.\/\.\.\/games\.html">返回游戏列表<\/a>/g, '')
  .replace(`<br><a href="../../../games.html" style="color:#fff">返回游戏列表</a>`, '');
if (html === before) throw Error('Toy index.html rewrite did nothing');
writeFileSync(join(out, 'index.html'), html, 'utf8');

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const files = walk(out).map(p => relative(out, p).replaceAll('\\', '/')).sort();
for (const f of files.filter(f => /\.(html|js|css)$/.test(f) && !f.startsWith('vendor/'))) {
  const text = readFileSync(join(out, f), 'utf8');
  if (/\.\.\/\.\.\/|games\.html|favicon\.svg/.test(text)) throw Error('Site-only path left in ' + f);
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const all = createHash('sha256');
for (const f of files) { all.update(f); all.update(readFileSync(join(out, f))); }
const manifest = {
  version,
  source: 'public/html/game/mario-3d',
  source_sha256: Object.fromEntries(runtime.map(n => [n, sha(join(source, n))])),
  files: Object.fromEntries(files.map(n => [n, sha(join(out, n))])),
  package_sha256: all.digest('hex'),
  status: 'built_not_submitted'
};
const manifestPath = join(project, 'media-kit/releases', version, 'toy-build.json');
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ package: out, files: files.length, package_sha256: manifest.package_sha256, manifest: manifestPath }));
