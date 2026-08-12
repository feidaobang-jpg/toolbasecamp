(function () {
    'use strict';

    var C = window.TBImageCloud;
    if (!C) return;

    var MAX_REFS = 9;
    var loginGate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var balanceLine = document.getElementById('balance-line');
    var estimateLine = document.getElementById('estimate-line');
    var costNote = document.getElementById('cost-note');
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var thumbs = document.getElementById('thumbs');
    var promptInput = document.getElementById('prompt-input');
    var promptPresets = document.getElementById('prompt-presets');
    var durationInput = document.getElementById('duration-input');
    var resolutionSelect = document.getElementById('resolution-select');
    var ratioSelect = document.getElementById('ratio-select');
    var runBtn = document.getElementById('run-btn');
    var downloadBtn = document.getElementById('download-btn');
    var clearBtn = document.getElementById('clear-btn');
    var busyEl = document.getElementById('busy');
    var busyText = document.getElementById('busy-text');
    var errorBox = document.getElementById('error-box');
    var resultWrap = document.getElementById('result-wrap');
    var resultVideo = document.getElementById('result-video');
    var wechatFileDownloadTip = document.getElementById('wechat-file-download-tip');

    var configured = false;
    var minDuration = 3;
    var maxDuration = 15;
    var priceMarkup = 2;
    var listPerSec = { '480P': 0.45, '720P': 0.9, '1080P': 1.2 };
    var refFiles = [];
    var previewUrls = [];
    var taskId = '';
    var videoBlobUrl = '';
    var polling = false;
    var pollTimer = null;

    function tbIsWeChatNow() {
        return typeof window.tbIsWeChat === 'function' ? window.tbIsWeChat() : false;
    }

    function maybeShowWeChatFileDownloadTip() {
        if (!wechatFileDownloadTip) return;
        wechatFileDownloadTip.hidden = !tbIsWeChatNow();
    }

    function readDuration() {
        var n = parseInt(durationInput && durationInput.value, 10);
        if (!isFinite(n)) n = 10;
        return Math.max(minDuration, Math.min(maxDuration, n));
    }

    function currentEstimate() {
        var dur = readDuration();
        var res = (resolutionSelect && resolutionSelect.value) || '720P';
        var listRate = listPerSec[res] != null ? listPerSec[res] : 0.9;
        return { duration: dur, resolution: res, price: listRate * dur * priceMarkup };
    }

    function updateEstimate() {
        if (!estimateLine) return;
        var est = currentEstimate();
        estimateLine.hidden = false;
        estimateLine.textContent = C.tr('tools.refToVideo.estimateLine', {
            price: est.price.toFixed(2),
            duration: String(est.duration),
            resolution: est.resolution
        });
    }

    function applyWallet(wallet) {
        if (wallet && wallet.markup != null) priceMarkup = C.walletMarkup(wallet);
        if (balanceLine) balanceLine.textContent = C.formatWallet(wallet);
        updateEstimate();
    }

    function setBusy(on, msg) {
        C.setBusy(busyEl, busyText, on, msg || C.tr('tools.refToVideo.generating'));
        var ok = refFiles.length > 0 && !!(promptInput.value || '').trim() && configured;
        runBtn.disabled = on || !ok;
        clearBtn.disabled = on;
        downloadBtn.disabled = on || !videoBlobUrl;
        promptInput.disabled = on;
        if (durationInput) durationInput.disabled = on;
        if (resolutionSelect) resolutionSelect.disabled = on;
        if (ratioSelect) ratioSelect.disabled = on;
        if (promptPresets) {
            promptPresets.querySelectorAll('.wan-preset').forEach(function (btn) {
                btn.disabled = !!on;
            });
        }
    }

    function revokePreviews() {
        previewUrls.forEach(function (u) {
            try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ }
        });
        previewUrls = [];
    }

    function revokeVideo() {
        if (videoBlobUrl) {
            URL.revokeObjectURL(videoBlobUrl);
            videoBlobUrl = '';
        }
        resultVideo.removeAttribute('src');
        resultVideo.load();
        resultWrap.hidden = true;
    }

    function stopPoll() {
        polling = false;
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    function renderThumbs() {
        thumbs.innerHTML = '';
        refFiles.forEach(function (file, i) {
            var wrap = document.createElement('div');
            wrap.className = 'r2v-thumb';
            var img = document.createElement('img');
            var url = URL.createObjectURL(file);
            previewUrls.push(url);
            img.src = url;
            img.alt = 'Image ' + (i + 1);
            var idx = document.createElement('span');
            idx.className = 'r2v-idx';
            idx.textContent = String(i + 1);
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'r2v-rm';
            rm.setAttribute('aria-label', 'Remove');
            rm.textContent = '×';
            rm.addEventListener('click', function () {
                if (polling) return;
                refFiles.splice(i, 1);
                revokePreviews();
                renderThumbs();
                setBusy(false);
            });
            wrap.appendChild(img);
            wrap.appendChild(idx);
            wrap.appendChild(rm);
            thumbs.appendChild(wrap);
        });
    }

    function addFiles(fileList) {
        C.setError(errorBox, '');
        var arr = Array.prototype.slice.call(fileList || []);
        arr.forEach(function (f) {
            if (!f || !String(f.type || '').startsWith('image/')) return;
            if (f.size > 8 * 1024 * 1024) {
                C.setError(errorBox, C.tr('tools.refToVideo.tooLarge'));
                return;
            }
            if (refFiles.length >= MAX_REFS) {
                C.setError(errorBox, C.tr('tools.refToVideo.tooMany', { max: String(MAX_REFS) }));
                return;
            }
            refFiles.push(f);
        });
        revokePreviews();
        renderThumbs();
        setBusy(false);
        updateEstimate();
    }

    function loadStatus() {
        return C.apiJson('/happyhorse/status').then(function (s) {
            configured = !!s.configured;
            if (s.pricing && s.pricing.listPerSec) Object.assign(listPerSec, s.pricing.listPerSec);
            if (s.minDuration != null) minDuration = Number(s.minDuration) || minDuration;
            if (s.maxDuration != null) maxDuration = Number(s.maxDuration) || maxDuration;
            if (s.maxRefImages) MAX_REFS = Number(s.maxRefImages) || MAX_REFS;
            if (durationInput) {
                durationInput.min = String(minDuration);
                durationInput.max = String(maxDuration);
            }
            applyWallet(s.wallet);
            if (costNote) costNote.textContent = C.tr('tools.refToVideo.costNote');
            if (!configured) C.setError(errorBox, C.tr('tools.refToVideo.notConfigured'));
            setBusy(false);
            return s;
        }).catch(function (err) {
            configured = false;
            C.setError(errorBox, err.message);
            setBusy(false);
        });
    }

    function clearAll() {
        stopPoll();
        revokeVideo();
        revokePreviews();
        refFiles = [];
        thumbs.innerHTML = '';
        taskId = '';
        promptInput.value = '';
        if (durationInput) durationInput.value = '10';
        if (resolutionSelect) resolutionSelect.value = '720P';
        if (ratioSelect) ratioSelect.value = '16:9';
        if (fileInput) fileInput.value = '';
        C.setError(errorBox, '');
        setBusy(false);
        loadStatus();
    }

    function fetchVideoBlob() {
        return C.apiBlob('/happyhorse/r2v/proxy/' + encodeURIComponent(taskId)).then(function (res) {
            revokeVideo();
            videoBlobUrl = URL.createObjectURL(res.blob);
            resultVideo.src = videoBlobUrl;
            resultWrap.hidden = false;
            downloadBtn.disabled = false;
        });
    }

    function pollOnce() {
        if (!polling || !taskId) return;
        C.apiJson('/happyhorse/r2v/task/' + encodeURIComponent(taskId))
            .then(function (data) {
                var status = String(data.status || '').toUpperCase();
                if (status === 'SUCCEEDED') {
                    stopPoll();
                    if (data.wallet) applyWallet(data.wallet);
                    setBusy(true, C.tr('tools.refToVideo.downloading'));
                    return fetchVideoBlob().then(function () {
                        setBusy(false);
                        loadStatus();
                    });
                }
                if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
                    stopPoll();
                    setBusy(false);
                    C.setError(errorBox, data.message || C.tr('tools.refToVideo.failed'));
                    loadStatus();
                    return;
                }
                setBusy(true, status === 'RUNNING'
                    ? C.tr('tools.refToVideo.running')
                    : C.tr('tools.refToVideo.queued'));
                pollTimer = setTimeout(pollOnce, 4000);
            })
            .catch(function (err) {
                stopPoll();
                setBusy(false);
                C.setError(errorBox, err.message);
                loadStatus();
            });
    }

    function startGenerate() {
        if (!refFiles.length) {
            C.setError(errorBox, C.tr('tools.refToVideo.needImages'));
            return;
        }
        var prompt = (promptInput.value || '').trim();
        if (!prompt) {
            C.setError(errorBox, C.tr('tools.refToVideo.needPrompt'));
            return;
        }
        var dur = readDuration();
        if (durationInput) durationInput.value = String(dur);
        C.setError(errorBox, '');
        stopPoll();
        revokeVideo();
        taskId = '';
        setBusy(true, C.tr('tools.refToVideo.submitting'));

        var form = new FormData();
        form.append('prompt', prompt);
        form.append('duration', String(dur));
        form.append('resolution', (resolutionSelect && resolutionSelect.value) || '720P');
        form.append('ratio', (ratioSelect && ratioSelect.value) || '16:9');
        refFiles.forEach(function (f) {
            form.append('images', f, f.name || 'ref.jpg');
        });

        C.apiJson('/happyhorse/r2v/submit', { method: 'POST', body: form })
            .then(function (data) {
                taskId = data.task_id;
                if (data.wallet) applyWallet(data.wallet);
                polling = true;
                setBusy(true, C.tr('tools.refToVideo.queued'));
                pollOnce();
            })
            .catch(function (err) {
                setBusy(false);
                C.setError(errorBox, err.message);
                loadStatus();
            });
    }

    function downloadMp4() {
        if (!videoBlobUrl) return;
        if (typeof window.tbTriggerDownload === 'function') {
            window.tbTriggerDownload(videoBlobUrl, 'happyhorse-r2v.mp4');
        } else {
            var a = document.createElement('a');
            a.href = videoBlobUrl;
            a.download = 'happyhorse-r2v.mp4';
            a.click();
        }
    }

    dropZone.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (polling) return;
        addFiles(e.dataTransfer && e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function () {
        addFiles(fileInput.files);
        fileInput.value = '';
    });

    runBtn.addEventListener('click', startGenerate);
    downloadBtn.addEventListener('click', downloadMp4);
    clearBtn.addEventListener('click', clearAll);
    promptInput.addEventListener('input', function () { setBusy(!!polling); });
    if (durationInput) {
        durationInput.addEventListener('change', updateEstimate);
        durationInput.addEventListener('input', updateEstimate);
    }
    if (resolutionSelect) resolutionSelect.addEventListener('change', updateEstimate);

    if (promptPresets) {
        promptPresets.addEventListener('click', function (ev) {
            var btn = ev.target.closest('[data-preset]');
            if (!btn || polling) return;
            promptInput.value = C.tr('tools.refToVideo.presetTexts.' + btn.getAttribute('data-preset'));
            setBusy(false);
        });
    }

    window.addEventListener('tb:locale', function () {
        if (costNote) costNote.textContent = C.tr('tools.refToVideo.costNote');
        updateEstimate();
        document.querySelectorAll('#resolution-select option[data-i18n]').forEach(function (opt) {
            var key = opt.getAttribute('data-i18n');
            if (key) opt.textContent = C.tr(key);
        });
    });

    maybeShowWeChatFileDownloadTip();
    C.requireLogin(loginGate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
