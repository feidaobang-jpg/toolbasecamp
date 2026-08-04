/**
 * Shared client for /image/* cloud tools (login + daily quota).
 */
(function (global) {
    'use strict';

    var TOKEN_KEY = 'auth_token';

    function tr(key, params) {
        return typeof global.t === 'function' ? global.t(key, params) : key;
    }

    function apiBase() {
        if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) return siteConfig.apiBase;
        var host = global.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
        return global.location.origin + '/api';
    }

    function getToken() {
        return global.localStorage.getItem(TOKEN_KEY) || '';
    }

    function loginUrl() {
        var next = (global.location.pathname || '/') + (global.location.search || '');
        return '../auth/login.html?next=' + encodeURIComponent(next);
    }

    function translateDetail(msg, status) {
        if (!msg) {
            if (status === 502 || status === 504) return tr('tools.imageCloud.serviceUnavailable');
            return tr('tools.imageCloud.unknownError');
        }
        if (String(msg).indexOf('Failed to fetch') !== -1) return tr('tools.imageCloud.networkError');
        if (msg === 'Bad Gateway' || msg === 'Gateway Timeout') {
            return tr('tools.imageCloud.serviceUnavailable');
        }
        var map = {
            'Authentication required': 'auth.authRequired',
            'Session expired. Please log in again.': 'auth.sessionExpired',
            'Daily limit reached. Please try again tomorrow.': 'tools.imageCloud.dailyLimit',
            'Daily limit reached. Please try again tomorrow or log in for a higher limit.': 'tools.lifePlans.dailyLimitGuest',
            'Tencent Cloud is not configured (TENCENT_SECRET_ID / TENCENT_SECRET_KEY).': 'tools.imageCloud.notConfigured',
            'DashScope is not configured (DASHSCOPE_API_KEY).': 'tools.imageToAnimation.notConfigured',
            'Please enter a prompt.': 'tools.textToImage.needPrompt',
            'Please enter a prompt': 'tools.textToImage.needPrompt',
            'Please enter an edit instruction or choose a style preset.': 'tools.instructEdit.needPromptOrPreset',
            'Please enter a motion prompt': 'tools.imageToAnimation.needPrompt',
            'Please upload an image file': 'tools.imageCloud.invalidFile',
            'Empty file': 'tools.imageCloud.invalidFile',
            'Image is too large (max 8MB)': 'tools.imageCloud.tooLarge',
            'Image is too large for portrait segment (max 5MB)': 'tools.imageCloud.tooLarge',
            'Image content is too large': 'tools.imageCloud.tooLarge',
            'Image decode failed': 'tools.imageCloud.decodeFailed',
            'Unsupported image format': 'tools.imageCloud.unsupportedFormat',
            'Image resolution is too large': 'tools.imageCloud.resolutionTooLarge',
            'Image resolution is too small': 'tools.imageCloud.resolutionTooSmall',
            'No portrait subject detected': 'tools.imageCloud.noSubject',
            'Too many people in the image': 'tools.imageCloud.tooManyPeople',
            'Could not separate subject from background': 'tools.imageCloud.segmentFailed',
            'Portrait cutout timed out': 'tools.imageCloud.segmentTimeout',
            'Portrait cutout service busy': 'tools.imageCloud.segmentBusy',
            'Portrait cutout service unavailable': 'tools.imageCloud.serviceUnavailable',
            'Portrait cutout failed': 'tools.imageCloud.segmentFailed',
            'General cutout failed': 'tools.imageCloud.segmentFailed',
            'General cutout is not available (rembg not installed).': 'tools.generalCutout.notAvailable',
            'Tencent Cloud service is not enabled': 'tools.imageCloud.serviceNotEnabled',
            'Tencent Cloud account is in arrears': 'tools.imageCloud.accountArrears',
            'No text detected in image': 'tools.imageCloud.noText',
            'No images': 'tools.imageCloud.noImages',
            'Not Found': 'tools.imageCloud.routeNotFound',
            'DeepSeek is not configured (DEEPSEEK_API_KEY).': 'tools.lifePlans.deepseekMissing',
            'Please fill in the form fields': 'tools.lifePlans.needFields',
            'Invalid plan kind': 'tools.lifePlans.invalidKind',
            'Provide a city or temperature for outfit advice': 'tools.outfitPlan.needTemp',
            'Plan generation failed': 'tools.lifePlans.genFailed'
        };
        if (map[msg]) return tr(map[msg]);
        if (String(msg).indexOf('Insufficient balance') === 0 || String(msg).indexOf('Insufficient AI balance') === 0) {
            return tr('tools.imageCloud.insufficientBalance');
        }
        if (String(msg).indexOf('Plan generation failed') === 0) return tr('tools.lifePlans.genFailed');
        if (String(msg).indexOf('Structuring failed') === 0) return tr('tools.lifePlans.genFailed');
        if (String(msg).indexOf('OCR failed') === 0) return tr('tools.imageCloud.unknownError');
        return msg;
    }

    function detailFromData(data) {
        if (!data || data.detail == null) return '';
        if (typeof data.detail === 'string') return data.detail;
        if (Array.isArray(data.detail)) {
            return data.detail.map(function (x) { return x.msg || JSON.stringify(x); }).join('; ');
        }
        return String(data.detail);
    }

    function authFetch(path, options) {
        options = options || {};
        var headers = Object.assign({}, options.headers || {});
        var token = getToken();
        if (token) headers.Authorization = 'Bearer ' + token;
        options.headers = headers;
        return fetch(apiBase() + path, options).then(function (res) {
            // Only treat opaque gateway HTML 502 as site-wide outage; JSON 502 may be API detail.
            var ct = (res.headers && res.headers.get('content-type')) || '';
            if (res.status === 502 && ct.indexOf('application/json') === -1) {
                if (typeof global.check502Error === 'function') global.check502Error(res);
            }
            return res;
        });
    }

    function requireLogin(gateEl, appEl) {
        var token = getToken();
        if (!token) {
            if (gateEl) gateEl.hidden = false;
            if (appEl) appEl.hidden = true;
            return Promise.resolve(null);
        }
        return authFetch('/auth/me').then(function (res) {
            if (!res.ok) {
                global.localStorage.removeItem(TOKEN_KEY);
                if (gateEl) gateEl.hidden = false;
                if (appEl) appEl.hidden = true;
                return null;
            }
            if (gateEl) gateEl.hidden = true;
            if (appEl) appEl.hidden = false;
            return res.json();
        }).catch(function () {
            if (gateEl) gateEl.hidden = false;
            if (appEl) appEl.hidden = true;
            return null;
        });
    }

    function apiJson(path, options) {
        return authFetch(path, options).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) {
                    var err = new Error(translateDetail(detailFromData(data) || res.statusText, res.status));
                    err.status = res.status;
                    err.data = data;
                    throw err;
                }
                return data;
            });
        });
    }

    function apiBlob(path, options) {
        return authFetch(path, options).then(function (res) {
            if (!res.ok) {
                return res.json().catch(function () { return {}; }).then(function (data) {
                    var err = new Error(translateDetail(detailFromData(data) || res.statusText, res.status));
                    err.status = res.status;
                    throw err;
                });
            }
            return res.blob().then(function (blob) {
                return {
                    blob: blob,
                    remaining: res.headers.get('X-Quota-Remaining'),
                    limit: res.headers.get('X-Quota-Limit')
                };
            });
        });
    }

    function setError(el, msg) {
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('show', !!msg);
    }

    function formatQuotaItem(item) {
        if (!item) return '';
        if (item.unlimited) return tr('tools.imageCloud.quotaUnlimited');
        return tr('tools.imageCloud.quotaLine', {
            used: item.used,
            limit: item.limit,
            remaining: item.remaining
        });
    }

    function formatQuota(quotas, action) {
        var item = (quotas || []).find(function (q) { return q.action === action; });
        return formatQuotaItem(item);
    }

    function walletMarkup(wallet) {
        var m = wallet && wallet.markup != null ? Number(wallet.markup) : 2;
        return Number.isFinite(m) && m > 0 ? m : 2;
    }

    function formatWallet(wallet) {
        if (!wallet) return '';
        if (wallet.unlimited) return tr('tools.imageCloud.balanceUnlimited');
        var bal = wallet.balanceCny != null ? Number(wallet.balanceCny) : 0;
        if (!Number.isFinite(bal)) bal = 0;
        return tr('tools.imageCloud.balanceLine', {
            balance: bal.toFixed(2),
            gift: wallet.giftCny != null ? Number(wallet.giftCny) : 3,
            markup: walletMarkup(wallet)
        });
    }

    function b64ToObjectUrl(b64, contentType) {
        var bin = atob(b64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([arr], { type: contentType || 'image/png' }));
    }

    function b64ToDataUrl(b64, contentType) {
        return 'data:' + (contentType || 'image/png') + ';base64,' + String(b64 || '');
    }

    /** Prefer data URL in WeChat so long-press save/share works; blob elsewhere. */
    function displayImageSrc(b64, contentType) {
        if (isWeChat()) return b64ToDataUrl(b64, contentType);
        return b64ToObjectUrl(b64, contentType);
    }

    function isWeChat() {
        return /MicroMessenger/i.test(global.navigator.userAgent || '');
    }

    function isMobile() {
        return /Android|iPhone|iPad|iPod|Mobile/i.test(global.navigator.userAgent || '');
    }

    function blobFromSource(blobOrUrl) {
        if (!blobOrUrl) return Promise.reject(new Error('empty'));
        if (typeof Blob !== 'undefined' && blobOrUrl instanceof Blob) {
            return Promise.resolve(blobOrUrl);
        }
        if (typeof blobOrUrl === 'string') {
            return fetch(blobOrUrl).then(function (res) {
                if (!res.ok) throw new Error('fetch failed');
                return res.blob();
            });
        }
        return Promise.reject(new Error('unsupported'));
    }

    function closeSavePreview() {
        var el = document.getElementById('tb-img-save-preview');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function openSavePreview(src, message) {
        closeSavePreview();
        var wrap = document.createElement('div');
        wrap.id = 'tb-img-save-preview';
        wrap.className = 'tb-img-save-preview';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        var panel = document.createElement('div');
        panel.className = 'tb-img-save-preview-panel';
        var tip = document.createElement('p');
        tip.className = 'tb-img-save-preview-tip';
        tip.textContent = message || tr('tools.imageCloud.longPressSave');
        var img = document.createElement('img');
        img.src = src;
        img.alt = '';
        // Help WeChat recognize as image for long-press menu
        img.setAttribute('referrerpolicy', 'no-referrer');
        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'tb-btn';
        close.textContent = tr('tools.imageCloud.closePreview');
        close.addEventListener('click', closeSavePreview);
        wrap.addEventListener('click', function (e) {
            if (e.target === wrap) closeSavePreview();
        });
        panel.appendChild(tip);
        panel.appendChild(img);
        panel.appendChild(close);
        wrap.appendChild(panel);
        document.body.appendChild(wrap);
    }

    function notifySave(msg, tipEl, errorEl) {
        // Action feedback: modal popup (not embedded tip/error in the form).
        if (typeof global.tbNotify === 'function') {
            global.tbNotify(msg);
            return;
        }
        if (tipEl) {
            tipEl.hidden = false;
            tipEl.textContent = msg;
        }
        if (errorEl) setError(errorEl, msg);
    }

    /**
     * Save / share image with feedback.
     * opts: { tipEl, errorEl, title }
     * Returns Promise<boolean> — true if share/download started.
     */
    function downloadBlob(blobOrUrl, filename, tipElOrOpts) {
        var opts = tipElOrOpts && tipElOrOpts.nodeType ? { tipEl: tipElOrOpts } : (tipElOrOpts || {});
        var tipEl = opts.tipEl;
        var errorEl = opts.errorEl;
        var name = filename || 'image.png';

        return blobFromSource(blobOrUrl).then(function (blob) {
            var dataUrlPromise = new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(String(reader.result || '')); };
                reader.onerror = function () { reject(reader.error); };
                reader.readAsDataURL(blob);
            });

            // WeChat: no share sheet / no auto preview — tip only; preview is via image click.
            if (isWeChat()) {
                return dataUrlPromise.then(function () {
                    notifySave(tr('tools.imageCloud.wechatSaveTip'), tipEl, errorEl);
                    return false;
                });
            }

            // Phone/tablet only: system share sheet. Desktop Windows also has
            // navigator.share — that opens「共享」instead of saving, so skip it.
            if (
                isMobile()
                && global.navigator.share
                && global.navigator.canShare
                && typeof File !== 'undefined'
            ) {
                try {
                    var file = new File([blob], name, { type: blob.type || 'image/png' });
                    if (global.navigator.canShare({ files: [file] })) {
                        return global.navigator.share({
                            files: [file],
                            title: opts.title || name
                        }).then(function () {
                            if (errorEl) setError(errorEl, '');
                            return true;
                        }).catch(function (err) {
                            if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
                                return false;
                            }
                            return dataUrlPromise.then(function (dataUrl) {
                                return fallbackSave(dataUrl, blob, name, tipEl, errorEl);
                            });
                        });
                    }
                } catch (shareErr) { /* fall through */ }
            }

            return dataUrlPromise.then(function (dataUrl) {
                return fallbackSave(dataUrl, blob, name, tipEl, errorEl);
            });
        }).catch(function () {
            var msg = tr('tools.imageCloud.saveFailed');
            notifySave(msg, tipEl, errorEl);
            return false;
        });
    }

    function fallbackSave(dataUrl, blob, name, tipEl, errorEl) {
        if (typeof global.tbTriggerDownload === 'function') {
            var ok = global.tbTriggerDownload(blob, name);
            if (isWeChat()) return false;
            if (isMobile() && /iPhone|iPad|iPod/i.test(global.navigator.userAgent || '')) {
                notifySave(tr('tools.imageCloud.iosSaveTip'), tipEl, errorEl);
                return false;
            }
            if (errorEl) setError(errorEl, '');
            return !!ok;
        }

        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
            try { URL.revokeObjectURL(url); } catch (e) {}
        }, 2000);

        if (isMobile() && /iPhone|iPad|iPod/i.test(global.navigator.userAgent || '')) {
            notifySave(tr('tools.imageCloud.iosSaveTip'), tipEl, errorEl);
            return false;
        }

        if (errorEl) setError(errorEl, '');
        return true;
    }

    /** Bind tap-to-preview (long-press save/share works inside the preview). */
    function bindImagePreview(img, src) {
        if (!img) return;
        img.style.cursor = 'pointer';
        img.addEventListener('click', function () {
            openSavePreview(src || img.src, tr('tools.imageCloud.longPressSave'));
        });
    }

    function showWeChatBanner(el) {
        if (!el || !isWeChat()) return;
        el.hidden = false;
        el.textContent = tr('tools.imageCloud.wechatBanner');
    }

    function setBusy(busyEl, textEl, on, msg) {
        if (busyEl) {
            busyEl.hidden = !on;
            busyEl.setAttribute('aria-hidden', on ? 'false' : 'true');
        }
        if (textEl && msg != null) textEl.textContent = msg;
    }

    global.TBImageCloud = {
        tr: tr,
        apiBase: apiBase,
        getToken: getToken,
        loginUrl: loginUrl,
        requireLogin: requireLogin,
        apiJson: apiJson,
        apiBlob: apiBlob,
        authFetch: authFetch,
        setError: setError,
        setBusy: setBusy,
        formatQuota: formatQuota,
        formatQuotaItem: formatQuotaItem,
        formatWallet: formatWallet,
        walletMarkup: walletMarkup,
        b64ToObjectUrl: b64ToObjectUrl,
        b64ToDataUrl: b64ToDataUrl,
        displayImageSrc: displayImageSrc,
        isWeChat: isWeChat,
        downloadBlob: downloadBlob,
        openSavePreview: openSavePreview,
        bindImagePreview: bindImagePreview,
        showWeChatBanner: showWeChatBanner,
        translateDetail: translateDetail
    };
})(window);
