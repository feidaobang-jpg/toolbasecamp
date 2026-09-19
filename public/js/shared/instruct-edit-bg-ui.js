/**
 * 指令改图 · 背景改变 UI（展开/时段/地点芯片，前台 + 家里电脑共用）
 */
(function (global) {
  function bind(opts) {
    var promptEl = opts && opts.promptEl;
    var toggleBtn = opts && opts.toggleBtn;
    var panelEl = opts && opts.panelEl;
    var timeRowEl = opts && opts.timeRowEl;
    var groupsEl = opts && opts.groupsEl;
    var tr = (opts && opts.tr) || function (k, f) { return f || k; };
    var onPromptChange = opts && opts.onPromptChange;
    var expanded = false;
    var bgTime = 'day';

    function notifyChange() {
      if (typeof onPromptChange === 'function') onPromptChange();
    }

    function setBgTime(time) {
      bgTime = time || 'day';
      if (!timeRowEl) return;
      timeRowEl.querySelectorAll('[data-bg-time]').forEach(function (chip) {
        var t = chip.getAttribute('data-bg-time') || 'day';
        chip.classList.toggle('is-active', t === bgTime);
      });
    }

    function setExpanded(on) {
      expanded = !!on;
      if (panelEl) panelEl.hidden = !expanded;
      if (toggleBtn) {
        toggleBtn.textContent = tr(
          expanded ? 'tools.instructEdit.bgCollapse' : 'tools.instructEdit.bgExpand',
          expanded ? '收起' : '展开'
        );
      }
    }

    function applyPlace(place) {
      if (!promptEl || !place || !global.InstructEditBgPresets) return;
      promptEl.value = global.InstructEditBgPresets.apply(promptEl.value, place, bgTime);
      notifyChange();
    }

    if (groupsEl && global.InstructEditBgGroups) {
      global.InstructEditBgGroups.render(groupsEl);
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        setExpanded(!expanded);
      });
    }

    if (timeRowEl) {
      timeRowEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-bg-time]');
        if (!btn || !timeRowEl.contains(btn)) return;
        setBgTime(btn.getAttribute('data-bg-time') || 'day');
        notifyChange();
      });
    }

    if (groupsEl) {
      groupsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-bg-place]');
        if (!btn || !groupsEl.contains(btn)) return;
        applyPlace(btn.getAttribute('data-bg-place') || btn.textContent || '');
      });
    }

    setBgTime('day');
    setExpanded(false);

    return {
      setExpanded: setExpanded,
      setBgTime: setBgTime,
      applyPlace: applyPlace,
      getExpanded: function () { return expanded; },
      reset: function () {
        setBgTime('day');
        setExpanded(false);
      }
    };
  }

  global.InstructEditBgUi = { bind: bind };
})(typeof window !== 'undefined' ? window : globalThis);
