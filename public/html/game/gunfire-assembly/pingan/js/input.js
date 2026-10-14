// 输入（枪战类布局）：键盘、鼠标瞄准、触屏浮动摇杆 / 滑屏瞄准 / 功能键，统一映射成动作状态
// 纯键盘：WASD 移动，Q/E 左右转、Y/H 上下转，J 开火，K 跳，U 手榴弹，I 互动（上炮 / 上机枪 / 离开），L 亮剑，N 骑兵连，O 或 Z 开镜，R 换弹
// 鼠标：电脑端默认鼠标接管（锁定），被拒绝时按住拖动；左键开火，右键开镜；空格跳，G 手榴弹，F 互动，V 亮剑，X 骑兵连
// 键位与《枪火集结》其余模式对齐：J 射击、K 跳、U 手雷、I 互动
import { clamp } from './util.js';

const HOLD_KEYS = { KeyJ: 'fire', KeyO: 'ads', KeyZ: 'ads', ShiftLeft: 'ads', ShiftRight: 'ads' };
const EDGE_KEYS = { KeyK: 'jump', Space: 'jump', KeyR: 'reload', KeyU: 'nade', KeyG: 'nade', KeyI: 'use', KeyF: 'use', KeyL: 'dash', KeyV: 'dash', KeyN: 'cav', KeyX: 'cav' };
const OTHER_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyY', 'KeyH', 'KeyC'];
const EDGES = ['jump', 'reload', 'nade', 'dash', 'cav', 'use', 'fire'];

export class Input {
  constructor(stage, hooks) {
    this.stage = stage;
    this.hooks = hooks;         // { rotated(), size(), toLogical(x,y), onDevice(kind), onEdge(name), mouseAim(), onLockLost(), onLockFail(silent) }
    this.keys = new Set();
    this.src = { fireKey: false, fireMouse: false, fireTouch: 0, adsKey: false, adsMouse: false };
    this.adsToggle = false;     // 触屏开镜键、未锁定时右键单击：点一下切换
    this.held = { fire: false, ads: false };
    this.edges = {};
    for (const e of EDGES) this.edges[e] = false;
    this.move = { x: 0, y: 0 };
    this.joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
    this.lookDX = 0; this.lookDY = 0;
    this.lookKX = 0; this.lookKY = 0;
    this.lookSrc = 'key';       // 最近一次转视角来自 mouse / touch / key，决定吸附力度
    this.drag = null;           // 空白处拖动
    this.locked = false;
    this.btns = {};
    this._bind();
  }

  // 物理位移 → 游戏逻辑位移（竖屏旋转后逆变换）
  delta(dx, dy) { return this.hooks.rotated() ? [dy, -dx] : [dx, dy]; }
  _look(dx, dy, src) {
    const w = Math.max(320, this.hooks.size()[0]);
    this.lookDX = clamp(this.lookDX + dx / w, -1.5, 1.5);
    this.lookDY = clamp(this.lookDY + dy / w, -1.5, 1.5);
    this.lookSrc = src;
  }

