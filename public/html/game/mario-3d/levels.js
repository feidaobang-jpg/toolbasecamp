// 关卡数据：按 FC《超级马力欧兄弟》1-1、1-2 的原作地图逐格录入。
// 坐标单位 = 1 格；第 c 列占 x∈[c,c+1]；h 为方块底边离地高度（地面顶 = 0），占 y∈[h,h+1]。
// 所有地形沿纵深（z）铺满整条跑道，水管为纵向并排 3 根，防止从旁边绕过。
// 来源：Ian Albert 原作地图截图逐格核对 + TheVGLC 文本地图 + MarioWiki 道具说明；
// 1-1 / 1-2 奖励房间与 1-2 出口地面区只有文字描述，布局为推测还原（见 media-kit/sources.json）。

export const LANE = 3;            // 跑道半宽：z ∈ [-3, 3]
export const SOLID = new Set(['G', 'B', 'Q', 'S', 'U', 'P', 'F', 'W']);

const key = (c, h) => c * 512 + (h + 64);
export { key as tileKey };

function area(id, opts) {
  return Object.assign({
    id, theme: 'overworld', width: 40, ceiling: false, tiles: new Map(), pipes: [], sidePipes: [],
    enemies: [], coins: [], lifts: [], piranhas: [], flag: null, castle: null, signs: [], start: null, killY: -4
  }, opts);
}
function set(a, c, h, t, extra) { a.tiles.set(key(c, h), Object.assign({ c, h, t }, extra || {})); }
function ground(a, from, to) { for (let c = from; c <= to; c++) { set(a, c, -1, 'G'); set(a, c, -2, 'G'); } }
function row(a, c0, c1, h, t, extra) { for (let c = c0; c <= c1; c++) set(a, c, h, t, extra); }
function column(a, c, h0, h1, t) { for (let h = h0; h <= h1; h++) set(a, c, h, t); }
function stairs(a, c0, heights) { heights.forEach((n, i) => column(a, c0 + i, 0, n - 1, 'S')); }
// 竖水管：x 为左列，h 为高度（顶面 = h）；同一根水管沿 z 并排 3 根
function pipe(a, x, h, opts) {
  for (let c = x; c <= x + 1; c++) for (let k = 0; k < h; k++) set(a, c, k, 'P');
  const p = Object.assign({ x, h, base: 0 }, opts || {});
  a.pipes.push(p);
  if (p.piranha) a.piranhas.push({ pipe: p });
  return p;
}
// 横向水管口（朝 -x 方向开口）：mouth 为管口所在列，y 为管底高度；身后接一根竖管通到顶
function sidePipe(a, mouth, y, upTo, opts) {
  for (let c = mouth; c <= mouth + 1; c++) for (let k = y; k < y + 2; k++) set(a, c, k, 'P');
  for (let c = mouth + 2; c <= mouth + 3; c++) for (let k = y; k <= upTo; k++) set(a, c, k, 'P');
  a.sidePipes.push(Object.assign({ x: mouth, y, upTo }, opts || {}));
}
const enemy = (a, type, x, y = 0, extra) => a.enemies.push(Object.assign({ type, x, y }, extra || {}));
const coins = (a, c0, c1, h) => { for (let c = c0; c <= c1; c++) a.coins.push({ x: c + 0.5, y: h + 0.5 }); };

