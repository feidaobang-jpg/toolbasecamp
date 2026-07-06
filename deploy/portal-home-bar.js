(function () {
  function inject() {
    if (document.getElementById('portal-home-bar') || !document.body) return;

    var hubUrl = 'https://toolbasecamp.com/';
    var bar = document.createElement('div');
    bar.id = 'portal-home-bar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Tool Basecamp');
    bar.innerHTML = '<a href="' + hubUrl + '">&#8592; Tool Basecamp</a>';

    document.body.classList.add('portal-has-home-bar');
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
