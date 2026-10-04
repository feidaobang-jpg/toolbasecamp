/** 游戏页顶部投票榜卡：热度榜 + 愿望单前若干名，引导去独立投票页。 */
(function (global) {
    'use strict';

    var TOP_N = 5;

    function tr(k) {
        return typeof window.t === 'function' ? window.t(k) : k;
    }

    function esc(s) {
        return (global.TBGameVote && global.TBGameVote.escapeHtml)
            ? global.TBGameVote.escapeHtml(s)
            : String(s || '').replace(/[&<>"]/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
            });
    }

    function rankRows(items, renderer, limit) {
        if (!items || !items.length) {
            return '<li class="gvb-empty">' + esc(tr('gameVote.emptyBoard')) + '</li>';
        }
        var html = '';
        items.slice(0, limit == null ? TOP_N : limit).forEach(function (item, index) {
            html += '<li class="gvb-row">' +
                '<span class="gvb-rank gvb-rank--' + (index + 1) + '">' + (index + 1) + '</span>' +
                renderer(item) +
                '<span class="gvb-votes"' +
                    (item.weekVotes ? ' title="本周新增 ' + item.weekVotes + ' 票"' : '') + '>' +
                    item.votes +
                    // 总数与周增一样时 +n 只是重复，仅在有历史票时才显示
                    (item.weekVotes && item.weekVotes < item.votes ? '<i class="gvb-week">+' + item.weekVotes + '</i>' : '') +
                '</span>' +
            '</li>';
        });
        return html;
    }

    function renderBoard(el, board, options) {
        var V = global.TBGameVote;
        var favMap = {};
        (board.favorite || []).forEach(function (f) { favMap[f.key] = f; });

        var favorites = (options.favorites || []).map(function (option) {
            return Object.assign({}, option, favMap[option.key] || { votes: 0, weekVotes: 0 });
        }).sort(function (a, b) {
            return b.votes - a.votes || b.weekVotes - a.weekVotes;
        });
        var favHtml = rankRows(favorites, function (item) {
            var name = V.gameName(item);
            var url = V.gameUrl(item);
            var inner = '<span class="gvb-name">' + esc(name) + '</span>';
            // 名字与愿望备注各占一行，长备注才不会把票数挤出榜单卡
            return '<span class="gvb-row-main">' +
                (url ? '<a class="gvb-link" href="' + esc(url) + '">' + inner + '</a>' : inner) +
            '</span>';
        }, favorites.length);

        var wishHtml = rankRows(board.wishlist, function (item) {
            // 整行可点，跳去投票页看完整愿望详情
            return '<a class="gvb-link gvb-row-main" href="game-vote.html">' +
                '<span class="gvb-name">' + esc(item.name) + '</span>' +
                (item.note ? '<span class="gvb-note">' + esc(item.note) + '</span>' : '') +
            '</a>';
        });

        var totals = board.totals || {};
        el.className = 'gvb';
        el.innerHTML =
            '<div class="gvb-head">' +
                '<h2 class="gvb-title">' + esc(tr('gameVote.boardCardTitle')) + '</h2>' +
                '<p class="gvb-total">' + esc(tr('gameVote.totalLabel')) + ' ' +
                    (totals.votes || 0) + ' ' + esc(tr('gameVote.totalVotesSuffix')) + ' ' +
                    (totals.voters || 0) + ' ' + esc(tr('gameVote.totalVotersSuffix')) + ' ' +
                    (totals.wishes || 0) + ' ' + esc(tr('gameVote.totalWishesSuffix')) +
                '</p>' +
                '<a class="tb-btn gvb-cta" href="game-vote.html">' + esc(tr('games.voteCta')) + '</a>' +
            '</div>' +
            '<div class="gvb-cols">' +
                '<section class="gvb-col">' +
                    '<h3 class="gvb-col-title">' + esc(tr('gameVote.boardTitle')) + '</h3>' +
                    '<ol class="gvb-list">' + favHtml + '</ol>' +
                '</section>' +
                '<section class="gvb-col">' +
                    '<h3 class="gvb-col-title">' + esc(tr('gameVote.wishBoardTitle')) + '</h3>' +
                    '<ol class="gvb-list">' + wishHtml + '</ol>' +
                '</section>' +
            '</div>';
    }

    function loadBoard() {
        var el = document.getElementById('game-vote-board');
        var V = global.TBGameVote;
        if (!el || !V) return;
        Promise.all([V.getBoard(), V.getOptions()]).then(function (data) {
            renderBoard(el, data[0], data[1]);
        }).catch(function () {
            // 接口不通时不打扰玩家：游戏列表照常，只把投票卡降级成入口按钮。
            el.className = 'gvb gvb--fallback';
            el.innerHTML =
                '<div class="gvb-head">' +
                    '<h2 class="gvb-title">' + esc(tr('gameVote.boardCardTitle')) + '</h2>' +
                    '<p class="gvb-total">' + esc(tr('gameVote.loadFail')) + '</p>' +
                    '<a class="tb-btn gvb-cta" href="game-vote.html">' + esc(tr('games.voteCta')) + '</a>' +
                '</div>';
        });
    }

    function renderGamesVoteBoard() {
        loadBoard();
    }

    global.renderGamesVoteBoard = renderGamesVoteBoard;

    document.addEventListener('tb:locale', function () {
        if (typeof global.renderGamesVoteBoard === 'function') global.renderGamesVoteBoard();
    });
})(window);
