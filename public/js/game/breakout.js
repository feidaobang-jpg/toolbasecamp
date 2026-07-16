(function () {
    'use strict';

    function tr(key, params) {
        return typeof window.t === 'function' ? window.t(key, params) : key;
    }

    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');
    var scoreEl = document.getElementById('score');
    var livesEl = document.getElementById('lives');
    var levelEl = document.getElementById('level');
    var statusEl = document.getElementById('status');
    var startBtn = document.getElementById('start-btn');
    var restartBtn = document.getElementById('restart-btn');

    var W = canvas.width;
    var H = canvas.height;
    var running = false;
    var waiting = true;
    var gameOver = false;
    var score = 0;
    var lives = 3;
    var level = 1;
    var raf = 0;

    var paddle = { w: 80, h: 12, x: W / 2 - 40, y: H - 28, baseW: 80 };
    var balls = [];
    var bricks = [];
    var powerUps = [];
    var cols = 8;
    var rows = 5;
    var pointerX = W / 2;

    var PU_COLORS = { extend: '#22c55e', slow: '#38bdf8', split: '#a855f7' };
    var PU_LABEL = { extend: '长', slow: '慢', split: '分' };

    function setStatus(msg, cls) {
        statusEl.textContent = msg;
        statusEl.className = 'game-status' + (cls ? ' ' + cls : '');
    }

    function syncHud() {
        scoreEl.textContent = String(score);
        livesEl.textContent = String(lives);
        levelEl.textContent = String(level);
    }

    function resetBall(attach) {
        balls = [{
            x: paddle.x + paddle.w / 2,
            y: paddle.y - 10,
            r: 7,
            vx: (Math.random() > 0.5 ? 1 : -1) * (3 + level * 0.2),
            vy: -(3.6 + level * 0.28),
            speedScale: 1
        }];
        if (attach) waiting = true;
    }

    function initBricks() {
        bricks = [];
        cols = Math.min(10, 7 + Math.floor(level / 2));
        rows = Math.min(8, 4 + Math.floor(level / 2));
        var pad = 8;
        var bw = (W - pad * 2) / cols - 4;
        var bh = 16;
        var types = ['extend', 'slow', 'split'];
        var c, r;
        for (r = 0; r < rows; r++) {
            for (c = 0; c < cols; c++) {
                var kind = 'normal';
                if (Math.random() < 0.12) kind = 'hard';
                if (Math.random() < 0.04) kind = 'unbreakable';
                var hasPu = kind === 'normal' && Math.random() < 0.18;
                bricks.push({
                    x: pad + c * (bw + 4),
                    y: 48 + r * (bh + 6),
                    w: bw,
                    h: bh,
                    status: 1,
                    hp: kind === 'hard' ? 2 : 1,
                    kind: kind,
                    powerUp: hasPu ? types[Math.floor(Math.random() * types.length)] : null
                });
            }
        }
        // ensure remaining power-up types appear at least once on early levels
        types.forEach(function (type, ti) {
            var b = bricks[ti % bricks.length];
            if (b.kind === 'normal') {
                b.powerUp = type;
            }
        });
    }

    function resetGame() {
        cancelAnimationFrame(raf);
        score = 0;
        lives = 3;
        level = 1;
        gameOver = false;
        running = false;
        waiting = true;
        paddle.w = paddle.baseW;
        paddle.x = W / 2 - paddle.w / 2;
        powerUps = [];
        initBricks();
        resetBall(true);
        syncHud();
        setStatus(tr('tools.breakout.hint'), 'is-idle');
        draw();
    }

    function nextLevel() {
        level++;
        paddle.w = paddle.baseW;
        powerUps = [];
        initBricks();
        resetBall(true);
        waiting = true;
        running = true;
        syncHud();
        setStatus(tr('tools.breakout.levelUp', { n: level }), 'is-win');
    }

    function spawnPowerUp(brick) {
        if (!brick.powerUp) return;
        powerUps.push({
            x: brick.x + brick.w / 2,
            y: brick.y + brick.h / 2,
            r: 9,
            vy: 0.85,
            type: brick.powerUp
        });
    }

    function applyPowerUp(type) {
        if (type === 'extend') {
            paddle.w = Math.min(160, paddle.w + 24);
            paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
        } else if (type === 'slow') {
            balls.forEach(function (b) {
                b.vx *= 0.85;
                b.vy *= 0.85;
                b.speedScale *= 0.85;
            });
        } else if (type === 'split' && balls.length) {
            var src = balls[0];
            balls.push({
                x: src.x,
                y: src.y,
                r: src.r,
                vx: -src.vx,
                vy: src.vy,
                speedScale: src.speedScale
            });
        }
    }

    function bricksLeft() {
        return bricks.some(function (b) { return b.status && b.kind !== 'unbreakable'; });
    }

    function update() {
        if (!running || gameOver) return;
        paddle.x = Math.max(0, Math.min(W - paddle.w, pointerX - paddle.w / 2));

        if (waiting) {
            balls[0].x = paddle.x + paddle.w / 2;
            balls[0].y = paddle.y - 10;
            return;
        }

        var bi, bj;
        for (bi = balls.length - 1; bi >= 0; bi--) {
            var ball = balls[bi];
            ball.x += ball.vx;
            ball.y += ball.vy;

            if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; }
            if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -1; }
            if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; }

            if (ball.y + ball.r >= paddle.y &&
                ball.y + ball.r <= paddle.y + paddle.h + 8 &&
                ball.x >= paddle.x && ball.x <= paddle.x + paddle.w &&
                ball.vy > 0) {
                var hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
                ball.vx = hit * 1.2 * (ball.speedScale || 1);
                ball.vy = -Math.abs(ball.vy);
                ball.y = paddle.y - ball.r;
            }

            for (bj = 0; bj < bricks.length; bj++) {
                var br = bricks[bj];
                if (!br.status) continue;
                if (ball.x + ball.r < br.x || ball.x - ball.r > br.x + br.w ||
                    ball.y + ball.r < br.y || ball.y - ball.r > br.y + br.h) continue;
                var overlapLeft = (ball.x + ball.r) - br.x;
                var overlapRight = (br.x + br.w) - (ball.x - ball.r);
                var overlapTop = (ball.y + ball.r) - br.y;
                var overlapBottom = (br.y + br.h) - (ball.y - ball.r);
                var minX = Math.min(overlapLeft, overlapRight);
                var minY = Math.min(overlapTop, overlapBottom);
                if (minX < minY) ball.vx *= -1;
                else ball.vy *= -1;

                if (br.kind === 'unbreakable') break;
                br.hp -= 1;
                if (br.hp <= 0) {
                    br.status = 0;
                    score += br.kind === 'hard' ? 20 : 10;
                    spawnPowerUp(br);
                    syncHud();
                    if (!bricksLeft()) {
                        nextLevel();
                        return;
                    }
                }
                break;
            }

            if (ball.y - ball.r > H) {
                balls.splice(bi, 1);
            }
        }

        if (!balls.length) {
            lives -= 1;
            syncHud();
            if (lives <= 0) {
                gameOver = true;
                running = false;
                setStatus(tr('tools.breakout.gameOver'), 'is-lose');
                return;
            }
            paddle.w = paddle.baseW;
            resetBall(true);
            setStatus(tr('tools.breakout.lifeLost'), 'is-idle');
        }

        for (bi = powerUps.length - 1; bi >= 0; bi--) {
            var pu = powerUps[bi];
            pu.y += pu.vy;
            if (pu.y - pu.r > H) {
                powerUps.splice(bi, 1);
                continue;
            }
            if (pu.y + pu.r >= paddle.y &&
                pu.x >= paddle.x && pu.x <= paddle.x + paddle.w) {
                applyPowerUp(pu.type);
                powerUps.splice(bi, 1);
                setStatus(tr('tools.breakout.powerGot', { type: tr('tools.breakout.pu' + pu.type.charAt(0).toUpperCase() + pu.type.slice(1)) }), 'is-win');
            }
        }
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);

        // bricks
        bricks.forEach(function (br) {
            if (!br.status) return;
            if (br.kind === 'unbreakable') ctx.fillStyle = '#64748b';
            else if (br.kind === 'hard') ctx.fillStyle = br.hp > 1 ? '#f59e0b' : '#fbbf24';
            else ctx.fillStyle = '#38bdf8';
            roundRect(br.x, br.y, br.w, br.h, 3);
            ctx.fill();
            if (br.powerUp) {
                ctx.fillStyle = PU_COLORS[br.powerUp];
                ctx.beginPath();
                ctx.arc(br.x + br.w / 2, br.y + br.h / 2, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // paddle
        ctx.fillStyle = '#e2e8f0';
        roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 6);
        ctx.fill();

        // balls
        balls.forEach(function (ball) {
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
            ctx.fill();
        });

        // power-ups
        powerUps.forEach(function (pu) {
            ctx.fillStyle = PU_COLORS[pu.type];
            ctx.beginPath();
            ctx.arc(pu.x, pu.y, pu.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(PU_LABEL[pu.type], pu.x, pu.y + 0.5);
        });

        if (waiting && !gameOver) {
            ctx.fillStyle = 'rgba(248,250,252,0.85)';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(tr('tools.breakout.clickLaunch'), W / 2, H * 0.62);
        }
        if (gameOver) {
            ctx.fillStyle = 'rgba(15,23,42,0.65)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(tr('tools.breakout.gameOver'), W / 2, H / 2);
        }
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function loop() {
        update();
        draw();
        if (running) raf = requestAnimationFrame(loop);
    }

    function setPointerFromEvent(e) {
        var rect = canvas.getBoundingClientRect();
        var clientX = e.clientX;
        if (e.touches && e.touches[0]) clientX = e.touches[0].clientX;
        pointerX = ((clientX - rect.left) / rect.width) * W;
    }

    function launch() {
        if (gameOver) return;
        if (!running) {
            running = true;
            raf = requestAnimationFrame(loop);
        }
        if (waiting && balls.length) {
            waiting = false;
            setStatus(tr('tools.breakout.playing'), 'is-idle');
        }
    }

    canvas.addEventListener('mousemove', setPointerFromEvent);
    canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        setPointerFromEvent(e);
    }, { passive: false });
    canvas.addEventListener('click', launch);
    canvas.addEventListener('touchstart', function (e) {
        setPointerFromEvent(e);
        launch();
    }, { passive: true });

    startBtn.addEventListener('click', function () {
        if (gameOver) resetGame();
        launch();
    });
    restartBtn.addEventListener('click', resetGame);

    resetGame();
})();
