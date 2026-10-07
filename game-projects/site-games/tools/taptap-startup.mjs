// TapTap H5 adapter for an already bundled classic script. Keep gameplay and saves intact.
export const STARTUP_ADAPTER = 'inline-runtime-v1';

export function inlineStartup(html, runtime) {
  const previous = /<script>\s*window\.addEventListener\('error',[\s\S]*?<\/script>\s*<script src="js\/game\.min\.js(?:\?[^"\s]*)?"><\/script>/;
  if (!previous.test(html)) throw Error('Startup markup changed; review the TapTap adapter');
  // HTML parses script endings even inside JS strings. Escaping the slash preserves JS text.
  const safeRuntime = runtime.replace(/<\/script/gi, '<\\/script');
  const boot = `<script>
(function () {
  var el = document.getElementById('loading');
  var phase = '主程序载入';
  var failed = false;
  function fail(message) {
    if (failed || !el || el.hidden) return;
    failed = true;
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
})();
</script>
<script id="taptap-inline-runtime">
window.__tapStartup();
${safeRuntime}
</script>`;
  return html.replace(previous, () => boot);
}
