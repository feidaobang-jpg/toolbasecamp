(function () {
  function inject() {
    if (document.getElementById('portal-home-bar') || !document.body) return;

    var hubUrl = 'https://zhengxiaohui.cn/';
    var bar = document.createElement('div');
    bar.id = 'portal-home-bar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', '百宝箱');
    bar.innerHTML = '<a href="' + hubUrl + '">&#8592; 百宝箱</a>';

    document.body.classList.add('portal-has-home-bar');
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
