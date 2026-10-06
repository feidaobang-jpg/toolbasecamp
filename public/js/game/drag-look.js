// 空白画面拖动；游戏提供逻辑坐标（含竖屏旋转）与运行状态。
export function bindDragLook({ element, active, toLocal, width, rotate, pitch = () => {} }) {
  let drag = null;
  function clear() {
    const old = drag;
    drag = null;
    if (old && element.hasPointerCapture?.(old.id)) element.releasePointerCapture(old.id);
  }
  element.addEventListener('pointerdown', e => {
    if (!active() || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('button,a,input,select,textarea,[role="dialog"],#joy-zone,#stick,#joyBase,.overlay,#panel')) return;
    const point = toLocal(e.clientX, e.clientY);
    drag = { id: e.pointerId, x: point.x, y: point.y };
    try { element.setPointerCapture(e.pointerId); } catch (_) { /* detached pointer */ }
    e.preventDefault();
  });
  element.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!active()) { clear(); return; }
    const point = toLocal(e.clientX, e.clientY), x = point.x;
    // 正 delta 表示逻辑画面向右拖，调用方须换算为向右看（与虫潮一致），不能在不同预设反向。
    // 横向拖满一个逻辑屏宽转一周；横竖屏与屏幕尺寸保持一致。
    rotate((x - drag.x) / Math.max(1, width()) * Math.PI * 2);
    pitch((point.y - drag.y) / Math.max(1, width()) * Math.PI * 2);
    drag.x = x; drag.y = point.y;
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
  if (!document.getElementById('game-control-selection')) {
    const style = document.createElement('style'); style.id = 'game-control-selection';
    style.textContent = `.control-modes button[data-control-mode]{flex:1;min-height:44px;padding:8px 10px;border:2px solid #718078;border-radius:10px;background:#243b32;color:#fff;font-family:inherit;font-size:14px;font-weight:700;box-shadow:none}
      .control-modes button[data-control-mode][aria-pressed="true"]{background:#ffe09a;color:#24372c;border-color:#ffbe36;box-shadow:inset 0 0 0 1px #b57519;font-weight:900}
      .control-modes button:focus-visible{outline:3px solid #fff;outline-offset:2px}`;
    document.head.append(style);
  }
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
    group.addEventListener('keydown', e => {
      const buttons = [...group.children], i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      if (['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)) {
        buttons[(i + (['ArrowLeft','KeyA'].includes(e.code) ? 2 : 1)) % 3].focus();
        e.preventDefault(); e.stopPropagation();
      } else if (['Enter','NumpadEnter','Space','KeyJ'].includes(e.code)) {
        if (!e.repeat) buttons[i].click();
        e.preventDefault(); e.stopPropagation();
      }
    });
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

// Pointer events queue intent; the game clock consumes it at a bounded speed.
export function createLookController({ turn, firstPerson = () => false }) {
  let pending = 0;
  return {
    queue(delta) { pending = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, pending + delta * .5)); },
    clear() { pending = 0; },
    step(dt, keys = 0) {
      const limit = (firstPerson() ? Math.PI / 3 : Math.PI / 2) * Math.max(0, dt);
      const drag = Math.max(-limit, Math.min(limit, pending * (1 - Math.exp(-12 * dt))));
      pending -= drag; if (Math.abs(pending) < .00001) pending = 0;
      const delta = Math.max(-limit, Math.min(limit, drag + keys * limit));
      if (delta) turn(delta);
      return delta;
    },
    get pending() { return pending; }
  };
}

export function createPitchController({ turn }) {
  let pending = 0;
  return {
    queue(d) { pending = Math.max(-.45, Math.min(.45, pending + d * .5)); },
    clear() { pending = 0; },
    step(dt) { const d = Math.max(-dt, Math.min(dt, pending * (1-Math.exp(-12*dt)))); pending -= d; if (Math.abs(pending)<.00001) pending=0; if(d)turn(d); }
  };
}

