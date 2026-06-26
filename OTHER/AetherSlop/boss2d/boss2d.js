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
  const MOVE_SPEED = 0.21; // px per ms (~12.6 px/frame @60fps)

  // ---- Module state ------------------------------------------------------
  let overlay = null;
  let canvas = null;
  let ctx = null;
  let bgCanvas = null;     // full-viewport layer behind the box
  let bgCtx = null;
  let borderCanvas = null; // pre-rendered static bloody frame
  let cultistElement = null; // the boss sprite looming in the room above the arena
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
      '<div id="aether-boss2d-fps" class="aether-boss2d-fps">FPS --</div>' +
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
    fpsElement = document.getElementById('aether-boss2d-fps');
    cultistElement = document.getElementById('aether-boss2d-cultist');
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
    const len = Math.hypot(dx, dy);
    hero.x += (dx / len) * MOVE_SPEED * dt;
    hero.y += (dy / len) * MOVE_SPEED * dt;
    clampHero();
  }

  // ---- Phase machine -----------------------------------------------------
  function setPhase(next) {
    phase = next;
    phaseTime = 0;
    // When the scripted intro ends and the fight begins, the cultist rises from
    // her kneeling form into her standing combat pose (crossfade + rise driven
    // by the `.standing` class).
    if (next === PHASE.ACTIVE && cultistElement) cultistElement.classList.add('standing');
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
      updateMovement(dt);
    }
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
    fpsSampleStart = 0;
    fpsFrames = 0;
    if (fpsElement) fpsElement.textContent = 'FPS --';

    overlay.classList.remove('hidden');
    document.body.classList.add('aether-boss2d-active');
    active = true;
    sizeBackground();
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
