import { markTree, treeState, applyTree, scalarState } from '../../../public/js/game/coop.js';
// 玩法核心：吉普车、武器、敌军 AI、俘虏救援、检查点、各关 Boss、过关与结算。
import * as THREE from 'three';
import * as L from './level.js';
import * as M from './models.js';
import * as M2 from './models2.js';
import A from './audio.js';
import IN from './input.js';
import { DIR8, rand, randRange, clamp, angTo, angDiff, approachAng, store, STEP, reseed, seed, dist2 } from './core.js';

const Z = (y) => -y;
const PI = Math.PI;

// 武器四级：手雷 → 火箭 → 火箭爆炸后左右溅射 → 上下左右四向溅射（NES 版设定）
export const WEAPON_NAME = ['', '手雷', '火箭', '双向火箭', '四向火箭'];
const WEAPON_DESC = ['', '', '火箭直线飞行、可炸毁岩崖', '火箭爆炸后向左右两侧溅射', '火箭爆炸后向上下左右四个方向溅射'];
export const MAX_WEAPON = 4;
export const POINTS = {
  repair: 300, soldier: 100, officer: 200, mg: 300, cannon: 500, turret: 500, boat: 800, tank: 1000, brownTank: 500, bulltank: 800, ejeep: 800, bomber: 1000,
  wstatue: 800, bust: 800, fallpillar: 500, boss: 2000, hut: 200, gate: 500, sandbag: 50, crate: 50, bluff: 100, barrel: 100,
  pow: 500, flashMax: 1000, star: 0, upStar: 3000, powBonus: 2000
};
const ENEMY_STATS = {
  soldier: { hp: 1, r: 0.42, solid: false },
  officer: { hp: 2, r: 0.42, solid: false },
  mg: { hp: 6, r: 1.25, solid: true },
  turret: { hp: 4, r: 1.25, solid: true },
  cannon: { hp: 8, r: 1.3, solid: true },
  tank: { hp: 8, r: 1.55, solid: true },
  bulltank: { hp: 8, r: 1.95, solid: true },
  ejeep: { hp: 2, r: 1.0, solid: true },
  boat: { hp: 6, r: 1.4, solid: false },
  boss: { hp: 8, r: 1.8, solid: true },
  bomber: { hp: 1, r: 2.4, solid: false, air: true, bulletProof: true },
  wstatue: { hp: 4, r: 1.2, solid: true, bulletProof: true },
  bust: { hp: 12, r: 1.9, solid: true, bulletProof: true },
  fallpillar: { hp: 7, r: 0.6, solid: true, oneShot: true }
};
const emptyKills = () => ({ soldier: 0, officer: 0, mg: 0, turret: 0, cannon: 0, tank: 0, brownTank: 0, bulltank: 0, ejeep: 0, bomber: 0, boat: 0, wstatue: 0, fallpillar: 0, boss: 0, bust: 0, hut: 0 });

export const G = {
  mode: 'title', t: 0, frame: 0, settings: { lives: 'inf', demo: false, armor: 'std', gun: 'up' }, armorMax: 3, hitId: 0,
  score: 0, hi: store.get('hi', 30000), deaths: 0, lives: 3, demoUsed: false, stage: 1, startStage: 1,
  weapon: 1, carried: 0, delivered: 0, freed: 0, cp: 0,
  kills: emptyKills(), events: [], banner: null, toast: null, boss: null, endT: 0, onEnd: null, nextLife: 20000
};

let scene, world, fx, camCtl;
let fpLatch = null;   // 第一人称：同方向按住期间锁定世界方向，避免镜头跟着车头转导致画圈
let coopPlayers = [], localSlot = 0, inputProvider = () => ({}), nextNetId = 1;
function withPlayer(player, fn) {
  const old=P, weapon=G.weapon, carried=G.carried, latch=fpLatch;
  if(old){old.weapon=G.weapon;old.carried=G.carried;}
  P=player;G.weapon=player.weapon||1;G.carried=player.carried||0;fpLatch=player.fpLatch||null;
  try{return fn();}finally{player.weapon=G.weapon;player.carried=G.carried;player.fpLatch=fpLatch;P=old;G.weapon=old===player?player.weapon:weapon;G.carried=old===player?player.carried:carried;fpLatch=latch;}
}
function allPlayers(){return G.coop?coopPlayers:[P];}
function nearestPlayer(x,y){return allPlayers().filter(p=>p.alive).sort((a,b)=>dist2(a.x,a.y,x,y)-dist2(b.x,b.y,x,y))[0]||P;}
export function setCoopInput(fn){inputProvider=fn;}
export function leaveCoopSlot(slot){G.playerSlots=G.playerSlots.filter(s=>s!==slot);const p=coopPlayers.find(p=>p.slot===slot);if(p){p.alive=false;p.disconnected=true;p.obj.root.visible=false;}}
export function joinCoopSlot(slot) {
  const existing=coopPlayers.find(p=>p.slot===slot);
  if(existing&&!existing.disconnected)return;
  if(existing){scene.remove(existing.obj.root);coopPlayers=coopPlayers.filter(p=>p!==existing);}
  const old=P,anchor=coopPlayers.find(p=>p.alive&&!p.disconnected)||old;
  makePlayer(slot);const added=P;added.armor=G.armorMax;added.invuln=3;
  if(anchor){added.x=anchor.x+2.2;added.y=anchor.y;
    outer:for(let r=2;r<7;r++)for(let k=0;k<8;k++){const x=anchor.x+DIR8[k].x*r,y=anchor.y+DIR8[k].y*r;if(!blockedFor(x,y,added.r,added)&&!coopPlayers.some(q=>q.alive&&!q.disconnected&&dist2(x,y,q.x,q.y)<4)){added.x=x;added.y=y;break outer;}}}
  coopPlayers.push(added);G.playerSlots=[...new Set([...G.playerSlots,slot])];P=old;
}
export function computerInput(slot) {
  const p=coopPlayers.find(p=>p.slot===slot);if(!p||!p.alive)return {dir:-1};
  const target=ents.filter(e=>e.alive&&e.active).sort((a,b)=>dist2(p.x,p.y,a.x,a.y)-dist2(p.x,p.y,b.x,b.y))[0];
  const friend=coopPlayers.filter(h=>h!==p&&h.alive&&!h.disconnected).sort((a,b)=>dist2(p.x,p.y,a.x,a.y)-dist2(p.x,p.y,b.x,b.y))[0];
  const close=target&&dist2(p.x,p.y,target.x,target.y)<22*22;
  const goal=p.carried>0&&dist2(p.x,p.y,L.PAD.x,L.PAD.y)<20*20?L.PAD:close?target:friend&&dist2(p.x,p.y,friend.x,friend.y)>4*4?friend:{x:p.x,y:p.y+4};
  const a=angTo(p.x,p.y,goal.x,goal.y),want=(Math.round(a/(PI/4))+8)%8;
  let dir=-1;
  if(!close||dist2(p.x,p.y,goal.x,goal.y)>8*8)for(const offset of [0,1,-1,2,-2,3,-3,4]){const n=(want+offset+8)%8;if(!blockedFor(p.x+DIR8[n].x,p.y+DIR8[n].y,p.r,p)){dir=n;break;}}
  return {dir,look:close?angTo(p.x,p.y,target.x,target.y):DIR8[want].a,aim:close?angTo(p.x,p.y,target.x,target.y):DIR8[want].a,fire:!!close,bomb:!!close,edges:[]};
}
let P = null;                       // 玩家
const ents = [];                    // 敌人 + 道具（星）
const pows = [];
const pbul = [], ebul = [], bombs = [];
const earc = [];                    // 敌方抛物线弹（轰炸机炸弹、敌方吉普手雷）
const runners = [];                 // 送往直升机的俘虏
const kits = [];                    // 修理包（营房炸开时掉落）
const pending = [];                 // 延时爆炸（油桶连爆）
let heli = null, craft = null, heliOut = null;

function ev(name, data) { G.events.push({ t: +G.t.toFixed(2), f: G.frame, name, data: data || null }); if (G.events.length > 2000) G.events.shift(); }
function banner(text, sub, dur) { G.banner = { text, sub: sub || '', t: dur || 2.2, id: Math.random() }; }
function toast(text) { G.toast = { text, t: 2.2, id: Math.random() }; }
function addScore(n) {
  G.score += n;
  if (G.settings.lives === 'classic' && G.score >= G.nextLife) { G.lives++; G.nextLife += 30000; A.star(); toast('奖励 1 命'); ev('extraLife'); }
}
export const STAGE_NAME = ['', '第一关', '第二关', '第三关', '第四关', '第五关', '第六关'];

