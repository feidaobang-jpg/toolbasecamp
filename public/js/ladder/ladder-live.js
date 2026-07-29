/**
 * Load cached ladder table from API when available (survives public rsync).
 * Fallback: keep the static HTML already in .ladder-container.
 */
(function () {
  'use strict';

  function apiBase() {
    if (window.siteConfig && window.siteConfig.apiBase) return window.siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function ladderIdFromPath() {
    var m = (window.location.pathname || '').match(/\/ladder\/([a-z0-9_]+)\.html/i);
    return m ? m[1] : '';
  }

  function apply() {
    var id = ladderIdFromPath();
    var box = document.querySelector('.ladder-container');
    if (!id || !box) return;
    fetch(apiBase() + '/ladder/' + encodeURIComponent(id), {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.html) return;
        box.innerHTML = data.html;
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
