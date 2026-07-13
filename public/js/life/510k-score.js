document.addEventListener('DOMContentLoaded', function () {
    const STORAGE_KEY = 'tb-510k-games';

    const listView = document.getElementById('list-view');
    const scoreView = document.getElementById('score-view');
    const listActions = document.getElementById('list-actions');
    const newGameForm = document.getElementById('new-game-form');
    const newGameBtn = document.getElementById('new-game-btn');
    const cancelFormBtn = document.getElementById('cancel-form-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const team1Inputs = document.getElementById('team1-inputs');
    const team2Inputs = document.getElementById('team2-inputs');
    const perRoundAmountInput = document.getElementById('per-round-amount');
    const perGangAmountInput = document.getElementById('per-gang-amount');
    const formPlayerRadios = document.querySelectorAll('input[name="form-player-count"]');
    const gameListEl = document.getElementById('game-list');
    const emptyHistoryEl = document.getElementById('empty-history');
    const backBtn = document.getElementById('back-btn');
    const settingsInfoEl = document.getElementById('settings-info');
    const roundInputSection = document.getElementById('round-input-section');
    const historyRoundsSection = document.getElementById('history-rounds-section');
    const settledSection = document.getElementById('settled-section');

    let formPlayerCount = 4;
    let team1Players = [{ name: '' }, { name: '' }];
    let team2Players = [{ name: '' }, { name: '' }];
    let currentGameId = null;
    let currentGame = null;
    let roundData = { team1Score: '', team2Score: '', gangCounts: {} };

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

    function loadGames() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveGames(games) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
            return true;
        } catch (e) {
            showToast(tr('tools.k510Score.saveFailed'));
            return false;
        }
    }

    function getGameById(id) {
        return loadGames().find(function (g) {
            return g.id === id;
        }) || null;
    }

    function updateGame(game) {
        const games = loadGames();
        const index = games.findIndex(function (g) {
            return g.id === game.id;
        });
        if (index === -1) return false;
        games[index] = game;
        return saveGames(games);
    }

    function formatTime(iso) {
        const date = new Date(iso);
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatTeamNames(players) {
        return players.map(function (p) { return p.name; }).join('、');
    }

    function halfCount(count) {
        return count / 2;
    }

    function resetFormState() {
        formPlayerCount = 4;
        team1Players = [{ name: '' }, { name: '' }];
        team2Players = [{ name: '' }, { name: '' }];
        formPlayerRadios.forEach(function (radio) {
            radio.checked = radio.value === '4';
        });
        perRoundAmountInput.value = '100';
        perGangAmountInput.value = '5';
        renderTeamInputs();
        checkCanStart();
    }

    function renderTeamInputs() {
        team1Inputs.innerHTML = '';
        team2Inputs.innerHTML = '';

        team1Players.forEach(function (player, index) {
            team1Inputs.appendChild(createPlayerInput(1, index, player.name));
        });
        team2Players.forEach(function (player, index) {
            team2Inputs.appendChild(createPlayerInput(2, index, player.name));
        });
    }

    function createPlayerInput(team, index, value) {
        const row = document.createElement('div');
        row.className = 'k510-player-row';

        const label = document.createElement('label');
        label.textContent = tr('tools.k510Score.memberLabel', { n: index + 1 });

        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.placeholder = tr('tools.k510Score.namePlaceholder');
        input.dataset.team = String(team);
        input.dataset.index = String(index);
        input.addEventListener('input', onPlayerNameChange);

        row.appendChild(label);
        row.appendChild(input);
        return row;
    }

    function onPlayerCountChange(count) {
        formPlayerCount = count;
        const half = halfCount(count);

        team1Players = Array.from({ length: half }, function (_, i) {
            return i < team1Players.length ? { name: team1Players[i].name } : { name: '' };
        });
        team2Players = Array.from({ length: half }, function (_, i) {
            return i < team2Players.length ? { name: team2Players[i].name } : { name: '' };
        });

        renderTeamInputs();
        checkCanStart();
    }

    function onPlayerNameChange(e) {
        const team = parseInt(e.target.dataset.team, 10);
        const index = parseInt(e.target.dataset.index, 10);
        const value = e.target.value;
        const list = team === 1 ? team1Players : team2Players;
        list[index].name = value;
        checkCanStart();
    }

    function checkCanStart() {
        const allNamed = team1Players.every(function (p) { return p.name.trim(); }) &&
            team2Players.every(function (p) { return p.name.trim(); });
        startGameBtn.disabled = !allNamed;
    }

    function showListView(skipHistory) {
        currentGameId = null;
        currentGame = null;
        listView.hidden = false;
        scoreView.hidden = true;
        newGameForm.hidden = true;
        listActions.hidden = false;
        renderGameList();
        if (!skipHistory && window.history && window.history.replaceState) {
            const url = new URL(window.location.href);
            url.searchParams.delete('gameId');
            window.history.replaceState({ view: 'list' }, '', url.pathname + url.search);
        }
    }

    function showScoreView(gameId, skipHistory) {
        const game = getGameById(gameId);
        if (!game) {
            showToast(tr('tools.k510Score.gameNotFound'));
            showListView(skipHistory);
            return;
        }

        currentGameId = gameId;
        currentGame = JSON.parse(JSON.stringify(game));
        roundData = { team1Score: '', team2Score: '', gangCounts: {} };

        listView.hidden = true;
        scoreView.hidden = false;
        renderScoreView();

        if (!skipHistory && window.history) {
            const url = new URL(window.location.href);
            url.searchParams.set('gameId', String(gameId));
            const nextUrl = url.pathname + url.search;
            if (skipHistory === 'replace') {
                window.history.replaceState({ view: 'score', gameId: gameId }, '', nextUrl);
            } else {
                window.history.pushState({ view: 'score', gameId: gameId }, '', nextUrl);
            }
        }
    }

    function renderGameList() {
        const games = loadGames();
        gameListEl.innerHTML = '';

        if (!games.length) {
            emptyHistoryEl.hidden = false;
            return;
        }

        emptyHistoryEl.hidden = true;
        const list = document.createElement('div');
        list.className = 'k510-game-list';

        games.forEach(function (game) {
            const item = document.createElement('div');
            item.className = 'k510-game-item';
            item.dataset.id = String(game.id);

            item.innerHTML =
                '<div class="k510-game-header">' +
                    '<span class="k510-game-time">' + formatTime(game.createTime) + '</span>' +
                    '<span class="k510-game-count">' + tr('tools.k510Score.playerCountLabel', { count: game.settings.playerCount }) + '</span>' +
                '</div>' +
                '<div class="k510-game-teams">' +
                    '<div><span class="k510-game-team-label">' + tr('tools.k510Score.teamA') + '：</span>' + formatTeamNames(game.teams.team1) + '</div>' +
                    '<div><span class="k510-game-team-label">' + tr('tools.k510Score.teamB') + '：</span>' + formatTeamNames(game.teams.team2) + '</div>' +
                '</div>' +
                '<div class="k510-game-footer">' +
                    '<span>' + tr('tools.k510Score.roundsPlayed', { count: (game.rounds || []).length }) + '</span>' +
                    '<span class="' + (game.isSettled ? 'k510-game-settled' : '') + '">' +
                        (game.isSettled ? tr('tools.k510Score.settled') : tr('tools.k510Score.inProgress')) +
                    '</span>' +
                '</div>';

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'k510-delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.setAttribute('aria-label', tr('tools.k510Score.delete'));
            deleteBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                deleteGame(game.id);
            });

            item.addEventListener('click', function () {
                showScoreView(game.id);
            });

            item.appendChild(deleteBtn);
            list.appendChild(item);
        });

        gameListEl.appendChild(list);
    }

    function deleteGame(id) {
        if (!window.confirm(tr('tools.k510Score.deleteConfirm'))) return;
        const games = loadGames().filter(function (g) { return g.id !== id; });
        saveGames(games);
        if (currentGameId === id) {
            showListView();
        } else {
            renderGameList();
        }
        showToast(tr('tools.k510Score.deleted'));
    }

    function onStartGame() {
        const perRoundAmount = parseInt(perRoundAmountInput.value, 10);
        const perGangAmount = parseInt(perGangAmountInput.value, 10);

        if (!perRoundAmount) {
            showToast(tr('tools.k510Score.needPerRoundAmount'));
            return;
        }
        if (!perGangAmount) {
            showToast(tr('tools.k510Score.needPerGangAmount'));
            return;
        }

        const allPlayers = team1Players.concat(team2Players);
        const gameData = {
            id: Date.now(),
            createTime: new Date().toISOString(),
            settings: {
                playerCount: formPlayerCount,
                perRoundAmount: perRoundAmount,
                perGangAmount: perGangAmount
            },
            teams: {
                team1: team1Players.map(function (p) { return { name: p.name.trim() }; }),
                team2: team2Players.map(function (p) { return { name: p.name.trim() }; })
            },
            rounds: [],
            totalScores: allPlayers.map(function (p) {
                return { name: p.name.trim(), score: 0, gangCount: 0, totalAmount: 0 };
            }),
            finalScores: { team1TotalScore: 0, team2TotalScore: 0 },
            isSettled: false
        };

        const games = loadGames();
        games.unshift(gameData);
        if (!saveGames(games)) return;

        resetFormState();
        showScoreView(gameData.id);
    }

    function renderScoreView() {
        if (!currentGame) return;

        const settings = currentGame.settings;
        settingsInfoEl.innerHTML =
            '<span>' + tr('tools.k510Score.perRoundInfo', { amount: settings.perRoundAmount }) + '</span>' +
            '<span>' + tr('tools.k510Score.perGangInfo', { amount: settings.perGangAmount }) + '</span>';

        renderRoundInput();
        renderRoundHistory();
        renderSettledPanel();
    }

    function allPlayers() {
        return currentGame.teams.team1.concat(currentGame.teams.team2);
    }

    function renderRoundInput() {
        roundInputSection.innerHTML = '';
        if (currentGame.isSettled) return;

        const panel = document.createElement('div');
        panel.className = 'k510-round-panel';

        const title = document.createElement('div');
        title.className = 'k510-round-title';
        title.textContent = tr('tools.k510Score.roundTitle', { n: currentGame.rounds.length + 1 });
        panel.appendChild(title);

        const teamScores = document.createElement('div');
        teamScores.className = 'k510-team-scores';

        teamScores.appendChild(createScoreField(tr('tools.k510Score.teamAScore'), roundData.team1Score, function (value) {
            roundData.team1Score = value;
        }));
        teamScores.appendChild(createScoreField(tr('tools.k510Score.teamBScore'), roundData.team2Score, function (value) {
            roundData.team2Score = value;
        }));
        panel.appendChild(teamScores);

        const gangTitle = document.createElement('div');
        gangTitle.className = 'k510-section-title';
        gangTitle.textContent = tr('tools.k510Score.recordGang');
        panel.appendChild(gangTitle);

        const gangGrid = document.createElement('div');
        gangGrid.className = 'k510-gang-grid';
        allPlayers().forEach(function (player, index) {
            const item = document.createElement('div');
            item.className = 'k510-gang-item';

            const name = document.createElement('span');
            name.className = 'k510-gang-label';
            name.textContent = tr('tools.k510Score.memberLabel', { n: index + 1 }) + ' ' + player.name;

            const input = document.createElement('input');
            input.type = 'text';
            input.inputMode = 'numeric';
            input.maxLength = 2;
            input.value = roundData.gangCounts[player.name] ? String(roundData.gangCounts[player.name]) : '';
            input.addEventListener('input', function () {
                const digits = input.value.replace(/\D/g, '');
                input.value = digits;
                if (digits === '') {
                    delete roundData.gangCounts[player.name];
                } else {
                    roundData.gangCounts[player.name] = parseInt(digits, 10) || 0;
                }
            });

            item.appendChild(name);
            item.appendChild(input);
            gangGrid.appendChild(item);
        });
        panel.appendChild(gangGrid);

        const actions = document.createElement('div');
        actions.className = 'k510-round-actions';

        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'tb-btn';
        submitBtn.textContent = tr('tools.k510Score.submitRound');
        submitBtn.addEventListener('click', submitRound);

        const settleBtn = document.createElement('button');
        settleBtn.type = 'button';
        settleBtn.className = 'tb-btn k510-btn-settle';
        settleBtn.textContent = tr('tools.k510Score.settleGame');
        settleBtn.addEventListener('click', settleGame);

        actions.appendChild(submitBtn);
        actions.appendChild(settleBtn);
        panel.appendChild(actions);

        roundInputSection.appendChild(panel);
    }

    function createScoreField(label, value, onChange) {
        const field = document.createElement('div');
        field.className = 'k510-score-field';

        const text = document.createElement('span');
        text.textContent = label + '：';

        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'numeric';
        input.value = value;
        input.addEventListener('input', function () {
            onChange(input.value);
        });

        field.appendChild(text);
        field.appendChild(input);
        return field;
    }

    function submitRound() {
        const team1Score = roundData.team1Score;
        const team2Score = roundData.team2Score;

        if (!team1Score || !team2Score) {
            showToast(tr('tools.k510Score.needBothScores'));
            return;
        }

        const round = {
            team1Score: parseInt(team1Score, 10),
            team2Score: parseInt(team2Score, 10),
            gangRecords: Object.keys(roundData.gangCounts || {}).map(function (name) {
                return { name: name, count: roundData.gangCounts[name] || 0 };
            }).filter(function (record) { return record.count > 0; })
        };

        currentGame.rounds.push(round);

        let team1TotalScore = 0;
        let team2TotalScore = 0;
        currentGame.rounds.forEach(function (r) {
            team1TotalScore += r.team1Score;
            team2TotalScore += r.team2Score;
        });
        currentGame.finalScores = { team1TotalScore: team1TotalScore, team2TotalScore: team2TotalScore };

        updateGame(currentGame);
        roundData = { team1Score: '', team2Score: '', gangCounts: {} };
        renderScoreView();
    }

    function settleGame() {
        if (!currentGame.rounds.length) {
            showToast(tr('tools.k510Score.needOneRound'));
            return;
        }

        const perRoundAmount = currentGame.settings.perRoundAmount;
        const perGangAmount = currentGame.settings.perGangAmount;
        const team1 = currentGame.teams.team1;
        const team2 = currentGame.teams.team2;

        const totalScores = allPlayers().map(function (player) {
            return { name: player.name, score: 0, gangCount: 0, totalAmount: 0 };
        });

        let team1TotalScore = 0;
        let team2TotalScore = 0;

        currentGame.rounds.forEach(function (round) {
            team1TotalScore += round.team1Score;
            team2TotalScore += round.team2Score;

            round.gangRecords.forEach(function (record) {
                const playerScore = totalScores.find(function (s) { return s.name === record.name; });
                if (playerScore) {
                    playerScore.gangCount += record.count;
                }
            });
        });

        const team1Win = team1TotalScore > team2TotalScore;

        team1.forEach(function (player) {
            const playerScore = totalScores.find(function (s) { return s.name === player.name; });
            if (playerScore) {
                playerScore.score += team1Win ? perRoundAmount : -perRoundAmount;
            }
        });

        team2.forEach(function (player) {
            const playerScore = totalScores.find(function (s) { return s.name === player.name; });
            if (playerScore) {
                playerScore.score += team1Win ? -perRoundAmount : perRoundAmount;
            }
        });

        team1.forEach(function (player1) {
            const player1Score = totalScores.find(function (s) { return s.name === player1.name; });
            if (!player1Score) return;

            team2.forEach(function (player2) {
                const player2Score = totalScores.find(function (s) { return s.name === player2.name; });
                if (!player2Score) return;

                const gangDiff = player1Score.gangCount - player2Score.gangCount;
                const gangAmount = gangDiff * perGangAmount;
                player1Score.score += gangAmount;
                player2Score.score -= gangAmount;
            });
        });

        totalScores.forEach(function (score) {
            score.totalAmount = score.score;
        });

        currentGame.totalScores = totalScores;
        currentGame.isSettled = true;
        currentGame.finalScores = { team1TotalScore: team1TotalScore, team2TotalScore: team2TotalScore };
        updateGame(currentGame);
        renderScoreView();
    }

    function renderRoundHistory() {
        historyRoundsSection.innerHTML = '';
        if (!currentGame.rounds.length) return;

        const panel = document.createElement('div');
        panel.className = 'k510-round-history';

        const title = document.createElement('div');
        title.className = 'k510-section-title';
        title.textContent = tr('tools.k510Score.roundHistory');
        panel.appendChild(title);

        currentGame.rounds.forEach(function (round, index) {
            const item = document.createElement('div');
            item.className = 'k510-round-item';

            const header = document.createElement('div');
            header.className = 'k510-round-header';
            header.innerHTML =
                '<span>' + tr('tools.k510Score.roundLabel', { n: index + 1 }) + '</span>' +
                '<span>' + tr('tools.k510Score.roundScoreLine', {
                    teamA: round.team1Score,
                    teamB: round.team2Score
                }) + '</span>';

            item.appendChild(header);

            if (round.gangRecords.length) {
                const gangs = document.createElement('div');
                gangs.className = 'k510-gang-records';
                round.gangRecords.forEach(function (record) {
                    const span = document.createElement('span');
                    span.textContent = tr('tools.k510Score.gangRecord', {
                        name: record.name,
                        count: record.count
                    });
                    gangs.appendChild(span);
                });
                item.appendChild(gangs);
            }

            if (index === currentGame.rounds.length - 1) {
                const total = document.createElement('div');
                total.className = 'k510-game-total';
                total.innerHTML =
                    '<div>' + tr('tools.k510Score.currentGameTotal') + '</div>' +
                    '<div>' + tr('tools.k510Score.roundScoreLine', {
                        teamA: currentGame.finalScores.team1TotalScore,
                        teamB: currentGame.finalScores.team2TotalScore
                    }) + '</div>';
                item.appendChild(total);
            }

            panel.appendChild(item);
        });

        historyRoundsSection.appendChild(panel);
    }

    function renderSettledPanel() {
        settledSection.innerHTML = '';
        if (!currentGame.isSettled) return;

        const panel = document.createElement('div');
        panel.className = 'k510-settled-panel';

        const title = document.createElement('div');
        title.className = 'k510-section-title';
        title.textContent = tr('tools.k510Score.finalSettlement');
        panel.appendChild(title);

        const scores = document.createElement('div');
        scores.className = 'k510-final-scores';

        currentGame.totalScores.forEach(function (item) {
            const row = document.createElement('div');
            row.className = 'k510-player-score';

            const name = document.createElement('span');
            name.textContent = item.name;

            const amount = document.createElement('span');
            amount.className = item.totalAmount >= 0 ? 'k510-amount-positive' : 'k510-amount-negative';
            amount.textContent = tr('tools.k510Score.amountValue', { amount: item.totalAmount });

            row.appendChild(name);
            row.appendChild(amount);
            scores.appendChild(row);
        });
        panel.appendChild(scores);

        const newRoundBtn = document.createElement('button');
        newRoundBtn.type = 'button';
        newRoundBtn.className = 'tb-btn w-full';
        newRoundBtn.textContent = tr('tools.k510Score.startNewGame');
        newRoundBtn.addEventListener('click', startNewGameFromSettled);
        panel.appendChild(newRoundBtn);

        settledSection.appendChild(panel);
    }

    function startNewGameFromSettled() {
        const teams = {
            team1: currentGame.teams.team1.map(function (p) { return { name: p.name }; }),
            team2: currentGame.teams.team2.map(function (p) { return { name: p.name }; })
        };
        const players = teams.team1.concat(teams.team2);

        const newGame = {
            id: Date.now(),
            createTime: new Date().toISOString(),
            settings: Object.assign({}, currentGame.settings),
            teams: teams,
            rounds: [],
            finalScores: { team1TotalScore: 0, team2TotalScore: 0 },
            totalScores: players.map(function (player) {
                return { name: player.name, score: 0, gangCount: 0, totalAmount: 0 };
            }),
            isSettled: false
        };

        const games = loadGames();
        games.unshift(newGame);
        if (!saveGames(games)) return;
        showScoreView(newGame.id);
    }

    newGameBtn.addEventListener('click', function () {
        listActions.hidden = true;
        newGameForm.hidden = false;
    });

    cancelFormBtn.addEventListener('click', function () {
        resetFormState();
        newGameForm.hidden = true;
        listActions.hidden = false;
    });

    startGameBtn.addEventListener('click', onStartGame);

    formPlayerRadios.forEach(function (radio) {
        radio.addEventListener('change', function () {
            if (radio.checked) {
                onPlayerCountChange(parseInt(radio.value, 10));
            }
        });
    });

    backBtn.addEventListener('click', showListView);

    window.addEventListener('popstate', function () {
        const params = new URLSearchParams(window.location.search);
        const gameId = params.get('gameId');
        if (gameId) {
            showScoreView(parseInt(gameId, 10), true);
        } else {
            showListView(true);
        }
    });

    renderTeamInputs();

    const initialParams = new URLSearchParams(window.location.search);
    const initialGameId = initialParams.get('gameId');
    if (initialGameId) {
        showScoreView(parseInt(initialGameId, 10), 'replace');
    } else {
        renderGameList();
    }
});
