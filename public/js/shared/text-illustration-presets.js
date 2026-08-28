/**
 * 文字成片（含仅配图）：可选画面风格预设（分句规则 + 人物约束）
 */
(function () {
  'use strict';

  var PRESETS = {
    '': {
      splitMode: 'default',
      chineseCast: false,
      classicalPoetry: false
    },
    chinese_cast: {
      splitMode: 'default',
      chineseCast: true,
      classicalPoetry: false
    },
    classical_poetry: {
      splitMode: 'classical_poetry',
      chineseCast: true,
      classicalPoetry: true
    }
  };

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  window.TextIllustrationPresets = {
    get: function (id) {
      var k = (id || '').trim();
      return PRESETS[k] || PRESETS[''];
    },

    bind: function (opts) {
      var row = opts && opts.presetRow;
      var hintEl = opts && opts.hintEl;
      var trFn = (opts && opts.tr) || tr;
      if (!row) return { getActive: function () { return ''; } };

      var active = '';

      function syncHint() {
        if (!hintEl) return;
        if (active === 'classical_poetry') {
          hintEl.textContent = trFn(
            'privateHub.homePc.textIllustrationPresetHintClassical',
            '古诗词预设：按逗号也分句；人物倾向古代汉服与中国人形象。'
          );
        } else if (active === 'chinese_cast') {
          hintEl.textContent = trFn(
            'privateHub.homePc.textIllustrationPresetHintChinese',
            '中国人/东亚面孔预设：抑制西方人面孔，不改变分句规则。'
          );
        } else {
          hintEl.textContent = trFn(
            'privateHub.homePc.textIllustrationSplitHint',
            '默认按句号、分号、问号、感叹号（中英文）各切一句一张图；不额外限制人物族裔。'
          );
        }
      }

      row.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-illustration-preset]');
        if (!btn) return;
        active = btn.getAttribute('data-illustration-preset') || '';
        Array.prototype.forEach.call(row.querySelectorAll('[data-illustration-preset]'), function (el) {
          el.classList.toggle('is-active', el === btn);
        });
        syncHint();
      });

      syncHint();
      return {
        getActive: function () { return active; },
        reset: function () {
          active = '';
          Array.prototype.forEach.call(row.querySelectorAll('[data-illustration-preset]'), function (el, i) {
            el.classList.toggle('is-active', i === 0);
          });
          syncHint();
        }
      };
    }
  };

  document.addEventListener('tb:locale', function () {
    var row = document.getElementById('illustration-preset-row');
    var hintEl = document.getElementById('illustration-split-hint');
    if (!row || !hintEl || !window.TextIllustrationPresets) return;
    var activeBtn = row.querySelector('[data-illustration-preset].is-active');
    var active = activeBtn ? (activeBtn.getAttribute('data-illustration-preset') || '') : '';
    if (active === 'classical_poetry') {
      hintEl.textContent = tr('privateHub.homePc.textIllustrationPresetHintClassical', hintEl.textContent);
    } else if (active === 'chinese_cast') {
      hintEl.textContent = tr('privateHub.homePc.textIllustrationPresetHintChinese', hintEl.textContent);
    } else {
      hintEl.textContent = tr('privateHub.homePc.textIllustrationSplitHint', hintEl.textContent);
    }
  });
})();
