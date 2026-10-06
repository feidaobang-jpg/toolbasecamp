import { installRemakeUI, createPitchController, bindDragLook, addControlModeButtons, createLookController } from '../../../js/game/drag-look.js?v=toy3dui2';
// 入口：设置与菜单、关卡流程（WORLD 卡片 → 游玩 → 死亡 / 过关 → 下一关）、输入映射、HUD、布局（手机竖屏自动旋转）、主循环与测试钩子。
import { createView, PRESETS } from './scene.js?v=toy3dui2';
import { createSession, createWorld, step, STEP, nextLevelId } from './world.js?v=toy3dui2';
import { LEVEL_ORDER } from './levels.js?v=2.1.0';
import { GameAudio } from './audio.js?v=toy3dui2';

const VERSION = 'v2.4.0';
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';      // 自动化测试钩子
const CLEAN = params.get('clean') === '1';    // 录制干净画面：隐藏桌面按键提示

const $ = (id) => document.getElementById(id);
const app = $('app'), stage = $('stage'), canvas = $('screen');
const overlays = { menu: $('menu'), pause: $('pause'), result: $('result') };
const hud = $('hud'), hudTop = $('hud-top'), touch = $('touch'), keyHint = $('keyhint'), card = $('card'), toastEl = $('toast'), fpsEl = $('fps'), hurtEl = $('hurt');
const listUrl = app.getAttribute('data-list-url') || '../../../games.html';
document.querySelectorAll('.list-link').forEach(a => { a.href = listUrl; });

