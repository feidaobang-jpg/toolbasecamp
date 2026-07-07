(function () {
  'use strict';
  window.__tbTranslatePatch = 'v10';

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

  function injectStyles() {
    if (document.getElementById('tb-translate-patch-style')) return;
    var style = document.createElement('style');
    style.id = 'tb-translate-patch-style';
    style.textContent = [
      '.tb-translate-btn {',
      '  margin-left: 12px;',
      '  vertical-align: middle;',
      '}',
      '.tb-translate-row {',
      '  display: flex;',
      '  align-items: center;',
      '  flex-wrap: wrap;',
      '  gap: 8px;',
      '  margin: 8px 0 12px;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function injectTranslateButton(app) {
    if (document.querySelector('.tb-translate-btn')) return true;

    var swap = document.querySelector('.btn-switch-language');
    if (!swap) return false;

    injectStyles();

    var row = document.createElement('div');
    row.className = 'tb-translate-row';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn waves-effect waves-light tb-translate-btn';
    btn.innerHTML = '<i class="material-icons left">translate</i>Translate';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      runTranslate(app);
    });

    row.appendChild(btn);
    var anchor = swap.closest('.col') || swap.parentElement;
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(row, anchor.nextSibling);
    } else if (swap.parentElement) {
      swap.parentElement.appendChild(row);
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