// ---------------- 1-1 ----------------
function build11() {
  const m = area('main', { theme: 'overworld', width: 212 });
  ground(m, 0, 68); ground(m, 71, 85); ground(m, 89, 152); ground(m, 155, 211);
  set(m, 16, 3, 'Q', { content: 'coin' });
  set(m, 20, 3, 'B'); set(m, 21, 3, 'Q', { content: 'power' }); set(m, 22, 3, 'B');
  set(m, 23, 3, 'Q', { content: 'coin' }); set(m, 24, 3, 'B'); set(m, 22, 7, 'Q', { content: 'coin' });
  pipe(m, 28, 2); pipe(m, 38, 3); pipe(m, 46, 4);
  pipe(m, 57, 4, { enter: { area: 'bonus', mode: 'drop', x: 2.2 } });
  set(m, 64, 4, 'Q', { content: '1up', hidden: true });            // 隐藏 1UP（第 4 根水管与第一个坑之间）
  set(m, 77, 3, 'B'); set(m, 78, 3, 'Q', { content: 'power' }); set(m, 79, 3, 'B');
  row(m, 80, 87, 7, 'B');
  row(m, 91, 93, 7, 'B'); set(m, 94, 7, 'Q', { content: 'coin' });
  set(m, 94, 3, 'B', { content: 'coin10' });                         // 连续 10 枚金币砖
  set(m, 100, 3, 'B'); set(m, 101, 3, 'B', { content: 'star' });       // 第二块藏无敌星
  set(m, 106, 3, 'Q', { content: 'coin' }); set(m, 109, 3, 'Q', { content: 'coin' }); set(m, 112, 3, 'Q', { content: 'coin' });
  set(m, 109, 7, 'Q', { content: 'power' });
  set(m, 118, 3, 'B');
  row(m, 121, 123, 7, 'B');
  set(m, 128, 7, 'B'); set(m, 129, 7, 'Q', { content: 'coin' }); set(m, 130, 7, 'Q', { content: 'coin' }); set(m, 131, 7, 'B');
  set(m, 129, 3, 'B'); set(m, 130, 3, 'B');
  stairs(m, 134, [1, 2, 3, 4]); stairs(m, 140, [4, 3, 2, 1]);
  stairs(m, 148, [1, 2, 3, 4, 4]); stairs(m, 155, [4, 3, 2, 1]);
  pipe(m, 163, 2, { exitId: 'bonusExit' });
  set(m, 168, 3, 'B'); set(m, 169, 3, 'B'); set(m, 170, 3, 'Q', { content: 'coin' }); set(m, 171, 3, 'B');
  pipe(m, 179, 2);
  stairs(m, 181, [1, 2, 3, 4, 5, 6, 7, 8, 8]);
  set(m, 198, 0, 'F'); m.flag = { x: 198.5, top: 9.6 };
  m.castle = { x: 202, big: false };
  [22, 40, 51, 52.5, 97, 98.5, 114, 115.5, 124, 125.5, 128, 129.5, 174, 175.5].forEach(c => enemy(m, 'goomba', c + 0.5));
  enemy(m, 'goomba', 80.5, 8); enemy(m, 'goomba', 82.5, 8);              // 高处砖块上的两只
  enemy(m, 'koopa', 107.5);
  m.start = { x: 3, y: 0 };

  // 奖励房间（第 4 根水管进入，19 枚金币，从侧面水管离开回到第 163 列水管）
  const b = area('bonus', { theme: 'underground', width: 17, ceiling: true });
  ground(b, 0, 16);
  column(b, 0, 0, 10, 'B');
  row(b, 4, 12, 10, 'B');
  for (let c = 4; c <= 10; c++) column(b, c, 0, 2, 'B');
  coins(b, 4, 10, 3); coins(b, 4, 10, 5); coins(b, 5, 9, 7);
  sidePipe(b, 13, 0, 11, { to: { area: 'main', mode: 'rise', pipe: 'bonusExit' } });
  return { id: '1-1', name: 'WORLD 1-1', time: 400, theme: 'overworld', areas: { main: m, bonus: b }, startArea: 'main', checkpoint: { area: 'main', x: 89.5, y: 0 } };
}

