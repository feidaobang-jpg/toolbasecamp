(function () {
  try {
    var LANG_KEY = 'i18nextLng';
    var SOURCE_KEY = 'i18nextLng-source';
    var src = localStorage.getItem(SOURCE_KEY);
    var lang = localStorage.getItem(LANG_KEY) || '';
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    var isZh = nav.indexOf('zh') === 0;

    // Old deploy forced English, or Chinese browser stuck on English
    if (
      lang.indexOf('en') === 0 &&
      (src === '2' || (src === '1' && isZh))
    ) {
      localStorage.removeItem(LANG_KEY);
      localStorage.removeItem(SOURCE_KEY);
      src = null;
      lang = '';
    }

    if (src === '3') {
      return;
    }

    if (src) {
      return;
    }

    var pick =
      /^zh-(tw|hk|hant|mo)/.test(nav) ? 'zh-TW' :
      isZh ? 'zh-CN' :
      nav.indexOf('en') === 0 ? 'en-GB' :
      null;

    if (pick) {
      localStorage.setItem(LANG_KEY, pick);
      localStorage.setItem(SOURCE_KEY, '1');
    }
  } catch (e) {
    /* ignore */
  }
})();
