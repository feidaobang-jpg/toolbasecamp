// 输入：键盘、触屏摇杆、动作键与拖动转视角，统一映射成动作状态
import { clamp } from './util.js';

const ACT_KEYS = { KeyJ: 'J', KeyK: 'K', KeyU: 'U', KeyI: 'I' };
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

export class Input {
  constructor(stage, hooks) {
    this.stage = stage;
    this.hooks = hooks;         // { rotated(), size(), onDevice(kind), onEdge(name) }
    this.keys = new Set();
    this.held = { J: false, K: false, U: false, I: false };
    this.edges = { J: false, K: false, U: false, I: false };
    this.move = { x: 0, y: 0 };
    this.joy = { x: 0, y: 0, id: null };
    this.lookDX = 0; this.lookDY = 0;
    this.lookId = null; this.lookLast = null;
    this.dragging = false;
    this.acts = {};
    this._bind();
  }

  // 物理位移 → 游戏逻辑位移（竖屏旋转后逆变换）
  delta(dx, dy) { return this.hooks.rotated() ? [dy, -dx] : [dx, dy]; }

  _bind() {
    const $ = (id) => document.getElementById(id);
    const zone = $('joy-zone'), base = $('joy-base'), knob = $('joy-knob');
    this.knob = knob; this.base = base;
    const joyMove = (e) => {
      const r = base.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let [dx, dy] = this.delta(e.clientX - cx, e.clientY - cy);
      const R = 52, d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const dd = Math.min(d, R), m = dd / R;
      if (m < 0.2) { this.joy.x = 0; this.joy.y = 0; }
      else { const k = ((m - 0.2) / 0.8) / dd; this.joy.x = dx * k; this.joy.y = -dy * k; }
    };
    const joyEnd = (e) => {
      if (e && this.joy.id !== e.pointerId) return;
      this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
      knob.style.transform = ''; base.classList.remove('active');
    };
    zone.addEventListener('pointerdown', (e) => {
      if (this.joy.id !== null) return;
      e.preventDefault();
      this.joy.id = e.pointerId; base.classList.add('active');
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (e.pointerType === 'touch') this.hooks.onDevice('touch');
      joyMove(e);
    });
    zone.addEventListener('pointermove', (e) => { if (this.joy.id === e.pointerId) joyMove(e); });
    zone.addEventListener('pointerup', joyEnd);
    zone.addEventListener('pointercancel', joyEnd);
    this._joyEnd = joyEnd;

    // 动作键
    for (const el of document.querySelectorAll('.act')) {
      const a = el.dataset.act;
      this.acts[a] = el;
      const up = (e) => {
        if (el._pid !== undefined && e && e.pointerId !== el._pid) return;
        el._pid = undefined; this.held[a] = false; el.classList.remove('down');
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el._pid = e.pointerId;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        if (e.pointerType === 'touch') this.hooks.onDevice('touch');
        this.held[a] = true; this.edges[a] = true; el.classList.add('down');
        this.hooks.onEdge(a);
      });
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el._up = up;
    }

    // 空白处拖动转视角（鼠标与触屏通用）
    const look = $('look');
    const lookEnd = (e) => {
      if (e && this.lookId !== e.pointerId) return;
      this.lookId = null; this.lookLast = null; this.dragging = false;
    };
    look.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.lookId = e.pointerId; this.lookLast = [e.clientX, e.clientY]; this.dragging = true;
      try { look.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (e.pointerType === 'touch') this.hooks.onDevice('touch');
      this.hooks.onEdge('look');
    });
    look.addEventListener('pointermove', (e) => {
      if (this.lookId !== e.pointerId || !this.lookLast) return;
      const [dx, dy] = this.delta(e.clientX - this.lookLast[0], e.clientY - this.lookLast[1]);
      this.lookLast = [e.clientX, e.clientY];
      const w = Math.max(320, this.hooks.size()[0]);
      this.lookDX = clamp(this.lookDX + dx / w, -1.2, 1.2);
      this.lookDY = clamp(this.lookDY + dy / w, -1.2, 1.2);
    });
    look.addEventListener('pointerup', lookEnd);
    look.addEventListener('pointercancel', lookEnd);
    look.addEventListener('contextmenu', (e) => e.preventDefault());
    this._lookEnd = lookEnd;
  }

  // 键盘（由 main 路由：游戏进行中才调用）
  key(code, down, repeat) {
    if (down) {
      if (repeat) return;
      this.keys.add(code);
      const a = ACT_KEYS[code];
      if (a) { this.held[a] = true; this.edges[a] = true; }
    } else {
      this.keys.delete(code);
      const a = ACT_KEYS[code];
      if (a) this.held[a] = false;
    }
  }
  isGameKey(code) { return !!ACT_KEYS[code] || MOVE_KEYS.includes(code) || code === 'KeyQ' || code === 'KeyE' || code === 'KeyC'; }

  // 每帧取移动向量（x 右为正，y 前为正），对角线归一化
  sample() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (x || y) { const d = Math.hypot(x, y); x /= d; y /= d; }
    else { x = this.joy.x; y = this.joy.y; }
    this.move.x = x; this.move.y = y;
    this.qe = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    return this.move;
  }
  take(a) { const v = this.edges[a]; this.edges[a] = false; return v; }
  takeLook() { const r = [this.lookDX, this.lookDY]; this.lookDX = 0; this.lookDY = 0; return r; }

  // 暂停、失焦、切模式、尺寸变化时清空一切按住状态
  clear() {
    this.keys.clear();
    for (const a in this.held) { this.held[a] = false; this.edges[a] = false; }
    for (const a in this.acts) { this.acts[a]._pid = undefined; this.acts[a].classList.remove('down'); }
    this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
    this.knob.style.transform = ''; this.base.classList.remove('active');
    this.lookId = null; this.lookLast = null; this.dragging = false;
    this.lookDX = 0; this.lookDY = 0;
    this.move.x = 0; this.move.y = 0; this.qe = 0;
  }
}
