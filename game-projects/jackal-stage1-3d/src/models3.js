// 第三关（港口）新增的原创 Q 版低模：码头货箱、停着的敌方吉普、Boss 战舰与舰上炮塔。模型正面朝 -Z（= 北）。
// 固定炮台、步兵、坦克、炮艇、敌方吉普沿用前两关的同型模型，本文件只放本关新增的东西。
import * as THREE from 'three';
import { part, merged, mesh, MAT, C, blob, cached } from './models.js';

const PI = Math.PI;

// 码头货箱（2×2×1.9，橙色木箱带 X 形加强条；实例化后堆成围墙）
export function stackCrateGeo() {
  return cached('stackCrate', () => {
    const b = [], body = 0xd98a2e, rib = 0x9a5a1a;
    part(b, 'box', body, [0, 0.95, 0], [1.94, 1.9, 1.94]);
    for (const s of [-1, 1]) { part(b, 'box', rib, [s * 0.9, 1.92, 0], [0.14, 0.06, 1.94]); part(b, 'box', rib, [0, 1.92, s * 0.9], [1.94, 0.06, 0.14]); }
    part(b, 'box', rib, [0, 1.92, 0], [0.14, 0.06, 2.5], [0, PI / 4, 0]);
    part(b, 'box', rib, [0, 1.92, 0], [0.14, 0.06, 2.5], [0, -PI / 4, 0]);
    // 朝南的一面（镜头从南边看过来）
    part(b, 'box', rib, [0, 0.95, 0.98], [0.12, 2.4, 0.04], [0, 0, PI / 4]);
    part(b, 'box', rib, [0, 0.95, 0.98], [0.12, 2.4, 0.04], [0, 0, -PI / 4]);
    part(b, 'box', rib, [0, 1.82, 0.98], [1.94, 0.14, 0.04]);
    part(b, 'box', rib, [0, 0.08, 0.98], [1.94, 0.14, 0.04]);
    return merged(b);
  });
}

// 停车场里停着的敌方吉普（没有乘员；炸毁后可能露出藏着的星）
export function pjeepGeo() {
  return cached('pjeep', () => {
    const b = [];
    part(b, 'rbox', 0x8b9399, [0, 0.62, 0.05], [1.5, 0.5, 2.5]);
    part(b, 'rbox', 0xa4abb0, [0, 0.9, -0.72], [1.36, 0.24, 0.95]);
    part(b, 'box', C.dark, [0, 0.66, -1.24], [1.08, 0.34, 0.08]);
    for (const s of [-1, 1]) { part(b, 'sphere', C.yellow, [s * 0.48, 0.8, -1.26], [0.24, 0.24, 0.12]); part(b, 'rbox', 0x6a7278, [s * 0.76, 0.78, 0], [0.3, 0.16, 2.3]); }
    part(b, 'box', C.glass, [0, 1.0, -0.27], [1.22, 0.34, 0.03]);
    part(b, 'rbox', 0x6a7278, [0, 0.95, 0.88], [1.42, 0.24, 0.84]);
    part(b, 'rbox', 0x4d555b, [0, 1.1, 0.3], [1.3, 0.1, 0.9]);
    for (const [x, z] of [[-0.78, -0.82], [0.78, -0.82], [-0.78, 0.86], [0.78, 0.86]]) part(b, 'cyl', C.tire, [x, 0.4, z], [0.74, 0.36, 0.74], [0, 0, PI / 2]);
    return merged(b);
  });
}

