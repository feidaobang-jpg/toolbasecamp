/**
 * Screenshot helper: append ?thumb=1 to auto-enter gameplay and hide tool chrome.
 */
(function () {
  'use strict';
  if (!/[?&]thumb=1(?:&|$)/.test(location.search)) return;

  document.documentElement.classList.add('tb-thumb-capture');
  var style = document.createElement('style');
  style.textContent = [
    'html.tb-thumb-capture, html.tb-thumb-capture body { overflow: hidden !important; background: #0b1c2c !important; }',
    'html.tb-thumb-capture .sidebar, html.tb-thumb-capture .tool-header,',
    'html.tb-thumb-capture .tool-mobile-bar, html.tb-thumb-capture .game-toolbar,',
    'html.tb-thumb-capture .game-diff-row, html.tb-thumb-capture .game-status,',
    'html.tb-thumb-capture .action-row, html.tb-thumb-capture #topBar { display: none !important; }',
    'html.tb-thumb-capture .container { max-width: none !important; padding: 0 !important; margin: 0 !important; }',
    'html.tb-thumb-capture .content, html.tb-thumb-capture .tool-card, html.tb-thumb-capture .game-card {',
    '  margin: 0 !important; width: 100% !important; max-width: none !important;',
    '  box-shadow: none !important; border: none !important; padding: 0 !important; }',
    'html.tb-thumb-capture #wrap { max-width: none !important; margin: 0 auto !important; }',
    'html.tb-thumb-capture .game-board-wrap { margin: 0 auto !important; }'
  ].join('\n');
  document.head.appendChild(style);

  function clickRestart() {
    var btn = document.getElementById('restart-btn');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  function tryStart() {
    if (typeof window.__tbThumbAutoStart === 'function') {
      try {
        window.__tbThumbAutoStart();
        return true;
      } catch (e) {}
    }
    if (typeof Game !== 'undefined') {
      if (typeof Game.startGame === 'function') {
        try {
          Game.startGame(Game.mode || 'level');
          return true;
        } catch (e1) {
          try {
            Game.startGame('level');
            return true;
          } catch (e2) {}
        }
      }
      if (typeof Game.newGame === 'function') {
        try {
          Game.newGame('level');
          return true;
        } catch (e3) {}
      }
    }
    if (typeof startGame === 'function') {
      try {
        startGame(false);
        return true;
      } catch (e4) {
        try {
          startGame('level');
          return true;
        } catch (e5) {}
      }
    }
    return clickRestart();
  }

  var attempts = 0;
  var started = false;

  function signalReady() {
    var n = 0;
    (function frame() {
      n++;
      if (n >= 6) window.__tbThumbReady = true;
      else requestAnimationFrame(frame);
    })();
  }

  function tick() {
    if (!started && tryStart()) {
      started = true;
      signalReady();
      return;
    }
    if (started || attempts++ > 80) return;
    requestAnimationFrame(tick);
  }

  function boot() {
    setTimeout(tick, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
