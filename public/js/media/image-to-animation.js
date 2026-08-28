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
    var promptInput = document.getElementById('prompt-input');
    var durationInput = document.getElementById('duration-input');
    var resolutionSelect = document.getElementById('resolution-select');
    var modelSelect = document.getElementById('model-select');
    var audioCheck = document.getElementById('audio-check');
    var audioRow = document.getElementById('audio-row');
    var audioHint = document.getElementById('audio-hint');
    var durationHint = document.getElementById('duration-hint');
    var costNote = document.getElementById('cost-note');
    var runBtn = document.getElementById('run-btn');
    var downloadBtn = document.getElementById('download-btn');
    var framesBtn = document.getElementById('frames-btn');
    var clearBtn = document.getElementById('clear-btn');
    var balanceLine = document.getElementById('balance-line');
    var estimateLine = document.getElementById('estimate-line');
    var promptPresets = document.getElementById('prompt-presets');
    var errorBox = document.getElementById('error-box');
    var busyEl = document.getElementById('busy');
    var busyText = document.getElementById('busy-text');
    var resultWrap = document.getElementById('result-wrap');
    var resultVideo = document.getElementById('result-video');
    var wechatCoverWrap = document.getElementById('wechat-cover-wrap');
    var wechatCoverImg = document.getElementById('wechat-cover-img');
    var wechatFileDownloadTip = document.getElementById('wechat-file-download-tip');
    var wechatCoverCaptured = false;

    var file = null;
    var previewUrl = '';
    var taskId = '';
    var videoBlobUrl = '';
    var polling = false;
    var pollTimer = null;
    var priceMarkup = 2;
    var minDuration = 4;
    var maxDuration = 15;
    var apiPrefix = '/minimax';
    var providerConfigured = { wan: true, h3: true };
    // Vendor list CNY / sec (same as server); UI shows list × markup
    var listPerSec = { '768P': 0.5, '2K': 0.8, '720P': 0.6, '1080P': 1.0 };

    if (loginLink) loginLink.href = C.loginUrl();

    function selectedModel() {
        return (modelSelect && modelSelect.value) || 'minimax-h3';
    }

    function isH3() {
        return selectedModel() === 'minimax-h3';
    }

    function syncProviderUi() {
        var h3 = isH3();
        apiPrefix = h3 ? '/minimax' : '/wan';
        minDuration = h3 ? 4 : 2;
        maxDuration = 15;
        if (audioRow) audioRow.hidden = !!h3;
        if (audioHint) {
            audioHint.hidden = false;
            audioHint.textContent = C.tr(h3 ? 'tools.imageToAnimation.audioHintH3' : 'tools.imageToAnimation.audioHint');
        }
        if (durationHint) {
            durationHint.textContent = C.tr(h3 ? 'tools.imageToAnimation.durationHintH3' : 'tools.imageToAnimation.durationHint');
        }
        if (costNote) {
            costNote.textContent = C.tr(h3 ? 'tools.imageToAnimation.costNoteH3' : 'tools.imageToAnimation.costNoteWan');
        }
        if (resolutionSelect) {
            var cur = resolutionSelect.value;
            resolutionSelect.innerHTML = '';
            if (h3) {
                resolutionSelect.appendChild(new Option(C.tr('tools.imageToAnimation.res768'), '768P'));
                resolutionSelect.appendChild(new Option(C.tr('tools.imageToAnimation.res2k'), '2K'));
                resolutionSelect.value = (cur === '2K' || cur === '1080P') ? '2K' : '768P';
            } else {
                resolutionSelect.appendChild(new Option(C.tr('tools.imageToAnimation.res720'), '720P'));
                resolutionSelect.appendChild(new Option(C.tr('tools.imageToAnimation.res1080'), '1080P'));
                resolutionSelect.value = (cur === '1080P' || cur === '2K') ? '1080P' : '720P';
            }
        }
        syncDurationInput();
        updateEstimate();
    }

    function clampDuration(raw) {
        var n = parseInt(String(raw || '5'), 10);
        if (!Number.isFinite(n)) n = 5;
        return Math.min(maxDuration, Math.max(minDuration, n));
    }

    function readDuration() {
        if (!durationInput) return 5;
        return clampDuration(durationInput.value);
    }

    function syncDurationInput() {
        if (!durationInput) return;
        durationInput.min = String(minDuration);
        durationInput.max = String(maxDuration);
        durationInput.value = String(readDuration());
    }

    function localizeSelectOptions() {
        if (modelSelect && modelSelect.options.length >= 2) {
            modelSelect.options[0].textContent = C.tr('tools.imageToAnimation.modelH3');
            modelSelect.options[1].textContent = C.tr('tools.imageToAnimation.modelWan27');
        }
        syncProviderUi();
    }

    function currentEstimate() {
        var dur = readDuration();
        var res = (resolutionSelect && resolutionSelect.value) || (isH3() ? '768P' : '720P');
        var listRate = listPerSec[res] != null ? listPerSec[res] : (isH3() ? 0.5 : 0.6);
        var listTotal = listRate * dur;
        var userTotal = listTotal * priceMarkup;
        return {
            duration: dur,
            resolution: res,
            price: userTotal
        };
    }

    function updateEstimate() {
        if (!estimateLine) return;
        var est = currentEstimate();
        estimateLine.hidden = false;
        estimateLine.textContent = C.tr('tools.imageToAnimation.estimateLine', {
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
        C.setBusy(busyEl, busyText, on, msg || C.tr('tools.imageToAnimation.generating'));
        runBtn.disabled = on || !file || !(promptInput.value || '').trim();
        clearBtn.disabled = on;
        downloadBtn.disabled = on || !videoBlobUrl;
        framesBtn.disabled = on || !videoBlobUrl;
        promptInput.disabled = on;
        if (durationInput) durationInput.disabled = on;
        if (modelSelect) modelSelect.disabled = on;
        resolutionSelect.disabled = on;
        if (audioCheck) audioCheck.disabled = on;
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
        if (wechatCoverImg) wechatCoverImg.removeAttribute('src');
        if (wechatCoverWrap) wechatCoverWrap.hidden = true;
        wechatCoverCaptured = false;
        resultWrap.hidden = true;
    }

    function tbIsWeChatNow() {
        return typeof window.tbIsWeChat === 'function' ? window.tbIsWeChat() : false;
    }

    function maybeShowWeChatFileDownloadTip() {
        if (!wechatFileDownloadTip) return;
        if (tbIsWeChatNow()) {
            wechatFileDownloadTip.hidden = false;
        } else {
            wechatFileDownloadTip.hidden = true;
        }
    }

    function maybeCaptureWeChatCover() {
        // User request: WeChat tip first, do not show cover long-press (cover share is not useful anyway).
        if (wechatCoverWrap) wechatCoverWrap.hidden = true;
        if (wechatCoverImg) wechatCoverImg.removeAttribute('src');
        wechatCoverCaptured = false;
    }

    function stopPoll() {
        polling = false;
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    function loadStatus() {
        var wanP = C.apiJson('/wan/status').then(function (s) {
            providerConfigured.wan = !!s.configured;
            if (s.pricing && s.pricing.listPerSec) {
                Object.assign(listPerSec, s.pricing.listPerSec);
            }
            if (!isH3()) {
                if (s.minDuration != null) minDuration = Number(s.minDuration) || minDuration;
                if (s.maxDuration != null) maxDuration = Number(s.maxDuration) || maxDuration;
                syncDurationInput();
                applyWallet(s.wallet);
            } else if (s.wallet) {
                applyWallet(s.wallet);
            }
            return s;
        }).catch(function () {
            providerConfigured.wan = false;
        });
        var h3P = C.apiJson('/minimax/status').then(function (s) {
            providerConfigured.h3 = !!s.configured;
            if (s.pricing && s.pricing.listPerSec) {
                Object.assign(listPerSec, s.pricing.listPerSec);
            }
            if (isH3()) {
                if (s.minDuration != null) minDuration = Number(s.minDuration) || minDuration;
                if (s.maxDuration != null) maxDuration = Number(s.maxDuration) || maxDuration;
                syncDurationInput();
                applyWallet(s.wallet);
            } else if (s.wallet) {
                applyWallet(s.wallet);
            }
            return s;
        }).catch(function () {
            providerConfigured.h3 = false;
        });
        return Promise.all([wanP, h3P]).then(function () {
            syncProviderUi();
            if (isH3() && !providerConfigured.h3) {
                C.setError(errorBox, C.tr('tools.imageToAnimation.notConfiguredH3'));
            } else if (!isH3() && !providerConfigured.wan) {
                C.setError(errorBox, C.tr('tools.imageToAnimation.notConfiguredWan'));
            }
        }).catch(function (err) {
            C.setError(errorBox, err.message);
        });
    }

    function setFile(f) {
        C.setError(errorBox, '');
        stopPoll();
        revokeVideo();
        taskId = '';
        if (!f || !String(f.type || '').startsWith('image/')) {
            C.setError(errorBox, C.tr('tools.imageCloud.invalidFile'));
            return;
        }
        var apply = function (picked) {
            if (picked.size > 6 * 1024 * 1024) {
                C.setError(errorBox, C.tr('tools.imageCloud.tooLarge'));
                return;
            }
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            file = picked;
            previewUrl = URL.createObjectURL(picked);
            sourceImg.src = previewUrl;
            sourceWrap.hidden = false;
            controls.hidden = false;
            dropZone.hidden = true;
            setBusy(false);
            updateEstimate();
        };
        if (window.TBImageUploadCompress && TBImageUploadCompress.prepareUploadFile) {
            TBImageUploadCompress.prepareUploadFile(f, apply, 'video');
        } else {
            apply(f);
        }
    }

    function clearAll() {
        stopPoll();
        revokeVideo();
        file = null;
        taskId = '';
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        sourceImg.removeAttribute('src');
        sourceWrap.hidden = true;
        controls.hidden = true;
        dropZone.hidden = false;
        fileInput.value = '';
        promptInput.value = '';
        C.setError(errorBox, '');
        setBusy(false);
        loadStatus();
    }

    function fetchVideoBlob() {
        return C.apiBlob(apiPrefix + '/i2v/proxy/' + encodeURIComponent(taskId)).then(function (res) {
            revokeVideo();
            videoBlobUrl = URL.createObjectURL(res.blob);
            resultVideo.src = videoBlobUrl;
            maybeCaptureWeChatCover();
            resultWrap.hidden = false;
            downloadBtn.disabled = false;
            framesBtn.disabled = false;
        });
    }

    function pollOnce() {
        if (!polling || !taskId) return;
        C.apiJson(apiPrefix + '/i2v/task/' + encodeURIComponent(taskId))
            .then(function (data) {
                var status = String(data.status || '').toUpperCase();
                if (status === 'SUCCEEDED') {
                    stopPoll();
                    if (data.wallet) applyWallet(data.wallet);
                    setBusy(true, C.tr('tools.imageToAnimation.downloading'));
                    return fetchVideoBlob().then(function () {
                        setBusy(false);
                        loadStatus();
                    });
                }
                if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
                    stopPoll();
                    setBusy(false);
                    C.setError(errorBox, data.message || C.tr('tools.imageToAnimation.failed'));
                    loadStatus();
                    return;
                }
                var label = status === 'RUNNING'
                    ? C.tr('tools.imageToAnimation.running')
                    : C.tr('tools.imageToAnimation.queued');
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
        if (!file) return;
        var prompt = (promptInput.value || '').trim();
        if (!prompt) {
            C.setError(errorBox, C.tr('tools.imageToAnimation.needPrompt'));
            return;
        }
        var dur = readDuration();
        if (String(dur) !== String(durationInput && durationInput.value)) {
            if (durationInput) durationInput.value = String(dur);
        }
        if (dur < minDuration || dur > maxDuration) {
            C.setError(errorBox, C.tr('tools.imageToAnimation.invalidDuration', {
                min: String(minDuration),
                max: String(maxDuration)
            }));
            return;
        }
        C.setError(errorBox, '');
        stopPoll();
        revokeVideo();
        taskId = '';
        setBusy(true, C.tr('tools.imageToAnimation.submitting'));

        var form = new FormData();
        form.append('image', file);
        form.append('prompt', prompt);
        form.append('duration', String(readDuration()));
        form.append('resolution', resolutionSelect.value || (isH3() ? '768P' : '720P'));
        if (!isH3()) {
            form.append('audio', audioCheck && audioCheck.checked ? '1' : '0');
        }

        C.apiJson(apiPrefix + '/i2v/submit', { method: 'POST', body: form })
            .then(function (data) {
                taskId = data.task_id;
                if (data.wallet) applyWallet(data.wallet);
                polling = true;
                setBusy(true, C.tr('tools.imageToAnimation.queued'));
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
            window.tbTriggerDownload(videoBlobUrl, isH3() ? 'minimax-h3.mp4' : 'wan-video.mp4');
        } else {
            var a = document.createElement('a');
            a.href = videoBlobUrl;
            a.download = isH3() ? 'minimax-h3.mp4' : 'wan-video.mp4';
            a.click();
        }
    }

    function captureFramesZip() {
        if (!videoBlobUrl || typeof JSZip === 'undefined') {
            C.setError(errorBox, C.tr('tools.imageToAnimation.framesUnavailable'));
            return;
        }
        var video = resultVideo;
        var zip = new JSZip();
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var frameCount = 8;
        var duration = Math.max(0.1, video.duration || readDuration());
        var i = 0;

        setBusy(true, C.tr('tools.imageToAnimation.extractingFrames'));
        C.setError(errorBox, '');

        function seekNext() {
            if (i >= frameCount) {
                zip.generateAsync({ type: 'blob' }).then(function (blob) {
                    var url = URL.createObjectURL(blob);
                    if (typeof window.tbTriggerDownload === 'function') {
                        window.tbTriggerDownload(url, 'wan-frames.zip');
                    } else {
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = 'wan-frames.zip';
                        a.click();
                    }
                    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
                    setBusy(false);
                }).catch(function () {
                    setBusy(false);
                    C.setError(errorBox, C.tr('tools.imageToAnimation.framesUnavailable'));
                });
                return;
            }
            var t = (i / Math.max(frameCount - 1, 1)) * (duration - 0.05);
            var onSeek = function () {
                video.removeEventListener('seeked', onSeek);
                canvas.width = video.videoWidth || 720;
                canvas.height = video.videoHeight || 1280;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(function (blob) {
                    if (blob) {
                        var name = 'frame-' + String(i + 1).padStart(2, '0') + '.png';
                        zip.file(name, blob);
                    }
                    i += 1;
                    seekNext();
                }, 'image/png');
            };
            video.addEventListener('seeked', onSeek);
            video.currentTime = Math.min(Math.max(t, 0), duration - 0.01);
        }

        video.pause();
        seekNext();
    }

    dropZone.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
    });
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });

    promptInput.addEventListener('input', function () {
        if (!polling) setBusy(false);
    });
    if (durationInput) {
        durationInput.addEventListener('input', updateEstimate);
        durationInput.addEventListener('change', function () {
            durationInput.value = String(readDuration());
            updateEstimate();
        });
    }
    resolutionSelect.addEventListener('change', updateEstimate);
    if (modelSelect) {
        modelSelect.addEventListener('change', function () {
            C.setError(errorBox, '');
            syncProviderUi();
            if (isH3() && !providerConfigured.h3) {
                C.setError(errorBox, C.tr('tools.imageToAnimation.notConfiguredH3'));
            } else if (!isH3() && !providerConfigured.wan) {
                C.setError(errorBox, C.tr('tools.imageToAnimation.notConfiguredWan'));
            }
        });
    }
    if (promptPresets) {
        promptPresets.addEventListener('click', function (e) {
            var btn = e.target.closest('.wan-preset');
            if (!btn || btn.disabled) return;
            var key = btn.getAttribute('data-preset');
            if (!key) return;
            promptInput.value = C.tr('tools.imageToAnimation.presetTexts.' + key);
            if (!polling) setBusy(false);
            promptInput.focus();
        });
    }
    runBtn.addEventListener('click', startGenerate);
    downloadBtn.addEventListener('click', downloadMp4);
    framesBtn.addEventListener('click', captureFramesZip);
    clearBtn.addEventListener('click', clearAll);

    document.addEventListener('tb:locale', function () {
        localizeSelectOptions();
        updateEstimate();
        maybeShowWeChatFileDownloadTip();
        if (balanceLine && balanceLine.textContent) loadStatus();
    });

    syncDurationInput();
    localizeSelectOptions();
    updateEstimate();
    maybeShowWeChatFileDownloadTip();

    C.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
