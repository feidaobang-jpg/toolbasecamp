// 第一关开局美术试改：只补原模型细节，不改配色、地形、碰撞或游戏随机数。
import { part, merged, mesh, cached, C } from './models.js';
import { TEST, params } from './core.js';
export const openingArtEnabled = !(TEST && params.get('art') === 'before');

export function refineOpeningJeep(obj, team) {
  const base = obj.body.children[0];
  base.geometry = cached('openingJeep-' + team, () => {
    const b = [base.geometry.clone()];
    // 格栅保留原来的黑底，用浅金属竖条提供近景结构。
    for (let i = -3; i <= 3; i++) part(b, 'box', 0x879b89, [i * .115, .65, -1.29], [.045, .24, .03]);
    for (const s of [-1, 1]) {
      part(b, 'rbox', C.oliveD, [s * .84, .43, .08], [.28, .1, .58]);
      part(b, 'box', 0xaebda0, [s * .78, .77, .25], [.045, .045, .30]);
      part(b, 'rbox', C.redD, [s * .59, .7, 1.31], [.18, .13, .08]);
      // 引擎盖锁扣、前保险杠牵引环与后部工具绑带。
      part(b, 'box', C.gray, [s * .69, .94, -.73], [.06, .15, .1]);
      part(b, 'torus', C.gray, [s * .52, .39, -1.43], [.23, .23, .23]);
      part(b, 'box', 0x455941, [s * .53, 1.081, .93], [.075, .025, .58]);
    }
    part(b, 'box', C.cream, [-.68, .86, .6], [.04, .055, .2]);
    return merged(b);
  });
  const wheel = obj.wheels[0];
  const geo = cached('openingJeepWheel', () => {
    const b = [wheel.geometry.clone()];
    for (let k = 0; k < 10; k++) {
      const a = k * Math.PI / 5;
      part(b, 'box', 0x42494a, [0, Math.cos(a) * .36, Math.sin(a) * .36], [.32, .055, .15], [a, 0, 0]);
    }
    for (const s of [-1, 1]) {
      part(b, 'cyl', C.oliveD, [s * .198, 0, 0], [.22, .028, .22], [0, 0, Math.PI / 2]);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2;
        part(b, 'box', C.grayL, [s * .217, Math.cos(a) * .105, Math.sin(a) * .105], [.02, .04, .04]);
      }
    }
    return merged(b);
  });
  // 合并到原轮胎，继续沿用真实车轮动画，不增加车轮绘制批次。
  obj.wheels.forEach(w => { w.geometry = geo; });
  base.name = 'opening-jeep-detail';
}

export function openingStaticDetail(s) {
  if (s.y > 57 || (s.kind !== 'hut' && s.kind !== 'gate')) return null;
  const w = s.x1 - s.x0, d = s.y1 - s.y0;
  const geo = cached('opening-' + s.kind + '-' + w + '-' + d, () => {
    const b = [];
    if (s.kind === 'hut') {
      // 低对比木板接缝与墙角五金，门窗所在正面不加横向遮挡。
      for (const side of [-1, 1]) {
        for (let z = -d / 2 + .4; z < d / 2; z += .55) part(b, 'box', 0x987047, [side * (w / 2 + .012), .95, z], [.028, 1.35, .035]);
        for (let x = -w / 2 + .35; x < w / 2; x += .6) part(b, 'box', 0x987047, [x, .95, side * (d / 2 + .015)], [.035, 1.35, .028]);
        for (const h of [.45, 1.45]) for (const x of [-w / 2 + .15, w / 2 - .15]) part(b, 'box', C.gray, [x, h, side * (d / 2 + .055)], [.12, .055, .025]);
      }
      // 接缝在窗后，补宽窗框保持俘虏屋辨识度。
      for (const x of [-w * .28, w * .28]) for (const h of [.77, 1.43]) part(b, 'box', C.woodD, [x, h, -d / 2 - .085], [.93, .08, .04]);
    } else {
      for (const side of [-1, 1]) for (const half of [-1, 1]) {
        part(b, 'box', 0x846346, [half * w / 4, 1.2, side * .34], [w / 2 - .35, .13, .06], [0, 0, half * .43]);
        for (const y of [.6, 1.8]) for (const x of [half * .35, half * (w / 2 - .35)]) part(b, 'box', C.grayL, [x, y, side * .37], [.085, .085, .04]);
      }
    }
    return merged(b);
  });
  const m = mesh(geo, null, false); m.name = 'opening-static-detail'; return m;
}

export function addOpeningWallDetail(root) {
  const b = [];
  // 仅给开局营地南墙加稀疏石缝，所有细节贴在已有墙体表面。
  for (const [lo, hi] of [[-29, -5], [5, 29]]) for (const z of [-54.98, -57.02]) {
    for (const y of [.58, 1.12]) part(b, 'box', 0xb1a586, [(lo + hi) / 2, y, z], [hi - lo, .035, .022]);
    for (let row = 0; row < 3; row++) for (let x = lo + .8 + (row % 2) * .5; x < hi - .3; x += 1.5) part(b, 'box', 0xb1a586, [x, .3 + row * .54, z], [.035, .48, .022]);
  }
  const m = mesh(merged(b), null, false); m.name = 'opening-wall-detail'; root.add(m);
}
