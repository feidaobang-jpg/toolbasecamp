import { installRemakeUI, createPitchController, bindDragLook, addControlModeButtons, createLookController } from '../../../js/game/drag-look.js?v=toy3dui3';
// 坦克大战 3D · 入口：模式选择（经典复刻 35 关 / 魔改无限周目）、标准选项、关卡流程
// （幕布 → 游玩 → 原版计分页 → 下一关 / GAME OVER）、输入映射、HUD、布局（手机竖屏自动旋转）、主循环与测试钩子。
import { createScene, PRESETS } from './scene.js?v=hit-audio1';
import { createRun, createWorld, step, turnPlayer, localPlayer, localStats, SCORE, TYPE_NAMES, qa } from './sim.js?v=hit-audio1';
import { CoopConnection, snapshot, hydrate } from './coop.js?v=coop1';
import { CLASSIC_COUNT, REMIX_LEVELS, remixInfo, MINI_INFO, CHAPTERS } from './levels.js?v=merge1';
import { GameAudio } from './audio.js?v=hit-audio1';

const VERSION = 'hit-audio1';
const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1' || params.has('qa');
const CLEAN = params.get('clean') === '1';
const $ = id => document.getElementById(id);
const app = $('app'), stage = $('stage'), canvas = $('screen');
const overlays = { menu: $('menu'), pause: $('pause'), tally: $('tally'), result: $('result'), lobby: $('lobby') };
const hud = $('hud'), touch = $('touch'), keyHint = $('keyhint'), toastEl = $('toast'), fpsEl = $('fps'), hurtEl = $('hurt');
const listUrl = app.getAttribute('data-list-url') || '../../../games.html';
document.querySelectorAll('.list-link').forEach(a => { a.href = listUrl; });

// ---------- 本地保存（独立命名空间；读写失败用默认值） ----------
const NS = 'tank3d-v2:';
const store = {
  get(k, def) { try { const v = localStorage.getItem(NS + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* 隐私模式 */ } }
};
const pick = (v, list, def) => (list.indexOf(v) >= 0 ? v : def);
const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v)) || a));
// 旧版（50 关程序化）存档迁入魔改模式
function legacy() {
  try {
    const raw = localStorage.getItem('tb-game-tank3d-progress'), hiOld = Number(localStorage.getItem('tb-game-tank3d-hi')) || 0;
    if (raw && store.get('remix.progress', null) === null) { const p = JSON.parse(raw); if (p && Number.isFinite(p.stage)) store.set('remix.progress', { level: clampInt(p.stage, 1, REMIX_LEVELS), cycle: Math.max(1, Math.round(p.loop) || 1), score: Math.max(0, Math.round(p.runScore) || 0) }); }
    if (hiOld && store.get('hi.remix', null) === null) store.set('hi.remix', hiOld);
  } catch (e) { /* 忽略 */ }
}
legacy();
const MODES = ['classic', 'remix'];
const settings = {
  mode: pick(store.get('mode', 'classic'), MODES, 'classic'),
  classicStage: clampInt(store.get('classicStage', 1), 1, CLASSIC_COUNT),
  remixFrom: 'continue',
  lives: { classic: pick(store.get('lives.classic', 'classic'), ['inf', 'classic'], 'classic'), remix: pick(store.get('lives.remix', 'inf'), ['inf', 'classic'], 'inf') },
  armor: { classic: pick(store.get('armor.classic', 'classic'), ['std', 'classic'], 'classic'), remix: pick(store.get('armor.remix', 'std'), ['std', 'classic'], 'std') },
  camera: { classic: clampInt(store.get('camera.classic', 1), 0, PRESETS.length - 1), remix: clampInt(store.get('camera.remix', 0), 0, PRESETS.length - 1) },
  demo: false,
  quality: pick(store.get('quality', 'auto'), ['auto', 'high', 'low'], 'auto'),
  volume: Math.max(0, Math.min(1, Number(store.get('volume', .7)))),
  touch: pick(store.get('touch', 'auto'), ['auto', 'show', 'hide'], 'auto'),
  fps: store.get('fps', false) === true
};
if (Number.isNaN(settings.volume)) settings.volume = .7;
if (params.get('q') === 'low' || params.get('q') === 'high') settings.quality = params.get('q');
if (MODES.includes(params.get('mode'))) settings.mode = params.get('mode');
if (params.get('stage')) settings.classicStage = clampInt(params.get('stage'), 1, CLASSIC_COUNT);
const hiOf = mode => store.get('hi.' + mode, mode === 'classic' ? 20000 : 0) | 0;
let remixProgress = store.get('remix.progress', null);
let effQuality = settings.quality === 'low' ? 'low' : 'high';
let autoProbe = { on: settings.quality === 'auto', frames: [], done: false, decided: null };

// ---------- 渲染与音频 ----------
let view;
try { view = createScene(canvas); }
catch (e) {
  const el = $('loading'); el.hidden = false;
  el.innerHTML = '无法启动 3D 画面（WebGL 不可用）：' + (e.message || e) + '<br><button onclick="location.reload()">重试</button><br><a href="' + listUrl + '" style="color:#fff">返回游戏列表</a>';
  throw e;
}
view.setPreset(settings.camera[settings.mode]);
const audio = new GameAudio();
audio.setVolume(settings.volume);

// ---------- 状态 ----------
let uiMode = 'title';          // title | game
let current = 'menu';          // 覆盖层：menu | pause | tally | result | null
let paused = false, phase = 'curtain', phaseT = 0;
let run = null, world = null, titleWorld = null, levelStart = null;
let hurtFx = 0, gameClock = 0, toastTimer = 0, bannerT = 0, bossTipT = 0;
const eventLog = [];
let applyingNetworkAction = false, epoch = 0, remoteEpoch = -1, lastStateAt = 0, sentTerrain = -1, fullTerrainAt = 0;
let remoteInput = { dir: -1 }, remoteInputAt = 0, lastInputAt = 0;
let pendingEvents = [], networkStarted = false, snapshotReceivedAt = 0;
const coop = new CoopConnection(onCoopMessage, text => { $('coop-message').textContent = text; });
$('coop-create').addEventListener('click', () => { coop.connect('create', $('coop-name').value.trim() || '坦克手'); });
$('coop-join').addEventListener('click', () => {
  const code = $('coop-code').value.trim();
  if (!/^\d{6}$/.test(code)) { $('coop-message').textContent = '请填写好友的六位数字房间码'; return; }
  coop.connect('join', $('coop-name').value.trim() || '坦克手', code);
});
$('coop-ready').addEventListener('click', () => { const ready = coop.room?.players.find(p => p.slot === coop.slot)?.ready; coop.send({ type: 'ready', ready: !ready }); });
$('coop-start').addEventListener('click', () => coop.send({ type: 'start', config: { mode: settings.mode, stage: startStageOf(settings.mode).stage, lives: settings.lives[settings.mode], armor: settings.armor[settings.mode] } }));
$('coop-copy').addEventListener('click', async () => {
  if (!coop.room) return;
  try { await navigator.clipboard.writeText(coop.room.code); $('coop-message').textContent = '房间码已复制，把它发给好友即可。'; }
  catch { $('coop-message').textContent = '房间码：' + coop.room.code + '（可手动复制）'; }
});
window.addEventListener('pagehide', () => coop.disconnect());

