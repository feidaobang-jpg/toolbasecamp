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
    'html.tb-thumb-capture .action-row, html.tb-thumb-capture #topBar,',
    'html.tb-thumb-capture .puzzle-preview-row, html.tb-thumb-capture .puzzle-upload,',
    'html.tb-thumb-capture .puzzle-audio, html.tb-thumb-capture .puzzle-crop,',
    'html.tb-thumb-capture .game-hint, html.tb-thumb-capture .game-stats,',
    'html.tb-thumb-capture .field-label { display: none !important; }',
    'html.tb-thumb-capture .container { max-width: none !important; padding: 0 !important; margin: 0 !important; }',
    'html.tb-thumb-capture .content, html.tb-thumb-capture .tool-card, html.tb-thumb-capture .game-card {',
    '  margin: 0 !important; width: 100% !important; max-width: none !important;',
    '  box-shadow: none !important; border: none !important; padding: 0 !important;',
    '  display: flex !important; flex-direction: column !important;',
    '  align-items: center !important; justify-content: center !important;',
    '  min-height: 100vh !important; background: #0b1c2c !important; }',
    'html.tb-thumb-capture #wrap { max-width: none !important; margin: 0 auto !important; }',
    'html.tb-thumb-capture .game-board-wrap {',
    '  margin: 0 auto !important; width: min(92vw, 520px) !important; max-width: 520px !important; }',
    'html.tb-thumb-capture .gomoku-board, html.tb-thumb-capture .puzzle-board,',
    'html.tb-thumb-capture .klotski-board { margin: 0 auto !important; }'
  ].join('\n');
  document.head.appendChild(style);

  var MENU_STATES = {
    menu: 1,
    pause: 1,
    paused: 1,
    gameover: 1,
    over: 1,
    win: 1,
    levelclear: 1
  };

  function fireKey(code) {
    var opts = { code: code, key: code === 'Enter' ? 'Enter' : ' ', bubbles: true, cancelable: true };
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', opts));
      window.dispatchEvent(new KeyboardEvent('keydown', opts));
    } catch (e) {}
  }

  function isPausedState(s) {
    return s === 2 || s === 'pause' || s === 'paused';
  }

  function isMenuState(s) {
    return s === 0 || s === 'menu' || !!MENU_STATES[s];
  }

  function isPlayState(s) {
    return s === 1 || s === 'play' || s === 'playing';
  }

  function canvasLooksLive() {
    var canvas = document.querySelector('canvas');
    if (!canvas || canvas.width < 16 || canvas.height < 16) return false;
    try {
      var ctx = canvas.getContext('2d');
      var d = ctx.getImageData(0, 0, Math.min(64, canvas.width), Math.min(64, canvas.height)).data;
      var sum = 0;
      var maxDiff = 0;
      var base = d[0] + d[1] + d[2];
      for (var i = 0; i < d.length; i += 4) {
        var px = d[i] + d[i + 1] + d[i + 2];
        sum += px;
        maxDiff = Math.max(maxDiff, Math.abs(px - base));
      }
      var avg = sum / (d.length / 4) / 3;
      return avg > 8 && maxDiff > 18;
    } catch (e2) {
      return false;
    }
  }

  function gameplayActive() {
    if (typeof Game !== 'undefined' && Game && typeof Game.state !== 'undefined') {
      var s = Game.state;
      if (isMenuState(s) || isPausedState(s)) return false;
      if (s === 'ready') return false;
      if (isPlayState(s)) return true;
    }
    if (typeof window.__tbThumbStateName === 'string') {
      if (window.__tbThumbStateName === 'menu') return false;
      if (window.__tbThumbStateName === 'playing') return true;
    }
    if (document.querySelector('.klotski-board .klotski-tile, .gomoku-cell .gomoku-stone, .puzzle-piece')) {
      return true;
    }
    if (document.querySelector('.gomoku-board .gomoku-cell')) return true;
    return canvasLooksLive();
  }

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
      } catch (e) {}
    }
    if (typeof Game !== 'undefined' && Game) {
      if (typeof Game.startGame === 'function' && isMenuState(Game.state)) {
        try {
          Game.startGame('level');
          if (Game.state === 'ready') Game.state = 'playing';
        } catch (e1) {
          try {
            Game.startGame(Game.mode || 'level');
            if (Game.state === 'ready') Game.state = 'playing';
          } catch (e2) {}
        }
      }
      if (typeof Game.newGame === 'function' && isMenuState(Game.state)) {
        try { Game.newGame('level'); } catch (e3) {}
      }
    }
    if (typeof startGame === 'function' && typeof Game !== 'undefined' && Game && isMenuState(Game.state)) {
      try { startGame(false); } catch (e4) {
        try { startGame('level'); } catch (e5) {}
      }
    }
    if (typeof Game !== 'undefined' && Game && isPausedState(Game.state)) {
      fireKey('Space');
    } else if (typeof Game !== 'undefined' && Game && isMenuState(Game.state)) {
      fireKey('Enter');
    }
    if (typeof Game !== 'undefined' && Game && Game.state === 'ready') Game.state = 'playing';
    clickRestart();
    return gameplayActive();
  }

  var attempts = 0;
  var playSince = 0;

  function signalReady() {
    var frames = 0;
    (function frame() {
      frames++;
      if (gameplayActive()) {
        if (!playSince) playSince = Date.now();
        if (Date.now() - playSince >= 2200) {
          window.__tbThumbReady = true;
          window.__tbThumbGameplay = true;
          return;
        }
      } else {
        playSince = 0;
      }
      if (frames >= 160) {
        window.__tbThumbReady = gameplayActive();
        window.__tbThumbGameplay = window.__tbThumbReady;
        return;
      }
      requestAnimationFrame(frame);
    })();
  }

  function tick() {
    if (!gameplayActive()) {
      tryStart();
    }
    if (gameplayActive()) {
      signalReady();
      return;
    }
    if (attempts++ > 120) {
      if (!window.__tbThumbReady) signalReady();
      return;
    }
    requestAnimationFrame(tick);
  }

  function boot() {
    window.dispatchEvent(new Event('resize'));
    setTimeout(tick, 250);
    setTimeout(function () {
      if (!gameplayActive()) tick();
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
