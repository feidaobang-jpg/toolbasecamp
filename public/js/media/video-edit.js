(function () {
    'use strict';

    var C = window.TBImageCloud;
    if (!C) return;

    var MAX_REFS = 5;
    var loginGate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var balanceLine = document.getElementById('balance-line');
    var estimateLine = document.getElementById('estimate-line');
    var costNote = document.getElementById('cost-note');
    var videoDrop = document.getElementById('video-drop');
    var videoInput = document.getElementById('video-input');
    var videoName = document.getElementById('video-name');
    var imgDrop = document.getElementById('img-drop');
    var imgInput = document.getElementById('img-input');
    var thumbs = document.getElementById('thumbs');
    var promptInput = document.getElementById('prompt-input');
    var promptPresets = document.getElementById('prompt-presets');
    var resolutionSelect = document.getElementById('resolution-select');
    var audioSelect = document.getElementById('audio-select');
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
    var priceMarkup = 2;
    var listPerSec = { '720P': 0.9, '1080P': 1.2 };
    var estimateSeconds = 10;
    var videoFile = null;
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

    function updateEstimate() {
        if (!estimateLine) return;
        var res = (resolutionSelect && resolutionSelect.value) || '720P';
        var listRate = listPerSec[res] != null ? listPerSec[res] : 0.9;
        var price = listRate * estimateSeconds * priceMarkup;
        estimateLine.hidden = false;
        estimateLine.textContent = C.tr('tools.videoEdit.estimateLine', {
            price: price.toFixed(2),
            duration: String(estimateSeconds),
            resolution: res
        });
    }

    function applyWallet(wallet) {
        if (wallet && wallet.markup != null) priceMarkup = C.walletMarkup(wallet);
        if (balanceLine) balanceLine.textContent = C.formatWallet(wallet);
        updateEstimate();
    }

    function setBusy(on, msg) {
        C.setBusy(busyEl, busyText, on, msg || C.tr('tools.videoEdit.generating'));
        var ok = !!videoFile && !!(promptInput.value || '').trim() && configured;
        runBtn.disabled = on || !ok;
        clearBtn.disabled = on;
        downloadBtn.disabled = on || !videoBlobUrl;
        promptInput.disabled = on;
        if (resolutionSelect) resolutionSelect.disabled = on;
        if (audioSelect) audioSelect.disabled = on;
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
            img.alt = 'Ref ' + (i + 1);
            var idx = document.createElement('span');
            idx.className = 'r2v-idx';
            idx.textContent = String(i + 1);
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'r2v-rm';
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

    function setVideoFile(f) {
        C.setError(errorBox, '');
        if (!f) return;
        var name = String(f.name || '').toLowerCase();
        var okType = String(f.type || '').startsWith('video/') || /\.(mp4|mov)$/.test(name);
        if (!okType) {
            C.setError(errorBox, C.tr('tools.videoEdit.needVideo'));
            return;
        }
        if (f.size > 45 * 1024 * 1024) {
            C.setError(errorBox, C.tr('tools.videoEdit.videoTooLarge'));
            return;
        }
        videoFile = f;
        videoName.hidden = false;
        videoName.textContent = C.tr('tools.videoEdit.selectedVideo', { name: f.name || 'video.mp4' });
        setBusy(false);
    }

    function addRefFiles(fileList) {
        Array.prototype.slice.call(fileList || []).forEach(function (f) {
            if (!f || !String(f.type || '').startsWith('image/')) return;
            if (f.size > 8 * 1024 * 1024) {
                C.setError(errorBox, C.tr('tools.videoEdit.imgTooLarge'));
                return;
            }
            if (refFiles.length >= MAX_REFS) {
                C.setError(errorBox, C.tr('tools.videoEdit.tooManyRefs', { max: String(MAX_REFS) }));
                return;
            }
            refFiles.push(f);
        });
        revokePreviews();
        renderThumbs();
        setBusy(false);
    }

    function loadStatus() {
        return C.apiJson('/happyhorse/status').then(function (s) {
            configured = !!s.configured;
            if (s.pricing && s.pricing.listPerSec) Object.assign(listPerSec, s.pricing.listPerSec);
            if (s.maxEditRefImages) MAX_REFS = Number(s.maxEditRefImages) || MAX_REFS;
            applyWallet(s.wallet);
            if (costNote) costNote.textContent = C.tr('tools.videoEdit.costNote');
            if (!configured) C.setError(errorBox, C.tr('tools.videoEdit.notConfigured'));
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
        videoFile = null;
        refFiles = [];
        thumbs.innerHTML = '';
        taskId = '';
        promptInput.value = '';
        videoName.hidden = true;
        videoName.textContent = '';
        if (videoInput) videoInput.value = '';
        if (imgInput) imgInput.value = '';
        if (resolutionSelect) resolutionSelect.value = '720P';
        if (audioSelect) audioSelect.value = 'origin';
        C.setError(errorBox, '');
        setBusy(false);
        loadStatus();
    }

    function fetchVideoBlob() {
        return C.apiBlob('/happyhorse/edit/proxy/' + encodeURIComponent(taskId)).then(function (res) {
            revokeVideo();
            videoBlobUrl = URL.createObjectURL(res.blob);
            resultVideo.src = videoBlobUrl;
            resultWrap.hidden = false;
            downloadBtn.disabled = false;
        });
    }

    function pollOnce() {
        if (!polling || !taskId) return;
        C.apiJson('/happyhorse/edit/task/' + encodeURIComponent(taskId))
            .then(function (data) {
                var status = String(data.status || '').toUpperCase();
                if (status === 'SUCCEEDED') {
                    stopPoll();
                    if (data.wallet) applyWallet(data.wallet);
                    setBusy(true, C.tr('tools.videoEdit.downloading'));
                    return fetchVideoBlob().then(function () {
                        setBusy(false);
                        loadStatus();
                    });
                }
                if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
                    stopPoll();
                    setBusy(false);
                    C.setError(errorBox, data.message || C.tr('tools.videoEdit.failed'));
                    loadStatus();
                    return;
                }
                setBusy(true, status === 'RUNNING'
                    ? C.tr('tools.videoEdit.running')
                    : C.tr('tools.videoEdit.queued'));
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
        if (!videoFile) {
            C.setError(errorBox, C.tr('tools.videoEdit.needVideo'));
            return;
        }
        var prompt = (promptInput.value || '').trim();
        if (!prompt) {
            C.setError(errorBox, C.tr('tools.videoEdit.needPrompt'));
            return;
        }
        C.setError(errorBox, '');
        stopPoll();
        revokeVideo();
        taskId = '';
        setBusy(true, C.tr('tools.videoEdit.submitting'));

        var form = new FormData();
        form.append('prompt', prompt);
        form.append('resolution', (resolutionSelect && resolutionSelect.value) || '720P');
        form.append('audio_setting', (audioSelect && audioSelect.value) || 'origin');
        form.append('duration', String(estimateSeconds));
        form.append('video', videoFile, videoFile.name || 'source.mp4');
        refFiles.forEach(function (f) {
            form.append('images', f, f.name || 'ref.jpg');
        });

        C.apiJson('/happyhorse/edit/submit', { method: 'POST', body: form })
            .then(function (data) {
                taskId = data.task_id;
                if (data.wallet) applyWallet(data.wallet);
                polling = true;
                setBusy(true, C.tr('tools.videoEdit.queued'));
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
            window.tbTriggerDownload(videoBlobUrl, 'happyhorse-edit.mp4');
        } else {
            var a = document.createElement('a');
            a.href = videoBlobUrl;
            a.download = 'happyhorse-edit.mp4';
            a.click();
        }
    }

    function bindDrop(zone, input, onFiles) {
        zone.addEventListener('click', function () { input.click(); });
        zone.addEventListener('dragover', function (e) {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        zone.addEventListener('dragleave', function () { zone.classList.remove('dragover'); });
        zone.addEventListener('drop', function (e) {
            e.preventDefault();
            zone.classList.remove('dragover');
            if (polling) return;
            onFiles(e.dataTransfer && e.dataTransfer.files);
        });
        input.addEventListener('change', function () {
            onFiles(input.files);
            input.value = '';
        });
    }

    bindDrop(videoDrop, videoInput, function (files) {
        if (files && files[0]) setVideoFile(files[0]);
    });
    bindDrop(imgDrop, imgInput, addRefFiles);

    runBtn.addEventListener('click', startGenerate);
    downloadBtn.addEventListener('click', downloadMp4);
    clearBtn.addEventListener('click', clearAll);
    promptInput.addEventListener('input', function () { setBusy(!!polling); });
    if (resolutionSelect) resolutionSelect.addEventListener('change', updateEstimate);

    if (promptPresets) {
        promptPresets.addEventListener('click', function (ev) {
            var btn = ev.target.closest('[data-preset]');
            if (!btn || polling) return;
            promptInput.value = C.tr('tools.videoEdit.presetTexts.' + btn.getAttribute('data-preset'));
            setBusy(false);
        });
    }

    window.addEventListener('tb:locale', function () {
        if (costNote) costNote.textContent = C.tr('tools.videoEdit.costNote');
        updateEstimate();
        ['#resolution-select', '#audio-select'].forEach(function (sel) {
            document.querySelectorAll(sel + ' option[data-i18n]').forEach(function (opt) {
                var key = opt.getAttribute('data-i18n');
                if (key) opt.textContent = C.tr(key);
            });
        });
        if (videoFile && videoName) {
            videoName.textContent = C.tr('tools.videoEdit.selectedVideo', { name: videoFile.name || 'video.mp4' });
        }
    });

    maybeShowWeChatFileDownloadTip();
    C.requireLogin(loginGate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