// ---------- 初始化 ----------
export function init(sc, w, f, c) {
  scene = sc; world = w; fx = f; camCtl = c;
  // 投射物实例池
  projPools.pb = makeProjPool(new THREE.CapsuleGeometry(0.09, 0.5, 2, 6), new THREE.MeshBasicMaterial({ color: 0xfff27a }), 24, true);
  projPools.eb = makeProjPool(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a3d }), 80, false);
  projPools.sh = makeProjPool(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3d2a }), 30, false);
  projPools.sg = makeProjPool(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0.45, depthWrite: false }), 110, false);
  projPools.ms = makeProjPool((() => { const b = []; M.part(b, 'cyl', 0xf2f0ea, [0, 0, 0], [0.26, 1.0, 0.26]); M.part(b, 'cone', 0xd4553f, [0, 0.66, 0], [0.26, 0.34, 0.26]); M.part(b, 'cone', 0xffb347, [0, -0.7, 0], [0.22, 0.5, 0.22], [PI, 0, 0]); return M.merged(b); })(), M.MAT.toy, 24, true);
  projPools.ar = makeProjPool(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshLambertMaterial({ color: 0x3b3f42 }), 24, false);
  bombGeo.grenade = (() => { const b = []; M.part(b, 'sphere', 0x3f5f33, [0, 0, 0], [0.42, 0.42, 0.5]); M.part(b, 'cyl', 0x2b2b2b, [0, 0.18, 0], [0.18, 0.12, 0.18]); return M.merged(b); })();
  bombGeo.rocket = (() => { const b = []; M.part(b, 'cyl', 0xe9e4d4, [0, 0, 0], [0.24, 0.9, 0.24], [PI / 2, 0, 0]); M.part(b, 'cone', 0xd4553f, [0, 0, -0.6], [0.24, 0.32, 0.24], [-PI / 2, 0, 0]); M.part(b, 'box', 0x5a6a72, [0, 0, 0.4], [0.5, 0.06, 0.2]); M.part(b, 'box', 0x5a6a72, [0, 0, 0.4], [0.06, 0.5, 0.2]); return M.merged(b); })();
  bombGeo.rocket3 = (() => { const b = []; M.part(b, 'cyl', 0xffe08a, [0, 0, 0], [0.3, 1.0, 0.3], [PI / 2, 0, 0]); M.part(b, 'cone', 0xff7a2a, [0, 0, -0.66], [0.3, 0.36, 0.3], [-PI / 2, 0, 0]); M.part(b, 'box', 0xd4553f, [0, 0, 0.44], [0.6, 0.06, 0.24]); M.part(b, 'box', 0xd4553f, [0, 0, 0.44], [0.06, 0.6, 0.24]); return M.merged(b); })();
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(bombGeo.grenade, M.MAT.toy); m.visible = false; m.castShadow = true; scene.add(m); bombMeshes.push(m); }
  const flameGeo = new THREE.ConeGeometry(0.2, 0.8, 8); flameGeo.rotateX(PI / 2); flameGeo.translate(0, 0, 0.9);
  bombFlame = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  for (let i = 0; i < 12; i++) { const fm = new THREE.Mesh(flameGeo, bombFlame); fm.visible = false; scene.add(fm); bombFlames.push(fm); }
  // 护盾泡
  shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.9, 20, 14), new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.22, depthWrite: false }));
  shieldMesh.visible = false; scene.add(shieldMesh);
}
const projPools = {};
const bombGeo = {};
const bombMeshes = [], bombFlames = [];
let bombFlame = null, shieldMesh = null;
function makeProjPool(geo, mat, max, stretch) {
  const im = new THREE.InstancedMesh(geo, mat, max);
  im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(im);
  return { im, max, stretch };
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _r = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
function writeProj(pool, list, sizeFn) {
  let n = 0;
  for (const b of list) {
    if (n >= pool.max) break;
    _v.set(b.x, b.h, Z(b.y));
    if (pool.stretch) { _e.set(-PI / 2, 0, 0); _q.setFromEuler(_e); _r.setFromAxisAngle(_up, -b.a); _q.premultiply(_r); }
    else _q.identity();
    const s = sizeFn ? sizeFn(b) : 1; _s.set(s, s, s);
    _m.compose(_v, _q, _s); pool.im.setMatrixAt(n++, _m);
  }
  pool.im.count = n; pool.im.instanceMatrix.needsUpdate = true;
}

// ---------- 关卡切换 / 新局 / 标题 ----------
let gameNo = 0;
function ensureStage(n) { if (L.STAGE_NO !== n) { L.loadStage(n); world.rebuild(); } }
function setupScene() {
  clearAll();
  L.resetStatics(); world.resetAll();
  for (const slot of G.coop ? G.playerSlots : [0]) {
    makePlayer(slot); coopPlayers.push(P);
  }
  P=coopPlayers.find(p=>p.slot===localSlot)||coopPlayers[0];
  for (const s of L.spawns) spawnEntity(s);
  // 直升机停在机坪上
  heli = M.makeHeli(); heli.root.position.set(L.PAD.x, 0, Z(L.PAD.y + 1)); heli.root.rotation.y = PI * 0.85; scene.add(heli.root);
  heli.spin = 4; heli.x = L.PAD.x; heli.y = L.PAD.y + 1;
  // 第一关开场登陆艇
  craft = null;
  if (L.STAGE.intro === 'craft') { craft = M.makeLandingCraft(); craft.position.set(L.START.introFrom.x, -0.6, Z(L.START.introFrom.y - 1)); craft.rotation.y = -PI * 0.3; scene.add(craft); }
  heliOut = null;
}
function resetStageState() {
  Object.assign(G, {
    carried: 0, delivered: 0, freed: 0, cp: 0, ended: false, endT: 0, kills: emptyKills(), banner: null, toast: null,
    hits: 0, kitsPicked: 0, hurtFx: 0, introT: 0, stageT0: G.t, stageDeaths0: G.deaths,
    boss: { state: 'idle', type: L.BOSS.type, t: 0, spawned: 0, killed: 0, tanks: [], spawnT: 0, flow: null, flowT: 0 }
  });
}
function beginStage() {
  G.mode = 'intro';
  for (const p of allPlayers()) {
    p.armor = G.armorMax;
    p.x = L.START.introFrom.x + spawnOffset(p.slot); p.y = L.START.introFrom.y;
    p.dir = L.STAGE.intro === 'craft' ? 1 : L.START.dir; p.ang = DIR8[p.dir].a;
  }
  camCtl.snap(L.START.x + (L.STAGE.intro === 'craft' ? 1 : 0), L.START.y + (L.STAGE.intro === 'craft' ? 2 : 0));
  banner(STAGE_NAME[G.stage] + ' · ' + L.STAGE.title, L.STAGE.sub, 2.6);
  A.music(L.STAGE.music);
  ev('stageStart', { stage: G.stage, code: L.STAGE.code });
}
export function newGame(opts) {
  G.coop=!!opts.coop;G.playerSlots=opts.playerSlots||[0];localSlot=opts.localSlot||0;
  gameNo++;
  reseed(seed + (gameNo - 1) * 7919);
  const n = clamp(opts.stage || 1, 1, L.STAGE_COUNT);
  ensureStage(n);
  setupScene();
  Object.assign(G, {
    t: 0, frame: 0, score: 0, deaths: 0, lives: 3, demoUsed: !!opts.demo, weapon: 1, nextLife: 20000, stage: n, startStage: n,
    totalDelivered: 0, totalFreed: 0, cleared: 0,
    settings: { lives: opts.lives, demo: !!opts.demo, armor: opts.armor === 'classic' ? 'classic' : 'std', gun: opts.gun === 'follow' ? 'follow' : 'up' }, armorMax: opts.armor === 'classic' ? 1 : 3
  });
  resetStageState();
  G.events.length = 0;
  ev('newGame', { lives: opts.lives, demo: !!opts.demo, armor: G.settings.armor, gun: G.settings.gun, stage: n, seed, gameNo });
  beginStage();
  return true;
}
// 过关后进入下一关：分数、武器、命数、护甲模式都保留
export function nextStage() {
  const weapons=new Map(coopPlayers.map(p=>[p.slot,p.weapon||1]));
  const n = G.stage + 1;
  if (n > L.STAGE_COUNT) return false;
  ensureStage(n);
  setupScene();
  G.stage = n;for(const p of coopPlayers)p.weapon=weapons.get(p.slot)||1;
  resetStageState();
  beginStage();
  return true;
}
export function toTitle(stage) {
  G.coop=false;G.playerSlots=[0];localSlot=0;  if (stage) ensureStage(stage);
  setupScene();
  G.coop=false;G.playerSlots=[0];localSlot=0;
  G.mode = 'title'; G.banner = null; G.toast = null; G.boss = { state: 'idle' }; G.carried = 0; G.ended = false;
  A.music(null); A.engine('off');
}
function clearAll() {
  for (const e of ents) if (e.objRoot) scene.remove(e.objRoot);
  for (const p of pows) scene.remove(p.obj.root);
  for (const r of runners) scene.remove(r.obj.root);
  for (const k of kits) scene.remove(k.obj.root);
  kits.length = 0;
  ents.length = 0; pows.length = 0; runners.length = 0; pbul.length = 0; ebul.length = 0; bombs.length = 0; pending.length = 0; earc.length = 0;
  for(const p of coopPlayers)scene.remove(p.obj.root);coopPlayers=[];nextNetId=1;
  if (P) scene.remove(P.obj.root);
  if (heli) scene.remove(heli.root);
  if (craft) scene.remove(craft);
  if (heliOut && heliOut.obj) scene.remove(heliOut.obj.root);
  heliOut = null;
  fx && fx.clear();
}

const TEAM_COLORS = [M.C.olive, 0xa56b53, 0x648eaa, 0xb79b52];
function spawnOffset(slot) { return G.coop ? slot * 2.2 : 0; }
function makePlayer(slot = 0) {
  const obj = M.makeJeep(G.coop ? TEAM_COLORS[slot] : M.C.olive);markTree(obj.root);
  scene.add(obj.root);
  P = { slot, weapon: 1, carried: 0, x: L.START.x + spawnOffset(slot), y: L.START.y, dir: L.START.dir, ang: DIR8[L.START.dir].a, r: 0.82, alive: true, invuln: 0, shield: 0, armor: G.armorMax || 3, hitFlash: 0, smokeT: 0, respawnT: 0, fireCd: 0, bombCd: 0, moving: false, obj, wheelSpin: 0, bob: 0, dust: 0, speed: 8.6 };
}

function spawnEntity(s) {
  const type = s.t === 'mg' && s.look === 'turret' ? 'turret' : s.t;
  const st = ENEMY_STATS[type];
  const e = { netId:nextNetId++, type, x: s.x, y: s.y, hx: s.x, hy: s.y, alive: true, active: false, t: rand() * 5, fireT: randRange(1.2, 2.4), ang: PI, tAng: PI, data: s, h: 0, hitT: 0 };
  if (st) Object.assign(e, { hp: st.hp, maxHp: st.hp, r: st.r, solid: st.solid, bulletProof: !!st.bulletProof, oneShot: !!st.oneShot, air: !!st.air });
  if (type === 'soldier' || type === 'officer') {
    e.obj = M.makeSoldier(type); e.goal = null; e.state = 'idle'; e.aimT = 0; e.speed = 2.1;
    if (s.guard) { e.fireT = randRange(0.8, 1.6); }
  } else if (type === 'mg') { e.obj = M.makeNest(); e.burst = 0; }
  else if (type === 'turret') { e.obj = M.makeCannon(); e.fireT = randRange(1.5, 2.6); } // 原作两关普通固定炮台同型，复用炮台而非有人沙袋机枪巢；保留本关射击行为
  else if (type === 'cannon') { e.obj = M.makeCannon(); e.h = s.elevated ? 2.6 : 0; e.elevated = !!s.elevated; e.fireT = randRange(1.5, 2.5); }
  else if (type === 'tank') {
    const brown = s.paint === 'brown';
    e.obj = M.makeTank(brown ? 'brownS' : 'normal'); e.patrol = s.patrol || null; e.pi = 0; e.speed = brown ? 3.0 : 2.6; e.fireT = randRange(1.8, 2.8);
    if (brown) { e.hp = e.maxHp = 4; e.killKey = 'brownTank'; }
  } else if (type === 'bulltank') { e.obj = M.makeTank('bull'); e.patrol = s.patrol || null; e.pi = 0; e.speed = 3.8; e.fireT = randRange(1.4, 2.2); }
  else if (type === 'ejeep') { e.obj = M2.makeEJeep(); e.speed = 5.2; e.fireT = randRange(1.6, 2.6); e.ang = PI; }
  else if (type === 'boat') { e.obj = M.makeBoat(); e.vx = (s.dir || 1) * 3.4; e.h = -0.35; e.range = s.range; e.ang = e.vx > 0 ? PI / 2 : -PI / 2; }
  else if (type === 'boss') { e.obj = M.makeTank('blue'); e.speed = 4.0; e.fireT = 1.6; e.burst = 0; e.stage = 1; e.enter = true; e.boss = true; }
  else if (type === 'bomber') { e.obj = M2.makeBomber(); e.state = 'wait'; e.h = 7; e.obj.root.visible = false; e.ang = PI; }
  else if (type === 'wstatue') { e.obj = M2.makeWaterStatue(); e.h = -0.2; e.fireT = randRange(1.5, 3.5); e.ang = PI; }
  else if (type === 'bust') { e.obj = M2.makeBust(); e.ang = PI; e.boss = true; e.phase = 'idle'; e.fireT = 2.2 + (s.order || 0) * 1.1; }
  else if (type === 'fallpillar') { e.obj = M2.makeFallPillar(); e.state = 'stand'; e.fall = 0; e.len = s.len || 6; e.fdir = s.dir || 1; e.ang = 0; }
  else if (type === 'star') { e.obj = M.makeStar(s.item); e.item = s.item || 'bomb'; e.hidden = !!s.hidden; e.obj.root.visible = !e.hidden; e.r = 1; e.solid = false; e.hp = 1; }
  markTree(e.obj.root);
  const root = e.obj.root;
  root.position.set(e.x, e.h, Z(e.y));
  root.rotation.y = -e.ang;
  scene.add(root);
  e.obj.root.userData.ent = e;
  e.objRoot = root;
  ents.push(e);
  return e;
}

// 实体形状：圆形；倒下的石柱是胶囊（线段 + 半径）
function entD2(e, x, y) {
  if (e.capsule) {
    const c = e.capsule, dx = c.bx - c.ax, dy = c.by - c.ay, l = dx * dx + dy * dy;
    let t = l ? ((x - c.ax) * dx + (y - c.ay) * dy) / l : 0; t = clamp(t, 0, 1);
    return dist2(x, y, c.ax + dx * t, c.ay + dy * t);
  }
  return dist2(x, y, e.x, e.y);
}

// ---------- 碰撞 ----------
function circleHitsGrid(x, y, r) {
  const i0 = L.ci(x - r), i1 = L.ci(x + r), j0 = L.cj(y - r), j1 = L.cj(y + r);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = L.cellX(i), cy = L.cellY(j);
    if (!L.blockedMove(cx, cy)) continue;
    const nx = clamp(x, cx - 0.5, cx + 0.5), ny = clamp(y, cy - 0.5, cy + 0.5);
    if ((x - nx) ** 2 + (y - ny) ** 2 < r * r - 1e-6) return true;
  }
  return false;
}
function circleHitsSolids(x, y, r, self) {
  for (const e of ents) {
    if (!e.alive || !e.solid || e === self || e.elevated) continue;
    if (entD2(e, x, y) < (r + (e.capsule ? e.capsule.r : e.r)) ** 2) return e;
  }
  if (heli && self !== heli && (x - heli.x) ** 2 + (y - heli.y) ** 2 < (r + 1.6) ** 2) return heli;
  if (self && self !== P && P && P.alive && (x - P.x) ** 2 + (y - P.y) ** 2 < (r + P.r) ** 2) return P;
  return null;
}
const blockedFor = (x, y, r, self) => circleHitsGrid(x, y, r) || !!circleHitsSolids(x, y, r, self);

// 轴分离移动 + 转角滑移，返回是否移动了
function moveBody(b, dx, dy, r, self, assist) {
  let moved = false;
  if (dx) { if (!blockedFor(b.x + dx, b.y, r, self)) { b.x += dx; moved = true; } else if (assist && !dy) moved = slide(b, dx, 0, r, self) || moved; }
  if (dy) { if (!blockedFor(b.x, b.y + dy, r, self)) { b.y += dy; moved = true; } else if (assist && !dx) moved = slide(b, 0, dy, r, self) || moved; }
  return moved;
}
function slide(b, dx, dy, r, self) {
  // 被挡住时检查侧向 0.9 内是否有空位，有则向那边轻推，便于钻过路口
  for (const off of [0.3, 0.6, 0.9]) for (const s of [1, -1]) {
    const ox = dy ? s * off : 0, oy = dx ? s * off : 0;
    if (!blockedFor(b.x + ox + dx, b.y + oy + dy, r, self) && !blockedFor(b.x + ox * 0.35, b.y + oy * 0.35, r, self)) {
      b.x += ox ? Math.sign(ox) * 0.07 : 0; b.y += oy ? Math.sign(oy) * 0.07 : 0; return true;
    }
  }
  return false;
}

// ---------- 主更新 ----------
export function update() {
  const dt = STEP;
  G.t += dt; G.frame++;
  if (G.hurtFx > 0) G.hurtFx = Math.max(0, G.hurtFx - dt / 0.45);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }
  if (G.mode === 'intro') updateIntro(dt);
  else if (G.mode === 'play') for(const p of allPlayers()){if(p.disconnected)continue;withPlayer(p,()=>{p.netInput=G.coop?inputProvider(p.slot):null;IN.network=p.netInput;updatePlayer(dt);IN.network=null;});}
  else if (G.mode === 'clear') updateClear(dt);
  else if (G.mode === 'over') { G.endT += dt; if (G.endT > 2.2 && !G.ended) endGame(false, 'lives'); }
  if (G.mode === 'play' || G.mode === 'clear' || G.mode === 'over') {
    updateEnts(dt);for(const p of allPlayers()){if(p.disconnected)continue;withPlayer(p,()=>{updatePows(p===allPlayers()[0]?dt:0);updateKits(p===allPlayers()[0]?dt:0);});} updateBullets(dt); updateBombs(dt); updateArcs(dt); updateBoss(dt);
    for (let i = pending.length - 1; i >= 0; i--) { pending[i].t -= dt; if (pending[i].t <= 0) { const p = pending.splice(i, 1)[0]; p.fn(); } }
  }
  if (heli) { heli.spin = heli.spin || 4; }
}

function updateIntro(dt) {
  G.introT += dt;
  const k = Math.min(1, G.introT / 1.7), s = k * k * (3 - 2 * k);
  for (const p of allPlayers()) {
    if (p.disconnected) continue;
    p.x = L.START.introFrom.x + (L.START.x - L.START.introFrom.x) * s + spawnOffset(p.slot);
    p.y = L.START.introFrom.y + (L.START.y - L.START.introFrom.y) * s;
    p.moving = k < 1;
    if (L.STAGE.intro === 'craft') { p.dir = 1; p.ang = DIR8[1].a + (DIR8[2].a - DIR8[1].a) * s; }
    if (k >= 1) { p.dir = L.START.dir; p.ang = DIR8[L.START.dir].a; p.invuln = 1.2; }
  }
  if (k >= 1) { G.mode = 'play'; ev('introDone'); }
}