function renderLobby() {
  const room = coop.room;
  $('coop-room').textContent = room ? room.code : '尚未加入';
  $('coop-roster').textContent = room ? room.players.map(p => `${p.slot + 1}P ${p.name} · ${p.slot === 0 ? '房主' : p.ready ? '已准备' : '未准备'}`).join('　 /　 ') : '输入昵称后建房，或填写好友的六位房间码。';
  $('coop-create').disabled = $('coop-join').disabled = !!room;
  $('coop-ready').hidden = !room || coop.host;
  $('coop-start').hidden = !room || !coop.host;
  $('coop-copy').disabled = !room;
  $('coop-start').disabled = !room || room.players.length !== 2 || !room.players.every(p => p.ready);
  $('coop-ready').textContent = room?.players.find(p => p.slot === coop.slot)?.ready ? '取消准备' : '准备好了';
  $('coop-settings').textContent = `开局：${modeName(settings.mode)} · 第 ${startStageOf(settings.mode).stage} 关 · 每人${settings.lives[settings.mode] === 'inf' ? '无限命' : '3命'}。房主在主菜单调整后建房；两人共用战场与得分，各自拾取道具。`;
}
function openLobby() { show('lobby'); renderLobby(); }
function networkAction(action) {
  if (!coop.active || applyingNetworkAction) return false;
  clearInput();
  coop.send({ type: 'action', action });
  return true;
}
function onCoopMessage(msg) {
  if (msg.type === 'joined' || msg.type === 'roster') { renderLobby(); $('coop-message').textContent = '把房间码告诉好友，加入后点准备；由房主开始。'; }
  else if (msg.type === 'start') {
    settings.mode = msg.config.mode;
    run = createRun(msg.config); run.coop = true;
    run.startedAt = gameClock; run.startStage = run.stage; run.startCycle = run.cycle;
    uiMode = 'game'; paused = false; networkStarted = true;
    remoteInput = { dir: -1 }; pendingEvents = []; sentTerrain = -1; remoteEpoch = -1;
    view.setPreset(settings.camera[run.mode]); beginStage(); show(null);
    showToast(`${coop.slot + 1}P · 房间 ${coop.room.code} · ${coop.host ? '你是房主' : '好友是房主'}`);
  } else if (msg.type === 'input' && coop.host) {
    remoteInput = { ...msg.input, firePressed: !!(remoteInput.firePressed || msg.input.firePressed) };
    remoteInputAt = performance.now();
  } else if (msg.type === 'action' && coop.host) {
    applyingNetworkAction = true;
    try {
      if (msg.action === 'pause') pauseGame();
      if (msg.action === 'resume' && paused) resume();
      if (msg.action === 'restart' && paused) restartStage();
      if (msg.action === 'retry' && current === 'result') retryRun();
      if (msg.action === 'tally' && current === 'tally') tallySkip();
    } finally { applyingNetworkAction = false; }
    lastStateAt = 0;
  } else if (msg.type === 'state' && !coop.host && networkStarted) receiveState(msg.state);
  else if (msg.type === 'ended') {
    coop.disconnect(); networkStarted = false; pendingEvents = [];
    toTitle(); openLobby(); $('coop-message').textContent = msg.message;
  }
}
function receiveState(data) {
  if (!data?.world || !data.run || !Array.isArray(data.world.seats) || data.world.seats.length !== 2) return;
  if (!MODES.includes(data.run.mode) || !Number.isFinite(data.run.score) || !Number.isFinite(data.run.stage) || data.run.stage < 1 || data.run.stage > 100 || !Number.isFinite(data.run.cycle) || !data.run.stats || !Object.values(data.run.stats).every(Number.isFinite) || !data.world.kills || !Object.values(data.world.kills).every(Number.isFinite) || ![null, 'pause', 'tally', 'result'].includes(data.overlay)) return;
  const fresh = data.epoch !== remoteEpoch;
  run = data.run;
  if (run.livesMode === 'inf') run.lives = Infinity;
  if (fresh) {
    if (!data.world.terrain) return;
    world = createWorld(run); remoteEpoch = data.epoch;
  }
  hydrate(world, data.world, coop.slot); world.run = run;
  snapshotReceivedAt = performance.now();
  phase = data.phase; phaseT = data.phaseT; gameClock = data.clock;
  paused = data.paused;
  if (fresh) { view.setWorld(world, { rise: true }); buildReserve(); lastHud = ''; }
  $('curtain').hidden = phase !== 'curtain';
  $('curtain-stage').textContent = 'STAGE ' + world.spec.displayStage;
  $('curtain-sub').textContent = '双人合作守基地';
  $('curtain').classList.toggle('closed', phase === 'curtain' && phaseT < 1.57);
  $('gameover-text').hidden = !['gameover', 'over'].includes(world.status);
  for (const e of data.events || []) { if (e.type !== 'end') handleEvent(e); }
  if (data.overlay === 'tally') {
    if (current !== 'tally') startTally(world.status === 'won' ? 'won' : 'lost');
    const progress = data.tally;
    if (progress) while (tallyState.idx < Math.min(progress.idx, tallyState.timeline.length)) tallyApply(tallyState.timeline[tallyState.idx++]);
  } else if (data.overlay === 'result') { if (current !== 'result') finishRun(); }
  else if (current !== data.overlay) show(data.overlay);
  audio.pause(paused);
}
function publishState(now) {
  if (!coop.active || !networkStarted || !coop.host || !world || now - lastStateAt < 50) return;
  const full = sentTerrain !== world.terrainVersion || now - fullTerrainAt > 2000;
  const state = { epoch, run, world: snapshot(world, full), phase, phaseT, clock: gameClock,
    paused, overlay: current, tally: tallyState && { idx: tallyState.idx }, events: pendingEvents };
  if (coop.send({ type: 'state', state })) {
    lastStateAt = now; pendingEvents = [];
    if (full) { sentTerrain = world.terrainVersion; fullTerrainAt = now; }
  }
}
const MODE_TEXT = {
  classic: {
    kicker: 'FC 原版 · 3D 完美复刻', sub: '经典 35 关 · 原版地图、敌军名单与数值',
    rules: '按 FC《坦克大战》逐格还原 35 关：砖墙按 4 像素一块削掉，钢墙只有三颗星能打穿；每关 20 辆敌军按原版顺序从中、右、左三处出场，第 4、11、18 辆闪红色掉道具。移速、弹速、出生间隔、AI 和 6 种道具都照原版。默认原版 3 命、一发就坏，满 2 万分奖一命；打完 35 关进入 36～70 关的困难循环。'
  },
  remix: {
    kicker: '魔改 · 自创地图 · 周目无限', sub: '100 关一周目 · 10 个章节 · 第 5 关小 Boss、第 10 关大 Boss',
    rules: '每章 10 关自创战场，加入河道、树林、冰面：吃到「船」才能过河，船还能替你挡炮；「手枪」直升满级火力、装甲加厚，四星还能烧掉树林。精英重炮和火焰车混在敌军里，道具放久了会被敌军抢走。每章第 5 关小 Boss、第 10 关大 Boss，第 100 关终焉 Boss；打通进入下一周目，敌军更快更硬。默认无限命、3 格耐久，修理包固定在每关第 7、14 辆敌军处掉落。'
  }
};

// ---------- 输入：键盘与触屏共用 ----------
const keys = new Set(), touchHold = new Set(), dirStack = [];
const DIR_KEYS = { KeyW: 0, ArrowUp: 0, KeyD: 1, ArrowRight: 1, KeyS: 2, ArrowDown: 2, KeyA: 3, ArrowLeft: 3 };
const stick = { id: null, axis: -1 };
let firePressed = false, latched = null;
const isDown = name => name === 'fire' ? keys.has('KeyJ') || keys.has('Space') || touchHold.has('fire') : name === 'rotL' ? keys.has('KeyQ') || touchHold.has('rotL') : name === 'rotR' ? keys.has('KeyE') || touchHold.has('rotR') : false;
function rawDir() {
  if (stick.id !== null && stick.axis >= 0) return stick.axis;
  for (let i = dirStack.length - 1; i >= 0; i--) if (keys.has(dirStack[i])) return DIR_KEYS[dirStack[i]];
  return -1;
}
const quarter = yaw => ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
// 屏幕方向 → 战场方向：按镜头朝向吸附四方向；第一人称镜头会跟着车头转，所以按下那一刻锁定
function worldDir() {
  const d = rawDir();
  if (d < 0) { latched = null; return -1; }
  const yaw = view.cameraYaw();
  if (view.firstPerson()) { if (!latched || latched.d !== d) latched = { d, w: (d - quarter(yaw) + 4) % 4 }; return latched.w; }
  latched = null;
  return (d - quarter(yaw) + 4) % 4;
}
function clearInput() {
  dragLook.clear(); lookControl.clear(); pitchControl.clear();
  keys.clear(); touchHold.clear(); dirStack.length = 0; firePressed = false; latched = null;
  joyRelease();
  document.querySelectorAll('.act.down').forEach(b => b.classList.remove('down'));
}

