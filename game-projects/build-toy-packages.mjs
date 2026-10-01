#!/usr/bin/env node
// 为模块化 3D 网页游戏生成 Toy 自包含发布包(仅用 Node 标准库)。
// 用法:node game-projects/build-toy-packages.mjs <slug> [<slug> ...]
// 产物:game-projects/<slug>/dist/toy/package/(dist/ 不入库)与 <slug>.zip;
// manifest 同时落一份到 media-kit/releases/toy-<ver>/build-manifest.json(入库,参照 starship-defense 惯例)。
// 包内不依赖站点 ../../js/:i18n 由游戏内嵌 GAME_I18N 字典 + toy-adapter.js 兜底;状态恒为 built_not_submitted,不自动投稿。
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_DEMO_LOCALES = ['game-demo-zh-CN.js', 'game-demo-en.js'];

const TOY_ADAPTER = `/* Toy 适配层:i18n 兜底、隐藏站内返回入口;玩法代码与网站版一致。 */
(function () {
  var lang = (navigator.language || 'zh-CN').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
  window.TB_TOY_LANG = lang;
  function resolve(table, path) {
    var cur = table, ps = path.split('.');
    for (var i = 0; i < ps.length; i++) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[ps[i]];
    }
    return typeof cur === 'string' ? cur : null;
  }
  window.t = function (key, params) {
    var dict = window.GAME_I18N || { zh: {}, en: {} };
    var table = dict[lang] || {};
    var parts = key.split('.');
    // 三级解析:完整键 → 命名空间嵌套(pvz3d.title → zh.pvz3d.title) → 裸键(title)
    var text = resolve(table, key);
    if (text == null && parts.length > 1 && table[parts[0]] && typeof table[parts[0]] === 'object') {
      text = resolve(table[parts[0]], parts.slice(1).join('.'));
    }
    if (text == null) {
      var shortKey = parts.slice(1).join('.');
      if (shortKey) text = resolve(table, shortKey);
    }
    if (text == null) text = key;
    if (params) Object.keys(params).forEach(function (k) {
      text = String(text).replace('{' + k + '}', params[k]);
    });
    return text;
  };
  function apply() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = window.t(el.getAttribute('data-i18n'));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
  window.addEventListener('tb:locale', apply);
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('a[href$="games.html"], a[href="./index.html"]').forEach(function (a) { a.hidden = true; });
    var warn = document.getElementById('file-warning');
    if (warn) warn.hidden = true;
  });
})();
`;

const sha256 = p => createHash('sha256').update(readFileSync(p)).digest('hex');

// --- 最小 ZIP 写入器(deflate + crc32),避免依赖外部 tar/zip ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function writeZip(packageDir, archivePath) {
  const entries = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else entries.push({ name: relative(packageDir, p).split('\\').join('/'), data: readFileSync(p) });
    }
  })(packageDir);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const chunks = [], central = [];
  let offset = 0;
  const dosTime = 0, dosDate = (27 << 5) | 1; // 2026-01-01,时间不影响交付
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10); cd.writeUInt16LE(dosTime, 12); cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));
    offset += 30 + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  writeFileSync(archivePath, Buffer.concat([...chunks, centralBuf, end]));
}

