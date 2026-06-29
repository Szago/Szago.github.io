/*
 * AetherBoss2D — the third game-within-a-game.
 *
 * Reached from the 3D ruins (world3d) by stepping through a rift the four
 * guardians open. This is an Undertale-style 2D bullet-board boss fight:
 * a black empty plane, our hero as a freely-moving 2D sprite, and a static
 * 500x500 combat window framed by a dark, bloody, textured red border.
 *
 * Self-contained on purpose: it embeds its own copy of the hero sprite and
 * exposes window.AetherBoss2D = { open, close, isOpen } so any layer (the
 * rift trigger, the debug panel, or the standalone preview harness) can launch
 * it without caring about load order.
 */
(function () {
  'use strict';

  // ---- Asset paths (resolved relative to this script's own location) -----
  // boss2d.js is loaded from different depths (the standalone preview vs. the
  // full game's index.html), so derive the directory from the script URL and
  // build sprite paths off it rather than assuming a fixed relative root.
  const SCRIPT_DIR = (function () {
    const src = (document.currentScript && document.currentScript.src) || '';
    return src ? src.slice(0, src.lastIndexOf('/') + 1) : '';
  })();
  const CULTIST_KNEEL_SRC = SCRIPT_DIR + 'spritesV2/shadow-cultist.png';
  const CULTIST_STAND_SRC = SCRIPT_DIR + 'spritesV2/shadow-cultist-standing-v2.png';

  // ---- Combat window geometry -------------------------------------------
  const BOARD = 500;            // the static 500x500 combat window (outer)
  const BORDER = 16;            // bloody border thickness, drawn inside the box
  const PAD = 6;                // breathing room between border and play area
  const INNER_MIN = BORDER + PAD;
  const INNER_MAX = BOARD - BORDER - PAD;

  // ---- Hero sprite (copy of the main game's `hero`, kept local) ----------
  const HERO = {
    pal: { r: '#d63c3c', s: '#aab2bd', S: '#6b7480', k: '#1c1e24', y: '#ffd23e', W: '#e8e4d4', f: '#f0c8a0' },
    rows: [
      '......rr........',
      '.....ssss.......',
      '.....skks.......',
      '.....ffff.......',
      '....SSSSSS......',
      '...SSyySSSS.....',
      '...SSSSSSSS..W..',
      '...SSSSSSSS..W..',
      '...SSSSSSSS..W..',
      '...SSyyyySS..W..',
      '....SS..SS...y..',
      '....ss..ss...y..',
    ],
  };
  const HERO_SCALE = 3;
  const HERO_W = HERO.rows[0].length * HERO_SCALE; // 45
  const HERO_H = HERO.rows.length * HERO_SCALE;    // 36
  const MOVE_SPEED = 0.21; // base px per ms at BASE_BPM; scales with tempo

  // ---- Module state ------------------------------------------------------
  let overlay = null;
  let canvas = null;
  let ctx = null;
  let bgCanvas = null;     // full-viewport layer behind the box
  let bgCtx = null;
  let attackCanvas = null; // full-viewport layer for pentagrams + beams
  let actx = null;
  let borderCanvas = null; // pre-rendered static bloody frame
  let cultistElement = null;   // the boss container (kneel + stand layers)
  let cultistStandWrap = null; // standing layer wrapper (carries the float loop)
  let cultistStandImg = null;  // standing sprite img (carries the pixel jitter)
  let bpmElement = null;       // debug BPM readout, top-right
  let active = false;
  let animationFrame = 0;
  let previousTime = 0;
  const keys = new Set();

  // Secret debug sequence: typing these digits quits the rift outright.
  const DEBUG_QUIT_SEQUENCE = '2137';
  let debugBuffer = '';

  // Hero position is the centre of the sprite, in board space.
  const hero = { x: BOARD / 2, y: BOARD / 2 };

  // ---- Intro / combat sequencing ----------------------------------------
  // The fight opens with a scripted sequence: the hero falls into the arena,
  // tentacles writhe in from the dark on every edge but the north, then a
  // dark-red pentagram burns into the floor arm by arm. Only after that does
  // free movement (PHASE.ACTIVE) begin.
  const PHASE = { FALL: 0, TENTACLES: 1, PENTAGRAM: 2, ACTIVE: 3 };
  const FALL_START_Y = -HERO_H;   // hero begins above the window
  const FALL_DURATION = 820;      // ms to drop to the centre
  const SETTLE_DURATION = 220;    // ms of squash/recover on landing
  const TENTACLE_GROW = 1300;     // ms for the tentacles to emerge
  const TENTACLE_HOLD = 340;      // ms beat before the pentagram starts
  const PENT_ARM = 620;           // ms to burn each of the 5 arms
  const PENT_PAUSE = 130;         // ms beat between arms
  const CIRCLE_BURN = 900;        // ms to burn the enclosing circle
  const PENT_FADE = 1400;         // completed seal cools into a faint floor scar
  const OUTER_GROW = 1600;        // ms for the background tentacles to emerge
  const BG_SCALE = 0.25;          // quarter-res layer, enlarged as visible 4x pixels
  const BG_FRAME_MS = 1000 / 30;  // slow writhing does not need a 60 Hz redraw
  const OUTER_WIDTH_MULT = 2;     // global art-direction scale for every depth plane
  const ENDGAME_SCENE_STORAGE_KEY = 'aetherEndgameScene';

  const ARENA_CX = BOARD / 2;
  const ARENA_CY = BOARD / 2;
  const PENT_RADIUS = 150;

  let phase = PHASE.FALL;
  let phaseTime = 0;   // ms elapsed in the current phase
  let clock = 0;       // ms since open, drives continuous writhing
  let landAt = -1;     // clock time the hero landed (for the shockwave)
  let heroSquash = 0;  // 0..1 landing squash amount
  let tentacles = [];           // short tentacles inside the arena edges
  let outerTentacles = [];      // long tentacles beyond the box, in the dark
  let outerGrowStart = 0;       // clock time the outer tentacles spawned
  let bgLastFrame = -Infinity;  // independent 30 fps background cadence
  let bgWidth = 0;              // logical dimensions; backing canvas is scaled down
  let bgHeight = 0;
  let fpsElement = null;
  let fpsSampleStart = 0;
  let fpsFrames = 0;
  let boxRect = null;           // viewport rect of the combat window
  const pentagram = { arm: 0, armTime: 0, paused: false, pauseTime: 0, circleTime: 0 };

  // ---- Tempo --------------------------------------------------------------
  // The whole fight runs on a beat. Tempo starts the instant the cultist stands
  // and climbs by 1 BPM every 30s; every paced thing (telegraphs, attacks, even
  // her idle animations) derives its speed from the current beat.
  const BASE_BPM = 60;
  const BPM_RAMP_MS = 5000;         // +1 BPM per 30s of fight
  const FLOAT_BASE_MS = 4000;        // her float loop at BASE_BPM
  const JITTER_BASE_MS = 900;        // her pixel-jitter loop at BASE_BPM
  let fightClock = 0;                // ms since the fight (standing form) began
  let bpm = BASE_BPM;
  let beatMs = 60000 / BASE_BPM;     // duration of one beat at the current tempo
  let beatPhase = 0;                 // ms elapsed inside the current beat
  let beatIndex = 0;                 // beats elapsed since the fight began
  let lastAnimBpm = -1;              // last tempo pushed to the CSS animations

  // ---- Attacks ------------------------------------------------------------
  // Every attack telegraphs first: a dark-purple outline snakes out across the
  // floor at the beat's pace, and the strike lands a beat after it finishes.
  // Attacks live in viewport space (the attack canvas) because the summoning
  // pentagrams sit outside the playfield, pinned to the cultist's body.
  const ATTACK_REST_BEATS = 1;       // beats of breathing room between attack waves
  // Spawn points expressed as fractions of the standing sprite's bounding box
  // (x from its left, y from its top), so each pentagram tracks a body part.
  // Leg pentagrams sit well clear of her legs; head pentagrams sit twice as far
  // from her centre line as the leg pentagrams do.
  const LEG_SPACING = 0.5;
  const HEAD_SPACING = LEG_SPACING * 2;
  const ATTACK_ANCHORS = {
    leftLeg:   { fx: 0.5 - LEG_SPACING,  fy: 0.86 },
    rightLeg:  { fx: 0.5 + LEG_SPACING,  fy: 0.86 },
    leftHead:  { fx: 0.5 - HEAD_SPACING, fy: 0.17 },
    rightHead: { fx: 0.5 + HEAD_SPACING, fy: 0.17 },
  };
  // Attacks aim at shared nodes — the five tips of the centre playfield
  // pentagram plus its middle (see pentAimNodes). Each body pentagram crosses
  // to the opposite tip: left side aims right, right side aims left.
  const ATTACK_AIM = {
    leftLeg:   'bottomRight',
    rightLeg:  'bottomLeft',
    leftHead:  'topRight',
    rightHead: 'topLeft',
  };
  // A full pattern is a sequence of waves; every pentagram in a wave telegraphs
  // and fires together, all aimed at the playfield centre. The pattern loops.
  const ATTACK_PATTERN = [
    // Each pentagram on its own.
    ['leftLeg'],
    ['leftHead'],
    ['rightHead'],
    ['rightLeg'],
    // Both on a side, then both on an end.
    ['leftLeg', 'leftHead'],     // both left
    ['rightLeg', 'rightHead'],   // both right
    ['leftHead', 'rightHead'],   // both top
    ['leftLeg', 'rightLeg'],     // both bottom
    // Each diagonal axis (a pair of opposite pentagrams).
    ['leftHead', 'rightLeg'],
    ['rightHead', 'leftLeg'],
    // The four ways to fire three at once (each omits one pentagram).
    ['leftHead', 'rightHead', 'rightLeg'], // omit left leg
    ['leftLeg', 'leftHead', 'rightHead'],  // omit right leg
    ['leftLeg', 'rightHead', 'rightLeg'],  // omit left head
    ['leftLeg', 'leftHead', 'rightLeg'],   // omit right head
    // All four together.
    ['leftLeg', 'leftHead', 'rightHead', 'rightLeg'],
  ];
  // ---- Tentacle sweep movement -------------------------------------------
  // A second attack pattern: limbs lash clear across the playfield, telegraph
  // first, then strike. The movement is a scripted sequence of waves that grows
  // from a single creeping limb into multi-limb walls and a column finale.
  const TENTACLE_ROWS = 6;           // horizontal sweeps to cross the field
  const TENTACLE_COLS = 6;           // vertical sweeps (column attacks)
  const TENTACLE_BAND_H = 58;        // limb thickness in board space
  const TENTACLE_STRETCH_BEATS = 0.85;
  const TENTACLE_FIRE_BEATS = 0.9;   // strike + withdraw; shorter = quicker clear
  const TENTACLE_REST_BEATS = 0.25;  // breathing room before the next limb rises

  // Each wave is a list of limb specs that telegraph and strike together:
  //   { orient: 'row'|'col', index, side }
  //   row limbs span horizontally (side 'left'/'right' is the origin wall);
  //   col limbs span vertically  (side 'top'/'bottom').
  // Rows are indexed 0 (top) -> ROWS-1 (bottom); columns 0 (left) -> COLS-1.
  const TENTACLE_PATTERN = (function buildTentaclePattern() {
    const row = (index, side) => ({ orient: 'row', index, side });
    const col = (index, side) => ({ orient: 'col', index, side });
    // Edge groups: the two bands hugging each wall. Verticals on the left/right
    // walls run opposite ways; horizontals own the top/bottom rows. Used so the
    // outer rows and columns fill while the centre rows/cols stay open.
    const leftVerticals = () => [0, 1].map((c) => col(c, 'top'));
    const rightVerticals = () => [TENTACLE_COLS - 2, TENTACLE_COLS - 1].map((c) => col(c, 'bottom'));
    const topHorizontals = () => [0, 1].map((r) => row(r, 'left'));
    const bottomHorizontals = () => [TENTACLE_ROWS - 2, TENTACLE_ROWS - 1].map((r) => row(r, 'right'));

    const waves = [];
    // 1) Bottom -> top, one limb at a time, alternating walls.
    for (let i = 0; i < TENTACLE_ROWS; i++) {
      waves.push([row(TENTACLE_ROWS - 1 - i, i % 2 ? 'right' : 'left')]);
    }
    // 2) Top -> bottom, two rows at a time, from opposite walls.
    for (let r = 0; r + 1 < TENTACLE_ROWS; r += 2) {
      waves.push([row(r, 'left'), row(r + 1, 'right')]);
    }
    // 3) Top -> bottom, three rows at a time.
    for (let r = 0; r + 2 < TENTACLE_ROWS; r += 3) {
      waves.push([row(r, 'left'), row(r + 1, 'right'), row(r + 2, 'left')]);
    }
    // 4) The odd rows at once (1,3,5 -> 0-indexed 0,2,4).
    waves.push([row(0, 'left'), row(2, 'right'), row(4, 'left')]);
    // 5) The even rows at once (2,4,6 -> 0-indexed 1,3,5).
    waves.push([row(1, 'right'), row(3, 'left'), row(5, 'right')]);
    // 6) Two vertical limbs hugging the left wall (descending).
    waves.push(leftVerticals());
    // 7) Two vertical limbs on the right, the opposite direction (rising).
    waves.push(rightVerticals());
    // 8) Left + bottom edges together (an L bracket; the top-right stays open).
    waves.push([...leftVerticals(), ...bottomHorizontals()]);
    // 9) The same bracket mirrored onto the top + right edges.
    waves.push([...topHorizontals(), ...rightVerticals()]);
    // 10) All four edges at once — every outer band fills, only the centre is safe.
    waves.push([
      ...leftVerticals(), ...rightVerticals(),
      ...topHorizontals(), ...bottomHorizontals(),
    ]);
    return waves;
  })();

  // The fight cycles through a list of movements; each runs a fixed number of
  // waves (one wave = everything that telegraphs and fires together), and when
  // its waves are spent the next movement takes over. The pentagram barrage and
  // the tentacle sweep simply alternate.
  const MOVEMENT_SEQUENCE = ['pentagrams', 'tentacles'];
  let movementIndex = 0;             // which movement is currently running
  let movementWave = 0;             // wave reached within the current movement
  let attacks = [];
  let nextAttackBeat = 0;            // earliest beat the next attack wave may spawn

  const easeInQuad = (t) => t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function setSavedEndgameScene(sceneName) {
    try {
      window.localStorage.setItem(ENDGAME_SCENE_STORAGE_KEY, sceneName);
    } catch (err) {
      // Storage can be unavailable in embedded preview contexts.
    }
  }

  // ---- Scriptable arena geometry ----------------------------------------
  // The canvas remains a stable 500x500 world. The arena can move, resize and
  // rotate inside it, while shape-aware rendering and collision stay behind a
  // single controller. Boss attacks can call setArena() without touching the
  // hero or rendering loops.
  const ARENA_DEFAULT = Object.freeze({
    x: BOARD / 2, y: BOARD / 2, width: BOARD, height: BOARD,
    rotation: 0, shape: 'rect',
  });
  const arena = {
    ...ARENA_DEFAULT,
    from: null,
    target: null,
    transitionTime: 0,
    transitionDuration: 0,
  };

  function arenaSnapshot() {
    return {
      x: arena.x, y: arena.y, width: arena.width, height: arena.height,
      rotation: arena.rotation, shape: arena.shape,
    };
  }

  function resetArenaState() {
    Object.assign(arena, ARENA_DEFAULT, {
      from: null, target: null, transitionTime: 0, transitionDuration: 0,
    });
  }

  function setArena(options, duration) {
    const next = options || {};
    const target = arenaSnapshot();
    if (Number.isFinite(next.x)) target.x = next.x;
    if (Number.isFinite(next.y)) target.y = next.y;
    if (Number.isFinite(next.width)) target.width = Math.max(80, next.width);
    if (Number.isFinite(next.height)) target.height = Math.max(80, next.height);
    if (Number.isFinite(next.rotation)) target.rotation = next.rotation;
    if (Number.isFinite(next.rotationDeg)) target.rotation = next.rotationDeg * Math.PI / 180;
    if (['rect', 'ellipse', 'diamond'].includes(next.shape)) target.shape = next.shape;
    arena.shape = target.shape; // shape switches now; transform properties can tween
    arena.from = arenaSnapshot();
    arena.target = target;
    arena.transitionTime = 0;
    arena.transitionDuration = Math.max(0, Number(duration) || 0);
    if (!arena.transitionDuration) {
      Object.assign(arena, target);
      arena.from = null;
      arena.target = null;
    }
    return arenaSnapshot();
  }

  function resetArena(duration) {
    return setArena(ARENA_DEFAULT, duration);
  }

  function updateArena(dt) {
    if (!arena.target) return;
    arena.transitionTime += dt;
    const raw = Math.min(1, arena.transitionTime / arena.transitionDuration);
    const p = easeOutCubic(raw);
    for (const key of ['x', 'y', 'width', 'height', 'rotation'])
      arena[key] = arena.from[key] + (arena.target[key] - arena.from[key]) * p;
    if (raw >= 1) {
      Object.assign(arena, arena.target);
      arena.from = null;
      arena.target = null;
    }
  }

  function arenaPath(g, inset) {
    const amount = Math.max(0, inset || 0);
    const w = Math.max(1, arena.width - amount * 2);
    const h = Math.max(1, arena.height - amount * 2);
    g.beginPath();
    g.save();
    g.translate(arena.x, arena.y);
    g.rotate(arena.rotation);
    if (arena.shape === 'ellipse') {
      g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (arena.shape === 'diamond') {
      g.moveTo(0, -h / 2);
      g.lineTo(w / 2, 0);
      g.lineTo(0, h / 2);
      g.lineTo(-w / 2, 0);
      g.closePath();
    } else {
      g.rect(-w / 2, -h / 2, w, h);
    }
    g.restore();
  }

  function worldToArena(x, y) {
    const dx = x - arena.x;
    const dy = y - arena.y;
    const c = Math.cos(arena.rotation);
    const s = Math.sin(arena.rotation);
    return { x: dx * c + dy * s, y: -dx * s + dy * c };
  }

  function arenaToWorld(x, y) {
    const c = Math.cos(arena.rotation);
    const s = Math.sin(arena.rotation);
    return { x: arena.x + x * c - y * s, y: arena.y + x * s + y * c };
  }

  function arenaContains(x, y, padding) {
    const local = worldToArena(x, y);
    const inset = Math.max(0, Number(padding) || 0);
    const rx = Math.max(1, arena.width / 2 - inset);
    const ry = Math.max(1, arena.height / 2 - inset);
    if (arena.shape === 'ellipse') return (local.x / rx) ** 2 + (local.y / ry) ** 2 <= 1;
    if (arena.shape === 'diamond') return Math.abs(local.x) / rx + Math.abs(local.y) / ry <= 1;
    return Math.abs(local.x) <= rx && Math.abs(local.y) <= ry;
  }

  // ---- Deterministic noise so the blood looks the same every run ---------
  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value |= 0;
      value = (value + 0x6D2B79F5) | 0;
      let result = Math.imul(value ^ (value >>> 15), 1 | value);
      result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Build the static bloody, dark, textured red border once -----------
  function buildBorder() {
    borderCanvas = document.createElement('canvas');
    borderCanvas.width = BOARD;
    borderCanvas.height = BOARD;
    const bctx = borderCanvas.getContext('2d');
    const random = mulberry32(0x5106d);

    // Base dark red frame, hollow centre.
    bctx.fillStyle = '#2a0405';
    bctx.fillRect(0, 0, BOARD, BOARD);
    bctx.clearRect(BORDER, BORDER, BOARD - BORDER * 2, BOARD - BORDER * 2);

    // Returns true when (x,y) sits within the border band.
    const inBand = (x, y) =>
      x < BORDER || y < BORDER || x >= BOARD - BORDER || y >= BOARD - BORDER;

    // Mottled blood texture: layered dark-to-bright flecks only on the band.
    const flecks = [
      { color: 'rgba(12, 1, 2, 0.85)', count: 2600, size: () => 1 + (random() * 3 | 0) },
      { color: 'rgba(74, 4, 6, 0.8)', count: 2200, size: () => 1 + (random() * 2 | 0) },
      { color: 'rgba(108, 8, 6, 0.7)', count: 1400, size: () => 1 + (random() * 2 | 0) },
      { color: 'rgba(150, 18, 14, 0.55)', count: 700, size: () => 1 },
    ];
    for (const fleck of flecks) {
      bctx.fillStyle = fleck.color;
      for (let i = 0; i < fleck.count; i++) {
        const x = random() * BOARD | 0;
        const y = random() * BOARD | 0;
        if (!inBand(x, y)) continue;
        const s = fleck.size();
        bctx.fillRect(x, y, s, s);
      }
    }

    // Congealed pools / drips clinging to the inner edge of the frame.
    bctx.fillStyle = 'rgba(40, 1, 3, 0.92)';
    for (let i = 0; i < 80; i++) {
      const edge = random();
      let x, y;
      if (edge < 0.25) { x = random() * BOARD; y = BORDER - random() * 7; }
      else if (edge < 0.5) { x = random() * BOARD; y = BOARD - BORDER + random() * 7; }
      else if (edge < 0.75) { x = BORDER - random() * 7; y = random() * BOARD; }
      else { x = BOARD - BORDER + random() * 7; y = random() * BOARD; }
      const rx = 3 + random() * 9;
      const ry = 2 + random() * 7;
      bctx.beginPath();
      bctx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2);
      bctx.fill();
    }

    // Fresh drips bleeding down into the arena from the top frame.
    bctx.fillStyle = 'rgba(96, 6, 4, 0.85)';
    for (let i = 0; i < 22; i++) {
      const x = BORDER + random() * (BOARD - BORDER * 2);
      const len = 6 + random() * 26;
      bctx.fillRect(x | 0, BORDER, 1 + (random() * 2 | 0), len);
    }

    // Inner + outer hairlines to read as a defined window edge.
    bctx.strokeStyle = 'rgba(5, 0, 1, 0.9)';
    bctx.lineWidth = 2;
    bctx.strokeRect(1, 1, BOARD - 2, BOARD - 2);
    bctx.strokeStyle = 'rgba(170, 24, 18, 0.5)';
    bctx.lineWidth = 1;
    bctx.strokeRect(BORDER - 0.5, BORDER - 0.5, BOARD - BORDER * 2 + 1, BOARD - BORDER * 2 + 1);
  }

  // ---- DOM / overlay -----------------------------------------------------
  function makeOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'aether-boss2d-overlay';
    overlay.className = 'hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'The rift boss');
    overlay.innerHTML =
      '<canvas id="aether-boss2d-bg" class="aether-boss2d-bg"></canvas>' +
      '<canvas id="aether-boss2d-attacks" class="aether-boss2d-attacks"></canvas>' +
      '<div id="aether-boss2d-fps" class="aether-boss2d-fps">FPS --</div>' +
      '<div id="aether-boss2d-bpm" class="aether-boss2d-bpm">BPM --</div>' +
      '<div id="aether-boss2d-debug" class="aether-boss2d-debug"></div>' +
      // The boss is two stacked layers so the kneel->stand swap can crossfade
      // and rise, and so the standing form can float and pixel-jitter on top.
      '<div id="aether-boss2d-cultist" class="aether-boss2d-cultist">' +
        '<img class="aether-boss2d-cultist-kneel" alt="" src="' + CULTIST_KNEEL_SRC + '" />' +
        '<div class="aether-boss2d-cultist-stand-wrap">' +
          '<img class="aether-boss2d-cultist-stand" alt="" src="' + CULTIST_STAND_SRC + '" />' +
        '</div>' +
      '</div>' +
      '<div class="aether-boss2d-stage">' +
        '<canvas id="aether-boss2d-canvas" width="' + BOARD + '" height="' + BOARD + '"></canvas>' +
      '</div>' +
      '<div class="aether-boss2d-help">WASD / ARROWS MOVE' +
        '<span class="aether-boss2d-status">ENTER SKIP INTRO</span>' +
      '</div>';
    document.body.appendChild(overlay);

    canvas = document.getElementById('aether-boss2d-canvas');
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    bgCanvas = document.getElementById('aether-boss2d-bg');
    bgCtx = bgCanvas.getContext('2d');
    attackCanvas = document.getElementById('aether-boss2d-attacks');
    actx = attackCanvas.getContext('2d');
    fpsElement = document.getElementById('aether-boss2d-fps');
    bpmElement = document.getElementById('aether-boss2d-bpm');
    cultistElement = document.getElementById('aether-boss2d-cultist');
    cultistStandWrap = overlay.querySelector('.aether-boss2d-cultist-stand-wrap');
    cultistStandImg = overlay.querySelector('.aether-boss2d-cultist-stand');

    // Debug: one button per attack movement. Clicking aborts whatever is
    // running and restarts the fight on the chosen pattern.
    const debugPanel = document.getElementById('aether-boss2d-debug');
    MOVEMENT_SEQUENCE.forEach((name, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aether-boss2d-debug-btn';
      btn.textContent = name.toUpperCase();
      btn.addEventListener('click', () => { startMovement(i); btn.blur(); });
      debugPanel.appendChild(btn);
    });
  }

  // ---- Rendering ---------------------------------------------------------
  function drawHero() {
    const rows = HERO.rows;
    const squashed = heroSquash > 0.001;
    if (squashed) {
      // Squash/stretch about the feet so a landing reads as an impact.
      ctx.save();
      ctx.translate(Math.round(hero.x), Math.round(hero.y + HERO_H / 2));
      ctx.scale(1 + heroSquash * 0.32, 1 - heroSquash * 0.32);
      const ox = Math.round(-HERO_W / 2);
      const oy = -HERO_H;
      for (let y = 0; y < rows.length; y++) {
        const row = rows[y];
        for (let x = 0; x < row.length; x++) {
          const c = row[x];
          if (c === '.' || c === ' ') continue;
          const col = HERO.pal[c];
          if (!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(ox + x * HERO_SCALE, oy + y * HERO_SCALE, HERO_SCALE, HERO_SCALE);
        }
      }
      ctx.restore();
      return;
    }
    const ox = Math.round(hero.x - HERO_W / 2);
    const oy = Math.round(hero.y - HERO_H / 2);
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === '.' || c === ' ') continue;
        const col = HERO.pal[c];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x * HERO_SCALE, oy + y * HERO_SCALE, HERO_SCALE, HERO_SCALE);
      }
    }
  }

  // ---- Falling shadow + landing shockwave -------------------------------
  function renderFallShadow(progress) {
    const rw = 7 + progress * 17;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, ' + (0.18 + progress * 0.38).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(ARENA_CX, ARENA_CY + HERO_H / 2, rw, rw * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function renderShockwave() {
    if (landAt < 0) return;
    const age = clock - landAt;
    if (age > 520) return;
    const p = age / 520;
    ctx.save();
    ctx.strokeStyle = 'rgba(200, 44, 22, ' + (0.5 * (1 - p)).toFixed(3) + ')';
    ctx.lineWidth = 3 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY + HERO_H / 2, 8 + p * 72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Tentacles writhing in from the dark ------------------------------
  function spawnTentacles() {
    const random = mulberry32(0x7e27ac);
    tentacles = [];
    // Roots sit just inside the border on the south, east and west edges —
    // never the north, leaving that side open.
    const edges = [
      { side: 'south', count: 8 },
      { side: 'east', count: 5 },
      { side: 'west', count: 5 },
    ];
    const lo = BORDER + 2;
    const hi = BOARD - BORDER - 2;
    for (const edge of edges) {
      for (let i = 0; i < edge.count; i++) {
        const f = (i + 0.5) / edge.count + (random() - 0.5) * 0.06;
        const along = lo + Math.max(0, Math.min(1, f)) * (hi - lo);
        let base, dir;
        if (edge.side === 'south') { base = { x: along, y: hi }; dir = { x: 0, y: -1 }; }
        else if (edge.side === 'east') { base = { x: hi, y: along }; dir = { x: -1, y: 0 }; }
        else { base = { x: lo, y: along }; dir = { x: 1, y: 0 }; }
        tentacles.push({
          base, dir,
          length: 58 + random() * 92,
          width: 7 + random() * 6,
          waves: 1.4 + random() * 1.6,
          amp: 8 + random() * 14,
          speed: 0.0015 + random() * 0.0019,
          phase: random() * Math.PI * 2,
          sway: (random() - 0.5) * 0.4,
        });
      }
    }
  }

  // Inner tentacles: the original row-of-circles look (kept as-is).
  function renderTentacles(growth) {
    const segs = 14;
    for (const t of tentacles) {
      const perp = { x: -t.dir.y, y: t.dir.x };
      const reach = t.length * growth;
      for (let s = 0; s <= segs; s++) {
        const u = s / segs;
        const along = reach * u;
        const wobble = Math.sin(u * t.waves * Math.PI + clock * t.speed + t.phase) * t.amp * u
          + t.sway * along;
        const x = t.base.x + t.dir.x * along + perp.x * wobble;
        const y = t.base.y + t.dir.y * along + perp.y * wobble;
        const w = Math.max(0.6, t.width * (1 - u * 0.92) * growth);
        ctx.fillStyle = (s & 1) ? '#0a0308' : '#14040b';
        ctx.beginPath();
        ctx.arc(x, y, w, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // One long outer tentacle: a tapering filled ribbon (no shadow — that was
  // the frame-rate killer) with a dark rim and limb-local stains/scars.
  // Typed scratch buffers keep this hot path allocation-free.
  const OUTER_MAX_SEGS = 20;
  const outerPX = new Float32Array(OUTER_MAX_SEGS + 1);
  const outerPY = new Float32Array(OUTER_MAX_SEGS + 1);
  const outerNX = new Float32Array(OUTER_MAX_SEGS + 1);
  const outerNY = new Float32Array(OUTER_MAX_SEGS + 1);
  const outerHW = new Float32Array(OUTER_MAX_SEGS + 1);

  function drawOuterTentacle(t, growth) {
    if (growth <= 0) return;
    const segs = t.segs;
    const perpX = -t.dir.y;
    const perpY = t.dir.x;
    const reach = t.length * growth;
    const baseHW = t.width * 0.5 * growth;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const along = reach * u;
      const wobble = Math.sin(u * t.waves * Math.PI + clock * t.speed + t.phase) * t.amp * u
        + t.sway * along;
      outerPX[s] = t.base.x + t.dir.x * along + perpX * wobble;
      outerPY[s] = t.base.y + t.dir.y * along + perpY * wobble;
      outerHW[s] = Math.max(0.5, baseHW * Math.pow(1 - u, 0.55));
    }
    for (let i = 0; i <= segs; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(segs, i + 1);
      const dx = outerPX[b] - outerPX[a];
      const dy = outerPY[b] - outerPY[a];
      const tl = Math.hypot(dx, dy) || 1;
      outerNX[i] = -dy / tl;
      outerNY[i] = dx / tl;
    }
    // Body ribbon.
    bgCtx.beginPath();
    bgCtx.moveTo(outerPX[0] + outerNX[0] * outerHW[0], outerPY[0] + outerNY[0] * outerHW[0]);
    for (let i = 1; i <= segs; i++) bgCtx.lineTo(outerPX[i] + outerNX[i] * outerHW[i], outerPY[i] + outerNY[i] * outerHW[i]);
    for (let i = segs; i >= 0; i--) bgCtx.lineTo(outerPX[i] - outerNX[i] * outerHW[i], outerPY[i] - outerNY[i] * outerHW[i]);
    bgCtx.closePath();
    bgCtx.fillStyle = t.bodyColor;
    bgCtx.globalAlpha = t.opacity;
    bgCtx.fill();

    // Sparse stains and scars are anchored to the limb's centreline, so they
    // travel and bend with it instead of behaving like a screen-space overlay.
    bgCtx.globalAlpha = t.opacity * 0.72;
    for (const mark of t.marks) {
      const idx = Math.max(1, Math.min(segs - 1, Math.round(mark.u * segs)));
      const px = outerPX[idx] + outerNX[idx] * outerHW[idx] * mark.side;
      const py = outerPY[idx] + outerNY[idx] * outerHW[idx] * mark.side;
      const angle = Math.atan2(outerPY[idx + 1] - outerPY[idx - 1], outerPX[idx + 1] - outerPX[idx - 1]);
      const rx = Math.max(2, outerHW[idx] * mark.length);
      const ry = Math.max(0.7, outerHW[idx] * mark.thickness);
      bgCtx.fillStyle = mark.rust ? '#2d0506' : '#020001';
      bgCtx.beginPath();
      bgCtx.ellipse(px, py, rx, ry, angle, 0, Math.PI * 2);
      bgCtx.fill();
    }
    // Dark rim so overlapping limbs stay legible.
    // Four logical pixels become one solid backing pixel at quarter resolution.
    bgCtx.lineWidth = 4;
    bgCtx.lineJoin = 'round';
    bgCtx.globalAlpha = t.outlineOpacity;
    bgCtx.strokeStyle = t.outlineColor;
    bgCtx.stroke();
    bgCtx.globalAlpha = 1;
  }

  // ---- Long tentacles writhing in the dark beyond the box ----------------
  function sizeBackground() {
    if (!bgCanvas) return;
    bgWidth = window.innerWidth;
    bgHeight = window.innerHeight;
    bgCanvas.width = Math.ceil(bgWidth * BG_SCALE);
    bgCanvas.height = Math.ceil(bgHeight * BG_SCALE);
    bgCanvas.style.width = bgWidth + 'px';
    bgCanvas.style.height = bgHeight + 'px';
    bgCtx.setTransform(BG_SCALE, 0, 0, BG_SCALE, 0, 0);
    bgCtx.imageSmoothingEnabled = false;
    bgLastFrame = -Infinity;
  }

  // Full-resolution viewport canvas the attacks (pentagrams + beams) draw onto.
  function sizeAttackCanvas() {
    if (!attackCanvas) return;
    attackCanvas.width = window.innerWidth;
    attackCanvas.height = window.innerHeight;
    attackCanvas.style.width = window.innerWidth + 'px';
    attackCanvas.style.height = window.innerHeight + 'px';
    actx.imageSmoothingEnabled = true;
  }

  function spawnOuterTentacles(instant) {
    if (!bgCanvas) return;
    const stage = overlay.querySelector('.aether-boss2d-stage');
    const r = stage.getBoundingClientRect();
    boxRect = { left: r.left, top: r.top, w: r.width, h: r.height };
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const W = bgWidth;
    const H = bgHeight;
    const random = mulberry32(0x0c7e9a);
    outerTentacles = [];
    // Roots cling to the SCREEN edges — bottom, left and right, never the top —
    // and each limb reaches inward toward the box, slipping underneath it
    // (the opaque combat window hides the convergence). Left/right roots start
    // no higher than the box top so nothing intrudes on the open north.
    const top = r.top;
    // Build back-to-front depth layers. A few huge, very dark limbs form the
    // lowest plane; progressively smaller limbs sit above them, with the front
    // layer retaining the original size. This keeps the silhouette dense with
    // substantially fewer independently animated ribbons (24 instead of 52).
    const layers = [
      {
        widthScale: 3, bottomCount: 2, sideCount: 1, fullScreen: true, opacity: 0.78,
        bodies: ['#030001', '#050001', '#070102'], outline: '#3b0608', outlineOpacity: 0.48,
      },
      {
        widthScale: 2.6, bottomCount: 2, sideCount: 1, opacity: 0.82,
        bodies: ['#040001', '#060102', '#080102'], outline: '#46070a', outlineOpacity: 0.54,
      },
      {
        widthScale: 2.2, bottomCount: 2, sideCount: 1, opacity: 0.85,
        bodies: ['#050001', '#070102', '#090102'], outline: '#52080b', outlineOpacity: 0.60,
      },
      {
        widthScale: 1.8, bottomCount: 2, sideCount: 1, opacity: 0.88,
        bodies: ['#050001', '#080102', '#0a0102'], outline: '#5f0a0c', outlineOpacity: 0.66,
      },
      {
        widthScale: 1.4, bottomCount: 2, sideCount: 1, opacity: 0.91,
        bodies: ['#060001', '#090102', '#0c0103'], outline: '#6b0c0e', outlineOpacity: 0.72,
      },
      {
        widthScale: 1, bottomCount: 2, sideCount: 1, opacity: 0.94,
        bodies: ['#070001', '#0a0102', '#0d0103', '#040001'], outline: '#781013', outlineOpacity: 0.78,
      },
    ];
    const sides = [
      { side: 'bottom', countKey: 'bottomCount' },
      { side: 'left', countKey: 'sideCount' },
      { side: 'right', countKey: 'sideCount' },
    ];
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const layer = layers[layerIndex];
      for (const s of sides) {
        const count = layer[s.countKey];
        const totalCount = count * layers.length;
        for (let i = 0; i < count; i++) {
          // Interleave depth layers into shared slots instead of letting every
          // layer reuse the same positions and form visible root clumps.
          const slot = i * layers.length + layerIndex;
          const f = (slot + 0.5 + (random() - 0.5) * 0.45) / totalCount;
          const u = Math.max(0, Math.min(1, f));
          const width = (46 + random() * 56) * layer.widthScale * OUTER_WIDTH_MULT;
          // Push the flat root cap beyond the viewport by more than its radius.
          const rootOffset = width * 0.62 + 8;
          let base;
          if (s.side === 'bottom') base = { x: u * W, y: H + rootOffset };
          else if (s.side === 'left') base = { x: -rootOffset, y: top + u * (H - top) };
          else base = { x: W + rootOffset, y: top + u * (H - top) };
          // Aim toward the box centre with a little spread.
          const ang = Math.atan2(cy - base.y, cx - base.x) + (random() - 0.5) * 0.55;
          const dist = Math.hypot(cx - base.x, cy - base.y);
          const length = layer.fullScreen
            ? Math.hypot(W, H) * (1.05 + random() * 0.2)
            : dist * (0.85 + random() * 0.45);
          const marks = [];
          for (let k = 0; k < 5; k++) {
            marks.push({
              u: 0.12 + random() * 0.66,
              side: (random() * 2 - 1) * 0.48,
              length: 0.28 + random() * 0.58,
              thickness: 0.035 + random() * 0.07,
              rust: random() < 0.34,
            });
          }
          outerTentacles.push({
            base,
            dir: { x: Math.cos(ang), y: Math.sin(ang) },
            length,                              // reach the box / slip under it
            width,
            // Match curve detail to the limb's size in the half-res backing store.
            segs: Math.max(10, Math.min(OUTER_MAX_SEGS, Math.ceil(length * BG_SCALE / 32))),
            waves: 0.7 + random() * 1.1,
            amp: (24 + random() * 54) * Math.sqrt(layer.widthScale),
            speed: 0.0005 + random() * 0.0010,
            phase: random() * Math.PI * 2,
            sway: (random() - 0.5) * 0.16,
            bodyColor: layer.bodies[(random() * layer.bodies.length) | 0],
            opacity: layer.opacity,
            outlineColor: layer.outline,
            outlineOpacity: layer.outlineOpacity,
            marks,
          });
        }
      }
    }
    outerGrowStart = instant ? clock - OUTER_GROW : clock;
  }

  function renderBackground(time, force) {
    if (!bgCtx) return;
    if (!force && time - bgLastFrame < BG_FRAME_MS) return;
    bgLastFrame = time;
    bgCtx.save();
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtx.restore();
    if (!outerTentacles.length) return;
    const growth = easeOutCubic(Math.min(1, (clock - outerGrowStart) / OUTER_GROW));
    for (const t of outerTentacles) drawOuterTentacle(t, growth);
  }

  // ---- The pentagram burning into the floor, arm by arm -----------------
  function renderPentagram() {
    const verts = [];
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
      verts.push({ x: ARENA_CX + Math.cos(a) * PENT_RADIUS, y: ARENA_CY + Math.sin(a) * PENT_RADIUS });
    }
    const order = [0, 2, 4, 1, 3, 0]; // single-stroke five-pointed star
    const armsDone = pentagram.arm;
    const armT = pentagram.paused ? 0 : Math.min(1, pentagram.armTime / PENT_ARM);
    const done = phase === PHASE.ACTIVE;
    const fade = done ? easeOutCubic(Math.min(1, phaseTime / PENT_FADE)) : 0;
    const pulse = done ? 1 + Math.sin(clock * 0.005) * 0.3 * (1 - fade) : 1;
    const burnRed = Math.round(150 - fade * 100);
    const burnGreen = Math.round(16 - fade * 11);
    const burnBlue = Math.round(10 - fade * 4);

    ctx.save();
    ctx.globalAlpha = 1 - fade * 0.72;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawSeg = (a, b, p, ember) => {
      if (p <= 0) return;
      const ex = a.x + (b.x - a.x) * p;
      const ey = a.y + (b.y - a.y) * p;
      // Charred dark base scorched into the ground.
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(26, 2, 4, 0.95)';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
      // Glowing red burn line on top.
      ctx.shadowColor = 'rgba(255, 50, 20, ' + (0.85 * (1 - fade)).toFixed(3) + ')';
      ctx.shadowBlur = 14 * pulse * (1 - fade);
      ctx.strokeStyle = 'rgba(' + burnRed + ', ' + burnGreen + ', ' + burnBlue + ', 0.92)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
      // Bright ember at the burning tip.
      if (ember) {
        ctx.shadowBlur = 22;
        ctx.fillStyle = 'rgba(255, 156, 64, 0.95)';
        ctx.beginPath(); ctx.arc(ex, ey, 3.6, 0, Math.PI * 2); ctx.fill();
      }
    };

    for (let i = 0; i < 5; i++) {
      const a = verts[order[i]];
      const b = verts[order[i + 1]];
      if (i < armsDone) drawSeg(a, b, 1, false);
      else if (i === armsDone && !done) drawSeg(a, b, armT, armT > 0 && armT < 1);
    }

    // Finishing circle, burned in once all five arms are done.
    const circleProg = done
      ? 1
      : (armsDone >= 5 && !pentagram.paused ? Math.min(1, pentagram.circleTime / CIRCLE_BURN) : 0);
    if (circleProg > 0) {
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * circleProg;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(26, 2, 4, 0.95)';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(ARENA_CX, ARENA_CY, PENT_RADIUS, start, end); ctx.stroke();
      ctx.shadowColor = 'rgba(255, 50, 20, ' + (0.85 * (1 - fade)).toFixed(3) + ')';
      ctx.shadowBlur = 14 * pulse * (1 - fade);
      ctx.strokeStyle = 'rgba(' + burnRed + ', ' + burnGreen + ', ' + burnBlue + ', 0.92)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ARENA_CX, ARENA_CY, PENT_RADIUS, start, end); ctx.stroke();
      if (circleProg < 1) {
        const ex = ARENA_CX + Math.cos(end) * PENT_RADIUS;
        const ey = ARENA_CY + Math.sin(end) * PENT_RADIUS;
        ctx.shadowBlur = 22;
        ctx.fillStyle = 'rgba(255, 156, 64, 0.95)';
        ctx.beginPath(); ctx.arc(ex, ey, 3.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- Scene composition -------------------------------------------------
  function applyArenaContentTransform(g) {
    g.translate(arena.x, arena.y);
    g.rotate(arena.rotation);
    g.scale(arena.width / BOARD, arena.height / BOARD);
    g.translate(-BOARD / 2, -BOARD / 2);
  }

  function renderArenaBorder() {
    const isDefaultFrame = arena.shape === 'rect' && arena.x === ARENA_DEFAULT.x &&
      arena.y === ARENA_DEFAULT.y && arena.width === ARENA_DEFAULT.width &&
      arena.height === ARENA_DEFAULT.height && arena.rotation === 0;
    if (isDefaultFrame) {
      ctx.drawImage(borderCanvas, 0, 0);
      return;
    }
    // Moving/resized/non-rectangular shapes use a constant-thickness procedural
    // frame so the visible wall continues to match collision geometry.
    ctx.save();
    arenaPath(ctx, BORDER / 2);
    ctx.strokeStyle = '#260304';
    ctx.lineWidth = BORDER;
    ctx.stroke();
    arenaPath(ctx, BORDER - 1);
    ctx.strokeStyle = 'rgba(150, 18, 14, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function renderScene() {
    ctx.clearRect(0, 0, BOARD, BOARD);
    ctx.save();
    arenaPath(ctx, 0);
    ctx.clip();

    // The black empty plane inside the current arena geometry.
    ctx.fillStyle = '#040406';
    ctx.fillRect(0, 0, BOARD, BOARD);

    // Floor effects and edge creatures are attached to the arena transform.
    ctx.save();
    applyArenaContentTransform(ctx);

    // Pentagram burns into the floor, beneath everything else.
    if (phase === PHASE.PENTAGRAM || phase === PHASE.ACTIVE) renderPentagram();

    // Tentacles reach in from the dark edges once they have spawned.
    if (tentacles.length) {
      const growth = phase === PHASE.TENTACLES
        ? easeOutCubic(Math.min(1, phaseTime / TENTACLE_GROW))
        : 1;
      renderTentacles(growth);
    }

    // Fall shadow + landing impact ring.
    if (phase === PHASE.FALL && phaseTime <= FALL_DURATION) {
      renderFallShadow(Math.min(1, phaseTime / FALL_DURATION));
    }
    renderShockwave();
    ctx.restore();

    drawHero();
    ctx.restore();

    // Bloody frame follows the arena transform and sits above its contents.
    renderArenaBorder();
  }

  // ---- Movement ----------------------------------------------------------
  function clampHero() {
    const local = worldToArena(hero.x, hero.y);
    const c = Math.abs(Math.cos(arena.rotation));
    const s = Math.abs(Math.sin(arena.rotation));
    const heroHalfX = c * HERO_W / 2 + s * HERO_H / 2;
    const heroHalfY = s * HERO_W / 2 + c * HERO_H / 2;
    const rx = Math.max(1, arena.width / 2 - BORDER - PAD - heroHalfX);
    const ry = Math.max(1, arena.height / 2 - BORDER - PAD - heroHalfY);

    if (arena.shape === 'ellipse') {
      const distance = Math.hypot(local.x / rx, local.y / ry);
      if (distance > 1) {
        local.x /= distance;
        local.y /= distance;
      }
    } else if (arena.shape === 'diamond') {
      const distance = Math.abs(local.x) / rx + Math.abs(local.y) / ry;
      if (distance > 1) {
        local.x /= distance;
        local.y /= distance;
      }
    } else {
      local.x = Math.max(-rx, Math.min(rx, local.x));
      local.y = Math.max(-ry, Math.min(ry, local.y));
    }
    const world = arenaToWorld(local.x, local.y);
    hero.x = world.x;
    hero.y = world.y;
  }

  function updateMovement(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    if (dx === 0 && dy === 0) return;
    // Normalise so diagonals aren't faster — true Undertale free movement.
    // Speed rides the tempo so the hero keeps pace as the fight accelerates.
    const len = Math.hypot(dx, dy);
    const speed = MOVE_SPEED * (bpm / BASE_BPM);
    hero.x += (dx / len) * speed * dt;
    hero.y += (dy / len) * speed * dt;
    clampHero();
  }

  // ---- Phase machine -----------------------------------------------------
  function setPhase(next) {
    phase = next;
    phaseTime = 0;
    // When the scripted intro ends and the fight begins, the cultist rises from
    // her kneeling form into her standing combat pose (crossfade + rise driven
    // by the `.standing` class), and the tempo clock starts ticking.
    if (next === PHASE.ACTIVE) {
      if (cultistElement) cultistElement.classList.add('standing');
      startFight();
    }
  }

  // ---- Tempo / beat clock -----------------------------------------------
  function startFight() {
    fightClock = 0;
    bpm = BASE_BPM;
    beatMs = 60000 / bpm;
    beatPhase = 0;
    beatIndex = 0;
    lastAnimBpm = -1;
    attacks = [];
    movementIndex = 0;
    movementWave = 0;
    nextAttackBeat = 2; // a couple of beats to read the room before the first strike
    applyTempoToAnimations();
    if (bpmElement) bpmElement.textContent = 'BPM ' + bpm;
  }

  // Scale the cultist's idle CSS animations to the beat: faster tempo, faster
  // float and jitter. Only touched when the integer BPM changes.
  function applyTempoToAnimations() {
    const scale = BASE_BPM / bpm;
    if (cultistStandWrap) cultistStandWrap.style.animationDuration = (FLOAT_BASE_MS * scale) + 'ms';
    if (cultistStandImg) cultistStandImg.style.animationDuration = (JITTER_BASE_MS * scale) + 'ms';
  }

  function updateTempo(dt) {
    fightClock += dt;
    const targetBpm = BASE_BPM + Math.floor(fightClock / BPM_RAMP_MS);
    if (targetBpm !== bpm) {
      bpm = targetBpm;
      beatMs = 60000 / bpm;
    }
    beatPhase += dt;
    while (beatPhase >= beatMs) {
      beatPhase -= beatMs;
      beatIndex++;
      onBeat(beatIndex);
    }
    if (bpm !== lastAnimBpm) {
      lastAnimBpm = bpm;
      applyTempoToAnimations();
      if (bpmElement) bpmElement.textContent = 'BPM ' + bpm;
    }
  }

  // Fires on every beat boundary while the fight is active: the attack
  // scheduler lives here.
  function onBeat(beat) {
    if (phase !== PHASE.ACTIVE) return;
    if (beat >= nextAttackBeat && attacks.length === 0) {
      spawnWave();
      nextAttackBeat = Infinity; // re-armed once the current wave resolves
    }
  }

  // Dev shortcut: skip the scripted intro and drop straight into the fight
  // with every element (inner + outer tentacles, full pentagram) in place.
  function skipToActive() {
    if (phase === PHASE.ACTIVE) return;
    if (!tentacles.length) spawnTentacles();
    pentagram.arm = 5;
    pentagram.armTime = 0;
    pentagram.paused = false;
    pentagram.pauseTime = 0;
    pentagram.circleTime = CIRCLE_BURN;
    spawnOuterTentacles(true);
    heroSquash = 0;
    hero.x = ARENA_CX;
    hero.y = ARENA_CY;
    setPhase(PHASE.ACTIVE);
  }

  // Debug: abort the running pattern and start the fight on `index` of
  // MOVEMENT_SEQUENCE, spawning its first wave at once.
  function startMovement(index) {
    if (!active) return;
    if (phase !== PHASE.ACTIVE) skipToActive(); // ensures the fight has begun
    attacks = [];
    if (actx) actx.clearRect(0, 0, attackCanvas.width, attackCanvas.height);
    movementIndex = index;
    movementWave = 0;
    spawnWave();
    nextAttackBeat = Infinity; // re-armed once this wave resolves
  }

  function updatePhase(dt) {
    if (phase === PHASE.FALL) {
      if (phaseTime <= FALL_DURATION) {
        // Accelerate downward like gravity until the centre is reached.
        const p = easeInQuad(Math.min(1, phaseTime / FALL_DURATION));
        hero.x = ARENA_CX;
        hero.y = FALL_START_Y + (ARENA_CY - FALL_START_Y) * p;
        heroSquash = 0;
      } else {
        hero.x = ARENA_CX;
        hero.y = ARENA_CY;
        if (landAt < 0) landAt = clock;
        // Squash on impact, then spring back.
        const st = Math.min(1, (phaseTime - FALL_DURATION) / SETTLE_DURATION);
        heroSquash = Math.sin(st * Math.PI) * 0.8;
        if (phaseTime >= FALL_DURATION + SETTLE_DURATION) {
          heroSquash = 0;
          spawnTentacles();
          setPhase(PHASE.TENTACLES);
        }
      }
    } else if (phase === PHASE.TENTACLES) {
      if (phaseTime >= TENTACLE_GROW + TENTACLE_HOLD) setPhase(PHASE.PENTAGRAM);
    } else if (phase === PHASE.PENTAGRAM) {
      if (pentagram.paused) {
        pentagram.pauseTime += dt;
        if (pentagram.pauseTime >= PENT_PAUSE) {
          pentagram.paused = false;
          pentagram.pauseTime = 0;
        }
      } else if (pentagram.arm < 5) {
        // Burn the five arms one at a time, with a beat between each.
        pentagram.armTime += dt;
        if (pentagram.armTime >= PENT_ARM) {
          pentagram.armTime = 0;
          pentagram.arm++;
          pentagram.paused = true; // a beat before the next arm (and the circle)
          // Final arm just finished: the long tentacles surge in from the dark
          // while the finishing circle burns closed.
          if (pentagram.arm === 5) spawnOuterTentacles(false);
        }
      } else {
        // All arms done — close the seal with the surrounding circle.
        pentagram.circleTime += dt;
        if (pentagram.circleTime >= CIRCLE_BURN) setPhase(PHASE.ACTIVE);
      }
    } else if (phase === PHASE.ACTIVE) {
      updateTempo(dt);
      updateAttacks(dt);
      updateMovement(dt);
    }
  }

  // ---- Attacks -----------------------------------------------------------
  // Attack lifecycle, all paced by the beat:
  //   telegraph -> (snake reaches full length) -> armed -> (next beat) -> fire -> done
  // The six shared aim nodes in viewport space: the five tips of the centre
  // playfield pentagram (same geometry as the burned-in seal) plus its middle.
  function pentAimNodes(board) {
    const sx = board.width / BOARD;
    const sy = board.height / BOARD;
    const toView = (bx, by) => ({ x: board.left + bx * sx, y: board.top + by * sy });
    const tip = (k) => {
      const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
      return toView(ARENA_CX + Math.cos(a) * PENT_RADIUS, ARENA_CY + Math.sin(a) * PENT_RADIUS);
    };
    return {
      top: tip(0),
      topRight: tip(1),
      bottomRight: tip(2),
      bottomLeft: tip(3),
      topLeft: tip(4),
      center: toView(ARENA_CX, ARENA_CY),
    };
  }

  // Spawns the next wave of the current movement. Each spawn helper returns the
  // movement's total wave count (or null if it couldn't measure the stage yet,
  // in which case we leave the schedule untouched and retry on the next beat).
  // When the current movement's waves are spent, the next movement takes over.
  function spawnWave() {
    const board = canvas && canvas.getBoundingClientRect();
    if (!board || !board.width) return;
    const movement = MOVEMENT_SEQUENCE[movementIndex % MOVEMENT_SEQUENCE.length];
    const total = movement === 'tentacles'
      ? spawnTentacleWave(movementWave, board)
      : spawnPentagramWave(movementWave, board);
    if (!total) return;
    movementWave++;
    if (movementWave >= total) {
      movementIndex++;
      movementWave = 0;
    }
  }

  // One pentagram-barrage wave; every pentagram in it telegraphs and fires
  // together, all aimed at the playfield's shared nodes.
  function spawnPentagramWave(waveIndex, board) {
    const sprite = cultistStandImg && cultistStandImg.getBoundingClientRect();
    if (!sprite || !sprite.width) return null;
    const nodes = pentAimNodes(board);
    const wave = ATTACK_PATTERN[waveIndex % ATTACK_PATTERN.length];
    for (const anchorKey of wave) spawnPentaBeam(anchorKey, sprite, nodes);
    return ATTACK_PATTERN.length;
  }

  // One wave of the tentacle movement: spawns every limb in the scripted wave
  // (all telegraph and strike together) and reports the movement's length.
  function spawnTentacleWave(waveIndex, board) {
    const wave = TENTACLE_PATTERN[waveIndex];
    wave.forEach((spec, k) => pushTentacle(spec, board, waveIndex + k));
    return TENTACLE_PATTERN.length;
  }

  // Builds one limb from a spec into viewport space. Geometry is captured as a
  // root point, a stretch direction, and a perpendicular (band thickness axis),
  // so the same renderer handles horizontal rows and vertical columns. Roots sit
  // on the outer box edges; the clip rect (the frame opening) tucks each limb's
  // start and end under the bloody border.
  function pushTentacle(spec, board, phaseSeed) {
    const sx = board.width / BOARD;
    const sy = board.height / BOARD;
    const openLo = BORDER;
    const openHi = BOARD - BORDER;
    let rx, ry, dirX, dirY, nx, ny, len, hw;
    if (spec.orient === 'col') {
      const spacing = (openHi - openLo) / TENTACLE_COLS;
      const cx = board.left + (openLo + (spec.index + 0.5) * spacing) * sx;
      nx = 1; ny = 0;                       // band thickness runs horizontally
      hw = (TENTACLE_BAND_H / 2) * sx;
      len = board.height;
      if (spec.side === 'bottom') { rx = cx; ry = board.top + board.height; dirX = 0; dirY = -1; }
      else { rx = cx; ry = board.top; dirX = 0; dirY = 1; }
    } else {
      const spacing = (openHi - openLo) / TENTACLE_ROWS;
      const cy = board.top + (openLo + (spec.index + 0.5) * spacing) * sy;
      nx = 0; ny = 1;                       // band thickness runs vertically
      hw = (TENTACLE_BAND_H / 2) * sy;
      len = board.width;
      if (spec.side === 'right') { rx = board.left + board.width; ry = cy; dirX = -1; dirY = 0; }
      else { rx = board.left; ry = cy; dirX = 1; dirY = 0; }
    }
    attacks.push({
      type: 'tentacle',
      state: 'telegraph',
      rx, ry, dirX, dirY, nx, ny, len, hw,
      clipX0: board.left + openLo * sx,
      clipX1: board.left + openHi * sx,
      clipY0: board.top + openLo * sy,
      clipY1: board.top + openHi * sy,
      waves: 1.6,
      amp: hw * 0.4,
      speed: 0.004,
      phase: phaseSeed * 1.7,
      stretch: 0,
      stretchBeats: TENTACLE_STRETCH_BEATS,
      readyBeat: 0,
      fire: 0,
      fireBeats: TENTACLE_FIRE_BEATS,
      restBeats: TENTACLE_REST_BEATS,
    });
  }

  // One pentagram beam, pinned to a body part on the standing sprite and aimed
  // at its assigned node. Positions are captured in viewport space at spawn
  // time, so the beam stays anchored while she keeps floating.
  function spawnPentaBeam(anchorKey, sprite, nodes) {
    const anchor = ATTACK_ANCHORS[anchorKey];
    const ox = sprite.left + sprite.width * anchor.fx;
    const oy = sprite.top + sprite.height * anchor.fy;
    const aim = nodes[ATTACK_AIM[anchorKey]] || nodes.center;
    const angle = Math.atan2(aim.y - oy, aim.x - ox);
    // Fixed length that always overshoots the screen, so every beam telegraphs
    // at the same rate and on the same timing regardless of where it starts.
    const length = Math.hypot(window.innerWidth, window.innerHeight) * 1.2;
    attacks.push({
      type: 'pentaBeam',
      state: 'telegraph',
      anchor: anchorKey,
      x: ox, y: oy, angle,   // viewport-space origin (pentagram centre)
      radius: 30,
      length,
      width: 57.5,           // 1.25x the original beam width
      stretch: 0,            // 0..1 telegraph growth
      stretchBeats: 0.75,    // shorter telegraph: less time to dodge
      readyBeat: 0,
      fire: 0,               // 0..1 beam life
      fireBeats: 1,
      restBeats: ATTACK_REST_BEATS,
    });
  }

  function updateAttacks(dt) {
    for (const a of attacks) {
      if (a.state === 'telegraph') {
        // The snake advances at the beat's pace, reaching the far edge in one beat.
        a.stretch += dt / (beatMs * a.stretchBeats);
        if (a.stretch >= 1) {
          a.stretch = 1;
          a.state = 'armed';
          a.readyBeat = beatIndex;
        }
      } else if (a.state === 'armed') {
        // The strike lands on the first beat after the telegraph finished.
        if (beatIndex > a.readyBeat) { a.state = 'fire'; a.fire = 0; }
      } else if (a.state === 'fire') {
        a.fire += dt / (beatMs * a.fireBeats);
        if (a.fire >= 1) { a.fire = 1; a.state = 'done'; }
      }
    }
    if (attacks.length && attacks.every((a) => a.state === 'done')) {
      // Each movement carries its own breathing room (tentacles rest less than
      // the pentagram barrage); all attacks in a wave share the same value.
      const rest = attacks[0].restBeats != null ? attacks[0].restBeats : ATTACK_REST_BEATS;
      attacks = [];
      nextAttackBeat = beatIndex + rest;
    }
  }

  // Clears and repaints the full-viewport attack canvas (pentagrams + beams).
  function renderAttackLayer() {
    if (!actx) return;
    actx.clearRect(0, 0, attackCanvas.width, attackCanvas.height);
    if (phase !== PHASE.ACTIVE) return;
    for (const a of attacks) {
      if (a.type === 'pentaBeam') renderPentaBeam(a);
      else if (a.type === 'tentacle') renderTentacleAttack(a);
    }
  }

  // The summoning pentagram: a small dark-purple five-pointed star + ring, one
  // point aimed along `angle`. `glow` (0..1) brightens it as the beam charges.
  function drawAttackPentagram(x, y, radius, angle, glow) {
    const verts = [];
    for (let k = 0; k < 5; k++) {
      const a = angle + k * (Math.PI * 2 / 5);
      verts.push({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius });
    }
    const order = [0, 2, 4, 1, 3, 0];
    const tracePath = () => {
      actx.beginPath();
      for (let i = 0; i < order.length; i++) {
        const v = verts[order[i]];
        if (i === 0) actx.moveTo(v.x, v.y); else actx.lineTo(v.x, v.y);
      }
    };
    actx.save();
    actx.lineCap = 'round';
    actx.lineJoin = 'round';
    actx.shadowColor = 'rgba(150, 60, 230, ' + (0.5 + glow * 0.5).toFixed(3) + ')';
    actx.shadowBlur = 8 + glow * 18;
    // Charred dark base.
    actx.strokeStyle = 'rgba(34, 6, 52, 0.95)';
    actx.lineWidth = 5;
    tracePath(); actx.stroke();
    actx.beginPath(); actx.arc(x, y, radius, 0, Math.PI * 2); actx.stroke();
    // Glowing purple line on top.
    actx.strokeStyle = 'rgba(168, 84, 232, ' + (0.7 + glow * 0.3).toFixed(3) + ')';
    actx.lineWidth = 2;
    tracePath(); actx.stroke();
    actx.beginPath(); actx.arc(x, y, radius, 0, Math.PI * 2); actx.stroke();
    actx.restore();
  }

  // Build the beam corridor as a quad of length `len` from the pentagram.
  function corridorPath(a, len, hw) {
    const dx = Math.cos(a.angle);
    const dy = Math.sin(a.angle);
    const nx = -dy;
    const ny = dx;
    const x1 = a.x + dx * len;
    const y1 = a.y + dy * len;
    actx.beginPath();
    actx.moveTo(a.x + nx * hw, a.y + ny * hw);
    actx.lineTo(x1 + nx * hw, y1 + ny * hw);
    actx.lineTo(x1 - nx * hw, y1 - ny * hw);
    actx.lineTo(a.x - nx * hw, a.y - ny * hw);
    actx.closePath();
  }

  function renderPentaBeam(a) {
    const hw = a.width / 2;

    if (a.state === 'telegraph' || a.state === 'armed') {
      // Dark-purple outline snaking across the ground, leading the beam.
      const len = a.length * a.stretch;
      actx.save();
      corridorPath(a, len, hw);
      actx.fillStyle = 'rgba(58, 10, 80, 0.22)';
      actx.fill();
      actx.strokeStyle = 'rgba(120, 40, 170, 0.85)';
      actx.lineWidth = 2;
      actx.stroke();
      // Energy creeping inward along the corridor edges.
      actx.setLineDash([7, 9]);
      actx.lineDashOffset = -clock * 0.04;
      actx.strokeStyle = 'rgba(186, 96, 236, ' + (a.state === 'armed' ? 0.85 : 0.55).toFixed(3) + ')';
      actx.lineWidth = 1.5;
      actx.stroke();
      actx.setLineDash([]);
      // Bright snaking tip while it is still extending.
      if (a.state === 'telegraph') {
        const tx = a.x + Math.cos(a.angle) * len;
        const ty = a.y + Math.sin(a.angle) * len;
        actx.shadowColor = 'rgba(190, 100, 240, 0.9)';
        actx.shadowBlur = 14;
        actx.fillStyle = 'rgba(214, 150, 255, 0.95)';
        actx.beginPath(); actx.arc(tx, ty, 4, 0, Math.PI * 2); actx.fill();
      }
      actx.restore();
      drawAttackPentagram(a.x, a.y, a.radius, a.angle, a.state === 'armed' ? 1 : a.stretch);
      return;
    }

    if (a.state === 'fire' || a.state === 'done') {
      // The beam: bright at the strike, easing out over its life.
      const life = 1 - easeOutCubic(a.fire);
      actx.save();
      // Outer glow.
      corridorPath(a, a.length, hw);
      actx.shadowColor = 'rgba(150, 60, 230, ' + (0.8 * life).toFixed(3) + ')';
      actx.shadowBlur = 26 * life;
      actx.fillStyle = 'rgba(96, 22, 150, ' + (0.55 * life).toFixed(3) + ')';
      actx.fill();
      // Hot core.
      corridorPath(a, a.length, hw * 0.42);
      actx.shadowBlur = 16 * life;
      actx.fillStyle = 'rgba(224, 168, 255, ' + (0.92 * life).toFixed(3) + ')';
      actx.fill();
      actx.restore();
      drawAttackPentagram(a.x, a.y, a.radius, a.angle, life);
    }
  }

  // Scratch buffers for the horizontal tentacle ribbon (allocation-free path).
  const TENT_SEGS = 22;
  const tentPX = new Float32Array(TENT_SEGS + 1);
  const tentPY = new Float32Array(TENT_SEGS + 1);
  const tentNX = new Float32Array(TENT_SEGS + 1);
  const tentNY = new Float32Array(TENT_SEGS + 1);
  const tentHW = new Float32Array(TENT_SEGS + 1);

  function renderTentacleAttack(a) {
    // Clip to the frame opening so the limb's start and end tuck under the
    // outer border instead of spilling onto the floor inside the playfield.
    actx.save();
    actx.beginPath();
    actx.rect(a.clipX0, a.clipY0, a.clipX1 - a.clipX0, a.clipY1 - a.clipY0);
    actx.clip();

    if (a.state === 'telegraph' || a.state === 'armed') {
      // Purple outline band snaking across the floor where the limb will land.
      const reach = a.len * a.stretch;
      const fx = a.rx + a.dirX * reach;
      const fy = a.ry + a.dirY * reach;
      const ox = a.nx * a.hw;
      const oy = a.ny * a.hw;
      actx.beginPath();
      actx.moveTo(a.rx + ox, a.ry + oy);
      actx.lineTo(fx + ox, fy + oy);
      actx.lineTo(fx - ox, fy - oy);
      actx.lineTo(a.rx - ox, a.ry - oy);
      actx.closePath();
      actx.fillStyle = 'rgba(58, 10, 80, 0.22)';
      actx.fill();
      actx.strokeStyle = 'rgba(120, 40, 170, 0.85)';
      actx.lineWidth = 2;
      actx.stroke();
      // Energy creeping along the corridor edges.
      actx.setLineDash([7, 9]);
      actx.lineDashOffset = -clock * 0.04;
      actx.strokeStyle = 'rgba(186, 96, 236, ' + (a.state === 'armed' ? 0.85 : 0.55).toFixed(3) + ')';
      actx.lineWidth = 1.5;
      actx.beginPath();
      actx.moveTo(a.rx + ox, a.ry + oy); actx.lineTo(fx + ox, fy + oy);
      actx.moveTo(a.rx - ox, a.ry - oy); actx.lineTo(fx - ox, fy - oy);
      actx.stroke();
      actx.setLineDash([]);
      // Bright snaking tip while it is still extending.
      if (a.state === 'telegraph') {
        actx.shadowColor = 'rgba(190, 100, 240, 0.9)';
        actx.shadowBlur = 14;
        actx.fillStyle = 'rgba(214, 150, 255, 0.95)';
        actx.beginPath(); actx.arc(fx, fy, 5, 0, Math.PI * 2); actx.fill();
      }
    } else if (a.state === 'fire' || a.state === 'done') {
      // The limb lashes out of the wall, holds, then withdraws.
      const extend = easeOutCubic(Math.min(1, a.fire / 0.35));
      const fade = a.fire < 0.7 ? 1 : Math.max(0, 1 - (a.fire - 0.7) / 0.3);
      drawTentacleRibbon(a, a.len * extend, fade);
    }

    actx.restore();
  }

  // A writhing limb: a tapering filled ribbon rooted at one wall and reaching
  // `reach` px along its axis, with a purple rim and glowing centreline nodes.
  function drawTentacleRibbon(a, reach, alpha) {
    if (alpha <= 0 || reach <= 0) return;
    const segs = TENT_SEGS;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const along = reach * u;
      const wob = Math.sin(u * a.waves * Math.PI + clock * a.speed + a.phase) * a.amp * (0.35 + u * 0.65);
      tentPX[s] = a.rx + a.dirX * along + a.nx * wob;
      tentPY[s] = a.ry + a.dirY * along + a.ny * wob;
      // Thick at the wall, tapering toward the writhing tip.
      tentHW[s] = Math.max(1.5, a.hw * (0.55 + 0.45 * Math.pow(1 - u, 0.5)));
    }
    for (let i = 0; i <= segs; i++) {
      const p = Math.max(0, i - 1);
      const q = Math.min(segs, i + 1);
      const dx = tentPX[q] - tentPX[p];
      const dy = tentPY[q] - tentPY[p];
      const tl = Math.hypot(dx, dy) || 1;
      tentNX[i] = -dy / tl;
      tentNY[i] = dx / tl;
    }
    actx.save();
    actx.lineJoin = 'round';
    actx.lineCap = 'round';
    // Body ribbon.
    actx.beginPath();
    actx.moveTo(tentPX[0] + tentNX[0] * tentHW[0], tentPY[0] + tentNY[0] * tentHW[0]);
    for (let i = 1; i <= segs; i++) actx.lineTo(tentPX[i] + tentNX[i] * tentHW[i], tentPY[i] + tentNY[i] * tentHW[i]);
    for (let i = segs; i >= 0; i--) actx.lineTo(tentPX[i] - tentNX[i] * tentHW[i], tentPY[i] - tentNY[i] * tentHW[i]);
    actx.closePath();
    actx.shadowColor = 'rgba(150, 60, 230, ' + (0.75 * alpha).toFixed(3) + ')';
    actx.shadowBlur = 22 * alpha;
    actx.fillStyle = 'rgba(14, 5, 22, ' + (0.96 * alpha).toFixed(3) + ')';
    actx.fill();
    actx.shadowBlur = 0;
    // Purple rim so the limb reads against the dark floor.
    actx.strokeStyle = 'rgba(150, 60, 230, ' + (0.7 * alpha).toFixed(3) + ')';
    actx.lineWidth = 2;
    actx.stroke();
    // Glowing suckers down the centreline.
    for (let s = 2; s < segs; s += 2) {
      const r = Math.max(1.5, tentHW[s] * 0.32);
      actx.fillStyle = 'rgba(120, 40, 170, ' + (0.5 * alpha).toFixed(3) + ')';
      actx.beginPath(); actx.arc(tentPX[s], tentPY[s], r, 0, Math.PI * 2); actx.fill();
    }
    actx.restore();
  }

  function updateFpsCounter(time) {
    if (!fpsSampleStart) fpsSampleStart = time;
    fpsFrames++;
    const elapsed = time - fpsSampleStart;
    if (elapsed < 1000) return;
    if (fpsElement) fpsElement.textContent = 'FPS ' + (fpsFrames * 1000 / elapsed).toFixed(1);
    fpsFrames = 0;
    fpsSampleStart = time;
  }

  function frame(time) {
    if (!active) return;
    updateFpsCounter(time);
    const dt = Math.min(48, time - previousTime || 16);
    previousTime = time;
    clock += dt;
    phaseTime += dt;
    updateArena(dt);
    updatePhase(dt);
    if (phase === PHASE.ACTIVE) clampHero();
    renderBackground(time, false);
    renderScene();
    renderAttackLayer();
    animationFrame = requestAnimationFrame(frame);
  }

  // ---- Input -------------------------------------------------------------
  const MOVE_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ]);

  function onKeyDown(event) {
    if (!active) return;
    // Secret debug sequence (2137): typing it bails out of the rift.
    if (event.key && event.key.length === 1 && event.key >= '0' && event.key <= '9') {
      debugBuffer = (debugBuffer + event.key).slice(-DEBUG_QUIT_SEQUENCE.length);
      if (debugBuffer === DEBUG_QUIT_SEQUENCE) { debugBuffer = ''; close(); return; }
    }
    if (event.code === 'Enter') { skipToActive(); event.preventDefault(); return; }
    if (MOVE_CODES.has(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (MOVE_CODES.has(event.code)) keys.delete(event.code);
  }

  function dispatchState() {
    window.dispatchEvent(new CustomEvent('aetherboss2dchange', { detail: { active } }));
  }

  // ---- Lifecycle ---------------------------------------------------------
  function open() {
    if (active) return;
    setSavedEndgameScene('boss2d');
    if (!overlay) makeOverlay();
    if (!borderCanvas) buildBorder();

    // Reset the scripted intro sequence.
    phase = PHASE.FALL;
    phaseTime = 0;
    clock = 0;
    landAt = -1;
    heroSquash = 0;
    tentacles = [];
    outerTentacles = [];
    pentagram.arm = 0;
    pentagram.armTime = 0;
    pentagram.paused = false;
    pentagram.pauseTime = 0;
    pentagram.circleTime = 0;
    resetArenaState();
    hero.x = ARENA_CX;
    hero.y = FALL_START_Y;
    keys.clear();
    debugBuffer = '';
    if (cultistElement) cultistElement.classList.remove('standing');
    // Tempo / attacks idle until she stands (PHASE.ACTIVE -> startFight()).
    fightClock = 0;
    bpm = BASE_BPM;
    beatMs = 60000 / bpm;
    beatPhase = 0;
    beatIndex = 0;
    lastAnimBpm = -1;
    attacks = [];
    movementIndex = 0;
    movementWave = 0;
    nextAttackBeat = Infinity;
    if (bpmElement) bpmElement.textContent = 'BPM --';
    fpsSampleStart = 0;
    fpsFrames = 0;
    if (fpsElement) fpsElement.textContent = 'FPS --';

    overlay.classList.remove('hidden');
    document.body.classList.add('aether-boss2d-active');
    active = true;
    sizeBackground();
    sizeAttackCanvas();
    previousTime = performance.now();
    renderBackground(previousTime, true);
    renderScene();
    animationFrame = requestAnimationFrame(frame);
    dispatchState();
  }

  function close() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    keys.clear();
    overlay.classList.add('hidden');
    document.body.classList.remove('aether-boss2d-active');
    dispatchState();
  }

  function onResize() {
    if (!active) return;
    sizeBackground();
    sizeAttackCanvas();
    // Re-anchor the long tentacles to the box's new position, already grown.
    if (outerTentacles.length) spawnOuterTentacles(true);
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', () => keys.clear());

  window.AetherBoss2D = Object.freeze({
    open,
    close,
    isOpen: () => active,
    setArena,
    resetArena,
    getArena: arenaSnapshot,
    arenaContains,
    worldToArena,
    arenaToWorld,
  });
})();