// ---------- 本地保存（独立命名空间，读写失败用默认值） ----------
const NS = 'mario3d-v2:';
const store = {
  get(k, def) { try { const v = localStorage.getItem(NS + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* 隐私模式 */ } }
};
const pick = (v, list, def) => (list.indexOf(v) >= 0 ? v : def);
const settings = {
  level: pick(store.get('level', '1-1'), LEVEL_ORDER, '1-1'),
  lives: pick(store.get('lives', 'inf'), ['inf', 'classic'], 'inf'),
  armor: pick(store.get('armor', 'std'), ['std', 'classic'], 'std'),
  demo: false,
  camera: Math.max(0, Math.min(PRESETS.length - 1, store.get('camera', 0) | 0)),
  quality: pick(store.get('quality', 'auto'), ['auto', 'high', 'low'], 'auto'),
  volume: Math.max(0, Math.min(1, Number(store.get('volume', 0.7)) || 0)),
  touch: pick(store.get('touch', 'auto'), ['auto', 'show', 'hide'], 'auto'),
  fps: store.get('fps', false) === true
};
if (params.get('q') === 'low' || params.get('q') === 'high') settings.quality = params.get('q');   // 测试 / 录制：临时指定画质，不写回
if (LEVEL_ORDER.indexOf(params.get('level')) >= 0) settings.level = params.get('level');
let hi = store.get('hi', 0) | 0;
let effQuality = settings.quality === 'low' ? 'low' : 'high';
let autoProbe = { on: settings.quality === 'auto', frames: [], done: false, decided: null };

// ---------- 渲染与音频 ----------
let view;
try { view = createView(canvas); }
catch (e) {
  const el = $('loading'); el.hidden = false;
  el.innerHTML = '无法启动 3D 画面（WebGL 不可用）：' + (e.message || e) + '<br><button onclick="location.reload()">重试</button><br><a href="' + listUrl + '" style="color:#fff">返回游戏列表</a>';
  throw e;
}
view.setPreset(settings.camera);
const audio = new GameAudio();
audio.setVolume(settings.volume);

// ---------- 游戏状态 ----------
let uiMode = 'title';          // title | game
let current = 'menu';          // 当前覆盖层：menu | pause | result | null
let paused = false;
let phase = 'card';            // card | play
let cardT = 0;
let session = null, w = null, levelStart = null, titleWorld = null, titleT = 0;
let hurtFx = 0, gameClock = 0, tickSfxT = 0;
const cleared = [];
const eventLog = [];

const LEVEL_TIPS = {
  '1-1': '顶问号砖拿蘑菇、火焰花和无敌星；第 4 根水管上按 U（L兼容） 能钻进奖励房间',
  '1-2': '地下关：砖墙顶上也能走；出口水管旁边的天花板上面藏着传送区'
};

// ---------- 输入：键盘与触屏共用一张动作表 ----------
const keys = new Set();                 // 键盘按住
const touchHold = new Set();            // 触屏按住：jump / run / down / rotL / rotR
const joy = { x: 0, y: 0 };             // 触屏摇杆（右 +x，上 +y）
const latch = { jump: false, fire: false };
let sprintArmed = false, sprintMoved = false;
const MOVE_KEYS = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
const isDown = (name) => {
  switch (name) {
    case 'jump': return keys.has('KeyK') || keys.has('Space') || touchHold.has('jump');
    case 'run': return keys.has('KeyJ') || sprintArmed;
    case 'down': return keys.has('KeyU') || keys.has('KeyL') || touchHold.has('down');
    case 'rotL': return keys.has('KeyQ') || touchHold.has('rotL');
    case 'rotR': return keys.has('KeyE') || touchHold.has('rotR');
  }
  return false;
};
function moveAxes() {
  let x = 0, y = 0;
  for (const k of keys) { const d = MOVE_KEYS[k]; if (d === 'r') x = 1; else if (d === 'l') x = x === 1 ? 0 : -1; else if (d === 'u') y = 1; else if (d === 'd') y = y === 1 ? 0 : -1; }
  if (keys.has('KeyD') && keys.has('KeyA')) x = 0;
  if (keys.has('KeyW') && keys.has('KeyS')) y = 0;
  if (!x && !y && (joy.x || joy.y)) { x = joy.x; y = joy.y; }
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  return { x, y };
}
function clearInput() {
  dragLook.clear(); lookControl.clear(); pitchControl.clear();
  sprintArmed = sprintMoved = false;
  keys.clear(); touchHold.clear(); joy.x = joy.y = 0; latch.jump = latch.fire = false;
  joyRelease();
  document.querySelectorAll('.act.down').forEach(b => b.classList.remove('down'));
}
// 相机相对移动：W 沿镜头水平前方，D 沿镜头右方
function buildInput() {
  const a = moveAxes(), yaw = view.cameraYaw();
  if (Math.hypot(a.x,a.y)>.05) { if(sprintArmed)sprintMoved=true; }
  else if(sprintMoved) sprintArmed=sprintMoved=false;
  const cx = Math.cos(yaw), sx = Math.sin(yaw);
  const input = {
    mx: cx * a.x - sx * a.y, mz: -sx * a.x - cx * a.y,
    run: isDown('run'), jump: isDown('jump'), down: isDown('down'),
    jumpPressed: latch.jump, firePressed: latch.fire
  };
  return input;
}

// ---------- 设置菜单 ----------
function optLabel(name) {
  switch (name) {
    case 'level': return ['起始关卡', settings.level + (settings.level === '1-1' ? ' 地面' : ' 地下'), false];
    case 'lives': return ['命数', settings.lives === 'inf' ? '无限命' : '经典 3 命', false];
    case 'armor': return ['耐久', settings.armor === 'classic' ? '原作（小玛丽一碰就输）' : '标准 3 格护心', false];
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
    b.innerHTML = '<span>' + l[0] + '</span><span class="val' + (l[2] ? ' warn' : '') + '">◂ ' + l[1] + ' ▸</span>';
  });
  $('hi-val').textContent = hi;
  const fsOn = !!fsElement();
  document.querySelectorAll('.fs-btn').forEach(b => { b.textContent = fsOn ? '退出全屏' : '全屏'; });
  document.querySelectorAll('.fs-label').forEach(b => { b.textContent = fsOn ? '退出' : '全屏'; });
  $('cam-label').textContent = PRESETS[view.presetIndex].name;
  $('demo-badge').hidden = !(uiMode === 'game' && session && session.settings.demo);
}
function cycle(list, v, delta) { return list[(list.indexOf(v) + (delta < 0 ? list.length - 1 : 1)) % list.length]; }
function adjust(name, delta) {
  if (name === 'level') { settings.level = cycle(LEVEL_ORDER, settings.level, delta); store.set('level', settings.level); if (uiMode === 'title') buildTitle(); }
  else if (name === 'lives') { settings.lives = cycle(['inf', 'classic'], settings.lives, delta); store.set('lives', settings.lives); }
  else if (name === 'armor') { settings.armor = cycle(['std', 'classic'], settings.armor, delta); store.set('armor', settings.armor); }
  else if (name === 'demo') {
    settings.demo = !settings.demo;
    if (session) { session.settings.demo = settings.demo; if (settings.demo) session.demoUsed = true; }
  } else if (name === 'camera') { cycleCamera(delta); return; }
  else if (name === 'quality') {
    settings.quality = cycle(['auto', 'high', 'low'], settings.quality, delta); store.set('quality', settings.quality);
    effQuality = settings.quality === 'low' ? 'low' : 'high';
    autoProbe = { on: settings.quality === 'auto', frames: [], done: false, decided: null };
    applyQuality();
  } else if (name === 'volume') {
    let v = Math.round(settings.volume * 10) + (delta < 0 ? -1 : 1);
    if (v > 10) v = 0; if (v < 0) v = 10;
    settings.volume = v / 10; store.set('volume', settings.volume);
    audio.unlock(); audio.setVolume(settings.volume);
    if (v > 0) audio.sfx('coin');
  } else if (name === 'touch') { clearInput(); settings.touch = cycle(['auto', 'show', 'hide'], settings.touch, delta); store.set('touch', settings.touch); layout(); }
  else if (name === 'fps') { settings.fps = !settings.fps; store.set('fps', settings.fps); fpsEl.hidden = !settings.fps; }
  refreshOptions();
}
function cycleCamera(delta = 1) {
  dragLook.clear(); lookControl.clear(); pitchControl.clear();
  const n = PRESETS.length;
  if (w?.player) delete w.player.lookHeading;
  view.setPreset((view.presetIndex + (delta < 0 ? n - 1 : 1)) % n);
  if (w?.player && view.firstPerson(w)) w.player.lookHeading = view.cameraYaw() + Math.PI;
  settings.camera = view.presetIndex; store.set('camera', settings.camera);
  view.snap = true;
  showToast('视角：' + PRESETS[view.presetIndex].name);
  refreshOptions();
}
function applyQuality() {
  view.setQuality(effQuality);
  layout();
}

