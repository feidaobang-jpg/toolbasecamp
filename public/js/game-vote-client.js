/**
 * 游戏投票共用客户端：API 地址、本机投票身份（device_id）、游戏中文名解析。
 * 供 games-vote-board.js（游戏页顶部榜单）与 game-vote.js（独立投票页）复用。
 */
(function (global) {
    'use strict';

    var DEVICE_KEY = 'game_vote_device';

    function apiBase() {
        if (typeof siteConfig !== 'undefined' && siteConfig.apiBase) {
            return String(siteConfig.apiBase).replace(/\/$/, '');
        }
        return '/api';
    }

    function tr(k) {
        return typeof window.t === 'function' ? window.t(k) : k;
    }

    function randomHex(len) {
        var out = '';
        try {
            var buf = new Uint8Array(len / 2);
            (global.crypto || global.msCrypto).getRandomValues(buf);
            for (var i = 0; i < buf.length; i++) {
                out += (buf[i] + 256).toString(16).slice(1);
            }
            return out;
        } catch (e) {
            for (var j = 0; j < len; j++) {
                out += Math.floor(Math.random() * 16).toString(16);
            }
            return out;
        }
    }

    /** 本机投票身份：只存 localStorage，不含姓名/手机号，删掉即视为新投票人。 */
    function deviceId() {
        var stored = '';
        try {
            stored = global.localStorage.getItem(DEVICE_KEY) || '';
        } catch (e) { /* 隐私模式读不到就走兜底 */ }
        if (/^[0-9a-f]{16,32}$/i.test(stored)) return stored.toLowerCase();
        var fresh = randomHex(24);
        try {
            global.localStorage.setItem(DEVICE_KEY, fresh);
        } catch (e) { /* 存不下也能投票，只是刷新后算新设备 */ }
        return fresh;
    }

    function authToken() {
        try {
            return global.localStorage.getItem('auth_token') || '';
        } catch (e) {
            return '';
        }
    }

    function request(path, opts) {
        var options = opts || {};
        var headers = { Accept: 'application/json' };
        if (options.json !== undefined) headers['Content-Type'] = 'application/json';
        if (options.token && authToken()) headers.Authorization = 'Bearer ' + authToken();
        return fetch(apiBase() + path, {
            method: options.method || 'GET',
            headers: headers,
            body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
            cache: 'no-store',
            credentials: 'omit'
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) {
                    var err = new Error(data && data.detail ? data.detail : 'request failed');
                    err.status = res.status;
                    err.detail = (data && data.detail) || '';
                    throw err;
                }
                return data;
            });
        });
    }

    /** 自研游戏中文名：优先 locales 的 titleKey，退化到 gamesConfig 里的标题。 */
    function gameName(opt) {
        if (!opt) return '';
        if (opt.titleKey && typeof window.t === 'function') {
            var label = window.t(opt.titleKey);
            if (label && label !== opt.titleKey) return label;
        }
        if (opt.name) return opt.name;
        var groups = (typeof gamesConfig !== 'undefined' && gamesConfig.groups) || [];
        for (var i = 0; i < groups.length; i++) {
            var items = groups[i].items || [];
            for (var j = 0; j < items.length; j++) {
                var url = String(items[j].url || '');
                if (opt.url && url.indexOf(opt.url) === 0) {
                    return items[j].titleKey ? tr(items[j].titleKey) : (items[j].title || opt.key);
                }
            }
        }
        return opt.key || '';
    }

    function gameUrl(opt) {
        if (!opt || !opt.url) return '';
        return opt.url.indexOf('?') === -1 ? opt.url + '?v=1' : opt.url;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function wishProgressHtml(item) {
        if (!item || item.progress !== 'fulfilled') return '';
        var html = '<span class="gv-progress">' + escapeHtml(tr('gameVote.fulfilledBadge')) + '</span>';
        if (item.gameName) html += '<span class="gv-note">' + escapeHtml(item.gameName) + '</span>';
        if (item.releaseNote) html += '<span class="gv-note">' + escapeHtml(item.releaseNote) + '</span>';
        var links = '';
        [['playUrl', 'gameVote.playWish'], ['toyUrl', 'gameVote.toyWish'], ['videoUrl', 'gameVote.videoWish']].forEach(function (pair) {
            if (!item[pair[0]]) return;
            try {
                var url = new URL(item[pair[0]], global.location.href);
                if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
                links += '<a class="tb-btn" href="' + escapeHtml(url.href) + '">' + escapeHtml(tr(pair[1])) + '</a>';
            } catch (e) { /* 无效地址不生成入口 */ }
        });
        return html + (links ? '<span class="action-row gv-progress-links">' + links + '</span>' : '');
    }

    global.TBGameVote = {
        apiBase: apiBase,
        deviceId: deviceId,
        request: request,
        gameName: gameName,
        gameUrl: gameUrl,
        escapeHtml: escapeHtml,
        wishProgressHtml: wishProgressHtml,
        getBoard: function (page, sort, progress) {
            return request('/game-votes/board?limit=20&offset=' + (Math.max(0, (Number(page) || 1) - 1) * 20) +
                '&sort=' + encodeURIComponent(sort || 'votes') + '&progress=' + encodeURIComponent(progress || 'pending'));
        },
        getOptions: function () { return request('/game-votes/options'); },
        getMyVotes: function () {
            return request('/game-votes/my-votes?device_id=' + encodeURIComponent(deviceId()));
        },
        vote: function (voteType, target) {
            return request('/game-votes/vote', {
                method: 'POST',
                json: { device_id: deviceId(), vote_type: voteType, target: target }
            });
        },
        unvote: function (voteType, target) {
            return request('/game-votes/unvote', {
                method: 'POST',
                json: { device_id: deviceId(), vote_type: voteType, target: target }
            });
        },
        submitWish: function (name, note) {
            return request('/game-votes/wish', {
                method: 'POST',
                json: { device_id: deviceId(), name: name, note: note }
            });
        },
        adminWishes: function () {
            return request('/game-votes/admin/wishes', { token: true });
        },
        adminSetStatus: function (wishId, status) {
            return request('/game-votes/admin/wish/status', {
                method: 'POST',
                token: true,
                json: { wish_id: wishId, status: status }
            });
        }
    };
})(window);
