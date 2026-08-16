/**
 * Shared virtual touch controls — Tool Basecamp standard
 *
 * PC: hide virtual pad (wantTouchUI === false)
 * Mobile right pad (bottom-right), key order by frequency:
 *        [L] [O] …   (extras above, if any)
 *           [P]      (pause — always above the 2×2)
 *        [J] [K]
 *        [U] [I]
 *
 * PC keys: WASD + arrows move; J/Enter primary; K/Space secondary;
 *          then U, I, L, O; P = pause (B also pause/resume, FC Start);
 *          V = select/soft function (FC Select). 3D: Q/E camera.
 */
(function (global) {
  'use strict';

  function wantTouchUI() {
    var ua = navigator.userAgent || '';
    try {
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
      }
    } catch (e) {}
    if (/MicroMessenger/i.test(ua) && /Mobile|Android|iPhone|iPad/i.test(ua)) return true;
    try {
      if (window.matchMedia('(pointer: coarse)').matches) return true;
      if (window.matchMedia('(hover: none)').matches && (navigator.maxTouchPoints | 0) > 0) return true;
    } catch (e2) {}
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    return false;
  }

  /**
   * Fixed 2×2 slot centers + pause above + extra row(s) above pause.
   * @returns {{
   *   size:number, gap:number,
   *   J:{x:number,y:number}, K:{x:number,y:number},
   *   U:{x:number,y:number}, I:{x:number,y:number},
   *   P:{x:number,y:number},
   *   extras: Array<{x:number,y:number}>,
   *   slot: function(key:string): {x:number,y:number}|null
   * }}
   */
  function arcadePad(W, H, opt) {
    opt = opt || {};
    var size = opt.size != null ? opt.size : 52;
    var gap = opt.gap != null ? opt.gap : 10;
    var mr = opt.marginRight != null ? opt.marginRight : 12;
    var mb = opt.marginBottom != null ? opt.marginBottom : 12;
    var extraCount = opt.extraCount != null ? opt.extraCount : 0;
    var pauseSize = opt.pauseSize != null ? opt.pauseSize : Math.max(36, size * 0.72);
    var step = size + gap;
    var brX = W - mr - size / 2;
    var brY = H - mb - size / 2;
    var J = { x: brX - step, y: brY - step };
    var K = { x: brX, y: brY - step };
    var U = { x: brX - step, y: brY };
    var I = { x: brX, y: brY };
    var padCx = (J.x + K.x) / 2;
    var P = { x: padCx, y: J.y - gap - pauseSize / 2 - 4 };
    var extras = [];
    var row = 0;
    var col = 0;
    var perRow = 2;
    for (var n = 0; n < extraCount; n++) {
      var exSize = pauseSize;
      var exStep = exSize + gap;
      var topY = P.y - gap - exSize / 2 - 4 - row * exStep;
      var leftX = padCx - exStep / 2;
      extras.push({
        x: leftX + col * exStep,
        y: topY,
        size: exSize
      });
      col++;
      if (col >= perRow) {
        col = 0;
        row++;
      }
    }
    function slot(key) {
      var k = String(key || '').toUpperCase();
      if (k === 'J') return J;
      if (k === 'K') return K;
      if (k === 'U') return U;
      if (k === 'I') return I;
      if (k === 'P') return P;
      return null;
    }
    return {
      size: size,
      gap: gap,
      pauseSize: pauseSize,
      J: J,
      K: K,
      U: U,
      I: I,
      P: P,
      extras: extras,
      slot: slot,
      /* legacy aliases (old C/A/D/B diamond → map toward new JK/UI) */
      A: J,
      B: K,
      C: U,
      D: I
    };
  }

  /**
   * Build button list for canvas games.
   * @param {number} W
   * @param {number} H
   * @param {Array<{key:string,label:string,id?:string,col?:string}>} actions
   *   keys among J,K,U,I,L,O (P added automatically as pause unless includePause===false)
   * @param {object} [opt]
   */
  function layoutButtons(W, H, actions, opt) {
    opt = opt || {};
    actions = actions || [];
    var main = [];
    var extraActs = [];
    var i;
    for (i = 0; i < actions.length; i++) {
      var a = actions[i];
      var key = String(a.key || '').toUpperCase();
      if (key === 'J' || key === 'K' || key === 'U' || key === 'I') main.push(a);
      else if (key === 'P') continue;
      else extraActs.push(a);
    }
    var pad = arcadePad(W, H, {
      size: opt.size,
      gap: opt.gap,
      marginRight: opt.marginRight,
      marginBottom: opt.marginBottom,
      pauseSize: opt.pauseSize,
      extraCount: extraActs.length
    });
    var out = [];
    for (i = 0; i < main.length; i++) {
      var m = main[i];
      var mk = String(m.key).toUpperCase();
      var pos = pad.slot(mk);
      if (!pos) continue;
      out.push({
        key: mk,
        id: m.id || mk.toLowerCase(),
        label: m.label || mk,
        x: pos.x,
        y: pos.y,
        r: pad.size / 2,
        col: m.col
      });
    }
    for (i = 0; i < extraActs.length; i++) {
      var e = extraActs[i];
      var ep = pad.extras[i];
      if (!ep) continue;
      out.push({
        key: String(e.key).toUpperCase(),
        id: e.id || String(e.key).toLowerCase(),
        label: e.label || String(e.key).toUpperCase(),
        x: ep.x,
        y: ep.y,
        r: ep.size / 2,
        col: e.col
      });
    }
    var pause = null;
    if (opt.includePause !== false) {
      pause = {
        key: 'P',
        id: 'pause',
        label: opt.pauseLabel || '暂停',
        x: pad.P.x,
        y: pad.P.y,
        r: pad.pauseSize / 2,
        col: opt.pauseCol
      };
    }
    return { buttons: out, pause: pause, pad: pad };
  }

  function stickHome(H, opt) {
    opt = opt || {};
    var r = opt.r != null ? opt.r : 48;
    var ml = opt.marginLeft != null ? opt.marginLeft : 16;
    var mb = opt.marginBottom != null ? opt.marginBottom : 16;
    return { x: ml + r, y: H - mb - r, r: r };
  }

  function applyNotouchClass(root) {
    var el = root || document.body;
    if (!el || !el.classList) return wantTouchUI();
    var on = wantTouchUI();
    el.classList.toggle('notouch', !on);
    return on;
  }

  /** Standard PC help one-liners */
  function pcHelpLine(parts) {
    /* parts: { move, j, k, u, i, l, o, extra3d } */
    parts = parts || {};
    var bits = [];
    bits.push(parts.move || 'WASD / ↑↓←→ 移动');
    if (parts.j) bits.push('J/回车 ' + parts.j);
    if (parts.k) bits.push('K/空格 ' + parts.k);
    if (parts.u) bits.push('U ' + parts.u);
    if (parts.i) bits.push('I ' + parts.i);
    if (parts.l) bits.push('L ' + parts.l);
    if (parts.o) bits.push('O ' + parts.o);
    if (parts.extra3d) bits.push('Q/E ' + parts.extra3d);
    bits.push('P 暂停');
    return bits.join(' ｜ ');
  }

  function mobileHelpLine() {
    return '手机：左摇杆移动，右侧街机键（上排 J/K，下排 U/I，上方 P 暂停）';
  }

  global.TBTouchUI = {
    wantTouchUI: wantTouchUI,
    arcadePad: arcadePad,
    layoutButtons: layoutButtons,
    stickHome: stickHome,
    applyNotouchClass: applyNotouchClass,
    pcHelpLine: pcHelpLine,
    mobileHelpLine: mobileHelpLine
  };
})(typeof window !== 'undefined' ? window : this);