// ---------------- 1-2 ----------------
function build12() {
  const m = area('main', { theme: 'underground', width: 191, ceiling: true, killY: -5 });
  ground(m, 0, 79); ground(m, 83, 119); ground(m, 122, 123); ground(m, 126, 137); ground(m, 145, 152); ground(m, 160, 190);
  column(m, 0, 0, 10, 'B');                                   // 左墙
  row(m, 6, 137, 10, 'B');                                    // 天花板
  set(m, 10, 3, 'Q', { content: 'power' }); row(m, 11, 14, 3, 'Q', { content: 'coin' });
  // 起点后的蓝色石柱（柱间有一格空隙）
  [[17, 1], [19, 2], [21, 3], [23, 4], [25, 4], [27, 3], [31, 3], [33, 2]].forEach(([c, n]) => column(m, c, 0, n - 1, 'S'));
  set(m, 29, 4, 'B', { content: 'coin10' });
  // 砖块组 A（含无敌星与夹在里面的金币）
  column(m, 39, 3, 5, 'B'); set(m, 40, 3, 'B'); column(m, 41, 3, 5, 'B'); set(m, 42, 5, 'B'); set(m, 43, 5, 'B');
  column(m, 44, 3, 5, 'B'); set(m, 45, 3, 'B'); column(m, 46, 3, 4, 'B'); set(m, 46, 5, 'B', { content: 'star' });
  m.coins.push({ x: 40.5, y: 4.5 }, { x: 45.5, y: 4.5 }); coins(m, 41, 44, 7);
  // 大片砖墙区
  for (let c = 52; c <= 53; c++) column(m, c, 3, 7, 'B');
  for (let c = 54; c <= 55; c++) { column(m, c, 1, 3, 'B'); column(m, c, 8, 9, 'B'); }
  for (let c = 58; c <= 61; c++) { set(m, c, 3, 'B'); column(m, c, 8, 9, 'B'); }
  coins(m, 58, 61, 4);
  for (let c = 62; c <= 63; c++) column(m, c, 3, 9, 'B');
  for (let c = 66; c <= 69; c++) column(m, c, 8, 9, 'B');
  column(m, 67, 3, 7, 'B'); set(m, 68, 3, 'B'); set(m, 69, 3, 'B');
  m.coins.push({ x: 68.5, y: 4.5 }); set(m, 69, 4, 'B', { content: 'power' });
  for (let c = 72; c <= 73; c++) column(m, c, 3, 7, 'B');
  set(m, 73, 4, 'B', { content: 'coin10' });
  for (let c = 76; c <= 79; c++) { set(m, c, 3, 'B'); column(m, c, 8, 9, 'B'); }
  // 坑之后的砖台，天花板里藏 1UP
  for (let c = 84; c <= 89; c++) { set(m, c, 4, 'B'); set(m, c, 5, 'B'); }
  coins(m, 84, 89, 7);
  set(m, 89, 10, 'B', { content: '1up', dropDown: true });
  // 三根带食人花的水管：第一根进奖励房间，第三根是奖励房间出口
  pipe(m, 103, 3, { piranha: true, enter: { area: 'bonus', mode: 'drop', x: 2.2 } });
  pipe(m, 109, 4, { piranha: true });
  pipe(m, 115, 2, { piranha: true, exitId: 'bonusExit' });
  for (let c = 122; c <= 123; c++) column(m, c, 0, 2, 'B');
  stairs(m, 133, [1, 2, 3, 4, 4]);
  // 升降台：左边一路向下，右边一路向上（循环）
  m.lifts.push({ x: 139.75, w: 3, dir: -1, speed: 3, min: -4, max: 14, count: 2 });
  m.lifts.push({ x: 154.75, w: 3, dir: 1, speed: 3, min: -4, max: 14, count: 2 });
  row(m, 145, 149, 4, 'B'); set(m, 150, 4, 'B', { content: 'power' });
  // 出口：抬高的砖地板 + 横向出口水管；砖墙后面是天花板上方的隐藏传送区
  for (let c = 160; c <= 176; c++) column(m, c, 0, 2, 'B');
  row(m, 161, 167, 10, 'B');
  sidePipe(m, 166, 3, 10, { to: { area: 'exit', mode: 'rise', pipe: 'start' } });
  for (let c = 170; c <= 176; c++) column(m, c, 3, 9, 'B');
  row(m, 170, 186, 10, 'B');
  column(m, 190, 0, 10, 'B');
  pipe(m, 178, 2, { enter: { warp: 4 } }); pipe(m, 182, 2, { enter: { warp: 3 } }); pipe(m, 186, 2, { enter: { warp: 2 } });
  m.signs.push({ text: 'WELCOME TO WARP ZONE!', x: 183.5, y: 6.6 }, { text: '4', x: 179, y: 3.3 }, { text: '3', x: 183, y: 3.3 }, { text: '2', x: 187, y: 3.3 });
  [14.5, 15.5, 29.5, 60.5, 63.5, 95.7, 97.2, 98.7, 113.5, 132.5].forEach(x => enemy(m, 'goomba', x));
  enemy(m, 'goomba', 72.5, 8); enemy(m, 'goomba', 76.4, 4); enemy(m, 'goomba', 77.8, 4); enemy(m, 'goomba', 134.5, 2);
  enemy(m, 'koopa', 41.5); enemy(m, 'koopa', 43); enemy(m, 'koopa', 52.5);
  enemy(m, 'koopa', 147.5, 0, { red: true });
  m.start = { x: 2.6, y: 11.5, drop: true };

  // 地下关开场：先在地面自动走进横管，再从地下左侧落下；不计入奖励房间。
  const entry = area('entry', { theme: 'overworld', width: 24 });
  ground(entry, 0, 23);
  entry.castle = { x: 0, big: false };
  entry.start = { x: 5.5, y: 0 };
  sidePipe(entry, 13, 0, 10, { to: { area: 'main', mode: 'drop', x: m.start.x, y: m.start.y, entrance: true } });

  // 奖励房间（27 枚金币 + 一块 10 金币砖），出口回到第三根水管
  const b = area('bonus', { theme: 'underground', width: 18, ceiling: true });
  ground(b, 0, 17);
  column(b, 0, 0, 10, 'B');
  row(b, 4, 13, 10, 'B');
  row(b, 3, 11, 3, 'B'); set(b, 7, 3, 'B', { content: 'coin10' });
  coins(b, 3, 11, 0); coins(b, 3, 11, 4); coins(b, 3, 11, 6);
  sidePipe(b, 14, 0, 11, { to: { area: 'main', mode: 'rise', pipe: 'bonusExit' } });

  // 地面出口区：从水管钻出，食人花水管，8 级台阶，旗杆和城堡
  const e = area('exit', { theme: 'overworld', width: 46 });
  ground(e, 0, 45);
  pipe(e, 1, 2, { exitId: 'start' });
  pipe(e, 9, 3, { piranha: true });
  stairs(e, 15, [1, 2, 3, 4, 5, 6, 7, 8, 8]);
  set(e, 32, 0, 'F'); e.flag = { x: 32.5, top: 9.6 };
  e.castle = { x: 36, big: false };
  return { id: '1-2', name: 'WORLD 1-2', time: 400, theme: 'underground', areas: { main: m, entry, bonus: b, exit: e }, entranceArea: 'entry', startArea: 'main', checkpoint: { area: 'main', x: 91.5, y: 0 } };
}

const BUILDERS = { '1-1': build11, '1-2': build12 };
export const LEVEL_ORDER = ['1-1', '1-2'];
// 每次进入关卡都重新生成一份，方块、敌人、道具回到原样（与原作死亡后重置一致）
export function buildLevel(id) { return BUILDERS[id](); }
