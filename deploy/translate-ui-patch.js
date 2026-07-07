(function () {
  'use strict';
  window.__tbTranslatePatch = 'v8';

  var swapLock = false;

  function normLang(code, fallback) {
    if (!code || code === 'auto' || code === 'undefined' || code === 'null') {
      return fallback || 'en';
    }
    if (String(code).indexOf('zh') === 0) return 'zh';
    if (String(code).indexOf('en') === 0) return 'en';
    return fallback || 'en';
  }

  function sanitizeApp(app) {
    if (!app) return;
    app.sourceLang = normLang(app.sourceLang, 'en');
    app.targetLang = normLang(app.targetLang, 'zh');
    if (app.sourceLang === app.targetLang) {
      app.targetLang = app.sourceLang === 'zh' ? 'en' : 'zh';
    }
  }

  function syncSelects(app) {
    if (!app || !app.$nextTick) return;
    app.$nextTick(function () {
      try {
        if (app.$refs.sourceLangDropdown && window.M) {
          M.FormSelect.init(app.$refs.sourceLangDropdown);
        }
        if (app.$refs.targetLangDropdown && window.M) {
          M.FormSelect.init(app.$refs.targetLangDropdown);
        }
      } catch (err) { /* ignore */ }
    });
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

    if (app.sourceLang === 'auto' || src === 'auto') {
      try {
        if (app.output) {
          var res = JSON.parse(app.output);
          if (res.detectedLanguage && res.detectedLanguage.language) {
            src = normLang(res.detectedLanguage.language, src);
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
    syncSelects(app);

    if (typeof app.handleInput === 'function') {
      app.handleInput(e || new Event('click'));
    }
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
      sanitizeApp(this);
      return origHandle(ev);
    };
  }

  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    if (!e.target.closest('.btn-switch-language, a[aria-label*="Swap"], button[aria-label*="Swap"]')) return;
    runSwap(window._vueApp, e);
  }, true);

  var tries = 0;
  var timer = setInterval(function () {
    if (window._vueApp) patchApp(window._vueApp);
    if (++tries > 200) clearInterval(timer);
  }, 100);
})();
