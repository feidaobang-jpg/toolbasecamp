/**
 * Boot hook for home-pc admin tool pages.
 */
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