function updatePlayer(dt) {
  if (P.invuln > 0) P.invuln -= dt;
  if (P.shield > 0) P.shield -= dt;
  if (!P.alive) {
    P.respawnT -= dt;
    if (P.respawnT <= 0) respawn();
    return;
  }
  const d0 = IN.dir();
  let d = d0;
  // 方向换算：输入始终相对画面（镜头）。常规视角按镜头 yaw 换算；第一人称按车头+yaw 换算，
  // 且按住同一输入期间锁定换算结果（镜头会随车头转，避免画圈）。
  if (d0 >= 0) {
    if(P.netInput){d=P.netInput.dir??-1;} else if (camCtl.fpNow) {
      const q = ((Math.round((P.ang + camCtl.yaw) / (Math.PI / 4)) % 8) + 8) % 8;
      if (!fpLatch || fpLatch.d !== d0 || fpLatch.revision !== camCtl.lookRevision) fpLatch = { d: d0, w: (d0 + q) % 8, revision: camCtl.lookRevision };
      d = fpLatch.w;
    } else {
      const q = ((Math.round(camCtl.yaw / (Math.PI / 4)) % 8) + 8) % 8;
      // 环绕镜头从目标点向外的 yaw，与实际观察前向量的角度符号相反。
      d = (d0 - q + 8) % 8;
      fpLatch = null;
    }
  } else fpLatch = null;
  P.moving = false;
  if (d >= 0) {
    P.dir = d;
    if (!camCtl.fpNow) delete P.lookHeading;
    const sp = P.speed * dt, dx = DIR8[d].x * sp, dy = DIR8[d].y * sp;
    const ox = P.x, oy = P.y;
    moveBody(P, Math.abs(dx) < 1e-6 ? 0 : dx, Math.abs(dy) < 1e-6 ? 0 : dy, P.r, P, true);
    P.moving = (P.x !== ox || P.y !== oy);
    if (P.moving) { P.wheelSpin += sp * 2.6; P.dust += dt; if (P.dust > 0.07) { P.dust = 0; const t = L.terrainAt(P.x, P.y); if (t === L.T.SAND || t === L.T.ROAD || t === L.T.DIRT || t === L.T.FLOOR || t === L.T.STONE) fx.dust(P.x - DIR8[d].x * 1.2, P.y - DIR8[d].y * 1.2); } }
  }
  const oldAng = P.ang;
  const targetAng = P.netInput ? (P.netInput.look ?? DIR8[P.dir].a) : camCtl.fpNow ? P.ang + camCtl.yaw : P.lookHeading !== undefined ? P.lookHeading : DIR8[P.dir].a;
  P.ang = approachAng(P.ang, targetAng, dt * (camCtl.fpNow ? 2.1 : 16));
  // 补偿实际模型转角，而非一次扣掉目标方向的 45°/90°：平移、倒车不会甩动玩家视线。
  if (camCtl.fpNow && !P.netInput) camCtl.rotate(-angDiff(oldAng, P.ang));
  // 机枪：默认固定向北（原作朝上）；可选跟随车头。U 共用两种武器原有冷却与弹数上限。
  P.fireCd -= dt; P.bombCd -= dt;
  const mgCount = pbul.filter(b => b.kind === 'mg' && b.slot === P.slot).length;
  if ((IN.take('fireTap') || IN.fire()) && P.fireCd <= 0 && mgCount < 6) {
    const a = gunAngle();
    const tx = P.x - Math.sin(P.ang) * 0.82, ty = P.y - Math.cos(P.ang) * 0.82;
    const mx = tx + Math.sin(a) * 1.1, my = ty + Math.cos(a) * 1.1;
    pbul.push({ kind: 'mg', slot: P.slot, x: mx, y: my, h: 1.58, a, vx: Math.sin(a) * 26, vy: Math.cos(a) * 26, life: 0.7, r: 0.16 });
    fx.muzzle(mx, my, 1.58, a);
    P.fireCd = 0.1; A.mg(); G.mgShots = (G.mgShots || 0) + 1;
  }
  if ((IN.take('bombTap') || IN.bomb()) && P.bombCd <= 0) fireBomb();
  // 碾压步兵
  for (const e of ents) {
    if (!e.alive || (e.type !== 'soldier' && e.type !== 'officer')) continue;
    if ((P.x - e.x) ** 2 + (P.y - e.y) ** 2 < 1.15 * 1.15) killEnemy(e, 'squash');
  }
  // 检查点（needGone：要先炸掉某个大门才算进入）
  for (let k = G.cp + 1; k < L.CHECKPOINTS.length; k++) {
    const c = L.CHECKPOINTS[k];
    if (P.y >= c.ty && (!c.needGone || !c.needGone.alive)) {
      G.cp = k; A.checkpoint();
      const refill = P.armor < G.armorMax;
      P.armor = G.armorMax;
      toast('检查点：' + c.name + (refill ? ' · 护甲已补满' : ''));
      ev('checkpoint', { k, name: c.name, refill });
    }
  }
  // 直升机坪送达
  if (G.carried > 0 && heli && (P.x - L.PAD.x) ** 2 + (P.y - L.PAD.y) ** 2 < (L.PAD.r + 1.6) ** 2 && G.boss.state === 'idle') {
    P.deliverT = (P.deliverT || 0) - dt;
    if (P.deliverT <= 0) { P.deliverT = 0.28; deliverOne(); }
  }
  // Boss 触发
  if (G.boss.state === 'idle' && P.y > L.BOSS.trigger) startBoss();
}
export function gunAngle() { return G.settings.gun === 'up' ? 0 : P.netInput ? (P.netInput.aim??P.ang) : camCtl.fpNow ? P.ang + camCtl.yaw : P.ang; }

function fireBomb() {
  const w = G.weapon, a = P.netInput ? (P.netInput.aim??P.ang) : camCtl.fpNow ? P.ang + camCtl.yaw : P.ang;
  const d = { x: Math.sin(a), y: Math.cos(a), a };
  const live = bombs.filter(b => b.own && b.slot === P.slot && b.kind !== 'shrap').length;
  const max = w <= 2 ? 2 : 3;
  if (live >= max) return;
  const sx = P.x + d.x * 1.1, sy = P.y + d.y * 1.1;
  if (w === 1) {
    let range = 9;
    // 对准射程内的大门时缩短落点，避免贴门投弹飞到门后、完全打不到门。
    // 只调整仍存活的大门；空地、营房与崖顶继续使用原来的抛物线投掷。
    for (let r = 1.1; r <= 9; r += 0.2) {
      const target = L.staticAt(P.x + d.x * r, P.y + d.y * r);
      if (target && target.alive && target.kind === 'gate') { range = r; break; }
    }
    bombs.push({ own: true, slot: P.slot, kind: 'grenade', x: sx, y: sy, sx, sy, tx: P.x + d.x * range, ty: P.y + d.y * range, t: 0, dur: 0.62, h: 1.1, a: d.a });
    P.bombCd = 0.34; A.grenade();
  } else {
    const sp = w === 2 ? 22 : 26, range = w === 2 ? 13 : 16;
    bombs.push({ own: true, slot: P.slot, kind: w === 2 ? 'rocket' : 'rocket3', spread: w === 3 ? 2 : w === 4 ? 4 : 0, x: sx, y: sy, vx: d.x * sp, vy: d.y * sp, life: range / sp, h: 1.0, a: d.a, smokeT: 0 });
    P.bombCd = w === 2 ? 0.28 : 0.24; A.rocket();
  }
  fx.muzzle(sx, sy, 1.0, d.a, true);
  ev('bomb', { weapon: w, dir: P.dir });
}

// 受击：标准模式扣 1 格护甲并短暂无敌；最后一格（或经典一发模式）被打中才会被击毁
export function hitPlayer(cause) {
  if (!P.alive || P.invuln > 0 || P.shield > 0 || G.settings.demo || G.mode !== 'play') return false;
  if (P.armor > 1) {
    P.armor--; P.invuln = 1.2; P.hitFlash = 0.22; G.hitId++; G.hits++; G.hurtFx = 1;
    fx.hit(P.x, P.y, 1.2, 0xffd27a); fx.debris(P.x, P.y, 0.8, M.C.oliveD, 4, 0.6); fx.smoke(P.x, P.y, 0.8, 2, 0x5a5550);
    fx.shake = Math.max(fx.shake, 0.22);
    A.hurt();
    ev('playerHit', { cause, armor: P.armor, x: +P.x.toFixed(1), y: +P.y.toFixed(1) });
    return 'hit';
  }
  return killPlayer(cause) ? 'down' : false;
}
export function killPlayer(cause) {
  if (!P.alive || P.invuln > 0 || P.shield > 0 || G.settings.demo || G.mode !== 'play') return false;
  P.alive = false; P.respawnT = 1.9; P.armor = 0;
  G.deaths++; G.hitId++; G.hurtFx = 1;
  fx.bigExplosion(P.x, P.y, 0.5, 1.4); fx.debris(P.x, P.y, 0.6, M.C.olive, 12, 1.2); fx.debris(P.x, P.y, 0.6, M.C.tire, 6);
  A.playerDown();
  const lostWeapon = G.weapon;
  G.weapon = 1;
  // 车上俘虏散落在附近（可再次接回）
  const n = G.carried; G.carried = 0;
  for (let k = 0; k < n; k++) {
    const a = k / Math.max(1, n) * PI * 2 + rand(), r = 1.6 + rand() * 1.2;
    let x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
    if (circleHitsGrid(x, y, 0.35)) { x = P.x; y = P.y; }
    spawnPow(x, y, false, true);
  }
  P.obj.root.visible = false;
  if (n > 0) toast(n + ' 名俘虏散落在阵亡处，回去把他们接上车');
  ev('playerDown', { cause, x: +P.x.toFixed(1), y: +P.y.toFixed(1), dropped: n, weaponWas: lostWeapon, deaths: G.deaths });
  if (G.settings.lives === 'classic') {
    G.lives--;
    if (G.lives < 0) { G.mode = 'over'; G.endT = 0; A.music(null); A.gameOver(); banner('GAME OVER', '', 3); ev('gameOver'); }
  }
  return true;
}
function respawn() {
  const bossOn = G.boss.state === 'intro' || G.boss.state === 'fight';
  const cp = bossOn ? L.BOSS.respawn : L.CHECKPOINTS[G.cp];
  let x = cp.x, y = cp.y;
  // 出生点被占时就近找空位
  outer: for (let r = 0; r < 6; r += 1) for (let k = 0; k < 12; k++) {
    const a = k / 12 * PI * 2, tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
    if (!blockedFor(tx, ty, P.r, P)) { x = tx; y = ty; break outer; }
  }
  P.x = x; P.y = y; P.alive = true; P.invuln = 2.6; P.dir = 0; P.ang = 0; delete P.lookHeading; P.lookRevision = camCtl.lookRevision; P.armor = G.armorMax;
  P.obj.root.visible = true;
  // 清掉附近敌弹，避免复活即被击中
  for (let i = ebul.length - 1; i >= 0; i--) if ((ebul[i].x - x) ** 2 + (ebul[i].y - y) ** 2 < 14 * 14) ebul.splice(i, 1);
  for (let i = earc.length - 1; i >= 0; i--) if ((earc[i].tx - x) ** 2 + (earc[i].ty - y) ** 2 < 14 * 14) earc.splice(i, 1);
  // 防止复活点被压制：附近敌人推迟开火
  for (const e of ents) if (e.alive && dist2(e.x, e.y, x, y) < 15 * 15) { e.fireT = Math.max(e.fireT || 0, 2.4 + rand()); e.burst = 0; e.aimT = 0; }
  if(P.slot===localSlot)camCtl.snap(x, y);
  ev('respawn', { x: +x.toFixed(1), y: +y.toFixed(1), cp: bossOn ? 'boss' : G.cp });
}

