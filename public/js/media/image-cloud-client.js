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
            'Tencent Cloud is not configured (TENCENT_SECRET_ID / TENCENT_SECRET_KEY).': 'tools.imageCloud.notConfigured',
            'DashScope is not configured (DASHSCOPE_API_KEY).': 'tools.imageToAnimation.notConfigured',
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
            'Tencent Cloud service is not enabled': 'tools.imageCloud.serviceNotEnabled',
            'Tencent Cloud account is in arrears': 'tools.imageCloud.accountArrears',
            'No text detected in image': 'tools.imageCloud.noText',
            'No images': 'tools.imageCloud.noImages'
        };
        if (map[msg]) return tr(map[msg]);
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

    function b64ToObjectUrl(b64, contentType) {
        var bin = atob(b64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([arr], { type: contentType || 'image/png' }));
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
        b64ToObjectUrl: b64ToObjectUrl,
        translateDetail: translateDetail
    };
})(window);
