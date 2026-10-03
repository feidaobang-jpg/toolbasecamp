// 统一动作输入：键盘与触屏共用一张动作表（不派发伪键盘事件）。
// 方向：W/A/S/D 或方向键；按住动作：fire（J）、jump（K）、rotL/rotR（Q/E 旋转视角）；单次：camera（C）、pause（Esc/Enter）
const KEY_DIR = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
const KEY_HOLD = { KeyJ: 'fire', Space: 'fire', KeyK: 'jump', KeyQ: 'rotL', KeyE: 'rotR' };
const held = { u: false, d: false, l: false, r: false };
const keyHold = { fire: false, jump: false, rotL: false, rotR: false };
const touchHold = { fire: false, jump: false, rotL: false, rotR: false };
let touchVec = null;          // 触屏摇杆 {x, y}，y 向上为正；null = 未按
const queue = [];
const listeners = [];
const log = [];

function clearAll() {
  held.u = held.d = held.l = held.r = false;
  for (const k in keyHold) keyHold[k] = false;
  for (const k in touchHold) touchHold[k] = false;
  touchVec = null; queue.length = 0;
  listeners.forEach(fn => fn('clear'));
}

const I = {
  active: () => false,       // 由界面覆盖：游戏进行中且无菜单时为 true
  // 屏幕方向输入：x 右正、y 上正，各取 -1/0/1（触屏摇杆按 8 方向量化）
  axis() {
    if (touchVec) return { x: touchVec.x, y: touchVec.y };
    return { x: (held.r ? 1 : 0) - (held.l ? 1 : 0), y: (held.u ? 1 : 0) - (held.d ? 1 : 0) };
  },
  held: (name) => !!(keyHold[name] || touchHold[name]),
  take(name) { const i = queue.indexOf(name); if (i >= 0) { queue.splice(i, 1); return true; } return false; },
  push(name) { queue.push(name); log.push(name); if (log.length > 50) log.shift(); },
  clear: clearAll,
  onClear(fn) { listeners.push(fn); },
  debug: () => ({ held: Object.assign({}, held), keyHold: Object.assign({}, keyHold), touchHold: Object.assign({}, touchHold), touchVec, queue: queue.slice() })
};

const isTyping = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };

window.addEventListener('keydown', (e) => {
  if (isTyping(e) || e.defaultPrevented) return;
  if (!I.active()) return;
  const c = e.code;
  if (c in KEY_DIR) { held[KEY_DIR[c]] = true; e.preventDefault(); }
  else if (c in KEY_HOLD) {
    const n = KEY_HOLD[c];
    if (!e.repeat && (n === 'fire' || n === 'jump')) I.push(n + 'Tap');
    keyHold[n] = true; e.preventDefault();
  }
  else if (c === 'KeyC') { if (!e.repeat) I.push('camera'); e.preventDefault(); }
  else if (c === 'Escape' || c === 'Enter' || c === 'NumpadEnter') { if (!e.repeat) I.push('pause'); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const c = e.code;
  if (c in KEY_DIR) held[KEY_DIR[c]] = false;
  else if (c in KEY_HOLD) keyHold[KEY_HOLD[c]] = false;
});
window.addEventListener('blur', clearAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });

// ---------- 触屏：浮动摇杆（8 方向） + 动作键 ----------
// btns: { fire, jump, cam, rotL, rotR }（可缺省）；toLocal 把屏幕坐标逆变换到游戏逻辑坐标（竖屏旋转布局时）
I.bindTouch = function (zone, base, knob, btns, toLocal) {
  let joyId = null, ox = 0, oy = 0;
  const R = 48, DEAD = 12;
  const home = () => { base.style.transform = ''; knob.style.transform = 'translate(-50%,-50%)'; base.classList.remove('active'); };
  zone.addEventListener('pointerdown', (e) => {
    if (joyId !== null) return;
    joyId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = toLocal(e.clientX, e.clientY);
    ox = p.x; oy = p.y;
    // zone 在 #touch（铺满 #stage）里，offsetLeft/Top 即舞台本地坐标，与 toLocal 的结果同一坐标系
    const bx = base.offsetLeft + base.offsetWidth / 2, by = base.offsetTop + base.offsetHeight / 2;
    base.style.transform = 'translate(' + (ox - zone.offsetLeft - bx) + 'px,' + (oy - zone.offsetTop - by) + 'px)';
    base.classList.add('active');
    touchVec = { x: 0, y: 0 };
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    const p = toLocal(e.clientX, e.clientY);
    const dx = p.x - ox, dy = p.y - oy, len = Math.hypot(dx, dy), cl = len > R ? R / len : 1;
    knob.style.transform = 'translate(calc(-50% + ' + (dx * cl) + 'px), calc(-50% + ' + (dy * cl) + 'px))';
    if (len < DEAD) touchVec = { x: 0, y: 0 };
    else {
      const a = Math.atan2(dx, -dy), k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
      const v = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]][k];
      touchVec = { x: v[0], y: v[1] };
    }
    e.preventDefault();
  });
  const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; touchVec = null; home(); };
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
  bindBtn(btns.fire, 'fire', () => { touchHold.fire = true; I.push('fireTap'); }, () => { touchHold.fire = false; });
  bindBtn(btns.jump, 'jump', () => { touchHold.jump = true; I.push('jumpTap'); }, () => { touchHold.jump = false; });
  bindBtn(btns.cam, 'cam', () => { I.push('camera'); });
  bindBtn(btns.rotL, 'rotL', () => { touchHold.rotL = true; }, () => { touchHold.rotL = false; });
  bindBtn(btns.rotR, 'rotR', () => { touchHold.rotR = true; }, () => { touchHold.rotR = false; });
  I.onClear(() => {
    joyId = null; home();
    for (const k in ids) ids[k] = null;
    Object.keys(btns).forEach(k => { if (btns[k]) btns[k].classList.remove('down'); });
  });
};

export default I;
