(function () {
  function resolveDetectedSource(app) {
    if (app.sourceLang !== 'auto') return app.sourceLang;
    try {
      if (app.output) {
        var res = JSON.parse(app.output);
        if (res.detectedLanguage && res.detectedLanguage.language) {
          return res.detectedLanguage.language;
        }
      }
    } catch (e) { /* ignore */ }
    return 'auto';
  }

  function patchApp(app) {
    if (!app || app._tbTranslatePatched) return false;
    if (app.loading) return false;

    app.swapLangs = function (e) {
      this.closeSuggestTranslation(e);

      var src = resolveDetectedSource(this);
      var tgt = this.targetLang;

      if (src === 'auto') {
        if (window.M && M.toast) {
          M.toast({ html: '请先翻译一次以检测语言，或手动选择源语言后再互换。' });
        }
        return;
      }

      var tgtLang = this.langs.find(function (l) { return l.code === tgt; });
      if (!tgtLang || !tgtLang.targets || tgtLang.targets.indexOf(src) === -1) {
        this.sourceLang = tgt;
        this.targetLang = src;
      } else {
        this.sourceLang = tgt;
        this.targetLang = src;
      }

      if (this.sourceLang === this.targetLang) {
        this.targetLang = this.sourceLang === 'zh' ? 'en' : 'zh';
      }

      this.detectedLangText = '';
      this.inputText = this.translatedText;
      this.translatedText = '';
      this.handleInput(e);
    };

    app._tbTranslatePatched = true;
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (window._vueApp && patchApp(window._vueApp)) {
      clearInterval(timer);
      return;
    }
    if (++tries > 80) clearInterval(timer);
  }, 150);
})();
