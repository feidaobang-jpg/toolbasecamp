// 低模几何合批：把许多带颜色的方块/圆柱/屋顶拼成一个顶点色网格
import * as THREE from '../vendor/three.module.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _v = new THREE.Vector3();

const UNIT = {};
function unit(key, make) {
  if (!UNIT[key]) {
    const g = make();
    UNIT[key] = g.index ? g.toNonIndexed() : g;
  }
  return UNIT[key];
}
const BOX = () => unit('box', () => new THREE.BoxGeometry(1, 1, 1));
const CYL = (seg, ratio) => unit('cyl' + seg + '_' + ratio, () => new THREE.CylinderGeometry(0.5 * ratio, 0.5, 1, seg, 1));
const BALL = (detail) => unit('ball' + detail, () => new THREE.IcosahedronGeometry(0.5, detail));
const ROOF = () => unit('roof', () => {
  // 山墙屋顶：屋脊沿 X，底宽沿 Z，高 1（-0.5~0.5）
  const A1 = [-0.5, -0.5, -0.5], B1 = [-0.5, -0.5, 0.5], T1 = [-0.5, 0.5, 0];
  const A2 = [0.5, -0.5, -0.5], B2 = [0.5, -0.5, 0.5], T2 = [0.5, 0.5, 0];
  const tris = [B1, B2, T2, B1, T2, T1, A2, A1, T1, A2, T1, T2, A1, B1, T1, B2, A2, T2, A1, A2, B2, A1, B2, B1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  return g;
});

export class Geo {
  constructor() { this.p = []; this.c = []; }

  _add(src, x, y, z, sx, sy, sz, color, rx, ry, rz, shade) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    const a = src.attributes.position.array;
    _c.set(color);
    const p = this.p, c = this.c;
    for (let i = 0; i < a.length; i += 3) {
      _v.set(a[i], a[i + 1], a[i + 2]);
      const k = 1 - shade * (0.5 - _v.y);
      _v.applyMatrix4(_m);
      p.push(_v.x, _v.y, _v.z);
      c.push(_c.r * k, _c.g * k, _c.b * k);
    }
    return this;
  }
  // 方块：中心 (x,y,z)，尺寸 w/h/d
  box(w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0, shade = 0.22) {
    return this._add(BOX(), x, y, z, w, h, d, color, rx, ry, rz, shade);
  }
  // 圆柱/圆台：r 为底半径，ratio 为顶/底半径比（0 即圆锥）
  cyl(r, h, x, y, z, color, seg = 8, ratio = 1, rx = 0, ry = 0, rz = 0, shade = 0.22) {
    return this._add(CYL(seg, ratio), x, y, z, r * 2, h, r * 2, color, rx, ry, rz, shade);
  }
  ball(r, x, y, z, color, detail = 0, sy = 1, shade = 0.3) {
    return this._add(BALL(detail), x, y, z, r * 2, r * 2 * sy, r * 2, color, 0, 0, 0, shade);
  }
  // 山墙屋顶：屋脊沿 X（ry 可转向），len 屋脊长，w 进深，h 屋顶高，(x,y,z) 为屋顶中心
  roof(len, h, w, x, y, z, color, ry = 0, shade = 0.3) {
    return this._add(ROOF(), x, y, z, len, h, w, color, 0, ry, 0, shade);
  }

  build(material, opts = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    if (opts.uv) worldUV(g, opts.uv);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    return mesh;
  }
}

// 按世界坐标做三向平铺 UV（墙砖、瓦片、地面用）
function worldUV(g, scale) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array;
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
    const nx = Math.abs(nor[i]), ny = Math.abs(nor[i + 1]), nz = Math.abs(nor[i + 2]);
    if (ny >= nx && ny >= nz) { uv[j] = pos[i] / scale; uv[j + 1] = pos[i + 2] / scale; }
    else if (nx >= nz) { uv[j] = pos[i + 2] / scale; uv[j + 1] = pos[i + 1] / scale; }
    else { uv[j] = pos[i] / scale; uv[j + 1] = pos[i + 1] / scale; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ---------- 程序化贴图 ----------
function canvasTex(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noiseDots(ctx, s, n, colors, minR, maxR, alpha, rnd) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const r = minR + rnd() * (maxR - minR);
    ctx.fillRect(rnd() * s, rnd() * s, r, r);
  }
  ctx.globalAlpha = 1;
}
function lcg(seed) { let a = seed; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function makeTextures() {
  const brick = canvasTex(256, (ctx, s) => {
    const rnd = lcg(7);
    ctx.fillStyle = '#b9b9b4'; ctx.fillRect(0, 0, s, s);
    const bh = 32, bw = 64;
    for (let y = 0; y < s; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < s; x += bw) {
        const v = 196 + Math.floor(rnd() * 44);
        ctx.fillStyle = `rgb(${v},${v},${v - 6})`;
        ctx.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      }
    }
    noiseDots(ctx, s, 900, ['#8d8d86', '#ffffff', '#77776f'], 1, 4, 0.22, rnd);
  });
  const tile = canvasTex(128, (ctx, s) => {
    const rnd = lcg(11);
    ctx.fillStyle = '#d9d9d9'; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      const gr = ctx.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, '#7c7c7c'); gr.addColorStop(0.5, '#f2f2f2'); gr.addColorStop(1, '#8a8a8a');
      ctx.fillStyle = gr; ctx.fillRect(x, 0, 16, s);
    }
    ctx.fillStyle = 'rgba(40,40,40,.35)';
    for (let y = 0; y < s; y += 32) ctx.fillRect(0, y, s, 3);
    noiseDots(ctx, s, 300, ['#555', '#fff'], 1, 3, 0.18, rnd);
  });
  const ground = canvasTex(256, (ctx, s) => {
    const rnd = lcg(23);
    ctx.fillStyle = '#e6e2da'; ctx.fillRect(0, 0, s, s);
    noiseDots(ctx, s, 2600, ['#c9c2b4', '#f7f4ee', '#b7ae9c', '#d8d0c2'], 2, 9, 0.5, rnd);
    noiseDots(ctx, s, 500, ['#9c927f', '#ffffff'], 1, 3, 0.5, rnd);
  });
  return { brick, tile, ground };
}

export function gradientTexture(stops, h = 256) {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = h;
  const ctx = cv.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 4, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
