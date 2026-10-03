// 第二关 Baker · 废墟城：按 NES 版 Jackal 第二关（地图 VGMaps Jackal-Stage2，流程参照 GameFAQs 攻略）重建。
// 军官俘虏小屋 → 两座炮台 → 窄口（轰炸机、敌方吉普）→ 水池石像 → 围墙营地（前门、10 名俘虏 + 军官、后门）→ 重型坦克
// → 西侧石柱长廊（最南端藏闪光星）→ 落石柱 → 草场直升机坪（军官俘虏）→ 石柱废墟（敌方吉普、落石柱）→ 护城河石桥（4 座水中石像）
// → 河边柱间藏绿星 → Boss：庭院北墙 4 座石像（追踪导弹），期间有棕色坦克开进。
export default function build(B) {
  const { T, addStatic, decor, S, R, rr } = B;

  B.road = [[0, 4], [-2, 30], [-9, 50], [-9, 70], [4, 76], [4, 104], [15, 110], [15, 120], [8, 132], [-6, 136],
    [-27, 138], [-28, 160], [-10, 166], [0, 172], [0, 198], [-2, 222], [6, 244], [0, 270], [0, 318], [0, 340]];
  B.spurs = [[[0, 222], [14, 225]]];

  // ---------- 地形 ----------
  B.fill(T.GRASS, -36, 0, 36, 352);
  // 南部石板小路（两侧）
  B.fill(T.STONE, -36, 0, -28, 44); B.fill(T.STONE, -36, 36, -16, 44);
  B.fill(T.STONE, 21, 0, 36, 49); B.fill(T.STONE, -3, 41, 36, 49);
  // 水池（石像）
  B.fill(T.STONE, -36, 54, -19, 77); B.fill(T.WATER, -36, 56, -21, 75);
  // 营地内地面
  B.fill(T.DIRT, -3, 82, 29, 108);
  // 西侧石板区与长廊、东侧石板区、北面横向石板带
  B.fill(T.STONE, -36, 118, -7, 172); B.fill(T.STONE, 19, 118, 36, 162); B.fill(T.STONE, -36, 162, 18, 172);
  // 中部土路
  B.fill(T.DIRT, -8, 172, 8, 200);
  // 草场（直升机坪）
  B.fill(T.FLOOR, -32, 201, 32, 244);
  const PAD = { x: 14, y: 225, r: 4 };
  B.forCells((x, y, c) => { if ((x - PAD.x) ** 2 + (y - PAD.y) ** 2 < PAD.r * PAD.r) B.terrain[c] = T.PAD; });
  // 废墟土地
  B.fill(T.DIRT, -10, 246, 10, 276);
  // 护城河 + 石桥
  B.fill(T.STONE, -36, 276, 36, 278); B.fill(T.WATER, -36, 278, 36, 305); B.fill(T.STONE, -36, 305, 36, 310);
  B.fill(T.BRIDGE, -5, 278, 5, 305);
  // Boss 庭院
  B.fill(T.STONE, -26, 320, 26, 352);
  B.fill(T.GRASS, -22, 326, 22, 344);

  // ---------- 柱廊工具 ----------
  let pk = 0;
  const col = (x, y, broken) => { const s = addStatic('pillar', x - 0.5, y - 0.5, x + 0.5, y + 0.5, { broken: !!broken }); pk++; return s; };
  const rowX = (x0, x1, y, step, gaps) => { for (let x = x0; x <= x1 + 1e-6; x += step || 2) { if (gaps && gaps.some(g => x > g[0] && x < g[1])) continue; col(x, y); } };
  const rowY = (x, y0, y1, step, gaps) => { for (let y = y0; y <= y1 + 1e-6; y += step || 2) { if (gaps && gaps.some(g => y > g[0] && y < g[1])) continue; col(x, y); } };
  const hedgeX = (x0, x1, y, gaps) => { for (let x = x0; x < x1; x++) { if (gaps && gaps.some(g => x + 0.5 > g[0] && x + 0.5 < g[1])) continue; addStatic('hedge', x, y, x + 1, y + 1); } };
  const hedgeY = (x, y0, y1, gaps) => { for (let y = y0; y < y1; y++) { if (gaps && gaps.some(g => y + 0.5 > g[0] && y + 0.5 < g[1])) continue; addStatic('hedge', x, y, x + 1, y + 1); } };

  // A 区：起点两侧的石板路与柱廊
  rowY(-27.5, 2.5, 34.5); hedgeY(-27, 2, 36);
  rowX(-34.5, -16.5, 44.5); hedgeX(-27, -16, 35);
  rowY(20.5, 2.5, 38.5); hedgeY(20, 2, 40);
  rowX(-2.5, 34.5, 49.5); rowX(-2.5, 18.5, 40.5);
  // 散落断柱
  for (const [x, y] of [[11.5, 12.5], [-5.5, 8.5], [-15.5, 6.5], [15.5, 3.5], [9.5, 19.5], [-18.5, 18.5]]) col(x, y, true);

  // B 区：水池石沿、围墙营地
  const GATE_S = addStatic('gate', 1, 81, 7, 83, { name: '营地前门' });
  for (let x = -4; x < 30; x++) if (x < 1 || x >= 7) addStatic('wall', x, 81, x + 1, 82);
  const GATE_N = addStatic('gate', 12, 108, 18, 110, { name: '营地后门' });
  for (let x = -4; x < 30; x++) if (x < 12 || x >= 18) addStatic('wall', x, 108, x + 1, 109);
  for (let y = 82; y < 108; y++) { addStatic('wall', -4, y, -3, y + 1); addStatic('wall', 29, y, 30, y + 1); }
  addStatic('hut', 18, 84, 24, 88, { n: 3, flash: 0, name: 'B1' });
  addStatic('hut', 1, 96, 6, 100, { n: 4, flash: 0, name: 'B2' });
  addStatic('hut', 18, 96, 24, 100, { n: 3, flash: 1, name: 'B3', style: 'tent' });
  for (const [x, y] of [[-0.5, 90.5], [0.5, 90.5], [26.5, 104.5], [26.5, 103.5]]) addStatic('crate', x - 0.5, y - 0.5, x + 0.5, y + 0.5);
  for (const [x, y] of [[10.5, 86.5], [11.5, 87.5], [-1.5, 104.5]]) addStatic('barrel', x - 0.5, y - 0.5, x + 0.5, y + 0.5);
  B.sandbags(8, 100, 14);
  // 起点军官俘虏屋、营地西侧俘虏屋
  addStatic('hut', -16, 22, -11, 26, { n: 0, flash: 1, name: 'H1' });
  addStatic('hut', -27, 106, -21, 110, { n: 2, flash: 0, name: 'H2' });
  rowY(-19.5, 52.5, 78.5); rowX(-34.5, -20.5, 78.5);

  // C 区：西侧柱廊迷宫
  rowY(-6.5, 118.5, 160.5, 2, [[133, 140]]); hedgeY(-6, 118, 162, [[133, 140]]);      // 草地与西区之间（中段留口）
  rowY(-32.5, 118.5, 158.5); rowY(-23.5, 122.5, 158.5);                                  // 长廊两侧石柱
  rowX(-22.5, -8.5, 128.5); rowX(-22.5, -8.5, 148.5, 2, [[-16, -12]]);
  rowY(18.5, 126.5, 160.5, 2, [[140, 146]]); hedgeY(18, 126, 162, [[140, 146]]);
  rowX(-4.5, 16.5, 156.5); hedgeX(-4, 18, 156);
  rowX(19.5, 34.5, 162.5);
  rowX(-34.5, -6.5, 172.5); rowX(8.5, 34.5, 172.5);
  B.decor.props.push({ kind: 'log', x: -6, y: 136.5, a: 0, l: 2.4 }, { kind: 'log', x: 18, y: 143, a: 0, l: 2.4 });

  // D 区：土路两侧废墟
  for (const [x, y] of [[-12.5, 180.5], [-16.5, 188.5], [12.5, 178.5], [16.5, 192.5], [-20.5, 194.5], [22.5, 184.5], [-28.5, 182.5], [28.5, 196.5]]) col(x, y, R() < 0.5);
  for (const [x0, y0, x1, y1] of [[-30, 176, -26, 178], [24, 176, 28, 179], [-24, 196, -21, 198]]) addStatic('ruin', x0, y0, x1, y1);
  rowX(-34.5, -8.5, 199.5); rowX(8.5, 34.5, 199.5);

  // E 区：草场
  addStatic('hut', -22, 208, -16, 213, { n: 0, flash: 1, name: 'H3' });
  for (const [x, y, a, l] of [[-24, 234, 0.1, 3], [-15, 230, -0.2, 3], [24, 214, 0.15, 3], [20, 210, -0.1, 3]]) {
    decor.props.push({ kind: 'log', x, y, a, l });
    for (let k = -1; k <= 1; k++) addStatic('pylon', Math.floor(x + k * Math.cos(a)), Math.floor(y - k * Math.sin(a)), Math.floor(x + k * Math.cos(a)) + 1, Math.floor(y - k * Math.sin(a)) + 1, { hidden: true });
  }
  rowX(-34.5, -6.5, 244.5); rowX(8.5, 34.5, 244.5);
  rowY(-33.5, 201.5, 243.5, 3); rowY(33.5, 201.5, 243.5, 3);

  // F 区：石柱废墟
  for (const [x, y] of [[-14.5, 250.5], [-18.5, 258.5], [-14.5, 266.5], [14.5, 252.5], [18.5, 262.5], [14.5, 270.5], [-26.5, 254.5], [-24.5, 266.5], [26.5, 256.5], [28.5, 268.5], [-31.5, 260.5], [31.5, 250.5]]) col(x, y, R() < 0.4);
  for (const [x0, y0, x1, y1] of [[-34, 270, -29, 272], [22, 247, 26, 249]]) addStatic('ruin', x0, y0, x1, y1);

  // G 区：护城河两岸柱列、石桥栏杆
  rowX(-34.5, -7.5, 275.5, 3); rowX(7.5, 34.5, 275.5, 3);
  rowX(-34.5, -8.5, 308.5, 2); rowX(8.5, 34.5, 308.5, 2);
  addStatic('rail', -5, 278, -4, 305, { stone: true }); addStatic('rail', 4, 278, 5, 305, { stone: true });

  // H 区：Boss 庭院（北墙、两侧柱墙）
  rowX(-34.5, -7.5, 316.5, 3); rowX(7.5, 34.5, 316.5, 3);
  for (let y = 320; y < 352; y++) { addStatic('wall', -27, y, -26, y + 1); addStatic('wall', 26, y, 27, y + 1); }
  for (let x = -26; x < 26; x++) addStatic('wall', x, 349, x + 1, 350);
  for (let x = -26; x < 26; x++) if (x < -7 || x >= 7) addStatic('wall', x, 320, x + 1, 321);
  rowX(-25.5, 25.5, 350.5, 1.7);
  for (const [x, y] of [[-16.5, 330.5], [16.5, 330.5], [-16.5, 340.5], [16.5, 340.5]]) col(x, y, true);
  const BARRICADE = addStatic('barricade', -7, 319, 7, 321);

  // 草丛、灌木（纯装饰）
  B.clear(PAD.x, PAD.y, 6); B.clear(0, 322, 8);
  B.cluster(-30, 92, 3, 6, 'tree'); B.cluster(33, 60, 2, 4); B.cluster(-32, 190, 2.5, 6); B.cluster(32, 210, 2, 4);
  B.scatterDecor(160, 1300, T.GRASS, [4, 340], [2, 350]);
  B.outerForest('tree', (y) => y > 276 && y < 308);
  for (let y = 0; y < 352; y += 4) for (const side of [-1, 1]) if (!(y > 276 && y < 308)) decor.props.push({ kind: 'statueDecor', x: side * 39, y: y + rr(-1, 1), hidden: R() < 0.85 });
  decor.props = decor.props.filter(p => !p.hidden);

  // ---------- 敌人与道具 ----------
  // A 区
  S('soldier', -6, 14, { patrol: [4, 0] }); S('soldier', 8, 16); S('soldier', -20, 30); S('soldier', 14, 34); S('soldier', 2, 22);
  S('tank', 6, 26, { paint: 'brown' });
  S('mg', -3, 36, { look: 'turret' }); S('mg', 7, 36, { look: 'turret' });
  S('bomber', 0, 54, { trigger: 46 });
  S('ejeep', 8, 66);
  // B 区
  S('wstatue', -28, 65.5);
  S('mg', -12, 66, { look: 'turret' }); S('mg', -3, 66, { look: 'turret' });
  S('soldier', -1, 78.5, { hold: true }); S('soldier', 9, 78.5, { hold: true });
  S('soldier', 6, 90, { patrol: [6, 0] }); S('soldier', 22, 92); S('soldier', 12, 102); S('officer', 4, 94); S('soldier', 26, 86);
  S('bulltank', 14, 117);
  S('mg', 6, 122, { look: 'turret' }); S('mg', 25, 124, { look: 'turret' });
  // C 区
  S('soldier', -14, 136); S('soldier', -20, 142); S('soldier', -28, 132, { hold: true }); S('soldier', -10, 156); S('soldier', 26, 134); S('soldier', 28, 150);
  S('star', -28, 125, { hidden: true, item: 'max' });
  S('bomber', -20, 172, { trigger: 150 });
  S('tank', -14, 168, { paint: 'brown', patrol: [[-14, 166], [4, 166]] });
  S('mg', 2, 146, { look: 'turret' });
  // D 区
  S('mg', 4, 182, { look: 'turret' }); S('soldier', -5, 186); S('soldier', 6, 192);
  S('fallpillar', -9, 191, { dir: 1, trigger: 184 });
  // E 区：草场
  S('mg', -2, 236, { look: 'turret' }); S('mg', 25, 235, { look: 'turret' }); S('mg', -9, 218, { look: 'turret' });
  S('tank', 6, 212, { paint: 'brown', patrol: [[6, 212], [-8, 228]] });
  S('bulltank', -24, 240);
  S('bomber', 10, 238, { trigger: 214 });
  S('soldier', -26, 214, { hold: true }); S('soldier', 0, 206); S('soldier', 24, 222); S('soldier', -12, 238);
  // F 区：石柱废墟
  S('ejeep', 8, 252); S('fallpillar', -8, 254, { dir: 1, trigger: 247 }); S('mg', 14, 260, { look: 'turret' });
  S('fallpillar', 8, 265, { dir: -1, trigger: 258 }); S('ejeep', -12, 268);
  S('bomber', -6, 284, { trigger: 262 });
  S('soldier', -3, 273.5, { hold: true }); S('soldier', 3, 273.5, { hold: true });
  // G 区：护城河
  for (const [x, y] of [[-12, 286], [-12, 298], [12, 286], [12, 298]]) S('wstatue', x, y);
  S('soldier', -9, 312); S('soldier', 10, 313); S('ejeep', -14, 312);
  S('bomber', 8, 310, { trigger: 282 }); S('bomber', -8, 312, { trigger: 296 });
  S('mg', -11, 314, { look: 'turret' }); S('mg', 11, 314, { look: 'turret' });
  S('star', 27, 306.5, { hidden: true, item: 'up' });

  const checkpoints = [
    { ty: -1, x: 0, y: 6, name: '废墟入口' },
    { ty: 50, x: -9, y: 52, name: '窄口' },
    { ty: 84, x: 4, y: 85, name: '营地内', needGone: GATE_S },
    { ty: 112, x: 15, y: 113, name: '营地后门', needGone: GATE_N },
    { ty: 140, x: -14, y: 138, name: '石柱长廊' },
    { ty: 174, x: 0, y: 175, name: '土路' },
    { ty: 203, x: 0, y: 204, name: '草场' },
    { ty: 248, x: 2, y: 248, name: '石柱废墟' },
    { ty: 278, x: 0, y: 276.5, name: '护城河' },
    { ty: 311, x: 0, y: 312, name: '庭院入口' }
  ];

  return {
    n: 2, code: 'Baker', title: '废墟城', sub: '石柱后面藏着闪光星', music: 'ruins',
    sky: 0xc8dcc2, fog: 0xc9d8b8, hemiGround: 0x8f8a62, outerGround: 0x8f9a4e,
    palette: { [T.GRASS]: 0x96a052, [T.STONE]: 0xcbc3a8, [T.FLOOR]: 0x6fae55, [T.DIRT]: 0xbba675, [T.ROAD]: 0xcabd96 },
    wallStyle: 'ruin', gateStyle: 'green', hutStyle: 'stone', tuftTint: 0x7f9a4a, hedgeTint: 0x4f8a46,
    intro: 'drive',
    start: { x: 0, y: 6, dir: 0, introFrom: { x: 0, y: -6 } },
    pad: PAD,
    boss: {
      type: 'statues', name: 'BOSS：四座石像', sub: '石像只怕手雷和火箭，机枪能打掉它们的导弹', trigger: 323.5, cx: 0, cy: 336, lockY: true, x0: -26, x1: 26, y0: 321, y1: 349,
      respawn: { x: 0, y: 324.5 }, heliFrom: 312,
      statues: [[-10.5, 347], [-3.5, 347], [3.5, 347], [10.5, 347]], tankEntries: [[-23, 327], [23, 327]]
    },
    checkpoints, gate: GATE_S, barricade: BARRICADE,
    water: [{ x: 0, y: 291.5, w: 240, h: 29 }, { x: -28, y: 65.5, w: 18, h: 22 }],
    beds: [[-160, -36, 278, 305, -1.3], [36, 160, 278, 305, -1.3]],
    outer: [[-160, -36, -80, 278], [-160, -36, 305, 480], [36, 160, -80, 278], [36, 160, 305, 480], [-36, 36, -80, 0], [-36, 36, 352, 480]],
    bridges: [{ kind: 'stone', x0: -5, x1: 5, y0: 278, y1: 305 }]
  };
}
