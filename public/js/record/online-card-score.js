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
    var draftHint = document.getElementById('draft-hint');
    var scoreHead = document.getElementById('score-head');
    var scoreBody = document.getElementById('score-body');
    var scoreFoot = document.getElementById('score-foot');
    var roundInputs = document.getElementById('round-inputs');
    var roundForm = document.getElementById('round-form');
    var finishBtn = document.getElementById('finish-btn');
    var loginLink = document.getElementById('login-link');
    var currentGameId = null;
    var currentGame = null;
    var lastBoardSig = '';
    var pollTimer = null;
    var pollInFlight = false;
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

    function setBusy(on) {
        homeView.classList.toggle('ocs-busy', !!on);
        boardView.classList.toggle('ocs-busy', !!on);
    }

    function isEditingScore() {
        var ae = document.activeElement;
        return !!(ae && ae.classList && ae.classList.contains('ocs-score-input'));
    }

    function showHome() {
        stopPoll();
        currentGameId = null;
        currentGame = null;
        lastBoardSig = '';
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
        return 'is-zero';
    }

    function scoreCell(n) {
        return '<td class="' + scoreClass(n) + '">' + n + '</td>';
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

    function renderHeader(data) {
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
        if (draftHint) {
            if (data.status === 'finished') {
                draftHint.textContent = '';
                draftHint.hidden = true;
            } else {
                draftHint.hidden = false;
                var ready = data.draftReadyCount || 0;
                var total = (data.players || []).length;
                var sum = data.draftSum || 0;
                var parts = [
                    tr('tools.onlineCardScore.draftProgress', { ready: ready, total: total })
                ];
                if (ready > 0) {
                    parts.push(tr('tools.onlineCardScore.draftSumLine', { sum: sum }));
                }
                if (data.draftComplete && sum !== 0) {
                    parts.push(tr('tools.onlineCardScore.needZeroSum'));
                } else if (data.canSettle) {
                    parts.push(tr('tools.onlineCardScore.willSettle'));
                } else {
                    parts.push(tr('tools.onlineCardScore.autoSettleHint'));
                }
                draftHint.textContent = parts.join(' · ');
            }
        }
    }

    function renderTable(data) {
        var players = data.players || [];
        var rounds = data.rounds || [];
        var draft = data.draftScores || {};
        var sumLabel = R.escapeHtml(tr('tools.onlineCardScore.roundSum'));

        var head = '<tr><th>' + R.escapeHtml(tr('tools.onlineCardScore.round')) + '</th>';
        players.forEach(function (p) {
            head += '<th>' + R.escapeHtml(p.displayName) + '</th>';
        });
        head += '<th>' + sumLabel + '</th></tr>';
        scoreHead.innerHTML = head;

        var body = '';
        rounds.forEach(function (r) {
            var rowSum = typeof r.sum === 'number' ? r.sum : 0;
            body += '<tr><td class="is-round">' + r.roundNo + '</td>';
            players.forEach(function (p) {
                var n = (r.scores && r.scores[String(p.userId)]);
                if (typeof n !== 'number') n = 0;
                body += scoreCell(n);
            });
            body += scoreCell(rowSum) + '</tr>';
        });

        var draftKeys = Object.keys(draft);
        if (data.status !== 'finished' && draftKeys.length) {
            body += '<tr class="ocs-draft-row"><td class="is-round">' +
                R.escapeHtml(tr('tools.onlineCardScore.draftRound')) + '</td>';
            players.forEach(function (p) {
                var key = String(p.userId);
                if (Object.prototype.hasOwnProperty.call(draft, key)) {
                    body += scoreCell(draft[key]);
                } else {
                    body += '<td class="ocs-pending">—</td>';
                }
            });
            body += scoreCell(data.draftSum || 0) + '</tr>';
        }
        scoreBody.innerHTML = body || '';

        var foot = '<tr><td>' + R.escapeHtml(tr('tools.onlineCardScore.total')) + '</td>';
        players.forEach(function (p) {
            foot += scoreCell(p.total || 0);
        });
        foot += '<td></td></tr>';
        scoreFoot.innerHTML = foot;
    }

    function canEditPlayer(data, player) {
        if (data.isCreator) return true;
        return String(player.userId) === String(data.viewerId);
    }

    function renderInputs(data, force) {
        if (data.status === 'finished') {
            roundInputs.innerHTML = '';
            return;
        }
        if (!force && isEditingScore()) return;

        var players = data.players || [];
        var draft = data.draftScores || {};
        var prevFocusUid = null;
        var prevSelStart = null;
        var prevSelEnd = null;
        var ae = document.activeElement;
        if (ae && ae.classList && ae.classList.contains('ocs-score-input')) {
            prevFocusUid = ae.dataset.uid;
            try {
                prevSelStart = ae.selectionStart;
                prevSelEnd = ae.selectionEnd;
            } catch (e) { /* ignore */ }
        }

        roundInputs.innerHTML = '';
        var grid = document.createElement('div');
        grid.className = 'ocs-score-grid';
        players.forEach(function (p) {
            if (!canEditPlayer(data, p)) return;
            var field = document.createElement('div');
            field.className = 'rec-field';
            var key = String(p.userId);
            var has = Object.prototype.hasOwnProperty.call(draft, key);
            field.innerHTML =
                '<label class="field-label"></label>' +
                '<input type="text" inputmode="numeric" class="rec-input ocs-score-input" autocomplete="off" />';
            var label = field.querySelector('label');
            var mark = has ? ' ✓' : '';
            label.textContent = p.displayName + mark;
            var input = field.querySelector('input');
            input.dataset.uid = key;
            input.placeholder = tr('tools.onlineCardScore.scorePlaceholder');
            input.value = has ? String(draft[key]) : '';
            grid.appendChild(field);
        });
        if (!grid.children.length) {
            var tip = document.createElement('p');
            tip.className = 'rec-note';
            tip.textContent = tr('tools.onlineCardScore.waitOthers');
            roundInputs.appendChild(tip);
        } else {
            roundInputs.appendChild(grid);
        }

        if (prevFocusUid) {
            var restore = roundInputs.querySelector('.ocs-score-input[data-uid="' + prevFocusUid + '"]');
            if (restore) {
                restore.focus();
                try {
                    if (prevSelStart != null) restore.setSelectionRange(prevSelStart, prevSelEnd);
                } catch (e2) { /* ignore */ }
            }
        }
    }

    function boardSig(data) {
        return JSON.stringify({
            id: data.id,
            status: data.status,
            updatedAt: data.updatedAt,
            rounds: data.rounds,
            draft: data.draftScores,
            players: (data.players || []).map(function (p) {
                return [p.userId, p.displayName, p.total, p.hasDraft];
            }),
            draftReadyCount: data.draftReadyCount,
            draftSum: data.draftSum,
            canSettle: data.canSettle
        });
    }

    function renderBoard(data, opts) {
        opts = opts || {};
        var sig = boardSig(data);
        var same = sig === lastBoardSig && !opts.forceInputs;
        currentGame = data;
        currentGameId = data.id;
        lastBoardSig = sig;
        if (same) return;
        renderHeader(data);
        renderTable(data);
        renderInputs(data, !!opts.forceInputs);
    }

    function refreshBoard(silent) {
        if (!currentGameId || pollInFlight) return Promise.resolve();
        pollInFlight = true;
        return R.apiJson('/records/online-games/' + currentGameId)
            .then(function (data) {
                var sig = boardSig(data);
                if (sig === lastBoardSig) {
                    if (!silent) R.setError(boardError, '');
                    return;
                }
                if (isEditingScore()) {
                    currentGame = data;
                    currentGameId = data.id;
                    lastBoardSig = sig;
                    renderHeader(data);
                    renderTable(data);
                } else {
                    renderBoard(data);
                }
                if (!silent) R.setError(boardError, '');
            })
            .catch(function (e) {
                if (!silent) R.setError(boardError, e.message);
            })
            .then(function () { pollInFlight = false; });
    }

    function openGame(id) {
        R.setError(boardError, '');
        R.apiJson('/records/online-games/' + id)
            .then(function (data) {
                showBoard();
                renderBoard(data, { forceInputs: true });
            })
            .catch(function (e) { R.setError(homeError, e.message); });
    }

    document.getElementById('create-btn').addEventListener('click', function () {
        var name = rememberName();
        if (!name) {
            R.setError(homeError, tr('tools.onlineCardScore.needName'));
            displayName.focus();
            return;
        }
        R.setError(homeError, '');
        setBusy(true);
        R.apiJson('/records/online-games', {
            method: 'POST',
            body: JSON.stringify({
                name: gameName.value.trim(),
                display_name: name
            })
        })
            .then(function (data) {
                showBoard();
                renderBoard(data, { forceInputs: true });
            })
            .catch(function (e) { R.setError(homeError, e.message); })
            .then(function () { setBusy(false); });
    });

    document.getElementById('join-btn').addEventListener('click', function () {
        var name = rememberName();
        var code = joinCode.value.trim().toUpperCase();
        if (!name) {
            R.setError(homeError, tr('tools.onlineCardScore.needName'));
            displayName.focus();
            return;
        }
        if (!code) {
            R.setError(homeError, tr('tools.onlineCardScore.needCode'));
            joinCode.focus();
            return;
        }
        joinCode.value = code;
        R.setError(homeError, '');
        setBusy(true);
        R.apiJson('/records/online-games/join', {
            method: 'POST',
            body: JSON.stringify({ code: code, display_name: name })
        })
            .then(function (data) {
                showBoard();
                renderBoard(data, { forceInputs: true });
            })
            .catch(function (e) { R.setError(homeError, e.message); })
            .then(function () { setBusy(false); });
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
            .then(function (data) { renderBoard(data, { forceInputs: true }); })
            .catch(function (e) { R.setError(boardError, e.message); });
    });

    document.getElementById('submit-round-btn').addEventListener('click', function () {
        if (!currentGameId) return;
        var scores = {};
        var inputs = roundInputs.querySelectorAll('.ocs-score-input');
        if (!inputs.length) {
            R.setError(boardError, tr('tools.onlineCardScore.noEditable'));
            return;
        }
        for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            var raw = String(inp.value || '').trim();
            if (raw === '') {
                R.setError(boardError, tr('tools.onlineCardScore.needScore'));
                inp.focus();
                return;
            }
            if (!/^[+-]?\d+$/.test(raw)) {
                R.setError(boardError, tr('tools.onlineCardScore.invalidScore'));
                inp.focus();
                return;
            }
            scores[inp.dataset.uid] = parseInt(raw, 10);
        }
        R.setError(boardError, '');
        setBusy(true);
        R.apiJson('/records/online-games/' + currentGameId + '/draft-scores', {
            method: 'POST',
            body: JSON.stringify({ scores: scores })
        })
            .then(function (data) {
                renderBoard(data, { forceInputs: true });
                if (data.settled) {
                    boardStatus.textContent = tr('tools.onlineCardScore.settled');
                }
            })
            .catch(function (e) { R.setError(boardError, e.message); })
            .then(function () { setBusy(false); });
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
