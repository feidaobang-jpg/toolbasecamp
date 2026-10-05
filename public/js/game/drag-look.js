// 空白画面拖动；游戏提供逻辑坐标（含竖屏旋转）与运行状态。
export function bindDragLook({ element, active, toLocal, width, rotate }) {
  let drag = null;
  function clear() {
    const old = drag;
    drag = null;
    if (old && element.hasPointerCapture?.(old.id)) element.releasePointerCapture(old.id);
  }
  element.addEventListener('pointerdown', e => {
    if (!active() || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('button,a,input,select,textarea,[role="dialog"],#joy-zone,#stick,#joyBase,.overlay,#panel')) return;
    drag = { id: e.pointerId, x: toLocal(e.clientX, e.clientY).x };
    try { element.setPointerCapture(e.pointerId); } catch (_) { /* detached pointer */ }
    e.preventDefault();
  });
  element.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!active()) { clear(); return; }
    const x = toLocal(e.clientX, e.clientY).x;
    // 正 delta 表示逻辑画面向右拖，调用方须换算为向右看（与虫潮一致），不能在不同预设反向。
    // 横向拖满一个逻辑屏宽转一周；横竖屏与屏幕尺寸保持一致。
    rotate((x - drag.x) / Math.max(1, width()) * Math.PI * 2);
    drag.x = x;
    e.preventDefault();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    element.addEventListener(type, e => { if (drag?.id === e.pointerId) clear(); });
  }
  window.addEventListener('blur', clear);
  window.addEventListener('resize', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  return { clear };
}

// 沿用各游戏既有的 auto/show/hide 存储值，升级操作模式而不丢失旧设置。
export function addControlModeButtons({ containers, get, set }) {
  const groups = [];
  for (const container of containers) {
    if (!container) continue;
    const group = document.createElement('div');
    group.className = 'action-row control-modes';
    group.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0';
    for (const [value, label] of [['auto','自动识别'],['hide','电脑键鼠'],['show','手机触屏']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'tb-btn';
      button.dataset.controlMode = value; button.textContent = label;
      button.addEventListener('click', () => { set(value); refresh(); });
      group.append(button);
    }
    container.append(group); groups.push(group);
  }
  function refresh() {
    for (const group of groups) for (const button of group.children) {
      button.setAttribute('aria-pressed', String(button.dataset.controlMode === get()));
    }
  }
  refresh();
  return refresh;
}
