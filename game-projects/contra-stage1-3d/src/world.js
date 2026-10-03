// 场景：夜空星点、远山、岩壁、草地平台、湖水、丛林树冠与树干、Boss 防御墙。
// 地形按 16 单位分块合批；镜头转到侧面时挡住主角的分块会自动淡化。
import * as THREE from 'three';
import { mergeGeometries } from 'three-utils';
import { fixedRng } from './core.js';
import * as L from './level.js';
import { PAL, mat, box, cyl, makeBossWall } from './models.js';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat, repeat);
  return t;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
// FC 风格金色岩石：深色底 + 圆润巨石 + 左上高光
function rockTexture() {
  const R = fixedRng(7);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = hex(PAL.rockD); g.fillRect(0, 0, w, h);
    const stones = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) stones.push([col * 44 + (row % 2) * 22 + R() * 6, row * 32 + 16 + R() * 4, 18 + R() * 4, 13 + R() * 3]);
    for (const [x, y, rx, ry] of stones) for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) {
      g.fillStyle = hex(PAL.rock); g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = hex(PAL.rockL); g.beginPath(); g.ellipse(x + dx - rx * 0.3, y + dy - ry * 0.35, rx * 0.45, ry * 0.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(64,44,0,0.55)'; g.beginPath(); g.ellipse(x + dx + rx * 0.35, y + dy + ry * 0.4, rx * 0.5, ry * 0.3, 0, 0, Math.PI * 2); g.fill();
    }
  });
}
function grassTexture() {
  const R = fixedRng(11);
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = hex(PAL.grass); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = R() < 0.55 ? hex(PAL.grassL) : '#006c00'; g.fillRect(R() * w, R() * h, 2 + R() * 3, 2 + R() * 4); }
  });
}
function waterTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = hex(PAL.water); g.fillRect(0, 0, w, h);
    g.fillStyle = hex(PAL.waterL);
    for (let y = 6; y < h; y += 16) for (let x = (y / 16 % 2) * 16; x < w; x += 32) g.fillRect(x, y, 14, 2);
    g.fillStyle = 'rgba(252,252,252,0.5)';
    for (let y = 14; y < h; y += 32) for (let x = 8; x < w; x += 64) g.fillRect(x, y, 6, 1);
  });
}
function trunkTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#0c0800'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = '#402c00'; g.fillRect(x + 1, 0, 3, h); g.fillStyle = '#5a3c08'; for (let y = 0; y < h; y += 4) g.fillRect(x + 1, y, 3, 1); }
  });
}
function frondTexture() {
  const R = fixedRng(23);
  return canvasTex(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = R() * w, y = 8 + R() * (h - 20), len = 18 + R() * 16, dir = R() < 0.5 ? -1 : 1;
      g.strokeStyle = R() < 0.5 ? hex(PAL.grassL) : hex(PAL.grass); g.lineWidth = 2;
      for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(x + dir * k * len / 7, y + k * 1.2); g.lineTo(x + dir * k * len / 7 + dir * 3, y + 8 + k * 1.5); g.stroke(); }
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + dir * len * 0.5, y - 4, x + dir * len, y + 8); g.stroke();
    }
  });
}

