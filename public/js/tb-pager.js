/**
 * Shared list pager — prev / jump / status / next.
 * Usage: tbRenderPager(el, { page, pageSize, total, onChange, hideIfSingle? })
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

    function goTo(p) {
      var next = normalizePage(p, total, pageSize);
      if (next === page || typeof opts.onChange !== 'function') return;
      opts.onChange(next);
    }

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'tb-btn';
    prev.textContent = tr('common.pagerPrev');
    prev.disabled = page <= 1;
    prev.addEventListener('click', function () {
      if (page <= 1) return;
      goTo(page - 1);
    });

    var jump = document.createElement('span');
    jump.className = 'tb-pager-jump';
    var jumpLabel = document.createElement('span');
    jumpLabel.className = 'tb-pager-jump-label';
    jumpLabel.textContent = tr('common.pagerJumpPrefix');
    var input = document.createElement('input');
    input.type = 'number';
    input.className = 'tb-pager-input';
    input.min = '1';
    input.max = String(pages);
    input.value = String(page);
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', tr('common.pagerJump'));
    var jumpSuffix = document.createElement('span');
    jumpSuffix.className = 'tb-pager-jump-label';
    jumpSuffix.textContent = tr('common.pagerJumpSuffix', { pages: pages, total: total });
    var goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'tb-btn tb-btn-sm';
    goBtn.textContent = tr('common.pagerJump');
    function submitJump() {
      goTo(input.value);
    }
    goBtn.addEventListener('click', submitJump);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitJump();
      }
    });
    jump.appendChild(jumpLabel);
    jump.appendChild(input);
    jump.appendChild(jumpSuffix);
    jump.appendChild(goBtn);

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'tb-btn';
    next.textContent = tr('common.pagerNext');
    next.disabled = page >= pages;
    next.addEventListener('click', function () {
      if (page >= pages) return;
      goTo(page + 1);
    });

    el.appendChild(prev);
    el.appendChild(jump);
    el.appendChild(next);
  }

  global.tbPageCount = pageCount;
  global.tbNormalizePage = normalizePage;
  global.tbRenderPager = renderPager;
})(typeof window !== 'undefined' ? window : this);
