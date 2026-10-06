// 第二关新增的原创 Q 版低模：敌方吉普、轰炸机、水中石像、Boss 石像、会倒的石柱。模型正面朝 -Z（= 北）。
// 第二关普通固定炮台与第一关同型，复用 models.js 的 makeCannon；本文件只放本关新增敌人，统一材质而不混淆身份。
import * as THREE from 'three';
import { part, merged, mesh, MAT, C, blob, cached, chibiHead } from './models.js';

// 敌方灰色吉普（副驾驶扔手雷）
export function makeEJeep() {
  const body = cached('ejeepBody', () => {
    const b = [];
    part(b, 'rbox', 0x8b9399, [0, 0.62, 0.05], [1.5, 0.5, 2.5]);
    part(b, 'rbox', 0xa4abb0, [0, 0.9, -0.72], [1.36, 0.24, 0.95]);
    part(b, 'box', C.dark, [0, 0.66, -1.24], [1.08, 0.34, 0.08]);
    for (const s of [-1, 1]) { part(b, 'sphere', C.yellow, [s * 0.48, 0.8, -1.26], [0.24, 0.24, 0.12]); part(b, 'rbox', 0x6a7278, [s * 0.76, 0.78, 0], [0.3, 0.16, 2.3]); }
    part(b, 'box', C.glass, [0, 1.0, -0.27], [1.22, 0.34, 0.03]);
    part(b, 'rbox', 0x6a7278, [0, 0.95, 0.88], [1.42, 0.24, 0.84]);
    part(b, 'rbox', C.enemy, [-0.34, 1.18, 0.12], [0.5, 0.42, 0.38]);
    chibiHead(b, -0.34, 1.62, 0.1, 0.9, 'helmet', C.helmetE);
    part(b, 'rbox', C.enemy, [0.3, 1.2, 0.8], [0.46, 0.42, 0.36]);
    chibiHead(b, 0.3, 1.64, 0.8, 0.86, 'helmet', C.helmetE);
    part(b, 'cyl', C.dark, [0.3, 1.5, 0.5], [0.22, 0.7, 0.22], [Math.PI / 2 - 0.5, 0, 0]);
    for (const [x, z] of [[-0.78, -0.82], [0.78, -0.82], [-0.78, 0.86], [0.78, 0.86]]) part(b, 'cyl', C.tire, [x, 0.4, z], [0.74, 0.36, 0.74], [0, 0, Math.PI / 2]);
    return merged(b);
  });
  const root = new THREE.Group();
  const bm = mesh(body); root.add(bm);
  root.add(blob(2.4, 3.2));
  return { root, body: bm };
}

// 轰炸机（棕色，高空掠过投弹）
export function makeBomber() {
  const g = cached('bomber', () => {
    const b = [];
    part(b, 'cyl', 0x9a7a52, [0, 0, 0], [1.1, 5.2, 1.1], [Math.PI / 2, 0, 0]);
    part(b, 'cone', 0x8a6a44, [0, 0, -3.1], [1.1, 1.2, 1.1], [-Math.PI / 2, 0, 0]);
    part(b, 'sphere', 0x9fe0f0, [0, 0.4, -1.8], [0.7, 0.5, 1.0]);
    part(b, 'box', 0x8a6a44, [0, 0, -0.2], [7.0, 0.16, 1.7]);
    part(b, 'box', 0x8a6a44, [0, 0.1, 2.3], [2.6, 0.12, 0.8]);
    part(b, 'box', 0x8a6a44, [0, 0.7, 2.4], [0.14, 1.2, 0.9]);
    for (const s of [-1, 1]) { part(b, 'cyl', 0x5a4a34, [s * 1.9, -0.2, -0.6], [0.5, 1.4, 0.5], [Math.PI / 2, 0, 0]); part(b, 'sphere', C.red, [s * 3.3, 0.02, -0.2], [0.4, 0.12, 0.6]); }
    return merged(b);
  });
  const root = new THREE.Group();
  const body = mesh(g); root.add(body);
  const shadow = blob(5, 5); root.add(shadow);
  return { root, body, shadow };
}

