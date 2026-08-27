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

  function renderStatus(el) {
    if (!el) return;
    el.textContent = '正在检测家里电脑 API…';
    el.className = 'home-pc-status home-pc-status--checking';
    checkHealth().then(function (data) {
      if (!data || !data.ok) {
        el.textContent = '无法连接家里电脑 API（' + base() + '）。请确认 comfyui-api-server 已启动且 Tunnel 指向 ' + base() + '。';
        el.className = 'home-pc-status home-pc-status--err';
        return;
      }
      if (data.comfyui === false) {
        var err = data.comfyui_error ? '：' + data.comfyui_error : '';
        el.textContent = 'API 已连通，但 ComfyUI（' + (data.comfyui_address || '127.0.0.1:8188') + '）未就绪' + err + '。请在本机先启动 ComfyUI。';
        el.className = 'home-pc-status home-pc-status--err';
        return;
      }
      if (el.getAttribute('data-needs-qwen') === '1' && data.qwen_checkpoint_ready === false) {
        el.textContent = '已连接 ComfyUI，但未找到 Qwen-Rapid-AIO 模型（models/checkpoints/）。图生图需复制 AllInOne/qwen/Qwen-Rapid-AIO-NSFW-v10.safetensors，或先确认「老照片修复」可用。';
        el.className = 'home-pc-status home-pc-status--warn';
        return;
      }
      el.textContent = '已连接：' + base() + ' · ComfyUI 正常';
      el.className = 'home-pc-status home-pc-status--ok';
    });
  }

  function parseErrorResponse(res, data) {
    var msg = (data && (data.detail || data.error)) || ('HTTP ' + (res && res.status));
    if (Array.isArray(msg)) msg = msg.map(function (x) { return x.msg || String(x); }).join(' ');
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    return msg;
  }

  global.HomePcApi = {
    base: base,
    wsUrl: wsUrl,
    assetUrl: assetUrl,
    checkHealth: checkHealth,
    renderStatus: renderStatus,
    parseErrorResponse: parseErrorResponse
  };
})(typeof window !== 'undefined' ? window : this);