export function installRemakeUI() {
  if(document.getElementById('remake-interface'))return;
  const style=document.createElement('style'); style.id='remake-interface';
  style.textContent="\n.pause-touch{display:none}body.touch-on .pause-key,body.touch-on kbd{display:none}body.touch-on .pause-touch{display:inline}\n:root{--ink:#2f4436;--cream:#fff6df;--gold:#d59b37;--red:#d85a42;--green:#5d9d54}\n#stage{--action:76px;--gap:12px;--edge:40px;--bottom-edge:36px}\n#stage.compact{--action:60px;--gap:10px;--edge:40px}\n.overlay{background:rgba(34,47,37,.36);align-items:flex-start}.overlay>.panel{margin:auto}\n.panel,.panel.small,.panel.wide{background:#fff6df;color:#2f4436;border:3px solid #dfca91;border-radius:24px;box-shadow:0 6px 0 #a99262,0 18px 40px #0004}\n.title-screen .panel{max-width:1080px}\n.panel .rules,.panel .help,.panel p,.panel h2,.panel .sub,.panel .kicker{color:#2f4436}.panel .legal{color:#7c826b}\n.panel .logo{color:#d85a42;text-shadow:0 4px 0 #813a2b}\n.panel .items>button,.panel .items>a{background:#fffaf0;color:#2f4436;border:2px solid transparent;border-radius:14px;box-shadow:none;min-height:44px;text-shadow:none}\n.panel .items>.primary{background:#5d9d54;color:white}.panel .items .val{color:#a77522}\n.panel .items>button:focus-visible,.panel .items>a:focus-visible{outline:3px solid #e6a32b;outline-offset:0;border-color:#e6a32b}\n.control-modes{grid-column:1/-1}\n#stage #hud-top,#stage.compact #hud-top,body.touch-on #hud-top{top:calc(var(--sat) + 10px);right:calc(var(--sar) + 10px);bottom:auto;gap:8px}\n#hud-top button{white-space:nowrap;flex-shrink:0;min-width:44px;min-height:44px;padding:0 12px;border-radius:14px;background:rgba(255,246,223,.92);border:2px solid #dcc790;color:#2f4436;font-family:inherit;font-size:13px;font-weight:800;box-shadow:0 3px 0 #785a2838}\n#hud-top button b{color:#d85a42}#hud-top button:active{transform:translateY(2px);box-shadow:none}\nbody.mobile-device #btn-fs,body.mobile-device .fs-btn{display:block!important}\n#hud{max-width:calc(100% - 270px)}\n#joy-base{left:calc(var(--sal) + var(--edge));bottom:calc(var(--sab) + var(--bottom-edge));width:128px;height:128px;border:3px solid #fff6dfd9;background:radial-gradient(circle,#fff6df40 0 40%,#2f443638 41% 100%);border-radius:50%}\n#joy-knob{width:58px;height:58px;background:#fff0c4;border:2px solid #b48f4a;box-shadow:0 3px 0 #503c1459;border-radius:50%}\n#touch .act-keys{inset:0;width:auto;height:auto;display:block;pointer-events:none}\n#touch .act{position:absolute;width:var(--action)!important;height:var(--action)!important;border:3px solid #fff;border-radius:50%;color:#fff;box-shadow:0 4px 0 #0005;pointer-events:auto}\n#touch .act b{font:800 26px ui-monospace,Consolas,monospace}#touch .act span{font-size:12px;font-weight:800}\n#btn-fire,#btn-atk,#touch [data-hold=fire]{right:calc(var(--sar) + var(--edge) + var(--action) + var(--gap))!important;bottom:calc(var(--sab) + var(--bottom-edge))!important;background:linear-gradient(#e2573f,#a83a28)!important}\n#btn-bomb,#btn-jump,#touch [data-hold=jump]{right:calc(var(--sar) + var(--edge))!important;bottom:calc(var(--sab) + var(--bottom-edge))!important;background:linear-gradient(#5d9a52,#3d6e37)!important}\n#btn-mega,#touch [data-hold=down]{right:calc(var(--sar) + var(--edge) + var(--action) + var(--gap))!important;bottom:calc(var(--sab) + var(--bottom-edge) + var(--action) + var(--gap))!important;background:linear-gradient(#d8ac42,#986b25)!important}\n#btn-run,#btn-sprint{right:calc(var(--sar) + var(--edge))!important;bottom:calc(var(--sab) + var(--bottom-edge) + var(--action) + var(--gap))!important;background:linear-gradient(#5484bd,#315682)!important}\n#touch .act:disabled{opacity:.45;filter:grayscale(.3);box-shadow:none}\n#touch .act.down{transform:translateY(3px) scale(.95);filter:brightness(1.15);box-shadow:0 1px 0 #0005}\n#stage.compact #joy-base{width:112px;height:112px}button::before,button::after{content:none!important}\n";
  document.head.append(style);
}
