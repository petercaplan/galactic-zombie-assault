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
    overdriveBar: document.getElementById('overdrive-bar'),
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
    levelClearLore: document.getElementById('levelclear-lore'),
    gameoverWave: document.getElementById('gameover-wave'),
    gameoverCause: document.getElementById('gameover-cause'),
    gameoverScore: document.getElementById('gameover-score'),
    btnStart: document.getElementById('btn-start'),
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
    btnShareCard: document.getElementById('btn-share-card'),
    resultCanvas: document.getElementById('result-card-canvas'),
    introCrawl: document.getElementById('intro-crawl'),
    coreButtons: document.getElementById('core-buttons'),
    coreDesc: document.getElementById('core-desc'),
    mpBadge: document.getElementById('mp-badge'),
    btnOnline: document.getElementById('btn-online'),
    screenOnlineMenu: document.getElementById('screen-online-menu'),
    btnHostGame: document.getElementById('btn-host-game'),
    btnJoinGame: document.getElementById('btn-join-game'),
    btnOnlineBack: document.getElementById('btn-online-back'),
    screenJoin: document.getElementById('screen-join'),
    inputJoinCode: document.getElementById('input-join-code'),
    btnJoinConfirm: document.getElementById('btn-join-confirm'),
    joinStatus: document.getElementById('join-status'),
    btnJoinBack: document.getElementById('btn-join-back'),
    screenHostLobby: document.getElementById('screen-host-lobby'),
    hostRoomCode: document.getElementById('host-room-code'),
    lobbyPlayers: document.getElementById('lobby-players'),
    btnHostStart: document.getElementById('btn-host-start'),
    btnHostCancel: document.getElementById('btn-host-cancel'),
    screenGuestLobby: document.getElementById('screen-guest-lobby'),
    guestRoomCode: document.getElementById('guest-room-code'),
    guestLobbyStatus: document.getElementById('guest-lobby-status'),
    lobbyPlayersGuest: document.getElementById('lobby-players-guest'),
    btnGuestLeave: document.getElementById('btn-guest-leave'),
  };

  // One-time opening hook — shown before the player has ever dismissed it,
  // never again after. Lives outside the screen/state machine entirely so it
  // can't interfere with normal play state.
  if (!localStorage.getItem('gza_seenIntro')) {
    el.introCrawl.classList.remove('hidden');
    const dismissIntro = () => {
      el.introCrawl.classList.add('hidden');
      localStorage.setItem('gza_seenIntro', '1');
    };
    el.introCrawl.addEventListener('click', dismissIntro, { once: true });
    el.introCrawl.addEventListener('touchstart', dismissIntro, { once: true, passive: true });
    window.addEventListener('keydown', dismissIntro, { once: true });
  }

  // ---------- Ship Cores (persistent meta-progression) ----------
  // Everything else in a run resets to zero on death — this is the one thing
  // that carries over, so playing today makes tomorrow's run start stronger.
  // Unlocks are based on lifetime totals across every run (see endGame()),
  // stored in localStorage, never on a single run's score. Declared early
  // (before makePlayer/player below) since makePlayer() reads activeCore()
  // at module init time, and `const` bindings aren't hoisted like functions.
  function getLifetimeStats() {
    return {
      lifetimeScore: Number(localStorage.getItem('gza_lifetimeScore') || 0),
      lifetimeBosses: Number(localStorage.getItem('gza_lifetimeBosses') || 0),
    };
  }
  const CORES = [
    { id: 'alpha', name: 'ALPHA STRIKE', icon: '🚀', desc: 'Balanced. No bonus, no drawback.',
      unlock: () => true, mods: {} },
    { id: 'aegis', name: 'AEGIS', icon: '🛡️', desc: '+1 starting life. 8% slower.',
      unlock: (s) => s.lifetimeScore >= 2000, unlockHint: 'Reach 2,000 lifetime score to unlock',
      mods: { maxLifeBonus: 1, speedMul: 0.92 } },
    { id: 'razor', name: 'RAZOR', icon: '⚔️', desc: '12% faster fire. Bigger hitbox.',
      unlock: (s) => s.lifetimeBosses >= 3, unlockHint: 'Defeat 3 bosses total to unlock',
      mods: { fireCooldownMul: 0.88, hitboxMul: 1.08 } },
    { id: 'phantom', name: 'PHANTOM', icon: '👻', desc: 'Overdrive charges 30% faster. Shields fade quicker.',
      unlock: (s) => s.lifetimeScore >= 8000, unlockHint: 'Reach 8,000 lifetime score to unlock',
      mods: { overdriveChargeMul: 1.3, shieldDurationMul: 0.75 } },
  ];

  function activeCore() {
    const lifetime = getLifetimeStats();
    const selectedId = localStorage.getItem('gza_selectedCore') || 'alpha';
    return CORES.find(c => c.id === selectedId && c.unlock(lifetime)) || CORES[0];
  }

  function renderCoreSelect() {
    const lifetime = getLifetimeStats();
    const selectedId = localStorage.getItem('gza_selectedCore') || 'alpha';
    el.coreButtons.innerHTML = CORES.map(c => {
      const unlocked = c.unlock(lifetime);
      const selected = unlocked && c.id === selectedId;
      return `<button class="core-btn${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}" data-id="${c.id}">
        <div class="core-icon">${unlocked ? c.icon : '🔒'}</div>
        <div class="core-name">${c.name}</div>
      </button>`;
    }).join('');
    const active = activeCore();
    el.coreDesc.textContent = active.desc;
  }

  el.coreButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('.core-btn');
    if (!btn) return;
    const core = CORES.find(c => c.id === btn.dataset.id);
    if (!core.unlock(getLifetimeStats())) {
      el.coreDesc.textContent = '🔒 ' + core.unlockHint;
      return;
    }
    localStorage.setItem('gza_selectedCore', core.id);
    renderCoreSelect();
  });
  renderCoreSelect();

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
  // Shared Firestore handle — both the leaderboard and the multiplayer sync
  // below reuse this single initialized app/db rather than each calling
  // firebase.initializeApp() (which throws if called a second time).
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

  const LeaderboardSys = (() => {
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

  // ============================================================
  // MULTIPLAYER — host-authoritative real-time co-op over the same
  // Firestore project as the leaderboard. One player's browser (the host)
  // runs the actual simulation exactly like solo play and broadcasts a
  // trimmed state snapshot ~8x/sec; every other browser (a guest) never
  // simulates anything itself — it just renders the latest snapshot and
  // sends its own input back. This keeps the guest's code surface tiny and
  // avoids any simulation desync, at the cost of guest input having some
  // network latency (a deliberate simplicity-over-precision tradeoff for a
  // casual family game, not a competitive one).
  // ============================================================
  const MultiplayerSys = (() => {
    function isAvailable() { return !!db; }

    function makeCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
      let s = '';
      for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    }

    async function hostCreate(hostName) {
      if (!db) throw new Error('offline');
      const code = makeCode();
      const hostId = 'p_' + Math.random().toString(36).slice(2, 9);
      await db.collection('mp_rooms').doc(code).set({
        hostId,
        phase: 'lobby',
        players: { [hostId]: { name: hostName.slice(0, 12), isHost: true, colorIdx: 0 } },
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return { code, playerId: hostId };
    }

    async function guestJoin(code, guestName) {
      if (!db) throw new Error('offline');
      const ref = db.collection('mp_rooms').doc(code);
      const snap = await ref.get();
      if (!snap.exists) throw new Error('not-found');
      const data = snap.data();
      if (data.phase !== 'lobby') throw new Error('already-started');
      const count = Object.keys(data.players || {}).length;
      if (count >= 4) throw new Error('full');
      const guestId = 'p_' + Math.random().toString(36).slice(2, 9);
      await ref.update({
        ['players.' + guestId]: { name: guestName.slice(0, 12), isHost: false, colorIdx: count },
      });
      return { playerId: guestId, colorIdx: count };
    }

    function listenRoom(code, cb) {
      return db.collection('mp_rooms').doc(code).onSnapshot(snap => {
        cb(snap.exists ? snap.data() : null);
      }, () => cb(null));
    }

    function listenInputs(code, cb) {
      return db.collection('mp_rooms').doc(code).collection('inputs').onSnapshot(snap => {
        const map = {};
        snap.forEach(d => { map[d.id] = d.data(); });
        cb(map);
      });
    }

    function sendInput(code, playerId, input) {
      if (!db || !code) return;
      db.collection('mp_rooms').doc(code).collection('inputs').doc(playerId).set(input).catch(() => {});
    }

    function startRoom(code) {
      return db.collection('mp_rooms').doc(code).update({ phase: 'playing' });
    }

    function writeSnapshot(code, snapshot) {
      if (!db || !code) return;
      db.collection('mp_rooms').doc(code).update({ snapshot, updatedAt: Date.now() }).catch(() => {});
    }

    function leaveRoom(code, playerId, isHost) {
      if (!db || !code) return;
      if (isHost) {
        db.collection('mp_rooms').doc(code).update({ phase: 'ended' }).catch(() => {});
      } else {
        db.collection('mp_rooms').doc(code).update({ ['players.' + playerId]: firebase.firestore.FieldValue.delete() }).catch(() => {});
      }
    }

    return { isAvailable, hostCreate, guestJoin, listenRoom, listenInputs, sendInput, startRoom, writeSnapshot, leaveRoom };
  })();

  const SHIP_COLORS = ['#7dffb0', '#33e0ff', '#ff66ff', '#ffb833'];

  // ---------- Planets (visual themes, cycle + escalate) ----------
  // Each planet now also carries a "twist" — a real gameplay rule change, not
  // just a palette swap, so the run feels mechanically different world to world.
  const PLANETS = [
    { name: 'MARS OUTPOST',        top: '#3a0f0f', bottom: '#0a0202', accent: '#ff5533', ring: false, twist: 'none',
      lore: 'Ground zero. The dirt itself started moving first.' },
    { name: 'EUROPA ICE FIELDS',   top: '#04263a', bottom: '#010509', accent: '#33ccff', ring: false, twist: 'iceDrift',
      lore: 'The ice is infected too — it won\'t hold still under your boots.' },
    { name: 'TITAN METHANE SEAS',  top: '#3a2a04', bottom: '#0a0700', accent: '#ffb833', ring: true,  twist: 'meteors',
      lore: 'The plague rode in on falling rock. More is still coming down.' },
    { name: 'NEBULA RIFT',         top: '#2a0440', bottom: '#08010d', accent: '#cc55ff', ring: true,  twist: 'turbulence',
      lore: 'Space itself bends here — something is thinking, and it doesn\'t want you close.' },
    { name: 'THE VOID',            top: '#210000', bottom: '#000000', accent: '#ff3355', ring: false, twist: 'blackout',
      lore: 'The last world. The lights already lost this one once.' },
  ];
  const TWIST_LABELS = {
    iceDrift: 'ICE DRIFT', meteors: 'METEOR SHOWER', turbulence: 'TURBULENCE', blackout: 'BLACKOUT',
  };

  // ---------- Enemy types ----------
  const ENEMY_TYPES = {
    shambler: { emoji: '🧟', hp: 1, points: 10, scale: 1,    glow: null },
    screamer: { emoji: '👻', hp: 1, points: 15, scale: 0.85, glow: '#33ccff', jitter: 10 },
    brute:    { emoji: '🧌', hp: 3, points: 40, scale: 1.55, glow: '#cc55ff', shakeOnDeath: 5 },
    diver:    { emoji: '💀', hp: 1, points: 25, scale: 1.05, glow: '#ff8833' },
  };

  // ---------- Boss kinds (cycle every boss wave, each with a distinct look + attack pattern) ----------
  // Story throughline: the Overmind is orchestrating the infection from world
  // to world, and the first 5 boss kinds are its lieutenants — each `line` is
  // shown under the boss's name during the intro slam (see drawBossIntro),
  // each `fallLine` is a transmission shown on the level-clear screen right
  // after that lieutenant falls (see triggerLevelClear). The 6th kind IS the
  // Overmind's own true form, so its fall is the loop's climax, not just
  // another win — kept generic ("the source") since either of its two flavor
  // names can be rolled at random.
  const BOSS_KINDS = [
    { emoji: '👹', glow: '#ff2244', hpMul: 1,    speedMul: 1,   pattern: 'spread',   names: ['SKULLORD PRIME', 'THE ROTTEN KING'],
      line: 'First lieutenant. First to fall.',
      fallLine: 'LIEUTENANT DOWN. THE SIGNAL WEAKENS — BARELY.' },
    { emoji: '👻', glow: '#33ccff', hpMul: 0.85, speedMul: 1.3, pattern: 'sweep',    names: ['VOID WRAITH', 'PHANTOM ECHO'],
      line: 'It isn\'t alive. That\'s what makes it fast.',
      fallLine: 'THE ECHO GOES QUIET. SOMETHING ELSE IS LISTENING NOW.' },
    { emoji: '🗿', glow: '#ffb833', hpMul: 1.6,  speedMul: 0.6, pattern: 'slam',     names: ['STONE COLOSSUS', 'IRON GOLEM'],
      line: 'Once a terraforming machine. Now just angry.',
      fallLine: 'THE COLOSSUS FALLS. THE OVERMIND FELT THAT ONE.' },
    { emoji: '👺', glow: '#cc55ff', hpMul: 0.75, speedMul: 1.8, pattern: 'rapid',    names: ['NIGHT STALKER', 'CRIMSON REAPER'],
      line: 'Doesn\'t plan. Doesn\'t need to.',
      fallLine: 'THE REAPER MISSES ITS MARK — FOR ONCE. THREE LIEUTENANTS LEFT.' },
    { emoji: '🎃', glow: '#ff8833', hpMul: 1.2,  speedMul: 1.1, pattern: 'orbit',    names: ['PUMPKIN KING', 'HARVEST HORROR'],
      line: 'It grows a new ring of thorns every time it\'s hurt.',
      fallLine: 'THE HARVEST ENDS EARLY THIS YEAR. ONE LIEUTENANT REMAINS.' },
    { emoji: '👽', glow: '#33ff99', hpMul: 0.9,  speedMul: 1,   pattern: 'teleport', names: ['THE OVERMIND', 'VOID WATCHER'],
      line: 'Not a lieutenant. The source itself, wearing a mask.',
      fallLine: 'THE SOURCE IS WOUNDED. THE CYCLE BREAKS — FOR NOW. IT WILL COME BACK LOUDER.' },
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
    if (dragTouchId !== null && isTouchStillActive(e, dragTouchId)) return;
    const t = e.changedTouches[0];
    dragTouchId = t.identifier;
    lastDragClientX = t.clientX;
    AudioSys.unlock();
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (dragTouchId === null) return;
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

  el.btnStart.addEventListener('click', () => startGame());
  el.btnResume.addEventListener('click', togglePause);
  el.btnContinue.addEventListener('click', handleContinueClick);
  el.btnRestart.addEventListener('click', () => {
    // A shared multiplayer run ends completely at game over in v1 — simpler
    // and safer than trying to reconcile a seamless shared "play again."
    if (state.mp.active) {
      MultiplayerSys.leaveRoom(state.mp.roomCode, state.mp.playerId, state.mp.role === 'host');
      mpTeardown();
      setScreen('start');
      return;
    }
    startGame();
  });

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

  // ---------- Online multiplayer UI wiring ----------
  el.btnOnline.addEventListener('click', () => setScreen('online-menu'));
  el.btnOnlineBack.addEventListener('click', () => setScreen('start'));

  el.btnHostGame.addEventListener('click', async () => {
    if (!MultiplayerSys.isAvailable()) { alert("Online play needs an internet connection."); return; }
    const name = (localStorage.getItem('gza_playername') || 'HOST').toUpperCase();
    el.btnHostGame.disabled = true;
    try {
      const { code, playerId } = await MultiplayerSys.hostCreate(name);
      state.mp.role = 'host'; state.mp.roomCode = code; state.mp.playerId = playerId;
      state.mp.playerName = name; state.mp.colorIdx = 0;
      el.hostRoomCode.textContent = code;
      if (mpUnsubRoom) mpUnsubRoom();
      mpUnsubRoom = MultiplayerSys.listenRoom(code, onRoomUpdate);
      setScreen('host-lobby');
    } catch (e) {
      alert("Couldn't create a room — check your connection and try again.");
    }
    el.btnHostGame.disabled = false;
  });

  el.btnHostCancel.addEventListener('click', () => {
    MultiplayerSys.leaveRoom(state.mp.roomCode, state.mp.playerId, true);
    mpTeardown();
    setScreen('start');
  });

  el.btnHostStart.addEventListener('click', async () => {
    if (!state.mp.roomCode) return;
    el.btnHostStart.disabled = true;
    await MultiplayerSys.startRoom(state.mp.roomCode);
    if (mpUnsubInputs) mpUnsubInputs();
    mpUnsubInputs = MultiplayerSys.listenInputs(state.mp.roomCode, (map) => { mpRemoteInputs = map; });
    startMultiplayerGame(mpLastPlayers);
    el.btnHostStart.disabled = false;
  });

  el.btnJoinGame.addEventListener('click', () => {
    el.joinStatus.textContent = '';
    el.inputJoinCode.value = '';
    setScreen('join');
  });
  el.btnJoinBack.addEventListener('click', () => setScreen('online-menu'));

  el.btnJoinConfirm.addEventListener('click', async () => {
    const code = el.inputJoinCode.value.trim().toUpperCase();
    if (!code) return;
    if (!MultiplayerSys.isAvailable()) { el.joinStatus.textContent = 'Online play needs an internet connection.'; return; }
    const name = (localStorage.getItem('gza_playername') || 'PILOT').toUpperCase();
    el.btnJoinConfirm.disabled = true;
    el.joinStatus.textContent = 'Joining…';
    try {
      const { playerId, colorIdx } = await MultiplayerSys.guestJoin(code, name);
      state.mp.role = 'guest'; state.mp.roomCode = code; state.mp.playerId = playerId;
      state.mp.playerName = name; state.mp.colorIdx = colorIdx;
      el.guestRoomCode.textContent = code;
      if (mpUnsubRoom) mpUnsubRoom();
      mpUnsubRoom = MultiplayerSys.listenRoom(code, onRoomUpdate);
      setScreen('guest-lobby');
    } catch (e) {
      el.joinStatus.textContent = e.message === 'not-found' ? "Room not found — check the code."
        : e.message === 'already-started' ? "That game already started."
        : e.message === 'full' ? "That room is full (4 pilots max)."
        : "Couldn't join — check your connection.";
    }
    el.btnJoinConfirm.disabled = false;
  });
  el.inputJoinCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.btnJoinConfirm.click(); }
  });

  el.btnGuestLeave.addEventListener('click', () => {
    MultiplayerSys.leaveRoom(state.mp.roomCode, state.mp.playerId, false);
    mpTeardown();
    setScreen('start');
  });

  el.inputName.value = localStorage.getItem('gza_playername') || '';
  el.inputName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.btnSubmitScore.click(); }
  });
  el.btnSubmitScore.addEventListener('click', () => {
    const name = el.inputName.value.trim().toUpperCase() || 'ANON';
    localStorage.setItem('gza_playername', name);
    el.btnSubmitScore.disabled = true;
    el.submitStatus.textContent = 'Submitting…';
    LeaderboardSys.submit(name, state.score, state.wave, state.mp.active ? 'MP' : '1P')
      .then(() => { el.submitStatus.textContent = 'Submitted! Check the leaderboard 🏆'; })
      .catch(() => {
        el.submitStatus.textContent = "Couldn't submit — check your connection.";
        el.btnSubmitScore.disabled = false;
      });
  });

  el.btnShareCard.addEventListener('click', () => {
    drawResultCard();
    el.resultCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'galactic-zombie-assault-score.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  });

  function handleEnter() {
    if (state.mp.active && state.mp.role === 'guest') return; // guest never drives screen transitions
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
    bossCam: 0,
    bossCamX: BASE_W / 2,
    bossCamY: BASE_H / 2,
    warpCam: 0,
    bossesDefeated: 0,
    overdriveCharge: 0,
    overdriveFlash: 0,
    blackoutTimer: 4,
    blackoutPulse: 0,
    meteorTimer: 2,
    lastBossFallLine: '',
    core: { mods: {} },
    mp: { active: false, role: null, roomCode: null, playerId: null, playerName: '', colorIdx: 0 },
  };
  let remoteShips = [];      // host-only: ship objects for connected guests, driven by their input
  let mpGuestShips = [];     // guest-only: ship-like objects rebuilt fresh from each host snapshot
  let mpRemoteInputs = {};   // host-only: latest {left,right,firing,touchDelta} per remote playerId
  let mpLastPlayers = {};    // roster from the room doc, used to render the lobby list
  let mpUnsubRoom = null;
  let mpUnsubInputs = null;
  let mpBroadcastAccum = 0;
  let mpGuestInputAccum = 0;
  const KILLCAM_DURATION = 1.0;
  const BOSS_INTRO_DURATION = 1.7;
  const DEATHCAM_DURATION = 1.2;
  const BOSSCAM_DURATION = 1.5;
  const BOSSCAM_SLOWMO = 0.25;
  const WARPCAM_DURATION = 0.7;
  const OVERDRIVE_DURATION = 5;

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
    const core = activeCore();
    const hitboxMul = core.mods.hitboxMul || 1;
    return {
      x, y: BASE_H - 90, w: 34 * hitboxMul, h: 34 * hitboxMul, baseSize: 34 * hitboxMul,
      speed: 230 * (core.mods.speedMul || 1), cooldown: 0, vx: 0,
      weaponTimer: 0, shieldTimer: 0, hitFlash: 0, invulnTimer: 0,
      speedTimer: 0, sizeTimer: 0, sizeMul: 1,
      droneTimer: 0, droneCooldown: 0,
      overdriveTimer: 0,
      exploded: false,
    };
  }

  function makeRemoteShip(id, name, colorIdx) {
    return {
      id, name, colorIdx,
      x: BASE_W / 2, y: BASE_H - 90, w: 34, h: 34, baseSize: 34,
      speed: 230, cooldown: 0, vx: 0,
      weaponTimer: 0, shieldTimer: 0, hitFlash: 0, invulnTimer: 0,
      speedTimer: 0, sizeTimer: 0, sizeMul: 1,
      droneTimer: 0, droneCooldown: 0,
      overdriveTimer: 0,
      exploded: false,
    };
  }

  // All ships under THIS browser's control that gameplay should react to:
  // solo/guest play has just the local player; a multiplayer host also owns
  // every connected guest's ship (their input arrives over the network, but
  // the host is what actually moves them and checks their collisions).
  function allShips() {
    return (state.mp.active && state.mp.role === 'host') ? [player, ...remoteShips] : [player];
  }

  function nearestShipTo(x, y) {
    let best = player, bestDist = Infinity;
    for (const sh of allShips()) {
      const d = Math.hypot(sh.x - x, sh.y - y);
      if (d < bestDist) { bestDist = d; best = sh; }
    }
    return best;
  }

  let player = makePlayer(BASE_W / 2);

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
  let meteors = [];
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
  // Deliberately temporary: each pick lasts for the wave right after it's chosen,
  // then reverts to baseline when the next choice screen appears. Keeps the "wow"
  // of a big power spike each wave without letting bonuses stack forever and
  // trivialize later waves.
  const MODIFIERS = [
    { id: 'piercing', name: 'PIERCING ROUNDS', desc: 'Bullets punch through the first enemy hit — this wave only', icon: '🎯' },
    { id: 'twinCannons', name: 'TWIN CANNONS', desc: '3-way spread shot — this wave only', icon: '🔱' },
    { id: 'adrenaline', name: 'ADRENALINE', desc: '+25% movement speed — this wave only', icon: '⚡' },
    { id: 'chainReaction', name: 'CHAIN REACTION', desc: 'Kills detonate nearby enemies — this wave only', icon: '💥' },
    { id: 'magnet', name: 'MAGNET FIELD', desc: 'Power-ups drift toward your ship — this wave only', icon: '🧲' },
    { id: 'comboFocus', name: 'COMBO FOCUS', desc: 'Combo multiplier lasts much longer — this wave only', icon: '🔥' },
    { id: 'reinforcedHull', name: 'REINFORCED HULL', desc: '+1 max life, right now', icon: '🛡️' },
    { id: 'rapidCells', name: 'RAPID CELLS', desc: 'Fire 20% faster — this wave only', icon: '🔋' },
    { id: 'secondWind', name: 'SECOND WIND', desc: 'Survive your first fatal hit this wave', icon: '💫' },
  ];

  function isBossWave(wave) { return wave % 3 === 0; }

  function spawnWave() {
    enemies = [];
    boss = null;
    playerBullets = [];
    enemyBullets = [];
    powerups = [];
    floaters = [];
    meteors = [];
    state.combo = 0;
    state.comboTimer = 0;
    state.hitsThisWave = 0;
    state.waveStartScore = state.score;
    state.blackoutPulse = 0;
    state.blackoutTimer = 3 + Math.random() * 3;
    state.meteorTimer = 1.5 + Math.random();
    updateComboHUD();
    initPlanetScenery();

    // meteors/turbulence only affect the regular formation, so their label
    // would be misleading during a boss wave — only show twists that still
    // actually apply (ice drift and blackout both run regardless of boss).
    const twist = PLANETS[state.planetIdx].twist;
    const twistAppliesOnBoss = twist === 'iceDrift' || twist === 'blackout';
    const showTwist = twist !== 'none' && (!isBossWave(state.wave) || twistAppliesOnBoss);
    const twistSuffix = showTwist ? ' · ' + TWIST_LABELS[twist] : '';

    if (isBossWave(state.wave)) {
      spawnBoss();
      el.planetName.textContent = PLANETS[state.planetIdx].name + ' — BOSS WAVE' + twistSuffix;
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
      if (twist === 'turbulence') {
        formation.speed *= 1.35;
        formation.dropAmount *= 1.2;
      }

      el.planetName.textContent = PLANETS[state.planetIdx].name + ' — WAVE ' + state.wave + twistSuffix;
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
      orbitAngle: 0, teleportTimer: 1.2, teleportWarn: 0, teleportTargetX: BASE_W / 2,
      kind, emoji: kind.emoji,
      name: kind.names[Math.floor(Math.random() * kind.names.length)],
      introTimer: BOSS_INTRO_DURATION, roared: false,
    };
  }

  function startGame() {
    if (state.mp.active && state.mp.role === 'guest') return; // guests never self-start; beginGuestPlay() drives them
    AudioSys.unlock();
    state.score = 0;
    state.wave = 1;
    state.planetIdx = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.deathCam = 0;
    state.victoryTallyT = 1;
    state.mods = {};
    state.bossesDefeated = 0;
    state.overdriveCharge = 0;
    state.overdriveFlash = 0;
    state.core = activeCore();
    state.maxLives = 5 + (state.core.mods.maxLifeBonus || 0);
    state.lives = 3 + (state.core.mods.maxLifeBonus || 0);
    meteors = [];
    player = makePlayer(BASE_W / 2);
    el.score.textContent = 'SCORE 0';
    el.shieldBar.style.width = '0%';
    el.overdriveBar.style.width = '0%';
    el.overdriveBar.classList.remove('ready');
    refreshLivesHUD();
    updateComboHUD();
    spawnWave();
    setScreen('playing');
    AudioSys.startMusic();
  }

  function nextWave() {
    state.warpCam = WARPCAM_DURATION;
    state.wave++;
    state.planetIdx = (state.planetIdx + 1) % PLANETS.length;
    spawnWave();
    setScreen('playing');
  }

  // Between-wave build choice: the previous wave's pick expires here, before
  // a fresh set of 3 random options is offered — every wave gets a real
  // choice, but nothing stacks permanently (see MODIFIERS comment above).
  function handleContinueClick() {
    if (state.mp.active && state.mp.role === 'guest') return; // only the host advances waves
    state.mods = {};
    showUpgradeChoices();
  }

  function showUpgradeChoices() {
    const choices = MODIFIERS
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
  }

  function setScreen(name) {
    state.screen = name;
    el.screenStart.classList.toggle('hidden', name !== 'start');
    el.screenPause.classList.toggle('hidden', name !== 'paused');
    el.screenLevelClear.classList.toggle('hidden', name !== 'levelclear');
    el.screenGameOver.classList.toggle('hidden', name !== 'gameover');
    el.screenLeaderboard.classList.toggle('hidden', name !== 'leaderboard');
    el.screenUpgrade.classList.toggle('hidden', name !== 'upgrade');
    el.screenOnlineMenu.classList.toggle('hidden', name !== 'online-menu');
    el.screenJoin.classList.toggle('hidden', name !== 'join');
    el.screenHostLobby.classList.toggle('hidden', name !== 'host-lobby');
    el.screenGuestLobby.classList.toggle('hidden', name !== 'guest-lobby');
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
          <div class="leaderboard-mode">${r.mode === 'MP' ? 'MP' : '1P'}</div>
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
    if (state.mp.active) return; // pausing a shared run would desync the guest's view of it
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
    if (player.overdriveTimer <= 0 && state.overdriveCharge < 100) {
      state.overdriveCharge = Math.min(100, state.overdriveCharge + 8 * (state.core.mods.overdriveChargeMul || 1));
      refreshOverdriveHUD();
    }
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

  // Cause-of-death flavor lines — makes the loss screen read like a status
  // report instead of a flat stat dump. 'overwhelmed' = the formation reached
  // the bottom row; 'destroyed' = any fatal hit (bullet/enemy/boss/meteor).
  const DEATH_LINES = {
    overwhelmed: ['THE LINE DIDN\'T HOLD. THEY REACHED THE GROUND.', 'OVERRUN. THE SWARM DIDN\'T STOP COMING.'],
    destroyed: ['HULL BREACHED. SHIELDS DIDN\'T HOLD.', 'SIGNAL LOST. LAST TELEMETRY: TAKING FIRE.', 'SYSTEMS DARK. THE OVERMIND WINS THIS ROUND.'],
  };

  function endGame(cause) {
    const lines = DEATH_LINES[cause] || DEATH_LINES.destroyed;
    el.gameoverScore.textContent = 'SCORE ' + state.score + '   ·   BEST ' + state.highScore;
    el.gameoverWave.textContent = 'MADE IT TO WAVE ' + state.wave;
    el.gameoverCause.textContent = lines[Math.floor(Math.random() * lines.length)];
    el.btnSubmitScore.disabled = false;
    el.submitStatus.textContent = '';
    // Ship Core unlocks are the one thing that survives a run — add this
    // run's contribution to the lifetime totals stored in localStorage.
    const lifetimeScore = Number(localStorage.getItem('gza_lifetimeScore') || 0) + state.score;
    const lifetimeBosses = Number(localStorage.getItem('gza_lifetimeBosses') || 0) + state.bossesDefeated;
    localStorage.setItem('gza_lifetimeScore', String(lifetimeScore));
    localStorage.setItem('gza_lifetimeBosses', String(lifetimeBosses));
    renderCoreSelect();
    setScreen('gameover');
    AudioSys.gameOver();
  }

  function rankForWave(wave) {
    if (wave >= 18) return 'GALACTIC LEGEND';
    if (wave >= 12) return 'FLEET COMMANDER';
    if (wave >= 6) return 'VETERAN PILOT';
    return 'ROOKIE PILOT';
  }

  // A shareable end-of-run "trading card" rendered to its own offscreen
  // canvas (kept separate from the live game canvas) so a kid can save and
  // show off a result — no server, no login, just a downloaded PNG.
  function drawResultCard() {
    const rc = el.resultCanvas.getContext('2d');
    const W = el.resultCanvas.width, H = el.resultCanvas.height;
    const planet = PLANETS[state.planetIdx];
    const name = (localStorage.getItem('gza_playername') || 'PILOT').toUpperCase();

    const bg = rc.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0212');
    bg.addColorStop(0.55, planet.top);
    bg.addColorStop(1, '#000000');
    rc.fillStyle = bg;
    rc.fillRect(0, 0, W, H);

    // Starfield
    rc.fillStyle = '#ffffff';
    for (let i = 0; i < 120; i++) {
      const sx = (i * 137.5) % W;
      const sy = (i * 91.3 + (i % 7) * 40) % H;
      rc.globalAlpha = 0.25 + ((i * 13) % 10) / 15;
      rc.beginPath();
      rc.arc(sx, sy, 1 + (i % 3) * 0.5, 0, Math.PI * 2);
      rc.fill();
    }
    rc.globalAlpha = 1;

    // Planet glow accent
    const pg = rc.createRadialGradient(W / 2, 130, 10, W / 2, 130, 220);
    pg.addColorStop(0, planet.accent + 'aa');
    pg.addColorStop(1, planet.accent + '00');
    rc.fillStyle = pg;
    rc.fillRect(0, 0, W, 300);

    rc.textAlign = 'center';
    rc.fillStyle = '#7dffb0';
    rc.shadowColor = '#2bffab';
    rc.shadowBlur = 20;
    rc.font = '900 34px "Segoe UI", sans-serif';
    rc.fillText('GALACTIC ZOMBIE ASSAULT', W / 2, 110);

    rc.shadowBlur = 0;
    rc.fillStyle = 'rgba(255,255,255,0.7)';
    rc.font = '700 16px "Segoe UI", sans-serif';
    rc.fillText(planet.name + ' · ' + new Date().toLocaleDateString(), W / 2, 145);

    rc.shadowColor = '#ffd23f';
    rc.shadowBlur = 24;
    rc.fillStyle = '#ffd23f';
    rc.font = '900 96px "Segoe UI", sans-serif';
    rc.fillText(String(state.score), W / 2, 320);
    rc.shadowBlur = 0;
    rc.fillStyle = 'rgba(255,255,255,0.65)';
    rc.font = '700 18px "Segoe UI", sans-serif';
    rc.fillText('FINAL SCORE', W / 2, 355);

    rc.shadowColor = planet.accent;
    rc.shadowBlur = 16;
    rc.fillStyle = '#ffffff';
    rc.font = '900 28px "Segoe UI", sans-serif';
    rc.fillText(rankForWave(state.wave), W / 2, 430);
    rc.shadowBlur = 0;

    const stats = [
      ['WAVE REACHED', String(state.wave)],
      ['BOSSES DEFEATED', String(state.bossesDefeated)],
      ['PILOT', name],
    ];
    let sy = 500;
    for (const [label, value] of stats) {
      rc.fillStyle = 'rgba(255,255,255,0.55)';
      rc.font = '700 15px "Segoe UI", sans-serif';
      rc.fillText(label, W / 2, sy);
      rc.fillStyle = '#7dd4ff';
      rc.font = '900 26px "Segoe UI", sans-serif';
      rc.fillText(value, W / 2, sy + 32);
      sy += 90;
    }

    rc.strokeStyle = 'rgba(125,255,176,0.5)';
    rc.lineWidth = 3;
    rc.strokeRect(14, 14, W - 28, H - 28);

    rc.fillStyle = 'rgba(255,255,255,0.4)';
    rc.font = '700 13px "Segoe UI", sans-serif';
    rc.fillText('petercaplan.github.io/galactic-zombie-assault', W / 2, H - 26);
  }

  // ---------- Update loop ----------
  let lastTime = performance.now();
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    // A multiplayer guest never simulates anything — it only renders the
    // host's latest broadcast (applied as it arrives, in onRoomUpdate) and
    // periodically sends its own input. No cinematics/collision/AI here.
    if (state.mp.active && state.mp.role === 'guest') {
      updateBackground(dt); // purely decorative locally — never synced, just keeps the starfield moving
      mpGuestInputAccum += dt;
      if (mpGuestInputAccum >= 0.08) {
        mpGuestInputAccum = 0;
        sendGuestInput();
      }
      render();
      requestAnimationFrame(loop);
      return;
    }

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
        if (state.screen === 'playing') endGame('destroyed');
      }
    }

    if (state.bossCam > 0) {
      state.bossCam -= dt;
      dt *= BOSSCAM_SLOWMO;
      if (state.bossCam <= 0) state.bossCam = 0;
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
    if (state.warpCam > 0) state.warpCam = Math.max(0, state.warpCam - dt);

    if (state.victoryTallyT < 1) {
      state.victoryTallyT = Math.min(1, state.victoryTallyT + dt / 0.6);
      const val = Math.round(state.victoryTallyFrom + (state.victoryTallyTo - state.victoryTallyFrom) * state.victoryTallyT);
      el.levelClearTally.textContent = 'SCORE ' + val;
    }

    // Broadcast even across non-'playing' screens (levelclear/upgrade/gameover)
    // so guests see the same victory/death/upgrade screens the host does.
    if (state.mp.active && state.mp.role === 'host') {
      mpBroadcastAccum += dt;
      if (mpBroadcastAccum >= 0.12) {
        mpBroadcastAccum = 0;
        MultiplayerSys.writeSnapshot(state.mp.roomCode, serializeSnapshot());
      }
    }

    if (state.screen !== 'playing') return;

    const intensity = Math.min(1, (state.wave - 1) / 8);
    AudioSys.updateMusic(dt, intensity);

    updatePlayer(player, dt);
    if (state.mp.active && state.mp.role === 'host') {
      for (const ship of remoteShips) updateRemoteShip(ship, dt, mpRemoteInputs[ship.id] || {});
    }
    updateBullets(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateMeteors(dt);
    updateBlackout(dt);
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

  const MOVE_LEFT_KEYS = ['ArrowLeft', 'a', 'A'];
  const MOVE_RIGHT_KEYS = ['ArrowRight', 'd', 'D'];
  const FIRE_KEYS = [' '];

  function updatePlayer(p, dt) {
    const left = MOVE_LEFT_KEYS.some(k => keys.has(k));
    const right = MOVE_RIGHT_KEYS.some(k => keys.has(k));
    const curSpeed = p.speed * (p.speedTimer > 0 ? 1.6 : 1) * (state.mods.adrenaline ? 1.25 : 1);
    if (PLANETS[state.planetIdx].twist === 'iceDrift') {
      // Ice Drift: keyboard movement accelerates/slides instead of moving
      // instantly, like steering on a frictionless surface. Touch drag is
      // unaffected (it's already a relative delta, so it feels fine either way).
      let target = 0;
      if (left) target -= curSpeed;
      if (right) target += curSpeed;
      p.vx += (target - p.vx) * Math.min(1, dt * 5);
      p.x += p.vx * dt;
    } else {
      if (left) p.x -= curSpeed * dt;
      if (right) p.x += curSpeed * dt;
    }
    if (touchDragDelta !== 0) {
      p.x += touchDragDelta;
      touchDragDelta = 0;
    }
    p.x = Math.max(p.w / 2 + 4, Math.min(BASE_W - p.w / 2 - 4, p.x));

    if (p.speedTimer > 0) p.speedTimer -= dt;
    if (p.sizeTimer > 0) {
      p.sizeTimer -= dt;
      if (p.sizeTimer <= 0) p.sizeMul = 1;
    }
    p.w = p.baseSize * p.sizeMul;
    p.h = p.baseSize * p.sizeMul;

    if (p.overdriveTimer > 0) {
      p.overdriveTimer -= dt;
      // Risk/reward drawback: Overdrive's raw power comes with a bigger,
      // easier-to-hit ship, on top of whatever size power-up is active.
      p.w *= 1.15;
      p.h *= 1.15;
    }

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
    const shieldMax = 6 * (state.core.mods.shieldDurationMul || 1);
    el.shieldBar.style.width = Math.max(0, (p.shieldTimer / shieldMax) * 100) + '%';
    refreshLivesHUD();

    if (p.cooldown > 0) p.cooldown -= dt;
    const firing = FIRE_KEYS.some(k => keys.has(k));
    if (firing && p.cooldown <= 0) {
      if (state.overdriveCharge >= 100 && p.overdriveTimer <= 0) triggerOverdrive(p);
      fireBullets(p);
      const overdriveFireMul = p.overdriveTimer > 0 ? 0.6 : 1;
      p.cooldown = (p.weaponTimer > 0 ? 0.11 : 0.26) * (state.mods.rapidCells ? 0.8 : 1) * overdriveFireMul * (state.core.mods.fireCooldownMul || 1);
    }
  }

  // Overdrive: a risk/reward meter charged by kills (see registerKill). Once
  // full, your next shot burns it for a few seconds of triple-shot + faster
  // fire — but the ship also grows into a bigger target for the duration.
  function triggerOverdrive(p) {
    state.overdriveCharge = 0;
    p.overdriveTimer = OVERDRIVE_DURATION;
    refreshOverdriveHUD();
    triggerFlash('#ffb833', 0.5);
    shake(10, 0.3);
    spawnFloater(p.x, p.y - 30, 'OVERDRIVE!', '#ffd23f', true);
    spawnParticles(p.x, p.y, '#ffb833', 24, 140);
    AudioSys.powerup();
  }

  function refreshOverdriveHUD() {
    el.overdriveBar.style.width = state.overdriveCharge + '%';
    el.overdriveBar.classList.toggle('ready', state.overdriveCharge >= 100);
  }

  function fireBullets(p) {
    const overcharged = p.weaponTimer > 0 || p.overdriveTimer > 0;
    const pierce = state.mods.piercing ? 1 : 0;
    spawnParticles(p.x, p.y - 20, p.overdriveTimer > 0 ? '#ffd23f' : '#c9ffe0', 3, 40);
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

  // Host-only: moves a connected guest's ship from their last-received input
  // doc, using the same movement/fire math as updatePlayer() but reading a
  // network input object instead of local keys/touch. Deliberately a
  // separate function rather than a shared refactor of updatePlayer() itself
  // — lower regression risk for the already-solid solo/host movement code.
  function updateRemoteShip(p, dt, input) {
    const curSpeed = p.speed * (p.speedTimer > 0 ? 1.6 : 1);
    if (input.left) p.x -= curSpeed * dt;
    if (input.right) p.x += curSpeed * dt;
    if (input.touchDelta) p.x += input.touchDelta;
    p.x = Math.max(p.w / 2 + 4, Math.min(BASE_W - p.w / 2 - 4, p.x));

    if (p.speedTimer > 0) p.speedTimer -= dt;
    if (p.sizeTimer > 0) { p.sizeTimer -= dt; if (p.sizeTimer <= 0) p.sizeMul = 1; }
    p.w = p.baseSize * p.sizeMul;
    p.h = p.baseSize * p.sizeMul;
    if (p.overdriveTimer > 0) { p.overdriveTimer -= dt; p.w *= 1.15; p.h *= 1.15; }

    if (p.droneTimer > 0) {
      p.droneTimer -= dt;
      p.droneCooldown -= dt;
      if (p.droneCooldown <= 0) {
        playerBullets.push({ x: p.x + 22, y: p.y - 10, vx: 0, vy: -480, w: 4, h: 10 });
        p.droneCooldown = 0.35;
      }
    }

    if (p.shieldTimer > 0) p.shieldTimer -= dt;
    if (p.weaponTimer > 0) p.weaponTimer -= dt;
    if (p.invulnTimer > 0) p.invulnTimer -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;

    if (p.cooldown > 0) p.cooldown -= dt;
    if (input.firing && p.cooldown <= 0) {
      if (state.overdriveCharge >= 100 && p.overdriveTimer <= 0) triggerOverdrive(p);
      fireBullets(p);
      const overdriveFireMul = p.overdriveTimer > 0 ? 0.6 : 1;
      p.cooldown = (p.weaponTimer > 0 ? 0.11 : 0.26) * overdriveFireMul;
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
        endGame('overwhelmed');
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
        const target = nearestShipTo(d.x, d.y);
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

    if (pattern !== 'teleport') {
      boss.x += boss.dir * boss.speed * dt;
      if (boss.x < margin) { boss.x = margin; boss.dir = 1; }
      if (boss.x > BASE_W - margin) { boss.x = BASE_W - margin; boss.dir = -1; }
    }

    if (pattern === 'sweep') {
      boss.y = boss.targetY + Math.sin(performance.now() / 700) * 26;
    }

    // Teleport pattern moves on its own timer instead of sliding: a brief
    // warning flash at the old spot, then an instant jump to a new x.
    if (pattern === 'teleport') {
      if (boss.teleportWarn > 0) {
        boss.teleportWarn -= dt;
        if (boss.teleportWarn <= 0) {
          boss.x = boss.teleportTargetX;
          shake(6, 0.2);
          spawnShockwave(boss.x, boss.y, boss.kind.glow, 50, 0.3);
          AudioSys.hit();
        }
      } else {
        boss.teleportTimer -= dt;
        if (boss.teleportTimer <= 0) {
          boss.teleportTimer = Math.max(0.9, 1.8 - (1 - boss.hp / boss.maxHp) * 0.5);
          boss.teleportTargetX = margin + Math.random() * (BASE_W - margin * 2);
          boss.teleportWarn = 0.35;
          triggerFlash(boss.kind.glow, 0.15);
          spawnParticles(boss.x, boss.y, boss.kind.glow, 14, 100);
        }
      }
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
      const target = nearestShipTo(boss.x, boss.y);
      const dx = target.x - boss.x, dy = target.y - boss.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = 220 + state.wave * 6;
      enemyBullets.push({ x: boss.x, y: boss.y + boss.h / 2, vx: (dx / dist) * speed, vy: (dy / dist) * speed, w: 8, h: 16 });
    } else if (pattern === 'rapid' && boss.fireTimer <= 0) {
      boss.fireTimer = Math.max(0.16, 0.4 - enrage * 0.25);
      const speed = 240 + state.wave * 7;
      enemyBullets.push({ x: boss.x, y: boss.y + boss.h / 2, vx: (Math.random() - 0.5) * 40, vy: speed, w: 5, h: 12 });
    } else if (pattern === 'orbit' && boss.fireTimer <= 0) {
      boss.fireTimer = Math.max(0.5, 1.0 - enrage * 0.4);
      boss.orbitAngle += 0.6;
      const ringCount = 6;
      const speed = 150 + state.wave * 5;
      for (let i = 0; i < ringCount; i++) {
        const ang = boss.orbitAngle + (i / ringCount) * Math.PI * 2;
        enemyBullets.push({ x: boss.x, y: boss.y, vx: Math.sin(ang) * speed, vy: Math.cos(ang) * speed, w: 6, h: 6 });
      }
    } else if (pattern === 'teleport' && boss.fireTimer <= 0) {
      boss.fireTimer = Math.max(0.3, 0.7 - enrage * 0.3);
      const target = nearestShipTo(boss.x, boss.y);
      const dx = target.x - boss.x, dy = target.y - boss.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = 200 + state.wave * 6;
      enemyBullets.push({ x: boss.x, y: boss.y + boss.h / 2, vx: (dx / dist) * speed, vy: (dy / dist) * speed, w: 6, h: 14 });
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

    for (const sh of allShips()) {
      if (rectHit(boss, sh)) loseLife(sh);
    }
  }

  // Bullet-time boss finisher: slow-mo + zoom on the kill, reusing the
  // killCam/deathCam dt-slowdown pattern (see loop() and computeZoomAmt).
  // Scarcity is the point — this only ever plays on a boss kill, not every
  // regular enemy death, so it stays a genuine "whoa" moment.
  function startBossDeath() {
    boss.dying = true;
    boss.dyingTimer = BOSSCAM_DURATION * BOSSCAM_SLOWMO;
    state.bossCam = BOSSCAM_DURATION;
    state.bossCamX = boss.x;
    state.bossCamY = boss.y;
    triggerHitStop(0.08);
    shake(10, 0.4);
    spawnShockwave(boss.x, boss.y, boss.kind.glow, 90, 0.5);
    AudioSys.explosion(true);
  }

  function finishBossDeath() {
    registerKill(500 + state.wave * 50, boss.x, boss.y, boss.kind.glow);
    dropPowerup(boss.x - 20, boss.y);
    dropPowerup(boss.x + 20, boss.y);
    shake(14, 0.5);
    triggerFlash('#ffffff', 0.5);
    state.bossesDefeated++;
    state.lastBossFallLine = boss.kind.fallLine;
    boss = null;
    el.bossWrap.classList.add('hidden');
  }

  // Titan's twist: intermittent falling rock hazards, independent of the
  // enemy formation — pure environmental danger, dodgeable, no points for it.
  function updateMeteors(dt) {
    if (PLANETS[state.planetIdx].twist !== 'meteors' || isBossWave(state.wave)) {
      meteors = meteors.filter(m => m.y < BASE_H + 40);
      return;
    }
    state.meteorTimer -= dt;
    if (state.meteorTimer <= 0) {
      state.meteorTimer = 1.1 + Math.random() * 1.1;
      const r = 12 + Math.random() * 8;
      meteors.push({
        x: 30 + Math.random() * (BASE_W - 60), y: -30,
        vx: (Math.random() - 0.5) * 40, vy: 130 + Math.random() * 60,
        r, w: r * 1.6, h: r * 1.6, rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 4,
      });
    }
    for (const m of meteors) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.spin * dt;
      if (Math.random() < 0.5) {
        particles.push({ x: m.x, y: m.y - m.r * 0.6, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, r: m.r * 0.25, color: '#ff8833' });
      }
    }
    meteors = meteors.filter(m => m.y < BASE_H + 40);
  }

  // The Void's twist: brief, unpredictable darkness pulses for pure tension —
  // no mechanical penalty beyond obscuring the view for a moment.
  function updateBlackout(dt) {
    if (PLANETS[state.planetIdx].twist !== 'blackout') { state.blackoutPulse = 0; return; }
    if (state.blackoutPulse > 0) {
      state.blackoutPulse -= dt;
    } else {
      state.blackoutTimer -= dt;
      if (state.blackoutTimer <= 0) {
        state.blackoutPulse = 0.4;
        state.blackoutTimer = 3.5 + Math.random() * 3;
      }
    }
  }

  function updatePowerups(dt) {
    for (const p of powerups) {
      p.y += p.speed * dt;
      if (state.mods.magnet) {
        const target = nearestShipTo(p.x, p.y);
        const dist = Math.hypot(target.x - p.x, target.y - p.y);
        if (dist < 160 && dist > 1) {
          p.x += (target.x - p.x) / dist * 220 * dt;
          p.y += (target.y - p.y) / dist * 220 * dt;
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
          startBossDeath();
        }
      }
    }
    playerBullets = playerBullets.filter(b => !b.dead);

    const ships = allShips();

    for (const b of enemyBullets) {
      for (const sh of ships) {
        if (rectHit(b, sh)) {
          b.dead = true;
          spawnParticles(sh.x, sh.y, '#ff5566', 10, 80);
          loseLife(sh);
          break;
        }
      }
    }
    enemyBullets = enemyBullets.filter(b => !b.dead);

    for (const en of enemies) {
      if (!en.alive) continue;
      for (const sh of ships) {
        if (rectHit(en, sh)) {
          en.alive = false;
          spawnParticles(en.x, en.y, '#ff5566', 14, 90);
          AudioSys.explosion(false);
          loseLife(sh);
          break;
        }
      }
    }

    for (const pu of powerups) {
      for (const sh of ships) {
        if (rectHit(pu, sh)) {
          pu.dead = true;
          applyPowerup(pu.type, sh);
          spawnParticles(sh.x, sh.y - 10, '#ffffff', 18, 110);
          AudioSys.powerup();
          triggerFlash('#ffffff', 0.22);
          break;
        }
      }
    }
    powerups = powerups.filter(pu => !pu.dead);

    for (const m of meteors) {
      if (m.dead) continue;
      let hitShip = null;
      for (const sh of ships) {
        if (rectHit(m, sh)) { hitShip = sh; break; }
      }
      if (hitShip) {
        m.dead = true;
        spawnParticles(m.x, m.y, '#ff8833', 16, 100);
        spawnShockwave(m.x, m.y, '#ff8833', 30, 0.3);
        AudioSys.explosion(false);
        loseLife(hitShip);
        continue;
      }
      for (const b of playerBullets) {
        if (b.dead) continue;
        if (rectHit(b, m)) {
          b.dead = true;
          m.dead = true;
          registerKill(20, m.x, m.y, '#ff8833');
          spawnParticles(m.x, m.y, '#ff8833', 16, 100);
          spawnShockwave(m.x, m.y, '#ff8833', 26, 0.3);
          AudioSys.explosion(false);
          break;
        }
      }
    }
    playerBullets = playerBullets.filter(b => !b.dead);
    meteors = meteors.filter(m => !m.dead);
  }

  function dropPowerup(x, y) {
    const type = weightedPick(POWERUP_WEIGHTS, 'shield');
    powerups.push({ x, y, w: 22, h: 22, speed: 90, type, phase: Math.random() * Math.PI * 2 });
  }

  function applyPowerup(type, p) {
    if (type === 'shield') p.shieldTimer = 6 * (state.core.mods.shieldDurationMul || 1);
    else if (type === 'weapon') p.weaponTimer = 8;
    else if (type === 'health') { state.lives = Math.min(state.maxLives, state.lives + 1); refreshLivesHUD(); }
    else if (type === 'bomb') triggerBomb(p);
    else if (type === 'speed') p.speedTimer = 8;
    else if (type === 'mega') { p.sizeTimer = 8; p.sizeMul = 1.6; p.weaponTimer = Math.max(p.weaponTimer, 8); }
    else if (type === 'mini') { p.sizeTimer = 8; p.sizeMul = 0.6; }
    else if (type === 'drone') p.droneTimer = 10;
    else if (type === 'gem') { addScore(100); spawnFloater(p.x, p.y - 20, '+100', '#66ffff', true); }
  }

  function triggerBomb(p) {
    const origin = p || player;
    AudioSys.bombBlast();
    triggerFlash('#ffffff', 0.7);
    shake(12, 0.4);
    triggerHitStop(0.05);
    spawnShockwave(origin.x, origin.y, '#ffffff', 240, 0.55);
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
      if (boss.hp <= 0) startBossDeath();
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
    const nextPlanet = PLANETS[(state.planetIdx + 1) % PLANETS.length];
    el.levelClearNext.textContent = 'NEXT: ' + nextPlanet.name;
    el.levelClearTitle.textContent = isBossWave(state.wave) ? 'BOSS DEFEATED' : 'WAVE CLEARED';
    const grade = computeGrade();
    el.levelClearGrade.textContent = grade.text;
    el.levelClearGrade.style.color = grade.color;
    state.victoryTallyFrom = state.waveStartScore;
    state.victoryTallyTo = state.score;
    state.victoryTallyT = 0;
    el.levelClearTally.textContent = 'SCORE ' + state.victoryTallyFrom;
    // Story beat: a lieutenant-down transmission after a boss kill, or a
    // teaser of the next world's corruption otherwise — reuses this existing
    // screen rather than adding a new one (see BOSS_KINDS/PLANETS comments).
    if (isBossWave(state.wave) && state.lastBossFallLine) {
      const callSign = (localStorage.getItem('gza_playername') || 'PILOT').toUpperCase();
      el.levelClearLore.textContent = 'PILOT ' + callSign + ': ' + state.lastBossFallLine;
    } else {
      el.levelClearLore.textContent = nextPlanet.lore;
    }
    setScreen('levelclear');
    el.levelClearTitle.classList.remove('slam-in');
    void el.levelClearTitle.offsetWidth; // force reflow so the animation replays every wave
    el.levelClearTitle.classList.add('slam-in');
    shake(8, 0.3);
    AudioSys.waveClear();
  }

  // ---------- Multiplayer: host broadcast / guest apply ----------

  // Host-only: a small, cheap-to-write snapshot of everything a guest needs
  // to render the same moment the host is seeing. Deliberately excludes
  // decorative-only state (particles, shockwaves, starfield) — those are
  // pure juice, not core feedback, and syncing them would multiply the
  // payload for no gameplay benefit. Screens beyond plain 'playing'
  // (levelclear/upgrade/gameover) carry just the text guests need to read;
  // only the host can click through them (see the mp.role==='guest' guards
  // on handleContinueClick/handleEnter/startGame below).
  function serializeSnapshot() {
    const ships = {};
    for (const sh of allShips()) {
      const id = sh.id || state.mp.playerId;
      ships[id] = {
        x: sh.x, y: sh.y, sizeMul: sh.sizeMul,
        shieldOn: sh.shieldTimer > 0, overdriveOn: sh.overdriveTimer > 0,
        weaponOn: sh.weaponTimer > 0, droneOn: sh.droneTimer > 0,
        exploded: !!sh.exploded, colorIdx: sh.id ? sh.colorIdx : 0,
      };
    }
    return {
      screen: state.screen,
      wave: state.wave, planetIdx: state.planetIdx, score: state.score,
      lives: state.lives, maxLives: state.maxLives,
      planetNameText: el.planetName.textContent,
      comboText: el.combo.textContent, comboShow: el.combo.classList.contains('show'),
      killCam: state.killCam, deathCam: state.deathCam, bossCam: state.bossCam, warpCam: state.warpCam,
      shakeMag: state.shakeMag, shakeTime: state.shakeTime,
      flashColor: state.flashColor, flashAlpha: state.flashAlpha,
      blackoutPulse: state.blackoutPulse,
      boss: boss ? {
        x: boss.x, y: boss.y, emoji: boss.emoji, name: boss.name,
        hp: boss.hp, maxHp: boss.maxHp, hitFlash: boss.hitFlash,
        dying: boss.dying, dyingTimer: boss.dyingTimer, introTimer: boss.introTimer,
        kind: { glow: boss.kind.glow, line: boss.kind.line },
      } : null,
      enemies: enemies.filter(e => e.alive).map(e => ({ x: e.x, y: e.y, type: e.type, hitFlash: e.hitFlash, hp: e.hp, maxHp: e.maxHp })),
      playerBullets: playerBullets.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      enemyBullets: enemyBullets.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      powerups: powerups.map(p => ({ x: p.x, y: p.y, type: p.type, phase: p.phase })),
      meteors: meteors.map(m => ({ x: m.x, y: m.y, rot: m.rot, r: m.r })),
      ships,
      levelClear: state.screen === 'levelclear' ? {
        title: el.levelClearTitle.textContent, grade: el.levelClearGrade.textContent,
        gradeColor: el.levelClearGrade.style.color, tally: el.levelClearTally.textContent,
        next: el.levelClearNext.textContent, lore: el.levelClearLore.textContent,
      } : null,
      gameOver: state.screen === 'gameover' ? {
        cause: el.gameoverCause.textContent, wave: el.gameoverWave.textContent, score: el.gameoverScore.textContent,
      } : null,
    };
  }

  // Guest-only: overwrites the exact same module-level variables that the
  // solo/host update loop maintains, so the existing render() pipeline draws
  // this snapshot with zero changes — the guest never runs update() at all.
  function applyGuestSnapshot(snap) {
    if (!snap) return;
    setScreen(snap.screen);
    if (snap.planetIdx !== state.planetIdx) {
      state.planetIdx = snap.planetIdx;
      initPlanetScenery(); // re-tint the locally-rendered nebulae/planet sphere to match
    }
    state.wave = snap.wave; state.score = snap.score;
    state.lives = snap.lives; state.maxLives = snap.maxLives;
    el.score.textContent = 'SCORE ' + snap.score;
    el.planetName.textContent = snap.planetNameText;
    el.combo.textContent = snap.comboText;
    el.combo.classList.toggle('show', snap.comboShow);
    refreshLivesHUD();
    state.killCam = snap.killCam; state.deathCam = snap.deathCam;
    state.bossCam = snap.bossCam; state.warpCam = snap.warpCam;
    state.shakeMag = snap.shakeMag; state.shakeTime = snap.shakeTime;
    state.flashColor = snap.flashColor; state.flashAlpha = snap.flashAlpha;
    state.blackoutPulse = snap.blackoutPulse;

    boss = snap.boss ? { ...snap.boss, w: 78, h: 78 } : null;
    if (boss) {
      el.bossWrap.classList.remove('hidden');
      el.bossName.textContent = boss.name;
      el.bossFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
    } else {
      el.bossWrap.classList.add('hidden');
    }

    enemies = (snap.enemies || []).map(e => ({ ...e, alive: true }));
    playerBullets = snap.playerBullets || [];
    enemyBullets = snap.enemyBullets || [];
    powerups = snap.powerups || [];
    meteors = (snap.meteors || []).map(m => ({ ...m, w: (m.r || 16) * 1.6, h: (m.r || 16) * 1.6 }));

    mpGuestShips = Object.entries(snap.ships || {}).map(([id, s]) => ({
      id, x: s.x, y: s.y, baseSize: 34, sizeMul: s.sizeMul || 1,
      shieldTimer: s.shieldOn ? 1 : 0, overdriveTimer: s.overdriveOn ? 1 : 0,
      weaponTimer: s.weaponOn ? 1 : 0, droneTimer: s.droneOn ? 1 : 0,
      hitFlash: 0, exploded: !!s.exploded, colorIdx: s.colorIdx || 0,
    }));

    if (snap.levelClear) {
      el.levelClearTitle.textContent = snap.levelClear.title;
      el.levelClearGrade.textContent = snap.levelClear.grade;
      el.levelClearGrade.style.color = snap.levelClear.gradeColor;
      el.levelClearTally.textContent = snap.levelClear.tally;
      el.levelClearNext.textContent = snap.levelClear.next;
      el.levelClearLore.textContent = snap.levelClear.lore;
    }
    if (snap.gameOver) {
      el.gameoverCause.textContent = snap.gameOver.cause;
      el.gameoverWave.textContent = snap.gameOver.wave;
      el.gameoverScore.textContent = snap.gameOver.score;
    }
    if (snap.screen === 'upgrade') {
      el.upgradeCards.innerHTML = '<p class="subtitle">Host is choosing an upgrade…</p>';
    }
  }

  function renderLobbyPlayers(playersMap) {
    const rows = Object.entries(playersMap).map(([id, info]) => {
      const color = SHIP_COLORS[(info.colorIdx || 0) % SHIP_COLORS.length];
      return '<div class="lobby-player-row"><span class="lobby-player-dot" style="background:' + color + ';color:' + color + '"></span>'
        + escapeHtml(info.name) + (info.isHost ? '<span class="lobby-player-host-tag">HOST</span>' : '') + '</div>';
    }).join('');
    el.lobbyPlayers.innerHTML = rows;
    el.lobbyPlayersGuest.innerHTML = rows;
  }

  function onRoomUpdate(data) {
    if (!data) {
      if (state.mp.role) { mpTeardown(); setScreen('start'); }
      return;
    }
    if (data.players) { mpLastPlayers = data.players; renderLobbyPlayers(data.players); }
    if (data.phase === 'ended' && state.mp.role === 'guest') {
      mpTeardown();
      setScreen('start');
      return;
    }
    if (state.mp.role === 'guest' && data.phase === 'playing') {
      if (!state.mp.active) beginGuestPlay();
      if (data.snapshot) applyGuestSnapshot(data.snapshot);
    }
  }

  function beginGuestPlay() {
    state.mp.active = true;
    mpGuestInputAccum = 0;
    el.mpBadge.textContent = 'ROOM ' + state.mp.roomCode;
    el.mpBadge.classList.remove('hidden');
  }

  function startMultiplayerGame(playersMap) {
    remoteShips = Object.entries(playersMap)
      .filter(([id]) => id !== state.mp.playerId)
      .map(([id, info]) => makeRemoteShip(id, info.name, info.colorIdx));
    startGame();
    player.id = state.mp.playerId;
    player.name = state.mp.playerName;
    player.colorIdx = 0;
    // Spread starting x positions by color slot so ships don't spawn
    // perfectly stacked on top of each other (they'd otherwise all default
    // to dead-center from makePlayer()/makeRemoteShip()).
    const spread = 46;
    player.x = BASE_W / 2 + (0 - (remoteShips.length) / 2) * spread;
    remoteShips.forEach((sh, i) => { sh.x = BASE_W / 2 + ((i + 1) - (remoteShips.length) / 2) * spread; });
    state.mp.active = true;
    mpBroadcastAccum = 0;
    el.mpBadge.textContent = 'ROOM ' + state.mp.roomCode;
    el.mpBadge.classList.remove('hidden');
  }

  function sendGuestInput() {
    const left = MOVE_LEFT_KEYS.some(k => keys.has(k));
    const right = MOVE_RIGHT_KEYS.some(k => keys.has(k));
    const firing = FIRE_KEYS.some(k => keys.has(k));
    const touchDelta = touchDragDelta;
    touchDragDelta = 0;
    MultiplayerSys.sendInput(state.mp.roomCode, state.mp.playerId, { left, right, firing, touchDelta });
  }

  function mpTeardown() {
    if (mpUnsubRoom) { mpUnsubRoom(); mpUnsubRoom = null; }
    if (mpUnsubInputs) { mpUnsubInputs(); mpUnsubInputs = null; }
    state.mp = { active: false, role: null, roomCode: null, playerId: null, playerName: '', colorIdx: 0 };
    remoteShips = []; mpGuestShips = []; mpRemoteInputs = {}; mpLastPlayers = {};
    el.mpBadge.classList.add('hidden');
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
    } else if (state.bossCam > 0) {
      const zoomAmt = computeZoomAmt(state.bossCam, BOSSCAM_DURATION, 0.3, 0.6);
      ctx.translate(BASE_W / 2, BASE_H / 2);
      ctx.scale(zoomAmt, zoomAmt);
      ctx.translate(-state.bossCamX, -state.bossCamY);
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
    drawMeteors();
    drawShockwaves();
    drawPowerups();
    drawFloaters();
    if (state.screen === 'playing' || state.screen === 'paused') {
      if (state.mp.active && state.mp.role === 'guest') {
        for (const sh of mpGuestShips) drawPlayer(sh, SHIP_COLORS[sh.colorIdx % SHIP_COLORS.length]);
      } else if (state.mp.active && state.mp.role === 'host') {
        drawPlayer(player, SHIP_COLORS[0]);
        for (const sh of remoteShips) drawPlayer(sh, SHIP_COLORS[sh.colorIdx % SHIP_COLORS.length]);
      } else {
        drawPlayer(player);
      }
    }
    if (state.warpCam > 0) drawWarpJump(state.warpCam);
    if (boss && boss.introTimer > 0) drawBossIntro(boss);

    drawVignette();
    if (state.screen === 'playing' && state.lives === 1) drawLowLifePulse();
    if (state.blackoutPulse > 0) drawBlackoutPulse();
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

  // Last-life warning: a slow red pulse creeping in from the edges — cheap
  // (one extra radial gradient fill) but a real, classic tension cue.
  function drawLowLifePulse() {
    const pulse = 0.12 + 0.13 * Math.sin(performance.now() / 220);
    const g = ctx.createRadialGradient(BASE_W / 2, BASE_H / 2, BASE_H * 0.3, BASE_W / 2, BASE_H / 2, BASE_H * 0.7);
    g.addColorStop(0, 'rgba(255,0,40,0)');
    g.addColorStop(1, 'rgba(255,0,40,' + pulse + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }

  function drawMeteors() {
    for (const m of meteors) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rot);
      ctx.shadowColor = '#ff8833';
      ctx.shadowBlur = 14;
      const g = ctx.createRadialGradient(-m.r * 0.3, -m.r * 0.3, 1, 0, 0, m.r);
      g.addColorStop(0, '#a68a6e');
      g.addColorStop(0.7, '#6b4a32');
      g.addColorStop(1, '#3a2417');
      ctx.fillStyle = g;
      ctx.beginPath();
      const spikes = 7;
      for (let i = 0; i < spikes; i++) {
        const ang = (i / spikes) * Math.PI * 2;
        const rr = m.r * (0.75 + (i % 3 === 0 ? 0.25 : 0));
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // The Void's twist: a quick near-black fade over the whole screen, timed
  // via updateBlackout()'s random-interval pulse — pure atmosphere/tension.
  function drawBlackoutPulse() {
    const alpha = Math.sin(Math.min(1, (0.4 - state.blackoutPulse) / 0.4) * Math.PI) * 0.7;
    ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0, alpha) + ')';
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }

  // Hyperspace warp-jump between waves: stars streak outward from center as
  // the new planet loads in, turning a plain cut into a real transition.
  function drawWarpJump(remaining) {
    const p = 1 - remaining / WARPCAM_DURATION; // 0 -> 1
    const intensity = Math.sin(Math.min(1, p) * Math.PI); // ramps up then back down
    if (intensity <= 0.01) return;
    const cx = BASE_W / 2, cy = BASE_H / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * intensity) + ')';
    ctx.lineWidth = 1.5;
    for (const s of starsNear) {
      const dx = s.x - cx, dy = s.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const len = 30 + intensity * 220;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + ux * len, s.y + uy * len);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,' + (0.3 * intensity * intensity) + ')';
    ctx.fillRect(0, 0, BASE_W, BASE_H);
    ctx.restore();
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

  function drawPlayer(p, colorOverride) {
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

    if (p.overdriveTimer > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 90);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255, 178, 51, ' + pulse + ')';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffb833';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 4, 24 * p.sizeMul, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawFighter(p.x, p.y, p.sizeMul * (p.baseSize / 34), p.weaponTimer > 0 || p.overdriveTimer > 0, colorOverride);

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
  function drawFighter(x, y, scale, charged, colorOverride) {
    const t = performance.now() / 1000;
    const accent = charged ? '#ffd23f' : (colorOverride || '#7dffb0');
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
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 13px "Segoe UI", sans-serif';
    ctx.fillText(b.kind.line, 0, 36);
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
