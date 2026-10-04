// 统一动作输入：键盘与触屏共用一张动作表（不派发伪键盘事件）。
// 按住：移动（8 向）、fire（J 机枪）、bomb（K 手雷/火箭）；单次：camera（C）、pause（Esc/Enter）
const KEY_DIR = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
const held = { u: false, d: false, l: false, r: false };
let keyFire = false, keyBomb = false;
let touchDir = -1, touchFire = false, touchBomb = false;
const queue = [];
const listeners = [];
const log = [];   // 测试用：最近的动作记录

function clearAll() {
  held.u = held.d = held.l = held.r = false;
  keyFire = keyBomb = false; touchDir = -1; touchFire = touchBomb = false; queue.length = 0;
  listeners.forEach(fn => fn('clear'));
}

const I = {
  active: () => false,       // 由 UI 覆盖：游戏进行中且无菜单时为 true
  dir() {
    if (touchDir >= 0) return touchDir;
    const x = (held.r ? 1 : 0) - (held.l ? 1 : 0), y = (held.u ? 1 : 0) - (held.d ? 1 : 0);
    if (!x && !y) return -1;
    const a = Math.atan2(x, y);   // 0 = 北，顺时针
    return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  },
  fire: () => keyFire || touchFire,
  bomb: () => keyBomb || touchBomb,
  take(name) { const i = queue.indexOf(name); if (i >= 0) { queue.splice(i, 1); return true; } return false; },
  push(name) { queue.push(name); log.push(name); if (log.length > 50) log.shift(); },
  clear: clearAll,
  onClear(fn) { listeners.push(fn); },
  debug: () => ({ held: Object.assign({}, held), keyFire, keyBomb, touchDir, touchFire, touchBomb, queue: queue.slice() })
};

const isTyping = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };

window.addEventListener('keydown', (e) => {
  if (isTyping(e) || e.defaultPrevented) return;
  if (!I.active()) return;
  const c = e.code;
  if (c in KEY_DIR) { held[KEY_DIR[c]] = true; e.preventDefault(); }
  else if (c === 'KeyJ' || c === 'Space') { if (!e.repeat) I.push('fireTap'); keyFire = true; e.preventDefault(); }
  else if (c === 'KeyK') { if (!e.repeat) I.push('bombTap'); keyBomb = true; e.preventDefault(); }
  else if (c === 'KeyC') { if (!e.repeat) I.push('camera'); e.preventDefault(); }
  else if (c === 'Escape' || c === 'Enter' || c === 'NumpadEnter') { if (!e.repeat) I.push('pause'); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const c = e.code;
  if (c in KEY_DIR) held[KEY_DIR[c]] = false;
  else if (c === 'KeyJ' || c === 'Space') keyFire = false;
  else if (c === 'KeyK') keyBomb = false;
});
window.addEventListener('blur', clearAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });

// ---------- 触屏：浮动摇杆 + J/K/C 键 ----------
I.bindTouch = function (zone, base, knob, btns, toLocal) {
  let joyId = null, ox = 0, oy = 0;
  const R = 48, DEAD = 12;
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
    touchDir = -1;
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    const p = toLocal(e.clientX, e.clientY);
    const dx = p.x - ox, dy = p.y - oy, len = Math.hypot(dx, dy), cl = len > R ? R / len : 1;
    knob.style.transform = 'translate(calc(-50% + ' + (dx * cl) + 'px), calc(-50% + ' + (dy * cl) + 'px))';
    if (len < DEAD) touchDir = -1;
    else { const a = Math.atan2(dx, -dy); touchDir = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; }
    e.preventDefault();
  });
  const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; touchDir = -1; home(); };
  zone.addEventListener('pointerup', joyEnd); zone.addEventListener('pointercancel', joyEnd); zone.addEventListener('lostpointercapture', joyEnd);

  const ids = {};
  function bindBtn(el, name, onDown, onUp) {
    el.addEventListener('pointerdown', (e) => {
      ids[name] = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      el.classList.add('down'); onDown(); e.preventDefault();
    });
    const end = (e) => { if (e.pointerId !== ids[name]) return; ids[name] = null; el.classList.remove('down'); if (onUp) onUp(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindBtn(btns.fire, 'fire', () => { touchFire = true; I.push('fireTap'); }, () => { touchFire = false; });
  bindBtn(btns.bomb, 'bomb', () => { touchBomb = true; I.push('bombTap'); }, () => { touchBomb = false; });
  bindBtn(btns.cam, 'cam', () => { I.push('camera'); });
  I.onClear(() => { joyId = null; home(); for (const k in ids) ids[k] = null; [btns.fire, btns.bomb, btns.cam].forEach(b => b.classList.remove('down')); });
};

export default I;
