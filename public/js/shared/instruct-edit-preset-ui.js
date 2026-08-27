/**
 * 指令改图 · 风格预设芯片（前台 + 家里电脑共用）
 */
(function (global) {
  function bind(opts) {
    var row = opts && opts.presetRow;
    var promptEl = opts && opts.promptEl;
    var tr = (opts && opts.tr) || function (k, f) { return f || k; };
    var onChange = opts && opts.onChange;
    var active = '';
    var fillLock = false;

    function setPreset(id) {
      active = id || '';
      if (!row) return;
      row.querySelectorAll('[data-preset]').forEach(function (chip) {
        var p = chip.getAttribute('data-preset') || '';
        chip.classList.toggle('is-active', p === active);
      });
      if (!promptEl || !global.InstructEditPresets) return;
      fillLock = true;
      if (active) {
        promptEl.value = global.InstructEditPresets.applyColorHint(
          global.InstructEditPresets.prompt(active)
        );
      }
      fillLock = false;
      if (typeof onChange === 'function') onChange(active);
    }

    if (row) {
      row.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-preset]');
        if (!btn || !row.contains(btn)) return;
        setPreset(btn.getAttribute('data-preset') || '');
      });
    }

    if (promptEl) {
      promptInputGuard();
      promptEl.addEventListener('input', promptInputGuard);
    }

    function promptInputGuard() {
      if (fillLock || !active || !global.InstructEditPresets) return;
      var base = global.InstructEditPresets.prompt(active);
      if ((promptEl.value || '').indexOf(base) === -1) setPreset('');
    }

    return {
      setPreset: setPreset,
      getActive: function () { return active; },
      reset: function () { setPreset(''); }
    };
  }

  global.InstructEditPresetUi = { bind: bind };
})(typeof window !== 'undefined' ? window : globalThis);
