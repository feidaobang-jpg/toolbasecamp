/**
 * Shared client for /life-plans/* tools.
 * Page sets window.LIFE_PLAN_PAGE = { kind, i18nKey, fields: [{name,type,required?,options?}] }
 */
(function (global) {
  'use strict';

  var C = global.TBImageCloud;
  if (!C) {
    console.error('life-plans: TBImageCloud missing');
    return;
  }

  function tr(key, params) {
    return C.tr(key, params);
  }

  function locale() {
    // Life plans: Chinese UI / Chinese browser → zh-CN.
    // Only use English when the user explicitly chose English in the switcher.
    try {
      var saved = localStorage.getItem('tb-locale');
      if (saved === 'en') return 'en';
      if (saved === 'zh-CN') return 'zh-CN';
    } catch (e) { /* ignore */ }
    if (typeof global.tbGetLocale === 'function') {
      var loc = String(global.tbGetLocale() || '');
      if (loc === 'en') return 'en';
    }
    return 'zh-CN';
  }

  function formatQuota(item) {
    if (!item) return '';
    if (item.unlimited) return tr('tools.imageCloud.quotaUnlimited');
    return tr('tools.imageCloud.quotaLine', {
      used: item.used,
      limit: item.limit,
      remaining: item.remaining
    });
  }

  function collectFields(form) {
    var data = {};
    var els = form.querySelectorAll('[name]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.getAttribute('name');
      if (!name) continue;
      var val = el.value;
      if (el.type === 'number') {
        if (val === '' || val == null) continue;
        data[name] = Number(val);
      } else if (String(val || '').trim()) {
        data[name] = String(val).trim();
      }
    }
    return data;
  }

  function renderPlan(plan, mount) {
    if (!plan || !mount) return;
    var html = '';
    html += '<h2>' + escapeHtml(plan.title || '') + '</h2>';
    if (plan.summary) html += '<p class="summary">' + escapeHtml(plan.summary) + '</p>';
    var sections = plan.sections || [];
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      html += '<div class="life-plan-section"><h3>' + escapeHtml(sec.heading || '') + '</h3><ul>';
      var bullets = sec.bullets || [];
      for (var j = 0; j < bullets.length; j++) {
        html += '<li>' + escapeHtml(bullets[j]) + '</li>';
      }
      html += '</ul></div>';
    }
    if (plan.disclaimer) {
      html += '<p class="life-plan-disclaimer">' + escapeHtml(plan.disclaimer) + '</p>';
    }
    mount.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function initPlanPage(cfg) {
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var loginLink = document.getElementById('login-link');
    var form = document.getElementById('plan-form');
    var runBtn = document.getElementById('run-btn');
    var clearBtn = document.getElementById('clear-btn');
    var copyBtn = document.getElementById('copy-btn');
    var downloadBtn = document.getElementById('download-btn');
    var quotaLine = document.getElementById('quota-line');
    var errorBox = document.getElementById('error-box');
    var busy = document.getElementById('busy');
    var resultCard = document.getElementById('result-card');
    var resultMount = document.getElementById('result-mount');
    var lastPlan = null;

    if (loginLink) loginLink.href = C.loginUrl();

    function setBusy(on) {
      if (busy) busy.hidden = !on;
      if (runBtn) runBtn.disabled = !!on;
      if (clearBtn) clearBtn.disabled = !!on;
    }

    function loadStatus() {
      return C.apiJson('/life-plans/status').then(function (s) {
        if (quotaLine) quotaLine.textContent = formatQuota(s.quotas && s.quotas.life_plan);
        if (s.deepseekConfigured === false) {
          C.setError(errorBox, tr('tools.lifePlans.deepseekMissing'));
        }
      }).catch(function (err) {
        C.setError(errorBox, err.message);
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        C.setError(errorBox, '');
        var fields = collectFields(form);
        setBusy(true);
        if (resultCard) resultCard.hidden = true;
        C.apiJson('/life-plans/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: cfg.kind,
            locale: locale(),
            fields: fields
          })
        }).then(function (data) {
          lastPlan = data.plan;
          if (data.quota && quotaLine) quotaLine.textContent = formatQuota(data.quota);
          renderPlan(data.plan, resultMount);
          if (resultCard) resultCard.hidden = false;
          if (copyBtn) copyBtn.disabled = !data.plan;
          if (downloadBtn) downloadBtn.disabled = !data.plan;
        }).catch(function (err) {
          C.setError(errorBox, err.message);
        }).finally(function () {
          setBusy(false);
        });
      });
    }

    if (clearBtn && form) {
      clearBtn.addEventListener('click', function () {
        form.reset();
        lastPlan = null;
        if (resultMount) resultMount.innerHTML = '';
        if (resultCard) resultCard.hidden = true;
        C.setError(errorBox, '');
        if (copyBtn) copyBtn.disabled = true;
        if (downloadBtn) downloadBtn.disabled = true;
      });
    }

    if (copyBtn) {
      copyBtn.disabled = true;
      copyBtn.addEventListener('click', function () {
        if (!lastPlan) return;
        var text = lastPlan.markdown || lastPlan.summary || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            copyBtn.textContent = tr('tools.lifePlans.copied');
            setTimeout(function () {
              copyBtn.textContent = tr('tools.lifePlans.copy');
            }, 1500);
          });
        }
      });
    }

    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.addEventListener('click', function () {
        if (!lastPlan) return;
        downloadText((cfg.kind || 'plan') + '_' + Date.now() + '.txt', lastPlan.markdown || '');
      });
    }

    C.requireLogin(gate, app).then(function (user) {
      if (!user) return;
      loadStatus();
    });
  }

  function initDrugPage() {
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var loginLink = document.getElementById('login-link');
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var sourceWrap = document.getElementById('source-wrap');
    var sourceImg = document.getElementById('source-img');
    var runBtn = document.getElementById('run-btn');
    var clearBtn = document.getElementById('clear-btn');
    var copyBtn = document.getElementById('copy-btn');
    var downloadBtn = document.getElementById('download-btn');
    var printBtn = document.getElementById('print-btn');
    var quotaLine = document.getElementById('quota-line');
    var errorBox = document.getElementById('error-box');
    var busy = document.getElementById('busy');
    var resultCard = document.getElementById('result-card');
    var largeMount = document.getElementById('large-mount');
    var file = null;
    var previewUrl = '';
    var lastLabel = null;

    if (loginLink) loginLink.href = C.loginUrl();

    function setBusy(on) {
      if (busy) busy.hidden = !on;
      if (runBtn) runBtn.disabled = !!on || !file;
      if (clearBtn) clearBtn.disabled = !!on;
    }

    function loadStatus() {
      return C.apiJson('/life-plans/status').then(function (s) {
        if (quotaLine) quotaLine.textContent = formatQuota(s.quotas && s.quotas.drug_label);
      }).catch(function (err) {
        C.setError(errorBox, err.message);
      });
    }

    function setFile(f) {
      C.setError(errorBox, '');
      if (!f || !String(f.type || '').startsWith('image/')) {
        C.setError(errorBox, tr('tools.imageCloud.invalidFile'));
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      file = f;
      previewUrl = URL.createObjectURL(f);
      if (sourceImg) sourceImg.src = previewUrl;
      if (sourceWrap) sourceWrap.hidden = false;
      if (dropZone) dropZone.hidden = true;
      if (runBtn) runBtn.disabled = false;
    }

    if (dropZone) {
      dropZone.addEventListener('click', function () { fileInput && fileInput.click(); });
      dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) setFile(f);
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
        fileInput.value = '';
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', function () {
        if (!file) return;
        C.setError(errorBox, '');
        setBusy(true);
        var fd = new FormData();
        fd.append('file', file, file.name || 'label.jpg');
        fd.append('locale', locale());
        C.apiJson('/life-plans/drug-label', { method: 'POST', body: fd }).then(function (data) {
          lastLabel = data.label;
          if (data.quota && quotaLine) quotaLine.textContent = formatQuota(data.quota);
          var L = data.label || {};
          var html = '<div class="drug-large-print">';
          if (L.drug_name) html += '<div class="drug-name">' + escapeHtml(L.drug_name) + '</div>';
          if (L.common_name) html += '<div>' + escapeHtml(L.common_name) + '</div><br/>';
          var secs = L.sections || [];
          for (var i = 0; i < secs.length; i++) {
            html += '<strong>' + escapeHtml(secs[i].heading) + '</strong>\n';
            html += escapeHtml(secs[i].body) + '\n\n';
          }
          if (L.disclaimer) {
            html += '<p class="life-plan-disclaimer">' + escapeHtml(L.disclaimer) + '</p>';
          }
          html += '</div>';
          if (largeMount) largeMount.innerHTML = html;
          if (resultCard) resultCard.hidden = false;
          if (copyBtn) copyBtn.disabled = false;
          if (downloadBtn) downloadBtn.disabled = false;
          if (printBtn) printBtn.disabled = false;
        }).catch(function (err) {
          C.setError(errorBox, err.message);
        }).finally(function () {
          setBusy(false);
        });
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        file = null;
        lastLabel = null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        if (sourceImg) sourceImg.removeAttribute('src');
        if (sourceWrap) sourceWrap.hidden = true;
        if (dropZone) dropZone.hidden = false;
        if (resultCard) resultCard.hidden = true;
        if (largeMount) largeMount.innerHTML = '';
        if (runBtn) runBtn.disabled = true;
        if (copyBtn) copyBtn.disabled = true;
        if (downloadBtn) downloadBtn.disabled = true;
        if (printBtn) printBtn.disabled = true;
        C.setError(errorBox, '');
      });
    }

    if (copyBtn) {
      copyBtn.disabled = true;
      copyBtn.addEventListener('click', function () {
        if (!lastLabel) return;
        var text = lastLabel.large_print_text || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
        }
      });
    }
    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.addEventListener('click', function () {
        if (!lastLabel) return;
        var name = (lastLabel.drug_name || 'drug_label').replace(/[\\/:*?"<>|]+/g, '_');
        downloadText(name + '_large_print.txt', lastLabel.large_print_text || '');
      });
    }
    if (printBtn) {
      printBtn.disabled = true;
      printBtn.addEventListener('click', function () { global.print(); });
    }

    C.requireLogin(gate, app).then(function (user) {
      if (!user) return;
      loadStatus();
    });
  }

  global.TBLifePlans = {
    initPlanPage: initPlanPage,
    initDrugPage: initDrugPage
  };
})(window);