// ---------- 覆盖层与菜单导航 ----------
function show(name) {
  Object.keys(overlays).forEach(k => { overlays[k].hidden = k !== name; });
  current = name;
  clearInput();
  refreshOptions();
  if (name) { const first = items()[0]; if (first) first.focus({ preventScroll: true }); }
  else { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); app.focus({ preventScroll: true }); }
  layout();
}
const items = () => (current ? Array.prototype.filter.call(overlays[current].querySelectorAll('.items > button, .items > a, .control-modes > button'), el => !el.hidden) : []);

const isTyping = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
document.addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  audio.unlock();
  setInputMode('key');
  if (current) {
    const list = items(), i = list.indexOf(document.activeElement), el = list[i];
    switch (e.code) {
      case 'ArrowDown': case 'KeyS': if (list.length) list[(i + 1 + list.length) % list.length].focus(); e.preventDefault(); break;
      case 'ArrowUp': case 'KeyW': if (list.length) list[(i - 1 + list.length) % list.length].focus(); e.preventDefault(); break;
      case 'ArrowLeft': case 'KeyA': case 'ArrowRight': case 'KeyD':
        if (el && el.hasAttribute('data-opt')) { adjust(el.getAttribute('data-opt'), /Left|KeyA/.test(e.code) ? -1 : 1); e.preventDefault(); }
        break;
      case 'Enter': case 'NumpadEnter': case 'KeyJ': case 'KeyK':
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
  if (c in MOVE_KEYS || ['KeyJ', 'KeyK', 'KeyU', 'KeyL', 'KeyI', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE', 'Space'].indexOf(c) >= 0) {
    if (!e.repeat) {
      if (c === 'KeyK' || c === 'Space') latch.jump = true;
      if (c === 'KeyJ') latch.fire = true;
      if (['KeyI','ShiftLeft','ShiftRight'].includes(c)) { sprintArmed = true; sprintMoved = Math.hypot(moveAxes().x,moveAxes().y)>.05; }
    }
    keys.add(c); e.preventDefault();
  }
});
document.addEventListener('keyup', (e) => { keys.delete(e.code); });
document.addEventListener('pointerdown', (e) => { audio.unlock(); if (e.pointerType === 'touch') setInputMode('touch'); }, { capture: true });
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-opt]');
  if (!t) return;
  if (t.hasAttribute('data-opt')) { adjust(t.getAttribute('data-opt'), 1); return; }
  switch (t.getAttribute('data-act')) {
    case 'start': startGame(); break;
    case 'again': startGame(); break;
    case 'resume': resume(); break;
    case 'restart': restartLevel(); break;
    case 'title': toTitle(); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'list': audio.stopMusic(); break;
  }
});
$('btn-pause').addEventListener('click', () => { if (uiMode === 'game' && !current) pauseGame(); });
$('btn-fs').addEventListener('click', () => toggleFullscreen());
$('btn-cam').addEventListener('click', () => { if (uiMode === 'game' && !current) cycleCamera(); });

