document.addEventListener('DOMContentLoaded', function () {
    const STORAGE_PERSONS = 'tb-card-score-persons';
    const STORAGE_SUMMATION = 'tb-card-score-summation';

    const listView = document.getElementById('list-view');
    const boardView = document.getElementById('board-view');
    const newGameBtn = document.getElementById('new-game-btn');
    const continueBtn = document.getElementById('continue-btn');
    const addPlayerBtn = document.getElementById('add-player-btn');
    const gridScroll = document.getElementById('grid-scroll');
    const scoreGrid = document.getElementById('score-grid');
    const scoreFooterGrid = document.getElementById('score-footer-grid');
    const keyboard = document.getElementById('keyboard');
    const keyboardDisplay = document.getElementById('keyboard-display');
    const keyboardClose = document.getElementById('keyboard-close');
    const toastEl = document.getElementById('toast');

    let persons = [];
    let summationScores = [''];
    let showKeyboard = false;
    let currentPersonIndex = -1;
    let currentScoreIndex = -1;
    let tempValue = '';
    let toastTimer = null;
    let boardHistoryPushed = false;

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    function showToast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add('is-visible');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toastEl.classList.remove('is-visible');
        }, 2200);
    }

    function defaultPersons() {
        return [
            { name: '', scores: [''], totalScores: 0 },
            { name: '', scores: [''], totalScores: 0 }
        ];
    }

    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_PERSONS, JSON.stringify(persons));
            localStorage.setItem(STORAGE_SUMMATION, JSON.stringify(summationScores));
        } catch (e) {
            showToast(tr('tools.cardScore.saveFailed'));
        }
    }

    function loadFromStorage() {
        try {
            const storedPersons = localStorage.getItem(STORAGE_PERSONS);
            const storedSummation = localStorage.getItem(STORAGE_SUMMATION);
            if (!storedPersons) return false;
            persons = JSON.parse(storedPersons);
            summationScores = storedSummation ? JSON.parse(storedSummation) : [''];
            if (!Array.isArray(persons) || !persons.length) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    function scoreClass(value) {
        const n = parseInt(value, 10);
        if (!isNaN(n) && n < 0) return 'negative';
        return '';
    }

    function applyListView() {
        hideKeyboard();
        document.body.classList.remove('card-score-board-active');
        listView.hidden = false;
        listView.classList.add('is-active');
        boardView.hidden = true;
        boardView.classList.remove('is-active');
        updateScrollLayout();
    }

    function showListView(fromPopState) {
        if (!fromPopState && boardHistoryPushed) {
            history.back();
            return;
        }
        boardHistoryPushed = false;
        applyListView();
    }

    function showBoardView() {
        document.body.classList.add('card-score-board-active');
        listView.hidden = true;
        listView.classList.remove('is-active');
        boardView.hidden = false;
        boardView.classList.add('is-active');
        history.pushState({ cardScoreView: 'board' }, '');
        boardHistoryPushed = true;
        recalculate();
        updateScrollLayout();
    }

    function isBoardVisible() {
        return !boardView.hidden;
    }

    function isMobileBoard() {
        return window.matchMedia('(max-width: 768px)').matches && isBoardVisible();
    }

    function syncViewportInsets() {
        const vv = window.visualViewport;
        if (!vv) {
            document.documentElement.style.removeProperty('--cs-vv-offset-bottom');
            document.documentElement.style.removeProperty('--cs-vv-height');
            return;
        }

        const bottomInset = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
        document.documentElement.style.setProperty('--cs-vv-offset-bottom', bottomInset + 'px');
        document.documentElement.style.setProperty('--cs-vv-height', vv.height + 'px');
    }

    function updateScrollLayout() {
        syncViewportInsets();

        if (!gridScroll || !boardView) return;

        if (!isMobileBoard()) {
            gridScroll.style.removeProperty('max-height');
            boardView.style.removeProperty('padding-bottom');
            document.documentElement.style.removeProperty('--cs-keyboard-height');
            return;
        }

        requestAnimationFrame(function () {
            if (showKeyboard && keyboard.classList.contains('is-open')) {
                const keyboardHeight = keyboard.offsetHeight;
                boardView.style.paddingBottom = keyboardHeight + 'px';
                document.documentElement.style.setProperty('--cs-keyboard-height', keyboardHeight + 'px');
            } else {
                boardView.style.paddingBottom = '';
                document.documentElement.style.removeProperty('--cs-keyboard-height');
            }

            if (showKeyboard && currentPersonIndex >= 0 && currentScoreIndex >= 0) {
                scrollToCell(currentPersonIndex, currentScoreIndex);
            }
        });
    }

    function updateLayoutMetrics() {
        if (!scoreGrid && !scoreFooterGrid) return;

        if (!isMobileBoard()) {
            [scoreGrid, scoreFooterGrid].forEach(function (grid) {
                if (!grid) return;
                grid.style.removeProperty('--cs-left-width');
                grid.style.removeProperty('--cs-cell-height');
                grid.style.removeProperty('--cs-font-size');
            });
            return;
        }

        const playerCount = Math.max(persons.length, 1);
        const vw = document.documentElement.clientWidth;
        const horizontalPad = 12;
        const leftWidth = playerCount > 6 ? 30 : playerCount > 4 ? 34 : 38;
        const available = vw - horizontalPad - leftWidth;
        const colWidth = available / playerCount;

        let cellHeight = 32;
        let fontSize = 13;

        if (playerCount >= 6) {
            cellHeight = 28;
            fontSize = 10;
        } else if (playerCount >= 5) {
            cellHeight = 30;
            fontSize = 11;
        }

        if (colWidth < 52) fontSize = Math.min(fontSize, 11);
        if (colWidth < 44) fontSize = Math.min(fontSize, 10);
        if (colWidth < 36) fontSize = Math.min(fontSize, 9);

        [scoreGrid, scoreFooterGrid].forEach(function (grid) {
            if (!grid) return;
            grid.style.setProperty('--cs-left-width', leftWidth + 'px');
            grid.style.setProperty('--cs-cell-height', cellHeight + 'px');
            grid.style.setProperty('--cs-font-size', fontSize + 'px');
        });
        updateScrollLayout();
    }

    function startNewGame() {
        persons = defaultPersons();
        summationScores = [''];
        showBoardView();
    }

    function continueGame() {
        if (!loadFromStorage()) {
            showToast(tr('tools.cardScore.noSaved'));
            return;
        }
        showBoardView();
        currentPersonIndex = 0;
        currentScoreIndex = Math.max(0, (persons[0].scores.length || 1) - 1);
        tempValue = persons[0].scores[currentScoreIndex] || '';
        showKeyboardPanel();
        scrollToCell(currentPersonIndex, currentScoreIndex);
    }

    function hideKeyboard() {
        showKeyboard = false;
        currentPersonIndex = -1;
        currentScoreIndex = -1;
        tempValue = '';
        keyboard.classList.remove('is-open');
        keyboard.setAttribute('aria-hidden', 'true');
        gridScroll.classList.remove('keyboard-open');
        document.body.classList.remove('keyboard-open');
        updateScrollLayout();
        renderGrid();
    }

    function showKeyboardPanel() {
        showKeyboard = true;
        keyboard.classList.add('is-open');
        keyboard.setAttribute('aria-hidden', 'false');
        gridScroll.classList.add('keyboard-open');
        document.body.classList.add('keyboard-open');
        updateKeyboardDisplay();
        updateNavKeys();
        renderGrid();
        updateScrollLayout();
    }

    function openCell(personIndex, scoreIndex) {
        currentPersonIndex = personIndex;
        currentScoreIndex = scoreIndex;
        tempValue = persons[personIndex].scores[scoreIndex] || '';
        if (showKeyboard) {
            updateKeyboardDisplay();
            updateNavKeys();
            renderGrid();
            requestAnimationFrame(function () {
                scrollToCell(personIndex, scoreIndex);
            });
            return;
        }
        showKeyboardPanel();
    }

    function updateKeyboardDisplay() {
        keyboardDisplay.textContent = tempValue || tr('tools.cardScore.keyboardPlaceholder');
    }

    function updateNavKeys() {
        keyboard.querySelectorAll('[data-key="prev"]').forEach(function (btn) {
            btn.disabled = currentPersonIndex <= 0;
        });
        keyboard.querySelectorAll('[data-key="next"]').forEach(function (btn) {
            btn.disabled = currentPersonIndex >= persons.length - 1;
        });
    }

    function scrollToCell(personIndex, scoreIndex) {
        const cell = document.getElementById('score-' + personIndex + '-' + scoreIndex);
        if (!cell || !gridScroll) return;

        if (isMobileBoard()) {
            const scrollRect = gridScroll.getBoundingClientRect();
            const cellRect = cell.getBoundingClientRect();
            const margin = 8;

            if (cellRect.top < scrollRect.top + margin) {
                gridScroll.scrollTop -= scrollRect.top - cellRect.top + margin;
            } else if (cellRect.bottom > scrollRect.bottom - margin) {
                gridScroll.scrollTop += cellRect.bottom - scrollRect.bottom + margin;
            }
            return;
        }

        cell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    function moveToNextInput() {
        if (currentPersonIndex < persons.length - 1) {
            currentPersonIndex += 1;
            tempValue = persons[currentPersonIndex].scores[currentScoreIndex] || '';
            updateKeyboardDisplay();
            updateNavKeys();
            renderGrid();
            scrollToCell(currentPersonIndex, currentScoreIndex);
        }
    }

    function moveToPrevInput() {
        if (currentPersonIndex > 0) {
            currentPersonIndex -= 1;
            tempValue = persons[currentPersonIndex].scores[currentScoreIndex] || '';
            updateKeyboardDisplay();
            updateNavKeys();
            renderGrid();
            scrollToCell(currentPersonIndex, currentScoreIndex);
        }
    }

    function onKeyboardClick(key) {
        if (currentPersonIndex < 0 || currentScoreIndex < 0) return;

        if (key === 'delete') {
            tempValue = tempValue.slice(0, -1);
        } else if (key === 'prev') {
            moveToPrevInput();
            return;
        } else if (key === 'next') {
            moveToNextInput();
            return;
        } else if (key === '-') {
            tempValue = tempValue.startsWith('-') ? tempValue.substring(1) : '-' + tempValue;
        } else {
            if (tempValue.length < 4) {
                if (tempValue === '0') {
                    tempValue = key;
                } else if (tempValue === '-0') {
                    tempValue = '-' + key;
                } else {
                    tempValue += key;
                }
            }
        }

        persons[currentPersonIndex].scores[currentScoreIndex] = tempValue;
        updateKeyboardDisplay();
        recalculate();
    }

    function recalculate() {
        for (let i = 0; i < persons.length; i++) {
            let tempScores = 0;
            for (let j = 0; j < persons[i].scores.length; j++) {
                tempScores += parseInt(persons[i].scores[j], 10) || 0;
            }
            persons[i].totalScores = tempScores;
        }

        for (let i = 0; i < summationScores.length; i++) {
            let colTotal = 0;
            for (let j = 0; j < persons.length; j++) {
                colTotal += parseInt(persons[j].scores[i], 10) || 0;
            }
            summationScores[i] = colTotal;
        }

        saveToStorage();

        let inputNum = 0;
        for (let i = 0; i < persons.length; i++) {
            for (let j = 0; j < persons[i].scores.length; j++) {
                inputNum += Number(Boolean(persons[i].scores[j]));
            }
        }

        const colCount = persons[0] ? persons[0].scores.length : 0;
        if (persons.length > 0 && colCount > 0 && inputNum === persons.length * colCount) {
            const newScoreIndex = colCount;
            for (let i = 0; i < persons.length; i++) {
                persons[i].scores.push('');
            }
            summationScores.push('');
            saveToStorage();
            currentPersonIndex = 0;
            currentScoreIndex = newScoreIndex;
            tempValue = '';
            updateKeyboardDisplay();
            updateNavKeys();
            renderGrid();
            updateScrollLayout();
            requestAnimationFrame(function () {
                scrollToCell(0, newScoreIndex);
            });
            return;
        }

        renderGrid();
    }

    function renderGrid() {
        if (!scoreGrid || !scoreFooterGrid) return;

        const roundCount = persons[0] ? persons[0].scores.length : 0;

        const scoresLeft = document.createElement('div');
        scoresLeft.className = 'card-score-left';

        for (let r = 0; r < roundCount; r++) {
            const cell = document.createElement('div');
            cell.className = 'card-score-cell is-round-total';
            cell.textContent = summationScores[r] !== '' && summationScores[r] !== undefined ? summationScores[r] : '';
            scoresLeft.appendChild(cell);
        }

        const scoresPlayers = document.createElement('div');
        scoresPlayers.className = 'card-score-players';

        persons.forEach(function (person, personIndex) {
            const col = document.createElement('div');
            col.className = 'card-score-player-col';

            person.scores.forEach(function (score, scoreIndex) {
                const cell = document.createElement('div');
                cell.className = 'card-score-cell is-score ' + scoreClass(score);
                cell.id = 'score-' + personIndex + '-' + scoreIndex;
                if (showKeyboard && currentPersonIndex === personIndex && currentScoreIndex === scoreIndex) {
                    cell.classList.add('active');
                }
                const text = score !== undefined && score !== null ? String(score) : '';
                if (showKeyboard && currentPersonIndex === personIndex && currentScoreIndex === scoreIndex) {
                    cell.innerHTML = text + '<span class="cursor">|</span>';
                } else {
                    cell.textContent = text;
                }
                cell.addEventListener('click', function () {
                    openCell(personIndex, scoreIndex);
                });
                col.appendChild(cell);
            });

            scoresPlayers.appendChild(col);
        });

        scoreGrid.innerHTML = '';
        scoreGrid.appendChild(scoresLeft);
        scoreGrid.appendChild(scoresPlayers);

        const footerLeft = document.createElement('div');
        footerLeft.className = 'card-score-left';

        ['rowTotal', 'rowName', 'rowActions'].forEach(function (labelKey) {
            const cell = document.createElement('div');
            cell.className = 'card-score-cell is-label';
            cell.textContent = tr('tools.cardScore.' + labelKey);
            footerLeft.appendChild(cell);
        });

        const footerPlayers = document.createElement('div');
        footerPlayers.className = 'card-score-players';

        persons.forEach(function (person, personIndex) {
            const col = document.createElement('div');
            col.className = 'card-score-player-col';

            const totalCell = document.createElement('div');
            totalCell.className = 'card-score-cell is-player-total';
            totalCell.textContent = person.totalScores !== undefined && person.totalScores !== '' ? person.totalScores : 0;
            col.appendChild(totalCell);

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'card-score-name-input';
            nameInput.maxLength = 12;
            nameInput.value = person.name || '';
            nameInput.placeholder = tr('tools.cardScore.namePlaceholder');
            nameInput.addEventListener('input', function (e) {
                persons[personIndex].name = e.target.value;
                saveToStorage();
            });
            col.appendChild(nameInput);

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'card-score-delete-btn';
            delBtn.textContent = tr('tools.cardScore.delete');
            delBtn.addEventListener('click', function () {
                deletePerson(personIndex);
            });
            col.appendChild(delBtn);

            footerPlayers.appendChild(col);
        });

        scoreFooterGrid.innerHTML = '';
        scoreFooterGrid.appendChild(footerLeft);
        scoreFooterGrid.appendChild(footerPlayers);

        updateLayoutMetrics();
    }

    function addPerson() {
        if (!window.confirm(tr('tools.cardScore.addPlayerConfirm'))) return;
        const colLen = persons[0] ? persons[0].scores.length : 1;
        persons.push({
            name: '',
            scores: new Array(colLen).fill('0'),
            totalScores: 0
        });
        recalculate();
    }

    function deletePerson(personIndex) {
        const name = persons[personIndex].name || tr('tools.cardScore.unnamedPlayer');
        if (!window.confirm(tr('tools.cardScore.deleteConfirm', { name: name }))) return;
        persons.splice(personIndex, 1);
        if (!persons.length) {
            persons = defaultPersons();
        }
        hideKeyboard();
        recalculate();
    }

    newGameBtn.addEventListener('click', startNewGame);
    continueBtn.addEventListener('click', continueGame);
    addPlayerBtn.addEventListener('click', addPerson);
    keyboardClose.addEventListener('click', hideKeyboard);

    window.addEventListener('popstate', function () {
        if (boardHistoryPushed && isBoardVisible()) {
            boardHistoryPushed = false;
            applyListView();
        }
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateScrollLayout);
        window.visualViewport.addEventListener('scroll', updateScrollLayout);
    }

    keyboard.querySelectorAll('.card-score-key').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const key = btn.getAttribute('data-key');
            if (key) onKeyboardClick(key);
        });
    });

    document.addEventListener('tb:locale', function () {
        if (isBoardVisible()) renderGrid();
        if (showKeyboard) updateKeyboardDisplay();
    });

    window.addEventListener('resize', function () {
        updateLayoutMetrics();
        updateScrollLayout();
    });
    window.addEventListener('orientationchange', function () {
        setTimeout(function () {
            updateLayoutMetrics();
            updateScrollLayout();
        }, 100);
    });

    applyListView();
});
