(function () {
  'use strict';
  window.__tbTranslatePatch = 'v5';

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

    var src = app.sourceLang;
    var tgt = app.targetLang;

    if (src === 'auto') {
      try {
        if (app.output) {
          var res = JSON.parse(app.output);
          if (res.detectedLanguage && res.detectedLanguage.language) {
            src = res.detectedLanguage.language;
          }
        }
      } catch (err) { /* ignore */ }
    }

    if (src === 'auto') {
      app.sourceLang = tgt;
      app.targetLang = tgt === 'zh' ? 'en' : 'zh';
    } else {
      app.sourceLang = tgt;
      app.targetLang = src;
      if (app.sourceLang === app.targetLang) {
        app.targetLang = app.sourceLang === 'zh' ? 'en' : 'zh';
      }
    }

    app.detectedLangText = '';
    if (app.translatedText) {
      app.inputText = app.translatedText;
    }
    app.translatedText = '';
    if (typeof app.handleInput === 'function') {
      app.handleInput(e || new Event('click'));
    }
  }

  function isSwapClick(target) {
    if (!target || !target.closest) return false;
    if (target.closest('.btn-switch-language')) return true;
    var el = target.closest('a[aria-label*="Swap"], button[aria-label*="Swap"]');
    if (el) return true;
    var icon = target.closest('i.material-icons, span.material-icons');
    if (icon && (icon.textContent || '').indexOf('swap_horiz') !== -1) return true;
    return false;
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
