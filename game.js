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
    combo: document.getElementById('combo-display'),
    score: document.getElementById('score'),
    highscore: document.getElementById('highscore'),
    planetName: document.getElementById('planet-name'),
    muteBtn: document.getElementById('mute-btn'),
    bossWrap: document.getElementById('boss-bar-wrap'),
    bossName: document.getElementById('boss-name'),
    bossFill: document.getElementById('boss-health-fill'),
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

  // ============================================================
  // AUDIO — fully procedural (Web Audio API), no asset files
  // ============================================================
  const AudioSys = (() => {
    let actx = null;
    let muted = localStorage.getItem('gza_muted') === '1';
    let musicTimer = 0, musicStep = 0, musicOn = false;
    let bossAlarmNodes = null;

    function ensure() {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }

    function master() {
      const c = ensure();
      const g = c.createGain();
      g.gain.value = muted ? 0 : 1;
      g.connect(c.destination);
      return g;
    }

    function tone(freq, dur, type, gainStart, freqEnd, delay) {
      if (muted) return;
      const c = ensure();
      const t0 = c.currentTime + (delay || 0);
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
      gain.gain.setValueAtTime(gainStart || 0.2, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noiseBurst(dur, gainStart, filterFreq, delay) {
      if (muted) return;
      const c = ensure();
      const t0 = c.currentTime + (delay || 0);
      const bufferSize = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq || 1800, t0);
      filter.frequency.exponentialRampToValueAtTime(80, t0 + dur);
      const gain = c.createGain();
      gain.gain.setValueAtTime(gainStart || 0.5, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);
      src.start(t0);
    }

    return {
      unlock() { ensure(); },
      toggleMute() {
        muted = !muted;
        localStorage.setItem('gza_muted', muted ? '1' : '0');
        return muted;
      },
      isMuted() { return muted; },
      laser() { tone(900, 0.1, 'sawtooth', 0.12, 220); },
      laserBig() { tone(500, 0.22, 'sawtooth', 0.18, 100); },
      hit() { tone(220, 0.08, 'square', 0.1, 90); },
      explosion(big) { noiseBurst(big ? 0.55 : 0.28, big ? 0.55 : 0.3, big ? 2400 : 1500); },
      powerup() {
        tone(520, 0.1, 'sine', 0.16, null, 0);
        tone(780, 0.1, 'sine', 0.16, null, 0.08);
        tone(1040, 0.16, 'sine', 0.18, null, 0.16);
      },
      hurt() { tone(180, 0.22, 'sawtooth', 0.2, 60); },
      waveClear() {
        tone(392, 0.14, 'triangle', 0.18, null, 0);
        tone(494, 0.14, 'triangle', 0.18, null, 0.12);
        tone(587, 0.22, 'triangle', 0.2, null, 0.24);
      },
      gameOver() { tone(300, 0.5, 'sawtooth', 0.2, 50); },
      bossRoar() { noiseBurst(0.5, 0.4, 900); tone(90, 0.5, 'sawtooth', 0.25, 40); },
      bombBlast() { noiseBurst(0.7, 0.6, 3000); tone(80, 0.6, 'sine', 0.3, 30); },
      startMusic() { musicOn = true; musicTimer = 0; musicStep = 0; },
      stopMusic() { musicOn = false; },
      updateMusic(dt, intensity) {
        if (!musicOn || muted) return;
        musicTimer -= dt;
        if (musicTimer <= 0) {
          const bpm = 118 + intensity * 40;
          musicTimer = 60 / bpm / 2;
          const step = musicStep % 8;
          musicStep++;
          if (step === 0 || step === 4) tone(55, 0.14, 'triangle', 0.14, 40);
          if (step === 2 || step === 6) tone(0, 0.03, 'square', 0.001);
          if (step % 2 === 0) noiseBurst(0.04, 0.05, 6000);
        }
      },
    };
  })();

  el.muteBtn.textContent = AudioSys.isMuted() ? '🔇' : '🔊';
  el.muteBtn.addEventListener('click', () => {
    const m = AudioSys.toggleMute();
    el.muteBtn.textContent = m ? '🔇' : '🔊';
  });

  // ---------- Planets (visual themes, cycle + escalate) ----------
  const PLANETS = [
    { name: 'MARS OUTPOST',        top: '#3a0f0f', bottom: '#0a0202', accent: '#ff5533', ring: false },
    { name: 'EUROPA ICE FIELDS',   top: '#04263a', bottom: '#010509', accent: '#33ccff', ring: false },
    { name: 'TITAN METHANE SEAS',  top: '#3a2a04', bottom: '#0a0700', accent: '#ffb833', ring: true  },
    { name: 'NEBULA RIFT',         top: '#2a0440', bottom: '#08010d', accent: '#cc55ff', ring: true  },
    { name: 'THE VOID',            top: '#210000', bottom: '#000000', accent: '#ff3355', ring: false },
  ];

  // ---------- Enemy types ----------
  const ENEMY_TYPES = {
    shambler: { emoji: '🧟', hp: 1, points: 10, scale: 1,    glow: null },
    screamer: { emoji: '👻', hp: 1, points: 15, scale: 0.85, glow: '#33ccff', jitter: 10 },
    brute:    { emoji: '🧌', hp: 3, points: 40, scale: 1.55, glow: '#cc55ff', shakeOnDeath: 5 },
    diver:    { emoji: '💀', hp: 1, points: 25, scale: 1.05, glow: '#ff8833' },
  };

  // ---------- Input ----------
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
    keys.add(e.key);
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'Enter') handleEnter();
    AudioSys.unlock();
  }, { passive: false });
  window.addEventListener('keyup', (e) => keys.delete(e.key));
  window.addEventListener('pointerdown', () => AudioSys.unlock(), { once: true });

  function bindHold(button, keyName) {
    const start = (e) => { e.preventDefault(); keys.add(keyName); AudioSys.unlock(); };
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
    combo: 0,
    comboTimer: 0,
    hitStop: 0,
    flashAlpha: 0,
    flashColor: '#ffffff',
  };
  el.highscore.textContent = 'BEST ' + state.highScore;

  const player = {
    x: BASE_W / 2, y: BASE_H - 90, w: 34, h: 34,
    speed: 230, cooldown: 0,
    weaponTimer: 0, shieldTimer: 0, hitFlash: 0,
    tilt: 0,
  };

  let starsFar = [], starsNear = [];
  let nebulae = [];
  let shootingStars = [];
  let enemies = [];
  let boss = null;
  let playerBullets = [];
  let enemyBullets = [];
  let powerups = [];
  let particles = [];
  let floaters = [];
  let formation = { dir: 1, speed: 30, dropAmount: 18 };

  function initBackground() {
    starsFar = [];
    starsNear = [];
    for (let i = 0; i < 40; i++) {
      starsFar.push({ x: Math.random() * BASE_W, y: Math.random() * BASE_H, r: Math.random() * 1 + 0.3, speed: Math.random() * 12 + 6 });
    }
    for (let i = 0; i < 55; i++) {
      starsNear.push({ x: Math.random() * BASE_W, y: Math.random() * BASE_H, r: Math.random() * 1.7 + 0.6, speed: Math.random() * 45 + 25 });
    }
  }
  initBackground();

  function initPlanetScenery() {
    const planet = PLANETS[state.planetIdx];
    nebulae = [];
    for (let i = 0; i < 3; i++) {
      nebulae.push({
        x: Math.random() * BASE_W,
        y: Math.random() * BASE_H * 0.6,
        r: 90 + Math.random() * 70,
        speed: 4 + Math.random() * 6,
        color: planet.accent,
      });
    }
    scenery.planetCx = 60 + Math.random() * (BASE_W - 120);
    scenery.planetCy = 90 + Math.random() * 40;
    scenery.planetR = 55 + Math.random() * 20;
  }
  const scenery = { planetCx: 380, planetCy: 110, planetR: 60 };
  initPlanetScenery();

  // ---------- Wave / enemy setup ----------
  function pickType(wave, row, rows) {
    const pool = [['shambler', 6]];
    if (wave >= 2) pool.push(['screamer', row < rows / 2 ? 3 : 1]);
    if (wave >= 3) pool.push(['brute', row >= rows - 1 ? 2.5 : 0.4]);
    if (wave >= 4) pool.push(['diver', row === rows - 1 ? 2 : 0.3]);
    const total = pool.reduce((s, p) => s + p[1], 0);
    let r = Math.random() * total;
    for (const [type, weight] of pool) {
      if (r < weight) return type;
      r -= weight;
    }
    return 'shambler';
  }

  function isBossWave(wave) { return wave % 3 === 0; }

  function spawnWave() {
    enemies = [];
    boss = null;
    playerBullets = [];
    enemyBullets = [];
    powerups = [];
    floaters = [];
    state.combo = 0;
    state.comboTimer = 0;
    updateComboHUD();
    initPlanetScenery();

    if (isBossWave(state.wave)) {
      spawnBoss();
      el.planetName.textContent = PLANETS[state.planetIdx].name + ' — BOSS WAVE';
      AudioSys.bossRoar();
    } else {
      el.bossWrap.classList.add('hidden');
      const rows = Math.min(3 + Math.floor(state.wave / 3), 6);
      const cols = Math.min(6 + Math.floor(state.wave / 2), 9);
      const spacingX = 42, spacingY = 40;
      const startX = (BASE_W - (cols - 1) * spacingX) / 2;
      const startY = 70;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const type = pickType(state.wave, r, rows);
          const def = ENEMY_TYPES[type];
          enemies.push({
            baseX: startX + c * spacingX,
            baseY: startY + r * spacingY,
            x: startX + c * spacingX,
            y: startY + r * spacingY,
            w: 30 * def.scale, h: 30 * def.scale,
            row: r, col: c,
            type, hp: def.hp, maxHp: def.hp,
            alive: true,
            hitFlash: 0,
            diving: false, diveVx: 0, diveVy: 0,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      formation.dir = 1;
      formation.speed = 26 + state.wave * 4;
      formation.dropAmount = 16 + Math.min(state.wave, 10);

      el.planetName.textContent = PLANETS[state.planetIdx].name + ' — WAVE ' + state.wave;
    }
  }

  function spawnBoss() {
    const hp = 22 + state.wave * 7;
    boss = {
      x: BASE_W / 2, y: -60, targetY: 110,
      w: 78, h: 78,
      hp, maxHp: hp,
      dir: 1, speed: 55 + state.wave * 2.5,
      fireTimer: 1.2, entering: true, dying: false, dyingTimer: 0,
      hitFlash: 0,
      name: ['SKULLORD PRIME', 'THE ROTTEN KING', 'VOID BRUTE', 'GRAVE TITAN'][Math.floor(Math.random() * 4)],
    };
    el.bossWrap.classList.remove('hidden');
    el.bossName.textContent = boss.name;
    el.bossFill.style.width = '100%';
  }

  function startGame() {
    AudioSys.unlock();
    state.score = 0;
    state.lives = 3;
    state.wave = 1;
    state.planetIdx = 0;
    state.combo = 0;
    state.comboTimer = 0;
    player.x = BASE_W / 2;
    player.weaponTimer = 0;
    player.shieldTimer = 0;
    player.hitFlash = 0;
    el.score.textContent = 'SCORE 0';
    el.shieldBar.style.width = '0%';
    refreshLivesHUD();
    updateComboHUD();
    spawnWave();
    setScreen('playing');
    AudioSys.startMusic();
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
    if (name === 'gameover' || name === 'start') {
      AudioSys.stopMusic();
      el.bossWrap.classList.add('hidden');
    }
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
        r: Math.random() * 2 + 1.4,
        color,
      });
    }
  }

  function spawnFloater(x, y, text, color, big) {
    floaters.push({ x, y, text, color, life: 0.9, maxLife: 0.9, vy: -46, big: !!big });
  }

  function shake(mag, time) {
    state.shakeMag = Math.max(state.shakeMag, mag);
    state.shakeTime = Math.max(state.shakeTime, time);
  }

  function triggerHitStop(t) {
    state.hitStop = Math.max(state.hitStop, t);
  }

  function triggerFlash(color, alpha) {
    state.flashColor = color;
    state.flashAlpha = alpha;
  }

  function refreshLivesHUD() {
    let hearts = '';
    for (let i = 0; i < state.maxLives; i++) hearts += i < state.lives ? '❤️' : '🖤';
    el.lives.textContent = hearts;
  }

  function updateComboHUD() {
    if (state.combo > 1) {
      el.combo.textContent = state.combo + 'x COMBO';
      el.combo.classList.add('show');
    } else {
      el.combo.classList.remove('show');
    }
  }

  function registerKill(basePoints, x, y, color) {
    state.combo++;
    state.comboTimer = 1.4;
    updateComboHUD();
    const mult = 1 + Math.min(state.combo - 1, 9) * 0.15;
    const pts = Math.round(basePoints * mult);
    addScore(pts);
    spawnFloater(x, y, '+' + pts, state.combo > 1 ? '#ffd23f' : '#ffffff', state.combo > 3);
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
    if (player.shieldTimer > 0) return;
    state.lives--;
    player.hitFlash = 1.2;
    shake(7, 0.3);
    triggerFlash('#ff2233', 0.35);
    AudioSys.hurt();
    refreshLivesHUD();
    if (state.lives <= 0) {
      endGame();
    }
  }

  function endGame() {
    el.gameoverScore.textContent = 'SCORE ' + state.score + '   ·   BEST ' + state.highScore;
    setScreen('gameover');
    AudioSys.gameOver();
  }

  // ---------- Update loop ----------
  let lastTime = performance.now();
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    if (state.hitStop > 0) {
      state.hitStop -= dt;
      dt = 0;
    }

    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function update(dt) {
    updateBackground(dt);

    if (state.flashAlpha > 0) state.flashAlpha = Math.max(0, state.flashAlpha - dt * 2.6);
    if (state.shakeTime > 0) state.shakeTime -= dt;

    if (state.screen !== 'playing') return;

    const intensity = Math.min(1, (state.wave - 1) / 8);
    AudioSys.updateMusic(dt, intensity);

    updatePlayer(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updatePowerups(dt);
    updateParticles(dt);
    updateFloaters(dt);
    checkCollisions();
    checkWaveClear();

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) { state.combo = 0; updateComboHUD(); }
    }
    if (player.hitFlash > 0) player.hitFlash -= dt;
  }

  function updateBackground(dt) {
    for (const s of starsFar) { s.y += s.speed * dt; if (s.y > BASE_H) { s.y = 0; s.x = Math.random() * BASE_W; } }
    for (const s of starsNear) { s.y += s.speed * dt; if (s.y > BASE_H) { s.y = 0; s.x = Math.random() * BASE_W; } }
    for (const n of nebulae) { n.y += n.speed * dt; if (n.y - n.r > BASE_H) { n.y = -n.r; n.x = Math.random() * BASE_W; } }
    scenery.planetCy += 2 * dt;

    if (Math.random() < 0.004) {
      shootingStars.push({ x: Math.random() * BASE_W * 0.6, y: 0, vx: 220, vy: 160, life: 0.6 });
    }
    for (const s of shootingStars) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    shootingStars = shootingStars.filter(s => s.life > 0);
  }

  function updatePlayer(dt) {
    const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
    const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
    if (left) player.x -= player.speed * dt;
    if (right) player.x += player.speed * dt;
    player.x = Math.max(player.w / 2 + 4, Math.min(BASE_W - player.w / 2 - 4, player.x));
    const targetTilt = left ? -0.25 : right ? 0.25 : 0;
    player.tilt += (targetTilt - player.tilt) * Math.min(1, dt * 10);

    if (Math.random() < 0.6) {
      particles.push({
        x: player.x + (Math.random() - 0.5) * 8, y: player.y + 16,
        vx: (Math.random() - 0.5) * 20, vy: 60 + Math.random() * 40,
        life: 0.25, maxLife: 0.25, r: Math.random() * 2 + 1,
        color: player.weaponTimer > 0 ? '#ffd23f' : '#33e0ff',
      });
    }

    if (player.shieldTimer > 0) player.shieldTimer -= dt;
    if (player.weaponTimer > 0) player.weaponTimer -= dt;
    el.shieldBar.style.width = Math.max(0, (player.shieldTimer / 6) * 100) + '%';
    refreshLivesHUD();

    if (player.cooldown > 0) player.cooldown -= dt;
    const firing = keys.has(' ');
    if (firing && player.cooldown <= 0) {
      fireBullets();
      player.cooldown = player.weaponTimer > 0 ? 0.11 : 0.26;
    }
  }

  function fireBullets() {
    const overcharged = player.weaponTimer > 0;
    spawnParticles(player.x, player.y - 20, '#c9ffe0', 3, 40);
    if (overcharged) {
      playerBullets.push({ x: player.x - 10, y: player.y - 18, vx: -60, vy: -540, w: 5, h: 12 });
      playerBullets.push({ x: player.x, y: player.y - 22, vx: 0, vy: -580, w: 5, h: 12 });
      playerBullets.push({ x: player.x + 10, y: player.y - 18, vx: 60, vy: -540, w: 5, h: 12 });
      AudioSys.laserBig();
    } else {
      playerBullets.push({ x: player.x, y: player.y - 22, vx: 0, vy: -500, w: 5, h: 14 });
      AudioSys.laser();
    }
  }

  function updateBullets(dt) {
    for (const b of playerBullets) { b.x += (b.vx || 0) * dt; b.y += b.vy * dt; }
    playerBullets = playerBullets.filter(b => b.y > -20 && b.x > -20 && b.x < BASE_W + 20);

    for (const b of enemyBullets) { b.x += (b.vx || 0) * dt; b.y += b.vy * dt; }
    enemyBullets = enemyBullets.filter(b => b.y < BASE_H + 20 && b.y > -20);
  }

  function updateEnemies(dt) {
    const totalAlive = enemies.filter(e => e.alive).length;
    if (totalAlive === 0) return;

    const formationList = enemies.filter(e => e.alive && !e.diving);
    const divingList = enemies.filter(e => e.alive && e.diving);

    const speedBoost = 1 + (1 - totalAlive / enemies.length) * 1.8;
    const dx = formation.dir * formation.speed * speedBoost * dt;

    let hitEdge = false;
    for (const en of formationList) {
      const nextX = en.baseX + dx;
      if (nextX < 20 || nextX > BASE_W - 20) hitEdge = true;
    }

    if (hitEdge) {
      formation.dir *= -1;
      for (const en of formationList) en.baseY += formation.dropAmount;
    } else {
      for (const en of formationList) en.baseX += dx;
    }

    const t = performance.now() / 1000;
    for (const en of formationList) {
      const def = ENEMY_TYPES[en.type];
      const jitter = def.jitter ? Math.sin(t * 6 + en.phase) * def.jitter : 0;
      en.x = en.baseX + jitter;
      en.y = en.baseY + Math.sin(t * 2.4 + en.phase) * 4;

      if (en.baseY > player.y - 40) {
        endGame();
        return;
      }
    }

    for (const en of divingList) {
      en.x += en.diveVx * dt;
      en.y += en.diveVy * dt;
      en.diveVy += 240 * dt;
      if (en.y > BASE_H + 30) {
        en.diving = false;
        en.x = en.baseX;
        en.y = en.baseY;
      }
    }

    if (state.wave >= 4 && divingList.length < 1 && Math.random() < 0.22 * dt) {
      const candidates = formationList.filter(e => e.type === 'diver');
      if (candidates.length) {
        const d = candidates[Math.floor(Math.random() * candidates.length)];
        d.diving = true;
        const travelTime = 1 + Math.random() * 0.4;
        d.diveVx = (player.x - d.x) / travelTime;
        d.diveVy = 30;
      }
    }

    for (const en of formationList) {
      if (en.hitFlash > 0) en.hitFlash -= dt;
    }

    const fireChance = 0.15 + state.wave * 0.02;
    if (Math.random() < fireChance * dt * 10) {
      const cols = {};
      for (const en of formationList) {
        if (!cols[en.col] || en.baseY > cols[en.col].baseY) cols[en.col] = en;
      }
      const shooters = Object.values(cols);
      if (shooters.length) {
        const shooter = shooters[Math.floor(Math.random() * shooters.length)];
        const mul = ENEMY_TYPES[shooter.type].jitter ? 1.4 : 1;
        if (Math.random() < mul) {
          enemyBullets.push({ x: shooter.x, y: shooter.y + 16, vy: 180 + state.wave * 8, w: 5, h: 12 });
        }
      }
    }
  }

  function updateBoss(dt) {
    if (!boss) return;

    if (boss.dying) {
      boss.dyingTimer -= dt;
      if (Math.random() < 0.6) {
        spawnParticles(boss.x + (Math.random() - 0.5) * boss.w, boss.y + (Math.random() - 0.5) * boss.h, '#ffaa33', 6, 120);
      }
      if (boss.dyingTimer <= 0) {
        finishBossDeath();
      }
      return;
    }

    if (boss.entering) {
      boss.y += (boss.targetY - boss.y) * Math.min(1, dt * 2);
      if (Math.abs(boss.y - boss.targetY) < 2) boss.entering = false;
      return;
    }

    const margin = 70;
    boss.x += boss.dir * boss.speed * dt;
    if (boss.x < margin) { boss.x = margin; boss.dir = 1; }
    if (boss.x > BASE_W - margin) { boss.x = BASE_W - margin; boss.dir = -1; }

    if (boss.hitFlash > 0) boss.hitFlash -= dt;

    const enrage = 1 - boss.hp / boss.maxHp;
    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0) {
      boss.fireTimer = Math.max(0.35, 1.1 - enrage * 0.7);
      const spread = 3 + Math.floor(enrage * 2);
      for (let i = 0; i < spread; i++) {
        const angleOffset = (i - (spread - 1) / 2) * 0.28;
        const speed = 190 + state.wave * 6;
        enemyBullets.push({
          x: boss.x, y: boss.y + boss.h / 2,
          vx: Math.sin(angleOffset) * speed,
          vy: Math.cos(angleOffset) * speed,
          w: 6, h: 14,
        });
      }
    }

    if (rectHit(boss, player)) loseLife();
  }

  function finishBossDeath() {
    registerKill(500 + state.wave * 50, boss.x, boss.y, '#ffaa33');
    dropPowerup(boss.x - 20, boss.y);
    dropPowerup(boss.x + 20, boss.y);
    shake(14, 0.5);
    triggerFlash('#ffffff', 0.5);
    boss = null;
    el.bossWrap.classList.add('hidden');
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

  function updateFloaters(dt) {
    for (const f of floaters) { f.y += f.vy * dt; f.life -= dt; }
    floaters = floaters.filter(f => f.life > 0);
  }

  function checkCollisions() {
    for (const b of playerBullets) {
      for (const en of enemies) {
        if (!en.alive) continue;
        if (rectHit(b, en)) {
          b.dead = true;
          en.hp--;
          en.hitFlash = 0.15;
          const def = ENEMY_TYPES[en.type];
          if (en.hp <= 0) {
            en.alive = false;
            registerKill(def.points, en.x, en.y, def.glow || PLANETS[state.planetIdx].accent);
            spawnParticles(en.x, en.y, def.glow || PLANETS[state.planetIdx].accent, 16, 100);
            AudioSys.explosion(false);
            if (def.shakeOnDeath) shake(def.shakeOnDeath, 0.15);
            if (Math.random() < 0.2) dropPowerup(en.x, en.y);
          } else {
            AudioSys.hit();
            spawnParticles(en.x, en.y, '#ffffff', 5, 50);
          }
          break;
        }
      }
      if (b.dead) continue;
      if (boss && !boss.dying && rectHit(b, boss)) {
        b.dead = true;
        boss.hp = Math.max(0, boss.hp - 1);
        boss.hitFlash = 0.1;
        el.bossFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
        spawnParticles(b.x, b.y, '#ffffff', 5, 60);
        AudioSys.hit();
        if (boss.hp <= 0 && !boss.dying) {
          boss.dying = true;
          boss.dyingTimer = 0.7;
          triggerHitStop(0.08);
          shake(10, 0.4);
          AudioSys.explosion(true);
        }
      }
    }
    playerBullets = playerBullets.filter(b => !b.dead);

    for (const b of enemyBullets) {
      if (rectHit(b, player)) {
        b.dead = true;
        spawnParticles(player.x, player.y, '#ff5566', 10, 80);
        loseLife();
      }
    }
    enemyBullets = enemyBullets.filter(b => !b.dead);

    for (const en of enemies) {
      if (en.alive && rectHit(en, player)) {
        en.alive = false;
        spawnParticles(en.x, en.y, '#ff5566', 14, 90);
        AudioSys.explosion(false);
        loseLife();
      }
    }

    for (const p of powerups) {
      if (rectHit(p, player)) {
        p.dead = true;
        applyPowerup(p.type);
        spawnParticles(player.x, player.y - 10, '#ffffff', 18, 110);
        AudioSys.powerup();
        triggerFlash('#ffffff', 0.22);
      }
    }
    powerups = powerups.filter(p => !p.dead);
  }

  function dropPowerup(x, y) {
    const roll = Math.random();
    const type = roll < 0.35 ? 'shield' : roll < 0.7 ? 'weapon' : roll < 0.88 ? 'health' : 'bomb';
    powerups.push({ x, y, w: 22, h: 22, speed: 90, type, phase: Math.random() * Math.PI * 2 });
  }

  function applyPowerup(type) {
    if (type === 'shield') player.shieldTimer = 6;
    else if (type === 'weapon') player.weaponTimer = 8;
    else if (type === 'health') { state.lives = Math.min(state.maxLives, state.lives + 1); refreshLivesHUD(); }
    else if (type === 'bomb') triggerBomb();
  }

  function triggerBomb() {
    AudioSys.bombBlast();
    triggerFlash('#ffffff', 0.7);
    shake(12, 0.4);
    triggerHitStop(0.05);
    for (const en of enemies) {
      if (en.alive) {
        en.alive = false;
        const def = ENEMY_TYPES[en.type];
        registerKill(Math.round(def.points * 0.6), en.x, en.y, def.glow || PLANETS[state.planetIdx].accent);
        spawnParticles(en.x, en.y, def.glow || PLANETS[state.planetIdx].accent, 12, 90);
      }
    }
    enemyBullets = [];
    if (boss && !boss.dying) {
      boss.hp = Math.max(0, boss.hp - Math.round(boss.maxHp * 0.3));
      el.bossFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
      spawnParticles(boss.x, boss.y, '#ffaa33', 20, 120);
      if (boss.hp <= 0) { boss.dying = true; boss.dyingTimer = 0.7; }
    }
  }

  function checkWaveClear() {
    if (state.screen !== 'playing') return;
    if (isBossWave(state.wave)) {
      if (boss === null) triggerLevelClear();
    } else if (enemies.length && enemies.every(e => !e.alive)) {
      triggerLevelClear();
    }
  }

  function triggerLevelClear() {
    const next = PLANETS[(state.planetIdx + 1) % PLANETS.length].name;
    el.levelClearNext.textContent = 'NEXT: ' + next;
    setScreen('levelclear');
    AudioSys.waveClear();
  }

  // ---------- Render ----------
  function render() {
    ctx.save();
    if (state.shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * state.shakeMag, (Math.random() - 0.5) * state.shakeMag);
    }

    drawBackground();
    drawNebulae();
    drawPlanetSphere();
    drawStars(starsFar, 0.5);
    drawShootingStars();
    drawStars(starsNear, 0.9);
    drawParticles();
    drawEnemyBullets();
    drawPlayerBullets();
    drawEnemies();
    drawBoss();
    drawPowerups();
    drawFloaters();
    if (state.screen === 'playing' || state.screen === 'paused') drawPlayer();

    drawVignette();
    ctx.restore();

    if (state.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = state.flashAlpha;
      ctx.fillStyle = state.flashColor;
      ctx.fillRect(0, 0, BASE_W, BASE_H);
      ctx.restore();
    }
  }

  function drawBackground() {
    const planet = PLANETS[state.planetIdx];
    const g = ctx.createLinearGradient(0, 0, 0, BASE_H);
    g.addColorStop(0, planet.top);
    g.addColorStop(1, planet.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }

  function drawNebulae() {
    for (const n of nebulae) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, n.color + '33');
      g.addColorStop(1, n.color + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlanetSphere() {
    const planet = PLANETS[state.planetIdx];
    const { planetCx, planetCy, planetR } = scenery;
    const g = ctx.createRadialGradient(planetCx - planetR * 0.3, planetCy - planetR * 0.3, planetR * 0.1, planetCx, planetCy, planetR);
    g.addColorStop(0, planet.accent);
    g.addColorStop(0.6, planet.top);
    g.addColorStop(1, '#000000');
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(planetCx, planetCy, planetR, 0, Math.PI * 2);
    ctx.fill();
    if (planet.ring) {
      ctx.strokeStyle = planet.accent + '88';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(planetCx, planetCy, planetR * 1.6, planetR * 0.35, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStars(list, baseAlpha) {
    ctx.fillStyle = '#ffffff';
    for (const s of list) {
      ctx.globalAlpha = baseAlpha * (0.5 + Math.sin(s.x + s.y) * 0.2);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawShootingStars() {
    for (const s of shootingStars) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life / 0.6);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.06, s.y - s.vy * 0.06);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(BASE_W / 2, BASE_H / 2, BASE_H * 0.35, BASE_W / 2, BASE_H / 2, BASE_H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
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
    ctx.translate(player.x, player.y);
    ctx.rotate(player.tilt);
    ctx.shadowColor = player.weaponTimer > 0 ? '#ffd23f' : '#7dffb0';
    ctx.shadowBlur = 14;
    ctx.font = '34px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚀', 0, 0);
    ctx.restore();
  }

  function drawEnemies() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const en of enemies) {
      if (!en.alive) continue;
      const def = ENEMY_TYPES[en.type];
      ctx.save();
      ctx.font = Math.round(28 * def.scale) + 'px serif';
      ctx.shadowColor = def.glow || PLANETS[state.planetIdx].accent;
      ctx.shadowBlur = en.hitFlash > 0 ? 26 : 10;
      if (en.hitFlash > 0) ctx.filter = 'brightness(2.2)';
      ctx.fillText(def.emoji, en.x, en.y);
      ctx.restore();

      if (def.hp > 1 && en.hp < en.maxHp) {
        const barW = 24 * def.scale;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(en.x - barW / 2, en.y - 22 * def.scale, barW, 3);
        ctx.fillStyle = '#ff4455';
        ctx.fillRect(en.x - barW / 2, en.y - 22 * def.scale, barW * (en.hp / en.maxHp), 3);
      }
    }
  }

  function drawBoss() {
    if (!boss) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '64px serif';
    ctx.shadowColor = '#ff2244';
    ctx.shadowBlur = boss.hitFlash > 0 ? 30 : 18;
    if (boss.hitFlash > 0) ctx.filter = 'brightness(2)';
    if (boss.dying) {
      ctx.globalAlpha = Math.max(0, boss.dyingTimer / 0.7);
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    ctx.fillText('👹', boss.x, boss.y);
    ctx.restore();
  }

  function drawPlayerBullets() {
    for (const b of playerBullets) {
      ctx.save();
      ctx.shadowColor = '#7dffb0';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#c9ffe0';
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.restore();
    }
  }

  function drawEnemyBullets() {
    for (const b of enemyBullets) {
      ctx.save();
      ctx.shadowColor = '#ff4455';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffb3ba';
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.restore();
    }
  }

  function drawPowerups() {
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons = { shield: '🛡️', health: '❤️', weapon: '⭐', bomb: '💣' };
    const t = performance.now() / 1000;
    for (const p of powerups) {
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(t * 4 + p.phase) * 3);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 14;
      ctx.fillText(icons[p.type], 0, 0);
      ctx.restore();
    }
  }

  function drawFloaters() {
    ctx.textAlign = 'center';
    for (const f of floaters) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      ctx.font = (f.big ? 'bold 18px' : 'bold 14px') + ' Segoe UI, sans-serif';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r || 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

})();