// ---------- 俘虏 ----------
function spawnPow(x, y, flash, dropped) {
  const obj = M.makePow(flash);
  obj.root.position.set(x, 0, Z(y));
  scene.add(obj.root);
  const p = { x, y, hx: x, hy: y, flash, obj, t: rand() * 3, jump: dropped ? 0 : 0.6, goal: null, alive: true };
  pows.push(p);
  return p;
}
function releasePows(x, y, n, flash) {
  for (let k = 0; k < n + flash; k++) {
    const a = PI * 1.5 + (k - (n + flash - 1) / 2) * 0.7;
    let px = x + Math.cos(a) * 0.3, py = y - 0.4;
    const p = spawnPow(px, py, k < flash, false);
    p.vx = Math.cos(a) * 2.2; p.vy = Math.sin(a) * 2.2;
    G.freed++;
  }
  A.powFree();
  ev('powFreed', { n, flash, x: +x.toFixed(1), y: +y.toFixed(1) });
}
function upgradeWeapon(to) {
  const was = G.weapon;
  G.weapon = Math.min(MAX_WEAPON, to);
  A.upgrade();
  banner('武器升级：' + WEAPON_NAME[G.weapon], WEAPON_DESC[G.weapon], 2.2);
  ev('upgrade', { weapon: G.weapon, from: was });
}
function updatePows(dt) {
  for (let i = pows.length - 1; i >= 0; i--) {
    const p = pows[i];
    p.t += dt;
    if (p.vx || p.vy) {
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (!circleHitsGrid(nx, ny, 0.3)) { p.x = nx; p.y = ny; }
      p.vx *= 0.9; p.vy *= 0.9; if (Math.abs(p.vx) + Math.abs(p.vy) < 0.05) { p.vx = 0; p.vy = 0; p.hx = p.x; p.hy = p.y; }
    } else {
      // 原地小范围踱步、挥手
      if (!p.goal || p.t > p.goalT) { p.goal = { x: p.hx + (rand() - 0.5) * 2, y: p.hy + (rand() - 0.5) * 2 }; p.goalT = p.t + 1.5 + rand() * 2; }
      const dx = p.goal.x - p.x, dy = p.goal.y - p.y, l = Math.hypot(dx, dy);
      if (l > 0.1) { const s = Math.min(l, 0.9 * dt); const nx = p.x + dx / l * s, ny = p.y + dy / l * s; if (!circleHitsGrid(nx, ny, 0.3)) { p.x = nx; p.y = ny; } }
    }
    const o = p.obj;
    let hop = 0;
    if (p.jump > 0) { p.jump -= dt; hop = Math.sin((0.6 - p.jump) / 0.6 * PI) * 0.9; }
    else hop = Math.abs(Math.sin(p.t * 6)) * 0.12;
    o.root.position.set(p.x, hop, Z(p.y));
    o.root.rotation.y = Math.sin(p.t * 0.7) * 0.5;
    o.arms[0].rotation.z = 2.6 + Math.sin(p.t * 9) * 0.35; o.arms[1].rotation.z = -2.6 - Math.sin(p.t * 9 + 1) * 0.35;
    if (o.star) { o.star.rotation.y += dt * 3; o.star.position.y = 2.25 + Math.sin(p.t * 4) * 0.12; }
    if (o.ring) { const s = 1 + Math.sin(p.t * 6) * 0.12; o.ring.scale.set(s, s, 1); }
    // 接上车
    if (P.alive && G.mode === 'play' && (P.x - p.x) ** 2 + (P.y - p.y) ** 2 < 1.5 * 1.5) {
      scene.remove(o.root); pows.splice(i, 1);
      G.carried++;
      fx.sparkle(p.x, p.y, 1, p.flash ? 0xffe36b : 0xffffff);
      if (p.flash) {
        if (G.weapon < MAX_WEAPON) upgradeWeapon(G.weapon + 1);
        else { addScore(POINTS.flashMax); A.upgrade(); toast('火力已满 +' + POINTS.flashMax); ev('flashMax'); }
      } else A.powPick();
      ev('powPicked', { carried: G.carried, flash: p.flash });
    }
  }
  // 送往直升机的俘虏
  for (let i = runners.length - 1; i >= 0; i--) {
    const r = runners[i];
    r.t += dt;
    const dx = r.tx - r.x, dy = r.ty - r.y, l = Math.hypot(dx, dy);
    if (l < 0.3) { scene.remove(r.obj.root); runners.splice(i, 1); continue; }
    const s = Math.min(l, 5 * dt); r.x += dx / l * s; r.y += dy / l * s;
    r.obj.root.position.set(r.x, Math.abs(Math.sin(r.t * 14)) * 0.25, Z(r.y));
    r.obj.root.rotation.y = -Math.atan2(dx, dy);
    r.obj.arms[0].rotation.z = 2.4; r.obj.arms[1].rotation.z = -2.4;
  }
}
function deliverOne() {
  if (G.carried <= 0) return;
  G.carried--; G.delivered++; G.totalDelivered = (G.totalDelivered || 0) + 1;
  addScore(POINTS.pow);
  const obj = M.makePow(false);
  scene.add(obj.root);
  runners.push({ x: P.x, y: P.y, tx: heli.x, ty: heli.y, t: 0, obj });
  A.powDeliver();
  if (G.carried === 0) toast('俘虏已送上直升机：本关累计 ' + G.delivered + ' 名');
  ev('powDelivered', { delivered: G.delivered });
}

// ---------- 修理包 ----------
function spawnKit(x, y) {
  if (circleHitsGrid(x, y, 0.5)) { x = x + (x < 0 ? 1 : -1); }
  const obj = M.makeRepairKit();
  obj.root.position.set(x, 0, Z(y));
  scene.add(obj.root);
  kits.push({ x, y, t: rand() * 3, obj, pop: 0.5, told: -99 });
  ev('kitDropped', { x: +x.toFixed(1), y: +y.toFixed(1) });
}
function updateKits(dt) {
  for (let i = kits.length - 1; i >= 0; i--) {
    const k = kits[i];
    k.t += dt;
    if (k.pop > 0) k.pop -= dt;
    const o = k.obj;
    o.box.position.y = 0.75 + Math.sin(k.t * 3) * 0.12 + (k.pop > 0 ? Math.sin((0.5 - k.pop) / 0.5 * PI) * 1.2 : 0);
    o.box.rotation.y += dt * 1.6;
    const sc = 1 + Math.sin(k.t * 5) * 0.08; o.ring.scale.set(sc, sc, 1);
    if (!P.alive || G.mode !== 'play' || dist2(k.x, k.y, P.x, P.y) > 1.7 * 1.7) continue;
    if (G.armorMax === 1) {
      addScore(POINTS.repair); A.powPick(); toast('修理包 +' + POINTS.repair + ' 分（经典一发模式没有护甲）');
    } else if (P.armor < G.armorMax) {
      P.armor++; A.repair(); toast('修理包：护甲 +1');
    } else {
      // 护甲满时留在原地，之后可以回来拿；开过去时提示一下，免得以为捡不起来
      if (G.t - k.told > 5) { k.told = G.t; toast('护甲已满：修理包先留着，受伤后再回来拿'); ev('kitFull'); }
      continue;
    }
    fx.sparkle(k.x, k.y, 1, 0x9cf2a0);
    scene.remove(o.root); kits.splice(i, 1);
    G.kitsPicked++;
    ev('kitPicked', { armor: P.armor, classic: G.armorMax === 1 });
  }
}

// ---------- 敌人 ----------
function inView(x,y,m){
  if(!G.coop)return camCtl.inView(x,y,m);
  const local=coopPlayers.find(p=>p.slot===localSlot)||P;
  return allPlayers().some(p=>!p.disconnected&&camCtl.inView(x-(p.x-local.x),y-(p.y-local.y),m));
}
function enemyFire(e, a, kind, opts) {
  const o = opts || {};
  const sp = kind === 'shell' ? (o.speed || 7.5) : kind === 'missile' ? (o.speed || 6) : (o.speed || 8.0);
  const h = (e.h || 0) + (o.h0 !== undefined ? o.h0 : kind === 'shell' ? 1.2 : 0.9);
  const muzzleAngle = o.muzzleAngle !== undefined ? o.muzzleAngle : a;
  const ox = e.x + Math.sin(muzzleAngle) * (o.muzzle || 0.6), oy = e.y + Math.cos(muzzleAngle) * (o.muzzle || 0.6);
  const b = { kind, x: ox, y: oy, h, a, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp, life: o.life || (kind === 'shell' ? 2.6 : kind === 'missile' ? 5.5 : 1.8), r: kind === 'shell' ? 0.34 : kind === 'missile' ? 0.32 : 0.2, high: !!e.elevated || !!o.high, trail: 0 };
  if (kind === 'missile') { b.homing = o.homing ? 2.6 : 0; b.sp = sp; b.hp = 1; }
  ebul.push(b);
  fx.muzzle(ox, oy, h, a, kind !== 'bullet');
  if (kind === 'shell') A.shell(); else if (kind === 'missile') A.missile(); else A.enemyShot();
  return b;
}
// 抛物线投掷物（敌方吉普的手雷、轰炸机的炸弹）
function enemyLob(x, y, h0, tx, ty, dur, radius) {
  earc.push({ x, y, h: h0, sx: x, sy: y, h0, tx, ty, t: 0, dur, r: radius || 1.5 });
}
function aimAt(e) { return angTo(e.x, e.y, P.x, P.y) + (rand() - 0.5) * 0.12; }

function updateEnts(dt) {
  const savedP=P;
  const bossFight = G.boss.state === 'fight' || G.boss.state === 'intro';
  for (let i = ents.length - 1; i >= 0; i--) {
    const e = ents[i];P=nearestPlayer(e.x,e.y);
    if (e.dead) {
      e.deadT -= dt;
      if (e.deadT < 1.2) e.objRoot.position.y -= dt * 0.8;
      if (e.smokeT !== undefined) { e.smokeT -= dt; if (e.smokeT <= 0 && e.deadT > 1.5) { e.smokeT = 0.25; fx.smoke(e.x, e.y, (e.h || 0) + 1, 1); } }
      if (e.deadT <= 0) { scene.remove(e.objRoot); ents.splice(i, 1); }
      continue;
    }
    if (!e.alive) continue;
    e.t += dt;
    if (e.hitT > 0) e.hitT -= dt;
    const wasActive = e.active;
    e.active = inView(e.x, e.y, -3);
    if (e.type === 'star') { updateStar(e, dt); continue; }
    if (e.type === 'bomber') { bomberAI(e, dt); syncEnt(e, dt); continue; }
    if (e.type === 'fallpillar') { fallPillarAI(e, dt); syncEnt(e, dt); continue; }
    if (!e.active && !e.boss) { if (wasActive && e.type === 'boat') { /* 炮艇离开画面继续巡航 */ } if (e.type !== 'boat') { syncEnt(e, dt); continue; } }
    const canShoot = P.alive && G.mode === 'play' && inView(e.x, e.y, 1.2) && !(bossFight && !e.boss);
    const d2p = dist2(e.x, e.y, P.x, P.y);
    switch (e.type) {
      case 'soldier': case 'officer': soldierAI(e, dt, canShoot, d2p); break;
      case 'mg': {
        e.tAng = approachAng(e.tAng, angTo(e.x, e.y, P.x, P.y), dt * 3);
        e.fireT -= dt;
        if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0 && canShoot) { e.burst--; e.burstT = 0.13; enemyFire(e, e.tAng + (rand() - 0.5) * 0.1, 'bullet', { muzzle: 1 }); } }
        else if (e.fireT <= 0 && canShoot && d2p < 15 * 15) { e.burst = 3; e.burstT = 0; e.fireT = randRange(2.6, 3.3); }
        break;
      }
      case 'turret': {
        // 一组三发扇形子弹
        const want = angTo(e.x, e.y, P.x, P.y);
        e.tAng = approachAng(e.tAng, want, dt * 2.2);
        e.fireT -= dt;
        if (e.fireT <= 0 && canShoot && d2p < 15 * 15 && Math.abs(angDiff(e.tAng, want)) < 0.25) { for (const s of [-0.22, 0, 0.22]) enemyFire(e, e.tAng + s, 'bullet', { muzzle: 2.06, muzzleAngle: e.tAng, h0: 1.2, speed: 7.5 }); e.fireT = randRange(2.4, 3.2); }
        break;
      }
      case 'cannon': {
        const want = angTo(e.x, e.y, P.x, P.y);
        e.tAng = approachAng(e.tAng, want, dt * 1.6);
        e.fireT -= dt;
        if (e.fireT <= 0 && canShoot && d2p < 17.5 * 17.5 && Math.abs(angDiff(e.tAng, want)) < 0.16) { enemyFire(e, e.tAng, 'shell', { muzzle: 2.0, speed: 7.0 }); e.fireT = randRange(3.0, 3.7); e.recoil = 0.25; }
        break;
      }
      case 'tank': case 'bulltank': tankAI(e, dt, canShoot, d2p); break;
      case 'ejeep': ejeepAI(e, dt, canShoot, d2p); break;
      case 'wstatue': {
        e.fireT -= dt;
        if (e.fireT <= 0 && canShoot && d2p < 20 * 20) { enemyFire(e, angTo(e.x, e.y, P.x, P.y), 'missile', { muzzle: 0.8, h0: 2.4, speed: 6.5, life: 4 }); e.fireT = randRange(3.2, 4.2); e.recoil = 0.3; }
        break;
      }
      case 'bust': bustAI(e, dt, canShoot); break;
      case 'boat': {
        e.x += e.vx * dt;
        if (e.x > e.range[1]) { e.x = e.range[1]; e.vx = -Math.abs(e.vx); }
        if (e.x < e.range[0]) { e.x = e.range[0]; e.vx = Math.abs(e.vx); }
        e.ang = approachAng(e.ang, e.vx > 0 ? PI / 2 : -PI / 2, dt * 2.5);
        e.tAng = approachAng(e.tAng, angTo(e.x, e.y, P.x, P.y), dt * 2.5);
        e.fireT -= dt;
        if (e.fireT <= 0 && canShoot && d2p < 18 * 18) { enemyFire(e, e.tAng, 'shell', { muzzle: 1.2, speed: 7.5, high: true }); e.fireT = randRange(2.4, 3.1); }
        break;
      }
      case 'boss': bossAI(e, dt, canShoot, d2p); break;
    }
    syncEnt(e, dt);
  }
  P=savedP;
}
function soldierAI(e, dt, canShoot, d2p) {
  const hold = e.data.hold;
  e.fireT -= dt;
  if (e.aimT > 0) {
    e.aimT -= dt; e.ang = approachAng(e.ang, angTo(e.x, e.y, P.x, P.y), dt * 10);
    if (e.aimT <= 0 && canShoot) {
      const a = aimAt(e);
      if (e.type === 'officer') { for (const s of [-0.26, 0, 0.26]) enemyFire(e, a + s, 'bullet'); }
      else enemyFire(e, a, 'bullet');
    }
    e.moving = false;
    return;
  }
  if (e.fireT <= 0 && canShoot && d2p < (hold ? 12 : 13.5) ** 2) {
    e.aimT = 0.32; e.fireT = hold ? randRange(1.5, 2.3) : e.type === 'officer' ? randRange(2.4, 3.2) : randRange(2.0, 3.1);
    return;
  }
  if (hold) { e.moving = false; e.ang = approachAng(e.ang, angTo(e.x, e.y, P.x, P.y), dt * 4); return; }
  // 巡逻或游荡；玩家很近时略微后撤保持距离
  if (!e.goal || e.t > e.goalT) {
    if (e.data.patrol) { e.flip = !e.flip; e.goal = { x: e.hx + (e.flip ? e.data.patrol[0] : 0), y: e.hy + (e.flip ? e.data.patrol[1] : 0) }; }
    else if (d2p < 9 * 9 && P.alive) { const a = angTo(P.x, P.y, e.x, e.y) + (rand() - 0.5); e.goal = { x: e.x + Math.sin(a) * 3, y: e.y + Math.cos(a) * 3 }; }
    else e.goal = { x: e.hx + (rand() - 0.5) * 6, y: e.hy + (rand() - 0.5) * 6 };
    e.goalT = e.t + 1.6 + rand() * 1.6;
  }
  const dx = e.goal.x - e.x, dy = e.goal.y - e.y, l = Math.hypot(dx, dy);
  e.moving = l > 0.2;
  if (e.moving) {
    const s = Math.min(l, e.speed * dt), mx = dx / l * s, my = dy / l * s;
    const ox = e.x, oy = e.y;
    moveSoldier(e, mx, my);
    if (e.x === ox && e.y === oy) e.goalT = 0;
    e.ang = approachAng(e.ang, Math.atan2(dx, dy), dt * 8);
  }
}
function moveSoldier(e, dx, dy) {
  const ok = (x, y) => { if (circleHitsGrid(x, y, 0.36)) return false; return !L.isNoGo(L.terrainAt(x, y)); };
  if (ok(e.x + dx, e.y)) e.x += dx;
  if (ok(e.x, e.y + dy)) e.y += dy;
}
function tankMove(e, ang, sp, dt) {
  e.ang = approachAng(e.ang, ang, dt * 2.2);
  if (Math.abs(angDiff(e.ang, ang)) > 0.6) return false;
  const dx = Math.sin(e.ang) * sp * dt, dy = Math.cos(e.ang) * sp * dt;
  const nx = e.x + dx, ny = e.y + dy;
  if (!blockedFor(nx, ny, e.r, e)) { e.x = nx; e.y = ny; return true; }
  return false;
}
function tankAI(e, dt, canShoot, d2p) {
  let goal = null;
  if (e.patrol) { const p = e.patrol[e.pi]; if (dist2(e.x, e.y, p[0], p[1]) < 1) e.pi = (e.pi + 1) % e.patrol.length; goal = e.patrol[e.pi]; }
  else if (P.alive && d2p < 22 * 22 && d2p > (e.type === 'bulltank' ? 6 : 9) ** 2) goal = [P.x, P.y];
  e.moving = false;
  if (goal) {
    const base = angTo(e.x, e.y, goal[0], goal[1]);
    for (const off of [0, 0.6, -0.6, 1.2, -1.2]) { if (tankMove(e, base + off, e.speed, dt)) { e.moving = true; break; } if (Math.abs(angDiff(e.ang, base + off)) > 0.6) break; }
  }
  const want = angTo(e.x, e.y, P.x, P.y);
  e.tAng = approachAng(e.tAng, want, dt * (e.type === 'bulltank' ? 2.2 : 1.6));
  e.fireT -= dt;
  const bull = e.type === 'bulltank';
  if (e.fireT <= 0 && canShoot && d2p < 19 * 19 && Math.abs(angDiff(e.tAng, want)) < 0.18) { enemyFire(e, e.tAng, 'shell', { muzzle: bull ? 2.9 : 2.2, speed: bull ? 8.6 : 7.8 }); e.fireT = bull ? randRange(2.0, 2.7) : randRange(2.8, 3.6); e.recoil = 0.25; }
}
// 敌方吉普：保持七八米距离绕着玩家跑，副驾驶抛手雷
function ejeepAI(e, dt, canShoot, d2p) {
  e.moving = false;
  if (P.alive) {
    const dist = Math.sqrt(d2p);
    let goalA;
    if (dist > 9) goalA = angTo(e.x, e.y, P.x, P.y);
    else if (dist < 6) goalA = angTo(P.x, P.y, e.x, e.y);
    else goalA = angTo(P.x, P.y, e.x, e.y) + (e.data.cw ? -1 : 1) * PI / 2;
    for (const off of [0, 0.7, -0.7, 1.4, -1.4, PI]) { if (tankMove(e, goalA + off, e.speed, dt)) { e.moving = true; break; } if (Math.abs(angDiff(e.ang, goalA + off)) > 0.6) break; }
    if (!e.moving) e.stuckT = (e.stuckT || 0) + dt; else e.stuckT = 0;
    if (e.stuckT > 1) { e.data.cw = !e.data.cw; e.stuckT = 0; }
  }
  e.fireT -= dt;
  if (e.fireT <= 0 && canShoot && d2p < 13 * 13) {
    enemyLob(e.x, e.y, 1.6, P.x + (rand() - 0.5) * 1.2, P.y + (rand() - 0.5) * 1.2, 0.85, 1.5);
    A.grenade(); e.fireT = randRange(2.2, 3.0);
  }
}
// 轰炸机：玩家到达触发线后从北面高空掠过，沿途投弹
function bomberAI(e, dt) {
  const o = e.obj;
  if (e.state === 'wait') {
    if (G.mode === 'play' && P.alive && P.y >= e.data.trigger && !(G.boss.state === 'fight')) {
      e.state = 'fly'; e.x = clamp(P.x + (rand() - 0.5) * 6, -30, 30); e.y = P.y + 34; e.vy = -15; e.dropT = 0.4;
      e.obj.root.visible = true; A.plane(); ev('bomberIn', { x: +e.x.toFixed(1) });
    }
    return;
  }
  e.y += e.vy * dt;
  e.ang = PI;
  e.dropT -= dt;
  if (e.dropT <= 0 && Math.abs(e.y - P.y) < 13 && G.mode === 'play') {
    e.dropT = 0.32;
    enemyLob(e.x + (rand() - 0.5) * 1.2, e.y, e.h - 0.5, e.x + (rand() - 0.5) * 1.6, e.y - 2.2, 0.7, 1.7);
  }
  if (e.y < P.y - 40 || e.y < -20) { e.alive = false; scene.remove(e.objRoot); ents.splice(ents.indexOf(e), 1); }
}
// 会倒下的石柱：玩家靠近时朝路中倒下，压到吉普算受击；倒下后横在路上，要炸开或用机枪打 7 发
function fallPillarAI(e, dt) {
  if (e.state === 'stand') {
    if (G.mode === 'play' && P.alive && P.y >= e.data.trigger && P.y < e.y + 3 && Math.abs(P.x - e.x) < 10) { e.state = 'falling'; e.fall = 0; A.rumble(); ev('pillarFall', { x: e.x, y: e.y }); }
    return;
  }
  if (e.state === 'falling') {
    e.fall = Math.min(1, e.fall + dt / 0.65);
    if (e.fall >= 1) {
      e.state = 'down';
      e.capsule = { ax: e.x + e.fdir * 0.6, ay: e.y, bx: e.x + e.fdir * e.len, by: e.y, r: 0.6 };
      fx.debris(e.x + e.fdir * e.len * 0.6, e.y, 0.4, 0xd2bd8c, 10, 1); fx.smoke(e.x + e.fdir * e.len * 0.5, e.y, 0.3, 5, 0xd9cdb0); A.boom(false); fx.shake = Math.max(fx.shake, 0.3);
      if (P.alive && entD2(e, P.x, P.y) < (0.6 + P.r) ** 2) { hitPlayer('pillar'); const s = Math.sign(P.y - e.y) || -1; P.y = e.y + s * 1.6; }
    }
  }
}
// Boss 石像：闲置 → 眼睛闪光预警 → 张嘴发射追踪导弹 → 闭嘴
function bustAI(e, dt, canShoot) {
  if (G.boss.state !== 'fight') return;
  e.fireT -= dt;
  if (e.phase === 'idle' && e.fireT <= 0) { e.phase = 'warn'; e.phaseT = 0.7; A.tick(); }
  else if (e.phase === 'warn') { e.phaseT -= dt; if (e.phaseT <= 0) { e.phase = 'open'; e.phaseT = 1.3; if (canShoot) enemyFire(e, angTo(e.x, e.y, P.x, P.y), 'missile', { muzzle: 1.4, h0: 3.3, speed: 5.4, homing: true }); } }
  else if (e.phase === 'open') { e.phaseT -= dt; if (e.phaseT <= 0) { e.phase = 'idle'; e.fireT = randRange(2.8, 4.0); } }
}

