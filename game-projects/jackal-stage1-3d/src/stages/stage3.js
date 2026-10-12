// 第三关 Charlie · 港口：按 NES 版 Jackal 第三关（地图 VGMaps Jackal-Stage3，sonyball 绘制）重建。
// 货场起点 → 第一道闸门 → 停车场与船坞水池（固定炮台）→ 仓库货场（两间俘虏棚）→ 双栈桥（两侧炮艇）
// → 俘虏棚货场（停着的吉普里藏绿星）→ 三排长仓库之间的之字通道（每排北侧 3 座炮台）→ 停机坪
// → 第二道闸门 → 四炮台院子（藏棕色星）→ 第三道闸门 → 码头 → Boss：停靠的战舰（6 座炮塔）。
// 地图只标了固定物体；步兵、坦克、炮艇、敌方吉普的位置是按流程补的，不是逐格对照。
export default function build(B) {
  const { T, addStatic, decor, S } = B;
  const marks = decor.marks, props = decor.props;

  // 吉普大致路线（自动试玩与测试用）
  B.road = [[0, 5], [9, 17], [9, 40], [-10, 56], [-20, 66], [-20, 82], [-21, 100], [-19, 126], [-11, 133], [-11, 177], [-4, 180], [-8, 196],
    [-26, 203], [-26, 218], [29, 218], [29, 233], [-17.5, 233], [-17.5, 246], [4, 262], [4, 272], [-16, 278], [-20, 290], [-14, 295], [-14, 302], [0, 312], [0, 330]];
  B.spurs = [[[4, 262], [17, 256]]];

  // ---------- 小工具 ----------
  const stack = (x0, y0, x1, y1) => addStatic('stack', x0, y0, x1, y1);
  const cont = (x0, y0, x1, y1, color) => addStatic('container', x0, y0, x1, y1, color ? { color } : undefined);
  const wh = (x0, y0, x1, y1, h) => addStatic('warehouse', x0, y0, x1, y1, { style: 'port', h });
  const sea = (x0, y0, x1, y1) => B.fill(T.SEA, x0, y0, x1, y1);
  const basin = (x0, y0, x1, y1) => B.fill(T.WATER, x0, y0, x1, y1);
  const grate = (x, y, l) => marks.push({ kind: 'grate', x, y, l: l || 8 });
  const arrow = (x, y, a, color) => marks.push({ kind: 'arrow', x, y, a: a || 0, color });
  const turret = (x, y) => S('mg', x, y, { look: 'turret' });
  // 一整道围墙，留出闸门的位置
  const wallRow = (y, gx0, gx1) => { for (let x = -36; x < 36; x++) if (x < gx0 || x >= gx1) addStatic('wall', x, y, x + 1, y + 1); };
  // 停车场白线：slots 个车位，开口朝南
  const parking = (x0, y0, x1, y1, slots) => {
    const w = (x1 - x0) / slots;
    for (let k = 0; k <= slots; k++) marks.push({ kind: 'line', x: x0 + k * w, y: (y0 + y1) / 2, l: y1 - y0, w: 0.2 });
    marks.push({ kind: 'line', x: (x0 + x1) / 2, y: y1, l: x1 - x0, w: 0.2, a: Math.PI / 2 });
    for (let k = 0; k < slots; k++) arrow(x0 + (k + 0.5) * w, y1 + 2.2, 0);
  };
  // 停着的敌方吉普（可炸毁，占 2×3 格）
  const pjeep = (x, y, data) => addStatic('pjeep', x, y, x + 2, y + 3, data);

  // ---------- 地形 ----------
  B.fill(T.CONCRETE, -36, 0, 36, 352);
  basin(-36, 36, -23, 63);                       // 西侧船坞 1
  basin(-36, 70, -23, 78);                       // 西侧船坞 2
  basin(-17, 70, 18, 79);                        // 中央船坞
  sea(-36, 86, -25, 132);                        // 仓库货场西边是海
  sea(-36, 132, 36, 176);                        // 栈桥两侧的海
  B.fill(T.CONCRETE, -14, 132, -8, 176);         // 西栈桥
  B.fill(T.CONCRETE, 0, 132, 6, 176);            // 东栈桥
  B.forCells((x, y, c) => { if (y >= 176 && y < 201 && x < -22 - (y - 176) * 0.56) B.terrain[c] = T.SEA; });   // 俘虏棚货场西南的斜岸
  sea(-36, 334, 36, 352);                        // 码头外的海（战舰停在这里）
  const PAD = { x: 17, y: 256, r: 4 };
  B.forCells((x, y, c) => { if ((x - PAD.x) ** 2 + (y - PAD.y) ** 2 < PAD.r * PAD.r) B.terrain[c] = T.PAD; });

  // ---------- A 货场起点（y 0–21） ----------
  stack(-36, 0, -31, 21); stack(31, 0, 36, 21);
  stack(-31, 5, -27, 13); stack(27, 7, 31, 13);
  cont(-27, 9, -18, 13); cont(18, 9, 27, 13); cont(13, 1, 22, 5);
  grate(9, 15.5, 9);
  const GATE1 = addStatic('gate', 6, 21, 12, 23, { name: '第一道闸门' });
  wallRow(21, 6, 12);
  arrow(8.2, 18.5, 0); arrow(9.8, 18.5, 0);

  // ---------- B 停车场与船坞（y 23–88） ----------
  stack(-36, 23, -31, 36); stack(31, 23, 36, 35); stack(27, 30, 31, 34);
  parking(-9, 26, 17, 36, 6);
  pjeep(5, 29);
  grate(-16, 40, 6); grate(-25, 31.5, 6);
  wh(23, 35, 36, 51);
  parking(-9, 45, 17, 53, 6);
  pjeep(-5, 47); pjeep(9, 47);
  cont(9, 63, 18, 67); cont(13, 59, 22, 63); stack(5, 59, 9, 63); stack(23, 57, 27, 61);
  stack(27, 51, 36, 70);
  wh(23, 70, 36, 85);
  stack(-36, 63, -31, 70);
  stack(-36, 78, -31, 86); cont(-31, 79, -22, 83);
  stack(5, 85, 13, 89); cont(0, 89, 9, 93);

  // ---------- C 仓库货场（y 88–132） ----------
  stack(30, 85, 36, 132); stack(26, 96, 30, 112);
  stack(-9, 90, -5, 98); stack(-5, 93, 0, 102);
  addStatic('hut', 10, 98, 16, 103, { n: 3, flash: 0, name: 'P1' });
  addStatic('hut', 16, 90, 22, 95, { n: 2, flash: 1, name: 'P2' });
  grate(-11, 105, 8); grate(2, 105, 8);
  wh(-13, 109, 4, 123);
  for (const y of [112, 115.5, 119]) { arrow(-16.5, y, 0, y === 115.5 ? 0xe8a020 : undefined); arrow(7.5, y, 0, y === 115.5 ? 0xe8a020 : undefined); }
  cont(13, 121, 22, 125); stack(22, 121, 26, 125);
  grate(-11, 127, 8);
  props.push({ kind: 'crane', x: 33, y: 116 });

  // ---------- D 双栈桥（y 132–176） ----------
  marks.push({ kind: 'line', x: -11, y: 154, l: 40, w: 0.18 }, { kind: 'line', x: 3, y: 154, l: 40, w: 0.18 });

  // ---------- E 俘虏棚货场（y 176–207） ----------
  stack(22, 176, 32, 180); stack(32, 176, 36, 207);
  grate(2, 178.5, 8); grate(-16, 181, 8);
  addStatic('hut', -17, 189, -11, 194, { n: 3, flash: 0, name: 'P3' });
  addStatic('hut', 10, 197, 16, 202, { n: 2, flash: 1, name: 'P4' });
  parking(9, 181, 23, 194, 3);
  pjeep(14, 187, { star: true }); pjeep(10, 182);
  cont(22, 196, 31, 200); cont(-4, 184, 4, 188);
  stack(5, 185, 9, 194); stack(0, 188, 4, 192); stack(-9, 184, -5, 190); stack(23, 181, 32, 188);

  // ---------- F 三排长仓库之间的之字通道（y 207–244） ----------
  stack(-36, 203, -31, 222);
  wh(-22, 207, 32, 214, 3.4);                    // 仓库 A（南）
  wh(32, 207, 36, 244, 3.4);                     // 东墙
  wh(-36, 222, 26, 229, 3.4);                    // 仓库 B（中）：东端留口
  wh(-36, 229, -31, 237, 3.4);
  wh(-36, 237, -22, 244, 3.4);
  wh(-13, 237, 32, 244, 3.4);                    // 仓库 C（北）：西端留口
  for (const y of [205, 209, 213]) arrow(-26.5, y, 0, y === 209 ? 0xe8a020 : undefined);
  arrow(-18, 218.6, Math.PI / 2); arrow(20, 218.6, Math.PI / 2); arrow(29, 225, 0);
  arrow(20, 233.6, -Math.PI / 2); arrow(-8, 233.6, -Math.PI / 2); arrow(-17.5, 240, 0);

  // ---------- G 停机坪（y 244–267） ----------
  cont(-22, 249, -13, 253); cont(-18, 253, -9, 257);
  stack(-36, 244, -31, 267); stack(-31, 249, -27, 266); stack(-27, 258, -23, 266);
  stack(31, 244, 36, 267); stack(27, 262, 31, 266);
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; props.push({ kind: 'padlight', x: PAD.x + Math.sin(a) * 6.2, y: PAD.y + Math.cos(a) * 6.2, c: k % 2 }); }
  const GATE2 = addStatic('gate', 1, 267, 7, 269, { name: '第二道闸门' });
  wallRow(267, 1, 7);
  arrow(3.2, 264.5, 0); arrow(4.8, 264.5, 0);

  // ---------- H 四炮台院子（y 269–297） ----------
  cont(-31, 279, -22, 283);
  grate(-2, 277.5, 8); grate(12, 277.5, 8);
  stack(-36, 269, -31, 297); stack(-31, 284, -27, 296); stack(31, 269, 36, 297); stack(27, 277, 31, 292);
  for (const y of [275, 279]) { arrow(-17, y, 0.5, y === 275 ? undefined : 0xe8a020); arrow(21, y, -0.5, y === 275 ? undefined : 0xe8a020); }
  const GATE3 = addStatic('gate', -17, 297, -11, 299, { name: '第三道闸门' });
  wallRow(297, -17, -11);
  arrow(-14.8, 294.5, 0); arrow(-13.2, 294.5, 0);

  // ---------- I 码头（y 299–334） ----------
  stack(-36, 299, -27, 334); stack(27, 299, 36, 306); stack(27, 322, 36, 334);
  wh(19, 306, 36, 322);
  parking(-18, 301, 14, 308, 6);
  const BARRICADE = addStatic('barricade', -27, 310, 19, 312);
  props.push({ kind: 'crane', x: -32, y: 318 });

  // ---------- 敌人与道具 ----------
  // A
  S('soldier', -12, 14); S('soldier', 20, 17, { patrol: [-4, 0] }); S('soldier', -22, 17); S('soldier', 2, 12, { patrol: [5, 0] });
  S('soldier', 4.5, 19.5, { hold: true }); S('soldier', 13.5, 19.5, { hold: true });
  // B
  S('ejeep', 10.5, 30.5);
  S('soldier', -14, 30); S('soldier', 0, 41, { patrol: [6, 0] }); S('soldier', 19, 42); S('officer', -12, 50);
  turret(-16, 55.5); turret(20, 55.5); turret(2, 61.5);
  S('soldier', -20, 66, { patrol: [0, 5] }); S('soldier', 20.5, 75, { hold: true }); S('soldier', -20, 75, { hold: true });
  S('boat', 0, 74.5, { range: [-14, 15] });
  turret(2, 84.5);
  S('soldier', -10, 84); S('soldier', 17, 87);
  // C
  S('tank', -15, 92, { patrol: [[-15, 92], [-20, 104]] });
  S('soldier', 5, 100); S('soldier', 22, 106); S('soldier', -20, 113); S('soldier', 9, 117, { patrol: [0, 5] }); S('officer', 4, 96);
  turret(-17, 99); turret(16, 113.5); turret(8, 128);
  S('soldier', -11, 130, { hold: true }); S('soldier', 3, 130, { hold: true });
  // D 栈桥：西桥步兵把守，东桥一辆坦克堵路；两侧海面炮艇夹击
  S('soldier', -11, 143); S('soldier', -11, 156, { hold: true }); S('officer', -11, 169, { hold: true });
  S('soldier', 3, 144); S('tank', 3, 160, { paint: 'brown' }); S('soldier', 3, 172, { hold: true });
  S('boat', 16, 142, { range: [9, 33] }); S('boat', 26, 163, { range: [9, 33], dir: -1 });
  S('boat', -24, 151, { range: [-34, -17] }); S('boat', -30, 170, { range: [-34, -17], dir: -1 });
  // E
  S('officer', 0, 180.5); S('soldier', -20, 186); S('soldier', -12, 199); S('soldier', 6, 201); S('soldier', 27, 192); S('soldier', 19, 204);
  S('tank', -20, 197, { patrol: [[-20, 197], [5, 196.5]] });
  turret(-7, 202);
  S('star', 15, 188.5, { hidden: true, item: 'up' });
  // F
  S('soldier', -26.5, 209, { hold: true });
  for (const x of [-2, 7, 16]) { S('cannon', x, 215.5); S('cannon', x, 230.5); S('cannon', x, 245.5); }
  S('soldier', -10, 219.5); S('soldier', 11, 220); S('soldier', 24, 219.5); S('soldier', 29, 226, { hold: true });
  S('bulltank', -6, 234.5);
  S('soldier', 12, 234.5); S('soldier', -26, 234, { hold: true }); S('soldier', -17.5, 241, { hold: true });
  // G
  turret(2, 252.5); turret(2, 260);
  S('officer', 10, 263); S('soldier', -6, 251); S('soldier', 24, 250); S('soldier', -14, 262); S('soldier', 25, 259);
  S('tank', -22, 262, { patrol: [[-22, 262], [-6, 264]] });
  S('soldier', 0, 265.5, { hold: true }); S('soldier', 8, 265.5, { hold: true });
  // H
  turret(-2, 289); turret(11, 289); turret(-7, 285); turret(16, 285);
  S('star', 4.5, 285.5, { hidden: true, item: 'bomb' });
  S('soldier', -20, 275); S('soldier', 22, 274); S('soldier', -22, 291); S('soldier', 22, 294); S('officer', 4, 279);
  S('soldier', -18, 295.5, { hold: true }); S('soldier', -10, 295.5, { hold: true });
  // I
  S('ejeep', -12, 304.5); S('ejeep', 3, 304.5, { cw: true });
  S('soldier', 10, 303); S('soldier', -22, 306);

  const checkpoints = [
    { ty: -1, x: 0, y: 5, name: '货场' },
    { ty: 24, x: 9, y: 25, name: '停车场', needGone: GATE1 },
    { ty: 66, x: -12, y: 66.5, name: '船坞' },
    { ty: 95, x: -22, y: 96, name: '仓库货场' },
    { ty: 133, x: -11, y: 134, name: '栈桥' },
    { ty: 178, x: -4, y: 179.5, name: '俘虏棚货场' },
    { ty: 208, x: -26.5, y: 211, name: '仓库通道' },
    { ty: 223, x: 29, y: 224, name: '通道东口' },
    { ty: 238, x: -17.5, y: 239, name: '通道西口' },
    { ty: 248.5, x: -8, y: 249.5, name: '停机坪' },
    { ty: 270, x: 4, y: 271, name: '炮台院', needGone: GATE2 },
    { ty: 300, x: -14, y: 300.5, name: '码头', needGone: GATE3 }
  ];

  return {
    n: 3, code: 'Charlie', title: '港口', sub: '码头尽头停着一艘战舰', music: 'harbor',
    sky: 0xbfdde8, hemiGround: 0x8f9296, outerGround: 0xb4b6b3, bedColor: 0x1f5f8f, waterColor: 0x2a78b4,
    palette: { [T.CONCRETE]: 0xbcbfbe, [T.PAD]: 0x8f9498 },
    flatGround: true, quay: true,
    hutStyle: 'tent', gateStyle: 'orange', wallStyle: 'fence',
    intro: 'drive',
    start: { x: 0, y: 5, dir: 0, introFrom: { x: 0, y: -6 } },
    pad: PAD,
    boss: {
      type: 'battleship', name: 'BOSS：战舰', sub: '打掉甲板上的 6 座炮塔；手雷要贴近码头边才够得着', trigger: 313.5, cx: 0, cy: 327, lockY: false,
      x0: -27, x1: 27, y0: 311, y1: 334, respawn: { x: 0, y: 315 }, heliFrom: 300,
      // 战舰横停在码头外，船头朝东；guns 是 6 座炮塔相对船身中心的位置（原作：两端各 1 座，中部 2×2）
      ship: { x: -2, y: 341, from: 46 },
      guns: [[-15.5, 0], [-5.5, 2.5], [1.5, 2.5], [-5.5, -2.5], [1.5, -2.5], [10.5, 0]]
    },
    checkpoints, gate: GATE1, barricade: BARRICADE,
    water: [{ x: -111, y: 248, w: 178, h: 504 }, { x: 69, y: 154, w: 182, h: 48 }, { x: 0.5, y: 74.5, w: 37, h: 11 }, { x: 69, y: 416, w: 182, h: 168 }],
    beds: [[-160, -36, 36, 480, -1.9], [36, 160, 130, 178, -1.9], [-36, 36, 352, 480, -1.9], [36, 160, 334, 480, -1.9]],
    outer: [[-160, -36, -80, 36], [36, 160, -80, 130], [36, 160, 178, 334], [-36, 36, -80, 0]]
  };
}
