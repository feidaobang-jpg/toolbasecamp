/**
 * Super Mario - Classic Platformer Game
 * A side-scrolling platform game with coins, enemies, and lives.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const scoreEl = document.getElementById('score');
  const coinsEl = document.getElementById('coins');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const restartBtn = document.getElementById('restart-btn');

  // Touch controls
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnJump = document.getElementById('btn-jump');

  // Show touch controls only on touch devices
  const touchControls = document.getElementById('touch-controls');
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) {
    if (touchControls) touchControls.style.display = 'none';
  }

  const W = 480, H = 320;
  const GRAVITY = 0.55;
  const FRICTION = 0.82;
  const MOVE_SPEED = 2.8;
  const JUMP_FORCE = -8.5;
  const TILE = 20;

  // ==================== Game State ====================
  let score = 0, coinCount = 0, lives = 3, level = 1;
  let cameraX = 0, gameOver = false, gameStarted = false;
  let player, platforms = [], coins = [], enemies = [];
  let keys = { left: false, right: false, jump: false, jumpPressed: false };

  // ==================== Level Data ====================
  function buildLevel(levelNum) {
    const p = [], c = [], e = [];
    const levelWidth = 800 + levelNum * 300;

    // Ground platform (full width)
    for (let x = 0; x < levelWidth; x += TILE) {
      p.push({ x: x, y: H - TILE, w: TILE, h: TILE, type: 'ground' });
    }

    // Floating platforms
    const platCount = 4 + levelNum * 2;
    for (let i = 0; i < platCount; i++) {
      const pw = TILE * (3 + Math.floor(Math.random() * 4));
      const px = 120 + i * (levelWidth / platCount) + (Math.random() - 0.5) * 60;
      const py = 60 + Math.random() * 140;
      for (let tx = px; tx < px + pw; tx += TILE) {
        p.push({ x: Math.round(tx / TILE) * TILE, y: Math.round(py / TILE) * TILE, w: TILE, h: TILE, type: 'float' });
      }
    }

    // Coins
    const coinNum = 6 + levelNum * 3;
    for (let i = 0; i < coinNum; i++) {
      const cx = 180 + (levelWidth / coinNum) * i + (Math.random() - 0.5) * 80;
      const cy = 40 + Math.random() * 60;
      // Place coins above platforms or on ground
      const abovePlat = p.find(pl => Math.abs(pl.x - cx) < TILE * 2 && cy + TILE >= pl.y);
      const cy2 = abovePlat ? abovePlat.y - TILE - Math.random() * 40 : cy;
      if (cy2 > 20) c.push({ x: cx, y: Math.max(30, cy2), r: 8, collected: false });
    }

    // Enemies (Goombas)
    const enemyCount = 3 + levelNum;
    for (let i = 0; i < enemyCount; i++) {
      const ex = 250 + i * (levelWidth / enemyCount) + Math.random() * 100;
      e.push({ x: ex, y: 0, w: 18, h: 18, vx: 0.6 + Math.random() * 0.6, vy: 0, alive: true, dir: Math.random() > 0.5 ? 1 : -1, anime: 0 });
      // Place enemies on nearest platform below
      let bestY = H - TILE - 18;
      for (const pl of p) {
        if (Math.abs(pl.x - ex) < TILE * 3 && pl.y < bestY) bestY = pl.y;
      }
      e[i].y = bestY - 18;
    }

    return { platforms: p, coins: c, enemies: e, width: levelWidth };
  }

  let levelData;

  function initGame() {
    score = 0; coinCount = 0; lives = 3; level = 1;
    cameraX = 0; gameOver = false; gameStarted = false;
    keys = { left: false, right: false, jump: false, jumpPressed: false };
    levelData = buildLevel(level);
    platforms = levelData.platforms;
    coins = levelData.coins;
    enemies = levelData.enemies;
    player = {
      x: 60, y: 100, w: 16, h: 22, vx: 0, vy: 0,
      onGround: false, facing: 1, animeFrame: 0, animeTimer: 0,
      invincible: 0
    };
    updateHUD();
    statusEl.className = 'game-status is-running';
    statusEl.textContent = getI18n('tools.superMario.hint') || 'Arrow keys / WASD to move, Space / \u2191 to jump. Stomp enemies from above!';
  }

  function nextLevel() {
    level++;
    levelData = buildLevel(level);
    platforms = levelData.platforms;
    coins = levelData.coins;
    enemies = levelData.enemies;
    player.x = 60; player.y = 100; player.vx = 0; player.vy = 0;
    player.onGround = false; player.invincible = 30;
    cameraX = 0;
    statusEl.textContent = (getI18n('tools.superMario.levelUp') || 'Level {0}!').replace('{0}', level);
    updateHUD();
  }

  function updateHUD() {
    scoreEl.textContent = score;
    coinsEl.textContent = coinCount;
    livesEl.textContent = lives;
    levelEl.textContent = level;
  }

  function loseLife() {
    if (player.invincible > 0) return;
    lives--;
    updateHUD();
    if (lives <= 0) {
      gameOver = true;
      statusEl.className = 'game-status game-over';
      statusEl.textContent = (getI18n('tools.superMario.gameOver') || 'Game Over! Final Score: {0}').replace('{0}', score);
      return;
    }
    player.invincible = 60;
    player.vy = JUMP_FORCE * 0.5;
    statusEl.className = 'game-status is-active';
    statusEl.textContent = (getI18n('tools.superMario.lostLife') || 'Lives left: {0}').replace('{0}', lives);
    setTimeout(() => {
      if (!gameOver) {
        statusEl.className = 'game-status is-running';
        statusEl.textContent = getI18n('tools.superMario.hint') || '';
      }
    }, 1500);
  }

  // ==================== Collision Detection ====================
  function rectCollide(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ==================== Update ====================
  function update() {
    if (gameOver) return;
    gameStarted = true;

    // Player input
    if (keys.left) { player.vx = -MOVE_SPEED; player.facing = -1; }
    else if (keys.right) { player.vx = MOVE_SPEED; player.facing = 1; }
    else { player.vx *= FRICTION; if (Math.abs(player.vx) < 0.1) player.vx = 0; }

    if (keys.jump && !keys.jumpPressed && player.onGround) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
      keys.jumpPressed = true;
    }
    if (!keys.jump) keys.jumpPressed = false;

    // Apply gravity
    player.vy += GRAVITY;
    if (player.vy > 12) player.vy = 12; // terminal velocity

    // Move X
    player.x += player.vx;
    if (player.x < 0) player.x = 0;
    if (player.x > levelData.width - player.w) player.x = levelData.width - player.w;

    // Platform collision X
    for (const pl of platforms) {
      if (rectCollide(player, pl)) {
        if (player.vx > 0) { player.x = pl.x - player.w; }
        else if (player.vx < 0) { player.x = pl.x + pl.w; }
        player.vx = 0;
      }
    }

    // Move Y
    player.y += player.vy;
    player.onGround = false;

    // Platform collision Y
    for (const pl of platforms) {
      if (rectCollide(player, pl)) {
        if (player.vy > 0) {
          player.y = pl.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0) {
          player.y = pl.y + pl.h;
          player.vy = 0;
        }
      }
    }

    // Fall off world
    if (player.y > H + 60) { loseLife(); player.x = 60; player.y = 100; player.vy = 0; player.vx = 0; }

    // Invincibility timer
    if (player.invincible > 0) player.invincible--;

    // Animation timer
    player.animeTimer++;
    if (player.animeTimer > 8) { player.animeTimer = 0; player.animeFrame = (player.animeFrame + 1) % 4; }

    // Update camera
    cameraX = player.x - W * 0.35;
    if (cameraX < 0) cameraX = 0;
    if (cameraX > levelData.width - W) cameraX = levelData.width - W;

    // Update coins
    for (const coin of coins) {
      if (coin.collected) continue;
      const cx = coin.x, cy = coin.y, cr = coin.r;
      const nearX = Math.abs(player.x + player.w / 2 - cx) < cr + 10;
      const nearY = Math.abs(player.y + player.h / 2 - cy) < cr + 10;
      if (nearX && nearY) {
        coin.collected = true;
        coinCount++;
        score += 100;
        updateHUD();
      }
    }

    // Check if all coins collected
    if (coins.every(c => c.collected)) {
      score += 500;
      updateHUD();
      nextLevel();
      return;
    }

    // Update enemies
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.anime += 0.1;

      // Apply gravity to enemy
      enemy.vy += GRAVITY * 0.8;
      enemy.y += enemy.vy;

      // Enemy platform collision
      let onPlat = false;
      for (const pl of platforms) {
        if (rectCollide(enemy, pl)) {
          enemy.y = pl.y - enemy.h;
          enemy.vy = 0;
          onPlat = true;
        }
      }
      if (!onPlat && enemy.y > H + 100) { enemy.alive = false; }

      // Enemy movement
      enemy.x += enemy.vx * enemy.dir;
      // Reverse at platform edges
      let edgePlat = false;
      for (const pl of platforms) {
        if (rectCollide(enemy, pl)) edgePlat = true;
      }
      // Check if enemy is about to walk off edge
      let hasGroundBelow = false;
      for (const pl of platforms) {
        if (Math.abs(pl.y - (enemy.y + enemy.h)) < 4 &&
            enemy.x + enemy.w * enemy.dir > pl.x &&
            enemy.x + enemy.w * enemy.dir < pl.x + pl.w) {
          hasGroundBelow = true; break;
        }
      }
      if (!hasGroundBelow && onPlat) enemy.dir *= -1;

      // Player-enemy collision
      if (rectCollide(player, enemy)) {
        // Player landing on top of enemy
        if (player.vy > 0 && player.y + player.h - enemy.y < 14) {
          enemy.alive = false;
          player.vy = JUMP_FORCE * 0.6;
          score += 200;
          updateHUD();
        } else if (player.invincible <= 0) {
          loseLife();
        }
      }
    }

    // Clean up dead enemies (keep for a moment)
    enemies = enemies.filter(e => e.alive || e.y < H + 200);

    // Check for level completion (reach far right)
    if (player.x > levelData.width - 60) {
      score += 300;
      updateHUD();
      nextLevel();
    }
  }

  // ==================== Render ====================
  function drawPlatform(x, y, type) {
    ctx.fillStyle = type === 'ground' ? '#5d4037' : '#8d6e63';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = type === 'ground' ? '#3e2723' : '#6d4c41';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, TILE, TILE);
    // Texture lines
    ctx.strokeStyle = type === 'ground' ? '#795548' : '#a1887f';
    ctx.beginPath();
    ctx.moveTo(x, y + TILE * 0.4); ctx.lineTo(x + TILE, y + TILE * 0.4);
    ctx.moveTo(x, y + TILE * 0.7); ctx.lineTo(x + TILE, y + TILE * 0.7);
    ctx.stroke();
    // Top edge highlight
    ctx.fillStyle = type === 'ground' ? '#43a047' : '#66bb6a';
    ctx.fillRect(x, y, TILE, 3);
  }

  function drawPlayer() {
    if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2 === 0) return;

    const px = player.x - cameraX;
    const py = player.y;
    const pw = player.w;
    const ph = player.h;

    ctx.save();

    // Body (red overalls)
    ctx.fillStyle = '#e53935';
    ctx.fillRect(px + 2, py + 10, pw - 4, ph - 10);

    // Head
    ctx.fillStyle = '#ffcc80';
    ctx.fillRect(px + 3, py, pw - 6, 12);

    // Cap
    ctx.fillStyle = '#e53935';
    ctx.fillRect(px + 2, py - 3, pw - 2, 6);
    ctx.fillRect(px + (player.facing > 0 ? pw - 4 : 0), py - 3, 4, 4);

    // Eyes
    ctx.fillStyle = '#000';
    const eyeX = px + (player.facing > 0 ? pw - 6 : 4);
    ctx.fillRect(eyeX, py + 2, 2, 3);

    // Legs (animated)
    const legOffset = player.onGround ? Math.sin(player.animeFrame * Math.PI / 2) * 3 : 1;
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(px + 3, py + ph - 4, pw / 2 - 2, 4 + legOffset);
    ctx.fillRect(px + pw / 2 + 2, py + ph - 4, pw / 2 - 2, 4 - legOffset);

    // Shoes
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(px + 2, py + ph + legOffset - 1, pw / 2, 3);
    ctx.fillRect(px + pw / 2 + 1, py + ph - legOffset - 1, pw / 2, 3);

    ctx.restore();
  }

  function drawCoins() {
    for (const coin of coins) {
      if (coin.collected) continue;
      const cx = coin.x - cameraX;
      const cy = coin.y + Math.sin(Date.now() / 250 + coin.x) * 2;

      ctx.fillStyle = '#ffd600';
      ctx.beginPath();
      ctx.arc(cx, cy, coin.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffab00';
      ctx.beginPath();
      ctx.arc(cx, cy, coin.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', cx, cy + 3);
      ctx.textAlign = 'start';
    }
  }

  function drawEnemies() {
    for (const enemy of enemies) {
      if (!enemy.alive && enemy.anime > 3) continue;
      const ex = enemy.x - cameraX;
      const ey = enemy.y;
      if (ex < -30 || ex > W + 30) continue;

      const squashY = !enemy.alive ? ey + 8 : ey;
      const squashH = !enemy.alive ? 4 : enemy.h;

      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(ex, squashY, enemy.w, squashH);
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(ex + 2, squashY - 4, enemy.w - 4, 6);

      // Eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(ex + 3, squashY - 2, 4, 4);
      ctx.fillRect(ex + enemy.w - 7, squashY - 2, 4, 4);
      ctx.fillStyle = '#000';
      const eyeDir = enemy.dir > 0 ? 1 : -1;
      ctx.fillRect(ex + 5 + eyeDir, squashY - 1, 1, 2);
      ctx.fillRect(ex + enemy.w - 5 - eyeDir, squashY - 1, 1, 2);

      // Feet
      const footOff = Math.sin(enemy.anime * 4) * 2;
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(ex, squashY + squashH, 6, 3 + footOff);
      ctx.fillRect(ex + enemy.w - 6, squashY + squashH, 6, 3 - footOff);
    }
  }

  function render() {
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#64b5f6');
    skyGrad.addColorStop(1, '#e3f2fd');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Clouds (parallax)
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 130 + 40) - cameraX * 0.3) % (W + 200) - 100;
      const cy = 20 + (i % 3) * 30;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.arc(cx + 20, cy - 6, 14, 0, Math.PI * 2);
      ctx.arc(cx + 35, cy + 2, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hills (parallax)
    ctx.fillStyle = '#a5d6a7';
    for (let i = 0; i < 10; i++) {
      const hx = ((i * 160 + 60) - cameraX * 0.5) % (W + 400) - 200;
      ctx.beginPath();
      ctx.arc(hx, H - TILE, 40, Math.PI, 0);
      ctx.fill();
    }

    // Platforms
    for (const pl of platforms) {
      const sx = pl.x - cameraX;
      if (sx < -TILE || sx > W + TILE) continue;
      drawPlatform(sx, pl.y, pl.type);
    }

    // Coins
    drawCoins();

    // Enemies
    drawEnemies();

    // Player
    drawPlayer();

    // Flag at end
    const flagX = levelData.width - cameraX;
    if (flagX < W + 50) {
      ctx.fillStyle = '#795548';
      ctx.fillRect(flagX, H - TILE - 60, 4, 60);
      ctx.fillStyle = '#f44336';
      ctx.beginPath();
      ctx.moveTo(flagX + 4, H - TILE - 60);
      ctx.lineTo(flagX + 26, H - TILE - 48);
      ctx.lineTo(flagX + 4, H - TILE - 36);
      ctx.fill();
      // Star
      ctx.fillStyle = '#ffeb3b';
      ctx.font = '14px sans-serif';
      ctx.fillText('⭐', flagX + 12, H - TILE - 55);
    }
  }

  // ==================== Game Loop ====================
  function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
  }

  // ==================== Event Handlers ====================
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; e.preventDefault(); }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') { keys.jump = true; e.preventDefault(); }
    if (e.key === 'r' || e.key === 'R') { initGame(); e.preventDefault(); }
  }

  function onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = false; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = false; }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') { keys.jump = false; }
  }

  function setupTouchControls() {
    if (btnLeft) {
      btnLeft.addEventListener('pointerdown', function (e) { keys.left = true; e.preventDefault(); });
      btnLeft.addEventListener('pointerup', function (e) { keys.left = false; e.preventDefault(); });
      btnLeft.addEventListener('pointerleave', function () { keys.left = false; });
    }
    if (btnRight) {
      btnRight.addEventListener('pointerdown', function (e) { keys.right = true; e.preventDefault(); });
      btnRight.addEventListener('pointerup', function (e) { keys.right = false; e.preventDefault(); });
      btnRight.addEventListener('pointerleave', function () { keys.right = false; });
    }
    if (btnJump) {
      btnJump.addEventListener('pointerdown', function (e) { keys.jump = true; e.preventDefault(); });
      btnJump.addEventListener('pointerup', function (e) { keys.jump = false; e.preventDefault(); });
      btnJump.addEventListener('pointerleave', function () { keys.jump = false; });
    }
  }

  function getI18n(key) {
    if (typeof I18n !== 'undefined' && window.I18n && I18n.t) return I18n.t(key);
    return null;
  }

  restartBtn.addEventListener('click', initGame);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  setupTouchControls();

  // Initialize
  initGame();
  gameLoop();
})();