// ---------- 设置菜单 ----------
const modeName = m => m === 'classic' ? '经典复刻 · FC 原版 35 关' : '魔改 · 无限周目';
function fromLabel() {
  if (settings.mode === 'classic') return ['起始关卡', '第 ' + settings.classicStage + ' 关'];
  if (remixProgress && settings.remixFrom === 'continue') return ['进度', '继续第 ' + remixProgress.level + ' 关' + (remixProgress.cycle > 1 ? '（第 ' + remixProgress.cycle + ' 周目）' : '')];
  return ['进度', '从第 1 关开始'];
}
function optLabel(name) {
  const m = settings.mode;
  switch (name) {
    case 'mode': return ['模式', modeName(m), false];
    case 'from': { const l = fromLabel(); return [l[0], l[1], false]; }
    case 'lives': return ['命数', settings.lives[m] === 'inf' ? '无限命' : '经典 3 命', false];
    case 'armor': return ['耐久', settings.armor[m] === 'classic' ? '经典一发' : '标准 3 格', false];
    case 'demo': return ['演示模式（无敌）', settings.demo ? '开' : '关', settings.demo];
    case 'camera': return [display.touchOn ? '切换视角' : '切换视角（C）', PRESETS[view.presetIndex].name, false];
    case 'quality': return ['画质', { auto: '自动', high: '高', low: '流畅' }[settings.quality] + (settings.quality === 'auto' ? ' · 当前' + (effQuality === 'high' ? '高' : '流畅') : ''), false];
    case 'volume': return ['音量', settings.volume <= 0 ? '静音' : Math.round(settings.volume * 100) + '%', false];
    case 'touch': return ['操作模式', { auto: '自动识别', show: '手机触屏', hide: '电脑键鼠' }[settings.touch], false];
    case 'fps': return ['帧率显示', settings.fps ? '开' : '关', false];
  }
  return [name, '', false];
}
let refreshControlModes = () => {};
function refreshOptions() {
  refreshControlModes();
  document.querySelectorAll('[data-control-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.controlMode === settings.touch)));
  document.querySelectorAll('[data-opt]').forEach(b => {
    const l = optLabel(b.getAttribute('data-opt'));
    const html = '<span>' + l[0] + '</span><span class="val' + (l[2] ? ' warn' : '') + '">◂ ' + l[1] + ' ▸</span>';
    if (b.innerHTML !== html) b.innerHTML = html;
  });
  const t = MODE_TEXT[settings.mode];
  $('mode-kicker').textContent = t.kicker; $('mode-sub').textContent = t.sub; $('mode-rules').textContent = t.rules;
  $('hi-val').textContent = hiOf(settings.mode);
  const fsOn = !!fsElement();
  document.querySelectorAll('.fs-btn').forEach(b => { b.textContent = fsOn ? '退出全屏' : '全屏'; });
  document.querySelectorAll('.fs-label').forEach(b => { b.textContent = fsOn ? '退出' : '全屏'; });
  $('cam-label').textContent = PRESETS[view.presetIndex].name;
  $('demo-badge').hidden = !(uiMode === 'game' && run && run.demo);
  $('fire-hint').textContent = settings.mode === 'classic' ? '开炮（每按一下一发）' : '开炮（可按住）';
}
function cycle(list, v, delta) { return list[(list.indexOf(v) + (delta < 0 ? list.length - 1 : 1)) % list.length]; }
function adjust(name, delta) {
  const m = settings.mode;
  if (name === 'mode') { settings.mode = cycle(MODES, m, delta); store.set('mode', settings.mode); view.setPreset(settings.camera[settings.mode]); buildTitle(); }
  else if (name === 'from') {
    if (m === 'classic') { settings.classicStage = ((settings.classicStage - 1 + (delta < 0 ? CLASSIC_COUNT - 1 : 1)) % CLASSIC_COUNT) + 1; store.set('classicStage', settings.classicStage); }
    else if (remixProgress) settings.remixFrom = settings.remixFrom === 'continue' ? 'new' : 'continue';
    buildTitle();
  }
  else if (name === 'lives') { settings.lives[m] = cycle(['inf', 'classic'], settings.lives[m], delta); store.set('lives.' + m, settings.lives[m]); }
  else if (name === 'armor') { settings.armor[m] = cycle(['std', 'classic'], settings.armor[m], delta); store.set('armor.' + m, settings.armor[m]); }
  else if (name === 'demo') { if (run?.coop) { showToast('联机模式不启用演示无敌'); return; } settings.demo = !settings.demo; if (run) { run.demo = settings.demo; if (settings.demo) run.demoUsed = true; } }
  else if (name === 'camera') { cycleCamera(delta); return; }
  else if (name === 'quality') {
    settings.quality = cycle(['auto', 'high', 'low'], settings.quality, delta); store.set('quality', settings.quality);
    effQuality = settings.quality === 'low' ? 'low' : 'high'; autoProbe = { on: settings.quality === 'auto', frames: [], done: false, decided: null };
    applyQuality();
  } else if (name === 'volume') {
    let v = Math.round(settings.volume * 10) + (delta < 0 ? -1 : 1); if (v > 10) v = 0; if (v < 0) v = 10;
    settings.volume = v / 10; store.set('volume', settings.volume); audio.unlock(); audio.setVolume(settings.volume); if (v > 0) audio.tally();
  } else if (name === 'touch') { clearInput(); settings.touch = cycle(['auto', 'show', 'hide'], settings.touch, delta); store.set('touch', settings.touch); layout(); }
  else if (name === 'fps') { settings.fps = !settings.fps; store.set('fps', settings.fps); fpsEl.hidden = !settings.fps; }
  refreshOptions();
}
function cycleCamera(delta = 1) {
  dragLook.clear(); lookControl.clear(); pitchControl.clear();
  const n = PRESETS.length;
  if (localPlayer(world)) delete localPlayer(world).lookHeading;
  view.setPreset((view.presetIndex + (delta < 0 ? n - 1 : 1)) % n);
  const m = run ? run.mode : settings.mode;
  settings.camera[m] = view.presetIndex; store.set('camera.' + m, view.presetIndex);
  latched = null;
  showToast('视角：' + PRESETS[view.presetIndex].name + (PRESETS[view.presetIndex].fp ? '（W 前进，A/D 左右转向）' : ''));
  refreshOptions();
}
function applyQuality() { view.setQuality(effQuality); layout(); }

// ---------- 覆盖层与菜单导航 ----------
function show(name) {
  Object.keys(overlays).forEach(k => { overlays[k].hidden = k !== name; });
  current = name;
  clearInput();
  refreshOptions();
  if (name && name !== 'tally') { const first = items()[0]; if (first) first.focus({ preventScroll: true }); }
  else { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); app.focus({ preventScroll: true }); }
  layout();
}
const items = () => (current ? Array.prototype.filter.call(overlays[current].querySelectorAll('.items > button, .items > a, .control-modes > button'), el => !el.hidden) : []);
const isTyping = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
document.addEventListener('keydown', e => {
  if (isTyping(e)) return;
  audio.unlock(); setInputMode('key');
  if (current === 'tally') { if (!e.repeat && ['Enter', 'NumpadEnter', 'KeyJ', 'Space', 'Escape'].includes(e.code)) { tallySkip(); e.preventDefault(); } return; }
  if (current) {
    const list = items(), i = list.indexOf(document.activeElement), el = list[i];
    switch (e.code) {
      case 'ArrowDown': case 'KeyS': if (list.length) list[(i + 1 + list.length) % list.length].focus(); e.preventDefault(); break;
      case 'ArrowUp': case 'KeyW': if (list.length) list[(i - 1 + list.length) % list.length].focus(); e.preventDefault(); break;
      case 'ArrowLeft': case 'KeyA': case 'ArrowRight': case 'KeyD':
        if (el && el.hasAttribute('data-opt')) { adjust(el.getAttribute('data-opt'), /Left|KeyA/.test(e.code) ? -1 : 1); e.preventDefault(); }
        break;
      case 'Enter': case 'NumpadEnter': case 'KeyJ':
        if (!e.repeat) { if (el) el.click(); else if (list[0]) list[0].click(); }
        e.preventDefault(); break;
      case 'Escape': if (current === 'pause') { resume(); e.preventDefault(); } break;
      case 'KeyC': if (!e.repeat) { cycleCamera(); e.preventDefault(); } break;
    }
    return;
  }
  if (uiMode !== 'game') return;
  const c = e.code;
  if (c === 'Escape' || c === 'Enter' || c === 'NumpadEnter') { if (!e.repeat) pauseGame(); e.preventDefault(); return; }
  if (c === 'KeyC') { if (!e.repeat) cycleCamera(); e.preventDefault(); return; }
  if (c in DIR_KEYS || ['KeyJ', 'KeyQ', 'KeyE', 'Space'].includes(c)) {
    if (!e.repeat) {
      if (c === 'KeyJ' || c === 'Space') firePressed = true;
      if (c in DIR_KEYS) { const i = dirStack.indexOf(c); if (i >= 0) dirStack.splice(i, 1); dirStack.push(c); }
    }
    keys.add(c); e.preventDefault();
  }
});
document.addEventListener('keyup', e => { keys.delete(e.code); const i = dirStack.indexOf(e.code); if (i >= 0) dirStack.splice(i, 1); });
document.addEventListener('pointerdown', e => { audio.unlock(); if (e.pointerType === 'touch') setInputMode('touch'); }, { capture: true });
document.addEventListener('click', e => {
  if (current === 'tally') { tallySkip(); return; }
  const t = e.target.closest('[data-act],[data-opt]');
  if (!t) return;
  if (t.hasAttribute('data-opt')) { adjust(t.getAttribute('data-opt'), 1); return; }
  switch (t.getAttribute('data-act')) {
    case 'start': startGame(); break;
    case 'coop': openLobby(); break;
    case 'coop-back': coop.disconnect(); networkStarted = false; show('menu'); break;
    case 'retry': retryRun(); break;
    case 'resume': resume(); break;
    case 'restart': restartStage(); break;
    case 'title': toTitle(); break;
    case 'fullscreen': toggleFullscreen(); break;
  }
});
$('btn-pause').addEventListener('click', () => { if (uiMode === 'game' && !current) pauseGame(); });
$('btn-fs').addEventListener('click', () => toggleFullscreen());
$('btn-cam').addEventListener('click', () => { if (uiMode === 'game' && !current) cycleCamera(); });

