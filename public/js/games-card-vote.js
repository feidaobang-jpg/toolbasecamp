/** 卡片直接投「最爱玩」票，与独立投票页共用身份、限额与真实榜单。 */
(function (global) {
    'use strict';
    var board = null;
    var mine = null;
    var loading = null;
    var busy = false;
    var bound = false;
    function tr(key) { return global.t(key); }
    function buttons() { return document.querySelectorAll('.hub-game-vote'); }
    function message(btn, text) {
        var status = btn.closest('.hub-game-card').querySelector('.hub-game-vote-status');
        status.textContent = text;
        status.hidden = !text;
    }
    function render() {
        var counts = {};
        if (board) (board.favorite || []).forEach(function (row) { counts[row.key] = row.votes; });
        buttons().forEach(function (btn) {
            var voted = !!mine && (mine.favorite || []).indexOf(btn.dataset.voteGame) !== -1;
            var count = board ? (counts[btn.dataset.voteGame] || 0) : '—';
            var label = voted ? tr('gameVote.votedBtn') : tr('games.cardVote');
            if (loading && !mine) label = tr('games.cardVoteLoading');
            else if (!mine) label = tr('games.cardVoteRetry');
            btn.textContent = label + (mine ? ' · ' + count : '');
            btn.disabled = busy || !!loading || voted;
            btn.setAttribute('aria-label', btn.dataset.gameLabel + ' · ' + label + ' · ' + count + ' ' + tr('gameVote.voteSuffix'));
            btn.title = voted ? tr('games.cardVoteAlready') : tr('games.cardVoteHint');
        });
    }
    function refresh() {
        if (loading) return loading;
        loading = Promise.all([global.TBGameVote.getBoard(), global.TBGameVote.getMyVotes()])
            .then(function (data) { board = data[0]; mine = data[1]; })
            .finally(function () { loading = null; render(); });
        render();
        return loading;
    }
    function load() {
        return refresh().then(function () {
            buttons().forEach(function (btn) { message(btn, ''); });
        }).catch(function () {
            buttons().forEach(function (btn) { message(btn, tr('gameVote.loadFail')); });
        });
    }
    function click(event) {
        var btn = event.target.closest('.hub-game-vote');
        if (!btn || busy || loading) return;
        if (!mine) {
            buttons().forEach(function (button) { message(button, ''); });
            load();
            return;
        }
        var key = btn.dataset.voteGame;
        if ((mine.favorite || []).indexOf(key) !== -1) return;
        busy = true;
        message(btn, '');
        render();
        global.TBGameVote.vote('favorite', key).then(function () {
            // 提交已成功，即使回读失败也保持“已投”，不虚增票数、不再提交。
            mine.favorite = (mine.favorite || []).concat(key);
            board = null;
            return refresh().then(function () {
                message(btn, tr('games.cardVoteSuccess'));
                if (global.renderGamesVoteBoard) global.renderGamesVoteBoard();
            }).catch(function () { message(btn, tr('games.cardVoteRefreshFail')); });
        }).catch(function (err) {
            var detail = String((err && err.detail) || '');
            message(btn, /limit/i.test(detail) ? tr('gameVote.voteFailLimit')
                : /network voted too many/i.test(detail) ? tr('games.cardVoteNetworkLimit') : tr('gameVote.voteFail'));
        }).finally(function () { busy = false; render(); });
    }
    global.initGameCardVotes = function () {
        if (!global.TBGameVote) return;
        if (!bound) {
            document.getElementById('main-content').addEventListener('click', click);
            // 从投票页返回或在其他标签改票后，重新读取服务端状态。
            global.addEventListener('pageshow', function () { if (!busy) load(); });
            global.addEventListener('focus', function () { if (!busy) load(); });
            bound = true;
        }
        if (mine) render();
        else load();
    };
})(window);
