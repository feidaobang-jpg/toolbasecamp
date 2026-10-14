#!/usr/bin/env node
// 虫潮围城 / 枪火集结 共用模块的规范源同步与漂移检查。
// 背景：两款是同一条引擎线，历史上把同一份模块复制两份各改各的，一边修好的瞄准辅助、
//       键位或存档底座不会自动到另一边，也没有任何东西提醒漂移（2026-10-14 清点时
//       24 个模块还逐字节一致，12 个已经按游戏分叉）。
// 用法：
//   node game-projects/site-games/shared/sync-shared.mjs                     // 漂移检查，有问题返回 1
//   node game-projects/site-games/shared/sync-shared.mjs --write             // 规范源 → 两款运行副本
//   node game-projects/site-games/shared/sync-shared.mjs --adopt gunfire-assembly key-bindings.js
//                                                                            // 把某款里就地改好的那份收进规范源，再同步两款
// 规范源：本目录下的同名文件；两款运行副本在 public/html/game/<游戏>/。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const GAME_ROOT = path.join(ROOT, 'public/html/game');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(HERE, 'shared-modules.json'), 'utf8'));
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ADOPT = args.includes('--adopt');

const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
const copy = (from, to) => { fs.copyFileSync(from, to); };

function targetsOf(file) {
  return MANIFEST.games.map(g => path.join(GAME_ROOT, g, file));
}

if (ADOPT) {
  const game = args[args.indexOf('--adopt') + 1];
  const files = args.slice(args.indexOf('--adopt') + 2).filter(a => a.endsWith('.js'));
  if (!MANIFEST.games.includes(game) || !files.length) {
    console.error('用法：--adopt <starship-defense|gunfire-assembly> <模块.js> …');
    process.exit(2);
  }
  for (const file of files) {
    const src = path.join(GAME_ROOT, game, file);
    if (!fs.existsSync(src)) { console.error('找不到 ' + src); process.exit(2); }
    copy(src, path.join(HERE, file));
    console.log('已收进规范源：' + file + '  ← ' + game);
  }
}

// 第一次建立规范源：以第一款游戏的副本为准，把清单里的共用模块收进本目录。
if (args.includes('--bootstrap')) {
  for (const file of MANIFEST.shared) copy(path.join(GAME_ROOT, MANIFEST.games[0], file), path.join(HERE, file));
  console.log('规范源已建立：' + MANIFEST.shared.length + ' 个模块取自 ' + MANIFEST.games[0]);
  process.exit(0);
}

if (MANIFEST.shared.some(f => !fs.existsSync(path.join(HERE, f)))) {
  console.error('规范源缺文件，先跑：node game-projects/site-games/shared/sync-shared.mjs --bootstrap');
  process.exit(1);
}

if (WRITE) {
  for (const file of MANIFEST.shared) {
    const from = path.join(HERE, file);
    for (const to of targetsOf(file)) {
      if (sha(from) !== sha(to)) { copy(from, to); console.log('同步 ' + file + ' → ' + path.relative(ROOT, to)); }
    }
  }
  console.log('共 ' + MANIFEST.shared.length + ' 个共用模块已按规范源对齐');
  process.exit(0);
}

/* ---------------- 漂移检查 ---------------- */
let bad = 0;
const lines = [];
for (const file of MANIFEST.shared) {
  const canon = path.join(HERE, file);
  const sums = targetsOf(file).map(t => (fs.existsSync(t) ? sha(t) : null));
  const c = sha(canon);
  const off = [];
  sums.forEach((s, i) => { if (s === null) off.push(MANIFEST.games[i] + ' 缺文件'); else if (s !== c) off.push(MANIFEST.games[i] + ' 与规范源不一致'); });
  if (off.length) { bad++; lines.push('DRIFT  ' + file + '：' + off.join('，') + '（跑 --write 对齐，或 --adopt <游戏> ' + file + ' 收改动）'); }
}

// 两款目录里新出现的顶层模块必须先在清单里归类，否则会被当成没人管的第四份拷贝。
const known = new Set([...MANIFEST.shared, ...Object.keys(MANIFEST.perGame), ...Object.keys(MANIFEST.chongchaoOnly), ...Object.keys(MANIFEST.gunfireOnly)]);
for (const g of MANIFEST.games) {
  for (const f of fs.readdirSync(path.join(GAME_ROOT, g)).filter(f => f.endsWith('.js'))) {
    if (!known.has(f)) { bad++; lines.push('UNCLASSIFIED  ' + g + '/' + f + '：没写进 shared-modules.json，先判断是共用（进 shared 并 --adopt）还是各游戏独有（进 perGame/only 并写原因）'); }
  }
}

console.log(lines.length ? lines.join('\n') : 'OK：' + MANIFEST.shared.length + ' 个共用模块与规范源逐字节一致，两款目录没有未归类模块');
process.exit(bad ? 1 : 0);
