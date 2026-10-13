// 入口：设置、布局（含手机竖屏旋转为横屏）、主循环、暂停与菜单路由
import * as THREE from '../vendor/three.module.js';
import { Game } from './game.js';
import { UI, VIEW_NAMES } from './ui.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';

const NS = 'lj_pingan_v1_';
const DEFAULTS = { startPhase: 1, lives: 'inf', armor: 'std', view: 0, quality: 'auto', volume: 80, danmaku: true, touchKeys: 'auto', fps: false, mode: 'auto' };
const CYCLE = {
  startPhase: [1, 2, 3, 4, 5], lives: ['inf', '3'], armor: ['std', 'easy', 'one'], demo: [false, true], view: [0, 1, 2, 3],
  quality: ['auto', 'high', 'low'], volume: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], danmaku: [true, false], touchKeys: ['auto', 'show', 'hide'], fps: [false, true],
};
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(NS + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* 存不了就用默认值 */ } },
  del(k) { try { localStorage.removeItem(NS + k); } catch (e) { /* 忽略 */ } },
};

class App {
  constructor() {
    this.stage = $('stage');
    this.canvas = $('gl');
    const saved = store.get('settings') || {};
    this.s = Object.assign({}, DEFAULTS);
    for (const k in DEFAULTS) if (saved[k] !== undefined && (!CYCLE[k] || CYCLE[k].includes(saved[k]) || k === 'mode')) this.s[k] = saved[k];
    if (!['auto', 'pc', 'touch'].includes(this.s.mode)) this.s.mode = 'auto';
    this.demo = false;                   // 演示模式每次载入都是关
    const q = new URLSearchParams(location.search);
    this.qa = q.get('qa') === '1';
    this.override = {};                  // 测试用临时覆盖，不写回
    if (q.get('quality')) this.override.quality = q.get('quality');
    if (q.get('view')) this.s.view = Math.max(0, Math.min(3, +q.get('view') || 0));
    this.device = navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches ? 'touch' : 'pc';
    this.w = 1280; this.h = 720; this.rot = false;
    this.state = 'menu';
    this.manual = false;
    this.fpsAcc = { n: 0, t: 0, fps: 60, ms: 16, slow: 0, long: 0 };

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.aq = this.device === 'touch' ? 'low' : 'high';
    this.audio = new GameAudio();
    this.audio.setVolume(this.s.volume / 100);
    this.ui = new UI(this);
    this.input = new Input(this.stage, { rotated: () => this.rot, size: () => [this.w, this.h], onDevice: (k) => this.onDevice(k), onEdge: () => this.audio.unlock() });
    this.game = new Game(this);
    this.applyQuality();
    this.applyMode();
    this.layout(true);
    this._bind();
    this.ui.show('menu');
    $('loading').hidden = true;
    if (this.qa) this._qa();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- 设置 ----------
  get(k) { if (k === 'demo') return this.demo; if (this.override[k] !== undefined) return this.override[k]; return this.s[k]; }
  save() { store.set('settings', this.s); }
  cycle(k, dir) {
    const arr = CYCLE[k]; if (!arr) return;
    const cur = k === 'demo' ? this.demo : this.s[k];
    const v = arr[(arr.indexOf(cur) + dir + arr.length) % arr.length];
    if (k === 'demo') { this.demo = v; if (v && this.game.stats) this.game.stats.demo = true; }
    else { this.s[k] = v; delete this.override[k]; this.save(); }
    if (k === 'view') this.game.setView(v);
    if (k === 'quality') this.applyQuality();
    if (k === 'volume') { this.audio.setVolume(v / 100); }
    if (k === 'touchKeys') this.applyMode();
    if (k === 'fps' && !v) this.ui.setFps(null);
    if (k === 'danmaku' && !v) for (const d of this.ui.dm.splice(0)) d.el.remove();
    this.audio.unlock();
  }
  setMode(v) { this.s.mode = v; this.save(); this.applyMode(); this.audio.unlock(); this.sfx('uiok'); }
  mode() { return this.s.mode === 'auto' ? this.device : this.s.mode; }
  isTouch() { return this.mode() === 'touch'; }
  onDevice(kind) { if (this.device === kind) return; this.device = kind; if (this.s.mode === 'auto') this.applyMode(); }
  applyMode() {
    const touch = this.isTouch();
    const keys = this.s.touchKeys === 'show' || (this.s.touchKeys === 'auto' && touch);
    document.body.classList.toggle('touch-on', touch);
    $('touch').hidden = !keys;
    this.input.clear();
    this.layout(true);
    this.ui.refresh();
  }
  actualQuality() { const q = this.get('quality'); return q === 'auto' ? this.aq : q === 'high' ? 'high' : 'low'; }
  applyQuality() {
    const q = this.actualQuality();
    this.game.setQuality(q);
    this.renderer.shadowMap.enabled = q === 'high';
    this.pr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1.25);
    this.renderer.setPixelRatio(this.pr);
    this.game.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.needsUpdate = true; } });
    this.ui.refresh();
  }
  checkpoint() { const c = store.get('cp'); return c >= 2 && c <= 5 ? c : 0; }
  saveCheckpoint(n) { if (n >= 2) store.set('cp', n); }
  size() { return [this.w, this.h]; }
  sfx(n) { this.audio.play(n, 0.8); }

  // ---------- 布局：手机竖屏时从标题起就旋转为横屏 ----------
  layout(force) {
    const de = document.documentElement, vv = window.visualViewport;
    let W = window.innerWidth || de.clientWidth || (vv && vv.width) || screen.width || 1280;
    let H = window.innerHeight || de.clientHeight || (vv && vv.height) || screen.height || 720;
    if (!(W > 0)) W = 1280; if (!(H > 0)) H = 720;
    const rot = this.isTouch() && H > W;
    const w = Math.round(rot ? H : W), h = Math.round(rot ? W : H);
    if (!force && w === this.w && h === this.h && rot === this.rot && this._W === W) return;
    this._W = W;
    this.w = w; this.h = h; this.rot = rot;
    const st = this.stage.style;
    st.width = w + 'px'; st.height = h + 'px';
    st.transform = rot ? `translate(${W}px,0) rotate(90deg)` : 'none';
    this.stage.classList.toggle('rot', rot);
    const compact = h < 520;
    this.stage.classList.toggle('compact', compact);
    this.renderer.setPixelRatio(this.pr || 1);
    this.renderer.setSize(w, h, false);
    this.game.camera.aspect = w / h;
    this.game.camera.updateProjectionMatrix();
    this.ui.layout(compact);
    this.input.clear();
  }

  _bind() {
    const relayout = () => this.layout(false);
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', () => setTimeout(relayout, 60));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);
    document.addEventListener('fullscreenchange', () => setTimeout(relayout, 60));
    setInterval(relayout, 500);       // 某些外壳里 iframe 先以 0×0 启动且不发 resize
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.input.clear(); if (!this.noAutoPause) this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.input.clear(); if (!this.noAutoPause) this.pause(); } });
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') this.onDevice('pc'); else if (e.pointerType === 'touch') this.onDevice('touch'); this.audio.unlock(); }, true);
    this.stage.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); $('loading').hidden = false; $('ld-text').textContent = '画面被系统回收了，点下面重新加载。'; const b = $('ld-retry'); b.hidden = false; b.onclick = () => location.reload(); });
  }

  onKey(e, down) {
    const code = e.code;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.state !== 'play') {
      if (!down) return;
      if (code === 'Escape' && this.state === 'pause') { e.preventDefault(); this.resume(); return; }
      if (this.ui.menuKey(e)) { e.preventDefault(); this.onDevice('pc'); }
      return;
    }
    if (down && !e.repeat) {
      if (code === 'Escape' || code === 'KeyP') { e.preventDefault(); this.pause(); return; }
      if (code === 'KeyC') { e.preventDefault(); this.nextView(); this.onDevice('pc'); return; }
    }
    if (this.input.isGameKey(code)) {
      e.preventDefault();
      if (down) { this.onDevice('pc'); this.audio.unlock(); }
      this.input.key(code, down, e.repeat);
    }
  }

  // ---------- 流程 ----------
  start(cont) {
    this.audio.unlock(); this.audio.resume();
    const phase = cont ? this.checkpoint() || 1 : this.s.startPhase;
    this.game.reset(phase, false);
    this.state = 'play';
    this.ui.show(null);
    this.input.clear();
    this.sfx('uiok');
    this.last = performance.now();
  }
  pause() {
    if (this.state !== 'play' || this.game.over) return;
    this.state = 'pause';
    this.input.clear();
    this.audio.suspend();
    this.ui.show('pause');
  }
  resume() {
    if (this.state !== 'pause') return;
    this.audio.resume();
    this.state = 'play';
    this.ui.show(null);
    this.input.clear();
    this.last = performance.now();
  }
  restart() {
    this.audio.unlock(); this.audio.resume();
    this.game.reset(this.game.stats.startPhase || 1, false);
    this.state = 'play'; this.ui.show(null); this.input.clear(); this.last = performance.now();
  }
  retryPhase() {
    this.audio.unlock(); this.audio.resume();
    this.game.reset(this.game.phase, false);
    this.state = 'play'; this.ui.show(null); this.input.clear(); this.last = performance.now();
  }
  toMenu() {
    this.audio.resume();
    this.audio.setMusic(0);
    this.game.reset(1, true);
    this.state = 'menu';
    this.ui.show('menu');
    this.input.clear();
  }
  onResult(d) {
    let best = store.get('best') || 0;
    if (d.win && !d.demo) { if (d.score > best) { best = d.score; store.set('best', best); } store.del('cp'); }
    d.best = best;
    this.state = 'result';
    this.audio.setMusic(-1);
    this.input.clear();
    this.ui.result(d);
  }
  nextView() {
    if (this.state !== 'play') return;
    const v = this.game.nextView();
    this.s.view = v; this.save();
    this.ui.refresh();
    const tip = v === 3 ? (this.isTouch() ? '按住画面拖动转头' : 'Q/E 或按住鼠标拖动转头') : (this.isTouch() ? '按住画面空白处拖动转视角' : 'Q/E 或按住鼠标拖动转视角');
    this.ui.toast('视角：' + VIEW_NAMES[v] + '　' + tip, 2.2);
    this.sfx('ui');
  }
  fullscreen() {
    const d = document, de = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!req) { this.ui.toast('这个浏览器不支持全屏，可以继续这样玩', 2.4); return; }
    let p;
    try { p = req.call(de); } catch (e) { p = Promise.reject(e); }
    if (p && p.then) p.then(() => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* 不支持横屏锁定时保持旋转布局 */ } }).catch(() => this.ui.toast('浏览器没有允许全屏，可以继续这样玩', 2.4));
  }
  openAuthor() { window.open('https://space.bilibili.com/16214353', '_blank', 'noopener'); }

  // ---------- 主循环 ----------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const raw = (now - this.last) / 1000;
    this.last = now;
    if (this.manual) return;
    const dt = Math.min(0.05, Math.max(0, raw));
    this.measure(raw);
    this.step(dt);
    this.renderer.render(this.game.scene, this.game.camera);
  }
  step(dt) {
    if (this.state === 'play' || this.state === 'menu') this.game.update(dt);
    else if (this.state === 'result') { this.game.fx.update(dt); this.ui.update(dt); }
  }
  measure(raw) {
    const f = this.fpsAcc;
    f.n++; f.t += raw; if (raw > 0.05) f.long++;
    if (f.t >= 0.5) {
      f.fps = Math.round(f.n / f.t); f.ms = Math.round((f.t / f.n) * 1000);
      // 自动画质：连续偏慢就降到流畅档（只降一次，避免来回切）
      if (this.state === 'play' && this.get('quality') === 'auto' && this.aq === 'high') {
        f.slow = f.fps < 42 ? f.slow + 1 : 0;
        if (f.slow >= 6) { this.aq = 'low'; this.applyQuality(); this.layout(true); this.ui.toast('画质已自动调到“流畅”', 2.4); }
      }
      f.n = 0; f.t = 0;
    }
  }
  fpsText() {
    const f = this.fpsAcc, i = this.renderer.info.render;
    const t = `${f.fps} FPS  ${f.ms}ms\n${i.calls} 批  ${(i.triangles / 1000).toFixed(1)}k 面`;
    if (t !== this._ft) { this._ft = t; this.ui.setFps(t); }
  }

  // ---------- 验收用接口（仅 ?qa=1） ----------
  _qa() {
    const app = this;
    window.__lj = {
      app, game: this.game,
      manual(on) { app.manual = on; },
      step(n = 1, render = true, dt = 1 / 60) { for (let i = 0; i < n; i++) app.step(dt); if (render) app.renderer.render(app.game.scene, app.game.camera); },
      info() { const i = app.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; },
    };
  }
}

try {
  window.__app = new App();
} catch (err) {
  const t = $('ld-text'), b = $('ld-retry');
  $('loading').hidden = false;
  if (t) t.textContent = '启动失败：' + (err && err.message ? err.message : err);
  if (b) { b.hidden = false; b.onclick = () => location.reload(); }
  console.error(err);
}
