// Author navigation is voluntary and stays inside Bilibili; no player profile is read.
(function () {
  var sdk = null, supported = false;
  function prepare(value) {
    if (!value || typeof value.navigate !== 'function' || typeof value.isSupport !== 'function') return;
    value.isSupport('navigate').then(function (ok) { sdk = value; supported = !!ok; }).catch(function () {});
  }
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[data-author-home]');
    if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !supported) return;
    event.preventDefault();
    // Call directly during the gesture. Keep the ordinary Bilibili link as fallback.
    sdk.navigate({ type: 'space', id: '16214353' }).catch(function () {
      window.open(link.href, '_blank', 'noopener,noreferrer');
    });
  });
  if (!/^(www\.bilibili\.com|(?:www\.)?bilibilitoy\.com)$/.test(location.hostname) || location.pathname.indexOf('/toy/') !== 0) return;
  if (window.toy) { prepare(window.toy); return; }
  var existing = document.querySelector('script[src="https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js"]');
  if (existing) { existing.addEventListener('load', function () { prepare(window.toy); }); return; }
  var script = document.createElement('script');
  script.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
  script.async = true;
  script.onload = function () { prepare(window.toy); };
  document.head.appendChild(script);
})();
