(function () {
  'use strict';
  window.__tbTranslatePatch = 'v6';

  function normLang(code) {
    if (!code || code === 'auto') return code;
    if (code.indexOf('zh') === 0) return 'zh';
    if (code.indexOf('en') === 0) return 'en';
    return code;
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

    var src = normLang(app.sourceLang);
    var tgt = normLang(app.targetLang);

    if (app.sourceLang === 'auto') {
      try {
        if (app.output) {
          var res = JSON.parse(app.output);
          if (res.detectedLanguage && res.detectedLanguage.language) {
            src = normLang(res.detectedLanguage.language);
          }
        }
      } catch (err) { /* ignore */ }
    }

    if (app.sourceLang === 'auto' || !src || src === 'auto') {
      app.sourceLang = tgt;
      app.targetLang = tgt === 'zh' ? 'en' : 'zh';
    } else {
      app.sourceLang = tgt;
      app.targetLang = src;
      if (app.sourceLang === app.targetLang) {
        app.targetLang = app.sourceLang === 'zh' ? 'en' : 'zh';
      }
    }

    app.sourceLang = normLang(app.sourceLang);
    app.targetLang = normLang(app.targetLang);
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

  function isSwapClick(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('.btn-switch-language, a[aria-label*="Swap"], button[aria-label*="Swap"]');
  }

  document.addEventListener('click', function (e) {
    if (!isSwapClick(e.target)) return;
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
