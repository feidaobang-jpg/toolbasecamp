(function () {
  'use strict';

  var currentTier = 'all';
  var year = new Date().getFullYear();

  function apiBase() {
    if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
    return window.location.origin + '/api';
  }

  function t(key, fallback) {
    try {
      if (window.i18n && typeof window.i18n.t === 'function') {
        var v = window.i18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback || key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parsePrice(p) {
    var m = String(p || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  function cleanTitle(title) {
    return String(title || '').replace(/^\d+元级[：:]/, '');
  }

  function enrich(build) {
    var host = build.host_price || 0;
    var partsTotal = 0;
    var hasMonitor = false;
    (build.parts || []).forEach(function (part) {
      var val = parsePrice(part.price);
      partsTotal += val;
      var name = part.name || '';
      if (name.indexOf('显示器') >= 0) hasMonitor = true;
      if (!host && !/显示器|键鼠|外设|耳机|音响/.test(name)) host += val;
    });
    if (!host) host = partsTotal;
    var monEst = 0;
    var monLabel = t('tools.pcBuilds.monitorBudget', '推荐显示器预算');
    var rec = build.recommended_monitor || {};
    if (!hasMonitor) {
      if (rec.model) {
        monEst = parsePrice(rec.price);
        monLabel = t('tools.pcBuilds.monitorRec', '推荐') + ': ' + rec.model;
      } else if (host < 3000) monEst = 699;
      else if (host < 5500) monEst = 999;
      else if (host < 9000) monEst = 1499;
      else if (host < 15000) monEst = 2999;
      else monEst = 4999;
    }
    return {
      host: host,
      partsTotal: partsTotal,
      hasMonitor: hasMonitor,
      monEst: monEst,
      monLabel: monLabel,
      full: partsTotal + monEst
    };
  }

  function jdUrl(keyword) {
    return 'https://search.jd.com/Search?keyword=' + encodeURIComponent(keyword || '');
  }

  function renderParts(parts) {
    return (parts || [])
      .map(function (p) {
        return (
          '<li>' +
          '<span class="pc-part-slot">' +
          esc(p.name) +
          '</span>' +
          '<span class="pc-part-model">' +
          esc(p.model) +
          '</span>' +
          '<a class="pc-part-jd" href="' +
          esc(jdUrl(p.model)) +
          '" target="_blank" rel="noopener">' +
          esc(t('tools.pcBuilds.jd', '京东')) +
          '</a>' +
          '<span class="pc-part-price">' +
          esc(p.price) +
          '</span>' +
          '</li>'
        );
      })
      .join('');
  }

  function renderPrice(info) {
    if (info.hasMonitor) {
      return (
        '<div class="pc-build-price-box">' +
        '<div class="pc-build-price-row"><span>' +
        esc(t('tools.pcBuilds.hostMonitor', '主机 + 显示器')) +
        '</span><span>¥' +
        info.partsTotal +
        '</span></div></div>'
      );
    }
    var kw = info.monLabel.indexOf(': ') >= 0 ? info.monLabel.split(': ').slice(1).join(': ') : '显示器';
    return (
      '<div class="pc-build-price-box">' +
      '<div class="pc-build-price-row"><span>' +
      esc(t('tools.pcBuilds.hostOnly', '主机参考价')) +
      '</span><span>¥' +
      info.host +
      '</span></div>' +
      '<div class="pc-build-price-row"><span><a class="pc-part-jd" href="' +
      esc(jdUrl(kw)) +
      '" target="_blank" rel="noopener">' +
      esc(info.monLabel) +
      '</a></span><span>¥' +
      info.monEst +
      '</span></div>' +
      '<div class="pc-build-price-total"><span>' +
      esc(t('tools.pcBuilds.fullPrice', '全套参考总价')) +
      '</span><span>¥' +
      info.full +
      '</span></div></div>'
    );
  }

  function renderCard(build) {
    var info = enrich(build);
    var tags = (build.tags || [])
      .filter(function (tag) {
        return tag !== 'AI热推';
      })
      .map(function (tag) {
        return '<span class="pc-build-tag">' + esc(tag) + '</span>';
      })
      .join('');
    var summary = build.summary
      ? '<p class="pc-build-summary">' + esc(build.summary) + '</p>'
      : '';
    return (
      '<article class="pc-build-card">' +
      '<div class="pc-build-head"><h2>' +
      esc(cleanTitle(build.title)) +
      '</h2><div class="pc-build-tags">' +
      tags +
      '</div></div>' +
      summary +
      '<div class="pc-build-parts"><h3>' +
      esc(t('tools.pcBuilds.parts', '配置清单')) +
      '</h3><ul>' +
      renderParts(build.parts) +
      '</ul>' +
      renderPrice(info) +
      '</div></article>'
    );
  }

  function setTitle() {
    var el = document.getElementById('pc-builds-title');
    var text = String(t('tools.pcBuilds.titleTpl', '{year} 装机配置推荐')).replace('{year}', String(year));
    if (el) el.textContent = text;
    document.title = text + ' - ' + (t('site.name', '工具大本营') || '工具大本营');
  }

  function setMeta(n) {
    var el = document.getElementById('pc-builds-meta');
    if (!el) return;
    el.textContent = t('tools.pcBuilds.count', '方案数') + '：' + n;
  }

  function load() {
    var list = document.getElementById('pc-builds-list');
    if (!list) return;
    list.innerHTML = '<p class="pc-builds-loading">' + esc(t('tools.pcBuilds.loading', '加载中…')) + '</p>';
    var url = apiBase() + '/pcbuilds/list?tier=' + encodeURIComponent(currentTier);
    fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data.year) year = data.year;
        setTitle();
        var builds = data.builds || [];
        if (!builds.length) {
          list.innerHTML = '<p class="pc-builds-empty">' + esc(t('tools.pcBuilds.empty', '暂无装机方案')) + '</p>';
          setMeta(0);
          return;
        }
        list.innerHTML = builds.map(renderCard).join('');
        setMeta(builds.length);
      })
      .catch(function () {
        list.innerHTML = '<p class="pc-builds-error">' + esc(t('tools.pcBuilds.loadFail', '加载失败')) + '</p>';
      });
  }

  function bindFilters() {
    var box = document.getElementById('pc-builds-filters');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-tier]');
      if (!btn) return;
      currentTier = btn.getAttribute('data-tier') || 'all';
      Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      load();
    });
  }

  function boot() {
    setTitle();
    bindFilters();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