// ---------- 流程 ----------
function startStageOf(mode) {
  if (mode === 'classic') return { stage: settings.classicStage, cycle: 1, score: 0 };
  if (remixProgress && settings.remixFrom === 'continue') return { stage: remixProgress.level, cycle: remixProgress.cycle, score: remixProgress.score };
  return { stage: 1, cycle: 1, score: 0 };
}
function buildTitle() {
  const s = startStageOf(settings.mode);
  titleWorld = createWorld(createRun({ mode: settings.mode, stage: s.stage, cycle: s.cycle, seed: 7 }));
  view.titleMode = true;
  view.setWorld(titleWorld, { rise: true });
}
function startGame(from) {
  if (!applyingNetworkAction) { coop.disconnect(); networkStarted = false; }
  audio.unlock();
  const m = settings.mode, s = from || startStageOf(m);
  if (m === 'remix' && !from && settings.remixFrom === 'new') { remixProgress = null; store.set('remix.progress', null); settings.remixFrom = 'continue'; }
  run = createRun({ mode: m, lives: settings.lives[m], armor: settings.armor[m], demo: settings.demo, stage: s.stage, cycle: s.cycle, score: s.score });
  run.startedAt = gameClock; run.startStage = s.stage; run.startCycle = s.cycle;
  uiMode = 'game'; paused = false;
  view.setPreset(settings.camera[m]);
  beginStage();
  show(null);
}
function beginStage() {
  epoch++;
  world = createWorld(run);
  if (run.coop) world.localSlot = coop.slot;
  levelStart = { score: run.score, lives: run.lives, stars: run.stars, plate: run.plate, boats: run.boats, stats: Object.assign({}, run.stats), bonusGiven: run.bonusGiven, nextBonus: run.nextBonus, coopPlayers: run.coopPlayers?.map(p => ({ ...p })) };
  phase = 'curtain'; phaseT = 0;
  hurtFx = 0; bossTipT = 0; latched = null; firePressed = false;
  const sp = world.spec;
  $('curtain-stage').textContent = 'STAGE ' + sp.displayStage;
  let sub = '';
  if (run.mode === 'remix') {
    sub = sp.theme.name + ' ' + sp.chapter + '-' + sp.chapterStage + (run.cycle > 1 ? ' · 第 ' + run.cycle + ' 周目' : '');
    if (sp.role === 'mini') sub += ' · 小 Boss ' + sp.theme.mini;
    if (sp.role === 'boss') sub += ' · 大 Boss ' + sp.theme.boss;
    if (sp.role === 'final') sub += ' · 终焉 Boss';
  } else if (sp.displayStage > 35) sub = '原版第二轮 · 第 ' + sp.mapNo + ' 关地图 · 敌军按第 35 关';
  $('curtain-sub').textContent = sub;
  const c = $('curtain'); c.hidden = false; c.classList.remove('closed'); void c.offsetWidth; c.classList.add('closed');
  $('gameover-text').hidden = true;
  buildReserve();
}
function restartStage() {
  if (networkAction('restart')) return;
  if (!run || !levelStart) return startGame();
  Object.assign(run, { score: levelStart.score, lives: levelStart.lives, stars: levelStart.stars, plate: levelStart.plate, boats: levelStart.boats, stats: Object.assign({}, levelStart.stats), bonusGiven: levelStart.bonusGiven, nextBonus: levelStart.nextBonus });
  paused = false; audio.pause(false);
  if (run.coop) run.coopPlayers = levelStart.coopPlayers.map(p => ({ ...p }));
  beginStage(); show(null);
}
function pauseGame() {
  if (networkAction('pause')) return;
  if (uiMode !== 'game' || paused || current) return;
  paused = true; audio.pause(true); audio.pauseSound();
  show('pause');
}
function resume() { if (networkAction('resume')) return; paused = false; audio.pause(false); show(null); last = performance.now(); acc = 0; }
function toTitle() {
  coop.disconnect(); networkStarted = false;
  uiMode = 'title'; paused = false; run = null; world = null;
  audio.pause(false); audio.stopMusic();
  $('curtain').hidden = true; $('gameover-text').hidden = true; $('banner').hidden = true; hurtFx = 0;
  remixProgress = store.get('remix.progress', null);
  view.setPreset(settings.camera[settings.mode]);
  buildTitle();
  show('menu');
}
function retryRun() {
  if (networkAction('retry')) return;
  if (run?.coop) { run = createRun({ mode: run.mode, lives: run.livesMode, armor: run.armor, stage: run.stage }); run.coop = true; run.startedAt = gameClock; beginStage(); paused = false; audio.pause(false); show(null); return; }
  const m = run ? run.mode : settings.mode;
  if (m !== settings.mode) { settings.mode = m; store.set('mode', m); }
  const from = run ? { stage: run.stage, cycle: run.cycle, score: m === 'remix' ? (levelStart ? levelStart.score : 0) : 0 } : null;
  startGame(from);
}
function saveRemix() {
  if (run.mode !== 'remix' || run.coop) return;
  remixProgress = { level: run.stage, cycle: run.cycle, score: run.score };
  store.set('remix.progress', remixProgress);
}
function stageCleared() {
  run.stats.stages++;
  if (run.mode === 'classic') run.stage = run.stage >= 70 ? 1 : run.stage + 1;
  else if (run.stage >= REMIX_LEVELS) { run.stage = 1; run.cycle++; showBanner('第 ' + run.cycle + ' 周目开始 · 敌军强化', 3); }
  else run.stage++;
  saveRemix();
  updateHi();
  beginStage();
  show(null);
}
function updateHi() {
  if (!run || run.demoUsed || run.coop) return false;
  if (run.score > hiOf(run.mode)) { store.set('hi.' + run.mode, run.score); return true; }
  return false;
}
function finishRun() {
  const newHi = updateHi(), r = run, secs = Math.max(0, Math.round(gameClock - r.startedAt));
  audio.gameOverJingle();
  $('res-title').textContent = 'GAME OVER';
  const reached = r.mode === 'classic' ? '第 ' + r.stage + ' 关' : '第 ' + r.stage + ' 关' + (r.cycle > 1 ? '（第 ' + r.cycle + ' 周目）' : '');
  const rows = [
    ['模式', modeName(r.mode)],
    ['倒在', reached + (world && world.result === 'eagle' ? ' · 老鹰被毁' : ' · 坦克打光')],
    ['通过关卡', r.stats.stages + ' 关'],
    ['击毁敌军', r.stats.kills + ' 辆'],
  ];
  if (r.mode === 'remix') rows.push(['击败 Boss', r.stats.bosses + ' 个']);
  rows.push(['阵亡', r.stats.deaths + ' 次'], ['用时', Math.floor(secs / 60) + ' 分 ' + (secs % 60) + ' 秒']);
  $('res-table').innerHTML = rows.map(x => '<tr><td>' + x[0] + '</td><td>' + x[1] + '</td></tr>').join('') + '<tr class="total"><td>总分</td><td>' + r.score + '</td></tr>';
  const extra = [(r.livesMode === 'inf' ? '无限命' : '经典 3 命') + ' · ' + (r.armor === 'classic' ? '经典一发' : '标准 3 格耐久（受击 ' + r.stats.hits + ' 次）')];
  extra.push(r.coop ? '双人联机：团队得分，不改动单机最高分和进度' : r.demoUsed ? '本局用过演示模式（无敌），不计最高分' : newHi ? '新纪录！最高分 ' + r.score : '最高分 ' + hiOf(r.mode));
  $('res-extra').textContent = extra.join(' · ');
  const sl = overlays.result.querySelector('.sanlian');
  sl.hidden = r.stats.stages < 1 && r.stats.kills < 10;
  sl.textContent = r.mode === 'classic' ? '原版 35 关一张不少！喜欢这版 3D 坦克大战，也给开发者空投一个“三连补给”？' : '魔改战场还在继续扩建，喜欢的话给开发者空投一个“三连补给”，下一个 Boss 更凶！';
  $('retry-btn').innerHTML = (r.mode === 'classic' ? '从第 ' + r.stage + ' 关再来' : '重打第 ' + r.stage + ' 关') + ' <kbd>Enter</kbd>';
  phase = 'over';
  show('result');
}

