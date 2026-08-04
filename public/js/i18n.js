/**
 * Main-site i18n (toolbasecamp.com only — subdomains have their own i18n).
 * Usage: t('nav.tools'), data-i18n="guestbook.title" on HTML elements.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'tb-locale';
    var SUPPORTED = ['en', 'zh-CN'];
    // Detect immediately so scripts that call t() before DOMContentLoaded
    // (e.g. tool boot) already see the user's language — not the 'en' default.
    var currentLocale = detectLocaleEager();

    function detectLocaleEager() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
        } catch (e) { /* ignore */ }
        var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
        return nav.indexOf('zh') === 0 ? 'zh-CN' : 'en';
    }

    function detectLocale() {
        return detectLocaleEager();
    }

    function getMessages(locale) {
        var pack = window.TB_LOCALES && window.TB_LOCALES[locale];
        if (pack) return pack;
        return (window.TB_LOCALES && window.TB_LOCALES.en) || {};
    }

    function resolve(obj, key) {
        if (!obj || !key) return undefined;
        var parts = key.split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null) return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function format(str, params) {
        if (!params) return str;
        return String(str).replace(/\{(\w+)\}/g, function (_, k) {
            return params[k] != null ? String(params[k]) : '{' + k + '}';
        });
    }

    function t(key, params) {
        var val = resolve(getMessages(currentLocale), key);
        if (val == null) val = resolve(getMessages('en'), key);
        if (val == null) return key;
        return format(String(val), params);
    }

    function label(item) {
        if (!item) return '';
        if (item.nameKey) return t(item.nameKey);
        if (item.titleKey) return t(item.titleKey);
        if (item.descriptionKey) return t(item.descriptionKey);
        if (item.ctaKey) return t(item.ctaKey);
        return item.name || item.title || item.description || item.cta || '';
    }

    function syncLocaleCookie(locale) {
        try {
            document.cookie = 'tb-locale=' + encodeURIComponent(locale) +
                '; domain=.toolbasecamp.com; path=/; max-age=31536000; SameSite=Lax';
        } catch (e) { /* ignore */ }
    }

    function setLocale(locale) {
        if (SUPPORTED.indexOf(locale) === -1) return;
        currentLocale = locale;
        try { localStorage.setItem(STORAGE_KEY, locale); } catch (e) { /* ignore */ }
        syncLocaleCookie(locale);
        document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
        apply(document);
        updateLangSwitcher();
        document.dispatchEvent(new CustomEvent('tb:locale', { detail: { locale: locale } }));
    }

    function getLocale() {
        return currentLocale;
    }

    function apply(root) {
        root = root || document;
        root.querySelectorAll('[data-i18n]').forEach(function (el) {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
        });
        root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            el.title = t(el.getAttribute('data-i18n-title'));
        });
        root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });
        root.querySelectorAll('meta[data-i18n-content]').forEach(function (el) {
            el.content = t(el.getAttribute('data-i18n-content'));
        });
    }

    function updateLangSwitcher() {
        var wrap = document.getElementById('tb-lang-switcher');
        if (!wrap) return;
        wrap.querySelectorAll('[data-locale]').forEach(function (btn) {
            var active = btn.getAttribute('data-locale') === currentLocale;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function ensureHeaderUtils(headerRow) {
        var utils = document.getElementById('tb-header-utils');
        if (utils || !headerRow) return utils;

        utils = document.createElement('div');
        utils.id = 'tb-header-utils';

        var auth = headerRow.querySelector('#auth-status');
        var mobileSlot = headerRow.querySelector('#site-header-mobile-slot');
        if (auth) {
            headerRow.insertBefore(utils, auth);
        } else if (mobileSlot) {
            headerRow.insertBefore(utils, mobileSlot);
        } else {
            headerRow.appendChild(utils);
        }
        return utils;
    }

    function apiBase() {
        if (window.siteConfig && window.siteConfig.apiBase) {
            return window.siteConfig.apiBase;
        }
        var host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://127.0.0.1:8001';
        }
        return window.location.origin + '/api';
    }

    function getOrCreateVisitorId() {
        var key = 'tb-visitor-id';
        try {
            var existing = localStorage.getItem(key);
            if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing)) {
                return existing.toLowerCase();
            }
        } catch (e) { /* ignore */ }
        var id = '';
        try {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                id = window.crypto.randomUUID();
            }
        } catch (e2) { /* ignore */ }
        if (!id) {
            id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = (Math.random() * 16) | 0;
                var v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            });
        }
        try { localStorage.setItem(key, id); } catch (e3) { /* ignore */ }
        return id;
    }

    function fillSiteStats(data) {
        if (!data) return;
        var pv = document.getElementById('tb-stats-value-pv');
        var uv = document.getElementById('tb-stats-value-uv');
        if (pv && data.site_pv != null) pv.textContent = String(data.site_pv);
        if (uv && data.site_uv != null) uv.textContent = String(data.site_uv);
        if (data.visitor_id) {
            try { localStorage.setItem('tb-visitor-id', data.visitor_id); } catch (e) { /* ignore */ }
        }
    }

    function loadSiteStats() {
        var visitorId = getOrCreateVisitorId();
        var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        try {
            var token = localStorage.getItem('auth_token') || '';
            if (token) headers.Authorization = 'Bearer ' + token;
        } catch (e) { /* ignore */ }
        fetch(apiBase() + '/stats/hit', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ visitor_id: visitorId }),
            credentials: 'same-origin',
            cache: 'no-store'
        })
            .then(function (res) {
                if (!res.ok) throw new Error('stats ' + res.status);
                return res.json();
            })
            .then(fillSiteStats)
            .catch(function () {
                fetch(apiBase() + '/stats', { credentials: 'same-origin', cache: 'no-store' })
                    .then(function (res) { return res.ok ? res.json() : null; })
                    .then(fillSiteStats)
                    .catch(function () { /* keep placeholder */ });
            });
    }

    function injectSiteStats() {
        if (document.getElementById('tb-site-stats')) return;
        var headerRow = document.querySelector('header .max-w-7xl');
        if (!headerRow) return;

        var utils = ensureHeaderUtils(headerRow);
        if (!utils) return;

        var stats = document.createElement('div');
        stats.id = 'tb-site-stats';
        stats.setAttribute('aria-label', t('stats.sitePv') + ', ' + t('stats.siteUv'));
        stats.innerHTML =
            '<span id="tb-stats-pv">' +
                '<span data-i18n="stats.sitePv">' + t('stats.sitePv') + '</span> ' +
                '<span id="tb-stats-value-pv" class="tb-stats-num">...</span>' +
            '</span>' +
            '<span class="tb-stats-sep" aria-hidden="true"></span>' +
            '<span id="tb-stats-uv">' +
                '<span data-i18n="stats.siteUv">' + t('stats.siteUv') + '</span> ' +
                '<span id="tb-stats-value-uv" class="tb-stats-num">...</span>' +
            '</span>';

        utils.insertBefore(stats, utils.firstChild);
        loadSiteStats();
    }

    function injectLangSwitcher() {
        if (document.getElementById('tb-lang-switcher')) return;
        var headerRow = document.querySelector('header .max-w-7xl');
        if (!headerRow) return;

        var utils = ensureHeaderUtils(headerRow);
        if (!utils) return;

        injectSiteStats();

        var wrap = document.createElement('div');
        wrap.id = 'tb-lang-switcher';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', t('lang.switcher'));
        wrap.innerHTML =
            '<button type="button" data-locale="zh-CN" class="tb-lang-btn">' + t('lang.zh') + '</button>' +
            '<span class="tb-lang-sep">/</span>' +
            '<button type="button" data-locale="en" class="tb-lang-btn">' + t('lang.en') + '</button>';

        wrap.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-locale]');
            if (!btn) return;
            setLocale(btn.getAttribute('data-locale'));
        });

        utils.appendChild(wrap);
        updateLangSwitcher();
    }

    function init() {
        currentLocale = detectLocale();
        syncLocaleCookie(currentLocale);
        document.documentElement.lang = currentLocale === 'zh-CN' ? 'zh-CN' : 'en';
        apply(document);
        injectLangSwitcher();
    }

    window.t = t;
    window.tbLabel = label;
    window.tbSetLocale = setLocale;
    window.tbGetLocale = getLocale;
    window.tbApplyI18n = apply;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
