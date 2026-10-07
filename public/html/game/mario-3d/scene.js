// 渲染：把当前区域的网格地形沿纵深铺成 6 格厚的体素跑道，水管纵向并排 3 根；
// 角色、道具、特效与镜头（C 预设 + Q/E 无极旋转），遮挡主角的物体做网点淡化。
import * as THREE from './three.js?v=2.1.0';
import { tex, textTexture } from './textures.js?v=2.4.4';
import * as M from './models.js?v=stage3-preview1';
import { LANE, SOLID, tileKey } from './levels.js?v=stage3-preview1';
import { heightOf } from './world.js?v=stage3-preview1';

export const PRESETS = [
  { id: 'side', name: '侧视', yaw: 0, pitch: 0.17, dist: 18, fov: 40, ahead: 2.4 },
  { id: 'oblique', name: '斜视', yaw: -0.62, pitch: 0.42, dist: 15.5, fov: 42, ahead: 3.2 },
  { id: 'front', name: '正视', yaw: -Math.PI / 2, pitch: 0.2, dist: 9, fov: 60, ahead: 3 },  // 在玛丽身后肩上，看向关卡前进方向
  { id: 'fp', name: '第一人称', yaw: -Math.PI / 2, pitch: -0.05, dist: 0, fov: 75, ahead: 0, fp: true },   // 正视再按 C：玛丽的眼睛
  { id: 'top', name: '俯视', yaw: 0, pitch: 1.48, dist: 23, fov: 42, ahead: 2.4 }
];
const FRONT = PRESETS.find(p => p.id === 'front');
const ZS = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];       // 每格方块沿纵深 6 块
const PIPE_Z = [-2, 0, 2];                          // 每根水管沿纵深 3 根

