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

  function checkHealth() {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    return fetch(base() + '/health', { method: 'GET', signal: controller.signal })
      .then(function (res) {
        clearTimeout(timer);
        return res.ok;
      })
      .catch(function () {
        clearTimeout(timer);
        return false;
      });
  }

  function renderStatus(el) {
    if (!el) return;
    el.textContent = '正在检测家里电脑 API…';
    el.className = 'home-pc-status home-pc-status--checking';
    checkHealth().then(function (ok) {
      if (ok) {
        el.textContent = '已连接家里电脑 API：' + base();
        el.className = 'home-pc-status home-pc-status--ok';
      } else {
        el.textContent = '无法连接家里电脑 API（' + base() + '）。请确认本机已启动 ComfyUI 与 comfyui-api-server，且 Cloudflare Tunnel 已配置。';
        el.className = 'home-pc-status home-pc-status--err';
      }
    });
  }

  global.HomePcApi = {
    base: base,
    wsUrl: wsUrl,
    assetUrl: assetUrl,
    checkHealth: checkHealth,
    renderStatus: renderStatus
  };
})(typeof window !== 'undefined' ? window : this);
