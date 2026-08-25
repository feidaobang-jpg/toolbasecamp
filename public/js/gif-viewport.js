/**
 * GIF grid helper: show JPEG thumb first, swap to GIF when in viewport.
 * Pause (back to thumb) when leaving the viewport.
 *
 * Important: do NOT decode the GIF in a detached Image() first — Chrome/Edge
 * often then paint a frozen first frame when the same URL is assigned to <img>.
 */
(function (global) {
  'use strict';

  var CAP = 24;
  var observer = null;
  var playing = [];

  function stop(el) {
    if (!el) return;
    el.dataset.inView = '0';
    // Keep GIF src when leaving view — swapping back to JPEG then to GIF again
    // often freezes animation in WeChat / some mobile WebViews.
    if (el.dataset.playing === '1') {
      el.dataset.playing = '0';
    }
    var i = playing.indexOf(el);
    if (i >= 0) playing.splice(i, 1);
  }

  function showGif(el) {
    if (!el || el.dataset.inView !== '1') return;
    var play = el.dataset.playSrc || '';
    if (!play) return;
    while (playing.length >= CAP) stop(playing[0]);
    var cur = el.getAttribute('src') || '';
    // Already on the GIF URL — do not re-assign (WeChat freezes on JPEG↔GIF swaps).
    if (cur === play) {
      el.dataset.playing = '1';
      if (playing.indexOf(el) < 0) playing.push(el);
      return;
    }
    el.src = play;
    el.dataset.playing = '1';
    if (playing.indexOf(el) < 0) playing.push(el);
  }

  function ensureObserver() {
    if (observer || typeof IntersectionObserver === 'undefined') return;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        if (entry.isIntersecting) {
          el.dataset.inView = '1';
          showGif(el);
        } else {
          stop(el);
        }
      });
    }, {
      root: null,
      rootMargin: '160px 0px',
      threshold: 0.01
    });
  }

  /**
   * @param {HTMLImageElement} img
   * @param {string} thumbSrc
   * @param {string} playSrc
   */
  function bind(img, thumbSrc, playSrc) {
    if (!img || !playSrc) return;
    img.dataset.thumbSrc = thumbSrc || '';
    img.dataset.playSrc = playSrc;
    img.dataset.playing = '0';
    img.dataset.inView = '1';
    img.loading = 'eager';
    // Load GIF directly — JPEG-first then swap often freezes in WeChat.
    img.src = playSrc;
    img.dataset.playing = '1';
    if (playing.indexOf(img) < 0) playing.push(img);

    if (typeof IntersectionObserver === 'undefined') return;
    ensureObserver();
    observer.observe(img);
  }

  function disconnectAll() {
    if (observer) {
      try { observer.disconnect(); } catch (e) {}
      observer = null;
    }
    playing = [];
  }

  global.TBGifViewport = {
    bind: bind,
    disconnectAll: disconnectAll
  };
})(typeof window !== 'undefined' ? window : this);
