/**
 * GIF grid helper: show JPEG thumb immediately, preload GIF in parallel,
 * swap when ready. Pause (back to thumb) when leaving the viewport.
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
    if (el.dataset.playing === '1') return;
    var play = el.dataset.playSrc || '';
    if (!play) return;
    while (playing.length >= CAP) stop(playing[0]);
    el.src = play;
    el.dataset.playing = '1';
    if (playing.indexOf(el) < 0) playing.push(el);
  }

  function preloadAndShow(el) {
    if (!el || el.dataset.inView !== '1') return;
    var play = el.dataset.playSrc || '';
    if (!play) return;
    if (el.dataset.playing === '1') return;

    var decoded = el._gifDecoded;
    if (decoded && decoded.complete && decoded.naturalWidth) {
      showGif(el);
      return;
    }
    if (el._gifLoader) return;

    var loader = new Image();
    el._gifLoader = loader;
    loader.onload = function () {
      el._gifDecoded = loader;
      el._gifLoader = null;
      showGif(el);
    };
    loader.onerror = function () {
      el._gifLoader = null;
    };
    loader.src = play;
  }

  function ensureObserver() {
    if (observer || typeof IntersectionObserver === 'undefined') return;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        if (entry.isIntersecting) {
          el.dataset.inView = '1';
          preloadAndShow(el);
        } else {
          stop(el);
        }
      });
    }, {
      root: null,
      // Start a bit early so flips feel instant.
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
    // Optimistic: current-page cards are usually on screen; IO corrects if not.
    img.dataset.inView = '1';
    if (thumbSrc) img.src = thumbSrc;
    // Kick off GIF download immediately (parallel for the whole page).
    preloadAndShow(img);

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
