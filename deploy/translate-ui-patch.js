(function () {
  'use strict';
  window.__tbTranslatePatch = 'v11';

  var swapLock = false;

  function normLang(code, fallback) {
    if (!code || code === 'undefined' || code === 'null') return fallback || 'en';
    if (code === 'auto') return 'auto';
    if (String(code).indexOf('zh') === 0) return 'zh';
    if (String(code).indexOf('en') === 0) return 'en';
    return fallback || 'en';
  }

  function sanitizeApp(app) {
    if (!app) return;
    if (app.sourceLang !== 'auto') {
      app.sourceLang = normLang(app.sourceLang, 'en');
    } else if (!app.sourceLang || app.sourceLang === 'undefined') {
      app.sourceLang = 'auto';
    }
    app.targetLang = normLang(app.targetLang, 'zh');
    if (app.sourceLang !== 'auto' && app.sourceLang === app.targetLang) {
      app.targetLang = app.sourceLang === 'zh' ? 'en' : 'zh';
    }
  }

  function syncInputState(app) {
    sanitizeApp(app);
    if (typeof app.updateQueryParam === 'function') {
      app.updateQueryParam('source', app.sourceLang);
      app.updateQueryParam('target', app.targetLang);
      app.updateQueryParam('q', app.inputText);
    }
    if (app.timeout) {
      clearTimeout(app.timeout);
      app.timeout = null;
    }
    app.detectedLangText = '';
    if (app.inputText === '') {
      app.translatedText = '';
      app.output = '';
      if (typeof app.abortPreviousTransRequest === 'function') {
        app.abortPreviousTransRequest();
      }
      app.loadingTranslation = false;
    }
  }

  function runTranslate(app) {
    if (!app || typeof app.handleInput !== 'function') return;
    sanitizeApp(app);
    app._tbAllowTranslate = true;
    app.handleInput(new Event('click'));
  }

  function runSwap(app, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    if (!app || swapLock) return;
    swapLock = true;
    setTimeout(function () { swapLock = false; }, 400);

    if (typeof app.closeSuggestTranslation === 'function') {
      app.closeSuggestTranslation(e || { preventDefault: function () {} });
    }

    sanitizeApp(app);

    var tgt = app.targetLang;
    var src = app.sourceLang;

    if (src === 'auto') {
      try {
        if (app.output) {
          var res = JSON.parse(app.output);
          if (res.detectedLanguage && res.detectedLanguage.language) {
            src = normLang(res.detectedLanguage.language, 'en');
          }
        }
      } catch (err) { /* ignore */ }
      if (src === 'auto' || !src) src = tgt === 'zh' ? 'en' : 'zh';
    }

    app.sourceLang = tgt;
    app.targetLang = src === tgt ? (tgt === 'zh' ? 'en' : 'zh') : src;
    app.detectedLangText = '';

    if (app.translatedText) {
      app.inputText = app.translatedText;
    }

    app.translatedText = '';
    app.output = '';
    sanitizeApp(app);
    syncInputState(app);
  }

  function findTextareaRow() {
    var ta1 = document.getElementById('textarea1');
    var ta2 = document.getElementById('textarea2');
    if (!ta1 || !ta2) return null;

    var row = ta1.closest('.row');
    while (row) {
      if (row.contains(ta2)) return row;
      row = row.parentElement ? row.parentElement.closest('.row') : null;
    }
    return ta1.closest('.textarea-container');
  }

  function injectStyles() {
    if (document.getElementById('tb-translate-patch-style')) return;
    var style = document.createElement('style');
    style.id = 'tb-translate-patch-style';
    style.textContent = [
      '#tb-translate-bar {',
      '  display: flex;',
      '  justify-content: center;',
      '  align-items: center;',
      '  width: 100%;',
      '  margin: 20px 0 28px;',
      '  padding: 0 16px;',
      '  box-sizing: border-box;',
      '  clear: both;',
      '}',
      '.tb-translate-btn {',
      '  display: inline-flex !important;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 8px;',
      '  min-width: 160px;',
      '  height: 46px;',
      '  padding: 0 24px !important;',
      '  overflow: visible;',
      '  line-height: 1;',
      '  float: none !important;',
      '  margin: 0 !important;',
      '}',
      '.tb-translate-btn .material-icons {',
      '  float: none !important;',
      '  margin: 0 !important;',
      '  line-height: 1;',
      '  font-size: 22px;',
      '  width: auto;',
      '  height: auto;',
      '}',
      '.tb-translate-btn span {',
      '  line-height: 1;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function injectTranslateButton(app) {
    var anchorRow = findTextareaRow();
    if (!anchorRow) return false;

    injectStyles();

    document.querySelectorAll('.tb-translate-row').forEach(function (el) {
      el.remove();
    });

    var bar = document.getElementById('tb-translate-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'tb-translate-bar';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn waves-effect waves-light tb-translate-btn';
      btn.innerHTML = '<i class="material-icons">translate</i><span>Translate</span>';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        runTranslate(app);
      });
      bar.appendChild(btn);
    }

    if (anchorRow.nextElementSibling !== bar) {
      anchorRow.parentNode.insertBefore(bar, anchorRow.nextSibling);
    }
    return true;
  }

  function patchApp(app) {
    if (!app || app._tbTranslatePatched) return;
    app._tbTranslatePatched = true;

    app.swapLangs = function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
    };
    if (app.$options && app.$options.methods) {
      app.$options.methods.swapLangs = app.swapLangs;
    }

    var origHandle = app.handleInput.bind(app);
    app.handleInput = function (ev) {
      if (this._tbAllowTranslate) {
        this._tbAllowTranslate = false;
        sanitizeApp(this);
        return origHandle(ev);
      }
      syncInputState(this);
    };

    injectTranslateButton(app);
  }

  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    if (!e.target.closest('.btn-switch-language, a[aria-label*="Swap"], button[aria-label*="Swap"]')) return;
    runSwap(window._vueApp, e);
  }, true);

  var tries = 0;
  var timer = setInterval(function () {
    if (window._vueApp) {
      patchApp(window._vueApp);
      injectTranslateButton(window._vueApp);
    }
    if (++tries > 200) clearInterval(timer);
  }, 100);
})();
