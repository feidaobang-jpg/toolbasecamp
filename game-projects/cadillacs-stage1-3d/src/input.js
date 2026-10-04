// 统一动作输入：键盘与触屏共用一张动作表（不派发伪键盘事件）。
// 按住：移动（模拟量）、atk（J 攻击）、jump（K 跳跃）、run（L 冲刺）、mega（U 必杀）、rotL/rotR（Q/E 转视角）
// 单次：atk / jump / mega / camera / pause / dash（双击方向键或摇杆连推两下）
const KEY_DIR = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
const KEY_BTN = { KeyJ: 'atk', Space: 'atk', KeyK: 'jump', KeyL: 'run', ShiftLeft: 'run', ShiftRight: 'run', KeyU: 'mega', KeyQ: 'rotL', KeyE: 'rotR' };
const DIR_VEC = { u: [0, 1], d: [0, -1], l: [-1, 0], r: [1, 0] };
const held = { u: false, d: false, l: false, r: false };
const keyBtn = { atk: false, jump: false, run: false, mega: false, rotL: false, rotR: false };
const touchBtn = { atk: false, jump: false, run: false, mega: false, rotL: false, rotR: false };
const stick = { x: 0, y: 0 };
const queue = [];
const listeners = [];
const log = [];
const lastTap = { u: -1e9, d: -1e9, l: -1e9, r: -1e9 };
let stickDir = -1, stickDirT = -1e9, stickWasNeutral = true;

function clearAll() {
  held.u = held.d = held.l = held.r = false;
  for (const k in keyBtn) keyBtn[k] = false;
  for (const k in touchBtn) touchBtn[k] = false;
  stick.x = stick.y = 0; stickWasNeutral = true;
  queue.length = 0;
  listeners.forEach(fn => fn('clear'));
}

const I = {
  active: () => false,       // 由 UI 覆盖：游戏进行中且无菜单时为 true
  // 屏幕空间的移动输入：x 右、y 上（键盘对角归一化；摇杆为模拟量）
  move() {
    if (stick.x || stick.y) return { x: stick.x, y: stick.y };
    let x = (held.r ? 1 : 0) - (held.l ? 1 : 0), y = (held.u ? 1 : 0) - (held.d ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  },
  down: (name) => keyBtn[name] || touchBtn[name],
  take(name) { const i = queue.findIndex(e => e.name === name); if (i >= 0) { return queue.splice(i, 1)[0]; } return null; },
  peek(name) { return queue.some(e => e.name === name); },
  push(name, data) { const e = { name, t: performance.now(), data }; queue.push(e); log.push(name); if (log.length > 60) log.shift(); if (queue.length > 24) queue.shift(); },
  flush() { queue.length = 0; },
  clear: clearAll,
  onClear(fn) { listeners.push(fn); },
  debug: () => ({ held: Object.assign({}, held), keyBtn: Object.assign({}, keyBtn), touchBtn: Object.assign({}, touchBtn), stick: Object.assign({}, stick), queue: queue.map(e => e.name), log: log.slice(-20) })
};

const isTyping = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };

window.addEventListener('keydown', (e) => {
  if (isTyping(e) || e.defaultPrevented) return;
  if (!I.active()) return;
  const c = e.code;
  if (c in KEY_DIR) {
    const d = KEY_DIR[c];
    if (!e.repeat && !held[d]) {
      const now = performance.now();
      if (now - lastTap[d] < 260) { I.push('dash', { x: DIR_VEC[d][0], y: DIR_VEC[d][1] }); lastTap[d] = -1e9; }
      else lastTap[d] = now;
    }
    held[d] = true; e.preventDefault();
  } else if (c in KEY_BTN) {
    const b = KEY_BTN[c];
    if (!e.repeat && !keyBtn[b] && b !== 'rotL' && b !== 'rotR' && b !== 'run') I.push(b);
    keyBtn[b] = true; e.preventDefault();
  } else if (c === 'KeyC') { if (!e.repeat) I.push('camera'); e.preventDefault(); }
  else if (c === 'Escape' || c === 'Enter' || c === 'NumpadEnter' || c === 'KeyP') { if (!e.repeat) I.push('pause'); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const c = e.code;
  if (c in KEY_DIR) held[KEY_DIR[c]] = false;
  else if (c in KEY_BTN) keyBtn[KEY_BTN[c]] = false;
});
window.addEventListener('blur', clearAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });

// ---------- 触屏：浮动模拟摇杆 + 动作键 ----------
I.bindTouch = function (zone, base, knob, btns, toLocal) {
  let joyId = null, ox = 0, oy = 0;
  const R = 52, DEAD = 10;
  const home = () => { base.style.transform = ''; knob.style.transform = 'translate(-50%,-50%)'; base.classList.remove('active'); };
  zone.addEventListener('pointerdown', (e) => {
    if (joyId !== null) return;
    joyId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = toLocal(e.clientX, e.clientY);
    ox = Math.max(zone.offsetLeft + base.offsetWidth / 2 + 4, p.x); oy = p.y;
    const bx = base.offsetLeft + base.offsetWidth / 2, by = base.offsetTop + base.offsetHeight / 2;
    base.style.transform = 'translate(' + (ox - zone.offsetLeft - bx) + 'px,' + (oy - zone.offsetTop - by) + 'px)';
    base.classList.add('active');
    stick.x = stick.y = 0; stickWasNeutral = true;
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    const p = toLocal(e.clientX, e.clientY);
    const dx = p.x - ox, dy = p.y - oy, len = Math.hypot(dx, dy), cl = len > R ? R / len : 1;
    knob.style.transform = 'translate(calc(-50% + ' + (dx * cl) + 'px), calc(-50% + ' + (dy * cl) + 'px))';
    if (len < DEAD) { stick.x = stick.y = 0; stickWasNeutral = true; }
    else {
      const m = Math.min(1, (len - DEAD) / (R * 0.55 - DEAD));
      stick.x = dx / len * Math.max(0.35, m); stick.y = -dy / len * Math.max(0.35, m);
      // 摇杆从中立连推两下同一方向 = 冲刺
      if (len > R * 0.6 && stickWasNeutral) {
        const dir = ((Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) % 8) + 8) % 8, now = performance.now();
        if (dir === stickDir && now - stickDirT < 320) { I.push('dash', { x: dx / len, y: -dy / len }); stickDirT = -1e9; }
        else { stickDir = dir; stickDirT = now; }
        stickWasNeutral = false;
      }
    }
    e.preventDefault();
  });
  const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; stick.x = stick.y = 0; stickWasNeutral = true; home(); };
  zone.addEventListener('pointerup', joyEnd); zone.addEventListener('pointercancel', joyEnd); zone.addEventListener('lostpointercapture', joyEnd);

  const ids = {};
  function bindBtn(el, name, onDown, onUp) {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      ids[name] = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      el.classList.add('down'); onDown(); e.preventDefault();
    });
    const end = (e) => { if (e.pointerId !== ids[name]) return; ids[name] = null; el.classList.remove('down'); if (onUp) onUp(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  for (const b of ['atk', 'jump', 'mega']) bindBtn(btns[b], b, () => { touchBtn[b] = true; I.push(b); }, () => { touchBtn[b] = false; });
  for (const b of ['run', 'rotL', 'rotR']) bindBtn(btns[b], b, () => { touchBtn[b] = true; }, () => { touchBtn[b] = false; });
  bindBtn(btns.cam, 'cam', () => { I.push('camera'); });
  I.onClear(() => { joyId = null; home(); for (const k in ids) ids[k] = null; Object.values(btns).forEach(b => b && b.classList.remove('down')); });
};

export default I;