function syncEnt(e, dt) {
  const o = e.obj, root = e.objRoot;
  root.position.x = e.x; root.position.z = Z(e.y);
  if (e.type === 'soldier' || e.type === 'officer') {
    root.rotation.y = -e.ang;
    const w = e.moving ? Math.sin(e.t * 12) : 0;
    o.legs[0].rotation.x = w * 0.6; o.legs[1].rotation.x = -w * 0.6;
    o.body.position.y = e.moving ? Math.abs(Math.sin(e.t * 12)) * 0.06 : 0;
    o.body.rotation.x = e.aimT > 0 ? -0.15 : 0;
  } else if (e.type === 'mg' || e.type === 'turret') {
    // 固定底座不继承出生时的车身朝向，内层炮管使用世界射击角。
    root.rotation.y = 0;
    o.turret.rotation.y = -e.tAng;
  } else if (e.type === 'cannon') {
    root.rotation.y = 0;
    root.position.y = e.h;
    o.turret.rotation.y = -e.tAng;
    if (e.recoil > 0) { e.recoil -= dt; o.turret.position.set(-Math.sin(e.tAng) * e.recoil, 0, Math.cos(e.tAng) * e.recoil); } else o.turret.position.set(0, 0, 0);
  } else if (e.type === 'tank' || e.type === 'boss' || e.type === 'bulltank') {
    root.rotation.y = -e.ang;
    o.turret.rotation.y = -(e.tAng - e.ang);
    root.position.y = e.moving ? Math.sin(e.t * 30) * 0.02 : 0;
    if (e.recoil > 0) { e.recoil -= dt; o.turret.position.z = e.recoil; } else o.turret.position.z = 0;
  } else if (e.type === 'ejeep') {
    root.rotation.y = -e.ang;
    o.body.position.y = e.moving ? Math.sin(e.t * 26) * 0.035 : 0;
  } else if (e.type === 'boat') {
    root.rotation.y = -e.ang;
    o.turret.rotation.y = -(e.tAng - e.ang);
    root.position.y = e.h + Math.sin(e.t * 2.4) * 0.06;
    root.rotation.z = Math.sin(e.t * 1.8) * 0.04;
    o.wake.material.opacity = 0.35 + Math.sin(e.t * 8) * 0.12;
  } else if (e.type === 'bomber') {
    root.position.y = e.h; root.rotation.y = -e.ang; root.rotation.z = Math.sin(e.t * 2) * 0.05;
    o.shadow.position.y = -e.h + 0.04;
  } else if (e.type === 'wstatue') {
    root.position.y = e.h;
    root.rotation.y = -approachAng(-root.rotation.y, angTo(e.x, e.y, P.x, P.y), dt * 1.2);
    if (e.recoil > 0) { e.recoil -= dt; o.body.position.y = -e.recoil * 0.4; } else o.body.position.y = 0;
  } else if (e.type === 'bust') {
    root.rotation.y = -PI;
    const open = e.phase === 'open' ? 1 : 0;
    o.jaw.position.y = 3.35 - open * 0.35;
    o.eyeMat.color.setHex(e.phase === 'warn' ? (Math.floor(e.t * 16) % 2 ? 0xff3d2a : 0xfff27a) : e.phase === 'open' ? 0xff6a3d : 0x2b2b2b);
  } else if (e.type === 'fallpillar') {
    const k = e.state === 'stand' ? 0 : e.state === 'falling' ? e.fall * e.fall : 1;
    o.pivot.rotation.z = -e.fdir * k * PI / 2;
  }
  // 受击闪白
  if (e.hitT > 0 && !e.flashOn) { e.flashOn = true; root.traverse(m => { if (m.isMesh && m.material === M.MAT.toy) { m.material = HIT_MAT; m.userData.wasToy = true; } }); }
  else if (e.hitT <= 0 && e.flashOn) { e.flashOn = false; root.traverse(m => { if (m.isMesh && m.userData.wasToy) { m.material = M.MAT.toy; } }); }
}
const HIT_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const WRECK_MAT = new THREE.MeshLambertMaterial({ color: 0x3d3632 });

// ---------- 道具星（隐藏，炸开或火箭擦过才出现） ----------
function updateStar(e, dt) {
  const o = e.obj;
  if (e.hidden) {
    // 隐约闪光提示
    if (Math.floor(e.t * 10) % 50 === 0 && inView(e.x, e.y, 0)) fx.sparkle(e.x, e.y, 0.3, 0xfff6c0);
    return;
  }
  e.rise = Math.min(1, (e.rise || 0) + dt * 2);
  o.star.rotation.y += dt * 2.5; o.star.position.y = 0.6 + e.rise * 0.8 + Math.sin(e.t * 3) * 0.15;
  if (e.item === 'max') o.star.visible = Math.floor(e.t * 10) % 3 !== 0;
  if (P.alive && G.mode === 'play' && dist2(e.x, e.y, P.x, P.y) < 1.7 * 1.7) {
    e.alive = false; scene.remove(e.objRoot); ents.splice(ents.indexOf(e), 1);
    A.star(); fx.sparkle(e.x, e.y, 1, e.item === 'up' ? 0x7af08a : 0xffe36b);
    if (e.item === 'bomb') {
      // 棕色星：画面上所有敌人（Boss 除外）一起消灭
      fx.ring(P.x, P.y, 0.5, 14); fx.shake = Math.max(fx.shake, 0.5);
      let n = 0;
      for (const q of ents.slice()) if (q.alive && !q.dead && q.type !== 'star' && !q.boss && q.type !== 'fallpillar' && (q.type !== 'bomber' || q.state === 'fly') && inView(q.x, q.y, 0)) { killEnemy(q, 'smartbomb'); n++; }
      ebul.length = 0; earc.length = 0;
      banner('棕色星！', '消灭画面上的 ' + n + ' 个敌人', 2);
      ev('starPicked', { item: 'bomb', killed: n });
    } else if (e.item === 'up') {
      if (G.settings.lives === 'classic') { G.lives++; banner('绿色星！', '多一辆吉普', 2); }
      else { P.armor = G.armorMax; addScore(POINTS.upStar); banner('绿色星！', '无限命模式：护甲补满 +' + POINTS.upStar + ' 分', 2); }
      ev('starPicked', { item: 'up' });
    } else {
      upgradeWeapon(MAX_WEAPON);
      banner('闪光星！', '武器直接升到满级：' + WEAPON_NAME[MAX_WEAPON], 2.2);
      ev('starPicked', { item: 'max' });
    }
  }
}

