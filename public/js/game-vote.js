/** 独立投票页：最爱玩哪个 + 愿望单想玩哪个，匿名 device 限票、可改票。 */
(function (global) {
    'use strict';

    var V = null;
    var state = {
        options: null,
        board: null,
        mine: null,
        busy: false,
        adminItems: null,
        showHidden: false
    };

    function tr(k) {
        return typeof window.t === 'function' ? window.t(k) : k;
    }

    function esc(s) {
        return V ? V.escapeHtml(s) : String(s || '');
    }

    function el(id) {
        return document.getElementById(id);
    }

    function say(msg, kind) {
        var box = el('gv-msg');
        if (!box) return;
        box.textContent = msg || '';
        box.className = 'gv-msg' + (msg ? ' gv-msg--' + (kind || 'info') : '');
    }

    function votesMeta(row) {
        return '<span class="gv-meta">' + (row.votes || 0) + ' ' + esc(tr('gameVote.voteSuffix')) +
            '<i class="gv-week">' + esc(tr('gameVote.rankWeekSuffix')) + ' +' + (row.weekVotes || 0) + '</i>' +
        '</span>';
    }

    function votedSet(type) {
        if (!state.mine) return {};
        var map = {};
        (state.mine[type] || []).forEach(function (k) { map[k] = true; });
        return map;
    }

    function refreshCounts() {
        var totals = (state.board && state.board.totals) || {};
        var box = el('gv-totals');
        if (box) {
            box.innerHTML = esc(tr('gameVote.totalLabel')) + ' <b>' + (totals.votes || 0) + '</b> ' +
                esc(tr('gameVote.totalVotesSuffix')) + ' <b>' + (totals.voters || 0) + '</b> ' +
                esc(tr('gameVote.totalVotersSuffix')) + ' <b>' + (totals.wishes || 0) + '</b> ' +
                esc(tr('gameVote.totalWishesSuffix'));
        }
        var rem = el('gv-remaining');
        if (rem && state.mine && state.options) {
            var lim = state.options.limits || {};
            var left = state.mine.remaining || {};
            var unit = esc(tr('gameVote.remainingVoteUnit'));
            rem.innerHTML =
                '<span>' + esc(tr('gameVote.remainingFavorite')) + esc(tr('gameVote.remainingLabel')) +
                    ' <b>' + (left.favorite != null ? left.favorite : lim.favorite) + '</b>' + unit + '</span>' +
                '<span>' + esc(tr('gameVote.remainingWish')) + esc(tr('gameVote.remainingLabel')) +
                    ' <b>' + (left.wishlist != null ? left.wishlist : lim.wishlist) + '</b>' + unit + '</span>' +
                '<span>' + esc(tr('gameVote.remainingSubmit')) +
                    ' <b>' + (left.wishSubmit != null ? left.wishSubmit : lim.wishSubmit) + '</b></span>';
        }
    }

    function voteButton(targetKey, voteType, votes) {
        var voted = !!votedSet(voteType)[targetKey];
        var label = voted ? tr('gameVote.undoBtn') : tr('gameVote.voteBtn');
        return '<button type="button" class="tb-btn gv-vote-btn' + (voted ? ' is-voted' : '') +
            '" data-vote-type="' + voteType + '" data-target="' + esc(targetKey) + '">' +
            '<i class="fas ' + (voted ? 'fa-check' : 'fa-heart') + '"></i> ' + esc(label) + '</button>';
    }

    function renderFavorite() {
        var box = el('gv-favorite');
        if (!box || !state.options) return;
        var boardVotes = {};
        ((state.board && state.board.favorite) || []).forEach(function (f) { boardVotes[f.key] = f; });
        // 没票的游戏也列出来，新玩家才投得出第一票
        var html = '';
        state.options.favorites.forEach(function (opt) {
            var row = boardVotes[opt.key] || { votes: 0, weekVotes: 0 };
            html += '<li class="gv-row">' +
                '<span class="gv-row-main">' +
                    '<a class="gv-link" href="' + esc(V.gameUrl(opt)) + '">' + esc(V.gameName(opt)) + '</a>' +
                    votesMeta(row) +
                '</span>' +
                voteButton(opt.key, 'favorite', row.votes) +
            '</li>';
        });
        box.innerHTML = html;
    }

    function renderWishlist() {
        var box = el('gv-wishlist');
        if (!box) return;
        var items = (state.board && state.board.wishlist) || [];
        if (!items.length) {
            box.innerHTML = '<li class="gv-empty">' + esc(tr('gameVote.emptyBoard')) + '</li>';
            return;
        }
        var html = '';
        items.forEach(function (item, index) {
            var mine = !!(state.mine && state.mine.myWishes || []).includes(item.id);
            html += '<li class="gv-row">' +
                '<span class="gv-rank">' + (index + 1) + '</span>' +
                '<span class="gv-row-main">' +
                    '<span class="gv-name">' + esc(item.name) +
                        (mine ? '<i class="gv-mine">' + esc(tr('gameVote.mySubmittedLabel')) + '</i>' : '') +
                    '</span>' +
                    (item.note ? '<span class="gv-note">' + esc(item.note) + '</span>' : '') +
                    votesMeta(item) +
                '</span>' +
                voteButton(item.key, 'wishlist', item.votes) +
            '</li>';
        });
        box.innerHTML = html;
    }

    function renderAll() {
        renderFavorite();
        renderWishlist();
        refreshCounts();
    }

    function loadAll() {
        if (!V) return;
        var pending = [V.getOptions(), V.getBoard(), V.getMyVotes()];
        return Promise.all(pending).then(function (res) {
            state.options = res[0];
            state.board = res[1];
            state.mine = res[2];
            renderAll();
            tryLoadAdmin();
        }).catch(function (err) {
            say(tr('gameVote.loadFail') + (err && err.detail ? '（' + err.detail + '）' : ''), 'error');
        });
    }

    function onVoteClick(evt) {
        var btn = evt.target && evt.target.closest ? evt.target.closest('.gv-vote-btn') : null;
        if (!btn || state.busy) return;
        var voteType = btn.dataset.voteType;
        var target = btn.dataset.target;
        var voted = !!votedSet(voteType)[target];
        state.busy = true;
        btn.disabled = true;
        var call = voted ? V.unvote(voteType, target) : V.vote(voteType, target);
        call.then(function () {
            return Promise.all([V.getBoard(), V.getMyVotes()]);
        }).then(function (res) {
            state.board = res[0];
            state.mine = res[1];
            renderAll();
            say('', 'info');
        }).catch(function (err) {
            if (err && /too many|limit/i.test(String(err.detail || ''))) {
                say(tr('gameVote.voteFailLimit'), 'error');
            } else {
                say(tr('gameVote.voteFail'), 'error');
            }
        }).finally(function () {
            state.busy = false;
            btn.disabled = false;
        });
    }

    function onSubmitWish(evt) {
        evt.preventDefault();
        if (state.busy) return;
        var nameInput = el('gv-wish-name');
        var noteInput = el('gv-wish-note');
        var name = (nameInput && nameInput.value || '').trim();
        var note = (noteInput && noteInput.value || '').trim();
        if (name.length < 2) {
            say(tr('gameVote.wishFailShort'), 'error');
            return;
        }
        state.busy = true;
        V.submitWish(name, note).then(function () {
            if (nameInput) nameInput.value = '';
            if (noteInput) noteInput.value = '';
            say(tr('gameVote.wishOk'), 'ok');
            return Promise.all([V.getBoard(), V.getMyVotes()]);
        }).then(function (res) {
            state.board = res[0];
            state.mine = res[1];
            renderAll();
        }).catch(function (err) {
            say(tr('gameVote.wishFail') + (err && err.detail ? '（' + err.detail + '）' : ''), 'error');
        }).finally(function () {
            state.busy = false;
        });
    }

    function tryLoadAdmin() {
        var panel = el('gv-admin');
        if (!panel || !V) return;
        V.adminWishes().then(function (data) {
            state.adminItems = data.items || [];
            panel.hidden = false;
            renderAdmin();
        }).catch(function () {
            panel.hidden = true;  // 非管理员不显示
        });
    }

    function renderAdmin() {
        var box = el('gv-admin-list');
        if (!box) return;
        var items = (state.adminItems || []).filter(function (it) {
            return state.showHidden || Number(it.status) === 1;
        });
        if (!items.length) {
            box.innerHTML = '<li class="gv-empty">' + esc(tr('gameVote.adminEmpty')) + '</li>';
            return;
        }
        box.innerHTML = items.map(function (it) {
            var toggleLabel = Number(it.status) === 1 ? tr('gameVote.adminHide') : tr('gameVote.adminRestore');
            return '<li class="gv-row">' +
                '<span class="gv-row-main">' +
                    '<span class="gv-name">' + esc(it.name) + '</span>' +
                    '<span class="gv-meta">' + it.votes + ' · ' + esc(it.createdAt) +
                        (Number(it.status) === 1 ? '' : ' · hidden') + '</span>' +
                '</span>' +
                '<button type="button" class="tb-btn gv-admin-btn" data-wish-id="' + it.id +
                    '" data-status="' + (Number(it.status) === 1 ? 0 : 1) + '">' + esc(toggleLabel) + '</button>' +
            '</li>';
        }).join('');
    }

    function onAdminClick(evt) {
        var btn = evt.target && evt.target.closest ? evt.target.closest('.gv-admin-btn') : null;
        if (!btn) return;
        V.adminSetStatus(Number(btn.dataset.wishId), Number(btn.dataset.status))
            .then(function () { return V.adminWishes(); })
            .then(function (data) {
                state.adminItems = data.items || [];
                renderAdmin();
            })
            .catch(function () { say(tr('gameVote.voteFail'), 'error'); });
    }

    function bind() {
        var wrap = el('gv-boards');
        if (wrap) wrap.addEventListener('click', onVoteClick);
        var admin = el('gv-admin-list');
        if (admin) admin.addEventListener('click', onAdminClick);
        var form = el('gv-wish-form');
        if (form) form.addEventListener('submit', onSubmitWish);
        var toggle = el('gv-admin-toggle-hidden');
        if (toggle) toggle.addEventListener('change', function () {
            state.showHidden = toggle.checked;
            renderAdmin();
        });
        var refresh = el('gv-refresh');
        if (refresh) refresh.addEventListener('click', loadAll);
    }

    function init() {
        V = global.TBGameVote;
        if (!V) return;
        bind();
        loadAll();
    }

    global.renderGameVote = init;

    document.addEventListener('tb:locale', function () {
        if (state.options) renderAll();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
