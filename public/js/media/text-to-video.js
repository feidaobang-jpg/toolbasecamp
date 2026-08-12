(function () {
    'use strict';

    var C = window.TBImageCloud;
    if (!C) return;

    var loginGate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var balanceLine = document.getElementById('balance-line');
    var estimateLine = document.getElementById('estimate-line');
    var costNote = document.getElementById('cost-note');
    var promptInput = document.getElementById('prompt-input');
    var promptPresets = document.getElementById('prompt-presets');
    var durationInput = document.getElementById('duration-input');
    var durationHint = document.getElementById('duration-hint');
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
        if (!isFinite(n)) n = 5;
        return Math.max(minDuration, Math.min(maxDuration, n));
    }

    function syncDurationInput() {
        if (!durationInput) return;
        durationInput.min = String(minDuration);
        durationInput.max = String(maxDuration);
        durationInput.value = String(readDuration());
        if (durationHint) {
            durationHint.textContent = C.tr('tools.textToVideo.durationHint');
        }
    }

    function currentEstimate() {
        var dur = readDuration();
        var res = (resolutionSelect && resolutionSelect.value) || '720P';
        var listRate = listPerSec[res] != null ? listPerSec[res] : 0.9;
        return {
            duration: dur,
            resolution: res,
            price: listRate * dur * priceMarkup
        };
    }

    function updateEstimate() {
        if (!estimateLine) return;
        var est = currentEstimate();
        estimateLine.hidden = false;
        estimateLine.textContent = C.tr('tools.textToVideo.estimateLine', {
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
        C.setBusy(busyEl, busyText, on, msg || C.tr('tools.textToVideo.generating'));
        var hasPrompt = !!(promptInput.value || '').trim();
        runBtn.disabled = on || !hasPrompt || !configured;
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

    function loadStatus() {
        return C.apiJson('/happyhorse/status').then(function (s) {
            configured = !!s.configured;
            if (s.pricing && s.pricing.listPerSec) {
                Object.assign(listPerSec, s.pricing.listPerSec);
            }
            if (s.minDuration != null) minDuration = Number(s.minDuration) || minDuration;
            if (s.maxDuration != null) maxDuration = Number(s.maxDuration) || maxDuration;
            syncDurationInput();
            applyWallet(s.wallet);
            if (costNote) costNote.textContent = C.tr('tools.textToVideo.costNote');
            if (!configured) {
                C.setError(errorBox, C.tr('tools.textToVideo.notConfigured'));
            }
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
        taskId = '';
        promptInput.value = '';
        if (durationInput) durationInput.value = '5';
        if (resolutionSelect) resolutionSelect.value = '720P';
        if (ratioSelect) ratioSelect.value = '16:9';
        C.setError(errorBox, '');
        setBusy(false);
        loadStatus();
    }

    function fetchVideoBlob() {
        return C.apiBlob('/happyhorse/t2v/proxy/' + encodeURIComponent(taskId)).then(function (res) {
            revokeVideo();
            videoBlobUrl = URL.createObjectURL(res.blob);
            resultVideo.src = videoBlobUrl;
            resultWrap.hidden = false;
            downloadBtn.disabled = false;
        });
    }

    function pollOnce() {
        if (!polling || !taskId) return;
        C.apiJson('/happyhorse/t2v/task/' + encodeURIComponent(taskId))
            .then(function (data) {
                var status = String(data.status || '').toUpperCase();
                if (status === 'SUCCEEDED') {
                    stopPoll();
                    if (data.wallet) applyWallet(data.wallet);
                    setBusy(true, C.tr('tools.textToVideo.downloading'));
                    return fetchVideoBlob().then(function () {
                        setBusy(false);
                        loadStatus();
                    });
                }
                if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
                    stopPoll();
                    setBusy(false);
                    C.setError(errorBox, data.message || C.tr('tools.textToVideo.failed'));
                    loadStatus();
                    return;
                }
                var label = status === 'RUNNING'
                    ? C.tr('tools.textToVideo.running')
                    : C.tr('tools.textToVideo.queued');
                setBusy(true, label);
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
        var prompt = (promptInput.value || '').trim();
        if (!prompt) {
            C.setError(errorBox, C.tr('tools.textToVideo.needPrompt'));
            return;
        }
        var dur = readDuration();
        if (durationInput) durationInput.value = String(dur);
        if (dur < minDuration || dur > maxDuration) {
            C.setError(errorBox, C.tr('tools.textToVideo.invalidDuration', {
                min: String(minDuration),
                max: String(maxDuration)
            }));
            return;
        }
        C.setError(errorBox, '');
        stopPoll();
        revokeVideo();
        taskId = '';
        setBusy(true, C.tr('tools.textToVideo.submitting'));

        var form = new FormData();
        form.append('prompt', prompt);
        form.append('duration', String(dur));
        form.append('resolution', (resolutionSelect && resolutionSelect.value) || '720P');
        form.append('ratio', (ratioSelect && ratioSelect.value) || '16:9');

        C.apiJson('/happyhorse/t2v/submit', { method: 'POST', body: form })
            .then(function (data) {
                taskId = data.task_id;
                if (data.wallet) applyWallet(data.wallet);
                polling = true;
                setBusy(true, C.tr('tools.textToVideo.queued'));
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
            window.tbTriggerDownload(videoBlobUrl, 'happyhorse-t2v.mp4');
        } else {
            var a = document.createElement('a');
            a.href = videoBlobUrl;
            a.download = 'happyhorse-t2v.mp4';
            a.click();
        }
    }

    function refreshI18n() {
        if (costNote) costNote.textContent = C.tr('tools.textToVideo.costNote');
        syncDurationInput();
        updateEstimate();
        document.querySelectorAll('#resolution-select option[data-i18n]').forEach(function (opt) {
            var key = opt.getAttribute('data-i18n');
            if (key) opt.textContent = C.tr(key);
        });
    }

    runBtn.addEventListener('click', startGenerate);
    downloadBtn.addEventListener('click', downloadMp4);
    clearBtn.addEventListener('click', clearAll);
    promptInput.addEventListener('input', function () {
        setBusy(!!polling);
    });
    if (durationInput) durationInput.addEventListener('change', updateEstimate);
    if (durationInput) durationInput.addEventListener('input', updateEstimate);
    if (resolutionSelect) resolutionSelect.addEventListener('change', updateEstimate);

    if (promptPresets) {
        promptPresets.addEventListener('click', function (ev) {
            var btn = ev.target.closest('[data-preset]');
            if (!btn || polling) return;
            var key = btn.getAttribute('data-preset');
            promptInput.value = C.tr('tools.textToVideo.presetTexts.' + key);
            setBusy(false);
        });
    }

    window.addEventListener('tb:locale', refreshI18n);
    maybeShowWeChatFileDownloadTip();

    C.requireLogin(loginGate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