// ---------- 伤害 ----------
function damageEnemy(e, dmg, kind, hx, hy) {
  if (!e.alive || e.type === 'star') return;
  if (e.type === 'boss' && e.enter) return;
  if (e.type === 'bomber' && e.state !== 'fly') return;
  if (e.type === 'fallpillar' && e.state === 'stand') return;
  if (kind === 'bullet' && e.bulletProof) { A.ping(); fx.hit(hx, hy, (e.h || 0) + 1.2, 0xc9d6dd); return; }
  if (e.oneShot && kind !== 'bullet') dmg = e.hp;
  e.hp -= dmg; e.hitT = 0.08;
  if (e.type === 'boss' && e.stage === 1 && e.hp <= 4 && e.hp > 0) {
    e.stage = 2; e.obj.setVariant('brown'); e.speed = 4.8; A.boom(false); fx.explosion(e.x, e.y, 1.5, 0.8); fx.debris(e.x, e.y, 1.2, M.C.blue, 8);
    ev('bossDamaged', { id: e.bossId });
  }
  if (e.type === 'bust' && e.hp > 0) { fx.debris(e.x, e.y, 3.5, 0xe9e3d2, 6, 0.8); ev('bustHit', { id: e.bossId, hp: e.hp }); }
  if (e.hp <= 0) killEnemy(e, kind);
  else if (kind === 'bullet' && (e.type === 'tank' || e.type === 'bulltank' || e.type === 'boss' || e.type === 'cannon' || e.type === 'mg' || e.type === 'turret' || e.type === 'boat' || e.type === 'ejeep' || e.type === 'fallpillar')) { A.ping(); fx.hit(hx, hy, (e.h || 0) + 1, 0xfff2a8); }
}
function killEnemy(e, kind) {
  if (!e.alive) return;
  e.alive = false;
  const t = e.type;
  const key = e.killKey || t;
  if (t === 'soldier' || t === 'officer') {
    G.kills[t]++; addScore(POINTS[t]);
    if (kind === 'squash') { A.squash(); fx.debris(e.x, e.y, 0.2, M.C.enemy, 5, 0.5); }
    else { A.soldierDown(); fx.hit(e.x, e.y, 0.8, 0xffffff); fx.debris(e.x, e.y, 0.4, M.C.enemy, 4, 0.6); }
    fx.smoke(e.x, e.y, 0.3, 2, 0xe8e2d6);
    scene.remove(e.objRoot); ents.splice(ents.indexOf(e), 1);
  } else if (t === 'fallpillar') {
    G.kills.fallpillar++; addScore(POINTS.fallpillar);
    const cx = e.capsule ? (e.capsule.ax + e.capsule.bx) / 2 : e.x;
    fx.debris(cx, e.y, 0.6, 0xd2bd8c, 14, 1.2); fx.smoke(cx, e.y, 0.5, 6, 0xd9cdb0); A.boom(false);
    scene.remove(e.objRoot); ents.splice(ents.indexOf(e), 1);
  } else if (t === 'bomber') {
    G.kills.bomber++; addScore(POINTS.bomber);
    fx.bigExplosion(e.x, e.y, e.h, 1.3); A.boom(true); fx.debris(e.x, e.y, e.h, 0x9a7a52, 12, 1.4);
    scene.remove(e.objRoot); ents.splice(ents.indexOf(e), 1);
  } else {
    G.kills[key] = (G.kills[key] || 0) + 1; addScore(POINTS[key] || 0);
    const size = t === 'boss' || t === 'bust' ? 1.6 : t === 'tank' || t === 'bulltank' ? 1.4 : 1.1;
    fx.bigExplosion(e.x, e.y, (e.h || 0) + (t === 'bust' ? 2.5 : 0.6), size); A.boom(true);
    fx.debris(e.x, e.y, (e.h || 0) + 0.8, t === 'boss' ? M.C.brown : t === 'tank' ? M.C.khaki : t === 'boat' ? 0x8c5145 : t === 'bust' ? 0xe9e3d2 : t === 'wstatue' ? 0x7ea4c0 : M.C.gray, 10, 1.2);
    e.dead = true; e.deadT = t === 'mg' ? 0.01 : 5; e.smokeT = 0; e.solid = false;
    if (t === 'mg') { scene.remove(e.objRoot); }
    else e.objRoot.traverse(m => { if (m.isMesh && m.material !== M.MAT.shadowBlob) m.material = WRECK_MAT; });
    if (t === 'boat') { e.deadT = 2.2; fx.splash(e.x, e.y, 1.6); A.splash(); }
    if (t === 'wstatue') { e.deadT = 2.0; fx.splash(e.x, e.y, 1.4); A.splash(); }
    if (e.data.flashPow) { releasePows(e.x, e.y - 0.4, 0, 1); toast('坦克里关着一名闪光俘虏！'); }
    if (t === 'boss') { G.boss.killed++; ev('bossTankDown', { killed: G.boss.killed }); }
    if (t === 'bust') { G.boss.killed++; ev('bustDown', { id: e.bossId, killed: G.boss.killed }); }
  }
  ev('kill', { type: t, by: kind, x: +e.x.toFixed(1), y: +e.y.toFixed(1) });
}

function explode(x, y, h, radius, dmg, kind, opts) {
  const o = opts || {};
  const t = L.terrainAt(x, y);
  const wet = (t === L.T.WATER || t === L.T.SEA) && h < 0.5;
  if (wet) { fx.splash(x, y, radius * 0.7); A.splash(); }
  else { fx.explosion(x, y, h, radius / 2); A.boom(false); }
  // 敌人
  for (const e of ents.slice()) {
    if (!e.alive || e.type === 'star') continue;
    const reach = e.type === 'boss' ? e.r + 0.7 : e.capsule ? radius + e.capsule.r : radius + e.r * 0.6;   // Boss 坦克只吃直接命中
    if (entD2(e, x, y) < reach * reach) damageEnemy(e, dmg, kind, e.x, e.y);
  }
  // 敌方导弹也会被炸掉
  for (let i = ebul.length - 1; i >= 0; i--) if (ebul[i].kind === 'missile' && dist2(x, y, ebul[i].x, ebul[i].y) < (radius + 0.4) ** 2) { fx.hit(ebul[i].x, ebul[i].y, ebul[i].h, 0xffd27a); ebul.splice(i, 1); }
  // 隐藏星
  for (const e of ents) if (e.type === 'star' && e.hidden && dist2(x, y, e.x, e.y) < 2.6 * 2.6) revealStar(e);
  // 静态物体
  const hit = new Set();
  const i0 = L.ci(x - radius), i1 = L.ci(x + radius), j0 = L.cj(y - radius), j1 = L.cj(y + radius);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (!L.inGrid(i, j)) continue;
    const id = L.solid[L.idx(i, j)];
    if (!id || hit.has(id)) continue;
    const cx = L.cellX(i), cy = L.cellY(j);
    if ((cx - x) ** 2 + (cy - y) ** 2 > (radius + 0.5) ** 2) continue;
    hit.add(id);
  }
  for (const id of hit) {
    const s = L.statics[id];
    if (!s || !s.alive || !s.by) continue;
    const ok = s.by === 'any' || (s.by === 'explosive' && kind !== 'bullet') || (s.by === 'rocket' && kind === 'rocket');
    if (!ok) continue;
    s.hp -= dmg; world.hitFlash(s);
    if (s.hp <= 0) destroyStatic(s);
  }
  // 三、四级火箭：爆炸后向左右（及上下）溅射
  if (o.spread) {
    const dirs = o.spread === 4 ? [0, PI / 2, PI, -PI / 2] : [PI / 2, -PI / 2];
    for (const aa of dirs) bombs.push({ own: true, kind: 'shrap', x, y, vx: Math.sin(aa) * 16, vy: Math.cos(aa) * 16, life: 5.5 / 16, h: 0.8, a: aa });
  }
}
function revealStar(e) {
  e.hidden = false; e.obj.root.visible = true; A.star(); fx.sparkle(e.x, e.y, 0.8, 0xffe36b);
  toast(e.item === 'bomb' ? '发现棕色星！开过去拾取' : e.item === 'up' ? '发现绿色星！开过去拾取' : '发现闪光星！开过去拾取');
  ev('starRevealed', { item: e.item });
}
function destroyStatic(s) {
  L.removeStatic(s);
  world.removeStatic(s);
  const k = s.kind;
  if (k === 'hut') {
    addScore(POINTS.hut); G.kills.hut++;
    fx.bigExplosion(s.x, s.y, 1, 1.4); fx.debris(s.x, s.y, 1.5, M.C.wood, 12, 1.2); fx.debris(s.x, s.y, 2, M.C.red, 6);
    A.boom(true);
    releasePows(s.x, s.y0, s.data.n, s.data.flash);
    spawnKit(s.x + (s.x < 0 ? 2.2 : -2.2), s.y0 - 1.6);
    for (let k2 = 0; k2 < 6; k2++) pending.push({ t: 0.3 * k2, fn: () => fx.smoke(s.x, s.y, 1.2, 2) });
  } else if (k === 'gate') {
    addScore(POINTS.gate); fx.bigExplosion(s.x, s.y, 1, 1.6); fx.debris(s.x, s.y, 1.5, M.C.wood, 16, 1.4); A.boom(true);
    banner((s.data.name || '大门') + '被炸开', '', 1.6);
  } else if (k === 'barrel') {
    addScore(POINTS.barrel);
    pending.push({ t: 0.12, fn: () => { explode(s.x, s.y, 0.5, 2.4, 6, 'explosive'); fx.bigExplosion(s.x, s.y, 0.6, 1.1); } });
  } else if (k === 'bluff') {
    addScore(POINTS.bluff); fx.debris(s.x, s.y, 2.2, 0xc6a983, 10, 1.1); fx.smoke(s.x, s.y, 1.5, 4, 0xcdb89a);
    // 失去支撑的崖顶炮台一起坠毁
    for (const e of ents) if (e.alive && e.elevated && Math.abs(e.x - s.x) < 1.6 && Math.abs(e.y - s.y) < 1.6) { killEnemy(e, 'rocket'); }
    for (const e of ents) if (e.alive && e.elevated && L.staticAt(e.x, e.y) === null) { e.elevated = false; e.h = 0; }
  } else {
    addScore(POINTS[k] || 0); fx.debris(s.x, s.y, 0.6, k === 'sandbag' ? M.C.sand : M.C.wood, 8, 0.8);
  }
  ev('staticDestroyed', { kind: k, id: s.id, name: s.data.name || null });
}

// ---------- 投射物 ----------
function updateBullets(dt) {
  // 玩家机枪弹
  for (let i = pbul.length - 1; i >= 0; i--) {
    const b = pbul[i];
    let dead = false;
    for (let sub = 0; sub < 2 && !dead; sub++) {
      b.x += b.vx * dt / 2; b.y += b.vy * dt / 2;
      // 机枪能打掉敌方导弹
      for (let k = ebul.length - 1; k >= 0; k--) { const m = ebul[k]; if (m.kind === 'missile' && dist2(b.x, b.y, m.x, m.y) < (m.r + 0.3) ** 2) { fx.hit(m.x, m.y, m.h, 0xffd27a); A.ping(); ebul.splice(k, 1); dead = true; ev('missileShot'); break; } }
      if (dead) break;
      for (const e of ents) {
        if (!e.alive || e.type === 'star' || e.elevated || e.dead) continue;
        if (e.type === 'bomber' || (e.type === 'fallpillar' && e.state === 'stand')) continue;
        const rr = e.capsule ? e.capsule.r : e.r;
        if (entD2(e, b.x, b.y) < (rr + b.r) ** 2) { damageEnemy(e, 1, 'bullet', b.x, b.y); dead = true; break; }
      }
      if (dead) break;
      // 崖顶炮台：子弹只有绕过岩崖才能打到（岩崖格先挡住）
      const s = L.blockedShot(b.x, b.y);
      if (s) {
        if (s.by === 'any') { s.hp -= 1; if (s.hp <= 0) destroyStatic(s); }
        for (const e of ents) if (e.alive && e.elevated && dist2(b.x, b.y, e.x, e.y) < (e.r + 0.3) ** 2) { damageEnemy(e, 1, 'bullet', b.x, b.y); }
        fx.hit(b.x, b.y, 1.2); dead = true; break;
      }
      if (!L.inGrid(L.ci(b.x), L.cj(b.y))) dead = true;
    }
    b.life -= dt;
    if (dead || b.life <= 0) pbul.splice(i, 1);
  }
  // 敌弹
  for (let i = ebul.length - 1; i >= 0; i--) {
    const b = ebul[i];
    let dead = false;
    // 追踪导弹：前 2.6 秒转向玩家，之后直飞
    if (b.kind === 'missile' && b.homing > 0 && P.alive) {
      b.homing -= dt;
      b.a = approachAng(b.a, angTo(b.x, b.y, P.x, P.y), dt * 1.7);
      b.vx = Math.sin(b.a) * b.sp; b.vy = Math.cos(b.a) * b.sp;
    }
    if (b.kind === 'missile') { b.trail -= dt; if (b.trail <= 0) { b.trail = 0.06; fx.dust(b.x - b.vx * 0.04, b.y - b.vy * 0.04); } }
    for (let sub = 0; sub < 2 && !dead; sub++) {
      b.x += b.vx * dt / 2; b.y += b.vy * dt / 2;
      const victim=allPlayers().find(p=>p.alive&&G.mode==='play'&&dist2(b.x,b.y,p.x,p.y)<(p.r*.75+b.r)**2);
      if(victim){withPlayer(victim,()=>hitPlayer(b.kind));fx.hit(b.x,b.y,1,0x9ff3ff);dead=true;break;}
      if (!b.high) { const s = L.blockedShot(b.x, b.y); if (s) { fx.hit(b.x, b.y, 1); dead = true; break; } }
    }
    b.life -= dt;
    if (dead || b.life <= 0) { if (b.kind === 'shell' || b.kind === 'missile') fx.explosion(b.x, b.y, Math.max(0.2, b.h - 0.6), 0.35); ebul.splice(i, 1); }
  }
}
function updateArcs(dt) {
  for (let i = earc.length - 1; i >= 0; i--) {
    const b = earc[i];
    b.t += dt;
    const k = Math.min(1, b.t / b.dur);
    b.x = b.sx + (b.tx - b.sx) * k; b.y = b.sy + (b.ty - b.sy) * k;
    b.h = b.h0 * (1 - k) + 3 * k * (1 - k) * (b.h0 < 3 ? 1 : 0.3);
    if (k >= 1) {
      earc.splice(i, 1);
      const t = L.terrainAt(b.x, b.y);
      if (t === L.T.WATER || t === L.T.SEA) { fx.splash(b.x, b.y, 1); A.splash(); }
      else { fx.explosion(b.x, b.y, 0.3, 0.8); A.boom(false); }
      for(const p of allPlayers())if(p.alive&&G.mode==='play'&&dist2(b.x,b.y,p.x,p.y)<(b.r+p.r*.5)**2)withPlayer(p,()=>hitPlayer('bomb'));
    }
  }
}
function updateBombs(dt) {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    if (b.kind === 'grenade') {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.x = b.sx + (b.tx - b.sx) * k; b.y = b.sy + (b.ty - b.sy) * k;
      // 落点若在崖顶，弧线终点抬高
      const top = L.staticAt(b.tx, b.ty); const endH = top && top.kind === 'bluff' ? 2.6 : 0;
      b.h = 1.1 + (endH - 1.1) * k + 4 * 3.0 * k * (1 - k);
      // 手雷飞经轰炸机所在位置时直接命中
      for (const e of ents) if (e.type === 'bomber' && e.alive && e.state === 'fly' && dist2(b.x, b.y, e.x, e.y) < 2.2 * 2.2 && b.h > 2.5) { bombs.splice(i, 1); explode(e.x, e.y, e.h, 1.6, 4, 'explosive'); b.done = true; break; }
      if (b.done) continue;
      if (k >= 1) {
        bombs.splice(i, 1);
        explode(b.x, b.y, endH, 1.9, 4, 'explosive');
        ev('grenadeLand', { x: +b.x.toFixed(1), y: +b.y.toFixed(1) });
      }
      continue;
    }
    // 火箭 / 溅射弹片：直线，碰到即炸
    let boom = false;
    for (let sub = 0; sub < 3 && !boom; sub++) {
      b.x += b.vx * dt / 3; b.y += b.vy * dt / 3;
      for (const e of ents) {
        if (!e.alive || e.type === 'star' || e.dead || (e.elevated && b.kind === 'shrap')) continue;
        if (e.elevated) continue;
        if (e.type === 'fallpillar' && e.state === 'stand') continue;
        if (e.type === 'bomber' && e.state !== 'fly') continue;
        const rr = e.capsule ? e.capsule.r : e.r;
        if (entD2(e, b.x, b.y) < (rr + 0.25) ** 2) { boom = true; break; }
      }
      // 碰到敌方导弹：把导弹打掉，火箭继续飞（不然正面对着石像时火箭总被迎面的导弹挡掉）
      for (let k = ebul.length - 1; k >= 0; k--) { const m = ebul[k]; if (m.kind === 'missile' && dist2(b.x, b.y, m.x, m.y) < 0.8 * 0.8) { fx.explosion(m.x, m.y, m.h, 0.35); ebul.splice(k, 1); ev('missileShot', { by: b.kind }); } }
      const s = L.blockedShot(b.x, b.y);
      if (s) boom = true;
      if (!L.inGrid(L.ci(b.x), L.cj(b.y))) { b.life = 0; }
    }
    if (b.kind !== 'shrap') {
      b.smokeT -= dt; if (b.smokeT <= 0) { b.smokeT = 0.03; fx.dust(b.x - b.vx * 0.03, b.y - b.vy * 0.03); }
      // 火箭擦过藏星的位置也会把它炸出来
      for (const e of ents) if (e.type === 'star' && e.hidden && dist2(b.x, b.y, e.x, e.y) < 1.7 * 1.7) revealStar(e);
    }
    b.life -= dt;
    if (boom || b.life <= 0) {
      bombs.splice(i, 1);
      if (b.kind === 'shrap') explode(b.x, b.y, 0.6, 1.1, 2, 'explosive');
      else explode(b.x, b.y, 0.8, b.kind === 'rocket3' ? 2.3 : 2.0, b.kind === 'rocket3' ? 5 : 4, 'rocket', { spread: b.spread || 0 });
    }
  }
}