  _bind() {
    const $ = (id) => document.getElementById(id);
    // ---- 浮动摇杆：手指落在左下区域的哪里，摇杆就出现在哪里 ----
    const zone = $('joy-zone'), base = $('joy-base'), knob = $('joy-knob');
    this.knob = knob; this.base = base;
    const R = 50;
    const joyMove = (e) => {
      let [dx, dy] = this.delta(e.clientX - this.joy.cx, e.clientY - this.joy.cy);
      const d = Math.hypot(dx, dy);
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
      base.style.left = ''; base.style.top = ''; base.style.bottom = '';
    };
    zone.addEventListener('pointerdown', (e) => {
      if (this.joy.id !== null) return;
      e.preventDefault();
      this.joy.id = e.pointerId; this.joy.cx = e.clientX; this.joy.cy = e.clientY;
      // 把底座挪到手指位置（逻辑坐标）
      const [lx, ly] = this.hooks.toLogical(e.clientX, e.clientY);
      const half = base.offsetWidth / 2;
      base.style.left = (lx - half) + 'px'; base.style.top = (ly - half) + 'px'; base.style.bottom = 'auto';
      base.classList.add('active');
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (e.pointerType === 'touch') this.hooks.onDevice('touch');
      this.hooks.onEdge('joy');
    });
    zone.addEventListener('pointermove', (e) => { if (this.joy.id === e.pointerId) joyMove(e); });
    zone.addEventListener('pointerup', joyEnd);
    zone.addEventListener('pointercancel', joyEnd);
    this._joyEnd = joyEnd;

    // ---- 功能键 ----
    for (const el of document.querySelectorAll('.tb')) {
      const a = el.dataset.act;
      this.btns[el.id] = el;
      const fire = a === 'fire';
      const up = (e) => {
        if (el._pid === undefined || (e && e.pointerId !== el._pid)) return;
        el._pid = undefined; el.classList.remove('down');
        if (fire) this.src.fireTouch = Math.max(0, this.src.fireTouch - 1);
        this._sync();
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (el._pid !== undefined) return;
        el._pid = e.pointerId; el._last = [e.clientX, e.clientY];
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        if (e.pointerType === 'touch') this.hooks.onDevice('touch');
        el.classList.add('down');
        if (fire) { this.src.fireTouch++; this.edges.fire = true; }
        else if (a === 'ads') { this.adsToggle = !this.adsToggle; }
        else this.edges[a] = true;
        this._sync();
        this.hooks.onEdge(a);
      });
      // 开火键按住时可以拖着瞄
      if (fire) el.addEventListener('pointermove', (e) => {
        if (el._pid !== e.pointerId || !el._last) return;
        const [dx, dy] = this.delta(e.clientX - el._last[0], e.clientY - el._last[1]);
        el._last = [e.clientX, e.clientY];
        this._look(dx, dy, e.pointerType === 'mouse' ? 'mouse' : 'touch');
      });
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el._up = up;
    }

