// 魂斗罗第一关「丛林」关卡数据。
// 地形：从 FC 原版地图（vgmaps.com，3328×224 像素，13 屏）逐列提取的草地平台高度；
// 敌人：FC 美版反汇编（github.com/vermiceli/nes-contra-us，bank2 level_1_enemy_screen_00~0c）的原始坐标与类型。
// 坐标换算：x = 像素/16，y = (224 - 像素y)/16，1 单位 = 16 像素。
const P = (px) => px / 16;
const Y = (py) => (224 - py) / 16;

export const LEN = P(3328);           // 关卡总长 208
export const WATER_Y = 0.85;          // 游泳水面高度（最低一层平台 y=1.5 下方）
export const WATER_END = P(1776);     // 此处以东没有水，落下即坠崖
export const PIT_Y = -1.5;            // 低于此高度判定坠崖
export const WALL_X = P(3232);        // Boss 防御墙正面

// [高度像素, x0 像素, x1 像素]
const LEDGE_RAW = [
  [72, 1376, 1888], [72, 2048, 2208], [72, 2496, 2560],
  [104, 32, 768], [104, 896, 1056], [104, 1184, 1440], [104, 1856, 2080], [104, 2240, 2304], [104, 2464, 2528], [104, 2592, 2656], [104, 3008, 3136],
  [136, 160, 256], [136, 416, 480], [136, 1600, 1824], [136, 2176, 2272], [136, 2336, 2400], [136, 2624, 2784], [136, 2944, 3008], [136, 3136, 3168],
  [152, 640, 736], [152, 1504, 1568], [152, 2112, 2144], [152, 2528, 2560], [152, 3040, 3136],
  [168, 256, 288], [168, 352, 384], [168, 1920, 1984], [168, 2016, 2080], [168, 2368, 2464], [168, 2848, 2912], [168, 3168, 3200],
  [200, 288, 352], [200, 608, 672], [200, 1408, 1504], [200, 1728, 1920], [200, 2336, 2368], [200, 2496, 2528], [200, 2720, 2816], [200, 3008, 3240]
];
export const LEDGES = LEDGE_RAW.map(([py, a, b], i) => ({ id: i, y: Y(py), x0: P(a), x1: P(b) }));
// 两座爆炸桥：每座 4 节，每节 2 单位（32 像素）
export const BRIDGES = [P(768), P(1056)].map((x0, i) => ({ id: i, x0, x1: x0 + 8, y: Y(104), sections: 4 }));

// 原版敌人表：屏号 N、x、y 字节 → 世界坐标中心 x = (N+1)*256 + x - 16，y = y字节 - 8（与地图上武器箱/炮台位置逐一核对吻合）
const E = (scr, xb, yb) => ({ x: P((scr + 1) * 256 + xb - 16), y: Y(yb - 8) });
export const ENEMIES = [
  // 第 0 屏
  { type: 'soldier', ...E(0, 0x10, 0x60), dir: -1 },
  { type: 'soldier', ...E(0, 0x40, 0x60), dir: -1 },
  { type: 'sniper', ...E(0, 0x50, 0xc0), mode: 0 },
  { type: 'pillbox', ...E(0, 0x60, 0xa0), item: 'M' },
  { type: 'soldier', ...E(0, 0x80, 0x60), dir: -1 },
  { type: 'capsule', ...E(0, 0xf0, 0x40), item: 'R' },
  // 第 1 屏
  { type: 'sniper', ...E(1, 0x90, 0xc0), mode: 0 },
  // 第 4 屏（两座桥之后）
  { type: 'rotgun', ...E(4, 0x00, 0xa0), shots: 1 },
  { type: 'sniper', ...E(4, 0x10, 0x60), mode: 0 },
  { type: 'sniper', ...E(4, 0x50, 0x61), mode: 1 },
  { type: 'capsule', ...E(4, 0x60, 0x40), item: 'S' },
  // 第 5 屏
  { type: 'sniper', ...E(5, 0x20, 0x41), mode: 1 },
  { type: 'pillbox', ...E(5, 0x40, 0xa2), item: 'F' },
  { type: 'rotgun', ...E(5, 0x80, 0x80), shots: 1 },
  // 第 6 屏
  { type: 'rotgun', ...E(6, 0x40, 0x80), shots: 1 },
  // 第 7 屏：地下升起的红色炮台
  { type: 'turret', ...E(7, 0x20, 0xa0) },
  { type: 'turret', ...E(7, 0xa0, 0x41) },
  // 第 8 屏
  { type: 'pillbox', ...E(8, 0x00, 0xc3), item: 'S' },
  { type: 'sniper', ...E(8, 0x50, 0x80), mode: 0 },
  // 第 9 屏：两枚飞行胶囊（R / L）
  { type: 'capsule', ...E(9, 0x10, 0x40), item: 'R' },
  { type: 'capsule', ...E(9, 0x10, 0xb4), item: 'L' },
  { type: 'turret', ...E(9, 0xe0, 0x81) },
  // 第 10 屏
  { type: 'rotgun', ...E(10, 0xc0, 0xc0), shots: 1 },
  // 第 11 屏：Boss 防御墙
  { type: 'rotgun', ...E(11, 0x40, 0xc3), shots: 3 },
  { type: 'bomb', ...E(11, 0xa8, 0x81) },
  { type: 'core', ...E(11, 0xb1, 0xb0) },
  { type: 'sniper', ...E(11, 0xb4, 0x52), mode: 2, boss: true },
  { type: 'bomb', ...E(11, 0xc0, 0x80) }
];
// 自动生成的奔跑士兵：每屏一档（原版 soldier_level_attributes_00：$80 常规、$40 半频、$ff 不生成；第一周目都不开枪）
export const SOLDIER_GEN = [1, 1, 1, 1, 1, 1, 1, 0.5, 0.5, 1, 0, 0, 0];

// 检查点（标准耐久在此补满；无限命复活不受影响——原作在当前屏幕从天而降）
export const CHECKPOINTS = [P(0), P(1184), P(1856), P(2496), P(3008)];

export function screenOf(x) { return Math.max(0, Math.min(12, Math.floor(x * 16 / 256))); }

// 查询 x 处、高度不超过 yTop 的最高落脚面（草地平台或未炸毁的桥节）
export function groundBelow(x, yTop, bridgeAlive, skipLedge) {
  let best = null;
  for (const L of LEDGES) {
    if (x < L.x0 || x > L.x1 || L.y > yTop + 1e-6 || L === skipLedge) continue;
    if (!best || L.y > best.y) best = L;
  }
  for (const B of BRIDGES) {
    if (x < B.x0 || x > B.x1 || B.y > yTop + 1e-6) continue;
    const s = Math.floor((x - B.x0) / 2);
    if (bridgeAlive && !bridgeAlive(B.id, s)) continue;
    const key = { id: 'b' + B.id + ':' + s, y: B.y, x0: B.x0 + s * 2, x1: B.x0 + s * 2 + 2, bridge: B.id, section: s };
    if (key.id === (skipLedge && skipLedge.id)) continue;
    if (!best || key.y > best.y) best = key;
  }
  return best;
}
export const inWaterX = (x) => x < WATER_END;
