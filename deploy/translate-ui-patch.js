(function () {
  'use strict';

  function runSwap(app, e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();

    if (typeof app.closeSuggestTranslation === 'function') {
      app.closeSuggestTranslation(e || { preventDefault: function () {} });
    }

    var src = app.sourceLang;
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
      if (window.M && M.toast) {
        M.toast({ html: '请先翻译一次以检测语言，或手动选择源语言后再互换。' });
      }
      return;
    }

    var tgt = app.targetLang;
    var tgtLang = null;
    for (var i = 0; i < app.langs.length; i++) {
      if (app.langs[i].code === tgt) {
        tgtLang = app.langs[i];
        break;
      }
    }

    if (tgtLang && tgtLang.targets && tgtLang.targets.indexOf(src) !== -1) {
      app.sourceLang = tgt;
      app.targetLang = src;
    } else {
      app.sourceLang = tgt;
      app.targetLang = src;
    }

    if (app.sourceLang === app.targetLang) {
      app.targetLang = app.sourceLang === 'zh' ? 'en' : 'zh';
    }

    app.detectedLangText = '';
    app.inputText = app.translatedText;
    app.translatedText = '';
    if (typeof app.handleInput === 'function') {
      app.handleInput(e || new Event('click'));
    }
  }

  function isSwapControl(target) {
    if (!target || !target.closest) return false;
    var el = target.closest('a, button, .swap-langs, [class*="swap"]');
    if (!el) {
      if ((target.textContent || '').trim() === 'swap_horiz') {
        el = target.parentElement;
      } else {
        return false;
      }
    }
    var text = (el.textContent || '').replace(/\s+/g, ' ');
    return text.indexOf('swap_horiz') !== -1;
  }

  document.addEventListener('click', function (e) {
    if (!isSwapControl(e.target)) return;
    var app = window._vueApp;
    if (!app) return;
    runSwap(app, e);
  }, true);

  function patchMethods() {
    var app = window._vueApp;
    if (!app || app._tbSwapPatched) return !!app;

    var bound = function (e) { runSwap(this, e); };
    app.swapLangs = bound;
    if (app.$options && app.$options.methods) {
      app.$options.methods.swapLangs = bound;
    }
    app._tbSwapPatched = true;
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (patchMethods() || ++tries > 240) clearInterval(timer);
  }, 50);
})();
