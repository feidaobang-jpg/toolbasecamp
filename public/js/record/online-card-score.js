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
    var createdList = document.getElementById('created-list');
    var joinedList = document.getElementById('joined-list');
    var createdEmpty = document.getElementById('created-empty');
    var joinedEmpty = document.getElementById('joined-empty');
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
    var deleteBtn = document.getElementById('delete-btn');
    var sumWarn = document.getElementById('sum-warn');
    var loginLink = document.getElementById('login-link');
    var ocsKeyboard = document.getElementById('ocs-keyboard');
    var ocsKeyboardDisplay = document.getElementById('ocs-keyboard-display');
    var ocsKeyboardClose = document.getElementById('ocs-keyboard-close');
    var activeScoreInput = null;
    var keyboardOpen = false;
    var currentGameId = null;
    var currentGame = null;
    var meId = null;
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
        if (keyboardOpen && activeScoreInput) return true;
        var ae = document.activeElement;
        return !!(ae && ae.classList && ae.classList.contains('ocs-score-input'));
    }

    function updateKeyboardDisplay() {
        if (!ocsKeyboardDisplay) return;
        var v = activeScoreInput ? String(activeScoreInput.value || '') : '';
        ocsKeyboardDisplay.textContent = v || tr('tools.onlineCardScore.keyboardPlaceholder');
    }

    function hideScoreKeyboard() {
        keyboardOpen = false;
        if (activeScoreInput) activeScoreInput.classList.remove('is-active');
        activeScoreInput = null;
        if (ocsKeyboard) {
            ocsKeyboard.classList.remove('is-open');
            ocsKeyboard.setAttribute('aria-hidden', 'true');
        }
        if (roundForm) roundForm.classList.remove('keyboard-open');
    }

    function openScoreKeyboard(input) {
        if (!input || !ocsKeyboard) return;
        if (activeScoreInput && activeScoreInput !== input) {
            activeScoreInput.classList.remove('is-active');
        }
        activeScoreInput = input;
        input.classList.add('is-active');
        keyboardOpen = true;
        ocsKeyboard.classList.add('is-open');
        ocsKeyboard.setAttribute('aria-hidden', 'false');
        if (roundForm) roundForm.classList.add('keyboard-open');
        updateKeyboardDisplay();
        try {
            input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (e) { /* ignore */ }
    }

    function onScoreKey(key) {
        if (!activeScoreInput) return;
        var v = String(activeScoreInput.value || '');
        if (key === 'delete') {
            v = v.slice(0, -1);
        } else if (key === '-') {
            v = v.charAt(0) === '-' ? v.slice(1) : '-' + v;
        } else {
            if (v.length >= 7) return;
            if (v === '0') v = key;
            else if (v === '-0') v = '-' + key;
            else v += key;
        }
        activeScoreInput.value = v;
        activeScoreInput.dataset.localEdit = '1';
        updateKeyboardDisplay();
    }

    function showHome() {
        stopPoll();
        hideScoreKeyboard();
        currentGameId = null;
        currentGame = null;
        lastBoardSig = '';
        boardView.hidden = true;
        homeView.hidden = false;
        R.setError(boardError, '');
        if (sumWarn) {
            sumWarn.textContent = '';
            sumWarn.classList.remove('show');
        }
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

    function myViewerId(data) {
        if (data && data.viewerId != null && data.viewerId !== '') return data.viewerId;
        return meId;
    }

    function appendGameItem(listEl, item) {
        var el = document.createElement('div');
        el.className = 'rec-item ocs-game-item';
        el.innerHTML =
            '<div class="rec-item-main">' +
            '<div><p class="rec-item-title"></p><p class="rec-item-meta"></p></div>' +
            '<div><span data-st class="ocs-badge"></span></div>' +
            '</div>' +
            '<div class="rec-item-actions">' +
            '<button type="button" class="tb-btn" data-act="open"></button>' +
            (item.isCreator ? '<button type="button" class="tb-btn" data-act="del"></button>' : '') +
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
        var del = el.querySelector('[data-act="del"]');
        if (del) {
            del.textContent = tr('tools.onlineCardScore.delete');
            del.addEventListener('click', function () {
                deleteGame(item.id, true);
            });
        }
        listEl.appendChild(el);
    }

    function renderList(items) {
        createdList.innerHTML = '';
        joinedList.innerHTML = '';
        var created = [];
        var joined = [];
        (items || []).forEach(function (item) {
            if (item.isCreator) created.push(item);
            else joined.push(item);
        });
        created.forEach(function (item) { appendGameItem(createdList, item); });
        joined.forEach(function (item) { appendGameItem(joinedList, item); });
        createdEmpty.hidden = created.length > 0;
        joinedEmpty.hidden = joined.length > 0;
    }

    function loadList() {
        R.setError(homeError, '');
        return R.apiJson('/records/online-games')
            .then(function (data) { renderList(data.items || []); })
            .catch(function (e) { R.setError(homeError, e.message); });
    }

    function rowSum(r, players) {
        if (typeof r.sum === 'number') return r.sum;
        var s = 0;
        (players || []).forEach(function (p) {
            var n = r.scores && r.scores[String(p.userId)];
            if (typeof n === 'number') s += n;
        });
        return s;
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
        if (deleteBtn) deleteBtn.hidden = !data.isCreator;
        roundForm.hidden = data.status === 'finished';
        updateSumWarn(data);
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
                if (data.sumMismatch || (data.draftComplete && sum !== 0)) {
                    parts.push(tr('tools.onlineCardScore.needZeroSum'));
                } else if (data.canSettle) {
                    parts.push(tr('tools.onlineCardScore.willSettle'));
                } else {
                    parts.push(tr('tools.onlineCardScore.autoSettleHint'));
                }
                if (data.isCreator) {
                    parts.push(tr('tools.onlineCardScore.hostOptional'));
                }
                draftHint.textContent = parts.join(' · ');
            }
        }
    }

    function updateSumWarn(data) {
        if (!sumWarn) return;
        var bad = data && data.status !== 'finished' &&
            (data.sumMismatch || (data.draftComplete && (data.draftSum || 0) !== 0));
        if (bad) {
            sumWarn.textContent = tr('tools.onlineCardScore.sumMismatchWarn', {
                sum: data.draftSum || 0
            });
            sumWarn.classList.add('show');
        } else {
            sumWarn.textContent = '';
            sumWarn.classList.remove('show');
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
            var rs = rowSum(r, players);
            body += '<tr><td class="is-round">' + r.roundNo + '</td>';
            players.forEach(function (p) {
                var n = (r.scores && r.scores[String(p.userId)]);
                if (typeof n !== 'number') n = 0;
                body += scoreCell(n);
            });
            body += scoreCell(rs) + '</tr>';
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
        var vid = myViewerId(data);
        if (vid == null || vid === '') return false;
        return String(player.userId) === String(vid);
    }

    function isOwnPlayer(data, player) {
        var vid = myViewerId(data);
        return vid != null && String(player.userId) === String(vid);
    }

    /** Fill non-focused inputs from server draft so joiners' saves appear for the host. */
    function syncDraftIntoInputs(data) {
        var draft = data.draftScores || {};
        var inputs = roundInputs.querySelectorAll('.ocs-score-input');
        for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            if (inp === activeScoreInput) continue;
            var key = inp.dataset.uid;
            if (Object.prototype.hasOwnProperty.call(draft, key)) {
                var next = String(draft[key]);
                if (inp.value !== next) inp.value = next;
            } else if (inp.value !== '' && !inp.dataset.localEdit) {
                inp.value = '';
            }
        }
        updateDraftCheckmarks(data);
        if (activeScoreInput) updateKeyboardDisplay();
    }

    function updateDraftCheckmarks(data) {
        var draft = data.draftScores || {};
        var fields = roundInputs.querySelectorAll('.rec-field');
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            var input = field.querySelector('.ocs-score-input');
            var label = field.querySelector('.field-label');
            if (!input || !label) continue;
            var key = input.dataset.uid;
            var base = label.dataset.baseName || label.textContent.replace(/\s*[✓*].*$/, '');
            label.dataset.baseName = base;
            var mark = Object.prototype.hasOwnProperty.call(draft, key) ? ' ✓' : '';
            var hint = label.dataset.optionalHint || '';
            label.textContent = base + (hint ? ' ' + hint : '') + mark;
        }
    }

    function renderInputs(data, force) {
        if (data.status === 'finished') {
            hideScoreKeyboard();
            roundInputs.innerHTML = '';
            document.getElementById('submit-round-btn').hidden = true;
            return;
        }
        if (!force && isEditingScore()) {
            syncDraftIntoInputs(data);
            return;
        }

        var keepUid = activeScoreInput ? activeScoreInput.dataset.uid : null;
        var keepVal = activeScoreInput ? activeScoreInput.value : null;

        var players = data.players || [];
        var draft = data.draftScores || {};

        roundInputs.innerHTML = '';
        var grid = document.createElement('div');
        grid.className = 'ocs-score-grid';
        players.forEach(function (p) {
            if (!canEditPlayer(data, p)) return;
            var field = document.createElement('div');
            field.className = 'rec-field';
            var key = String(p.userId);
            var has = Object.prototype.hasOwnProperty.call(draft, key);
            var own = isOwnPlayer(data, p);
            field.innerHTML =
                '<label class="field-label"></label>' +
                '<input type="text" readonly class="rec-input ocs-score-input" inputmode="none" autocomplete="off" />';
            var label = field.querySelector('label');
            var input = field.querySelector('input');
            label.dataset.baseName = p.displayName;
            if (data.isCreator && !own) {
                label.dataset.optionalHint = '(' + tr('tools.onlineCardScore.hostFillHint') + ')';
            }
            var mark = has ? ' ✓' : '';
            label.textContent =
                p.displayName +
                (label.dataset.optionalHint ? ' ' + label.dataset.optionalHint : '') +
                mark;
            input.dataset.uid = key;
            input.dataset.own = own ? '1' : '0';
            input.placeholder = data.isCreator && !own
                ? tr('tools.onlineCardScore.hostFillHint')
                : tr('tools.onlineCardScore.scorePlaceholder');
            if (keepUid === key && keepVal != null) {
                input.value = keepVal;
            } else {
                input.value = has ? String(draft[key]) : '';
            }
            input.addEventListener('click', function (ev) {
                ev.preventDefault();
                openScoreKeyboard(input);
            });
            input.addEventListener('focus', function (ev) {
                ev.preventDefault();
                try { input.blur(); } catch (e) { /* ignore */ }
                openScoreKeyboard(input);
            });
            grid.appendChild(field);
        });
        if (!grid.children.length) {
            hideScoreKeyboard();
            var tip = document.createElement('p');
            tip.className = 'rec-note';
            tip.textContent = tr('tools.onlineCardScore.waitOthers');
            roundInputs.appendChild(tip);
            document.getElementById('submit-round-btn').hidden = true;
        } else {
            roundInputs.appendChild(grid);
            document.getElementById('submit-round-btn').hidden = false;
        }

        if (keepUid) {
            var restore = roundInputs.querySelector('.ocs-score-input[data-uid="' + keepUid + '"]');
            if (restore && keyboardOpen) {
                activeScoreInput = restore;
                restore.classList.add('is-active');
                updateKeyboardDisplay();
            } else if (!restore) {
                hideScoreKeyboard();
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
            canSettle: data.canSettle,
            sumMismatch: data.sumMismatch
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
                    syncDraftIntoInputs(data);
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

    function deleteGame(id, fromList) {
        if (!R.confirmDelete(tr('tools.onlineCardScore.deleteConfirm'))) return;
        R.setError(fromList ? homeError : boardError, '');
        R.apiJson('/records/online-games/' + id + '/delete', { method: 'POST' })
            .then(function () {
                if (!fromList || String(id) === String(currentGameId)) {
                    showHome();
                } else {
                    loadList();
                }
            })
            .catch(function (e) {
                R.setError(fromList ? homeError : boardError, e.message);
            });
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

    if (deleteBtn) {
        deleteBtn.addEventListener('click', function () {
            if (!currentGameId) return;
            deleteGame(currentGameId, false);
        });
    }

    document.getElementById('submit-round-btn').addEventListener('click', function () {
        if (!currentGameId || !currentGame) return;
        var scores = {};
        var inputs = roundInputs.querySelectorAll('.ocs-score-input');
        if (!inputs.length) {
            R.setError(boardError, tr('tools.onlineCardScore.noEditable'));
            return;
        }
        var isCreator = !!currentGame.isCreator;
        for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            var raw = String(inp.value || '').trim();
            var own = inp.dataset.own === '1';
            if (raw === '') {
                // Host may leave others blank; own score is still required when saving.
                if (own || !isCreator) {
                    R.setError(boardError, tr('tools.onlineCardScore.needScore'));
                    inp.focus();
                    return;
                }
                continue;
            }
            if (!/^[+-]?\d+$/.test(raw)) {
                R.setError(boardError, tr('tools.onlineCardScore.invalidScore'));
                inp.focus();
                return;
            }
            scores[inp.dataset.uid] = parseInt(raw, 10);
            delete inp.dataset.localEdit;
        }
        if (!Object.keys(scores).length) {
            R.setError(boardError, tr('tools.onlineCardScore.needScore'));
            return;
        }
        R.setError(boardError, '');
        setBusy(true);
        R.apiJson('/records/online-games/' + currentGameId + '/rounds', {
            method: 'POST',
            body: JSON.stringify({ scores: scores })
        })
            .then(function (data) {
                hideScoreKeyboard();
                renderBoard(data, { forceInputs: true });
                if (data.settled) {
                    boardStatus.textContent = tr('tools.onlineCardScore.settled');
                } else {
                    updateSumWarn(data);
                }
            })
            .catch(function (e) { R.setError(boardError, e.message); })
            .then(function () { setBusy(false); });
    });

    if (ocsKeyboardClose) {
        ocsKeyboardClose.addEventListener('click', hideScoreKeyboard);
    }
    if (ocsKeyboard) {
        ocsKeyboard.querySelectorAll('.ocs-key').forEach(function (btn) {
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                var key = btn.getAttribute('data-key');
                if (key) onScoreKey(key);
            });
        });
    }

    window.addEventListener('beforeunload', stopPoll);

    R.requireLogin(gate, app).then(function (user) {
        if (!user) return;
        meId = user.id != null ? user.id : user.user_id;
        if (!displayName.value) {
            var label = String(user.display || user.phone || user.email || '').trim();
            if (label) {
                displayName.value = label.includes('@') ? label.split('@')[0] : label;
            }
        }
        var params = new URLSearchParams(window.location.search || '');
        var code = (params.get('code') || '').trim().toUpperCase();
        if (code) joinCode.value = code;
        loadList();
    });
});