// ---------- 流程 ----------
function buildTitle() {
  titleWorld = createWorld(createSession({ lives: 'inf', armor: 'std', startLevel: settings.level }));
  titleWorld.events.length = 0;
  titleWorld.player.visible = false; titleWorld.player.y = 0;
  titleT = 0;
  view.build(titleWorld);
}
function startGame() {
  audio.unlock();
  session = createSession({ lives: settings.lives, armor: settings.armor, demo: settings.demo, startLevel: settings.level });
  session.stats.startTime = gameClock;
  cleared.length = 0;
  uiMode = 'game'; paused = false;
  beginLevel({});
  show(null);
}
// 进入关卡（新关卡、复活或从头重来）：重新生成关卡，显示 WORLD 卡片
function beginLevel(opts) {
  w = createWorld(session, opts);
  w.events.length = 0;
  if (!opts.respawn && !opts.fromCheckpoint) levelStart = { score: session.score, coins: session.coins, power: session.power, lives: session.lives, hearts: session.hearts };
  view.build(w);
  hurtFx = 0;
  latch.jump = latch.fire = false;
  audio.setHurry(false); audio.stopMusic();
  phase = 'card'; cardT = 0;
  $('card-world').textContent = w.level.name;
  $('card-lives').textContent = session.lives === Infinity ? '∞' : String(session.lives);
  $('card-tip').textContent = opts.respawn ? (session.checkpoint === w.levelId ? '从中途点继续，变回小玛丽' : '从关卡开头继续，变回小玛丽') + (session.settings.armor !== 'classic' ? '，护心已补满' : '') : LEVEL_TIPS[w.levelId] || '';
  card.hidden = false;
}
function endCard() {
  phase = 'play'; card.hidden = true;
  audio.music(w.area.theme);
}
function restartLevel() {
  if (!session || !levelStart) return startGame();
  Object.assign(session, { score: levelStart.score, coins: levelStart.coins, power: levelStart.power, lives: levelStart.lives, hearts: levelStart.hearts, checkpoint: null });
  paused = false; audio.pause(false);
  beginLevel({});
  show(null);
}
function pauseGame() {
  if (uiMode !== 'game' || paused || current) return;
  paused = true; audio.pause(true);
  show('pause');
}
function resume() {
  paused = false; audio.pause(false);
  show(null);
  last = performance.now(); acc = 0;
}
function toTitle() {
  uiMode = 'title'; paused = false; session = null; w = null;
  audio.pause(false); audio.stopMusic(); audio.setHurry(false);
  card.hidden = true; hurtFx = 0;
  buildTitle();
  show('menu');
}
function finishRun(win, extraNote, how) {
  const s = session;
  const newHi = !s.demoUsed && s.score > hi;
  if (newHi) { hi = s.score; store.set('hi', hi); }
  const secs = Math.max(0, Math.round(gameClock - s.stats.startTime));
  $('res-title').textContent = win ? '通关！' : 'GAME OVER';
  const rows = [
    ['完成关卡', cleared.length ? cleared.join('、') : '无'],
    ['金币', s.stats.coins],
    ['踩扁 / 顶翻敌人', s.stats.stomps],
    ['1UP', s.stats.oneups],
    ['发现隐藏', s.stats.secrets],
    ['阵亡', s.stats.deaths + ' 次'],
    ['用时', Math.floor(secs / 60) + ' 分 ' + (secs % 60) + ' 秒']
  ];
  $('tally').innerHTML = rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '<tr class="total"><td>总分</td><td>' + s.score + '</td></tr>';
  const extra = [];
  if (extraNote) extra.push(extraNote);
  extra.push((s.settings.lives === 'inf' ? '无限命' : '经典 3 命') + ' · ' + (s.settings.armor === 'classic' ? '原作耐久' : '标准 3 格护心（受击 ' + s.stats.hits + ' 次）'));
  if (s.demoUsed) extra.push('本局用过演示模式（无敌），不计最高分');
  else extra.push(newHi ? '新纪录！最高分 ' + hi : '最高分 ' + hi);
  $('res-extra').textContent = extra.join(' · ');
  const sl = overlays.result.querySelector('.sanlian');
  sl.hidden = !win;
  sl.textContent = how === 'warp' ? '连传送区都被你翻出来了！喜欢这版 3D 马力欧的话，也给开发者顶一块“三连砖”？' : '旗杆已经拔到顶啦！喜欢这版 3D 马力欧的话，也给开发者顶一块“三连砖”？';
  if (!win) audio.jingle('gameover');
  card.hidden = true;
  show('result');
}

