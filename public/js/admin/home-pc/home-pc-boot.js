/**
 * Boot hook for home-pc admin tool pages.
 */
(function loadJSZipIfNeeded() {
  if (typeof JSZip !== 'undefined') return;
  var anchor = document.querySelector('script[src*="home-pc-api.js"]');
  var src = '/js/lib/jszip.min.js';
  if (anchor && anchor.src) {
    src = anchor.src.replace(/\/admin\/home-pc\/home-pc-api\.js(\?.*)?$/, '/lib/jszip.min.js');
  }
  var script = document.createElement('script');
  script.src = src;
  script.onerror = function () {
    var cdn = document.createElement('script');
    cdn.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(cdn);
  };
  document.head.appendChild(script);
})();

(function () {
  function boot() {
    if (window.HomePcApi) {
      HomePcApi.renderStatus(document.getElementById('api-status'));
    }
  }
  document.addEventListener('tb:private-ready', boot);
  if (document.getElementById('app') && !document.getElementById('app').classList.contains('hidden')) {
    boot();
  }
})();
