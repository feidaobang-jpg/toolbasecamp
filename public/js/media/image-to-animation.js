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
    var durationSelect = document.getElementById('duration-select');
    var resolutionSelect = document.getElementById('resolution-select');
    var runBtn = document.getElementById('run-btn');
    var downloadBtn = document.getElementById('download-btn');
    var framesBtn = document.getElementById('frames-btn');
    var clearBtn = document.getElementById('clear-btn');
    var quotaLine = document.getElementById('quota-line');
    var costNote = document.getElementById('cost-note');
    var tierHint = document.getElementById('tier-hint');
    var promptPresets = document.getElementById('prompt-presets');
    var errorBox = document.getElementById('error-box');
    var busyEl = document.getElementById('busy');
    var busyText = document.getElementById('busy-text');
    var resultWrap = document.getElementById('result-wrap');
    var resultVideo = document.getElementById('result-video');

    var file = null;
    var previewUrl = '';
    var taskId = '';
    var videoBlobUrl = '';
    var polling = false;
    var pollTimer = null;

    if (loginLink) loginLink.href = C.loginUrl();

    function localizeSelectOptions() {
        if (durationSelect && durationSelect.options.length >= 2) {
            durationSelect.options[0].textContent = C.tr('tools.imageToAnimation.duration5');
            durationSelect.options[1].textContent = C.tr('tools.imageToAnimation.duration10');
        }
        if (resolutionSelect && resolutionSelect.options.length >= 2) {
            resolutionSelect.options[0].textContent = C.tr('tools.imageToAnimation.res720');
            resolutionSelect.options[1].textContent = C.tr('tools.imageToAnimation.res1080');
        }
    }

    function updateTierHint() {
        if (!tierHint) return;
        var dur = durationSelect.value || '5';
        var res = resolutionSelect.value || '720P';
        var expensive = dur === '10' || res === '1080P';
        tierHint.hidden = !expensive;
        tierHint.textContent = expensive
            ? C.tr('tools.imageToAnimation.tierMid')
            : C.tr('tools.imageToAnimation.tierCheap');
        if (!expensive) tierHint.hidden = true;
    }

    function scrollBottom() {
        requestAnimationFrame(function () {
            var scroller = document.querySelector('.content') || document.scrollingElement;
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
        });
    }

    function setQuota(q) {
        if (!q) {
            quotaLine.textContent = '';
            return;
        }
        if (q.unlimited) {
            quotaLine.textContent = C.tr('tools.imageCloud.quotaUnlimited');
            return;
        }
        quotaLine.textContent = C.tr('tools.imageCloud.quotaLine', {
            used: q.used,
            limit: q.limit,
            remaining: q.remaining
        });
    }

    function setBusy(on, msg) {
        C.setBusy(busyEl, busyText, on, msg || C.tr('tools.imageToAnimation.generating'));
        runBtn.disabled = on || !file || !(promptInput.value || '').trim();
        clearBtn.disabled = on;
        downloadBtn.disabled = on || !videoBlobUrl;
        framesBtn.disabled = on || !videoBlobUrl;
        promptInput.disabled = on;
        durationSelect.disabled = on;
        resolutionSelect.disabled = on;
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
        return C.apiJson('/wan/status').then(function (s) {
            if (!s.configured) {
                C.setError(errorBox, C.tr('tools.imageToAnimation.notConfigured'));
            }
            setQuota(s.quota);
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
        if (f.size > 6 * 1024 * 1024) {
            C.setError(errorBox, C.tr('tools.imageCloud.tooLarge'));
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        file = f;
        previewUrl = URL.createObjectURL(f);
        sourceImg.src = previewUrl;
        sourceWrap.hidden = false;
        controls.hidden = false;
        dropZone.hidden = true;
        setBusy(false);
        scrollBottom();
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
        return C.apiBlob('/wan/i2v/proxy/' + encodeURIComponent(taskId)).then(function (res) {
            revokeVideo();
            videoBlobUrl = URL.createObjectURL(res.blob);
            resultVideo.src = videoBlobUrl;
            resultWrap.hidden = false;
            downloadBtn.disabled = false;
            framesBtn.disabled = false;
            scrollBottom();
        });
    }

    function pollOnce() {
        if (!polling || !taskId) return;
        C.apiJson('/wan/i2v/task/' + encodeURIComponent(taskId))
            .then(function (data) {
                var status = String(data.status || '').toUpperCase();
                if (status === 'SUCCEEDED') {
                    stopPoll();
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
            });
    }

    function startGenerate() {
        if (!file) return;
        var prompt = (promptInput.value || '').trim();
        if (!prompt) {
            C.setError(errorBox, C.tr('tools.imageToAnimation.needPrompt'));
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
        form.append('duration', durationSelect.value || '5');
        form.append('resolution', resolutionSelect.value || '720P');

        C.apiJson('/wan/i2v/submit', { method: 'POST', body: form })
            .then(function (data) {
                taskId = data.task_id;
                setQuota(data.quota);
                polling = true;
                setBusy(true, C.tr('tools.imageToAnimation.queued'));
                pollOnce();
                scrollBottom();
            })
            .catch(function (err) {
                setBusy(false);
                C.setError(errorBox, err.message);
                loadStatus();
            });
    }

    function downloadMp4() {
        if (!videoBlobUrl) return;
        var a = document.createElement('a');
        a.href = videoBlobUrl;
        a.download = 'wan-animation.mp4';
        a.click();
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
        var duration = Math.max(0.1, video.duration || Number(durationSelect.value) || 5);
        var i = 0;

        setBusy(true, C.tr('tools.imageToAnimation.extractingFrames'));
        C.setError(errorBox, '');

        function seekNext() {
            if (i >= frameCount) {
                zip.generateAsync({ type: 'blob' }).then(function (blob) {
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'wan-frames.zip';
                    a.click();
                    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
                    setBusy(false);
                    scrollBottom();
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
    durationSelect.addEventListener('change', updateTierHint);
    resolutionSelect.addEventListener('change', updateTierHint);
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

    localizeSelectOptions();
    updateTierHint();

    C.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        loadStatus();
    });
})();