// 把（已变换到世界坐标的）几何体按法线方向生成世界尺度 UV，避免拉伸
function worldUV(geo, scale) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else if (nz >= nx) { u = p.getX(i); v = p.getY(i); }
    else { u = p.getZ(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
function boxAt(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 60, 220);
  const W = { chunks: [], update: null, bridgeSections: [] };

  // ---------- 光照：月夜，但保持 FC 的明快配色 ----------
  const hemi = new THREE.HemisphereLight(0xd8e4ff, 0x302010, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.35);
  sun.position.set(-14, 26, 22); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 14; sc.bottom = -10; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  W.sun = sun;
  W.followLight = (x, y) => { sun.position.set(x - 14, y + 26, 22); sun.target.position.set(x, y, 0); };

  const rockTex = rockTexture(), grassTex = grassTexture();
  const CH = 16, NCH = Math.ceil((L.LEN + 4) / CH);
  const parts = [];
  for (let i = 0; i < NCH; i++) parts.push({ rock: [], grass: [] });
  const chunkOf = (x) => Math.max(0, Math.min(NCH - 1, Math.floor(x / CH)));

  // 岩壁背景：逐列取该处最高平台，竖直岩壁放在游玩平面之后（z < -0.8），玩家在其前方坠落
  const tops = [];
  for (let c = 0; c < Math.ceil(L.LEN); c++) {
    const x = c + 0.5; let top = null;
    for (const Ld of L.LEDGES) if (x > Ld.x0 && x < Ld.x1 && (top === null || Ld.y > top)) top = Ld.y;
    tops.push(top);
  }
  for (let c = 0; c < tops.length;) {
    let e = c; while (e + 1 < tops.length && tops[e + 1] === tops[c]) e++;
    if (tops[c] !== null) {
      const x0 = c, x1 = e + 1, bottom = x0 < L.WATER_END ? -1.2 : -2.5;
      parts[chunkOf(x0)].rock.push(boxAt(x0, x1, bottom, tops[c] - 0.6, -4.6, -0.85));
    }
    c = e + 1;
  }
  // 草地平台：草皮 + 岩石唇边，伸出岩壁、横跨游玩平面
  for (const Ld of L.LEDGES) {
    parts[chunkOf((Ld.x0 + Ld.x1) / 2)].grass.push(boxAt(Ld.x0, Ld.x1, Ld.y - 0.32, Ld.y, -4.7, 1.35));
    parts[chunkOf((Ld.x0 + Ld.x1) / 2)].rock.push(boxAt(Ld.x0 + 0.06, Ld.x1 - 0.06, Ld.y - 0.95, Ld.y - 0.32, -4.6, 1.15));
  }
  for (let i = 0; i < NCH; i++) {
    const ch = { x0: i * CH, x1: (i + 1) * CH, meshes: [], box: new THREE.Box3(), fade: 1 };
    const add = (list, tex, color) => {
      if (!list.length) return;
      const g = worldUV(mergeGeometries(list, false), 0.5);
      const m = new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.9, flatShading: true, transparent: true, opacity: 1, depthWrite: true });
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = false;
      scene.add(mesh); ch.meshes.push(mesh);
      g.computeBoundingBox(); ch.box.union(g.boundingBox);
    };
    add(parts[i].rock, rockTex, 0xffffff);
    add(parts[i].grass, grassTex, 0xffffff);
    if (ch.meshes.length) W.chunks.push(ch);
  }

  // ---------- 湖水与崖底 ----------
  const waterTex = waterTexture(); waterTex.repeat.set(60, 60);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.35, metalness: 0.1, color: 0xffffff }));
  water.rotation.x = -Math.PI / 2; water.position.set(L.WATER_END - 130, L.WATER_Y - 0.12, 0); water.receiveShadow = true;
  scene.add(water); W.water = water;
  // 水岸白色浪花：沿每段临水岩壁 / 平台底边
  const foamGeos = [];
  for (let c = 0; c < tops.length; c++) if (tops[c] !== null && c < L.WATER_END) foamGeos.push(boxAt(c, c + 1, L.WATER_Y - 0.1, L.WATER_Y + 0.02, -0.9, -0.6));
  for (const Ld of L.LEDGES) if (Ld.y < 2 && Ld.x0 < L.WATER_END) foamGeos.push(boxAt(Ld.x0 - 0.2, Ld.x1 + 0.2, L.WATER_Y - 0.1, L.WATER_Y + 0.03, 1.1, 1.5));
  if (foamGeos.length) { const foam = new THREE.Mesh(mergeGeometries(foamGeos, false), mat(PAL.white, { emissive: 0x404040 })); scene.add(foam); }
  // 无水段（丛林）下方：幽暗林底
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.LEN - L.WATER_END + 140, 260), mat(0x05140a));
  floor.rotation.x = -Math.PI / 2; floor.position.set((L.WATER_END + L.LEN + 140) / 2, -9, 0); scene.add(floor);
  // 水与林底的接缝：一道岩石堤坝，转到任何角度都不穿帮
  scene.add(box(1.2, 10, 260, PAL.rockD, L.WATER_END + 0.6, -4.2, 0));

  // ---------- 丛林：树干墙 + 树冠（第 5 屏起） ----------
  const JX0 = 85, JX1 = L.WALL_X + 2;
  const trunkTex = trunkTexture(); trunkTex.repeat.set((JX1 - JX0) / 2, 11);
  const trunks = new THREE.Mesh(new THREE.BoxGeometry(JX1 - JX0, 22, 0.6), new THREE.MeshStandardMaterial({ map: trunkTex, roughness: 1 }));
  trunks.position.set((JX0 + JX1) / 2, 2, -7.2); scene.add(trunks);
  const frondTex = frondTexture();
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
  const R = fixedRng(31);
  const fronds = [];
  for (let x = JX0; x < JX1; x += 2.2) for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(4.4, 2.2);
    g.rotateY((R() - 0.5) * 0.6); g.translate(x + R() * 1.4, 12.6 + k * 0.7 + R() * 0.4, -6.4 + k * 1.3);
    fronds.push(g);
  }
  // 树冠底板（夜色中的浓密枝叶，从下方也看不穿）
  scene.add(box(JX1 - JX0, 1.6, 6, 0x00500a, (JX0 + JX1) / 2, 14.6, -4.2));
  scene.add(new THREE.Mesh(mergeGeometries(fronds, false), frondMat));

  // ---------- 前半段：平台后方的棕榈 ----------
  const palmGeos = { trunk: [], leaf: [] };
  for (let x = 2.5; x < 85; x += 2.6 + R() * 1.2) {
    let top = null; for (const Ld of L.LEDGES) if (x > Ld.x0 && x < Ld.x1 && Ld.y > 7) top = Ld.y;
    if (top === null) continue;
    const h = 1.6 + R() * 0.8, z = -3.3 - R() * 1.0;
    const t = new THREE.CylinderGeometry(0.1, 0.16, h, 6); t.translate(x, top + h / 2, z); palmGeos.trunk.push(t);
    for (let k = 0; k < 5; k++) {
      const g = new THREE.PlaneGeometry(1.8, 0.8); g.translate(0.9, 0, 0); g.rotateZ(-0.35); g.rotateY(k * Math.PI * 2 / 5 + R()); g.translate(x, top + h, z); palmGeos.leaf.push(g);
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(palmGeos.trunk, false), mat(0x5a3c08)));
  scene.add(new THREE.Mesh(mergeGeometries(palmGeos.leaf, false), frondMat));

  // ---------- 远山（白色雪峰，四周环绕，任何角度都有远景）+ 星空 ----------
  const mGeos = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + R() * 0.1;
    const cx = 100 + Math.cos(a) * (150 + R() * 30), cz = Math.sin(a) * (110 + R() * 30) - 20;
    const hh = 22 + R() * 18, rr = 12 + R() * 8;
    const g = new THREE.ConeGeometry(rr, hh, 5 + Math.floor(R() * 3)); g.translate(cx, -2 + hh / 2, cz); mGeos.push(g);
  }
  // 原作开场的近处雪峰（地图第 0~5 屏上方）
  for (let x = 6; x < 85; x += 7 + R() * 5) { const hh = 7 + R() * 3; const g = new THREE.ConeGeometry(3.4 + R(), hh, 6); g.translate(x, 6 + hh / 2, -30 - R() * 8); mGeos.push(g); }
  const mGeo = mergeGeometries(mGeos, false);
  const cols = new Float32Array(mGeo.attributes.position.count * 3);
  for (let i = 0; i < mGeo.attributes.position.count; i++) {
    const y = mGeo.attributes.position.getY(i), c = y > 10 ? 0.99 : y > 4 ? 0.74 : 0.42;
    cols[i * 3] = c; cols[i * 3 + 1] = c; cols[i * 3 + 2] = c * 1.02;
  }
  mGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(mGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })));
  const starPos = [];
  for (let i = 0; i < 900; i++) {
    const u = R() * Math.PI * 2, v = 0.05 + R() * 0.9, r = 280;
    starPos.push(100 + Math.cos(u) * Math.cos(v * 1.4) * r, Math.sin(v * 1.4) * r * 0.8 + 10, Math.sin(u) * Math.cos(v * 1.4) * r);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));

  // ---------- Boss 防御墙 ----------
  const boss = makeBossWall(); boss.root.position.set(L.WALL_X - 0.2, 0, 0); scene.add(boss.root);
  boss.root.traverse(o => { if (o.isMesh) { o.receiveShadow = true; } });
  W.boss = boss;

  // ---------- 遮挡淡化 ----------
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  W.updateOcclusion = (camPos, px, py, dt) => {
    const target = new THREE.Vector3(px, py + 1, 0);
    const dir = target.clone().sub(camPos); const dist = dir.length(); dir.normalize();
    ray.set(camPos, dir);
    for (const ch of W.chunks) {
      let block = false;
      if (ray.intersectBox(ch.box, hit)) {
        const d = hit.distanceTo(camPos);
        // 只有盒子与视线的交点在主角之前、且主角不在盒子上方才算遮挡
        block = d < dist - 1.2 && !(px > ch.box.min.x && px < ch.box.max.x && camPos.distanceTo(target) < 1);
      }
      const goal = block ? 0.22 : 1;
      ch.fade += (goal - ch.fade) * Math.min(1, dt * 8);
      for (const m of ch.meshes) { m.material.opacity = ch.fade; m.material.depthWrite = ch.fade > 0.95; }
    }
  };
  W.update = (t) => { waterTex.offset.x = (t * 0.05) % 1; };
  return W;
}
