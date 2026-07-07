(function () {
  'use strict';
  window.__tbTranslatePatch = 'v7';

  function normLang(code, fallback) {
    if (!code || code === 'auto' || code === 'undefined') {
      return fallback || 'en';
    }
    if (code.indexOf('zh') === 0) return 'zh';
    if (code.indexOf('en') === 0) return 'en';
    return fallback || code;
  }

  function runSwap(app, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    if (!app) return;

    if (typeof app.closeSuggestTranslation === 'function') {
      app.closeSuggestTranslation(e || { preventDefault: function () {} });
    }

    var tgt = normLang(app.targetLang, 'zh');
    var src = normLang(app.sourceLang, 'en');

    if (app.sourceLang === 'auto') {
      try {
        if (app.output) {
          var res = JSON.parse(app.output);
          if (res.detectedLanguage && res.detectedLanguage.language) {
            src = normLang(res.detectedLanguage.language, src);
          }
        }
      } catch (err) { /* ignore */ }
    }

    if (app.sourceLang === 'auto' || !src) {
      src = tgt === 'zh' ? 'en' : 'zh';
    }

    app.sourceLang = tgt;
    app.targetLang = src === tgt ? (tgt === 'zh' ? 'en' : 'zh') : src;
    app.detectedLangText = '';

    if (app.translatedText) {
      app.inputText = app.translatedText;
    }
    app.translatedText = '';
    app.output = '';

    if (typeof app.handleInput === 'function') {
      app.handleInput(e || new Event('click'));
    }
  }

  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    if (!e.target.closest('.btn-switch-language, a[aria-label*="Swap"], button[aria-label*="Swap"]')) return;
    runSwap(window._vueApp, e);
  }, true);

  function patchVueMethod() {
    var app = window._vueApp;
    if (!app) return;
    var fixed = function (ev) { runSwap(this, ev); };
    app.swapLangs = fixed;
    if (app.$options && app.$options.methods) {
      app.$options.methods.swapLangs = fixed;
    }
  }

  var tries = 0;
  var timer = setInterval(function () {
    patchVueMethod();
    if (++tries > 200) clearInterval(timer);
  }, 100);
})();