// ---------- 原版计分页 ----------
let tallyState = null;
function startTally(result) {
  const w = world, r = run, mode = r.mode;
  const types = mode === 'classic' ? ['basic', 'fast', 'power', 'armor'] : ['basic', 'fast', 'power', 'armor', 'heavy', 'flame', 'escort', 'mini', 'boss', 'final'].filter(k => ['basic', 'fast', 'power', 'armor'].includes(k) || w.kills[k]);
  const rows = types.map(k => ({ k, n: w.kills[k] || 0, pts: Math.round(SCORE[k] * w.diff.scoreMul / 10) * 10 }));
  $('t-hi').textContent = Math.max(hiOf(mode), run.demoUsed ? 0 : r.score);
  $('t-stage').textContent = 'STAGE ' + w.spec.displayStage;
  $('t-score').textContent = r.score;
  $('t-rows').innerHTML = rows.map((x, i) => '<div class="row" id="tr' + i + '"><span class="name">' + TYPE_NAMES[x.k] + '</span><span class="n" id="tn' + i + '">0</span><span class="pts" id="tp' + i + '">0 PTS</span></div>').join('');
  $('t-total').textContent = '';
  let note = '';
  if (result === 'won' && mode === 'remix') {
    const nextL = r.stage >= REMIX_LEVELS ? 1 : r.stage + 1, info = remixInfo(nextL);
    note = '本关 ' + w.stageScore + ' 分 · 下一关：第 ' + nextL + ' 关 ' + info.theme.name + (info.role === 'mini' ? ' · 小 Boss ' + MINI_INFO[remixInfoKind(nextL)].name : info.role === 'boss' ? ' · 大 Boss ' + info.theme.boss : info.role === 'final' ? ' · 终焉 Boss' : '');
  } else if (result === 'won' && mode === 'classic') note = r.stage === 35 ? '35 关全部通过！接下来是原版的第二轮：同样的地图，敌军按第 35 关的阵容' : '';
  else note = world.result === 'eagle' ? (world.eagleBy === 'player' ? '自己的炮弹打中了老鹰……' : '老鹰被摧毁了') : '坦克全部打光了';
  $('t-note').textContent = note;
  // 节奏照原版：首行 32 帧后出现，每辆 9 帧并响计数音，行间 39 帧（空行 30 帧），TOTAL 前 47 帧，之后停 135 帧
  const timeline = []; let t = 32 / 60;
  rows.forEach((x, i) => {
    timeline.push({ t, row: i, n: 0 });
    for (let k = 1; k <= x.n; k++) { t += 9 / 60; timeline.push({ t, row: i, n: k, tick: true }); }
    t += (x.n ? 39 : 30) / 60;
  });
  timeline.push({ t: t + 8 / 60, total: rows.reduce((s, x) => s + x.n, 0) });
  tallyState = { result, rows, timeline, t: 0, end: t + 8 / 60 + 135 / 60, idx: 0 };
  show('tally');
}
function remixInfoKind(level) { const ch = remixInfo(level).chapter; return ['flamecar', 'twin', 'miner', 'commander', 'sniper'][(ch - 1) % 5]; }
function tallyApply(ev) {
  if (ev.total !== undefined) { $('t-total').textContent = ev.total; return; }
  const x = tallyState.rows[ev.row];
  $('tr' + ev.row).classList.add('on'); $('tn' + ev.row).textContent = ev.n; $('tp' + ev.row).textContent = ev.n * x.pts + ' PTS';
  if (ev.tick) audio.tally();
}
function tallyUpdate(dt) {
  const s = tallyState; if (!s) return;
  s.t += dt;
  while (s.idx < s.timeline.length && s.timeline[s.idx].t <= s.t) tallyApply(s.timeline[s.idx++]);
  if (s.t >= s.end) tallyDone();
}
function tallySkip() {
  if (networkAction('tally')) return;
  const s = tallyState; if (!s) return;
  if (s.idx < s.timeline.length) { while (s.idx < s.timeline.length) { const ev = s.timeline[s.idx++]; tallyApply(Object.assign({}, ev, { tick: false })); } s.t = Math.max(s.t, s.end - .6); return; }
  tallyDone();
}
function tallyDone() {
  const s = tallyState; tallyState = null;
  if (s.result === 'won') stageCleared(); else finishRun();
}

