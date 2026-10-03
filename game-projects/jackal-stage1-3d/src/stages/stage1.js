// 第一关 Alpha · 海滩登陆：按 NES 版 Jackal 第一关的流程重建。
// 海滩登陆 → 闪光俘虏小屋 → 营地大门 → 过桥（炮艇）→ 崖顶炮台 → 丛林（隐藏星）→ 最后俘虏屋与直升机坪 → 4 名守卫 → Boss 4 辆蓝色坦克。
export default function build(B) {
  const { T, terrain, idx, cellX, cellY, addStatic, decor, S, rr, R } = B;
  const shoreS = (x) => 3.2 + 0.9 * Math.sin(x * 0.31) + 0.6 * Math.sin(x * 0.13 + 1);
  const shoreW = (y) => -31.5 + 1.2 * Math.sin(y * 0.27);
  const riverS = (x) => 112 + 1.2 * Math.sin(x * 0.21);
  const riverN = (x) => 126 + 1.2 * Math.sin(x * 0.17 + 2);
  const isSea = (x, y) => y < shoreS(x) || (y < 44 && x < shoreW(y) + Math.max(0, (y - 36)) * -0.6);

  // 主干道（吉普车大致路线）
  B.road = [
    [-22, 10], [16, 11], [18, 40], [0, 46], [0, 88], [-22, 92], [-21, 104], [-21, 134], [-2, 146],
    [-4, 174], [7, 178], [7, 204], [10, 214], [-14, 222], [-14, 238], [12, 246], [12, 258], [12, 268],
    [-4, 278], [-4, 292], [0, 300], [0, 330]
  ];
  B.spurs = [
    [[18, 30], [26, 26]],            // 去 H1
    [[0, 296], [22, 294]],           // 去直升机坪
    [[-14, 232], [-26, 232]],        // 去 H3
    [[-4, 282], [-28, 282]]          // 去 H4
  ];

  B.forCells((x, y, c) => {
    let t = T.GRASS;
    if (isSea(x, y)) t = T.SEA;
    else if (y < shoreS(x) + 5.5 + 0.8 * Math.sin(x * 0.7) || (y < 50 && x < shoreW(y) + 5 + 0.7 * Math.sin(y * 0.9))) t = T.SAND;
    if (y > riverS(x) && y < riverN(x)) t = T.WATER;
    else if (y > riverS(x) - 1.6 && y < riverN(x) + 1.6) t = T.SAND;
    terrain[c] = t;
  });
  // 营地夯土地面
  B.fill(T.FLOOR, -29, 57, 29, 97);
  // 道路
  B.paintRoad(T.ROAD, 2.1, [T.SEA, T.WATER]);
  // 桥（南北向跨河，x ∈ [-25, -17)）
  B.fill(T.BRIDGE, -25, 109, -17, 129, [T.GRASS]);
  for (let j = 109; j < 129; j++) for (let i = B.ci(-25); i < B.ci(-17); i++) { const c = idx(i, j); if (terrain[c] === T.WATER || terrain[c] === T.SAND || terrain[c] === T.ROAD) terrain[c] = T.BRIDGE; }
  // 直升机坪
  const PAD = { x: 22, y: 294, r: 4 };
  for (let j = 288; j < 300; j++) for (let i = B.ci(16); i < B.ci(28); i++) { const x = cellX(i), y = cellY(j); if ((x - PAD.x) ** 2 + (y - PAD.y) ** 2 < PAD.r * PAD.r) terrain[idx(i, j)] = T.PAD; }
  // Boss 场地
  B.fill(T.DIRT, -26, 306, 26, 346, [T.ROAD]);

  // ---------- 静态物体 ----------
  // 营地围墙与大门
  const GATE = addStatic('gate', -3, 55, 3, 57, { name: '营地大门' });
  for (const [x0, x1] of [[-29, -5], [5, 29]]) addStatic('wall', x0, 55.5, x1, 56.5);
  addStatic('wall', -30, 55.5, -29, 98); addStatic('wall', 29, 55.5, 30, 98);
  addStatic('wall', -17, 96.5, 29, 97.5); addStatic('wall', -29, 96.5, -27, 97.5);
  for (const [x, y] of [[-5, 55], [3, 55], [-31, 55], [29, 55], [-31, 96], [29, 96], [-19, 96], [-29, 96]]) addStatic('tower', x, y, x + 2, y + 2);

  // 营房 / 俘虏屋：{n 普通俘虏, flash 闪光俘虏}
  addStatic('hut', -17, 34, -12, 38, { n: 2, flash: 0, name: 'H0' });
  addStatic('hut', 24, 22, 29, 26, { n: 2, flash: 1, name: 'H1' });
  addStatic('hut', -21, 68, -15, 72, { n: 3, flash: 0, name: 'B1' });
  addStatic('hut', 15, 78, 21, 82, { n: 2, flash: 1, name: 'B2' });
  addStatic('hut', -31, 184, -26, 188, { n: 2, flash: 0, name: 'H2' });
  addStatic('hut', -29, 230, -24, 234, { n: 2, flash: 0, name: 'H3' });
  addStatic('hut', -33, 280, -28, 284, { n: 2, flash: 1, name: 'H4' });

  // 营地内部
  for (const [x, y] of [[16.5, 64.5], [-16.5, 86.5]]) { addStatic('tent', x - 1.5, y - 1.5, x + 1.5, y + 1.5); decor.tents.push([x, y]); }
  addStatic('watch', 23, 91, 25, 93); decor.watchtowers.push([24, 92]);
  for (const [x, y] of [[8.5, 66.5], [9.5, 66.5], [8.5, 67.5], [-26.5, 62.5], [-25.5, 62.5]]) addStatic('crate', x - 0.5, y - 0.5, x + 0.5, y + 0.5);
  for (const [x, y] of [[-8.5, 76.5], [-7.5, 77.5], [-9.5, 77.5], [21.5, 70.5], [22.5, 71.5], [-28.5, 140.5], [-27.5, 141.5], [6.5, 262.5], [7.5, 263.5]]) addStatic('barrel', x - 0.5, y - 0.5, x + 0.5, y + 0.5);
  B.sandbags(-4, 72, 4); B.sandbags(-2, 20, 4); B.sandbags(-14, 108, -8); B.sandbags(-6, 196, 0); B.sandbags(-14, 288, -8); B.sandbags(4, 150, 10);

  // 桥栏
  addStatic('rail', -25, 110, -24, 128); addStatic('rail', -18, 110, -17, 128);

  // 崖顶台地（2×2 一块，火箭可炸毁）
  const bl = [];
  B.plateau(-34, 154, -16, 166, true, bl); B.plateau(8, 158, 30, 170, true, bl); B.plateau(-14, 180, 2, 192, true, bl); B.plateau(12, 188, 34, 200, true, bl);

  // Boss 入口路障（开战时升起）
  const BARRICADE = addStatic('barricade', -8, 304, 8, 306);

  // ---------- 树木 ----------
  B.clear(26.5, 24, 5); B.clear(-14.5, 36, 4.5); B.clear(PAD.x, PAD.y, 6); B.clear(-28.5, 186, 5); B.clear(-26.5, 232, 6); B.clear(-30.5, 282, 5);
  B.clear(30, 205, 2.5);   // 隐藏星所在的林角
  B.clear(0, 302, 9);
  B.clear(-6, 140, 4);     // 坦克 T1

  // A 区：海滩棕榈与丛林
  for (let k = 0; k < 70; k++) {
    const x = rr(-34, 34), y = rr(3, 50);
    if (B.tAt(x, y) !== T.SAND || !B.free(x, y) || B.nearClear(x, y, 0.2)) continue;
    B.tree(x, y, 1, 'palm');
  }
  B.cluster(-26, 42, 4, 14); B.cluster(30, 42, 3.5, 10); B.cluster(-4, 36, 2, 5); B.cluster(8, 26, 1.6, 3); B.cluster(32, 14, 2.5, 6);
  B.forest(-36, 48, -30, 100); B.forest(30, 48, 36, 100);
  // C 区
  B.cluster(20, 104, 3, 8); B.cluster(30, 106, 3, 8); B.cluster(-30, 146, 3, 9); B.cluster(24, 136, 3, 8); B.cluster(31, 150, 2, 5); B.cluster(-12, 132, 1.8, 4);
  // D 区
  B.forest(30, 154, 36, 204, 0.9); B.cluster(-32, 172, 2.5, 6); B.cluster(-12, 202, 2, 4); B.cluster(-34, 200, 2, 5);
  // E 区：密林
  B.forest(-36, 206, 36, 258);
  // F 区
  B.cluster(-22, 262, 3, 8); B.cluster(4, 266, 1.8, 4); B.cluster(-18, 297, 2, 4); B.cluster(31, 280, 2.5, 6); B.cluster(30, 262, 3, 7);
  B.forest(-36, 256, -32, 300, 0.7); B.forest(34, 256, 36, 300, 0.7);
  // G 区：Boss 场地四周密林、场内四处树丛
  for (let y = 300; y < 352; y += 2) for (let x = -36; x < 36; x += 2) {
    const inArena = x >= -26 && x + 2 <= 26 && y >= 306 && y + 2 <= 346;
    const gapS = x >= -8 && x + 2 <= 8 && y < 306;
    const gapN = x >= -4 && x + 2 <= 4 && y >= 346;
    if (inArena || gapS || gapN) continue;
    if (y < 306 && Math.abs(x + 1) < 12 && y < 302) continue;
    B.tree(x, y, 2);
  }
  for (const [x, y] of [[-14, 316], [12, 316], [-14, 332], [12, 332]]) for (let dy = 0; dy < 4; dy += 2) for (let dx = 0; dx < 4; dx += 2) B.tree(x + dx, y + dy, 2);
  // 岩石
  for (const [x, y, s] of [[-33, 30, 1.6], [12, 8, 1.2], [-8, 128.5, 1.1], [16, 129, 1.3], [-34, 120, 1.5], [33, 120, 1.4], [-20, 150, 1.2], [26, 176, 1.3], [-2, 162, 1]]) B.rock(x, y, s);
  // 花丛与灌木、草丛（纯装饰，不挡路）
  B.scatterDecor(260, 1600, T.GRASS);
  // 场外装饰林
  B.outerForest('tree', (y, side) => (y > 106 && y < 131) || (side > 0 && y < 50) || y < 46);

  // ---------- 动态实体出生表 ----------
  // A 区：海滩
  S('soldier', -12, 17, { patrol: [4, 0] }); S('soldier', -2, 15); S('soldier', 6, 31, { patrol: [0, 4] }); S('soldier', 14, 23);
  S('soldier', 30, 30); S('soldier', 22, 38, { patrol: [-4, 0] }); S('soldier', -22, 30); S('soldier', -8, 44);
  S('mg', -6, 28); S('mg', 10, 34);
  // B 区：营地
  S('soldier', -6, 52, { hold: true }); S('soldier', 6, 52, { hold: true });
  S('cannon', -7, 62); S('cannon', 7, 62);
  S('soldier', -10, 64, { patrol: [6, 0] }); S('soldier', 12, 72); S('soldier', -4, 84, { patrol: [0, 5] }); S('soldier', -22, 80); S('soldier', 22, 90);
  S('officer', 0, 80); S('mg', 8, 86);
  // C 区：河岸、炮艇、守桥坦克
  S('soldier', -10, 104); S('soldier', 8, 108); S('soldier', -29, 106); S('mg', 2, 105);
  S('boat', 10, 119, { range: [-13, 33] }); S('boat', 24, 121, { range: [-13, 33], dir: -1 });
  S('tank', -6, 140, { flashPow: true }); S('soldier', -28, 135); S('soldier', 6, 134); S('soldier', 15, 147); S('mg', 12, 142);
  // D 区：崖顶炮台
  S('cannon', -25, 160, { elevated: true }); S('cannon', 19, 164, { elevated: true }); S('cannon', -6, 186, { elevated: true }); S('cannon', 23, 194, { elevated: true });
  S('soldier', -6, 158); S('soldier', 2, 171); S('soldier', -24, 176); S('soldier', 8, 197); S('soldier', -31, 196); S('officer', -20, 191); S('mg', -3, 199.5);
  // 隐藏的棕色星（原作：拾取后消灭画面上所有敌人）
  S('star', 30, 205, { hidden: true, item: 'bomb' });
  // E 区：丛林
  S('soldier', 8, 212); S('soldier', -6, 222); S('soldier', -17, 232); S('soldier', 0, 242); S('soldier', 15, 252); S('officer', -12, 229);
  S('tank', 12, 251, { patrol: [[12, 246], [0, 242]] });
  // F 区：最后的阵地
  S('cannon', -14, 264); S('cannon', 24, 270); S('tank', 0, 284); S('tank', 15, 289); S('mg', -10, 291);
  S('soldier', -26, 270); S('soldier', -22, 289); S('soldier', 8, 277); S('soldier', 29, 286); S('soldier', 17, 299);
  // 4 名原地守卫
  for (const x of [-6, -2, 2, 6]) S('soldier', x, 303.5, { hold: true, guard: true });

  const checkpoints = [
    { ty: -1, x: -19, y: 10, name: '海滩' },
    { ty: 48, x: 8, y: 45, name: '营地外' },
    { ty: 59, x: 0, y: 60, name: '营地内', needGone: GATE },
    { ty: 101, x: -21, y: 103, name: '南岸' },
    { ty: 130, x: -21, y: 131, name: '北岸' },
    { ty: 172, x: -4, y: 172, name: '崖顶' },
    { ty: 205, x: 7, y: 205, name: '丛林' },
    { ty: 258, x: 12, y: 258, name: '最后阵地' },
    { ty: 296, x: 2, y: 293.5, name: '场地入口' }
  ];

  return {
    n: 1, code: 'Alpha', title: '海滩登陆', sub: '救出俘虏，送上直升机', music: 'stage',
    sky: 0xbfe8ec, fog: 0xcdeee4, palette: {}, outerGround: 0x6fae5a,
    intro: 'craft',
    start: { x: -19, y: 10, dir: 2, introFrom: { x: -26, y: 2.2 } },
    pad: PAD,
    boss: { type: 'tanks', name: 'BOSS：蓝色坦克小队', sub: '每辆要两发爆炸物直接命中', trigger: 308.5, cx: 0, cy: 325, x0: -26, x1: 26, y0: 306, y1: 346, respawn: { x: 0, y: 309.5 }, entry: { x: 0, y: 350 }, heliFrom: 296 },
    checkpoints, gate: GATE, barricade: BARRICADE,
    water: [{ x: -40, y: -16, w: 200, h: 132 }, { x: 0, y: 119, w: 200, h: 20 }],
    beds: [[-100, -36, 109, 129, -1.3], [36, 100, 109, 129, -1.3], [-120, 120, -80, 6, -1.9], [-120, -36, 6, 44, -1.9]],
    outer: [[-100, -36, 44, 109], [-100, -36, 129, 420], [36, 100, 6, 109], [36, 100, 129, 420], [-36, 36, 352, 420]],
    bridges: [{ kind: 'wood', x0: -25, x1: -17, y0: 109, y1: 129 }],
    bluffTop: 0x84c46a
  };
}