// ---------- Boss ----------
const BOSS_TYPES = {
  // 第一关：4 辆蓝色坦克依次开进
  tanks: {
    update(B, dt) {
      B.spawnT -= dt;
      if (B.spawned < 4 && B.spawnT <= 0) {
        const entry = L.BOSS.entry;
        const busy = ents.some(e => e.alive && e.type === 'boss' && dist2(e.x, e.y, entry.x, entry.y) < 16);
        if (!busy) {
          const e = spawnEntity({ t: 'boss', x: entry.x, y: entry.y });
          e.bossId = ++B.spawned; e.ang = PI; e.tAng = PI; B.spawnT = 3.4;
          B.tanks.push(e);
          ev('bossSpawn', { id: e.bossId });
        }
      }
      // 流场（每 0.4 秒从玩家位置 BFS）
      B.flowT -= dt;
      if (B.flowT <= 0) { B.flowT = 0.4; B.flow = buildFlow(); }
      return B.killed >= 4;
    },
    pips(B) {
      const out = [];
      for (let k = 1; k <= 4; k++) { const e = B.tanks && B.tanks.find(t => t.bossId === k); out.push(!e ? 'wait' : !e.alive ? 'dead' : e.stage === 2 ? 'hurt' : 'ok'); }
      return out;
    }
  },
  // 第二关：庭院北墙 4 座石像（3 发爆炸物击毁一座），期间两辆棕色坦克从侧面开进
  statues: {
    start(B) {
      B.tanks = [];
      L.BOSS.statues.forEach((p, k) => { const e = spawnEntity({ t: 'bust', x: p[0], y: p[1], order: k }); e.bossId = k + 1; B.tanks.push(e); });
      B.spawned = 4; B.tankT = 6; B.extra = 0;
    },
    update(B, dt) {
      B.tankT -= dt;
      const alive = ents.filter(e => e.alive && e.helper).length;
      if (B.extra < 2 && B.tankT <= 0 && alive === 0) {
        const p = L.BOSS.tankEntries[B.extra % L.BOSS.tankEntries.length];
        const e = spawnEntity({ t: 'tank', x: p[0], y: p[1], paint: 'brown' });
        e.boss = true; e.helper = true; e.fireT = 2.2; B.extra++; B.tankT = 14;
        fx.smoke(p[0], p[1], 0.5, 6, 0xd9cdb0); toast('棕色坦克开进庭院！');
        ev('bossHelper', { n: B.extra });
      }
      return B.killed >= 4;
    },
    pips(B) { return (B.tanks || []).map(e => !e.alive ? 'dead' : e.hp < e.maxHp ? 'hurt' : 'ok'); }
  }
};
function startBoss() {
  const B = G.boss;
  B.state = 'intro'; B.t = 0; B.type = L.BOSS.type;
  L.activateBarricade();
  // 场外残余敌人撤出（被路障隔在身后）
  for (const e of ents.slice()) if (e.alive && e.type !== 'star' && !e.boss && e.y < L.BOSS.y0 - 1) { e.alive = false; scene.remove(e.objRoot); ents.splice(ents.indexOf(e), 1); }
  ebul.length = 0; earc.length = 0;
  A.alarm(); A.music('boss');
  banner(L.BOSS.name, L.BOSS.sub, 2.6);
  ev('bossStart', { type: B.type });
  const T = BOSS_TYPES[B.type];
  if (T.start) T.start(B);
}
function updateBoss(dt) {
  const B = G.boss;
  if (!B || B.state === 'idle' || B.state === 'done') {
    if (heliOut) updateHeliOut(dt);
    return;
  }
  B.t += dt;
  if (B.state === 'intro') {
    world.raiseBarricade(Math.min(1, B.t / 0.8));
    if (B.t > 2.0) { B.state = 'fight'; B.spawnT = 0; ev('bossFight'); }
    return;
  }
  const done = BOSS_TYPES[B.type].update(B, dt);
  if (done && G.mode === 'play') {
    B.state = 'done';
    G.mode = 'clear'; G.endT = 0;
    // 残余的护卫坦克一起撤退（爆炸）
    for (const e of ents.slice()) if (e.alive && e.helper) killEnemy(e, 'clear');
    ebul.length = 0; earc.length = 0;
    A.music(null); A.clear();
    banner(STAGE_NAME[G.stage] + '完成！', '救援直升机正在赶来', 3.5);
    ev('stageClear', { stage: G.stage, t: +G.t.toFixed(1) });
    heliOut = { t: 0, x: L.BOSS.cx, y0: L.BOSS.heliFrom || L.BOSS.y0 - 10, y1: L.BOSS.cy - 3 };
  }
}
export function bossPips() { const B = G.boss; if (!B || !B.type || !BOSS_TYPES[B.type]) return []; return BOSS_TYPES[B.type].pips(B); }
function buildFlow() {
  const B = L.BOSS, W = B.x1 - B.x0, H = (B.y1 + 6) - B.y0;
  const dist = new Int16Array(W * H).fill(-1);
  const pass = (i, j) => {
    const x = B.x0 + i + 0.5, y = B.y0 + j + 0.5;
    if (y >= B.y1) return Math.abs(x) < 4;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (L.blockedMove(x + di, y + dj)) return false;
    return true;
  };
  const q = [];
  const pi = clamp(Math.floor(P.x - B.x0), 0, W - 1), pj = clamp(Math.floor(P.y - B.y0), 0, H - 1);
  dist[pj * W + pi] = 0; q.push(pi, pj);
  for (let h = 0; h < q.length; h += 2) {
    const i = q[h], j = q[h + 1], d = dist[j * W + i];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || dist[nj * W + ni] >= 0 || !pass(ni, nj)) continue;
      dist[nj * W + ni] = d + 1; q.push(ni, nj);
    }
  }
  return { dist, W, H };
}
function bossAI(e, dt, canShoot, d2p) {
  const B = G.boss;
  if (e.enter) {
    // 从北侧林间缺口开入
    e.ang = PI; e.y -= 3.5 * dt; e.moving = true;
    if (e.y < L.BOSS.y1 - 2.5) e.enter = false;
  } else if (B.flow && P.alive) {
    const F = B.flow, i = Math.floor(e.x - L.BOSS.x0), j = Math.floor(e.y - L.BOSS.y0);
    let best = null, bd = 1e9;
    for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di * 2, nj = j + dj * 2;
      if (ni < 0 || nj < 0 || ni >= F.W || nj >= F.H) continue;
      const d = F.dist[nj * F.W + ni];
      if (d >= 0 && d < bd) { bd = d; best = [L.BOSS.x0 + ni + 0.5, L.BOSS.y0 + nj + 0.5]; }
    }
    e.moving = false;
    if (best && d2p > 5.5 * 5.5) {
      const base = angTo(e.x, e.y, best[0], best[1]);
      for (const off of [0, 0.5, -0.5, 1.1, -1.1]) { if (tankMove(e, base + off, e.speed, dt)) { e.moving = true; break; } if (Math.abs(angDiff(e.ang, base + off)) > 0.6) break; }
    } else e.ang = approachAng(e.ang, angTo(e.x, e.y, P.x, P.y), dt * 1.5);
  }
  const want = angTo(e.x, e.y, P.x, P.y);
  e.tAng = approachAng(e.tAng, want, dt * 2.4);
  e.fireT -= dt;
  if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0 && canShoot) { e.burst--; e.burstT = 0.17; enemyFire(e, e.tAng + (rand() - 0.5) * 0.08, 'shell', { muzzle: 2.6, speed: 9 }); e.recoil = 0.2; } }
  else if (!e.enter && e.fireT <= 0 && canShoot && Math.abs(angDiff(e.tAng, want)) < 0.3) { e.burst = 3; e.burstT = 0; e.fireT = e.stage === 2 ? randRange(2.0, 2.4) : randRange(2.5, 3.0); }
}
function updateClear(dt) {
  G.endT += dt;
  if (heliOut) updateHeliOut(dt);
  if (G.endT > 4.6 && !G.ended) endGame(true, 'clear');
}
function updateHeliOut(dt) {
  const h = heliOut; h.t += dt;
  if (!h.obj) { h.obj = M.makeHeli(); scene.add(h.obj.root); }
  const k = Math.min(1, h.t / 2.6), s = k * k * (3 - 2 * k);
  const y = h.y0 + (h.y1 - h.y0) * s;
  const alt = 6 * (1 - s) + 0.0;
  h.obj.root.position.set(h.x, alt, Z(y)); h.obj.root.rotation.y = 0;
  h.obj.rotor.rotation.y += dt * 30; h.obj.tail.rotation.x += dt * 40;
  h.obj.shadow.position.y = -alt + 0.03;
  h.cy = y;
}

function endGame(win, reason) {
  G.ended = true;
  A.engine('off');
  let powBonus = 0, lateDeliver = 0;
  if (win) {
    lateDeliver = allPlayers().reduce((sum, p) => sum + (p === P ? G.carried : p.carried || 0), 0);
    for (const p of allPlayers()) p.carried = 0;
    G.carried = 0; G.delivered += lateDeliver; G.totalDelivered = (G.totalDelivered || 0) + lateDeliver;
    addScore(lateDeliver * POINTS.pow); powBonus = G.delivered * POINTS.powBonus; addScore(powBonus); G.cleared = (G.cleared || 0) + 1;
  }
  let newHi = false;
  if (!G.coop && !G.demoUsed && G.score > G.hi) { G.hi = G.score; store.set('hi', G.hi); newHi = true; }
  const hasNext = win && G.stage < L.STAGE_COUNT;
  if (!G.coop && hasNext && store.get('unlocked', 1) < G.stage + 1) store.set('unlocked', G.stage + 1);   // 解锁下一关（主菜单可直接从该关开始）
  const res = {
    win, reason, stage: G.stage, stageCount: L.STAGE_COUNT, hasNext, finalStage: win && G.stage === L.STAGE_COUNT, startStage: G.startStage,
    score: G.score, hi: G.hi, newHi, kills: Object.assign({}, G.kills), delivered: G.delivered, lateDeliver, freed: G.freed, total: L.POW_TOTAL, powBonus,
    seconds: Math.round(G.t - (G.stageT0 || 0)), totalSeconds: Math.round(G.t), deaths: G.deaths - (G.stageDeaths0 || 0), totalDeaths: G.deaths,
    lives: G.settings.lives, armor: G.settings.armor, gun: G.settings.gun, hits: G.hits || 0, kitsPicked: G.kitsPicked || 0, demo: G.demoUsed, totalDelivered: G.totalDelivered || 0
  };
  ev('end', res);
  if (G.onEnd) G.onEnd(res);
}

