// Build the existing stable game for TapTap H5; this command never uploads it.
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const source = path.join(root, 'public/html/game/starship-defense');
const output = path.join(root, 'dist/taptap/chongchao-qianshao');
const packageDir = path.join(output, 'chongchao-qianshao');
const game = JSON.parse(fs.readFileSync(path.join(here, 'media-kit/game.json'), 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');

if (!output.startsWith(root + path.sep) || path.dirname(packageDir) !== output) {
  throw new Error('Unexpected TapTap output directory');
}
fs.mkdirSync(output, {recursive: true});
if (fs.existsSync(packageDir)) fs.rmSync(packageDir, {recursive: true});
fs.mkdirSync(packageDir);

const entries = ['boot.js', 'combat-controls.css', 'icon.svg', 'vendor/LICENSE.txt'];
for (const name of entries) {
  const destination = path.join(packageDir, name);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(path.join(source, name), destination);
}
fs.copyFileSync(path.join(root, 'public/css/base.css'), path.join(packageDir, 'base.css'));

let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
html = html.replaceAll('../../../css/base.css', './base.css');
html = html.replace(/<script src="\.\.\/\.\.\/\.\.\/js\/game\/thumb-preview\.js"><\/script>/g, '');
html = html.replace(/<script type="module">[\s\S]*?landscape-typing\.js[\s\S]*?<\/script>/g, '');
html = html.replace(/<a class="gameBack"[^>]*>[\s\S]*?<\/a>/g, '');
html = html.replace(/<div id="toyExtras">[\s\S]*?<\/section>/, '</section>');
if (/\.\.\/\.\.\/|B站 Toy|bilibili\.com/.test(html)) {
  throw new Error('TapTap HTML still contains a site-relative or Toy-only dependency');
}
fs.writeFileSync(path.join(packageDir, 'index.html'), html, 'utf8');

await build({
  entryPoints: [path.join(source, 'game.js')],
  outfile: path.join(packageDir, 'game.compat.js'),
  bundle: true, format: 'iife', target: ['chrome58'], minify: true,
  legalComments: 'eof', logLevel: 'warning',
  plugins: [{name: 'taptap-channel', setup(b) {
    b.onResolve({filter: /\?v=/}, args => ({path: path.resolve(args.resolveDir, args.path.split('?')[0])}));
    // Toy account, rankings and external video navigation are unavailable on TapTap.
    // Site-account cloud saves and local file backups remain available on TapTap.
    b.onLoad({filter: /[\\/]toy-platform\.js$/}, () => ({contents: "import {mountSavePanel} from './save-panel.js'; export function setupToyPlatform(game){return mountSavePanel(game,{storage:game.store.storage});}", loader: 'js', resolveDir: source}));
    b.onLoad({filter: /[\\/]live-controller\.js$/}, () => ({contents: 'export function createLiveController() { throw new Error("Live mode is unavailable in the TapTap trial"); }', loader: 'js'}));
    b.onLoad({filter: /[\\/]starship-defense[\\/]game\.js$/}, args => {
      const original = fs.readFileSync(args.path, 'utf8');
      const expected = ["const SAVE_PREFIX='sst_save_';", "const SAVE_PREFIX=LIVE_MODE?'sst_live_save_':'sst_save_';"].find(value => original.includes(value));
      if (!expected) throw new Error('Save namespace changed; review the channel adapter');
      const contents = original.replace(expected, "const SAVE_PREFIX='taptap-chongchao-v1-sst_save_';")
        .replace("const LIVE_MODE=new URLSearchParams(location.search).get('live')==='1';", 'const LIVE_MODE=false;');
      return {contents, loader: 'js', resolveDir: source};
    });
  }}],
});

const zipPath = path.join(output, 'chongchao-qianshao.zip');
const zip = spawnSync(process.env.PYTHON || 'python', ['-c',
  'import pathlib,sys,zipfile; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6); [(z.writestr(zipfile.ZipInfo(f.relative_to(p.parent).as_posix(),(2026,1,1,0,0,0)),f.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)) for f in sorted(p.rglob("*")) if f.is_file()]; z.close()',
  packageDir, zipPath], {encoding: 'utf8', env: {...process.env, PYTHONUTF8: '1'}});
if (zip.status !== 0) throw new Error(zip.stderr || zip.error?.message || 'ZIP build failed');
const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).stdout.trim();
const files = Object.fromEntries([...entries, 'index.html', 'base.css', 'game.compat.js'].sort().map(name =>
  [name, hash(fs.readFileSync(path.join(packageDir, name)))]));
const manifest = {
  schema_version: 1, channel: 'taptap-h5', title: game.name,
  version: game.current_version, source_commit: sourceCommit,
  package_directory: path.relative(root, packageDir).replaceAll('\\', '/'),
  archive: path.relative(root, zipPath).replaceAll('\\', '/'),
  archive_root: 'chongchao-qianshao/', zip_bytes: fs.statSync(zipPath).size,
  zip_sha256: hash(fs.readFileSync(zipPath)), files,
  changes: ['Self-contained H5 package with one top-level directory', 'Local save namespace isolated from website and Toy', 'Website-account cloud backups and local import/export enabled; Toy rankings and video navigation omitted'],
  monetization: 'none', status: 'built_not_uploaded',
};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(manifest, null, 2));
