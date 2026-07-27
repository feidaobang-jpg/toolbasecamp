document.addEventListener('DOMContentLoaded', function () {
    var R = window.TBRecords;
    var tr = R.tr;
    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var homeView = document.getElementById('home-view');
    var boardView = document.getElementById('board-view');
    var displayName = document.getElementById('display-name');
    var gameName = document.getElementById('game-name');
    var joinCode = document.getElementById('join-code');
    var homeError = document.getElementById('home-error');
    var boardError = document.getElementById('board-error');
    var gameList = document.getElementById('game-list');
    var gameEmpty = document.getElementById('game-empty');
    var boardTitle = document.getElementById('board-title');
    var boardCode = document.getElementById('board-code');
    var boardStatus = document.getElementById('board-status');
    var scoreHead = document.getElementById('score-head');
    var scoreBody = document.getElementById('score-body');
    var scoreFoot = document.getElementById('score-foot');
    var roundInputs = document.getElementById('round-inputs');
    var roundForm = document.getElementById('round-form');
    var finishBtn = document.getElementById('finish-btn');
    var loginLink = document.getElementById('login-link');
    var currentGameId = null;
    var currentGame = null;
    var pollTimer = null;
    var POLL_MS = 3000;
    var NAME_KEY = 'tbc_online_score_name';

    loginLink.href = R.loginUrl();
    try {
        displayName.value = localStorage.getItem(NAME_KEY) || '';
    } catch (e) { /* ignore */ }

    function rememberName() {
        var n = displayName.value.trim();
        try {
            if (n) localStorage.setItem(NAME_KEY, n);
        } catch (e) { /* ignore */ }
        return n;
    }

    function stopPoll() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function startPoll() {
        stopPoll();
        pollTimer = setInterval(function () {
            if (currentGameId && !boardView.hidden) refreshBoard(true);
        }, POLL_MS);
    }

    function showHome() {
        stopPoll();
        currentGameId = null;
        currentGame = null;
        boardView.hidden = true;
        homeView.hidden = false;
        R.setError(boardError, '');
        loadList();
    }

    function showBoard() {
        homeView.hidden = true;
        boardView.hidden = false;
        startPoll();
    }

    function statusLabel(status) {
        if (status === 'finished') return tr('tools.onlineCardScore.statusFinished');
        if (status === 'playing') return tr('tools.onlineCardScore.statusPlaying');
        return tr('tools.onlineCardScore.statusOpen');
    }

    function scoreClass(n) {
        if (n > 0) return 'is-pos';
        if (n < 0) return 'is-neg';
        return '';
    }

    function renderList(items) {
        gameList.innerHTML = '';
        gameEmpty.hidden = items.length > 0;
        items.forEach(function (item) {
            var el = document.createElement('div');
            el.className = 'rec-item ocs-game-item';
            el.innerHTML =
                '<div class="rec-item-main">' +
                '<div><p class="rec-item-title"></p><p class="rec-item-meta"></p></div>' +
                '<div><span data-st class="ocs-badge"></span></div>' +
                '</div>' +
                '<div class="rec-item-actions">' +
                '<button type="button" class="tb-btn" data-act="open"></button>' +
                '</div>';
            el.querySelector('.rec-item-title').textContent = item.name;
            el.querySelector('.rec-item-meta').textContent =
                tr('tools.onlineCardScore.listMeta', {
                    code: item.code,
                    count: item.playerCount
                });
            var st = el.querySelector('[data-st]');
            st.className = 'ocs-badge is-' + item.status;
            st.textContent = statusLabel(item.status);
            var btn = el.querySelector('[data-act="open"]');
            btn.textContent = tr('tools.onlineCardScore.open');
            btn.addEventListener('click', function () {
                openGame(item.id);
            });
            gameList.appendChild(el);
        });
    }

    function loadList() {
        R.setError(homeError, '');
        return R.apiJson('/records/online-games')
            .then(function (data) { renderList(data.items || []); })
            .catch(function (e) { R.setError(homeError, e.message); });
    }

    function renderBoard(data) {
        currentGame = data;
        currentGameId = data.id;
        boardTitle.textContent = data.name;
        boardCode.textContent = data.code;
        boardStatus.textContent =
            statusLabel(data.status) +
            ' · ' +
            tr('tools.onlineCardScore.playerCount', { count: (data.players || []).length }) +
            ' · ' +
            tr('tools.onlineCardScore.polling');
        finishBtn.hidden = !(data.isCreator && data.status !== 'finished');
        roundForm.hidden = data.status === 'finished';

        var players = data.players || [];
        var rounds = data.rounds || [];

        var head = '<tr><th>' + R.escapeHtml(tr('tools.onlineCardScore.round')) + '</th>';
        players.forEach(function (p) {
            head += '<th>' + R.escapeHtml(p.displayName) + '</th>';
        });
        head += '</tr>';
        scoreHead.innerHTML = head;

        var body = '';
        rounds.forEach(function (r) {
            body += '<tr><td class="is-round">' + r.roundNo + '</td>';
            players.forEach(function (p) {
                var n = (r.scores && r.scores[String(p.userId)]) || 0;
                body += '<td class="' + scoreClass(n) + '">' + n + '</td>';
            });
            body += '</tr>';
        });
        scoreBody.innerHTML = body || '';

        var foot = '<tr><td>' + R.escapeHtml(tr('tools.onlineCardScore.total')) + '</td>';
        players.forEach(function (p) {
            foot += '<td class="' + scoreClass(p.total) + '">' + p.total + '</td>';
        });
        foot += '</tr>';
        scoreFoot.innerHTML = foot;

        roundInputs.innerHTML = '';
        if (data.status !== 'finished') {
            var grid = document.createElement('div');
            grid.className = 'ocs-score-grid';
            players.forEach(function (p) {
                var field = document.createElement('div');
                field.className = 'rec-field';
                field.innerHTML =
                    '<label class="field-label"></label>' +
                    '<input type="text" inputmode="numeric" class="rec-input ocs-score-input" value="0" />';
                field.querySelector('label').textContent = p.displayName;
                field.querySelector('input').dataset.uid = String(p.userId);
                grid.appendChild(field);
            });
            roundInputs.appendChild(grid);
        }
    }

    function refreshBoard(silent) {
        if (!currentGameId) return Promise.resolve();
        return R.apiJson('/records/online-games/' + currentGameId)
            .then(function (data) {
                renderBoard(data);
                if (!silent) R.setError(boardError, '');
            })
            .catch(function (e) {
                if (!silent) R.setError(boardError, e.message);
            });
    }

    function openGame(id) {
        R.setError(boardError, '');
        R.apiJson('/records/online-games/' + id)
            .then(function (data) {
                showBoard();
                renderBoard(data);
            })
            .catch(function (e) { R.setError(homeError, e.message); });
    }

    document.getElementById('create-btn').addEventListener('click', function () {
        var name = rememberName();
        if (!name) {
            R.setError(homeError, tr('tools.onlineCardScore.needName'));
            return;
        }
        R.setError(homeError, '');
        R.apiJson('/records/online-games', {
            method: 'POST',
            body: JSON.stringify({
                name: gameName.value.trim(),
                display_name: name
            })
        })
            .then(function (data) {
                showBoard();
                renderBoard(data);
            })
            .catch(function (e) { R.setError(homeError, e.message); });
    });

    document.getElementById('join-btn').addEventListener('click', function () {
        var name = rememberName();
        var code = joinCode.value.trim().toUpperCase();
        if (!name) {
            R.setError(homeError, tr('tools.onlineCardScore.needName'));
            return;
        }
        if (!code) {
            R.setError(homeError, tr('tools.onlineCardScore.needCode'));
            return;
        }
        R.setError(homeError, '');
        R.apiJson('/records/online-games/join', {
            method: 'POST',
            body: JSON.stringify({ code: code, display_name: name })
        })
            .then(function (data) {
                showBoard();
                renderBoard(data);
            })
            .catch(function (e) { R.setError(homeError, e.message); });
    });

    document.getElementById('refresh-list-btn').addEventListener('click', loadList);
    document.getElementById('back-btn').addEventListener('click', showHome);

    document.getElementById('copy-code-btn').addEventListener('click', function () {
        if (!currentGame) return;
        var text = currentGame.code;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                boardStatus.textContent = tr('tools.onlineCardScore.copied');
            }).catch(function () {
                boardStatus.textContent = text;
            });
        } else {
            boardStatus.textContent = text;
        }
    });

    document.getElementById('finish-btn').addEventListener('click', function () {
        if (!currentGameId) return;
        if (!window.confirm(tr('tools.onlineCardScore.finishConfirm'))) return;
        R.apiJson('/records/online-games/' + currentGameId + '/finish', { method: 'POST' })
            .then(function (data) { renderBoard(data); })
            .catch(function (e) { R.setError(boardError, e.message); });
    });

    document.getElementById('submit-round-btn').addEventListener('click', function () {
        if (!currentGameId) return;
        var scores = {};
        var inputs = roundInputs.querySelectorAll('.ocs-score-input');
        for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            var raw = String(inp.value || '').trim();
            if (raw === '') raw = '0';
            var n = parseInt(raw, 10);
            if (!isFinite(n)) {
                R.setError(boardError, tr('tools.onlineCardScore.invalidScore'));
                return;
            }
            scores[inp.dataset.uid] = n;
        }
        R.setError(boardError, '');
        R.apiJson('/records/online-games/' + currentGameId + '/rounds', {
            method: 'POST',
            body: JSON.stringify({ scores: scores })
        })
            .then(function (data) { renderBoard(data); })
            .catch(function (e) { R.setError(boardError, e.message); });
    });

    window.addEventListener('beforeunload', stopPoll);

    R.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        if (!displayName.value && user.email) {
            displayName.value = String(user.email).split('@')[0];
        }
        var params = new URLSearchParams(window.location.search || '');
        var code = (params.get('code') || '').trim().toUpperCase();
        if (code) joinCode.value = code;
        loadList();
    });
});