// ---------- 事件：音效、特效、流程 ----------
function handleEvent(e) {
  eventLog.push(e.type); if (eventLog.length > 80) eventLog.shift();
  view.onEvent(e, w);
  switch (e.type) {
    case 'area':
      view.build(w);
      if (w.player.star <= 0) audio.music(e.theme);
      break;
    case 'jump': case 'coin': case 'bump': case 'break': case 'stomp': case 'kick': case 'fireball': case 'pop': case 'sprout':
    case 'grow': case 'fire': case 'powerup': case 'oneup': case 'pipe': case 'firework': case 'checkpoint': case 'revive':
      audio.sfx(e.type, e); break;
    case 'tick': if (gameClock - tickSfxT > 0.05) { tickSfxT = gameClock; audio.sfx('tick'); } break;
    case 'shrink': audio.sfx('shrink'); hurtFx = 1; view.shake = 0.12; break;
    case 'hurt': audio.sfx('hurt'); hurtFx = 1; view.shake = 0.12; showToast('受伤了！剩 ' + e.hearts + ' 格护心'); break;
    case 'hurry': audio.jingle('hurry'); audio.setHurry(true); if (w.player.star <= 0) audio.music(w.area.theme); break;
    case 'star': audio.music('star'); break;
    case 'starEnd': audio.music(w.area.theme); break;
    case 'flagpole': audio.stopMusic(); audio.sfx('flagpole'); break;
    case 'clearTune': audio.jingle('clear'); break;
    case 'die': audio.jingle('die'); break;
    case 'toast': showToast(e.text); break;
    case 'dead': onDead(); break;
    case 'clear': onClear(); break;
    case 'warp':
      cleared.push(w.levelId + '（传送区）');
      audio.jingle('clear');
      finishRun(true, '钻进了 ' + e.world + ' 号传送水管！原作会去 WORLD ' + e.world + '-1，这一版只复刻到 1-2', 'warp');
      break;
  }
  if (e.type === 'checkpoint') showToast('到达中途点：之后从这里继续');
  if (e.type === 'oneup') showToast('1UP！');
}
function onDead() {
  const s = session;
  if (s.lives !== Infinity) {
    s.lives--;
    if (s.lives <= 0) { s.lives = 0; finishRun(false); return; }
  }
  s.power = 'small';
  beginLevel({ fromCheckpoint: true, respawn: true });
}
function onClear() {
  cleared.push(w.levelId);
  const next = nextLevelId(w.levelId);
  if (next) { session.levelId = next; session.checkpoint = null; beginLevel({}); }
  else finishRun(true, cleared.length >= LEVEL_ORDER.length ? '1-1 与 1-2 全部完成' : '从 WORLD ' + cleared[0] + ' 开始，打到了最后一关');
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

let toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

// ---------- 布局：填满视口；手机竖屏开始后旋转成横屏 ----------
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(probe);
const display = { rotated: false, W: 0, H: 0, vw: 0, vh: 0, dpr: 1, touchOn: false };
const toLocal = (cx, cy) => (display.rotated ? { x: cy, y: display.vw - cx } : { x: cx, y: cy });
// 触屏还是键盘：开局看手机 UA 或主指针，之后跟随玩家实际使用的输入
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
  hud.hidden = !inGame; hudTop.hidden = !inGame;
  keyHint.hidden = !(inGame && !touchOn && !CLEAN);
  const dpr = Math.min(window.devicePixelRatio || 1, effQuality === 'high' ? 2 : 1.25);
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (uiMode === 'game' && !current) pauseGame(); } });

