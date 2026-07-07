(function () {
  'use strict';
  window.__tbTranslatePatch = 'v4';

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

    var tgt = app.targetLang;
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
    var node = target;
    for (var depth = 0; depth < 6 && node; depth++) {
      var icons = node.querySelectorAll
        ? node.querySelectorAll('i, span, .material-icons, .material-symbols-outlined')
        : [];
      var selfText = (node.textContent || '').trim();
      if (selfText === 'swap_horiz') return true;
      for (var i = 0; i < icons.length; i++) {
        if ((icons[i].textContent || '').trim() === 'swap_horiz') return true;
      }
      if (node.getAttribute && node.getAttribute('aria-label') === 'swap_horiz') return true;
      node = node.parentElement;
    }
    return false;
  }

  document.addEventListener('click', function (e) {
    if (!isSwapClick(e.target)) return;
    runSwap(window._vueApp, e);
  }, true);

  function patchVueMethod() {
    var app = window._vueApp;
    if (!app || app._tbSwapPatched) return;
    var fixed = function (ev) { runSwap(this, ev); };
    app.swapLangs = fixed;
    if (app.$options && app.$options.methods) {
      app.$options.methods.swapLangs = fixed;
    }
    app._tbSwapPatched = true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    patchVueMethod();
    if (++tries > 200) clearInterval(timer);
  }, 100);
})();
