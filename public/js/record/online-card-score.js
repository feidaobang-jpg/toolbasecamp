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
    var scoreTableWrap = document.querySelector('.ocs-table-wrap');
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
    var meUser = null;
    var lastBoardSig = '';
    var pollTimer = null;
    var pollInFlight = false;
    var POLL_MS = 3000;
    var NAME_KEY = 'tbc_online_score_name';
    var GUEST_KEY = 'tbc_ocs_guest_v1';
    var loggedIn = false;
    var hostOnlyEls = null;

    loginLink.href = R.loginUrl();
    try {
        displayName.value = localStorage.getItem(NAME_KEY) || '';
    } catch (e) { /* ignore */ }

    function loadGuestMap() {
        try {
            return JSON.parse(localStorage.getItem(GUEST_KEY) || '{}') || {};
        } catch (e) {
            return {};
        }
    }

    function saveGuestToken(gameId, token, code) {
        if (!token) return;
        var map = loadGuestMap();
        if (!map.byId) map = { byId: map, byCode: {} };
        if (!map.byId) map.byId = {};
        if (!map.byCode) map.byCode = {};
        if (gameId) map.byId[String(gameId)] = token;
        if (code) map.byCode[String(code).toUpperCase()] = token;
        try {
            localStorage.setItem(GUEST_KEY, JSON.stringify(map));
        } catch (e) { /* ignore */ }
        R.setGuestToken(token);
    }

    function restoreGuestToken(gameId, code) {
        var map = loadGuestMap();
        var byId = map.byId || map;
        var byCode = map.byCode || {};
        var tok = '';
        if (gameId) tok = byId[String(gameId)] || '';
        if (!tok && code) tok = byCode[String(code).toUpperCase()] || '';
        R.setGuestToken(tok);
        return tok;
    }

    function playerKey(p) {
        if (!p) return '';
        if (p.playerId != null && p.playerId !== '') return String(p.playerId);
        return String(p.userId);
    }

    function updateHostOnlyUi() {
        if (!hostOnlyEls) {
            hostOnlyEls = [
                document.getElementById('create-panel'),
                document.getElementById('game-name-field'),
                document.querySelector('.ocs-home-split'),
                document.getElementById('refresh-list-btn')
            ];
        }
        hostOnlyEls.forEach(function (el) {
            if (el) el.hidden = !loggedIn;
        });
        var hint = document.getElementById('display-name-hint');
        if (hint) {
            hint.setAttribute(
                'data-i18n',
                loggedIn ? 'tools.onlineCardScore.displayNameHint' : 'tools.onlineCardScore.guestNameHint'
            );
            hint.textContent = loggedIn
                ? tr('tools.onlineCardScore.displayNameHint')
                : tr('tools.onlineCardScore.guestNameHint');
        }
        var label = document.querySelector('label[for="display-name"]');
        if (label) {
            label.setAttribute(
                'data-i18n',
                loggedIn ? 'tools.onlineCardScore.displayName' : 'tools.onlineCardScore.guestDisplayName'
            );
            label.textContent = loggedIn
                ? tr('tools.onlineCardScore.displayName')
                : tr('tools.onlineCardScore.guestDisplayName');
        }
        var note = document.querySelector('#home-view > .rec-note');
        if (note) {
            note.setAttribute('data-i18n', 'tools.onlineCardScore.pollNote');
            note.textContent = tr('tools.onlineCardScore.pollNote');
        }
        var loginPrompt = document.getElementById('guest-login-prompt');
        if (loginPrompt) loginPrompt.hidden = loggedIn;
        var guestLoginLink = document.getElementById('guest-login-link');
        if (guestLoginLink) guestLoginLink.href = R.loginUrl();
    }

    function rememberName() {
        var n = displayName.value.trim();
        try {
            if (n) localStorage.setItem(NAME_KEY, n);
            else localStorage.removeItem(NAME_KEY);
        } catch (e) { /* ignore */ }
        return n;
    }

    function accountTail4(user) {
        var phone = String((user && user.phone) || '').replace(/\D/g, '');
        if (phone.length >= 4) return phone.slice(-4);
        var email = String((user && user.email) || (user && user.display) || '').trim();
        var local = email.includes('@') ? email.split('@')[0] : email;
        var digits = local.replace(/\D/g, '');
        if (digits.length >= 4) return digits.slice(-4);
        if (local) {
            var t = local.slice(-4);
            while (t.length < 4) t = '0' + t;
            return t.slice(-4);
        }
        return '';
    }

    function resolveDisplayName() {
        var typed = rememberName();
        if (typed) return typed;
        if (loggedIn) return accountTail4(meUser);
        return '';
    }

    function myViewerPlayerId(data) {
        if (data && data.viewerPlayerId != null && data.viewerPlayerId !== '') {
            return data.viewerPlayerId;
        }
        return null;
    }

    function isRoomCreator(data) {
        if (!data) return false;
        if (!loggedIn) return false;
        var cid = Number(data.creatorId);
        var vid = Number(data.viewerId != null ? data.viewerId : meId);
        if (Number.isFinite(cid) && Number.isFinite(vid) && cid > 0 && vid > 0) {
            return cid === vid;
        }
        return !!data.isCreator;
    }

    function formatRoomTitle(name) {
        var raw = String(name || '');
        var m = /^(.+)'s game$/i.exec(raw);
        if (m) {
            return tr('tools.onlineCardScore.defaultRoomName', { name: m[1] });
        }
        return raw;
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

    function updateKeyboardLayout() {
        if (!boardView) return;
        if (!keyboardOpen || !ocsKeyboard) {
            boardView.style.paddingBottom = '';
            return;
        }
        var kbH = ocsKeyboard.offsetHeight || 0;
        boardView.style.paddingBottom = kbH > 0 ? (kbH + 16) + 'px' : '';
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                scrollBoardForKeyboard(kbH);
            });
        });
    }

    function scrollBoardForKeyboard(kbH) {
        if (!keyboardOpen) return;
        kbH = kbH || (ocsKeyboard ? ocsKeyboard.offsetHeight : 0);
        var anchor = document.querySelector('.ocs-submit-row') || roundForm;
        if (!anchor) return;
        var rect = anchor.getBoundingClientRect();
        var gap = 12;
        var visibleBottom = window.innerHeight - kbH - gap;
        var delta = rect.bottom - visibleBottom;
        if (delta > 0) {
            try {
                window.scrollBy({ top: delta, behavior: 'smooth' });
            } catch (e) {
                window.scrollBy(0, delta);
            }
        }
    }

    function hideScoreKeyboard() {
        keyboardOpen = false;
        if (activeScoreInput) activeScoreInput.classList.remove('is-active');
        activeScoreInput = null;
        if (ocsKeyboard) {
            ocsKeyboard.classList.remove('is-open');
            ocsKeyboard.setAttribute('aria-hidden', 'true');
        }
        updateKeyboardLayout();
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
        updateKeyboardDisplay();
        updateKeyboardLayout();
        setTimeout(updateKeyboardLayout, 280);
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

    function roundMetaCell(label, sum) {
        var sumN = typeof sum === 'number' ? sum : 0;
        return '<td class="ocs-round-meta">' +
            '<span class="ocs-round-no">' + R.escapeHtml(String(label)) + '</span>' +
            '<span class="ocs-round-sum ' + scoreClass(sumN) + '">' + sumN + '</span>' +
            '</td>';
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
            (isRoomCreator(item) ? '<button type="button" class="tb-btn" data-act="del"></button>' : '') +
            '</div>';
        el.querySelector('.rec-item-title').textContent = formatRoomTitle(item.name);
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
            if (isRoomCreator(item)) created.push(item);
            else joined.push(item);
        });
        created.forEach(function (item) { appendGameItem(createdList, item); });
        joined.forEach(function (item) { appendGameItem(joinedList, item); });
        createdEmpty.hidden = created.length > 0;
        joinedEmpty.hidden = joined.length > 0;
    }

    function loadList() {
        if (!loggedIn) {
            renderList([]);
            return Promise.resolve();
        }
        R.setError(homeError, '');
        return R.apiJson('/records/online-games')
            .then(function (data) { renderList(data.items || []); })
            .catch(function (e) { R.setError(homeError, e.message); });
    }

    function rowSum(r, players) {
        if (typeof r.sum === 'number') return r.sum;
        var s = 0;
        (players || []).forEach(function (p) {
            var n = r.scores && r.scores[playerKey(p)];
            if (typeof n === 'number') s += n;
        });
        return s;
    }

    function renderHeader(data) {
        boardTitle.textContent = formatRoomTitle(data.name);
        boardCode.textContent = data.code;
        boardStatus.textContent =
            statusLabel(data.status) +
            ' · ' +
            tr('tools.onlineCardScore.playerCount', { count: (data.players || []).length }) +
            ' · ' +
            tr('tools.onlineCardScore.polling');
        var creator = isRoomCreator(data);
        finishBtn.hidden = !(creator && data.status !== 'finished');
        if (deleteBtn) deleteBtn.hidden = !creator;
        var addLocalBtn = document.getElementById('add-local-btn');
        if (addLocalBtn) {
            addLocalBtn.hidden = !(creator && data.status !== 'finished');
        }
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
                if (isRoomCreator(data)) {
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

        scoreHead.innerHTML = '';

        var body = '';
        rounds.forEach(function (r) {
            var rs = rowSum(r, players);
            body += '<tr>' + roundMetaCell(r.roundNo, rs);
            players.forEach(function (p) {
                var n = (r.scores && r.scores[playerKey(p)]);
                if (typeof n !== 'number') n = 0;
                body += scoreCell(n);
            });
            body += '</tr>';
        });

        var draftKeys = Object.keys(draft);
        if (data.status !== 'finished' && draftKeys.length) {
            body += '<tr class="ocs-draft-row">' +
                roundMetaCell(tr('tools.onlineCardScore.draftRound'), data.draftSum || 0);
            players.forEach(function (p) {
                var key = playerKey(p);
                if (Object.prototype.hasOwnProperty.call(draft, key)) {
                    body += scoreCell(draft[key]);
                } else {
                    body += '<td class="ocs-pending">—</td>';
                }
            });
            body += '</tr>';
        }
        scoreBody.innerHTML = body || '';

        var footTotal = '<tr class="ocs-foot-total"><td class="ocs-foot-label">' +
            R.escapeHtml(tr('tools.onlineCardScore.total')) + '</td>';
        players.forEach(function (p) {
            footTotal += scoreCell(p.total || 0);
        });
        footTotal += '</tr>';

        var footNames = '<tr class="ocs-foot-names"><td class="ocs-foot-label">' +
            R.escapeHtml(tr('tools.onlineCardScore.footName')) + '</td>';
        players.forEach(function (p) {
            var label = p.displayName;
            if (p.playerKind === 'local') {
                label += ' (' + tr('tools.onlineCardScore.localBadge') + ')';
            }
            footNames += '<td class="ocs-name-cell">' + R.escapeHtml(label);
            if (isRoomCreator(data) && p.playerKind === 'local' && data.status !== 'finished') {
                footNames += ' <button type="button" class="ocs-remove-local" data-pid="' +
                    R.escapeHtml(playerKey(p)) + '" title="' +
                    R.escapeHtml(tr('tools.onlineCardScore.removeLocal')) + '">×</button>';
            }
            footNames += '</td>';
        });
        footNames += '</tr>';

        scoreFoot.innerHTML = footTotal + footNames;
        scoreFoot.querySelectorAll('.ocs-remove-local').forEach(function (btn) {
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                removeLocalPlayer(btn.getAttribute('data-pid'));
            });
        });
    }

    function canEditPlayer(data, player) {
        if (isRoomCreator(data)) return true;
        var vid = myViewerPlayerId(data);
        if (vid == null || vid === '') return false;
        return playerKey(player) === String(vid);
    }

    function isOwnPlayer(data, player) {
        var vid = myViewerPlayerId(data);
        return vid != null && playerKey(player) === String(vid);
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
            var key = playerKey(p);
            var has = Object.prototype.hasOwnProperty.call(draft, key);
            var own = isOwnPlayer(data, p);
            var kind = p.playerKind || 'user';
            field.innerHTML =
                '<label class="field-label"></label>' +
                '<input type="text" readonly class="rec-input ocs-score-input" inputmode="none" autocomplete="off" />';
            var label = field.querySelector('label');
            var input = field.querySelector('input');
            var baseName = p.displayName;
            if (kind === 'local') {
                baseName += ' (' + tr('tools.onlineCardScore.localBadge') + ')';
            }
            label.dataset.baseName = baseName;
            if (isRoomCreator(data) && !own) {
                label.dataset.optionalHint = '(' + tr('tools.onlineCardScore.hostFillHint') + ')';
            }
            var mark = has ? ' ✓' : '';
            label.textContent =
                baseName +
                (label.dataset.optionalHint ? ' ' + label.dataset.optionalHint : '') +
                mark;
            input.dataset.uid = key;
            input.dataset.own = own ? '1' : '0';
            input.placeholder = isRoomCreator(data) && !own
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
                return [playerKey(p), p.displayName, p.playerKind, p.total, p.hasDraft];
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
        restoreGuestToken(currentGameId, currentGame && currentGame.code);
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
        restoreGuestToken(id);
        R.apiJson('/records/online-games/' + id)
            .then(function (data) {
                if (data.guestToken) saveGuestToken(data.id, data.guestToken, data.code);
                showBoard();
                renderBoard(data, { forceInputs: true });
                startPoll();
            })
            .catch(function (e) { R.setError(homeError, e.message); });
    }

    function removeLocalPlayer(playerId) {
        if (!currentGameId || !playerId) return;
        if (!window.confirm(tr('tools.onlineCardScore.removeLocalConfirm'))) return;
        R.apiJson('/records/online-games/' + currentGameId + '/players/' + playerId, {
            method: 'DELETE'
        })
            .then(function (data) {
                renderBoard(data, { forceInputs: true });
            })
            .catch(function (e) { R.setError(boardError, e.message); });
    }

    function addLocalPlayer() {
        if (!currentGameId || !isRoomCreator(currentGame)) return;
        var name = window.prompt(tr('tools.onlineCardScore.addLocalPrompt'), '');
        if (name == null) return;
        name = String(name).trim();
        if (!name) {
            R.setError(boardError, tr('tools.onlineCardScore.needName'));
            return;
        }
        R.setError(boardError, '');
        R.apiJson('/records/online-games/' + currentGameId + '/players', {
            method: 'POST',
            body: JSON.stringify({ display_name: name })
        })
            .then(function (data) {
                renderBoard(data, { forceInputs: true });
            })
            .catch(function (e) { R.setError(boardError, e.message); });
    }

    document.getElementById('create-btn').addEventListener('click', function () {
        if (!loggedIn) {
            R.setError(homeError, tr('tools.onlineCardScore.loginToCreate'));
            return;
        }
        var name = resolveDisplayName();
        if (!name) {
            R.setError(homeError, tr('tools.onlineCardScore.needName'));
            displayName.focus();
            return;
        }
        var roomTitle = gameName.value.trim() || tr('tools.onlineCardScore.defaultRoomName', { name: name });
        R.setError(homeError, '');
        setBusy(true);
        R.setGuestToken('');
        R.apiJson('/records/online-games', {
            method: 'POST',
            body: JSON.stringify({
                name: roomTitle,
                display_name: name
            })
        })
            .then(function (data) {
                showBoard();
                renderBoard(data, { forceInputs: true });
                startPoll();
            })
            .catch(function (e) { R.setError(homeError, e.message); })
            .then(function () { setBusy(false); });
    });

    document.getElementById('join-btn').addEventListener('click', function () {
        var name = resolveDisplayName();
        var code = joinCode.value.trim().toUpperCase();
        if (!loggedIn && !name) {
            R.setError(homeError, tr('tools.onlineCardScore.needName'));
            displayName.focus();
            return;
        }
        if (loggedIn && !name) {
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
        restoreGuestToken(null, code);
        R.apiJson('/records/online-games/join', {
            method: 'POST',
            body: JSON.stringify({ code: code, display_name: name })
        })
            .then(function (data) {
                if (data.guestToken) saveGuestToken(data.id, data.guestToken, data.code);
                else if (!loggedIn) restoreGuestToken(data.id, data.code);
                showBoard();
                renderBoard(data, { forceInputs: true });
                startPoll();
            })
            .catch(function (e) { R.setError(homeError, e.message); })
            .then(function () { setBusy(false); });
    });

    document.getElementById('refresh-list-btn').addEventListener('click', loadList);
    document.getElementById('back-btn').addEventListener('click', showHome);

    var addLocalBtn = document.getElementById('add-local-btn');
    if (addLocalBtn) {
        addLocalBtn.addEventListener('click', addLocalPlayer);
    }

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
        var isCreator = isRoomCreator(currentGame);
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
    window.addEventListener('resize', function () {
        if (keyboardOpen) updateKeyboardLayout();
    });

    R.optionalLogin(gate, app).then(function (user) {
        loggedIn = !!(user && (user.id != null || user.user_id != null));
        meUser = user;
        meId = user && (user.id != null ? user.id : user.user_id);
        updateHostOnlyUi();
        var params = new URLSearchParams(window.location.search || '');
        var code = (params.get('code') || '').trim().toUpperCase();
        if (code) joinCode.value = code;
        if (loggedIn) loadList();
        else renderList([]);
    });
});
