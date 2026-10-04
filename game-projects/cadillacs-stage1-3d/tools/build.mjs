// 构建：把 src/ 的 ES 模块与固定版本 Three.js（站内 public/vendor/three/0.170.0）打成一个普通脚本，双击 index.html 也能运行
// 用法：node tools/build.mjs [--dev]
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.resolve(root, '../../public');
const out = path.join(pub, 'html/game/cadillacs-stage1-3d/js/game.min.js');
const three = path.join(pub, 'vendor/three/0.170.0/build/three.module.js');
const dev = process.argv.includes('--dev');
await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, format: 'iife', target: 'es2020', outfile: out,
  minify: !dev, sourcemap: false, legalComments: 'eof', charset: 'utf8',
  alias: { three },
  logLevel: 'info'
});
fs.writeFileSync(path.join(path.dirname(out), 'THREE-LICENSE.txt'), 'three.js r170 — MIT License\nCopyright © 2010-2024 three.js authors\nhttps://github.com/mrdoob/three.js/blob/r170/LICENSE\n');
console.log('built', out, fs.statSync(out).size, 'bytes');