// Boss 战舰：船身沿东西向（+X 是船头）。炮塔是独立实体，这里只有船体、甲板和舰桥。
// 尺寸：全长约 52（船身 44 + 船头 8），宽 9；甲板高 1.45。
export const SHIP_DECK = 1.45;
export function makeBattleship() {
  const g = cached('battleship', () => {
    const b = [], hull = 0x6b747a, hullD = 0x4d555b, deck = 0x9aa2a8, white = 0xe9ecec;
    // 船体与水线
    part(b, 'box', hull, [-1, 0.25, 0], [44, 2.3, 8.8]);
    part(b, 'box', 0x9b3b2f, [-1, -0.75, 0], [44.1, 0.5, 8.9]);
    part(b, 'rbox', hull, [-23.4, 0.25, 0], [2.4, 2.3, 8.0]);
    // 船头（原作船头是棕色的）
    part(b, 'cone4', 0x8a5a36, [25, 0.25, 0], [2.3, 8, 8.8], [0, 0, -PI / 2]);
    part(b, 'box', 0x7a4c2c, [21.2, 1.42, 0], [0.4, 0.14, 8.6]);
    // 甲板
    part(b, 'box', deck, [-1, 1.38, 0], [44, 0.14, 8.6]);
    for (const s of [-1, 1]) part(b, 'box', hullD, [-1, 1.62, s * 4.3], [44, 0.34, 0.16]);
    // 船尾停机甲板的白线
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) part(b, 'box', white, [-21.4 + k * 1.3, 1.46, s * 2.6], [0.8, 0.02, 0.2]);
    part(b, 'box', white, [-19.4, 1.46, 0], [4.6, 0.02, 0.16]);
    // 舰桥：中间一条窄的上层建筑（两侧要留给 2×2 的炮塔）
    part(b, 'rbox', 0xd5dadc, [-2, 2.25, 0], [13, 1.6, 2.0]);
    part(b, 'box', 0xc9583f, [-2, 3.06, 0], [13.1, 0.06, 0.5]);
    part(b, 'rbox', white, [-2, 3.75, 0], [5.4, 1.3, 1.8]);
    part(b, 'box', 0x2f3a40, [-2, 3.9, 0.92], [4.6, 0.36, 0.04]);
    part(b, 'box', 0x2f3a40, [-2, 3.9, -0.92], [4.6, 0.36, 0.04]);
    part(b, 'box', 0xb9c0c4, [-2, 4.44, 0], [5.6, 0.1, 2.0]);
    part(b, 'cyl', hullD, [-2, 5.6, 0], [0.26, 2.3, 0.26]);
    part(b, 'box', hullD, [-2, 6.2, 0], [0.14, 0.1, 2.4]);
    part(b, 'sphere', C.red, [-2, 6.85, 0], [0.34, 0.34, 0.34]);
    part(b, 'cyl', 0x4d555b, [-6.2, 3.9, 0], [1.3, 1.7, 1.3]);
    part(b, 'cyl', 0x2b2b2b, [-6.2, 4.8, 0], [1.34, 0.16, 1.34]);
    for (let k = 0; k < 6; k++) part(b, 'box', 0x2f3a40, [-7.4 + k * 2.1, 2.5, 1.02], [0.9, 0.4, 0.04]);
    // 船锚链与栏杆柱
    for (let x = -22; x <= 20; x += 3) for (const s of [-1, 1]) part(b, 'cyl6', hullD, [x, 1.85, s * 4.3], [0.1, 0.5, 0.1]);
    return merged(b);
  });
  const root = new THREE.Group();
  const body = mesh(g); body.receiveShadow = true; root.add(body);
  return { root, body };
}

// 舰上炮塔：圆顶 + 三联短炮管（一次打三发扇形炮弹）；顶灯在开火前闪烁预警
export function makeShipGun() {
  const g = cached('shipgun', () => {
    const base = [], tur = [], lamp = [];
    part(base, 'cyl', 0x4d555b, [0, 0.18, 0], [3.0, 0.36, 3.0]);
    part(base, 'cyl', 0x2f3a40, [0, 0.4, 0], [2.6, 0.12, 2.6]);
    part(tur, 'sphere', 0xaab2b7, [0, 0.62, 0], [2.4, 1.5, 2.4]);
    part(tur, 'box', 0x7d868c, [0, 0.72, -0.95], [1.5, 0.5, 0.5]);
    for (const a of [-0.3, 0, 0.3]) part(tur, 'cyl', 0x3b3f42, [Math.sin(a) * 1.5, 0.74, -Math.cos(a) * 1.5], [0.22, 1.5, 0.22], [PI / 2, 0, a]);
    part(lamp, 'sphere', 0xffffff, [0, 1.42, 0.15], [0.42, 0.3, 0.42]);
    return { base: merged(base), tur: merged(tur), lamp: merged(lamp) };
  });
  const root = new THREE.Group();
  root.add(mesh(g.base));
  const turret = new THREE.Group(); root.add(turret);
  turret.add(mesh(g.tur));
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x3b3f42 });
  turret.add(new THREE.Mesh(g.lamp, lampMat));
  root.add(blob(3.4, 3.4));
  return { root, turret, lampMat };
}