// ---------- 渲染同步 ----------
export function render(dt, realT) {
  if (!P) return;
  for(const p of allPlayers())withPlayer(p,()=>{
  const o = P.obj;
  // 第一人称时隐藏车体（相机在驾驶位内）；死亡隐藏逻辑保持不变
  o.root.visible = !(camCtl.fpNow&&P.slot===localSlot) && P.alive;
  o.root.position.set(P.x, 0, Z(P.y));
  o.body.rotation.y = -P.ang;
  o.turret.position.set(-Math.sin(P.ang) * 0.82, 0, Math.cos(P.ang) * 0.82);
  o.turret.rotation.y = G.settings.gun === 'up' ? 0 : -P.ang;
  P.bob += dt;
  o.body.position.y = P.moving ? Math.sin(P.bob * 26) * 0.035 : Math.sin(P.bob * 9) * 0.012;
  for (const w of o.wheels) w.rotation.x = -P.wheelSpin;
  for (let k = 0; k < o.riders.length; k++) o.riders[k].visible = G.carried > k;
  if (P.hitFlash > 0) {
    P.hitFlash -= dt;
    if (!P.flashOn) { P.flashOn = true; o.root.traverse(m => { if (m.isMesh && m.material === M.MAT.toy) { m.material = HIT_MAT; m.userData.wasToy = true; } }); }
  } else if (P.flashOn) { P.flashOn = false; o.root.traverse(m => { if (m.isMesh && m.userData.wasToy) m.material = M.MAT.toy; }); }
  // 只剩最后一格护甲时冒黑烟
  if (P.alive && G.armorMax > 1 && P.armor === 1 && (G.mode === 'play')) {
    P.smokeT -= dt;
    if (P.smokeT <= 0) { P.smokeT = 0.12; fx.smoke(P.x - Math.sin(P.ang) * 0.6, P.y - Math.cos(P.ang) * 0.6, 1.0, 1, 0x2a2725, 0x6b6560); }
  }
  const blink = (P.invuln > 0 && P.hitFlash <= 0 && Math.floor(realT * 14) % 2 === 0);
  o.body.visible = !blink; o.turret.visible = !blink;
  if(P.slot===localSlot)shieldMesh.visible = P.alive && (P.shield > 0 || G.settings.demo);
  if (P.slot===localSlot&&shieldMesh.visible) { shieldMesh.position.set(P.x, 0.9, Z(P.y)); const s = 1 + Math.sin(realT * 6) * 0.04; shieldMesh.scale.set(s, s * 0.8, s); shieldMesh.material.color.setHex(G.settings.demo ? 0xff9a8a : 0x9ff3ff); }
  });
  if (heli) { heli.root.children[1].rotation.y += dt * (heli.spin || 4); heli.tail.rotation.x += dt * 12; }
  if (craft) { craft.position.y = -0.6 + Math.sin(realT * 1.5) * 0.06; if (G.mode !== 'intro' && G.t > 4) { craft.position.x -= dt * 2; craft.position.z += dt * 1.5; } }
  // 投射物
  writeProj(projPools.pb, pbul);
  writeProj(projPools.eb, ebul.filter(b => b.kind === 'bullet'));
  writeProj(projPools.sh, ebul.filter(b => b.kind === 'shell'));
  writeProj(projPools.ms, ebul.filter(b => b.kind === 'missile'));
  writeProj(projPools.sg, ebul, (b) => (b.kind === 'shell' ? 1.6 : b.kind === 'missile' ? 1.3 : 0.95) * (1 + Math.sin(realT * 30 + b.x) * 0.15));
  writeProj(projPools.ar, earc);
  let bi = 0;
  for (const b of bombs) {
    if (bi >= bombMeshes.length) break;
    const m = bombMeshes[bi], fm = bombFlames[bi]; bi++;
    m.visible = true;
    m.geometry = b.kind === 'grenade' ? bombGeo.grenade : b.kind === 'rocket3' ? bombGeo.rocket3 : bombGeo.rocket;
    m.position.set(b.x, b.h, Z(b.y));
    if (b.kind === 'grenade') { m.rotation.set(b.t * 12, 0, 0); m.scale.setScalar(1); fm.visible = false; }
    else { m.rotation.set(0, -b.a, 0); m.scale.setScalar(b.kind === 'shrap' ? 0.5 : 1); fm.visible = b.kind !== 'shrap'; fm.position.copy(m.position); fm.rotation.copy(m.rotation); fm.scale.setScalar(0.8 + Math.random() * 0.5); }
  }
  for (; bi < bombMeshes.length; bi++) { bombMeshes[bi].visible = false; bombFlames[bi].visible = false; }
  // 引擎声
  const engMode = (G.mode === 'play' || G.mode === 'intro') && P.alive ? (P.moving ? 'move' : 'idle') : 'off';
  if (engMode !== P.engMode) { P.engMode = engMode; A.engine(engMode); }
}

export function player() { return P; }
export function mode() { return G.mode; }
export function bossLock() { const s = G.boss && G.boss.state; return s === 'intro' || s === 'fight' || s === 'done' ? L.BOSS : null; }
export function heliCam() { return heliOut && heliOut.obj ? { x: heliOut.x, y: heliOut.cy } : null; }

// ---------- 快照与测试 ----------
export function snapshot() {
  const enemies = ents.filter(e => e.alive && e.type !== 'star').map(e => ({ type: e.type, x: +e.x.toFixed(2), y: +e.y.toFixed(2), hp: e.hp, active: e.active, elevated: !!e.elevated, id: e.bossId || null, stage: e.stage || null, state: e.state || e.phase || null }));
  const stars = ents.filter(e => e.type === 'star').map(e => ({ item: e.item, hidden: e.hidden, x: e.x, y: e.y }));
  return {
    mode: G.mode, t: +G.t.toFixed(2), frame: G.frame, score: G.score, hi: G.hi, deaths: G.deaths, lives: G.lives, settings: Object.assign({}, G.settings), demoUsed: G.demoUsed,
    stage: G.stage, stageCount: L.STAGE_COUNT, stageNo: L.STAGE_NO,
    weapon: G.weapon, carried: G.carried, delivered: G.delivered, freed: G.freed, powTotal: L.POW_TOTAL, cp: G.cp, kills: Object.assign({}, G.kills),
    player: P ? { x: +P.x.toFixed(2), y: +P.y.toFixed(2), dir: P.dir, alive: P.alive, invuln: +P.invuln.toFixed(2), shield: +P.shield.toFixed(2), moving: P.moving, armor: P.armor, armorMax: G.armorMax } : null,
    kits: kits.map(k => ({ x: +k.x.toFixed(2), y: +k.y.toFixed(2) })),
    enemies, pows: pows.map(p => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), flash: p.flash })),
    huts: L.HUTS.map(h => ({ name: h.data.name, alive: h.alive, x: h.x, y: h.y, hp: h.hp })), gate: L.GATE ? { alive: L.GATE.alive, hp: L.GATE.hp } : null,
    gates: L.GATES.map(g => ({ name: g.data.name, alive: g.alive, x: g.x, y: g.y })),
    star: stars.length ? stars[0] : { picked: true }, stars,
    boss: G.boss ? { type: G.boss.type, state: G.boss.state, spawned: G.boss.spawned, killed: G.boss.killed, pips: bossPips() } : null,
    eb: P ? ebul.filter(b => dist2(b.x, b.y, P.x, P.y) < 144).map(b => [+b.x.toFixed(2), +b.y.toFixed(2), +b.vx.toFixed(2), +b.vy.toFixed(2)]) : [], pbul: pbul.length, mgShots: G.mgShots || 0, pbVel: pbul.length ? [pbul[0].vx, pbul[0].vy] : null, ebul: ebul.length,
    missiles: ebul.filter(b => b.kind === 'missile').length, arcs: earc.map(b => [+b.tx.toFixed(1), +b.ty.toFixed(1), +(b.dur - b.t).toFixed(2)]), bombs: bombs.map(b => b.kind), banner: G.banner ? G.banner.text : null
  };
}
export const _test = {
  teleport(x, y) { if (!P) return; P.x = x; P.y = y; camCtl.snap(x, y); for (let k = G.cp + 1; k < L.CHECKPOINTS.length; k++) if (y >= L.CHECKPOINTS[k].ty) G.cp = k; },
  weapon(w) { G.weapon = w; },
  kill(type) { for (const e of ents.slice()) if (e.alive && (type ? e.type === type : e.type !== 'star')) killEnemy(e, 'test'); },
  hurt() { const was = P.invuln; P.invuln = 0; const ok = killPlayer('test'); if (!ok) P.invuln = was; return ok; },
  hit() { P.invuln = 0; P.shield = 0; return hitPlayer('test'); },
  armor(n) { P.armor = n; },
  kitAt(x, y) { spawnKit(x, y); },
  destroy(name) { const s = L.statics.find(q => q && q.alive && (q.data.name === name || q.kind === name)); if (s) destroyStatic(s); return !!s; },
  explodeAt(x, y, kind) { explode(x, y, 0.5, 2.0, 4, kind || 'explosive'); },
  rocketAt(x, y, w) { explode(x, y, 0.8, 2.3, 5, 'rocket', { spread: w === 3 ? 2 : w === 4 ? 4 : 0 }); },
  carry(n) { G.carried = n; },
  enemiesNear(r) { return ents.filter(e => e.alive && dist2(e.x, e.y, P.x, P.y) < r * r).map(e => ({ type: e.type, x: e.x, y: e.y })); },
  bulletsAt(x, y, a) { ebul.push({ kind: 'bullet', x, y, h: 1, a, vx: Math.sin(a) * 9.5, vy: Math.cos(a) * 9.5, life: 2, r: 0.2, high: true }); },
  missileAt(x, y, a, homing) { const b = enemyFire({ x, y, h: 0 }, a, 'missile', { muzzle: 0.1, homing: homing !== false }); return !!b; },
  starAt(x, y, item) { const e = spawnEntity({ t: 'star', x, y, item: item || 'bomb', hidden: false }); return !!e; },
  invuln(v) { P.invuln = v; },
  face(d) { if (!P) return; P.dir = d; P.ang = DIR8[d].a; fpLatch = null; camCtl.yaw = 0; },
  nextStage() { return nextStage(); },
  bossReady() { _test.teleport(L.BOSS.respawn.x, L.BOSS.trigger - 1.5); },
  state: () => ({ P, ents, pows, ebul, earc })
};
export function snapshotBoss(k) {
  const pips = bossPips();
  const v = pips[k - 1];
  return !v ? 'wait' : v === 'ok' ? 'blue' : v === 'hurt' ? 'brown' : v;
}

// Authoritative gameplay state for cooperative guests; guests only render, never run AI/damage.
export function coopInput(){
  let dir=IN.dir();
  if(dir>=0){const q=Math.round((camCtl.fpNow?P.ang+camCtl.yaw:-camCtl.yaw)/(Math.PI/4));dir=(dir+q+80)%8;}
  return {dir,fire:IN.fire(),bomb:IN.bomb(),edges:['fireTap','bombTap'].filter(k=>IN.take(k)),look:P.lookHeading??P.ang,aim:camCtl.fpNow?P.ang+camCtl.yaw:P.ang};
}
export function coopSnapshot(){
  if(P){P.weapon=G.weapon;P.carried=G.carried;}
  return {g:{...scalarState(G,['hi']),settings:G.settings,playerSlots:G.playerSlots,kills:G.kills,banner:G.banner,toast:G.toast,boss:{...scalarState(G.boss),tanks:(G.boss?.tanks||[]).map(e=>e.netId)}},
    players:coopPlayers.map(p=>scalarState(p)),entities:ents.map(e=>({s:scalarState(e),data:e.data,tree:treeState(e.objRoot)})),
    statics:L.statics.map(s=>s?{alive:s.alive,hp:s.hp}:null),
    pows:pows.map(p=>({s:scalarState(p),tree:treeState(p.obj.root)})),kits:kits.map(k=>scalarState(k)),
    bullets:pbul.map(b=>scalarState(b)),enemyBullets:ebul.map(b=>scalarState(b)),bombs:bombs.map(b=>scalarState(b)),arcs:earc.map(b=>scalarState(b))};
}
export function coopApply(data){
  if(!data?.g||!data.players)return;
  if(G.stage!==data.g.stage||data.g.frame<G.frame){ensureStage(data.g.stage);setupScene();}
  Object.assign(G,data.g);G.boss={...data.g.boss,tanks:[]};
  for(const st of data.players){const p=coopPlayers.find(p=>p.slot===st.slot);if(p)Object.assign(p,st);}
  P=coopPlayers.find(p=>p.slot===localSlot)||coopPlayers[0];G.weapon=P.weapon;G.carried=P.carried;
  const ids=new Set(data.entities.map(e=>e.s.netId));
  for(const e of ents.slice())if(!ids.has(e.netId)){scene.remove(e.objRoot);ents.splice(ents.indexOf(e),1);}
  for(const row of data.entities){let e=ents.find(e=>e.netId===row.s.netId);if(!e)e=spawnEntity(row.data);Object.assign(e,row.s);applyTree(e.objRoot,row.tree);}
  G.boss.tanks=(data.g.boss?.tanks||[]).map(id=>ents.find(e=>e.netId===id)).filter(Boolean);
  data.statics.forEach((row,i)=>{const st=L.statics[i];if(st&&row){if(st.alive&&!row.alive){L.removeStatic(st);world.removeStatic(st);}st.hp=row.hp;}});
  while(pows.length>data.pows.length){scene.remove(pows.pop().obj.root);}
  data.pows.forEach((row,i)=>{const p=pows[i]||spawnPow(row.s.x,row.s.y,row.s.flash,true);Object.assign(p,row.s);applyTree(p.obj.root,row.tree);});
  while(kits.length>data.kits.length)scene.remove(kits.pop().obj.root);
  data.kits.forEach((row,i)=>{if(!kits[i])spawnKit(row.x,row.y);Object.assign(kits[i],row);kits[i].obj.root.position.set(row.x,.5,-row.y);});
  A.music(['intro','play'].includes(G.mode)?L.STAGE.music:null);
  for(const [target,rows] of [[pbul,data.bullets],[ebul,data.enemyBullets],[bombs,data.bombs],[earc,data.arcs]]){target.length=0;target.push(...rows);}
}
