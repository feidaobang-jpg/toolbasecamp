(function () {
  if (document.getElementById('portal-home-bar')) return;

  var hubUrl = 'https://toolbasecamp.com/tool.html';
  var homeUrl = 'https://toolbasecamp.com/';

  var bar = document.createElement('div');
  bar.id = 'portal-home-bar';
  bar.setAttribute('role', 'navigation');
  bar.setAttribute('aria-label', 'Tool Basecamp');
  bar.innerHTML =
    '<a href="' +
    hubUrl +
    '">&#8592; Tool Basecamp</a>' +
    '<span class="portal-bar-sep">|</span>' +
    '<a href="' +
    homeUrl +
    '" class="portal-bar-hint">Home</a>';

  document.body.classList.add('portal-has-home-bar');
  document.body.insertBefore(bar, document.body.firstChild);
})();
