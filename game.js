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
    screenLeaderboard: document.getElementById('screen-leaderboard'),
    screenUpgrade: document.getElementById('screen-upgrade'),
    upgradeCards: document.getElementById('upgrade-cards'),
    leaderboardList: document.getElementById('leaderboard-list'),
    levelClearTitle: document.getElementById('levelclear-title'),
    levelClearGrade: document.getElementById('levelclear-grade'),
    levelClearTally: document.getElementById('levelclear-tally'),
    levelClearNext: document.getElementById('levelclear-next'),
    gameoverWave: document.getElementById('gameover-wave'),
    gameoverScore: document.getElementById('gameover-score'),
    btnStart: document.getElementById('btn-start'),
    btnStart2p: document.getElementById('btn-start-2p'),
    btnLeaderboard: document.getElementById('btn-leaderboard'),
    btnLeaderboardBack: document.getElementById('btn-leaderboard-back'),
    btnResume: document.getElementById('btn-resume'),
    btnContinue: document.getElementById('btn-continue'),
    btnRestart: document.getElementById('btn-restart'),
    touchMoveZone: document.getElementById('touch-move-zone'),
    btnFire: document.getElementById('btn-fire'),
    inputName: document.getElementById('input-name'),
    btnSubmitScore: document.getElementById('btn-submit-score'),
    submitStatus: document.getElementById('submit-status'),
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
        tone(784, 0.3, 'triangle', 0.22, null, 0.36);
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

  // ============================================================
  // LEADERBOARD — Firebase Firestore (global high scores)
  // ============================================================
  const LeaderboardSys = (() => {
    let db = null;
    try {
      const firebaseConfig = {
        apiKey: 'AIzaSyDaWjFfy7vhdy4_Poo2xAGMrI42Rca5MHY',
        authDomain: 'galactic-zombie-assault.firebaseapp.com',
        projectId: 'galactic-zombie-assault',
        storageBucket: 'galactic-zombie-assault.firebasestorage.app',
        messagingSenderId: '363279081480',
        appId: '1:363279081480:web:cd52ba8dccbe7a1cea31bd',
      };
      if (window.firebase) {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
      }
    } catch (e) {
      db = null;
    }

    async function submit(name, score, wave, mode) {
      if (!db) throw new Error('offline');
      await db.collection('scores').add({
        name: String(name).slice(0, 12),
        score: Math.round(score),
        wave: Math.round(wave),
        mode,
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    async function fetchTop(n) {
      if (!db) throw new Error('offline');
      const snap = await db.collection('scores').orderBy('score', 'desc').limit(n).get();
      return snap.docs.map(d => d.data());
    }

    return { submit, fetchTop, isAvailable: () => !!db };
  })();

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

  // ---------- Boss kinds (cycle every boss wave, each with a distinct look + attack pattern) ----------
  const BOSS_KINDS = [
    { emoji: '👹', glow: '#ff2244', hpMul: 1,    speedMul: 1,   pattern: 'spread', names: ['SKULLORD PRIME', 'THE ROTTEN KING'] },
    { emoji: '👻', glow: '#33ccff', hpMul: 0.85, speedMul: 1.3, pattern: 'sweep',  names: ['VOID WRAITH', 'PHANTOM ECHO'] },
    { emoji: '🗿', glow: '#ffb833', hpMul: 1.6,  speedMul: 0.6, pattern: 'slam',   names: ['STONE COLOSSUS', 'IRON GOLEM'] },
    { emoji: '👺', glow: '#cc55ff', hpMul: 0.75, speedMul: 1.8, pattern: 'rapid',  names: ['NIGHT STALKER', 'CRIMSON REAPER'] },
  ];

  // ---------- Input ----------
  const keys = new Set();
  let dragTouchId = null;
  let lastDragClientX = null;
  let touchDragDelta = 0;
  const TOUCH_SENSITIVITY = 1.6; // >1 so a smaller physical swipe covers the full play width

  // Relative dragging: the ship moves by how far your finger travels, not to
  // wherever your finger currently is. Combined with a dedicated move pad
  // (bottom-left, mirroring FIRE bottom-right) rather than the whole canvas,
  // your thumb rests in a corner and never covers the play field while
  // steering — small swipes there still move the ship across the full width.
  function clientXToGameDelta(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX / rect.width) * BASE_W;
  }
  // Track the drag finger by its own touch identifier so holding FIRE with
  // a second finger never gets mistaken for (or steals) the move gesture.
  // Self-healing: every event re-checks whether our claimed touch is still
  // genuinely active in e.touches. If iOS ever fails to deliver a touchend/
  // touchcancel for it (can happen on interrupted gestures), we notice it's
  // gone and release the claim immediately instead of staying stuck forever.
  function isTouchStillActive(e, id) {
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === id) return true;
    }
    return false;
  }
  // Only the dedicated move pad can *start* a drag (not the whole canvas) —
  // that's what keeps your thumb off the play field. Once a drag is claimed,
  // touchmove/touchend/touchcancel listen on window and filter by the touch's
  // own identifier, so tracking keeps working wherever the finger wanders.
  el.touchMoveZone.addEventListener('touchstart', (e) => {
    if (state.twoPlayer) return;
    if (dragTouchId !== null && isTouchStillActive(e, dragTouchId)) return;
    const t = e.changedTouches[0];
    dragTouchId = t.identifier;
    lastDragClientX = t.clientX;
    AudioSys.unlock();
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (state.twoPlayer || dragTouchId === null) return;
    if (!isTouchStillActive(e, dragTouchId)) { dragTouchId = null; lastDragClientX = null; return; }
    for (const t of e.changedTouches) {
      if (t.identifier === dragTouchId) {
        const deltaClientX = t.clientX - lastDragClientX;
        touchDragDelta += clientXToGameDelta(deltaClientX) * TOUCH_SENSITIVITY;
        lastDragClientX = t.clientX;
        break;
      }
    }
  }, { passive: true });
  function releaseDragTouch(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === dragTouchId) { dragTouchId = null; lastDragClientX = null; break; }
    }
  }
  window.addEventListener('touchend', releaseDragTouch);
  window.addEventListener('touchcancel', releaseDragTouch);

  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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
  bindHold(el.btnFire, ' ');

  el.btnStart.addEventListener('click', () => startGame(false));
  el.btnStart2p.addEventListener('click', () => startGame(true));
  el.btnResume.addEventListener('click', togglePause);
  el.btnContinue.addEventListener('click', handleContinueClick);
  el.btnRestart.addEventListener('click', () => startGame(state.twoPlayer));

  el.upgradeCards.addEventListener('click', (e) => {
    const card = e.target.closest('.upgrade-card');
    if (!card) return;
    AudioSys.powerup();
    applyModifier(card.dataset.id);
    nextWave();
  });

  el.btnLeaderboard.addEventListener('click', () => {
    setScreen('leaderboard');
    renderLeaderboard();
  });
  el.btnLeaderboardBack.addEventListener('click', () => setScreen('start'));

  el.inputName.value = localStorage.getItem('gza_playername') || '';
  el.inputName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.btnSubmitScore.click(); }
  });
  el.btnSubmitScore.addEventListener('click', () => {
    const name = el.inputName.value.trim().toUpperCase() || 'ANON';
    localStorage.setItem('gza_playername', name);
    el.btnSubmitScore.disabled = true;
    el.submitStatus.textContent = 'Submitting…';
    LeaderboardSys.submit(name, state.score, state.wave, state.twoPlayer ? '2P' : '1P')
      .then(() => { el.submitStatus.textContent = 'Submitted! Check the leaderboard 🏆'; })
      .catch(() => {
        el.submitStatus.textContent = "Couldn't submit — check your connection.";
        el.btnSubmitScore.disabled = false;
      });
  });

  function handleEnter() {
    if (state.screen === 'start') startGame(false);
    else if (state.screen === 'levelclear') nextWave();
    else if (state.screen === 'gameover') startGame(state.twoPlayer);
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
    twoPlayer: false,
    killCam: 0,
    killCamX: BASE_W / 2,
    killCamY: BASE_H / 2,
    deathCam: 0,
    deathCamX: BASE_W / 2,
    deathCamY: BASE_H / 2,
    hitsThisWave: 0,
    waveStartScore: 0,
    victoryTallyFrom: 0,
    victoryTallyTo: 0,
    victoryTallyT: 1,
    mods: {},
    modPool: [],
  };
  const KILLCAM_DURATION = 1.0;
  const BOSS_INTRO_DURATION = 1.7;
  const DEATHCAM_DURATION = 1.2;

  // Shared "overshoot" bounce ease used by the boss-intro name-slam and the
  // wave-clear victory-slam title animations.
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // Shared ease-in/hold/ease-out zoom curve used by both the kill cam and the
  // death cam so the two cinematics feel like variations of one system.
  function computeZoomAmt(remaining, duration, rampTime, maxZoom) {
    const elapsed = duration - remaining;
    let zt;
    if (elapsed < rampTime) zt = elapsed / rampTime;
    else if (remaining < rampTime) zt = remaining / rampTime;
    else zt = 1;
    return 1 + maxZoom * zt;
  }
  el.highscore.textContent = 'BEST ' + state.highScore;

  function makePlayer(x) {
    return {
      x, y: BASE_H - 90, w: 34, h: 34,
      speed: 230, cooldown: 0,
      weaponTimer: 0, shieldTimer: 0, hitFlash: 0, invulnTimer: 0,
      speedTimer: 0, sizeTimer: 0, sizeMul: 1,
      droneTimer: 0, droneCooldown: 0,
      exploded: false,
    };
  }

  let player = makePlayer(BASE_W / 2);
  let player2 = null;

  function getActivePlayers() { return player2 ? [player, player2] : [player]; }

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
  let shockwaves = [];
  let formation = { dir: 1, speed: 30, dropAmount: 18 };

  function spawnShockwave(x, y, color, maxR, duration) {
    shockwaves.push({ x, y, color, maxR, life: duration, maxLife: duration });
  }

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
  function weightedPick(pool, fallback) {
    const total = pool.reduce((s, p) => s + p[1], 0);
    let r = Math.random() * total;
    for (const [key, weight] of pool) {
      if (r < weight) return key;
      r -= weight;
    }
    return fallback;
  }

  function pickType(wave, row, rows) {
    const pool = [['shambler', 6]];
    if (wave >= 2) pool.push(['screamer', row < rows / 2 ? 3 : 1]);
    if (wave >= 3) pool.push(['brute', row >= rows - 1 ? 2.5 : 0.4]);
    if (wave >= 4) pool.push(['diver', row === rows - 1 ? 2 : 0.3]);
    return weightedPick(pool, 'shambler');
  }

  const POWERUP_WEIGHTS = [
    ['shield', 14], ['weapon', 14], ['health', 9], ['bomb', 7],
    ['speed', 12], ['mega', 9], ['mini', 9], ['drone', 9], ['gem', 14],
  ];
  const POWERUP_ICONS = {
    shield: '🛡️', health: '❤️', weapon: '⭐', bomb: '💣',
    speed: '⚡', mega: '🔺', mini: '🔹', drone: '🤖', gem: '💎',
  };

  // ---------- Build-choice modifiers (roguelite upgrade picks between waves) ----------
  const MODIFIERS = [
    { id: 'piercing', name: 'PIERCING ROUNDS', desc: 'Bullets punch through the first enemy they hit', icon: '🎯' },
    { id: 'twinCannons', name: 'TWIN CANNONS', desc: 'Always fire a 3-way spread shot', icon: '🔱' },
    { id: 'adrenaline', name: 'ADRENALINE', desc: '+25% movement speed, permanently', icon: '⚡' },
    { id: 'chainReaction', name: 'CHAIN REACTION', desc: 'Kills detonate nearby enemies too', icon: '💥' },
    { id: 'magnet', name: 'MAGNET FIELD', desc: 'Power-ups drift toward your ship', icon: '🧲' },
    { id: 'comboFocus', name: 'COMBO FOCUS', desc: 'Combo multiplier lasts much longer', icon: '🔥' },
    { id: 'reinforcedHull', name: 'REINFORCED HULL', desc: '+1 max life, right now', icon: '🛡️' },
    { id: 'rapidCells', name: 'RAPID CELLS', desc: 'Fire 20% faster, always', icon: '🔋' },
    { id: 'secondWind', name: 'SECOND WIND', desc: 'Survive your first fatal hit this run', icon: '💫' },
  ];

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
    state.hitsThisWave = 0;
    state.waveStartScore = state.score;
    updateComboHUD();
    initPlanetScenery();

    if (isBossWave(state.wave)) {
      spawnBoss();
      el.planetName.textContent = PLANETS[state.planetIdx].name + ' — BOSS WAVE';
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
    const kindIdx = Math.floor(state.wave / 3 - 1) % BOSS_KINDS.length;
    const kind = BOSS_KINDS[kindIdx];
    const hp = Math.round((22 + state.wave * 7) * kind.hpMul);
    boss = {
      x: BASE_W / 2, y: -60, targetY: 110,
      w: 78, h: 78,
      hp, maxHp: hp,
      dir: 1, speed: (55 + state.wave * 2.5) * kind.speedMul,
      fireTimer: 1.2, entering: true, dying: false, dyingTimer: 0,
      hitFlash: 0, erraticTimer: 1.5, lastSlamStep: 0,
      kind, emoji: kind.emoji,
      name: kind.names[Math.floor(Math.random() * kind.names.length)],
      introTimer: BOSS_INTRO_DURATION, roared: false,
    };
  }

  function startGame(twoPlayer) {
    AudioSys.unlock();
    state.score = 0;
    state.lives = 3;
    state.wave = 1;
    state.planetIdx = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.deathCam = 0;
    state.victoryTallyT = 1;
    state.mods = {};
    state.modPool = MODIFIERS.slice();
    state.twoPlayer = !!twoPlayer;
    player = makePlayer(state.twoPlayer ? BASE_W / 2 - 34 : BASE_W / 2);
    player2 = state.twoPlayer ? makePlayer(BASE_W / 2 + 34) : null;
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

  // Between-wave build choice: skipped once every modifier has been picked.
  function handleContinueClick() {
    if (state.modPool.length > 0) showUpgradeChoices();
    else nextWave();
  }

  function showUpgradeChoices() {
    const choices = state.modPool
      .map(m => ({ m, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .slice(0, 3)
      .map(x => x.m);
    el.upgradeCards.innerHTML = choices.map(m => `
      <button class="upgrade-card" data-id="${m.id}">
        <div class="upgrade-icon">${m.icon}</div>
        <div class="upgrade-text">
          <div class="upgrade-name">${m.name}</div>
          <div class="upgrade-desc">${m.desc}</div>
        </div>
      </button>
    `).join('');
    setScreen('upgrade');
  }

  function applyModifier(id) {
    state.mods[id] = true;
    if (id === 'reinforcedHull') {
      state.maxLives++;
      state.lives = Math.min(state.maxLives, state.lives + 1);
      refreshLivesHUD();
    }
    state.modPool = state.modPool.filter(m => m.id !== id);
  }

  function setScreen(name) {
    state.screen = name;
    el.screenStart.classList.toggle('hidden', name !== 'start');
    el.screenPause.classList.toggle('hidden', name !== 'paused');
    el.screenLevelClear.classList.toggle('hidden', name !== 'levelclear');
    el.screenGameOver.classList.toggle('hidden', name !== 'gameover');
    el.screenLeaderboard.classList.toggle('hidden', name !== 'leaderboard');
    el.screenUpgrade.classList.toggle('hidden', name !== 'upgrade');
    if (name === 'gameover' || name === 'start' || name === 'leaderboard') {
      AudioSys.stopMusic();
      el.bossWrap.classList.add('hidden');
    }
  }

  function renderLeaderboard() {
    el.leaderboardList.innerHTML = '<div class="leaderboard-status">Loading…</div>';
    LeaderboardSys.fetchTop(10).then(rows => {
      if (!rows.length) {
        el.leaderboardList.innerHTML = '<div class="leaderboard-status">No scores yet — be the first!</div>';
        return;
      }
      el.leaderboardList.innerHTML = rows.map((r, i) => `
        <div class="leaderboard-row">
          <div class="leaderboard-rank">${i + 1}</div>
          <div class="leaderboard-name">${escapeHtml(r.name || '???')}</div>
          <div class="leaderboard-score">${r.score}</div>
          <div class="leaderboard-mode">${r.mode === '2P' ? '2P' : '1P'}</div>
        </div>
      `).join('');
    }).catch(() => {
      el.leaderboardList.innerHTML = '<div class="leaderboard-status">Can\'t reach the leaderboard right now — check your connection.</div>';
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    state.comboTimer = state.mods.comboFocus ? 2.4 : 1.4;
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

  function loseLife(p) {
    if (state.deathCam > 0) return;
    if (p.shieldTimer > 0 || p.invulnTimer > 0) return;
    state.lives--;
    state.hitsThisWave++;
    p.hitFlash = 1.2;
    p.invulnTimer = 1.0;
    shake(7, 0.3);
    triggerFlash('#ff2233', 0.35);
    AudioSys.hurt();
    refreshLivesHUD();
    if (state.lives <= 0) {
      if (state.mods.secondWind && !state.mods.secondWindUsed) {
        state.mods.secondWindUsed = true;
        state.lives = 1;
        p.invulnTimer = 2.0;
        triggerFlash('#66ffff', 0.6);
        shake(12, 0.4);
        AudioSys.powerup();
        refreshLivesHUD();
      } else {
        startDeathCam(p);
      }
    }
  }

  // Dramatic slow-mo explosion on the fatal hit, before the game-over screen
  // appears — mirrors the kill cam's dt-slowdown/zoom system (see loop() and
  // computeZoomAmt), just bigger, redder, and ending in endGame() instead of
  // triggerLevelClear().
  function startDeathCam(p) {
    state.deathCam = DEATHCAM_DURATION;
    state.deathCamX = p.x;
    state.deathCamY = p.y;
    p.exploded = true;
    shake(16, 0.5);
    triggerFlash('#ff2233', 0.6);
    spawnParticles(p.x, p.y, '#ff5533', 30, 160);
    spawnParticles(p.x, p.y, '#ffaa33', 20, 100);
    spawnShockwave(p.x, p.y, '#ff3344', 200, DEATHCAM_DURATION - 0.1);
    AudioSys.explosion(true);
  }

  function endGame() {
    el.gameoverScore.textContent = 'SCORE ' + state.score + '   ·   BEST ' + state.highScore;
    el.gameoverWave.textContent = 'MADE IT TO WAVE ' + state.wave;
    el.btnSubmitScore.disabled = false;
    el.submitStatus.textContent = '';
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

    if (state.killCam > 0) {
      state.killCam -= dt;
      dt *= 0.15;
      if (state.killCam <= 0) {
        state.killCam = 0;
        // Guard: an enemy bullet already in flight can still kill the player
        // during the slow-mo window, ending the game before the cam finishes.
        // Don't let the delayed level-clear stomp that game-over screen.
        if (state.screen === 'playing') triggerLevelClear();
      }
    }

    if (state.deathCam > 0) {
      state.deathCam -= dt;
      dt *= 0.2;
      if (state.deathCam <= 0) {
        state.deathCam = 0;
        if (state.screen === 'playing') endGame();
      }
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

    if (state.victoryTallyT < 1) {
      state.victoryTallyT = Math.min(1, state.victoryTallyT + dt / 0.6);
      const val = Math.round(state.victoryTallyFrom + (state.victoryTallyTo - state.victoryTallyFrom) * state.victoryTallyT);
      el.levelClearTally.textContent = 'SCORE ' + val;
    }

    if (state.screen !== 'playing') return;

    const intensity = Math.min(1, (state.wave - 1) / 8);
    AudioSys.updateMusic(dt, intensity);

    if (state.twoPlayer) {
      updatePlayerGeneric(player, dt, ['ArrowLeft'], ['ArrowRight'], [' '], false);
      updatePlayerGeneric(player2, dt, ['a', 'A'], ['d', 'D'], ['Shift', 'f', 'F', 'v', 'V'], false);
    } else {
      updatePlayerGeneric(player, dt, ['ArrowLeft', 'a', 'A'], ['ArrowRight', 'd', 'D'], [' '], true);
    }
    updateBullets(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updatePowerups(dt);
    updateParticles(dt);
    updateFloaters(dt);
    updateShockwaves(dt);
    checkCollisions();
    checkWaveClear();

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) { state.combo = 0; updateComboHUD(); }
    }
    for (const p of getActivePlayers()) {
      if (p.hitFlash > 0) p.hitFlash -= dt;
    }
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

  function updatePlayerGeneric(p, dt, leftKeys, rightKeys, fireKeys, allowTouchDrag) {
    const left = leftKeys.some(k => keys.has(k));
    const right = rightKeys.some(k => keys.has(k));
    const curSpeed = p.speed * (p.speedTimer > 0 ? 1.6 : 1) * (state.mods.adrenaline ? 1.25 : 1);
    if (left) p.x -= curSpeed * dt;
    if (right) p.x += curSpeed * dt;
    if (allowTouchDrag && touchDragDelta !== 0) {
      p.x += touchDragDelta;
      touchDragDelta = 0;
    }
    p.x = Math.max(p.w / 2 + 4, Math.min(BASE_W - p.w / 2 - 4, p.x));

    if (p.speedTimer > 0) p.speedTimer -= dt;
    if (p.sizeTimer > 0) {
      p.sizeTimer -= dt;
      if (p.sizeTimer <= 0) p.sizeMul = 1;
    }
    p.w = 34 * p.sizeMul;
    p.h = 34 * p.sizeMul;

    if (p.droneTimer > 0) {
      p.droneTimer -= dt;
      p.droneCooldown -= dt;
      if (p.droneCooldown <= 0) {
        playerBullets.push({ x: p.x + 22, y: p.y - 10, vx: 0, vy: -480, w: 4, h: 10 });
        p.droneCooldown = 0.35;
      }
    }

    if (Math.random() < 0.6) {
      particles.push({
        x: p.x + (Math.random() - 0.5) * 8, y: p.y + 16,
        vx: (Math.random() - 0.5) * 20, vy: 60 + Math.random() * 40,
        life: 0.25, maxLife: 0.25, r: Math.random() * 2 + 1,
        color: p.weaponTimer > 0 ? '#ffd23f' : '#33e0ff',
      });
    }

    if (p.shieldTimer > 0) p.shieldTimer -= dt;
    if (p.weaponTimer > 0) p.weaponTimer -= dt;
    if (p.invulnTimer > 0) p.invulnTimer -= dt;
    if (p === player) el.shieldBar.style.width = Math.max(0, (p.shieldTimer / 6) * 100) + '%';
    refreshLivesHUD();

    if (p.cooldown > 0) p.cooldown -= dt;
    const firing = fireKeys.some(k => keys.has(k));
    if (firing && p.cooldown <= 0) {
      fireBullets(p);
      p.cooldown = (p.weaponTimer > 0 ? 0.11 : 0.26) * (state.mods.rapidCells ? 0.8 : 1);
    }
  }

  function fireBullets(p) {
    const overcharged = p.weaponTimer > 0;
    const pierce = state.mods.piercing ? 1 : 0;
    spawnParticles(p.x, p.y - 20, '#c9ffe0', 3, 40);
    if (overcharged || state.mods.twinCannons) {
      playerBullets.push({ x: p.x - 10, y: p.y - 18, vx: -60, vy: -540, w: 5, h: 12, pierce });
      playerBullets.push({ x: p.x, y: p.y - 22, vx: 0, vy: -580, w: 5, h: 12, pierce });
      playerBullets.push({ x: p.x + 10, y: p.y - 18, vx: 60, vy: -540, w: 5, h: 12, pierce });
      AudioSys.laserBig();
    } else {
      playerBullets.push({ x: p.x, y: p.y - 22, vx: 0, vy: -500, w: 5, h: 14, pierce });
      AudioSys.laser();
    }
  }

  function updateBullets(dt) {
    for (const b of playerBullets) {
      b.x += (b.vx || 0) * dt; b.y += b.vy * dt;
      particles.push({ x: b.x, y: b.y + b.h / 2, vx: 0, vy: 0, life: 0.1, maxLife: 0.1, r: 1.6, color: '#7dffb0' });
    }
    playerBullets = playerBullets.filter(b => b.y > -20 && b.x > -20 && b.x < BASE_W + 20);

    for (const b of enemyBullets) {
      b.x += (b.vx || 0) * dt; b.y += b.vy * dt;
      particles.push({ x: b.x, y: b.y - b.h / 2, vx: 0, vy: 0, life: 0.1, maxLife: 0.1, r: 1.6, color: '#ff4455' });
    }
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
        const targets = getActivePlayers();
        const target = targets[Math.floor(Math.random() * targets.length)];
        const travelTime = 1 + Math.random() * 0.4;
        d.diveVx = (target.x - d.x) / travelTime;
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

    if (boss.introTimer > 0) {
      boss.introTimer -= dt;
      if (!boss.roared && boss.introTimer <= BOSS_INTRO_DURATION - 0.7) {
        boss.roared = true;
        AudioSys.bossRoar();
        shake(14, 0.5);
      }
      if (boss.introTimer <= 0) {
        boss.introTimer = 0;
        el.bossWrap.classList.remove('hidden');
        el.bossName.textContent = boss.name;
        el.bossFill.style.width = '100%';
      }
      return;
    }

    if (boss.dying) {
      boss.dyingTimer -= dt;
      if (Math.random() < 0.6) {
        spawnParticles(boss.x + (Math.random() - 0.5) * boss.w, boss.y + (Math.random() - 0.5) * boss.h, boss.kind.glow, 6, 120);
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

    const pattern = boss.kind.pattern;
    const margin = 70;

    if (pattern === 'rapid') {
      boss.erraticTimer -= dt;
      if (boss.erraticTimer <= 0) {
        boss.erraticTimer = 0.6 + Math.random() * 0.8;
        if (Math.random() < 0.5) boss.dir *= -1;
      }
    }

    boss.x += boss.dir * boss.speed * dt;
    if (boss.x < margin) { boss.x = margin; boss.dir = 1; }
    if (boss.x > BASE_W - margin) { boss.x = BASE_W - margin; boss.dir = -1; }

    if (pattern === 'sweep') {
      boss.y = boss.targetY + Math.sin(performance.now() / 700) * 26;
    }

    if (boss.hitFlash > 0) boss.hitFlash -= dt;

    const enrage = 1 - boss.hp / boss.maxHp;
    boss.fireTimer -= dt;

    if (pattern === 'spread' && boss.fireTimer <= 0) {
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
    } else if (pattern === 'sweep' && boss.fireTimer <= 0) {
      boss.fireTimer = Math.max(0.18, 0.4 - enrage * 0.2);
      const sweepAngle = Math.sin(performance.now() / 400) * 0.9;
      const speed = 210 + state.wave * 6;
      enemyBullets.push({ x: boss.x - 20, y: boss.y + boss.h / 2, vx: Math.sin(sweepAngle) * speed, vy: Math.cos(sweepAngle) * speed, w: 6, h: 14 });
      enemyBullets.push({ x: boss.x + 20, y: boss.y + boss.h / 2, vx: Math.sin(-sweepAngle) * speed, vy: Math.cos(-sweepAngle) * speed, w: 6, h: 14 });
    } else if (pattern === 'slam' && boss.fireTimer <= 0) {
      boss.fireTimer = Math.max(0.7, 1.6 - enrage * 0.6);
      const target = getActivePlayers()[0];
      const dx = target.x - boss.x, dy = target.y - boss.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = 220 + state.wave * 6;
      enemyBullets.push({ x: boss.x, y: boss.y + boss.h / 2, vx: (dx / dist) * speed, vy: (dy / dist) * speed, w: 8, h: 16 });
    } else if (pattern === 'rapid' && boss.fireTimer <= 0) {
      boss.fireTimer = Math.max(0.16, 0.4 - enrage * 0.25);
      const speed = 240 + state.wave * 7;
      enemyBullets.push({ x: boss.x, y: boss.y + boss.h / 2, vx: (Math.random() - 0.5) * 40, vy: speed, w: 5, h: 12 });
    }

    if (pattern === 'slam') {
      const hpFrac = boss.hp / boss.maxHp;
      const step = Math.floor((1 - hpFrac) * 4);
      if (step > boss.lastSlamStep && step < 4) {
        boss.lastSlamStep = step;
        shake(10, 0.35);
        triggerFlash('#ffb833', 0.25);
        const ringCount = 10;
        const speed = 170 + state.wave * 5;
        for (let i = 0; i < ringCount; i++) {
          const ang = (i / ringCount) * Math.PI * 2;
          enemyBullets.push({ x: boss.x, y: boss.y, vx: Math.sin(ang) * speed, vy: Math.cos(ang) * speed, w: 6, h: 6 });
        }
      }
    }

    for (const p of getActivePlayers()) {
      if (rectHit(boss, p)) loseLife(p);
    }
  }

  function finishBossDeath() {
    registerKill(500 + state.wave * 50, boss.x, boss.y, boss.kind.glow);
    dropPowerup(boss.x - 20, boss.y);
    dropPowerup(boss.x + 20, boss.y);
    shake(14, 0.5);
    triggerFlash('#ffffff', 0.5);
    boss = null;
    el.bossWrap.classList.add('hidden');
  }

  function updatePowerups(dt) {
    for (const p of powerups) {
      p.y += p.speed * dt;
      if (state.mods.magnet) {
        let nearest = null, nearestDist = Infinity;
        for (const pl of getActivePlayers()) {
          const d = Math.hypot(pl.x - p.x, pl.y - p.y);
          if (d < nearestDist) { nearestDist = d; nearest = pl; }
        }
        if (nearest && nearestDist < 160 && nearestDist > 1) {
          p.x += (nearest.x - p.x) / nearestDist * 220 * dt;
          p.y += (nearest.y - p.y) / nearestDist * 220 * dt;
        }
      }
    }
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

  function updateShockwaves(dt) {
    for (const s of shockwaves) s.life -= dt;
    shockwaves = shockwaves.filter(s => s.life > 0);
  }

  function checkCollisions() {
    for (const b of playerBullets) {
      for (const en of enemies) {
        if (!en.alive) continue;
        if (rectHit(b, en)) {
          en.hp--;
          en.hitFlash = 0.15;
          const def = ENEMY_TYPES[en.type];
          if (en.hp <= 0) {
            en.alive = false;
            registerKill(def.points, en.x, en.y, def.glow || PLANETS[state.planetIdx].accent);
            spawnParticles(en.x, en.y, def.glow || PLANETS[state.planetIdx].accent, 16, 100);
            spawnShockwave(en.x, en.y, def.glow || PLANETS[state.planetIdx].accent, 26 * def.scale, 0.3);
            AudioSys.explosion(false);
            if (def.shakeOnDeath) shake(def.shakeOnDeath, 0.15);
            if (Math.random() < 0.2) dropPowerup(en.x, en.y);
            if (state.mods.chainReaction) {
              for (const other of enemies) {
                if (other === en || !other.alive) continue;
                const dx = other.x - en.x, dy = other.y - en.y;
                if (dx * dx + dy * dy < 3600) {
                  other.alive = false;
                  const odef = ENEMY_TYPES[other.type];
                  registerKill(Math.round(odef.points * 0.5), other.x, other.y, odef.glow || PLANETS[state.planetIdx].accent);
                  spawnParticles(other.x, other.y, odef.glow || PLANETS[state.planetIdx].accent, 10, 80);
                  spawnShockwave(other.x, other.y, odef.glow || PLANETS[state.planetIdx].accent, 20, 0.25);
                  AudioSys.hit();
                }
              }
            }
            if (!isBossWave(state.wave) && state.killCam <= 0 && enemies.every(e => !e.alive)) {
              state.killCam = KILLCAM_DURATION;
              state.killCamX = en.x;
              state.killCamY = en.y;
              spawnShockwave(en.x, en.y, '#ffffff', 70, 0.5);
            }
          } else {
            AudioSys.hit();
            spawnParticles(en.x, en.y, '#ffffff', 5, 50);
          }
          if (b.pierce > 0) {
            b.pierce--;
          } else {
            b.dead = true;
            break;
          }
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
          spawnShockwave(boss.x, boss.y, boss.kind.glow, 90, 0.5);
          AudioSys.explosion(true);
        }
      }
    }
    playerBullets = playerBullets.filter(b => !b.dead);

    const activePlayers = getActivePlayers();

    for (const b of enemyBullets) {
      for (const p of activePlayers) {
        if (rectHit(b, p)) {
          b.dead = true;
          spawnParticles(p.x, p.y, '#ff5566', 10, 80);
          loseLife(p);
          break;
        }
      }
    }
    enemyBullets = enemyBullets.filter(b => !b.dead);

    for (const en of enemies) {
      if (!en.alive) continue;
      for (const p of activePlayers) {
        if (rectHit(en, p)) {
          en.alive = false;
          spawnParticles(en.x, en.y, '#ff5566', 14, 90);
          AudioSys.explosion(false);
          loseLife(p);
          break;
        }
      }
    }

    for (const pu of powerups) {
      for (const p of activePlayers) {
        if (rectHit(pu, p)) {
          pu.dead = true;
          applyPowerup(pu.type, p);
          spawnParticles(p.x, p.y - 10, '#ffffff', 18, 110);
          AudioSys.powerup();
          triggerFlash('#ffffff', 0.22);
          break;
        }
      }
    }
    powerups = powerups.filter(pu => !pu.dead);
  }

  function dropPowerup(x, y) {
    const type = weightedPick(POWERUP_WEIGHTS, 'shield');
    powerups.push({ x, y, w: 22, h: 22, speed: 90, type, phase: Math.random() * Math.PI * 2 });
  }

  function applyPowerup(type, p) {
    if (type === 'shield') p.shieldTimer = 6;
    else if (type === 'weapon') p.weaponTimer = 8;
    else if (type === 'health') { state.lives = Math.min(state.maxLives, state.lives + 1); refreshLivesHUD(); }
    else if (type === 'bomb') triggerBomb();
    else if (type === 'speed') p.speedTimer = 8;
    else if (type === 'mega') { p.sizeTimer = 8; p.sizeMul = 1.6; p.weaponTimer = Math.max(p.weaponTimer, 8); }
    else if (type === 'mini') { p.sizeTimer = 8; p.sizeMul = 0.6; }
    else if (type === 'drone') p.droneTimer = 10;
    else if (type === 'gem') { addScore(100); spawnFloater(p.x, p.y - 20, '+100', '#66ffff', true); }
  }

  function triggerBomb() {
    AudioSys.bombBlast();
    triggerFlash('#ffffff', 0.7);
    shake(12, 0.4);
    triggerHitStop(0.05);
    spawnShockwave(player.x, player.y, '#ffffff', 240, 0.55);
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
    if (state.killCam > 0) return; // let the slow-mo kill cam play out first
    if (isBossWave(state.wave)) {
      if (boss === null) triggerLevelClear();
    } else if (enemies.length && enemies.every(e => !e.alive)) {
      triggerLevelClear();
    }
  }

  function computeGrade() {
    if (state.hitsThisWave === 0) return { text: 'PERFECT', color: '#ffd23f' };
    if (state.hitsThisWave === 1) return { text: 'GREAT', color: '#7dffb0' };
    return { text: 'CLEARED', color: '#7dd4ff' };
  }

  function triggerLevelClear() {
    const next = PLANETS[(state.planetIdx + 1) % PLANETS.length].name;
    el.levelClearNext.textContent = 'NEXT: ' + next;
    el.levelClearTitle.textContent = isBossWave(state.wave) ? 'BOSS DEFEATED' : 'WAVE CLEARED';
    const grade = computeGrade();
    el.levelClearGrade.textContent = grade.text;
    el.levelClearGrade.style.color = grade.color;
    state.victoryTallyFrom = state.waveStartScore;
    state.victoryTallyTo = state.score;
    state.victoryTallyT = 0;
    el.levelClearTally.textContent = 'SCORE ' + state.victoryTallyFrom;
    setScreen('levelclear');
    el.levelClearTitle.classList.remove('slam-in');
    void el.levelClearTitle.offsetWidth; // force reflow so the animation replays every wave
    el.levelClearTitle.classList.add('slam-in');
    shake(8, 0.3);
    AudioSys.waveClear();
  }

  // ---------- Render ----------
  function render() {
    ctx.save();
    if (state.shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * state.shakeMag, (Math.random() - 0.5) * state.shakeMag);
    }
    if (state.killCam > 0) {
      const zoomAmt = computeZoomAmt(state.killCam, KILLCAM_DURATION, 0.2, 0.5);
      ctx.translate(BASE_W / 2, BASE_H / 2);
      ctx.scale(zoomAmt, zoomAmt);
      ctx.translate(-state.killCamX, -state.killCamY);
    } else if (state.deathCam > 0) {
      const zoomAmt = computeZoomAmt(state.deathCam, DEATHCAM_DURATION, 0.25, 0.8);
      ctx.translate(BASE_W / 2, BASE_H / 2);
      ctx.scale(zoomAmt, zoomAmt);
      ctx.translate(-state.deathCamX, -state.deathCamY);
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
    drawShockwaves();
    drawPowerups();
    drawFloaters();
    if (state.screen === 'playing' || state.screen === 'paused') {
      drawPlayer(player, 'p1');
      if (player2) drawPlayer(player2, 'p2');
    }
    if (boss && boss.introTimer > 0) drawBossIntro(boss);

    drawVignette();
    ctx.restore();

    drawScanlines();

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

  // Subtle CRT-style scanlines for a "sci-fi screen" feel — one cheap pattern fill per frame.
  const scanlinePattern = (() => {
    const tile = document.createElement('canvas');
    tile.width = 1;
    tile.height = 3;
    const tctx = tile.getContext('2d');
    tctx.fillStyle = 'rgba(0,0,0,0.35)';
    tctx.fillRect(0, 0, 1, 1);
    return ctx.createPattern(tile, 'repeat');
  })();

  function drawScanlines() {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = scanlinePattern;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
    ctx.restore();
  }

  function drawPlayer(p, kind) {
    if (p.exploded) return;
    const blinking = p.hitFlash > 0 && Math.floor(p.hitFlash * 12) % 2 === 0;
    if (blinking) return;

    if (p.shieldTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(51, 224, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#33e0ff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 4, 28 * p.sizeMul, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (kind === 'p2') drawSaucer(p.x, p.y, p.sizeMul, p.weaponTimer > 0);
    else drawFighter(p.x, p.y, p.sizeMul, p.weaponTimer > 0);

    if (p.droneTimer > 0) {
      ctx.save();
      ctx.translate(p.x + 22, p.y - 8);
      ctx.shadowColor = '#33e0ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#8fe0ff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a2a3a';
      ctx.beginPath();
      ctx.arc(0, -1, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Hand-drawn vector fighter for Player 1 — always perfectly upright,
  // unlike a rocket emoji (whose artwork is pre-tilted on some platforms).
  function drawFighter(x, y, scale, charged) {
    const t = performance.now() / 1000;
    const accent = charged ? '#ffd23f' : '#7dffb0';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Engine flame (flickering, additive glow)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flameLen = 9 + Math.sin(t * 28) * 3 + Math.random() * 3;
    const flameGrad = ctx.createLinearGradient(0, 12, 0, 12 + flameLen);
    flameGrad.addColorStop(0, charged ? 'rgba(255,226,122,0.95)' : 'rgba(140,230,255,0.95)');
    flameGrad.addColorStop(1, 'rgba(140,230,255,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-4, 12);
    ctx.lineTo(0, 12 + flameLen);
    ctx.lineTo(4, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Hull
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
    const bodyGrad = ctx.createLinearGradient(0, -17, 0, 14);
    bodyGrad.addColorStop(0, '#f2fff9');
    bodyGrad.addColorStop(0.45, accent);
    bodyGrad.addColorStop(1, '#0d6b3f');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(6, 6);
    ctx.lineTo(15, 14);
    ctx.lineTo(5, 8);
    ctx.lineTo(4, 14);
    ctx.lineTo(-4, 14);
    ctx.lineTo(-5, 8);
    ctx.lineTo(-15, 14);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Cockpit
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#132038';
    ctx.beginPath();
    ctx.ellipse(0, -4, 2.6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-0.8, -6, 0.9, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Hand-drawn vector saucer for Player 2 (co-op) — same "always upright" guarantee.
  function drawSaucer(x, y, scale, charged) {
    const accent = charged ? '#ffd23f' : '#7dd4ff';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glowGrad = ctx.createRadialGradient(0, 6, 1, 0, 6, 16);
    glowGrad.addColorStop(0, 'rgba(140,220,255,0.55)');
    glowGrad.addColorStop(1, 'rgba(140,220,255,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 7, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const bodyGrad = ctx.createLinearGradient(0, -4, 0, 8);
    bodyGrad.addColorStop(0, '#eaf7ff');
    bodyGrad.addColorStop(1, '#3f6fa8');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 3, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(0, -3, 7.5, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();

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
    ctx.shadowColor = boss.kind.glow;
    ctx.shadowBlur = boss.hitFlash > 0 ? 30 : 18;
    if (boss.hitFlash > 0) ctx.filter = 'brightness(2)';
    if (boss.dying) {
      ctx.globalAlpha = Math.max(0, boss.dyingTimer / 0.7);
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    ctx.fillText(boss.emoji, boss.x, boss.y);
    ctx.restore();
  }

  // Dramatic name-slam cutscene before a boss fight begins — the boss stays
  // hidden off-screen (see updateBoss's introTimer guard) while this plays.
  function drawBossIntro(b) {
    const p = 1 - b.introTimer / BOSS_INTRO_DURATION; // 0 -> 1 over the intro
    const fadeIn = Math.min(1, p / 0.15);
    const fadeOut = Math.max(0, 1 - Math.max(0, (p - 0.8) / 0.2));
    const overlayAlpha = fadeIn * fadeOut;
    if (overlayAlpha <= 0) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + (0.6 * overlayAlpha) + ')';
    ctx.fillRect(0, 0, BASE_W, BASE_H);

    const revealT = Math.min(1, p / 0.35);
    const scale = Math.max(0, easeOutBack(revealT));

    ctx.globalAlpha = overlayAlpha;
    ctx.translate(BASE_W / 2, BASE_H * 0.42);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = b.kind.glow;
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 15px "Segoe UI", sans-serif';
    ctx.fillText('⚠ BOSS INCOMING ⚠', 0, -32);
    ctx.font = '900 30px "Segoe UI", sans-serif';
    ctx.fillStyle = b.kind.glow;
    ctx.fillText(b.name, 0, 6);
    ctx.restore();
  }

  function drawPlayerBullets() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of playerBullets) {
      ctx.shadowColor = '#7dffb0';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#c9ffe0';
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(b.x - 1, b.y - b.h / 2, 2, b.h);
    }
    ctx.restore();
  }

  function drawEnemyBullets() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of enemyBullets) {
      ctx.shadowColor = '#ff4455';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffb3ba';
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff0f2';
      ctx.fillRect(b.x - 1, b.y - b.h / 2, 2, b.h);
    }
    ctx.restore();
  }

  function drawPowerups() {
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const t = performance.now() / 1000;
    for (const p of powerups) {
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(t * 4 + p.phase) * 3);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 14;
      ctx.fillText(POWERUP_ICONS[p.type], 0, 0);
      ctx.restore();
    }
  }

  function drawShockwaves() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of shockwaves) {
      const t = 1 - s.life / s.maxLife;
      const r = s.maxR * (0.15 + t * 0.85);
      ctx.globalAlpha = Math.max(0, (1 - t) * 0.8);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
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
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r || 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

})();
