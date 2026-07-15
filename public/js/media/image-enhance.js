(function () {
    'use strict';
    var C = window.TBImageCloud;
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var loginLink = document.getElementById('login-link');
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var sourceWrap = document.getElementById('source-wrap');
    var sourceImg = document.getElementById('source-img');
    var controls = document.getElementById('controls');
    var taskSelect = document.getElementById('task-select');
    var runBtn = document.getElementById('run-btn');
    var downloadBtn = document.getElementById('download-btn');
    var clearBtn = document.getElementById('clear-btn');
    var quotaLine = document.getElementById('quota-line');
    var errorBox = document.getElementById('error-box');
    var previewWrap = document.getElementById('preview-wrap');
    var previewImg = document.getElementById('preview-img');
    var file = null;
    var previewUrl = '';
    var resultUrl = '';

    var DEFAULT_TASKS = [
        { taskType: 1, id: 'cutEnhance' },
        { taskType: 2, id: 'curvatureCorrection' },
        { taskType: 202, id: 'blackAndWhite' },
        { taskType: 204, id: 'brightenMode' },
        { taskType: 205, id: 'grayScale' },
        { taskType: 207, id: 'inkSaving' },
        { taskType: 208, id: 'textSharpening' },
        { taskType: 301, id: 'removeMoire' },
        { taskType: 302, id: 'removeShadow' },
        { taskType: 303, id: 'removeBlur' },
        { taskType: 304, id: 'removeOverexposure' }
    ];

    if (loginLink) loginLink.href = C.loginUrl();

    function fillTasks(tasks) {
        taskSelect.innerHTML = '';
        (tasks || DEFAULT_TASKS).forEach(function (t) {
            var opt = document.createElement('option');
            opt.value = String(t.taskType);
            opt.textContent = C.tr('tools.imageEnhance.tasks.' + t.id);
            taskSelect.appendChild(opt);
        });
        if (!taskSelect.value) taskSelect.value = '302';
    }

    function loadStatus() {
        return C.apiJson('/image/status').then(function (s) {
            quotaLine.textContent = C.formatQuota(s.quotas, 'enhance');
            fillTasks(s.enhanceTasks);
        }).catch(function (err) {
            C.setError(errorBox, err.message);
            fillTasks(DEFAULT_TASKS);
        });
    }

    function setFile(f) {
        C.setError(errorBox, '');
        if (!f || !String(f.type || '').startsWith('image/')) {
            C.setError(errorBox, C.tr('tools.imageCloud.invalidFile'));
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = '';
        file = f;
        previewUrl = URL.createObjectURL(f);
        sourceImg.src = previewUrl;
        sourceWrap.hidden = false;
        controls.hidden = false;
        runBtn.disabled = false;
        downloadBtn.disabled = true;
        previewWrap.hidden = true;
        previewImg.removeAttribute('src');
    }

    dropZone.addEventListener('click', function () { fileInput.click(); });
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
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
        fileInput.value = '';
    });

    clearBtn.addEventListener('click', function () {
        file = null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        previewUrl = '';
        resultUrl = '';
        sourceImg.removeAttribute('src');
        previewImg.removeAttribute('src');
        sourceWrap.hidden = true;
        controls.hidden = true;
        previewWrap.hidden = true;
        runBtn.disabled = true;
        downloadBtn.disabled = true;
        C.setError(errorBox, '');
    });

    runBtn.addEventListener('click', function () {
        if (!file) return;
        C.setError(errorBox, '');
        runBtn.disabled = true;
        var fd = new FormData();
        fd.append('file', file, file.name || 'image.jpg');
        fd.append('task_type', taskSelect.value || '302');
        C.apiJson('/image/enhance', { method: 'POST', body: fd }).then(function (data) {
            if (resultUrl) URL.revokeObjectURL(resultUrl);
            resultUrl = C.b64ToObjectUrl(data.imageBase64, data.contentType || 'image/png');
            previewImg.src = resultUrl;
            previewWrap.hidden = false;
            downloadBtn.disabled = false;
            if (data.quota) {
                quotaLine.textContent = C.tr('tools.imageCloud.quotaLine', {
                    used: data.quota.used,
                    limit: data.quota.limit,
                    remaining: data.quota.remaining
                });
            }
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        }).finally(function () {
            runBtn.disabled = !file;
        });
    });

    downloadBtn.addEventListener('click', function () {
        if (!resultUrl) return;
        var a = document.createElement('a');
        a.href = resultUrl;
        a.download = 'enhanced.png';
        a.click();
    });

    C.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
