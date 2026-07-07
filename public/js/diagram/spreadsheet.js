(function () {
    'use strict';

    var rootEl = document.getElementById('spreadsheet-root');
    var exportBtn = document.getElementById('export-json-btn');
    var importBtn = document.getElementById('import-json-btn');
    var clearBtn = document.getElementById('clear-btn');
    var importFile = document.getElementById('import-file');
    var errorBox = document.getElementById('error-box');

    if (!rootEl || typeof x_spreadsheet !== 'function') return;

    function tr(key) {
        return typeof window.t === 'function' ? window.t(key) : key;
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.classList.add('is-visible');
    }

    function hideError() {
        errorBox.textContent = '';
        errorBox.classList.remove('is-visible');
    }

    var sheet = x_spreadsheet(rootEl, {
        showToolbar: true,
        showGrid: true,
        showContextmenu: true,
        view: {
            height: () => rootEl.clientHeight,
            width: () => rootEl.clientWidth
        }
    }).loadData({});

    function downloadJson(data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'spreadsheet.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    exportBtn.addEventListener('click', function () {
        hideError();
        downloadJson(sheet.getData());
    });

    importBtn.addEventListener('click', function () {
        importFile.click();
    });

    importFile.addEventListener('change', function () {
        var file = importFile.files && importFile.files[0];
        importFile.value = '';
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            hideError();
            try {
                var data = JSON.parse(String(reader.result || ''));
                sheet.loadData(data);
            } catch (err) {
                showError(tr('tools.spreadsheet.importError'));
            }
        };
        reader.readAsText(file);
    });

    clearBtn.addEventListener('click', function () {
        if (window.confirm(tr('tools.spreadsheet.clearConfirm'))) {
            sheet.loadData({});
            hideError();
        }
    });

    window.addEventListener('resize', function () {
        sheet.reRender();
    });
})();