// 水中石像（蓝灰色半身像，按固定方向发射单发导弹）
export function makeWaterStatue() {
  const g = cached('wstatue', () => {
    const b = [];
    part(b, 'rbox', 0x5d7f9a, [0, 0.1, 0], [2.0, 1.2, 2.0]);
    part(b, 'rbox', 0x6f93ad, [0, 0.95, 0], [1.6, 0.5, 1.3]);
    part(b, 'sphere', 0x7ea4c0, [0, 1.6, 0.1], [1.7, 0.9, 1.1]);
    part(b, 'sphere', 0x8db3cf, [0, 2.5, 0], [1.0, 1.15, 1.0]);
    part(b, 'sphere', 0x6f93ad, [0, 2.95, 0.15], [1.05, 0.6, 1.0]);
    for (const s of [-1, 1]) part(b, 'sphere', 0x2b3d4c, [s * 0.2, 2.55, -0.45], [0.14, 0.1, 0.06]);
    part(b, 'box', 0x2b3d4c, [0, 2.2, -0.46], [0.36, 0.1, 0.06]);
    return merged(b);
  });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  body.add(mesh(g));
  return { root, body };
}

// Boss 石像：白色大型半身像，眼睛闪光后张嘴发射追踪导弹
export function makeBust() {
  const g = cached('bust', () => {
    const b = [], jaw = [], eyes = [];
    part(b, 'rbox', 0xb9b2a0, [0, 0.9, 0], [3.4, 1.8, 2.6]);
    part(b, 'box', 0x9c9584, [0, 1.85, 0], [3.6, 0.14, 2.8]);
    part(b, 'sphere', 0xe9e3d2, [0, 2.6, 0.2], [3.2, 1.4, 2.0]);
    part(b, 'sphere', 0xf2ecdd, [0, 3.9, 0], [1.9, 2.1, 1.8]);
    part(b, 'sphere', 0xdcd5c2, [0, 4.75, 0.2], [2.0, 1.0, 1.8]);
    part(b, 'box', 0xdcd5c2, [0, 4.0, -0.9], [0.3, 0.7, 0.3]);
    for (const s of [-1, 1]) { part(b, 'sphere', 0xe9e3d2, [s * 0.96, 3.9, 0], [0.36, 0.7, 0.5]); part(b, 'sphere', 0x8a8474, [s * 0.38, 4.2, -0.82], [0.42, 0.26, 0.2]); }
    part(jaw, 'rbox', 0xe9e3d2, [0, -0.15, -0.1], [1.1, 0.4, 0.6]);
    part(jaw, 'box', 0x3a2a24, [0, 0.08, -0.25], [0.8, 0.14, 0.3]);
    for (const s of [-1, 1]) part(eyes, 'sphere', 0xffffff, [s * 0.38, 0, 0], [0.3, 0.22, 0.12]);
    return { body: merged(b), jaw: merged(jaw), eyes: merged(eyes) };
  });
  const root = new THREE.Group();
  const body = mesh(g.body); root.add(body);
  const jaw = mesh(g.jaw); jaw.position.set(0, 3.35, -0.75); root.add(jaw);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2b2b2b });
  const eyes = new THREE.Mesh(g.eyes, eyeMat); eyes.position.set(0, 4.15, -0.92); root.add(eyes);
  root.add(blob(4, 3.4));
  return { root, body, jaw, eyes, eyeMat };
}

// 会倒下的石柱（以柱底为轴旋转）
export function makeFallPillar() {
  const g = cached('fallPillar', () => {
    const b = [];
    part(b, 'cyl', 0xdcc99c, [0, 1.6, 0], [0.9, 3.2, 0.9]);
    part(b, 'rbox', 0xc8b485, [0, 3.3, 0], [1.1, 0.3, 1.1]);
    for (let r = 0; r < 3; r++) part(b, 'box', 0xc4b083, [0, 0.6 + r * 0.9, -0.45], [0.06, 0.5, 0.02]);
    return merged(b);
  });
  const baseG = cached('fallPillarBase', () => { const b = []; part(b, 'rbox', 0xb9a679, [0, 0.16, 0], [1.2, 0.32, 1.2]); return merged(b); });
  const root = new THREE.Group();
  root.add(mesh(baseG));
  const pivot = new THREE.Group(); pivot.position.y = 0.3; root.add(pivot);
  pivot.add(mesh(g));
  root.add(blob(1.4, 1.4));
  return { root, pivot };
}
export { MAT };
