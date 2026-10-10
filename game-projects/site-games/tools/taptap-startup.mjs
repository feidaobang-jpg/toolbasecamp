// TapTap H5 adapter for an already bundled classic script. Keep gameplay and saves intact.
export const STARTUP_ADAPTER = 'inline-runtime-v2';

export function inlineStartup(html, runtime, {kind='classic',prelude='',loadingId='loading',readyFlag=''}={}) {
  const patterns={
    classic:/<script>\s*window\.addEventListener\('error',[\s\S]*?<\/script>\s*<script src="js\/game\.min\.js(?:\?[^"\s]*)?"><\/script>/,
    module:/<script>\s*window\.addEventListener\('error',[\s\S]*?<\/script>\s*<script type="module" src="\.\/main\.js(?:\?[^"\s]*)?"><\/script>/,
    journey:/<script type="module">\s*import\('\.\/main\.js[^']*'\)[\s\S]*?<\/script>/,
    starship:/<script src="\.\/boot\.js[^"\s]*"><\/script>\s*<script defer src="\.\/game\.compat\.js[^"\s]*"[^>]*><\/script>/,
  };
  const previous=patterns[kind];
  if(!previous)throw Error('Unknown startup kind');
  if (!previous.test(html)) throw Error('Startup markup changed; review the TapTap adapter');
  // HTML parses script endings even inside JS strings. Escaping the slash preserves JS text.
  const safeRuntime = runtime.replace(/<\/script/gi, '<\\/script');
  html=html.replace(/<script type="importmap">[\s\S]*?<\/script>/g,'');
  // Existing standalone landscape typing helpers are IIFEs; they need no module loader.
  html=html.replace(/<script type="module">(\s*\/\/ 内联自[\s\S]*?)<\/script>/g,'<script>$1</script>');
  const boot = `<script>
(function () {
  var el = document.getElementById(${JSON.stringify(loadingId)});
  var phase = '主程序载入';
  var failed = false;
  function ready() { return ${readyFlag?'!!window['+JSON.stringify(readyFlag)+']':'!!el && el.hidden'}; }
  // Syntax transpilation does not provide these APIs on older Android WebViews.
  if(!Object.hasOwn)Object.hasOwn=function(o,k){return Object.prototype.hasOwnProperty.call(o,k);};
  if(!Array.prototype.at)Object.defineProperty(Array.prototype,'at',{value:function(n){n=Math.trunc(n)||0;return this[n<0?this.length+n:n];},configurable:true,writable:true});
  if(!Element.prototype.replaceChildren)Element.prototype.replaceChildren=function(){while(this.firstChild)this.removeChild(this.firstChild);for(var i=0;i<arguments.length;i++)this.appendChild(typeof arguments[i]==='string'?document.createTextNode(arguments[i]):arguments[i]);};
  function fail(message) {
    if (failed || ready()) return;
    failed = true;
    if(!el || !el.parentNode){el=document.createElement('div');el.id=${JSON.stringify(loadingId)};(document.getElementById('stage')||document.body).appendChild(el);}
    el.hidden=false;
    el.classList.remove('hidden');
    el.style.cssText='position:absolute;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#152333;color:#fff;text-align:center;overflow:auto;font:16px/1.6 sans-serif;word-break:break-word';
    el.textContent = '游戏启动失败（' + phase + '）：' + message;
    el.setAttribute('role', 'alert');
    var br = document.createElement('br'); el.appendChild(br);
    var retry = document.createElement('button');
    retry.textContent = '重新加载'; retry.onclick = function () { location.reload(); };
    el.appendChild(retry);
  }
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window) {
      if (e.target.tagName === 'SCRIPT') fail('程序文件未能载入');
      return;
    }
    fail(e.message || '初始化异常');
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    fail(e.reason && e.reason.message || '初始化异常');
  });
  setTimeout(function () { fail('等待超过 20 秒，请重新加载后再试'); }, 20000);
  window.__tapStartup = function () {
    phase = '3D 初始化';
    if (el && !failed) el.textContent = '正在启动 3D 画面…';
  };
  window.__tapStartupError=fail;
})();
</script>
<script id="taptap-inline-runtime">
window.__tapStartup();
${prelude.replace(/<\/script/gi,'<\\/script')}
${kind==='starship'?'window.__ccBootError=window.__tapStartupError;':''}
${safeRuntime}
</script>`;
  return html.replace(previous, () => boot);
}
