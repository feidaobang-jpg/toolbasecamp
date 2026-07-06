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

    function setLocale(locale) {
        if (SUPPORTED.indexOf(locale) === -1) return;
        currentLocale = locale;
        try { localStorage.setItem(STORAGE_KEY, locale); } catch (e) { /* ignore */ }
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

    function injectLangSwitcher() {
        if (document.getElementById('tb-lang-switcher')) return;
        var headerRow = document.querySelector('header .max-w-7xl');
        if (!headerRow) return;

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

        var mobileSlot = headerRow.querySelector('#site-header-mobile-slot');
        var auth = headerRow.querySelector('#auth-status');
        if (auth) {
            headerRow.insertBefore(wrap, auth);
        } else if (mobileSlot) {
            headerRow.insertBefore(wrap, mobileSlot);
        } else {
            headerRow.appendChild(wrap);
        }
        updateLangSwitcher();
    }

    function init() {
        currentLocale = detectLocale();
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
