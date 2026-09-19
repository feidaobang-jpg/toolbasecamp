document.addEventListener('DOMContentLoaded', function () {
    const NAMES_KEY = 'tbc_k510_reward_names_v1';
    const gridWrap = document.getElementById('grid-wrap');
    const scoreGrid = document.getElementById('score-grid');
    const multiplierInput = document.getElementById('multiplier');
    const addRowBtn = document.getElementById('add-row-btn');
    const calcBtn = document.getElementById('calc-btn');
    const clearBtn = document.getElementById('clear-btn');
    const playerRadios = document.querySelectorAll('input[name="player-count"]');

    let playerCount = 0;
    let playerNames = [];
    let scoreRows = [];
    let results = [];
    let multipliedResults = [];

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('is-visible');
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 2200);
    }

    function setActionEnabled(enabled) {
        addRowBtn.disabled = !enabled;
        calcBtn.disabled = !enabled;
        clearBtn.disabled = !enabled;
    }

    function sanitizeDigits(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function loadStoredNames() {
        try {
            const raw = localStorage.getItem(NAMES_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.map(function (x) { return String(x || '').trim(); }) : [];
        } catch (e) {
            return [];
        }
    }

    function saveNames() {
        try {
            localStorage.setItem(NAMES_KEY, JSON.stringify(playerNames));
        } catch (e) { /* ignore quota */ }
    }

    function defaultPlayerLabel(n) {
        return tr('tools.k510Reward.playerLabel', { n: n });
    }

    function displayName(col) {
        const custom = (playerNames[col] || '').trim();
        return custom || defaultPlayerLabel(col + 1);
    }

    function syncNamesLength(count, previous) {
        const stored = loadStoredNames();
        const prev = previous && previous.length ? previous : stored;
        const next = [];
        for (let i = 0; i < count; i += 1) {
            next[i] = (prev[i] != null && String(prev[i]).trim())
                ? String(prev[i]).trim()
                : (stored[i] || '');
        }
        playerNames = next;
        saveNames();
    }

    function resetResults() {
        results = [];
        multipliedResults = [];
    }

    function hasResults() {
        return results.some(function (value) {
            return value !== undefined;
        });
    }

    function renderGrid() {
        scoreGrid.innerHTML = '';
        if (!playerCount) {
            gridWrap.hidden = true;
            return;
        }

        gridWrap.hidden = false;

        const showRowLabels = scoreRows.length > 1;
        const layout = document.createElement('div');
        layout.className = 'k510-score-layout';
        layout.style.setProperty('--player-count', String(playerCount));
        layout.dataset.hasRowLabels = showRowLabels ? 'true' : 'false';

        const headerRow = document.createElement('div');
        headerRow.className = 'k510-score-header';
        if (showRowLabels) {
            const corner = document.createElement('div');
            corner.className = 'k510-score-corner';
            corner.setAttribute('aria-hidden', 'true');
            headerRow.appendChild(corner);
        }
        for (let col = 0; col < playerCount; col += 1) {
            const head = document.createElement('div');
            head.className = 'k510-score-head-cell';
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'k510-name-input';
            nameInput.maxLength = 8;
            nameInput.autocomplete = 'off';
            nameInput.spellcheck = false;
            nameInput.value = playerNames[col] || '';
            nameInput.placeholder = defaultPlayerLabel(col + 1);
            nameInput.setAttribute('aria-label', defaultPlayerLabel(col + 1));
            nameInput.title = tr('tools.k510Reward.nameHint');
            nameInput.dataset.col = String(col);
            nameInput.addEventListener('input', onNameInput);
            nameInput.addEventListener('blur', onNameBlur);
            head.appendChild(nameInput);
            headerRow.appendChild(head);
        }
        layout.appendChild(headerRow);

        const body = document.createElement('div');
        body.className = 'k510-score-body';
        scoreRows.forEach(function (row, rowIndex) {
            const rowEl = document.createElement('div');
            rowEl.className = 'k510-score-row';

            if (showRowLabels) {
                const rowLabel = document.createElement('div');
                rowLabel.className = 'k510-score-row-label';
                rowLabel.textContent = tr('tools.k510Reward.rowLabel', { n: rowIndex + 1 });
                rowEl.appendChild(rowLabel);
            }

            for (let col = 0; col < playerCount; col += 1) {
                const input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.maxLength = 3;
                input.className = 'k510-score-input';
                input.value = row[col] || '';
                input.dataset.row = String(rowIndex);
                input.dataset.col = String(col);
                input.setAttribute('aria-label', displayName(col));
                input.addEventListener('input', onScoreInput);
                rowEl.appendChild(input);
            }

            body.appendChild(rowEl);
        });
        layout.appendChild(body);

        if (hasResults()) {
            const resultRow = document.createElement('div');
            resultRow.className = 'k510-score-row k510-score-result-row';

            if (showRowLabels) {
                const resultLabel = document.createElement('div');
                resultLabel.className = 'k510-score-row-label';
                resultLabel.textContent = tr('tools.k510Reward.rewardLabel');
                resultRow.appendChild(resultLabel);
            }

            for (let col = 0; col < playerCount; col += 1) {
                const cell = document.createElement('div');
                cell.className = 'k510-score-result-cell';
                if (results[col] !== undefined) {
                    const base = document.createElement('div');
                    base.className = 'k510-result-base';
                    base.textContent = String(results[col]);
                    cell.appendChild(base);
                    if (multipliedResults[col] !== undefined) {
                        const multiplied = document.createElement('div');
                        multiplied.className = 'k510-result-multiplied';
                        multiplied.textContent = String(multipliedResults[col]);
                        cell.appendChild(multiplied);
                    }
                }
                resultRow.appendChild(cell);
            }

            layout.appendChild(resultRow);
        }

        scoreGrid.appendChild(layout);
    }

    function onNameInput(e) {
        const col = parseInt(e.target.dataset.col, 10);
        if (!Number.isFinite(col)) return;
        playerNames[col] = String(e.target.value || '').slice(0, 8);
        saveNames();
    }

    function onNameBlur(e) {
        const col = parseInt(e.target.dataset.col, 10);
        if (!Number.isFinite(col)) return;
        playerNames[col] = String(e.target.value || '').trim().slice(0, 8);
        e.target.value = playerNames[col];
        saveNames();
    }

    function onPlayerChange(count) {
        const previousNames = playerNames.slice();
        playerCount = count;
        syncNamesLength(count, previousNames);
        scoreRows = [new Array(count).fill('')];
        resetResults();
        setActionEnabled(true);
        renderGrid();
    }

    function onScoreInput(e) {
        const input = e.target;
        const row = parseInt(input.dataset.row, 10);
        const col = parseInt(input.dataset.col, 10);
        const value = sanitizeDigits(input.value);
        input.value = value;

        scoreRows[row][col] = value;
        resetResults();
        renderGrid();
        focusInput(row, col);
    }

    function focusInput(row, col) {
        const selector = '.k510-score-input[data-row="' + row + '"][data-col="' + col + '"]';
        const input = scoreGrid.querySelector(selector);
        if (input) {
            input.focus();
            const len = input.value.length;
            input.setSelectionRange(len, len);
        }
    }

    function onMultiplierInput() {
        multiplierInput.value = sanitizeDigits(multiplierInput.value);
        resetResults();
        renderGrid();
    }

    function addRow() {
        if (!playerCount) {
            showToast(tr('tools.k510Reward.selectPlayersFirst'));
            return;
        }
        scoreRows.push(new Array(playerCount).fill(''));
        resetResults();
        renderGrid();
    }

    function clearAll() {
        if (!playerCount) return;
        scoreRows = [new Array(playerCount).fill('')];
        resetResults();
        renderGrid();
    }

    function calculateResult() {
        if (!playerCount) return;

        const multiplierValue = parseInt(multiplierInput.value, 10) || 5;
        let hasEmptyScore = false;
        const playerTotalScores = new Array(playerCount).fill(0);

        scoreRows.forEach(function (row) {
            row.forEach(function (score, index) {
                if (score === '') {
                    hasEmptyScore = true;
                } else {
                    playerTotalScores[index] += parseInt(score, 10);
                }
            });
        });

        if (hasEmptyScore) {
            showToast(tr('tools.k510Reward.fillAllScores'));
            return;
        }

        results = playerTotalScores.map(function (currentScore, i) {
            let playerResult = 0;
            playerTotalScores.forEach(function (otherScore, j) {
                if (i !== j) {
                    playerResult += currentScore - otherScore;
                }
            });
            return playerResult;
        });

        multipliedResults = results.map(function (score) {
            return score * multiplierValue;
        });

        renderGrid();
    }

    playerRadios.forEach(function (radio) {
        radio.addEventListener('change', function () {
            if (radio.checked) {
                onPlayerChange(parseInt(radio.value, 10));
            }
        });
    });

    multiplierInput.addEventListener('input', onMultiplierInput);
    addRowBtn.addEventListener('click', addRow);
    calcBtn.addEventListener('click', calculateResult);
    clearBtn.addEventListener('click', clearAll);

    document.addEventListener('tb:locale', function () {
        if (playerCount) renderGrid();
    });
});
