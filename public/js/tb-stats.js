/**
 * Lightweight anonymous feature / page event tracker.
 * Usage: TBStats.track('tool.record.card-score'); or data-tb-track="..."
 * Skips when localStorage tb-stats-exclude=1 (set for admin sessions).
 */
(function () {
    'use strict';

    var ENDPOINT = '/stats/event';
    var EXCLUDE_KEY = 'tb-stats-exclude';
    var TOKEN_KEY = 'auth_token';
    var queued = {};
    var flushTimer = null;
    var pageTracked = false;

    function apiBase() {
        if (window.siteConfig && window.siteConfig.apiBase) return window.siteConfig.apiBase;
        var host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:8001';
        return window.location.origin + '/api';
    }

    function shouldExclude() {
        try {
            return localStorage.getItem(EXCLUDE_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function authHeaders() {
        var headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        try {
            var token = localStorage.getItem(TOKEN_KEY) || '';
            if (token) headers.Authorization = 'Bearer ' + token;
        } catch (e) { /* ignore */ }
        return headers;
    }

    function normalizeName(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 96);
    }

    function sendOne(name) {
        if (shouldExclude()) return;
        try {
            fetch(apiBase() + ENDPOINT, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ name: name }),
                credentials: 'same-origin',
                cache: 'no-store',
                keepalive: true
            }).catch(function () { /* ignore */ });
        } catch (e) { /* ignore */ }
    }

    function flush() {
        flushTimer = null;
        Object.keys(queued).forEach(function (name) {
            var n = queued[name];
            delete queued[name];
            while (n-- > 0) sendOne(name);
        });
    }

    function track(name) {
        if (shouldExclude()) return;
        var key = normalizeName(name);
        if (!key || key.length < 2) return;
        if (!/^[a-z][a-z0-9._-]{1,95}$/.test(key)) return;
        queued[key] = (queued[key] || 0) + 1;
        if (!flushTimer) flushTimer = setTimeout(flush, 40);
    }

    function pathToEvent() {
        var path = (window.location.pathname || '/').replace(/\\/g, '/');
        var file = path.split('/').pop() || '';
        file = file.split('?')[0].replace(/\.html$/i, '');

        if (!file || file === 'index') return 'page.home';
        if (file === 'life') return 'page.life';
        if (file === 'games') return 'page.games';
        if (file === 'guestbook') return 'page.guestbook';
        if (file === 'about') return 'page.about';
        if (path.indexOf('/html/admin/') !== -1) return '';

        var m = path.match(/\/html\/([^/]+)\/([^/]+?)(?:\.html)?$/i);
        if (m) {
            var group = m[1].toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
            var tool = m[2].toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
            return 'tool.' + group + '.' + tool;
        }
        return 'page.' + file.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    }

    function trackPage() {
        if (pageTracked || shouldExclude()) return;
        var ev = pathToEvent();
        if (!ev) return;
        pageTracked = true;
        track(ev);
    }

    function bindDataTrack() {
        document.addEventListener('click', function (e) {
            var el = e.target && e.target.closest ? e.target.closest('[data-tb-track]') : null;
            if (!el) return;
            var name = el.getAttribute('data-tb-track');
            if (name) track(name);
        }, true);
    }

    function setExclude(on) {
        try {
            if (on) localStorage.setItem(EXCLUDE_KEY, '1');
            else localStorage.removeItem(EXCLUDE_KEY);
        } catch (e) { /* ignore */ }
    }

    function init() {
        bindDataTrack();
        trackPage();
    }

    window.TBStats = {
        track: track,
        trackPage: trackPage,
        setExclude: setExclude,
        shouldExclude: shouldExclude
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
