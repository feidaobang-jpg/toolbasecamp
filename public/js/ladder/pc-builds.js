(function () {
  'use strict';

  var DATA_URL = '/data/pc_builds.json';

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
    var host = 0;
    var partsTotal = 0;
    var hasMonitor = false;
    (build.parts || []).forEach(function (part) {
      var val = parsePrice(part.price);
      partsTotal += val;
      var name = part.name || '';
      if (name.indexOf('显示器') >= 0) hasMonitor = true;
      if (!/显示器|键鼠|外设|耳机|音响/.test(name)) host += val;
    });
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
      full: partsTotal + monEst,
      sort: host
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
      .map(function (tag) {
        return '<span class="pc-build-tag">' + esc(tag) + '</span>';
      })
      .join('');
    var tip = build.summary
      ? '<div class="pc-build-tip"><strong>' +
        esc(t('tools.pcBuilds.tip', '装机小贴士')) +
        '：</strong> ' +
        esc(build.summary) +
        '</div>'
      : '';
    return (
      '<article class="pc-build-card">' +
      '<div class="pc-build-head"><h2>' +
      esc(cleanTitle(build.title)) +
      '</h2><div class="pc-build-tags">' +
      tags +
      '</div></div>' +
      '<div class="pc-build-grid">' +
      '<div class="pc-build-parts"><h3>' +
      esc(t('tools.pcBuilds.parts', '配置清单')) +
      '</h3><ul>' +
      renderParts(build.parts) +
      '</ul>' +
      renderPrice(info) +
      '</div>' +
      '<div class="pc-build-review"><h3>' +
      esc(t('tools.pcBuilds.review', 'AI 点评')) +
      '</h3><div class="pc-build-review-body">' +
      (build.review || '<p>' + esc(t('tools.pcBuilds.noReview', '暂无点评')) + '</p>') +
      '</div>' +
      tip +
      '</div></div></article>'
    );
  }

  function setMeta(n) {
    var el = document.getElementById('pc-builds-meta');
    if (!el) return;
    el.textContent = t('tools.pcBuilds.count', '方案数') + '：' + n + ' · ' + t('tools.pcBuilds.yearNote', '面向 2026 年市场');
  }

  function boot() {
    var list = document.getElementById('pc-builds-list');
    if (!list) return;
    fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) {
          list.innerHTML = '<p class="pc-builds-empty">' + esc(t('tools.pcBuilds.empty', '暂无装机方案')) + '</p>';
          setMeta(0);
          return;
        }
        var rows = data.map(function (b) {
          return { b: b, s: enrich(b).sort };
        });
        rows.sort(function (a, c) {
          return a.s - c.s;
        });
        list.innerHTML = rows
          .map(function (r) {
            return renderCard(r.b);
          })
          .join('');
        setMeta(rows.length);
      })
      .catch(function () {
        list.innerHTML = '<p class="pc-builds-error">' + esc(t('tools.pcBuilds.loadFail', '加载失败')) + '</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
