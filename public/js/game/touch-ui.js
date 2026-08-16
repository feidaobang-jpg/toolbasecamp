/**
 * Shared virtual touch controls helpers.
 * - PC (fine pointer + hover) must NOT show virtual pad
 * - Arcade face buttons: 2×2 square, bottom-right
 *     C A
 *     D B
 */
(function (global) {
  'use strict';

  function wantTouchUI() {
    var ua = navigator.userAgent || '';
    try {
      /* 桌面鼠标为主：隐藏虚拟键（含带触控的 Windows 笔记本） */
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
   * @param {number} W
   * @param {number} H
   * @param {{size?:number,gap?:number,marginRight?:number,marginBottom?:number}} [opt]
   * @returns {{size:number,A:{x:number,y:number},B:{x:number,y:number},C:{x:number,y:number},D:{x:number,y:number}}}
   */
  function arcadePad(W, H, opt) {
    opt = opt || {};
    var size = opt.size != null ? opt.size : 54;
    var gap = opt.gap != null ? opt.gap : 10;
    var mr = opt.marginRight != null ? opt.marginRight : 12;
    var mb = opt.marginBottom != null ? opt.marginBottom : 12;
    var step = size + gap;
    var brX = W - mr - size / 2;
    var brY = H - mb - size / 2;
    return {
      size: size,
      A: { x: brX, y: brY - step },
      B: { x: brX, y: brY },
      C: { x: brX - step, y: brY - step },
      D: { x: brX - step, y: brY }
    };
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

  global.TBTouchUI = {
    wantTouchUI: wantTouchUI,
    arcadePad: arcadePad,
    stickHome: stickHome,
    applyNotouchClass: applyNotouchClass
  };
})(typeof window !== 'undefined' ? window : this);
