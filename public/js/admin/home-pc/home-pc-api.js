/**
 * 家里电脑 ComfyUI API（comfyui-api-server）统一地址。
 */
(function (global) {
  'use strict';

  var DEFAULT_TUNNEL = 'https://comfy.zhengxiaohui.cn';

  function base() {
    if (global.siteConfig && global.siteConfig.homePcApiBase) {
      return String(global.siteConfig.homePcApiBase).replace(/\/$/, '');
    }
    var host = global.location && global.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    return DEFAULT_TUNNEL;
  }

  function wsUrl(path) {
    var p = path || '';
    if (p.charAt(0) !== '/') p = '/' + p;
    var b = base();
    if (b.indexOf('http://') === 0) return 'ws://' + b.slice(7) + p;
    if (b.indexOf('https://') === 0) return 'wss://' + b.slice(8) + p;
    var proto = global.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + global.location.host + b + p;
  }

  function assetUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
    var b = base();
    if (url.charAt(0) !== '/') url = '/' + url;
    return b + url;
  }

  var STATUS_POLL_MS = 30000;

  function statusTr(key, fallback) {
    try {
      if (typeof global.t === 'function') {
        var v = global.t('privateHub.homePc.' + key);
        if (v && v.indexOf('privateHub.homePc.') !== 0) return v;
      }
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function checkHealth() {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    return fetch(base() + '/health', { method: 'GET', signal: controller.signal })
      .then(function (res) {
        clearTimeout(timer);
        return res.json().then(function (body) {
          return {
            ok: res.ok,
            comfyui: body && body.comfyui,
            comfyui_address: body && body.comfyui_address,
            comfyui_error: body && body.comfyui_error,
            qwen_checkpoint_ready: body && body.qwen_checkpoint_ready,
            qwen_checkpoint: body && body.qwen_checkpoint,
            message: body && body.message
          };
        }).catch(function () {
          return { ok: res.ok, comfyui: null };
        });
      })
      .catch(function () {
        clearTimeout(timer);
        return { ok: false };
      });
  }

  function setStatusClass(el, baseClass) {
    var withRefresh = el.getAttribute('data-status-chrome') === '1';
    el.className = baseClass + (withRefresh ? ' home-pc-status--with-refresh' : '');
  }

  function ensureStatusChrome(el) {
    if (!el || el.getAttribute('data-status-chrome') === '1') return;
    el.setAttribute('data-status-chrome', '1');
    var text = global.document.createElement('span');
    text.className = 'home-pc-status-text';
    while (el.firstChild) text.appendChild(el.firstChild);
    var btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'tb-btn home-pc-status-refresh';
    btn.textContent = statusTr('refreshStatus', '刷新');
    el.appendChild(text);
    el.appendChild(btn);
    if (!el.className || el.className.indexOf('home-pc-status--with-refresh') < 0) {
      el.className = (el.className ? el.className + ' ' : '') + 'home-pc-status--with-refresh';
    }
  }

  function statusTextEl(el) {
    ensureStatusChrome(el);
    return el.querySelector('.home-pc-status-text') || el;
  }

  function applyHealthToEl(el, data) {
    var textEl = statusTextEl(el);
    if (!data || !data.ok) {
      textEl.textContent = '无法连接家里电脑 API（' + base() + '）。请确认 comfyui-api-server 已启动且 Tunnel 指向 ' + base() + '。';
      setStatusClass(el, 'home-pc-status home-pc-status--err');
      return;
    }
    if (data.comfyui === false) {
      var err = data.comfyui_error ? '：' + data.comfyui_error : '';
      textEl.textContent = 'API 已连通，但 ComfyUI（' + (data.comfyui_address || '127.0.0.1:8188') + '）未就绪' + err + '。请在本机先启动 ComfyUI。';
      setStatusClass(el, 'home-pc-status home-pc-status--err');
      return;
    }
    if (el.getAttribute('data-needs-qwen') === '1' && data.qwen_checkpoint_ready === false) {
      textEl.textContent = '已连接 ComfyUI，但未找到 Qwen-Rapid-AIO 模型（models/checkpoints/）。图生图需复制 AllInOne/qwen/Qwen-Rapid-AIO-NSFW-v10.safetensors。';
      setStatusClass(el, 'home-pc-status home-pc-status--warn');
      return;
    }
    textEl.textContent = '已连接：' + base() + ' · ComfyUI 正常';
    setStatusClass(el, 'home-pc-status home-pc-status--ok');
  }

  /** @param {{quiet?: boolean}} [opts] quiet=true 时不闪「正在检测」，供后台轮询 */
  function renderStatus(el, opts) {
    if (!el) return Promise.resolve();
    opts = opts || {};
    var textEl = statusTextEl(el);
    if (!opts.quiet) {
      textEl.textContent = '正在检测家里电脑 API…';
      setStatusClass(el, 'home-pc-status home-pc-status--checking');
    }
    return checkHealth().then(function (data) {
      applyHealthToEl(el, data);
    });
  }

  /**
   * 进页检测 + 可见时约 30s 慢轮询；切回前台立即再检；条上「刷新」可手动。
   * @param {{intervalMs?: number}} [opts]
   */
  function startStatusWatch(el, opts) {
    if (!el) return null;
    if (el._homePcStatusWatch) return el._homePcStatusWatch;
    opts = opts || {};
    var intervalMs = opts.intervalMs > 0 ? opts.intervalMs : STATUS_POLL_MS;
    var timer = null;
    var inFlight = null;
    var stopped = false;

    ensureStatusChrome(el);
    var btn = el.querySelector('.home-pc-status-refresh');

    function clearTimer() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function run(quiet) {
      if (stopped) return Promise.resolve();
      if (global.document && global.document.visibilityState === 'hidden') {
        return Promise.resolve();
      }
      if (inFlight) return inFlight;
      inFlight = renderStatus(el, { quiet: !!quiet }).then(
        function () { inFlight = null; },
        function () { inFlight = null; }
      );
      return inFlight;
    }

    function schedule() {
      clearTimer();
      if (stopped) return;
      if (global.document && global.document.visibilityState === 'hidden') return;
      timer = setInterval(function () { run(true); }, intervalMs);
    }

    function onVisibility() {
      if (!global.document) return;
      if (global.document.visibilityState === 'hidden') {
        clearTimer();
      } else {
        run(true);
        schedule();
      }
    }

    function onLocale() {
      if (btn) btn.textContent = statusTr('refreshStatus', '刷新');
    }

    function refresh() {
      return run(false);
    }

    if (btn) {
      btn.addEventListener('click', function () { refresh(); });
    }
    if (global.document) {
      global.document.addEventListener('visibilitychange', onVisibility);
    }
    if (global.addEventListener) {
      global.addEventListener('tb:locale', onLocale);
    }

    run(false);
    schedule();

    var api = {
      refresh: refresh,
      stop: function () {
        stopped = true;
        clearTimer();
        if (global.document) {
          global.document.removeEventListener('visibilitychange', onVisibility);
        }
        if (global.removeEventListener) {
          global.removeEventListener('tb:locale', onLocale);
        }
        el._homePcStatusWatch = null;
      }
    };
    el._homePcStatusWatch = api;
    return api;
  }

  function parseErrorResponse(res, data) {
    var msg = (data && (data.detail || data.error)) || ('HTTP ' + (res && res.status));
    if (Array.isArray(msg)) msg = msg.map(function (x) { return x.msg || String(x); }).join(' ');
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    return msg;
  }

  function friendlyFetchError(err) {
    var m = String((err && err.message) || err || '');
    if (/Failed to fetch|NetworkError|ERR_FAILED|Load failed|网络/i.test(m)) {
      return (
        '无法连接家里电脑 API（' + base() + '）。' +
        '本机 :5000 可能正常，但 Cloudflare Tunnel（comfy.zhengxiaohui.cn）已断开。' +
        '请在跑 cloudflared 的 NAS/电脑上重启隧道后再试。'
      );
    }
    return m;
  }

  function copyText(text) {
    var s = text == null ? '' : String(text);
    if (!s) return Promise.reject(new Error('empty'));
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(s);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = global.document.createElement('textarea');
        ta.value = s;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        global.document.body.appendChild(ta);
        ta.select();
        var ok = global.document.execCommand('copy');
        global.document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error('copy failed'));
      } catch (e) {
        reject(e);
      }
    });
  }

  global.HomePcApi = {
    base: base,
    wsUrl: wsUrl,
    assetUrl: assetUrl,
    checkHealth: checkHealth,
    renderStatus: renderStatus,
    startStatusWatch: startStatusWatch,
    parseErrorResponse: parseErrorResponse,
    friendlyFetchError: friendlyFetchError,
    copyText: copyText
  };
})(typeof window !== 'undefined' ? window : this);