// ---------- 触屏：浮动摇杆 + 动作键 ----------
const joyZone = $('joy-zone'), joyBase = $('joy-base'), joyKnob = $('joy-knob');
let joyId = null, jox = 0, joy0 = 0;
const JOY_R = 50, JOY_DEAD = 9;
function joyRelease() { joyId = null; joy.x = joy.y = 0; joyBase.style.transform = ''; joyKnob.style.transform = 'translate(-50%,-50%)'; joyBase.classList.remove('active'); }
joyZone.addEventListener('pointerdown', (e) => {
  if (joyId !== null) return;
  joyId = e.pointerId;
  try { joyZone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const p = toLocal(e.clientX, e.clientY);
  const zr = { x: joyZone.offsetLeft, y: joyZone.offsetTop };
  jox = Math.max(zr.x + joyBase.offsetWidth / 2 + 4, p.x); joy0 = p.y;
  const bx = joyBase.offsetLeft + joyBase.offsetWidth / 2, by = joyBase.offsetTop + joyBase.offsetHeight / 2;
  joyBase.style.transform = 'translate(' + (jox - zr.x - bx) + 'px,' + (joy0 - zr.y - by) + 'px)';
  joyBase.classList.add('active');
  joy.x = joy.y = 0;
  e.preventDefault();
});
joyZone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyId) return;
  const p = toLocal(e.clientX, e.clientY);
  const dx = p.x - jox, dy = p.y - joy0, len = Math.hypot(dx, dy), k = len > JOY_R ? JOY_R / len : 1;
  joyKnob.style.transform = 'translate(calc(-50% + ' + (dx * k) + 'px), calc(-50% + ' + (dy * k) + 'px))';
  if (len < JOY_DEAD) { joy.x = joy.y = 0; }
  else { const m = Math.min(1, (len - JOY_DEAD) / (JOY_R * 0.7 - JOY_DEAD)); joy.x = dx / len * m; joy.y = -dy / len * m; }
  e.preventDefault();
});
const joyEnd = (e) => { if (e.pointerId === joyId) joyRelease(); };
joyZone.addEventListener('pointerup', joyEnd); joyZone.addEventListener('pointercancel', joyEnd); joyZone.addEventListener('lostpointercapture', joyEnd);
document.querySelectorAll('#touch [data-hold]').forEach(btn => {
  const name = btn.getAttribute('data-hold');
  let id = null;
  btn.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    btn.classList.add('down'); touchHold.add(name);
    if (name === 'jump') latch.jump = true;
    if (name === 'fire') latch.fire = true;
    if (name === 'sprint') { sprintArmed = true; sprintMoved = Math.hypot(moveAxes().x,moveAxes().y)>.05; }
    e.preventDefault();
  });
  const end = (e) => { if (e.pointerId !== id) return; id = null; btn.classList.remove('down'); touchHold.delete(name); if(name==='sprint'&&e.type!=='pointerup') sprintArmed=sprintMoved=false; };
  btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end); btn.addEventListener('lostpointercapture', end);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});
$('btn-cam-t').addEventListener('pointerdown', (e) => { e.preventDefault(); if (uiMode === 'game' && !current) cycleCamera(); });
const pitchControl = createPitchController({turn:d=>view.turnPitch(d)});
const lookControl = createLookController({ firstPerson: () => view.firstPerson(w), turn: delta => {
  view.yawOffset -= delta;
  const p = w && w.player;
  if (p) p.lookHeading = view.firstPerson(w) ? view.cameraYaw()+Math.PI : (p.lookHeading ?? p.facing)-delta;

} });
const dragLook = bindDragLook({ element: stage, active: () => uiMode === 'game' && !current && !paused,
  toLocal, width: () => display.W, pitch: delta => pitchControl.queue(delta), rotate: delta => lookControl.queue(delta) });
