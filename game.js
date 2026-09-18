(() => {
  'use strict';

  // ---------- Canvas setup (fixed logical resolution, scaled to any screen) ----------
  const BASE_W = 480, BASE_H = 800;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const availH = window.innerHeight;
    const availW = window.innerWidth;
    const scale = Math.min(availW / BASE_W, availH / BASE_H);
    canvas.style.width = Math.floor(BASE_W * scale) + 'px';
    canvas.style.height = Math.floor(BASE_H * scale) + 'px';
    canvas.width = Math.floor(BASE_W * dpr);
    canvas.height = Math.floor(BASE_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  // ---------- DOM refs ----------
  const el = {
    lives: document.getElementById('lives'),
    shieldBar: document.getElementById('shield-bar'),
    score: document.getElementById('score'),
    highscore: document.getElementById('highscore'),
    planetName: document.getElementById('planet-name'),
    screenStart: document.getElementById('screen-start'),
    screenPause: document.getElementById('screen-pause'),
    screenLevelClear: document.getElementById('screen-levelclear'),
    screenGameOver: document.getElementById('screen-gameover'),
    levelClearNext: document.getElementById('levelclear-next'),
    gameoverScore: document.getElementById('gameover-score'),
    btnStart: document.getElementById('btn-start'),
    btnResume: document.getElementById('btn-resume'),
    btnContinue: document.getElementById('btn-continue'),
    btnRestart: document.getElementById('btn-restart'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right'),
    btnFire: document.getElementById('btn-fire'),
  };

  // ---------- Planets (visual themes, cycle + escalate) ----------
  const PLANETS = [
    { name: 'MARS OUTPOST',        top: '#3a0f0f', bottom: '#0a0202', accent: '#ff5533' },
    { name: 'EUROPA ICE FIELDS',   top: '#04263a', bottom: '#010509', accent: '#33ccff' },
    { name: 'TITAN METHANE SEAS',  top: '#3a2a04', bottom: '#0a0700', accent: '#ffb833' },
    { name: 'NEBULA RIFT',         top: '#2a0440', bottom: '#08010d', accent: '#cc55ff' },
    { name: 'THE VOID',            top: '#210000', bottom: '#000000', accent: '#ff3355' },
  ];

  // ---------- Input ----------
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
    keys.add(e.key);
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'Enter') handleEnter();
  }, { passive: false });
  window.addEventListener('keyup', (e) => keys.delete(e.key));

  function bindHold(button, keyName) {
    const start = (e) => { e.preventDefault(); keys.add(keyName); };
    const end = (e) => { e.preventDefault(); keys.delete(keyName); };
    button.addEventListener('touchstart', start, { passive: false });
    button.addEventListener('touchend', end, { passive: false });
    button.addEventListener('touchcancel', end, { passive: false });
    button.addEventListener('mousedown', start);
    button.addEventListener('mouseup', end);
    button.addEventListener('mouseleave', end);
  }
  bindHold(el.btnLeft, 'ArrowLeft');
  bindHold(el.btnRight, 'ArrowRight');
  bindHold(el.btnFire, ' ');

  el.btnStart.addEventListener('click', startGame);
  el.btnResume.addEventListener('click', togglePause);
  el.btnContinue.addEventListener('click', nextWave);
  el.btnRestart.addEventListener('click', startGame);

  function handleEnter() {
    if (state.screen === 'start') startGame();
    else if (state.screen === 'levelclear') nextWave();
    else if (state.screen === 'gameover') startGame();
  }

  // ---------- Game state ----------
  const state = {
    screen: 'start', // start | playing | paused | levelclear | gameover
    score: 0,
    highScore: Number(localStorage.getItem('gza_highscore') || 0),
    lives: 3,
    maxLives: 5,
    wave: 1,
    planetIdx: 0,
    shakeTime: 0,
    shakeMag: 0,
  };
  el.highscore.textContent = 'BEST ' + state.highScore;

  const player = {
    x: BASE_W / 2, y: BASE_H - 90, w: 34, h: 34,
    speed: 220, cooldown: 0,
    weaponTimer: 0, shieldTimer: 0, hitFlash: 0,
  };

  let stars = [];
  let enemies = [];
  let playerBullets = [];
  let enemyBullets = [];
  let powerups = [];
  let particles = [];
  let formation = { dir: 1, speed: 30, dropAmount: 18 };

  function initStars() {
    stars = [];
    for (let i = 0; i < 70; i++) {
      stars.push({
        x: Math.random() * BASE_W,
        y: Math.random() * BASE_H,
        r: Math.random() * 1.6 + 0.4,
        speed: Math.random() * 40 + 15,
      });
    }
  }
  initStars();

  // ---------- Wave / enemy setup ----------
  function spawnWave() {
    enemies = [];
    playerBullets = [];
    enemyBullets = [];
    powerups = [];

    const rows = Math.min(3 + Math.floor(state.wave / 3), 6);
    const cols = Math.min(6 + Math.floor(state.wave / 2), 9);
    const spacingX = 42, spacingY = 40;
    const startX = (BASE_W - (cols - 1) * spacingX) / 2;
    const startY = 70;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        enemies.push({
          baseX: startX + c * spacingX,
          baseY: startY + r * spacingY,
          x: startX + c * spacingX,
          y: startY + r * spacingY,
          w: 30, h: 30,
          row: r, col: c,
          alive: true,
          points: (rows - r) * 10,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    formation.dir = 1;
    formation.speed = 26 + state.wave * 4;
    formation.dropAmount = 16 + Math.min(state.wave, 10);

    el.planetName.textContent = PLANETS[state.planetIdx].name + ' — WAVE ' + state.wave;
  }

  function startGame() {
    state.score = 0;
    state.lives = 3;
    state.wave = 1;
    state.planetIdx = 0;
    player.x = BASE_W / 2;
    player.weaponTimer = 0;
    player.shieldTimer = 0;
    player.hitFlash = 0;
    el.score.textContent = 'SCORE 0';
    el.shieldBar.style.width = '0%';
    refreshLivesHUD();
    spawnWave();
    setScreen('playing');
  }

  function nextWave() {
    state.wave++;
    state.planetIdx = (state.planetIdx + 1) % PLANETS.length;
    spawnWave();
    setScreen('playing');
  }

  function setScreen(name) {
    state.screen = name;
    el.screenStart.classList.toggle('hidden', name !== 'start');
    el.screenPause.classList.toggle('hidden', name !== 'paused');
    el.screenLevelClear.classList.toggle('hidden', name !== 'levelclear');
    el.screenGameOver.classList.toggle('hidden', name !== 'gameover');
  }

  function togglePause() {
    if (state.screen === 'playing') setScreen('paused');
    else if (state.screen === 'paused') setScreen('playing');
  }

  // ---------- Helpers ----------
  function rectHit(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  }

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = Math.random() * speed + speed * 0.3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: Math.random() * 0.4 + 0.3,
        maxLife: 0.7,
        color,
      });
    }
  }

  function shake(mag, time) {
    state.shakeMag = mag;
    state.shakeTime = time;
  }

  function refreshLivesHUD() {
    let hearts = '';
    for (let i = 0; i < state.maxLives; i++) hearts += i < state.lives ? '❤️' : '🖤';
    el.lives.textContent = hearts;
  }

  function addScore(n) {
    state.score += n;
    el.score.textContent = 'SCORE ' + state.score;
    if (state.score > state.highScore) {
      state.highScore = state.score;
      el.highscore.textContent = 'BEST ' + state.highScore;
      localStorage.setItem('gza_highscore', String(state.highScore));
    }
  }

  function loseLife() {
    state.lives--;
    player.hitFlash = 1.2;
    shake(6, 0.3);
    if (state.lives <= 0) {
      el.gameoverScore.textContent = 'SCORE ' + state.score + '   ·   BEST ' + state.highScore;
      setScreen('gameover');
    }
  }

  // ---------- Update ----------
  let lastTime = performance.now();
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05; // clamp for tab-switch stalls
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function update(dt) {
    for (const s of stars) {
      s.y += s.speed * dt;
      if (s.y > BASE_H) { s.y = 0; s.x = Math.random() * BASE_W; }
    }

    if (state.screen !== 'playing') return;

    updatePlayer(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updatePowerups(dt);
    updateParticles(dt);
    checkCollisions();
    checkWaveClear();

    if (state.shakeTime > 0) state.shakeTime -= dt;
    if (player.hitFlash > 0) player.hitFlash -= dt;
  }

  function updatePlayer(dt) {
    const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
    const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
    if (left) player.x -= player.speed * dt;
    if (right) player.x += player.speed * dt;
    player.x = Math.max(player.w / 2 + 4, Math.min(BASE_W - player.w / 2 - 4, player.x));

    if (player.shieldTimer > 0) player.shieldTimer -= dt;
    if (player.weaponTimer > 0) player.weaponTimer -= dt;
    el.shieldBar.style.width = Math.max(0, (player.shieldTimer / 6) * 100) + '%';
    refreshLivesHUD();

    if (player.cooldown > 0) player.cooldown -= dt;
    const firing = keys.has(' ');
    if (firing && player.cooldown <= 0) {
      fireBullets();
      player.cooldown = player.weaponTimer > 0 ? 0.12 : 0.28;
    }
  }

  function fireBullets() {
    const overcharged = player.weaponTimer > 0;
    if (overcharged) {
      playerBullets.push({ x: player.x - 10, y: player.y - 18, vx: -60, vy: -520, w: 5, h: 12 });
      playerBullets.push({ x: player.x, y: player.y - 22, vx: 0, vy: -560, w: 5, h: 12 });
      playerBullets.push({ x: player.x + 10, y: player.y - 18, vx: 60, vy: -520, w: 5, h: 12 });
    } else {
      playerBullets.push({ x: player.x, y: player.y - 22, vx: 0, vy: -480, w: 5, h: 14 });
    }
  }

  function updateBullets(dt) {
    for (const b of playerBullets) { b.x += (b.vx || 0) * dt; b.y += b.vy * dt; }
    playerBullets = playerBullets.filter(b => b.y > -20 && b.x > -20 && b.x < BASE_W + 20);

    for (const b of enemyBullets) { b.y += b.vy * dt; }
    enemyBullets = enemyBullets.filter(b => b.y < BASE_H + 20);
  }

  function updateEnemies(dt) {
    if (enemies.every(e => !e.alive)) return;

    const aliveList = enemies.filter(e => e.alive);
    const speedBoost = 1 + (1 - aliveList.length / enemies.length) * 1.8;
    const dx = formation.dir * formation.speed * speedBoost * dt;

    let hitEdge = false;
    for (const en of aliveList) {
      const nextX = en.baseX + dx;
      if (nextX < 20 || nextX > BASE_W - 20) hitEdge = true;
    }

    if (hitEdge) {
      formation.dir *= -1;
      for (const en of aliveList) en.baseY += formation.dropAmount;
    } else {
      for (const en of aliveList) en.baseX += dx;
    }

    const t = performance.now() / 1000;
    for (const en of aliveList) {
      en.x = en.baseX;
      en.y = en.baseY + Math.sin(t * 2.4 + en.phase) * 4;

      if (en.baseY > player.y - 40) {
        el.gameoverScore.textContent = 'SCORE ' + state.score + '   ·   BEST ' + state.highScore;
        setScreen('gameover');
        return;
      }
    }

    // Enemy fire: front-most alive enemy per column occasionally shoots
    const fireChance = 0.15 + state.wave * 0.02;
    if (Math.random() < fireChance * dt * 10) {
      const cols = {};
      for (const en of aliveList) {
        if (!cols[en.col] || en.baseY > cols[en.col].baseY) cols[en.col] = en;
      }
      const shooters = Object.values(cols);
      if (shooters.length) {
        const shooter = shooters[Math.floor(Math.random() * shooters.length)];
        enemyBullets.push({ x: shooter.x, y: shooter.y + 16, vy: 180 + state.wave * 8, w: 5, h: 12 });
      }
    }
  }

  function updatePowerups(dt) {
    for (const p of powerups) p.y += p.speed * dt;
    powerups = powerups.filter(p => p.y < BASE_H + 20);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
  }

  function checkCollisions() {
    // player bullets vs enemies
    for (const b of playerBullets) {
      for (const en of enemies) {
        if (!en.alive) continue;
        if (rectHit(b, en)) {
          en.alive = false;
          b.dead = true;
          addScore(en.points);
          spawnParticles(en.x, en.y, PLANETS[state.planetIdx].accent, 14, 90);
          if (Math.random() < 0.18) dropPowerup(en.x, en.y);
          break;
        }
      }
    }
    playerBullets = playerBullets.filter(b => !b.dead);

    // enemy bullets vs player
    const shielded = player.shieldTimer > 0;
    for (const b of enemyBullets) {
      if (rectHit(b, player)) {
        b.dead = true;
        spawnParticles(player.x, player.y, '#ff5566', 10, 80);
        if (!shielded) loseLife();
      }
    }
    enemyBullets = enemyBullets.filter(b => !b.dead);

    // enemies colliding with player (reaching the ship directly)
    for (const en of enemies) {
      if (en.alive && rectHit(en, player)) {
        en.alive = false;
        spawnParticles(en.x, en.y, '#ff5566', 14, 90);
        if (!shielded) loseLife();
      }
    }

    // powerups vs player
    for (const p of powerups) {
      if (rectHit(p, player)) {
        p.dead = true;
        applyPowerup(p.type);
        spawnParticles(player.x, player.y - 10, '#ffffff', 16, 100);
      }
    }
    powerups = powerups.filter(p => !p.dead);
  }

  function dropPowerup(x, y) {
    const roll = Math.random();
    const type = roll < 0.4 ? 'shield' : roll < 0.75 ? 'weapon' : 'health';
    powerups.push({ x, y, w: 22, h: 22, speed: 90, type });
  }

  function applyPowerup(type) {
    if (type === 'shield') player.shieldTimer = 6;
    else if (type === 'weapon') player.weaponTimer = 8;
    else if (type === 'health') state.lives = Math.min(state.maxLives, state.lives + 1);
  }

  function checkWaveClear() {
    if (state.screen === 'playing' && enemies.length && enemies.every(e => !e.alive)) {
      const next = PLANETS[(state.planetIdx + 1) % PLANETS.length].name;
      el.levelClearNext.textContent = 'NEXT: ' + next;
      setScreen('levelclear');
    }
  }

  // ---------- Render ----------
  function render() {
    ctx.save();
    if (state.shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * state.shakeMag, (Math.random() - 0.5) * state.shakeMag);
    }

    drawBackground();
    drawStars();
    drawParticles();
    drawEnemyBullets();
    drawPlayerBullets();
    drawEnemies();
    drawPowerups();
    if (state.screen === 'playing' || state.screen === 'paused') drawPlayer();

    ctx.restore();
  }

  function drawBackground() {
    const planet = PLANETS[state.planetIdx];
    const g = ctx.createLinearGradient(0, 0, 0, BASE_H);
    g.addColorStop(0, planet.top);
    g.addColorStop(1, planet.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }

  function drawStars() {
    ctx.fillStyle = '#ffffff';
    for (const s of stars) {
      ctx.globalAlpha = 0.5 + Math.sin(s.x + s.y) * 0.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const blinking = player.hitFlash > 0 && Math.floor(player.hitFlash * 12) % 2 === 0;
    if (blinking) return;

    if (player.shieldTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(51, 224, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#33e0ff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(player.x, player.y - 4, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = player.weaponTimer > 0 ? '#ffd23f' : '#7dffb0';
    ctx.shadowBlur = 14;
    ctx.font = '34px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚀', player.x, player.y);
    ctx.restore();
  }

  function drawEnemies() {
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const en of enemies) {
      if (!en.alive) continue;
      ctx.save();
      ctx.shadowColor = PLANETS[state.planetIdx].accent;
      ctx.shadowBlur = 10;
      ctx.fillText('🧟', en.x, en.y);
      ctx.restore();
    }
  }

  function drawPlayerBullets() {
    for (const b of playerBullets) {
      ctx.save();
      ctx.shadowColor = '#7dffb0';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#c9ffe0';
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.restore();
    }
  }

  function drawEnemyBullets() {
    for (const b of enemyBullets) {
      ctx.save();
      ctx.shadowColor = '#ff4455';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffb3ba';
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.restore();
    }
  }

  function drawPowerups() {
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons = { shield: '🛡️', health: '❤️', weapon: '⭐' };
    for (const p of powerups) {
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.fillText(icons[p.type], p.x, p.y);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

})();
