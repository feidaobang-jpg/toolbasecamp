(function () {
  'use strict';
  window.__tbTranslatePatch = 'v3';

  function runSwap(app, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!app) return;
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
    app.sourceLang = tgt;
    app.targetLang = src;
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

  function findSwapAnchor() {
    var icons = document.querySelectorAll('i.material-icons, span.material-icons, .material-icons');
    for (var i = 0; i < icons.length; i++) {
      if ((icons[i].textContent || '').trim() !== 'swap_horiz') continue;
      return icons[i].closest('a') || icons[i].parentElement;
    }
    return null;
  }

  function rebindSwapButton() {
    var anchor = findSwapAnchor();
    if (!anchor || anchor.dataset.tbSwapBound === '1') return;

    var clone = anchor.cloneNode(true);
    clone.dataset.tbSwapBound = '1';
    anchor.parentNode.replaceChild(clone, anchor);

    clone.addEventListener('click', function (e) {
      runSwap(window._vueApp, e);
    });
  }

  function patchVueMethod() {
    var app = window._vueApp;
    if (!app) return;
    var fixed = function (e) { runSwap(this, e); };
    app.swapLangs = fixed;
    if (app.$options && app.$options.methods) {
      app.$options.methods.swapLangs = fixed;
    }
  }

  function init() {
    patchVueMethod();
    rebindSwapButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  var obs = new MutationObserver(function () {
    patchVueMethod();
    rebindSwapButton();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  var tries = 0;
  var timer = setInterval(function () {
    init();
    if (++tries > 120) clearInterval(timer);
  }, 250);
})();