// ---------- 事件 ----------
const PU_TEXT = { star: '星星：火力升级', grenade: '手雷：场上敌军全部炸毁', helmet: '头盔：无敌护盾', shovel: '铁锹：老鹰围墙变成钢墙', timer: '定时器：敌军全部冻结', tank: '坦克：生命 +1', gun: '手枪：火力直升、装甲加厚', boat: '船：可以过河，还能挡一发炮弹' };
const LOOT_TEXT = { star: '敌军抢到星星，火力变强了！', gun: '敌军抢到手枪，能打穿钢墙了！', boat: '敌军抢到船，能过河了！', grenade: '敌军抢到手雷，你被炸了一下！', helmet: '敌军抢到头盔，全体护盾 8 秒！', shovel: '敌军抢到铁锹，老鹰围墙被挖空了！', timer: '敌军抢到定时器，你被冻住 3 秒！', tank: '敌军抢到坦克，增援 +1！' };
function handleEvent(e) {
  eventLog.push(e.type); if (eventLog.length > 80) eventLog.shift();
  view.effect(e); audio.effect(e);
  if (run?.coop && e.slot !== undefined && e.slot !== coop.slot && ['pickup', 'repair', 'medal', 'hurt', 'plate', 'boatHit', 'die', 'levelup'].includes(e.type)) return;
  switch (e.type) {
    case 'powerup': showToast('战场上出现了道具！' + (run.mode === 'remix' ? '（4 秒后敌军也会抢）' : '')); break;
    case 'pickup': showToast(PU_TEXT[e.kind] || '道具'); break;
    case 'enemyLoot': showToast(LOOT_TEXT[e.kind] || '敌军抢走了道具'); break;
    case 'repair': showToast(e.repaired === false ? '修理包已拾取：护甲已满' : '修理包：耐久补满'); break;
    case 'medal': showToast('奖章：+500 分'); break;
    case 'item': showToast(e.kind === 'repair' ? '敌军掉下了修理包（扳手）' : '敌军掉下了奖章'); break;
    case 'hurt': hurtFx = 1; showToast('被击中！耐久剩 ' + e.hp + ' 格'); break;
    case 'plate': hurtFx = .6; showToast('装甲挡下一发！' + (e.left ? '还剩 ' + e.left + ' 层' : '装甲没了')); break;
    case 'boatHit': hurtFx = .6; showToast('船体挡下一发！' + (e.left ? '还剩 ' + e.left + ' 层' : '船沉了')); break;
    case 'die': hurtFx = 1; if (run.lives !== Infinity && run.lives > 1) showToast('坦克被击毁，备用坦克出动（剩 ' + (run.lives - 1) + '）'); break;
    case 'life': showToast('奖励一条命！'); break;
    case 'eagle': showToast(e.by === 'player' ? '误伤！自己的炮弹打中了老鹰' : '老鹰被摧毁了！'); break;
    case 'gameover': $('gameover-text').hidden = false; break;
    case 'bossSpawn': showBanner('⚠ ' + e.name + ' 出现！', 2.4); $('boss-tip').textContent = e.tip; bossTipT = 7; break;
    case 'bossDown': showBanner(e.name + ' 被击破！', 2.2); break;
    case 'enrage': showToast(e.name + ' 暴怒了：攻击更快！'); break;
    case 'weakHit': showToast('打中 Boss 背后：伤害 ×2'); break;
    case 'levelup': if (e.gun) showToast(e.level >= 4 ? '满级火力：能烧掉树林' : '手枪：三星火力，能打穿钢墙'); break;
    case 'end': phase = 'tally'; startTally(e.result); break;
  }
}

// ---------- 全屏 ----------
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const fsLog = [];
function toggleFullscreen() {
  if (fsElement()) { const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) ex.call(document); return; }
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) { fsLog.push('unsupported'); showToast('当前浏览器不支持全屏，可以继续在页面内游玩'); return; }
  let p;
  try { p = req.call(el, { navigationUI: 'hide' }); } catch (err) { fsLog.push('throw'); showToast('浏览器未允许全屏，可以继续在页面内游玩'); return; }
  Promise.resolve(p).then(() => {
    fsLog.push('ok');
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').then(() => fsLog.push('lock-ok'), () => fsLog.push('lock-rejected')); } catch (err) { /* 不支持 */ }
  }, () => { fsLog.push('rejected'); showToast('浏览器拒绝了全屏请求，可以继续在页面内游玩'); });
}
function onFsChange() { if (!fsElement() && uiMode === 'game' && !current) pauseGame(); refreshOptions(); layout(); }
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
function showToast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200); }
function showBanner(text, secs) { const b = $('banner'); b.textContent = text; b.hidden = false; bannerT = secs; }

// ---------- 布局：填满视口；手机竖屏开始后旋转成横屏 ----------
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(probe);
const display = { rotated: false, W: 0, H: 0, vw: 0, vh: 0, dpr: 1, touchOn: false };
const toLocal = (cx, cy) => (display.rotated ? { x: cy, y: display.vw - cx } : { x: cx, y: cy });
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|OpenHarmony/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let inputMode = MOBILE_UA || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 'touch' : 'key';
function setInputMode(mode) { if (settings.touch === 'auto' && mode !== inputMode) { clearInput(); inputMode = mode; layout(); } }
// Toy 宿主可能让页面以 0×0 启动且之后不发 resize：读不到尺寸时逐级回退，并定时复查
function viewport() {
  const de = document.documentElement, vv = window.visualViewport;
  const vw = window.innerWidth || de.clientWidth || (vv && vv.width) || screen.width || 960;
  const vh = window.innerHeight || de.clientHeight || (vv && vv.height) || screen.height || 540;
  return { vw: Math.round(vw), vh: Math.round(vh) };
}
let lastOrient = null, lastSize = '';
function layout() {
  const { vw, vh } = viewport(), coarse = inputMode === 'touch';
  const rotate = uiMode === 'game' && vh > vw && (settings.touch === 'show' || settings.touch === 'auto' && coarse);
  const W = rotate ? vh : vw, H = rotate ? vw : vh;
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  stage.style.transform = rotate ? 'translate(' + vw + 'px,0) rotate(90deg)' : 'none';
  stage.classList.toggle('rotated', rotate);
  stage.classList.toggle('compact', H < 520);
  stage.classList.toggle('portrait', H > W);
  stage.classList.toggle('narrow', W < 700);
  stage.classList.toggle('short', H < 760);
  const orient = rotate + ':' + (W > H);
  if (lastOrient !== null && orient !== lastOrient) clearInput();
  lastOrient = orient;
  const cs = getComputedStyle(probe);
  const sa = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  const loc = rotate ? { l: sa.t, r: sa.b, t: sa.r, b: sa.l } : sa;
  stage.style.setProperty('--sal', loc.l + 'px'); stage.style.setProperty('--sar', loc.r + 'px');
  stage.style.setProperty('--sat', loc.t + 'px'); stage.style.setProperty('--sab', loc.b + 'px');
  const touchOn = settings.touch === 'show' || (settings.touch === 'auto' && coarse);
  document.body.classList.toggle('touch-on', touchOn);
  document.body.classList.toggle('mobile-device', MOBILE_UA || matchMedia('(pointer: coarse)').matches);
  const inGame = uiMode === 'game';
  touch.hidden = !(inGame && touchOn);
  hud.hidden = !inGame; $('hud-top').hidden = !inGame; $('side').hidden = !inGame; $('chips').hidden = !inGame; $('status').hidden = !inGame;
  keyHint.hidden = !(inGame && !touchOn && !CLEAN);
  const dpr = Math.min(window.devicePixelRatio || 1, effQuality === 'high' ? (coarse ? 1.5 : 2) : 1);
  view.resize(W, H, dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  Object.assign(display, { rotated: rotate, W, H, vw, vh, dpr, touchOn, backing: [canvas.width, canvas.height] });
  lastSize = vw + 'x' + vh;
}
window.addEventListener('resize', () => layout());
window.addEventListener('orientationchange', () => setTimeout(layout, 60));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => layout());
setInterval(() => { const v = viewport(); if (v.vw + 'x' + v.vh !== lastSize) layout(); }, 500);
window.addEventListener('blur', () => { clearInput(); if (uiMode === 'game' && !current) pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (uiMode === 'game' && !current) pauseGame(); } last = performance.now(); });

// ---------- 触屏：浮动摇杆（四方向，主轴带滞回）+ 按键 ----------
const joyZone = $('joy-zone'), joyBase = $('joy-base'), joyKnob = $('joy-knob');
let jox = 0, joy0 = 0;
const JOY_R = 50, JOY_DEAD = 12;
function joyRelease() { stick.id = null; stick.axis = -1; joyBase.style.transform = ''; joyKnob.style.transform = 'translate(-50%,-50%)'; joyBase.classList.remove('active'); }
joyZone.addEventListener('pointerdown', e => {
  if (stick.id !== null) return;
  stick.id = e.pointerId;
  try { joyZone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const p = toLocal(e.clientX, e.clientY), zr = { x: joyZone.offsetLeft, y: joyZone.offsetTop };
  jox = Math.max(zr.x + joyBase.offsetWidth / 2 + 4, p.x); joy0 = p.y;
  const bx = joyBase.offsetLeft + joyBase.offsetWidth / 2, by = joyBase.offsetTop + joyBase.offsetHeight / 2;
  joyBase.style.transform = 'translate(' + (jox - zr.x - bx) + 'px,' + (joy0 - zr.y - by) + 'px)';
  joyBase.classList.add('active'); stick.axis = -1;
  e.preventDefault();
});
joyZone.addEventListener('pointermove', e => {
  if (e.pointerId !== stick.id) return;
  const p = toLocal(e.clientX, e.clientY);
  const dx = p.x - jox, dy = p.y - joy0, len = Math.hypot(dx, dy), k = len > JOY_R ? JOY_R / len : 1;
  joyKnob.style.transform = 'translate(calc(-50% + ' + (dx * k) + 'px), calc(-50% + ' + (dy * k) + 'px))';
  if (len < JOY_DEAD) { stick.axis = -1; e.preventDefault(); return; }
  const bias = stick.axis === 0 || stick.axis === 2 ? .25 : stick.axis === 1 || stick.axis === 3 ? -.25 : 0;
  const horiz = Math.abs(dx) > Math.abs(dy) * (1 + bias);
  stick.axis = horiz ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  e.preventDefault();
});
const joyEnd = e => { if (e.pointerId === stick.id) joyRelease(); };
joyZone.addEventListener('pointerup', joyEnd); joyZone.addEventListener('pointercancel', joyEnd); joyZone.addEventListener('lostpointercapture', joyEnd);
document.querySelectorAll('#touch [data-hold]').forEach(btn => {
  const name = btn.getAttribute('data-hold');
  let id = null;
  btn.addEventListener('pointerdown', e => {
    id = e.pointerId;
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    btn.classList.add('down'); touchHold.add(name);
    if (name === 'fire') firePressed = true;
    e.preventDefault();
  });
  const end = e => { if (e.pointerId !== id) return; id = null; btn.classList.remove('down'); touchHold.delete(name); };
  btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end); btn.addEventListener('lostpointercapture', end);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});