// ---------- 遮挡淡化（网点透明，不需要排序） ----------
// 另有两条：镜头贴近的方块网点溶解（防止镜头贴着台阶 / 钻进天花板时满屏大色块）；
// 地下关镜头升到天花板以上而玛丽在下面时，把天花板高度以上的地形整层切掉（剖面视图）。
// 镜头在关卡两端墙外（正视从身后看、或 Q/E 转到背面）时，同样把墙切掉。
const FADE = { cam: { value: new THREE.Vector3() }, player: { value: new THREE.Vector3() }, feet: { value: 0 }, on: { value: 1 }, cut: { value: 1e5 }, cutX: { value: new THREE.Vector2(-1e5, 1e5) } };
function fadeable(material) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uFadeCam = FADE.cam; sh.uniforms.uFadePlayer = FADE.player; sh.uniforms.uFadeFeet = FADE.feet; sh.uniforms.uFadeOn = FADE.on; sh.uniforms.uFadeCut = FADE.cut; sh.uniforms.uFadeCutX = FADE.cutX;
    sh.vertexShader = 'varying vec3 vFadeW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fadeW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fadeW = instanceMatrix * fadeW;
      #endif
      vFadeW = (modelMatrix * fadeW).xyz;`);
    sh.fragmentShader = 'varying vec3 vFadeW;\nuniform vec3 uFadeCam;\nuniform vec3 uFadePlayer;\nuniform float uFadeFeet;\nuniform float uFadeOn;\nuniform float uFadeCut;\nuniform vec2 uFadeCutX;\n' +
      sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if (uFadeOn > 0.5) {
        if (vFadeW.y > uFadeCut || vFadeW.x < uFadeCutX.x || vFadeW.x > uFadeCutX.y) discard;
        vec3 rel = vFadeW - uFadeCam;
        float a = 1.0 - smoothstep(0.5, 1.3, length(rel));
        if (vFadeW.y > uFadeFeet + 0.25) {
          vec3 seg = uFadePlayer - uFadeCam; float L = length(seg); vec3 d = seg / max(L, 0.001);
          float t = dot(rel, d);
          if (t > 0.5 && t < L - 0.6) a = max(a, (1.0 - smoothstep(0.85, 2.0, length(rel - d * t))) * 0.86);
        }
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (n < a) discard;
      }`);
  };
  material.customProgramCacheKey = () => 'tbfade';
  return material;
}
fadeable(M.coinMat);                                // 金币贴着镜头时也溶解
const matCache = new Map();
function tileMat(name, theme) {
  const k = name + ':' + theme;
  if (!matCache.has(k)) {
    const opts = { map: tex(name, theme), roughness: 0.92, flatShading: true };
    if (name === 'question') { opts.emissive = new THREE.Color('#5a2a00'); opts.emissiveIntensity = 0.08; }
    matCache.set(k, fadeable(new THREE.MeshStandardMaterial(opts)));
  }
  return matCache.get(k);
}
function plainMat(color, opts = {}) {
  const k = 'plain:' + color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, fadeable(new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.92, flatShading: true }, opts))));
  return matCache.get(k);
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const pipeBodyGeo = new THREE.CylinderGeometry(0.86, 0.86, 1, 32, 1, true);
// 圆润管沿保留真实内壁，避免实心顶盖和黑色圆片贴在同一平面。
const pipeRimGeo = new THREE.LatheGeometry([
  [0.86, -0.25], [0.94, -0.25], [0.985, -0.205], [0.99, -0.16],
  [0.99, 0.16], [0.985, 0.205], [0.94, 0.25], [0.82, 0.25],
  [0.78, 0.21], [0.78, -0.25]
].map(([x, y]) => new THREE.Vector2(x, y)), 32);
const pipeHoleGeo = new THREE.CircleGeometry(0.78, 32);
const ballGeo = new THREE.IcosahedronGeometry(1, 1);
const debrisGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), ZERO = new THREE.Vector3(0, 0, 0);

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 260);
  const hemi = new THREE.HemisphereLight('#e6f4ff', '#6c5a3a', 1.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4dc', 2.5);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 15, bottom: -15, near: 1, far: 90 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const lamp = new THREE.PointLight('#ffd9a8', 0, 10, 1.6); scene.add(lamp);

  const player = M.mario(); scene.add(player.root);
  const view = {
    subjectHeading: () => player.root.rotation.y,
    renderer, scene, camera, presetIndex: 0, yawOffset: 0, quality: 'high',
    followX: 0, followY: 4, area: null, theme: 'overworld', shake: 0,
    camLift: 0, camPull: 0, titleMode: false, wallL: null, wallR: null
  };
  let areaGroup = null, areaDispose = [];
  let tileRecs = new Map(), meshes = {}, animRecs = new Set();
  let coinInst = null, coinRecs = [], liftGroups = [], flagMesh = null, castleFlag = null;
  const enemyModels = new Map(), itemModels = new Map(), fireModels = new Map(), piranhaModels = new Map();
  const effects = [];
  const fx = new THREE.Group(); scene.add(fx);

  // ---------- 区域构建 ----------
  function clearArea() {
    if (areaGroup) scene.remove(areaGroup);
    for (const d of areaDispose) d.dispose();
    areaDispose = []; tileRecs = new Map(); meshes = {}; animRecs = new Set();
    for (const map of [enemyModels, itemModels, fireModels]) { for (const m of map.values()) scene.remove(m); map.clear(); }
    // 每根管对应一组三个模型，必须逐个移除；把数组传给 remove 会留下旧食人花。
    for (const models of piranhaModels.values()) scene.remove(...models);
    piranhaModels.clear();
    for (const e of effects) fx.remove(e.obj); effects.length = 0;
    coinInst = null; coinRecs = []; liftGroups = []; flagMesh = null; castleFlag = null;
  }

  function setSlot(mesh, idx, x, y, z, s) {
    if (idx < 0) return;
    tmpS.set(s, s, s); tmpP.set(x, y, z);
    tmpM.compose(tmpP, tmpQ.identity(), tmpS);
    mesh.setMatrixAt(idx, tmpM);
  }

  function buildArea(w) {
    clearArea();
    const a = w.area, theme = a.theme;
    view.area = a; view.theme = theme;
    // 两端高墙（地下关左墙、右墙或出口竖管）：x 方向切墙用
    const tall = c => { const t = a.tiles.get(tileKey(c, 4)); return !!t && SOLID.has(t.t); };
    view.wallL = tall(0) ? 1 : null;
    let r = a.width - 1;
    if (tall(r)) { while (r > 0 && tall(r - 1)) r--; view.wallR = r; } else view.wallR = null;
    areaGroup = new THREE.Group(); scene.add(areaGroup);
    const under = theme === 'underground';
    scene.background = new THREE.Color(under ? '#182c31' : '#c7ddd2');
    scene.fog = under ? new THREE.Fog('#182c31', 26, 70) : new THREE.Fog('#c7ddd2', 70, 200);
    hemi.color.set(under ? '#a8c8ff' : '#eef8ff'); hemi.groundColor.set(under ? '#1c2430' : '#6c5a3a');
    hemi.intensity = under ? 1.45 : 1.9;
    sun.intensity = under ? 1.7 : 2.5; sun.color.set(under ? '#d8e6ff' : '#fff4dc');
    lamp.intensity = under && view.quality !== 'low' ? 7 : 0;

    // 统计各类方块
    const counts = { ground: 0, hard: 0, brick: 0, question: 0, used: 0 };
    const dyn = [];
    for (const t of a.tiles.values()) {
      if (t.t === 'G') counts.ground++;
      else if (t.t === 'S' || t.t === 'F') counts.hard++;
      else if (t.t === 'B' || t.t === 'Q' || t.t === 'U') {
        const rec = { tile: t, brick: -1, question: -1, used: -1 };
        if (t.t === 'B') rec.brick = counts.brick++;
        if (t.t === 'Q') rec.question = counts.question++;
        if (t.t === 'U' || t.t === 'Q' || t.content) rec.used = counts.used++;
        dyn.push(rec);
      }
    }
    const mk = (name, n) => {
      if (!n) return null;
      const m = new THREE.InstancedMesh(boxGeo, tileMat(name, name === 'question' ? 'overworld' : theme), n * 6);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      areaGroup.add(m); areaDispose.push({ dispose: () => m.dispose() });
      return m;
    };
    meshes.ground = mk('ground', counts.ground); meshes.hard = mk('hard', counts.hard);
    meshes.brick = mk('brick', counts.brick); meshes.question = mk('question', counts.question); meshes.used = mk('used', counts.used);
    let gi = 0, hi = 0;
    for (const t of a.tiles.values()) {
      const target = t.t === 'G' ? meshes.ground : (t.t === 'S' || t.t === 'F') ? meshes.hard : null;
      if (!target) continue;
      const base = (t.t === 'G' ? gi++ : hi++) * 6;
      ZS.forEach((z, i) => setSlot(target, base + i, t.c + 0.5, t.h + 0.5, z, 1));
    }
    for (const rec of dyn) { tileRecs.set(rec.tile, rec); refreshTile(rec); }
    for (const m of Object.values(meshes)) if (m) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }

    buildPipes(a);
    buildTrees(a);
    buildLifts(a);
    buildCoins(w);
    if (a.flag) buildFlag(a.flag);
    if (a.entryCastle) buildCastle(a.entryCastle);
    if (a.castle) buildCastle(a.castle);
    for (const s of a.signs) {
      const { texture, aspect } = textTexture(s.text, { color: '#fcfcfc', size: 56 });
      const h = s.text.length > 3 ? 0.9 : 1.1;
      const mm = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mm);
      pl.position.set(s.x, s.y, -2.4); areaGroup.add(pl);
      areaDispose.push(pl.geometry, mm, texture);
    }
    if (under) buildUnderground(a); else buildOverworld(a);
  }

  function refreshTile(rec, bump = 0) {
    const t = rec.tile, x = t.c + 0.5, y = t.h + 0.5 + bump;
    const state = t.broken ? 'none' : t.t === 'B' ? 'brick' : t.t === 'Q' ? (t.hidden ? 'none' : 'question') : t.t === 'U' ? 'used' : 'none';
    for (const kind of ['brick', 'question', 'used']) {
      const idx = rec[kind];
      if (idx < 0 || !meshes[kind]) continue;
      const on = state === kind;
      ZS.forEach((z, i) => setSlot(meshes[kind], idx * 6 + i, x, y, z, on ? 1 : 0));
      meshes[kind].instanceMatrix.needsUpdate = true;
    }
  }

  function buildPipes(a) {
    const pm = matCache.get('pipe') || (() => { const m = fadeable(new THREE.MeshStandardMaterial({ map: tex('pipe'), roughness: 0.85, emissive: '#195421', emissiveIntensity: 0.12, side: THREE.DoubleSide })); matCache.set('pipe', m); return m; })();
    const rimM = matCache.get('pipeRim') || (() => { const m = fadeable(new THREE.MeshStandardMaterial({ color: '#56bc60', roughness: 0.85, emissive: '#195421', emissiveIntensity: 0.12, side: THREE.DoubleSide })); matCache.set('pipeRim', m); return m; })();
    const hole = matCache.get('pipeHole') || (() => { const m = new THREE.MeshBasicMaterial({ color: '#173d20' }); matCache.set('pipeHole', m); return m; })();
    const add = (geo, m, x, y, z, sy = 1, rotZ = 0, rotX = 0) => {
      const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.y = sy; o.rotation.z = rotZ; o.rotation.x = rotX;
      o.castShadow = true; o.receiveShadow = true; areaGroup.add(o); return o;
    };
    for (const p of a.pipes) {
      for (const z of PIPE_Z) {
        const bodyH = p.h - 0.5;
        if (bodyH > 0) add(pipeBodyGeo, pm, p.x + 1, bodyH / 2, z, bodyH);
        add(pipeRimGeo, rimM, p.x + 1, p.h - 0.25, z);
        add(pipeHoleGeo, hole, p.x + 1, p.h - 0.18, z, 1, 0, -Math.PI / 2);
      }
    }
    for (const s of a.sidePipes) {
      const cy = s.y + 1;
      for (const z of PIPE_Z) {
        add(pipeBodyGeo, pm, s.x + 1.25, cy, z, 1.5, Math.PI / 2);
        add(pipeRimGeo, rimM, s.x + 0.25, cy, z, 1, Math.PI / 2);
        const h = add(pipeHoleGeo, hole, s.x + 0.18, cy, z); h.rotation.y = -Math.PI / 2;
        const vh = s.upTo + 1 - s.y;
        add(pipeBodyGeo, pm, s.x + 3, s.y + vh / 2, z, vh);
      }
    }
  }

  // 原作树冠的平坦落脚面沿跑道铺满，圆润叶簇和谷底树干沿用自然色哑光低模。
  // 树干放在跑道后侧，玩家从树冠下方跳起时不会穿过实体模型。
  function buildTrees(a) {
    if (!a.trees.length) return;
    const trunkGeo=new THREE.CylinderGeometry(.7,1,1,8);
    const bark=plainMat('#7d6a50'), leaf=plainMat('#79a457'), leafDark=plainMat('#608846');
    const caps=new THREE.InstancedMesh(boxGeo,[leafDark,leafDark,leaf,leafDark,leafDark,leafDark],a.trees.length);
    const trunks=new THREE.InstancedMesh(trunkGeo,bark,a.trees.length);
    const branches=new THREE.InstancedMesh(trunkGeo,bark,a.trees.length*2);
    const blobs=[];
    const up=new THREE.Vector3(0,1,0), direction=new THREE.Vector3(), midpoint=new THREE.Vector3();
    a.trees.forEach((t,i)=>{
      tmpM.compose(tmpP.set(t.x+t.w/2,t.y-.3,0),tmpQ.identity(),tmpS.set(t.w,.6,LANE*2)); caps.setMatrixAt(i,tmpM);
      const base=-14, top=t.y-.7;
      tmpM.compose(tmpP.set(t.x+t.w/2,(base+top)/2,-4.6),tmpQ.identity(),tmpS.set(Math.max(.7,t.w*.48),top-base,.75)); trunks.setMatrixAt(i,tmpM);
      for (const s of [-1,1]) {
        const p0=new THREE.Vector3(t.x+t.w/2,top-1.6,-4.3),p1=new THREE.Vector3(t.x+t.w/2+s*t.w*.28,top,-2.65);
        direction.subVectors(p1,p0); midpoint.addVectors(p0,p1).multiplyScalar(.5);
        tmpM.compose(midpoint,tmpQ.setFromUnitVectors(up,direction.clone().normalize()),tmpS.set(.22,direction.length(),.22)); branches.setMatrixAt(i*2+(s>0?1:0),tmpM);
      }
      const n=Math.ceil(t.w/1.2);
      for (let j=0;j<n;j++) for (const z of [-LANE,LANE]) blobs.push({x:t.x+(j+.5)*t.w/n,y:t.y-.31,z,sx:t.w/n*.55});
      for (const x of [t.x,t.x+t.w]) for (const z of [-2,0,2]) blobs.push({x,y:t.y-.31,z,sx:.38});
    });
    const rim=new THREE.InstancedMesh(ballGeo,leaf,blobs.length);
    blobs.forEach((b,i)=>{tmpM.compose(tmpP.set(b.x,b.y,b.z),tmpQ.identity(),tmpS.set(b.sx,.27,.43));rim.setMatrixAt(i,tmpM);});
    for (const m of [caps,trunks,branches,rim]) {m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;areaGroup.add(m);areaDispose.push({dispose:()=>m.dispose()});}
    areaDispose.push(trunkGeo);
  }

  function buildLifts(a) {
    for (const l of w_lifts(a)) {
      const g = new THREE.Group();
      const n = Math.round(l.w) * 6;
      const m = new THREE.InstancedMesh(boxGeo, tileMat('lift', 'overworld'), n);
      let i = 0;
      for (let c = 0; c < Math.round(l.w); c++) for (const z of ZS) { tmpM.compose(tmpP.set(c + 0.5, -0.2, z), tmpQ.identity(), tmpS.set(1, 0.4, 1)); m.setMatrixAt(i++, tmpM); }
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      g.add(m); g.position.x = l.x; areaGroup.add(g);
      areaDispose.push({ dispose: () => m.dispose() });
      liftGroups.push({ lift: l, group: g });
    }
  }
  function w_lifts(a) { return a.rt ? a.rt.lifts : []; }

  function buildCoins(w) {
    const list = w.rt.coins;
    if (!list.length) return;
    coinInst = new THREE.InstancedMesh(M.coinGeo, M.coinMat, list.length * 3);
    coinInst.castShadow = true; coinInst.frustumCulled = false;
    coinRecs = list;
    areaGroup.add(coinInst); areaDispose.push({ dispose: () => coinInst && coinInst.dispose() });
  }

  function buildFlag(f) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, f.top - 1, 10), plainMat('#78d050', { roughness: 0.4 }));
    pole.position.set(f.x, 1 + (f.top - 1) / 2, 0); pole.castShadow = true; areaGroup.add(pole);
    const knob = new THREE.Mesh(ballGeo, plainMat('#1e8a2a', { roughness: 0.3 })); knob.scale.setScalar(0.22); knob.position.set(f.x, f.top + 0.15, 0); areaGroup.add(knob);
    const fm = new THREE.MeshStandardMaterial({ map: tex('flag'), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), fm);
    flagMesh.position.set(f.x - 0.72, f.top - 0.6, 0); flagMesh.castShadow = true; areaGroup.add(flagMesh);
    areaDispose.push(pole.geometry, flagMesh.geometry, fm);
  }

  function buildCastle(c) {
    const cells = [];
    const z0 = -3.5, depth = 3;
    for (let x = 0; x < 5; x++) for (let y = 0; y < 2; y++) cells.push([x, y]);
    for (let x = 0; x < 5; x += 2) cells.push([x, 2]);
    for (let x = 1; x < 4; x++) for (let y = 2; y < 4; y++) if (!(y === 2 && x === 2)) cells.push([x, y]);
    cells.push([2, 2]);
    for (let x = 1; x < 4; x += 1) cells.push([x, 4]);
    if (c.big) {
      cells.length=0;
      for (let x=-1;x<=5;x++) for (let y=0;y<3;y++) cells.push([x,y]);
      for (const x of [-1,1,3,5]) cells.push([x,3]);
      for (let x=1;x<4;x++) for (let y=3;y<8;y++) cells.push([x,y]);
      for (const x of [1,3]) cells.push([x,8]);
    }
    const n = cells.length * depth;
    const m = new THREE.InstancedMesh(boxGeo, tileMat('brick', 'overworld'), n);
    let i = 0;
    for (const [x, y] of cells) for (let k = 0; k < depth; k++) {
      const crenel = c.big ? (y===3&&(x<1||x>3))||y===8 : (y === 2 && x !== 2 && (x === 0 || x === 4)) || y === 4;
      tmpM.compose(tmpP.set(c.x + x + 0.5, y + (crenel ? 0.3 : 0.5), z0 + k + 0.5), tmpQ.identity(), tmpS.set(crenel ? 0.7 : 1, crenel ? 0.6 : 1, crenel ? 0.7 : 1));
      m.setMatrixAt(i++, tmpM);
    }
    m.castShadow = true; m.receiveShadow = true; areaGroup.add(m); areaDispose.push({ dispose: () => m.dispose() });
    const dark = plainMat('#000000');
    const door = new THREE.Mesh(boxGeo, dark); door.scale.set(1, 1.6, 0.1); door.position.set(c.x + 2.5, 0.8, z0 + depth + 0.03); areaGroup.add(door);
    for (const x of [1.5, 3.5]) { const win = new THREE.Mesh(boxGeo, dark); win.scale.set(0.5, 0.9, 0.1); win.position.set(c.x + x, 3.1, z0 + depth + 0.03); areaGroup.add(win); }
    if (c.big) {const win=new THREE.Mesh(boxGeo,dark);win.scale.set(.7,1.2,.1);win.position.set(c.x+2.5,6.3,z0+depth+.03);areaGroup.add(win);}
    const fm = new THREE.MeshStandardMaterial({ map: tex('starFlag'), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    castleFlag = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fm);
    const flagY=c.big?7.8:4.2;
    castleFlag.position.set(c.x + 2.95, flagY, z0 + 1.5); areaGroup.add(castleFlag);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), plainMat('#c8a060')); staff.position.set(c.x + 2.5, flagY+.9, z0 + 1.5); areaGroup.add(staff);
    castleFlag.userData.y0 = flagY;
    areaDispose.push(castleFlag.geometry, fm, staff.geometry);
  }

  // 地面区：跑道两侧低一格的草地（坑的位置整条切开成峡谷），远处山丘、灌木和云
  function groundRuns(a) {
    const runs = []; let start = null;
    for (let c = -1; c <= a.width + 1; c++) {
      const t = a.tiles.get(c * 512 + (-1 + 64));
      const g = t && t.t === 'G';
      if (g && start === null) start = c;
      if (!g && start !== null) { runs.push([start, c]); start = null; }
    }
    return runs;
  }
  function buildOverworld(a) {
    const grass = plainMat('#80966b'), dirt = plainMat('#a08d6e'), deep = plainMat('#80966b');
    const mats = [dirt, dirt, grass, dirt, dirt, dirt];
    const runs = groundRuns(a);
    for (const [s, e] of runs) {
      for (const side of [1, -1]) {
        // 草地向两侧一直铺进雾里，斜视远处不露出底下的暗色地板
        const geo = new THREE.BoxGeometry(e - s, 14, 170);
        const m = new THREE.Mesh(geo, mats); m.position.set((s + e) / 2, -1 - 7, side * (LANE + 85)); m.receiveShadow = true; areaGroup.add(m); areaDispose.push(geo);
      }
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(a.width + 200, 200), deep); floor.rotation.x = -Math.PI / 2; floor.position.set(a.width / 2, -14, 0); areaGroup.add(floor); areaDispose.push(floor.geometry);
    const hillM = plainMat('#7b9872'), hillDark = plainMat('#567453'), bushM = plainMat('#91aa76'), cloudM = plainMat('#e8eee3', { emissive: '#000000' });
    const inRun = x => runs.some(([s, e]) => x > s + 0.5 && x < e - 0.5);
    // A small faceted grove uses two batches, outside the platform collision lane.
    const trees = [];
    for (let x = 5; x < a.width; x += 11) if (inRun(x)) {
      for (const z of [-15, 19]) trees.push({ x, z, size: .85 + (Math.floor(x) % 3) * .16 });
    }
    if (trees.length) {
      const trunkGeo = new THREE.CylinderGeometry(.16, .23, 1, 7);
      const crownGeo = new THREE.IcosahedronGeometry(1, 1);
      const trunks = new THREE.InstancedMesh(trunkGeo, plainMat('#6e6450'), trees.length);
      const crowns = new THREE.InstancedMesh(crownGeo, plainMat('#577c61'), trees.length * 3);
      trees.forEach((t, i) => {
        tmpM.compose(tmpP.set(t.x, -.5 + t.size * 1.5, t.z), tmpQ.identity(), tmpS.set(t.size, 3 * t.size, t.size));
        trunks.setMatrixAt(i, tmpM);
        for (let k = 0; k < 3; k++) {
          tmpM.compose(tmpP.set(t.x + (k - 1) * .65 * t.size, 2.7 * t.size + (k === 1 ? .7 : 0), t.z), tmpQ.identity(), tmpS.set(1.35 * t.size, 1.6 * t.size, 1.2 * t.size));
          crowns.setMatrixAt(i * 3 + k, tmpM);
        }
      });
      for (const m of [trunks, crowns]) { m.castShadow = true; m.receiveShadow = true; areaGroup.add(m); areaDispose.push({ dispose: () => m.dispose() }); }
      areaDispose.push(trunkGeo, crownGeo);
    }
    const blob = (m, x, y, z, sx, sy, sz, shadow = true) => { const o = new THREE.Mesh(ballGeo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = shadow; o.receiveShadow = true; areaGroup.add(o); return o; };
    for (let base = -48; base < a.width + 48; base += 48) {
      // 原作背景以 48 格为一组：大山、灌木、小山、三朵云
      if (inRun(base + 2)) { blob(hillM, base + 2.5, -1, -8, 4.2, 3.6, 3.4); blob(hillDark, base + 2.5, 1.2, -5.2, 0.25, 0.4, 0.15, false); blob(hillDark, base + 1.6, 0.4, -5.6, 0.22, 0.35, 0.15, false); }
      if (inRun(base + 16)) blob(hillM, base + 17, -1, -6.5, 2.6, 2.1, 2.2);
      for (const [off, n] of [[11, 3], [23, 1], [41, 2]]) if (inRun(base + off)) for (let i = 0; i < n + 2; i++) blob(bushM, base + off + i * 0.9, -0.6, -4.4, 0.75, 0.75 + (i % 2) * 0.2, 0.7);
      for (const [off, y, n, z] of [[8, 9.5, 1, -9], [19, 10.5, 1, -12], [27, 9.6, 3, -10], [36, 10.2, 2, -11]]) for (let i = 0; i < n; i++) {
        const cx = base + off + i * 1.6;
        blob(cloudM, cx, y, z, 1.1, 0.8, 0.9, false); blob(cloudM, cx + 0.8, y + 0.3, z, 0.9, 0.75, 0.8, false); blob(cloudM, cx - 0.8, y - 0.1, z, 0.8, 0.6, 0.75, false);
      }
      // 正面远处的云与灌木，转到背面时也有景物
      blob(cloudM, base + 30, 13, 34, 2.2, 1.3, 1.6, false); blob(cloudM, base + 32, 13.4, 34, 1.6, 1.1, 1.3, false);
      if (inRun(base + 33)) for (let i = 0; i < 3; i++) blob(bushM, base + 33 + i * 0.9, -0.7, 5.2, 0.7, 0.7, 0.6);
    }
  }
  function buildUnderground(a) {
    const t = tex('brick', 'underground').clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(a.width + 8, 16);
    const wallM = fadeable(new THREE.MeshStandardMaterial({ map: t, color: '#5b7686', roughness: 0.9 }));
    const wall = new THREE.Mesh(new THREE.BoxGeometry(a.width + 8, 16, 0.5), wallM);
    wall.position.set(a.width / 2, 6, -LANE - 0.25); wall.receiveShadow = true; areaGroup.add(wall);
    areaDispose.push(wall.geometry, wallM, t);
    const floorM = plainMat('#14222a'), deep = plainMat('#05080a');
    for (const [s, e] of groundRuns(a)) {
      const geo = new THREE.BoxGeometry(e - s, 14, 22);
      const m = new THREE.Mesh(geo, [deep, deep, floorM, deep, deep, deep]); m.position.set((s + e) / 2, -8, LANE + 11); m.receiveShadow = true; areaGroup.add(m); areaDispose.push(geo);
    }
  }

  view.build = (w) => { buildArea(w); view.groundY = w.player.y; view.followX = w.player.x; view.followY = camTargetY(w, PRESETS[view.presetIndex]); view.snap = true; warmUp(); };

  // 预编译：镜头外的景物、之后才出现的敌人 / 道具 / 特效第一次上屏时编译着色器会卡一下，换区域时一次编完
  function warmUp() {
    const tmp = new THREE.Group();
    tmp.add(M.goomba(view.theme), M.koopa(false), M.koopa(true), M.piranha(), M.mushroom(false), M.mushroom(true), M.flower(), M.star(), M.fireball(), M.coin());
    const { texture } = textTexture('100', { color: '#ffffff', stroke: '#1a1a1a', size: 44 });
    const sm = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    tmp.add(new THREE.Sprite(sm), new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true })), new THREE.Mesh(debrisGeo, tileMat('brick', view.theme)));
    tmp.position.set(view.followX, view.followY, 0);
    scene.add(tmp);
    try { renderer.compile(scene, camera); } catch (e) { /* 旧浏览器不支持时跳过 */ }
    scene.remove(tmp);
    sm.dispose(); texture.dispose();
  }

  // ---------- 实体 ----------
  function enemyModel(e) {
    let m = enemyModels.get(e);
    if (!m) { m = e.type === 'koopa' ? M.koopa(e.red,e.winged) : M.goomba(view.theme); scene.add(m); enemyModels.set(e, m); }
    return m;
  }
  function itemModel(it) {
    let m = itemModels.get(it);
    if (!m) { m = it.type === 'flower' ? M.flower() : it.type === 'star' ? M.star() : M.mushroom(it.type === '1up'); scene.add(m); itemModels.set(it, m); }
    return m;
  }

  // ---------- 特效 ----------
  const textCache = new Map();
  function popup(text, x, y, z) {
    let entry = textCache.get(text);
    if (!entry) { entry = textTexture(text, { color: '#ffffff', stroke: '#1a1a1a', size: 44 }); textCache.set(text, entry); }
    const sm = new THREE.SpriteMaterial({ map: entry.texture, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(sm); sp.scale.set(0.55 * entry.aspect, 0.55, 1); sp.position.set(x, y, z + 0.6); sp.renderOrder = 10;
    fx.add(sp); effects.push({ obj: sp, life: 0.9, max: 0.9, kind: 'popup', mat: sm });
  }
  function debris(tile, theme) {
    const m = tileMat('brick', theme);
    for (const z of [-2, 0, 2]) for (let i = 0; i < 4; i++) {
      const o = new THREE.Mesh(debrisGeo, m);
      const sx = i % 2 ? 1 : -1, sy = i < 2 ? 1 : 0;
      o.position.set(tile.c + 0.5 + sx * 0.25, tile.h + 0.5 + sy * 0.25, z + (Math.random() - 0.5) * 0.6);
      fx.add(o);
      effects.push({ obj: o, life: 1.3, max: 1.3, kind: 'body', v: new THREE.Vector3(sx * (2.4 + Math.random()), 9 + sy * 3, (Math.random() - 0.5) * 3), spin: 8 });
    }
  }
  function burst(x, y, z, color, n, speed, life, size = 0.12) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true });
    for (let i = 0; i < n; i++) {
      const o = new THREE.Mesh(ballGeo, m); o.scale.setScalar(size); o.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1);
      const v = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)).multiplyScalar(speed * (0.6 + Math.random() * 0.4));
      fx.add(o); effects.push({ obj: o, life, max: life, kind: 'spark', v, mat: m, g: speed > 6 ? 3 : 10 });
    }
  }
  function coinPop(x, y, z) {
    const o = M.coin(); o.position.set(x, y, z); fx.add(o);
    effects.push({ obj: o, life: 0.55, max: 0.55, kind: 'coin', v: new THREE.Vector3(0, 13, 0) });
  }

  view.onEvent = (e, w) => {
    switch (e.type) {
      case 'area': break;
      case 'tile': { const rec = tileRecs.get(e.tile); if (rec) { refreshTile(rec); if (e.tile.bump > 0) animRecs.add(rec); } break; }
      case 'break': { const rec = tileRecs.get(e.tile); if (rec) refreshTile(rec); debris(e.tile, view.theme); break; }
      case 'coinpop': coinPop(e.x, e.y, e.z); break;
      case 'score': popup(e.text, e.x, e.y, e.z); break;
      case 'stomp': burst(e.x, e.y + 0.2, e.z, '#ffffff', 6, 3, 0.35, 0.09); break;
      case 'kick': burst(e.x, e.y + 0.5, e.z, '#ffe28a', 5, 4, 0.3, 0.08); break;
      case 'pop': burst(e.x, e.y, e.z, '#ff8a2a', 6, 3, 0.25, 0.08); break;
      case 'firework': burst(e.x, e.y, e.z, ['#ff5a3a', '#fff070', '#7ad8ff'][Math.floor(Math.random() * 3)], 28, 7, 0.9, 0.14); view.shake = 0.15; break;
      case 'castleFlag': if (castleFlag) castleFlag.userData.rise = true; break;
      case 'coin': if (e.x !== undefined) burst(e.x, e.y, e.z, '#ffe066', 5, 2.5, 0.3, 0.07); break;
    }
  };

  // ---------- 镜头 ----------
  function camTargetY(w, preset) {
    const p = w.player, a = w.area;
    // 正视：高度跟玛丽站的地面走、不跟跳跃，镜头约在脚下 2.6 格高——正好从 3 格高的砖块层下面看过去
    if (preset.id === 'front') { if (p.grounded || p.y < view.groundY || view.groundY === undefined) view.groundY = p.y; return view.groundY + 0.8; }
    if (preset.id !== 'side') return p.y + 1.2;
    if (a.ceiling && p.y < 10) return 5.3;
    return Math.max(4.6, p.y - 2.2);
  }
  view.pitchOffset = 0;
  view.turnPitch = d => {
    const p=PRESETS[view.presetIndex], base=p.pitch || 0, fp=!!p.fp;
    const pitch=base+view.pitchOffset+(fp?-d:d);
    view.pitchOffset=Math.max(fp?-1:.12,Math.min(fp?1:1.48,pitch))-base;
  };
  view.preset = () => PRESETS[view.presetIndex];
  view.cyclePreset = () => { view.presetIndex = (view.presetIndex + 1) % PRESETS.length; view.yawOffset = 0; view.pitchOffset = 0; return PRESETS[view.presetIndex]; };
  view.setPreset = (i) => { view.presetIndex = i; view.yawOffset = 0; view.pitchOffset = 0; };
  view.cameraYaw = () => PRESETS[view.presetIndex].yaw + view.yawOffset;
  // 第一人称只在游玩时生效：标题画面换成正视，死亡动画时退到身后看清发生了什么
  view.firstPerson = (w) => !!PRESETS[view.presetIndex].fp && !view.titleMode && !!w && w.mode !== 'dying';

  // 镜头避让：第三人称镜头落进或贴着方块时，先往上抬过障碍；上面没空间（天花板下）就沿视线往玛丽方向拉近
  // 已被剖面切掉的墙和天花板不算障碍（view.cutNow 每帧按未避让的镜头位置算出）
  const solidAt = (a, c, h) => {
    const k = view.cutNow;
    if (k && ((k.l !== null && c < k.l) || (k.r !== null && c >= k.r) || (k.top !== null && h >= k.top))) return false;
    const t = a.tiles.get(tileKey(c, h));
    return (!!t && SOLID.has(t.t) && !t.hidden) || a.trees.some(t=>c+.5>=t.x&&c+.5<t.x+t.w&&h+1>t.y-.6&&h<t.y);
  };
  function cutsFor(a, p, pos) {
    const ceil = a.ceiling ? (a.ceilY || 10) : null;
    return {
      top: ceil !== null && pos.y > ceil - 0.6 && p.y < ceil - 0.5 ? ceil : null,
      l: view.wallL !== null && pos.x < view.wallL ? view.wallL : null,
      r: view.wallR !== null && pos.x > view.wallR ? view.wallR : null
    };
  }
  function camBlocked(a, x, y, z) {
    if (Math.abs(z) > LANE + 0.35) return false;
    for (let c = Math.floor(x - 0.35); c <= Math.floor(x + 0.35); c++)
      for (let h = Math.floor(y - 0.35); h <= Math.floor(y + 0.35); h++) if (solidAt(a, c, h)) return true;
    return false;
  }
  // 镜头到玛丽胸口的视线有没有被方块挡住（只在镜头位于跑道上方时检查：正视、或 Q/E 转到身后）
  function sightBlocked(a, x, y, z, e) {
    const dx = e.x - x, dy = e.y - y, dz = e.z - z, n = Math.ceil(Math.hypot(dx, dy, dz) / 0.25);
    for (let i = 1; i < n - 1; i++) {
      const t = i / n, px = x + dx * t, py = y + dy * t, pz = z + dz * t;
      if (Math.abs(pz) < LANE && solidAt(a, Math.floor(px), Math.floor(py))) return true;
    }
    return false;
  }
  const pullTo = new THREE.Vector3();
  function avoid(a, pos, target, p, dt, snap) {
    const eye = { x: p.x, y: p.y + heightOf(p) * 0.6, z: p.z }, inLane = Math.abs(pos.z) < LANE + 1.5;
    const ok = (x, y, z) => !camBlocked(a, x, y, z) && !(inLane && sightBlocked(a, x, y, z, eye));
    // 拉近时朝玛丽头顶后上方靠，最多拉到离她约 1.3 格，不会越过她
    pullTo.set(p.x, p.y + heightOf(p) + 0.6, p.z);
    const sMax = Math.max(0, 1 - 1.3 / Math.max(0.01, pos.distanceTo(pullTo)));
    let lift = 0, pull = 0;
    if (!ok(pos.x, pos.y, pos.z)) {
      let found = false;
      for (let dy = 0.25; dy <= 2.01 && !found; dy += 0.25) if (ok(pos.x, pos.y + dy, pos.z)) { lift = dy; found = true; }
      if (!found) {
        pull = sMax;
        for (let s = 0.05; s < sMax; s += 0.05) if (ok(pos.x + (pullTo.x - pos.x) * s, pos.y + (pullTo.y - pos.y) * s, pos.z + (pullTo.z - pos.z) * s)) { pull = s; break; }
      }
    }
    const up = 1 - Math.exp(-14 * dt), down = 1 - Math.exp(-3 * dt);
    view.camLift = snap ? lift : view.camLift + (lift - view.camLift) * (lift > view.camLift ? up : down);
    view.camPull = snap ? pull : view.camPull + (pull - view.camPull) * (pull > view.camPull ? up : down);
    pos.y += view.camLift;
    pos.lerp(pullTo, Math.min(view.camPull, sMax));
  }

  function updateCamera(w, dt) {
    let pr = PRESETS[view.presetIndex];
    const p = w.player, a = w.area, fp = view.firstPerson(w);
    if (pr.fp && !fp) pr = FRONT;
    const pitch=pr.pitch+view.pitchOffset;
    const yaw = pr.yaw + view.yawOffset;
    let tx = p.x;
    const snap = view.snap;
    const k = snap ? 1 : 1 - Math.exp(-6 * dt);
    view.followX += (tx - view.followX) * k;
    view.followY += (camTargetY(w, pr) - view.followY) * (snap ? 1 : 1 - Math.exp(-3.5 * dt));
    view.snap = false;
    let target;
    if (fp) {
      // 第一人称：眼睛在头部高度（下蹲会变矮），沿镜头朝向看；Q/E 转头
      const eye = p.y + heightOf(p) * 0.86;
      camera.position.set(p.x, eye, p.z);
      const fx = -Math.sin(yaw) * Math.cos(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
      target = tmpP.set(p.x + fx * 10, eye + Math.sin(pitch) * 10, p.z + fz * 10);
      camera.lookAt(target);
      view.camLift = view.camPull = 0;
    } else {
      let cx = view.followX + pr.ahead;
      if (pr.id === 'side') { const half = 9; cx = a.width < half * 2 ? a.width / 2 : Math.max(half, Math.min(a.width - half, cx)); }
      target = tmpP.set(cx, view.followY, pr.id === 'side' ? 0 : p.z * 0.5);
      const cp = Math.cos(pitch) * pr.dist;
      camera.position.set(target.x + Math.sin(yaw) * cp, target.y + Math.sin(pitch) * pr.dist, target.z + Math.cos(yaw) * cp);
      view.cutNow = cutsFor(a, p, camera.position);
      avoid(a, camera.position, target, p, dt, snap);
      if (view.shake > 0) { view.shake = Math.max(0, view.shake - dt); camera.position.y += (Math.random() - 0.5) * view.shake; }
      // 正视镜头高度不跟跳跃，跳高时改为抬头看，玛丽不会跳出画面上方
      if (pr.id === 'front') {
        const want = Math.max(target.y, p.y + 0.9);
        view.lookY = snap || view.lookY === undefined ? want : view.lookY + (want - view.lookY) * (1 - Math.exp(-8 * dt));
        target.y = view.lookY;
      }
      camera.lookAt(target);
    }
    const near = fp ? 0.06 : 0.3;
    if (camera.fov !== pr.fov || camera.near !== near) { camera.fov = pr.fov; camera.near = near; camera.updateProjectionMatrix(); }
    FADE.on.value = fp ? 0 : 1;
    // 阴影范围有限，跟着镜头朝向往前挪，正视时前方的砖块和水管也有影子
    const fwdX = -Math.sin(yaw) * 10;
    sun.position.set(target.x + fwdX - 10, target.y + 24, 14); sun.target.position.set(target.x + fwdX, 0, 0);
    lamp.position.set(p.x, p.y + 2.2, p.z + 2);
    FADE.cam.value.copy(camera.position);
    FADE.player.value.set(p.x, p.y + heightOf(p) * 0.55, p.z);
    FADE.feet.value = p.y;
    // 剖面：地下关镜头在天花板以上而玛丽在下面时切掉天花板层；镜头在关卡两端墙外时切掉墙
    const cut = fp ? { top: null, l: null, r: null } : cutsFor(a, p, camera.position);
    FADE.cut.value = cut.top !== null ? cut.top - 0.02 : 1e5;
    FADE.cutX.value.set(cut.l !== null ? cut.l + 0.02 : -1e5, cut.r !== null ? cut.r - 0.02 : 1e5);
    view.cutNow = null;
  }

  // ---------- 每帧同步 ----------
  let time = 0;
  view.update = (w, dt) => {
    time += dt;
    const p = w.player;
    updateCamera(w, dt);
    // 顶砖弹跳动画
    for (const rec of animRecs) { const b = rec.tile.bump; refreshTile(rec, b > 0 ? Math.sin((1 - b / 0.22) * Math.PI) * 0.3 : 0); if (b <= 0) animRecs.delete(rec); }
    if (meshes.question) { const m = meshes.question.material; m.emissiveIntensity = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(time * 5)); }
    // 金币
    if (coinInst) {
      const rot = tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 2.2);
      coinRecs.forEach((c, i) => PIPE_Z.forEach((z, j) => { tmpM.compose(tmpP.set(c.x, c.y + Math.sin(time * 3 + c.x) * 0.05, z), rot, c.alive ? tmpS.set(1, 1, 1) : ZERO); coinInst.setMatrixAt(i * 3 + j, tmpM); }));
      coinInst.instanceMatrix.needsUpdate = true;
    }
    for (const lg of liftGroups) {lg.group.position.y=lg.lift.y;lg.group.position.x=lg.lift.x;}
    if (flagMesh && w.flag) flagMesh.position.y = w.flag.flagY;
    if (castleFlag && castleFlag.userData.rise) castleFlag.position.y = Math.min(castleFlag.userData.y0 + 1.3, castleFlag.position.y + dt * 1.2);
    updatePlayerModel(w, dt);
    // 敌人
    for (const e of w.rt.enemies) {
      if (!e.active || e.gone) { const m = enemyModels.get(e); if (m) m.visible = false; continue; }
      const m = enemyModel(e); m.visible = true;
      m.position.set(e.x, e.y, e.z);
      const walkPhase = time * 9 + e.x;
      if (e.type === 'goomba') {
        m.scale.set(1, e.state === 'squash' ? 0.28 : 1, 1);
        m.rotation.set(0, e.vx >= 0 ? Math.PI / 2 : -Math.PI / 2, e.state === 'walk' ? Math.sin(walkPhase) * 0.12 : 0);
      } else {
        const ud = m.userData;
        const shell = e.state === 'shell' || e.state === 'shellMove' || (e.state === 'dead' && e.h < 1);
        ud.body.visible = !shell;
        ud.wings.forEach((wing,i)=>{wing.visible=e.winged&&e.state==='walk';wing.rotation.z=(i?1:-1)*(.15+Math.sin(time*12)*.3);});
        ud.shell.position.y = shell ? -0.2 : 0;
        if (e.state === 'shellMove') m.rotation.y += dt * 18;
        else m.rotation.set(0, shell ? m.rotation.y : (e.dir > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        if (e.state === 'shell' && e.t > 6.5) m.position.x += Math.sin(time * 60) * 0.04;
        if (e.state === 'walk') m.position.y += Math.abs(Math.sin(walkPhase)) * 0.05;
      }
      if (e.state === 'dead') { m.rotation.z = Math.PI; m.position.y += e.type === 'goomba' ? 0.9 : 1.2; }
    }
    // 食人花
    for (const pr of w.rt.piranhas) {
      let arr = piranhaModels.get(pr);
      if (!arr) { arr = PIPE_Z.map(() => { const m = M.piranha(); scene.add(m); return m; }); piranhaModels.set(pr, arr); }
      arr.forEach((m, i) => {
        m.visible = pr.alive[i] && pr.rise > 0.02;
        m.position.set(pr.pipe.x + 1, pr.pipe.h - 1.45 + pr.rise * 1.45, PIPE_Z[i]);
        const open = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(time * 9 + i));
        m.userData.jaws[0].rotation.z = open; m.userData.jaws[1].rotation.z = -open;
        m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z) + Math.PI / 2;
      });
    }
    // 道具
    for (const [it, m] of itemModels) if (!it.alive) { scene.remove(m); itemModels.delete(it); }
    for (const it of w.rt.items) {
      const m = itemModel(it);
      m.position.set(it.x, it.y, it.z);
      if (it.type === 'star') { m.userData.star.rotation.y = time * 6; }
      else if (it.type === 'flower') m.rotation.y = Math.sin(time * 2) * 0.4;
      else m.rotation.y = it.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // 火球
    for (const [f, m] of fireModels) if (!w.rt.fireballs.includes(f) || f.dead) { scene.remove(m); fireModels.delete(f); }
    for (const f of w.rt.fireballs) {
      if (f.dead) continue;
      let m = fireModels.get(f); if (!m) { m = M.fireball(); scene.add(m); fireModels.set(f, m); }
      m.position.set(f.x, f.y + 0.18, f.z); m.rotation.z = time * 20;
    }
    // 特效
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]; e.life -= dt;
      const o = e.obj;
      if (e.kind === 'popup') { o.position.y += dt * 1.6; e.mat.opacity = Math.min(1, e.life / 0.3); }
      else if (e.kind === 'body' || e.kind === 'coin') { e.v.y -= (e.kind === 'coin' ? 42 : 34) * dt; o.position.addScaledVector(e.v, dt); o.rotation.y += dt * (e.kind === 'coin' ? 18 : e.spin); o.rotation.x += dt * (e.spin || 0); }
      else if (e.kind === 'spark') { e.v.y -= e.g * dt; o.position.addScaledVector(e.v, dt); e.mat.opacity = Math.max(0, e.life / e.max); }
      if (e.life <= 0) { fx.remove(o); effects.splice(i, 1); if (e.kind === 'popup') e.mat.dispose(); }
    }
    renderer.render(scene, camera);
  };

  function updatePlayerModel(w, dt) {
    const p = w.player, s = w.session;
    const root = player.root;
    const bigNow = p.power !== 'small';
    let showBig = bigNow;
    if (p.growT > 0) showBig = Math.floor(p.growT / 0.08) % 2 === 0 ? bigNow : !bigNow;
    player.small.visible = !showBig; player.big.visible = showBig;
    const blink = p.inv > 0 && w.mode === 'play' && Math.floor(time * 16) % 2 === 0;
    root.visible = p.visible && !blink && !view.firstPerson(w);   // 第一人称不画自己
    root.position.set(p.x, p.y, p.z);
    root.rotation.y = w.mode === 'dying' ? 0 : p.facing;
    const col = p.power === 'fire' ? M.MARIO_COLORS.fire : M.MARIO_COLORS.normal;
    if (p.star > 0) {
      const h = (time * 3) % 1;
      player.mats.cap.color.setHSL(h, 0.85, 0.55); player.mats.overalls.color.setHSL((h + 0.5) % 1, 0.8, 0.45);
      if (Math.random() < dt * 14) burst(p.x + (Math.random() - 0.5), p.y + Math.random() * 1.6, p.z, '#fff6a0', 1, 1.5, 0.4, 0.06);
    } else { player.mats.cap.color.set(col.cap); player.mats.overalls.color.set(col.overalls); }
    const model = showBig ? player.big : player.small, ud = model.userData;
    const speed = Math.hypot(p.vx, p.vz);
    const crouch = p.crouch && showBig;
    ud.body.scale.y = crouch ? 0.55 : 1;
    let legA = 0, armA = 0;
    if (w.mode === 'dying') { ud.arms.forEach(a => { a.rotation.x = 0; a.rotation.z = (a.position.x > 0 ? 1 : -1) * 2.6; }); ud.legs.forEach(l => l.rotation.x = 0); return; }
    if (w.mode === 'flag' && w.flag && (w.flag.phase === 'slide' || w.flag.phase === 'hold')) { ud.arms.forEach(a => { a.rotation.x = -2.6; a.rotation.z = 0; }); ud.legs.forEach((l, i) => l.rotation.x = i ? 0.4 : -0.2); return; }
    ud.arms.forEach(a => a.rotation.z = 0);
    if (!p.grounded && w.mode === 'play') {
      ud.legs[0].rotation.x = -0.7; ud.legs[1].rotation.x = 0.5;
      ud.arms[0].rotation.x = 0.4; ud.arms[1].rotation.x = -2.7;
      return;
    }
    if (speed > 0.3 || (w.mode === 'flag' && p.vx > 0)) { const ph = p.walkT * (showBig ? 2.3 : 3.1); legA = Math.sin(ph) * Math.min(1, speed / 4 + 0.3) * 0.9; armA = -legA * 0.8; }
    if (p.skid) { legA = 0.5; armA = -0.9; }
    ud.legs[0].rotation.x = legA; ud.legs[1].rotation.x = -legA;
    ud.arms[0].rotation.x = armA; ud.arms[1].rotation.x = -armA;
    if (crouch) { ud.legs.forEach(l => l.rotation.x = -0.3); }
  }

  view.resize = (w, h, dpr) => { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
  view.setQuality = (q) => {
    view.quality = q;
    renderer.shadowMap.enabled = q !== 'low'; sun.castShadow = q !== 'low';
    sun.shadow.mapSize.set(q === 'low' ? 512 : 2048, q === 'low' ? 512 : 2048);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    lamp.intensity = view.theme === 'underground' && q !== 'low' ? 7 : 0;
    scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
  };
  view.stats = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
  return view;
}
