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
    if (el.dataset.playing === '1') {
      var thumb = el.dataset.thumbSrc || '';
      if (thumb) el.src = thumb;
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
    if (el.dataset.playing === '1' && (el.currentSrc === play || el.getAttribute('src') === play)) {
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
    if (thumbSrc) img.src = thumbSrc;
    // Start GIF on the real element (keeps animation).
    showGif(img);

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