    // ---- 空白处：触屏滑动瞄准；鼠标按住任一键拖动瞄准，左键同时开火，右键单击切换开镜 ----
    const look = $('look');
    const end = (e) => {
      const d = this.drag;
      if (!d || (e && d.id !== e.pointerId)) return;
      if (d.mouse) {
        if (d.button === 0) this.src.fireMouse = false;
        if (d.button === 2) {
          if (this.locked) this.src.adsMouse = false;
          else if (d.moved < 5 && performance.now() - d.t0 < 320) this.adsToggle = !this.adsToggle;
        }
      }
      this.drag = null;
      this._sync();
    };
    look.addEventListener('pointerdown', (e) => {
      if (this.drag) return;
      const mouse = e.pointerType === 'mouse';
      if (mouse && e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      this.drag = { id: e.pointerId, last: [e.clientX, e.clientY], mouse, button: e.button, moved: 0, t0: performance.now() };
      try { look.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (!mouse) this.hooks.onDevice('touch');
      if (mouse) {
        if (e.button === 0) { this.src.fireMouse = true; this.edges.fire = true; }
        if (e.button === 2 && this.locked) this.src.adsMouse = true;
        if (this.hooks.mouseAim() === 'lock' && !this.locked) this.requestLock();
      }
      this._sync();
      this.hooks.onEdge('look');
    });
    look.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId || this.locked) return;
      const [dx, dy] = this.delta(e.clientX - d.last[0], e.clientY - d.last[1]);
      d.moved += Math.abs(dx) + Math.abs(dy);
      d.last = [e.clientX, e.clientY];
      this._look(dx, dy, d.mouse ? 'mouse' : 'touch');
    });
    look.addEventListener('pointerup', end);
    look.addEventListener('pointercancel', end);
    look.addEventListener('contextmenu', (e) => e.preventDefault());
    this._lookEnd = end;

    // ---- 鼠标接管（锁定）：直接移动鼠标瞄准。锁定后鼠标事件发给被锁定的舞台，不再经过 #look，所以按键在这里单独接 ----
    document.addEventListener('mousemove', (e) => { if (this.locked) this._look(e.movementX || 0, e.movementY || 0, 'mouse'); });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.src.fireMouse = true; this.edges.fire = true; }
      if (e.button === 2) this.src.adsMouse = true;
      this._sync();
    });
    document.addEventListener('mouseup', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.src.fireMouse = false;
      if (e.button === 2) this.src.adsMouse = false;
      this._sync();
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.stage;
      if (was && !this.locked) { this.src.adsMouse = false; this.src.fireMouse = false; this._sync(); this.hooks.onLockLost(); }
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; this.hooks.onLockFail(this._lockSilent); });
  }
  // silent：开局 / 继续时的自动尝试，失败不提示（下一次点击画面会再试）
  requestLock(silent = false) {
    if (this.locked) return;
    this._lockSilent = silent;
    try {
      const p = this.stage.requestPointerLock && this.stage.requestPointerLock();
      if (p && p.catch) p.catch(() => this.hooks.onLockFail(silent));
      if (!this.stage.requestPointerLock) this.hooks.onLockFail(silent);
    } catch (err) { this.hooks.onLockFail(silent); }
  }
  exitLock() { if (this.locked && document.exitPointerLock) document.exitPointerLock(); }

  _sync() {
    this.held.fire = this.src.fireKey || this.src.fireMouse || this.src.fireTouch > 0;
    this.held.ads = this.src.adsKey || this.src.adsMouse || this.adsToggle;
    const b = this.btns['act-ads'];
    if (b) b.classList.toggle('on', this.adsToggle);
  }

  // 键盘（由 main 路由：游戏进行中才调用）
  key(code, down, repeat) {
    if (down) {
      if (repeat) return;
      this.keys.add(code);
      const hk = HOLD_KEYS[code];
      if (hk === 'fire') { this.src.fireKey = true; this.edges.fire = true; }
      if (hk === 'ads') this.src.adsKey = true;
      const ek = EDGE_KEYS[code];
      if (ek) this.edges[ek] = true;
    } else {
      this.keys.delete(code);
      const hk = HOLD_KEYS[code];
      if (hk === 'fire') this.src.fireKey = false;
      if (hk === 'ads') this.src.adsKey = this.keys.has('KeyO') || this.keys.has('KeyZ') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    }
    this._sync();
  }
  isGameKey(code) { return !!HOLD_KEYS[code] || !!EDGE_KEYS[code] || OTHER_KEYS.includes(code); }

  // 每帧取移动向量（x 右为正，y 前为正）与按键转视角方向
  sample() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (x || y) { const d = Math.hypot(x, y); x /= d; y /= d; }
    else { x = this.joy.x; y = this.joy.y; }
    this.move.x = x; this.move.y = y;
    this.lookKX = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);     // +1 向右
    this.lookKY = (k.has('KeyY') ? 1 : 0) - (k.has('KeyH') ? 1 : 0);     // +1 抬头
    if (this.lookKX || this.lookKY) this.lookSrc = 'key';
    return this.move;
  }
  take(a) { const v = this.edges[a]; this.edges[a] = false; return v; }
  takeLook() { const r = [this.lookDX, this.lookDY]; this.lookDX = 0; this.lookDY = 0; return r; }

  // 暂停、失焦、切模式、尺寸变化时清空一切按住状态
  clear() {
    this.keys.clear();
    for (const e of EDGES) this.edges[e] = false;
    this.src.fireKey = this.src.fireMouse = this.src.adsKey = this.src.adsMouse = false; this.src.fireTouch = 0;
    this.adsToggle = false;
    for (const id in this.btns) { this.btns[id]._pid = undefined; this.btns[id].classList.remove('down'); }
    this._joyEnd();
    this.drag = null;
    this.lookDX = 0; this.lookDY = 0; this.lookKX = 0; this.lookKY = 0;
    this.move.x = 0; this.move.y = 0;
    this._sync();
  }
}