refreshControlModes = addControlModeButtons({ containers: [overlays.menu.querySelector('.items'), overlays.pause.querySelector('.items')],
  get: () => settings.touch, set: value => { clearInput(); settings.touch = value; store.set('touch', value); layout(); refreshOptions(); } });

// ---------- HUD ----------
let lastHud = '';
function updateHud() {
  if (!w) return;
  const s = session;
  const hearts = s.settings.armor === 'classic' ? -1 : s.hearts;
  const key = [s.score, s.coins, w.levelId, w.time, s.lives, hearts, w.player.power].join('|');
  if (key !== lastHud) {
    lastHud = key;
    $('h-score').textContent = String(s.score).padStart(6, '0');
    $('h-coins').innerHTML = '<i class="coin-ico"></i>×' + String(s.coins).padStart(2, '0');
    $('h-world').textContent = w.levelId;
    $('h-time').textContent = String(Math.max(0, w.time)).padStart(3, '0');
    $('h-lives').textContent = s.lives === Infinity ? '∞' : '×' + s.lives;
    $('h-hearts-wrap').hidden = hearts < 0;
    if (hearts >= 0) { let h = ''; for (let i = 1; i <= 3; i++) h += i <= hearts ? '♥' : '<span class="off">♥</span>'; $('h-hearts').innerHTML = h; }
    $('run-label').textContent = '火球';
    document.querySelector('#touch [data-hold=fire]').disabled = w.player.power !== 'fire';
  }
  // 只剩 1 格护心：护心按游戏时间闪烁变红
  const low = hearts === 1 && w.mode === 'play';
  hud.classList.toggle('low', low);
  if (low) $('h-hearts').style.opacity = Math.floor(gameClock * 4) % 2 ? '0.45' : '1'; else $('h-hearts').style.opacity = '1';
  hurtEl.style.opacity = hurtFx > 0 ? hurtFx.toFixed(2) : '0';
  $('demo-badge').hidden = !s.settings.demo;
}

// ---------- 主循环 ----------
let last = performance.now(), acc = 0, realT = 0, fpsT = 0, manual = false;
const fpsWin = [];
const perf = { on: false, frames: [], work: [] };
function simulate(dt) {
  // 单步推进：Q/E 旋转、卡片计时、世界步进、事件
  gameClock += dt;
  const rot = (isDown('rotR') ? 1 : 0) - (isDown('rotL') ? 1 : 0);
  if (uiMode === 'game' && !paused && !current) { lookControl.step(dt, rot); pitchControl.step(dt); }
  if (uiMode !== 'game' || paused || current || !w) return;
  if (phase === 'card') { cardT += dt; if (cardT >= 2.2) endCard(); return; }
  const input = buildInput();
  if (!view.firstPerson(w) && Math.hypot(input.mx,input.mz) > .05) delete w.player.lookHeading;
  if (w.player.lookHeading !== undefined) w.player.facing = w.player.lookHeading;
  const before = w;
  step(w, input, dt);
  if (w.player.lookHeading !== undefined) w.player.facing = w.player.lookHeading;
  latch.jump = false; latch.fire = false;
  hurtFx = Math.max(0, hurtFx - dt * 2.2);
  while (w === before && w.events.length) {
    handleEvent(w.events.shift());
    if (current || phase === 'card') break;   // 过关 / 复活 / 结算后旧世界的剩余事件不再处理
  }
}
function frame(now) {
  if (manual) { last = now; requestAnimationFrame(frame); return; }
  const dtReal = Math.min(0.1, (now - last) / 1000);
  if (perf.on) perf.frames.push(now - last);
  last = now; realT += dtReal;
  const t0 = performance.now();
  acc += dtReal;
  let n = 0;
  while (acc >= STEP && n < 14) { simulate(STEP); acc -= STEP; n++; }
  if (n >= 14) acc = 0;
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
    if (realT - fpsT > 0.5) {
      fpsT = realT;
      const arr = fpsWin.splice(0), mean = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length), worst = Math.max.apply(null, arr);
      const st = view.stats();
      fpsEl.textContent = (1000 / mean).toFixed(0) + ' FPS · ' + mean.toFixed(1) + 'ms · 最慢 ' + worst.toFixed(0) + 'ms · ' + canvas.width + '×' + canvas.height + ' · ' + (effQuality === 'high' ? '高' : '流畅') + ' · ' + st.calls + ' 次绘制';
    }
  }
  if (perf.on) perf.work.push(performance.now() - t0);
  requestAnimationFrame(frame);
}
function present(dt) {
  view.titleMode = !(uiMode === 'game' && w);
  if (uiMode === 'game' && w) {
    view.update(w, paused || current ? 0 : dt);
    updateHud();
  } else if (titleWorld) {
    // 标题画面：沿关卡缓慢平移展示场景
    titleT += dt;
    const p = titleWorld.player, span = titleWorld.area.width - 24;
    p.x = 6 + (titleT * 2.4) % Math.max(10, span);
    view.update(titleWorld, dt);
  }
}

