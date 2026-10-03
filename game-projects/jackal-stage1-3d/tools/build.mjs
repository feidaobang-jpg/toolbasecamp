// 构建：把 src/ 的 ES 模块与固定版本 Three.js r152 打成一个普通脚本（双击 index.html 也能运行）
// 用法：node tools/build.mjs [--dev]
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, '../../public/html/game/jackal-stage1-3d/js/game.min.js');
const dev = process.argv.includes('--dev');
await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, format: 'iife', target: 'es2020', outfile: out,
  minify: !dev, sourcemap: false, legalComments: 'eof',
  alias: { three: path.join(root, 'vendor/three.module.js') },
  logLevel: 'info'
});
fs.copyFileSync(path.join(root, 'vendor/LICENSE.txt'), path.join(path.dirname(out), 'THREE-LICENSE.txt'));
console.log('built', out, fs.statSync(out).size, 'bytes');
