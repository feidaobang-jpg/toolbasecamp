// 校验新游戏页面用到的 i18n 键在中英文包都已登记，且文件为无 BOM 合法 UTF-8。
const fs = require('fs');
const vm = require('vm');
const dir = 'D:/project/toolbasecamp/public';
const files = {
  zh: dir + '/js/locales/zh-CN.js',
  en: dir + '/js/locales/en.js',
  html: dir + '/html/game/mario-1-1-3d/index.html',
  main: dir + '/html/game/mario-1-1-3d/main.js',
};

function loadPack(p) {
  const ctx = { window: { TB_LOCALES: {} }, document: undefined, navigator: { language: 'zh-CN' }, localStorage: { getItem: () => null } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx);
  return ctx.window.TB_LOCALES || {};
}

let fail = 0;
for (const [name, p] of Object.entries(files)) {
  const b = fs.readFileSync(p);
  const s = b.toString('utf8');
  if (b[0] === 0xEF) { console.log('FAIL BOM', name); fail++; }
  if (s.includes('\uFFFD')) { console.log('FAIL replacement char', name); fail++; }
}

const packs = { zh: loadPack(files.zh)['zh-CN'], en: loadPack(files.en)['en'] };
const used = new Set();
for (const src of [fs.readFileSync(files.html, 'utf8'), fs.readFileSync(files.main, 'utf8')]) {
  for (const m of src.matchAll(/mario113d\.([A-Za-z0-9_]+)/g)) used.add(m[1]);
}
const pick = (obj, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
for (const k of [...used].sort()) {
  const path = 'tools.mario113d.' + k;
  const zhVal = pick(packs.zh, path) ?? packs.zh?.mario113d?.[k];
  const enVal = pick(packs.en, path) ?? packs.en?.mario113d?.[k];
  if (zhVal == null || enVal == null) { console.log('MISSING', k, 'zh=', zhVal == null ? '-' : 'ok', 'en=', enVal == null ? '-' : 'ok'); fail++; }
}
console.log('checked keys:', used.size, '| failures:', fail);
process.exit(fail ? 1 : 0);