// ---------- 启动 ----------
fpsEl.hidden = !settings.fps;
buildTitle();
layout();
applyQuality();
refreshOptions();
show('menu');
$('loading').hidden = true;
window.__marioReady = true;
requestAnimationFrame((t) => { last = t; frame(t); });

// ---------- 自动化测试钩子（仅 ?test=1） ----------
if (TEST) {
  window.__MARIO_TEST__ = {
    version: VERSION,
    get world() { return w; },
    get session() { return session; },
    get view() { return view; },
    settings,
    state() {
      const p = w && w.player;
      return {
        uiMode, overlay: current, paused, phase, display: Object.assign({}, display), camera: PRESETS[view.presetIndex].id, yawOffset: +view.yawOffset.toFixed(3),
        quality: { setting: settings.quality, effective: effQuality, auto: autoProbe.decided }, fs: !!fsElement(), fsLog: fsLog.slice(),
        focus: document.activeElement && (document.activeElement.getAttribute('data-act') || document.activeElement.getAttribute('data-opt') || document.activeElement.id),
        toast: toastEl.hidden ? null : toastEl.textContent, card: card.hidden ? null : $('card-world').textContent,
        touchHidden: touch.hidden, keys: Array.from(keys), touchHold: Array.from(touchHold), joy: Object.assign({}, joy),
        level: w ? w.levelId : null, area: w ? w.areaId : null, mode: w ? w.mode : null, time: w ? w.time : null,
        player: p ? { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), vz: +p.vz.toFixed(2), power: p.power, grounded: p.grounded, crouch: p.crouch, star: +p.star.toFixed(2), inv: +p.inv.toFixed(2), visible: p.visible } : null,
        session: session ? { score: session.score, coins: session.coins, lives: session.lives === Infinity ? 'inf' : session.lives, hearts: session.hearts, power: session.power, checkpoint: session.checkpoint, demoUsed: session.demoUsed, stats: Object.assign({}, session.stats) } : null,
        cleared: cleared.slice(), events: eventLog.slice(), hi
      };
    },
    // 手动时钟：停止实时推进，由 step(n) 推进 n 个逻辑步（1/120 秒）并渲染一帧
    manual(on) { manual = !!on; last = performance.now(); acc = 0; },
    step(n, draw) { for (let i = 0; i < n; i++) simulate(STEP); realT += n * STEP; if (draw !== false) present(n * STEP); return this.state(); },
    skipCard() { if (phase === 'card') endCard(); },
    perfStart() { perf.frames = []; perf.work = []; perf.on = true; },
    perfStop() { perf.on = false; return { frames: perf.frames.slice(1), work: perf.work.slice(1) }; },
    renderInfo: () => view.stats(),
    setQuality(q) { settings.quality = q; effQuality = q === 'low' ? 'low' : 'high'; autoProbe = { on: q === 'auto', frames: [], done: false, decided: null }; applyQuality(); refreshOptions(); },
    toLocal
  };
}

installRemakeUI();
