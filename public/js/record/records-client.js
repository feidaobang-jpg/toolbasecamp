/**
 * Shared client for /records/* tools (auth required).
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
        // auth.js only accepts same-origin path starting with "/"
        var next = (global.location.pathname || '/') + (global.location.search || '');
        return '../auth/login.html?next=' + encodeURIComponent(next);
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function formatTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso).slice(0, 19).replace('T', ' ');
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        var h = String(d.getHours()).padStart(2, '0');
        var min = String(d.getMinutes()).padStart(2, '0');
        return y + '-' + m + '-' + day + ' ' + h + ':' + min;
    }

    function translateDetail(msg) {
        if (!msg) return tr('tools.records.unknownError');
        if (String(msg).indexOf('Failed to fetch') !== -1 || String(msg).indexOf('NetworkError') !== -1) {
            return tr('tools.records.networkError');
        }
        var map = {
            'Authentication required': 'auth.authRequired',
            'Session expired. Please log in again.': 'auth.sessionExpired',
            'User not found': 'auth.userNotFound',
            'Guestbook service is temporarily unavailable. Please try again later.': 'tools.records.serviceUnavailable',
            'Not found': 'tools.records.notFound',
            'Invalid name': 'tools.records.invalidName',
            'Invalid date': 'tools.records.invalidDate',
            'Invalid calendar type': 'tools.importantDays.invalidLunar',
            'Invalid lunar date': 'tools.importantDays.invalidLunar',
            'Invalid type': 'tools.records.invalidType',
            'Invalid amount': 'tools.records.invalidAmount',
            'Invalid price': 'tools.records.invalidPrice',
            'Invalid rating': 'tools.records.invalidRating',
            'amount must be greater than 0': 'tools.records.amountPositive',
            'price must be greater than 0': 'tools.records.amountPositive',
            'Insufficient balance': 'tools.records.insufficientBalance',
            'Name already exists': 'tools.records.nameExists',
            'Target already reached': 'tools.records.targetReached',
            'Category not found': 'tools.records.categoryNotFound',
            'Parent category not found': 'tools.records.parentNotFound',
            'Only one level of nesting is allowed': 'tools.records.nestingLimit',
            'Category is in use': 'tools.records.categoryInUse',
            'Category has children': 'tools.records.categoryHasChildren',
            'Remark too long': 'tools.records.remarkTooLong',
            'Rating must be between 0 and 5': 'tools.records.ratingRange',
            'Rating must be an integer from 0 to 5': 'tools.records.ratingRange',
            'Invalid text': 'tools.todoList.emptyText',
            'Invalid title': 'tools.rent.needTitle',
            'Invalid due_day': 'tools.rent.invalidDueDay',
            'due_day must be 1–31': 'tools.rent.invalidDueDay',
            'due_day must be 1–28': 'tools.rent.invalidDueDay',
            'Invalid period (use YYYY-MM)': 'tools.rent.needPeriod',
            'Payment for this period already exists': 'tools.rent.periodExists',
            'note too long': 'tools.records.remarkTooLong',
            'rent_amount must be greater than 0': 'tools.records.amountPositive',
            'Invalid rent_amount': 'tools.records.invalidAmount',
            'Invalid tenant_name': 'tools.rent.invalidTenant',
            'Invalid status': 'tools.todoList.invalidStatus'
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
        if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        options.headers = headers;
        return fetch(apiBase() + path, options).then(function (res) {
            if (typeof global.check502Error === 'function') global.check502Error(res);
            return res;
        });
    }

    function apiJson(path, options) {
        return authFetch(path, options).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) {
                    var err = new Error(translateDetail(detailFromData(data) || res.statusText));
                    err.status = res.status;
                    err.data = data;
                    throw err;
                }
                return data;
            });
        });
    }

    function requireLogin(gateEl, contentEl) {
        return authFetch('/auth/me').then(function (res) {
            if (res.status === 401 || res.status === 403) {
                if (gateEl) gateEl.hidden = false;
                if (contentEl) contentEl.hidden = true;
                return null;
            }
            return res.json().then(function (user) {
                if (gateEl) gateEl.hidden = true;
                if (contentEl) contentEl.hidden = false;
                return user;
            });
        }).catch(function () {
            if (gateEl) gateEl.hidden = false;
            if (contentEl) contentEl.hidden = true;
            return null;
        });
    }

    function setError(el, msg) {
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('show', !!msg);
    }

    function confirmDelete(message) {
        return global.confirm(message);
    }

    global.TBRecords = {
        tr: tr,
        apiBase: apiBase,
        getToken: getToken,
        loginUrl: loginUrl,
        escapeHtml: escapeHtml,
        formatTime: formatTime,
        translateDetail: translateDetail,
        authFetch: authFetch,
        apiJson: apiJson,
        requireLogin: requireLogin,
        setError: setError,
        confirmDelete: confirmDelete
    };
})(window);