function build(slug) {
  const source = join(ROOT, 'public/html/game', slug);
  if (!statSync(source, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`missing source dir: ${source}`);
  const out = join(ROOT, 'game-projects', slug, 'dist', 'toy');
  const package_ = join(out, 'package');
  rmSync(package_, { recursive: true, force: true });
  mkdirSync(package_, { recursive: true });

  // 游戏本体文件原样进入包根目录
  for (const name of readdirSync(source)) {
    const p = join(source, name);
    if (statSync(p).isFile()) cpSync(p, join(package_, name));
  }

  // Three.js 同源依赖 + base.css + favicon
  mkdirSync(join(package_, 'vendor'));
  cpSync(join(ROOT, 'public/vendor/three/0.170.0/build/three.module.js'), join(package_, 'vendor/three.module.js'));
  cpSync(join(ROOT, 'public/css/base.css'), join(package_, 'base.css'));
  const favicon = join(ROOT, 'public/favicon.svg');
  if (existsSync(favicon)) cpSync(favicon, join(package_, 'favicon.svg'));

  let html = readFileSync(join(package_, 'index.html'), 'utf8');
  const rewrites = [
    ['../../../vendor/three/0.170.0/build/three.module.js', './vendor/three.module.js'],
    ['../../../css/base.css', './base.css'],
    ['../../../favicon.svg', './favicon.svg'],
  ];
  for (const [oldStr, newStr] of rewrites) html = html.split(oldStr).join(newStr);

  // 站点 i18n 三件套改为 toy-adapter(GAME_I18N 兜底);游戏中心返回链接本地化 + 由 adapter 隐藏
  html = html.replace(/<script src="\.\.\/\.\.\/\.\.\/js\/locales\/(?:en|zh-CN)\.js[^"]*"><\/script>\s*/g, '');
  html = html.replace(/<script src="\.\.\/\.\.\/\.\.\/js\/i18n\.js[^"]*"><\/script>/, '<script src="./toy-adapter.js"></script>');
  html = html.split('../../../games.html').join('./index.html');

  // demo-controls 及其 locale(若被游戏 JS 引用);JS 内的 three 相对导入统一本地化
  let needsDemo = false;
  for (const name of readdirSync(package_)) {
    if (!name.endsWith('.js') || name === 'toy-adapter.js') continue;
    const p = join(package_, name);
    let text = readFileSync(p, 'utf8');
    const before = text;
    text = text.split('../../../vendor/three/0.170.0/build/three.module.js').join('./vendor/three.module.js');
    if (text.includes('../../../js/game/demo-controls.js')) {
      needsDemo = true;
      text = text.replace(/'(\.\.\/)+js\/game\/demo-controls\.js(\?v=[^']*)?'/, "'./demo-controls.js'");
      text = text.replace(/'(\.\.\/)+js\/locales\/(game-demo-zh-CN|game-demo-en)\.js(\?v=[^']*)?'/g, "'./$2.js'");
    }
    if (text !== before) writeFileSync(p, text, 'utf8');
  }
  if (needsDemo) {
    cpSync(join(ROOT, 'public/js/game/demo-controls.js'), join(package_, 'demo-controls.js'));
    for (const name of GAME_DEMO_LOCALES) cpSync(join(ROOT, 'public/js/locales', name), join(package_, name));
    html = html.split('../../../js/game/demo-controls.js').join('./demo-controls.js');
  }

  // 残留站点相对引用 = 打包不完整,直接失败(游戏中心返回链接由 toy-adapter 隐藏,允许保留)
  const leftovers = [];
  for (const m of html.matchAll(/\.\.\/\.\.\/\.\.\/[\w./?-]+/g)) {
    if (m[0].endsWith('games.html')) continue;
    leftovers.push('index.html: ' + m[0]);
  }
  for (const name of readdirSync(package_)) {
    if (!name.endsWith('.js')) continue;
    const text = readFileSync(join(package_, name), 'utf8');
    for (const m of text.matchAll(/'\.\.\/\.\.\/\.\.\/[^']+'/g)) leftovers.push(`${name}: ${m[0]}`);
  }
  if (leftovers.length) throw new Error(`${slug}: unresolved site references:\n` + [...new Set(leftovers)].join('\n'));

  writeFileSync(join(package_, 'toy-adapter.js'), TOY_ADAPTER, 'utf8');
  writeFileSync(join(package_, 'index.html'), html, 'utf8');

  const archive = join(out, `${slug}.zip`);
  rmSync(archive, { force: true });
  writeZip(package_, archive);

  const gameJsonPath = join(ROOT, 'game-projects', slug, 'media-kit', 'game.json');
  const meta = existsSync(gameJsonPath) ? JSON.parse(readFileSync(gameJsonPath, 'utf8')) : {};
  const manifest = {
    title: meta.name?.zh || slug,
    slug,
    version: `toy-${meta.version || '0.1.0'}`,
    source: relative(ROOT, source).split('\\').join('/'),
    source_sha256: Object.fromEntries(readdirSync(source).filter(n => statSync(join(source, n)).isFile()).map(n => [n, sha256(join(source, n))])),
    zip_sha256: sha256(archive),
    zip_bytes: statSync(archive).size,
    files: {},
    status: 'built_not_submitted',
  };
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else manifest.files[relative(package_, p).split('\\').join('/')] = sha256(p);
    }
  })(package_);
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  writeFileSync(join(out, 'manifest.json'), manifestText, 'utf8');
  const releases = join(ROOT, 'game-projects', slug, 'media-kit', 'releases', `toy-${meta.version || '0.1.0'}`);
  mkdirSync(releases, { recursive: true });
  writeFileSync(join(releases, 'build-manifest.json'), manifestText, 'utf8');
  console.log(JSON.stringify({ slug, zip_bytes: statSync(archive).size, out: relative(ROOT, out) }));
}

for (const slug of process.argv.slice(2)) build(slug);
