/**
 * Main-site i18n (toolbasecamp.com only — subdomains have their own i18n).
 * Usage: t('nav.tools'), data-i18n="guestbook.title" on HTML elements.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'tb-locale';
    var SUPPORTED = ['en', 'zh-CN'];
    var currentLocale = 'en';

    function detectLocale() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
        } catch (e) { /* ignore */ }
        var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
        return nav.indexOf('zh') === 0 ? 'zh-CN' : 'en';
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

    function loadBusuanziScript() {
        if (document.getElementById('busuanzi-script')) return;
        var script = document.createElement('script');
        script.id = 'busuanzi-script';
        script.async = true;
        script.src = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
        document.body.appendChild(script);
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
            '<span id="busuanzi_container_site_pv">' +
                '<span data-i18n="stats.sitePv">' + t('stats.sitePv') + '</span> ' +
                '<span id="busuanzi_value_site_pv" class="tb-stats-num">...</span>' +
            '</span>' +
            '<span class="tb-stats-sep" aria-hidden="true"></span>' +
            '<span id="busuanzi_container_site_uv">' +
                '<span data-i18n="stats.siteUv">' + t('stats.siteUv') + '</span> ' +
                '<span id="busuanzi_value_site_uv" class="tb-stats-num">...</span>' +
            '</span>';

        utils.insertBefore(stats, utils.firstChild);
        loadBusuanziScript();
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