$('btn-cam-t').addEventListener('pointerdown', e => { e.preventDefault(); if (uiMode === 'game' && !current) cycleCamera(); });
const pitchControl = createPitchController({turn:d=>view.turnPitch(d)});
const lookControl = createLookController({ firstPerson: () => view.firstPerson(), turn: delta => {
  view.yawOffset -= delta;
  const p = localPlayer(world);
  if (p) p.lookHeading = view.cameraYaw();
  latched = null;
} });
const dragLook = bindDragLook({ element: stage, active: () => uiMode === 'game' && !current && !paused,
  toLocal, width: () => display.W, pitch: delta => pitchControl.queue(delta), rotate: delta => lookControl.queue(delta) });
refreshControlModes = addControlModeButtons({ containers: [overlays.menu.querySelector('.items'), overlays.pause.querySelector('.items')],
  get: () => settings.touch, set: value => { clearInput(); settings.touch = value; store.set('touch', value); layout(); refreshOptions(); } });

// ---------- HUD ----------
function buildReserve() {
  const r = $('reserve'); r.innerHTML = '';
  for (let i = 0; i < world.roster.length; i++) {
    const t = world.roster[i], el = document.createElement('i');
    if (t === 'boss' || t === 'final') el.className = 'boss'; else if (t === 'mini') el.className = 'mini'; else if (t === 'heavy' || t === 'flame') el.className = 'elite';
    r.appendChild(el);
  }
}
let lastHud = '';
function updateHud() {
  if (!world) return;
  const r = run, w = world, p = localPlayer(w), personal = localStats(w);
  const stars = p ? p.stars : personal.stars, maxStars = r.mode === 'classic' ? 3 : 4;
  const hp = r.armor === 'classic' ? -1 : personal.hp;
  const key = [r.score, personal.lives, stars, hp, w.spec.displayStage, w.roster.length - w.rosterIndex, w.roster.length].join('|');
  if (key !== lastHud) {
    lastHud = key;
    $('h-mode').textContent = r.mode === 'classic' ? 'STAGE' : '魔改' + (r.cycle > 1 ? ' · ' + r.cycle + ' 周目' : '');
    $('h-stage').textContent = r.mode === 'classic' ? String(w.spec.displayStage) : w.spec.displayStage + ' ' + w.spec.theme.name + ' ' + w.spec.chapter + '-' + w.spec.chapterStage;
    $('h-score').textContent = String(r.score).padStart(6, '0');
    $('h-hi').textContent = String(Math.max(hiOf(r.mode), r.demoUsed ? 0 : r.score)).padStart(6, '0');
    $('h-lives').textContent = personal.lives === Infinity ? '∞' : '×' + personal.lives;
    $('side-lives').textContent = personal.lives === Infinity ? '∞' : String(personal.lives);
    $('side-stage').textContent = w.spec.displayStage;
    $('h-hp-wrap').hidden = hp < 0;
    if (hp >= 0) { let h = ''; for (let i = 1; i <= 3; i++) h += i <= hp ? '♥' : '<span class="off">♥</span>'; $('h-hp').innerHTML = h; }
    $('h-stars').textContent = '★'.repeat(stars) + '☆'.repeat(Math.max(0, maxStars - stars));
    const icons = $('reserve').children, left = w.roster.length - w.rosterIndex;
    if (icons.length !== w.roster.length) buildReserve();
    for (let i = 0; i < icons.length; i++) icons[i].style.visibility = i < left ? 'visible' : 'hidden';
  }
  const low = hp === 1 && phase === 'play';
  hud.classList.toggle('low', low);
  $('h-hp').style.opacity = low && Math.floor(gameClock * 4) % 2 ? '.45' : '1';
  hurtEl.style.opacity = hurtFx > 0 ? hurtFx.toFixed(2) : '0';
  $('demo-badge').hidden = !r.demo;
  $('h-score').previousElementSibling.textContent = r.coop ? '团队' : '1P';
  // 状态标签
  const chips = [];
  if (w.freeze > 0) chips.push(['敌军冻结 ' + Math.ceil(w.freeze / 60), '']);
  if (w.shovel > 0) chips.push(['钢墙老鹰 ' + Math.ceil(w.shovel / 60), '']);
  if (p && p.shield > 0 && phase === 'play') chips.push(['护盾 ' + Math.ceil(p.shield / 60), '']);
  if (p && p.boats > 0) chips.push(['船 ×' + p.boats, '']);
  if (p && p.plate > 0) chips.push(['装甲 ×' + p.plate, '']);
  if (w.playerFrozen > 0) chips.push(['被冻住 ' + Math.ceil(w.playerFrozen / 60), 'warn']);
  if (w.powerup && w.rules.enemyLoot && w.powerup.age > 240) chips.push(['道具会被敌军抢！', 'warn']);
  const html = chips.map(c => '<span class="' + c[1] + '">' + c[0] + '</span>').join('');
  if ($('chips').innerHTML !== html) $('chips').innerHTML = html;
  const b = w.boss && w.boss.state === 'active' ? w.boss : null;
  $('bossbar').hidden = !b;
  if (b) {
    $('boss-name').textContent = b.bossName + (b.model ? ' · ' + b.model : b.type === 'mini' ? ' · ' + MINI_INFO[b.kind].name : '') + (b.enraged ? ' · 暴怒' : '');
    $('boss-fill').style.width = Math.max(0, b.hp / b.maxHp * 100).toFixed(1) + '%';
    $('boss-tip').hidden = bossTipT <= 0;
  }
  $('crosshair').hidden = !(view.firstPerson() && phase === 'play');
  // GAME OVER 字样从底部升到中央（原版每帧 1px，共 127 帧）
  if (w.status === 'gameover' || w.status === 'over') {
    const go = $('gameover-text'), H = display.H || 540, k = Math.min(1, w.overRise / 127);
    go.style.transform = 'translate(-50%,' + ((H + 20) * (1 - k) + (H / 2 - 30) * k).toFixed(0) + 'px)';
  }
}

