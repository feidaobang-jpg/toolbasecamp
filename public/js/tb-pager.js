/**
 * Shared list pager — prev / status / next.
 * Usage: tbRenderPager(el, { page, pageSize, total, onChange })
 */
(function (global) {
  'use strict';

  function tr(key, params) {
    return typeof global.t === 'function' ? global.t(key, params) : key;
  }

  function pageCount(total, pageSize) {
    var size = Math.max(1, parseInt(pageSize, 10) || 20);
    var n = Math.max(0, parseInt(total, 10) || 0);
    return Math.max(1, Math.ceil(n / size) || 1);
  }

  function normalizePage(page, total, pageSize) {
    var pages = pageCount(total, pageSize);
    var p = parseInt(page, 10) || 1;
    if (p < 1) p = 1;
    if (p > pages) p = pages;
    return p;
  }

  /**
   * @param {HTMLElement|null} el
   * @param {{ page:number, pageSize:number, total:number, onChange:Function, hideIfSingle?:boolean }} opts
   */
  function renderPager(el, opts) {
    if (!el) return;
    opts = opts || {};
    var total = Math.max(0, parseInt(opts.total, 10) || 0);
    var pageSize = Math.max(1, parseInt(opts.pageSize, 10) || 20);
    var pages = pageCount(total, pageSize);
    var page = normalizePage(opts.page, total, pageSize);
    var hideIfSingle = opts.hideIfSingle !== false;

    el.innerHTML = '';
    el.className = (el.className || '').replace(/\btb-pager\b/g, '').trim() + ' tb-pager';
    if (!total || (hideIfSingle && pages <= 1)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'tb-btn';
    prev.textContent = tr('common.pagerPrev');
    prev.disabled = page <= 1;
    prev.addEventListener('click', function () {
      if (page <= 1 || typeof opts.onChange !== 'function') return;
      opts.onChange(page - 1);
    });

    var status = document.createElement('span');
    status.className = 'tb-pager-status';
    status.textContent = tr('common.pagerStatus', {
      page: page,
      pages: pages,
      total: total
    });

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'tb-btn';
    next.textContent = tr('common.pagerNext');
    next.disabled = page >= pages;
    next.addEventListener('click', function () {
      if (page >= pages || typeof opts.onChange !== 'function') return;
      opts.onChange(page + 1);
    });

    el.appendChild(prev);
    el.appendChild(status);
    el.appendChild(next);
  }

  global.tbPageCount = pageCount;
  global.tbNormalizePage = normalizePage;
  global.tbRenderPager = renderPager;
})(typeof window !== 'undefined' ? window : this);
