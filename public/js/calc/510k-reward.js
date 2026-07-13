document.addEventListener('DOMContentLoaded', function () {
    const gridWrap = document.getElementById('grid-wrap');
    const scoreGrid = document.getElementById('score-grid');
    const multiplierInput = document.getElementById('multiplier');
    const addRowBtn = document.getElementById('add-row-btn');
    const calcBtn = document.getElementById('calc-btn');
    const clearBtn = document.getElementById('clear-btn');
    const playerRadios = document.querySelectorAll('input[name="player-count"]');

    let playerCount = 0;
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

    function resetResults() {
        results = [];
        multipliedResults = [];
    }

    function renderGrid() {
        scoreGrid.innerHTML = '';
        if (!playerCount) {
            gridWrap.hidden = true;
            return;
        }

        gridWrap.hidden = false;

        for (let col = 0; col < playerCount; col += 1) {
            const column = document.createElement('div');
            column.className = 'k510-col';

            const head = document.createElement('div');
            head.className = 'k510-col-head';
            head.textContent = tr('tools.k510Reward.playerLabel', { n: col + 1 });
            column.appendChild(head);

            scoreRows.forEach(function (row, rowIndex) {
                const input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.maxLength = 3;
                input.className = 'k510-score-input';
                input.value = row[col] || '';
                input.dataset.row = String(rowIndex);
                input.dataset.col = String(col);
                input.addEventListener('input', onScoreInput);
                column.appendChild(input);
            });

            const resultBox = document.createElement('div');
            resultBox.className = 'k510-result';
            if (results[col] !== undefined) {
                const base = document.createElement('div');
                base.textContent = String(results[col]);
                resultBox.appendChild(base);
                if (multipliedResults[col] !== undefined) {
                    const multiplied = document.createElement('div');
                    multiplied.className = 'k510-result-multiplied';
                    multiplied.textContent = String(multipliedResults[col]);
                    resultBox.appendChild(multiplied);
                }
            }
            column.appendChild(resultBox);
            scoreGrid.appendChild(column);
        }
    }

    function onPlayerChange(count) {
        playerCount = count;
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
});