// ---------- 主循环 ----------
let last = performance.now(), acc = 0, realT = 0, fpsT = 0, manual = false;
const fpsWin = [];
const perf = { on: false, frames: [], work: [] };
function simulate(dt) {
  gameClock += dt;
  const rot = (isDown('rotR') ? 1 : 0) - (isDown('rotL') ? 1 : 0);
  if (uiMode === 'game' && !paused && !current) { lookControl.step(dt, rot); pitchControl.step(dt); }
  if (coop.active && !coop.host && world) {
    const now = performance.now();
    if (now - lastInputAt >= 33 || firePressed) {
      const p = localPlayer(world), enabled = !paused && !current && phase === 'play';
      coop.send({ type: 'input', input: { dir: enabled ? worldDir() : -1, fire: enabled && isDown('fire'), firePressed: enabled && firePressed, look: p?.lookHeading } });
      firePressed = false; lastInputAt = now;
    }
    return;
  }
  if (uiMode !== 'game' || paused || !world) return;
  if (current === 'tally') { tallyUpdate(dt); return; }
  if (current) return;
  if (phase === 'curtain') {
    phaseT += dt;
    if (phaseT >= .27 && !world.curtainSet) { world.curtainSet = true; view.titleMode = false; view.setWorld(world, { rise: true }); audio.startJingle(); }
    if (phaseT >= 1.57 && $('curtain').classList.contains('closed')) $('curtain').classList.remove('closed');
    if (phaseT >= 1.85) { phase = 'play'; phaseT = 0; $('curtain').hidden = true; }
    return;
  }
  if (phase !== 'play') return;
  phaseT += dt;
  const input = { dir: worldDir(), fire: isDown('fire'), firePressed };
  firePressed = false;
  if (run.coop) {
    const remote = performance.now() - remoteInputAt < 600 ? remoteInput : { dir: -1 };
    step(world, { players: [input, remote] }); remoteInput.firePressed = false;
  } else step(world, input);
  hurtFx = Math.max(0, hurtFx - dt * 2.2);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').hidden = true; }
  if (bossTipT > 0) bossTipT -= dt;
  const evs = world.events.splice(0);
  if (coop.active) pendingEvents.push(...evs);
  for (const e of evs) { handleEvent(e); if (current === 'tally') break; }
}
function frame(now) {
  if (manual) { last = now; requestAnimationFrame(frame); return; }
  const dtReal = Math.min(.1, (now - last) / 1000);
  if (perf.on) perf.frames.push(now - last);
  last = now; realT += dtReal;
  const t0 = performance.now();
  acc += dtReal;
  let n = 0;
  while (acc >= STEP && n < 8) { simulate(STEP); acc -= STEP; n++; }
  if (n >= 8) acc = 0;
  publishState(now);
  if (coop.active && networkStarted) {
    $('coop-status').hidden = false;
    $('coop-status').textContent = `房间 ${coop.room.code} · ${coop.slot + 1}P${coop.host ? ' 房主' : ''} · ${coop.rtt ? coop.rtt + 'ms' : '双人合作'}${paused ? ' · 全队暂停' : ''}`;
    if (!coop.host && coop.stateCount && now - snapshotReceivedAt > 3000 && !paused) { clearInput(); coop.send({ type: 'action', action: 'pause' }); showToast('同步暂时中断，正在暂停战场'); }
  } else $('coop-status').hidden = true;
  if (autoProbe.on && !autoProbe.done && uiMode === 'game' && phase === 'play' && !current) {
    autoProbe.frames.push(dtReal * 1000);
    if (autoProbe.frames.length > 200) {
      const s = autoProbe.frames.slice(20).sort((a, b) => a - b), med = s[Math.floor(s.length / 2)];
      autoProbe.done = true; autoProbe.decided = { median: +med.toFixed(1), quality: med > 26 ? 'low' : 'high' };
      if (med > 26 && effQuality !== 'low') { effQuality = 'low'; applyQuality(); refreshOptions(); showToast('帧率偏低，已自动切换到流畅画质'); }
    }
  }
  present(dtReal);
  if (settings.fps) {
    fpsWin.push(dtReal * 1000);
    if (realT - fpsT > .5) {
      fpsT = realT;
      const arr = fpsWin.splice(0), mean = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length), worst = Math.max.apply(null, arr), st = view.stats();
      fpsEl.textContent = (1000 / mean).toFixed(0) + ' FPS · ' + mean.toFixed(1) + 'ms · 最慢 ' + worst.toFixed(0) + 'ms · ' + canvas.width + '×' + canvas.height + ' · ' + (effQuality === 'high' ? '高' : '流畅') + ' · ' + st.calls + ' 次绘制';
    }
  }
  if (perf.on) perf.work.push(performance.now() - t0);
  requestAnimationFrame(frame);
}
function present(dt) {
  const active = uiMode === 'game' && world && world.curtainSet;
  view.titleMode = !active;
  const playing = active && !paused && phase === 'play' && !current;
  const intro = active && phase === 'curtain' ? Math.max(0, (phaseT - 1.3) / 1.6) : active && phase === 'play' && phaseT < 1.4 ? Math.min(1, (phaseT + .55) / 1.6) : -1;
  const blend = coop.active && !coop.host ? Math.min(1, (performance.now() - snapshotReceivedAt) / 50) : Math.min(1, acc / STEP);
  if (active) { view.update(paused || current === 'pause' ? 0 : dt, playing ? blend : 1, { intro }); updateHud(); }
  else { if (uiMode === 'title') view.yawOffset = Math.sin(realT * .22) * .35; view.update(dt, 1, {}); }
  audio.tick(playing && !!localPlayer(world), !!localPlayer(world)?.moving);
}

// ---------- 启动 ----------
fpsEl.hidden = !settings.fps;
buildTitle();
layout();
applyQuality();
refreshOptions();
show('menu');
$('loading').hidden = true;
window.__tankReady = true;
requestAnimationFrame(t => { last = t; frame(t); });

// ---------- 自动化测试钩子（仅 ?test=1） ----------
if (TEST) {
  window.__TANK_TEST__ = {
    version: VERSION, qa, settings, coop,
    get world() { return world; }, get run() { return run; }, get view() { return view; },
    state() {
      const p = localPlayer(world);
      return {
        uiMode, overlay: current, paused, phase, coop: { room: coop.room, slot: coop.slot, host: coop.host, states: coop.stateCount, rtt: coop.rtt, epoch }, players: world?.seats?.map(s => ({ slot: s.slot, lives: s.state.lives, tank: s.tank && { x: s.tank.x, y: s.tank.y, id: s.tank.id } })), display: Object.assign({}, display), camera: PRESETS[view.presetIndex].id, yawOffset: +view.yawOffset.toFixed(3), fp: view.firstPerson(),
        quality: { setting: settings.quality, effective: effQuality, auto: autoProbe.decided }, fs: !!fsElement(), fsLog: fsLog.slice(),
        focus: document.activeElement && (document.activeElement.getAttribute('data-act') || document.activeElement.getAttribute('data-opt') || document.activeElement.id),
        toast: toastEl.hidden ? null : toastEl.textContent, touchHidden: touch.hidden, keys: Array.from(keys), touchHold: Array.from(touchHold), stick: Object.assign({}, stick),
        mode: run ? run.mode : settings.mode, stage: run ? run.stage : null, cycle: run ? run.cycle : null, status: world ? world.status : null,
        player: p ? { x: p.x, y: p.y, dir: p.dir, state: p.state, stars: p.stars, shield: p.shield, invuln: p.invuln, boats: p.boats, plate: p.plate } : null,
        run: run ? { score: run.score, lives: run.lives === Infinity ? 'inf' : run.lives, hp: run.hp, armor: run.armor, livesMode: run.livesMode, demo: run.demo, demoUsed: run.demoUsed, stats: Object.assign({}, run.stats) } : null,
        bots: world ? world.bots.map(b => ({ type: b.type, state: b.state, x: b.x, y: b.y, hp: b.hp })) : [], events: eventLog.slice(), remixProgress
      };
    },
    manual(on) { manual = !!on; last = performance.now(); acc = 0; },
    step(n, draw) { for (let i = 0; i < n; i++) simulate(STEP); realT += n * STEP; if (draw !== false) present(n * STEP); return this.state(); },
    skipCurtain() { while (phase === 'curtain') simulate(STEP); },
    skipTally() { while (current === 'tally') { tallySkip(); tallySkip(); } },
    clearStage() { if (!world) return; world.rosterIndex = world.roster.length; world.remaining = world.bots.filter(b => !b.escort).length; for (const b of world.bots) qa.destroyBot(world, b, false); },
    perfStart() { perf.frames = []; perf.work = []; perf.on = true; },
    perfStop() { perf.on = false; return { frames: perf.frames.slice(1), work: perf.work.slice(1) }; },
    renderInfo: () => view.stats(),
    setQuality(q) { settings.quality = q; effQuality = q === 'low' ? 'low' : 'high'; autoProbe = { on: q === 'auto', frames: [], done: false, decided: null }; applyQuality(); refreshOptions(); },
    toLocal, startGame, toTitle
  };
}

installRemakeUI();
