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
  const CULTIST_FALLEN_SRC = SCRIPT_DIR + 'spritesV2/shadow-cultist-fallen-v2.png';
  const AVATAR_SHADOW_SRC = SCRIPT_DIR + 'spritesV2/avatar-of-shadow-base.png';

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
  const HERO_W = HERO.rows[0].length * HERO_SCALE;
  const HERO_H = HERO.rows.length * HERO_SCALE;
  const HERO_BODY_CELLS = (function buildHeroBodyCells() {
    const opaque = new Set();
    for (let y = 0; y < HERO.rows.length; y++) {
      for (let x = 0; x < HERO.rows[y].length; x++) {
        const token = HERO.rows[y][x];
        if (token !== '.' && token !== ' ' && HERO.pal[token]) opaque.add(x + ',' + y);
      }
    }
    const visited = new Set();
    let largest = [];
    for (const key of opaque) {
      if (visited.has(key)) continue;
      const component = [];
      const pending = [key];
      visited.add(key);
      while (pending.length) {
        const current = pending.pop();
        const [x, y] = current.split(',').map(Number);
        component.push({ x, y });
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const neighbor = (x + dx) + ',' + (y + dy);
          if (opaque.has(neighbor) && !visited.has(neighbor)) {
            visited.add(neighbor);
            pending.push(neighbor);
          }
        }
      }
      if (component.length > largest.length) largest = component;
    }
    return largest;
  })();
  const HERO_BODY_BOUNDS = HERO_BODY_CELLS.reduce((bounds, cell) => ({
    minX: Math.min(bounds.minX, cell.x),
    minY: Math.min(bounds.minY, cell.y),
    maxX: Math.max(bounds.maxX, cell.x),
    maxY: Math.max(bounds.maxY, cell.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const HERO_BODY_CENTER_LOCAL = {
    x: (HERO_BODY_BOUNDS.minX + HERO_BODY_BOUNDS.maxX + 1) * HERO_SCALE / 2,
    y: (HERO_BODY_BOUNDS.minY + HERO_BODY_BOUNDS.maxY + 1) * HERO_SCALE / 2,
  };
  const HERO_BODY_PIXEL_OFFSETS = [];
  for (const cell of HERO_BODY_CELLS) {
    for (let pixelY = 0; pixelY < HERO_SCALE; pixelY++) {
      for (let pixelX = 0; pixelX < HERO_SCALE; pixelX++) {
        HERO_BODY_PIXEL_OFFSETS.push({
          x: cell.x * HERO_SCALE + pixelX + 0.5,
          y: cell.y * HERO_SCALE + pixelY + 0.5,
        });
      }
    }
  }
  const HERO_BODY_OUTLINE_OFFSETS = (function buildHeroBodyOutlineOffsets() {
    const gap = 7;
    const thickness = 4;
    const innerDistanceSq = gap * gap;
    const outerDistance = gap + thickness;
    const outerDistanceSq = outerDistance * outerDistance;
    const bodyPixels = HERO_BODY_PIXEL_OFFSETS.map((point) => ({
      x: Math.floor(point.x),
      y: Math.floor(point.y),
    }));
    const minX = Math.min(...bodyPixels.map((point) => point.x)) - outerDistance;
    const maxX = Math.max(...bodyPixels.map((point) => point.x)) + outerDistance;
    const minY = Math.min(...bodyPixels.map((point) => point.y)) - outerDistance;
    const maxY = Math.max(...bodyPixels.map((point) => point.y)) + outerDistance;
    const outlinePixels = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let nearestSq = Infinity;
        let nearestX = x;
        let nearestY = y;
        for (const bodyPoint of bodyPixels) {
          const dx = x - bodyPoint.x;
          const dy = y - bodyPoint.y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq < nearestSq) {
            nearestSq = distanceSq;
            nearestX = bodyPoint.x;
            nearestY = bodyPoint.y;
          }
          if (nearestSq <= innerDistanceSq) break;
        }
        if (nearestSq > innerDistanceSq && nearestSq <= outerDistanceSq) {
          outlinePixels.push({ x, y, bodyX: nearestX, bodyY: nearestY });
        }
      }
    }
    return outlinePixels;
  })();
  const MOVE_SPEED = 0.21; // base px per ms at BASE_BPM; scales with tempo

  // ---- Module state ------------------------------------------------------
  let overlay = null;
  let canvas = null;
  let ctx = null;
  let bgCanvas = null;     // full-viewport layer behind the box
  let bgCtx = null;
  let attackCanvas = null; // full-viewport layer for pentagrams + beams
  let actx = null;
  let deathCanvas = null;  // full-viewport death cut + broken-screen layer
  let deathCtx = null;
  let borderCanvas = null; // pre-rendered static bloody frame
  let calcifiedBorderCanvas = null; // pre-rendered phase-two bone-gray frame
  let cobbledFloorCanvas = null; // pre-rendered phase-two stone floor
  let cobbledFloorPattern = null;
  let phase2CrackMaskCanvas = null;
  let phase2CrackEdgeCanvas = null;
  let phase2CrackCacheDirty = true;
  let phase2CrackCacheBuiltAt = -Infinity;
  let cultistElement = null;   // the boss container (kneel + stand layers)
  let cultistStandWrap = null; // standing layer wrapper (carries the float loop)
  let cultistStandImg = null;  // standing sprite img (carries the pixel jitter)
  let cultistFallenImg = null; // fallen form used for the second-phase ritual
  let bpmElement = null;       // debug BPM readout, top-right
  let soundDebugOverlay = null;
  let active = false;
  let animationFrame = 0;
  let previousTime = 0;
  const keys = new Set();

  // Secret debug sequence: typing these digits quits the rift outright.
  const DEBUG_QUIT_SEQUENCE = '2137';
  let debugBuffer = '';

  // Hero position is the centre of the sprite, in board space.
  const hero = { x: BOARD / 2, y: BOARD / 2 };
  // Current input direction, used by predictive portal attacks. It clears as
  // soon as the player releases movement so standing still means "aim at me".
  const heroMove = { x: 0, y: 0 };

  // ---- Intro / combat sequencing ----------------------------------------
  // The fight opens with a scripted sequence: the hero falls into the arena,
  // tentacles writhe in from the dark on every edge but the north, then a
  // dark-red pentagram burns into the floor arm by arm. Only after that does
  // free movement (PHASE.ACTIVE) begin.
  const PHASE = { FALL: 0, TENTACLES: 1, PENTAGRAM: 2, ACTIVE: 3, SECOND: 4 };
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
  const PHASE2_ATTACK_FADE = 900;  // ms for active attacks to dissolve away
  const PHASE2_ARENA_TRANSITION = 3200; // ms for the arena to calcify before the ritual casts
  const PHASE2_ORB_LAUNCH = 1050;  // ms for the casting orb to leave her hand
  const PHASE2_PENT_FORM = 760;    // ms for the orb to unfold into a pentagram
  // One shadow stream from the sky pentagram: the head snakes down (REACH),
  // darkness pours along the connected stream (POUR), then the tail lets go
  // and the whole stream is sucked into the impact (RELEASE).
  const P2_BEAM_REACH = 300;
  const P2_BEAM_POUR = 430;
  const P2_BEAM_RELEASE = 280;
  const P2_BEAM_TOTAL = P2_BEAM_REACH + P2_BEAM_POUR + P2_BEAM_RELEASE;
  const P2_BLOT_GROW = 780;        // ms for one landed shadow blot to bloom out
  const P2_FLOOD_MS = 1250;        // silhouette floods solid after the last body strike
  const P2_COCOON_HITS = 34;       // feeding strikes to grow the seed into the shadow orb

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
  let frameBoardRect = null;    // one layout read shared by phase-two systems per frame
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
  let bpmBonus = 0;                  // extra wrath from the hero's strikes (BPM)
  let beatMs = 60000 / BASE_BPM;     // duration of one beat at the current tempo
  let beatPhase = 0;                 // ms elapsed inside the current beat
  let beatIndex = 0;                 // beats elapsed since the fight began
  let lastAnimBpm = -1;              // last tempo pushed to the CSS animations

  // ---- Phase-one music ---------------------------------------------------
  // Exported from the adjacent motif lab. `bpm` is the audition tempo only;
  // combat playback uses the live fight BPM so the loop follows wrath.
  const BOSS_MOTIF = {
    name: '[OG] Death Encounter',
    bpm: 60,
    stepsPerBeat: 2,
    stepBeats: 0.5,
    length: 16,
    layerOrder: [3, 4, 2, 1],
    layers: [
      {
        name: 'Layer 1',
        instrument: 'lead',
        volume: 0.82,
        muted: false,
        notes: [
          'E4', 'E4', 'E4', 'E4', 'F4', 'F4', 'D5', 'D5',
          'E4', 'E4', 'E4', 'E4', 'F4', 'F4', 'F5', 'F5',
        ],
        accents: [
          true, false, false, false, false, false, false, false,
          true, false, false, false, false, false, false, false,
        ],
        holds: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        variance: {
          cycleTranspose: 'off',
          noteMutationChance: 0,
          mutationSemitones: 1,
          nonAccentDropout: 0,
        },
      },
      {
        name: 'Layer 2',
        instrument: 'guitar',
        volume: 0.82,
        muted: false,
        notes: [
          'E2', 'E2', null, null, 'B2', 'B2', null, null,
          'E2', 'E2', null, null, 'B2', 'B2', null, null,
        ],
        accents: [
          true, false, false, false, false, false, false, false,
          true, false, false, false, false, false, false, false,
        ],
        holds: [2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1],
        variance: {
          cycleTranspose: 'off',
          noteMutationChance: 0,
          mutationSemitones: 1,
          nonAccentDropout: 0,
        },
      },
      {
        name: 'Layer 3',
        instrument: 'bass',
        volume: 0.86,
        muted: false,
        notes: [
          'E2', 'E2', 'E2', 'E2', 'A#2', 'A#2', 'F2', 'F2',
          'E2', 'E2', 'E2', 'E2', 'A#2', 'A#2', 'F#2', 'F#2',
        ],
        accents: [
          true, false, false, false, false, false, false, false,
          true, false, false, false, false, false, false, false,
        ],
        holds: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        variance: {
          cycleTranspose: 'off',
          noteMutationChance: 0,
          mutationSemitones: 1,
          nonAccentDropout: 0,
        },
      },
      {
        name: 'Layer 4',
        instrument: 'piano',
        volume: 1,
        muted: false,
        notes: [
          'E4', 'E4', 'G4', 'G4', 'E4', 'E4', 'D5', 'D5',
          'E4', 'E4', 'G4', 'G4', 'E4', 'E4', 'F5', 'F5',
        ],
        accents: [
          true, false, false, false, false, false, false, false,
          true, false, false, false, false, false, false, false,
        ],
        holds: [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1],
        variance: {
          cycleTranspose: 'off',
          noteMutationChance: 0,
          mutationSemitones: 1,
          nonAccentDropout: 0,
        },
      },
    ],
    synth: {
      voice: 'pulse25',
      guitarVoice: 'doomStack',
      bassVoice: 'deepSub',
      pianoVoice: 'toyPiano',
      drumsVoice: 'machine',
      gate: 1,
      transpose: -2,
      bitDepth: 6,
      drive: 0.01,
      cutoffHz: 2550,
      bass: 0.4,
      noise: 0,
      echo: 0,
      echoBeats: 1,
    },
  };
  const BOSS_MUSIC_MASTER_GAIN = 0.145;
  const BOSS_MUSIC_LOOKAHEAD = 0.11;
  const BOSS_MUSIC_PATTERNS_PER_LAYER = 2;
  // Motif Lab-style one-shots share the music context and pulse-wave palette,
  // but have their own crunchy bus so stopping the score never cuts off an SFX.
  const BOSS_SFX_MASTER_GAIN = 1.12;
  const BOSS_SFX_VP_STEPS_PER_BEAT = 4;
  const BOSS_SFX_DAMAGE_STEPS_PER_BEAT = 2;
  const BOSS_SFX_DEBUG_CUES = [
    { label: 'PENTA OMEN', cue: 'shadowCharge', movement: 'pentagrams', stepsPerBeat: 1 },
    { label: 'PENTA BEAM', cue: 'cultistAttack', movement: 'pentagrams', stepsPerBeat: 1 },
    { label: 'TENTACLE STIR', cue: 'shadowCharge', movement: 'tentacles', stepsPerBeat: 1 },
    { label: 'TENTACLE LASH', cue: 'cultistAttack', movement: 'tentacles', stepsPerBeat: 1 },
    { label: 'X-RAY OMEN', cue: 'shadowCharge', movement: 'xrays', stepsPerBeat: 1 },
    { label: 'X-RAY SLAM', cue: 'cultistAttack', movement: 'xrays', stepsPerBeat: 1 },
    { label: 'BLOOD RITE', cue: 'shadowCharge', movement: 'bloodspiral', stepsPerBeat: 1 },
    { label: 'BLOOD FLARE', cue: 'cultistAttack', movement: 'bloodspiral', attack: 'bloodSpiral', stepsPerBeat: 0.5 },
    { label: 'BOARD ANNIHILATE', cue: 'cultistAttack', movement: 'bloodspiral', attack: 'outsidePent', stepsPerBeat: 0.5 },
    { label: 'GRID CURSE', cue: 'shadowCharge', movement: 'checkerboard', stepsPerBeat: 1 },
    { label: 'GRID BREAK', cue: 'cultistAttack', movement: 'checkerboard', stepsPerBeat: 1 },
    { label: 'VOID INHALE', cue: 'shadowCharge', movement: 'portalbarrage', stepsPerBeat: 1 },
    { label: 'VOID ERUPT', cue: 'cultistAttack', movement: 'portalbarrage', stepsPerBeat: 1 },
    { label: 'TWIN GATES', cue: 'shadowCharge', movement: 'sideportals', stepsPerBeat: 1 },
    { label: 'ORB VOLLEY', cue: 'cultistAttack', movement: 'sideportals', stepsPerBeat: 1 },
    { label: 'VP TICK', cue: 'vp', stepsPerBeat: BOSS_SFX_VP_STEPS_PER_BEAT },
    { label: 'VP FULL', cue: 'vpFull', stepsPerBeat: 0.5 },
    { label: 'TAKE DAMAGE', cue: 'damage', stepsPerBeat: BOSS_SFX_DAMAGE_STEPS_PER_BEAT },
    { label: 'DIE', cue: 'death', stepsPerBeat: 1 },
    { label: 'DEATH IMPACT', cue: 'deathImpact', stepsPerBeat: 1 },
    { label: 'SCREEN CRACK', cue: 'deathCrack', stepsPerBeat: 1 },
    { label: 'PERSIST REVERSE', cue: 'persist', stepsPerBeat: 1 },
    { label: 'OUR CAST', cue: 'playerAttack', stepsPerBeat: 1 },
    { label: 'SWORD TRAVEL', cue: 'playerTravel', stepsPerBeat: 1 },
    { label: 'OUR IMPACT', cue: 'playerImpact', stepsPerBeat: 1 },
    { label: 'INTRO FALL', cue: 'introFall', stepsPerBeat: 1 },
    { label: 'INTRO LAND', cue: 'introLand', stepsPerBeat: 1 },
    { label: 'TENTACLES RISE', cue: 'introTentacles', stepsPerBeat: 1 },
    { label: 'PENTAGRAM RITUAL', cue: 'introPentagram', stepsPerBeat: 0.125 },
    { label: 'SEAL CLOSE', cue: 'introSeal', stepsPerBeat: 1 },
    { label: 'CULTIST RISE', cue: 'introRise', stepsPerBeat: 1 },
    { label: 'CULTIST FALL', cue: 'phase2Fall', stepsPerBeat: 1 },
    { label: 'BLACK MASS', cue: 'phase2Mass', stepsPerBeat: 0.5 },
    { label: 'MASS FEED', cue: 'phase2Feed', stepsPerBeat: 2 },
    { label: 'SZAGO EMERGE', cue: 'phase2Emerge', stepsPerBeat: 1 },
    { label: 'SZAGO SLAM', cue: 'phase2Slam', stepsPerBeat: 1 },
    { label: 'SHADOW CLAW FORM', cue: 'phase2ClawCharge', stepsPerBeat: 1 },
    { label: 'SHADOW CLAW CUT', cue: 'phase2ClawCut', stepsPerBeat: 1 },
    { label: 'SZAGO DASH', cue: 'phase2Dash', stepsPerBeat: 1 },
    { label: 'SHADOW EYE', cue: 'phase2Eye', stepsPerBeat: 1 },
    { label: 'EYE ORB', cue: 'phase2Orb', stepsPerBeat: 2 },
    { label: 'GRID CHANNEL', cue: 'phase2GridCharge', stepsPerBeat: 1 },
    { label: 'GRID IMPACT', cue: 'phase2GridImpact', stepsPerBeat: 1 },
    { label: 'TILE MARK', cue: 'phase2TileCharge', stepsPerBeat: 1 },
    { label: 'TILE VOID', cue: 'phase2TileBreak', stepsPerBeat: 1 },
    { label: 'SWORD RING', cue: 'phase2SwordRing', stepsPerBeat: 1 },
    { label: 'SHADOW SWORD', cue: 'phase2SwordStrike', stepsPerBeat: 1 },
    { label: 'PARRY', cue: 'phase2Parry', stepsPerBeat: 1 },
    { label: 'PITFALL OPEN', cue: 'phase2Pitfall', stepsPerBeat: 1 },
    { label: 'FALLING PLANE', cue: 'phase2Plane', stepsPerBeat: 1 },
    { label: 'HEX RAM', cue: 'phase2Ram', stepsPerBeat: 1 },
    { label: 'HEX WALL', cue: 'phase2HexWall', stepsPerBeat: 1 },
    { label: 'HEX ORB', cue: 'phase2HexOrb', stepsPerBeat: 2 },
    { label: 'WHIRLPOOL', cue: 'phase2Whirlpool', stepsPerBeat: 0.5 },
  ];
  let bossMusic = null;
  let bossMusicTimer = 0;
  let bossMusicPlaying = false;
  let bossMusicLayerCount = 0;
  let phaseOnePatternsCompleted = 0;
  let bossMusicStep = 0;
  let bossMusicCycle = 0;
  let bossMusicNextNoteTime = 0;
  let bossMusicLastBpm = -1;
  let bossMusicClockTime = 0;
  let bossMusicClockBeats = 0;
  let bossMusicClockBpm = BASE_BPM;
  let fightMusicBeatCursor = null;
  let phaseOneDamageSfxStep = -1;
  let phaseOneDamageSfxCount = 0;
  let heroDamageFlashAge = Infinity;
  let heroVpFlashAge = Infinity;
  let heroVpFlashSerial = 0;
  let soundDebugHold = null;
  let combatPaused = false;
  let combatPauseButton = null;
  const bossAudioMix = { overall: 1, effects: 1, music: 1 };

  // ---- Attacks ------------------------------------------------------------
  // Every attack telegraphs first: a dark-purple outline snakes out across the
  // floor at the beat's pace, and the strike lands a beat after it finishes.
  // Attacks live in viewport space (the attack canvas) because the summoning
  // pentagrams sit outside the playfield, pinned to the cultist's body.
  const ATTACK_REST_BEATS = 1;       // beats of breathing room between attack waves
  const ATTACK_HOLD_BEATS = 0.25;    // fully-telegraphed hold before a beam fires
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
  const TENTACLE_HOLD_BEATS = 0.15;  // fully-telegraphed hold before the limb lashes
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

  // ---- X-ray cross movement ----------------------------------------------
  // An expanding purple "X" telegraphs from a point; once fully grown, a fast
  // bloody ray slams down from the sky in that same cross. The first lands dead
  // centre (on the pentagram); the next four strike the quadrants, clockwise
  // from the top-left.
  const X_ARM_WIDTH = 38;            // beam thickness in board space
  const X_ARM_BEATS = 1;             // telegraph expansion (time to read/dodge)
  const X_HOLD_BEATS = 0.35;         // hangs fully expanded, then slams down
  const X_FIRE_BEATS = 0.35;         // the strike: super fast
  const X_REST_BEATS = 0.5;
  // Positions are fractions of the frame opening; armFrac scales each arm to it.
  const X_PATTERN = [
    { fx: 0.5,  fy: 0.5,  armFrac: 0.22 }, // dead centre of the pentagram
    { fx: 0.25, fy: 0.25, armFrac: 0.22 }, // top-left quadrant
    { fx: 0.75, fy: 0.25, armFrac: 0.22 }, // top-right
    { fx: 0.75, fy: 0.75, armFrac: 0.22 }, // bottom-right
    { fx: 0.25, fy: 0.75, armFrac: 0.22 }, // bottom-left
  ];

  // ---- Blood orbit movement ----------------------------------------------
  // A four-phase finale: (0) a ray drops on the centre and splits into five
  // sky-beams that orbit clockwise outward to the edges; (1) the beams sweep
  // counter-clockwise back inward to the centre; (2) five beams trace the
  // playfield pentagram's arms; (3) a huge beam floods everything outside the
  // pentagram, leaving only the seal safe.
  const BLOOD_BEAMS = 5;
  const BLOOD_TURNS = 1.5;           // orbit revolutions over a spiral phase
  const BLOOD_BEAM_WIDTH = 16;       // sky-column thickness in board space
  const BLOOD_TELEGRAPH_BEATS = 1;   // purple warning before a spiral
  const BLOOD_HOLD_BEATS = 0.25;
  const BLOOD_FIRE_BEATS = 6;        // one half of the out-and-back spiral
  const BLOOD_LINE_FIRE_BEATS = 5;   // beams tracing the pentagram arms
  const BLOOD_LINE_DROP = 0.12;      // fraction of that spent dropping onto the tips
  const BLOOD_OUTSIDE_TELE_BEATS = 1.9; // the shadow closes in from the edges
  const BLOOD_OUTSIDE_FIRE_BEATS = 1.0; // short but huge sky impact
  const BLOOD_REST_BEATS = 1;
  const PENT_STAR_ORDER = [0, 2, 4, 1, 3]; // single-stroke five-pointed star
  const PENT_INNER_RATIO = 0.382;    // inner/outer vertex radius of a pentagram

  // ---- Checkerboard floor collapse ---------------------------------------
  // Alternating floor tiles bloom from their centres, detonate, then the
  // inverse parity immediately follows. The pair repeats three times.
  const CHECKER_COLS = 8;
  const CHECKER_ROWS = 8;
  const CHECKER_CYCLES = 3;
  const CHECKER_GROW_BEATS = 0.85;
  const CHECKER_HOLD_BEATS = 0.08;
  const CHECKER_FIRE_BEATS = 0.42;
  const CHECKER_REST_BEATS = 0;

  // ---- Small portal curved-beam barrage ----------------------------------
  const PORTAL_BARRAGE_WAVES = 1;
  const PORTAL_BARRAGE_COUNT = 18;
  const PORTAL_AIM_LEAD = 70;        // px ahead of current movement direction
  const PORTAL_CURVE_WIDTH = 32;
  const PORTAL_CURVE_OVERSHOOT = 340;
  const PORTAL_CURVE_DELAY_BEATS = 0.36;
  const PORTAL_CURVE_TELE_BEATS = 1.5;
  const PORTAL_CURVE_HOLD_BEATS = 0.12;
  const PORTAL_CURVE_FIRE_BEATS = 1.2;
  const PORTAL_CURVE_REST_BEATS = 0.2;

  // ---- Twin portal bullet curtain ----------------------------------------
  const SIDE_PORTAL_FIRE_BEATS = 10;
  const SIDE_PORTAL_TELE_BEATS = 1;
  const SIDE_PORTAL_HOLD_BEATS = 0.2;
  const SIDE_PORTAL_REST_BEATS = 0.75;
  const SIDE_PORTAL_BULLETS_PER_SIDE = 8;
  const SIDE_PORTAL_BULLET_RADIUS = 10;
  const SIDE_PORTAL_SHADOW_LEN = SIDE_PORTAL_BULLET_RADIUS * 4;

  // The fight cycles through a list of movements; each runs a fixed number of
  // waves (one wave = everything that telegraphs and fires together), and when
  // its waves are spent the next movement takes over.
  const MOVEMENT_SEQUENCE = [
    'pentagrams', 'tentacles', 'xrays', 'bloodspiral',
    'checkerboard', 'portalbarrage', 'sideportals',
  ];
  const COMBINE_WRATH = 120;         // at/above this wrath two patterns run at once
  // One movement plays at a time until wrath hits COMBINE_WRATH, then two run
  // concurrently and whichever finishes is replaced by another random pattern.
  // `activeSet` holds the 1-2 movements currently spawning. Each slot has its
  // own wave cooldown so combo partners do not block each other.
  let activeSet = [];                // [{ id, name, wave, done, nextBeat }]
  let singleQueue = [];              // upcoming single patterns (pre-combine)
  let lastSingle = null;             // avoid back-to-back single repeats across reshuffles
  let attacks = [];
  let fadingAttacks = [];
  let phase2Ritual = null;
  let phase2Avatar = null;
  let phase2AvatarStarted = false;
  let phase2LayoutAnchor = null;
  let phase2LayoutSignature = '';
  let phase2SquareArenaLocked = false;
  let phase2CombatStarted = false;
  let phase2Attacks = [];
  let phase2BurstActive = false;
  let phase2BurstSize = 1;
  let phase2BurstsAtSize = 0;
  let phase2DashZone = 'top';
  let phase2Cracks = [];
  let phase2GridSpecial = null;
  let phase2GridDebugQueued = false;
  let phase2DebugClawQueued = false;
  let phase2PlayerHits = 0;
  let phase2PostGridCycles = 0;
  let phase2ClawPatternStopped = false;
  let phase2ClawRushMode = false;
  let phase2RushEyes = [];
  let phase2RushOrbs = [];
  let phase2RushDyingEyes = [];
  let phase2RushEyesSpawned = 0;
  let phase2RushPhaseComplete = false;
  let phase2RushEyeBurstPending = false;
  let phase2RushDebugQueued = false;
  let phase2TileRuinPattern = null;
  let phase2TileRuinDebugQueued = false;
  let phase2SwordRingPattern = null;
  let phase2SwordRingDebugQueued = false;
  let phase2PitfallPattern = null;
  let phase2PitfallDebugQueued = false;
  let phase2HexDebugQueued = false;
  let phase2TowerPattern = null;
  let phase2TowerDebugQueued = false;
  let phase2DoomPattern = null;
  let phase2DoomDebugQueued = false;
  let phase2MayhemPattern = null;
  let phase2MayhemDebugQueued = false;
  let phase2SpearRainDebugQueued = false;
  let phase2ChevronDebugQueued = false;
  let phase2TrianglesDebugQueued = false;
  let phase2WaveformDebugQueued = false;
  let nextPhase2AttackBeat = Infinity;
  let nextAttackBeat = 0;            // earliest beat the next attack wave may spawn
  let nextSlotId = 1;

  // ---- Combat: wrath, HP, VP ---------------------------------------------
  // Wrath is the cultist's tempo gauge (= current BPM, 0..200). HP is the
  // hero's health, VP the virtue points earned by braving an attack's shadow.
  // Damage and VP both accrue per beat spent inside the relevant hitbox.
  const WRATH_MAX = 200;
  const HP_MAX = 1000;                // testing cap
  const VP_MAX = 50;
  // Global balance knobs. These scale all incoming damage, player healing,
  // and damage represented by the boss's wrath/entropy gauges.
  const PLAYER_DAMAGE_TAKEN_MULTIPLIER = 0.5;
  const PLAYER_HEALING_MULTIPLIER = 0.5;
  const PLAYER_DAMAGE_DEALT_MULTIPLIER = 0.5;
  const VP_GAIN_MULTIPLIER = 0.5;
  const PLAYER_ATTACK_VP_COST = VP_MAX;
  const DAMAGE_PER_BEAT = 50;        // HP lost per beat per overlapping live skill
  const VP_PER_BEAT = VP_MAX * 0.175; // VP gained per beat per overlapping shadow
  const ATTACK_WRATH_GAIN = 10;      // wrath (BPM) the cultist gains when struck
  const ATTACK_HEAL_FRAC = 0.05;     // fraction of max HP the hero recovers on a strike
  const ENTROPY_MAX = 1000;
  const PHASE2_BPM_MIN = 150;
  const PHASE2_BPM_MAX = 250;
  const ENTROPY_PER_STRIKE = 50;
  const PHASE2_CRACK_BEATS = 5;
  const PHASE2_CRACK_CLOSE_MS = 420;
  const PHASE2_CLAW_TELEGRAPH_BEATS = 2.15;
  const PHASE2_CLAW_HOLD_BEATS = 0.58;
  const PHASE2_CLAW_FIRE_BEATS = 0.42;
  const PHASE2_CLAW_REST_BEATS = 1;
  const PHASE2_CLAW_RUSH_TIME_SCALE = 0.62;
  const PHASE2_CLAW_RUSH_TRAVEL_SCALE = 3.2;
  const PHASE2_CLAW_RUSH_WIDTH_SCALE = 0.62;
  const PHASE2_CLAW_RUSH_REACH_EXPONENT = 2.35;
  const PHASE2_CLAW_RUSH_HOLD_SCALE = 1.5;
  const PHASE2_RUSH_EYE_COUNT = 6;
  const PHASE2_RUSH_EYE_SPAWN_ORDER = [0, 3, 1, 4, 2, 5];
  const PHASE2_RUSH_EYE_FIRE_BEATS = 6;
  const PHASE2_RUSH_ORB_SPEED_PER_BEAT = 40;
  const PHASE2_RUSH_ORB_RADIUS = 5.625;
  const PHASE2_RUSH_ORB_SHADOW_RADIUS = 42;
  const PHASE2_RUSH_ORB_DAMAGE = 37.5;
  const PHASE2_TOWER_ENTRY_SLAM_MS = 1120;
  const PHASE2_TOWER_EXPAND_MS = 760;
  const PHASE2_TOWER_BOSS_DASH_MS = 520;
  const PHASE2_TOWER_WORLD_H = 20000;
  const PHASE2_TOWER_G = 1800;
  const PHASE2_TOWER_VCAP = 1060;
  const PHASE2_TOWER_DRAG_K = 3.4;
  const PHASE2_TOWER_MIN_DRAG = 18;
  const PHASE2_TOWER_PLAYER_W = 22;
  const PHASE2_TOWER_PLAYER_H = 30;
  const PHASE2_TOWER_SIDE_CHANNEL = Math.ceil(PHASE2_TOWER_PLAYER_W * 1.5);
  const PHASE2_TOWER_PLATFORM_H = 12;
  const PHASE2_TOWER_ARROW_MAX = 50;
  const PHASE2_TOWER_FLAME_RISE_PER_BEAT = 22;
  const PHASE2_TOWER_FLAME_BPM_SCALE = 0.5;
  const PHASE2_TOWER_FLAME_DAMAGE = 90;
  const PHASE2_TOWER_EMBERS_PER_BEAT = 7.2;
  const PHASE2_TOWER_EMBER_MIN_SPEED = 135;
  const PHASE2_TOWER_EMBER_SPEED_RANGE = 90;
  const PHASE2_TOWER_EMBER_MIN_RADIUS = 7;
  const PHASE2_TOWER_EMBER_RADIUS_RANGE = 5;
  const PHASE2_TOWER_EMBER_VP_SCALE = 0.5;
  const PHASE2_TOWER_PIXELS_PER_METER = 40;
  const PHASE2_TOWER_GOAL_METERS = 100;
  const PHASE2_DOOM_ENTRY_SLAM_MS = 1050;
  const PHASE2_DOOM_RESHAPE_MS = 720;
  const PHASE2_DOOM_NOTE_LIMIT = 50;
  const PHASE2_DOOM_END_CENTER_MS = 620;
  const PHASE2_DOOM_END_EXPAND_MS = 760;
  const PHASE2_DOOM_APPROACH_BEATS = 3;
  const PHASE2_DOOM_NOTE_BEATS = 2;
  const PHASE2_DOOM_PERFECT_MS = 90;
  const PHASE2_DOOM_GREAT_MS = 180;
  const PHASE2_DOOM_OK_MS = 280;
  const PHASE2_DOOM_HOP_MS = 180;
  const PHASE2_DOOM_SLASH_MS = 300;
  const PHASE2_DOOM_PUNISH_DAMAGE = 100;
  const PHASE2_DOOM_DEBRIS_DAMAGE = 20;
  const PHASE2_DOOM_PUNISH_VP = VP_MAX * 0.15;
  const PHASE2_DOOM_PERFECT_VP = VP_MAX * 0.10;
  const PHASE2_MAYHEM_HUB_FORM_MS = 1000;
  const PHASE2_MAYHEM_BLADE_FORM_MS = 480;
  const PHASE2_MAYHEM_TWO_BLADE_MS = 5000;
  const PHASE2_MAYHEM_FOUR_BLADE_MS = 5000;
  const PHASE2_MAYHEM_BLADE_LENGTH = 134;
  const PHASE2_MAYHEM_BLADE_DAMAGE_SCALE = 2;
  const PHASE2_MAYHEM_BLADE_HALF_WIDTH = 7;
  const PHASE2_MAYHEM_BLADE_SWEEP = 0.28;
  const PHASE2_MAYHEM_SHADOW_LEAD = 0.17;
  const PHASE2_MAYHEM_SHADOW_HALF_WIDTH = 13;
  const PHASE2_MAYHEM_BLADE_OFFSETS = [0, Math.PI, Math.PI / 2, Math.PI * 1.5];
  const PHASE2_MAYHEM_ORBIT_RADIANS_PER_BEAT = 0.09;
  const PHASE2_MAYHEM_FAN_ORBIT_MS = 10000;
  const PHASE2_MAYHEM_FADE_MS = 760;
  const PHASE2_MAYHEM_HUB_RADIUS = 17;
  const PHASE2_MAYHEM_SPEAR_SPEED_PER_BEAT = 138.75;
  const PHASE2_MAYHEM_SPEAR_SHOT_GAP_MS = 500;
  const PHASE2_MAYHEM_SPEAR_WAVE_REST_BEATS = 0.6;
  const PHASE2_MAYHEM_SPEAR_TRAIL_LENGTH = 360;
  const PHASE2_MAYHEM_SPEAR_TRAIL_HALF_WIDTH = 3.5;
  const PHASE2_MAYHEM_SPEAR_BODY_RADIUS = 7;
  const PHASE2_MAYHEM_SPEAR_SPREAD_RADIANS = 0.13;
  const PHASE2_MAYHEM_SPEAR_SHADOW_POLYGON = [
    { x: 24, y: 0 },
    { x: 5, y: -20 },
    { x: -35, y: -20 },
    { x: -35, y: 20 },
    { x: 5, y: 20 },
  ];
  const PHASE2_MAYHEM_SPEAR_MAX_BOUNCES = 4;
  const PHASE2_MAYHEM_SPEAR_DAMAGE = 100;
  const PHASE2_MAYHEM_COLUMN_WAVE_BEATS = 2.5;
  const PHASE2_MAYHEM_COLUMN_SPEED_PER_BEAT = 85;
  const PHASE2_MAYHEM_COLUMN_CHEVRON_HEIGHT = 58;
  const PHASE2_MAYHEM_COLUMN_CHEVRON_HALF_WIDTH = 9;
  const PHASE2_MAYHEM_COLUMN_SHADOW_HALF_WIDTH = 26;
  const PHASE2_MAYHEM_COLUMN_SHADOW_LEAD = 20;
  const PHASE2_MAYHEM_COLUMN_LEAD_BEATS = 0.75;
  const PHASE2_MAYHEM_COLUMN_HALF_WAVES = 10;
  const PHASE2_MAYHEM_COLUMN_BRAKE_BEATS = 1.5;
  const PHASE2_MAYHEM_COLUMN_ROTATE_BEATS = 0.8;
  const PHASE2_MAYHEM_COLUMN_RESTART_BEATS = 0.8;
  const PHASE2_MAYHEM_TRIANGLE_TELEGRAPH_BEATS = 2;
  const PHASE2_MAYHEM_TRIANGLE_GAP_BEATS = 0.15;
  const PHASE2_MAYHEM_TRIANGLE_MEMORY_GAP_BEATS = 0.5;
  const PHASE2_MAYHEM_TRIANGLE_IMPACT_GRACE_BEATS = 1;
  const PHASE2_MAYHEM_TRIANGLE_STRIKE_BEATS = 0.9;
  const PHASE2_MAYHEM_TRIANGLE_FADE_BEATS = 0.45;
  const PHASE2_MAYHEM_TRIANGLE_SINGLE_COUNT = 10;
  const PHASE2_MAYHEM_TRIANGLE_MAX_SEQUENCE = 6;
  const PHASE2_MAYHEM_TRIANGLE_VP_EDGE_WIDTH = 6;
  const PHASE2_MAYHEM_WAVEFORM_PREVIEW_MS = 2000;
  const PHASE2_MAYHEM_WAVEFORM_DURATION_BEATS = 32;
  const PHASE2_MAYHEM_WAVEFORM_POINTS = 96;
  const PHASE2_MAYHEM_WAVEFORM_EDGE_INSET = 7;
  const PHASE2_MAYHEM_WAVEFORM_FLOW_BEATS = 14;
  const PHASE2_MAYHEM_WAVEFORM_PULSE_WIDTH = 0.085;
  const PHASE2_MAYHEM_WAVEFORM_BAR_GAP = 45;
  const PHASE2_MAYHEM_WAVEFORM_BAR_MIN_HALF_HEIGHT = 7;
  const PHASE2_MAYHEM_WAVEFORM_LIVE_HALF_WIDTH = 3;
  const PHASE2_MAYHEM_WAVEFORM_SHADOW_HALF_WIDTH = 4;
  const PHASE2_MAYHEM_WAVEFORM_BAR_SPACING = PHASE2_MAYHEM_WAVEFORM_BAR_GAP +
    PHASE2_MAYHEM_WAVEFORM_SHADOW_HALF_WIDTH * 2;
  const PHASE2_MAYHEM_WAVEFORM_SCROLL_BARS_PER_BEAT = 0.3;
  const PHASE2_MAYHEM_UNDER_PATTERNS = [
    'quadrantFans',
    'spearRain',
    'columnSurge',
    'giantTriangles',
    'audioWaveform',
  ];
  const PHASE2_GRID_CHANNEL_BEATS = 3;
  const PHASE2_GRID_RECALL_MS = 460;
  const PHASE2_GRID_IMPACT_MS = 220;
  const PHASE2_GRID_HOP_MS = 115;
  const PHASE2_TILE_RUIN_TELEGRAPH_BEATS = 1.7;
  const PHASE2_TILE_RUIN_FIRE_BEATS = 0.75;
  const PHASE2_TILE_RUIN_REST_BEATS = 0.65;
  const PHASE2_VOID_EJECT_DAMAGE = 80;
  const PHASE2_FINAL_TILE_MOVE_MS = 760;
  const PHASE2_SWORD_RING_FORM_MS = 460;
  const PHASE2_SWORD_FLASH_MS = 300;
  const PHASE2_SWORD_STRIKE_MS = 760;
  const PHASE2_SWORD_PARRY_FLASH_MS = 200;
  const PHASE2_SWORD_IMPACT_MS = 190;
  const PHASE2_SWORD_NEXT_MS = 280;
  const PHASE2_SWORD_DOUBLE_GAP_MS = 80;
  const PHASE2_SWORD_RESPAWN_DELAY_MS = 430;
  const PHASE2_SWORD_RESPAWN_FORM_MS = 180;
  const PHASE2_SWORD_RING_DAMAGE = 100;
  const PHASE2_SWORD_PARRY_HEAL = 10;
  const PHASE2_SWORD_PARRY_VP = VP_MAX * 0.05;
  const PHASE2_SWORD_FINAL_PARRIES = 20;
  const PHASE2_BOSS_SLAM_MS = 1200;
  const PHASE2_BOSS_RETURN_DASH_MS = 430;
  const PHASE2_BOSS_SLAM_DAMAGE = 60;
  const PHASE2_PITFALL_ENTRY_MS = 900;
  const PHASE2_PITFALL_TRAVEL_BEATS = 4.8;
  const PHASE2_PITFALL_SPAWN_BEATS = 2.15;
  const PHASE2_PITFALL_HIT_DEPTH = 0.78;
  const PHASE2_PITFALL_MOVE_SCALE = 0.30;
  const PHASE2_PITFALL_TIME_SCALE = 0.75;
  const PHASE2_PITFALL_APPROACH_SCALE = 1.20;
  const PHASE2_PITFALL_DAMAGE = 85;
  const PHASE2_PITFALL_DODGES_TO_HEX = 20;
  const PHASE2_HEX_RAM_MS = 1050;
  const PHASE2_HEX_BOTTOM_PADDING = 5;
  const PHASE2_HEX_BAR_LIFT = 18;
  const PHASE2_HEX_CRATER_RADIUS = 21;
  const PHASE2_HEX_ORBIT_RADIUS = 50;
  const PHASE2_HEX_ANGULAR_SPEED = 0.0035;
  const PHASE2_HEX_WALL_TRAVEL_BEATS = 6.75;
  const PHASE2_HEX_WALL_SPAWN_BEATS = 2.35;
  const PHASE2_HEX_SPLIT_FOLLOWUP_BEATS = 1.15;
  const PHASE2_HEX_WALL_THICKNESS = 21;
  const PHASE2_HEX_WALL_SHADOW_SCALE = 1.5;
  const PHASE2_HEX_WALL_GAP = 1.16;
  const PHASE2_HEX_WALL_DAMAGE = 50;
  const PHASE2_HEX_BULLET_SLOTS = 8;
  const PHASE2_HEX_SPIRAL_SLOTS = 3;
  const PHASE2_HEX_SPIRAL_WALL_COUNT = 7;
  const PHASE2_HEX_CORRIDOR_SLOTS = 2;
  const PHASE2_HEX_ORB_TRAVEL_BEATS = 7;
  const PHASE2_HEX_ORB_LANES = 6;
  const PHASE2_HEX_ORB_WAVES = 8;
  const PHASE2_HEX_ORB_RADIUS = 12;
  const PHASE2_HEX_ORB_SHADOW_LENGTH = 2;
  const PHASE2_HEX_ORB_DAMAGE = 32;
  const PHASE2_HEX_ORB_VP_SCALE = 0.75;
  const PHASE2_HEX_CORRIDOR_CONTROL_COUNT = 8;
  const PHASE2_HEX_CORRIDOR_TURNS = 3;
  const PHASE2_HEX_CORRIDOR_RAILS = 5;
  const PHASE2_HEX_CORRIDOR_LENGTH_SCALE = 1.5;
  const PHASE2_HEX_CORRIDOR_WALL_ANGLE = 2 * Math.atan2(
    PHASE2_HEX_WALL_THICKNESS / 2,
    PHASE2_HEX_ORBIT_RADIUS
  );
  const PHASE2_HEX_CORRIDOR_TURN = 0.38;
  const PHASE2_HEX_CORRIDOR_SHADOW_WIDTH = 6;
  const PHASE2_HEX_ZIGZAG_SLOTS = 4;
  const PHASE2_HEX_WHIRLPOOL_CAST_BEATS = 2.5;
  const PHASE2_HEX_WHIRLPOOL_SWITCH_BEATS = 2.4;
  const PHASE2_HEX_WHIRLPOOL_SPEED_DELTA = 0.25;
  const PHASE2_HEX_VP_CONTACT_PADDING = 0.75;
  const DEATH_SLOW_MS = 900;
  const DEATH_FADE_START = 90;
  const DEATH_FADE_END = 1080;
  const DEATH_CUT_START = 1080;
  const DEATH_CUT_IMPACT = 1480;
  const DEATH_BLACKOUT = 1610;
  const DEATH_CRACK_START = 1770;
  const DEATH_CRACK_FORM_MS = 760;
  const DEATH_PERSIST_AT = 2380;
  const DEATH_REVIVE_MS = 680;
  const PHASE2_SWORD_DIRECTIONS = [
    { x: 0, y: -1 },
    { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
    { x: 1, y: 0 },
    { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    { x: 0, y: 1 },
    { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
    { x: -1, y: 0 },
    { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  ];
  // The strike flourish: time crawls while an angelic sword is cast at the boss.
  const STRIKE_DURATION = 1150;      // ms (real time) of the whole sequence
  const STRIKE_IMPACT_AT = STRIKE_DURATION * 0.82;
  const STRIKE_SLOW = 0.05;          // gameplay speed at the deepest slow-mo
  const FINAL_STRIKE_DURATION = 1900; // extra hitstop before the phase-two fall
  const HERO_DAMAGE_FLASH_MS = 170;
  const HERO_DAMAGE_FLASH_INTERVAL_MS = 1000 / 10;
  const HERO_VP_FLASH_MS = 168;
  const HERO_VP_FLASH_INTERVAL_MS = 1000 / 10;
  let hp = HP_MAX;
  let vp = 0;
  let entropy = 0;
  let dead = false;
  let deathSequence = null;
  let strike = null;                 // active strike animation, or null
  let wrathFill = null, wrathValue = null, wrathTrack = null, wrathName = null;
  let hpFill = null, vpFill = null, vpBar = null;
  let deathScreen = null;

  const easeInQuad = (t) => t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const smoothstep = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
  const clamp01 = (t) => Math.max(0, Math.min(1, t));

  function setCombatBpm(nextBpm, preserveBeatPhase = true) {
    const normalizedBpm = Math.max(1, Number(nextBpm) || 1);
    if (Math.abs(normalizedBpm - bpm) < 0.000001) return false;
    const previousBeatMs = Math.max(1, beatMs);
    const phaseFraction = clamp01((beatPhase % previousBeatMs) / previousBeatMs);
    bpm = normalizedBpm;
    beatMs = 60000 / bpm;
    if (preserveBeatPhase) beatPhase = phaseFraction * beatMs;
    return true;
  }

  function triggerHeroDamageFlash() {
    if (heroDamageFlashAge < HERO_DAMAGE_FLASH_INTERVAL_MS) return;
    heroDamageFlashAge = 0;
  }

  function triggerHeroVpFlash() {
    if (heroVpFlashAge < HERO_VP_FLASH_INTERVAL_MS) return;
    heroVpFlashSerial++;
    heroVpFlashAge = 0;
    playBossSfx('vp', {
      progress: vp / VP_MAX,
    });
  }

  function damagePlayer(amount) {
    const scaledAmount = Math.max(0, amount) * PLAYER_DAMAGE_TAKEN_MULTIPLIER;
    if (scaledAmount <= 0 || hp <= 0) return 0;
    const before = hp;
    hp = Math.max(0, hp - scaledAmount);
    if (hp < before) triggerHeroDamageFlash();
    return before - hp;
  }

  function healPlayer(amount) {
    const before = hp;
    hp = Math.min(HP_MAX, hp + Math.max(0, amount) * PLAYER_HEALING_MULTIPLIER);
    return hp - before;
  }

  function damageEnemy(amount) {
    return Math.max(0, amount) * PLAYER_DAMAGE_DEALT_MULTIPLIER;
  }

  function addVp(amount, fromShadow = false) {
    const before = vp;
    vp = Math.min(VP_MAX, vp + Math.max(0, amount) * VP_GAIN_MULTIPLIER);
    if (fromShadow && vp > before) triggerHeroVpFlash();
    if (before < PLAYER_ATTACK_VP_COST && vp >= PLAYER_ATTACK_VP_COST) playBossSfx('vpFull');
    return vp - before;
  }

  function updateHeroCombatFeedback(dt) {
    heroDamageFlashAge += dt;
    heroVpFlashAge += dt;
  }

  function resetHeroCombatFeedback() {
    heroDamageFlashAge = Infinity;
    heroVpFlashAge = Infinity;
    heroVpFlashSerial = 0;
  }
  const shockwaveArenaProgress = (t) => {
    t = clamp01(t);
    if (t < 0.16) return easeOutCubic(t / 0.16) * 0.58;
    if (t < 0.38) return 0.58 + easeOutCubic((t - 0.16) / 0.22) * 0.26;
    return 0.84 + smoothstep((t - 0.38) / 0.62) * 0.16;
  };
  const phaseTwoArenaProgress = () => phase === PHASE.SECOND
    ? smoothstep(phaseTime / PHASE2_ARENA_TRANSITION)
    : 0;
  const phaseTwoRitualTime = () => Math.max(0, phaseTime - PHASE2_ARENA_TRANSITION);

  function ensurePhaseTwoAvatar() {
    if (!phase2Avatar && window.AetherBoss2DPhase2 && window.AetherBoss2DPhase2.create) {
      phase2Avatar = window.AetherBoss2DPhase2.create({ avatarSrc: AVATAR_SHADOW_SRC });
    }
    return phase2Avatar;
  }

  function resetPhaseTwoLayout() {
    if (!overlay) return;
    phase2SquareArenaLocked = false;
    overlay.classList.remove('hex-arena-active');
    overlay.classList.remove('tower-climb-active');
    overlay.classList.remove('avatar-phase-two');
    overlay.style.removeProperty('--phase2-stage-w');
    overlay.style.removeProperty('--phase2-stage-h');
    overlay.style.removeProperty('--phase2-vbar-h');
    overlay.style.removeProperty('--phase2-row-left');
    overlay.style.removeProperty('--phase2-row-top');
    overlay.style.removeProperty('--phase2-wrath-top');
    overlay.style.removeProperty('--tower-ui-left');
    overlay.style.removeProperty('--tower-ui-width');
    overlay.style.removeProperty('--tower-ui-top');
    phase2LayoutAnchor = null;
    phase2LayoutSignature = '';
    const help = overlay.querySelector('.aether-boss2d-help');
    if (help && help.firstChild) help.firstChild.nodeValue = 'WASD / ARROWS MOVE';
    if (canvas && (canvas.width !== BOARD || canvas.height !== BOARD)) {
      canvas.width = BOARD;
      canvas.height = BOARD;
      ctx.imageSmoothingEnabled = false;
      frameBoardRect = null;
    }
  }

  function updatePhaseTwoLayout(progress) {
    if (!overlay || !canvas) return;
    const p = shockwaveArenaProgress(progress);
    const board = getBoardRect();
    const anchor = phase2LayoutAnchor || {
      left: board.left - 38,
      top: board.top,
      stageTop: board.top,
      centerX: board.left + board.width / 2,
    };
    const centerX = Number.isFinite(anchor.centerX) ? anchor.centerX : anchor.left + 38 + BOARD / 2;
    const targetW = Math.max(500, Math.max(BOARD / 2, Math.min(centerX - 52, window.innerWidth - centerX - 52)) * 2);
    const targetH = Math.max(500, BOARD + Math.max(0, (Number.isFinite(anchor.stageTop) ? anchor.stageTop : anchor.top) - 72));
    const w = 500 + (targetW - 500) * p;
    const h = 500 + (targetH - 500) * p;
    const pixelW = Math.max(1, Math.round(w / 16) * 16);
    const pixelH = Math.max(1, Math.round(h / 16) * 16);
    const heightDelta = pixelH - BOARD;
    const rowLeft = anchor.left - (pixelW - BOARD) / 2;
    const rowTop = anchor.top - heightDelta;
    const stageTop = (Number.isFinite(anchor.stageTop) ? anchor.stageTop : anchor.top) - heightDelta;
    const wrathTop = Math.max(14, stageTop - 48);
    const layoutSignature = [
      pixelW, pixelH, rowLeft.toFixed(1), rowTop.toFixed(1), wrathTop.toFixed(1), p.toFixed(4),
    ].join('|');
    if (layoutSignature === phase2LayoutSignature && canvas.width === pixelW && canvas.height === pixelH) return;
    phase2LayoutSignature = layoutSignature;
    const localHero = worldToArena(hero.x, hero.y);
    const setLayoutVar = (name, value) => {
      if (overlay.style.getPropertyValue(name) !== value) overlay.style.setProperty(name, value);
    };
    setLayoutVar('--phase2-row-left', rowLeft.toFixed(1) + 'px');
    setLayoutVar('--phase2-row-top', rowTop.toFixed(1) + 'px');
    setLayoutVar('--phase2-wrath-top', wrathTop.toFixed(1) + 'px');
    setLayoutVar('--phase2-stage-w', pixelW + 'px');
    setLayoutVar('--phase2-stage-h', pixelH + 'px');
    setLayoutVar('--phase2-vbar-h', pixelH + 'px');
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
      ctx.imageSmoothingEnabled = false;
      frameBoardRect = null;
    }
    Object.assign(arena, {
      x: pixelW / 2,
      y: pixelH / 2,
      width: pixelW,
      height: pixelH,
      rotation: 0,
      shape: 'rect',
      from: null,
      target: null,
      transitionTime: 0,
      transitionDuration: 0,
    });
    const worldHero = arenaToWorld(localHero.x, localHero.y);
    hero.x = worldHero.x;
    hero.y = worldHero.y;
  }

  function restorePhaseTwoSquareArena(force) {
    if (!overlay || !canvas || (phase2SquareArenaLocked && !force)) return;
    phase2SquareArenaLocked = true;
    phase2TowerPattern = null;
    phase2DoomPattern = null;
    phase2MayhemPattern = null;
    overlay.classList.remove('hex-arena-active');
    overlay.classList.remove('tower-climb-active');
    const help = overlay.querySelector('.aether-boss2d-help');
    if (help && help.firstChild) help.firstChild.nodeValue = 'WASD / ARROWS MOVE';
    phase2GridSpecial = null;
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2Cracks = [];
    phase2CrackCacheDirty = true;

    const side = BOARD;
    const anchor = phase2LayoutAnchor || {
      left: getBoardRect().left - 38,
      top: getBoardRect().top,
      stageTop: getBoardRect().top,
      centerX: getBoardRect().left + getBoardRect().width / 2,
    };
    const rowLeft = anchor.left - (side - BOARD) / 2;
    const rowTop = anchor.top - (side - BOARD);
    const stageTop = anchor.stageTop - (side - BOARD);
    overlay.style.setProperty('--phase2-row-left', rowLeft.toFixed(1) + 'px');
    overlay.style.setProperty('--phase2-row-top', rowTop.toFixed(1) + 'px');
    overlay.style.setProperty('--phase2-wrath-top', Math.max(14, stageTop - 48).toFixed(1) + 'px');
    overlay.style.setProperty('--phase2-stage-w', side + 'px');
    overlay.style.setProperty('--phase2-stage-h', side + 'px');
    overlay.style.setProperty('--phase2-vbar-h', side + 'px');
    phase2LayoutSignature = 'square|' + side;
    if (canvas.width !== side || canvas.height !== side) {
      canvas.width = side;
      canvas.height = side;
      ctx.imageSmoothingEnabled = false;
      frameBoardRect = null;
    }
    Object.assign(arena, {
      x: side / 2,
      y: side / 2,
      width: side,
      height: side,
      rotation: 0,
      shape: 'rect',
      from: null,
      target: null,
      transitionTime: 0,
      transitionDuration: 0,
    });
    hero.x = side / 2;
    hero.y = side / 2;
  }

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

  function buildCalcifiedBorder() {
    calcifiedBorderCanvas = document.createElement('canvas');
    calcifiedBorderCanvas.width = BOARD;
    calcifiedBorderCanvas.height = BOARD;
    const bctx = calcifiedBorderCanvas.getContext('2d');
    const random = mulberry32(0xc41c1f);

    bctx.fillStyle = '#9f9d91';
    bctx.fillRect(0, 0, BOARD, BOARD);
    bctx.clearRect(BORDER, BORDER, BOARD - BORDER * 2, BOARD - BORDER * 2);

    const inBand = (x, y) =>
      x < BORDER || y < BORDER || x >= BOARD - BORDER || y >= BOARD - BORDER;

    const flecks = [
      { color: 'rgba(42, 42, 39, 0.42)', count: 2600, size: () => 1 + (random() * 2 | 0) },
      { color: 'rgba(218, 216, 202, 0.36)', count: 1200, size: () => 1 },
      { color: 'rgba(112, 110, 103, 0.55)', count: 1100, size: () => 1 + (random() * 2 | 0) },
      { color: 'rgba(24, 24, 22, 0.28)', count: 520, size: () => 2 + (random() * 4 | 0) },
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

    // Dry calcified seams crossing the frame, especially around the inner lip.
    bctx.lineCap = 'square';
    for (let i = 0; i < 92; i++) {
      const edge = random();
      let x = random() * BOARD;
      let y = random() * BOARD;
      if (edge < 0.25) y = BORDER * (0.3 + random() * 0.6);
      else if (edge < 0.5) y = BOARD - BORDER * (0.3 + random() * 0.6);
      else if (edge < 0.75) x = BORDER * (0.3 + random() * 0.6);
      else x = BOARD - BORDER * (0.3 + random() * 0.6);
      const len = 10 + random() * 38;
      const angle = (edge < 0.5 ? 0 : Math.PI / 2) + (random() - 0.5) * 0.75;
      bctx.strokeStyle = random() < 0.62 ? 'rgba(36, 36, 33, 0.52)' : 'rgba(224, 222, 206, 0.28)';
      bctx.lineWidth = random() < 0.72 ? 1 : 2;
      bctx.beginPath();
      bctx.moveTo(x, y);
      bctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      bctx.stroke();
    }

    // Longer branching cracks so the border reads as brittle calcified matter.
    for (let i = 0; i < 20; i++) {
      const edge = random();
      let x, y;
      if (edge < 0.25) { x = random() * BOARD; y = random() * BORDER; }
      else if (edge < 0.5) { x = random() * BOARD; y = BOARD - random() * BORDER; }
      else if (edge < 0.75) { x = random() * BORDER; y = random() * BOARD; }
      else { x = BOARD - random() * BORDER; y = random() * BOARD; }
      let angle = (edge < 0.5 ? Math.PI / 2 : 0) + (random() - 0.5) * 1.1;
      bctx.strokeStyle = 'rgba(25, 25, 23, 0.62)';
      bctx.lineWidth = random() < 0.7 ? 1 : 2;
      bctx.beginPath();
      bctx.moveTo(x, y);
      const steps = 3 + (random() * 4 | 0);
      for (let k = 0; k < steps; k++) {
        const len = 8 + random() * 22;
        x += Math.cos(angle) * len;
        y += Math.sin(angle) * len;
        bctx.lineTo(x, y);
        if (random() < 0.34) {
          const branch = angle + (random() < 0.5 ? -1 : 1) * (0.55 + random() * 0.45);
          bctx.moveTo(x, y);
          bctx.lineTo(x + Math.cos(branch) * (5 + random() * 12), y + Math.sin(branch) * (5 + random() * 12));
          bctx.moveTo(x, y);
        }
        angle += (random() - 0.5) * 0.8;
      }
      bctx.stroke();
    }

    bctx.strokeStyle = 'rgba(22, 22, 20, 0.7)';
    bctx.lineWidth = 2;
    bctx.strokeRect(1, 1, BOARD - 2, BOARD - 2);
    bctx.strokeStyle = 'rgba(218, 216, 202, 0.64)';
    bctx.lineWidth = 1;
    bctx.strokeRect(BORDER - 0.5, BORDER - 0.5, BOARD - BORDER * 2 + 1, BOARD - BORDER * 2 + 1);
  }

  function buildCobbledFloor() {
    cobbledFloorCanvas = document.createElement('canvas');
    cobbledFloorCanvas.width = BOARD;
    cobbledFloorCanvas.height = BOARD;
    cobbledFloorPattern = null;
    const fctx = cobbledFloorCanvas.getContext('2d');
    const random = mulberry32(0xc0bb1e);

    fctx.fillStyle = '#171818';
    fctx.fillRect(0, 0, BOARD, BOARD);

    // Crunchy square-pixel stone grain: no rounded stones, just rough value
    // blocks and broken mortar hints.
    for (let y = 0; y < BOARD; y += 4) {
      for (let x = 0; x < BOARD; x += 4) {
        const n = random();
        const tone = n < 0.12 ? 12 : n < 0.42 ? 20 : n < 0.78 ? 28 : 40;
        fctx.fillStyle = 'rgba(' + tone + ', ' + (tone + 1) + ', ' + (tone + 1) + ', 0.62)';
        fctx.fillRect(x, y, 4, 4);
      }
    }

    fctx.strokeStyle = 'rgba(6, 6, 6, 0.42)';
    fctx.lineWidth = 1;
    for (let y = 18; y < BOARD; y += 28 + (random() * 12 | 0)) {
      fctx.beginPath();
      for (let x = 0; x <= BOARD; x += 12) {
        const yy = y + ((random() - 0.5) * 4 | 0);
        if (x === 0) fctx.moveTo(x, yy); else fctx.lineTo(x, yy);
      }
      fctx.stroke();
    }
    for (let x = 20; x < BOARD; x += 30 + (random() * 14 | 0)) {
      fctx.beginPath();
      for (let y = 0; y <= BOARD; y += 12) {
        const xx = x + ((random() - 0.5) * 4 | 0);
        if (y === 0) fctx.moveTo(xx, y); else fctx.lineTo(xx, y);
      }
      fctx.stroke();
    }

    const chips = [
      { color: 'rgba(64, 65, 62, 0.34)', count: 620, max: 10 },
      { color: 'rgba(4, 4, 4, 0.33)', count: 520, max: 8 },
      { color: 'rgba(108, 108, 100, 0.16)', count: 240, max: 7 },
    ];
    for (const chip of chips) {
      fctx.fillStyle = chip.color;
      for (let i = 0; i < chip.count; i++) {
        const x = (random() * BOARD) | 0;
        const y = (random() * BOARD) | 0;
        const w = 1 + (random() * chip.max | 0);
        const h = 1 + (random() * 4 | 0);
        fctx.fillRect(x, y, w, h);
      }
    }

    fctx.strokeStyle = 'rgba(3, 3, 3, 0.5)';
    fctx.lineWidth = 1;
    for (let i = 0; i < 36; i++) {
      let x = random() * BOARD;
      let y = random() * BOARD;
      let angle = random() * Math.PI * 2;
      fctx.beginPath();
      fctx.moveTo(x, y);
      const steps = 2 + (random() * 5 | 0);
      for (let k = 0; k < steps; k++) {
        x += Math.cos(angle) * (5 + random() * 18);
        y += Math.sin(angle) * (5 + random() * 18);
        fctx.lineTo(x, y);
        angle += (random() - 0.5) * 0.9;
      }
      fctx.stroke();
    }

    fctx.fillStyle = 'rgba(255, 255, 240, 0.045)';
    for (let i = 0; i < 2200; i++) {
      fctx.fillRect(random() * BOARD | 0, random() * BOARD | 0, 1, 1);
    }

    const vignette = fctx.createRadialGradient(ARENA_CX, ARENA_CY, 120, ARENA_CX, ARENA_CY, 360);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.44)');
    fctx.fillStyle = vignette;
    fctx.fillRect(0, 0, BOARD, BOARD);
  }

  // ---- DOM / overlay -----------------------------------------------------
  function setSoundDebugOverlayOpen(open) {
    if (!soundDebugOverlay) return;
    soundDebugOverlay.classList.toggle('hidden', !open);
    if (!open) stopSoundDebugHold();
    const toggle = overlay && overlay.querySelector('.aether-boss2d-sound-debug-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

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
      '<button id="aether-boss2d-sound-debug-toggle" class="aether-boss2d-debug-btn aether-boss2d-sound-debug-toggle" type="button">SFX TEST</button>' +
      '<div id="aether-boss2d-sound-debug-overlay" class="aether-boss2d-sound-debug-overlay hidden" role="dialog" aria-modal="true" aria-label="Sound test utility">' +
        '<div class="aether-boss2d-sound-debug-window">' +
          '<div class="aether-boss2d-sound-debug-header"><span>SOUND TEST UTILITY</span>' +
            '<button class="aether-boss2d-debug-btn aether-boss2d-sound-debug-close" type="button">CLOSE</button>' +
          '</div>' +
          '<div id="aether-boss2d-sound-debug" class="aether-boss2d-sound-debug"></div>' +
        '</div>' +
      '</div>' +
      '<div id="aether-boss2d-audio-mix" class="aether-boss2d-audio-mix"></div>' +
      // The boss is two stacked layers so the kneel->stand swap can crossfade
      // and rise, and so the standing form can float and pixel-jitter on top.
      '<div id="aether-boss2d-cultist" class="aether-boss2d-cultist">' +
        '<img class="aether-boss2d-cultist-kneel" alt="" src="' + CULTIST_KNEEL_SRC + '" />' +
        '<div class="aether-boss2d-cultist-stand-wrap">' +
          '<img class="aether-boss2d-cultist-stand" alt="" src="' + CULTIST_STAND_SRC + '" />' +
        '</div>' +
        '<img class="aether-boss2d-cultist-fallen" alt="" src="' + CULTIST_FALLEN_SRC + '" />' +
      '</div>' +
      // The cultist's name + wrath gauge, slotted under her feet.
      '<div class="aether-boss2d-wrath">' +
        '<div class="aether-boss2d-wrath-name">THE SHADOW CULTIST</div>' +
        '<div class="aether-boss2d-wrath-track">' +
          '<div class="aether-boss2d-wrath-fill"></div>' +
          '<span class="aether-boss2d-wrath-value">WRATH 0</span>' +
        '</div>' +
      '</div>' +
      // The combat window flanked by the player's VP (left) and HP (right) bars.
      '<div class="aether-boss2d-stage-row">' +
        '<div class="aether-boss2d-vbar aether-boss2d-vp">' +
          '<span class="aether-boss2d-vbar-label">VP</span>' +
          '<div class="aether-boss2d-vbar-track">' +
            '<div class="aether-boss2d-vbar-fill"></div>' +
            '<span class="aether-boss2d-vp-ready">ATTACK READY</span>' +
          '</div>' +
        '</div>' +
        '<div class="aether-boss2d-stage">' +
          '<canvas id="aether-boss2d-canvas" width="' + BOARD + '" height="' + BOARD + '"></canvas>' +
        '</div>' +
        '<div class="aether-boss2d-vbar aether-boss2d-hp">' +
          '<span class="aether-boss2d-vbar-label">HP</span>' +
          '<div class="aether-boss2d-vbar-track"><div class="aether-boss2d-vbar-fill"></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="aether-boss2d-help">WASD / ARROWS MOVE' +
        '<span class="aether-boss2d-status">ENTER SKIP INTRO &nbsp; F / SPACE STRIKE</span>' +
      '</div>' +
      // Death screen: canvas-driven cut/fracture sequence and a bare restart prompt.
      '<div class="aether-boss2d-death hidden">' +
        '<canvas class="aether-boss2d-death-canvas"></canvas>' +
        '<span class="aether-boss2d-persist-echo echo-one" aria-hidden="true">PERSIST</span>' +
        '<span class="aether-boss2d-persist-echo echo-two" aria-hidden="true">PERSIST</span>' +
        '<span class="aether-boss2d-persist-echo echo-three" aria-hidden="true">PERSIST</span>' +
        '<button type="button" class="aether-boss2d-persist">PERSIST</button>' +
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
    cultistFallenImg = overlay.querySelector('.aether-boss2d-cultist-fallen');
    wrathName = overlay.querySelector('.aether-boss2d-wrath-name');
    wrathFill = overlay.querySelector('.aether-boss2d-wrath-fill');
    wrathValue = overlay.querySelector('.aether-boss2d-wrath-value');
    wrathTrack = overlay.querySelector('.aether-boss2d-wrath-track');
    vpBar = overlay.querySelector('.aether-boss2d-vp');
    vpFill = overlay.querySelector('.aether-boss2d-vp .aether-boss2d-vbar-fill');
    hpFill = overlay.querySelector('.aether-boss2d-hp .aether-boss2d-vbar-fill');
    deathScreen = overlay.querySelector('.aether-boss2d-death');
    deathCanvas = overlay.querySelector('.aether-boss2d-death-canvas');
    deathCtx = deathCanvas ? deathCanvas.getContext('2d') : null;
    const persistBtn = overlay.querySelector('.aether-boss2d-persist');
    if (persistBtn) persistBtn.addEventListener('click', () => {
      beginDeathRevive();
      persistBtn.blur();
    });
    soundDebugOverlay = document.getElementById('aether-boss2d-sound-debug-overlay');
    const soundDebugToggle = document.getElementById('aether-boss2d-sound-debug-toggle');
    const soundDebugClose = overlay.querySelector('.aether-boss2d-sound-debug-close');
    if (soundDebugToggle) {
      soundDebugToggle.setAttribute('aria-expanded', 'false');
      soundDebugToggle.addEventListener('click', () => setSoundDebugOverlayOpen(true));
    }
    if (soundDebugClose) soundDebugClose.addEventListener('click', () => setSoundDebugOverlayOpen(false));
    if (soundDebugOverlay) soundDebugOverlay.addEventListener('pointerdown', (event) => {
      if (event.target === soundDebugOverlay) setSoundDebugOverlayOpen(false);
    });
    buildBossSfxDebugPanel(document.getElementById('aether-boss2d-sound-debug'));
    buildBossAudioMixer(document.getElementById('aether-boss2d-audio-mix'));

    // Debug: one button per attack movement. Left-click plays that pattern
    // solo. Right-click a button to arm it, then left-click another to play the
    // two combined (as they will once wrath crosses COMBINE_WRATH).
    const debugPanel = document.getElementById('aether-boss2d-debug');
    let pairFirst = null;
    let pairFirstBtn = null;
    const clearPair = () => {
      if (pairFirstBtn) pairFirstBtn.classList.remove('is-selected');
      pairFirst = null;
      pairFirstBtn = null;
    };
    MOVEMENT_SEQUENCE.forEach((name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aether-boss2d-debug-btn';
      btn.textContent = name.toUpperCase();
      btn.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        clearPair();
        pairFirst = name;
        pairFirstBtn = btn;
        btn.classList.add('is-selected');
      });
      btn.addEventListener('click', () => {
        if (pairFirst && pairFirst !== name) startMovementSet([pairFirst, name]);
        else startMovementSet([name]);
        clearPair();
      btn.blur();
      });
      debugPanel.appendChild(btn);
    });
    const phaseTwoBtn = document.createElement('button');
    phaseTwoBtn.type = 'button';
    phaseTwoBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    phaseTwoBtn.textContent = 'PHASE 2';
    phaseTwoBtn.addEventListener('click', () => {
      if (phase !== PHASE.ACTIVE) skipToActive();
      bpm = WRATH_MAX;
      startSecondPhase();
      phaseTwoBtn.blur();
    });
    debugPanel.appendChild(phaseTwoBtn);

    const avatarPhaseTwoBtn = document.createElement('button');
    avatarPhaseTwoBtn.type = 'button';
    avatarPhaseTwoBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    avatarPhaseTwoBtn.textContent = 'AVATAR';
    avatarPhaseTwoBtn.addEventListener('click', () => {
      if (phase !== PHASE.SECOND) {
        if (phase !== PHASE.ACTIVE) skipToActive();
        startSecondPhase();
      }
      if (phase2Ritual) {
        phase2Ritual.beams = [];
        phase2Ritual.pentFade = 0;
        phase2Ritual.cocoon.hits = P2_COCOON_HITS;
        phase2Ritual.cocoon.p = 1;
        phase2Ritual.cocoon.alpha = 1;
      }
      startAvatarPhaseTwo();
      avatarPhaseTwoBtn.blur();
    });
    debugPanel.appendChild(avatarPhaseTwoBtn);

    const shadowClawBtn = document.createElement('button');
    shadowClawBtn.type = 'button';
    shadowClawBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    shadowClawBtn.textContent = 'SHADOW CLAW';
    shadowClawBtn.addEventListener('click', () => {
      debugPhaseTwoClaw();
      shadowClawBtn.blur();
    });
    debugPanel.appendChild(shadowClawBtn);

    const eyeRushBtn = document.createElement('button');
    eyeRushBtn.type = 'button';
    eyeRushBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    eyeRushBtn.textContent = 'EYE RUSH';
    eyeRushBtn.addEventListener('click', () => {
      debugPhaseTwoRush();
      eyeRushBtn.blur();
    });
    debugPanel.appendChild(eyeRushBtn);

    const towerClimbBtn = document.createElement('button');
    towerClimbBtn.type = 'button';
    towerClimbBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    towerClimbBtn.textContent = 'BLACK SPIRE';
    towerClimbBtn.addEventListener('click', () => {
      debugPhaseTwoTowerClimb();
      towerClimbBtn.blur();
    });
    debugPanel.appendChild(towerClimbBtn);

    const doomGridBtn = document.createElement('button');
    doomGridBtn.type = 'button';
    doomGridBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    doomGridBtn.textContent = 'DOOM GRID';
    doomGridBtn.addEventListener('click', () => {
      debugPhaseTwoDoomPattern();
      doomGridBtn.blur();
    });
    debugPanel.appendChild(doomGridBtn);

    const mayhemBtn = document.createElement('button');
    mayhemBtn.type = 'button';
    mayhemBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    mayhemBtn.textContent = 'MAYHEM';
    mayhemBtn.addEventListener('click', () => {
      debugPhaseTwoMayhem();
      mayhemBtn.blur();
    });
    debugPanel.appendChild(mayhemBtn);

    const spearRainBtn = document.createElement('button');
    spearRainBtn.type = 'button';
    spearRainBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    spearRainBtn.textContent = 'SPEAR RAIN';
    spearRainBtn.addEventListener('click', () => {
      debugPhaseTwoSpearRain();
      spearRainBtn.blur();
    });
    debugPanel.appendChild(spearRainBtn);

    const chevronBtn = document.createElement('button');
    chevronBtn.type = 'button';
    chevronBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    chevronBtn.textContent = 'CHEVRON';
    chevronBtn.addEventListener('click', () => {
      debugPhaseTwoChevron();
      chevronBtn.blur();
    });
    debugPanel.appendChild(chevronBtn);

    const trianglesBtn = document.createElement('button');
    trianglesBtn.type = 'button';
    trianglesBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    trianglesBtn.textContent = 'TRIANGLES';
    trianglesBtn.addEventListener('click', () => {
      debugPhaseTwoTriangles();
      trianglesBtn.blur();
    });
    debugPanel.appendChild(trianglesBtn);

    const waveformBtn = document.createElement('button');
    waveformBtn.type = 'button';
    waveformBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    waveformBtn.textContent = 'WAVEFORM';
    waveformBtn.addEventListener('click', () => {
      debugPhaseTwoWaveform();
      waveformBtn.blur();
    });
    debugPanel.appendChild(waveformBtn);

    const gridSpecialBtn = document.createElement('button');
    gridSpecialBtn.type = 'button';
    gridSpecialBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    gridSpecialBtn.textContent = 'GRID CUT';
    gridSpecialBtn.addEventListener('click', () => {
      debugPhaseTwoGridSpecial();
      gridSpecialBtn.blur();
    });
    debugPanel.appendChild(gridSpecialBtn);

    const tileRuinBtn = document.createElement('button');
    tileRuinBtn.type = 'button';
    tileRuinBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    tileRuinBtn.textContent = 'TILE RUIN';
    tileRuinBtn.addEventListener('click', () => {
      debugTogglePhaseTwoTileRuin();
      tileRuinBtn.classList.toggle('is-selected', !!phase2TileRuinPattern || phase2TileRuinDebugQueued);
      tileRuinBtn.blur();
    });
    debugPanel.appendChild(tileRuinBtn);

    const swordRingBtn = document.createElement('button');
    swordRingBtn.type = 'button';
    swordRingBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    swordRingBtn.textContent = 'SWORD RING';
    swordRingBtn.addEventListener('click', () => {
      debugPhaseTwoSwordRing();
      swordRingBtn.blur();
    });
    debugPanel.appendChild(swordRingBtn);

    const pitfallBtn = document.createElement('button');
    pitfallBtn.type = 'button';
    pitfallBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    pitfallBtn.textContent = 'PITFALL';
    pitfallBtn.addEventListener('click', () => {
      debugPhaseTwoPitfall();
      pitfallBtn.blur();
    });
    debugPanel.appendChild(pitfallBtn);

    const hexFallBtn = document.createElement('button');
    hexFallBtn.type = 'button';
    hexFallBtn.className = 'aether-boss2d-debug-btn aether-boss2d-debug-btn-danger';
    hexFallBtn.textContent = 'HEX FALL';
    hexFallBtn.addEventListener('click', () => {
      debugPhaseTwoHexFall();
      hexFallBtn.blur();
    });
    debugPanel.appendChild(hexFallBtn);

    const tempoControls = document.createElement('div');
    tempoControls.className = 'aether-boss2d-debug-tempo';
    for (const delta of [-10, 10]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aether-boss2d-debug-btn';
      btn.textContent = (delta > 0 ? '+' : '') + delta + ' BPM';
      btn.addEventListener('click', () => {
        debugAdjustBpm(delta);
        btn.blur();
      });
      tempoControls.appendChild(btn);
    }
    debugPanel.appendChild(tempoControls);

    const primePhaseTwoBtn = document.createElement('button');
    primePhaseTwoBtn.type = 'button';
    primePhaseTwoBtn.className = 'aether-boss2d-debug-btn';
    primePhaseTwoBtn.textContent = 'PRIME P2';
    primePhaseTwoBtn.addEventListener('click', () => {
      if (phase !== PHASE.ACTIVE) skipToActive();
      primePhaseTwoCombat();
      primePhaseTwoBtn.blur();
    });
    debugPanel.appendChild(primePhaseTwoBtn);
  }

  // ---- Rendering ---------------------------------------------------------
  function drawHeroDamageMarker() {
    const center = heroBodyCenterWorld();
    const x = Math.round(center.x) - 2;
    const y = Math.round(center.y) - 2;
    ctx.fillStyle = '#7d0711';
    ctx.fillRect(x, y, 5, 5);
    ctx.fillStyle = '#df1826';
    ctx.fillRect(x + 1, y + 1, 3, 3);
    ctx.fillStyle = '#ff5961';
    ctx.fillRect(x + 2, y + 2, 1, 1);
  }

  function drawHeroCombatFeedback(ox, oy) {
    ctx.save();
    const damageLife = 1 - clamp01(heroDamageFlashAge / HERO_DAMAGE_FLASH_MS);
    if (damageLife > 0) {
      ctx.fillStyle = 'rgba(255, 26, 34, ' + (0.78 * damageLife).toFixed(3) + ')';
      for (let y = 0; y < HERO.rows.length; y++) {
        for (let x = 0; x < HERO.rows[y].length; x++) {
          const token = HERO.rows[y][x];
          if (token === '.' || token === ' ' || !HERO.pal[token]) continue;
          ctx.fillRect(ox + x * HERO_SCALE, oy + y * HERO_SCALE, HERO_SCALE, HERO_SCALE);
        }
      }
    }

    const vpProgress = clamp01(heroVpFlashAge / HERO_VP_FLASH_MS);
    const vpLife = 1 - vpProgress;
    if (vpLife > 0) {
      const retract = easeOutCubic(vpProgress);
      ctx.globalAlpha = vpLife * vpLife * vpLife;
      for (const point of HERO_BODY_OUTLINE_OFFSETS) {
        const blockX = Math.floor(point.x / 2);
        const blockY = Math.floor(point.y / 2);
        const texture = ((blockX * 37) ^ (blockY * 61) ^ (heroVpFlashSerial * 43)) >>> 0;
        ctx.fillStyle = texture % 11 < 4 ? '#ffe45a' : '#66bfff';
        const x = Math.round(point.x + (point.bodyX - point.x) * retract);
        const y = Math.round(point.y + (point.bodyY - point.y) * retract);
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    ctx.restore();
  }

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
      drawHeroCombatFeedback(ox, oy);
      ctx.restore();
      drawHeroDamageMarker();
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
    drawHeroCombatFeedback(ox, oy);
    drawHeroDamageMarker();
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

  // Inner tentacles: the original row-of-circles look, with phase-two retreat.
  function renderTentacles(growth, fade, retreat) {
    const segs = 14;
    const alpha = fade == null ? 1 : Math.max(0, Math.min(1, fade));
    const calcify = retreat == null ? 0 : Math.max(0, Math.min(1, retreat));
    if (growth <= 0.001 || alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
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
        const w = Math.max(0.6, t.width * (1 - u * 0.92) * growth * (1 - calcify * 0.45));
        if (calcify > 0) {
          const tone = 18 + calcify * 78 + (s & 1 ? 0 : 16);
          ctx.fillStyle = 'rgba(' + (tone | 0) + ', ' + (tone | 0) + ', ' + ((tone - 3) | 0) + ', 0.92)';
        } else {
          ctx.fillStyle = (s & 1) ? '#0a0308' : '#14040b';
        }
        ctx.beginPath();
        ctx.arc(x, y, w, 0, Math.PI * 2);
        ctx.fill();
      }
      if (calcify > 0.08) {
        const tipU = 0.75 + calcify * 0.2;
        const along = reach * tipU;
        const wobble = Math.sin(tipU * t.waves * Math.PI + clock * t.speed + t.phase) * t.amp * tipU
          + t.sway * along;
        const x = t.base.x + t.dir.x * along + perp.x * wobble;
        const y = t.base.y + t.dir.y * along + perp.y * wobble;
        ctx.strokeStyle = 'rgba(210, 210, 196, ' + (0.34 * calcify).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - perp.x * t.width * 0.8, y - perp.y * t.width * 0.8);
        ctx.lineTo(x + perp.x * t.width * 0.8, y + perp.y * t.width * 0.8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---- Second-phase backdrop: an ocean of souls beyond the arena ---------
  // Replaces the outer tentacles once the ritual begins. The whole void
  // becomes a marbled current: layered tiling smoke textures scroll left to
  // right with a slow vertical undulation — a pale soul-mass streaming
  // through gray murk — with a few brighter gusts riding the flow on top.
  const SOUL_TEX_W = 512;
  const SOUL_TEX_H = 256;
  let soulTex = null;
  let soulStrands = [];
  const soulRng = mulberry32(0x6b21c9);

  // A horizontally tileable smoke sheet. 'fog' is soft overlapping murk;
  // 'wisp' is the brighter streaky matter that reads as the soul-mass.
  function makeSoulTexture(seed, kind) {
    const random = mulberry32(seed);
    const c = document.createElement('canvas');
    c.width = SOUL_TEX_W;
    c.height = SOUL_TEX_H;
    const g = c.getContext('2d');
    if (kind === 'fog') {
      // Pale smudges over darker marbling, all smeared along the flow.
      for (let i = 0; i < 320; i++) {
        const x = random() * SOUL_TEX_W;
        const y = random() * SOUL_TEX_H;
        const r = 10 + random() * 34;
        const stretch = 2.2 + random() * 2.4;
        const dark = random() < 0.3;
        const tone = dark ? 6 + random() * 14 : 74 + random() * 96;
        const a = dark ? 0.10 + random() * 0.12 : 0.04 + random() * 0.07;
        const fill = g.createRadialGradient(0, 0, 0, 0, 0, r);
        fill.addColorStop(0, 'rgba(' + (tone | 0) + ', ' + ((tone * 1.05) | 0) + ', ' + ((tone * 1.04) | 0) + ', ' + a.toFixed(3) + ')');
        fill.addColorStop(1, 'rgba(0, 0, 0, 0)');
        for (const ox of [-SOUL_TEX_W, 0, SOUL_TEX_W]) {
          g.save();
          g.translate(x + ox, y);
          g.scale(stretch, 1);
          g.fillStyle = fill;
          g.beginPath();
          g.arc(0, 0, r, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
    } else {
      // Bright wavy filaments, dense enough to merge into running matter.
      g.lineCap = 'round';
      for (let i = 0; i < 150; i++) {
        const x0 = random() * SOUL_TEX_W;
        const y0 = random() * SOUL_TEX_H;
        const len = 30 + random() * 130;
        const amp = 2 + random() * 7;
        const k = 0.03 + random() * 0.06;
        const ph = random() * Math.PI * 2;
        const tone = 165 + random() * 75;
        const a = 0.05 + random() * 0.15;
        const width = 0.8 + random() * 2.4;
        g.strokeStyle = 'rgba(' + (tone | 0) + ', ' + ((tone * 1.03) | 0) + ', ' + ((tone * 1.02) | 0) + ', ' + a.toFixed(3) + ')';
        g.lineWidth = width;
        for (const ox of [-SOUL_TEX_W, 0, SOUL_TEX_W]) {
          g.beginPath();
          for (let s = 0; s <= 12; s++) {
            const u = s / 12;
            const x = x0 + len * u + ox;
            const y = y0 + Math.sin(x * k + ph) * amp * Math.sin(Math.PI * u);
            if (s === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        }
      }
    }
    return c;
  }

  // One scrolling layer of the current, drawn in undulating vertical slices
  // so the sheet shears and rolls instead of sliding rigidly. The slice grid
  // itself drifts left/right over time (seamDrift/seamPh) and each slice
  // breathes in opacity, so the vertical shear-seams never sit still and read
  // as a static texture cut.
  function drawSoulLayer(tex, scroll, yAmp, wobbleK, wobblePh, alpha, composite, seamDrift, seamPh) {
    const slices = 36;
    const sliceW = bgWidth / slices;
    const texSlice = SOUL_TEX_W / slices;
    bgCtx.globalCompositeOperation = composite;
    // Content scroll (the texture flowing left→right) is independent of the
    // grid drift (where the shear-seams fall).
    const off = (clock * scroll) % SOUL_TEX_W;
    const gridShift = Math.sin(clock * seamDrift + seamPh) * sliceW * 1.7
      + Math.sin(clock * seamDrift * 0.41 + seamPh * 2.3) * sliceW * 1.0;
    // No overlap on additive layers — a doubled column reads as a seam.
    const overlap = composite === 'lighter' ? 0 : 0.6;
    // Cover one extra slice each side so the shifted grid never leaves a gap.
    for (let i = -1; i <= slices; i++) {
      const dx = i * sliceW - gridShift;
      if (dx >= bgWidth || dx + sliceW <= 0) continue;
      // Source follows destination so the texture image stays put on screen;
      // only the seam positions move with the grid.
      let sx = ((dx / bgWidth) * SOUL_TEX_W - off) % SOUL_TEX_W;
      if (sx < 0) sx += SOUL_TEX_W;
      const y = Math.sin(i * wobbleK + clock * 0.0004 + wobblePh) * yAmp
        + Math.sin(i * wobbleK * 2.7 - clock * 0.0007 + wobblePh * 1.7) * yAmp * 0.5;
      // Each slice fades in and out on its own beat.
      bgCtx.globalAlpha = alpha * (0.7 + 0.3 * Math.sin(clock * 0.0012 + i * 1.27 + seamPh));
      const dw = sliceW + overlap;
      if (sx + texSlice <= SOUL_TEX_W) {
        bgCtx.drawImage(tex, sx, 0, texSlice, SOUL_TEX_H, dx, y, dw, bgHeight);
      } else {
        const first = SOUL_TEX_W - sx;
        const frac = first / texSlice;
        bgCtx.drawImage(tex, sx, 0, first, SOUL_TEX_H, dx, y, dw * frac, bgHeight);
        bgCtx.drawImage(tex, 0, 0, texSlice - first, SOUL_TEX_H, dx + dw * frac, y, dw * (1 - frac), bgHeight);
      }
    }
    bgCtx.globalAlpha = 1;
    bgCtx.globalCompositeOperation = 'source-over';
  }

  function spawnSoulStrand() {
    return {
      born: clock,
      dur: 2600 + soulRng() * 3200,
      x: soulRng() * (bgWidth + 400) - 300,
      y: soulRng() * bgHeight,
      len: 80 + soulRng() * 190,
      amp: 6 + soulRng() * 16,
      k: 0.015 + soulRng() * 0.03,
      ph: soulRng() * Math.PI * 2,
      speed: 0.05 + soulRng() * 0.07,
      width: 2 + soulRng() * 5,
      tone: soulRng(),
    };
  }

  function renderSoulOcean(alpha) {
    if (!soulTex) {
      soulTex = {
        fogA: makeSoulTexture(0x9d2c81, 'fog'),
        fogB: makeSoulTexture(0x37e4b5, 'fog'),
        wisp: makeSoulTexture(0x71f30d, 'wisp'),
      };
    }
    bgCtx.save();
    // Gray murk floor across the whole void.
    bgCtx.globalAlpha = alpha;
    const grad = bgCtx.createLinearGradient(0, 0, 0, bgHeight);
    grad.addColorStop(0, '#15181a');
    grad.addColorStop(0.5, '#1b1f21');
    grad.addColorStop(1, '#101314');
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, bgWidth, bgHeight);
    // The current itself: murk, counter-murk, then the bright soul-mass.
    drawSoulLayer(soulTex.fogA, 0.020, bgHeight * 0.011, 0.28, 0, 0.9 * alpha, 'source-over', 0.00026, 0.0);
    drawSoulLayer(soulTex.fogB, 0.042, bgHeight * 0.016, 0.38, 2.1, 0.65 * alpha, 'source-over', 0.00035, 1.7);
    drawSoulLayer(soulTex.wisp, 0.070, bgHeight * 0.019, 0.33, 4.2, 0.9 * alpha, 'lighter', 0.00044, 3.3);

    // A few brighter gusts riding the surface of the stream.
    soulStrands = soulStrands.filter((s) => clock - s.born < s.dur);
    if (soulStrands.length < 18) soulStrands.push(spawnSoulStrand());
    bgCtx.lineCap = 'round';
    for (const s of soulStrands) {
      const life = (clock - s.born) / s.dur;
      const env = Math.sin(Math.PI * Math.min(1, Math.max(0, life)));
      const headX = s.x + (clock - s.born) * s.speed;
      if (headX - s.len > bgWidth + 60) continue;
      const a = alpha * env * (0.14 + s.tone * 0.20);
      if (a <= 0.005) continue;
      bgCtx.strokeStyle = 'rgba(212, 226, 222, ' + a.toFixed(3) + ')';
      for (let i = 0; i < 10; i++) {
        const u0 = i / 10;
        const u1 = (i + 1) / 10;
        const x0 = headX - s.len * u0;
        const x1 = headX - s.len * u1;
        const y0 = s.y + Math.sin(x0 * s.k + s.ph + clock * 0.0005) * s.amp;
        const y1 = s.y + Math.sin(x1 * s.k + s.ph + clock * 0.0005) * s.amp;
        // Fusiform: the gust swells in the middle, vanishes at the tips.
        bgCtx.lineWidth = Math.max(0.6, s.width * Math.pow(Math.sin(Math.PI * (u0 + u1) / 2), 0.8));
        bgCtx.beginPath();
        bgCtx.moveTo(x0, y0);
        bgCtx.lineTo(x1, y1);
        bgCtx.stroke();
      }
    }
    bgCtx.restore();
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

  function sizeDeathCanvas() {
    if (!deathCanvas) return;
    deathCanvas.width = window.innerWidth;
    deathCanvas.height = window.innerHeight;
    deathCanvas.style.width = window.innerWidth + 'px';
    deathCanvas.style.height = window.innerHeight + 'px';
    if (deathCtx) deathCtx.imageSmoothingEnabled = false;
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
    // Second phase: the outer limbs retract into the dark and an ocean of
    // souls streams through the void in their place.
    const soulFade = phase === PHASE.SECOND ? smoothstep(phaseTime / PHASE2_ARENA_TRANSITION) : 0;
    if (outerTentacles.length && soulFade < 1) {
      const growth = easeOutCubic(Math.min(1, (clock - outerGrowStart) / OUTER_GROW)) * (1 - soulFade);
      if (growth > 0.001) for (const t of outerTentacles) drawOuterTentacle(t, growth);
    }
    if (soulFade > 0) renderSoulOcean(soulFade);
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
    const calcify = phaseTwoArenaProgress();
    const isDefaultFrame = arena.shape === 'rect' && arena.x === ARENA_DEFAULT.x &&
      arena.y === ARENA_DEFAULT.y && arena.width === ARENA_DEFAULT.width &&
      arena.height === ARENA_DEFAULT.height && arena.rotation === 0;
    if (isDefaultFrame) {
      if (calcify <= 0.001) {
        ctx.drawImage(borderCanvas, 0, 0);
      } else if (calcify >= 0.999) {
        ctx.drawImage(calcifiedBorderCanvas, 0, 0);
      } else {
        ctx.save();
        ctx.globalAlpha = 1 - calcify * 0.85;
        ctx.drawImage(borderCanvas, 0, 0);
        ctx.globalAlpha = calcify;
        ctx.drawImage(calcifiedBorderCanvas, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.sin(calcify * Math.PI) * 0.22;
        ctx.strokeStyle = '#efedda';
        ctx.lineWidth = 2;
        ctx.strokeRect(BORDER - 0.5, BORDER - 0.5, BOARD - BORDER * 2 + 1, BOARD - BORDER * 2 + 1);
        ctx.restore();
      }
      return;
    }
    // Moving/resized/non-rectangular shapes use a constant-thickness procedural
    // frame so the visible wall continues to match collision geometry.
    ctx.save();
    arenaPath(ctx, BORDER / 2);
    ctx.strokeStyle = calcify > 0 ? 'rgba(174, 172, 160, ' + calcify.toFixed(3) + ')' : '#260304';
    ctx.lineWidth = BORDER;
    ctx.stroke();
    if (calcify < 1) {
      arenaPath(ctx, BORDER / 2);
      ctx.strokeStyle = 'rgba(38, 3, 4, ' + (1 - calcify).toFixed(3) + ')';
      ctx.lineWidth = BORDER;
      ctx.stroke();
    }
    arenaPath(ctx, BORDER - 1);
    ctx.strokeStyle = calcify > 0.001
      ? 'rgba(238, 236, 220, ' + (0.72 * calcify).toFixed(3) + ')'
      : 'rgba(150, 18, 14, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function phaseTwoGridTimeline(special) {
    return {
      channelP: clamp01(special.channelAgeBeats / PHASE2_GRID_CHANNEL_BEATS),
      impactAge: special.struck ? special.impactAge : -1,
    };
  }

  function buildPhaseTwoGridCutBuffers(special) {
    const layout = special.layout;
    const mask = document.createElement('canvas');
    const edge = document.createElement('canvas');
    mask.width = edge.width = canvas.width;
    mask.height = edge.height = canvas.height;
    const maskCtx = mask.getContext('2d');
    const edgeCtx = edge.getContext('2d');
    const gap = Math.min(48, Math.max(30, Math.min(layout.cellW, layout.cellH) * 0.34));
    const fillCorridor = (vertical, index, center) => {
      const steps = vertical ? Math.max(16, Math.round(layout.height / 28)) : Math.max(16, Math.round(layout.width / 28));
      const left = [];
      const right = [];
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const along = vertical
          ? layout.top + layout.height * p
          : layout.left + layout.width * p;
        const wave = Math.sin(p * 31 + special.seed + index * 4.7) * gap * 0.10
          + Math.sin(p * 83 - special.seed * 0.4 + index) * gap * 0.055;
        const leftWidth = gap * (0.48 + Math.sin(p * 57 + index * 2.3) * 0.09);
        const rightWidth = gap * (0.49 + Math.sin(p * 49 - index * 3.1) * 0.10);
        if (vertical) {
          left.push({ x: center + wave - leftWidth, y: along });
          right.push({ x: center + wave + rightWidth, y: along });
        } else {
          left.push({ x: along, y: center + wave - leftWidth });
          right.push({ x: along, y: center + wave + rightWidth });
        }
      }
      const polygon = left.concat(right.reverse());
      maskCtx.beginPath();
      maskCtx.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i++) maskCtx.lineTo(polygon[i].x, polygon[i].y);
      maskCtx.closePath();
      maskCtx.fill();
    };
    maskCtx.fillStyle = '#fff';
    for (let col = 1; col < layout.cols; col++) {
      fillCorridor(true, col, layout.left + col * layout.cellW);
    }
    for (let row = 1; row < layout.rows; row++) {
      fillCorridor(false, row + layout.cols, layout.top + row * layout.cellH);
    }
    edgeCtx.globalCompositeOperation = 'source-over';
    for (const offset of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      edgeCtx.drawImage(mask, offset[0], offset[1]);
    }
    edgeCtx.globalCompositeOperation = 'destination-out';
    edgeCtx.drawImage(mask, 0, 0);
    edgeCtx.globalCompositeOperation = 'source-in';
    edgeCtx.fillStyle = 'rgba(188, 188, 178, 0.78)';
    edgeCtx.fillRect(0, 0, edge.width, edge.height);
    edgeCtx.globalCompositeOperation = 'source-over';
    special.cutMask = mask;
    special.cutEdge = edge;
    special.cutGap = gap;
  }

  function phaseTwoGridUnionBuffers(special) {
    if (!special.cutMask || special.cutMask.width !== canvas.width || special.cutMask.height !== canvas.height) {
      buildPhaseTwoGridCutBuffers(special);
    }
    const removed = special.removedTiles || new Set();
    const detached = Number.isInteger(special.detachedTile) ? special.detachedTile : null;
    const cutTiles = new Set(removed);
    if (detached != null) cutTiles.add(detached);
    const key = Array.from(cutTiles).sort((a, b) => a - b).join(',');
    if (special.unionMask && special.unionKey === key &&
        special.unionMask.width === canvas.width && special.unionMask.height === canvas.height) {
      return { mask: special.unionMask, edge: special.unionEdge };
    }
    const mask = document.createElement('canvas');
    const edge = document.createElement('canvas');
    mask.width = edge.width = canvas.width;
    mask.height = edge.height = canvas.height;
    const maskCtx = mask.getContext('2d');
    const edgeCtx = edge.getContext('2d');
    maskCtx.drawImage(special.cutMask, 0, 0);
    maskCtx.fillStyle = '#fff';
    const layout = special.layout;
    for (const index of cutTiles) {
      const tile = layout.tiles[index];
      if (!tile) continue;
      const left = tile.x - layout.cellW / 2;
      const right = tile.x + layout.cellW / 2;
      const top = tile.y - layout.cellH / 2;
      const bottom = tile.y + layout.cellH / 2;
      const points = [];
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        points.push({ x: left + (right - left) * p, y: top + Math.abs(Math.sin(i * 7.1 + index)) * 7 });
      }
      for (let i = 1; i <= steps; i++) {
        const p = i / steps;
        points.push({ x: right - Math.abs(Math.sin(i * 5.7 - index)) * 7, y: top + (bottom - top) * p });
      }
      for (let i = 1; i <= steps; i++) {
        const p = i / steps;
        points.push({ x: right - (right - left) * p, y: bottom - Math.abs(Math.sin(i * 6.3 + index * 0.7)) * 7 });
      }
      for (let i = 1; i < steps; i++) {
        const p = i / steps;
        points.push({ x: left + Math.abs(Math.sin(i * 8.3 - index * 0.5)) * 7, y: bottom - (bottom - top) * p });
      }
      maskCtx.beginPath();
      maskCtx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) maskCtx.lineTo(points[i].x, points[i].y);
      maskCtx.closePath();
      maskCtx.fill();
    }
    edgeCtx.globalCompositeOperation = 'source-over';
    for (const offset of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      edgeCtx.drawImage(mask, offset[0], offset[1]);
    }
    edgeCtx.globalCompositeOperation = 'destination-out';
    edgeCtx.drawImage(mask, 0, 0);
    edgeCtx.globalCompositeOperation = 'source-in';
    edgeCtx.fillStyle = 'rgba(188, 188, 178, 0.78)';
    edgeCtx.fillRect(0, 0, edge.width, edge.height);
    edgeCtx.globalCompositeOperation = 'source-over';
    special.unionKey = key;
    special.unionMask = mask;
    special.unionEdge = edge;
    return { mask, edge };
  }

  function phaseTwoGridFloorBuffer(special) {
    if (special.floorBuffer && special.floorBuffer.width === canvas.width && special.floorBuffer.height === canvas.height) {
      return special.floorBuffer;
    }
    const union = phaseTwoGridUnionBuffers(special);
    const floor = document.createElement('canvas');
    floor.width = canvas.width;
    floor.height = canvas.height;
    const floorCtx = floor.getContext('2d');
    floorCtx.fillStyle = '#040406';
    floorCtx.fillRect(0, 0, floor.width, floor.height);
    const pattern = floorCtx.createPattern(cobbledFloorCanvas, 'repeat');
    if (pattern) {
      floorCtx.fillStyle = pattern;
      floorCtx.fillRect(0, 0, floor.width, floor.height);
    } else {
      floorCtx.drawImage(cobbledFloorCanvas, 0, 0);
    }
    floorCtx.globalCompositeOperation = 'destination-out';
    floorCtx.drawImage(union.mask, 0, 0);
    floorCtx.globalCompositeOperation = 'source-over';
    floorCtx.drawImage(union.edge, 0, 0);
    special.floorBuffer = floor;
    return floor;
  }

  function renderPhaseTwoGridFloor() {
    const special = phase2GridSpecial;
    if (!special || !special.struck) return;
    const timeline = phaseTwoGridTimeline(special);
    const opening = smoothstep(timeline.impactAge / 130);
    const cut = opening;
    if (cut <= 0.001) return;
    if (!special.cutMask || special.cutMask.width !== canvas.width || special.cutMask.height !== canvas.height) {
      buildPhaseTwoGridCutBuffers(special);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = cut;
    ctx.drawImage(special.cutMask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = cut;
    ctx.drawImage(special.cutEdge, 0, 0);
    ctx.restore();
  }

  function tracePhaseTwoFinalTile(g, finalTile, width, height) {
    const left = finalTile.x - width / 2;
    const right = finalTile.x + width / 2;
    const top = finalTile.y - height / 2;
    const bottom = finalTile.y + height / 2;
    const seed = finalTile.index * 1.73;
    const steps = 8;
    g.beginPath();
    for (let edge = 0; edge < 4; edge++) {
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const bite = Math.abs(Math.sin(seed + edge * 9.1 + i * 6.7)) * 5;
        let x;
        let y;
        if (edge === 0) { x = left + width * p; y = top + bite; }
        else if (edge === 1) { x = right - bite; y = top + height * p; }
        else if (edge === 2) { x = right - width * p; y = bottom - bite; }
        else { x = left + bite; y = bottom - height * p; }
        if (edge === 0 && i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    }
    g.closePath();
  }

  function renderPhaseTwoFinalTile() {
    const special = phase2GridSpecial;
    const finalTile = special && special.finalTile;
    if (!special || !finalTile) return;
    const layout = special.layout;
    const gap = special.cutGap || Math.min(48, Math.max(30, Math.min(layout.cellW, layout.cellH) * 0.34));
    const width = Math.max(12, layout.cellW - gap);
    const height = Math.max(12, layout.cellH - gap);
    ctx.save();
    tracePhaseTwoFinalTile(ctx, finalTile, width, height);
    ctx.clip();
    ctx.fillStyle = '#040406';
    ctx.fillRect(finalTile.x - width / 2, finalTile.y - height / 2, width, height);
    if (!cobbledFloorPattern) cobbledFloorPattern = ctx.createPattern(cobbledFloorCanvas, 'repeat');
    if (cobbledFloorPattern) {
      ctx.fillStyle = cobbledFloorPattern;
      ctx.fillRect(finalTile.x - width / 2, finalTile.y - height / 2, width, height);
    }
    ctx.restore();
    ctx.save();
    tracePhaseTwoFinalTile(ctx, finalTile, width, height);
    ctx.strokeStyle = 'rgba(205, 204, 194, 0.86)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function phaseTwoPitfallProjection(platform) {
    const depth = platform.ageBeats / platform.travelBeats;
    const hitT = clamp01(depth / PHASE2_PITFALL_HIT_DEPTH);
    const approach = easeInQuad(hitT);
    const passed = clamp01((depth - PHASE2_PITFALL_HIT_DEPTH) / (1.16 - PHASE2_PITFALL_HIT_DEPTH));
    const arrivalAlpha = 0.10 + smoothstep(hitT) * 0.90;
    const spawnFade = smoothstep(depth / 0.055);
    const exitFade = 1 - smoothstep((depth - 1.02) / 0.14);
    const scale = depth <= PHASE2_PITFALL_HIT_DEPTH
      ? 0.045 + approach * 0.955
      : 1 + easeOutCubic(passed) * 0.78;
    const inset = BORDER + PAD;
    const fullWidth = canvas.width - inset * 2;
    const fullHeight = canvas.height - inset * 2;
    const vanishingY = canvas.height * 0.40;
    const centerY = vanishingY + (canvas.height / 2 - vanishingY) * hitT;
    const width = fullWidth * scale;
    const height = fullHeight * scale;
    return {
      depth,
      scale,
      left: canvas.width / 2 - width / 2,
      top: centerY - height / 2,
      width,
      height,
      alpha: spawnFade * arrivalAlpha * exitFade,
    };
  }

  function tracePhaseTwoPitfallGap(gap, projection) {
    for (let i = 0; i < gap.points.length; i++) {
      const point = gap.points[i];
      const x = projection.left + point.x * projection.width;
      const y = projection.top + point.y * projection.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function renderPhaseTwoPitfallPlatform(platform) {
    const projection = phaseTwoPitfallProjection(platform);
    if (projection.alpha <= 0.001) return;
    const passed = Math.max(0, projection.depth - PHASE2_PITFALL_HIT_DEPTH);
    const faceAlpha = 1 - smoothstep(passed / 0.075);
    const hitFlash = platform.hit && platform.hitAge >= 0
      ? 1 - smoothstep(platform.hitAge / 220)
      : 0;
    const safeFlash = platform.resolved && !platform.hit
      ? 1 - smoothstep((platform.ageBeats / platform.travelBeats - PHASE2_PITFALL_HIT_DEPTH) / 0.10)
      : 0;
    const thickness = Math.max(2, projection.scale * 9);
    ctx.save();
    ctx.globalAlpha = projection.alpha;

    if (faceAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha *= faceAlpha;
      ctx.fillStyle = hitFlash > 0
        ? 'rgba(150, 12, 18, 0.96)'
        : 'rgba(54, 8, 12, 0.94)';
      ctx.fillRect(
        projection.left,
        projection.top + projection.height,
        projection.width,
        thickness
      );

      ctx.beginPath();
      ctx.rect(projection.left, projection.top, projection.width, projection.height);
      for (const gap of platform.gaps) tracePhaseTwoPitfallGap(gap, projection);
      ctx.fillStyle = hitFlash > 0
        ? 'rgba(42, 3, 6, 0.99)'
        : 'rgba(25, 25, 29, 0.98)';
      ctx.fill('evenodd');

      ctx.save();
      ctx.beginPath();
      ctx.rect(projection.left, projection.top, projection.width, projection.height);
      for (const gap of platform.gaps) tracePhaseTwoPitfallGap(gap, projection);
      ctx.clip('evenodd');
      ctx.globalAlpha *= 0.22 + projection.scale * 0.14;
      ctx.strokeStyle = hitFlash > 0 ? '#ff2830' : '#77766f';
      ctx.lineWidth = Math.max(0.5, projection.scale * 0.8);
      const stripeGap = Math.max(8, 34 * projection.scale);
      ctx.beginPath();
      for (let y = projection.top - projection.width; y < projection.top + projection.height + projection.width; y += stripeGap) {
        ctx.moveTo(projection.left, y);
        ctx.lineTo(projection.left + projection.width, y + projection.width * 0.22);
      }
      ctx.stroke();
      ctx.restore();
      ctx.restore();
    }

    ctx.strokeStyle = hitFlash > 0
      ? 'rgba(255, 42, 50, 0.98)'
      : safeFlash > 0
        ? 'rgba(225, 224, 210, ' + (0.55 + safeFlash * 0.4).toFixed(3) + ')'
        : 'rgba(178, 176, 164, 0.82)';
    ctx.lineWidth = Math.max(0.7, projection.scale * 1.5);
    ctx.strokeRect(projection.left, projection.top, projection.width, projection.height);
    for (const gap of platform.gaps) {
      ctx.beginPath();
      tracePhaseTwoPitfallGap(gap, projection);
      ctx.strokeStyle = 'rgba(3, 2, 5, 0.94)';
      ctx.lineWidth = Math.max(10, projection.scale * 26);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderPhaseTwoHexWall(wall) {
    if (wall.kind === 'corridor-stream') return;
    const progress = clamp01(phaseTwoHexWallProgress(wall));
    const radius = phaseTwoHexWallRadius(wall);
    const outer = Math.max(1, radius + wall.thickness / 2);
    const inner = Math.max(1, radius - wall.thickness / 2);
    const segments = phaseTwoHexWallSegments(wall, radius);
    const alpha = smoothstep(progress / 0.11) * (1 - smoothstep((progress - 0.96) / 0.10));
    if (alpha <= 0.001) return;
    const hitFlash = wall.hit && wall.impactAge >= 0 ? 1 - smoothstep(wall.impactAge / 220) : 0;
    const center = phaseTwoHexCenter();
    const cx = center.x;
    const cy = center.y;
    ctx.save();
    ctx.globalAlpha = alpha;
    const shadowInner = Math.max(1, inner - wall.thickness * PHASE2_HEX_WALL_SHADOW_SCALE);
    ctx.beginPath();
    for (const segment of segments) {
      ctx.moveTo(cx + Math.cos(segment.start) * inner, cy + Math.sin(segment.start) * inner);
      ctx.arc(cx, cy, inner, segment.start, segment.end);
      ctx.arc(cx, cy, shadowInner, segment.end, segment.start, true);
      ctx.closePath();
    }
    ctx.fillStyle = 'rgba(24, 20, 28, 0.62)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(112, 106, 119, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    for (const segment of segments) {
      ctx.moveTo(cx + Math.cos(segment.start) * outer, cy + Math.sin(segment.start) * outer);
      ctx.arc(cx, cy, outer, segment.start, segment.end);
      ctx.arc(cx, cy, inner, segment.end, segment.start, true);
      ctx.closePath();
    }
    ctx.fillStyle = hitFlash > 0 ? 'rgba(72, 2, 7, 0.98)' : 'rgba(19, 17, 21, 0.98)';
    ctx.fill();
    ctx.strokeStyle = hitFlash > 0 ? 'rgba(255, 38, 44, 0.96)' : 'rgba(126, 12, 24, 0.82)';
    ctx.lineWidth = Math.max(1.2, wall.thickness * 0.055);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(164, 161, 151, 0.20)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const segment of segments) {
      for (let i = 1; i < 4; i++) {
        const textureRadius = inner + wall.thickness * i / 4;
        const start = segment.start + 0.03;
        const end = segment.end - 0.03;
        ctx.moveTo(cx + Math.cos(start) * textureRadius, cy + Math.sin(start) * textureRadius);
        ctx.arc(cx, cy, textureRadius, start, end);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(220, 216, 201, 0.78)';
    ctx.lineWidth = 1.5;
    for (const segment of segments) {
      for (const angle of [segment.start, segment.end]) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function makePhaseTwoHexSmoothWallPath(pathPoints) {
    const path = new Path2D();
    if (pathPoints.length < 2) return path;
    path.moveTo(pathPoints[0].x, pathPoints[0].y);
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const previous = pathPoints[Math.max(0, i - 1)];
      const current = pathPoints[i];
      const next = pathPoints[i + 1];
      const following = pathPoints[Math.min(pathPoints.length - 1, i + 2)];
      path.bezierCurveTo(
        current.x + (next.x - previous.x) / 6,
        current.y + (next.y - previous.y) / 6,
        next.x - (following.x - current.x) / 6,
        next.y - (following.y - current.y) / 6,
        next.x,
        next.y
      );
    }
    return path;
  }

  function renderPhaseTwoHexCorridorStreams(walls) {
    const pointWalls = walls
      .filter((wall) => wall.kind === 'corridor-stream')
      .map((wall) => {
        const progress = clamp01(phaseTwoHexWallProgress(wall));
        return {
          wall,
          radius: phaseTwoHexWallRadius(wall),
          alpha: smoothstep(progress / 0.11) *
            (1 - smoothstep((progress - 0.96) / 0.10)),
        };
      })
      .filter((point) => point.alpha > 0.001);
    const waveGroups = new Map();
    for (const point of pointWalls) {
      const streamId = point.wall.corridorStreamId;
      if (!waveGroups.has(streamId)) waveGroups.set(streamId, []);
      waveGroups.get(streamId).push(point);
    }
    const center = phaseTwoHexCenter();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const points of waveGroups.values()) {
      if (points.length < 2) continue;
      points.sort((a, b) => a.radius - b.radius);
      const lineWidth = points[0].wall.thickness;
      const hitFlash = points.reduce((flash, point) => {
        if (!point.wall.hit || point.wall.impactAge < 0) return flash;
        return Math.max(flash, 1 - smoothstep(point.wall.impactAge / 220));
      }, 0);
      ctx.globalAlpha = points.reduce((sum, point) => sum + point.alpha, 0) / points.length;
      for (let railIndex = 0; railIndex < PHASE2_HEX_CORRIDOR_RAILS; railIndex++) {
        const railOffset = railIndex * Math.PI * 2 / PHASE2_HEX_CORRIDOR_RAILS;
        const pathPoints = points.map((point) => {
          const angle = phaseTwoHexWallGapAngle(point.wall) + railOffset;
          return {
            x: center.x + Math.cos(angle) * point.radius,
            y: center.y + Math.sin(angle) * point.radius,
            radius: point.radius,
          };
        });
        const shadowOffset = lineWidth / 2 + PHASE2_HEX_CORRIDOR_SHADOW_WIDTH / 2;
        const shadowPoints = pathPoints.map((point) => {
          const scale = Math.max(0, point.radius - shadowOffset) / Math.max(1, point.radius);
          return {
            x: center.x + (point.x - center.x) * scale,
            y: center.y + (point.y - center.y) * scale,
          };
        });
        const shadowPath = makePhaseTwoHexSmoothWallPath(shadowPoints);
        ctx.strokeStyle = 'rgba(46, 42, 50, 0.72)';
        ctx.lineWidth = PHASE2_HEX_CORRIDOR_SHADOW_WIDTH;
        ctx.stroke(shadowPath);
        const wallPath = makePhaseTwoHexSmoothWallPath(pathPoints);
        ctx.strokeStyle = hitFlash > 0
          ? 'rgba(255, 38, 44, 0.96)'
          : 'rgba(126, 12, 24, 0.88)';
        ctx.lineWidth = lineWidth + 3;
        ctx.stroke(wallPath);
        ctx.strokeStyle = hitFlash > 0
          ? 'rgba(72, 2, 7, 0.98)'
          : 'rgba(19, 17, 21, 0.99)';
        ctx.lineWidth = lineWidth;
        ctx.stroke(wallPath);
        ctx.strokeStyle = 'rgba(164, 161, 151, 0.13)';
        ctx.lineWidth = 0.8;
        ctx.stroke(wallPath);
      }
    }
    ctx.restore();
  }

  function renderPhaseTwoHexOrb(orb) {
    const progress = clamp01(orb.ageBeats / orb.travelBeats);
    const position = phaseTwoHexOrbPosition(orb);
    const fade = smoothstep(progress / 0.10) * (1 - smoothstep((progress - 0.94) / 0.08));
    if (fade <= 0.001) return;
    const facing = orb.angle + Math.PI;
    const facingX = Math.cos(facing);
    const facingY = Math.sin(facing);
    const sideX = -facingY;
    const sideY = facingX;
    const shadowStart = orb.radius;
    const shadowEnd = orb.radius * (1 + PHASE2_HEX_ORB_SHADOW_LENGTH);
    ctx.save();
    ctx.globalAlpha = fade;

    ctx.beginPath();
    ctx.moveTo(
      position.x + facingX * shadowStart + sideX * orb.radius,
      position.y + facingY * shadowStart + sideY * orb.radius
    );
    ctx.lineTo(
      position.x + facingX * shadowEnd + sideX * orb.radius,
      position.y + facingY * shadowEnd + sideY * orb.radius
    );
    ctx.lineTo(
      position.x + facingX * shadowEnd - sideX * orb.radius,
      position.y + facingY * shadowEnd - sideY * orb.radius
    );
    ctx.lineTo(
      position.x + facingX * shadowStart - sideX * orb.radius,
      position.y + facingY * shadowStart - sideY * orb.radius
    );
    ctx.closePath();
    ctx.fillStyle = 'rgba(27, 23, 32, 0.68)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(122, 116, 132, 0.30)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(position.x, position.y, orb.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#050407';
    ctx.fill();
    ctx.strokeStyle = orb.hit ? 'rgba(255, 82, 82, 0.98)' : 'rgba(190, 18, 30, 0.92)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(position.x - orb.radius * 0.18, position.y - orb.radius * 0.16, orb.radius * 0.42, 0, Math.PI * 1.45);
    ctx.strokeStyle = 'rgba(120, 112, 126, 0.20)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  function renderPhaseTwoHexWhirlpool(pattern) {
    const hex = pattern && pattern.hex;
    const whirlpool = hex && hex.whirlpool;
    if (!whirlpool) return;
    const castProgress = clamp01(whirlpool.ageBeats / PHASE2_HEX_WHIRLPOOL_CAST_BEATS);
    const reveal = whirlpool.active ? 1 : smoothstep(castProgress);
    const center = phaseTwoHexCenter();
    const outerRadius = Math.min(canvas.width, canvas.height) * 0.5 - 8;
    const innerRadius = PHASE2_HEX_CRATER_RADIUS + 10;
    const flow = whirlpool.flow;
    const flowStrength = Math.abs(flow);
    const trailCount = 52;
    const trailSegments = 14;
    ctx.save();
    ctx.strokeStyle = 'rgb(151, 154, 157)';
    ctx.lineCap = 'round';
    for (let segment = 0; segment < trailSegments; segment++) {
      const tailProgress = segment / trailSegments;
      const headProgress = (segment + 1) / trailSegments;
      const tailFade = Math.pow(headProgress, 2.35);
      for (let pulseGroup = 0; pulseGroup < 4; pulseGroup++) {
        const pulse = 0.28 + 0.72 * Math.pow(
          0.5 + 0.5 * Math.sin(whirlpool.ageBeats * 1.15 + pulseGroup * Math.PI / 2),
          1.7
        );
        ctx.globalAlpha = reveal * tailFade * pulse * (0.09 + flowStrength * 0.16);
        ctx.lineWidth = 0.72 + headProgress * 0.82;
        ctx.beginPath();
        for (let i = pulseGroup; i < trailCount; i += 4) {
          const radialSeed = (i + 0.5) / trailCount;
          const radiusJitter = Math.sin(i * 4.17) *
            (outerRadius - innerRadius) / trailCount * 0.42;
          const radius = innerRadius + (outerRadius - innerRadius) * radialSeed + radiusJitter;
          const headAngle = i * 2.3999632297 +
            whirlpool.spinAngle * (0.72 + radialSeed * 0.24) +
            Math.sin(whirlpool.ageBeats * 0.31 + i * 1.73) * 0.025;
          const sweep = flow * (3.64 + radialSeed * 0.68);
          const startAngle = headAngle - sweep * (1 - tailProgress);
          const endAngle = headAngle - sweep * (1 - headProgress);
          ctx.moveTo(
            center.x + Math.cos(startAngle) * radius,
            center.y + Math.sin(startAngle) * radius
          );
          ctx.arc(center.x, center.y, radius, startAngle, endAngle, sweep < 0);
        }
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgb(174, 176, 178)';
    for (let i = 0; i < trailCount; i++) {
      const radialSeed = (i + 0.5) / trailCount;
      const radiusJitter = Math.sin(i * 4.17) *
        (outerRadius - innerRadius) / trailCount * 0.42;
      const radius = innerRadius + (outerRadius - innerRadius) * radialSeed + radiusJitter;
      const headAngle = i * 2.3999632297 +
        whirlpool.spinAngle * (0.72 + radialSeed * 0.24) +
        Math.sin(whirlpool.ageBeats * 0.31 + i * 1.73) * 0.025;
      const pulse = 0.28 + 0.72 * Math.pow(
        0.5 + 0.5 * Math.sin(whirlpool.ageBeats * 1.15 + (i % 4) * Math.PI / 2),
        1.7
      );
      ctx.globalAlpha = reveal * pulse * (0.12 + flowStrength * 0.18);
      ctx.beginPath();
      ctx.arc(
        center.x + Math.cos(headAngle) * radius,
        center.y + Math.sin(headAngle) * radius,
        0.75 + (i % 3) * 0.16,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    if (!whirlpool.active) {
      ctx.globalAlpha = (1 - castProgress) * 0.75;
      ctx.strokeStyle = 'rgba(218, 218, 216, 0.9)';
      ctx.lineWidth = Math.max(1, 7 * (1 - castProgress));
      ctx.beginPath();
      ctx.arc(center.x, center.y, innerRadius + easeOutCubic(castProgress) * (outerRadius - innerRadius), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function tracePhaseTwoHexCrater(radius, seed) {
    const count = 28;
    const center = phaseTwoHexCenter();
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      const jitter = 0.91 + 0.07 * Math.sin(seed + i * 2.71) + 0.035 * Math.sin(seed * 0.43 + i * 5.13);
      const x = center.x + Math.cos(angle) * radius * jitter;
      const y = center.y + Math.sin(angle) * radius * jitter;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function renderPhaseTwoHexCrater(pattern) {
    const ram = pattern.ram;
    if (ram && ram.exitToSquare) return;
    const growth = pattern.mode === 'hex'
      ? 1
      : ram && ram.impacted
        ? easeOutCubic(clamp01(ram.shockAge / 460))
        : 0;
    if (growth <= 0.001) return;
    const radius = PHASE2_HEX_CRATER_RADIUS * growth;
    ctx.save();
    ctx.beginPath();
    tracePhaseTwoHexCrater(radius, pattern.seed);
    ctx.fillStyle = '#000000';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.92)';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(89, 86, 80, 0.90)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(207, 203, 190, 0.82)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function renderPhaseTwoHexShockwave(pattern) {
    const ram = pattern.ram;
    if (!ram || !ram.impacted || ram.shockAge < 0 || ram.shockAge >= 720) return;
    const progress = clamp01(ram.shockAge / 720);
    const radius = 16 + easeOutCubic(progress) * Math.min(canvas.width, canvas.height) * 0.57;
    const center = phaseTwoHexCenter();
    ctx.save();
    ctx.fillStyle = 'rgba(238, 236, 222, ' + ((1 - smoothstep(progress / 0.24)) * 0.24).toFixed(3) + ')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 3; i++) {
      const delayed = clamp01(progress * 1.3 - i * 0.13);
      if (delayed <= 0) continue;
      ctx.strokeStyle = i === 0
        ? 'rgba(255, 245, 226, ' + ((1 - delayed) * 0.90).toFixed(3) + ')'
        : 'rgba(168, 12, 22, ' + ((1 - delayed) * 0.70).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, (1 - delayed) * (8 - i * 1.5));
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius * (0.76 + i * 0.14), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderPhaseTwoPitfall(sceneW, sceneH) {
    const pattern = phase2PitfallPattern;
    if (!pattern) return;
    const entry = smoothstep(pattern.elapsed / PHASE2_PITFALL_ENTRY_MS);
    const circularFall = pattern.mode === 'hex' ||
      !!(pattern.ram && (pattern.ram.impacted || pattern.ram.exitToSquare));
    const whirlpoolCast = !!(pattern.hex && pattern.hex.whirlpool);
    const settledSquare = !!(pattern.ram && pattern.ram.exitToSquare && pattern.ram.impacted);
    const hexCenter = phaseTwoHexCenter();
    const cx = circularFall ? hexCenter.x : sceneW / 2;
    const cy = circularFall ? hexCenter.y : sceneH / 2;
    ctx.save();
    ctx.fillStyle = '#020104';
    ctx.fillRect(0, 0, sceneW, sceneH);

    const vanishingX = cx;
    const vanishingY = circularFall ? cy : sceneH * 0.40;
    const innerWidth = sceneW - (BORDER + PAD) * 2;
    const innerHeight = sceneH - (BORDER + PAD) * 2;
    if (!whirlpoolCast && !settledSquare) {
      for (let group = 0; group < 3; group++) {
        ctx.beginPath();
        for (let i = group; i < 9; i += 3) {
          const travel = (i / 9 + pattern.tunnelOffset / 1180) % 1;
          const scale = 0.025 + easeInQuad(travel) * 0.955;
          const width = innerWidth * scale;
          const height = innerHeight * scale;
          const ringY = circularFall ? cy : vanishingY + (cy - vanishingY) * travel;
          if (circularFall) {
            ctx.moveTo(cx + width / 2, ringY);
            ctx.ellipse(cx, ringY, width / 2, height / 2, 0, 0, Math.PI * 2);
          } else {
            ctx.rect(cx - width / 2, ringY - height / 2, width, height);
          }
        }
        ctx.strokeStyle = 'rgba(190, 188, 178, ' + (0.10 + group * 0.045).toFixed(3) + ')';
        ctx.lineWidth = 0.7 + group * 0.35;
        ctx.stroke();
      }

      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const travel = (i / 12 + pattern.tunnelOffset / 920) % 1;
        const side = i % 4;
        const scale = 0.06 + easeInQuad(travel) * 0.82;
        const width = (sceneW - (BORDER + PAD) * 2) * scale;
        const height = (sceneH - (BORDER + PAD) * 2) * scale;
        const ringY = vanishingY + (cy - vanishingY) * travel;
        const left = cx - width / 2;
        const right = cx + width / 2;
        const top = ringY - height / 2;
        const bottom = ringY + height / 2;
        if (side === 0 || side === 2) {
          const x = side === 0 ? left : right;
          ctx.moveTo(x, top);
          ctx.lineTo(x + (side === 0 ? -1 : 1) * (10 + travel * 26), top - 5);
        } else {
          const y = side === 1 ? top : bottom;
          ctx.moveTo(left, y);
          ctx.lineTo(left - 5, y + (side === 1 ? -1 : 1) * (10 + travel * 26));
        }
      }
      ctx.strokeStyle = 'rgba(205, 202, 190, 0.20)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const platforms = pattern.platforms.slice().sort((a, b) => a.age - b.age);
    for (const platform of platforms) renderPhaseTwoPitfallPlatform(platform);
    const exitingHex = !!(pattern.ram && pattern.ram.exitToSquare && !pattern.ram.impacted);
    if ((pattern.mode === 'hex' || exitingHex) && pattern.hex) {
      renderPhaseTwoHexWhirlpool(pattern);
      const walls = pattern.hex.walls.slice().sort((a, b) => a.ageBeats - b.ageBeats);
      for (const wall of walls) renderPhaseTwoHexWall(wall);
      renderPhaseTwoHexCorridorStreams(walls);
      for (const orb of pattern.hex.orbs) renderPhaseTwoHexOrb(orb);
    }
    if (circularFall) {
      renderPhaseTwoHexCrater(pattern);
      renderPhaseTwoHexShockwave(pattern);
    }
    ctx.restore();

    if (entry < 1) {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const delayed = clamp01(entry * 1.35 - i * 0.16);
        if (delayed <= 0) continue;
        const scale = 0.02 + easeOutCubic(delayed) * 0.96;
        const alpha = (1 - delayed) * (0.78 - i * 0.15);
        ctx.strokeStyle = i === 0
          ? 'rgba(190, 24, 31, ' + alpha.toFixed(3) + ')'
          : 'rgba(214, 211, 198, ' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1 + (1 - delayed) * (3 - i * 0.6);
        ctx.strokeRect(
          cx - innerWidth * scale / 2,
          cy - innerHeight * scale / 2,
          innerWidth * scale,
          innerHeight * scale
        );
      }
      ctx.restore();
    }
  }

  function renderPhaseTwoPitfallImpact() {
    const pattern = phase2PitfallPattern;
    if (!pattern) return;
    if (pattern.impactAge >= 0 && pattern.impactAge < 260) {
      const p = clamp01(pattern.impactAge / 260);
      ctx.save();
      ctx.fillStyle = 'rgba(180, 8, 16, ' + ((1 - p) * 0.32).toFixed(3) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(hero.x, hero.y);
      ctx.strokeStyle = 'rgba(255, 50, 56, ' + (1 - p).toFixed(3) + ')';
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI * 2 / 12;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
        ctx.lineTo(Math.cos(angle) * (32 + p * 44), Math.sin(angle) * (32 + p * 44));
        ctx.stroke();
      }
      ctx.restore();
    } else if (pattern.safeAge >= 0 && pattern.safeAge < 180) {
      const p = clamp01(pattern.safeAge / 180);
      ctx.save();
      ctx.strokeStyle = 'rgba(225, 224, 210, ' + ((1 - p) * 0.68).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hero.x, hero.y, 22 + p * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function renderPhaseTwoTowerClimb(sceneW, sceneH) {
    const pattern = phase2TowerPattern;
    const course = pattern && pattern.course;
    if (!course) return;
    const cameraY = course.cameraY;
    ctx.save();
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, sceneW, sceneH);

    const wallGradient = ctx.createLinearGradient(0, 0, sceneW, 0);
    wallGradient.addColorStop(0, 'rgba(118, 116, 108, 0.18)');
    wallGradient.addColorStop(0.10, 'rgba(20, 20, 23, 0.12)');
    wallGradient.addColorStop(0.50, 'rgba(0, 0, 0, 0)');
    wallGradient.addColorStop(0.90, 'rgba(20, 20, 23, 0.12)');
    wallGradient.addColorStop(1, 'rgba(118, 116, 108, 0.18)');
    ctx.fillStyle = wallGradient;
    ctx.fillRect(0, 0, sceneW, sceneH);

    const firstCourse = Math.floor(cameraY / 44) * 44;
    ctx.strokeStyle = 'rgba(176, 173, 160, 0.09)';
    ctx.lineWidth = 1;
    for (let worldY = firstCourse; worldY <= cameraY + sceneH + 44; worldY += 44) {
      const y = Math.round(worldY - cameraY) + 0.5;
      const offset = (Math.floor(worldY / 44) % 2) * 38;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(sceneW, y);
      for (let x = offset; x < sceneW; x += 76) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(worldY * 0.017 + x) * 2, y + 44);
      }
      ctx.stroke();
    }

    for (const platform of course.platforms) {
      const y = platform.y - cameraY;
      if (y < -PHASE2_TOWER_PLATFORM_H - 4 || y > sceneH + 4) continue;
      const x = Math.round(platform.x);
      const width = Math.round(platform.w);
      ctx.fillStyle = '#111114';
      ctx.fillRect(x - 2, Math.round(y) - 2, width + 4, PHASE2_TOWER_PLATFORM_H + 5);
      ctx.fillStyle = '#aaa89d';
      ctx.fillRect(x, Math.round(y), width, PHASE2_TOWER_PLATFORM_H);
      ctx.fillStyle = '#d1cec0';
      ctx.fillRect(x + 2, Math.round(y) + 1, Math.max(0, width - 4), 2);
      ctx.fillStyle = '#55554f';
      ctx.fillRect(x + 3, Math.round(y) + 5, Math.max(0, width - 6), PHASE2_TOWER_PLATFORM_H - 5);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      for (let chip = 7; chip < width - 3; chip += 13) {
        const chipY = (chip * 17 + Math.round(platform.y)) % 5;
        ctx.fillRect(x + chip, Math.round(y) + 4 + chipY, 3, 2);
      }
    }

    const flameScreenY = course.flameY - cameraY;
    const flameBaseY = Math.max(-80, Math.min(sceneH + 100, flameScreenY));
    const flamePoints = [];
    for (let x = -16; x <= sceneW + 16; x += 12) {
      flamePoints.push({ x, y: flameBaseY + phaseTwoTowerFlameSurfaceOffset(x) });
    }
    ctx.beginPath();
    ctx.moveTo(flamePoints[0].x, sceneH + 30);
    for (const point of flamePoints) ctx.lineTo(point.x, point.y);
    ctx.lineTo(sceneW + 20, sceneH + 30);
    ctx.closePath();
    ctx.shadowColor = 'rgba(174, 12, 18, 0.70)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(205, 25, 31, 0.82)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(flamePoints[0].x, flamePoints[0].y);
    for (let i = 1; i < flamePoints.length; i++) ctx.lineTo(flamePoints[i].x, flamePoints[i].y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(75, 73, 72, 0.34)';
    ctx.lineWidth = 1;
    for (let trail = 0; trail < 3; trail++) {
      ctx.beginPath();
      for (let i = trail; i < flamePoints.length; i += 3) {
        const point = flamePoints[i];
        const y = point.y + 14 + trail * 11 + Math.sin(clock * 0.01 + i) * 5;
        if (i === trail) ctx.moveTo(point.x, y); else ctx.lineTo(point.x, y);
      }
      ctx.stroke();
    }

    for (const ember of course.embers) {
      const progress = clamp01(ember.distance / ember.maxDistance);
      const life = 1 - progress;
      const radius = ember.startRadius * Math.pow(life, 0.72);
      const y = ember.y - cameraY;
      if (y < -radius * 3 || y > sceneH + radius * 3) continue;
      const previousY = ember.previousY - cameraY;
      ctx.save();
      ctx.globalAlpha = Math.pow(life, 0.82);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(113, 35, 148, 0.58)';
      ctx.lineWidth = Math.max(1, radius * 0.55);
      ctx.shadowColor = 'rgba(158, 57, 202, 0.82)';
      ctx.shadowBlur = Math.max(3, radius * 1.45);
      ctx.beginPath();
      ctx.moveTo(ember.previousX, previousY);
      ctx.lineTo(ember.x, y);
      ctx.stroke();
      ctx.fillStyle = '#a847cf';
      ctx.beginPath();
      ctx.arc(ember.x, y, Math.max(0.6, radius), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(225, 153, 255, 0.78)';
      ctx.beginPath();
      ctx.arc(ember.x, y, Math.max(0.4, radius * 0.34), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // The fire erases platform bodies, but their pale stone rims remain visible
    // through it so an engulfed route still reads as geometry rather than void.
    ctx.shadowColor = 'rgba(224, 221, 208, 0.42)';
    ctx.shadowBlur = 3;
    ctx.strokeStyle = 'rgba(218, 216, 203, 0.88)';
    ctx.lineWidth = 1.5;
    for (const platform of course.platforms) {
      const y = platform.y - cameraY;
      if (y < -PHASE2_TOWER_PLATFORM_H - 4 || y > sceneH + 4) continue;
      ctx.strokeRect(
        Math.round(platform.x) - 0.5,
        Math.round(y) - 0.5,
        Math.round(platform.w) + 1,
        PHASE2_TOWER_PLATFORM_H + 1
      );
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function renderPhaseTwoTowerAim() {
    const pattern = phase2TowerPattern;
    const course = pattern && pattern.mode === 'active' && pattern.course;
    if (!course || !course.grounded || !course.drag) return;
    const launch = phaseTwoTowerDragVector();
    if (launch.magnitude <= PHASE2_TOWER_MIN_DRAG * PHASE2_TOWER_DRAG_K) return;
    const length = 14 + launch.magnitude / phaseTwoTowerLaunchCap() * (PHASE2_TOWER_ARROW_MAX - 14);
    const angle = Math.atan2(launch.vy, launch.vx);
    const startX = hero.x;
    const startY = hero.y;
    const endX = startX + Math.cos(angle) * length;
    const endY = startY + Math.sin(angle) * length;
    ctx.save();
    if (phaseTwoTowerHasTrajectoryPreview() && launch.vy < 0) {
      const predicted = phaseTwoTowerTrajectoryPoints(course, launch);
      let apexIndex = 0;
      for (let i = 1; i < predicted.length; i++) {
        if (predicted[i].y < predicted[apexIndex].y) apexIndex = i;
      }
      const points = predicted.slice(0, apexIndex + 3);
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const descentStep = Math.max(0, i - apexIndex);
        const screenY = point.y - course.cameraY;
        if (screenY < -8 || screenY > canvas.height + 8) continue;
        ctx.beginPath();
        ctx.arc(point.x, screenY, descentStep === 0 ? 3 : descentStep === 1 ? 2.5 : 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(78, 12, 16, ${descentStep === 0 ? 0.72 : descentStep === 1 ? 0.42 : 0.14})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(226, 220, 205, ${descentStep === 0 ? 0.92 : descentStep === 1 ? 0.55 : 0.18})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#dfdcd0';
    ctx.fillStyle = '#dfdcd0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.translate(endX, endY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -4);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function renderPhaseTwoDoomFloor() {
    const pattern = phase2DoomPattern;
    if (!pattern || pattern.mode === 'reshape') return;
    const size = phaseTwoDoomNoteSize(pattern);
    const currentBeat = phaseTwoDoomBeatNow();
    ctx.save();
    if (pattern.mode === 'ending-expand') {
      renderPhaseTwoDoomEndSquare(pattern.currentSquare, size);
      ctx.restore();
      return;
    }
    for (const slash of pattern.slashes) {
      if (slash.square && slash.age < 0) renderPhaseTwoDoomSquare(slash.square, size, 0.88);
    }
    if (pattern.debrisSquare) renderPhaseTwoDoomDebris(pattern.debrisSquare, size);
    if (pattern.currentSquare && (!pattern.debrisSquare ||
        Math.hypot(pattern.currentSquare.x - pattern.debrisSquare.x, pattern.currentSquare.y - pattern.debrisSquare.y) > 1)) {
      renderPhaseTwoDoomSquare(pattern.currentSquare, size, 1);
    }
    for (const note of pattern.notes) {
      if (note.judged) continue;
      const approachBeats = Math.max(0.001, note.hitBeat - note.spawnBeat);
      const remaining = clamp01((note.hitBeat - currentBeat) / approachBeats);
      const ringScale = 1 + 1.35 * remaining;
      const shake = note.shakeAge > 0 ? Math.sin(note.shakeAge * 0.13) * 6 : 0;
      const x = note.x + shake;
      const y = note.y;
      renderPhaseTwoDoomSquare({ x, y, seed: note.seed }, size, 0.92);
      const ringSize = (size + 8) * ringScale;
      ctx.globalAlpha = Math.min(1, 0.35 + 0.65 * (1 - remaining));
      ctx.strokeStyle = '#d5d3c9';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - ringSize / 2, y - ringSize / 2, ringSize, ringSize);
      ctx.globalAlpha = 1;
    }
    const nextNote = pattern.notes.filter((note) => !note.judged)
      .sort((a, b) => a.hitBeat - b.hitBeat)[0];
    if (nextNote && pattern.currentSquare) {
      const approachBeats = Math.max(0.001, nextNote.hitBeat - nextNote.spawnBeat);
      const remaining = clamp01((nextNote.hitBeat - currentBeat) / approachBeats);
      const growth = smoothstep(1 - remaining);
      const square = pattern.currentSquare;
      const half = size / 2 - 5;
      ctx.lineCap = 'square';
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const fromX = square.x + sx * half;
          const fromY = square.y + sy * half;
          const toX = fromX + (square.x - fromX) * growth;
          const toY = fromY + (square.y - fromY) * growth;
          ctx.beginPath();
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(toX, toY);
          ctx.strokeStyle = 'rgba(94, 7, 31, 0.78)';
          ctx.lineWidth = 9;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(4, 2, 7, 0.96)';
          ctx.lineWidth = 5;
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function renderPhaseTwoDoomEndSquare(square, size) {
    if (!square) return;
    const half = size / 2;
    ctx.save();
    ctx.fillStyle = '#4b4a45';
    ctx.fillRect(square.x - half, square.y - half, size, size);
    if (!cobbledFloorPattern) cobbledFloorPattern = ctx.createPattern(cobbledFloorCanvas, 'repeat');
    if (cobbledFloorPattern) {
      ctx.fillStyle = cobbledFloorPattern;
      ctx.fillRect(square.x - half, square.y - half, size, size);
    }
    ctx.strokeStyle = 'rgba(226, 224, 211, 0.94)';
    ctx.lineWidth = Math.max(2, Math.min(6, size * 0.018));
    ctx.strokeRect(square.x - half + 1, square.y - half + 1, size - 2, size - 2);
    ctx.restore();
  }

  function phaseTwoMayhemFanCenters(under) {
    const inset = BORDER + PAD + 8;
    const width = Math.max(1, canvas.width - inset * 2);
    const height = Math.max(1, canvas.height - inset * 2);
    const centers = [
      { x: inset + width * 0.25, y: inset + height * 0.25 },
      { x: inset + width * 0.75, y: inset + height * 0.25 },
      { x: inset + width * 0.25, y: inset + height * 0.75 },
      { x: inset + width * 0.75, y: inset + height * 0.75 },
    ];
    const orbitAngle = under && Number.isFinite(under.orbitAngle) ? under.orbitAngle : 0;
    if (Math.abs(orbitAngle) < 0.000001) return centers;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const cosine = Math.cos(orbitAngle);
    const sine = Math.sin(orbitAngle);
    return centers.map((center) => {
      const dx = center.x - centerX;
      const dy = center.y - centerY;
      return {
        x: centerX + dx * cosine - dy * sine,
        y: centerY + dx * sine + dy * cosine,
      };
    });
  }

  function phaseTwoMayhemBladePolygon(cx, cy, angle, growth, shadow) {
    const length = PHASE2_MAYHEM_BLADE_LENGTH * clamp01(growth);
    const root = PHASE2_MAYHEM_HUB_RADIUS * 0.55;
    const maxHalfWidth = (shadow
      ? PHASE2_MAYHEM_SHADOW_HALF_WIDTH
      : PHASE2_MAYHEM_BLADE_HALF_WIDTH) * smoothstep(growth);
    const segments = 12;
    const centerline = [];
    for (let index = 0; index <= segments; index++) {
      const t = index / segments;
      const radius = root + (length - root) * t;
      // Positive angles turn clockwise in canvas space, so subtracting the
      // sweep makes the blade bow backward like a real fan blade.
      const sweptAngle = angle - PHASE2_MAYHEM_BLADE_SWEEP * smoothstep(t);
      centerline.push({
        x: cx + Math.cos(sweptAngle) * radius,
        y: cy + Math.sin(sweptAngle) * radius,
        t,
      });
    }
    const left = [];
    const right = [];
    for (let index = 0; index < centerline.length; index++) {
      const point = centerline[index];
      const previous = centerline[Math.max(0, index - 1)];
      const next = centerline[Math.min(centerline.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      const rootGrowth = 0.38 + smoothstep(point.t / 0.24) * 0.62;
      const tipTaper = point.t < 0.72
        ? 1
        : Math.pow(Math.max(0, (1 - point.t) / 0.28), 0.62);
      const profile = rootGrowth * tipTaper;
      const halfWidth = maxHalfWidth * Math.max(0, profile);
      const nx = -dy / magnitude;
      const ny = dx / magnitude;
      left.push({ x: point.x + nx * halfWidth, y: point.y + ny * halfWidth });
      right.push({ x: point.x - nx * halfWidth, y: point.y - ny * halfWidth });
    }
    return left.concat(right.reverse());
  }

  function tracePhaseTwoMayhemPolygon(g, polygon) {
    g.beginPath();
    for (let index = 0; index < polygon.length; index++) {
      const point = polygon[index];
      if (index === 0) g.moveTo(point.x, point.y);
      else g.lineTo(point.x, point.y);
    }
    g.closePath();
  }

  function renderPhaseTwoMayhemBlade(cx, cy, angle, growth, seed) {
    if (growth <= 0.01) return;
    const polygon = phaseTwoMayhemBladePolygon(cx, cy, angle, growth);
    ctx.save();
    ctx.lineJoin = 'round';
    tracePhaseTwoMayhemPolygon(ctx, polygon);
    ctx.fillStyle = '#030305';
    ctx.shadowColor = 'rgba(222, 12, 24, 0.38)';
    ctx.shadowBlur = 7;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#d31420';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.clip();
    const length = PHASE2_MAYHEM_BLADE_LENGTH * growth;
    for (let index = 0; index < 3; index++) {
      const angularOffset = (index - 1) * 0.012 + Math.sin(seed + index * 2.7) * 0.003;
      const startAngle = angle + angularOffset;
      const controlAngle = angle - PHASE2_MAYHEM_BLADE_SWEEP * 0.24 + angularOffset;
      const endAngle = angle - PHASE2_MAYHEM_BLADE_SWEEP * 0.78 + angularOffset;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(startAngle) * 18, cy + Math.sin(startAngle) * 18);
      ctx.quadraticCurveTo(
        cx + Math.cos(controlAngle) * length * 0.48,
        cy + Math.sin(controlAngle) * length * 0.48,
        cx + Math.cos(endAngle) * length * (0.76 + index * 0.045),
        cy + Math.sin(endAngle) * length * (0.76 + index * 0.045)
      );
      ctx.strokeStyle = index % 2
        ? 'rgba(118, 8, 18, 0.30)'
        : 'rgba(215, 210, 198, 0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderPhaseTwoMayhemShadow(cx, cy, angle, growth) {
    if (growth <= 0.01) return;
    const polygon = phaseTwoMayhemBladePolygon(
      cx,
      cy,
      angle + PHASE2_MAYHEM_SHADOW_LEAD,
      growth,
      true
    );
    ctx.save();
    ctx.lineJoin = 'round';
    tracePhaseTwoMayhemPolygon(ctx, polygon);
    ctx.fillStyle = 'rgba(34, 5, 48, 0.52)';
    ctx.shadowColor = 'rgba(74, 20, 96, 0.42)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(94, 42, 118, 0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function renderPhaseTwoMayhemSpearRain(under) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const arrow of under.arrows) {
      const fade = arrow.dead
        ? 1 - smoothstep(arrow.fadeAge / 620)
        : Math.min(1, arrow.age / 90);
      if (fade <= 0.001 || arrow.trail.length < 2) continue;
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.moveTo(arrow.trail[0].x, arrow.trail[0].y);
      for (let index = 1; index < arrow.trail.length; index++) {
        ctx.lineTo(arrow.trail[index].x, arrow.trail[index].y);
      }
      ctx.strokeStyle = 'rgba(174, 8, 22, 0.54)';
      ctx.lineWidth = 7;
      ctx.shadowColor = 'rgba(216, 15, 28, 0.48)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(3, 2, 5, 0.92)';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (arrow.dead) continue;

      const angle = Math.atan2(arrow.dy, arrow.dx);
      ctx.save();
      ctx.translate(arrow.x, arrow.y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(5, -20);
      ctx.lineTo(-35, -20);
      ctx.lineTo(-35, 20);
      ctx.lineTo(5, 20);
      ctx.closePath();
      ctx.fillStyle = 'rgba(35, 5, 50, 0.72)';
      ctx.shadowColor = 'rgba(96, 32, 126, 0.64)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.strokeStyle = 'rgba(102, 48, 132, 0.72)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(2, -6);
      ctx.lineTo(2, -2.5);
      ctx.lineTo(-21, -2.5);
      ctx.lineTo(-27, -7);
      ctx.lineTo(-24, 0);
      ctx.lineTo(-27, 7);
      ctx.lineTo(-21, 2.5);
      ctx.lineTo(2, 2.5);
      ctx.closePath();
      ctx.fillStyle = '#030305';
      ctx.shadowColor = 'rgba(225, 12, 25, 0.72)';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#e11926';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-19, 0);
      ctx.lineTo(9, 0);
      ctx.strokeStyle = 'rgba(118, 10, 20, 0.76)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function phaseTwoMayhemColumnChevronPolygon(attack, shadow = false) {
    const points = [];
    const segments = 12;
    const height = PHASE2_MAYHEM_COLUMN_CHEVRON_HEIGHT;
    const centerY = attack.y +
      (shadow ? attack.direction * PHASE2_MAYHEM_COLUMN_SHADOW_LEAD : 0);
    for (let index = 0; index <= segments; index++) {
      const t = index / segments;
      const x = attack.left + (attack.right - attack.left) * t;
      const ridge = 1 - Math.abs(t * 2 - 1);
      const edgeFade = Math.sin(t * Math.PI);
      const roughness = Math.sin(attack.seed + index * 2.173) * 3.2 * edgeFade +
        Math.sin(attack.seed * 0.43 + index * 4.91) * 1.5 * edgeFade;
      const y = attack.direction < 0
        ? centerY + height / 2 - ridge * height + roughness
        : centerY - height / 2 + ridge * height - roughness;
      points.push({ x, y, t });
    }
    const outer = [];
    const inner = [];
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      const nx = -dy / magnitude;
      const ny = dx / magnitude;
      const edgeNoise = 0.82 +
        Math.abs(Math.sin(attack.seed * 1.7 + index * 3.37)) * 0.34;
      const width = (shadow
        ? PHASE2_MAYHEM_COLUMN_SHADOW_HALF_WIDTH
        : PHASE2_MAYHEM_COLUMN_CHEVRON_HALF_WIDTH) * edgeNoise;
      outer.push({ x: point.x + nx * width, y: point.y + ny * width });
      inner.push({ x: point.x - nx * width, y: point.y - ny * width });
    }
    const polygon = outer.concat(inner.reverse());
    const rotation = attack.rotation || 0;
    if (Math.abs(rotation) < 0.000001) return polygon;
    const centerX = (attack.left + attack.right) / 2;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    return polygon.map((point) => {
      const dx = point.x - centerX;
      const dy = point.y - attack.y;
      return {
        x: centerX + dx * cosine - dy * sine,
        y: attack.y + dx * sine + dy * cosine,
      };
    });
  }

  function renderPhaseTwoMayhemColumnSurge(under) {
    const bounds = phaseTwoMayhemSpearBounds();
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    ctx.clip();

    const laneWidth = (bounds.right - bounds.left) / 3;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(112, 8, 18, 0.24)';
    for (let lane = 1; lane < 3; lane++) {
      const x = bounds.left + laneWidth * lane;
      ctx.beginPath();
      ctx.moveTo(x, bounds.top);
      ctx.lineTo(x, bounds.bottom);
      ctx.stroke();
    }

    ctx.lineJoin = 'miter';
    for (const attack of under.attacks) {
      if (!attack.active) continue;
      const shadowPolygon = phaseTwoMayhemColumnChevronPolygon(attack, true);
      tracePhaseTwoMayhemPolygon(ctx, shadowPolygon);
      ctx.fillStyle = 'rgba(35, 5, 49, 0.58)';
      ctx.shadowColor = 'rgba(83, 28, 108, 0.46)';
      ctx.shadowBlur = 9;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(102, 48, 126, 0.42)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const attack of under.attacks) {
      if (!attack.active) continue;
      const polygon = phaseTwoMayhemColumnChevronPolygon(attack);
      tracePhaseTwoMayhemPolygon(ctx, polygon);
      ctx.fillStyle = '#020204';
      ctx.shadowColor = 'rgba(224, 9, 22, 0.58)';
      ctx.shadowBlur = 9;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#e01624';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      tracePhaseTwoMayhemPolygon(ctx, polygon);
      ctx.clip();
      for (let streak = 0; streak < 4; streak++) {
        const t = (streak + 0.5) / 4;
        const x = attack.left + (attack.right - attack.left) * t;
        const jitter = Math.sin(attack.seed + streak * 4.71) * 8;
        ctx.beginPath();
        ctx.moveTo(x - 18, attack.y + jitter - 17);
        ctx.lineTo(x + 16, attack.y + jitter + 19);
        ctx.strokeStyle = streak % 2
          ? 'rgba(205, 13, 25, 0.22)'
          : 'rgba(210, 205, 194, 0.07)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function phaseTwoMayhemTrianglePolygon(attack) {
    const bounds = phaseTwoMayhemSpearBounds();
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    let corners;
    if (attack.side === 'top') {
      corners = [
        { x: bounds.left, y: bounds.top },
        { x: bounds.right, y: bounds.top },
        { x: bounds.left + width * 0.75, y: bounds.bottom },
        { x: bounds.left + width * 0.25, y: bounds.bottom },
      ];
    } else if (attack.side === 'bottom') {
      corners = [
        { x: bounds.left, y: bounds.bottom },
        { x: bounds.right, y: bounds.bottom },
        { x: bounds.left + width * 0.75, y: bounds.top },
        { x: bounds.left + width * 0.25, y: bounds.top },
      ];
    } else if (attack.side === 'left') {
      corners = [
        { x: bounds.left, y: bounds.top },
        { x: bounds.right, y: bounds.top + height * 0.25 },
        { x: bounds.right, y: bounds.top + height * 0.75 },
        { x: bounds.left, y: bounds.bottom },
      ];
    } else {
      corners = [
        { x: bounds.right, y: bounds.top },
        { x: bounds.left, y: bounds.top + height * 0.25 },
        { x: bounds.left, y: bounds.top + height * 0.75 },
        { x: bounds.right, y: bounds.bottom },
      ];
    }

    const polygon = [];
    const segments = 7;
    for (let edge = 0; edge < corners.length; edge++) {
      const from = corners[edge];
      const to = corners[(edge + 1) % corners.length];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      const nx = -dy / magnitude;
      const ny = dx / magnitude;
      for (let index = 0; index < segments; index++) {
        const t = index / segments;
        const taper = Math.sin(t * Math.PI);
        const noise = (
          Math.sin(attack.seed + edge * 7.17 + index * 2.31) * 3.8 +
          Math.sin(attack.seed * 0.37 + edge * 3.9 + index * 5.43) * 1.9
        ) * taper;
        polygon.push({
          x: from.x + dx * t + nx * noise,
          y: from.y + dy * t + ny * noise,
        });
      }
    }
    return polygon;
  }

  function phaseTwoMayhemTriangleGradient(attack, bounds) {
    if (attack.side === 'top') {
      return ctx.createLinearGradient(0, bounds.top, 0, bounds.bottom);
    }
    if (attack.side === 'bottom') {
      return ctx.createLinearGradient(0, bounds.bottom, 0, bounds.top);
    }
    if (attack.side === 'left') {
      return ctx.createLinearGradient(bounds.left, 0, bounds.right, 0);
    }
    return ctx.createLinearGradient(bounds.right, 0, bounds.left, 0);
  }

  function renderPhaseTwoMayhemGiantTriangles(under) {
    const bounds = phaseTwoMayhemSpearBounds();
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    ctx.clip();
    ctx.lineJoin = 'miter';

    for (const attack of under.attacks) {
      const polygon = phaseTwoMayhemTrianglePolygon(attack);
      if (attack.phase === 'telegraph') {
        const buildup = clamp01(
          attack.phaseAge / PHASE2_MAYHEM_TRIANGLE_TELEGRAPH_BEATS
        );
        const pulse = 0.5 + 0.5 * Math.sin(attack.phaseAge * Math.PI * 2);
        tracePhaseTwoMayhemPolygon(ctx, polygon);
        ctx.shadowColor = `rgba(128, 54, 176, ${(0.20 + pulse * 0.30).toFixed(3)})`;
        ctx.shadowBlur = 3 + pulse * 4;
        ctx.strokeStyle = `rgba(153, 78, 202, ${(0.48 + buildup * 0.26 + pulse * 0.20).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowBlur = 0;
        continue;
      }

      const strikeAge = attack.phaseAge;
      const strikeProgress = smoothstep(clamp01(strikeAge / 0.18));
      const fadeStart = PHASE2_MAYHEM_TRIANGLE_STRIKE_BEATS;
      const fade = strikeAge <= fadeStart
        ? 1
        : 1 - smoothstep(clamp01(
          (strikeAge - fadeStart) / PHASE2_MAYHEM_TRIANGLE_FADE_BEATS
        ));
      if (fade <= 0.001) continue;

      ctx.save();
      ctx.globalAlpha = fade * strikeProgress;
      tracePhaseTwoMayhemPolygon(ctx, polygon);
      const gradient = phaseTwoMayhemTriangleGradient(attack, bounds);
      gradient.addColorStop(0, '#ff3a22');
      gradient.addColorStop(0.18, '#d80b16');
      gradient.addColorStop(0.66, '#80030d');
      gradient.addColorStop(1, '#360006');
      ctx.fillStyle = gradient;
      ctx.shadowColor = 'rgba(255, 25, 20, 0.9)';
      ctx.shadowBlur = 24;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ff5a36';
      ctx.lineWidth = 4;
      ctx.stroke();

      tracePhaseTwoMayhemPolygon(ctx, polygon);
      ctx.clip();
      const horizontal = attack.side === 'left' || attack.side === 'right';
      const sign = attack.side === 'top' || attack.side === 'left' ? 1 : -1;
      const span = horizontal ? bounds.right - bounds.left : bounds.bottom - bounds.top;
      const across = horizontal ? bounds.bottom - bounds.top : bounds.right - bounds.left;
      for (let flame = 0; flame < 18; flame++) {
        const lane = (flame + 0.5) / 18;
        const flicker = Math.sin(attack.seed + flame * 4.13 + strikeAge * 11) * 12;
        const sourceAlong = horizontal ? bounds.left : bounds.top;
        const start = sign > 0 ? sourceAlong : sourceAlong + span;
        const end = start + sign * span * (0.46 + (flame % 5) * 0.08);
        const cross = (horizontal ? bounds.top : bounds.left) + across * lane + flicker;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(start, cross);
          ctx.quadraticCurveTo((start + end) / 2, cross + flicker * 0.8, end, cross - flicker * 0.3);
        } else {
          ctx.moveTo(cross, start);
          ctx.quadraticCurveTo(cross + flicker * 0.8, (start + end) / 2, cross - flicker * 0.3, end);
        }
        ctx.strokeStyle = flame % 3
          ? 'rgba(255, 105, 42, 0.34)'
          : 'rgba(255, 226, 165, 0.48)';
        ctx.lineWidth = 2 + (flame % 4);
        ctx.stroke();
      }
      if (strikeAge < 0.12) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - strikeAge / 0.12) * 0.7;
        ctx.fillStyle = '#ffe0c2';
        ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function phaseTwoMayhemWaveformScrollOffsets(under) {
    const pixelsPerBeat = PHASE2_MAYHEM_WAVEFORM_BAR_SPACING *
      PHASE2_MAYHEM_WAVEFORM_SCROLL_BARS_PER_BEAT;
    const live = under.elapsedBeats * pixelsPerBeat;
    const previewLeadBeats = PHASE2_MAYHEM_WAVEFORM_PREVIEW_MS / Math.max(1, beatMs);
    return {
      live,
      preview: live + previewLeadBeats * pixelsPerBeat,
    };
  }

  function phaseTwoMayhemWaveformBars(samples, scrollOffset) {
    const bounds = phaseTwoMayhemSpearBounds();
    if (!samples || samples.length < 2) return [];
    const height = bounds.bottom - bounds.top;
    const amplitude = Math.max(
      1,
      height / 4 - PHASE2_MAYHEM_WAVEFORM_EDGE_INSET
    );
    const horizontalInset = 3;
    const left = bounds.left + horizontalInset;
    const width = bounds.right - bounds.left - horizontalInset * 2;
    const pathLength = width * 2;
    const barCount = Math.max(
      4,
      Math.round(pathLength / PHASE2_MAYHEM_WAVEFORM_BAR_SPACING)
    );
    const pathSpacing = pathLength / barCount;
    const scroll = ((scrollOffset % pathLength) + pathLength) % pathLength;
    const bars = [];
    for (let index = 0; index < barCount; index++) {
      const pathPosition = (index * pathSpacing + scroll) % pathLength;
      const topRow = pathPosition < width;
      const x = topRow
        ? left + pathPosition
        : left + pathLength - pathPosition;
      const centerY = bounds.top + height * (topRow ? 0.25 : 0.75);
      const timeline = pathPosition / pathLength;
      const sampleAt = timeline * (samples.length - 1);
      const sampleIndex = Math.floor(sampleAt);
      const nextSampleIndex = Math.min(samples.length - 1, sampleIndex + 1);
      const sampleMix = sampleAt - sampleIndex;
      const sample = samples[sampleIndex] +
        (samples[nextSampleIndex] - samples[sampleIndex]) * sampleMix;
      const strength = Math.min(1, Math.abs(sample));
      const halfHeight = PHASE2_MAYHEM_WAVEFORM_BAR_MIN_HALF_HEIGHT +
        strength * Math.max(0, amplitude - PHASE2_MAYHEM_WAVEFORM_BAR_MIN_HALF_HEIGHT);
      bars.push({
        x,
        top: centerY - halfHeight,
        bottom: centerY + halfHeight,
      });
    }
    return bars;
  }

  function phaseTwoMayhemWaveformBarPolygons(samples, halfWidth, scrollOffset) {
    return phaseTwoMayhemWaveformBars(samples, scrollOffset).map((bar) => [
      { x: bar.x - halfWidth, y: bar.top - halfWidth },
      { x: bar.x + halfWidth, y: bar.top - halfWidth },
      { x: bar.x + halfWidth, y: bar.bottom + halfWidth },
      { x: bar.x - halfWidth, y: bar.bottom + halfWidth },
    ]);
  }

  function tracePhaseTwoMayhemWaveformBars(bars) {
    ctx.beginPath();
    for (const bar of bars) {
      ctx.moveTo(bar.x, bar.top);
      ctx.lineTo(bar.x, bar.bottom);
    }
  }

  function renderPhaseTwoMayhemAudioWaveform(under) {
    const scrollOffsets = phaseTwoMayhemWaveformScrollOffsets(under);
    const previewBars = phaseTwoMayhemWaveformBars(under.previewSamples, scrollOffsets.preview);
    const liveBars = under.liveReady
      ? phaseTwoMayhemWaveformBars(under.liveSamples, scrollOffsets.live)
      : [];
    const bounds = phaseTwoMayhemSpearBounds();
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    ctx.clip();
    ctx.lineCap = 'round';

    if (previewBars.length) {
      const pulse = 0.5 + 0.5 * Math.sin(under.elapsedMs * 0.012);
      tracePhaseTwoMayhemWaveformBars(previewBars);
      ctx.strokeStyle = `rgba(111, 45, 150, ${(0.42 + pulse * 0.15).toFixed(3)})`;
      ctx.lineWidth = PHASE2_MAYHEM_WAVEFORM_SHADOW_HALF_WIDTH * 2;
      ctx.shadowColor = 'rgba(126, 55, 166, 0.52)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      tracePhaseTwoMayhemWaveformBars(previewBars);
      ctx.strokeStyle = 'rgba(192, 116, 224, 0.88)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (liveBars.length) {
      tracePhaseTwoMayhemWaveformBars(liveBars);
      ctx.strokeStyle = '#e31a29';
      ctx.lineWidth = PHASE2_MAYHEM_WAVEFORM_LIVE_HALF_WIDTH * 2;
      ctx.shadowColor = 'rgba(232, 10, 24, 0.72)';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      tracePhaseTwoMayhemWaveformBars(liveBars);
      ctx.strokeStyle = '#020204';
      ctx.lineWidth = 2;
      ctx.stroke();
      tracePhaseTwoMayhemWaveformBars(liveBars);
      ctx.strokeStyle = 'rgba(183, 12, 24, 0.72)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderPhaseTwoMayhem() {
    const pattern = phase2MayhemPattern;
    const under = pattern && pattern.underPattern;
    if (!under) return;
    if (under.type === 'spearRain') {
      renderPhaseTwoMayhemSpearRain(under);
      return;
    }
    if (under.type === 'columnSurge') {
      renderPhaseTwoMayhemColumnSurge(under);
      return;
    }
    if (under.type === 'giantTriangles') {
      renderPhaseTwoMayhemGiantTriangles(under);
      return;
    }
    if (under.type === 'audioWaveform') {
      renderPhaseTwoMayhemAudioWaveform(under);
      return;
    }
    if (under.type !== 'quadrantFans') return;
    const hubGrowth = easeOutCubic(clamp01(under.elapsed / PHASE2_MAYHEM_HUB_FORM_MS));
    const firstGrowth = easeOutCubic(clamp01(
      (under.elapsed - PHASE2_MAYHEM_HUB_FORM_MS) / PHASE2_MAYHEM_BLADE_FORM_MS
    ));
    const secondStart = PHASE2_MAYHEM_HUB_FORM_MS + PHASE2_MAYHEM_TWO_BLADE_MS;
    const secondGrowth = easeOutCubic(clamp01(
      (under.elapsed - secondStart) / PHASE2_MAYHEM_BLADE_FORM_MS
    ));
    const centers = phaseTwoMayhemFanCenters(under);
    ctx.save();
    if (under.fadeAge >= 0) {
      ctx.globalAlpha = 1 - smoothstep(under.fadeAge / PHASE2_MAYHEM_FADE_MS);
    }
    for (let index = 0; index < centers.length; index++) {
      const center = centers[index];
      const fan = under.fans[index];
      for (let bladeIndex = 0; bladeIndex < PHASE2_MAYHEM_BLADE_OFFSETS.length; bladeIndex++) {
        renderPhaseTwoMayhemShadow(
          center.x,
          center.y,
          fan.angle + PHASE2_MAYHEM_BLADE_OFFSETS[bladeIndex],
          bladeIndex < 2 ? firstGrowth : secondGrowth
        );
      }
    }
    for (let index = 0; index < centers.length; index++) {
      const center = centers[index];
      const fan = under.fans[index];
      for (let bladeIndex = 0; bladeIndex < PHASE2_MAYHEM_BLADE_OFFSETS.length; bladeIndex++) {
        renderPhaseTwoMayhemBlade(
          center.x,
          center.y,
          fan.angle + PHASE2_MAYHEM_BLADE_OFFSETS[bladeIndex],
          bladeIndex < 2 ? firstGrowth : secondGrowth,
          under.seed + index * 4 + bladeIndex
        );
      }

      const radius = PHASE2_MAYHEM_HUB_RADIUS * hubGrowth;
      if (radius <= 0.01) continue;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#570611';
      ctx.shadowColor = 'rgba(220, 10, 24, 0.48)';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#df1724';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = '#030305';
      ctx.fill();
      ctx.strokeStyle = 'rgba(116, 7, 16, 0.88)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (under.elapsed < PHASE2_MAYHEM_HUB_FORM_MS) {
        const pulse = 1 - clamp01(under.elapsed / PHASE2_MAYHEM_HUB_FORM_MS);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius + pulse * 22, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(220, 16, 28, ${(pulse * 0.68).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function renderPhaseTwoDoomSquare(square, size, alpha) {
    if (!square) return;
    const half = size / 2;
    const seed = square.seed || 0;
    const wall = Math.max(8, Math.round(size * 0.13));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#4b4a45';
    ctx.fillRect(square.x - half, square.y - half, size, size);
    if (!cobbledFloorPattern) cobbledFloorPattern = ctx.createPattern(cobbledFloorCanvas, 'repeat');
    if (cobbledFloorPattern) {
      ctx.fillStyle = cobbledFloorPattern;
      ctx.fillRect(square.x - half, square.y - half, size, size);
    }
    ctx.fillStyle = 'rgba(202, 199, 186, 0.16)';
    ctx.fillRect(square.x - half + 2, square.y - half + 2, size - 4, 2);
    ctx.fillRect(square.x - half + 2, square.y - half + 2, 2, size - 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.fillRect(square.x - half + wall - 1, square.y - half + wall - 1, size - wall * 2 + 2, size - wall * 2 + 2);
    ctx.fillStyle = '#020204';
    ctx.fillRect(square.x - half + wall + 2, square.y - half + wall + 2, size - wall * 2 - 4, size - wall * 2 - 4);
    ctx.beginPath();
    ctx.rect(
      square.x - half + wall + 3,
      square.y - half + wall + 3,
      size - wall * 2 - 6,
      size - wall * 2 - 6
    );
    ctx.clip();
    for (let i = 0; i < 10; i++) {
      const innerSize = size - wall * 2;
      const px = square.x - innerSize / 2 + ((Math.sin(seed * 13.7 + i * 91.3) * 0.5 + 0.5) * innerSize);
      const py = square.y - innerSize / 2 + ((Math.sin(seed * 31.9 + i * 47.1) * 0.5 + 0.5) * innerSize);
      const length = 4 + (i % 3) * 3;
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(105, 16, 27, 0.19)' : 'rgba(205, 202, 190, 0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - length, py + (i % 2 ? 2 : -2));
      ctx.lineTo(px + length, py);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(218, 216, 203, 0.92)';
    ctx.lineWidth = 2;
    ctx.strokeRect(square.x - half + 1, square.y - half + 1, size - 2, size - 2);
    ctx.strokeStyle = 'rgba(20, 20, 19, 0.96)';
    ctx.lineWidth = 3;
    ctx.strokeRect(
      square.x - half + wall + 0.5,
      square.y - half + wall + 0.5,
      size - wall * 2 - 1,
      size - wall * 2 - 1
    );
    ctx.strokeStyle = 'rgba(185, 181, 168, 0.54)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      square.x - half + wall + 2.5,
      square.y - half + wall + 2.5,
      size - wall * 2 - 5,
      size - wall * 2 - 5
    );
    ctx.restore();
  }

  function renderPhaseTwoDoomDebris(square, size) {
    if (!square) return;
    const half = size / 2;
    const gap = Math.max(5, Math.round(size * 0.09));
    const seed = square.seed || 0;
    const pieces = [
      [-half, -half, -gap, -gap, -2, -2],
      [gap, -half, half, -gap, 3, -1],
      [-half, gap, -gap, half, -3, 2],
      [gap, gap, half, half, 2, 3],
    ];
    ctx.save();
    ctx.lineJoin = 'bevel';
    for (let i = 0; i < pieces.length; i++) {
      const [left, top, right, bottom, shiftX, shiftY] = pieces[i];
      const biteA = 2 + Math.abs(Math.sin(seed * 7.1 + i * 2.3)) * 5;
      const biteB = 2 + Math.abs(Math.sin(seed * 11.7 + i * 4.9)) * 5;
      ctx.beginPath();
      ctx.moveTo(square.x + left + shiftX, square.y + top + shiftY);
      ctx.lineTo(square.x + right - biteA + shiftX, square.y + top + shiftY);
      ctx.lineTo(square.x + right + shiftX, square.y + bottom - biteB + shiftY);
      ctx.lineTo(square.x + left + biteB + shiftX, square.y + bottom + shiftY);
      ctx.lineTo(square.x + left + shiftX, square.y + top + biteA + shiftY);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#252626';
      ctx.fillRect(square.x - half - 8, square.y - half - 8, size + 16, size + 16);
      if (!cobbledFloorPattern) cobbledFloorPattern = ctx.createPattern(cobbledFloorCanvas, 'repeat');
      if (cobbledFloorPattern) {
        ctx.fillStyle = cobbledFloorPattern;
        ctx.fillRect(square.x - half - 8, square.y - half - 8, size + 16, size + 16);
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(203, 201, 189, 0.72)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(115, 12, 22, 0.70)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const angle = seed + i * Math.PI / 3;
      const inner = gap * 0.25;
      const outer = half * (0.62 + (i % 2) * 0.18);
      ctx.beginPath();
      ctx.moveTo(square.x + Math.cos(angle) * inner, square.y + Math.sin(angle) * inner);
      ctx.lineTo(square.x + Math.cos(angle + 0.12) * outer, square.y + Math.sin(angle + 0.12) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  function tracePhaseTwoDoomSlash(g, slash, angle, length) {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const px = -uy;
    const py = ux;
    const segments = 8;
    g.beginPath();
    for (let i = 0; i <= segments; i++) {
      const along = -length / 2 + length * i / segments;
      const edgeFade = Math.sin(i / segments * Math.PI);
      const jag = Math.sin(slash.seed * 7.3 + i * 4.91 + angle * 3.7) * 4.5 * edgeFade;
      const x = slash.x + ux * along + px * jag;
      const y = slash.y + uy * along + py * jag;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }

  function renderPhaseTwoDoomEffects() {
    const pattern = phase2DoomPattern;
    if (!pattern || pattern.mode !== 'active') return;
    const slashLength = phaseTwoDoomNoteSize(pattern) * 2.12;
    ctx.save();
    for (const slash of pattern.slashes) {
      if (slash.age < 0) continue;
      const progress = clamp01(slash.age / slash.duration);
      const reach = easeOutCubic(clamp01(progress / 0.28));
      const fade = 1 - smoothstep((progress - 0.55) / 0.45);
      if (progress < 0.20) {
        const impact = 1 - progress / 0.20;
        ctx.globalAlpha = impact * (slash.punish ? 0.34 : 0.25);
        ctx.fillStyle = progress < 0.055 ? '#fff8ed' : '#ff201c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = impact * 0.9;
        ctx.strokeStyle = progress < 0.07 ? '#fff8ed' : '#e21b24';
        ctx.lineWidth = 3 + impact * 5;
        ctx.beginPath();
        ctx.arc(slash.x, slash.y, slashLength * (0.18 + progress * 2.5), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = fade;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        tracePhaseTwoDoomSlash(ctx, slash, angle, slashLength * reach);
        ctx.strokeStyle = '#d51d22';
        ctx.lineWidth = 10;
        ctx.shadowColor = 'rgba(220, 20, 28, 0.78)';
        ctx.shadowBlur = 8;
        ctx.stroke();
        tracePhaseTwoDoomSlash(ctx, slash, angle, slashLength * reach);
        ctx.strokeStyle = '#020204';
        ctx.lineWidth = 6;
        ctx.shadowBlur = 0;
        ctx.stroke();
      }
      ctx.globalAlpha = fade * (1 - progress);
      ctx.fillStyle = '#aaa89d';
      for (let i = 0; i < 8; i++) {
        const angle = slash.seed + i * Math.PI / 4;
        const distance = 10 + progress * (18 + i % 3 * 5);
        const size = Math.max(1, 4 * (1 - progress));
        ctx.fillRect(
          slash.x + Math.cos(angle) * distance - size / 2,
          slash.y + Math.sin(angle) * distance - size / 2,
          size,
          size
        );
      }
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '10px "Press Start 2P", monospace';
    for (const judgment of pattern.judgments) {
      const progress = clamp01(judgment.age / judgment.duration);
      ctx.globalAlpha = 1 - smoothstep((progress - 0.35) / 0.65);
      ctx.fillStyle = judgment.kind === 'perfect'
        ? '#ffd23e'
        : judgment.kind === 'great' ? '#7fd86b' : judgment.kind === 'ok' ? '#5fd9ff' : '#ff4038';
      ctx.fillText(judgment.text, judgment.x, judgment.y - 24 - progress * 28);
    }
    ctx.restore();
  }

  function renderScene() {
    const sceneW = canvas ? canvas.width : BOARD;
    const sceneH = canvas ? canvas.height : BOARD;
    ctx.clearRect(0, 0, sceneW, sceneH);
    const calcify = phaseTwoArenaProgress();
    ctx.save();
    arenaPath(ctx, 0);
    ctx.clip();

    const towerActive = phase === PHASE.SECOND && !!(phase2TowerPattern && phase2TowerPattern.course);
    const doomActive = phase === PHASE.SECOND && !!phase2DoomPattern;
    const pitfallActive = phase === PHASE.SECOND && !!phase2PitfallPattern;
    const settledGrid = phase === PHASE.SECOND && phase2GridSpecial && phase2GridSpecial.settled;
    if (towerActive) {
      renderPhaseTwoTowerClimb(sceneW, sceneH);
    } else if (pitfallActive) {
      ctx.fillStyle = '#040406';
      ctx.fillRect(0, 0, sceneW, sceneH);
      if (!cobbledFloorPattern) cobbledFloorPattern = ctx.createPattern(cobbledFloorCanvas, 'repeat');
      if (cobbledFloorPattern) {
        ctx.fillStyle = cobbledFloorPattern;
        ctx.fillRect(0, 0, sceneW, sceneH);
      }
      renderPhaseTwoPitfall(sceneW, sceneH);
    } else if (doomActive) {
      // Leave the arena interior transparent so the animated soul ocean below
      // reads through it, matching the void exposed by the Grid Cut fissures.
    } else if (settledGrid) {
      ctx.drawImage(phaseTwoGridFloorBuffer(phase2GridSpecial), 0, 0);
    } else {
      // The empty plane inside the current arena geometry, slowly paving over
      // into darker cobbled stone as the second phase takes possession.
      ctx.fillStyle = '#040406';
      ctx.fillRect(0, 0, sceneW, sceneH);
    }
    if (!towerActive && !pitfallActive && !doomActive && !settledGrid && calcify > 0.001) {
      ctx.save();
      ctx.globalAlpha = calcify;
      if (!cobbledFloorPattern) cobbledFloorPattern = ctx.createPattern(cobbledFloorCanvas, 'repeat');
      if (cobbledFloorPattern) {
        ctx.fillStyle = cobbledFloorPattern;
        ctx.fillRect(0, 0, sceneW, sceneH);
      } else {
        ctx.drawImage(cobbledFloorCanvas, 0, 0);
      }
      const edgeWake = Math.sin(calcify * Math.PI);
      if (edgeWake > 0.001) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = edgeWake * 0.12;
        ctx.strokeStyle = '#d4d2c2';
        ctx.lineWidth = 3;
        const maxSpan = Math.max(sceneW, sceneH);
        for (let i = 0; i < 5; i++) {
          const inset = BORDER + PAD + i * 18 + calcify * 22;
          ctx.strokeRect(inset, inset, maxSpan - inset * 2, maxSpan - inset * 2);
        }
      }
      ctx.restore();
    }

    // Floor effects and edge creatures are attached to the arena transform.
    ctx.save();
    applyArenaContentTransform(ctx);

    // Pentagram burns into the floor, beneath everything else.
    if (phase === PHASE.PENTAGRAM || phase === PHASE.ACTIVE) renderPentagram();

    // Tentacles reach in from the dark edges once they have spawned.
    if (!towerActive && !pitfallActive && tentacles.length) {
      let growth = 1;
      let fade = 1;
      let retreat = 0;
      if (phase === PHASE.TENTACLES) {
        growth = easeOutCubic(Math.min(1, phaseTime / TENTACLE_GROW));
      } else if (phase === PHASE.SECOND) {
        retreat = calcify;
        growth = 1 - easeInQuad(calcify);
        fade = 1 - smoothstep((calcify - 0.72) / 0.28);
      }
      renderTentacles(growth, fade, retreat);
    }

    // Fall shadow + landing impact ring.
    if (phase === PHASE.FALL && phaseTime <= FALL_DURATION) {
      renderFallShadow(Math.min(1, phaseTime / FALL_DURATION));
    }
    renderShockwave();
    ctx.restore();

    if (!towerActive && !pitfallActive && !doomActive && phase === PHASE.SECOND && phase2GridSpecial && !phase2GridSpecial.settled) renderPhaseTwoGridFloor();
    if (!towerActive && !pitfallActive && !doomActive && phase === PHASE.SECOND && phase2Cracks.length) renderPhaseTwoGroundCracks();
    if (!towerActive && !pitfallActive && !doomActive && phase === PHASE.SECOND) renderPhaseTwoFinalTile();
    if (doomActive) renderPhaseTwoDoomFloor();
    if (phase2MayhemPattern) renderPhaseTwoMayhem();
    drawHero();
    if (towerActive) renderPhaseTwoTowerAim();
    if (pitfallActive) renderPhaseTwoPitfallImpact();
    if (doomActive) renderPhaseTwoDoomEffects();
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

  function heroTouchesPhaseTwoCrack(worldX, worldY) {
    if (phase !== PHASE.SECOND || !canvas || phase2Cracks.length === 0) return false;
    const board = getBoardRect();
    const point = worldPointToViewport(worldX, worldY, board);
    return viewportTouchesPhaseTwoCrack(point.x, point.y);
  }

  function viewportTouchesPhaseTwoCrack(vx, vy) {
    if (phase !== PHASE.SECOND || phase2Cracks.length === 0) return false;
    return phase2Cracks.some((crack) => {
      const polygon = crack.closing
        ? phaseTwoCrackPolygon(crack)
        : crack.hitPolygon || (crack.hitPolygon = phaseTwoCrackPolygon(crack));
      return pointInPoly(vx, vy, polygon);
    });
  }

  function worldPointToViewport(worldX, worldY, board) {
    const rect = board || getBoardRect();
    const worldW = canvas && canvas.width ? canvas.width : BOARD;
    const worldH = canvas && canvas.height ? canvas.height : BOARD;
    return {
      x: rect.left + worldX * rect.width / worldW,
      y: rect.top + worldY * rect.height / worldH,
    };
  }

  function heroSpriteOriginWorld() {
    return {
      x: Math.round(hero.x - HERO_W / 2),
      y: Math.round(hero.y - HERO_H / 2),
    };
  }

  function heroBodyCenterWorld() {
    const origin = heroSpriteOriginWorld();
    return {
      x: origin.x + HERO_BODY_CENTER_LOCAL.x,
      y: origin.y + HERO_BODY_CENTER_LOCAL.y,
    };
  }

  function heroBodyWorldRewardPoints() {
    const origin = heroSpriteOriginWorld();
    return HERO_BODY_PIXEL_OFFSETS.map((offset) => ({
      x: origin.x + offset.x,
      y: origin.y + offset.y,
    }));
  }

  function heroViewportHitboxes(board) {
    const rect = board || getBoardRect();
    const worldW = canvas && canvas.width ? canvas.width : BOARD;
    const worldH = canvas && canvas.height ? canvas.height : BOARD;
    const scaleX = rect.width / worldW;
    const scaleY = rect.height / worldH;
    const bodyCenter = heroBodyCenterWorld();
    const center = worldPointToViewport(bodyCenter.x, bodyCenter.y, rect);
    const damageHalfX = 2.5 * scaleX;
    const damageHalfY = 2.5 * scaleY;
    const damagePoints = [];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        damagePoints.push({
          x: center.x - damageHalfX + damageHalfX * column,
          y: center.y - damageHalfY + damageHalfY * row,
        });
      }
    }
    const rewardPoints = heroBodyWorldRewardPoints().map((point) =>
      worldPointToViewport(point.x, point.y, rect));
    return {
      center,
      damagePoints,
      rewardPoints,
      damageRect: {
        left: center.x - damageHalfX,
        top: center.y - damageHalfY,
        right: center.x + damageHalfX,
        bottom: center.y + damageHalfY,
      },
    };
  }

  function segmentIntersectsRect(x1, y1, x2, y2, rect) {
    let near = 0;
    let far = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const clipAxis = (start, delta, minimum, maximum) => {
      if (Math.abs(delta) < 0.000001) return start >= minimum && start <= maximum;
      let axisNear = (minimum - start) / delta;
      let axisFar = (maximum - start) / delta;
      if (axisNear > axisFar) [axisNear, axisFar] = [axisFar, axisNear];
      near = Math.max(near, axisNear);
      far = Math.min(far, axisFar);
      return near <= far;
    };
    return clipAxis(x1, dx, rect.left, rect.right) &&
      clipAxis(y1, dy, rect.top, rect.bottom);
  }

  function pointRectDistance(px, py, rect) {
    const dx = Math.max(rect.left - px, 0, px - rect.right);
    const dy = Math.max(rect.top - py, 0, py - rect.bottom);
    return Math.hypot(dx, dy);
  }

  function segmentRectDistance(x1, y1, x2, y2, rect) {
    if (segmentIntersectsRect(x1, y1, x2, y2, rect)) return 0;
    return Math.min(
      pointRectDistance(x1, y1, rect),
      pointRectDistance(x2, y2, rect),
      distToSeg(rect.left, rect.top, x1, y1, x2, y2),
      distToSeg(rect.right, rect.top, x1, y1, x2, y2),
      distToSeg(rect.right, rect.bottom, x1, y1, x2, y2),
      distToSeg(rect.left, rect.bottom, x1, y1, x2, y2)
    );
  }

  function getBoardRect() {
    if (!frameBoardRect && canvas) frameBoardRect = canvas.getBoundingClientRect();
    return frameBoardRect;
  }

  function updateMovement(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    if (dx === 0 && dy === 0) {
      heroMove.x = 0;
      heroMove.y = 0;
      return;
    }
    // Normalise so diagonals aren't faster — true Undertale free movement.
    // Speed rides the tempo so the hero keeps pace as the fight accelerates.
    const len = Math.hypot(dx, dy);
    heroMove.x = dx / len;
    heroMove.y = dy / len;
    const speed = MOVE_SPEED * (bpm / BASE_BPM);
    const startX = hero.x;
    const startY = hero.y;
    const startedInCrack = heroTouchesPhaseTwoCrack(startX, startY);
    hero.x += heroMove.x * speed * dt;
    hero.y += heroMove.y * speed * dt;
    clampHero();
    if (!heroTouchesPhaseTwoCrack(hero.x, hero.y)) return;
    // A fresh scar can form under the hero. Let them move out before it becomes
    // an impassable boundary, otherwise the first few pixels trap them forever.
    if (startedInCrack) return;

    // Cracks are impassable, but let diagonal input slide along their edge.
    const targetX = hero.x;
    const targetY = hero.y;
    hero.x = targetX;
    hero.y = startY;
    clampHero();
    if (!heroTouchesPhaseTwoCrack(hero.x, hero.y)) return;
    hero.x = startX;
    hero.y = targetY;
    clampHero();
    if (!heroTouchesPhaseTwoCrack(hero.x, hero.y)) return;
    hero.x = startX;
    hero.y = startY;
  }

  // ---- Combat: hitboxes, damage, bars ------------------------------------
  // Hitboxes live in viewport space (where the attacks are drawn). A swept band
  // is a rectangle from a root, `len` long and `2*hw` wide along its direction.
  function inBand(px, py, rx, ry, dirX, dirY, len, hw) {
    const ax = px - rx;
    const ay = py - ry;
    const along = ax * dirX + ay * dirY;
    if (along < 0 || along > len) return false;
    return Math.abs(ax * -dirY + ay * dirX) <= hw;
  }
  function inCorridor(px, py, ox, oy, ang, len, hw) {
    return inBand(px, py, ox, oy, Math.cos(ang), Math.sin(ang), len, hw);
  }

  // Classifies the hero point against attack `a`: 'live' (taking the strike),
  // 'shadow' (standing in its telegraph/upcoming path), or null. Telegraphing
  // attacks share their strike shape grown by `a.stretch`; the blood spiral is
  // special — while firing, its future-path trails count as shadow.
  function heroAttackZone(a, vx, vy) {
    const firing = a.state === 'fire';
    const shadowing = a.state === 'telegraph' || a.state === 'armed';
    if (!firing && !shadowing) return null;

    if (a.type === 'pentaBeam') {
      const len = firing ? a.length : a.length * a.stretch;
      return inCorridor(vx, vy, a.x, a.y, a.angle, len, a.width / 2) ? (firing ? 'live' : 'shadow') : null;
    }
    if (a.type === 'tentacle') {
      const len = firing ? a.len * easeOutCubic(Math.min(1, a.fire / 0.35)) : a.len * a.stretch;
      return inBand(vx, vy, a.rx, a.ry, a.dirX, a.dirY, len, a.hw) ? (firing ? 'live' : 'shadow') : null;
    }
    if (a.type === 'xRay') {
      const len = firing ? a.armLen : a.armLen * a.stretch;
      for (const ang of X_ANGLES) {
        if (inCorridor(vx, vy, a.cx, a.cy, ang, len, a.armWidth / 2)) return firing ? 'live' : 'shadow';
      }
      return null;
    }
    if (a.type === 'bloodSpiral') {
      if (!firing) {
        // Shadow is the reticle irising in onto the centre.
        const glow = a.state === 'armed' ? 1 : a.stretch;
        const retR = a.maxRadius * 0.5 * (1 - glow);
        return Math.hypot(vx - a.cx, vy - a.cy) <= retR + a.beamWidth * 0.65 ? 'shadow' : null;
      }
      // Live: the static centre beam + each beam's foot.
      if (Math.hypot(vx - a.cx, vy - a.cy) <= a.beamWidth * 0.65) return 'live';
      const tau = bloodTau(a);
      if (tau <= 0) return null;
      for (let k = 0; k < BLOOD_BEAMS; k++) {
        const f = bloodBeamFoot(a, k, tau);
        if (Math.hypot(vx - f.x, vy - f.y) <= a.beamWidth * 0.75) return 'live';
      }
      // Shadow: the future-path each beam is about to sweep (matches the trail).
      const tauF = Math.min(1, tau + (250 / (beatMs * a.fireBeats)) / 0.92);
      const steps = 8;
      for (let k = 0; k < BLOOD_BEAMS; k++) {
        for (let i = 1; i <= steps; i++) {
          const f = bloodBeamFoot(a, k, tau + (tauF - tau) * (i / steps));
          if (Math.hypot(vx - f.x, vy - f.y) <= a.beamWidth * 0.6) return 'shadow';
        }
      }
      return null;
    }
    if (a.type === 'pentLine') {
      const t = firing ? pentLineT(a) : 0;
      // Live: under a running beam foot.
      if (firing) {
        for (let k = 0; k < BLOOD_BEAMS; k++) {
          const f = pentLinePoint(a, k, t);
          if (Math.hypot(vx - f.x, vy - f.y) <= a.beamWidth * 0.7) return 'live';
        }
      }
      // Shadow: standing on an arm where no beam currently is.
      for (let i = 0; i < 5; i++) {
        const v0 = a.starV[PENT_STAR_ORDER[i]];
        const v1 = a.starV[PENT_STAR_ORDER[(i + 1) % 5]];
        if (distToSeg(vx, vy, v0.x, v0.y, v1.x, v1.y) <= a.beamWidth * 0.5) return 'shadow';
      }
      return null;
    }
    if (a.type === 'outsidePent') {
      if (firing) {
        // Once it lands, everything outside the real seal is struck.
        return pointInPoly(vx, vy, a.starPoly) ? null : 'live';
      }
      // While telegraphing, standing beyond the ragged tide front earns VP.
      const glow = a.state === 'armed' ? 1 : a.stretch;
      const theta = Math.atan2(vy - a.cy, vx - a.cx);
      return Math.hypot(vx - a.cx, vy - a.cy) >= bloodTideFront(a, theta, glow) ? 'shadow' : null;
    }
    if (a.type === 'checkerboard') {
      return checkerboardZone(a, vx, vy, firing);
    }
    if (a.type === 'portalCurve') {
      const until = firing ? 1 : a.stretch;
      return nearQuadPath(vx, vy, a.x0, a.y0, a.cx, a.cy, a.x1, a.y1, a.width / 2, until)
        ? (firing ? 'live' : 'shadow')
        : null;
    }
    if (a.type === 'sidePortals') {
      return sidePortalZone(a, vx, vy, firing);
    }
    if (a.type === 'shadowClaw') {
      const progress = firing ? 1 : phaseTwoClawReach(a);
      return phaseTwoClawContains(a, vx, vy, progress) ? (firing ? 'live' : 'shadow') : null;
    }
    return null;
  }

  // Counts how many live skills and how many shadows the hero overlaps right now
  // (overlaps stack, so two skills hurt twice as fast, two shadows earn twice).
  function countOverlaps(hitboxes) {
    let live = 0;
    let shadow = 0;
    const activeAttacks = phase === PHASE.SECOND ? phase2Attacks : attacks;
    for (const a of activeAttacks) {
      if (hitboxes.damagePoints.some((point) => heroAttackZone(a, point.x, point.y) === 'live')) {
        live++;
      }
      if (hitboxes.rewardPoints.some((point) => heroAttackZone(a, point.x, point.y) === 'shadow')) {
        shadow++;
      }
    }
    if (
      phase === PHASE.SECOND &&
      hitboxes.damagePoints.some((point) => phaseTwoBossContains(point.x, point.y))
    ) live++;
    // Overlapping cracks are rendered as one connected hole and count as one
    // terrain hazard, rather than multiplying damage at their intersections.
    const hoppingTiles = phase2GridSpecial && phase2GridSpecial.hop;
    if (
      phase === PHASE.SECOND && !hoppingTiles &&
      hitboxes.damagePoints.some((point) => viewportTouchesPhaseTwoCrack(point.x, point.y))
    ) live++;
    if (
      phase === PHASE.SECOND &&
      hitboxes.damagePoints.some((point) => phaseTwoTileRuinContains(point.x, point.y))
    ) live++;
    if (
      phase === PHASE.SECOND &&
      hitboxes.rewardPoints.some((point) => phaseTwoTileRuinShadowContains(point.x, point.y))
    ) shadow++;
    return { live, shadow };
  }

  function phaseTwoTileRuinShadowContains(vx, vy) {
    const pattern = phase2TileRuinPattern;
    if (!pattern || pattern.state !== 'telegraph') return false;
    return pattern.targets.some((index) => {
      const rect = phaseTwoTileViewportRect(index);
      return rect && vx >= rect.left && vx <= rect.right && vy >= rect.top && vy <= rect.bottom;
    });
  }

  function phaseTwoTileRuinContains(vx, vy) {
    const pattern = phase2TileRuinPattern;
    if (!pattern || pattern.state !== 'fire') return false;
    const fireP = Math.min(1, pattern.elapsedBeats / PHASE2_TILE_RUIN_FIRE_BEATS);
    const reach = easeInQuad(Math.min(1, fireP / 0.72));
    for (const index of pattern.targets) {
      const rect = phaseTwoTileViewportRect(index);
      if (!rect) continue;
      if (pattern.impacted && vx >= rect.left && vx <= rect.right && vy >= rect.top && vy <= rect.bottom) return true;
      const beam = phaseTwoRuinBeamGeometry(rect, index);
      if (!beam) continue;
      const steps = Math.max(5, Math.ceil(18 * reach));
      let previous = phaseTwoRuinBeamPoint(beam, 0);
      for (let i = 1; i <= steps; i++) {
        const point = phaseTwoRuinBeamPoint(beam, reach * i / steps);
        if (distToSeg(vx, vy, previous.x, previous.y, point.x, point.y) <= 11) return true;
        previous = point;
      }
    }
    return false;
  }

  function phaseTwoBossContains(vx, vy) {
    if (!phase2CombatStarted || !phase2Avatar || !phase2Avatar.state) return false;
    const a = phase2Avatar.state.avatar;
    if (!a || !a.visible || a.alpha < 0.5) return false;
    const radius = a.size * 0.24;
    const dx = vx - a.x;
    const dy = (vy - a.y) * 0.88;
    if (dx * dx + dy * dy <= radius * radius) return true;
    if (!phase2Avatar.dashing) return false;
    const sx = a.x - a.prevX;
    const sy = a.y - a.prevY;
    const lengthSq = sx * sx + sy * sy;
    const t = lengthSq > 0
      ? Math.max(0, Math.min(1, ((vx - a.prevX) * sx + (vy - a.prevY) * sy) / lengthSq))
      : 0;
    const nearestX = a.prevX + sx * t;
    const nearestY = a.prevY + sy * t;
    return Math.hypot(vx - nearestX, (vy - nearestY) * 0.88) <= radius;
  }

  function updateCombat(dt) {
    if (!canvas || dead) return;
    const board = getBoardRect();
    const hitboxes = heroViewportHitboxes(board);
    const beats = dt / beatMs;
    const { live, shadow } = countOverlaps(hitboxes);
    // Damage scales with overlaps (two attacks at once drain twice as fast).
    const doomPerfectSafe = phase2DoomPattern && phase2DoomPattern.mode === 'active' &&
      phase2DoomPattern.elapsed < phase2DoomPattern.perfectSafeUntil;
    if (live > 0 && !doomPerfectSafe) damagePlayer(DAMAGE_PER_BEAT * live * beats);
    // VP is earned only in a shadow, never in the live skill itself.
    if (shadow > 0) addVp(VP_PER_BEAT * shadow * beats, true);

    // Damage audio follows subdivisions of the live beat clock. Damage and VP
    // visuals are triggered centrally by their resource helpers, including
    // phase-two hazards that do not pass through this overlap counter.
    if (phase === PHASE.ACTIVE || (phase === PHASE.SECOND && phase2CombatStarted)) {
      const absoluteBeat = beatIndex + beatPhase / Math.max(1, beatMs);
      const damageStep = Math.floor(absoluteBeat * BOSS_SFX_DAMAGE_STEPS_PER_BEAT);
      if (live > 0 && hp > 0 && damageStep !== phaseOneDamageSfxStep) {
        phaseOneDamageSfxStep = damageStep;
        playBossSfx('damage', {
          step: phaseOneDamageSfxCount++,
          overlaps: live,
        });
      } else if (live === 0) {
        phaseOneDamageSfxStep = -1;
        phaseOneDamageSfxCount = 0;
      }
    }
    if (hp <= 0) die();
  }

  // The hero spends a full VP meter to strike: heals a little, stokes the
  // current boss's tempo gauge, and launches the slow-mo angelic-sword flourish.
  // Bound to F / Space.
  function playerAttack() {
    if (!active || dead || (phase !== PHASE.ACTIVE && phase !== PHASE.SECOND) || strike) return;
    if (phase === PHASE.SECOND && !phase2CombatStarted) return;
    if (vp < PLAYER_ATTACK_VP_COST) return;
    vp = Math.max(0, vp - PLAYER_ATTACK_VP_COST);
    // Healing and boss damage resolve only if the blade lands (see updateStrike).
    // Capture the flight path: from the hero up to the cultist.
    const board = getBoardRect();
    const sprite = cultistStandImg ? cultistStandImg.getBoundingClientRect() : null;
    const avatar = phase2Avatar && phase2Avatar.state && phase2Avatar.state.avatar;
    const heroV = worldPointToViewport(hero.x, hero.y, board);
    const fromX = heroV.x;
    const fromY = heroV.y;
    strike = {
      t: 0,
      duration: STRIKE_DURATION,
      impacted: false,
      missed: false,
      finalHit: false,
      phaseTwo: phase === PHASE.SECOND,
      travelSoundStarted: false,
      fromX,
      fromY,
      toX: phase === PHASE.SECOND && avatar ? avatar.x : (sprite ? sprite.left + sprite.width / 2 : fromX),
      toY: phase === PHASE.SECOND && avatar ? avatar.y : (sprite ? sprite.top + sprite.height * 0.45 : board.top),
    };
    playBossSfx('playerAttack');
  }

  function wrathAfterStrike() {
    return BASE_BPM + Math.floor(fightClock / BPM_RAMP_MS) + bpmBonus + damageEnemy(ATTACK_WRATH_GAIN);
  }

  function strikePose(activeStrike) {
    const p = Math.min(activeStrike.t, STRIKE_DURATION) / STRIKE_DURATION;
    const angle = Math.atan2(
      activeStrike.toY - activeStrike.fromY,
      activeStrike.toX - activeStrike.fromX
    );
    const castStart = 0.55;
    const castEnd = 0.82;
    let travel = 0;
    if (p >= castEnd) travel = 1;
    else if (p > castStart) travel = easeInQuad((p - castStart) / (castEnd - castStart));
    const appear = Math.min(1, p / 0.18);
    return {
      p,
      angle,
      travel,
      appear,
      x: activeStrike.fromX + (activeStrike.toX - activeStrike.fromX) * travel,
      y: activeStrike.fromY + (activeStrike.toY - activeStrike.fromY) * travel,
      scale: (0.7 + 0.6 * easeOutCubic(appear)) * (1 + travel * 0.25),
    };
  }

  function swordSegmentTouchesEllipse(pose, cx, cy, radiusX, radiusY) {
    const bladePadding = 7 * pose.scale;
    const rx = Math.max(1, radiusX + bladePadding);
    const ry = Math.max(1, radiusY + bladePadding);
    const ux = Math.cos(pose.angle);
    const uy = Math.sin(pose.angle);
    const back = -22 * pose.scale;
    const front = 116 * pose.scale;
    const x1 = (pose.x + ux * back - cx) / rx;
    const y1 = (pose.y + uy * back - cy) / ry;
    const x2 = (pose.x + ux * front - cx) / rx;
    const y2 = (pose.y + uy * front - cy) / ry;
    return distToSeg(0, 0, x1, y1, x2, y2) <= 1;
  }

  function strikeCurrentBossImpact(activeStrike) {
    const pose = strikePose(activeStrike);
    if (activeStrike.phaseTwo) {
      const avatar = phase2Avatar && phase2Avatar.state && phase2Avatar.state.avatar;
      if (!avatar || !avatar.visible || avatar.alpha < 0.5) return null;
      const radiusX = avatar.size * 0.24;
      return swordSegmentTouchesEllipse(
        pose,
        avatar.x,
        avatar.y,
        radiusX,
        radiusX / 0.88
      ) ? { x: avatar.x, y: avatar.y } : null;
    }
    const sprite = cultistStandImg && cultistStandImg.getBoundingClientRect();
    if (!sprite || sprite.width <= 0 || sprite.height <= 0) return null;
    const centerX = sprite.left + sprite.width / 2;
    const centerY = sprite.top + sprite.height * 0.45;
    return swordSegmentTouchesEllipse(
      pose,
      centerX,
      centerY,
      sprite.width * 0.28,
      sprite.height * 0.36
    ) ? { x: centerX, y: centerY } : null;
  }

  // Advances the strike flourish in REAL time (so the cinematic plays at full
  // speed while gameplay crawls) and returns the gameplay time-scale to apply.
  function updateStrike(dtRaw) {
    if (!strike) return 1;
    strike.t += dtRaw;
    const p = strike.t / STRIKE_DURATION;
    if (!strike.travelSoundStarted && p >= 0.55) {
      strike.travelSoundStarted = true;
      playBossSfx('playerTravel');
    }
    if (!strike.impacted && strike.t >= STRIKE_IMPACT_AT) {
      strike.impacted = true;
      const impact = strikeCurrentBossImpact(strike);
      if (!impact) {
        strike.missed = true;
      } else if (strike.phaseTwo) {
        strike.impactX = impact.x;
        strike.impactY = impact.y;
        healPlayer(HP_MAX * ATTACK_HEAL_FRAC);
        playBossSfx('playerImpact', { phaseTwo: true });
        entropy = Math.min(ENTROPY_MAX, entropy + damageEnemy(ENTROPY_PER_STRIKE));
        if (setCombatBpm(phaseTwoBpm())) updateBossMusicTempo(true);
        if (!strikePhaseTwoRushEyes() && !phase2RushPhaseComplete) {
          phase2PlayerHits++;
          registerPhaseTwoHexPlayerHit();
          if (phase2PlayerHits >= 2 && !phase2GridSpecial) startPhaseTwoGridSpecial();
        }
        surgeWrath();
      } else {
        strike.impactX = impact.x;
        strike.impactY = impact.y;
        healPlayer(HP_MAX * ATTACK_HEAL_FRAC);
        const finalHit = wrathAfterStrike() >= WRATH_MAX;
        strike.finalHit = finalHit;
        playBossSfx('playerImpact', { finalHit });
        if (finalHit) strike.duration = FINAL_STRIKE_DURATION;
        shakeCultist(finalHit);
        bpmBonus += damageEnemy(ATTACK_WRATH_GAIN); // wrath surges only on a confirmed hit
        if (finalHit) bpm = WRATH_MAX;
        surgeWrath();
      }
    }
    if (strike.t >= strike.duration) {
      const wasFinalHit = strike.finalHit;
      strike = null;
      if (wasFinalHit) startSecondPhase();
      return 1;
    }
    if (strike.finalHit && strike.impacted) {
      const hold = Math.max(0, Math.min(1, (strike.t - STRIKE_IMPACT_AT) / (FINAL_STRIKE_DURATION - STRIKE_IMPACT_AT)));
      return 0.018 + smoothstep((hold - 0.72) / 0.28) * 0.18;
    }
    // Slow-mo dips to STRIKE_SLOW in the middle, easing back to full at the ends.
    return 1 - Math.sin(Math.min(1, p) * Math.PI) * (1 - STRIKE_SLOW);
  }

  function shakeCultist(finalHit) {
    if (!cultistElement) return;
    cultistElement.classList.remove('aether-hit', 'aether-final-hit');
    void cultistElement.offsetWidth;   // reflow so the animation restarts
    cultistElement.classList.add(finalHit ? 'aether-final-hit' : 'aether-hit');
  }

  function surgeWrath() {
    if (!wrathTrack) return;
    wrathTrack.classList.remove('is-surging');
    void wrathTrack.offsetWidth;
    wrathTrack.classList.add('is-surging');
  }

  // A stylised 2D angelic sword: glowing gold-white blade, winged crossguard.
  // Drawn at (cx,cy), tip aimed along `angle`.
  function drawAngelicSword(cx, cy, angle, scale, alpha) {
    if (alpha <= 0 || scale <= 0) return;
    actx.save();
    actx.globalAlpha = Math.max(0, Math.min(1, alpha));
    actx.translate(cx, cy);
    actx.rotate(angle);
    actx.scale(scale, scale);
    actx.lineJoin = 'round';
    const L = 116;          // long, slender blade so it reads as a sword
    const bw = 5.5;
    // Blade: a long taper to a fine point, with a short straight ricasso.
    actx.shadowColor = 'rgba(255, 240, 200, 0.95)';
    actx.shadowBlur = 26;
    const grad = actx.createLinearGradient(8, 0, L, 0);
    grad.addColorStop(0, '#fff7df');
    grad.addColorStop(1, '#ffe6a0');
    actx.fillStyle = grad;
    actx.beginPath();
    actx.moveTo(L, 0);              // point
    actx.lineTo(L - 14, -bw);
    actx.lineTo(8, -bw);
    actx.lineTo(8, bw);
    actx.lineTo(L - 14, bw);
    actx.closePath();
    actx.fill();
    actx.shadowBlur = 0;
    actx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    actx.lineWidth = 1.2;
    actx.beginPath(); actx.moveTo(10, 0); actx.lineTo(L - 8, 0); actx.stroke();
    // Feathered wings sweeping back from the guard.
    actx.shadowColor = 'rgba(255, 255, 255, 0.85)';
    actx.shadowBlur = 14;
    actx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    for (const s of [-1, 1]) {
      actx.beginPath();
      actx.moveTo(4, 0);
      actx.quadraticCurveTo(-16, s * 9, -34, s * 24);
      actx.quadraticCurveTo(-12, s * 7, 4, 0);
      actx.fill();
    }
    // Golden crossguard, grip and pommel.
    actx.shadowColor = 'rgba(255, 220, 150, 0.9)';
    actx.shadowBlur = 12;
    actx.fillStyle = '#f4d27a';
    actx.fillRect(2, -16, 6, 32);
    actx.shadowBlur = 0;
    actx.fillStyle = '#caa24a';
    actx.fillRect(-16, -2.5, 18, 5);
    actx.fillStyle = '#f4d27a';
    actx.beginPath(); actx.arc(-18, 0, 4.5, 0, Math.PI * 2); actx.fill();
    actx.restore();
  }

  function drawPhaseTwoShadowSword(cx, cy, angle, scale, alpha) {
    if (alpha <= 0 || scale <= 0) return;
    actx.save();
    actx.globalAlpha = Math.max(0, Math.min(1, alpha));
    actx.translate(cx, cy);
    actx.rotate(angle);
    actx.scale(scale, scale);
    actx.lineJoin = 'round';
    actx.lineCap = 'round';
    actx.shadowColor = 'rgba(238, 25, 20, 0.72)';
    actx.shadowBlur = 12;

    const length = 116;
    const bladeWidth = 5.5;
    actx.fillStyle = '#020203';
    actx.strokeStyle = '#e2221b';
    actx.lineWidth = 2.4;
    actx.beginPath();
    actx.moveTo(length, 0);
    actx.lineTo(length - 14, -bladeWidth);
    actx.lineTo(8, -bladeWidth);
    actx.lineTo(8, bladeWidth);
    actx.lineTo(length - 14, bladeWidth);
    actx.closePath();
    actx.fill();
    actx.stroke();

    for (const side of [-1, 1]) {
      actx.beginPath();
      actx.moveTo(4, 0);
      actx.quadraticCurveTo(-16, side * 9, -34, side * 24);
      actx.quadraticCurveTo(-12, side * 7, 4, 0);
      actx.closePath();
      actx.fill();
      actx.stroke();
    }

    actx.fillRect(2, -16, 6, 32);
    actx.strokeRect(2, -16, 6, 32);
    actx.fillRect(-16, -2.5, 18, 5);
    actx.strokeRect(-16, -2.5, 18, 5);
    actx.beginPath();
    actx.arc(-18, 0, 4.5, 0, Math.PI * 2);
    actx.fill();
    actx.stroke();

    actx.shadowBlur = 0;
    actx.globalAlpha *= 0.36;
    actx.strokeStyle = '#ff554b';
    actx.lineWidth = 0.8;
    actx.beginPath();
    actx.moveTo(12, 0);
    actx.lineTo(length - 9, 0);
    actx.stroke();
    actx.restore();
  }

  function renderFinalStrikeImpact(s, impactAge) {
    if (impactAge < 0) return;
    const holdP = Math.max(0, Math.min(1, impactAge / (FINAL_STRIKE_DURATION - STRIKE_IMPACT_AT)));
    const snap = 1 - smoothstep(impactAge / 120);
    const shock = 1 - smoothstep((impactAge - 120) / 620);
    const x = Number.isFinite(s.impactX) ? s.impactX : s.toX;
    const y = Number.isFinite(s.impactY) ? s.impactY : s.toY;
    actx.save();
    if (snap > 0) {
      actx.globalAlpha = 0.48 * snap;
      actx.fillStyle = '#fff2dc';
      actx.fillRect(0, 0, attackCanvas.width, attackCanvas.height);
      actx.globalAlpha = 0.62 * snap;
      actx.fillStyle = '#090003';
      actx.fillRect(0, 0, attackCanvas.width, y - 64);
      actx.fillRect(0, y + 64, attackCanvas.width, attackCanvas.height - y - 64);
    }
    actx.globalCompositeOperation = 'lighter';
    const pulse = Math.sin(Math.max(0, 1 - holdP) * Math.PI * 5) * 0.5 + 0.5;
    const core = 1 - smoothstep((impactAge - 520) / 720);
    actx.globalAlpha = Math.max(0, core) * (0.55 + pulse * 0.25);
    const grad = actx.createRadialGradient(x, y, 0, x, y, 128 + holdP * 70);
    grad.addColorStop(0, 'rgba(255, 255, 245, 0.92)');
    grad.addColorStop(0.18, 'rgba(255, 216, 150, 0.55)');
    grad.addColorStop(0.48, 'rgba(255, 78, 42, 0.22)');
    grad.addColorStop(1, 'rgba(255, 78, 42, 0)');
    actx.fillStyle = grad;
    actx.beginPath();
    actx.arc(x, y, 132 + holdP * 80, 0, Math.PI * 2);
    actx.fill();
    if (shock > 0) {
      for (let i = 0; i < 3; i++) {
        const t = Math.max(0, Math.min(1, (impactAge - i * 90) / 600));
        if (t <= 0 || t >= 1) continue;
        actx.globalAlpha = shock * (1 - t) * (0.66 - i * 0.12);
        actx.strokeStyle = i === 0 ? '#fff7db' : '#ff7444';
        actx.lineWidth = 2.5 - i * 0.35;
        actx.beginPath();
        actx.arc(x, y, 18 + easeOutCubic(t) * (120 + i * 44), 0, Math.PI * 2);
        actx.stroke();
      }
    }
    actx.globalAlpha = Math.max(0, 1 - holdP) * 0.72;
    actx.strokeStyle = '#fff0c8';
    actx.lineWidth = 3;
    actx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI * 0.84 + i * Math.PI * 0.19 + Math.sin(i * 17.1) * 0.12;
      const r0 = 22 + (i % 3) * 9;
      const r1 = 76 + (i % 4) * 25 + holdP * 80;
      actx.beginPath();
      actx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      actx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      actx.stroke();
    }
    actx.restore();
  }

  function renderStrikeMiss(pose, impactAge) {
    if (impactAge < 0 || impactAge > 520) return;
    const progress = clamp01(impactAge / 520);
    const alpha = 1 - smoothstep(progress);
    actx.save();
    actx.globalAlpha = alpha;
    actx.font = "12px 'Press Start 2P', monospace";
    actx.textAlign = 'center';
    actx.textBaseline = 'middle';
    actx.lineJoin = 'miter';
    actx.lineWidth = 4;
    actx.strokeStyle = '#160005';
    const y = pose.y - 34 - easeOutCubic(progress) * 20;
    actx.strokeText('MISS', pose.x, y);
    actx.fillStyle = '#ff6670';
    actx.fillText('MISS', pose.x, y);
    actx.restore();
  }

  // The flourish itself, painted over the attack layer in viewport space.
  function renderStrike() {
    if (!strike || !actx) return;
    const pose = strikePose(strike);
    const { p, angle, travel: sp, x, y, appear } = pose;
    let fade = p > 0.86 ? Math.max(0, 1 - (p - 0.86) / 0.14) : 1;
    let scale = pose.scale;
    if (strike.finalHit && strike.impacted) {
      const impactAge = strike.t - STRIKE_IMPACT_AT;
      fade = Math.max(0, 1 - smoothstep((impactAge - 840) / 520));
      scale *= 1.10 + Math.max(0, 1 - smoothstep(impactAge / 420)) * 0.28;
      renderFinalStrikeImpact(strike, impactAge);
    }
    const alpha = appear * fade;
    // Light trail behind the cast.
    if (sp > 0 && sp < 1) {
      actx.save();
      actx.globalAlpha = 0.5 * alpha;
      actx.lineCap = 'round';
      actx.strokeStyle = 'rgba(255, 240, 200, 0.8)';
      actx.lineWidth = 9 * scale;
      actx.shadowColor = 'rgba(255, 240, 200, 0.9)';
      actx.shadowBlur = 20;
      actx.beginPath();
      actx.moveTo(strike.fromX, strike.fromY);
      actx.lineTo(x, y);
      actx.stroke();
      actx.restore();
    }
    // Holy flash where it lands on the cultist.
    if (p >= 0.82 && !strike.missed) {
      const fp = Math.min(1, (p - 0.82) / 0.12);
      actx.save();
      actx.globalAlpha = (1 - fp) * 0.9;
      actx.shadowColor = 'rgba(255, 230, 180, 0.95)';
      actx.shadowBlur = 40;
      actx.fillStyle = 'rgba(255, 245, 220, 0.9)';
      const impactX = Number.isFinite(strike.impactX) ? strike.impactX : strike.toX;
      const impactY = Number.isFinite(strike.impactY) ? strike.impactY : strike.toY;
      actx.beginPath(); actx.arc(impactX, impactY, 26 + fp * 46, 0, Math.PI * 2); actx.fill();
      actx.restore();
    }
    drawAngelicSword(x, y, angle, scale, alpha);
    if (strike.missed) renderStrikeMiss(pose, strike.t - STRIKE_IMPACT_AT);
  }

  function partialPolyline(g, points, progress) {
    if (!points || points.length < 2 || progress <= 0) return false;
    let total = 0;
    const lengths = [];
    for (let i = 1; i < points.length; i++) {
      const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      lengths.push(length);
      total += length;
    }
    let remaining = total * clamp01(progress);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length && remaining > 0; i++) {
      const length = lengths[i - 1];
      if (remaining >= length) {
        g.lineTo(points[i].x, points[i].y);
        remaining -= length;
      } else {
        const p = length > 0 ? remaining / length : 1;
        g.lineTo(
          points[i - 1].x + (points[i].x - points[i - 1].x) * p,
          points[i - 1].y + (points[i].y - points[i - 1].y) * p
        );
        remaining = 0;
      }
    }
    return true;
  }

  function deathFractureRadius(width, height) {
    return Math.min(310, Math.max(210, Math.min(width, height) * 0.30));
  }

  function makeDeathCracks(cx, cy, width, height) {
    const random = mulberry32(0xd34d2026 ^ Math.round(cx * 13 + cy * 29));
    const cracks = [];
    const radius = deathFractureRadius(width, height);
    const primaryCount = 22;
    const rays = [];
    for (let i = 0; i < primaryCount; i++) {
      const angle = -Math.PI + i * Math.PI * 2 / primaryCount + (random() - 0.5) * 0.18;
      const rayLength = radius * (0.68 + random() * 0.34);
      const segments = 5 + Math.floor(random() * 4);
      const points = [{ x: cx, y: cy }];
      for (let step = 1; step <= segments; step++) {
        const p = step / segments;
        const distance = rayLength * p;
        const jitter = (random() - 0.5) * (7 + distance * 0.018);
        points.push({
          x: cx + Math.cos(angle) * distance + Math.cos(angle + Math.PI / 2) * jitter,
          y: cy + Math.sin(angle) * distance + Math.sin(angle + Math.PI / 2) * jitter,
        });
      }
      rays.push({ angle, length: rayLength });
      cracks.push({ points, delay: i * 0.008, width: 0.72 + random() * 0.5 });

      const branchCount = random() < 0.72 ? 2 : 1;
      for (let branch = 0; branch < branchCount; branch++) {
        const startIndex = 2 + Math.floor(random() * Math.max(2, segments - 2));
        const start = points[Math.min(points.length - 2, startIndex)];
        const branchAngle = angle + (random() < 0.5 ? -1 : 1) * (0.42 + random() * 0.58);
        const branchLength = radius * (0.10 + random() * 0.15);
        const branchPoints = [{ x: start.x, y: start.y }];
        for (let step = 1; step <= 3; step++) {
          const p = step / 3;
          const jitter = (random() - 0.5) * 7;
          branchPoints.push({
            x: start.x + Math.cos(branchAngle) * branchLength * p + Math.cos(branchAngle + Math.PI / 2) * jitter,
            y: start.y + Math.sin(branchAngle) * branchLength * p + Math.sin(branchAngle + Math.PI / 2) * jitter,
          });
        }
        cracks.push({
          points: branchPoints,
          delay: 0.18 + startIndex / segments * 0.36 + random() * 0.06,
          width: 0.48 + random() * 0.34,
        });
      }
    }

    // Broken polygonal rings link the radial fractures into a dense glass web.
    const ringFractions = [0.22, 0.39, 0.58, 0.78, 0.94];
    for (let ringIndex = 0; ringIndex < ringFractions.length; ringIndex++) {
      const ringRadius = radius * ringFractions[ringIndex];
      const ringPoints = rays.map((ray) => {
        const distance = Math.min(ray.length * 0.96, ringRadius * (0.92 + random() * 0.16));
        return {
          x: cx + Math.cos(ray.angle) * distance,
          y: cy + Math.sin(ray.angle) * distance,
        };
      });
      for (let i = 0; i < primaryCount; i++) {
        if (random() < 0.16 + ringIndex * 0.025) continue;
        const next = (i + 1) % primaryCount;
        const a = ringPoints[i];
        const b = ringPoints[next];
        const angleDelta = Math.atan2(
          Math.sin(rays[next].angle - rays[i].angle),
          Math.cos(rays[next].angle - rays[i].angle)
        );
        const midAngle = rays[i].angle + angleDelta * 0.5;
        const midDistance = ringRadius * (0.90 + random() * 0.16);
        cracks.push({
          points: [
            a,
            { x: cx + Math.cos(midAngle) * midDistance, y: cy + Math.sin(midAngle) * midDistance },
            b,
          ],
          delay: 0.16 + ringIndex * 0.085 + i * 0.002,
          width: 0.42 + random() * 0.32,
        });
      }
    }
    return cracks;
  }

  function makeDeathCut(cx, cy) {
    return [
      { x: cx - 112, y: cy - 170 },
      { x: cx - 73, y: cy - 118 },
      { x: cx - 89, y: cy - 82 },
      { x: cx - 31, y: cy - 39 },
      { x: cx - 48, y: cy - 10 },
      { x: cx + 4, y: cy + 7 },
      { x: cx - 9, y: cy + 35 },
      { x: cx + 57, y: cy + 78 },
      { x: cx + 40, y: cy + 111 },
      { x: cx + 112, y: cy + 172 },
    ];
  }

  function drawDeathHero(sequence, alpha) {
    if (!deathCtx || alpha <= 0) return;
    const cellW = HERO_SCALE * sequence.heroScaleX;
    const cellH = HERO_SCALE * sequence.heroScaleY;
    const ox = sequence.heroX - HERO_W * sequence.heroScaleX / 2;
    const oy = sequence.heroY - HERO_H * sequence.heroScaleY / 2;
    const outline = Math.max(2, Math.min(4, Math.max(sequence.heroScaleX, sequence.heroScaleY) * 2));
    deathCtx.save();
    deathCtx.globalAlpha = alpha;
    deathCtx.fillStyle = '#ffffff';
    for (let y = 0; y < HERO.rows.length; y++) {
      for (let x = 0; x < HERO.rows[y].length; x++) {
        const token = HERO.rows[y][x];
        if (token === '.' || token === ' ' || !HERO.pal[token]) continue;
        deathCtx.fillRect(
          Math.floor(ox + x * cellW - outline),
          Math.floor(oy + y * cellH - outline),
          Math.ceil(cellW + outline * 2),
          Math.ceil(cellH + outline * 2)
        );
      }
    }
    for (let y = 0; y < HERO.rows.length; y++) {
      for (let x = 0; x < HERO.rows[y].length; x++) {
        const token = HERO.rows[y][x];
        if (token === '.' || token === ' ' || !HERO.pal[token]) continue;
        deathCtx.fillStyle = HERO.pal[token];
        deathCtx.fillRect(
          Math.floor(ox + x * cellW),
          Math.floor(oy + y * cellH),
          Math.ceil(cellW),
          Math.ceil(cellH)
        );
      }
    }
    deathCtx.restore();
  }

  function drawDeathCut(sequence, progress) {
    if (!deathCtx || progress <= 0) return;
    deathCtx.save();
    deathCtx.lineCap = 'butt';
    deathCtx.lineJoin = 'miter';
    deathCtx.globalCompositeOperation = 'screen';
    if (partialPolyline(deathCtx, sequence.cut, progress)) {
      deathCtx.strokeStyle = 'rgba(128, 0, 4, 0.76)';
      deathCtx.lineWidth = 15;
      deathCtx.shadowColor = '#ff1018';
      deathCtx.shadowBlur = 28;
      deathCtx.stroke();
    }
    if (partialPolyline(deathCtx, sequence.cut, progress)) {
      deathCtx.strokeStyle = '#ef2028';
      deathCtx.lineWidth = 4;
      deathCtx.shadowBlur = 8;
      deathCtx.stroke();
    }
    if (partialPolyline(deathCtx, sequence.cut, progress)) {
      deathCtx.strokeStyle = 'rgba(255, 218, 210, 0.86)';
      deathCtx.lineWidth = 1;
      deathCtx.shadowBlur = 0;
      deathCtx.stroke();
    }
    deathCtx.restore();
  }

  function drawDeathImpactFrame(sequence, age) {
    if (!deathCtx || age < 0 || age >= DEATH_BLACKOUT - DEATH_CUT_IMPACT) return;
    const width = deathCanvas.width;
    const height = deathCanvas.height;
    deathCtx.save();
    if (age < 34) {
      deathCtx.fillStyle = age < 17 ? '#fff8f2' : '#e51e26';
      deathCtx.fillRect(0, 0, width, height);
    } else {
      deathCtx.fillStyle = '#000';
      deathCtx.fillRect(0, 0, width, height);
      const p = smoothstep((age - 34) / 96);
      deathCtx.translate(sequence.heroX, sequence.heroY);
      deathCtx.rotate(-0.73);
      deathCtx.fillStyle = 'rgba(220, 18, 28, ' + (1 - p).toFixed(3) + ')';
      deathCtx.beginPath();
      deathCtx.moveTo(-width, -8 - p * 42);
      deathCtx.lineTo(width, -32 + p * 18);
      deathCtx.lineTo(width, 24 - p * 10);
      deathCtx.lineTo(-width, 10 + p * 38);
      deathCtx.closePath();
      deathCtx.fill();
      deathCtx.strokeStyle = 'rgba(255, 110, 110, ' + (0.9 * (1 - p)).toFixed(3) + ')';
      deathCtx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const y = (i - 5.5) * 17;
        deathCtx.beginPath();
        deathCtx.moveTo((i % 3) * 16 - 80, y);
        deathCtx.lineTo(width * (0.24 + (i % 4) * 0.07), y + (i % 2 ? 18 : -18));
        deathCtx.stroke();
      }
    }
    deathCtx.restore();
  }

  function strokeDeathCrackSegments(sequence, crack, progress, pass) {
    const points = crack.points;
    const segmentCount = points.length - 1;
    const radius = deathFractureRadius(deathCanvas.width, deathCanvas.height);
    for (let i = 0; i < segmentCount; i++) {
      const localProgress = clamp01((progress - i / segmentCount) * segmentCount);
      if (localProgress <= 0) continue;
      const a = points[i];
      const b = points[i + 1];
      const endX = a.x + (b.x - a.x) * localProgress;
      const endY = a.y + (b.y - a.y) * localProgress;
      const midX = (a.x + endX) * 0.5;
      const midY = (a.y + endY) * 0.5;
      const distance = clamp01(Math.hypot(midX - sequence.heroX, midY - sequence.heroY) / radius);
      const strength = Math.pow(1 - distance, 1.12);
      const coreWidth = crack.width * (0.48 + strength * 2.25);

      if (pass === 0) {
        deathCtx.strokeStyle = 'rgba(48, 0, 3, ' + (0.28 + strength * 0.58).toFixed(3) + ')';
        deathCtx.lineWidth = coreWidth + 0.65 + strength * 0.75;
        deathCtx.shadowBlur = 0;
      } else if (pass === 1) {
        deathCtx.strokeStyle = 'rgba(205, 18, 28, ' + (0.20 + strength * 0.75).toFixed(3) + ')';
        deathCtx.lineWidth = coreWidth;
        deathCtx.shadowColor = '#b81019';
        deathCtx.shadowBlur = strength * (progress < 1 ? 3 : 1);
      } else {
        deathCtx.strokeStyle = 'rgba(255, 91, 94, ' + (0.08 + strength * 0.54).toFixed(3) + ')';
        deathCtx.lineWidth = Math.max(0.24, coreWidth * 0.27);
        deathCtx.shadowBlur = 0;
      }
      deathCtx.beginPath();
      deathCtx.moveTo(a.x, a.y);
      deathCtx.lineTo(endX, endY);
      deathCtx.stroke();
    }
  }

  function drawDeathFracture(sequence, progress) {
    if (!deathCtx || progress <= 0) return;
    deathCtx.save();
    deathCtx.lineCap = 'butt';
    deathCtx.lineJoin = 'miter';
    for (const crack of sequence.cracks) {
      const branchProgress = clamp01((progress - crack.delay) / Math.max(0.08, 1 - crack.delay));
      if (branchProgress <= 0) continue;
      const reveal = easeOutCubic(branchProgress);
      strokeDeathCrackSegments(sequence, crack, reveal, 0);
      strokeDeathCrackSegments(sequence, crack, reveal, 1);
      strokeDeathCrackSegments(sequence, crack, reveal, 2);
    }
    const burst = smoothstep(progress / 0.32);
    deathCtx.translate(sequence.heroX, sequence.heroY);
    deathCtx.strokeStyle = 'rgba(248, 36, 44, ' + (0.94 * burst).toFixed(3) + ')';
    deathCtx.lineWidth = 2.1;
    deathCtx.beginPath();
    for (let i = 0; i < 22; i++) {
      const angle = i * Math.PI * 2 / 22;
      const inner = 8 + (i % 3) * 3;
      const outer = (24 + (i % 5) * 5) * burst;
      deathCtx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      deathCtx.lineTo(Math.cos(angle + (i % 2 ? 0.09 : -0.08)) * outer,
        Math.sin(angle + (i % 2 ? 0.09 : -0.08)) * outer);
    }
    deathCtx.stroke();
    deathCtx.restore();
  }

  function renderDeathSequence() {
    if (!deathCtx || !deathCanvas || !deathSequence) return;
    const sequence = deathSequence;
    const age = sequence.age;
    deathCtx.setTransform(1, 0, 0, 1, 0, 0);
    deathCtx.clearRect(0, 0, deathCanvas.width, deathCanvas.height);

    const blackAlpha = smoothstep((age - DEATH_FADE_START) / (DEATH_FADE_END - DEATH_FADE_START));
    if (blackAlpha > 0) {
      deathCtx.fillStyle = 'rgba(0, 0, 0, ' + blackAlpha.toFixed(3) + ')';
      deathCtx.fillRect(0, 0, deathCanvas.width, deathCanvas.height);
    }
    if (age < DEATH_CUT_IMPACT) {
      const reveal = smoothstep((age - 320) / 430);
      drawDeathHero(sequence, reveal);
      const cutProgress = smoothstep((age - DEATH_CUT_START) / (DEATH_CUT_IMPACT - DEATH_CUT_START));
      drawDeathCut(sequence, cutProgress);
    }
    if (age >= DEATH_CUT_IMPACT && age < DEATH_BLACKOUT) {
      drawDeathImpactFrame(sequence, age - DEATH_CUT_IMPACT);
    }
    if (age >= DEATH_BLACKOUT) {
      deathCtx.fillStyle = '#000';
      deathCtx.fillRect(0, 0, deathCanvas.width, deathCanvas.height);
      const formedProgress = clamp01((age - DEATH_CRACK_START) / DEATH_CRACK_FORM_MS);
      const crackProgress = sequence.reviving
        ? sequence.reviveFromProgress * (1 - smoothstep(sequence.reviveAge / DEATH_REVIVE_MS))
        : formedProgress;
      drawDeathFracture(sequence, crackProgress);
    }
  }

  function beginDeathRevive() {
    if (!dead || !deathSequence || deathSequence.reviving ||
        deathSequence.age < DEATH_PERSIST_AT) return false;
    deathSequence.reviving = true;
    deathSequence.reviveAge = 0;
    deathSequence.reviveFromProgress = clamp01(
      (deathSequence.age - DEATH_CRACK_START) / DEATH_CRACK_FORM_MS
    );
    if (deathSequence.phaseOneAudio) playBossSfx('persist');
    if (deathScreen) deathScreen.classList.remove('is-ready');
    keys.clear();
    return true;
  }

  function updateDeathSequence(dt) {
    if (!deathSequence) return false;
    if (deathSequence.reviving) {
      deathSequence.reviveAge += dt;
      renderDeathSequence();
      if (deathSequence.reviveAge >= DEATH_REVIVE_MS) {
        restart();
        return true;
      }
      return false;
    }
    deathSequence.age += dt;
    if (deathSequence.phaseOneAudio && !deathSequence.impactPlayed &&
        deathSequence.age >= DEATH_CUT_IMPACT) {
      deathSequence.impactPlayed = true;
      playBossSfx('deathImpact');
    }
    if (deathSequence.phaseOneAudio && !deathSequence.crackPlayed &&
        deathSequence.age >= DEATH_CRACK_START) {
      deathSequence.crackPlayed = true;
      playBossSfx('deathCrack');
    }
    if (deathScreen) deathScreen.classList.toggle('is-ready', deathSequence.age >= DEATH_PERSIST_AT);
    renderDeathSequence();
    return false;
  }

  function die() {
    if (dead) return;
    stopBloodSpiralAudio(true);
    stopPhaseTwoMassAudio(true);
    frameBoardRect = null;
    const board = getBoardRect();
    const heroViewport = worldPointToViewport(hero.x, hero.y, board);
    sizeDeathCanvas();
    deathSequence = {
      age: 0,
      heroX: heroViewport.x,
      heroY: heroViewport.y,
      heroScaleX: board.width / Math.max(1, canvas.width),
      heroScaleY: board.height / Math.max(1, canvas.height),
      restartPhase: phase === PHASE.SECOND ? PHASE.SECOND : PHASE.FALL,
      phaseOneAudio: phase === PHASE.ACTIVE || phase === PHASE.SECOND,
      impactPlayed: false,
      crackPlayed: false,
      reviving: false,
      reviveAge: 0,
      reviveFromProgress: 0,
      cut: makeDeathCut(heroViewport.x, heroViewport.y),
      cracks: makeDeathCracks(heroViewport.x, heroViewport.y, window.innerWidth, window.innerHeight),
    };
    dead = true;
    keys.clear();
    if (deathSequence.phaseOneAudio) playBossSfx('death');
    stopBossMusic(0.2);
    if (deathScreen) {
      deathScreen.classList.remove('hidden', 'is-ready');
    }
    renderDeathSequence();
  }

  // Pushes wrath / entropy, HP and VP to their bars. The shared DOM bar changes
  // identity with the boss so phase one can retain its existing markup.
  function updateBars() {
    const isPhaseTwoCombat = phase === PHASE.SECOND && phase2AvatarStarted;
    const wrath = phase === PHASE.ACTIVE ? bpm : 0;
    if (wrathFill) wrathFill.style.width = ((isPhaseTwoCombat ? entropy / ENTROPY_MAX : Math.min(1, wrath / WRATH_MAX)) * 100) + '%';
    if (wrathValue) wrathValue.textContent = isPhaseTwoCombat
      ? 'ENTROPY ' + Math.round(entropy) + ' / ' + ENTROPY_MAX
      : 'WRATH ' + wrath;
    if (hpFill) hpFill.style.height = (Math.max(0, hp) / HP_MAX * 100) + '%';
    if (vpFill) {
      const attackCharge = clamp01(Math.max(0, vp) / PLAYER_ATTACK_VP_COST);
      vpFill.style.height = (attackCharge * 100) + '%';
    }
    if (vpBar) vpBar.classList.toggle('is-full', vp >= PLAYER_ATTACK_VP_COST);
  }

  // ---- Phase machine -----------------------------------------------------
  function setPhase(next, silentAudio) {
    phase = next;
    phaseTime = 0;
    if (!silentAudio) {
      if (next === PHASE.TENTACLES) playBossSfx('introTentacles');
      else if (next === PHASE.PENTAGRAM) playBossSfx('introPentagram', { arm: 0 });
      else if (next === PHASE.ACTIVE) playBossSfx('introRise');
    }
    // When the scripted intro ends and the fight begins, the cultist rises from
    // her kneeling form into her standing combat pose (crossfade + rise driven
    // by the `.standing` class), and the tempo clock starts ticking.
    if (next === PHASE.ACTIVE) {
      if (overlay) overlay.classList.remove('phase-two');
      if (cultistElement) {
        cultistElement.classList.remove('phase-two');
        cultistElement.classList.add('standing');
      }
      startFight();
    }
  }

  function startSecondPhase() {
    if (phase === PHASE.SECOND) return;
    stopBloodSpiralAudio(true);
    stopPhaseTwoMassAudio(true);
    playBossSfx('phase2Fall');
    // Her fall is the phase-one musical cutoff. Let the last hit and echo tail
    // dissolve beneath the first beat of the transformation.
    stopBossMusic(0.9);
    fadingAttacks = attacks.map((a) => ({ ...a, fadeTime: 0, fadeDuration: PHASE2_ATTACK_FADE }));
    attacks = [];
    phase2Attacks = [];
    phase2BurstActive = false;
    phase2BurstSize = 1;
    phase2BurstsAtSize = 0;
    phase2DashZone = 'top';
    phase2Cracks = [];
    phase2GridSpecial = null;
    phase2GridDebugQueued = false;
    phase2PlayerHits = 0;
    phase2PostGridCycles = 0;
    phase2ClawPatternStopped = false;
    phase2ClawRushMode = false;
    resetPhaseTwoRushEntities();
    phase2RushDebugQueued = false;
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2SwordRingDebugQueued = false;
    phase2PitfallPattern = null;
    phase2PitfallDebugQueued = false;
    phase2HexDebugQueued = false;
    phase2TowerPattern = null;
    phase2TowerDebugQueued = false;
    phase2DoomPattern = null;
    phase2DoomDebugQueued = false;
    phase2MayhemPattern = null;
    phase2MayhemDebugQueued = false;
    phase2SpearRainDebugQueued = false;
    phase2ChevronDebugQueued = false;
    phase2TrianglesDebugQueued = false;
    phase2WaveformDebugQueued = false;
    phase2CombatStarted = false;
    phase2DebugClawQueued = false;
    nextPhase2AttackBeat = Infinity;
    entropy = 0;
    activeSet = [];
    nextAttackBeat = Infinity;
    strike = null;
    bpm = WRATH_MAX;
    phase2Ritual = makeSecondPhaseRitual();
    phase2AvatarStarted = false;
    if (phase2Avatar) phase2Avatar.reset();
    resetPhaseTwoLayout();
    if (bpmElement) bpmElement.textContent = 'BPM --';
    if (overlay) overlay.classList.add('phase-two');
    if (cultistElement) {
      cultistElement.classList.remove('aether-hit', 'aether-final-hit');
      cultistElement.classList.add('phase-two');
    }
    setPhase(PHASE.SECOND);
  }

  function startAvatarPhaseTwo() {
    if (phase2AvatarStarted) return;
    const controller = ensurePhaseTwoAvatar();
    if (!controller || !canvas || !phase2Ritual) return;
    const board = getBoardRect();
    const bounds = ritualBounds();
    const geo = cocoonGeometry(bounds, board);
    controller.start(geo, board);
    stopPhaseTwoMassAudio();
    phase2AvatarStarted = true;
    if (overlay) {
      const row = overlay.querySelector('.aether-boss2d-stage-row');
      const rowRect = row ? row.getBoundingClientRect() : null;
      phase2LayoutAnchor = rowRect
        ? { left: rowRect.left, top: rowRect.top, stageTop: board.top, centerX: board.left + board.width / 2 }
        : { left: board.left - 38, top: board.top, stageTop: board.top, centerX: board.left + board.width / 2 };
      overlay.style.setProperty('--phase2-row-left', phase2LayoutAnchor.left.toFixed(1) + 'px');
      overlay.style.setProperty('--phase2-row-top', phase2LayoutAnchor.top.toFixed(1) + 'px');
      overlay.style.setProperty('--phase2-wrath-top', Math.max(14, phase2LayoutAnchor.stageTop - 48).toFixed(1) + 'px');
      overlay.classList.add('avatar-phase-two');
    }
    if (cultistElement) cultistElement.classList.add('avatar-phase-two');
    if (wrathName) wrathName.textContent = 'SZAGO - THE AVATAR OF SHADOW';
  }

  function phaseTwoRitualComplete() {
    if (!phase2Ritual || phase2AvatarStarted) return false;
    const c = phase2Ritual.cocoon;
    return c.p >= 0.985 && c.alpha >= 0.99 && phase2Ritual.pentFade <= 0.01 && phase2Ritual.beams.length === 0;
  }

  function skipPhaseTwoTransition() {
    if (phase !== PHASE.SECOND) return false;
    if (phase2CombatStarted || (phase2Avatar && phase2Avatar.layoutProgress >= 1)) return true;
    if (!phase2AvatarStarted) {
      if (phase2Ritual) {
        phase2Ritual.beams = [];
        phase2Ritual.pentFade = 0;
        phase2Ritual.cocoon.hits = P2_COCOON_HITS;
        phase2Ritual.cocoon.p = 1;
        phase2Ritual.cocoon.alpha = 1;
      }
      phaseTime = Math.max(
        phaseTime,
        PHASE2_ARENA_TRANSITION + PHASE2_ORB_LAUNCH + PHASE2_PENT_FORM
      );
      startAvatarPhaseTwo();
    }
    if (phase2Avatar && typeof phase2Avatar.skipToGroundSlam === 'function') {
      phase2Avatar.skipToGroundSlam(getBoardRect());
    }
    return true;
  }

  function makeSecondPhaseRitual() {
    const random = mulberry32(0x5e2c0d);
    // The engulf sweep, in fractions of the fallen sprite's box. The waypoints
    // trace her body in order so the darkness claims her piece by piece: the
    // raised hand the orb left from, down that arm, over the hood and chest,
    // along the bracing arm, then out across the hips and both robe tails.
    const spine = [
      { fx: 0.53, fy: 0.10, r: 26 },  // raised hand
      { fx: 0.51, fy: 0.24, r: 30 },  // forearm
      { fx: 0.44, fy: 0.34, r: 34 },  // shoulder
      { fx: 0.32, fy: 0.24, r: 34 },  // hood
      { fx: 0.35, fy: 0.46, r: 38 },  // chest
      { fx: 0.42, fy: 0.57, r: 38 },  // belt
      { fx: 0.26, fy: 0.62, r: 34 },  // bracing sleeve
      { fx: 0.14, fy: 0.78, r: 30 },  // bracing hand
      { fx: 0.52, fy: 0.64, r: 40 },  // hips
      { fx: 0.60, fy: 0.76, r: 40 },  // thigh
      { fx: 0.44, fy: 0.86, r: 36 },  // knees sinking into the robe pool
      { fx: 0.72, fy: 0.80, r: 42 },  // robe sweep
      { fx: 0.88, fy: 0.86, r: 38 },  // far robe tail
      { fx: 0.28, fy: 0.87, r: 40 },  // left robe pool
    ];
    // A jittered midpoint between consecutive waypoints keeps the crawl
    // contiguous: every strike lands beside the last one.
    const targets = [];
    for (let i = 0; i < spine.length; i++) {
      if (i > 0) {
        const a = spine[i - 1];
        const b = spine[i];
        targets.push({
          fx: (a.fx + b.fx) / 2 + (random() - 0.5) * 0.05,
          fy: (a.fy + b.fy) / 2 + (random() - 0.5) * 0.04,
          radius: (a.r + b.r) * 0.4,
          seed: random() * Math.PI * 2,
        });
      }
      targets.push({ fx: spine[i].fx, fy: spine[i].fy, radius: spine[i].r, seed: random() * Math.PI * 2 });
    }
    // Cocoon-stage strikes hammer the upward-facing arc the pentagram can
    // actually reach, spread by the golden ratio so consecutive hits never
    // land in the same spot.
    const feedAngles = [];
    for (let i = 0; i < P2_COCOON_HITS; i++) {
      const f = (i * 0.618034) % 1;
      feedAngles.push(-Math.PI / 2 + (f - 0.5) * (Math.PI - 0.7));
    }
    // Interior dressing of the cocoon: counter-rotating swirl bands and
    // orbiting ember motes, seeded once so they are stable frame to frame.
    const swirls = [];
    for (let i = 0; i < 6; i++) {
      swirls.push({
        rf: 0.28 + i * 0.115 + random() * 0.05,
        speed: (0.4 + random() * 0.8) * (i % 2 ? -1 : 1),
        width: 7 + random() * 11,
        alpha: 0.2 + random() * 0.16,
        span: 1.6 + random() * 1.6,
        ph: random() * Math.PI * 2,
        red: random() < 0.4,
      });
    }
    const motes = [];
    for (let i = 0; i < 26; i++) {
      motes.push({
        a0: random() * Math.PI * 2,
        rf: 0.25 + random() * 0.68,
        sp: (0.00025 + random() * 0.0006) * (random() < 0.5 ? -1 : 1),
        size: 1 + random() * 1.8,
        ph: random() * Math.PI * 2,
      });
    }
    return {
      rng: mulberry32(0x77a1b3),   // per-launch beam curvature
      targets,
      nextTarget: 0,
      launchCount: 0,
      nextBeamAt: PHASE2_ARENA_TRANSITION + PHASE2_ORB_LAUNCH + PHASE2_PENT_FORM + 260,
      beams: [],
      marks: [],
      floodStart: 0,
      floodP: 0,
      pentFade: 1,
      cocoon: {
        hits: 0, feedAngles, nextAngle: 0,
        p: 0, pulse: 0, spin: 0, alpha: 0,
        ripples: [], swirls, motes,
      },
      maskCanvas: null,
      maskCtx: null,
      maskW: 0,
      maskH: 0,
      embers: null,
      veins: null,
    };
  }

  // ---- Tempo / beat clock -----------------------------------------------
  function makeBossMusicPulseWave(context, duty) {
    const harmonics = 64;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) {
      real[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty);
      imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty));
    }
    return context.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  function makeBossMusicCrusherCurve(bits) {
    const size = 65536;
    const curve = new Float32Array(size);
    const levels = Math.pow(2, bits - 1);
    for (let i = 0; i < size; i++) {
      const sample = i / (size - 1) * 2 - 1;
      curve[i] = Math.round(sample * levels) / levels;
    }
    return curve;
  }

  function makeBossMusicDriveCurve(amount) {
    const size = 32768;
    const curve = new Float32Array(size);
    const driveAmount = 1 + amount * 75;
    for (let i = 0; i < size; i++) {
      const sample = i / (size - 1) * 2 - 1;
      curve[i] = ((1 + driveAmount) * sample) / (1 + driveAmount * Math.abs(sample));
    }
    return curve;
  }

  function makeBossSfxNoiseBuffer(context) {
    const frames = Math.ceil(context.sampleRate * 1.25);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    const random = mulberry32(0x5f1a2026);
    let held = 0;
    for (let i = 0; i < frames; i++) {
      if (i % 3 === 0) held = random() * 2 - 1;
      data[i] = held;
    }
    return buffer;
  }

  // One deterministic glass-and-stone fracture, stored both forwards and
  // sample-for-sample backwards. PERSIST therefore really reverses the crack
  // instead of merely substituting a vaguely "rising" sound.
  function makeBossSfxCrackBuffers(context) {
    const duration = 0.52;
    const frames = Math.ceil(context.sampleRate * duration);
    const forward = context.createBuffer(1, frames, context.sampleRate);
    const reverse = context.createBuffer(1, frames, context.sampleRate);
    const data = forward.getChannelData(0);
    const reversed = reverse.getChannelData(0);
    const random = mulberry32(0xc2ac2026);
    const splinters = [0, 0.012, 0.029, 0.051, 0.084, 0.128, 0.184, 0.257, 0.346];
    let held = 0;
    for (let i = 0; i < frames; i++) {
      const t = i / context.sampleRate;
      let sample = Math.sin(2 * Math.PI * (68 - t * 42) * t) * Math.exp(-t * 10) * 0.34;
      for (let k = 0; k < splinters.length; k++) {
        const age = t - splinters[k];
        if (age < 0 || age > 0.055 + k * 0.002) continue;
        if (i % (2 + (k % 3)) === 0) held = random() * 2 - 1;
        const grit = held * Math.exp(-age * (48 + k * 3));
        const shard = Math.sin(2 * Math.PI * (1350 + k * 173) * age) * Math.exp(-age * 82);
        sample += grit * (0.34 - k * 0.016) + shard * 0.16;
      }
      const edge = Math.min(1, i / 96, (frames - 1 - i) / 96);
      data[i] = Math.max(-1, Math.min(1, sample * Math.max(0, edge)));
    }
    for (let i = 0; i < frames; i++) reversed[i] = data[frames - 1 - i];
    return { forward, reverse };
  }

  function makeBossSfxGeneratedBuffer(context, duration, seed, renderSample) {
    const frames = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    const random = mulberry32(seed);
    for (let i = 0; i < frames; i++) {
      const t = i / context.sampleRate;
      const edge = Math.min(1, i / 96, (frames - 1 - i) / 96);
      const sample = renderSample(t, duration, random, i);
      data[i] = Math.tanh(sample * 1.35) * Math.max(0, edge);
    }
    return buffer;
  }

  function makeBossSfxImpactTexture(context, options) {
    const config = options || {};
    let coloredNoise = 0;
    return makeBossSfxGeneratedBuffer(
      context,
      config.duration,
      config.seed,
      (t, duration, random) => {
        coloredNoise += ((random() * 2 - 1) - coloredNoise) * (config.noiseSlew || 0.16);
        const p = t / duration;
        const noiseEnd = Math.max(0.2, Math.min(0.94, config.noiseEnd || 0.62));
        const noiseTail = Math.max(0, Math.min(1, (1 - p) / (1 - noiseEnd)));
        const noiseGate = p <= noiseEnd ? 1 : noiseTail * noiseTail;
        const f0 = config.subStart || 78;
        const f1 = config.subEnd || 24;
        const phase = Math.PI * 2 * (f0 * t + (f1 - f0) * t * t / (2 * duration));
        let sample = Math.sin(phase) * Math.exp(-t * (config.subDecay || 4.5)) *
          (config.subAmount || 0.72);
        const bursts = config.bursts || [0];
        for (let i = 0; i < bursts.length; i++) {
          const age = t - bursts[i];
          if (age < 0) continue;
          const decay = Math.exp(-age * ((config.burstDecay || 12) + i * 0.7));
          sample += coloredNoise * decay * noiseGate * (config.noiseAmount || 0.68);
          sample += Math.sin(Math.PI * 2 * (config.crackHz || 540) * age) *
            Math.exp(-age * 38) * (config.crackAmount || 0.16);
        }
        if (config.sustain) {
          const body = Math.min(1, t / 0.025) * Math.exp(-Math.max(0, t - config.sustain) * 7);
          const carrier = Math.sin(Math.PI * 2 * (config.carrierHz || 46) * t) +
            0.35 * Math.sin(Math.PI * 2 * (config.carrierHz || 46) * 1.49 * t);
          sample += carrier * body * (config.carrierAmount || 0.22);
          sample += coloredNoise * body * noiseGate * (config.roarAmount || 0.30);
        }
        return sample;
      }
    );
  }

  function makeBossSfxSampleBank(context) {
    const pentagramDuration = 5 * (PENT_ARM + PENT_PAUSE) / 1000 + CIRCLE_BURN / 1000;
    let ritualBreath = 0;
    const pentagramRitual = makeBossSfxGeneratedBuffer(
      context,
      pentagramDuration,
      0x51a12026,
      (t, duration, random) => {
        ritualBreath += ((random() * 2 - 1) - ritualBreath) * 0.018;
        const p = t / duration;
        const armsEnd = 5 * (PENT_ARM + PENT_PAUSE) / 1000;
        const seal = Math.max(0, Math.min(1, (t - armsEnd) / (CIRCLE_BURN / 1000)));
        const threat = 0.18 + p * 0.82;
        const drone = Math.sin(Math.PI * 2 * 36.7 * t) +
          0.72 * Math.sin(Math.PI * 2 * 38.9 * t) +
          0.38 * Math.sin(Math.PI * 2 * 55 * t);
        const strokePhase = (t % ((PENT_ARM + PENT_PAUSE) / 1000)) /
          ((PENT_ARM + PENT_PAUSE) / 1000);
        const etch = strokePhase < PENT_ARM / (PENT_ARM + PENT_PAUSE)
          ? ritualBreath * (0.25 + 0.75 * strokePhase)
          : ritualBreath * 0.08;
        const sealGrowl = seal > 0
          ? Math.sin(Math.PI * 2 * (29 + seal * 12) * t) * seal
          : 0;
        const cleanTail = Math.max(0, Math.min(1, (1 - p) / 0.16));
        return drone * threat * 0.24 + etch * 0.65 * cleanTail + sealGrowl * 0.52 +
          ritualBreath * seal * 0.38 * cleanTail;
      }
    );

    let castAir = 0;
    const swordCast = makeBossSfxGeneratedBuffer(
      context,
      0.68,
      0x5a0d2026,
      (t, duration, random) => {
        castAir += ((random() * 2 - 1) - castAir) * (0.025 + t / duration * 0.08);
        const p = t / duration;
        const swell = Math.pow(Math.sin(Math.PI * p * 0.5), 1.7);
        const light = Math.sin(Math.PI * 2 * 196 * t) +
          0.55 * Math.sin(Math.PI * 2 * 293.66 * t) +
          0.30 * Math.sin(Math.PI * 2 * 392 * t);
        const body = Math.sin(Math.PI * 2 * 73.4 * t);
        const cleanTail = Math.max(0, Math.min(1, (1 - p) / 0.24));
        return light * swell * 0.23 + body * swell * 0.36 +
          castAir * swell * cleanTail * 0.54;
      }
    );

    let whooshNoise = 0;
    const swordWhoosh = makeBossSfxGeneratedBuffer(
      context,
      0.36,
      0x5a112026,
      (t, duration, random) => {
        const p = t / duration;
        const speed = Math.sin(Math.PI * p);
        whooshNoise += ((random() * 2 - 1) - whooshNoise) * (0.08 + speed * 0.34);
        const blade = Math.sin(Math.PI * 2 * (82 + p * 115) * t);
        return whooshNoise * speed * 1.05 + blade * speed * 0.28;
      }
    );

    return {
      pentagramRitual,
      pentaDeathRay: makeBossSfxImpactTexture(context, {
        duration: 0.95, seed: 0xdea12026, subStart: 92, subEnd: 21,
        sustain: 0.72, carrierHz: 43.65, roarAmount: 0.52, carrierAmount: 0.34,
        noiseAmount: 0.62, burstDecay: 5.8, crackHz: 780,
      }),
      tentacleLash: makeBossSfxImpactTexture(context, {
        duration: 0.72, seed: 0x7e172026, subStart: 74, subEnd: 20,
        bursts: [0, 0.045, 0.105], noiseSlew: 0.055, noiseAmount: 0.82,
        burstDecay: 10, crackHz: 185, crackAmount: 0.10,
      }),
      xraySlam: makeBossSfxImpactTexture(context, {
        duration: 0.92, seed: 0xa7a12026, subStart: 108, subEnd: 19,
        bursts: [0, 0.018], noiseAmount: 0.76, burstDecay: 8,
        crackHz: 1220, crackAmount: 0.24, sustain: 0.34, carrierHz: 34.6,
      }),
      bloodFlare: makeBossSfxImpactTexture(context, {
        duration: 0.88, seed: 0xb1002026, subStart: 66, subEnd: 18,
        bursts: [0, 0.12, 0.24], noiseSlew: 0.035, noiseAmount: 0.66,
        burstDecay: 7, sustain: 0.55, carrierHz: 32.7, roarAmount: 0.32,
      }),
      boardAnnihilation: makeBossSfxImpactTexture(context, {
        duration: 1.42, seed: 0xb04d2026, subStart: 82, subEnd: 16,
        bursts: [0, 0.035, 0.18], noiseAmount: 0.82, burstDecay: 4.2,
        sustain: 1.12, carrierHz: 29.1, carrierAmount: 0.44, roarAmount: 0.62,
        crackHz: 430, crackAmount: 0.18,
      }),
      checkerExplosion: makeBossSfxImpactTexture(context, {
        duration: 0.92, seed: 0xc4ec2026, subStart: 96, subEnd: 20,
        bursts: [0, 0.028, 0.061, 0.103, 0.158], noiseAmount: 0.78,
        burstDecay: 13, crackHz: 980, crackAmount: 0.26,
      }),
      voidErupt: makeBossSfxImpactTexture(context, {
        duration: 0.82, seed: 0x701d2026, subStart: 58, subEnd: 17,
        bursts: [0, 0.08], noiseSlew: 0.025, noiseAmount: 0.92,
        burstDecay: 6.5, sustain: 0.48, carrierHz: 27.5, roarAmount: 0.38,
      }),
      orbVolley: makeBossSfxImpactTexture(context, {
        duration: 0.88, seed: 0x0ab2026, subStart: 72, subEnd: 22,
        bursts: [0, 0.09, 0.18, 0.27, 0.36], noiseAmount: 0.58,
        burstDecay: 15, crackHz: 310, crackAmount: 0.18,
      }),
      swordCast,
      swordWhoosh,
      holyImpact: makeBossSfxImpactTexture(context, {
        duration: 0.82, seed: 0x40172026, subStart: 118, subEnd: 24,
        bursts: [0, 0.025, 0.07], noiseAmount: 0.62, burstDecay: 8,
        crackHz: 1760, crackAmount: 0.24, sustain: 0.42,
        carrierHz: 98, carrierAmount: 0.22, roarAmount: 0.20,
      }),
    };
  }

  function createBossMusic() {
    if (bossMusic) return bossMusic;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    let context;
    try {
      context = new AudioContext();
    } catch (error) {
      console.warn('Unable to start boss music:', error);
      return null;
    }

    const input = context.createGain();
    const crusher = context.createWaveShaper();
    const drive = context.createWaveShaper();
    const filter = context.createBiquadFilter();
    const dry = context.createGain();
    const delay = context.createDelay(2);
    const feedback = context.createGain();
    const wet = context.createGain();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const trackGains = BOSS_MOTIF.layers.map(() => context.createGain());
    const sfxInput = context.createGain();
    const sfxFilter = context.createBiquadFilter();
    const sfxMaster = context.createGain();
    const sfxLimiter = context.createDynamicsCompressor();
    const musicUserGain = context.createGain();
    const effectsUserGain = context.createGain();
    const overallMaster = context.createGain();
    const analyser = context.createAnalyser();

    crusher.curve = makeBossMusicCrusherCurve(BOSS_MOTIF.synth.bitDepth);
    crusher.oversample = 'none';
    drive.curve = makeBossMusicDriveCurve(BOSS_MOTIF.synth.drive);
    drive.oversample = 'none';
    filter.type = 'lowpass';
    filter.frequency.value = BOSS_MOTIF.synth.cutoffHz;
    filter.Q.value = 1.2;
    dry.gain.value = 1;
    wet.gain.value = BOSS_MOTIF.synth.echo * 0.9;
    feedback.gain.value = Math.min(0.6, BOSS_MOTIF.synth.echo * 1.05);
    master.gain.value = 0.0001;
    compressor.threshold.value = -15;
    compressor.knee.value = 4;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    // Keep headroom before voices sum. Pulse/noise sources already provide the
    // pixel texture; a shared crusher here turned dense combo waves into clips.
    sfxInput.gain.value = 0.62;
    sfxFilter.type = 'lowpass';
    sfxFilter.frequency.value = 5200;
    sfxFilter.Q.value = 0.55;
    sfxMaster.gain.value = BOSS_SFX_MASTER_GAIN;
    sfxLimiter.threshold.value = -5;
    sfxLimiter.knee.value = 2;
    sfxLimiter.ratio.value = 12;
    sfxLimiter.attack.value = 0.003;
    sfxLimiter.release.value = 0.14;
    musicUserGain.gain.value = bossAudioMix.music;
    effectsUserGain.gain.value = bossAudioMix.effects;
    overallMaster.gain.value = bossAudioMix.overall;
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.58;

    trackGains.forEach((gain) => {
      gain.gain.value = 0;
      gain.connect(input);
    });
    input.connect(crusher).connect(drive).connect(filter);
    filter.connect(dry).connect(master);
    filter.connect(delay).connect(wet).connect(master);
    delay.connect(feedback).connect(delay);
    master.connect(compressor).connect(musicUserGain).connect(overallMaster);
    sfxInput.connect(sfxFilter).connect(sfxMaster).connect(sfxLimiter);
    sfxLimiter.connect(effectsUserGain).connect(overallMaster);
    overallMaster.connect(analyser).connect(context.destination);

    bossMusic = {
      context,
      delay,
      master,
      trackGains,
      musicUserGain,
      effectsUserGain,
      overallMaster,
      analyser,
      analyserTimeData: new Uint8Array(analyser.fftSize),
      sfxInput,
      sfxNoise: makeBossSfxNoiseBuffer(context),
      sfxCrack: makeBossSfxCrackBuffers(context),
      sfxSamples: makeBossSfxSampleBank(context),
      sfxLastAt: Object.create(null),
      sfxEventTimes: [],
      vpSfx: null,
      spiralSfx: null,
      phase2MassSfx: null,
      waves: {
        pulse12: makeBossMusicPulseWave(context, 0.125),
        pulse18: makeBossMusicPulseWave(context, 0.1875),
        pulse25: makeBossMusicPulseWave(context, 0.25),
      },
    };
    return bossMusic;
  }

  function scheduleBossSfxTone(destination, voice, frequency, endFrequency, time, duration, amount, options) {
    if (!bossMusic || amount <= 0 || duration <= 0) return null;
    const context = bossMusic.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const config = options || {};
    if (bossMusic.waves[voice]) oscillator.setPeriodicWave(bossMusic.waves[voice]);
    else oscillator.type = voice;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), time);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency == null ? frequency : endFrequency),
      time + duration
    );
    oscillator.detune.setValueAtTime(config.detune || 0, time);
    const attack = Math.max(0.001, Math.min(duration * 0.35, config.attack || 0.003));
    envelope.gain.setValueAtTime(0.0001, time);
    if (config.build) {
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, amount * 0.12), time + attack);
      envelope.gain.linearRampToValueAtTime(amount, time + duration * 0.88);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    } else {
      envelope.gain.exponentialRampToValueAtTime(amount, time + attack);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    }
    oscillator.connect(envelope).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    return { oscillator, envelope };
  }

  function restartVpSfxPhrase(destination, time, weight) {
    if (!bossMusic) return;
    const context = bossMusic.context;
    const now = context.currentTime;
    const previous = bossMusic.vpSfx;
    if (previous) {
      clearTimeout(previous.tailTimer);
      clearTimeout(previous.cleanupTimer);
      previous.gain.gain.cancelScheduledValues(now);
      previous.gain.gain.setTargetAtTime(0.0001, now, 0.003);
      for (const voice of previous.voices) {
        try { voice.oscillator.stop(now + 0.015); } catch (_) {}
      }
      setTimeout(() => {
        try { previous.gain.disconnect(); } catch (_) {}
      }, 24);
    }

    const phraseGain = context.createGain();
    phraseGain.gain.setValueAtTime(1, now);
    phraseGain.connect(destination);
    const pitches = [659.25, 783.99, 987.77, 1174.66];
    const subdivisionSeconds = beatMs / 1000 / BOSS_SFX_VP_STEPS_PER_BEAT;
    const noteGap = Math.max(0.065, subdivisionSeconds * 0.72);
    const voices = [];
    const scheduleNote = (i, at) => {
      const pitch = pitches[i];
      const voice = scheduleBossSfxTone(
        phraseGain,
        'pulse25',
        pitch,
        pitch * 1.035,
        at,
        0.032,
        0.064 * weight * (1 - i * 0.08),
        { attack: 0.001 }
      );
      if (voice) voices.push(voice);
    };
    scheduleNote(0, time);
    const phrase = {
      gain: phraseGain,
      voices,
      tailTimer: null,
      cleanupTimer: null,
    };
    bossMusic.vpSfx = phrase;
    phrase.tailTimer = setTimeout(() => {
      if (!bossMusic || bossMusic.vpSfx !== phrase) return;
      const tailAt = context.currentTime + 0.003;
      for (let i = 1; i < pitches.length; i++) {
        scheduleNote(i, tailAt + noteGap * (i - 1));
      }
      phrase.cleanupTimer = setTimeout(() => {
        if (bossMusic && bossMusic.vpSfx === phrase) bossMusic.vpSfx = null;
        try { phraseGain.disconnect(); } catch (_) {}
      }, Math.ceil((noteGap * (pitches.length - 2) + 0.10) * 1000));
    }, Math.ceil(noteGap * 1000));
  }

  function scheduleBossSfxNoise(destination, time, duration, amount, type, frequency, q, endFrequency, build) {
    if (!bossMusic || amount <= 0 || duration <= 0) return;
    const context = bossMusic.context;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = bossMusic.sfxNoise;
    source.loop = true;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, time);
    if (endFrequency != null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), time + duration);
    }
    filter.Q.setValueAtTime(q || 0.7, time);
    if (build) {
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, amount * 0.10), time + 0.012);
      envelope.gain.linearRampToValueAtTime(amount, time + duration * 0.88);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    } else {
      envelope.gain.setValueAtTime(amount, time);
      const cleanEnd = time + duration * 0.72;
      envelope.gain.exponentialRampToValueAtTime(0.0001, cleanEnd);
    }
    source.connect(filter).connect(envelope).connect(destination);
    const maxOffset = Math.max(0, bossMusic.sfxNoise.duration - duration);
    source.start(time, Math.random() * maxOffset);
    source.stop(time + (build ? duration : duration * 0.72) + 0.01);
  }

  function startBloodSpiralAudio() {
    const music = createBossMusic();
    if (!music || music.spiralSfx) return;
    const context = music.context;
    const now = context.currentTime;
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const low = context.createOscillator();
    const growl = context.createOscillator();
    const toneGain = context.createGain();
    const mix = context.createGain();
    const envelope = context.createGain();
    const panner = context.createStereoPanner ? context.createStereoPanner() : context.createGain();

    noise.buffer = music.sfxNoise;
    noise.loop = true;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 135;
    noiseFilter.Q.value = 0.85;
    noiseGain.gain.value = 0.055;
    low.type = 'sine';
    low.frequency.value = 34;
    growl.type = 'triangle';
    growl.frequency.value = 48;
    growl.detune.value = -11;
    toneGain.gain.value = 0.10;
    mix.gain.value = 1;
    envelope.gain.value = 0.0001;
    if (panner.pan) panner.pan.value = 0;

    noise.connect(noiseFilter).connect(noiseGain).connect(mix);
    low.connect(toneGain);
    growl.connect(toneGain);
    toneGain.connect(mix);
    mix.connect(envelope).connect(panner).connect(music.sfxInput);
    noise.start(now, Math.random() * Math.max(0, music.sfxNoise.duration - 0.1));
    low.start(now);
    growl.start(now);
    envelope.gain.exponentialRampToValueAtTime(0.14, now + 0.055);
    music.spiralSfx = { noise, noiseFilter, low, growl, envelope, panner };
  }

  function updateBloodSpiralAudio(spirals) {
    const music = bossMusic;
    if (!music || !spirals || !spirals.length || combatPaused || dead) {
      stopBloodSpiralAudio();
      return;
    }
    startBloodSpiralAudio();
    const voice = music.spiralSfx;
    if (!voice) return;
    const board = getBoardRect();
    const heroV = worldPointToViewport(hero.x, hero.y, board);
    let nearest = null;
    let nearestDistance = Infinity;
    let fastest = 0;
    for (const attack of spirals) {
      const tau = bloodTau(attack);
      fastest = Math.max(fastest, attack.fire);
      for (let k = 0; k < BLOOD_BEAMS; k++) {
        const foot = bloodBeamFoot(attack, k, tau);
        const distance = Math.hypot(foot.x - heroV.x, foot.y - heroV.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = foot;
        }
      }
    }
    const now = music.context.currentTime;
    const proximity = 1 - Math.max(0, Math.min(1, nearestDistance / Math.max(1, board.width * 0.58)));
    const targetGain = 0.075 + proximity * 0.105 + fastest * 0.035;
    const pan = nearest
      ? Math.max(-1, Math.min(1, (nearest.x - heroV.x) / Math.max(1, board.width * 0.30)))
      : 0;
    voice.envelope.gain.setTargetAtTime(targetGain, now, 0.025);
    if (voice.panner.pan) voice.panner.pan.setTargetAtTime(pan, now, 0.018);
    voice.noiseFilter.frequency.setTargetAtTime(125 + fastest * 155, now, 0.035);
    voice.low.frequency.setTargetAtTime(32 + fastest * 13, now, 0.035);
    voice.growl.frequency.setTargetAtTime(46 + fastest * 24, now, 0.035);
  }

  function stopBloodSpiralAudio(immediate) {
    if (!bossMusic || !bossMusic.spiralSfx) return;
    const voice = bossMusic.spiralSfx;
    bossMusic.spiralSfx = null;
    const now = bossMusic.context.currentTime;
    const stopAt = now + (immediate ? 0.012 : 0.055);
    voice.envelope.gain.cancelScheduledValues(now);
    voice.envelope.gain.setValueAtTime(Math.max(0.0001, voice.envelope.gain.value), now);
    voice.envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    [voice.noise, voice.low, voice.growl].forEach((source) => {
      try { source.stop(stopAt + 0.01); } catch (_) {}
    });
  }

  function startPhaseTwoMassAudio() {
    const music = createBossMusic();
    if (!music || music.phase2MassSfx) return;
    const context = music.context;
    const now = context.currentTime;
    const low = context.createOscillator();
    const discord = context.createOscillator();
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const toneGain = context.createGain();
    const envelope = context.createGain();
    low.type = 'sine';
    low.frequency.value = 27.5;
    discord.type = 'triangle';
    discord.frequency.value = 29.1;
    discord.detune.value = -13;
    noise.buffer = music.sfxNoise;
    noise.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 115;
    filter.Q.value = 0.75;
    noiseGain.gain.value = 0.025;
    toneGain.gain.value = 0.14;
    envelope.gain.value = 0.0001;
    low.connect(toneGain);
    discord.connect(toneGain);
    toneGain.connect(envelope);
    noise.connect(filter).connect(noiseGain).connect(envelope);
    envelope.connect(music.sfxInput);
    low.start(now);
    discord.start(now);
    noise.start(now, Math.random() * Math.max(0, music.sfxNoise.duration - 0.1));
    envelope.gain.exponentialRampToValueAtTime(0.10, now + 0.18);
    music.phase2MassSfx = { low, discord, noise, filter, noiseGain, envelope };
  }

  function updatePhaseTwoMassAudio(progress, flood) {
    startPhaseTwoMassAudio();
    if (!bossMusic || !bossMusic.phase2MassSfx) return;
    const voice = bossMusic.phase2MassSfx;
    const now = bossMusic.context.currentTime;
    const p = clamp01(progress || 0);
    voice.envelope.gain.setTargetAtTime(0.085 + p * 0.075 + flood * 0.035, now, 0.055);
    voice.low.frequency.setTargetAtTime(27.5 + p * 9, now, 0.07);
    voice.discord.frequency.setTargetAtTime(29.1 + p * 13, now, 0.07);
    voice.filter.frequency.setTargetAtTime(105 + p * 135 + flood * 90, now, 0.07);
    voice.noiseGain.gain.setTargetAtTime(0.018 + p * 0.018, now, 0.08);
  }

  function stopPhaseTwoMassAudio(immediate) {
    if (!bossMusic || !bossMusic.phase2MassSfx) return;
    const voice = bossMusic.phase2MassSfx;
    bossMusic.phase2MassSfx = null;
    const now = bossMusic.context.currentTime;
    const stopAt = now + (immediate ? 0.012 : 0.14);
    voice.envelope.gain.cancelScheduledValues(now);
    voice.envelope.gain.setValueAtTime(Math.max(0.0001, voice.envelope.gain.value), now);
    voice.envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    [voice.low, voice.discord, voice.noise].forEach((source) => {
      try { source.stop(stopAt + 0.01); } catch (_) {}
    });
  }

  function scheduleBossSfxSample(destination, buffer, time, amount, options) {
    if (!bossMusic || !buffer) return;
    const source = bossMusic.context.createBufferSource();
    const gain = bossMusic.context.createGain();
    const config = options || {};
    source.buffer = buffer;
    gain.gain.setValueAtTime(amount, time);
    source.connect(gain).connect(destination);
    if (Number.isFinite(config.duration)) {
      source.start(time, Math.max(0, config.offset || 0), config.duration);
    } else {
      source.start(time, Math.max(0, config.offset || 0));
    }
  }

  function movementForAttackType(type) {
    if (type === 'pentaBeam') return 'pentagrams';
    if (type === 'tentacle') return 'tentacles';
    if (type === 'xRay') return 'xrays';
    if (type === 'bloodSpiral' || type === 'pentLine' || type === 'outsidePent') return 'bloodspiral';
    if (type === 'checkerboard') return 'checkerboard';
    if (type === 'portalCurve') return 'portalbarrage';
    if (type === 'sidePortals') return 'sideportals';
    return 'pentagrams';
  }

  function scheduleMovementCharge(out, movement, data, time) {
    const chargeBeats = Number.isFinite(data.beats) ? data.beats : 1;
    const duration = Math.max(0.42, Math.min(
      2.10,
      (60 / Math.max(1, bpm)) * chargeBeats * 0.92
    ));
    const build = { attack: 0.035, build: true };

    if (movement === 'tentacles') {
      scheduleBossSfxTone(out, 'sine', 25, 31, time, duration, 0.30, build);
      scheduleBossSfxTone(out, 'sawtooth', 34.6, 29.1, time, duration * 0.96, 0.13, {
        detune: -18, attack: 0.045, build: true,
      });
      scheduleBossSfxNoise(out, time, duration, 0.20, 'lowpass', 125, 0.8, 390, true);
    } else if (movement === 'xrays') {
      scheduleBossSfxTone(out, 'sine', 41.2, 39.8, time, duration, 0.25, build);
      scheduleBossSfxTone(out, 'triangle', 58.27, 56.4, time, duration, 0.20, {
        attack: 0.05, build: true,
      });
      scheduleBossSfxNoise(out, time, duration, 0.14, 'bandpass', 180, 2.6, 510, true);
    } else if (movement === 'bloodspiral') {
      scheduleBossSfxTone(out, 'sine', 32.7, 34.6, time, duration, 0.27, build);
      scheduleBossSfxTone(out, 'sine', 34.6, 32.7, time, duration, 0.25, {
        attack: 0.04, build: true,
      });
      scheduleBossSfxNoise(out, time, duration, 0.20, 'bandpass', 95, 1.3, 430, true);
      scheduleBossSfxTone(out, 'triangle', 49, 32.7, time, Math.min(0.20, duration), 0.20);
      scheduleBossSfxTone(out, 'triangle', 46.2, 30.9, time + duration * 0.48,
        Math.min(0.20, duration * 0.3), 0.17);
    } else if (movement === 'checkerboard') {
      scheduleBossSfxTone(out, 'triangle', 36.7, 43.65, time, duration, 0.24, build);
      scheduleBossSfxTone(out, 'sine', 51.9, 49, time, duration, 0.18, {
        attack: 0.045, build: true,
      });
      scheduleBossSfxNoise(out, time, duration, 0.16, 'bandpass', 260, 3.2, 760, true);
    } else if (movement === 'portalbarrage') {
      scheduleBossSfxTone(out, 'sine', 43.65, 27.5, time, duration, 0.29, build);
      scheduleBossSfxTone(out, 'triangle', 61.7, 36.7, time, duration * 0.98, 0.16, {
        detune: -21, attack: 0.05, build: true,
      });
      scheduleBossSfxNoise(out, time, duration, 0.24, 'bandpass', 920, 0.8, 135, true);
    } else if (movement === 'sideportals') {
      scheduleBossSfxTone(out, 'sine', 27.5, 30.9, time, duration, 0.28, build);
      scheduleBossSfxTone(out, 'triangle', 30.9, 27.5, time, duration, 0.23, {
        detune: 13, attack: 0.04, build: true,
      });
      scheduleBossSfxNoise(out, time, duration, 0.16, 'bandpass', 140, 1.6, 480, true);
    } else {
      // Pentagrams: a whispered minor-second sigil hum, not a weapon charge.
      scheduleBossSfxTone(out, 'sine', 36.7, 38.9, time, duration, 0.28, build);
      scheduleBossSfxTone(out, 'triangle', 49, 46.2, time, duration, 0.20, {
        detune: -9, attack: 0.04, build: true,
      });
      scheduleBossSfxNoise(out, time, duration, 0.18, 'bandpass', 210, 2.1, 670, true);
    }
  }

  function scheduleMovementImpact(out, movement, data, time) {
    if (movement === 'tentacles') {
      scheduleBossSfxSample(out, bossMusic.sfxSamples.tentacleLash, time, 0.92);
      scheduleBossSfxTone(out, 'sine', 74, 21, time, 0.52, 0.42);
    } else if (movement === 'xrays') {
      scheduleBossSfxSample(out, bossMusic.sfxSamples.xraySlam, time, 1.0);
      scheduleBossSfxTone(out, 'sine', 105, 19, time, 0.68, 0.48);
    } else if (movement === 'bloodspiral') {
      const flood = data.attack === 'outsidePent';
      scheduleBossSfxSample(
        out,
        flood ? bossMusic.sfxSamples.boardAnnihilation : bossMusic.sfxSamples.bloodFlare,
        time,
        flood ? 1.08 : 0.94
      );
      scheduleBossSfxTone(out, 'sine', flood ? 78 : 62, 17, time, flood ? 1.05 : 0.66,
        flood ? 0.55 : 0.39);
    } else if (movement === 'checkerboard') {
      scheduleBossSfxSample(out, bossMusic.sfxSamples.checkerExplosion, time, 1.06);
      scheduleBossSfxTone(out, 'sine', 96, 20, time, 0.58, 0.46);
    } else if (movement === 'portalbarrage') {
      scheduleBossSfxSample(out, bossMusic.sfxSamples.voidErupt, time, 0.96);
      scheduleBossSfxTone(out, 'sine', 58, 18, time, 0.62, 0.38);
    } else if (movement === 'sideportals') {
      scheduleBossSfxSample(out, bossMusic.sfxSamples.orbVolley, time, 0.96);
      scheduleBossSfxTone(out, 'sine', 68, 21, time, 0.64, 0.36);
    } else {
      scheduleBossSfxSample(out, bossMusic.sfxSamples.pentaDeathRay, time, 1.04);
      scheduleBossSfxTone(out, 'sine', 92, 19, time, 0.74, 0.48);
    }
  }

  function playBossSfx(name, detail) {
    const music = createBossMusic();
    if (!music) return false;
    if (music.context.state === 'suspended') {
      music.context.resume().catch(() => {});
    }
    const now = music.context.currentTime;
    const data = detail || {};
    const movement = data.movement || movementForAttackType(data.attack);
    const throttle = {
      shadowCharge: 0.12,
      cultistAttack: 0.07,
      damage: 0.055,
      phase2Feed: 0.075,
      phase2Orb: 0.06,
      phase2HexOrb: 0.07,
      phase2HexWall: 0.10,
      phase2Plane: 0.10,
      phase2Dash: 0.12,
      phase2ClawCharge: 0.10,
      phase2ClawCut: 0.08,
      phase2Slam: 0.15,
    }[name] || 0;
    const throttleKey = (name === 'shadowCharge' || name === 'cultistAttack')
      ? name + ':' + movement
      : name;
    if (!data.debug &&
        now - (music.sfxLastAt[throttleKey] == null ? -Infinity : music.sfxLastAt[throttleKey]) < throttle) {
      return false;
    }
    // VP owns a monophonic interruptible voice, so it neither waits on nor
    // pollutes the shared SFX concurrency limiter.
    if (!data.debug && name !== 'vp') {
      music.sfxEventTimes = music.sfxEventTimes.filter((eventTime) => now - eventTime < 0.10);
      const expendable = name === 'damage' || name === 'shadowCharge';
      const critical = name === 'vpFull' || name === 'death' || name === 'deathCrack' ||
        name === 'persist' || name === 'playerImpact';
      if ((expendable && music.sfxEventTimes.length >= 3) ||
          (!critical && music.sfxEventTimes.length >= 5)) {
        return false;
      }
      music.sfxEventTimes.push(now);
    }
    music.sfxLastAt[throttleKey] = now;
    const requestedTime = Number.isFinite(data.at) ? data.at : now + 0.006;
    const time = Math.max(now + 0.003, requestedTime);
    const out = music.sfxInput;

    if (name === 'shadowCharge') {
      scheduleMovementCharge(out, movement, data, time);
    } else if (name === 'cultistAttack') {
      scheduleMovementImpact(out, movement, data, time);
    } else if (name === 'vp') {
      const weight = Math.min(1.3, 1 + Math.max(0, (data.overlaps || 1) - 1) * 0.12);
      restartVpSfxPhrase(out, time, weight);
    } else if (name === 'vpFull') {
      scheduleBossSfxTone(out, 'pulse25', 523.25, 523.25, time, 0.10, 0.10, {
        attack: 0.001,
      });
      scheduleBossSfxTone(out, 'pulse25', 659.25, 659.25, time + 0.045, 0.14, 0.095, {
        attack: 0.001,
      });
      scheduleBossSfxTone(out, 'triangle', 130.81, 98, time, 0.24, 0.17, {
        attack: 0.004,
      });
    } else if (name === 'damage') {
      const pitches = [220, 174.61, 138.59, 110];
      const pitch = pitches[Math.abs(data.step || 0) % pitches.length];
      const weight = Math.min(1.25, 1 + Math.max(0, (data.overlaps || 1) - 1) * 0.10);
      scheduleBossSfxTone(out, 'pulse25', pitch, pitch * 0.94, time, 0.052,
        0.13 * weight, { attack: 0.001 });
      scheduleBossSfxTone(out, 'triangle', pitch * 0.5, pitch * 0.42, time, 0.095,
        0.105 * weight, { attack: 0.002 });
    } else if (name === 'death') {
      scheduleBossSfxTone(out, 'sine', 92.5, 22, time, 1.45, 0.68, { attack: 0.001 });
      scheduleBossSfxTone(out, 'pulse12', 138.6, 25, time, 1.28, 0.42, {
        detune: -17,
        attack: 0.002,
      });
      scheduleBossSfxTone(out, 'sawtooth', 55, 27.5, time + 0.16, 1.18, 0.24, {
        attack: 0.018,
      });
      scheduleBossSfxNoise(out, time, 0.82, 0.34, 'lowpass', 1250, 0.8, 180);
      scheduleBossSfxTone(out, 'sine', 46.2, 23.1, time + 0.28, 1.15, 0.46, {
        attack: 0.012,
      });
    } else if (name === 'deathImpact') {
      scheduleBossSfxTone(out, 'pulse12', 123.5, 24.5, time, 0.46, 0.42);
      scheduleBossSfxTone(out, 'sine', 65.4, 18.4, time, 0.78, 0.58);
      scheduleBossSfxNoise(out, time, 0.18, 0.34, 'lowpass', 980, 0.7, 120);
    } else if (name === 'deathCrack') {
      scheduleBossSfxSample(out, music.sfxCrack.forward, time, 1.05);
    } else if (name === 'persist') {
      scheduleBossSfxSample(out, music.sfxCrack.reverse, time, 1.05);
    } else if (name === 'playerAttack') {
      scheduleBossSfxSample(out, music.sfxSamples.swordCast, time, 0.98);
      scheduleBossSfxTone(out, 'sine', 73.4, 36.7, time, 0.64, 0.28, {
        attack: 0.025,
        build: true,
      });
    } else if (name === 'playerTravel') {
      scheduleBossSfxSample(out, music.sfxSamples.swordWhoosh, time, 1.08);
      scheduleBossSfxTone(out, 'triangle', 92, 176, time, 0.34, 0.18, { attack: 0.008 });
    } else if (name === 'playerImpact') {
      const impactScale = data.finalHit ? 1.25 : 1;
      scheduleBossSfxSample(out, music.sfxSamples.holyImpact, time, 1.04 * impactScale);
      scheduleBossSfxTone(out, 'sine', 118, 22, time, 0.72, 0.52 * impactScale);
    } else if (name === 'introFall') {
      scheduleBossSfxTone(out, 'triangle', 82.4, 32.7, time, 0.78, 0.28, {
        attack: 0.012,
      });
      scheduleBossSfxNoise(out, time, 0.76, 0.15, 'bandpass', 820, 0.9, 180);
    } else if (name === 'introLand') {
      scheduleBossSfxTone(out, 'sine', 105, 24, time, 0.42, 0.67, { attack: 0.001 });
      scheduleBossSfxTone(out, 'pulse12', 73.4, 31, time, 0.25, 0.36);
      scheduleBossSfxNoise(out, time, 0.20, 0.44, 'lowpass', 1350, 0.8, 260);
    } else if (name === 'introTentacles') {
      scheduleBossSfxTone(out, 'triangle', 25, 61.7, time, 1.28, 0.33, {
        attack: 0.035,
        build: true,
      });
      scheduleBossSfxTone(out, 'pulse12', 36.7, 82.4, time + 0.08, 1.18, 0.19, {
        detune: -15,
        attack: 0.045,
        build: true,
      });
      scheduleBossSfxNoise(out, time, 1.25, 0.20, 'bandpass', 120, 1.2, 690, true);
    } else if (name === 'introPentagram') {
      scheduleBossSfxSample(out, music.sfxSamples.pentagramRitual, time, 1.02);
    } else if (name === 'introSeal') {
      const ritualDuration = music.sfxSamples.pentagramRitual.duration;
      scheduleBossSfxSample(out, music.sfxSamples.pentagramRitual, time, 0.96, {
        offset: Math.max(0, ritualDuration - CIRCLE_BURN / 1000),
        duration: CIRCLE_BURN / 1000,
      });
    } else if (name === 'introRise') {
      scheduleBossSfxTone(out, 'sine', 29.1, 58.3, time, 0.92, 0.46, {
        attack: 0.035,
      });
      scheduleBossSfxTone(out, 'pulse12', 43.65, 87.3, time + 0.08, 0.82, 0.27, {
        detune: -14,
        attack: 0.045,
      });
      scheduleBossSfxNoise(out, time, 0.78, 0.18, 'bandpass', 150, 1.4, 620);
    } else if (name === 'phase2Fall') {
      scheduleBossSfxTone(out, 'sine', 82.4, 21.8, time, 1.05, 0.54);
      scheduleBossSfxTone(out, 'triangle', 55, 27.5, time + 0.08, 0.82, 0.25);
      scheduleBossSfxNoise(out, time, 0.32, 0.24, 'lowpass', 620, 0.8, 95);
    } else if (name === 'phase2Mass') {
      scheduleBossSfxTone(out, 'sine', 27.5, 36.7, time, 1.35, 0.34, { build: true });
      scheduleBossSfxTone(out, 'triangle', 29.1, 43.65, time, 1.35, 0.22, {
        detune: -13, build: true,
      });
      scheduleBossSfxNoise(out, time, 1.30, 0.12, 'lowpass', 105, 0.8, 310, true);
    } else if (name === 'phase2Feed') {
      const base = data.kind === 'cocoon' ? 43.65 : 61.74;
      scheduleBossSfxTone(out, 'pulse12', base * 1.8, base, time, 0.14, 0.19);
      scheduleBossSfxTone(out, 'sine', base, base * 0.55, time, 0.24, 0.25);
    } else if (name === 'phase2Emerge') {
      scheduleBossSfxTone(out, 'sawtooth', 27.5, 73.4, time, 1.12, 0.24, {
        attack: 0.025, build: true,
      });
      scheduleBossSfxTone(out, 'sine', 36.7, 55, time + 0.12, 1.0, 0.34, { build: true });
      scheduleBossSfxTone(out, 'triangle', 38.9, 58.3, time + 0.12, 1.0, 0.20, {
        detune: -9, build: true,
      });
    } else if (name === 'phase2Slam') {
      scheduleBossSfxSample(out, music.sfxSamples.boardAnnihilation, time, 0.82, { duration: 0.92 });
      scheduleBossSfxTone(out, 'sine', 98, 16.4, time, 0.88, 0.62);
    } else if (name === 'phase2ClawCharge') {
      scheduleBossSfxTone(out, 'sawtooth', 34.6, 69.3, time, 0.48, 0.16, { build: true });
      scheduleBossSfxNoise(out, time, 0.46, 0.14, 'bandpass', 150, 2.4, 520, true);
    } else if (name === 'phase2ClawCut') {
      scheduleBossSfxSample(out, music.sfxSamples.tentacleLash, time, 0.62, { duration: 0.48 });
      scheduleBossSfxTone(out, 'pulse12', 110, 27.5, time, 0.38, 0.30);
    } else if (name === 'phase2Dash') {
      scheduleBossSfxNoise(out, time, 0.22, 0.20, 'bandpass', 760, 0.9, 140);
      scheduleBossSfxTone(out, 'triangle', 73.4, 36.7, time, 0.25, 0.17);
    } else if (name === 'phase2Eye') {
      scheduleBossSfxTone(out, 'pulse25', 146.8, 73.4, time, 0.24, 0.16);
      scheduleBossSfxTone(out, 'sine', 55, 82.4, time, 0.34, 0.21);
    } else if (name === 'phase2Orb') {
      scheduleBossSfxTone(out, 'pulse12', 123.5, 73.4, time, 0.11, 0.13);
      scheduleBossSfxTone(out, 'sine', 61.7, 41.2, time, 0.18, 0.13);
    } else if (name === 'phase2GridCharge') {
      scheduleBossSfxTone(out, 'pulse25', 49, 61.7, time, 0.72, 0.18, { build: true });
      scheduleBossSfxTone(out, 'triangle', 73.4, 92.5, time, 0.72, 0.16, { build: true });
    } else if (name === 'phase2GridImpact') {
      scheduleBossSfxSample(out, music.sfxSamples.checkerExplosion, time, 0.88);
      scheduleBossSfxTone(out, 'sine', 92, 19, time, 0.68, 0.48);
    } else if (name === 'phase2TileCharge') {
      scheduleBossSfxTone(out, 'pulse12', 43.65, 87.3, time, 0.44, 0.18, { build: true });
      scheduleBossSfxTone(out, 'sine', 32.7, 49, time, 0.48, 0.21, { build: true });
    } else if (name === 'phase2TileBreak') {
      scheduleBossSfxSample(out, music.sfxSamples.voidErupt, time, 0.84);
      scheduleBossSfxTone(out, 'sine', 72, 17, time, 0.72, 0.46);
    } else if (name === 'phase2SwordRing') {
      scheduleBossSfxTone(out, 'triangle', 55, 110, time, 0.82, 0.17, { build: true });
      scheduleBossSfxTone(out, 'pulse12', 41.2, 82.4, time, 0.82, 0.13, { build: true });
    } else if (name === 'phase2SwordStrike') {
      scheduleBossSfxSample(out, music.sfxSamples.swordWhoosh, time, 0.78);
      scheduleBossSfxTone(out, 'triangle', 98, 49, time, 0.30, 0.19);
    } else if (name === 'phase2Parry') {
      scheduleBossSfxTone(out, 'pulse25', 392, 293.7, time, 0.11, 0.18);
      scheduleBossSfxTone(out, 'triangle', 196, 98, time, 0.24, 0.24);
    } else if (name === 'phase2Pitfall') {
      scheduleBossSfxTone(out, 'sine', 65.4, 18.4, time, 1.05, 0.40);
      scheduleBossSfxNoise(out, time, 0.68, 0.18, 'bandpass', 520, 0.7, 80);
    } else if (name === 'phase2Plane') {
      scheduleBossSfxTone(out, 'triangle', 55, 30.9, time, 0.38, 0.17);
      scheduleBossSfxNoise(out, time, 0.28, 0.16, 'lowpass', 440, 0.7, 90);
    } else if (name === 'phase2Ram') {
      scheduleBossSfxTone(out, 'sawtooth', 31, 55, time, 0.72, 0.21, { build: true });
      scheduleBossSfxTone(out, 'sine', 27.5, 41.2, time, 0.76, 0.31, { build: true });
    } else if (name === 'phase2HexWall') {
      scheduleBossSfxTone(out, 'pulse12', 73.4, 36.7, time, 0.26, 0.15);
      scheduleBossSfxTone(out, 'sine', 36.7, 27.5, time, 0.34, 0.17);
    } else if (name === 'phase2HexOrb') {
      scheduleBossSfxTone(out, 'pulse25', 164.8, 82.4, time, 0.14, 0.12);
      scheduleBossSfxTone(out, 'sine', 55, 36.7, time, 0.22, 0.14);
    } else if (name === 'phase2Whirlpool') {
      scheduleBossSfxTone(out, 'sine', 29.1, 49, time, 1.15, 0.31, { build: true });
      scheduleBossSfxTone(out, 'triangle', 43.65, 73.4, time, 1.15, 0.18, { build: true });
      scheduleBossSfxNoise(out, time, 1.10, 0.12, 'bandpass', 95, 1.2, 330, true);
    } else {
      return false;
    }
    return true;
  }

  function playSoundDebugCue(definition, step, at) {
    const previewStep = Math.max(0, step || 0);
    return playBossSfx(definition.cue, {
      debug: true,
      step: previewStep,
      overlaps: 1,
      movement: definition.movement,
      attack: definition.attack,
      progress: definition.cue === 'vp' ? Math.min(1, (previewStep + 1) / 16) : undefined,
      beats: definition.cue === 'shadowCharge' ? 1 : undefined,
      arm: definition.cue === 'introPentagram' ? previewStep % 5 : undefined,
      at,
    });
  }

  function stopSoundDebugHold(pointerId) {
    if (!soundDebugHold) return;
    if (pointerId != null && soundDebugHold.pointerId !== pointerId) return;
    if (soundDebugHold.button) soundDebugHold.button.classList.remove('is-held');
    soundDebugHold = null;
  }

  function startSoundDebugHold(definition, button, pointerId) {
    stopSoundDebugHold();
    resumeBossMusicAudio();
    playSoundDebugCue(definition, 0);
    const music = bossMusic || createBossMusic();
    if (!music) return;
    const interval = 60 / Math.max(1, bpm) / definition.stepsPerBeat;
    soundDebugHold = {
      definition,
      button,
      pointerId,
      step: 1,
      interval,
      nextAt: music.context.currentTime + interval,
    };
    button.classList.add('is-held');
  }

  function updateSoundDebugHold() {
    if (!soundDebugHold || !bossMusic || bossMusic.context.state !== 'running') return;
    const hold = soundDebugHold;
    const now = bossMusic.context.currentTime;
    const interval = 60 / Math.max(1, bpm) / hold.definition.stepsPerBeat;
    if (Math.abs(interval - hold.interval) > 0.0001) {
      const remaining = Math.max(0, Math.min(1, (hold.nextAt - now) / hold.interval));
      hold.nextAt = now + remaining * interval;
      hold.interval = interval;
    }
    if (hold.nextAt < now - interval * 2) hold.nextAt = now;
    let scheduled = 0;
    while (hold.nextAt <= now + 0.035 && scheduled < 4) {
      playSoundDebugCue(hold.definition, hold.step, hold.nextAt);
      hold.step++;
      hold.nextAt += interval;
      scheduled++;
    }
  }

  function updateCombatPauseButton() {
    if (!combatPauseButton) return;
    combatPauseButton.textContent = combatPaused ? 'RESUME COMBAT' : 'PAUSE COMBAT';
    combatPauseButton.classList.toggle('is-paused', combatPaused);
    combatPauseButton.setAttribute('aria-pressed', combatPaused ? 'true' : 'false');
  }

  function setCombatPaused(paused, immediate) {
    combatPaused = Boolean(paused);
    if (combatPaused) {
      stopBloodSpiralAudio();
      stopPhaseTwoMassAudio();
    }
    keys.clear();
    stopSoundDebugHold();
    updateCombatPauseButton();
    if (!bossMusic) return;
    const now = bossMusic.context.currentTime;
    const gain = bossMusic.master.gain;
    const target = combatPaused || !bossMusicPlaying ? 0.0001 : BOSS_MUSIC_MASTER_GAIN;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    if (immediate) gain.setValueAtTime(target, now);
    else gain.exponentialRampToValueAtTime(target, now + 0.07);
  }

  function updateBossAudioMix() {
    if (!bossMusic) return;
    const now = bossMusic.context.currentTime;
    bossMusic.overallMaster.gain.setTargetAtTime(bossAudioMix.overall, now, 0.012);
    bossMusic.effectsUserGain.gain.setTargetAtTime(bossAudioMix.effects, now, 0.012);
    bossMusic.musicUserGain.gain.setTargetAtTime(bossAudioMix.music, now, 0.012);
  }

  function buildBossAudioMixer(panel) {
    if (!panel) return;
    panel.setAttribute('aria-label', 'Boss audio volume');
    [
      ['overall', 'ALL'],
      ['effects', 'SFX'],
      ['music', 'MUSIC'],
    ].forEach(([key, label]) => {
      const row = document.createElement('label');
      row.className = 'aether-boss2d-audio-mix-row';
      const name = document.createElement('span');
      name.className = 'aether-boss2d-audio-mix-label';
      name.textContent = label;
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';
      slider.value = String(Math.round(bossAudioMix[key] * 100));
      slider.setAttribute('aria-label', label + ' volume');
      const value = document.createElement('span');
      value.className = 'aether-boss2d-audio-mix-value';
      value.textContent = slider.value;
      slider.addEventListener('input', () => {
        bossAudioMix[key] = Number(slider.value) / 100;
        value.textContent = slider.value;
        updateBossAudioMix();
      });
      row.append(name, slider, value);
      panel.appendChild(row);
    });
  }

  function buildBossSfxDebugPanel(panel) {
    if (!panel) return;
    panel.setAttribute('aria-label', 'Sound effect debugger');
    combatPauseButton = document.createElement('button');
    combatPauseButton.type = 'button';
    combatPauseButton.className =
      'aether-boss2d-debug-btn aether-boss2d-sound-debug-btn aether-boss2d-pause-debug-btn';
    combatPauseButton.addEventListener('click', () => {
      setCombatPaused(!combatPaused);
      combatPauseButton.blur();
    });
    panel.appendChild(combatPauseButton);
    updateCombatPauseButton();
    BOSS_SFX_DEBUG_CUES.forEach((definition) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'aether-boss2d-debug-btn aether-boss2d-sound-debug-btn';
      button.textContent = definition.label;
      button.title = 'Click to play once. Hold to repeat at the current combat BPM.';
      button.addEventListener('contextmenu', (event) => event.preventDefault());
      button.addEventListener('keydown', (event) => {
        if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation();
      });
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        startSoundDebugHold(definition, button, event.pointerId);
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
      });
      button.addEventListener('pointerup', (event) => {
        event.preventDefault();
        stopSoundDebugHold(event.pointerId);
        if (button.hasPointerCapture && button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
        button.blur();
      });
      button.addEventListener('pointercancel', (event) => stopSoundDebugHold(event.pointerId));
      button.addEventListener('lostpointercapture', (event) => stopSoundDebugHold(event.pointerId));
      // Keyboard activation has no pointerdown, so retain accessible one-shot
      // auditioning without double-firing ordinary mouse/touch clicks.
      button.addEventListener('click', (event) => {
        if (event.detail === 0) playSoundDebugCue(definition, 0);
        button.blur();
      });
      panel.appendChild(button);
    });
  }

  function setBossMusicParam(param, value, time, transitionSeconds) {
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(time);
    } else {
      const currentValue = param.value;
      param.cancelScheduledValues(time);
      param.setValueAtTime(currentValue, time);
    }
    if (transitionSeconds > 0) {
      param.linearRampToValueAtTime(value, time + transitionSeconds);
    } else {
      param.setValueAtTime(value, time);
    }
  }

  function setBossMusicLayerCount(count, transitionSeconds) {
    bossMusicLayerCount = Math.max(0, Math.min(BOSS_MOTIF.layers.length, Math.floor(count)));
    if (!bossMusic) return bossMusicLayerCount;

    const activeLayers = new Set(
      BOSS_MOTIF.layerOrder
        .slice(0, bossMusicLayerCount)
        .map((layerNumber) => layerNumber - 1)
    );
    const now = bossMusic.context.currentTime;
    bossMusic.trackGains.forEach((gain, layerIndex) => {
      const layer = BOSS_MOTIF.layers[layerIndex];
      const target = activeLayers.has(layerIndex) && !layer.muted ? layer.volume : 0;
      setBossMusicParam(gain.gain, target, now, Math.max(0, transitionSeconds || 0));
    });
    return bossMusicLayerCount;
  }

  function updateBossMusicTempo(force) {
    if (!bossMusic) return;
    const liveBpm = Math.max(1, bpm);
    if (!force && liveBpm === bossMusicLastBpm) return;
    const now = bossMusic.context.currentTime;
    if (liveBpm !== bossMusicClockBpm) {
      bossMusicClockBeats = bossMusicBeatAt(now);
      bossMusicClockTime = now;
      bossMusicClockBpm = liveBpm;
    }
    bossMusicLastBpm = liveBpm;
    bossMusic.delay.delayTime.setTargetAtTime(
      (60 / liveBpm) * BOSS_MOTIF.synth.echoBeats,
      now,
      0.01
    );
  }

  function bossMusicBeatAt(time) {
    return bossMusicClockBeats +
      (time - bossMusicClockTime) * bossMusicClockBpm / 60;
  }

  function alignFightBeatToBossMusic() {
    if (!bossMusicPlaying || !bossMusic || bossMusic.context.state !== 'running') {
      fightMusicBeatCursor = null;
      return false;
    }
    const musicBeat = bossMusicBeatAt(bossMusic.context.currentTime);
    const wholeBeat = Math.floor(musicBeat);
    fightMusicBeatCursor = wholeBeat;
    beatPhase = (musicBeat - wholeBeat) * beatMs;
    return true;
  }

  function resumeBossMusicAudio() {
    const music = createBossMusic();
    if (!music || music.context.state !== 'suspended') return;
    music.context.resume().then(() => {
      if (!bossMusicPlaying) return;
      bossMusicNextNoteTime = Math.max(
        bossMusicNextNoteTime,
        music.context.currentTime + 0.025
      );
      bossMusicScheduler();
      if (phase === PHASE.ACTIVE && fightMusicBeatCursor === null) {
        alignFightBeatToBossMusic();
      }
    }).catch(() => {
      // Autoplay policy may require the next keyboard/click gesture.
    });
  }

  function startBossMusic(fadeSeconds) {
    phaseOnePatternsCompleted = 0;
    const music = createBossMusic();
    if (!music) {
      bossMusicLayerCount = 1;
      return;
    }
    bossMusicPlaying = true;
    setBossMusicLayerCount(1, 0);
    bossMusicStep = 0;
    bossMusicCycle = 0;
    bossMusicLastBpm = -1;
    bossMusicNextNoteTime = music.context.currentTime + 0.045;
    bossMusicClockTime = bossMusicNextNoteTime;
    bossMusicClockBeats = 0;
    bossMusicClockBpm = Math.max(1, bpm);
    fightMusicBeatCursor = null;
    const now = music.context.currentTime;
    const fade = Math.max(0, fadeSeconds || 0);
    music.master.gain.cancelScheduledValues(now);
    music.master.gain.setValueAtTime(fade > 0 ? 0.0001 : BOSS_MUSIC_MASTER_GAIN, now);
    if (fade > 0) {
      music.master.gain.linearRampToValueAtTime(BOSS_MUSIC_MASTER_GAIN, now + fade);
    }
    updateBossMusicTempo(true);
    if (bossMusicTimer) window.clearInterval(bossMusicTimer);
    bossMusicScheduler();
    bossMusicTimer = window.setInterval(bossMusicScheduler, 25);
    resumeBossMusicAudio();
  }

  function stopBossMusic(fadeSeconds) {
    bossMusicPlaying = false;
    fightMusicBeatCursor = null;
    if (bossMusicTimer) window.clearInterval(bossMusicTimer);
    bossMusicTimer = 0;
    if (!bossMusic) return;
    const now = bossMusic.context.currentTime;
    const fade = Math.max(0, fadeSeconds || 0);
    const gain = bossMusic.master.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    if (fade > 0) gain.exponentialRampToValueAtTime(0.0001, now + fade);
    else gain.setValueAtTime(0.0001, now);
  }

  function bossMusicScheduler() {
    if (!bossMusicPlaying || !bossMusic || bossMusic.context.state !== 'running') return;
    const now = bossMusic.context.currentTime;
    if (bossMusicNextNoteTime < now - 0.1) bossMusicNextNoteTime = now + 0.02;
    updateBossMusicTempo(false);
    const lookAhead = now + BOSS_MUSIC_LOOKAHEAD;
    while (bossMusicNextNoteTime < lookAhead) {
      const liveBpm = Math.max(1, bpm);
      scheduleBossMusicStep(bossMusicStep, bossMusicNextNoteTime, liveBpm);
      bossMusicNextNoteTime += (60 / liveBpm) * BOSS_MOTIF.stepBeats;
      bossMusicStep++;
      if (bossMusicStep >= BOSS_MOTIF.length) {
        bossMusicStep = 0;
        bossMusicCycle++;
      }
    }
  }

  function bossMusicCycleTranspose(mode, cycle) {
    const patterns = {
      off: [0],
      uneasy: [0, 1, 0, -1],
      rise: [0, 1, 2, 3],
      menace: [0, 1, 3, 1],
      sink: [0, -1, -2, -1],
      octave: [0, 0, 12, 0],
    };
    const pattern = patterns[mode] || patterns.off;
    return pattern[cycle % pattern.length];
  }

  function bossMusicNoteToMidi(note) {
    const match = /^([A-G])(#?)(\d)$/.exec(note || '');
    if (!match) return null;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const pitch = noteNames.indexOf(match[1] + match[2]);
    return (Number(match[3]) + 1) * 12 + pitch;
  }

  function scheduleBossMusicStep(index, time, liveBpm) {
    BOSS_MOTIF.layers.forEach((layer, layerIndex) => {
      const note = layer.notes[index];
      if (!note || layer.muted) return;
      const accent = Boolean(layer.accents[index]);
      const variance = layer.variance;
      if (!accent && variance.nonAccentDropout > 0 &&
          Math.random() < variance.nonAccentDropout) return;

      let mutation = 0;
      if (layer.instrument !== 'drums' && variance.noteMutationChance > 0 &&
          Math.random() < variance.noteMutationChance) {
        const range = Math.max(1, variance.mutationSemitones);
        const distance = 1 + Math.floor(Math.random() * range);
        mutation = (Math.random() < 0.5 ? -1 : 1) * distance;
      }
      const cycleOffset = layer.instrument === 'drums'
        ? 0
        : bossMusicCycleTranspose(variance.cycleTranspose, bossMusicCycle);
      scheduleBossMusicEvent(
        layer.instrument,
        note,
        accent,
        layer.holds[index] || 1,
        time,
        liveBpm,
        bossMusic.trackGains[layerIndex],
        cycleOffset + mutation
      );
    });
  }

  function scheduleBossMusicEvent(instrument, note, accent, hold, time, liveBpm, destination, pitchOffset) {
    if (instrument === 'drums') {
      scheduleBossMusicDrum(destination, note, time, accent);
      return;
    }
    const noteMidi = bossMusicNoteToMidi(note);
    if (noteMidi === null) return;
    const stepDuration = (60 / liveBpm) * BOSS_MOTIF.stepBeats;
    const duration = Math.max(0.035, stepDuration * BOSS_MOTIF.synth.gate * hold);
    const midi = noteMidi + BOSS_MOTIF.synth.transpose + (pitchOffset || 0);
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const velocity = accent ? 0.32 : 0.22;

    if (instrument === 'guitar') {
      scheduleBossMusicGuitar(destination, frequency, time, duration, velocity);
    } else if (instrument === 'bass') {
      scheduleBossMusicBass(destination, frequency, time, duration, velocity);
    } else if (instrument === 'piano') {
      scheduleBossMusicPiano(destination, frequency, time, duration, velocity);
    } else {
      scheduleBossMusicLead(destination, frequency, time, duration, velocity);
      if (BOSS_MOTIF.synth.bass > 0) {
        scheduleBossMusicOscillator(
          destination,
          'triangle',
          frequency / 2,
          time,
          duration * 0.94,
          BOSS_MOTIF.synth.bass * (accent ? 0.3 : 0.23)
        );
      }
      if (accent && BOSS_MOTIF.synth.noise > 0) {
        scheduleBossMusicNoise(
          destination,
          time,
          Math.min(0.075, duration),
          BOSS_MOTIF.synth.noise * 0.8,
          'highpass',
          900,
          1
        );
      }
    }
  }

  function scheduleBossMusicOscillator(destination, voice, frequency, time, duration, amount, options) {
    const context = bossMusic.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const config = options || {};
    if (bossMusic.waves[voice]) oscillator.setPeriodicWave(bossMusic.waves[voice]);
    else oscillator.type = voice;
    oscillator.frequency.setValueAtTime(frequency * 1.012, time);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency,
      time + Math.min(0.025, duration * 0.2)
    );
    if (config.wobble) {
      const curve = new Float32Array(32);
      for (let i = 0; i < curve.length; i++) {
        curve[i] = (config.detune || 0) +
          Math.sin(i / (curve.length - 1) * Math.PI * 8) * config.wobble;
      }
      oscillator.detune.setValueCurveAtTime(curve, time, duration);
    } else {
      oscillator.detune.setValueAtTime(config.detune || 0, time);
    }
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(amount, time + 0.004);
    envelope.gain.setValueAtTime(amount, Math.max(time + 0.005, time + duration * 0.64));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  function scheduleBossMusicLead(destination, frequency, time, duration, velocity) {
    scheduleBossMusicOscillator(
      destination,
      BOSS_MOTIF.synth.voice === 'warblePulse' ? 'pulse18' : BOSS_MOTIF.synth.voice,
      frequency,
      time,
      duration,
      velocity,
      BOSS_MOTIF.synth.voice === 'warblePulse' ? { wobble: 24 } : null
    );
  }

  function scheduleBossMusicGuitar(destination, frequency, time, duration, velocity) {
    scheduleBossMusicOscillator(destination, 'sawtooth', frequency, time, duration, velocity * 0.55, { detune: -5 });
    scheduleBossMusicOscillator(destination, 'square', frequency, time, duration * 0.96, velocity * 0.34, { detune: 5 });
    scheduleBossMusicOscillator(destination, 'pulse18', frequency * 1.4983, time, duration * 0.88, velocity * 0.25);
    scheduleBossMusicOscillator(destination, 'pulse12', frequency * 2, time, duration * 0.72, velocity * 0.17);
  }

  function scheduleBossMusicBass(destination, frequency, time, duration, velocity) {
    scheduleBossMusicOscillator(destination, 'sine', frequency / 2, time, duration, velocity * 0.72);
    scheduleBossMusicOscillator(destination, 'triangle', frequency, time, duration, velocity * 1.3);
    scheduleBossMusicOscillator(destination, 'square', frequency, time, duration * 0.88, velocity * 0.46);
    scheduleBossMusicOscillator(destination, 'pulse12', frequency * 2, time, duration * 0.76, velocity * 0.34);
  }

  function scheduleBossMusicPianoPartial(destination, type, frequency, time, duration, amount) {
    const context = bossMusic.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(amount, time + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  function scheduleBossMusicPiano(destination, frequency, time, duration, velocity) {
    const ring = Math.max(0.22, Math.min(1.4, duration * 1.8));
    scheduleBossMusicPianoPartial(destination, 'square', frequency * 2, time, ring * 0.55, velocity * 0.72);
    scheduleBossMusicPianoPartial(destination, 'sine', frequency * 4.02, time, ring * 0.42, velocity * 0.34);
  }

  function scheduleBossMusicDrum(destination, drum, time, accent) {
    const context = bossMusic.context;
    const strength = accent ? 1.25 : 1;
    if (drum === 'KICK') {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(165, time);
      oscillator.frequency.exponentialRampToValueAtTime(43, time + 0.13);
      gain.gain.setValueAtTime(0.58 * strength, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
      oscillator.connect(gain).connect(destination);
      oscillator.start(time);
      oscillator.stop(time + 0.22);
    } else if (drum === 'SNARE') {
      scheduleBossMusicNoise(destination, time, 0.15, 0.42 * strength, 'bandpass', 1800, 0.7);
      scheduleBossMusicOscillator(destination, 'triangle', 175, time, 0.09, 0.13 * strength);
    } else if (drum === 'OPEN_HAT') {
      scheduleBossMusicNoise(destination, time, 0.25, 0.18 * strength, 'highpass', 4300, 0.7);
    }
  }

  function scheduleBossMusicNoise(destination, time, duration, amount, type, frequency, q) {
    if (amount <= 0) return;
    const context = bossMusic.context;
    const frames = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    let held = 0;
    for (let i = 0; i < frames; i++) {
      if (i % 3 === 0) held = Math.random() * 2 - 1;
      data[i] = held;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.setValueAtTime(amount, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(destination);
    source.start(time);
  }

  function startFight() {
    fightClock = 0;
    bpm = BASE_BPM;
    bpmBonus = 0;
    beatMs = 60000 / bpm;
    beatPhase = 0;
    beatIndex = 0;
    lastAnimBpm = -1;
    fightMusicBeatCursor = null;
    phaseOneDamageSfxStep = -1;
    phaseOneDamageSfxCount = 0;
    resetHeroCombatFeedback();
    attacks = [];
    fadingAttacks = [];
    phase2Ritual = null;
    phase2AvatarStarted = false;
    phase2CombatStarted = false;
    phase2Attacks = [];
    phase2BurstActive = false;
    phase2BurstSize = 1;
    phase2BurstsAtSize = 0;
    phase2DashZone = 'top';
    phase2Cracks = [];
    phase2GridSpecial = null;
    phase2GridDebugQueued = false;
    phase2PlayerHits = 0;
    phase2PostGridCycles = 0;
    phase2ClawPatternStopped = false;
    phase2ClawRushMode = false;
    resetPhaseTwoRushEntities();
    phase2RushDebugQueued = false;
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2SwordRingDebugQueued = false;
    phase2PitfallPattern = null;
    phase2PitfallDebugQueued = false;
    phase2HexDebugQueued = false;
    phase2TowerPattern = null;
    phase2TowerDebugQueued = false;
    phase2DoomPattern = null;
    phase2DoomDebugQueued = false;
    phase2MayhemPattern = null;
    phase2MayhemDebugQueued = false;
    phase2SpearRainDebugQueued = false;
    phase2ChevronDebugQueued = false;
    phase2TrianglesDebugQueued = false;
    phase2WaveformDebugQueued = false;
    phase2DebugClawQueued = false;
    nextPhase2AttackBeat = Infinity;
    entropy = 0;
    if (phase2Avatar) phase2Avatar.reset();
    resetPhaseTwoLayout();
    // The opening cycle always leads with the pentagram barrage; the rest is
    // shuffled. Later cycles (and all combos) reshuffle fully.
    singleQueue = ['pentagrams'].concat(shuffled(MOVEMENT_SEQUENCE.filter((n) => n !== 'pentagrams')));
    activeSet = [];
    lastSingle = null;
    nextSlotId = 1;
    nextAttackBeat = 2; // a couple of beats to read the room before the first strike
    applyTempoToAnimations();
    if (bpmElement) bpmElement.textContent = 'BPM ' + bpm;
    alignFightBeatToBossMusic();
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
    const targetBpm = Math.min(WRATH_MAX, BASE_BPM + Math.floor(fightClock / BPM_RAMP_MS) + bpmBonus);
    if (setCombatBpm(targetBpm)) updateBossMusicTempo(true);
    if (bossMusicPlaying && bossMusic && bossMusic.context.state === 'running') {
      if (fightMusicBeatCursor === null) alignFightBeatToBossMusic();
      const musicBeat = bossMusicBeatAt(bossMusic.context.currentTime);
      const wholeBeat = Math.floor(musicBeat);
      // A backgrounded tab can leave the audio clock far ahead of rendering.
      // Skip stale beats instead of releasing a backlog of attack waves.
      if (wholeBeat - fightMusicBeatCursor > 4) fightMusicBeatCursor = wholeBeat - 1;
      while (fightMusicBeatCursor < wholeBeat) {
        fightMusicBeatCursor++;
        beatIndex++;
        onBeat(beatIndex);
      }
      beatPhase = (musicBeat - wholeBeat) * beatMs;
    } else {
      beatPhase += dt;
      while (beatPhase >= beatMs) {
        beatPhase -= beatMs;
        beatIndex++;
        onBeat(beatIndex);
      }
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
    if (activeSet.length === 0 && beat < nextAttackBeat) return;
    // Arm/rearm only if a wave actually spawned (the stage might not be
    // measurable yet); otherwise retry on the next beat.
    if (spawnWave(beat)) updateNextAttackBeat();
  }

  function registerCompletedPhaseOnePattern() {
    if (phase !== PHASE.ACTIVE) return;
    phaseOnePatternsCompleted++;
    const layerCount = Math.min(
      BOSS_MOTIF.layers.length,
      1 + Math.floor(phaseOnePatternsCompleted / BOSS_MUSIC_PATTERNS_PER_LAYER)
    );
    if (layerCount > bossMusicLayerCount) setBossMusicLayerCount(layerCount, 0.65);
  }

  // Dev shortcut: skip the scripted intro and drop straight into the fight
  // with every element (inner + outer tentacles, full pentagram) in place.
  function skipToActive(silentAudio) {
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
    setPhase(PHASE.ACTIVE, silentAudio);
  }

  // Debug primer: enter normal combat one strike away from the phase-two
  // transition, without skipping the actual strike -> wrath-fill flow.
  function primePhaseTwoCombat() {
    if (!active || phase !== PHASE.ACTIVE) return;
    fightClock = 0;
    const strikeDamage = damageEnemy(ATTACK_WRATH_GAIN);
    bpmBonus = WRATH_MAX - BASE_BPM - strikeDamage;
    bpm = WRATH_MAX - strikeDamage;
    beatMs = 60000 / bpm;
    beatPhase = 0;
    lastAnimBpm = -1;
    vp = VP_MAX;
    applyTempoToAnimations();
    updateBars();
    if (bpmElement) bpmElement.textContent = 'BPM ' + bpm;
  }

  // Debug: abort whatever is running and start the given movement name(s) at
  // once. Pass one name for a single pattern, two to play them combined.
  function startMovementSet(names) {
    if (!active) return;
    if (phase !== PHASE.ACTIVE) skipToActive(); // ensures the fight has begun
    attacks = [];
    if (actx) actx.clearRect(0, 0, attackCanvas.width, attackCanvas.height);
    activeSet = names.map((name) => makeMovementSlot(name, beatIndex));
    if (spawnWave(beatIndex)) updateNextAttackBeat();
  }

  function phaseTwoBpm() {
    return PHASE2_BPM_MIN + (PHASE2_BPM_MAX - PHASE2_BPM_MIN) * (entropy / ENTROPY_MAX);
  }

  function debugAdjustBpm(delta) {
    if (!active) return;
    let targetBpm;
    if (phase === PHASE.SECOND) {
      const target = Math.max(PHASE2_BPM_MIN, Math.min(PHASE2_BPM_MAX, phaseTwoBpm() + delta));
      entropy = (target - PHASE2_BPM_MIN) / (PHASE2_BPM_MAX - PHASE2_BPM_MIN) * ENTROPY_MAX;
      targetBpm = phaseTwoBpm();
    } else {
      const naturalBpm = BASE_BPM + Math.floor(fightClock / BPM_RAMP_MS);
      const target = Math.max(BASE_BPM, Math.min(WRATH_MAX, bpm + delta));
      bpmBonus = Math.max(0, target - naturalBpm);
      targetBpm = Math.min(WRATH_MAX, naturalBpm + bpmBonus);
    }
    if (setCombatBpm(targetBpm)) updateBossMusicTempo(true);
    lastAnimBpm = -1;
    applyTempoToAnimations();
    updateBars();
    if (bpmElement) bpmElement.textContent = 'BPM ' + Math.round(bpm);
  }

  function makePhaseTwoGridLayout() {
    const left = BORDER + PAD;
    const top = BORDER + PAD;
    const right = canvas.width - BORDER - PAD;
    const bottom = canvas.height - BORDER - PAD;
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const cols = Math.max(4, Math.round(width / 135));
    const rows = Math.max(4, Math.round(height / 125));
    const cellW = width / cols;
    const cellH = height / rows;
    const tiles = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        tiles.push({
          col,
          row,
          x: left + (col + 0.5) * cellW,
          y: top + (row + 0.5) * cellH,
        });
      }
    }
    return { left, top, right, bottom, width, height, cols, rows, cellW, cellH, tiles };
  }

  function nearestPhaseTwoGridTile(layout, x, y) {
    let nearest = layout.tiles[0];
    let nearestDistance = Infinity;
    for (const tile of layout.tiles) {
      const distance = (tile.x - x) * (tile.x - x) + (tile.y - y) * (tile.y - y);
      if (distance < nearestDistance) {
        nearest = tile;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function phaseTwoGridTileBroken(tile, layout) {
    const tileIndex = tile.row * layout.cols + tile.col;
    if (phase2GridSpecial && phase2GridSpecial.removedTiles &&
        phase2GridSpecial.removedTiles.has(tileIndex)) return true;
    if (!canvas || phase2Cracks.length === 0) return false;
    const board = getBoardRect();
    const gap = phase2GridSpecial && phase2GridSpecial.cutGap
      ? phase2GridSpecial.cutGap
      : Math.min(48, Math.max(30, Math.min(layout.cellW, layout.cellH) * 0.34));
    const halfW = Math.max(4, (layout.cellW - gap) * 0.5);
    const halfH = Math.max(4, (layout.cellH - gap) * 0.5);
    const x0 = board.left + (tile.x - halfW) * board.width / canvas.width;
    const x1 = board.left + (tile.x + halfW) * board.width / canvas.width;
    const y0 = board.top + (tile.y - halfH) * board.height / canvas.height;
    const y1 = board.top + (tile.y + halfH) * board.height / canvas.height;
    const samples = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        samples.push({ x: x0 + (x1 - x0) * col / 2, y: y0 + (y1 - y0) * row / 2 });
      }
    }
    return phase2Cracks.some((crack) => {
      const polygon = crack.closing
        ? phaseTwoCrackPolygon(crack)
        : crack.hitPolygon || (crack.hitPolygon = phaseTwoCrackPolygon(crack));
      if (samples.some((sample) => pointInPoly(sample.x, sample.y, polygon))) return true;
      return polygon.some((point) => point.x >= x0 && point.x <= x1 && point.y >= y0 && point.y <= y1);
    });
  }

  function dashPhaseTwoAvatarToBase() {
    if (!canvas || !phase2Avatar || typeof phase2Avatar.dashTo !== 'function') return false;
    const board = getBoardRect();
    const avatar = phase2Avatar.state && phase2Avatar.state.avatar;
    if (!board || !board.width || !avatar) return false;
    phase2DashZone = 'top';
    return phase2Avatar.dashTo(
      board.left + board.width / 2,
      board.top + avatar.size * 0.34,
      PHASE2_GRID_RECALL_MS
    );
  }

  function startPhaseTwoGridSpecial() {
    if (!phase2CombatStarted || !canvas || !phase2Avatar || phase2GridSpecial ||
        phase2SquareArenaLocked || phase2PitfallPattern) return false;
    const board = getBoardRect();
    const avatar = phase2Avatar.state && phase2Avatar.state.avatar;
    if (!board.width || !avatar) return false;
    phase2Attacks = [];
    phase2BurstActive = false;
    nextPhase2AttackBeat = Infinity;
    phase2Cracks = [];
    phase2CrackCacheDirty = true;
    phase2GridDebugQueued = false;
    phase2DebugClawQueued = false;
    phase2PostGridCycles = 0;
    phase2BurstsAtSize = 0;
    phase2ClawPatternStopped = phase2TileRuinDebugQueued;
    phase2TileRuinPattern = null;
    phase2SwordRingPattern = null;
    phase2SwordRingDebugQueued = false;
    phase2PitfallPattern = null;
    phase2PitfallDebugQueued = false;
    phase2HexDebugQueued = false;
    keys.clear();
    dashPhaseTwoAvatarToBase();
    phase2GridSpecial = {
      elapsed: 0,
      channelAgeBeats: 0,
      impactAge: -1,
      layout: makePhaseTwoGridLayout(),
      struck: false,
      settled: false,
      tileMode: false,
      hop: null,
      tileCol: 0,
      tileRow: 0,
      removedTiles: new Set(),
      seed: Math.random() * 1000,
    };
    playBossSfx('phase2GridCharge');
    return true;
  }

  function beginPhaseTwoGridHop(tile, duration) {
    if (!phase2GridSpecial) return;
    phase2GridSpecial.hop = {
      fromX: hero.x,
      fromY: hero.y,
      toX: tile.x,
      toY: tile.y,
      elapsed: 0,
      duration,
    };
    phase2GridSpecial.tileCol = tile.col;
    phase2GridSpecial.tileRow = tile.row;
  }

  function queuePhaseTwoGridHop(dx, dy) {
    const special = phase2GridSpecial;
    if (!special || !special.tileMode || special.hop) return false;
    let col = special.tileCol + dx;
    let row = special.tileRow + dy;
    while (col >= 0 && col < special.layout.cols && row >= 0 && row < special.layout.rows) {
      const tile = special.layout.tiles[row * special.layout.cols + col];
      if (!phaseTwoGridTileBroken(tile, special.layout)) {
        beginPhaseTwoGridHop(tile, PHASE2_GRID_HOP_MS);
        return true;
      }
      col += dx;
      row += dy;
    }
    return true;
  }

  function updatePhaseTwoGridHop(dt) {
    const special = phase2GridSpecial;
    if (!special || !special.hop) return;
    const hop = special.hop;
    hop.elapsed += dt;
    const p = Math.max(0, Math.min(1, hop.elapsed / hop.duration));
    const travel = smoothstep(p);
    hero.x = hop.fromX + (hop.toX - hop.fromX) * travel;
    hero.y = hop.fromY + (hop.toY - hop.fromY) * travel - Math.sin(p * Math.PI) * 10;
    heroSquash = Math.sin(p * Math.PI) * 0.12;
    if (p >= 1) {
      hero.x = hop.toX;
      hero.y = hop.toY;
      heroSquash = 0;
      special.hop = null;
    }
  }

  function updatePhaseTwoGridSpecial(dt) {
    const special = phase2GridSpecial;
    if (!special) return;
    special.elapsed += dt;
    if (!special.struck && special.elapsed >= PHASE2_GRID_RECALL_MS) {
      special.channelAgeBeats += dt / beatMs;
    }
    if (!special.struck && special.channelAgeBeats >= PHASE2_GRID_CHANNEL_BEATS) {
      special.struck = true;
      special.impactAge = 0;
      playBossSfx('phase2GridImpact');
      special.tileMode = true;
      keys.clear();
      const tile = nearestPhaseTwoGridTile(special.layout, hero.x, hero.y);
      beginPhaseTwoGridHop(tile, PHASE2_GRID_IMPACT_MS);
    }
    if (special.struck) special.impactAge += dt;
    if (!special.settled && special.struck && special.impactAge >= PHASE2_GRID_IMPACT_MS) {
      special.settled = true;
      nextPhase2AttackBeat = beatIndex + 1;
    }
  }

  function debugPhaseTwoGridSpecial() {
    if (!active) return;
    if (phase2GridSpecial) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    if (!phase2AvatarStarted && phase2Ritual) {
      phase2Ritual.beams = [];
      phase2Ritual.pentFade = 0;
      phase2Ritual.cocoon.hits = P2_COCOON_HITS;
      phase2Ritual.cocoon.p = 1;
      phase2Ritual.cocoon.alpha = 1;
      startAvatarPhaseTwo();
    }
    phase2GridDebugQueued = true;
    if (phase2CombatStarted) startPhaseTwoGridSpecial();
  }

  function debugTogglePhaseTwoTileRuin() {
    if (!active) return;
    if (phase2TileRuinPattern || phase2TileRuinDebugQueued) {
      phase2TileRuinPattern = null;
      phase2TileRuinDebugQueued = false;
      phase2SwordRingPattern = null;
      phase2SwordRingDebugQueued = false;
      return;
    }
    if (!phase2GridSpecial) debugPhaseTwoGridSpecial();
    phase2TileRuinDebugQueued = true;
    phase2ClawPatternStopped = true;
    phase2Attacks = [];
    phase2BurstActive = false;
    nextPhase2AttackBeat = Infinity;
    if (phase2GridSpecial && phase2GridSpecial.settled) dashPhaseTwoAvatarToBase();
  }

  function intactPhaseTwoGridTiles() {
    if (!phase2GridSpecial || !phase2GridSpecial.removedTiles) return [];
    const intact = [];
    for (let i = 0; i < phase2GridSpecial.layout.tiles.length; i++) {
      if (!phase2GridSpecial.removedTiles.has(i)) intact.push(i);
    }
    return intact;
  }

  function choosePhaseTwoTileRuinTargets(count) {
    const intact = intactPhaseTwoGridTiles();
    const targetCount = Math.min(count, Math.max(0, intact.length - 1));
    if (!targetCount || !phase2GridSpecial) return [];
    const layout = phase2GridSpecial.layout;
    const current = phase2GridSpecial.tileRow * layout.cols + phase2GridSpecial.tileCol;
    const anchor = intact.includes(current)
      ? current
      : intact.reduce((nearest, index) => {
        const tile = layout.tiles[index];
        const previous = layout.tiles[nearest];
        const distance = (tile.x - hero.x) * (tile.x - hero.x) + (tile.y - hero.y) * (tile.y - hero.y);
        const previousDistance = (previous.x - hero.x) * (previous.x - hero.x) + (previous.y - hero.y) * (previous.y - hero.y);
        return distance < previousDistance ? index : nearest;
      }, intact[0]);
    const anchorTile = layout.tiles[anchor];
    const nearby = [];
    const distant = [];
    for (const index of intact) {
      if (index === anchor) continue;
      const tile = layout.tiles[index];
      const distance = Math.max(Math.abs(tile.col - anchorTile.col), Math.abs(tile.row - anchorTile.row));
      (distance <= 2 ? nearby : distant).push(index);
    }
    const shuffle = (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = items[i];
        items[i] = items[j];
        items[j] = swap;
      }
      return items;
    };
    shuffle(nearby);
    shuffle(distant);
    const targets = [anchor];
    for (const index of nearby.concat(distant)) {
      if (targets.length >= targetCount) break;
      targets.push(index);
    }
    return targets;
  }

  function startPhaseTwoTileRuinPattern() {
    if (!phase2GridSpecial || !phase2GridSpecial.settled || phase2TileRuinPattern) return false;
    const targets = choosePhaseTwoTileRuinTargets(1);
    phase2TileRuinPattern = {
      state: targets.length ? 'telegraph' : 'done',
      waveSize: 1,
      wavesAtSize: 0,
      elapsed: 0,
      elapsedBeats: 0,
      targets,
      impacted: false,
      seed: Math.random() * 1000,
    };
    phase2TileRuinDebugQueued = false;
    if (targets.length) playBossSfx('phase2TileCharge');
    return true;
  }

  function invalidatePhaseTwoGridFloor(special) {
    special.floorBuffer = null;
    special.unionMask = null;
    special.unionEdge = null;
    special.unionKey = '';
  }

  function removePhaseTwoGridTiles(targets) {
    const special = phase2GridSpecial;
    if (!special || !special.removedTiles) return;
    const currentIndex = special.tileRow * special.layout.cols + special.tileCol;
    const ejectPlayer = targets.includes(currentIndex);
    for (const index of targets) special.removedTiles.add(index);
    invalidatePhaseTwoGridFloor(special);
    if (ejectPlayer) {
      let candidates = intactPhaseTwoGridTiles();
      const safeCandidates = candidates.filter((index) => {
        const tile = special.layout.tiles[index];
        return tile && !phaseTwoGridTileBroken(tile, special.layout);
      });
      if (safeCandidates.length) candidates = safeCandidates;
      let nearest = null;
      let nearestDistance = Infinity;
      for (const index of candidates) {
        const tile = special.layout.tiles[index];
        const distance = (tile.x - hero.x) * (tile.x - hero.x) + (tile.y - hero.y) * (tile.y - hero.y);
        if (distance < nearestDistance) {
          nearest = tile;
          nearestDistance = distance;
        }
      }
      const damageScale = bpm / PHASE2_BPM_MIN;
      damagePlayer(PHASE2_VOID_EJECT_DAMAGE * damageScale);
      playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
      if (nearest) beginPhaseTwoGridHop(nearest, PHASE2_GRID_HOP_MS * 1.65);
      if (hp <= 0) die();
    }
  }

  function startPhaseTwoFinalTileMove(index) {
    const special = phase2GridSpecial;
    const pattern = phase2TileRuinPattern;
    const tile = special && special.layout.tiles[index];
    if (!special || !pattern || !tile) {
      if (pattern) pattern.state = 'done';
      return;
    }
    special.detachedTile = index;
    special.tileMode = false;
    special.hop = null;
    special.tileCol = tile.col;
    special.tileRow = tile.row;
    special.finalTile = {
      index,
      fromX: tile.x,
      fromY: tile.y,
      x: tile.x,
      y: tile.y,
      toX: canvas.width / 2,
      toY: canvas.height / 2,
      progress: 0,
    };
    invalidatePhaseTwoGridFloor(special);
    pattern.state = 'finalMove';
    pattern.elapsed = 0;
    pattern.elapsedBeats = 0;
    keys.clear();
  }

  function startPhaseTwoSwordRingPattern() {
    if (phase2SwordRingPattern) return false;
    phase2SwordRingDebugQueued = false;
    phase2SwordRingPattern = {
      state: 'forming',
      elapsed: 0,
      centerX: hero.x,
      centerY: hero.y,
      slots: PHASE2_SWORD_DIRECTIONS.map(() => ({ status: 'ready', respawnAge: 0 })),
      activeIndex: 0,
      lastAttackIndex: 0,
      attackBag: shuffled([1, 2, 3, 4, 5, 6, 7]),
      successfulParries: 0,
      activeSpeedScale: 1,
      burstRemaining: 0,
      nextDelayMs: PHASE2_SWORD_NEXT_MS,
      finalClockwisePending: false,
      finalClockwise: false,
      clockwiseIndex: 0,
      bossSlamResolved: false,
      bossSlamParried: false,
      bossSlamImpactAge: -1,
      bossSlamFlashAge: -1,
      bossSlamRangeEntered: false,
      bossSlamReturning: false,
      bossContactX: 0,
      bossContactY: 0,
      bossPrevContactX: 0,
      bossPrevContactY: 0,
      defended: false,
      guardSwapAge: 1000,
      guardDirX: 0,
      guardDirY: -1,
      parryRangeEntered: false,
      parryFlashAge: -1,
      impactType: null,
      impactX: 0,
      impactY: 0,
      impactSwordX: 0,
      impactSwordY: 0,
      impactSwordAngle: Math.PI / 2,
      impactSwordScale: 0.58,
      impactOutX: 0,
      impactOutY: -1,
      seed: Math.random() * 1000,
    };
    playBossSfx('phase2SwordRing');
    keys.clear();
    return true;
  }

  function phaseTwoSwordBpmScale() {
    // The sword pattern deliberately runs on half-tempo: 150 BPM behaves like 75 BPM.
    const effectiveBpm = Math.max(1, bpm * 0.5);
    return (PHASE2_BPM_MIN * 0.5) / effectiveBpm;
  }

  function phaseTwoSwordDuration(baseMs, pattern, accelerate) {
    const counterScale = accelerate && pattern ? pattern.activeSpeedScale : 1;
    return baseMs * phaseTwoSwordBpmScale() * counterScale;
  }

  function spawnPhaseTwoSwordGuard(directionX, directionY) {
    const pattern = phase2SwordRingPattern;
    if (!pattern) return false;
    const length = Math.hypot(directionX, directionY);
    if (length < 0.1) return true;
    pattern.guardDirX = directionX / length;
    pattern.guardDirY = directionY / length;
    pattern.guardSwapAge = 0;
    return true;
  }

  function phaseTwoSwordRingGeometry(pattern, swordIndex) {
    const board = getBoardRect();
    if (!pattern || !board || !board.width || !board.height) return null;
    const index = swordIndex === undefined ? pattern.activeIndex : swordIndex;
    const direction = PHASE2_SWORD_DIRECTIONS[index];
    if (!direction) return null;
    const center = worldPointToViewport(pattern.centerX, pattern.centerY, board);
    const ringRadius = Math.max(205, Math.min(286, Math.min(board.width, board.height) * 0.40));
    const swordScale = Math.max(0.48, Math.min(0.66, ringRadius / 390));
    let distance = ringRadius;
    if (index === pattern.activeIndex && pattern.state === 'strike') {
      const strikeP = easeInQuad(Math.min(1, pattern.elapsed / PHASE2_SWORD_STRIKE_MS));
      distance *= 1 - strikeP;
    }
    const swordX = center.x + direction.x * distance;
    const swordY = center.y + direction.y * distance;
    const swordAngle = Math.atan2(center.y - swordY, center.x - swordX);
    const guardDirectionX = pattern.guardDirX;
    const guardDirectionY = pattern.guardDirY;
    return {
      board,
      center,
      direction,
      ringRadius,
      swordScale,
      swordX,
      swordY,
      swordAngle,
      bladeStartX: swordX + Math.cos(swordAngle) * 7 * swordScale,
      bladeStartY: swordY + Math.sin(swordAngle) * 7 * swordScale,
      bladeTipX: swordX + Math.cos(swordAngle) * 116 * swordScale,
      bladeTipY: swordY + Math.sin(swordAngle) * 116 * swordScale,
      guardX: center.x + guardDirectionX * 34,
      guardY: center.y + guardDirectionY * 34,
      guardDirectionX,
      guardDirectionY,
      guardRadiusX: 39,
      guardRadiusY: 17,
    };
  }

  function phaseTwoSwordTouchesGuard(geometry) {
    const facing = geometry.direction.x * geometry.guardDirectionX +
                   geometry.direction.y * geometry.guardDirectionY;
    if (facing < 0.9) return false;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = geometry.bladeStartX + (geometry.bladeTipX - geometry.bladeStartX) * t;
      const y = geometry.bladeStartY + (geometry.bladeTipY - geometry.bladeStartY) * t;
      const offsetX = x - geometry.guardX;
      const offsetY = y - geometry.guardY;
      const tangent = (-offsetX * geometry.guardDirectionY +
                       offsetY * geometry.guardDirectionX) / geometry.guardRadiusX;
      const radial = (offsetX * geometry.guardDirectionX +
                      offsetY * geometry.guardDirectionY) / geometry.guardRadiusY;
      if (tangent * tangent + radial * radial <= 1) return true;
    }
    return false;
  }

  function phaseTwoSwordInParryRange(geometry) {
    const ideal = {
      ...geometry,
      guardX: geometry.center.x + geometry.direction.x * 34,
      guardY: geometry.center.y + geometry.direction.y * 34,
      guardDirectionX: geometry.direction.x,
      guardDirectionY: geometry.direction.y,
    };
    return phaseTwoSwordTouchesGuard(ideal);
  }

  function phaseTwoSwordTouchesPlayer(geometry) {
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = geometry.bladeStartX + (geometry.bladeTipX - geometry.bladeStartX) * t;
      const y = geometry.bladeStartY + (geometry.bladeTipY - geometry.bladeStartY) * t;
      const dx = (x - geometry.center.x) / 14;
      const dy = (y - geometry.center.y) / 18;
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  }

  function phaseTwoBossSlamContact() {
    const avatar = phase2Avatar && phase2Avatar.state && phase2Avatar.state.avatar;
    if (!avatar) return null;
    return {
      x: avatar.x,
      y: avatar.y + avatar.size * 0.33,
      radius: avatar.size * 0.085,
    };
  }

  function phaseTwoBossSlamTouchesGuard(pattern, geometry, ideal) {
    const sourceX = ideal ? 0 : geometry.guardDirectionX;
    const sourceY = ideal ? -1 : geometry.guardDirectionY;
    if (!ideal && sourceY > -0.9) return false;
    const guardX = geometry.center.x + sourceX * 34;
    const guardY = geometry.center.y + sourceY * 34;
    const radius = phase2Avatar && phase2Avatar.state
      ? phase2Avatar.state.avatar.size * 0.085
      : 20;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = pattern.bossPrevContactX + (pattern.bossContactX - pattern.bossPrevContactX) * t;
      const y = pattern.bossPrevContactY + (pattern.bossContactY - pattern.bossPrevContactY) * t;
      const offsetX = x - guardX;
      const offsetY = y - guardY;
      const tangent = (-offsetX * sourceY + offsetY * sourceX) / (39 + radius);
      const radial = (offsetX * sourceX + offsetY * sourceY) / (17 + radius);
      if (tangent * tangent + radial * radial <= 1) return true;
    }
    return false;
  }

  function phaseTwoBossSlamTouchesPlayer(pattern, geometry, radius) {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = pattern.bossPrevContactX + (pattern.bossContactX - pattern.bossPrevContactX) * t;
      const y = pattern.bossPrevContactY + (pattern.bossContactY - pattern.bossPrevContactY) * t;
      const dx = (x - geometry.center.x) / (14 + radius);
      const dy = (y - geometry.center.y) / (18 + radius);
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  }

  function resolvePhaseTwoBossSlam(pattern, parried) {
    if (pattern.bossSlamResolved) return;
    pattern.bossSlamResolved = true;
    pattern.bossSlamParried = parried;
    pattern.bossSlamImpactAge = 0;
    if (parried) {
      addVp(PHASE2_SWORD_PARRY_VP, false);
    } else {
      damagePlayer(PHASE2_BOSS_SLAM_DAMAGE * (bpm / PHASE2_BPM_MIN));
      playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
    }
    restorePhaseTwoSquareArena();
    pattern.centerX = hero.x;
    pattern.centerY = hero.y;
    if (hp <= 0) die();
  }

  function startPhaseTwoBossSlam(pattern) {
    if (!phase2Avatar || typeof phase2Avatar.slamTo !== 'function') {
      restorePhaseTwoSquareArena();
      phase2SwordRingPattern = null;
      return false;
    }
    const board = getBoardRect();
    const center = worldPointToViewport(pattern.centerX, pattern.centerY, board);
    const contact = phaseTwoBossSlamContact();
    pattern.state = 'bossSlam';
    pattern.activeIndex = -1;
    pattern.elapsed = 0;
    pattern.bossSlamResolved = false;
    pattern.bossSlamParried = false;
    pattern.bossSlamImpactAge = -1;
    pattern.bossSlamFlashAge = -1;
    pattern.bossSlamRangeEntered = false;
    pattern.bossSlamReturning = false;
    pattern.bossContactX = contact ? contact.x : center.x;
    pattern.bossContactY = contact ? contact.y : center.y - 120;
    pattern.bossPrevContactX = pattern.bossContactX;
    pattern.bossPrevContactY = pattern.bossContactY;
    const duration = phaseTwoSwordDuration(PHASE2_BOSS_SLAM_MS, pattern, false);
    pattern.bossSlamFlashDuration = phaseTwoSwordDuration(
      PHASE2_SWORD_PARRY_FLASH_MS,
      pattern,
      false
    );
    return phase2Avatar.slamTo(center.x, center.y, duration);
  }

  function updatePhaseTwoBossSlam(pattern, dt) {
    const contact = phaseTwoBossSlamContact();
    const geometry = phaseTwoSwordRingGeometry(pattern, 0);
    if (!contact || !geometry) return;
    pattern.bossPrevContactX = pattern.bossContactX;
    pattern.bossPrevContactY = pattern.bossContactY;
    pattern.bossContactX = contact.x;
    pattern.bossContactY = contact.y;
    if (pattern.bossSlamFlashAge >= 0) pattern.bossSlamFlashAge += dt;
    if (pattern.bossSlamImpactAge >= 0) pattern.bossSlamImpactAge += dt;

    if (!pattern.bossSlamResolved) {
      if (!pattern.bossSlamRangeEntered && phaseTwoBossSlamTouchesGuard(pattern, geometry, true)) {
        pattern.bossSlamRangeEntered = true;
        pattern.bossSlamFlashAge = 0;
      }
      if (phaseTwoBossSlamTouchesGuard(pattern, geometry, false)) {
        resolvePhaseTwoBossSlam(pattern, true);
      } else if (phaseTwoBossSlamTouchesPlayer(pattern, geometry, contact.radius)) {
        resolvePhaseTwoBossSlam(pattern, false);
      }
    }
    if (!pattern.bossSlamResolved && phase2Avatar && !phase2Avatar.slamming) {
      resolvePhaseTwoBossSlam(pattern, false);
    }
    if (pattern.bossSlamResolved && phase2Avatar && !phase2Avatar.slamming &&
        pattern.bossSlamImpactAge >= 220) {
      if (!pattern.bossSlamReturning) {
        const duration = phaseTwoSwordDuration(PHASE2_BOSS_RETURN_DASH_MS, pattern, false);
        pattern.bossSlamReturning = phase2Avatar.dashHome(getBoardRect(), duration);
        if (!pattern.bossSlamReturning) {
          phase2SwordRingPattern = null;
          startPhaseTwoPitfallPattern();
        }
      } else if (!phase2Avatar.dashing) {
        phase2SwordRingPattern = null;
        startPhaseTwoPitfallPattern();
      }
      if (!phase2SwordRingPattern) keys.clear();
    }
  }

  function resolvePhaseTwoSwordStrike(pattern, type, geometry) {
    pattern.defended = type === 'parry';
    pattern.impactType = type;
    pattern.impactX = type === 'parry' ? geometry.guardX : geometry.center.x;
    pattern.impactY = type === 'parry' ? geometry.guardY : geometry.center.y;
    pattern.impactSwordX = geometry.swordX;
    pattern.impactSwordY = geometry.swordY;
    pattern.impactSwordAngle = geometry.swordAngle;
    pattern.impactSwordScale = geometry.swordScale;
    pattern.impactOutX = geometry.direction.x;
    pattern.impactOutY = geometry.direction.y;
    if (type === 'parry') {
      playBossSfx('phase2Parry');
      pattern.successfulParries++;
      healPlayer(PHASE2_SWORD_PARRY_HEAL * (bpm / PHASE2_BPM_MIN));
      addVp(PHASE2_SWORD_PARRY_VP, false);
      if (!pattern.finalClockwise && pattern.successfulParries >= PHASE2_SWORD_FINAL_PARRIES) {
        pattern.finalClockwisePending = true;
      }
    }
    if (type === 'hit') {
      playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
      damagePlayer(PHASE2_SWORD_RING_DAMAGE * (bpm / PHASE2_BPM_MIN));
      if (hp <= 0) die();
    }
    pattern.state = 'impact';
    pattern.elapsed = 0;
  }

  function beginPhaseTwoSwordAttack(pattern, index) {
    const slot = pattern.slots[index];
    if (!slot || slot.status !== 'ready') return false;
    slot.status = 'active';
    pattern.activeIndex = index;
    pattern.lastAttackIndex = index;
    pattern.activeSpeedScale = Math.max(
      0.50,
      1 - Math.min(PHASE2_SWORD_FINAL_PARRIES, pattern.successfulParries) * 0.025
    );
    pattern.defended = false;
    pattern.impactType = null;
    pattern.parryRangeEntered = false;
    pattern.parryFlashAge = -1;
    pattern.state = 'flash';
    pattern.elapsed = 0;
    playBossSfx('phase2SwordStrike');
    return true;
  }

  function chooseNextPhaseTwoSword(pattern) {
    if (pattern.attackBag.length === 0) {
      pattern.attackBag = shuffled([0, 1, 2, 3, 4, 5, 6, 7]);
      if (pattern.attackBag[0] === pattern.lastAttackIndex) {
        const swapIndex = pattern.attackBag.findIndex((index) => index !== pattern.lastAttackIndex);
        if (swapIndex > 0) {
          const first = pattern.attackBag[0];
          pattern.attackBag[0] = pattern.attackBag[swapIndex];
          pattern.attackBag[swapIndex] = first;
        }
      }
    }
    const attempts = pattern.attackBag.length;
    for (let i = 0; i < attempts; i++) {
      const index = pattern.attackBag.shift();
      if (pattern.slots[index].status === 'ready') return index;
      pattern.attackBag.push(index);
    }
    const ready = pattern.slots
      .map((slot, index) => slot.status === 'ready' ? index : -1)
      .filter((index) => index >= 0 && index !== pattern.lastAttackIndex);
    return ready.length ? ready[Math.floor(Math.random() * ready.length)] : -1;
  }

  function updatePhaseTwoSwordRingPattern(dt) {
    const pattern = phase2SwordRingPattern;
    if (!pattern) return;
    for (const slot of pattern.slots) {
      if (slot.status !== 'respawning') continue;
      slot.respawnAge += dt / phaseTwoSwordDuration(1, pattern, false);
      if (slot.respawnAge >= PHASE2_SWORD_RESPAWN_DELAY_MS + PHASE2_SWORD_RESPAWN_FORM_MS) {
        slot.status = 'ready';
        slot.respawnAge = 0;
      }
    }
    pattern.guardSwapAge += dt;
    if (pattern.parryFlashAge >= 0) {
      pattern.parryFlashAge += dt / phaseTwoSwordDuration(1, pattern, true);
    }
    const acceleratedState = pattern.state === 'flash' || pattern.state === 'strike' ||
      pattern.state === 'impact' || pattern.state === 'waiting';
    pattern.elapsed += dt / phaseTwoSwordDuration(1, pattern, acceleratedState);
    if (pattern.state === 'bossSlam') {
      updatePhaseTwoBossSlam(pattern, dt);
      return;
    }
    if (pattern.state === 'forming' && pattern.elapsed >= PHASE2_SWORD_RING_FORM_MS) {
      beginPhaseTwoSwordAttack(pattern, 0);
    } else if (pattern.state === 'flash' && pattern.elapsed >= PHASE2_SWORD_FLASH_MS) {
      pattern.state = 'strike';
      pattern.elapsed = 0;
    } else if (pattern.state === 'strike') {
      const geometry = phaseTwoSwordRingGeometry(pattern, pattern.activeIndex);
      if (geometry && !pattern.parryRangeEntered && phaseTwoSwordInParryRange(geometry)) {
        pattern.parryRangeEntered = true;
        pattern.parryFlashAge = 0;
      }
      if (geometry && phaseTwoSwordTouchesGuard(geometry)) {
        resolvePhaseTwoSwordStrike(pattern, 'parry', geometry);
      } else if (geometry && (phaseTwoSwordTouchesPlayer(geometry) ||
                 pattern.elapsed >= PHASE2_SWORD_STRIKE_MS)) {
        resolvePhaseTwoSwordStrike(pattern, 'hit', geometry);
      }
    } else if (pattern.state === 'impact' && pattern.elapsed >= PHASE2_SWORD_IMPACT_MS) {
      const slot = pattern.slots[pattern.activeIndex];
      if (pattern.finalClockwise) {
        if (slot) slot.status = 'spent';
        pattern.clockwiseIndex++;
        pattern.activeIndex = -1;
        if (pattern.clockwiseIndex >= PHASE2_SWORD_DIRECTIONS.length) {
          startPhaseTwoBossSlam(pattern);
          return;
        }
        pattern.state = 'waiting';
        pattern.nextDelayMs = PHASE2_SWORD_NEXT_MS;
        pattern.elapsed = 0;
        return;
      }
      if (pattern.finalClockwisePending) {
        pattern.finalClockwisePending = false;
        pattern.finalClockwise = true;
        pattern.clockwiseIndex = 0;
        pattern.burstRemaining = 0;
        pattern.attackBag = [];
        for (const swordSlot of pattern.slots) {
          swordSlot.status = 'ready';
          swordSlot.respawnAge = 0;
        }
        pattern.activeIndex = -1;
        pattern.state = 'waiting';
        pattern.nextDelayMs = PHASE2_SWORD_NEXT_MS;
        pattern.elapsed = 0;
        return;
      }
      if (slot) {
        slot.status = 'respawning';
        slot.respawnAge = 0;
      }
      pattern.activeIndex = -1;
      pattern.state = 'waiting';
      pattern.nextDelayMs = pattern.successfulParries >= 8 && pattern.burstRemaining > 0
        ? PHASE2_SWORD_DOUBLE_GAP_MS
        : PHASE2_SWORD_NEXT_MS;
      pattern.elapsed = 0;
    } else if (pattern.state === 'waiting' && pattern.elapsed >= pattern.nextDelayMs) {
      if (!pattern.finalClockwise && pattern.successfulParries >= 8 && pattern.burstRemaining === 0) {
        pattern.burstRemaining = 2;
      }
      const next = pattern.finalClockwise
        ? pattern.clockwiseIndex
        : chooseNextPhaseTwoSword(pattern);
      if (next >= 0 && beginPhaseTwoSwordAttack(pattern, next) &&
          !pattern.finalClockwise && pattern.successfulParries >= 8) {
        pattern.burstRemaining--;
      }
    }
  }

  function updatePhaseTwoTileRuinPattern(dt) {
    const pattern = phase2TileRuinPattern;
    if (!pattern || pattern.state === 'done') return;
    pattern.elapsed += dt;
    pattern.elapsedBeats += dt / beatMs;
    if (pattern.state === 'finalMove') {
      const finalTile = phase2GridSpecial && phase2GridSpecial.finalTile;
      if (!finalTile) { pattern.state = 'done'; return; }
      const p = Math.min(1, pattern.elapsed / PHASE2_FINAL_TILE_MOVE_MS);
      const travel = smoothstep(p);
      finalTile.progress = travel;
      finalTile.x = finalTile.fromX + (finalTile.toX - finalTile.fromX) * travel;
      finalTile.y = finalTile.fromY + (finalTile.toY - finalTile.fromY) * travel;
      hero.x = finalTile.x;
      hero.y = finalTile.y - Math.sin(p * Math.PI) * 8;
      heroSquash = Math.sin(p * Math.PI) * 0.08;
      if (p >= 1) {
        hero.x = finalTile.toX;
        hero.y = finalTile.toY;
        heroSquash = 0;
        pattern.state = 'done';
        startPhaseTwoSwordRingPattern();
      }
      return;
    }
    if (pattern.state === 'telegraph') {
      if (pattern.elapsedBeats >= PHASE2_TILE_RUIN_TELEGRAPH_BEATS) {
        pattern.state = 'fire';
        pattern.elapsed = 0;
        pattern.elapsedBeats = 0;
        pattern.impacted = false;
      }
    } else if (pattern.state === 'fire') {
      const fireP = pattern.elapsedBeats / PHASE2_TILE_RUIN_FIRE_BEATS;
      if (!pattern.impacted && fireP >= 0.72) {
        pattern.impacted = true;
        playBossSfx('phase2TileBreak');
        removePhaseTwoGridTiles(pattern.targets);
      }
      if (pattern.elapsedBeats >= PHASE2_TILE_RUIN_FIRE_BEATS) {
        pattern.state = 'rest';
        pattern.elapsed = 0;
        pattern.elapsedBeats = 0;
      }
    } else if (pattern.state === 'rest' &&
               pattern.elapsedBeats >= PHASE2_TILE_RUIN_REST_BEATS) {
      const intact = intactPhaseTwoGridTiles();
      if (intact.length <= 1) {
        startPhaseTwoFinalTileMove(intact[0]);
      } else {
        pattern.wavesAtSize++;
        if (pattern.wavesAtSize >= pattern.waveSize) {
          pattern.wavesAtSize = 0;
          pattern.waveSize++;
        }
        pattern.targets = choosePhaseTwoTileRuinTargets(pattern.waveSize);
        pattern.state = 'telegraph';
        pattern.elapsed = 0;
        pattern.elapsedBeats = 0;
        pattern.impacted = false;
        playBossSfx('phase2TileCharge');
      }
    }
  }

  function beginPhaseTwoCombat() {
    if (phase2CombatStarted) return;
    phase2CombatStarted = true;
    bpm = phaseTwoBpm();
    beatMs = 60000 / bpm;
    beatPhase = 0;
    beatIndex = 0;
    phase2Attacks = [];
    phase2BurstActive = false;
    phase2BurstSize = 1;
    phase2BurstsAtSize = 0;
    phase2DashZone = 'top';
    phase2Cracks = [];
    phase2GridSpecial = null;
    phase2PlayerHits = 0;
    phase2PostGridCycles = 0;
    phase2ClawPatternStopped = false;
    phase2ClawRushMode = false;
    resetPhaseTwoRushEntities();
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2PitfallPattern = null;
    phase2TowerPattern = null;
    phase2DoomPattern = null;
    phase2MayhemPattern = null;
    nextPhase2AttackBeat = phase2DebugClawQueued ? 0 : 2;
    if (bpmElement) bpmElement.textContent = 'BPM ' + Math.round(bpm);
    if (phase2TowerDebugQueued) {
      phase2TowerDebugQueued = false;
      startPhaseTwoTowerClimb();
    } else if (phase2DoomDebugQueued) {
      phase2DoomDebugQueued = false;
      beginDebugPhaseTwoDoomPattern();
    } else if (phase2MayhemDebugQueued) {
      phase2MayhemDebugQueued = false;
      beginDebugPhaseTwoMayhem();
    } else if (phase2SpearRainDebugQueued) {
      phase2SpearRainDebugQueued = false;
      beginDebugPhaseTwoSpearRain();
    } else if (phase2ChevronDebugQueued) {
      phase2ChevronDebugQueued = false;
      beginDebugPhaseTwoChevron();
    } else if (phase2TrianglesDebugQueued) {
      phase2TrianglesDebugQueued = false;
      beginDebugPhaseTwoTriangles();
    } else if (phase2WaveformDebugQueued) {
      phase2WaveformDebugQueued = false;
      beginDebugPhaseTwoWaveform();
    } else if (phase2RushDebugQueued) beginDebugPhaseTwoRush();
    else if (phase2PitfallDebugQueued) beginDebugPhaseTwoPitfall();
    else if (phase2SwordRingDebugQueued) beginDebugPhaseTwoSwordRing();
    else if (phase2GridDebugQueued) startPhaseTwoGridSpecial();
  }

  function phaseTwoClawPoint(a, t) {
    if (a.pathPoints && a.pathPoints.length) {
      const scaled = clamp01(t) * (a.pathSteps || 56);
      const index = Math.min(a.pathPoints.length - 1, Math.floor(scaled));
      const nextIndex = Math.min(a.pathPoints.length - 1, index + 1);
      const mix = nextIndex === index ? 0 : scaled - index;
      const p = a.pathPoints[index];
      const q = a.pathPoints[nextIndex];
      return { x: p.x + (q.x - p.x) * mix, y: p.y + (q.y - p.y) * mix };
    }
    const u = 1 - t;
    return {
      x: u * u * u * a.x0 + 3 * u * u * t * a.c1x + 3 * u * t * t * a.c2x + t * t * t * a.x1,
      y: u * u * u * a.y0 + 3 * u * u * t * a.c1y + 3 * u * t * t * a.c2y + t * t * t * a.y1,
    };
  }

  function phaseTwoClawWidthAt(a, t) {
    const p = clamp01(t);
    const startWidth = a.startWidth || 9;
    const grow = smoothstep(p / 0.62);
    const tip = p < 0.88 ? 1 : Math.pow((1 - p) / 0.12, 0.42);
    const launchBoost = p < 0.49 ? 1.18 : 1;
    return Math.max(3, (startWidth + (a.width - startWidth) * grow) * tip * launchBoost);
  }

  function phaseTwoClawReach(a) {
    if (a.state === 'armed' || a.state === 'fire' || a.state === 'done') return 1;
    const exponent = a.rushMode ? PHASE2_CLAW_RUSH_REACH_EXPONENT : 1.8;
    return Math.pow(clamp01(a.stretch), exponent);
  }

  function phaseTwoClawContains(a, vx, vy, progress) {
    const end = clamp01(progress == null ? 1 : progress);
    if (end <= 0) return false;
    const steps = Math.max(5, Math.ceil(30 * end));
    let prev = phaseTwoClawPoint(a, 0);
    for (let i = 1; i <= steps; i++) {
      const t = end * i / steps;
      const next = phaseTwoClawPoint(a, t);
      const sampleT = t - end / (steps * 2);
      const frontWindow = Math.max(0.035, Math.min(0.11, end * 0.22));
      const frontTaper = smoothstep((end - sampleT) / frontWindow);
      const width = phaseTwoClawWidthAt(a, sampleT) * frontTaper;
      if (distToSeg(vx, vy, prev.x, prev.y, next.x, next.y) <= width * 0.5) return true;
      prev = next;
    }
    return false;
  }

  function retargetPhaseTwoShadowClaw(a, board) {
    const avatar = phase2Avatar && phase2Avatar.state && phase2Avatar.state.avatar;
    if (!avatar || !avatar.visible || !board || !board.width) return false;
    const heroV = worldPointToViewport(hero.x, hero.y, board);
    const movementLength = Math.hypot(heroMove.x, heroMove.y);
    const trailingAim = a.rushMode && movementLength > 0.05;
    const movementX = trailingAim ? heroMove.x / movementLength : 0;
    const movementY = trailingAim ? heroMove.y / movementLength : 0;
    const lagDistance = trailingAim
      ? (Number.isFinite(a.aimLagDistance) ? a.aimLagDistance : 50)
      : 0;
    const aimX = heroV.x - movementX * lagDistance;
    const aimY = heroV.y - movementY * lagDistance;
    const dx = aimX - avatar.x;
    const dy = aimY - avatar.y;
    const distance = Math.hypot(dx, dy) || 1;
    const dirX = dx / distance;
    const dirY = dy / distance;
    const scaleX = board.width / (canvas && canvas.width ? canvas.width : BOARD);
    const pastHero = Math.max(105, HERO_W * scaleX * 4.8);
    if (!a.turnSign) a.turnSign = heroV.x >= avatar.x ? -1 : 1;
    a.targetX = aimX + dirX * pastHero;
    a.targetY = aimY + dirY * pastHero;
    if (!a.pathPoints.length) {
      const start = {
        x: avatar.x + a.turnSign * avatar.size * 0.045,
        y: avatar.y - avatar.size * 0.08,
      };
      a.pathPoints.push(start);
      a.headX = start.x;
      a.headY = start.y;
      a.headAngle = -Math.PI / 2 + a.turnSign * 0.62;
      a.baseStep = Math.max(14, Math.min(21, (distance + avatar.size * 1.9) / a.pathSteps));
    }
    a.board = { left: board.left, top: board.top, width: board.width, height: board.height };
    return true;
  }

  function extendPhaseTwoClawPath(a, progress) {
    const wanted = Math.min(a.pathSteps, Math.floor(clamp01(progress) * a.pathSteps));
    while (a.pathPoints.length - 1 < wanted) {
      const index = a.pathPoints.length;
      const t = index / a.pathSteps;
      let angle;
      if (t < 0.29) {
        // Launch hard toward the shoulder side before climbing into the hook.
        angle = -Math.PI / 2 + a.turnSign * 0.62;
      } else if (t < 0.49) {
        // A deliberate, compact 180-degree hook at the apex.
        const turn = smoothstep((t - 0.29) / 0.20);
        angle = (-Math.PI / 2 + a.turnSign * 0.62) + a.turnSign * Math.PI * turn;
      } else {
        const desired = Math.atan2(a.targetY - a.headY, a.targetX - a.headX);
        let delta = desired - a.headAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        angle = a.headAngle + Math.max(-0.46, Math.min(0.46, delta));
      }
      const remaining = Math.max(1, a.pathSteps - index + 1);
      const targetDistance = Math.hypot(a.targetX - a.headX, a.targetY - a.headY);
      const step = t >= 0.49 ? Math.max(a.baseStep, targetDistance / remaining * 1.05) : a.baseStep;
      if (index === a.pathSteps) {
        a.headX = a.targetX;
        a.headY = a.targetY;
      } else {
        a.headX += Math.cos(angle) * step;
        a.headY += Math.sin(angle) * step;
      }
      a.headAngle = angle;
      a.pathPoints.push({ x: a.headX, y: a.headY });
    }
  }

  function phaseTwoRushEyePosition(eye, board) {
    const leftSide = eye.slot < PHASE2_RUSH_EYE_COUNT / 2;
    const row = eye.slot % (PHASE2_RUSH_EYE_COUNT / 2);
    const drift = Math.sin(eye.ageBeats * 1.7 + eye.seed) * 5;
    const sideOffset = 124 + (row === 1 ? 42 : 0);
    return {
      x: Math.max(72, Math.min(window.innerWidth - 72,
        leftSide ? board.left - sideOffset : board.right + sideOffset)),
      y: Math.max(64, Math.min(window.innerHeight - 64,
        board.top + board.height * (0.19 + row * 0.31) + drift)),
      angle: leftSide ? 0 : Math.PI,
      upward: leftSide ? -1 : 1,
    };
  }

  function resetPhaseTwoRushEntities() {
    phase2RushEyes = [];
    phase2RushOrbs = [];
    phase2RushDyingEyes = [];
    phase2RushEyesSpawned = 0;
    phase2RushPhaseComplete = false;
    phase2RushEyeBurstPending = false;
  }

  function phaseTwoTowerMaxDx(dyUp) {
    if (dyUp <= 0) return 380;
    const vy = Math.sqrt(2 * PHASE2_TOWER_G * (dyUp + 30));
    if (vy >= PHASE2_TOWER_VCAP) return 40;
    const vx = Math.sqrt(PHASE2_TOWER_VCAP * PHASE2_TOWER_VCAP - vy * vy);
    const t = (vy - Math.sqrt(Math.max(0, vy * vy - 2 * PHASE2_TOWER_G * dyUp))) /
      PHASE2_TOWER_G;
    return Math.max(40, vx * t * 0.85);
  }

  function phaseTwoTowerLaunchCap() {
    if (typeof hasTree !== 'function' || typeof bCount !== 'function' || typeof bUp !== 'function') {
      return PHASE2_TOWER_VCAP * 1.1 * 1.1 * 1.35;
    }
    let cap = PHASE2_TOWER_VCAP;
    const ownsTreeNode = (id) => typeof hasTree === 'function' && hasTree(id);
    const buildingCount = (id) => typeof bCount === 'function' ? bCount(id) : 0;
    const upgradeLevel = (id) => typeof bUp === 'function' ? bUp(id) : 0;
    if (ownsTreeNode('xspire1')) cap *= 1.1;
    if (ownsTreeNode('xspire3')) cap *= 1.1;
    const spireworks = ownsTreeNode('xspire5') ? 1.5 : 1;
    const buildingBonus = (
      0.003 * buildingCount('skyhookyard') +
      0.015 * upgradeLevel('skyhook_tension')
    ) * spireworks;
    cap *= 1 + Math.min(0.35, buildingBonus);
    return cap;
  }

  function phaseTwoTowerHasTrajectoryPreview() {
    return typeof hasTree !== 'function' || hasTree('xspire6');
  }

  function phaseTwoTowerTrajectoryPoints(course, launch) {
    const points = [];
    let x = course.player.x;
    let y = course.player.y;
    let vx = launch.vx;
    let vy = launch.vy;
    const dt = 1 / 120;

    for (let step = 0; step < 180; step++) {
      vy += PHASE2_TOWER_G * dt;
      let nextX = x + vx * dt;
      let nextY = y + vy * dt;
      let landed = false;

      if (nextX < 0) { nextX = 0; vx = -vx * 0.55; }
      if (nextX > BOARD - PHASE2_TOWER_PLAYER_W) {
        nextX = BOARD - PHASE2_TOWER_PLAYER_W;
        vx = -vx * 0.55;
      }
      if (vy < 0) {
        for (const platform of course.platforms) {
          const underside = platform.y + PHASE2_TOWER_PLATFORM_H;
          if (y >= underside - 0.01 && nextY < underside &&
              nextX + PHASE2_TOWER_PLAYER_W > platform.x &&
              nextX < platform.x + platform.w) {
            nextY = underside + 0.1;
            vy = -vy * 0.2;
            break;
          }
        }
      }
      if (vy > 0) {
        const previousFoot = y + PHASE2_TOWER_PLAYER_H;
        const nextFoot = nextY + PHASE2_TOWER_PLAYER_H;
        for (const platform of course.platforms) {
          if (previousFoot <= platform.y + 0.01 && nextFoot >= platform.y) {
            const centerX = nextX + PHASE2_TOWER_PLAYER_W / 2;
            if (centerX >= platform.x - 2 && centerX <= platform.x + platform.w + 2) {
              nextY = platform.y - PHASE2_TOWER_PLAYER_H;
              landed = true;
              break;
            }
          }
        }
      }

      x = nextX;
      y = nextY;
      if (step % 8 === 7 || landed) {
        points.push({
          x: x + PHASE2_TOWER_PLAYER_W / 2,
          y: y + PHASE2_TOWER_PLAYER_H / 2,
        });
      }
      if (landed) break;
    }
    return points;
  }

  function phaseTwoTowerFlameSurfaceOffset(x) {
    const wave = Math.sin(x * 0.071 + clock * 0.008) * 13 +
      Math.sin(x * 0.19 - clock * 0.013) * 7;
    const tongue = Math.pow(Math.max(0, Math.sin(x * 0.113 + clock * 0.011)), 5) * 34;
    return wave - tongue;
  }

  function spawnPhaseTwoTowerEmber(course) {
    const random = course.emberRng;
    const x = 12 + random() * (BOARD - 24);
    const angle = -Math.PI / 2 + (random() * 2 - 1) * 0.82;
    const speed = PHASE2_TOWER_EMBER_MIN_SPEED + random() * PHASE2_TOWER_EMBER_SPEED_RANGE;
    const y = course.flameY + phaseTwoTowerFlameSurfaceOffset(x) - random() * 8;
    course.embers.push({
      x,
      y,
      previousX: x,
      previousY: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      distance: 0,
      maxDistance: canvas.height / 3,
      startRadius: PHASE2_TOWER_EMBER_MIN_RADIUS + random() * PHASE2_TOWER_EMBER_RADIUS_RANGE,
    });
  }

  function updatePhaseTwoTowerEmbers(course, seconds, flameBeatStep, vpBeatStep) {
    course.emberSpawnBudget += PHASE2_TOWER_EMBERS_PER_BEAT * flameBeatStep;
    while (course.emberSpawnBudget >= 1) {
      course.emberSpawnBudget--;
      spawnPhaseTwoTowerEmber(course);
    }

    const heroOriginX = Math.round(hero.x - HERO_W / 2);
    const heroOriginY = Math.round(hero.y - HERO_H / 2) + course.cameraY;
    let touchingEmber = false;
    for (const ember of course.embers) {
      ember.previousX = ember.x;
      ember.previousY = ember.y;
      const dx = ember.vx * seconds;
      const dy = ember.vy * seconds;
      ember.x += dx;
      ember.y += dy;
      ember.distance += Math.hypot(dx, dy);
      const life = Math.max(0, 1 - ember.distance / ember.maxDistance);
      const radius = ember.startRadius * Math.pow(life, 0.72);
      if (radius <= 0) continue;
      const touchesHero = HERO_BODY_PIXEL_OFFSETS.some((point) =>
        distToSeg(
          heroOriginX + point.x,
          heroOriginY + point.y,
          ember.previousX,
          ember.previousY,
          ember.x,
          ember.y
        ) <= radius);
      if (touchesHero) touchingEmber = true;
    }
    if (touchingEmber) {
      addVp(VP_PER_BEAT * PHASE2_TOWER_EMBER_VP_SCALE * vpBeatStep, true);
    }
    course.embers = course.embers.filter((ember) => (
      ember.distance < ember.maxDistance &&
      ember.x > -ember.startRadius * 2 &&
      ember.x < BOARD + ember.startRadius * 2
    ));
  }

  function buildPhaseTwoTowerPlatforms(width) {
    const random = mulberry32(20260611);
    // Keep a full visible escape channel between the inner frame and every
    // generated ledge, wide enough for 1.5 collision boxes on either side.
    const margin = BORDER + PAD + PHASE2_TOWER_SIDE_CHANNEL;
    const floorY = PHASE2_TOWER_WORLD_H - 72;
    const platforms = [{ x: 0, y: floorY, w: width }];
    let previous = platforms[0];
    while (previous.y > 280) {
      const climb = 1 - previous.y / PHASE2_TOWER_WORLD_H;
      const gap = 120 + 95 * climb + random() * 30;
      const y = previous.y - gap;
      const platformWidth = Math.max(82, (220 - 105 * climb) * 0.78 + random() * 24);
      const reach = phaseTwoTowerMaxDx(gap) + (previous.w + platformWidth) / 2 - 12;
      const center = previous.x + previous.w / 2 + (random() * 2 - 1) * reach;
      const x = Math.min(width - platformWidth - margin, Math.max(margin, center - platformWidth / 2));
      const platform = { x, y, w: platformWidth };
      platforms.push(platform);
      const extras = random() < 0.85 ? (random() < 0.35 ? 2 : 1) : 0;
      for (let i = 0; i < extras; i++) {
        const extraWidth = Math.max(68, (160 - 70 * climb) * 0.72 + random() * 20);
        const extraX = margin + random() * (width - extraWidth - 2 * margin);
        const extraY = random() < 0.5 ? y : y - 14 - random() * 34;
        if (extraX > x + platformWidth + 26 || extraX + extraWidth < x - 26) {
          platforms.push({ x: extraX, y: extraY, w: extraWidth });
        }
      }
      previous = platform;
    }
    return platforms;
  }

  function phaseTwoTowerTargetHeight() {
    return Math.max(500, Math.round((window.innerHeight - 10) / 2) * 2);
  }

  function updatePhaseTwoTowerLayout(progress) {
    if (!overlay || !canvas) return;
    const p = shockwaveArenaProgress(progress);
    const targetHeight = phaseTwoTowerTargetHeight();
    const height = Math.max(500, Math.round((500 + (targetHeight - 500) * p) / 2) * 2);
    // The stage child begins 40px into its row (VP bar + gap). Offset the row
    // by that amount so the tower itself, rather than the whole HUD row, is centered.
    const rowLeft = window.innerWidth / 2 - BOARD / 2 - 40;
    const rowTop = 5 + (targetHeight - height) / 2;
    overlay.classList.add('tower-climb-active');
    overlay.style.setProperty('--phase2-row-left', rowLeft.toFixed(1) + 'px');
    overlay.style.setProperty('--phase2-row-top', rowTop.toFixed(1) + 'px');
    overlay.style.setProperty('--phase2-stage-w', BOARD + 'px');
    overlay.style.setProperty('--phase2-stage-h', height + 'px');
    overlay.style.setProperty('--phase2-vbar-h', height + 'px');
    if (canvas.width !== BOARD || canvas.height !== height) {
      canvas.width = BOARD;
      canvas.height = height;
      ctx.imageSmoothingEnabled = false;
      frameBoardRect = null;
    }
    Object.assign(arena, {
      x: BOARD / 2,
      y: height / 2,
      width: BOARD,
      height,
      rotation: 0,
      shape: 'rect',
      from: null,
      target: null,
      transitionTime: 0,
      transitionDuration: 0,
    });
    const board = getBoardRect();
    const avatar = phase2Avatar && phase2Avatar.state && phase2Avatar.state.avatar;
    const bossTarget = phaseTwoTowerBossTarget();
    const uiWidth = Math.max(210, Math.min(420, board.left - 58));
    const uiLeft = Math.max(
      18,
      Math.min(board.left - uiWidth - 24, bossTarget.x - uiWidth / 2)
    );
    const uiTop = Math.min(window.innerHeight - 58, bossTarget.y + (avatar ? avatar.size : 250) * 0.48);
    overlay.style.setProperty('--tower-ui-left', uiLeft.toFixed(1) + 'px');
    overlay.style.setProperty('--tower-ui-width', uiWidth.toFixed(1) + 'px');
    overlay.style.setProperty('--tower-ui-top', uiTop.toFixed(1) + 'px');
  }

  function createPhaseTwoTowerCourse() {
    const floorY = PHASE2_TOWER_WORLD_H - 72;
    const viewHeight = canvas.height;
    const player = {
      x: BOARD / 2 - PHASE2_TOWER_PLAYER_W / 2,
      y: floorY - PHASE2_TOWER_PLAYER_H,
    };
    return {
      player,
      vx: 0,
      vy: 0,
      grounded: true,
      drag: null,
      cameraY: Math.max(0, Math.min(
        PHASE2_TOWER_WORLD_H - viewHeight,
        player.y - viewHeight * 0.55
      )),
      platforms: buildPhaseTwoTowerPlatforms(BOARD),
      flameY: player.y + phaseTwoTowerTargetHeight() * 0.44,
      embers: [],
      emberSpawnBudget: 0,
      emberRng: mulberry32(0xe8b3a2),
      lastFlameDamageBeat: -1,
      altitude: 0,
    };
  }

  function syncPhaseTwoTowerHero() {
    const course = phase2TowerPattern && phase2TowerPattern.course;
    if (!course) return;
    hero.x = course.player.x + PHASE2_TOWER_PLAYER_W / 2;
    hero.y = course.player.y + PHASE2_TOWER_PLAYER_H / 2 - course.cameraY;
    heroMove.x = Math.sign(course.vx);
    heroMove.y = Math.sign(course.vy);
  }

  function phaseTwoTowerBossTarget() {
    const board = getBoardRect();
    const avatar = phase2Avatar && phase2Avatar.state && phase2Avatar.state.avatar;
    const size = avatar ? avatar.size : 250;
    const desiredX = board.left * 0.50;
    return {
      x: Math.max(size * 0.48, Math.min(board.left - size * 0.44, desiredX)),
      y: Math.max(size * 0.48, Math.min(window.innerHeight * 0.30, 250)),
    };
  }

  function resolvePhaseTwoTowerImpact() {
    const pattern = phase2TowerPattern;
    if (!pattern || pattern.mode !== 'slam') return;
    pattern.mode = 'expand';
    pattern.elapsed = 0;
    pattern.course = createPhaseTwoTowerCourse();
    pattern.dashStarted = false;
    phase2SquareArenaLocked = true;
    phase2Attacks = [];
    keys.clear();
    updatePhaseTwoTowerLayout(0);
    syncPhaseTwoTowerHero();
    const help = overlay && overlay.querySelector('.aether-boss2d-help');
    if (help && help.firstChild) help.firstChild.nodeValue = 'MOUSE DRAG / RELEASE TO LEAP';
  }

  function startPhaseTwoTowerClimb() {
    if (!phase2CombatStarted || !canvas || !phase2Avatar || phase2TowerPattern) return false;
    restorePhaseTwoSquareArena(true);
    phase2PitfallPattern = null;
    phase2GridSpecial = null;
    phase2TileRuinPattern = null;
    phase2SwordRingPattern = null;
    phase2Cracks = [];
    phase2Attacks = [];
    phase2ClawPatternStopped = true;
    phase2BurstActive = false;
    nextPhase2AttackBeat = Infinity;
    phase2TowerPattern = { mode: 'slam', elapsed: 0, course: null, dashStarted: false };
    const board = getBoardRect();
    const started = phase2Avatar.slamTo(
      board.left + board.width / 2,
      board.top + board.height / 2,
      PHASE2_TOWER_ENTRY_SLAM_MS
    );
    if (!started) resolvePhaseTwoTowerImpact();
    return true;
  }

  function beginPhaseTwoDoomTransition(course) {
    const pattern = phase2TowerPattern;
    if (!pattern || pattern.mode !== 'active' || !phase2Avatar || dead) return false;
    pattern.mode = 'doom-slam';
    pattern.elapsed = 0;
    course.drag = null;
    course.embers = [];
    heroMove.x = 0;
    heroMove.y = 0;
    keys.clear();
    const board = getBoardRect();
    const started = phase2Avatar.slamTo(
      board.left + board.width / 2,
      board.top + board.height / 2,
      PHASE2_DOOM_ENTRY_SLAM_MS
    );
    if (!started) resolvePhaseTwoDoomSlam();
    return true;
  }

  function resolvePhaseTwoDoomSlam() {
    const pattern = phase2TowerPattern;
    if (!pattern || pattern.mode !== 'doom-slam') return;
    phase2TowerPattern = null;
    restorePhaseTwoSquareArena(true);
    startPhaseTwoDoomPattern();
  }

  function debugPhaseTwoTowerClimb() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    phase2TowerDebugQueued = true;
    if (!phase2AvatarStarted) skipPhaseTwoTransition();
    if (!phase2CombatStarted) return;
    phase2TowerDebugQueued = false;
    phase2TowerPattern = null;
    startPhaseTwoTowerClimb();
  }

  function beginDebugPhaseTwoDoomPattern() {
    if (!phase2CombatStarted || !canvas || !phase2Avatar) return false;
    phase2DoomDebugQueued = false;
    phase2PitfallPattern = null;
    phase2SwordRingPattern = null;
    phase2GridSpecial = null;
    phase2ClawRushMode = false;
    resetPhaseTwoRushEntities();
    phase2Attacks = [];
    phase2Cracks = [];
    restorePhaseTwoSquareArena(true);
    phase2TowerPattern = { mode: 'doom-slam', elapsed: 0, course: null };
    const board = getBoardRect();
    const started = phase2Avatar.slamTo(
      board.left + board.width / 2,
      board.top + board.height / 2,
      PHASE2_DOOM_ENTRY_SLAM_MS
    );
    if (!started) resolvePhaseTwoDoomSlam();
    return true;
  }

  function debugPhaseTwoDoomPattern() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    phase2DoomDebugQueued = true;
    if (!phase2AvatarStarted) skipPhaseTwoTransition();
    if (phase2CombatStarted && phase2DoomDebugQueued) {
      phase2DoomDebugQueued = false;
      beginDebugPhaseTwoDoomPattern();
    }
  }

  function phaseTwoTowerDragVector() {
    const course = phase2TowerPattern && phase2TowerPattern.course;
    if (!course || !course.drag) return { vx: 0, vy: 0, magnitude: 0 };
    const drag = course.drag;
    const launchCap = phaseTwoTowerLaunchCap();
    let vx = (drag.startX - drag.currentX) * PHASE2_TOWER_DRAG_K;
    let vy = (drag.startY - drag.currentY) * PHASE2_TOWER_DRAG_K;
    const magnitude = Math.hypot(vx, vy);
    if (magnitude > launchCap) {
      vx *= launchCap / magnitude;
      vy *= launchCap / magnitude;
    }
    return { vx, vy, magnitude: Math.min(magnitude, launchCap) };
  }

  function phaseTwoTowerDragStart(clientX, clientY) {
    const pattern = phase2TowerPattern;
    const course = pattern && pattern.mode === 'active' && pattern.course;
    if (!course || !course.grounded || dead) return false;
    const board = getBoardRect();
    if (clientX < board.left || clientX > board.right || clientY < board.top || clientY > board.bottom) {
      return false;
    }
    course.drag = { startX: clientX, startY: clientY, currentX: clientX, currentY: clientY };
    return true;
  }

  function phaseTwoTowerDragMove(clientX, clientY) {
    const course = phase2TowerPattern && phase2TowerPattern.course;
    if (!course || !course.drag) return;
    course.drag.currentX = clientX;
    course.drag.currentY = clientY;
  }

  function phaseTwoTowerDragEnd() {
    const course = phase2TowerPattern && phase2TowerPattern.course;
    if (!course || !course.drag) return;
    const drag = course.drag;
    const pulled = Math.hypot(drag.startX - drag.currentX, drag.startY - drag.currentY);
    const launch = phaseTwoTowerDragVector();
    course.drag = null;
    if (pulled < PHASE2_TOWER_MIN_DRAG || launch.vy >= 0) return;
    course.vx = launch.vx;
    course.vy = launch.vy;
    course.grounded = false;
  }

  function phaseTwoTowerPhysicsStep(course, dt) {
    if (course.grounded) return;
    const player = course.player;
    course.vy += PHASE2_TOWER_G * dt;
    let nextX = player.x + course.vx * dt;
    let nextY = player.y + course.vy * dt;
    if (nextX < 0) {
      nextX = 0;
      course.vx = -course.vx * 0.55;
    }
    if (nextX > BOARD - PHASE2_TOWER_PLAYER_W) {
      nextX = BOARD - PHASE2_TOWER_PLAYER_W;
      course.vx = -course.vx * 0.55;
    }
    if (course.vy < 0) {
      for (const platform of course.platforms) {
        const underside = platform.y + PHASE2_TOWER_PLATFORM_H;
        if (player.y >= underside - 0.01 && nextY < underside &&
            nextX + PHASE2_TOWER_PLAYER_W > platform.x && nextX < platform.x + platform.w) {
          nextY = underside + 0.1;
          course.vy = -course.vy * 0.2;
          break;
        }
      }
    }
    if (course.vy > 0) {
      const previousFoot = player.y + PHASE2_TOWER_PLAYER_H;
      const nextFoot = nextY + PHASE2_TOWER_PLAYER_H;
      for (const platform of course.platforms) {
        if (previousFoot <= platform.y + 0.01 && nextFoot >= platform.y) {
          const centerX = nextX + PHASE2_TOWER_PLAYER_W / 2;
          if (centerX >= platform.x - 2 && centerX <= platform.x + platform.w + 2) {
            nextY = platform.y - PHASE2_TOWER_PLAYER_H;
            course.vx = 0;
            course.vy = 0;
            course.grounded = true;
            break;
          }
        }
      }
    }
    player.x = nextX;
    player.y = nextY;
  }

  function updatePhaseTwoTowerCourse(course, dt) {
    const seconds = Math.min(0.05, dt / 1000);
    phaseTwoTowerPhysicsStep(course, seconds / 2);
    phaseTwoTowerPhysicsStep(course, seconds / 2);
    const targetCamera = Math.max(0, Math.min(
      PHASE2_TOWER_WORLD_H - canvas.height,
      course.player.y - canvas.height * 0.55
    ));
    const cameraEase = 1 - Math.pow(0.84, dt / (1000 / 60));
    course.cameraY += (targetCamera - course.cameraY) * cameraEase;
    // Preserve the baseline rise at 150 BPM, but apply only half of the extra
    // entropy tempo so the flame does not become oppressive late in the fight.
    const flameBpm = PHASE2_BPM_MIN + (bpm - PHASE2_BPM_MIN) * PHASE2_TOWER_FLAME_BPM_SCALE;
    const flameBeatStep = dt / (60000 / flameBpm);
    course.flameY -= PHASE2_TOWER_FLAME_RISE_PER_BEAT * flameBeatStep;
    course.altitude = Math.max(
      course.altitude,
      PHASE2_TOWER_WORLD_H - 72 - PHASE2_TOWER_PLAYER_H - course.player.y
    );
    syncPhaseTwoTowerHero();
    updatePhaseTwoTowerEmbers(course, seconds, flameBeatStep, dt / beatMs);
    const playerBottom = course.player.y + PHASE2_TOWER_PLAYER_H;
    if (playerBottom >= course.flameY && course.lastFlameDamageBeat !== beatIndex) {
      course.lastFlameDamageBeat = beatIndex;
      damagePlayer(PHASE2_TOWER_FLAME_DAMAGE * (bpm / PHASE2_BPM_MIN));
      playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
      if (hp <= 0) die();
    }
    if (
      !dead &&
      course.altitude >= PHASE2_TOWER_GOAL_METERS * PHASE2_TOWER_PIXELS_PER_METER
    ) {
      beginPhaseTwoDoomTransition(course);
    }
  }

  function updatePhaseTwoTowerPattern(dt) {
    const pattern = phase2TowerPattern;
    if (!pattern) return;
    pattern.elapsed += dt;
    if (pattern.mode === 'slam') return;
    if (pattern.mode === 'expand') {
      const progress = clamp01(pattern.elapsed / PHASE2_TOWER_EXPAND_MS);
      updatePhaseTwoTowerLayout(progress);
      pattern.course.cameraY = Math.max(0, Math.min(
        PHASE2_TOWER_WORLD_H - canvas.height,
        pattern.course.player.y - canvas.height * 0.55
      ));
      syncPhaseTwoTowerHero();
      if (progress >= 1 && !pattern.dashStarted && phase2Avatar && !phase2Avatar.slamming) {
        pattern.dashStarted = phase2Avatar.dashTo(
          phaseTwoTowerBossTarget().x,
          phaseTwoTowerBossTarget().y,
          PHASE2_TOWER_BOSS_DASH_MS
        );
      }
      if (progress >= 1 && pattern.dashStarted && (!phase2Avatar || !phase2Avatar.dashing)) {
        pattern.mode = 'active';
        pattern.elapsed = 0;
      }
      return;
    }
    if (pattern.mode === 'active' && pattern.course) updatePhaseTwoTowerCourse(pattern.course, dt);
  }

  function phaseTwoDoomNoteSize(pattern) {
    return pattern && pattern.squareSize ? pattern.squareSize : 72;
  }

  function phaseTwoDoomBeatNow() {
    return beatIndex + beatPhase / Math.max(1, beatMs);
  }

  function phaseTwoDoomBounds(pattern) {
    const inset = BORDER + PAD + phaseTwoDoomNoteSize(pattern) / 2 + 16;
    const left = inset;
    const right = Math.max(left + 1, canvas.width - inset);
    const top = inset;
    const bottom = Math.max(top + 1, canvas.height - inset);
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }

  function phaseTwoDoomStartRoute(pattern) {
    const modes = [
      'cornerReverse', 'invertedPentagram', 'leftRight',
      'orbit', 'figure8', 'zigzag', 'spiral', 'star',
    ]
      .filter((mode) => !pattern.route || mode !== pattern.route.mode);
    const mode = modes[Math.floor(pattern.random() * modes.length)];
    const authoredPoints = {
      cornerReverse: [
        [0.08, 0.09], [0.92, 0.09], [0.92, 0.91], [0.08, 0.91],
        [0.08, 0.09], [0.08, 0.91], [0.92, 0.91], [0.92, 0.09],
      ],
      invertedPentagram: [
        [0.50, 0.94], [0.08, 0.12], [0.92, 0.72],
        [0.08, 0.72], [0.92, 0.12], [0.50, 0.94],
      ],
      leftRight: [
        [0.08, 0.16], [0.92, 0.28], [0.08, 0.40], [0.92, 0.52],
        [0.08, 0.64], [0.92, 0.76], [0.08, 0.88], [0.92, 0.70],
      ],
    };
    const points = authoredPoints[mode] || null;
    pattern.route = {
      mode,
      step: 0,
      length: points ? points.length : 5 + Math.floor(pattern.random() * 3),
      phase: pattern.random() * Math.PI * 2,
      direction: pattern.random() < 0.5 ? -1 : 1,
      points,
    };
  }

  function phaseTwoDoomNextPoint(pattern) {
    if (!pattern.route || pattern.route.step >= pattern.route.length) phaseTwoDoomStartRoute(pattern);
    const route = pattern.route;
    const bounds = pattern.bounds || phaseTwoDoomBounds(pattern);
    const i = route.step++;
    const span = Math.max(1, route.length - 1);
    const t = route.phase + i * route.direction * Math.PI * 2 / span;
    let nx = 0.5;
    let ny = 0.5;
    if (route.points) {
      [nx, ny] = route.points[i];
    } else if (route.mode === 'orbit') {
      nx += Math.cos(t) * 0.43;
      ny += Math.sin(t) * 0.38;
    } else if (route.mode === 'figure8') {
      nx += Math.sin(t) * 0.43;
      ny += Math.sin(t * 2) * 0.34;
    } else if (route.mode === 'zigzag') {
      nx = i % 2 ? 0.88 : 0.12;
      ny = 0.14 + ((i + Math.floor(route.phase * 3)) % 4) * 0.24;
      if (Math.sin(route.phase) < 0) [nx, ny] = [ny, nx];
    } else if (route.mode === 'spiral') {
      const radius = 0.14 + i / span * 0.30;
      nx += Math.cos(t * 1.35) * radius;
      ny += Math.sin(t * 1.35) * radius * 0.9;
    } else {
      const starAngle = route.phase + i * route.direction * Math.PI * 4 / 5;
      nx += Math.cos(starAngle) * 0.43;
      ny += Math.sin(starAngle) * 0.38;
    }
    return {
      x: Math.max(bounds.left, Math.min(bounds.right, bounds.left + nx * bounds.width)),
      y: Math.max(bounds.top, Math.min(bounds.bottom, bounds.top + ny * bounds.height)),
    };
  }

  function phaseTwoDoomAvoidSzago(pattern, point) {
    const avatar = phase2Avatar && phase2Avatar.state && phase2Avatar.state.avatar;
    const board = getBoardRect();
    if (!avatar || !avatar.visible || avatar.alpha < 0.35 || !board || !board.width || !board.height) return point;
    const radiusX = avatar.size * canvas.width / board.width * 0.52 + pattern.squareSize * 0.72;
    const radiusY = avatar.size * canvas.height / board.height * 0.52 + pattern.squareSize * 0.72;
    const bounds = pattern.bounds || phaseTwoDoomBounds(pattern);
    const bosses = [
      {
        x: (avatar.x - board.left) * canvas.width / board.width,
        y: (avatar.y - board.top) * canvas.height / board.height,
      },
      {
        x: canvas.width / 2,
        y: avatar.size * 0.34 * canvas.height / board.height,
      },
    ];
    const clearance = (candidate, boss) => {
      const dx = candidate.x - boss.x;
      const dy = candidate.y - boss.y;
      return (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);
    };
    let candidate = { ...point };
    for (let pass = 0; pass < 2; pass++) {
      for (const boss of bosses) {
        if (clearance(candidate, boss) >= 1) continue;
        const dx = candidate.x - boss.x;
        const side = Math.abs(dx) > 0.001 ? Math.sign(dx) : (pattern.route && pattern.route.direction || 1);
        candidate.x = Math.max(bounds.left, Math.min(bounds.right, boss.x + side * radiusX * 1.08));
        if (clearance(candidate, boss) < 1) {
          candidate.y = Math.max(bounds.top, Math.min(bounds.bottom, boss.y + radiusY * 1.08));
        }
      }
    }
    if (bosses.every((boss) => clearance(candidate, boss) >= 1)) return candidate;
    const fallbacks = [
      { x: bounds.left, y: bounds.top },
      { x: bounds.right, y: bounds.top },
      { x: bounds.left, y: bounds.bottom },
      { x: bounds.right, y: bounds.bottom },
      { x: bounds.left, y: bounds.top + bounds.height / 2 },
      { x: bounds.right, y: bounds.top + bounds.height / 2 },
    ];
    return fallbacks.sort((a, b) =>
      Math.min(...bosses.map((boss) => clearance(b, boss))) -
      Math.min(...bosses.map((boss) => clearance(a, boss))))[0];
  }

  function phaseTwoDoomSpawnNote(pattern, hitBeat, spawnBeat) {
    if (pattern.spawnedNotes >= PHASE2_DOOM_NOTE_LIMIT) return false;
    let point = phaseTwoDoomAvoidSzago(pattern, phaseTwoDoomNextPoint(pattern));
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!pattern.lastTarget || Math.hypot(point.x - pattern.lastTarget.x, point.y - pattern.lastTarget.y) > pattern.squareSize * 1.25) break;
      point = phaseTwoDoomAvoidSzago(pattern, phaseTwoDoomNextPoint(pattern));
    }
    pattern.lastTarget = point;
    pattern.notes.push({
      id: pattern.nextId++,
      x: point.x,
      y: point.y,
      seed: pattern.random() * Math.PI * 2,
      hitBeat,
      spawnBeat,
      judged: false,
      shakeAge: 0,
    });
    pattern.spawnedNotes++;
    if (pattern.spawnedNotes >= PHASE2_DOOM_NOTE_LIMIT) pattern.nextHitBeat = Infinity;
    playBossSfx('phase2TileCharge');
    return true;
  }

  function phaseTwoDoomBeginHop(pattern, note) {
    if (!note) return;
    pattern.hop = {
      fromX: hero.x,
      fromY: hero.y,
      toX: note.x,
      toY: note.y,
      elapsed: 0,
      duration: PHASE2_DOOM_HOP_MS,
      clearsDebris: Boolean(pattern.debrisSquare),
    };
  }

  function phaseTwoDoomAddJudgment(pattern, x, y, text, kind) {
    pattern.judgments.push({ x, y, text, kind, age: 0, duration: 680 });
  }

  function phaseTwoDoomAddSlash(pattern, x, y, punish, delay, square) {
    pattern.slashes.push({
      x,
      y,
      age: -Math.max(0, delay || 0),
      duration: PHASE2_DOOM_SLASH_MS,
      punish,
      soundPlayed: false,
      seed: pattern.random() * Math.PI * 2,
      square: square ? { ...square } : null,
    });
  }

  function phaseTwoDoomCompleteNote(pattern) {
    pattern.resolvedNotes++;
    if (pattern.resolvedNotes >= PHASE2_DOOM_NOTE_LIMIT) {
      pattern.endingRequested = true;
      pattern.nextHitBeat = Infinity;
    }
  }

  function phaseTwoDoomPunish(pattern, note, label) {
    if (!note || note.judged) return;
    note.judged = true;
    phaseTwoDoomCompleteNote(pattern);
    phaseTwoDoomAddSlash(pattern, hero.x, hero.y, true);
    phaseTwoDoomAddJudgment(pattern, note.x, note.y, label, 'miss');
    vp = Math.max(0, vp - PHASE2_DOOM_PUNISH_VP);
    pattern.debrisSquare = pattern.currentSquare
      ? { ...pattern.currentSquare, seed: pattern.random() * Math.PI * 2 }
      : { x: hero.x, y: hero.y, seed: pattern.random() * Math.PI * 2 };
    pattern.lastDebrisDamageBeat = beatIndex;
    if (pattern.elapsed >= pattern.perfectSafeUntil) {
      damagePlayer(PHASE2_DOOM_PUNISH_DAMAGE);
      playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
    }
    if (hp <= 0) die();
  }

  function phaseTwoDoomJudge(pattern, note) {
    const timing = (phaseTwoDoomBeatNow() - note.hitBeat) * beatMs;
    if (timing < -PHASE2_DOOM_OK_MS) {
      phaseTwoDoomPunish(pattern, note, 'TOO EARLY');
      return;
    }
    const absoluteTiming = Math.abs(timing);
    const grade = absoluteTiming <= PHASE2_DOOM_PERFECT_MS
      ? 'perfect'
      : absoluteTiming <= PHASE2_DOOM_GREAT_MS ? 'great' : 'ok';
    note.judged = true;
    phaseTwoDoomCompleteNote(pattern);
    const abandonedSquare = pattern.currentSquare ? { ...pattern.currentSquare } : null;
    if (!pattern.debrisSquare) {
      phaseTwoDoomAddSlash(
        pattern,
        abandonedSquare ? abandonedSquare.x : hero.x,
        abandonedSquare ? abandonedSquare.y : hero.y,
        false,
        Math.max(PHASE2_DOOM_HOP_MS + 25, -timing),
        abandonedSquare
      );
    }
    pattern.currentSquare = { x: note.x, y: note.y, seed: note.seed };
    phaseTwoDoomBeginHop(pattern, note);
    phaseTwoDoomAddJudgment(pattern, note.x, note.y, grade.toUpperCase(), grade);
    if (grade === 'perfect') {
      pattern.perfectSafeUntil = Math.max(
        pattern.perfectSafeUntil,
        pattern.elapsed + PHASE2_DOOM_HOP_MS + PHASE2_DOOM_SLASH_MS
      );
      addVp(PHASE2_DOOM_PERFECT_VP, true);
    }
  }

  function phaseTwoDoomNoteViewportRect(pattern, note) {
    const board = getBoardRect();
    if (!board || !board.width || !note) return null;
    const size = phaseTwoDoomNoteSize(pattern);
    const width = size * board.width / canvas.width;
    const height = size * board.height / canvas.height;
    const cx = board.left + note.x * board.width / canvas.width;
    const cy = board.top + note.y * board.height / canvas.height;
    return {
      left: cx - width / 2,
      right: cx + width / 2,
      top: cy - height / 2,
      bottom: cy + height / 2,
    };
  }

  function phaseTwoDoomClick(clientX, clientY) {
    const pattern = phase2DoomPattern;
    if (!pattern || pattern.mode !== 'active' || dead) return false;
    const available = pattern.notes.filter((note) => !note.judged)
      .sort((a, b) => a.hitBeat - b.hitBeat);
    const clicked = available.find((note) => {
      const rect = phaseTwoDoomNoteViewportRect(pattern, note);
      return rect && clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top && clientY <= rect.bottom;
    });
    if (!clicked) return false;
    if (clicked !== available[0]) {
      available[0].shakeAge = 180;
      return true;
    }
    phaseTwoDoomJudge(pattern, clicked);
    return true;
  }

  function beginPhaseTwoDoomEnding(pattern) {
    if (!pattern || pattern.mode !== 'active') return false;
    const square = pattern.currentSquare || { x: hero.x, y: hero.y, seed: pattern.random() * Math.PI * 2 };
    pattern.mode = 'ending-center';
    pattern.elapsed = 0;
    pattern.notes = [];
    pattern.slashes = [];
    pattern.judgments = [];
    pattern.debrisSquare = null;
    pattern.currentSquare = { ...square };
    pattern.centerFromX = square.x;
    pattern.centerFromY = square.y;
    pattern.heroCenterFromX = hero.x;
    pattern.heroCenterFromY = hero.y;
    pattern.centerTargetX = canvas.width / 2;
    pattern.centerTargetY = canvas.height / 2;
    keys.clear();
    return true;
  }

  function beginPhaseTwoDoomEndSlam(pattern) {
    if (!pattern || pattern.mode !== 'ending-center') return false;
    pattern.mode = 'ending-slam';
    pattern.elapsed = 0;
    const board = getBoardRect();
    const target = worldPointToViewport(pattern.centerTargetX, pattern.centerTargetY, board);
    const started = phase2Avatar && typeof phase2Avatar.slamTo === 'function' &&
      phase2Avatar.slamTo(target.x, target.y, PHASE2_DOOM_ENTRY_SLAM_MS);
    if (!started) resolvePhaseTwoDoomEndSlam();
    return true;
  }

  function resolvePhaseTwoDoomEndSlam() {
    const pattern = phase2DoomPattern;
    if (!pattern || pattern.mode !== 'ending-slam') return;
    const startSize = phaseTwoDoomNoteSize(pattern);
    restorePhaseTwoSquareArena(true);
    phase2DoomPattern = pattern;
    pattern.mode = 'ending-expand';
    pattern.elapsed = 0;
    pattern.squareSize = startSize;
    pattern.endSquareStartSize = startSize;
    pattern.endSquareTargetSize = BOARD + BORDER * 2;
    pattern.currentSquare = {
      x: BOARD / 2,
      y: BOARD / 2,
      seed: pattern.currentSquare ? pattern.currentSquare.seed : pattern.random() * Math.PI * 2,
    };
    hero.x = BOARD / 2;
    hero.y = BOARD / 2;
    heroMove.x = 0;
    heroMove.y = 0;
  }

  function finishPhaseTwoDoomEnding(pattern) {
    if (!pattern || phase2DoomPattern !== pattern) return;
    phase2DoomPattern = null;
    phase2ClawPatternStopped = true;
    phase2BurstActive = false;
    nextPhase2AttackBeat = Infinity;
    keys.clear();
    const help = overlay && overlay.querySelector('.aether-boss2d-help');
    if (help && help.firstChild) help.firstChild.nodeValue = 'WASD / ARROWS MOVE';
    if (!startPhaseTwoMayhemPattern() && phase2Avatar && typeof phase2Avatar.dashHome === 'function') {
      phase2Avatar.dashHome(getBoardRect(), PHASE2_BOSS_RETURN_DASH_MS);
    }
  }

  function activatePhaseTwoDoomPattern(pattern) {
    pattern.mode = 'active';
    pattern.elapsed = 0;
    pattern.squareSize = Math.max(62, Math.min(82, Math.min(canvas.width, canvas.height) * 0.13));
    pattern.bounds = phaseTwoDoomBounds(pattern);
    pattern.currentSquare = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      seed: pattern.random() * Math.PI * 2,
    };
    pattern.lastTarget = pattern.currentSquare;
    pattern.route = null;
    pattern.debrisSquare = null;
    pattern.lastDebrisDamageBeat = -1;
    pattern.perfectSafeUntil = -Infinity;
    const currentBeat = phaseTwoDoomBeatNow();
    pattern.nextHitBeat = Math.ceil(currentBeat) + PHASE2_DOOM_APPROACH_BEATS;
    phaseTwoDoomSpawnNote(pattern, pattern.nextHitBeat, currentBeat);
    pattern.nextHitBeat += PHASE2_DOOM_NOTE_BEATS;
    hero.x = pattern.currentSquare.x;
    hero.y = pattern.currentSquare.y;
    heroMove.x = 0;
    heroMove.y = 0;
    dashPhaseTwoAvatarToBase();
    const help = overlay && overlay.querySelector('.aether-boss2d-help');
    if (help && help.firstChild) help.firstChild.nodeValue = 'CLICK THE CLOSING SQUARES';
  }

  function startPhaseTwoDoomPattern() {
    if (!phase2CombatStarted || !canvas || phase2DoomPattern) return false;
    phase2SquareArenaLocked = true;
    phase2GridSpecial = null;
    phase2TileRuinPattern = null;
    phase2SwordRingPattern = null;
    phase2PitfallPattern = null;
    phase2Attacks = [];
    phase2Cracks = [];
    phase2ClawPatternStopped = true;
    phase2BurstActive = false;
    nextPhase2AttackBeat = Infinity;
    keys.clear();
    phase2DoomPattern = {
      mode: 'reshape',
      elapsed: 0,
      notes: [],
      slashes: [],
      judgments: [],
      hop: null,
      nextId: 1,
      spawnedNotes: 0,
      resolvedNotes: 0,
      endingRequested: false,
      random: mulberry32(0xd0012026),
      debrisSquare: null,
      lastDebrisDamageBeat: -1,
      perfectSafeUntil: -Infinity,
    };
    return true;
  }

  function updatePhaseTwoDoomPattern(dt) {
    const pattern = phase2DoomPattern;
    if (!pattern) return;
    pattern.elapsed += dt;
    if (pattern.mode === 'reshape') {
      const progress = clamp01(pattern.elapsed / PHASE2_DOOM_RESHAPE_MS);
      updatePhaseTwoLayout(progress);
      if (progress >= 1) activatePhaseTwoDoomPattern(pattern);
      return;
    }

    if (pattern.mode === 'ending-center') {
      const progress = clamp01(pattern.elapsed / PHASE2_DOOM_END_CENTER_MS);
      const travel = smoothstep(progress);
      pattern.currentSquare.x = pattern.centerFromX +
        (pattern.centerTargetX - pattern.centerFromX) * travel;
      pattern.currentSquare.y = pattern.centerFromY +
        (pattern.centerTargetY - pattern.centerFromY) * travel;
      hero.x = pattern.heroCenterFromX + (pattern.centerTargetX - pattern.heroCenterFromX) * travel;
      hero.y = pattern.heroCenterFromY + (pattern.centerTargetY - pattern.heroCenterFromY) * travel -
        Math.sin(progress * Math.PI) * 10;
      heroSquash = Math.sin(progress * Math.PI) * 0.08;
      if (progress >= 1) {
        hero.x = pattern.centerTargetX;
        hero.y = pattern.centerTargetY;
        heroSquash = 0;
        beginPhaseTwoDoomEndSlam(pattern);
      }
      return;
    }
    if (pattern.mode === 'ending-slam') return;
    if (pattern.mode === 'ending-expand') {
      const progress = clamp01(pattern.elapsed / PHASE2_DOOM_END_EXPAND_MS);
      const growth = shockwaveArenaProgress(progress);
      pattern.squareSize = pattern.endSquareStartSize +
        (pattern.endSquareTargetSize - pattern.endSquareStartSize) * growth;
      hero.x = BOARD / 2;
      hero.y = BOARD / 2;
      if (progress >= 1) finishPhaseTwoDoomEnding(pattern);
      return;
    }
    if (pattern.mode !== 'active') return;

    if (pattern.hop) {
      const hop = pattern.hop;
      hop.elapsed += dt;
      const progress = clamp01(hop.elapsed / hop.duration);
      const travel = smoothstep(progress);
      hero.x = hop.fromX + (hop.toX - hop.fromX) * travel;
      hero.y = hop.fromY + (hop.toY - hop.fromY) * travel - Math.sin(progress * Math.PI) * 13;
      heroSquash = Math.sin(progress * Math.PI) * 0.12;
      if (progress >= 1) {
        hero.x = hop.toX;
        hero.y = hop.toY;
        heroSquash = 0;
        if (hop.clearsDebris) pattern.debrisSquare = null;
        pattern.hop = null;
      }
    }
    if (pattern.debrisSquare && pattern.lastDebrisDamageBeat !== beatIndex) {
      const half = phaseTwoDoomNoteSize(pattern) / 2;
      const onDebris = Math.abs(hero.x - pattern.debrisSquare.x) <= half &&
        Math.abs(hero.y - pattern.debrisSquare.y) <= half;
      if (onDebris && pattern.elapsed >= pattern.perfectSafeUntil) {
        pattern.lastDebrisDamageBeat = beatIndex;
        damagePlayer(PHASE2_DOOM_DEBRIS_DAMAGE);
        playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
        if (hp <= 0) die();
      }
    }
    for (const note of pattern.notes) {
      note.shakeAge = Math.max(0, note.shakeAge - dt);
      if (!note.judged && (phaseTwoDoomBeatNow() - note.hitBeat) * beatMs > PHASE2_DOOM_OK_MS) {
        phaseTwoDoomPunish(pattern, note, 'MISS');
      }
    }
    for (const slash of pattern.slashes) {
      slash.age += dt;
      if (slash.age >= 0 && !slash.soundPlayed) {
        slash.soundPlayed = true;
        playBossSfx('phase2ClawCut');
      }
    }
    for (const judgment of pattern.judgments) judgment.age += dt;
    pattern.notes = pattern.notes.filter((note) => !note.judged);
    pattern.slashes = pattern.slashes.filter((slash) => slash.age < slash.duration);
    pattern.judgments = pattern.judgments.filter((judgment) => judgment.age < judgment.duration);

    if (pattern.endingRequested && !pattern.hop && pattern.slashes.length === 0) {
      beginPhaseTwoDoomEnding(pattern);
      return;
    }

    const currentBeat = phaseTwoDoomBeatNow();
    while (pattern.spawnedNotes < PHASE2_DOOM_NOTE_LIMIT &&
           currentBeat >= pattern.nextHitBeat - PHASE2_DOOM_APPROACH_BEATS) {
      phaseTwoDoomSpawnNote(
        pattern,
        pattern.nextHitBeat,
        pattern.nextHitBeat - PHASE2_DOOM_APPROACH_BEATS
      );
      pattern.nextHitBeat += PHASE2_DOOM_NOTE_BEATS;
    }
  }

  function beginPhaseTwoMayhemUnderPattern(pattern, forcedType) {
    const choices = PHASE2_MAYHEM_UNDER_PATTERNS.filter((type) =>
      PHASE2_MAYHEM_UNDER_PATTERNS.length === 1 || type !== pattern.lastType);
    const type = forcedType || choices[Math.floor(pattern.random() * choices.length)];
    pattern.lastType = type;
    if (type === 'spearRain') {
      pattern.underPattern = {
        type,
        elapsed: 0,
        elapsedBeats: 0,
        waveSize: 1,
        wavePending: true,
        nextWaveBeat: 0.6,
        nextShotAt: Infinity,
        shotsRemaining: 0,
        activeWaveSize: 0,
        waveShotIndex: 0,
        arrows: [],
        nextArrowId: 1,
      };
      playBossSfx('phase2SwordRing');
      return;
    }
    if (type === 'columnSurge') {
      pattern.underPattern = {
        type,
        elapsed: 0,
        elapsedBeats: 0,
        mode: 'forward',
        transitionBeats: 0,
        nextWaveBeat: PHASE2_MAYHEM_COLUMN_LEAD_BEATS,
        wavesSpawned: 0,
        forwardWavesSpawned: 0,
        reverseWavesSpawned: 0,
        reverseRampBeats: 0,
        reversalAtBeat: Infinity,
        nextAttackId: 1,
        attacks: [],
      };
      playBossSfx('phase2TileCharge');
      return;
    }
    if (type === 'giantTriangles') {
      pattern.underPattern = {
        type,
        elapsed: 0,
        elapsedBeats: 0,
        mode: 'single',
        singlesCompleted: 0,
        sequenceSize: 2,
        sequence: [],
        sequenceIndex: 0,
        waitBeats: 0.65,
        lastTriangleSide: null,
        repeatStreak: 0,
        nextAttackId: 1,
        attacks: [],
      };
      playBossSfx('phase2TileCharge');
      return;
    }
    if (type === 'audioWaveform') {
      pattern.underPattern = {
        type,
        elapsed: 0,
        elapsedBeats: 0,
        elapsedMs: 0,
        previewSamples: Array(PHASE2_MAYHEM_WAVEFORM_POINTS).fill(0),
        liveSamples: Array(PHASE2_MAYHEM_WAVEFORM_POINTS).fill(0),
        sampleHistory: [],
        liveReady: false,
        pulses: [],
        observedBeat: beatIndex,
        beatPeak: 0,
        peakCeiling: 0.08,
      };
      playBossSfx('phase2Whirlpool');
      return;
    }
    pattern.underPattern = {
      type,
      elapsed: 0,
      seed: pattern.random() * Math.PI * 2,
      firstSoundPlayed: false,
      secondSoundPlayed: false,
      orbitSoundPlayed: false,
      orbitAngle: 0,
      fadeAge: -1,
      fans: Array.from({ length: 4 }, (_, index) => ({
        angle: pattern.random() * Math.PI * 2,
        radiansPerBeat: 0.34 + index * 0.0225 + pattern.random() * 0.010,
      })),
    };
    playBossSfx('phase2TileCharge');
  }

  function phaseTwoMayhemSpearBounds() {
    const inset = BORDER + PAD;
    return {
      left: inset,
      top: inset,
      right: canvas.width - inset,
      bottom: canvas.height - inset,
    };
  }

  function phaseTwoMayhemSpearSource() {
    const bounds = phaseTwoMayhemSpearBounds();
    const board = getBoardRect();
    const avatar = phase2Avatar && phase2Avatar.state && phase2Avatar.state.avatar;
    if (!board || !board.width || !board.height || !avatar) {
      return { x: canvas.width / 2, y: bounds.top };
    }
    return {
      x: Math.max(bounds.left, Math.min(
        bounds.right,
        (avatar.x - board.left) * canvas.width / board.width
      )),
      y: Math.max(bounds.top, Math.min(
        bounds.bottom,
        (avatar.y + avatar.size * 0.08 - board.top) * canvas.height / board.height
      )),
    };
  }

  function phaseTwoMayhemAppendSpearTrail(arrow, x, y) {
    const previous = arrow.trail[arrow.trail.length - 1];
    if (previous) arrow.trailLength += Math.hypot(x - previous.x, y - previous.y);
    arrow.trail.push({ x, y });
    while (arrow.trailLength > PHASE2_MAYHEM_SPEAR_TRAIL_LENGTH && arrow.trail.length > 1) {
      const first = arrow.trail[0];
      const second = arrow.trail[1];
      const segmentLength = Math.hypot(second.x - first.x, second.y - first.y);
      const excess = arrow.trailLength - PHASE2_MAYHEM_SPEAR_TRAIL_LENGTH;
      if (segmentLength <= excess + 0.001) {
        arrow.trail.shift();
        arrow.trailLength -= segmentLength;
      } else {
        const trim = excess / Math.max(0.001, segmentLength);
        first.x += (second.x - first.x) * trim;
        first.y += (second.y - first.y) * trim;
        arrow.trailLength -= excess;
      }
    }
  }

  function spawnPhaseTwoMayhemSpear(under) {
    const source = phaseTwoMayhemSpearSource();
    const target = heroBodyCenterWorld();
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const shotIndex = under.waveShotIndex++;
    const waveSize = Math.max(1, under.activeWaveSize || 1);
    const centeredSlot = shotIndex - (waveSize - 1) / 2;
    const variation = Math.sin((under.nextArrowId + waveSize * 7) * 12.9898) * 0.025;
    const angle = Math.atan2(dy, dx) +
      centeredSlot * PHASE2_MAYHEM_SPEAR_SPREAD_RADIANS + variation;
    under.arrows.push({
      id: under.nextArrowId++,
      x: source.x,
      y: source.y,
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      bounces: 0,
      age: 0,
      dead: false,
      fadeAge: 0,
      trail: [{ x: source.x, y: source.y }],
      trailLength: 0,
    });
    playBossSfx('phase2SwordStrike');
  }

  function phaseTwoMayhemSpearHitsHero(x1, y1, x2, y2) {
    const center = heroBodyCenterWorld();
    const padding = 4.5;
    return segmentIntersectsRect(x1, y1, x2, y2, {
      left: center.x - 2.5 - padding,
      right: center.x + 2.5 + padding,
      top: center.y - 2.5 - padding,
      bottom: center.y + 2.5 + padding,
    });
  }

  function resolvePhaseTwoMayhemSpearHit(arrow) {
    if (arrow.dead) return;
    arrow.dead = true;
    arrow.fadeAge = 0;
    damagePlayer(PHASE2_MAYHEM_SPEAR_DAMAGE * (bpm / PHASE2_BPM_MIN));
    playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
    if (hp <= 0) die();
  }

  function updatePhaseTwoMayhemSpear(arrow, dt) {
    arrow.age += dt;
    if (arrow.dead) {
      arrow.fadeAge += dt;
      return;
    }
    const bounds = phaseTwoMayhemSpearBounds();
    let remaining = PHASE2_MAYHEM_SPEAR_SPEED_PER_BEAT * dt / Math.max(1, beatMs);
    let safety = 0;
    while (remaining > 0.001 && !arrow.dead && safety++ < 8) {
      const tx = arrow.dx > 0.000001
        ? (bounds.right - arrow.x) / arrow.dx
        : arrow.dx < -0.000001 ? (bounds.left - arrow.x) / arrow.dx : Infinity;
      const ty = arrow.dy > 0.000001
        ? (bounds.bottom - arrow.y) / arrow.dy
        : arrow.dy < -0.000001 ? (bounds.top - arrow.y) / arrow.dy : Infinity;
      const wallDistance = Math.max(0, Math.min(tx, ty));
      const travel = Math.min(remaining, wallDistance);
      const fromX = arrow.x;
      const fromY = arrow.y;
      arrow.x += arrow.dx * travel;
      arrow.y += arrow.dy * travel;
      phaseTwoMayhemAppendSpearTrail(arrow, arrow.x, arrow.y);
      if (phaseTwoMayhemSpearHitsHero(fromX, fromY, arrow.x, arrow.y)) {
        resolvePhaseTwoMayhemSpearHit(arrow);
        break;
      }
      remaining -= travel;
      if (travel + 0.001 < wallDistance || remaining <= 0.001) break;
      if (arrow.bounces >= PHASE2_MAYHEM_SPEAR_MAX_BOUNCES) {
        arrow.dead = true;
        arrow.fadeAge = 0;
        break;
      }
      const hitX = Math.abs(tx - wallDistance) < 0.01;
      const hitY = Math.abs(ty - wallDistance) < 0.01;
      if (hitX) arrow.dx *= -1;
      if (hitY) arrow.dy *= -1;
      arrow.bounces++;
      arrow.x = Math.max(bounds.left, Math.min(bounds.right, arrow.x + arrow.dx * 0.01));
      arrow.y = Math.max(bounds.top, Math.min(bounds.bottom, arrow.y + arrow.dy * 0.01));
      playBossSfx('phase2ClawCut');
    }
  }

  function phaseTwoMayhemSpearRainContact(under) {
    const bodyCenter = heroBodyCenterWorld();
    const damageRect = {
      left: bodyCenter.x - 2.5,
      right: bodyCenter.x + 2.5,
      top: bodyCenter.y - 2.5,
      bottom: bodyCenter.y + 2.5,
    };
    const rewardPoints = heroBodyWorldRewardPoints();
    let trailHits = 0;
    let arrowShadow = false;
    for (const arrow of under.arrows) {
      let trailHit = false;
      for (let index = 1; index < arrow.trail.length; index++) {
        const previous = arrow.trail[index - 1];
        const point = arrow.trail[index];
        if (segmentRectDistance(
          previous.x,
          previous.y,
          point.x,
          point.y,
          damageRect
        ) <= PHASE2_MAYHEM_SPEAR_TRAIL_HALF_WIDTH) {
          trailHit = true;
          break;
        }
      }
      if (trailHit) trailHits++;
      if (arrow.dead || arrowShadow) continue;
      arrowShadow = rewardPoints.some((point) => {
        const offsetX = point.x - arrow.x;
        const offsetY = point.y - arrow.y;
        const localX = offsetX * arrow.dx + offsetY * arrow.dy;
        const localY = -offsetX * arrow.dy + offsetY * arrow.dx;
        return pointInPoly(localX, localY, PHASE2_MAYHEM_SPEAR_SHADOW_POLYGON) &&
          distToSeg(localX, localY, -27, 0, 14, 0) > PHASE2_MAYHEM_SPEAR_BODY_RADIUS;
      });
    }
    return { trailHits, arrowShadow };
  }

  function updatePhaseTwoMayhemSpearRain(pattern, under, dt, beatStep) {
    under.elapsedBeats += beatStep;
    for (const arrow of under.arrows) updatePhaseTwoMayhemSpear(arrow, dt);
    under.arrows = under.arrows.filter((arrow) => !arrow.dead || arrow.fadeAge < 620);

    if (!under.wavePending && under.shotsRemaining === 0 && under.arrows.length === 0) {
      if (under.waveSize >= 8) {
        beginPhaseTwoMayhemUnderPattern(pattern, 'columnSurge');
        return;
      }
      under.waveSize = Math.min(8, under.waveSize + 1);
      under.wavePending = true;
      under.nextWaveBeat = under.elapsedBeats + PHASE2_MAYHEM_SPEAR_WAVE_REST_BEATS;
    }
    if (under.wavePending && under.elapsedBeats >= under.nextWaveBeat) {
      under.wavePending = false;
      under.shotsRemaining = under.waveSize;
      under.activeWaveSize = under.waveSize;
      under.waveShotIndex = 0;
      under.nextShotAt = under.elapsed;
    }
    while (under.shotsRemaining > 0 && under.elapsed >= under.nextShotAt) {
      spawnPhaseTwoMayhemSpear(under);
      under.shotsRemaining--;
      if (under.shotsRemaining > 0) {
        under.nextShotAt += PHASE2_MAYHEM_SPEAR_SHOT_GAP_MS;
      } else {
        under.nextShotAt = Infinity;
      }
    }
    const contact = phaseTwoMayhemSpearRainContact(under);
    if (contact.trailHits > 0) {
      damagePlayer(DAMAGE_PER_BEAT * contact.trailHits * beatStep);
      const damageStep = Math.floor(
        (beatIndex + beatPhase / Math.max(1, beatMs)) * BOSS_SFX_DAMAGE_STEPS_PER_BEAT
      );
      if (damageStep !== pattern.lastDamageStep) {
        pattern.lastDamageStep = damageStep;
        playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
      }
      if (hp <= 0) die();
    } else {
      pattern.lastDamageStep = -1;
      if (contact.arrowShadow) addVp(VP_PER_BEAT * beatStep, true);
    }
  }

  function spawnPhaseTwoMayhemColumnWave(under, launchBeat) {
    const bounds = phaseTwoMayhemSpearBounds();
    const laneWidth = (bounds.right - bounds.left) / 3;
    const margin = PHASE2_MAYHEM_COLUMN_CHEVRON_HEIGHT +
      PHASE2_MAYHEM_COLUMN_CHEVRON_HALF_WIDTH * 2;
    const waveIndex = under.wavesSpawned;
    const reversed = under.mode === 'reverse';
    for (let lane = 0; lane < 3; lane++) {
      const direction = (lane === 1 ? 1 : -1) * (reversed ? -1 : 1);
      const laneLaunchBeat = launchBeat +
        (lane === 1 ? PHASE2_MAYHEM_COLUMN_WAVE_BEATS * 0.5 : 0);
      under.attacks.push({
        id: under.nextAttackId++,
        lane,
        left: bounds.left + laneWidth * lane - (lane > 0 ? 2 : 0),
        right: bounds.left + laneWidth * (lane + 1) + (lane < 2 ? 2 : 0),
        direction,
        startY: direction > 0 ? bounds.top - margin : bounds.bottom + margin,
        y: direction > 0 ? bounds.top - margin : bounds.bottom + margin,
        launchBeat: laneLaunchBeat,
        active: false,
        rotation: 0,
        seed: 8.41 + waveIndex * 17.13 + lane * 29.71,
      });
    }
    under.wavesSpawned++;
    if (reversed) under.reverseWavesSpawned++;
    else under.forwardWavesSpawned++;
    playBossSfx('phase2SwordStrike');
  }

  function phaseTwoMayhemPolygonHitsHero(polygon) {
    const center = heroBodyCenterWorld();
    const rect = {
      left: center.x - 2.5,
      top: center.y - 2.5,
      right: center.x + 2.5,
      bottom: center.y + 2.5,
    };
    const heroPoints = [
      { x: center.x, y: center.y },
      { x: rect.left, y: rect.top },
      { x: rect.right, y: rect.top },
      { x: rect.right, y: rect.bottom },
      { x: rect.left, y: rect.bottom },
    ];
    if (heroPoints.some((point) => pointInPoly(point.x, point.y, polygon))) return true;
    if (polygon.some((point) => point.x >= rect.left && point.x <= rect.right &&
      point.y >= rect.top && point.y <= rect.bottom)) return true;
    for (let index = 0; index < polygon.length; index++) {
      const next = polygon[(index + 1) % polygon.length];
      if (segmentIntersectsRect(
        polygon[index].x,
        polygon[index].y,
        next.x,
        next.y,
        rect
      )) return true;
    }
    return false;
  }

  function updatePhaseTwoMayhemColumnSurge(pattern, under, beatStep) {
    under.elapsedBeats += beatStep;
    if (under.mode === 'forward') {
      while (under.forwardWavesSpawned < PHASE2_MAYHEM_COLUMN_HALF_WAVES &&
             under.elapsedBeats >= under.nextWaveBeat) {
        const launchBeat = under.nextWaveBeat;
        spawnPhaseTwoMayhemColumnWave(under, launchBeat);
        under.nextWaveBeat += PHASE2_MAYHEM_COLUMN_WAVE_BEATS;
        if (under.forwardWavesSpawned >= PHASE2_MAYHEM_COLUMN_HALF_WAVES) {
          under.reversalAtBeat = launchBeat + PHASE2_MAYHEM_COLUMN_WAVE_BEATS * 2.05;
        }
      }
      if (under.elapsedBeats >= under.reversalAtBeat) {
        under.mode = 'braking';
        under.transitionBeats = 0;
        playBossSfx('phase2TileCharge');
      }
    } else if (under.mode === 'reverse') {
      while (under.reverseWavesSpawned < PHASE2_MAYHEM_COLUMN_HALF_WAVES &&
             under.elapsedBeats >= under.nextWaveBeat) {
        spawnPhaseTwoMayhemColumnWave(under, under.nextWaveBeat);
        under.nextWaveBeat += PHASE2_MAYHEM_COLUMN_WAVE_BEATS;
      }
    }

    let motionScale = 1;
    if (under.mode === 'braking') {
      under.transitionBeats += beatStep;
      motionScale = 1 - smoothstep(clamp01(
        under.transitionBeats / PHASE2_MAYHEM_COLUMN_BRAKE_BEATS
      ));
      if (under.transitionBeats >= PHASE2_MAYHEM_COLUMN_BRAKE_BEATS) {
        under.mode = 'rotating';
        under.transitionBeats = 0;
        motionScale = 0;
        playBossSfx('phase2SwordRing');
      }
    } else if (under.mode === 'rotating') {
      under.transitionBeats += beatStep;
      motionScale = 0;
      const rotation = Math.PI * smoothstep(clamp01(
        under.transitionBeats / PHASE2_MAYHEM_COLUMN_ROTATE_BEATS
      ));
      for (const attack of under.attacks) attack.rotation = rotation;
      if (under.transitionBeats >= PHASE2_MAYHEM_COLUMN_ROTATE_BEATS) {
        for (const attack of under.attacks) {
          attack.direction *= -1;
          attack.rotation = 0;
        }
        under.mode = 'reverse';
        under.transitionBeats = 0;
        under.reverseRampBeats = 0;
        under.nextWaveBeat = under.elapsedBeats + PHASE2_MAYHEM_COLUMN_WAVE_BEATS;
        playBossSfx('phase2SwordStrike');
      }
    } else if (under.mode === 'reverse') {
      under.reverseRampBeats += beatStep;
      motionScale = smoothstep(clamp01(
        under.reverseRampBeats / PHASE2_MAYHEM_COLUMN_RESTART_BEATS
      ));
    }

    const bounds = phaseTwoMayhemSpearBounds();
    const margin = PHASE2_MAYHEM_COLUMN_CHEVRON_HEIGHT +
      PHASE2_MAYHEM_COLUMN_CHEVRON_HALF_WIDTH * 2;
    for (const attack of under.attacks) {
      let movementBeats = beatStep;
      if (!attack.active && under.elapsedBeats >= attack.launchBeat) {
        attack.active = true;
        movementBeats = Math.min(beatStep, under.elapsedBeats - attack.launchBeat);
      }
      if (!attack.active) continue;
      attack.y += attack.direction * PHASE2_MAYHEM_COLUMN_SPEED_PER_BEAT *
        movementBeats * motionScale;
    }
    if (under.mode !== 'braking' && under.mode !== 'rotating') {
      under.attacks = under.attacks.filter((attack) => !attack.active ||
        (attack.direction > 0
          ? attack.y < bounds.bottom + margin
          : attack.y > bounds.top - margin));
    }

    if (under.reverseWavesSpawned >= PHASE2_MAYHEM_COLUMN_HALF_WAVES &&
        under.attacks.length === 0) {
      beginPhaseTwoMayhemUnderPattern(pattern, 'giantTriangles');
      return;
    }

    const rewardPoints = heroBodyWorldRewardPoints();
    let hit = false;
    let shadow = false;
    for (const attack of under.attacks) {
      if (!attack.active) continue;
      const livePolygon = phaseTwoMayhemColumnChevronPolygon(attack);
      if (phaseTwoMayhemPolygonHitsHero(livePolygon)) {
        hit = true;
        break;
      }
      if (shadow) continue;
      const shadowPolygon = phaseTwoMayhemColumnChevronPolygon(attack, true);
      shadow = rewardPoints.some((point) =>
        pointInPoly(point.x, point.y, shadowPolygon) &&
        !pointInPoly(point.x, point.y, livePolygon));
    }
    if (hit) {
      damagePlayer(DAMAGE_PER_BEAT * beatStep);
      const damageStep = Math.floor(
        (beatIndex + beatPhase / Math.max(1, beatMs)) * BOSS_SFX_DAMAGE_STEPS_PER_BEAT
      );
      if (damageStep !== pattern.lastDamageStep) {
        pattern.lastDamageStep = damageStep;
        playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
      }
      if (hp <= 0) die();
    } else {
      pattern.lastDamageStep = -1;
      if (shadow) addVp(VP_PER_BEAT * beatStep, true);
    }
  }

  function phaseTwoMayhemRandomTriangleSide(pattern, under) {
    const sides = ['top', 'right', 'bottom', 'left'];
    if (!under.lastTriangleSide) {
      const first = sides[Math.floor(pattern.random() * sides.length)];
      under.lastTriangleSide = first;
      under.repeatStreak = 1;
      return first;
    }

    const previousIndex = sides.indexOf(under.lastTriangleSide);
    const roll = pattern.random();
    let next;
    if (under.repeatStreak < 2 && roll < 0.25) {
      next = under.lastTriangleSide;
    } else {
      const neighborThreshold = under.repeatStreak < 2 ? 0.75 : 2 / 3;
      if (roll < neighborThreshold) {
        const offset = pattern.random() < 0.5 ? -1 : 1;
        next = sides[(previousIndex + offset + sides.length) % sides.length];
      } else {
        next = sides[(previousIndex + 2) % sides.length];
      }
    }
    if (next === under.lastTriangleSide) under.repeatStreak++;
    else under.repeatStreak = 1;
    under.lastTriangleSide = next;
    return next;
  }

  function beginPhaseTwoMayhemTriangleAttack(pattern, under, side, phase, seed) {
    under.attacks = [{
      id: under.nextAttackId++,
      side,
      phase,
      phaseAge: 0,
      seed: Number.isFinite(seed) ? seed : pattern.random() * 1000,
    }];
    playBossSfx(phase === 'telegraph' ? 'phase2TileCharge' : 'phase2ClawCut');
  }

  function preparePhaseTwoMayhemTriangleSequence(pattern, under) {
    under.sequence = Array.from({ length: under.sequenceSize }, () => ({
      side: phaseTwoMayhemRandomTriangleSide(pattern, under),
      seed: pattern.random() * 1000,
    }));
    under.sequenceIndex = 0;
    under.mode = 'memoryTelegraphs';
    under.waitBeats = PHASE2_MAYHEM_TRIANGLE_MEMORY_GAP_BEATS;
  }

  function phaseTwoMayhemTriangleOutlineTouchesHero(polygon) {
    const rewardPoints = heroBodyWorldRewardPoints();
    return rewardPoints.some((point) => {
      for (let index = 0; index < polygon.length; index++) {
        const next = polygon[(index + 1) % polygon.length];
        if (distToSeg(
          point.x,
          point.y,
          polygon[index].x,
          polygon[index].y,
          next.x,
          next.y
        ) <= PHASE2_MAYHEM_TRIANGLE_VP_EDGE_WIDTH) return true;
      }
      return false;
    });
  }

  function updatePhaseTwoMayhemGiantTriangles(pattern, under, beatStep) {
    under.elapsedBeats += beatStep;
    under.waitBeats = Math.max(0, under.waitBeats - beatStep);
    const attack = under.attacks[0];
    if (attack) {
      attack.phaseAge += beatStep;
      if (attack.phase === 'telegraph' &&
          attack.phaseAge >= PHASE2_MAYHEM_TRIANGLE_TELEGRAPH_BEATS) {
        if (under.mode === 'single') {
          attack.phase = 'strike';
          attack.phaseAge = 0;
          playBossSfx('phase2ClawCut');
        } else {
          under.attacks = [];
          under.sequenceIndex++;
          if (under.sequenceIndex >= under.sequence.length) {
            under.mode = 'memoryImpacts';
            under.sequenceIndex = 0;
            under.waitBeats = PHASE2_MAYHEM_TRIANGLE_MEMORY_GAP_BEATS;
          } else {
            under.waitBeats = PHASE2_MAYHEM_TRIANGLE_GAP_BEATS;
          }
        }
      } else if (attack.phase === 'strike' &&
                 attack.phaseAge >= PHASE2_MAYHEM_TRIANGLE_STRIKE_BEATS +
                   PHASE2_MAYHEM_TRIANGLE_FADE_BEATS) {
        under.attacks = [];
        if (under.mode === 'single') {
          under.singlesCompleted++;
          if (under.singlesCompleted >= PHASE2_MAYHEM_TRIANGLE_SINGLE_COUNT) {
            preparePhaseTwoMayhemTriangleSequence(pattern, under);
          } else {
            under.waitBeats = PHASE2_MAYHEM_TRIANGLE_GAP_BEATS;
          }
        } else if (under.mode === 'memoryImpacts') {
          under.sequenceIndex++;
          if (under.sequenceIndex >= under.sequence.length) {
            if (under.sequenceSize >= PHASE2_MAYHEM_TRIANGLE_MAX_SEQUENCE) {
              under.mode = 'complete';
              under.waitBeats = PHASE2_MAYHEM_TRIANGLE_MEMORY_GAP_BEATS;
            } else {
              under.sequenceSize++;
              preparePhaseTwoMayhemTriangleSequence(pattern, under);
            }
          } else {
            under.waitBeats = PHASE2_MAYHEM_TRIANGLE_IMPACT_GRACE_BEATS;
          }
        }
      }
    }

    if (under.attacks.length === 0 && under.waitBeats <= 0) {
      if (under.mode === 'single') {
        beginPhaseTwoMayhemTriangleAttack(
          pattern,
          under,
          phaseTwoMayhemRandomTriangleSide(pattern, under),
          'telegraph'
        );
      } else if (under.mode === 'memoryTelegraphs') {
        beginPhaseTwoMayhemTriangleAttack(
          pattern,
          under,
          under.sequence[under.sequenceIndex].side,
          'telegraph',
          under.sequence[under.sequenceIndex].seed
        );
      } else if (under.mode === 'memoryImpacts') {
        beginPhaseTwoMayhemTriangleAttack(
          pattern,
          under,
          under.sequence[under.sequenceIndex].side,
          'strike',
          under.sequence[under.sequenceIndex].seed
        );
      } else if (under.mode === 'complete') {
        beginPhaseTwoMayhemUnderPattern(pattern, 'audioWaveform');
        return;
      }
    }

    const current = under.attacks[0];
    const polygon = current ? phaseTwoMayhemTrianglePolygon(current) : null;
    const hit = current && current.phase === 'strike' &&
      current.phaseAge < PHASE2_MAYHEM_TRIANGLE_STRIKE_BEATS &&
      phaseTwoMayhemPolygonHitsHero(polygon);
    const shadow = current && current.phase === 'telegraph' &&
      phaseTwoMayhemTriangleOutlineTouchesHero(polygon);
    if (hit) {
      damagePlayer(DAMAGE_PER_BEAT * beatStep);
      const damageStep = Math.floor(
        (beatIndex + beatPhase / Math.max(1, beatMs)) * BOSS_SFX_DAMAGE_STEPS_PER_BEAT
      );
      if (damageStep !== pattern.lastDamageStep) {
        pattern.lastDamageStep = damageStep;
        playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
      }
      if (hp <= 0) die();
    } else {
      pattern.lastDamageStep = -1;
      if (shadow) addVp(VP_PER_BEAT * beatStep, true);
    }
  }

  function phaseTwoMayhemAudioLevel(under) {
    const music = createBossMusic();
    let level = 0;
    if (music && music.analyser && music.context.state === 'running') {
      music.analyser.getByteTimeDomainData(music.analyserTimeData);
      const source = music.analyserTimeData;
      let energy = 0;
      for (let index = 0; index < source.length; index++) {
        const sample = (source[index] - 128) / 128;
        energy += sample * sample;
      }
      level = Math.sqrt(energy / Math.max(1, source.length));
    }
    if (level < 0.004) {
      const beatProgress = clamp01(beatPhase / Math.max(1, beatMs));
      level = 0.025 + Math.pow(1 - beatProgress, 7) * 0.32;
    }
    return level;
  }

  function sendPhaseTwoMayhemAudioPeak(under, peak) {
    under.peakCeiling = Math.max(peak, under.peakCeiling * 0.92, 0.025);
    const amplitude = Math.max(0.18, Math.min(0.98, peak / under.peakCeiling * 0.96));
    under.pulses.push({
      position: 0,
      amplitude,
      polarity: under.observedBeat % 2 === 0 ? 1 : -1,
    });
  }

  function updatePhaseTwoMayhemWaveTimeline(under, beatStep) {
    const level = phaseTwoMayhemAudioLevel(under);
    under.beatPeak = Math.max(under.beatPeak, level);
    if (beatIndex !== under.observedBeat) {
      sendPhaseTwoMayhemAudioPeak(under, under.beatPeak);
      under.observedBeat = beatIndex;
      under.beatPeak = level;
    }

    for (const pulse of under.pulses) {
      pulse.position += beatStep / PHASE2_MAYHEM_WAVEFORM_FLOW_BEATS;
    }
    under.pulses = under.pulses.filter((pulse) =>
      pulse.position < 1 + PHASE2_MAYHEM_WAVEFORM_PULSE_WIDTH);

    under.previewSamples.fill(0);
    for (let index = 0; index < under.previewSamples.length; index++) {
      const timeline = index / (under.previewSamples.length - 1);
      let value = 0;
      for (const pulse of under.pulses) {
        const distance = (timeline - pulse.position) / PHASE2_MAYHEM_WAVEFORM_PULSE_WIDTH;
        if (Math.abs(distance) >= 1) continue;
        const envelope = Math.pow(1 - Math.abs(distance), 1.55);
        const ripple = Math.cos(distance * Math.PI * 2.25);
        value += pulse.polarity * pulse.amplitude * envelope * ripple;
      }
      under.previewSamples[index] = Math.max(-0.98, Math.min(0.98, value));
    }
  }

  function updatePhaseTwoMayhemAudioWaveform(pattern, under, dt, beatStep) {
    under.elapsedBeats += beatStep;
    under.elapsedMs += dt;
    updatePhaseTwoMayhemWaveTimeline(under, beatStep);
    under.sampleHistory.push({
      at: under.elapsedMs,
      samples: under.previewSamples.slice(),
    });

    const delayedAt = under.elapsedMs - PHASE2_MAYHEM_WAVEFORM_PREVIEW_MS;
    while (under.sampleHistory.length > 1 && under.sampleHistory[1].at <= delayedAt) {
      under.sampleHistory.shift();
    }
    if (under.sampleHistory.length && under.sampleHistory[0].at <= delayedAt) {
      under.liveSamples = under.sampleHistory[0].samples.slice();
      under.liveReady = true;
    }

    if (under.elapsedBeats >= PHASE2_MAYHEM_WAVEFORM_DURATION_BEATS) {
      beginPhaseTwoMayhemUnderPattern(pattern);
      return;
    }

    const scrollOffsets = phaseTwoMayhemWaveformScrollOffsets(under);
    const livePolygons = under.liveReady
      ? phaseTwoMayhemWaveformBarPolygons(
        under.liveSamples,
        PHASE2_MAYHEM_WAVEFORM_LIVE_HALF_WIDTH,
        scrollOffsets.live
      )
      : [];
    const previewPolygons = phaseTwoMayhemWaveformBarPolygons(
      under.previewSamples,
      PHASE2_MAYHEM_WAVEFORM_SHADOW_HALF_WIDTH,
      scrollOffsets.preview
    );
    const hit = livePolygons.some((polygon) => phaseTwoMayhemPolygonHitsHero(polygon));
    const rewardPoints = heroBodyWorldRewardPoints();
    const shadow = !hit && previewPolygons.some((previewPolygon) =>
      rewardPoints.some((point) =>
        pointInPoly(point.x, point.y, previewPolygon) &&
        !livePolygons.some((livePolygon) => pointInPoly(point.x, point.y, livePolygon))));
    if (hit) {
      damagePlayer(DAMAGE_PER_BEAT * beatStep);
      const damageStep = Math.floor(
        (beatIndex + beatPhase / Math.max(1, beatMs)) * BOSS_SFX_DAMAGE_STEPS_PER_BEAT
      );
      if (damageStep !== pattern.lastDamageStep) {
        pattern.lastDamageStep = damageStep;
        playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
      }
      if (hp <= 0) die();
    } else {
      pattern.lastDamageStep = -1;
      if (shadow) addVp(VP_PER_BEAT * beatStep, true);
    }
  }

  function phaseTwoMayhemBladeGrowth(under, secondPair) {
    const start = PHASE2_MAYHEM_HUB_FORM_MS +
      (secondPair ? PHASE2_MAYHEM_TWO_BLADE_MS : 0);
    return easeOutCubic(clamp01((under.elapsed - start) / PHASE2_MAYHEM_BLADE_FORM_MS));
  }

  function phaseTwoMayhemHeroContact(under) {
    const bodyCenter = heroBodyCenterWorld();
    const damagePoints = [];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        damagePoints.push({
          x: bodyCenter.x - 2.5 + column * 2.5,
          y: bodyCenter.y - 2.5 + row * 2.5,
        });
      }
    }
    const rewardPoints = heroBodyWorldRewardPoints();
    const firstGrowth = phaseTwoMayhemBladeGrowth(under, false);
    const secondGrowth = phaseTwoMayhemBladeGrowth(under, true);
    const centers = phaseTwoMayhemFanCenters(under);
    let touchesShadow = false;
    for (let index = 0; index < centers.length; index++) {
      const center = centers[index];
      const fan = under.fans[index];
      for (let bladeIndex = 0; bladeIndex < PHASE2_MAYHEM_BLADE_OFFSETS.length; bladeIndex++) {
        const growth = bladeIndex < 2 ? firstGrowth : secondGrowth;
        if (growth < 0.72) continue;
        const bladeAngle = fan.angle + PHASE2_MAYHEM_BLADE_OFFSETS[bladeIndex];
        const polygon = phaseTwoMayhemBladePolygon(
          center.x,
          center.y,
          bladeAngle,
          growth
        );
        if (damagePoints.some((point) => pointInPoly(point.x, point.y, polygon))) {
          return { blade: true, shadow: false };
        }
        const shadowPolygon = phaseTwoMayhemBladePolygon(
          center.x,
          center.y,
          bladeAngle + PHASE2_MAYHEM_SHADOW_LEAD,
          growth,
          true
        );
        if (!touchesShadow && rewardPoints.some((point) =>
          pointInPoly(point.x, point.y, shadowPolygon))) {
          touchesShadow = true;
        }
      }
    }
    return { blade: false, shadow: touchesShadow };
  }

  function updatePhaseTwoMayhemPattern(dt) {
    const pattern = phase2MayhemPattern;
    if (!pattern) return;
    if (!pattern.underPattern) beginPhaseTwoMayhemUnderPattern(pattern);
    const under = pattern.underPattern;
    under.elapsed += dt;
    const beatStep = dt / Math.max(1, beatMs);
    if (under.type === 'spearRain') {
      updatePhaseTwoMayhemSpearRain(pattern, under, dt, beatStep);
      return;
    }
    if (under.type === 'columnSurge') {
      updatePhaseTwoMayhemColumnSurge(pattern, under, beatStep);
      return;
    }
    if (under.type === 'giantTriangles') {
      updatePhaseTwoMayhemGiantTriangles(pattern, under, beatStep);
      return;
    }
    if (under.type === 'audioWaveform') {
      updatePhaseTwoMayhemAudioWaveform(pattern, under, dt, beatStep);
      return;
    }
    if (under.type !== 'quadrantFans') return;
    for (const fan of under.fans) {
      fan.angle = (fan.angle + fan.radiansPerBeat * beatStep) % (Math.PI * 2);
    }
    if (!under.firstSoundPlayed && under.elapsed >= PHASE2_MAYHEM_HUB_FORM_MS) {
      under.firstSoundPlayed = true;
      playBossSfx('phase2SwordRing');
    }
    const secondStart = PHASE2_MAYHEM_HUB_FORM_MS + PHASE2_MAYHEM_TWO_BLADE_MS;
    if (!under.secondSoundPlayed && under.elapsed >= secondStart) {
      under.secondSoundPlayed = true;
      playBossSfx('phase2SwordRing');
    }
    const orbitStart = secondStart + PHASE2_MAYHEM_FOUR_BLADE_MS;
    if (under.elapsed >= orbitStart) {
      const orbitDt = Math.min(dt, under.elapsed - orbitStart);
      under.orbitAngle -= PHASE2_MAYHEM_ORBIT_RADIANS_PER_BEAT *
        orbitDt / Math.max(1, beatMs);
      if (!under.orbitSoundPlayed) {
        under.orbitSoundPlayed = true;
        playBossSfx('phase2Whirlpool');
      }
    }
    const fadeStart = orbitStart + PHASE2_MAYHEM_FAN_ORBIT_MS;
    if (under.elapsed >= fadeStart) {
      under.fadeAge = under.elapsed - fadeStart;
      if (under.fadeAge >= PHASE2_MAYHEM_FADE_MS) {
        beginPhaseTwoMayhemUnderPattern(pattern, 'spearRain');
        return;
      }
    }
    const contact = under.type === 'quadrantFans'
      ? phaseTwoMayhemHeroContact(under)
      : { blade: false, shadow: false };
    if (under.fadeAge < 0 && contact.blade) {
      damagePlayer(DAMAGE_PER_BEAT * PHASE2_MAYHEM_BLADE_DAMAGE_SCALE * beatStep);
      const damageStep = Math.floor(
        (beatIndex + beatPhase / Math.max(1, beatMs)) * BOSS_SFX_DAMAGE_STEPS_PER_BEAT
      );
      if (damageStep !== pattern.lastDamageStep) {
        pattern.lastDamageStep = damageStep;
        playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
      }
      if (hp <= 0) die();
    } else if (under.fadeAge < 0) {
      pattern.lastDamageStep = -1;
      if (contact.shadow) addVp(VP_PER_BEAT * beatStep, true);
    } else {
      pattern.lastDamageStep = -1;
    }
  }

  function startPhaseTwoMayhemPattern(initialType = 'quadrantFans') {
    if (!phase2CombatStarted || !canvas) return false;
    restorePhaseTwoSquareArena(true);
    phase2PitfallPattern = null;
    phase2TowerPattern = null;
    phase2DoomPattern = null;
    phase2GridSpecial = null;
    phase2TileRuinPattern = null;
    phase2SwordRingPattern = null;
    phase2Attacks = [];
    phase2Cracks = [];
    phase2ClawRushMode = false;
    phase2ClawPatternStopped = true;
    phase2RushPhaseComplete = true;
    phase2BurstActive = false;
    nextPhase2AttackBeat = Infinity;
    phase2MayhemPattern = {
      random: mulberry32(0x6d617968),
      lastType: null,
      underPattern: null,
      lastDamageStep: -1,
    };
    beginPhaseTwoMayhemUnderPattern(phase2MayhemPattern, initialType);
    keys.clear();
    const help = overlay && overlay.querySelector('.aether-boss2d-help');
    if (help && help.firstChild) help.firstChild.nodeValue = 'WASD / ARROWS MOVE';
    if (phase2Avatar && typeof phase2Avatar.dashHome === 'function') {
      phase2Avatar.dashHome(getBoardRect(), PHASE2_BOSS_RETURN_DASH_MS);
    }
    return true;
  }

  function beginDebugPhaseTwoMayhem() {
    phase2MayhemDebugQueued = false;
    phase2SpearRainDebugQueued = false;
    phase2ChevronDebugQueued = false;
    phase2TrianglesDebugQueued = false;
    phase2WaveformDebugQueued = false;
    phase2MayhemPattern = null;
    return startPhaseTwoMayhemPattern('quadrantFans');
  }

  function debugPhaseTwoMayhem() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    phase2MayhemDebugQueued = true;
    if (!phase2AvatarStarted) skipPhaseTwoTransition();
    if (phase2CombatStarted && phase2MayhemDebugQueued) beginDebugPhaseTwoMayhem();
  }

  function beginDebugPhaseTwoSpearRain() {
    phase2SpearRainDebugQueued = false;
    phase2MayhemDebugQueued = false;
    phase2ChevronDebugQueued = false;
    phase2TrianglesDebugQueued = false;
    phase2WaveformDebugQueued = false;
    phase2MayhemPattern = null;
    return startPhaseTwoMayhemPattern('spearRain');
  }

  function debugPhaseTwoSpearRain() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    phase2SpearRainDebugQueued = true;
    if (!phase2AvatarStarted) skipPhaseTwoTransition();
    if (phase2CombatStarted && phase2SpearRainDebugQueued) beginDebugPhaseTwoSpearRain();
  }

  function beginDebugPhaseTwoChevron() {
    phase2ChevronDebugQueued = false;
    phase2MayhemDebugQueued = false;
    phase2SpearRainDebugQueued = false;
    phase2TrianglesDebugQueued = false;
    phase2WaveformDebugQueued = false;
    phase2MayhemPattern = null;
    return startPhaseTwoMayhemPattern('columnSurge');
  }

  function debugPhaseTwoChevron() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    phase2ChevronDebugQueued = true;
    if (!phase2AvatarStarted) skipPhaseTwoTransition();
    if (phase2CombatStarted && phase2ChevronDebugQueued) beginDebugPhaseTwoChevron();
  }

  function beginDebugPhaseTwoTriangles() {
    phase2TrianglesDebugQueued = false;
    phase2MayhemDebugQueued = false;
    phase2SpearRainDebugQueued = false;
    phase2ChevronDebugQueued = false;
    phase2WaveformDebugQueued = false;
    phase2MayhemPattern = null;
    return startPhaseTwoMayhemPattern('giantTriangles');
  }

  function debugPhaseTwoTriangles() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    phase2TrianglesDebugQueued = true;
    if (!phase2AvatarStarted) skipPhaseTwoTransition();
    if (phase2CombatStarted && phase2TrianglesDebugQueued) beginDebugPhaseTwoTriangles();
  }

  function beginDebugPhaseTwoWaveform() {
    phase2WaveformDebugQueued = false;
    phase2MayhemDebugQueued = false;
    phase2SpearRainDebugQueued = false;
    phase2ChevronDebugQueued = false;
    phase2TrianglesDebugQueued = false;
    phase2MayhemPattern = null;
    return startPhaseTwoMayhemPattern('audioWaveform');
  }

  function debugPhaseTwoWaveform() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    phase2WaveformDebugQueued = true;
    if (!phase2AvatarStarted) skipPhaseTwoTransition();
    if (phase2CombatStarted && phase2WaveformDebugQueued) beginDebugPhaseTwoWaveform();
  }

  function spawnPhaseTwoRushEye() {
    if (!phase2ClawRushMode || phase2RushEyesSpawned >= PHASE2_RUSH_EYE_COUNT) return false;
    const slot = PHASE2_RUSH_EYE_SPAWN_ORDER[phase2RushEyesSpawned++];
    const seed = Math.random() * Math.PI * 2;
    phase2RushEyes.push({
      slot,
      ageBeats: 0,
      shotClockBeats: PHASE2_RUSH_EYE_FIRE_BEATS * 0.45 - slot * 0.08,
      seed,
      tendrils: Array.from({ length: 4 }, (_, index) => ({
        bend: Math.sin(seed + index * 1.9) * 0.18,
        velocity: 0,
      })),
    });
    playBossSfx('phase2Eye');
    return true;
  }

  function finishPhaseTwoRushPhase() {
    if (phase2RushPhaseComplete) return;
    phase2RushPhaseComplete = true;
    phase2ClawRushMode = false;
    phase2ClawPatternStopped = true;
    phase2Attacks = [];
    phase2RushOrbs = [];
    phase2RushEyeBurstPending = false;
    phase2BurstActive = false;
    nextPhase2AttackBeat = Infinity;
    startPhaseTwoTowerClimb();
  }

  function strikePhaseTwoRushEyes() {
    if (!phase2ClawRushMode) return false;
    const killed = phase2RushEyes.splice(0, 2);
    if (killed.length) {
      const killedSlots = new Set(killed.map((eye) => eye.slot));
      phase2RushOrbs = phase2RushOrbs.filter((orb) => !killedSlots.has(orb.eyeSlot));
      for (const eye of killed) {
        eye.deathAge = 0;
        phase2RushDyingEyes.push(eye);
      }
    }
    if (phase2RushEyesSpawned >= PHASE2_RUSH_EYE_COUNT && phase2RushEyes.length === 0) {
      finishPhaseTwoRushPhase();
    }
    return true;
  }

  function spawnPhaseTwoRushOrb(eye, board) {
    const eyePosition = phaseTwoRushEyePosition(eye, board);
    const heroPosition = worldPointToViewport(hero.x, hero.y, board);
    const dx = heroPosition.x - eyePosition.x;
    const dy = heroPosition.y - eyePosition.y;
    const distance = Math.hypot(dx, dy) || 1;
    const baseDirectionX = dx / distance;
    const baseDirectionY = dy / distance;
    const angleJitter = (Math.random() * 2 - 1) * 0.14;
    const jitterCos = Math.cos(angleJitter);
    const jitterSin = Math.sin(angleJitter);
    phase2RushOrbs.push({
      x: eyePosition.x,
      y: eyePosition.y,
      previousX: eyePosition.x,
      previousY: eyePosition.y,
      directionX: baseDirectionX * jitterCos - baseDirectionY * jitterSin,
      directionY: baseDirectionX * jitterSin + baseDirectionY * jitterCos,
      eyeSlot: eye.slot,
      ageBeats: 0,
      seed: Math.random() * Math.PI * 2,
      hit: false,
    });
    playBossSfx('phase2Orb');
  }

  function updatePhaseTwoRushEyes(dt) {
    if (!canvas) return;
    const beatStep = dt / beatMs;
    for (const eye of phase2RushDyingEyes) {
      eye.ageBeats += beatStep;
      eye.deathAge += dt;
    }
    phase2RushDyingEyes = phase2RushDyingEyes.filter((eye) => eye.deathAge < 520);
    if (!phase2ClawRushMode) return;
    const springStep = Math.min(0.05, dt / 1000);
    const board = getBoardRect();
    for (const eye of phase2RushEyes) {
      eye.ageBeats += beatStep;
      eye.shotClockBeats += beatStep;
      if (!eye.tendrils) {
        eye.tendrils = Array.from({ length: 4 }, () => ({ bend: 0, velocity: 0 }));
      }
      for (let i = 0; i < eye.tendrils.length; i++) {
        const motion = eye.tendrils[i];
        const target = Math.sin(eye.ageBeats * 1.35 + eye.seed + i * 1.9);
        motion.velocity += (target - motion.bend) * (20 + i * 1.4) * springStep;
        motion.velocity *= Math.exp(-(4.7 + i * 0.15) * springStep);
        motion.bend += motion.velocity * springStep;
      }
      while (eye.shotClockBeats >= PHASE2_RUSH_EYE_FIRE_BEATS) {
        eye.shotClockBeats -= PHASE2_RUSH_EYE_FIRE_BEATS;
        spawnPhaseTwoRushOrb(eye, board);
      }
    }
    const hitboxes = heroViewportHitboxes(board);
    const travel = PHASE2_RUSH_ORB_SPEED_PER_BEAT * beatStep;
    let shadowOrbs = 0;
    for (const orb of phase2RushOrbs) {
      orb.ageBeats += beatStep;
      orb.previousX = orb.x;
      orb.previousY = orb.y;
      orb.x += orb.directionX * travel;
      orb.y += orb.directionY * travel;
      const damageDistance = segmentRectDistance(
        orb.previousX,
        orb.previousY,
        orb.x,
        orb.y,
        hitboxes.damageRect
      );
      const touchesRewardMask = hitboxes.rewardPoints.some((point) =>
        phaseTwoHexPointSegmentDistance(
          point.x,
          point.y,
          orb.previousX,
          orb.previousY,
          orb.x,
          orb.y
        ) <= PHASE2_RUSH_ORB_SHADOW_RADIUS);
      if (!orb.hit && touchesRewardMask) {
        shadowOrbs++;
      }
      if (
        !orb.hit &&
        damageDistance <= PHASE2_RUSH_ORB_RADIUS
      ) {
        orb.hit = true;
        damagePlayer(PHASE2_RUSH_ORB_DAMAGE * (bpm / PHASE2_BPM_MIN));
        playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
        if (hp <= 0) die();
      }
    }
    if (shadowOrbs > 0) {
      addVp(VP_PER_BEAT * shadowOrbs * beatStep, true);
    }
    phase2RushOrbs = phase2RushOrbs.filter((orb) => (
      !orb.hit &&
      orb.x >= -40 && orb.x <= window.innerWidth + 40 &&
      orb.y >= -40 && orb.y <= window.innerHeight + 40
    ));
  }

  function spawnPhaseTwoShadowClaw(board) {
    if (!board || !board.width || !phase2Avatar || !phase2Avatar.state) return false;
    const timeScale = phase2ClawRushMode ? PHASE2_CLAW_RUSH_TIME_SCALE : 1;
    const widthScale = phase2ClawRushMode ? PHASE2_CLAW_RUSH_WIDTH_SCALE : 1;
    const makeClaw = (turnSign, waitBeats) => ({
      type: 'shadowClaw',
      state: waitBeats > 0 ? 'waiting' : 'telegraph',
      waitAgeBeats: 0,
      waitBeats,
      x0: 0, y0: 0, c1x: 0, c1y: 0, c2x: 0, c2y: 0, x1: 0, y1: 0,
      width: Math.max(52, Math.min(78, Math.min(board.width, board.height) * 0.10)) * widthScale,
      startWidth: 9 * widthScale,
      turnSign,
      pathSteps: 56,
      pathPoints: [],
      headX: 0,
      headY: 0,
      headAngle: 0,
      targetX: 0,
      targetY: 0,
      baseStep: 16,
      aimLagDistance: phase2ClawRushMode ? 34 + Math.random() * 34 : 0,
      stretch: 0,
      stretchBeats: PHASE2_CLAW_TELEGRAPH_BEATS * timeScale *
        (phase2ClawRushMode ? PHASE2_CLAW_RUSH_TRAVEL_SCALE : 1),
      holdBeats: PHASE2_CLAW_HOLD_BEATS * timeScale *
        (phase2ClawRushMode ? PHASE2_CLAW_RUSH_HOLD_SCALE : 1),
      holdAgeBeats: 0,
      fire: 0,
      fireBeats: PHASE2_CLAW_FIRE_BEATS * timeScale,
      restBeats: PHASE2_CLAW_REST_BEATS * timeScale,
      cutsTerrain: !phase2ClawRushMode,
      rushMode: phase2ClawRushMode,
      crackSpawned: false,
      seed: Math.random() * 1000,
      board: null,
    });
    const claws = [];
    for (let i = 0; i < phase2BurstSize; i++) {
      const turnSign = (i + phase2BurstsAtSize) % 2 === 0 ? -1 : 1;
      claws.push(makeClaw(turnSign, i * 0.42 * timeScale));
    }
    if (!retargetPhaseTwoShadowClaw(claws[0], board)) return false;
    phase2Attacks.push(...claws);
    playBossSfx('phase2ClawCharge');
    if (phase2ClawRushMode) phase2RushEyeBurstPending = true;
    phase2BurstActive = true;
    return true;
  }

  function triggerPhaseTwoDash() {
    if (!canvas || !phase2Avatar || typeof phase2Avatar.dashTo !== 'function') return;
    const board = getBoardRect();
    const avatar = phase2Avatar.state && phase2Avatar.state.avatar;
    if (!board.width || !board.height || !avatar) return;
    if (phase2ClawRushMode) {
      const margin = Math.max(42, avatar.size * 0.32);
      const corners = [
        { id: 'screen-top-left', x: margin, y: margin },
        { id: 'screen-top-right', x: window.innerWidth - margin, y: margin },
        { id: 'screen-bottom-right', x: window.innerWidth - margin, y: window.innerHeight - margin },
        { id: 'screen-bottom-left', x: margin, y: window.innerHeight - margin },
      ];
      const currentIndex = corners.findIndex((corner) => corner.id === phase2DashZone);
      const choices = currentIndex < 0
        ? [corners[0], corners[1]]
        : [corners[(currentIndex + 1) % corners.length], corners[(currentIndex + 3) % corners.length]];
      const target = choices[Math.floor(Math.random() * choices.length)];
      phase2DashZone = target.id;
      phase2Avatar.dashTo(target.x, target.y, 300);
      playBossSfx('phase2Dash');
      return;
    }
    const insetX = Math.min(board.width * 0.14, avatar.size * 0.24);
    const insetY = Math.min(board.height * 0.14, avatar.size * 0.24);
    const x0 = board.left + insetX;
    const x1 = board.right - insetX;
    const y0 = board.top + insetY;
    const y1 = board.bottom - insetY;
    const random = (lo, hi) => lo + Math.random() * Math.max(0, hi - lo);
    const thirdY = board.height / 3;
    const zones = [
      { id: 'bottom-left', x: () => random(x0, board.left + board.width * 0.31), y: () => y1 },
      { id: 'middle-left', x: () => x0, y: () => random(board.top + thirdY * 1.12, board.top + thirdY * 1.88) },
      { id: 'top-left', x: () => x0, y: () => random(y0, board.top + thirdY * 0.78) },
      { id: 'top', x: () => random(board.left + board.width * 0.34, board.left + board.width * 0.66), y: () => y0 },
      { id: 'top-right', x: () => x1, y: () => random(y0, board.top + thirdY * 0.78) },
      { id: 'middle-right', x: () => x1, y: () => random(board.top + thirdY * 1.12, board.top + thirdY * 1.88) },
      { id: 'bottom-right', x: () => random(board.left + board.width * 0.69, x1), y: () => y1 },
    ];
    const choices = zones.filter((zone) => zone.id !== phase2DashZone);
    const zone = choices[Math.floor(Math.random() * choices.length)];
    const target = { x: zone.x(), y: zone.y() };
    phase2DashZone = zone.id;
    phase2Avatar.dashTo(target.x, target.y, 330);
    playBossSfx('phase2Dash');
  }

  function leavePhaseTwoCrack(a) {
    if (a.crackSpawned) return;
    a.crackSpawned = true;
    phase2Cracks.push({
      x0: a.x0, y0: a.y0,
      c1x: a.c1x, c1y: a.c1y,
      c2x: a.c2x, c2y: a.c2y,
      x1: a.x1, y1: a.y1,
      width: a.width,
      startWidth: a.startWidth,
      pathSteps: a.pathSteps,
      pathPoints: a.pathPoints.map((point) => ({ x: point.x, y: point.y })),
      seed: a.seed,
      expiresBeat: beatIndex + PHASE2_CRACK_BEATS,
      closing: false,
      closeTime: 0,
      board: a.board,
    });
    const crack = phase2Cracks[phase2Cracks.length - 1];
    crack.hitPolygon = phaseTwoCrackPolygon(crack);
    phase2CrackCacheDirty = true;
  }

  function updatePhaseTwoAttacks(dt) {
    for (const a of phase2Attacks) {
      if (a.state === 'waiting') {
        a.waitAgeBeats += dt / beatMs;
        if (a.waitAgeBeats >= a.waitBeats) {
          a.state = 'telegraph';
          retargetPhaseTwoShadowClaw(a, getBoardRect());
        }
      } else if (a.state === 'telegraph') {
        retargetPhaseTwoShadowClaw(a, getBoardRect());
        a.stretch += dt / (beatMs * a.stretchBeats);
        extendPhaseTwoClawPath(a, phaseTwoClawReach(a));
        if (a.stretch >= 1) {
          a.stretch = 1;
          extendPhaseTwoClawPath(a, 1);
          a.state = 'armed';
          a.holdAgeBeats = 0;
        }
      } else if (a.state === 'armed') {
        a.holdAgeBeats += dt / beatMs;
        if (a.holdAgeBeats >= a.holdBeats) {
          a.state = 'fire';
          a.fire = 0;
          playBossSfx('phase2ClawCut');
          if (a.cutsTerrain !== false) leavePhaseTwoCrack(a);
        }
      } else if (a.state === 'fire') {
        a.fire += dt / (beatMs * a.fireBeats);
        if (a.fire >= 1) {
          a.fire = 1;
          a.state = 'done';
          nextPhase2AttackBeat = beatIndex + a.restBeats;
        }
      }
    }
    phase2Attacks = phase2Attacks.filter((a) => a.state !== 'done');
    if (phase2BurstActive && phase2Attacks.length === 0) {
      phase2BurstActive = false;
      if (phase2RushEyeBurstPending) {
        spawnPhaseTwoRushEye();
        phase2RushEyeBurstPending = false;
      }
      phase2BurstsAtSize++;
      let completedCycle = false;
      if (phase2BurstsAtSize >= phase2BurstSize) {
        phase2BurstsAtSize = 0;
        phase2BurstSize++;
        completedCycle = true;
      }
      if (phase2GridSpecial && phase2GridSpecial.settled) {
        if (completedCycle) phase2PostGridCycles++;
        if (phase2PostGridCycles >= 3) {
          phase2ClawPatternStopped = true;
          nextPhase2AttackBeat = Infinity;
          dashPhaseTwoAvatarToBase();
        } else {
          triggerPhaseTwoDash();
        }
      } else {
        triggerPhaseTwoDash();
      }
    }
    for (const crack of phase2Cracks) {
      if (crack.closing) {
        crack.closeTime += dt;
        phase2CrackCacheDirty = true;
      }
    }
    const crackCount = phase2Cracks.length;
    phase2Cracks = phase2Cracks.filter((crack) => crack.closeTime < PHASE2_CRACK_CLOSE_MS);
    if (phase2Cracks.length !== crackCount) phase2CrackCacheDirty = true;
  }

  function onPhaseTwoBeat(beat) {
    for (const crack of phase2Cracks) {
      if (beat >= crack.expiresBeat && !crack.closing) {
        crack.closing = true;
        phase2CrackCacheDirty = true;
      }
    }
    if ((phase2GridSpecial && !phase2GridSpecial.settled) || phase2Attacks.length ||
        phase2ClawPatternStopped || (phase2Avatar && phase2Avatar.dashing) || beat < nextPhase2AttackBeat) return;
    if (spawnPhaseTwoShadowClaw(getBoardRect())) {
      phase2DebugClawQueued = false;
      nextPhase2AttackBeat = Infinity;
    }
  }

  function updatePhaseTwoTempo(dt) {
    if (setCombatBpm(phaseTwoBpm())) updateBossMusicTempo(true);
    beatPhase += dt;
    while (beatPhase >= beatMs) {
      beatPhase -= beatMs;
      beatIndex++;
      onPhaseTwoBeat(beatIndex);
    }
    if (bpm !== lastAnimBpm) {
      lastAnimBpm = bpm;
      if (bpmElement) bpmElement.textContent = 'BPM ' + Math.round(bpm);
    }
  }

  function debugPhaseTwoClaw() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    if (!phase2AvatarStarted && phase2Ritual) {
      phase2Ritual.beams = [];
      phase2Ritual.pentFade = 0;
      phase2Ritual.cocoon.hits = P2_COCOON_HITS;
      phase2Ritual.cocoon.p = 1;
      phase2Ritual.cocoon.alpha = 1;
      startAvatarPhaseTwo();
    }
    phase2DebugClawQueued = true;
    if (phase2CombatStarted) {
      phase2RushDebugQueued = false;
      phase2ClawRushMode = false;
      resetPhaseTwoRushEntities();
      phase2GridDebugQueued = false;
      phase2ClawPatternStopped = false;
      phase2TileRuinPattern = null;
      phase2TileRuinDebugQueued = false;
      phase2SwordRingPattern = null;
      phase2SwordRingDebugQueued = false;
      phase2PitfallPattern = null;
      phase2PitfallDebugQueued = false;
      phase2HexDebugQueued = false;
      phase2Attacks = [];
      phase2BurstActive = false;
      nextPhase2AttackBeat = beatIndex;
      onPhaseTwoBeat(beatIndex);
    }
  }

  function beginDebugPhaseTwoRush() {
    if (!phase2CombatStarted || !canvas) return false;
    phase2RushDebugQueued = false;
    phase2GridDebugQueued = false;
    phase2DebugClawQueued = false;
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2SwordRingDebugQueued = false;
    phase2PitfallPattern = null;
    phase2PitfallDebugQueued = false;
    phase2HexDebugQueued = false;
    phase2GridSpecial = null;
    phase2Attacks = [];
    phase2Cracks = [];
    phase2CrackCacheDirty = true;
    phase2BurstActive = false;
    phase2BurstSize = 1;
    phase2BurstsAtSize = 0;
    phase2DashZone = 'top';
    phase2ClawPatternStopped = false;
    phase2ClawRushMode = true;
    resetPhaseTwoRushEntities();
    restorePhaseTwoSquareArena(true);
    hero.x = canvas.width / 2;
    hero.y = canvas.height / 2;
    heroMove.x = 0;
    heroMove.y = 0;
    keys.clear();
    nextPhase2AttackBeat = beatIndex + 1;
    if (phase2Avatar && typeof phase2Avatar.dashHome === 'function') {
      phase2Avatar.dashHome(getBoardRect(), PHASE2_BOSS_RETURN_DASH_MS);
    }
    return true;
  }

  function debugPhaseTwoRush() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    if (!phase2AvatarStarted && phase2Ritual) {
      phase2Ritual.beams = [];
      phase2Ritual.pentFade = 0;
      phase2Ritual.cocoon.hits = P2_COCOON_HITS;
      phase2Ritual.cocoon.p = 1;
      phase2Ritual.cocoon.alpha = 1;
      startAvatarPhaseTwo();
    }
    phase2RushDebugQueued = true;
    if (phase2CombatStarted) beginDebugPhaseTwoRush();
  }

  function beginDebugPhaseTwoSwordRing() {
    if (!phase2CombatStarted || !canvas) return false;
    phase2RushDebugQueued = false;
    phase2ClawRushMode = false;
    resetPhaseTwoRushEntities();
    phase2SwordRingDebugQueued = false;
    phase2GridDebugQueued = false;
    phase2DebugClawQueued = false;
    phase2ClawPatternStopped = true;
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2PitfallPattern = null;
    phase2PitfallDebugQueued = false;
    phase2HexDebugQueued = false;
    phase2Attacks = [];
    phase2BurstActive = false;
    phase2GridSpecial = null;
    phase2Cracks = [];
    phase2CrackCacheDirty = true;
    nextPhase2AttackBeat = Infinity;
    hero.x = canvas.width / 2;
    hero.y = canvas.height / 2;
    heroMove.x = 0;
    heroMove.y = 0;
    keys.clear();
    return startPhaseTwoSwordRingPattern();
  }

  function debugPhaseTwoSwordRing() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    if (!phase2AvatarStarted && phase2Ritual) {
      phase2Ritual.beams = [];
      phase2Ritual.pentFade = 0;
      phase2Ritual.cocoon.hits = P2_COCOON_HITS;
      phase2Ritual.cocoon.p = 1;
      phase2Ritual.cocoon.alpha = 1;
      startAvatarPhaseTwo();
    }
    phase2SwordRingDebugQueued = true;
    if (phase2CombatStarted) beginDebugPhaseTwoSwordRing();
  }

  function clipPhaseTwoPitfallPolygon(points) {
    const boundaries = [
      {
        inside: (point) => point.x >= 0,
        cross: (a, b) => ({ x: 0, y: a.y + (b.y - a.y) * (-a.x) / (b.x - a.x) }),
      },
      {
        inside: (point) => point.x <= 1,
        cross: (a, b) => ({ x: 1, y: a.y + (b.y - a.y) * (1 - a.x) / (b.x - a.x) }),
      },
      {
        inside: (point) => point.y >= 0,
        cross: (a, b) => ({ x: a.x + (b.x - a.x) * (-a.y) / (b.y - a.y), y: 0 }),
      },
      {
        inside: (point) => point.y <= 1,
        cross: (a, b) => ({ x: a.x + (b.x - a.x) * (1 - a.y) / (b.y - a.y), y: 1 }),
      },
    ];
    let output = points;
    for (const boundary of boundaries) {
      const input = output;
      output = [];
      if (!input.length) break;
      let previous = input[input.length - 1];
      let previousInside = boundary.inside(previous);
      for (const current of input) {
        const currentInside = boundary.inside(current);
        if (currentInside !== previousInside) output.push(boundary.cross(previous, current));
        if (currentInside) output.push(current);
        previous = current;
        previousInside = currentInside;
      }
    }
    return output.map((point) => ({ x: clamp01(point.x), y: clamp01(point.y) }));
  }

  function makePhaseTwoPitfallWedge(angle, random) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const nx = -dy;
    const ny = dx;
    const edgeDistance = Math.min(
      Math.abs(dx) > 0.0001 ? 0.5 / Math.abs(dx) : Infinity,
      Math.abs(dy) > 0.0001 ? 0.5 / Math.abs(dy) : Infinity
    );
    const outerDistance = edgeDistance + 0.24;
    const edgeWidth = 0.40 + random() * 0.04;
    const outerHalfWidth = edgeWidth * 0.5 * outerDistance / edgeDistance;
    const skew = (random() - 0.5) * 0.018;
    const pointAt = (distance, halfWidth) => ({
      left: {
        x: 0.5 + dx * distance + nx * (halfWidth + skew),
        y: 0.5 + dy * distance + ny * (halfWidth + skew),
      },
      right: {
        x: 0.5 + dx * distance - nx * (halfWidth - skew),
        y: 0.5 + dy * distance - ny * (halfWidth - skew),
      },
    });
    const middle = pointAt(outerDistance * 0.58, outerHalfWidth * 0.54);
    const outer = pointAt(outerDistance, outerHalfWidth);
    const targetDistance = edgeDistance * 0.62;
    const points = clipPhaseTwoPitfallPolygon([
        { x: 0.5, y: 0.5 },
        middle.left,
        outer.left,
        outer.right,
        middle.right,
      ]);
    return {
      points,
      targetX: 0.5 + dx * targetDistance,
      targetY: 0.5 + dy * targetDistance,
      kind: 'wedge',
    };
  }

  function makePhaseTwoPitfallQuarter(quadrant) {
    const left = quadrant === 0 || quadrant === 3 ? 0 : 0.5;
    const top = quadrant < 2 ? 0 : 0.5;
    return {
      points: [
        { x: left, y: top },
        { x: left + 0.5, y: top },
        { x: left + 0.5, y: top + 0.5 },
        { x: left, y: top + 0.5 },
      ],
      targetX: left + 0.25,
      targetY: top + 0.25,
      kind: 'quarter',
    };
  }

  function makePhaseTwoPitfallCircle(position, random) {
    const centers = [
      { x: 0.5, y: 0.5 },
      { x: 0.27, y: 0.27 },
      { x: 0.73, y: 0.27 },
      { x: 0.73, y: 0.73 },
      { x: 0.27, y: 0.73 },
    ];
    const center = centers[position];
    const radius = 0.17 + random() * 0.025;
    const points = [];
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI * 2 / 24;
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
    return {
      points,
      targetX: center.x,
      targetY: center.y,
      kind: 'circle',
    };
  }

  function phaseTwoPitfallHeroPosition() {
    const left = BORDER + PAD;
    const top = BORDER + PAD;
    const width = Math.max(1, canvas.width - (BORDER + PAD) * 2);
    const height = Math.max(1, canvas.height - (BORDER + PAD) * 2);
    const center = heroBodyCenterWorld();
    return {
      x: clamp01((center.x - left) / width),
      y: clamp01((center.y - top) / height),
      halfX: 2.5 / width,
      halfY: 2.5 / height,
    };
  }

  function phaseTwoPitfallHeroInGap(platform) {
    const p = phaseTwoPitfallHeroPosition();
    const samples = [
      { x: p.x, y: p.y },
      { x: p.x - p.halfX, y: p.y - p.halfY },
      { x: p.x + p.halfX, y: p.y - p.halfY },
      { x: p.x + p.halfX, y: p.y + p.halfY },
      { x: p.x - p.halfX, y: p.y + p.halfY },
    ];
    return platform.gaps.some((gap) => samples.every((sample) => pointInPoly(sample.x, sample.y, gap.points)));
  }

  function phaseTwoPitfallHeroOnShadowEdge(platform) {
    const depth = platform.ageBeats / platform.travelBeats;
    if (platform.resolved || depth < 0.10 || depth > PHASE2_PITFALL_HIT_DEPTH) return false;
    const projection = phaseTwoPitfallProjection(platform);
    const threshold = Math.max(5, projection.scale * 9);
    const rewardPoints = heroBodyWorldRewardPoints();
    for (const gap of platform.gaps) {
      for (let i = 0; i < gap.points.length; i++) {
        const a = gap.points[i];
        const b = gap.points[(i + 1) % gap.points.length];
        const ax = projection.left + a.x * projection.width;
        const ay = projection.top + a.y * projection.height;
        const bx = projection.left + b.x * projection.width;
        const by = projection.top + b.y * projection.height;
        if (rewardPoints.some((point) => distToSeg(point.x, point.y, ax, ay, bx, by) <= threshold)) {
          return true;
        }
      }
    }
    return false;
  }

  function makePhaseTwoPitfallPlatform(pattern) {
    const random = pattern.random;
    let gap = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const shapeRoll = random();
      const candidate = shapeRoll < 0.48
        ? makePhaseTwoPitfallWedge(random() * Math.PI * 2, random)
        : shapeRoll < 0.74
          ? makePhaseTwoPitfallQuarter(Math.floor(random() * 4))
          : makePhaseTwoPitfallCircle(Math.floor(random() * 5), random);
      gap = candidate;
      if (Math.hypot(candidate.targetX - pattern.nextGapX, candidate.targetY - pattern.nextGapY) <= 0.39) break;
    }
    pattern.nextGapX = gap.targetX;
    pattern.nextGapY = gap.targetY;
    playBossSfx('phase2Plane');
    return {
      id: pattern.nextId++,
      ageBeats: 0,
      travelBeats: PHASE2_PITFALL_TRAVEL_BEATS,
      gaps: [gap],
      seed: random() * 1000,
      resolved: false,
      hit: false,
      hitAge: -1,
    };
  }

  function startPhaseTwoPitfallPattern() {
    if (!canvas || phase2PitfallPattern) return false;
    restorePhaseTwoSquareArena(true);
    phase2ClawRushMode = false;
    resetPhaseTwoRushEntities();
    phase2PitfallDebugQueued = false;
    phase2GridDebugQueued = false;
    phase2DebugClawQueued = false;
    phase2ClawPatternStopped = true;
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2SwordRingDebugQueued = false;
    phase2Attacks = [];
    phase2BurstActive = false;
    phase2GridSpecial = null;
    phase2Cracks = [];
    phase2CrackCacheDirty = true;
    nextPhase2AttackBeat = Infinity;
    hero.x = canvas.width / 2;
    hero.y = canvas.height / 2;
    heroMove.x = 0;
    heroMove.y = 0;
    keys.clear();
    const seed = (Math.random() * 0xffffffff) >>> 0;
    phase2PitfallPattern = {
      mode: 'dropper',
      elapsed: 0,
      spawnBeats: PHASE2_PITFALL_SPAWN_BEATS,
      platforms: [],
      dodgedPlanes: 0,
      ram: null,
      hex: null,
      nextId: 1,
      nextGapX: 0.5,
      nextGapY: 0.5,
      tunnelOffset: 0,
      impactAge: -1,
      safeAge: -1,
      seed,
      random: mulberry32(seed),
    };
    playBossSfx('phase2Pitfall');
    return true;
  }

  function phaseTwoHexNormalizeAngle(angle) {
    const full = Math.PI * 2;
    return ((angle % full) + full) % full;
  }

  function phaseTwoHexAngleDistance(a, b) {
    const difference = Math.abs(phaseTwoHexNormalizeAngle(a) - phaseTwoHexNormalizeAngle(b));
    return Math.min(difference, Math.PI * 2 - difference);
  }

  function phaseTwoHexCenter() {
    return {
      x: canvas.width / 2,
      y: canvas.height / 2,
    };
  }

  function expandPhaseTwoHexArenaToViewport() {
    const board = getBoardRect();
    const centerY = board.top + board.height / 2;
    const targetSide = Math.max(BOARD, Math.round((window.innerHeight - PHASE2_HEX_BOTTOM_PADDING - centerY) * 2));
    const growth = targetSide - board.height;
    const rowLeft = parseFloat(overlay.style.getPropertyValue('--phase2-row-left'));
    const rowTop = parseFloat(overlay.style.getPropertyValue('--phase2-row-top'));
    const wrathTop = parseFloat(overlay.style.getPropertyValue('--phase2-wrath-top'));
    if (Number.isFinite(rowLeft)) {
      overlay.style.setProperty('--phase2-row-left', (rowLeft - growth / 2).toFixed(1) + 'px');
    }
    if (Number.isFinite(rowTop)) {
      overlay.style.setProperty('--phase2-row-top', (rowTop - growth / 2).toFixed(1) + 'px');
    }
    if (Number.isFinite(wrathTop)) {
      overlay.style.setProperty(
        '--phase2-wrath-top',
        Math.max(14, wrathTop - growth / 2 - PHASE2_HEX_BAR_LIFT).toFixed(1) + 'px'
      );
    }
    overlay.style.setProperty('--phase2-stage-w', targetSide + 'px');
    overlay.style.setProperty('--phase2-stage-h', targetSide + 'px');
    overlay.style.setProperty('--phase2-vbar-h', targetSide + 'px');
    overlay.classList.add('hex-arena-active');
    phase2LayoutSignature = 'hex|' + targetSide;

    const coordinateShift = (targetSide - canvas.width) / 2;
    if (canvas.width !== targetSide || canvas.height !== targetSide) {
      hero.x += coordinateShift;
      hero.y += coordinateShift;
      canvas.width = targetSide;
      canvas.height = targetSide;
      ctx.imageSmoothingEnabled = false;
      frameBoardRect = null;
    }
    Object.assign(arena, {
      x: targetSide / 2,
      y: targetSide / 2,
      width: BOARD,
      height: BOARD,
      rotation: 0,
      shape: 'rect',
      from: null,
      target: null,
      transitionTime: 0,
      transitionDuration: 0,
    });
    return targetSide;
  }

  function positionPhaseTwoHexHero(pattern) {
    if (!pattern || !pattern.hex) return;
    const angle = pattern.hex.heroAngle;
    const center = phaseTwoHexCenter();
    hero.x = center.x + Math.cos(angle) * pattern.hex.orbitRadius;
    hero.y = center.y + Math.sin(angle) * pattern.hex.orbitRadius;
  }

  function updatePhaseTwoHexMovement(pattern, dt) {
    let direction = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) direction -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) direction += 1;
    heroMove.x = 0;
    heroMove.y = 0;
    if (direction) {
      const whirlpool = pattern.hex.whirlpool;
      const flow = whirlpool && whirlpool.active ? whirlpool.flow : 0;
      const currentScale = flow === 0
        ? 1
        : 1 + PHASE2_HEX_WHIRLPOOL_SPEED_DELTA * Math.sign(direction * flow) * Math.abs(flow);
      pattern.hex.heroAngle = phaseTwoHexNormalizeAngle(
        pattern.hex.heroAngle +
          direction * PHASE2_HEX_ANGULAR_SPEED * currentScale * (bpm / PHASE2_BPM_MIN) * dt
      );
      heroMove.x = -Math.sin(pattern.hex.heroAngle) * direction;
      heroMove.y = Math.cos(pattern.hex.heroAngle) * direction;
    }
    positionPhaseTwoHexHero(pattern);
  }

  function updatePhaseTwoPitfallMovement(dt) {
    const pattern = phase2PitfallPattern;
    if (pattern && pattern.mode === 'hex' && pattern.hex) {
      updatePhaseTwoHexMovement(pattern, dt);
      return;
    }
    if (pattern && pattern.mode === 'ram') {
      heroMove.x = 0;
      heroMove.y = 0;
      return;
    }
    let dx = 0;
    let dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    const length = Math.hypot(dx, dy);
    if (!length) {
      heroMove.x = 0;
      heroMove.y = 0;
      return;
    }
    heroMove.x = dx / length;
    heroMove.y = dy / length;
    const speed = MOVE_SPEED * (bpm / BASE_BPM) * PHASE2_PITFALL_MOVE_SCALE;
    hero.x += heroMove.x * speed * dt;
    hero.y += heroMove.y * speed * dt;
    clampHero();
  }

  function phaseTwoHexWallProgress(wall) {
    return wall.ageBeats / wall.travelBeats;
  }

  function phaseTwoHexWallRadius(wall) {
    const progress = clamp01(phaseTwoHexWallProgress(wall));
    const outerRadius = canvas.width * 0.56;
    const innerRadius = wall.kind === 'corridor-stream'
      ? PHASE2_HEX_CRATER_RADIUS + wall.thickness / 2
      : PHASE2_HEX_CRATER_RADIUS * 0.52;
    return outerRadius + (innerRadius - outerRadius) * easeInQuad(progress);
  }

  function phaseTwoHexWallGapWidth(wall, radius) {
    if (wall.kind === 'corridor-stream') return wall.gapWidth;
    const outerRadius = canvas.width * 0.56;
    const approach = 1 - clamp01(
      (radius - PHASE2_HEX_ORBIT_RADIUS) / Math.max(1, outerRadius - PHASE2_HEX_ORBIT_RADIUS)
    );
    return wall.gapWidth * (1 + smoothstep(approach) * 0.20);
  }

  function phaseTwoHexWallGapAngle(wall) {
    if (wall.kind !== 'spiral') return wall.gapAngle;
    const progress = clamp01(phaseTwoHexWallProgress(wall));
    return phaseTwoHexNormalizeAngle(wall.gapAngle + wall.spiralTwist * smoothstep(progress));
  }

  function phaseTwoHexWallSegments(wall, radius) {
    if (wall.kind === 'split') {
      const sector = Math.PI / 3;
      const segments = [];
      for (let i = 0; i < 3; i++) {
        const start = wall.patternAngle + (i * 2 + wall.splitParity) * sector;
        segments.push({ start, end: start + sector });
      }
      return segments;
    }
    const halfGap = phaseTwoHexWallGapWidth(wall, radius) / 2;
    const gapAngle = phaseTwoHexWallGapAngle(wall);
    return [{
      start: gapAngle + halfGap,
      end: gapAngle + Math.PI * 2 - halfGap,
    }];
  }

  function phaseTwoHexAngleInsideWall(wall, angle, gapWidth) {
    if (wall.kind === 'split') {
      const sectorIndex = Math.floor(
        phaseTwoHexNormalizeAngle(angle - wall.patternAngle) / (Math.PI / 3)
      );
      return sectorIndex % 2 === wall.splitParity;
    }
    if (wall.kind === 'corridor-stream') {
      const gapAngle = phaseTwoHexWallGapAngle(wall);
      const halfWall = PHASE2_HEX_CORRIDOR_WALL_ANGLE / 2;
      for (let railIndex = 0; railIndex < PHASE2_HEX_CORRIDOR_RAILS; railIndex++) {
        const railAngle = gapAngle + railIndex * Math.PI * 2 / PHASE2_HEX_CORRIDOR_RAILS;
        if (phaseTwoHexAngleDistance(angle, railAngle) <= halfWall) return true;
      }
      return false;
    }
    return phaseTwoHexAngleDistance(angle, phaseTwoHexWallGapAngle(wall)) > gapWidth / 2;
  }

  function phaseTwoHexWallTouchesDamageHitbox(wall, gapWidth) {
    const center = phaseTwoHexCenter();
    const damageCenter = heroBodyCenterWorld();
    const points = [];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        points.push({
          x: damageCenter.x - 2.5 + column * 2.5,
          y: damageCenter.y - 2.5 + row * 2.5,
        });
      }
    }
    return points.some((point) => phaseTwoHexAngleInsideWall(
      wall,
      Math.atan2(point.y - center.y, point.x - center.x),
      gapWidth
    ));
  }

  function phaseTwoHexHeroTouchesWallShadow(wall, shadowInnerEdge, shadowOuterEdge, gapWidth) {
    const center = phaseTwoHexCenter();
    const samplePadding = PHASE2_HEX_VP_CONTACT_PADDING;
    return heroBodyWorldRewardPoints().some((point) => {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const sampleRadius = Math.hypot(dx, dy);
      if (
        sampleRadius < shadowInnerEdge - samplePadding ||
        sampleRadius > shadowOuterEdge + samplePadding
      ) return false;
      const sampleAngle = Math.atan2(dy, dx);
      const angularPadding = Math.atan2(samplePadding, Math.max(1, sampleRadius));
      return phaseTwoHexAngleInsideWall(wall, sampleAngle, gapWidth) ||
        phaseTwoHexAngleInsideWall(wall, sampleAngle - angularPadding, gapWidth) ||
        phaseTwoHexAngleInsideWall(wall, sampleAngle + angularPadding, gapWidth);
    });
  }

  function phaseTwoHexOrbPosition(orb) {
    const progress = clamp01(orb.ageBeats / orb.travelBeats);
    const center = phaseTwoHexCenter();
    const radius = orb.startRadius * (1 - easeInQuad(progress));
    return {
      x: center.x + Math.cos(orb.angle) * radius,
      y: center.y + Math.sin(orb.angle) * radius,
    };
  }

  function phaseTwoHexPointSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0.0001) return Math.hypot(px - x1, py - y1);
    const t = clamp01(((px - x1) * dx + (py - y1) * dy) / lengthSquared);
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }

  function phaseTwoHexHeroTouchesOrbShadow(orb, position) {
    const contactPadding = PHASE2_HEX_VP_CONTACT_PADDING;
    const facing = orb.angle + Math.PI;
    const facingX = Math.cos(facing);
    const facingY = Math.sin(facing);
    const shadowStart = orb.radius;
    const shadowEnd = orb.radius * (1 + PHASE2_HEX_ORB_SHADOW_LENGTH);
    return heroBodyWorldRewardPoints().some((point) => {
      const dx = point.x - position.x;
      const dy = point.y - position.y;
      const forward = dx * facingX + dy * facingY;
      const sideways = Math.abs(-dx * facingY + dy * facingX);
      return forward >= shadowStart - contactPadding &&
        forward <= shadowEnd + contactPadding &&
        sideways <= orb.radius + contactPadding;
    });
  }

  function makePhaseTwoHexWall(pattern) {
    const hex = pattern.hex;
    const interval = 60000 / PHASE2_BPM_MIN * PHASE2_HEX_WALL_SPAWN_BEATS;
    const reachable = Math.min(
      Math.PI * 0.85,
      PHASE2_HEX_ANGULAR_SPEED * (bpm / PHASE2_BPM_MIN) * interval * 0.92
    );
    const minimumShift = Math.min(0.62, reachable * 0.42);
    const shiftMagnitude = minimumShift + pattern.random() * (reachable - minimumShift);
    const shift = (pattern.random() < 0.5 ? -1 : 1) * shiftMagnitude;
    const gapAngle = phaseTwoHexNormalizeAngle(hex.nextGapAngle + shift);
    hex.nextGapAngle = gapAngle;
    return {
      ageBeats: 0,
      travelBeats: PHASE2_HEX_WALL_TRAVEL_BEATS,
      gapAngle,
      gapWidth: PHASE2_HEX_WALL_GAP * (0.92 + pattern.random() * 0.16),
      thickness: PHASE2_HEX_WALL_THICKNESS * (0.90 + pattern.random() * 0.18),
      previousRadius: canvas.width * 0.56,
      resolved: false,
      hit: false,
      impactAge: -1,
      patternEnd: true,
    };
  }

  function makePhaseTwoHexSplitPair(pattern) {
    const sector = Math.PI / 3;
    const patternAngle = phaseTwoHexNormalizeAngle(pattern.hex.heroAngle - sector * 1.5);
    const first = makePhaseTwoHexWall(pattern);
    Object.assign(first, {
      kind: 'split',
      patternAngle,
      splitParity: 0,
      patternEnd: false,
    });
    const second = {
      ...first,
      ageBeats: -PHASE2_HEX_SPLIT_FOLLOWUP_BEATS,
      splitParity: 1,
      previousRadius: canvas.width * 0.56,
      resolved: false,
      hit: false,
      impactAge: -1,
      patternEnd: true,
    };
    return [first, second];
  }

  function makePhaseTwoHexOrb(pattern, options) {
    const settings = options || {};
    const angle = Number.isFinite(settings.angle) ? settings.angle : pattern.random() * Math.PI * 2;
    const orb = {
      ageBeats: Number.isFinite(settings.ageBeats) ? settings.ageBeats : 0,
      travelBeats: PHASE2_HEX_ORB_TRAVEL_BEATS,
      startRadius: Number.isFinite(settings.startRadius) ? settings.startRadius : canvas.width * 0.56,
      angle,
      radius: Number.isFinite(settings.radius) ? settings.radius : PHASE2_HEX_ORB_RADIUS,
      hit: false,
    };
    const position = phaseTwoHexOrbPosition(orb);
    orb.previousX = position.x;
    orb.previousY = position.y;
    return orb;
  }

  function spawnPhaseTwoHexOrbWave(pattern, bulletPattern) {
    const angleStep = Math.PI * 2 / PHASE2_HEX_ORB_LANES;
    const alternatingOffset = bulletPattern.wavesSpawned % 2 === 0 ? 0 : angleStep / 2;
    for (let lane = 0; lane < PHASE2_HEX_ORB_LANES; lane++) {
      pattern.hex.orbs.push(makePhaseTwoHexOrb(pattern, {
        angle: bulletPattern.angleOffset + alternatingOffset + lane * angleStep,
      }));
    }
    playBossSfx('phase2HexOrb');
    bulletPattern.wavesSpawned++;
  }

  function makePhaseTwoHexSpiralWalls(pattern) {
    const direction = pattern.random() < 0.5 ? -1 : 1;
    const baseAngle = pattern.hex.heroAngle;
    const sequenceSpan = (PHASE2_HEX_SPIRAL_SLOTS - 1) * PHASE2_HEX_WALL_SPAWN_BEATS;
    const wallStepBeats = sequenceSpan / (PHASE2_HEX_SPIRAL_WALL_COUNT - 1);
    const walls = [];
    for (let i = 0; i < PHASE2_HEX_SPIRAL_WALL_COUNT; i++) {
      const wall = makePhaseTwoHexWall(pattern);
      Object.assign(wall, {
        kind: 'spiral',
        ageBeats: -i * wallStepBeats,
        gapAngle: phaseTwoHexNormalizeAngle(baseAngle + direction * i * 0.48),
        gapWidth: PHASE2_HEX_WALL_GAP * 0.94,
        spiralTwist: direction * 0.42,
        thickness: PHASE2_HEX_WALL_THICKNESS * 0.72,
        damageScale: 0.32,
        patternEnd: false,
      });
      walls.push(wall);
    }
    walls[walls.length - 1].patternEnd = true;
    pattern.hex.nextGapAngle = phaseTwoHexNormalizeAngle(
      baseAngle + direction * (PHASE2_HEX_SPIRAL_WALL_COUNT * 0.48 + 0.42)
    );
    return walls;
  }

  function makePhaseTwoHexCorridorWalls(pattern) {
    const direction = pattern.random() < 0.5 ? -1 : 1;
    const gapAngle = phaseTwoHexNormalizeAngle(pattern.hex.heroAngle + direction * 0.30);
    const walls = [];
    for (let i = 0; i < PHASE2_HEX_CORRIDOR_SLOTS; i++) {
      const wall = makePhaseTwoHexWall(pattern);
      Object.assign(wall, {
        kind: 'corridor',
        ageBeats: -i * PHASE2_HEX_WALL_SPAWN_BEATS,
        gapAngle: phaseTwoHexNormalizeAngle(gapAngle + direction * i * 0.08),
        gapWidth: 0.62,
        patternEnd: false,
      });
      walls.push(wall);
    }
    walls[walls.length - 1].patternEnd = true;
    pattern.hex.nextGapAngle = phaseTwoHexNormalizeAngle(
      gapAngle + direction * PHASE2_HEX_CORRIDOR_SLOTS * 0.08
    );
    return walls;
  }

  function makePhaseTwoHexCorridorStream(pattern) {
    const firstDirection = pattern.random() < 0.5 ? -1 : 1;
    const turnSpanBeats = (PHASE2_HEX_CORRIDOR_SLOTS - 1) *
      PHASE2_HEX_WALL_SPAWN_BEATS * PHASE2_HEX_CORRIDOR_LENGTH_SCALE;
    const wallStepBeats = turnSpanBeats / (PHASE2_HEX_CORRIDOR_CONTROL_COUNT - 1);
    const streamId = pattern.hex.nextCorridorStreamId++;
    const walls = [];
    let turnStartAngle = phaseTwoHexNormalizeAngle(
      pattern.hex.heroAngle + firstDirection * 0.30
    );
    for (let turnIndex = 0; turnIndex < PHASE2_HEX_CORRIDOR_TURNS; turnIndex++) {
      const direction = firstDirection * (turnIndex % 2 === 0 ? 1 : -1);
      const firstControl = turnIndex === 0 ? 0 : 1;
      for (let i = firstControl; i < PHASE2_HEX_CORRIDOR_CONTROL_COUNT; i++) {
        const controlIndex = turnIndex * (PHASE2_HEX_CORRIDOR_CONTROL_COUNT - 1) + i;
        const wall = makePhaseTwoHexWall(pattern);
        Object.assign(wall, {
          kind: 'corridor-stream',
          corridorStreamId: streamId,
          ageBeats: -controlIndex * wallStepBeats,
          gapAngle: phaseTwoHexNormalizeAngle(
            turnStartAngle + direction * i * PHASE2_HEX_CORRIDOR_TURN
          ),
          gapWidth: Math.PI * 2 / PHASE2_HEX_CORRIDOR_RAILS,
          damageScale: 0.6,
          patternEnd: false,
        });
        walls.push(wall);
      }
      turnStartAngle = phaseTwoHexNormalizeAngle(
        turnStartAngle + direction *
          (PHASE2_HEX_CORRIDOR_CONTROL_COUNT - 1) * PHASE2_HEX_CORRIDOR_TURN
      );
    }
    walls[walls.length - 1].patternEnd = true;
    pattern.hex.nextGapAngle = turnStartAngle;
    return walls;
  }

  function makePhaseTwoHexZigzagWalls(pattern) {
    const baseAngle = pattern.hex.heroAngle;
    const offsets = [0.58, 1.16, 0.58, 0];
    const walls = [];
    for (let i = 0; i < PHASE2_HEX_ZIGZAG_SLOTS; i++) {
      const wall = makePhaseTwoHexWall(pattern);
      Object.assign(wall, {
        kind: 'zigzag',
        ageBeats: -i * PHASE2_HEX_WALL_SPAWN_BEATS,
        gapAngle: phaseTwoHexNormalizeAngle(baseAngle + offsets[i]),
        gapWidth: PHASE2_HEX_WALL_GAP * 0.86,
        patternEnd: i === PHASE2_HEX_ZIGZAG_SLOTS - 1,
      });
      walls.push(wall);
    }
    pattern.hex.nextGapAngle = baseAngle;
    return walls;
  }

  function startPhaseTwoHexSpecialPattern(pattern) {
    const hex = pattern.hex;
    const types = ['bullet', 'spiral', 'corridor', 'corridor-stream', 'zigzag'];
    const type = types[hex.specialPatternIndex % types.length];
    hex.specialPatternIndex++;
    if (type !== 'bullet') playBossSfx('phase2HexWall');
    if (type === 'bullet') {
      const durationBeats = PHASE2_HEX_BULLET_SLOTS * PHASE2_HEX_WALL_SPAWN_BEATS;
      hex.bulletPattern = {
        ageBeats: 0,
        durationBeats,
        spawnBeats: 0,
        spawnIntervalBeats: (durationBeats - PHASE2_HEX_ORB_TRAVEL_BEATS) /
          (PHASE2_HEX_ORB_WAVES - 1),
        wavesSpawned: 0,
        angleOffset: pattern.random() * Math.PI * 2,
      };
      spawnPhaseTwoHexOrbWave(pattern, hex.bulletPattern);
      return durationBeats - PHASE2_HEX_WALL_TRAVEL_BEATS + PHASE2_HEX_WALL_SPAWN_BEATS;
    }
    if (type === 'spiral') {
      hex.walls.push(...makePhaseTwoHexSpiralWalls(pattern));
      return PHASE2_HEX_SPIRAL_SLOTS * PHASE2_HEX_WALL_SPAWN_BEATS;
    }
    if (type === 'corridor') {
      hex.walls.push(...makePhaseTwoHexCorridorWalls(pattern));
      return PHASE2_HEX_CORRIDOR_SLOTS * PHASE2_HEX_WALL_SPAWN_BEATS;
    }
    if (type === 'corridor-stream') {
      hex.walls.push(...makePhaseTwoHexCorridorStream(pattern));
      return PHASE2_HEX_CORRIDOR_TURNS *
        (PHASE2_HEX_CORRIDOR_SLOTS - 1) * PHASE2_HEX_WALL_SPAWN_BEATS *
        PHASE2_HEX_CORRIDOR_LENGTH_SCALE + PHASE2_HEX_WALL_SPAWN_BEATS;
    }
    hex.walls.push(...makePhaseTwoHexZigzagWalls(pattern));
    return PHASE2_HEX_ZIGZAG_SLOTS * PHASE2_HEX_WALL_SPAWN_BEATS;
  }

  function startPhaseTwoHexMode(pattern) {
    if (!pattern || pattern.mode === 'hex') return;
    const ram = pattern.ram;
    const heroAngle = ram && Number.isFinite(ram.heroAngle) ? ram.heroAngle : Math.PI / 2;
    pattern.mode = 'hex';
    pattern.platforms = [];
    pattern.hex = {
      elapsed: 0,
      heroAngle,
      orbitRadius: PHASE2_HEX_ORBIT_RADIUS,
      walls: [],
      spawnBeats: 0,
      nextSpawnBeats: PHASE2_HEX_WALL_SPAWN_BEATS,
      nextGapAngle: heroAngle,
      nextCorridorStreamId: 1,
      wallsUntilSplit: 2 + Math.floor(pattern.random() * 2),
      wallsUntilSpecial: 2,
      specialPatternIndex: 0,
      bulletPattern: null,
      orbs: [],
      playerHits: 0,
      whirlpool: null,
    };
    pattern.ram = null;
    playBossSfx('phase2HexWall');
    keys.clear();
    positionPhaseTwoHexHero(pattern);
  }

  function resolvePhaseTwoHexExitImpact(pattern) {
    if (!pattern || pattern.mode !== 'ram' || !pattern.ram || pattern.ram.impacted) return;
    const ram = pattern.ram;
    ram.impacted = true;
    playBossSfx('phase2Slam');
    ram.shockAge = 0;
    pattern.hex = null;
    pattern.platforms = [];
    pattern.elapsed = PHASE2_PITFALL_ENTRY_MS;
    restorePhaseTwoSquareArena(true);
    keys.clear();
    heroMove.x = 0;
    heroMove.y = 0;
  }

  function finishPhaseTwoHexExit(pattern) {
    if (phase2PitfallPattern !== pattern) return;
    phase2PitfallPattern = null;
    phase2Attacks = [];
    phase2BurstActive = false;
    phase2BurstSize = 1;
    phase2BurstsAtSize = 0;
    phase2DashZone = 'top';
    phase2ClawPatternStopped = false;
    phase2ClawRushMode = true;
    resetPhaseTwoRushEntities();
    phase2RushDebugQueued = false;
    nextPhase2AttackBeat = beatIndex + 1;
    keys.clear();
  }

  function beginPhaseTwoHexExit(pattern) {
    if (!pattern || pattern.mode !== 'hex' || !pattern.hex) return false;
    pattern.mode = 'ram';
    pattern.hex.walls = [];
    pattern.hex.orbs = [];
    pattern.hex.bulletPattern = null;
    pattern.ram = {
      elapsed: 0,
      impacted: false,
      shockAge: -1,
      returning: false,
      returnStarted: false,
      exitToSquare: true,
    };
    phase2ClawPatternStopped = true;
    phase2Attacks = [];
    phase2BurstActive = false;
    keys.clear();
    heroMove.x = 0;
    heroMove.y = 0;
    const board = getBoardRect();
    const center = phaseTwoHexCenter();
    const targetX = board.left + center.x * board.width / canvas.width;
    const targetY = board.top + center.y * board.height / canvas.height;
    const started = phase2Avatar && typeof phase2Avatar.slamTo === 'function'
      ? phase2Avatar.slamTo(targetX, targetY, PHASE2_HEX_RAM_MS)
      : false;
    if (!started) resolvePhaseTwoHexExitImpact(pattern);
    return true;
  }

  function resolvePhaseTwoHexRamImpact(pattern) {
    if (!pattern || pattern.mode !== 'ram' || !pattern.ram || pattern.ram.impacted) return;
    if (pattern.ram.exitToSquare) {
      resolvePhaseTwoHexExitImpact(pattern);
      return;
    }
    const ram = pattern.ram;
    ram.impacted = true;
    playBossSfx('phase2Slam');
    ram.shockAge = 0;
    const arenaSize = expandPhaseTwoHexArenaToViewport();
    const center = phaseTwoHexCenter();
    const dx = hero.x - center.x;
    const dy = hero.y - center.y;
    ram.heroAngle = Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : Math.PI / 2;
    ram.heroFromX = hero.x;
    ram.heroFromY = hero.y;
    ram.heroTargetX = center.x + Math.cos(ram.heroAngle) * PHASE2_HEX_ORBIT_RADIUS;
    ram.heroTargetY = center.y + Math.sin(ram.heroAngle) * PHASE2_HEX_ORBIT_RADIUS;
    setArena({
      x: center.x,
      y: center.y,
      width: arenaSize,
      height: arenaSize,
      rotation: 0,
      shape: 'ellipse',
    }, 520);
  }

  function beginPhaseTwoHexRam(pattern) {
    if (!pattern || pattern.mode !== 'dropper' || !phase2Avatar) return false;
    pattern.mode = 'ram';
    pattern.platforms = pattern.platforms.filter((platform) => platform.resolved);
    pattern.ram = {
      elapsed: 0,
      impacted: false,
      shockAge: -1,
      returning: false,
      returnStarted: false,
    };
    keys.clear();
    heroMove.x = 0;
    heroMove.y = 0;
    const board = getBoardRect();
    playBossSfx('phase2Ram');
    const center = phaseTwoHexCenter();
    const started = phase2Avatar.slamTo(
      board.left + center.x * board.width / canvas.width,
      board.top + center.y * board.height / canvas.height,
      PHASE2_HEX_RAM_MS
    );
    if (!started) resolvePhaseTwoHexRamImpact(pattern);
    return true;
  }

  function updatePhaseTwoHexRam(pattern, dt, fallDt) {
    const ram = pattern.ram;
    if (!ram) return;
    ram.elapsed += dt;
    pattern.platforms.forEach((platform) => {
      platform.ageBeats += fallDt / beatMs * PHASE2_PITFALL_APPROACH_SCALE;
    });
    pattern.platforms = pattern.platforms.filter((platform) => platform.ageBeats / platform.travelBeats < 1.16);
    if (!ram.impacted && ram.elapsed >= PHASE2_HEX_RAM_MS * 0.74) {
      resolvePhaseTwoHexRamImpact(pattern);
    }
    if (!ram.impacted) return;
    if (ram.exitToSquare) {
      ram.shockAge += dt;
      if (!ram.returnStarted && (!phase2Avatar || !phase2Avatar.slamming) && ram.shockAge >= 180) {
        ram.returnStarted = true;
        ram.returning = !!phase2Avatar &&
          phase2Avatar.dashHome(getBoardRect(), PHASE2_BOSS_RETURN_DASH_MS);
      }
      if (ram.returnStarted && (!ram.returning || !phase2Avatar || !phase2Avatar.dashing) &&
          ram.shockAge >= 620) {
        finishPhaseTwoHexExit(pattern);
      }
      return;
    }
    ram.shockAge += dt;
    const push = smoothstep(ram.shockAge / 460);
    hero.x = ram.heroFromX + (ram.heroTargetX - ram.heroFromX) * push;
    hero.y = ram.heroFromY + (ram.heroTargetY - ram.heroFromY) * push;
    if (!ram.returnStarted && phase2Avatar && !phase2Avatar.slamming && ram.shockAge >= 180) {
      ram.returnStarted = true;
      ram.returning = phase2Avatar.dashHome(getBoardRect(), PHASE2_BOSS_RETURN_DASH_MS);
    }
    if (ram.returnStarted && (!ram.returning || !phase2Avatar.dashing) && ram.shockAge >= 620) {
      startPhaseTwoHexMode(pattern);
    }
  }

  function updatePhaseTwoHexBulletPattern(pattern, dt) {
    const hex = pattern.hex;
    const bulletPattern = hex.bulletPattern;
    const beatStep = dt / beatMs;
    if (bulletPattern) {
      bulletPattern.ageBeats += beatStep;
      bulletPattern.spawnBeats += beatStep;
      while (
        bulletPattern.wavesSpawned < PHASE2_HEX_ORB_WAVES &&
        bulletPattern.spawnBeats >= bulletPattern.spawnIntervalBeats
      ) {
        bulletPattern.spawnBeats -= bulletPattern.spawnIntervalBeats;
        spawnPhaseTwoHexOrbWave(pattern, bulletPattern);
      }
    }

    let shadowOrbs = 0;
    for (const orb of hex.orbs) {
      orb.ageBeats += beatStep;
      const position = phaseTwoHexOrbPosition(orb);
      const active = orb.ageBeats >= 0 && orb.ageBeats <= orb.travelBeats;
      if (active && !orb.hit) {
        const damageCenter = heroBodyCenterWorld();
        const damageRect = {
          left: damageCenter.x - 2.5,
          top: damageCenter.y - 2.5,
          right: damageCenter.x + 2.5,
          bottom: damageCenter.y + 2.5,
        };
        const hitDistance = segmentRectDistance(
          orb.previousX,
          orb.previousY,
          position.x,
          position.y,
          damageRect
        );
        if (hitDistance <= orb.radius) {
          orb.hit = true;
          pattern.impactAge = 0;
          damagePlayer(PHASE2_HEX_ORB_DAMAGE * (bpm / PHASE2_BPM_MIN));
          playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
          if (hp <= 0) die();
        }
      }
      if (active && phaseTwoHexHeroTouchesOrbShadow(orb, position)) shadowOrbs++;
      orb.previousX = position.x;
      orb.previousY = position.y;
    }
    hex.orbs = hex.orbs.filter((orb) => orb.ageBeats / orb.travelBeats < 1.04);
    if (
      bulletPattern &&
      bulletPattern.ageBeats >= bulletPattern.durationBeats &&
      hex.orbs.length === 0
    ) {
      hex.bulletPattern = null;
      phaseTwoHexPatternPassed(pattern);
    }
    return shadowOrbs;
  }

  function startPhaseTwoHexWhirlpoolCast(pattern) {
    const hex = pattern && pattern.hex;
    if (!hex || hex.whirlpool) return false;
    const direction = pattern.random() < 0.5 ? -1 : 1;
    hex.whirlpool = {
      ageBeats: 0,
      active: false,
      flow: 0,
      targetDirection: direction,
      transitionAgeBeats: -1,
      transitionFrom: 0,
      spinAngle: hex.heroAngle,
      playerHits: 0,
      exitTriggered: false,
    };
    if (phase2Avatar && phase2Avatar.state) {
      phase2Avatar.state.impact = 1;
      phase2Avatar.state.impactAge = 0;
    }
    playBossSfx('phase2Whirlpool');
    return true;
  }

  function registerPhaseTwoHexPlayerHit() {
    const pattern = phase2PitfallPattern;
    const hex = pattern && pattern.mode === 'hex' ? pattern.hex : null;
    if (!hex) return;
    if (!hex.whirlpool) {
      hex.playerHits++;
      if (hex.playerHits >= 2) startPhaseTwoHexWhirlpoolCast(pattern);
      return;
    }
    const whirlpool = hex.whirlpool;
    if (!whirlpool.active || whirlpool.exitTriggered) return;
    whirlpool.playerHits++;
    if (whirlpool.playerHits >= 2) {
      whirlpool.exitTriggered = true;
      beginPhaseTwoHexExit(pattern);
    }
  }

  function phaseTwoHexPatternPassed(pattern) {
    const whirlpool = pattern && pattern.hex && pattern.hex.whirlpool;
    if (
      !whirlpool ||
      !whirlpool.active ||
      whirlpool.transitionAgeBeats >= 0 ||
      pattern.random() >= 1 / 3
    ) return;
    whirlpool.transitionFrom = whirlpool.flow;
    whirlpool.targetDirection *= -1;
    whirlpool.transitionAgeBeats = 0;
  }

  function updatePhaseTwoHexWhirlpool(pattern, dt) {
    const whirlpool = pattern.hex.whirlpool;
    if (!whirlpool) return;
    const beatStep = dt / beatMs;
    whirlpool.ageBeats += beatStep;
    if (!whirlpool.active) {
      const progress = clamp01(whirlpool.ageBeats / PHASE2_HEX_WHIRLPOOL_CAST_BEATS);
      whirlpool.flow = whirlpool.targetDirection * smoothstep(progress);
      if (progress >= 1) {
        whirlpool.active = true;
        whirlpool.flow = whirlpool.targetDirection;
      }
    } else if (whirlpool.transitionAgeBeats >= 0) {
      whirlpool.transitionAgeBeats += beatStep;
      const progress = clamp01(
        whirlpool.transitionAgeBeats / PHASE2_HEX_WHIRLPOOL_SWITCH_BEATS
      );
      whirlpool.flow = progress < 0.5
        ? whirlpool.transitionFrom * (1 - smoothstep(progress * 2))
        : whirlpool.targetDirection * smoothstep((progress - 0.5) * 2);
      if (progress >= 1) {
        whirlpool.flow = whirlpool.targetDirection;
        whirlpool.transitionAgeBeats = -1;
      }
    } else {
      whirlpool.flow = whirlpool.targetDirection;
    }
    whirlpool.spinAngle = phaseTwoHexNormalizeAngle(
      whirlpool.spinAngle + whirlpool.flow * beatStep * 0.24
    );
  }

  function updatePhaseTwoHexPattern(pattern, dt) {
    const hex = pattern.hex;
    if (!hex) return;
    hex.elapsed += dt;
    updatePhaseTwoHexWhirlpool(pattern, dt);
    hex.spawnBeats += dt / beatMs;
    while (hex.spawnBeats >= hex.nextSpawnBeats && hex.walls.length < 16) {
      if (hex.wallsUntilSpecial <= 0) {
        hex.spawnBeats -= hex.nextSpawnBeats;
        hex.nextSpawnBeats = startPhaseTwoHexSpecialPattern(pattern);
        hex.wallsUntilSpecial = 1 + Math.floor(pattern.random() * 2);
        hex.wallsUntilSplit = Math.max(1, hex.wallsUntilSplit);
        continue;
      }
      if (hex.wallsUntilSplit <= 0 && hex.walls.length > 3) break;
      hex.spawnBeats -= hex.nextSpawnBeats;
      if (hex.wallsUntilSplit <= 0) {
        hex.walls.push(...makePhaseTwoHexSplitPair(pattern));
        playBossSfx('phase2HexWall');
        hex.wallsUntilSplit = 2 + Math.floor(pattern.random() * 3);
        hex.wallsUntilSpecial -= 2;
        hex.nextSpawnBeats = PHASE2_HEX_SPLIT_FOLLOWUP_BEATS + PHASE2_HEX_WALL_SPAWN_BEATS;
      } else {
        hex.walls.push(makePhaseTwoHexWall(pattern));
        playBossSfx('phase2HexWall');
        hex.wallsUntilSplit--;
        hex.wallsUntilSpecial--;
        hex.nextSpawnBeats = PHASE2_HEX_WALL_SPAWN_BEATS;
      }
    }
    let shadowWalls = 0;
    for (const wall of hex.walls) {
      wall.ageBeats += dt / beatMs;
      if (wall.impactAge >= 0) wall.impactAge += dt;
      const radius = phaseTwoHexWallRadius(wall);
      const previousInnerEdge = wall.previousRadius - wall.thickness / 2;
      const innerEdge = radius - wall.thickness / 2;
      const shadowDepth = wall.kind === 'corridor-stream'
        ? PHASE2_HEX_CORRIDOR_SHADOW_WIDTH
        : wall.thickness * PHASE2_HEX_WALL_SHADOW_SCALE;
      const shadowInnerEdge = innerEdge - shadowDepth;
      const gapWidth = phaseTwoHexWallGapWidth(wall, radius);
      if (
        !wall.resolved &&
        phaseTwoHexHeroTouchesWallShadow(wall, shadowInnerEdge, innerEdge, gapWidth)
      ) {
        shadowWalls++;
      }
      if (!wall.resolved && previousInnerEdge > hex.orbitRadius && innerEdge <= hex.orbitRadius) {
        wall.resolved = true;
        const safe = !phaseTwoHexWallTouchesDamageHitbox(wall, gapWidth);
        if (safe) {
          pattern.safeAge = 0;
        } else {
          wall.hit = true;
          wall.impactAge = 0;
          pattern.impactAge = 0;
          const damageScale = Number.isFinite(wall.damageScale) ? wall.damageScale : 1;
          damagePlayer(PHASE2_HEX_WALL_DAMAGE * damageScale * (bpm / PHASE2_BPM_MIN));
          playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
          if (hp <= 0) die();
        }
        if (wall.patternEnd) phaseTwoHexPatternPassed(pattern);
      }
      wall.previousRadius = radius;
    }
    const shadowOrbs = updatePhaseTwoHexBulletPattern(pattern, dt);
    const shadowVpWeight = shadowWalls +
      shadowOrbs * PHASE2_HEX_ORB_VP_SCALE;
    if (shadowVpWeight > 0) {
      addVp(VP_PER_BEAT * shadowVpWeight * dt / beatMs, true);
    }
    hex.walls = hex.walls.filter((wall) => phaseTwoHexWallProgress(wall) < 1.06);
  }

  function updatePhaseTwoPitfallPattern(dt) {
    const pattern = phase2PitfallPattern;
    if (!pattern) return;
    const fallDt = dt * PHASE2_PITFALL_TIME_SCALE;
    pattern.elapsed += fallDt;
    pattern.tunnelOffset += fallDt * (bpm / PHASE2_BPM_MIN);
    if (pattern.impactAge >= 0) pattern.impactAge += dt;
    if (pattern.safeAge >= 0) pattern.safeAge += dt;
    if (pattern.mode === 'ram') {
      updatePhaseTwoHexRam(pattern, dt, fallDt);
      return;
    }
    if (pattern.mode === 'hex') {
      updatePhaseTwoHexPattern(pattern, dt);
      return;
    }
    if (pattern.elapsed >= PHASE2_PITFALL_ENTRY_MS * 0.58) {
      pattern.spawnBeats = Math.min(
        PHASE2_PITFALL_SPAWN_BEATS,
        pattern.spawnBeats + fallDt / beatMs
      );
      const incoming = pattern.platforms.some((platform) => !platform.resolved);
      if (!incoming && pattern.spawnBeats >= PHASE2_PITFALL_SPAWN_BEATS && pattern.platforms.length < 5) {
        pattern.spawnBeats -= PHASE2_PITFALL_SPAWN_BEATS;
        pattern.platforms.push(makePhaseTwoPitfallPlatform(pattern));
      }
    }
    let shadowEdges = 0;
    for (const platform of pattern.platforms) {
      platform.ageBeats += fallDt / beatMs * PHASE2_PITFALL_APPROACH_SCALE;
      if (platform.hitAge >= 0) platform.hitAge += dt;
      if (phaseTwoPitfallHeroOnShadowEdge(platform)) shadowEdges++;
      const depth = platform.ageBeats / platform.travelBeats;
      if (!platform.resolved && depth >= PHASE2_PITFALL_HIT_DEPTH) {
        platform.resolved = true;
        if (phaseTwoPitfallHeroInGap(platform)) {
          pattern.safeAge = 0;
          pattern.dodgedPlanes++;
          if (pattern.dodgedPlanes >= PHASE2_PITFALL_DODGES_TO_HEX) {
            beginPhaseTwoHexRam(pattern);
          }
        } else {
          platform.hit = true;
          platform.hitAge = 0;
          pattern.impactAge = 0;
          damagePlayer(PHASE2_PITFALL_DAMAGE * (bpm / PHASE2_BPM_MIN));
          playBossSfx('damage', { step: phaseOneDamageSfxCount++ });
          if (hp <= 0) die();
        }
      }
    }
    if (shadowEdges > 0) {
      addVp(VP_PER_BEAT * shadowEdges * dt / beatMs, true);
    }
    pattern.platforms = pattern.platforms.filter((platform) => platform.ageBeats / platform.travelBeats < 1.16);
  }

  function beginDebugPhaseTwoPitfall() {
    if (!phase2CombatStarted || !canvas) return false;
    phase2PitfallPattern = null;
    const started = startPhaseTwoPitfallPattern();
    const launchHex = started && phase2HexDebugQueued;
    phase2HexDebugQueued = false;
    if (launchHex) {
      beginPhaseTwoHexRam(phase2PitfallPattern);
    } else if (started && phase2Avatar && typeof phase2Avatar.dashHome === 'function') {
      phase2Avatar.dashHome(getBoardRect(), PHASE2_BOSS_RETURN_DASH_MS);
    }
    return started;
  }

  function debugPhaseTwoPitfall() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    phase2PitfallDebugQueued = true;
    if (!phase2AvatarStarted) skipPhaseTwoTransition();
    if (phase2CombatStarted) beginDebugPhaseTwoPitfall();
  }

  function debugPhaseTwoHexFall() {
    if (!active) return;
    if (phase !== PHASE.SECOND) {
      if (phase !== PHASE.ACTIVE) skipToActive();
      startSecondPhase();
    }
    phase2HexDebugQueued = true;
    phase2PitfallDebugQueued = true;
    if (!phase2AvatarStarted) skipPhaseTwoTransition();
    if (phase2CombatStarted) beginDebugPhaseTwoPitfall();
  }

  function updateSecondPhase(dt) {
    for (const a of fadingAttacks) a.fadeTime += dt;
    fadingAttacks = fadingAttacks.filter((a) => a.fadeTime < a.fadeDuration);
    if (phase2TowerPattern || phase2DoomPattern) {
      heroMove.x = 0;
      heroMove.y = 0;
    } else if (phase2PitfallPattern) {
      updatePhaseTwoPitfallMovement(dt);
    } else if (phase2SwordRingPattern || (phase2GridSpecial && phase2GridSpecial.struck)) {
      heroMove.x = 0;
      heroMove.y = 0;
      if (phase2GridSpecial && phase2GridSpecial.struck) updatePhaseTwoGridHop(dt);
    } else {
      updateMovement(dt);
    }
    if (phase2AvatarStarted) {
      if (phase2Avatar) {
        phase2Avatar.update(dt, getBoardRect(), {
          onEmerge: () => playBossSfx('phase2Emerge'),
          onSlam: () => {
            playBossSfx('phase2Slam');
            if (phase2TowerPattern && phase2TowerPattern.mode === 'slam') {
              resolvePhaseTwoTowerImpact();
            }
            if (phase2TowerPattern && phase2TowerPattern.mode === 'doom-slam') {
              resolvePhaseTwoDoomSlam();
            }
            if (phase2DoomPattern && phase2DoomPattern.mode === 'ending-slam') {
              resolvePhaseTwoDoomEndSlam();
            }
            if (phase2PitfallPattern && phase2PitfallPattern.mode === 'ram') {
              resolvePhaseTwoHexRamImpact(phase2PitfallPattern);
            }
            if (overlay) {
              overlay.classList.remove('avatar-slammed');
              void overlay.offsetWidth;
              overlay.classList.add('avatar-slammed');
            }
          },
        });
        if (!phase2SquareArenaLocked) updatePhaseTwoLayout(phase2Avatar.layoutProgress);
      }
      if (phase2Avatar && phase2Avatar.layoutProgress >= 1) {
        beginPhaseTwoCombat();
        if (phase2DebugClawQueued && phase2Attacks.length === 0) onPhaseTwoBeat(beatIndex);
        updatePhaseTwoTempo(dt);
        if (phase2TowerPattern) {
          updatePhaseTwoTowerPattern(dt);
          updateCombat(dt);
          return;
        }
        if (phase2DoomPattern) {
          updatePhaseTwoDoomPattern(dt);
          updateCombat(dt);
          return;
        }
        if (phase2PitfallPattern) {
          updatePhaseTwoPitfallPattern(dt);
          updateCombat(dt);
          return;
        }
        if (phase2MayhemPattern) {
          updatePhaseTwoMayhemPattern(dt);
          updateCombat(dt);
          return;
        }
        updatePhaseTwoGridSpecial(dt);
        updatePhaseTwoAttacks(dt);
        updatePhaseTwoRushEyes(dt);
        if (phase2ClawPatternStopped && phase2GridSpecial && phase2GridSpecial.settled &&
            !phase2TileRuinPattern && phase2Avatar && !phase2Avatar.dashing) {
          startPhaseTwoTileRuinPattern();
        }
        updatePhaseTwoTileRuinPattern(dt);
        updatePhaseTwoSwordRingPattern(dt);
        updateCombat(dt);
      }
      return;
    }
    if (phaseTime < PHASE2_ARENA_TRANSITION) return;
    updatePhaseTwoBeams(dt);
    if (phaseTwoRitualComplete()) startAvatarPhaseTwo();
  }

  function phaseTwoPentagramCenter(bounds) {
    const ritualTime = phaseTwoRitualTime();
    const launch = Math.min(1, ritualTime / PHASE2_ORB_LAUNCH);
    const hand = {
      x: bounds.left + bounds.width * 0.53,
      y: bounds.top + bounds.height * 0.10,
    };
    const sky = {
      x: bounds.left + bounds.width * 0.50,
      y: Math.max(54, bounds.top - bounds.height * 0.42),
    };
    const p = easeOutCubic(launch);
    return {
      hand,
      sky,
      x: hand.x + (sky.x - hand.x) * p,
      y: hand.y + (sky.y - hand.y) * p,
      launched: launch >= 1,
    };
  }

  function updatePhaseTwoBeams(dt) {
    const r = phase2Ritual;
    if (!r) return;
    const c = r.cocoon;
    for (const beam of r.beams) {
      beam.age += dt;
      if (!beam.hit && beam.age >= P2_BEAM_REACH) {
        beam.hit = true;
        playBossSfx('phase2Feed', { kind: beam.kind });
        if (beam.kind === 'body') {
          r.marks.push({
            fx: beam.fx, fy: beam.fy, radius: beam.radius, seed: beam.seed,
            prev: r.marks.length - 1, at: phaseTime,
          });
          if (r.marks.length === r.targets.length) r.floodStart = phaseTime;
        } else {
          // A feeding strike: the orb visibly swells and rings at the impact.
          c.hits = Math.min(P2_COCOON_HITS, c.hits + 1);
          c.pulse = Math.min(1.6, c.pulse + 0.55);
          c.ripples.push({ angle: beam.angle, t: 0 });
        }
      }
    }
    r.beams = r.beams.filter((beam) => beam.age < P2_BEAM_TOTAL + 240);

    // Launch the next stream. During the body sweep every third stream tithes
    // to the seed of the cocoon at her centre, growing it slowly; once she is
    // fully enveloped, every stream goes for the centre and the mass swells
    // fast — until it swallows the pentagram and there is nothing left to
    // fire from.
    while (phaseTime >= r.nextBeamAt && r.pentFade > 0.5) {
      const curve = (18 + r.rng() * 96) * (r.rng() < 0.5 ? -1 : 1);
      const bodyLeft = r.nextTarget < r.targets.length;
      const feeding = (!bodyLeft || r.launchCount % 3 === 2) && c.nextAngle < c.feedAngles.length;
      if (feeding) {
        r.beams.push({ kind: 'cocoon', angle: c.feedAngles[c.nextAngle++], seed: r.rng() * Math.PI * 2, curve, age: 0, hit: false });
      } else if (bodyLeft) {
        const t = r.targets[r.nextTarget++];
        r.beams.push({ kind: 'body', fx: t.fx, fy: t.fy, radius: t.radius, seed: t.seed, curve, age: 0, hit: false });
      } else {
        break;
      }
      r.launchCount++;
      if (bodyLeft) {
        const progress = r.nextTarget / r.targets.length;
        r.nextBeamAt += 300 - easeOutCubic(progress) * 170;
      } else {
        r.nextBeamAt += 340 - (c.nextAngle / c.feedAngles.length) * 160;
      }
    }

    r.floodP = r.floodStart ? smoothstep((phaseTime - r.floodStart) / P2_FLOOD_MS) : 0;
    c.spin += dt * 0.00042;
    c.pulse = Math.max(0, c.pulse - dt / 640);
    // Once the pentagram is swallowed the mass no longer needs feeding — it
    // finishes swelling on its own momentum.
    if (r.pentFade <= 0.5) c.hits = Math.min(P2_COCOON_HITS, c.hits + dt / 400);
    c.p += (c.hits / P2_COCOON_HITS - c.p) * (1 - Math.exp(-dt / 850));
    // The seed fades in with its first few feedings — barely visible at
    // first, purely a product of what the streams have poured into it.
    c.alpha = smoothstep(c.p / 0.06);
    updatePhaseTwoMassAudio(c.p, r.floodP);
    for (const rip of c.ripples) rip.t += dt / 900;
    c.ripples = c.ripples.filter((rip) => rip.t < 1);
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
        if (landAt < 0) {
          landAt = clock;
          playBossSfx('introLand');
        }
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
      if (strike && strike.finalHit && strike.impacted) return;
      if (bpm >= WRATH_MAX) {
        startSecondPhase();
        return;
      }
      updateAttacks(dt);
      updateMovement(dt);
      updateCombat(dt);
    } else if (phase === PHASE.SECOND) {
      updateSecondPhase(dt);
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

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Picks a fresh movement for a slot: random, but never the same as the other
  // slot (and not the one that just finished), so the two are always different.
  function pickMovement(avoidA, avoidB) {
    const choices = MOVEMENT_SEQUENCE.filter((n) => n !== avoidA && n !== avoidB);
    const pool = choices.length ? choices : MOVEMENT_SEQUENCE;
    return pool[(Math.random() * pool.length) | 0];
  }

  function makeMovementSlot(name, nextBeat) {
    return { id: nextSlotId++, name, wave: 0, done: false, nextBeat };
  }

  function slotHasAttacks(slot) {
    return attacks.some((a) => a.slotId === slot.id);
  }

  function updateNextAttackBeat() {
    let next = Infinity;
    for (const slot of activeSet) {
      if (!slotHasAttacks(slot)) next = Math.min(next, slot.nextBeat == null ? beatIndex : slot.nextBeat);
    }
    nextAttackBeat = next;
  }

  // Refills an exhausted duo slot in place with a new random pattern.
  function refillSlot(slot, nextBeat) {
    const other = activeSet.find((s) => s !== slot);
    slot.name = pickMovement(other ? other.name : null, slot.name);
    slot.wave = 0;
    slot.done = false;
    slot.nextBeat = nextBeat;
  }

  // Makes activeSet match the current mode: one slot below COMBINE_WRATH (drawn
  // from the no-repeat single queue), two distinct slots at/above it.
  function ensureActiveSet(combining, beat) {
    if (combining) {
      while (activeSet.length < 2) {
        const taken = activeSet.length ? activeSet[0].name : null;
        activeSet.push(makeMovementSlot(pickMovement(taken, null), beat));
      }
    } else if (activeSet.length === 0) {
      if (singleQueue.length === 0) {
        singleQueue = shuffled(MOVEMENT_SEQUENCE);
        if (lastSingle && singleQueue.length > 1 && singleQueue[0] === lastSingle) {
          const t = singleQueue[0]; singleQueue[0] = singleQueue[1]; singleQueue[1] = t;
        }
      }
      activeSet = [makeMovementSlot(singleQueue.shift(), beat)];
      lastSingle = activeSet[0].name;
    }
  }

  function spawnMovementWave(name, wave, board, slot) {
    const attackStart = attacks.length;
    let total;
    if (name === 'tentacles') total = spawnTentacleWave(wave, board);
    else if (name === 'xrays') total = spawnXRayWave(wave, board);
    else if (name === 'bloodspiral') total = spawnBloodSpiralWave(wave, board);
    else if (name === 'checkerboard') total = spawnCheckerboardWave(wave, board);
    else if (name === 'portalbarrage') total = spawnPortalBarrageWave(wave, board);
    else if (name === 'sideportals') total = spawnSidePortalsWave(wave, board);
    else total = spawnPentagramWave(wave, board);
    if (!total) return total;
    for (let i = attackStart; i < attacks.length; i++) {
      attacks[i].slotId = slot.id;
      attacks[i].movement = name;
    }
    if (attacks.length > attackStart) {
      const spawned = attacks.slice(attackStart);
      const chargeBeats = spawned.reduce((longest, attack) => (
        attack.state === 'telegraph'
          ? Math.max(longest, attack.stretchBeats || 1)
          : longest
      ), 0);
      if (chargeBeats > 0) {
        playBossSfx('shadowCharge', { movement: name, beats: chargeBeats });
      }
    }
    return total;
  }

  // Spawns one wave from each active movement. Below COMBINE_WRATH a single
  // pattern plays through and then the next is pulled; at/above it, two patterns
  // run at once and whichever exhausts its waves is immediately replaced by a
  // fresh random one, so two are always live. Returns whether anything spawned.
  function spawnWave(beat) {
    const board = getBoardRect();
    if (!board || !board.width) return false;
    const combining = bpm >= COMBINE_WRATH;
    ensureActiveSet(combining, beat);
    let spawned = false;
    for (const m of activeSet) {
      if (slotHasAttacks(m)) continue;
      if (beat < (m.nextBeat == null ? beat : m.nextBeat)) continue;
      if (m.done) {
        if (combining) refillSlot(m, beat); // swap the spent slot for a new pattern
        else continue;                // single mode: wait for the slot to clear below
      }
      const total = spawnMovementWave(m.name, m.wave, board, m);
      if (!total) continue; // stage not measurable yet; retry this movement next beat
      m.wave++;
      if (m.wave >= total) m.done = true;
      m.nextBeat = Infinity;
      spawned = true;
    }
    return spawned;
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
      holdBeats: TENTACLE_HOLD_BEATS,
      holdAgeBeats: 0,
      fire: 0,
      fireBeats: TENTACLE_FIRE_BEATS,
      restBeats: TENTACLE_REST_BEATS,
    });
  }

  // One wave of the X-ray movement: a single expanding cross at a scripted spot.
  function spawnXRayWave(waveIndex, board) {
    const spec = X_PATTERN[waveIndex];
    const sx = board.width / BOARD;
    const sy = board.height / BOARD;
    const openLo = BORDER;
    const openHi = BOARD - BORDER;
    const span = openHi - openLo;
    const scale = (sx + sy) / 2;
    attacks.push({
      type: 'xRay',
      state: 'telegraph',
      cx: board.left + (openLo + spec.fx * span) * sx,
      cy: board.top + (openLo + spec.fy * span) * sy,
      armLen: span * spec.armFrac * scale,
      armWidth: X_ARM_WIDTH * scale,
      clipX0: board.left + openLo * sx,
      clipX1: board.left + openHi * sx,
      clipY0: board.top + openLo * sy,
      clipY1: board.top + openHi * sy,
      stretch: 0,
      stretchBeats: X_ARM_BEATS,
      holdBeats: X_HOLD_BEATS,
      holdAgeBeats: 0,
      fire: 0,
      fireBeats: X_FIRE_BEATS,
      restBeats: X_REST_BEATS,
    });
    return X_PATTERN.length;
  }

  // The blood-spiral movement: a three-phase finale on the arena centre.
  //   0 orbit out to the rim then smoothly back in (one wave)
  //   1 beams drop onto the pentagram tips and trace its arms
  //   2 a shadow closes in from the edges, then a huge sky beam floods
  //     everything outside the pentagram seal
  function spawnBloodSpiralWave(waveIndex, board) {
    const sx = board.width / BOARD;
    const sy = board.height / BOARD;
    const openLo = BORDER;
    const openHi = BOARD - BORDER;
    const clip = {
      clipX0: board.left + openLo * sx,
      clipX1: board.left + openHi * sx,
      clipY0: board.top + openLo * sy,
      clipY1: board.top + openHi * sy,
    };
    const base = {
      state: 'telegraph',
      cx: board.left + board.width / 2,
      cy: board.top + board.height / 2,
      beamWidth: BLOOD_BEAM_WIDTH * ((sx + sy) / 2),
      stretch: 0,
      holdBeats: BLOOD_HOLD_BEATS,
      holdAgeBeats: 0,
      fire: 0,
      restBeats: BLOOD_REST_BEATS,
      ...clip,
    };
    // Reach past the opening's farthest corner so the arms clear every edge.
    const maxRadius = Math.hypot((clip.clipX1 - clip.clipX0) / 2, (clip.clipY1 - clip.clipY0) / 2) * 1.05;

    if (waveIndex === 0) {
      attacks.push({
        ...base, type: 'bloodSpiral', maxRadius, spiralIntro: true,
        stretchBeats: BLOOD_TELEGRAPH_BEATS, fireBeats: BLOOD_FIRE_BEATS * 2, // out + back
      });
    } else if (waveIndex === 1) {
      attacks.push({
        ...base, type: 'pentLine', starV: pentVerts(board),
        stretchBeats: BLOOD_TELEGRAPH_BEATS, fireBeats: BLOOD_LINE_FIRE_BEATS,
      });
    } else {
      // A jagged shadow tide rolls in from the edges (tideEdgeR) and halts on the
      // pentagram's outline; `seed` gives each cast its own ragged front.
      attacks.push({
        ...base, type: 'outsidePent', starPoly: pentStarPoly(board),
        seed: Math.random() * 100, tideEdgeR: maxRadius,
        stretchBeats: BLOOD_OUTSIDE_TELE_BEATS, fireBeats: BLOOD_OUTSIDE_FIRE_BEATS,
      });
    }
    return 3;
  }

  function openMetrics(board) {
    const sx = board.width / BOARD;
    const sy = board.height / BOARD;
    const openLo = BORDER;
    const openHi = BOARD - BORDER;
    return {
      sx, sy,
      scale: (sx + sy) / 2,
      x0: board.left + openLo * sx,
      x1: board.left + openHi * sx,
      y0: board.top + openLo * sy,
      y1: board.top + openHi * sy,
      w: (openHi - openLo) * sx,
      h: (openHi - openLo) * sy,
    };
  }

  function spawnCheckerboardWave(waveIndex, board) {
    const m = openMetrics(board);
    attacks.push({
      type: 'checkerboard',
      state: 'telegraph',
      parity: waveIndex % 2,
      cols: CHECKER_COLS,
      rows: CHECKER_ROWS,
      x0: m.x0, y0: m.y0, w: m.w, h: m.h,
      tileW: m.w / CHECKER_COLS,
      tileH: m.h / CHECKER_ROWS,
      seed: 13.7 + waveIndex * 5.31 + Math.random() * 20,
      stretch: 0,
      stretchBeats: CHECKER_GROW_BEATS,
      holdBeats: CHECKER_HOLD_BEATS,
      holdAgeBeats: 0,
      fire: 0,
      fireBeats: CHECKER_FIRE_BEATS,
      restBeats: CHECKER_REST_BEATS,
    });
    return CHECKER_CYCLES * 2;
  }

  function spawnPortalBarrageWave(waveIndex, board) {
    const m = openMetrics(board);
    const heroV = {
      x: board.left + hero.x * m.sx,
      y: board.top + hero.y * m.sy,
    };
    const moving = Math.hypot(heroMove.x, heroMove.y) > 0.001;
    const target = {
      x: Math.max(m.x0 + 18, Math.min(m.x1 - 18, heroV.x + (moving ? heroMove.x * PORTAL_AIM_LEAD * m.scale : 0))),
      y: Math.max(m.y0 + 18, Math.min(m.y1 - 18, heroV.y + (moving ? heroMove.y * PORTAL_AIM_LEAD * m.scale : 0))),
    };
    const perim = 2 * (m.w + m.h);
    const offset = ((waveIndex * 0.37) % 1) * perim;
    const count = PORTAL_BARRAGE_COUNT;
    for (let i = 0; i < count; i++) {
      const p = (offset + perim * i / count) % perim;
      const origin = pointAroundOpenRect(m, p, 34 * m.scale);
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const bend = (i % 2 ? -1 : 1) * (42 + ((i / 3) | 0) % 3 * 12) * m.scale;
      const midX = (origin.x + target.x) / 2;
      const midY = (origin.y + target.y) / 2;
      attacks.push({
        type: 'portalCurve',
        state: i === 0 ? 'telegraph' : 'waiting',
        waitAgeBeats: 0,
        waitBeats: i * PORTAL_CURVE_DELAY_BEATS,
        x0: origin.x, y0: origin.y,
        cx: midX + (-dy / len) * bend,
        cy: midY + (dx / len) * bend,
        x1: target.x + ux * PORTAL_CURVE_OVERSHOOT * m.scale,
        y1: target.y + uy * PORTAL_CURVE_OVERSHOOT * m.scale,
        angle: Math.atan2(dy, dx),
        radius: 12 * m.scale,
        width: PORTAL_CURVE_WIDTH * m.scale,
        stretch: 0,
        stretchBeats: PORTAL_CURVE_TELE_BEATS,
        holdBeats: PORTAL_CURVE_HOLD_BEATS,
        holdAgeBeats: 0,
        fire: 0,
        fireBeats: PORTAL_CURVE_FIRE_BEATS,
        restBeats: PORTAL_CURVE_REST_BEATS,
      });
    }
    return PORTAL_BARRAGE_WAVES;
  }

  function spawnSidePortalsWave(waveIndex, board) {
    if (waveIndex > 1) return 2;
    const m = openMetrics(board);
    const bullets = [];
    const random = mulberry32(0x51d000 + ((fightClock | 0) & 0xffff));
    const phase = waveIndex % 2;
    const makeBullet = (side, i) => {
      const left = side === 'left';
      const topHalf = phase === 0 ? !left : left;
      const laneTop = topHalf ? m.y0 : m.y0 + m.h * 0.5;
      const laneH = m.h * 0.5;
      const dir = left ? 1 : -1;
      const gap = laneH / (SIDE_PORTAL_BULLETS_PER_SIDE + 1);
      const laneIndex = i % 2 === 0 ? i / 2 : SIDE_PORTAL_BULLETS_PER_SIDE - 1 - ((i - 1) / 2);
      bullets.push({
        side,
        x0: left ? m.x0 - 24 * m.scale : m.x1 + 24 * m.scale,
        y0: laneTop + gap * (laneIndex + 1),
        dir,
        delay: i * ((SIDE_PORTAL_FIRE_BEATS - 2) / Math.max(1, SIDE_PORTAL_BULLETS_PER_SIDE - 1)) + random() * 0.04,
        speed: (m.w + 80 * m.scale) / (6.2 + random() * 0.35),
        amp: 0,
        wave: 0,
        phase: 0,
      });
    };
    for (let i = 0; i < SIDE_PORTAL_BULLETS_PER_SIDE; i++) {
      makeBullet('left', i);
      makeBullet('right', i);
    }
    attacks.push({
      type: 'sidePortals',
      state: 'telegraph',
      phase,
      x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1, w: m.w, h: m.h,
      scale: m.scale,
      bullets,
      stretch: 0,
      stretchBeats: SIDE_PORTAL_TELE_BEATS,
      holdBeats: SIDE_PORTAL_HOLD_BEATS,
      holdAgeBeats: 0,
      fire: 0,
      fireBeats: SIDE_PORTAL_FIRE_BEATS,
      restBeats: SIDE_PORTAL_REST_BEATS,
    });
    return 2;
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
      holdBeats: ATTACK_HOLD_BEATS,
      holdAgeBeats: 0,
      fire: 0,               // 0..1 beam life
      fireBeats: 1,
      restBeats: ATTACK_REST_BEATS,
    });
  }

  function updateAttacks(dt) {
    for (const a of attacks) {
      if (a.state === 'waiting') {
        a.waitAgeBeats += dt / beatMs;
        if (a.waitAgeBeats >= a.waitBeats) {
          a.state = 'telegraph';
          a.stretch = 0;
          playBossSfx('shadowCharge', {
            attack: a.type,
            movement: a.movement,
            beats: a.stretchBeats || 1,
          });
        }
      } else if (a.state === 'telegraph') {
        // The snake advances at the beat's pace, reaching the far edge in one beat.
        a.stretch += dt / (beatMs * a.stretchBeats);
        if (a.stretch >= 1) {
          a.stretch = 1;
          a.state = 'armed';
          a.holdAgeBeats = 0;
        }
      } else if (a.state === 'armed') {
        // Hold fully telegraphed for a fixed, tempo-relative beat fraction, then
        // strike. This decouples the strike from beat boundaries, so the lead
        // time (telegraph + hold) is identical every wave instead of swinging by
        // up to a beat depending on where the telegraph happened to finish.
        a.holdAgeBeats += dt / beatMs;
        if (a.holdAgeBeats >= a.holdBeats) {
          a.state = 'fire';
          a.fire = 0;
          playBossSfx('cultistAttack', { attack: a.type, movement: a.movement });
        }
      } else if (a.state === 'fire') {
        a.fire += dt / (beatMs * a.fireBeats);
        if (a.fire >= 1) { a.fire = 1; a.state = 'done'; }
      }
    }
    const liveSpirals = attacks.filter((attack) =>
      attack.type === 'bloodSpiral' && attack.state === 'fire'
    );
    if (liveSpirals.length) updateBloodSpiralAudio(liveSpirals);
    else stopBloodSpiralAudio();
    const completedSlots = [];
    for (const slot of activeSet) {
      const owned = attacks.filter((a) => a.slotId === slot.id);
      if (owned.length && owned.every((a) => a.state === 'done')) {
        // Each movement carries its own breathing room (tentacles rest less than
        // the pentagram barrage); all attacks in a wave share the same value.
        const rest = owned[0].restBeats != null ? owned[0].restBeats : ATTACK_REST_BEATS;
        completedSlots.push({ slot, nextBeat: beatIndex + rest });
      }
    }
    if (completedSlots.length) {
      const completedIds = new Set(completedSlots.map((entry) => entry.slot.id));
      attacks = attacks.filter((a) => !completedIds.has(a.slotId));
      const combining = bpm >= COMBINE_WRATH;
      let singleNextBeat = null;
      for (const { slot, nextBeat } of completedSlots) {
        slot.nextBeat = nextBeat;
        if (slot.done) registerCompletedPhaseOnePattern();
        if (!combining && slot.done) singleNextBeat = nextBeat;
      }
      if (singleNextBeat != null) {
        activeSet = activeSet.filter((slot) => !completedIds.has(slot.id));
        if (activeSet.length) updateNextAttackBeat();
        else nextAttackBeat = singleNextBeat;
      } else {
        updateNextAttackBeat();
      }
    }
  }

  function renderPhaseTwoGridChannel() {
    const special = phase2GridSpecial;
    if (!special || special.settled || !canvas) return;
    const board = getBoardRect();
    if (!board.width || !board.height) return;
    const timeline = phaseTwoGridTimeline(special);
    const channelP = smoothstep(timeline.channelP);
    const impactAge = timeline.impactAge;
    if (channelP <= 0 && impactAge < 0) return;
    const layout = special.layout;
    const sx = board.width / canvas.width;
    const sy = board.height / canvas.height;
    const vx = (x) => board.left + x * sx;
    const vy = (y) => board.top + y * sy;
    const left = vx(layout.left);
    const right = vx(layout.right);
    const top = vy(layout.top);
    const bottom = vy(layout.bottom);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    actx.save();
    actx.beginPath();
    actx.rect(left, top, right - left, bottom - top);
    actx.clip();

    if (!special.struck) {
      const points = 52;
      actx.fillStyle = 'rgba(4, 5, 7, ' + (0.18 + channelP * 0.56).toFixed(3) + ')';
      actx.beginPath();
      for (let i = 0; i < points; i++) {
        const angle = i / points * Math.PI * 2;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const tx = dx > 0 ? (right - cx) / dx : (left - cx) / dx;
        const ty = dy > 0 ? (bottom - cy) / dy : (top - cy) / dy;
        const edgeDistance = Math.min(Math.abs(tx), Math.abs(ty));
        const ragged = 0.91 + Math.sin(i * 8.31 + special.seed) * 0.055
          + Math.sin(i * 2.17 - special.seed * 0.7) * 0.035;
        const edgeLock = smoothstep((channelP - 0.82) / 0.18);
        const reach = edgeDistance * Math.min(1, channelP * 1.08) * (ragged + (1 - ragged) * edgeLock);
        const x = cx + dx * reach;
        const y = cy + dy * reach;
        if (i === 0) actx.moveTo(x, y); else actx.lineTo(x, y);
      }
      actx.closePath();
      actx.fill();
    }

    const guideAlpha = special.struck ? 0 : smoothstep((channelP - 0.32) / 0.68);
    if (guideAlpha > 0) {
      actx.globalAlpha = guideAlpha * (0.48 + Math.sin(clock * 0.025) * 0.12);
      actx.strokeStyle = '#8f1618';
      actx.lineWidth = 2 + channelP * 2;
      actx.shadowColor = 'rgba(190, 16, 20, 0.8)';
      actx.shadowBlur = 8;
      for (let col = 1; col < layout.cols; col++) {
        const x = vx(layout.left + col * layout.cellW);
        actx.beginPath();
        actx.moveTo(x, cy - (cy - top) * channelP);
        actx.lineTo(x, cy + (bottom - cy) * channelP);
        actx.stroke();
      }
      for (let row = 1; row < layout.rows; row++) {
        const y = vy(layout.top + row * layout.cellH);
        actx.beginPath();
        actx.moveTo(cx - (cx - left) * channelP, y);
        actx.lineTo(cx + (right - cx) * channelP, y);
        actx.stroke();
      }
      actx.shadowBlur = 0;
    }

    if (impactAge >= 0 && impactAge < PHASE2_GRID_IMPACT_MS) {
      const p = impactAge / PHASE2_GRID_IMPACT_MS;
      const flash = 1 - smoothstep(p);
      actx.globalCompositeOperation = 'screen';
      actx.globalAlpha = flash * 0.24;
      actx.fillStyle = '#fff8ee';
      actx.fillRect(left, top, right - left, bottom - top);
      actx.globalCompositeOperation = 'source-over';
      actx.globalAlpha = 0.95 * flash;
      actx.strokeStyle = '#ff2a20';
      actx.lineWidth = 8 * (1 - p) + 2;
      for (let col = 1; col < layout.cols; col++) {
        const x = vx(layout.left + col * layout.cellW);
        actx.beginPath(); actx.moveTo(x, top); actx.lineTo(x, bottom); actx.stroke();
      }
      for (let row = 1; row < layout.rows; row++) {
        const y = vy(layout.top + row * layout.cellH);
        actx.beginPath(); actx.moveTo(left, y); actx.lineTo(right, y); actx.stroke();
      }
    }
    actx.restore();
  }

  function phaseTwoTileViewportRect(index) {
    if (!phase2GridSpecial || !canvas) return null;
    const layout = phase2GridSpecial.layout;
    const tile = layout.tiles[index];
    const board = getBoardRect();
    if (!tile || !board || !board.width) return null;
    const gap = phase2GridSpecial.cutGap || Math.min(48, Math.max(30, Math.min(layout.cellW, layout.cellH) * 0.34));
    const sx = board.width / canvas.width;
    const sy = board.height / canvas.height;
    const width = Math.max(4, (layout.cellW - gap) * sx);
    const height = Math.max(4, (layout.cellH - gap) * sy);
    const cx = board.left + tile.x * sx;
    const cy = board.top + tile.y * sy;
    return { left: cx - width / 2, top: cy - height / 2, right: cx + width / 2, bottom: cy + height / 2, width, height, cx, cy };
  }

  function tracePhaseTwoRuinTile(rect, seed, pulse) {
    const steps = 7;
    const jag = 4 + pulse * 3;
    actx.beginPath();
    for (let edge = 0; edge < 4; edge++) {
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const noise = Math.sin(seed + edge * 11.7 + i * 7.3 + clock * 0.012) * jag;
        let x;
        let y;
        if (edge === 0) { x = rect.left + rect.width * p; y = rect.top + Math.abs(noise); }
        else if (edge === 1) { x = rect.right - Math.abs(noise); y = rect.top + rect.height * p; }
        else if (edge === 2) { x = rect.right - rect.width * p; y = rect.bottom - Math.abs(noise); }
        else { x = rect.left + Math.abs(noise); y = rect.bottom - rect.height * p; }
        if (edge === 0 && i === 0) actx.moveTo(x, y); else actx.lineTo(x, y);
      }
    }
    actx.closePath();
  }

  function phaseTwoRuinBeamGeometry(rect, targetIndex) {
    const avatar = phase2Avatar && phase2Avatar.state && phase2Avatar.state.avatar;
    if (!avatar) return null;
    const x0 = avatar.x + (rect.cx < avatar.x ? -1 : 1) * avatar.size * 0.045;
    const y0 = avatar.y - avatar.size * 0.08;
    const dx = rect.cx - x0;
    const dy = rect.cy - y0;
    const length = Math.hypot(dx, dy) || 1;
    const bendSign = Math.sin(targetIndex * 17.13 + phase2TileRuinPattern.seed) >= 0 ? 1 : -1;
    const bend = Math.min(125, length * 0.20) * bendSign;
    return {
      x0,
      y0,
      cx: (x0 + rect.cx) / 2 - dy / length * bend,
      cy: (y0 + rect.cy) / 2 + dx / length * bend,
      x1: rect.cx,
      y1: rect.cy,
    };
  }

  function phaseTwoRuinBeamPoint(beam, t) {
    const u = 1 - t;
    return {
      x: u * u * beam.x0 + 2 * u * t * beam.cx + t * t * beam.x1,
      y: u * u * beam.y0 + 2 * u * t * beam.cy + t * t * beam.y1,
    };
  }

  function tracePhaseTwoRuinBeam(beam, reach) {
    const steps = Math.max(5, Math.ceil(20 * reach));
    actx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const point = phaseTwoRuinBeamPoint(beam, reach * i / steps);
      if (i === 0) actx.moveTo(point.x, point.y); else actx.lineTo(point.x, point.y);
    }
  }

  function renderPhaseTwoTileRuinPattern() {
    const pattern = phase2TileRuinPattern;
    if (!pattern || pattern.state === 'done' || !phase2Avatar) return;
    const avatar = phase2Avatar.state && phase2Avatar.state.avatar;
    if (!avatar) return;
    const telegraph = pattern.state === 'telegraph';
    const fire = pattern.state === 'fire';
    if (!telegraph && !fire) return;
    const progress = telegraph
      ? Math.min(1, pattern.elapsedBeats / PHASE2_TILE_RUIN_TELEGRAPH_BEATS)
      : 1;
    const fireP = fire ? Math.min(1, pattern.elapsedBeats / PHASE2_TILE_RUIN_FIRE_BEATS) : 0;
    actx.save();
    for (let i = 0; i < pattern.targets.length; i++) {
      const rect = phaseTwoTileViewportRect(pattern.targets[i]);
      if (!rect) continue;
      const pulse = 0.82 + Math.sin(clock * 0.028 + i * 2.4 + pattern.seed) * 0.18;
      if (telegraph) {
        const red = Math.round(38 + progress * 112);
        actx.globalAlpha = (0.30 + progress * 0.62) * pulse;
        tracePhaseTwoRuinTile(rect, pattern.seed + i * 13.1, progress);
        actx.fillStyle = 'rgb(' + red + ', 5, 12)';
        actx.fill();
        actx.strokeStyle = 'rgba(235, 28, 24, ' + (0.42 + progress * 0.48).toFixed(3) + ')';
        actx.lineWidth = 1.5 + progress * 2;
        actx.stroke();
        // Four arms crawl from the tile's corners and meet as a complete X at impact.
        actx.globalAlpha = 0.45 + progress * 0.50;
        actx.strokeStyle = '#9e4fd0';
        actx.lineWidth = 3 + progress * 3;
        actx.lineCap = 'round';
        const arms = [
          [rect.left, rect.top, rect.cx, rect.cy],
          [rect.right, rect.top, rect.cx, rect.cy],
          [rect.left, rect.bottom, rect.cx, rect.cy],
          [rect.right, rect.bottom, rect.cx, rect.cy],
        ];
        for (const arm of arms) {
          actx.beginPath();
          actx.moveTo(arm[0], arm[1]);
          actx.lineTo(arm[0] + (arm[2] - arm[0]) * progress, arm[1] + (arm[3] - arm[1]) * progress);
          actx.stroke();
        }
      } else if (fire) {
        const beam = phaseTwoRuinBeamGeometry(rect, pattern.targets[i]);
        if (!beam) continue;
        const reach = easeInQuad(Math.min(1, fireP / 0.72));
        const life = 1 - smoothstep((fireP - 0.76) / 0.24);
        actx.globalAlpha = life;
        actx.lineCap = 'round';
        actx.strokeStyle = '#e2221b';
        actx.lineJoin = 'round';
        actx.lineWidth = 22;
        tracePhaseTwoRuinBeam(beam, reach);
        actx.stroke();
        actx.strokeStyle = '#020203';
        actx.lineWidth = 13;
        tracePhaseTwoRuinBeam(beam, reach);
        actx.stroke();
        actx.strokeStyle = 'rgba(126, 18, 24, 0.42)';
        actx.lineWidth = 2;
        tracePhaseTwoRuinBeam(beam, reach);
        actx.stroke();
        const head = phaseTwoRuinBeamPoint(beam, reach);
        actx.fillStyle = '#090104';
        actx.strokeStyle = '#ff3026';
        actx.lineWidth = 3;
        actx.beginPath(); actx.arc(head.x, head.y, 8 + (1 - reach) * 5, 0, Math.PI * 2); actx.fill(); actx.stroke();
        if (fireP >= 0.72) {
          const impact = 1 - smoothstep((fireP - 0.72) / 0.20);
          actx.globalCompositeOperation = 'screen';
          actx.globalAlpha = impact * 0.38;
          actx.fillStyle = '#fff1e8';
          actx.fillRect(rect.left, rect.top, rect.width, rect.height);
          actx.globalCompositeOperation = 'source-over';
        }
      }
    }
    actx.restore();
  }

  function renderPhaseTwoSwordFlash(x, y, progress) {
    const flare = Math.sin(Math.min(1, progress) * Math.PI);
    const radius = 15 + flare * 25;
    actx.save();
    actx.translate(x, y);
    actx.globalCompositeOperation = 'lighter';
    actx.globalAlpha = 0.35 + flare * 0.65;
    actx.strokeStyle = '#fff3ed';
    actx.fillStyle = '#ff3128';
    actx.shadowColor = '#f21e18';
    actx.shadowBlur = 18;
    actx.lineWidth = 2.5;
    actx.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 8;
      const arm = i % 2 === 0 ? radius : radius * 0.18;
      const px = Math.cos(angle) * arm;
      const py = Math.sin(angle) * arm;
      if (i === 0) actx.moveTo(px, py); else actx.lineTo(px, py);
    }
    actx.closePath();
    actx.fill();
    actx.stroke();
    actx.restore();
  }

  function renderPhaseTwoSwordGuard(pattern, geometry) {
    const swapP = smoothstep(Math.min(1, pattern.guardSwapAge / 80));
    const scale = 0.78 + swapP * 0.22 + Math.sin(Math.min(1, pattern.guardSwapAge / 140) * Math.PI) * 0.06;
    actx.save();
    actx.translate(geometry.guardX, geometry.guardY);
    actx.rotate(Math.atan2(geometry.guardDirectionY, geometry.guardDirectionX) + Math.PI / 2);
    actx.translate(0, 8);
    actx.scale(scale, scale);
    actx.globalAlpha = 0.92;
    actx.lineCap = 'round';
    actx.lineJoin = 'round';
    actx.shadowColor = 'rgba(255, 235, 185, 0.88)';
    actx.shadowBlur = 14;
    const shield = actx.createLinearGradient(0, -25, 0, 10);
    shield.addColorStop(0, 'rgba(255, 255, 245, 0.92)');
    shield.addColorStop(0.38, 'rgba(255, 225, 155, 0.58)');
    shield.addColorStop(1, 'rgba(255, 205, 115, 0.08)');
    actx.fillStyle = shield;
    actx.strokeStyle = '#fff1c5';
    actx.lineWidth = 3;
    actx.beginPath();
    actx.moveTo(-39, 3);
    actx.quadraticCurveTo(-30, -22, 0, -27);
    actx.quadraticCurveTo(30, -22, 39, 3);
    actx.quadraticCurveTo(24, -8, 0, -10);
    actx.quadraticCurveTo(-24, -8, -39, 3);
    actx.closePath();
    actx.fill();
    actx.stroke();
    actx.shadowBlur = 0;
    actx.globalAlpha *= 0.72;
    actx.strokeStyle = '#d8a94d';
    actx.lineWidth = 1.2;
    actx.beginPath();
    actx.moveTo(-28, -2);
    actx.quadraticCurveTo(0, -23, 28, -2);
    actx.stroke();
    actx.restore();
  }

  function renderPhaseTwoSwordEcho(x, y, angle, scale, progress, direction, seed) {
    const pulse = 0.55 + Math.sin(progress * Math.PI * 4) * 0.18;
    const tangentX = -direction.y;
    const tangentY = direction.x;
    for (let i = 4; i >= 1; i--) {
      const phase = progress * 3.4 + seed + i * 1.73;
      const outward = i * (5 + progress * 2);
      const sideways = Math.sin(phase) * (3 + i * 1.2);
      drawPhaseTwoShadowSword(
        x + direction.x * outward + tangentX * sideways,
        y + direction.y * outward + tangentY * sideways,
        angle + Math.sin(phase * 0.8) * 0.025,
        scale * (1 + i * 0.015),
        pulse * (1 - i * 0.15)
      );
    }
  }

  function renderPhaseTwoSwordImpactFrame(pattern) {
    if (pattern.state !== 'impact' || !pattern.impactType) return;
    const p = Math.min(1, pattern.elapsed / PHASE2_SWORD_IMPACT_MS);
    const snap = 1 - smoothstep(p);
    const parry = pattern.impactType === 'parry';
    const x = pattern.impactX;
    const y = pattern.impactY;
    actx.save();
    actx.globalCompositeOperation = 'screen';
    actx.globalAlpha = snap * (parry ? 0.36 : 0.28);
    actx.fillStyle = parry ? '#fff8dc' : '#ff2118';
    actx.fillRect(0, 0, attackCanvas.width, attackCanvas.height);
    actx.globalCompositeOperation = 'source-over';

    if (!parry) {
      actx.globalAlpha = snap * 0.78;
      actx.fillStyle = '#080001';
      actx.fillRect(0, 0, attackCanvas.width, Math.max(0, y - 54));
      actx.fillRect(0, y + 54, attackCanvas.width, attackCanvas.height - y - 54);
      actx.translate(x, y);
      actx.rotate(pattern.impactSwordAngle - Math.PI / 2 - 0.08);
      actx.fillStyle = '#f22a20';
      actx.beginPath();
      actx.moveTo(-attackCanvas.width, -8);
      actx.lineTo(attackCanvas.width, -29);
      actx.lineTo(attackCanvas.width, 27);
      actx.lineTo(-attackCanvas.width, 9);
      actx.closePath();
      actx.fill();
      actx.setTransform(1, 0, 0, 1, 0, 0);
    }

    actx.translate(x, y);
    actx.globalCompositeOperation = 'lighter';
    actx.strokeStyle = parry ? '#fff4c8' : '#ff3026';
    actx.shadowColor = parry ? '#ffe7a0' : '#ed1712';
    actx.shadowBlur = 18;
    actx.lineCap = 'round';
    const rayCount = parry ? 16 : 12;
    for (let i = 0; i < rayCount; i++) {
      const angle = pattern.seed + i * Math.PI * 2 / rayCount;
      const inner = 18 + (i % 3) * 4;
      const outer = (parry ? 92 : 76) * snap * (0.72 + (i % 4) * 0.09);
      actx.globalAlpha = snap * (i % 2 ? 0.72 : 1);
      actx.lineWidth = i % 3 === 0 ? 4 : 2;
      actx.beginPath();
      actx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      actx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      actx.stroke();
    }
    actx.globalAlpha = snap;
    actx.lineWidth = parry ? 5 : 4;
    actx.beginPath();
    actx.arc(0, 0, 20 + p * (parry ? 72 : 48), 0, Math.PI * 2);
    actx.stroke();
    actx.restore();

    if (parry) {
      const recoil = 10 + smoothstep(p) * 30;
      drawPhaseTwoShadowSword(
        pattern.impactSwordX + pattern.impactOutX * recoil,
        pattern.impactSwordY + pattern.impactOutY * recoil,
        pattern.impactSwordAngle,
        pattern.impactSwordScale,
        snap
      );
      renderPhaseTwoSwordFlash(x, y, p);
    } else {
      const followThrough = smoothstep(p) * 13;
      drawPhaseTwoShadowSword(
        pattern.impactSwordX - pattern.impactOutX * followThrough,
        pattern.impactSwordY - pattern.impactOutY * followThrough,
        pattern.impactSwordAngle,
        pattern.impactSwordScale,
        snap
      );
    }
  }

  function renderPhaseTwoBossSlamCue(pattern) {
    if (pattern.state !== 'bossSlam') return;
    const flashMs = pattern.bossSlamFlashDuration ||
      phaseTwoSwordDuration(PHASE2_SWORD_PARRY_FLASH_MS, pattern, false);
    if (pattern.bossSlamFlashAge >= 0 && pattern.bossSlamFlashAge <= flashMs) {
      renderPhaseTwoSwordFlash(
        pattern.bossContactX,
        pattern.bossContactY,
        pattern.bossSlamFlashAge / flashMs
      );
    }
    if (pattern.bossSlamImpactAge < 0) return;
    const p = Math.min(1, pattern.bossSlamImpactAge / 260);
    const snap = 1 - smoothstep(p);
    const parried = pattern.bossSlamParried;
    actx.save();
    actx.globalCompositeOperation = 'screen';
    actx.globalAlpha = snap * (parried ? 0.32 : 0.24);
    actx.fillStyle = parried ? '#fff4c8' : '#f3201b';
    actx.fillRect(0, 0, attackCanvas.width, attackCanvas.height);
    actx.translate(pattern.bossContactX, pattern.bossContactY);
    actx.globalAlpha = snap;
    actx.strokeStyle = parried ? '#fff5ce' : '#ff3026';
    actx.shadowColor = parried ? '#ffe9a6' : '#ed1712';
    actx.shadowBlur = 22;
    actx.lineWidth = parried ? 6 : 4;
    actx.beginPath();
    actx.ellipse(0, 0, 34 + p * 110, 10 + p * 32, 0, 0, Math.PI * 2);
    actx.stroke();
    for (let i = 0; i < 14; i++) {
      const angle = -Math.PI + i * Math.PI * 2 / 14;
      const inner = 22;
      const outer = 58 + (i % 3) * 18 + p * 42;
      actx.globalAlpha = snap * (i % 2 ? 0.58 : 0.88);
      actx.beginPath();
      actx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner * 0.42);
      actx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer * 0.42);
      actx.stroke();
    }
    actx.restore();
  }

  function renderPhaseTwoSwordRingPattern() {
    const pattern = phase2SwordRingPattern;
    if (!pattern) return;
    const board = getBoardRect();
    if (!board || !board.width || !board.height) return;
    const geometry = phaseTwoSwordRingGeometry(pattern, pattern.activeIndex >= 0 ? pattern.activeIndex : 0);
    if (!geometry) return;
    const center = geometry.center;
    const ringRadius = geometry.ringRadius;
    const swordScale = geometry.swordScale;
    const forming = pattern.state === 'forming';
    const formP = forming
      ? smoothstep(Math.min(1, pattern.elapsed / PHASE2_SWORD_RING_FORM_MS))
      : 1;
    for (let i = 0; i < PHASE2_SWORD_DIRECTIONS.length; i++) {
      const slot = pattern.slots[i];
      if (!slot || slot.status === 'spent' ||
          (slot.status === 'active' && pattern.state === 'impact')) continue;
      let slotP = 1;
      if (slot.status === 'respawning') {
        if (slot.respawnAge < PHASE2_SWORD_RESPAWN_DELAY_MS) continue;
        slotP = smoothstep(
          (slot.respawnAge - PHASE2_SWORD_RESPAWN_DELAY_MS) / PHASE2_SWORD_RESPAWN_FORM_MS
        );
      }
      const swordGeometry = phaseTwoSwordRingGeometry(pattern, i);
      if (!swordGeometry) continue;
      const direction = PHASE2_SWORD_DIRECTIONS[i];
      const formationRadius = ringRadius * (0.82 + formP * 0.18);
      let x = center.x + direction.x * formationRadius;
      let y = center.y + direction.y * formationRadius;
      if (i === pattern.activeIndex && pattern.state === 'strike') {
        x = swordGeometry.swordX;
        y = swordGeometry.swordY;
      }
      const aim = Math.atan2(center.y - y, center.x - x);
      const alpha = formP * slotP;
      if (i === pattern.activeIndex && pattern.state === 'flash') {
        renderPhaseTwoSwordEcho(
          x,
          y,
          aim,
          swordScale,
          Math.min(1, pattern.elapsed / PHASE2_SWORD_FLASH_MS),
          direction,
          pattern.seed + i * 2.1
        );
      }
      drawPhaseTwoShadowSword(
        x,
        y,
        aim,
        swordScale * (0.72 + formP * 0.28) * (0.72 + slotP * 0.28),
        alpha
      );

      if (i === pattern.activeIndex && pattern.state === 'strike' &&
          pattern.parryFlashAge >= 0) {
        if (pattern.parryFlashAge > PHASE2_SWORD_PARRY_FLASH_MS) continue;
        const bladeX = swordGeometry.bladeTipX;
        const bladeY = swordGeometry.bladeTipY;
        renderPhaseTwoSwordFlash(
          bladeX,
          bladeY,
          pattern.parryFlashAge / PHASE2_SWORD_PARRY_FLASH_MS
        );
      }
    }

    renderPhaseTwoSwordGuard(pattern, geometry);
    renderPhaseTwoSwordImpactFrame(pattern);
    renderPhaseTwoBossSlamCue(pattern);
  }

  function renderPhaseTwoRushEye(eye, board, deathProgress) {
    const death = clamp01(deathProgress || 0);
    const deathFade = 1 - smoothstep(death);
    const appear = smoothstep(Math.min(1, eye.ageBeats / 0.55)) * deathFade;
    if (appear <= 0.001) return;
    const position = phaseTwoRushEyePosition(eye, board);
    const pulse = 0.5 + 0.5 * Math.sin(eye.ageBeats * Math.PI * 2 + eye.seed);
    actx.save();
    actx.translate(position.x, position.y);
    actx.rotate(position.angle);
    actx.globalAlpha *= deathFade;
    actx.scale(appear * (1 + death * 0.42), appear * Math.max(0.08, 1 - death * 0.88));
    actx.lineCap = 'round';
    actx.lineJoin = 'round';
    const tendrilCount = 4;
    for (let i = 0; i < tendrilCount; i++) {
      const fan = i / (tendrilCount - 1);
      const rootY = position.upward * (-10 + i * 6.5);
      const reach = 82 - fan * 29 + pulse * 2;
      const lift = position.upward * (38 + fan * 52);
      const motion = eye.tendrils && eye.tendrils[i];
      const bend = motion ? motion.bend : 0;
      const start = { x: -12 - fan * 2, y: rootY };
      const controlA = {
        x: -25 - fan * 3,
        y: rootY + position.upward * (8 + fan * 10),
      };
      const controlB = {
        x: -reach * (0.64 + fan * 0.08),
        y: rootY + lift * (0.58 + fan * 0.12),
      };
      const end = {
        x: -reach + bend * (4 + fan * 3),
        y: rootY + lift + position.upward * bend * (5 + fan * 4),
      };
      const chordX = end.x - start.x;
      const chordY = end.y - start.y;
      const chordLength = Math.hypot(chordX, chordY) || 1;
      const normalX = -chordY / chordLength;
      const normalY = chordX / chordLength;
      const points = [];
      const segments = 11;
      for (let segment = 0; segment <= segments; segment++) {
        const t = segment / segments;
        const inverse = 1 - t;
        const curveX = inverse * inverse * inverse * start.x +
          3 * inverse * inverse * t * controlA.x +
          3 * inverse * t * t * controlB.x + t * t * t * end.x;
        const curveY = inverse * inverse * inverse * start.y +
          3 * inverse * inverse * t * controlA.y +
          3 * inverse * t * t * controlB.y + t * t * t * end.y;
        const flex = Math.sin(Math.PI * t);
        const ripple = Math.sin(
          eye.ageBeats * 0.72 + eye.seed * 1.3 + i * 1.7 + t * 6.2
        ) * 1.35;
        const offset = flex * (bend * (5 + fan * 4) * t + ripple);
        const taper = Math.pow(Math.max(0, 1 - t), 0.34);
        const roughness = 0.94 + Math.sin(eye.seed * 2.1 + i * 4.3 + t * 19) * 0.06;
        points.push({
          x: curveX + normalX * offset,
          y: curveY + normalY * offset,
          width: (0.5 + 10.2 * Math.pow(1 - t, 0.62)) * taper * roughness,
        });
      }

      actx.beginPath();
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        const point = points[pointIndex];
        const before = points[Math.max(0, pointIndex - 1)];
        const after = points[Math.min(points.length - 1, pointIndex + 1)];
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        const length = Math.hypot(dx, dy) || 1;
        const x = point.x - dy / length * point.width;
        const y = point.y + dx / length * point.width;
        if (pointIndex === 0) actx.moveTo(x, y); else actx.lineTo(x, y);
      }
      for (let pointIndex = points.length - 1; pointIndex >= 0; pointIndex--) {
        const point = points[pointIndex];
        const before = points[Math.max(0, pointIndex - 1)];
        const after = points[Math.min(points.length - 1, pointIndex + 1)];
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        const length = Math.hypot(dx, dy) || 1;
        actx.lineTo(
          point.x + dy / length * point.width,
          point.y - dx / length * point.width
        );
      }
      actx.closePath();
      const flesh = actx.createLinearGradient(start.x, start.y, end.x, end.y);
      flesh.addColorStop(0, '#160a0e');
      flesh.addColorStop(0.38, '#080407');
      flesh.addColorStop(1, '#010102');
      actx.fillStyle = flesh;
      actx.fill();
      actx.strokeStyle = 'rgba(184, 20, 28, 0.9)';
      actx.lineWidth = 1.35;
      actx.stroke();

      actx.beginPath();
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        const point = points[pointIndex];
        const before = points[Math.max(0, pointIndex - 1)];
        const after = points[Math.min(points.length - 1, pointIndex + 1)];
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        const length = Math.hypot(dx, dy) || 1;
        const ridgeX = point.x - dy / length * point.width * 0.36;
        const ridgeY = point.y + dx / length * point.width * 0.36;
        if (pointIndex === 0) actx.moveTo(ridgeX, ridgeY); else actx.lineTo(ridgeX, ridgeY);
      }
      actx.strokeStyle = 'rgba(151, 83, 83, 0.18)';
      actx.lineWidth = 1.1;
      actx.stroke();

      for (let wrinkle = 2; wrinkle < points.length - 2; wrinkle += 3) {
        const point = points[wrinkle];
        const before = points[wrinkle - 1];
        const after = points[wrinkle + 1];
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length;
        const ny = dx / length;
        actx.beginPath();
        actx.moveTo(point.x - nx * point.width * 0.58, point.y - ny * point.width * 0.58);
        actx.quadraticCurveTo(
          point.x + dx / length * 1.3,
          point.y + dy / length * 1.3,
          point.x + nx * point.width * 0.48,
          point.y + ny * point.width * 0.48
        );
        actx.strokeStyle = 'rgba(210, 188, 180, 0.10)';
        actx.lineWidth = 0.8;
        actx.stroke();
      }
    }

    const eyeOpen = 0.94 + pulse * 0.06;
    actx.beginPath();
    actx.moveTo(-22, 0);
    actx.bezierCurveTo(-12, -15 * eyeOpen, 11, -16 * eyeOpen, 23, 0);
    actx.bezierCurveTo(11, 15 * eyeOpen, -12, 14 * eyeOpen, -22, 0);
    actx.closePath();
    actx.fillStyle = '#0a0508';
    actx.fill();
    actx.strokeStyle = '#d01b25';
    actx.lineWidth = 2.5;
    actx.stroke();

    actx.save();
    actx.beginPath();
    actx.moveTo(-17, 0);
    actx.bezierCurveTo(-9, -10 * eyeOpen, 10, -11 * eyeOpen, 18, 0);
    actx.bezierCurveTo(9, 10 * eyeOpen, -9, 9.5 * eyeOpen, -17, 0);
    actx.closePath();
    actx.clip();
    actx.fillStyle = '#bdb9ae';
    actx.fill();
    for (let vein = 0; vein < 6; vein++) {
      const side = vein < 3 ? -1 : 1;
      const row = vein % 3;
      const startX = side * (16 - row * 0.7);
      const startY = (row - 1) * 5.2;
      const endX = side * (8.5 + row * 0.8);
      const endY = (row - 1) * 2.6 + Math.sin(eye.seed + vein) * 1.2;
      actx.beginPath();
      actx.moveTo(startX, startY);
      actx.bezierCurveTo(
        side * 13,
        startY * 0.9,
        side * 11,
        endY + Math.sin(eye.seed * 1.7 + vein) * 2,
        endX,
        endY
      );
      actx.strokeStyle = 'rgba(116, 19, 25, 0.34)';
      actx.lineWidth = vein % 2 ? 0.65 : 0.9;
      actx.stroke();
    }
    actx.restore();

    actx.beginPath();
    actx.ellipse(3.5, 0, 8.4, 9.3 * eyeOpen, 0, 0, Math.PI * 2);
    actx.fillStyle = '#171014';
    actx.fill();
    actx.strokeStyle = 'rgba(214, 24, 34, 0.72)';
    actx.lineWidth = 1.2;
    actx.stroke();
    actx.beginPath();
    actx.ellipse(4.2, 0, 4.5 + pulse * 0.35, 7.3 * eyeOpen, 0, 0, Math.PI * 2);
    actx.fillStyle = '#ed1824';
    actx.fill();
    actx.strokeStyle = 'rgba(100, 5, 12, 0.72)';
    actx.lineWidth = 0.8;
    actx.stroke();
    actx.beginPath();
    actx.moveTo(-19, -1);
    actx.bezierCurveTo(-10, -12.5 * eyeOpen, 10, -14 * eyeOpen, 21, -1);
    actx.strokeStyle = 'rgba(2, 1, 3, 0.92)';
    actx.lineWidth = 3.2;
    actx.stroke();
    actx.strokeStyle = 'rgba(187, 23, 31, 0.68)';
    actx.lineWidth = 0.9;
    actx.stroke();
    actx.restore();
  }

  function renderPhaseTwoRushEyes() {
    if (!phase2ClawRushMode && !phase2RushDyingEyes.length) return;
    const board = getBoardRect();
    for (const eye of phase2RushDyingEyes) {
      const death = clamp01(eye.deathAge / 520);
      renderPhaseTwoRushEye(eye, board, death);
      const position = phaseTwoRushEyePosition(eye, board);
      actx.save();
      actx.globalAlpha = 1 - smoothstep(death);
      actx.strokeStyle = 'rgba(238, 32, 40, 0.88)';
      actx.lineWidth = Math.max(0.5, 2.4 * (1 - death));
      actx.beginPath();
      actx.arc(position.x, position.y, 12 + easeOutCubic(death) * 46, 0, Math.PI * 2);
      actx.stroke();
      actx.restore();
    }
    for (const eye of phase2RushEyes) renderPhaseTwoRushEye(eye, board);
  }

  function renderPhaseTwoRushOrbs() {
    if (!phase2ClawRushMode || !phase2RushOrbs.length) return;
    for (const orb of phase2RushOrbs) {
      const tail = PHASE2_RUSH_ORB_RADIUS * 1.35 + Math.sin(orb.ageBeats * 4 + orb.seed) * 2;
      const auraAlpha = 0.31 + Math.sin(orb.ageBeats * 3.1 + orb.seed) * 0.03;
      actx.save();
      actx.lineCap = 'round';
      actx.beginPath();
      actx.arc(orb.x, orb.y, PHASE2_RUSH_ORB_SHADOW_RADIUS, 0, Math.PI * 2);
      actx.fillStyle = 'rgba(20, 16, 21, ' + auraAlpha.toFixed(3) + ')';
      actx.fill();
      actx.strokeStyle = 'rgba(66, 56, 64, 0.30)';
      actx.lineWidth = 1.5;
      actx.stroke();
      actx.beginPath();
      actx.arc(orb.x, orb.y, PHASE2_RUSH_ORB_SHADOW_RADIUS * 0.72, 0, Math.PI * 2);
      actx.fillStyle = 'rgba(5, 3, 7, 0.24)';
      actx.fill();
      actx.beginPath();
      actx.moveTo(
        orb.x - orb.directionX * tail,
        orb.y - orb.directionY * tail
      );
      actx.lineTo(orb.x, orb.y);
      actx.strokeStyle = 'rgba(95, 12, 18, 0.42)';
      actx.lineWidth = PHASE2_RUSH_ORB_RADIUS * 0.7;
      actx.stroke();
      actx.beginPath();
      actx.arc(orb.x, orb.y, PHASE2_RUSH_ORB_RADIUS, 0, Math.PI * 2);
      actx.fillStyle = '#030204';
      actx.fill();
      actx.strokeStyle = '#d51d25';
      actx.lineWidth = 2;
      actx.stroke();
      actx.beginPath();
      actx.arc(
        orb.x - orb.directionX * 2,
        orb.y - orb.directionY * 2,
        PHASE2_RUSH_ORB_RADIUS * 0.34,
        0,
        Math.PI * 2
      );
      actx.fillStyle = 'rgba(95, 91, 88, 0.20)';
      actx.fill();
      actx.restore();
    }
  }

  // Clears and repaints the full-viewport attack canvas (pentagrams + beams).
  function renderAttackLayer() {
    if (!actx) return;
    attackCanvas.classList.toggle('sword-ring-active', !!phase2SwordRingPattern);
    actx.clearRect(0, 0, attackCanvas.width, attackCanvas.height);
    for (const a of fadingAttacks) {
      const fade = 1 - Math.min(1, a.fadeTime / a.fadeDuration);
      actx.save();
      actx.globalAlpha *= fade;
      renderAttack(a);
      actx.restore();
    }
    if (phase === PHASE.ACTIVE) {
      for (const a of attacks) renderAttack(a);
    } else if (phase === PHASE.SECOND) {
      for (const a of phase2Attacks) renderAttack(a, 'behind');
      renderPhaseTwoGridChannel();
      renderPhaseTwoTileRuinPattern();
      renderSecondPhaseRitual();
      renderPhaseTwoRushEyes();
      renderPhaseTwoRushOrbs();
      for (const a of phase2Attacks) {
        if (a.type === 'shadowClaw') renderAttack(a, 'front');
      }
      renderPhaseTwoSwordRingPattern();
    }
  }

  function renderAttack(a, depthLayer) {
    if (a.type === 'pentaBeam') renderPentaBeam(a);
    else if (a.type === 'tentacle') renderTentacleAttack(a);
    else if (a.type === 'xRay') renderXRay(a);
    else if (a.type === 'bloodSpiral') renderBloodSpiral(a);
    else if (a.type === 'pentLine') renderPentLine(a);
    else if (a.type === 'outsidePent') renderOutsidePent(a);
    else if (a.type === 'checkerboard') renderCheckerboard(a);
    else if (a.type === 'portalCurve') renderPortalCurve(a);
    else if (a.type === 'sidePortals') renderSidePortals(a);
    else if (a.type === 'shadowClaw') renderShadowClaw(a, depthLayer);
  }

  function clipPhaseTwoClawToArena(a, depthLayer) {
    const b = a.board;
    if (!b) return false;
    if (a.type === 'shadowClaw' && depthLayer === 'behind') return true;
    const worldW = canvas && canvas.width ? canvas.width : BOARD;
    const worldH = canvas && canvas.height ? canvas.height : BOARD;
    const insetX = BORDER * b.width / worldW;
    const insetY = BORDER * b.height / worldH;
    actx.beginPath();
    if (a.type === 'shadowClaw' && a.rushMode) {
      const right = b.left + b.width;
      const bottom = b.top + b.height;
      actx.rect(0, 0, attackCanvas.width, Math.max(0, b.top));
      actx.rect(0, bottom, attackCanvas.width, Math.max(0, attackCanvas.height - bottom));
      actx.rect(0, b.top, Math.max(0, b.left), b.height);
      actx.rect(right, b.top, Math.max(0, attackCanvas.width - right), b.height);
      actx.rect(
        b.left + insetX,
        b.top + insetY,
        Math.max(1, b.width - insetX * 2),
        Math.max(1, b.height - insetY * 2)
      );
      actx.clip();
      return true;
    }
    if (a.type === 'shadowClaw') {
      // The intentional launch can climb through the sky behind Szago, but the
      // arena's top frame remains a hidden band before it re-enters the floor.
      actx.rect(0, 0, attackCanvas.width, Math.max(0, b.top));
    }
    actx.rect(
      b.left + insetX,
      b.top + insetY,
      Math.max(1, b.width - insetX * 2),
      Math.max(1, b.height - insetY * 2)
    );
    actx.clip();
    return true;
  }

  function traceJaggedClawShape(a, progress, widthScale, layer, animated, startAt, taperAtEnd) {
    const start = clamp01(startAt || 0);
    const end = clamp01(progress);
    const span = Math.max(0, end - start);
    const detail = phase2Attacks.length >= 3 ? 30 : 42;
    const steps = Math.max(8, Math.ceil(detail * span));
    const phase = a.seed * 0.019 + layer * 8.71 + (animated ? clock * (0.0032 + layer * 0.00035) : 0);
    const left = [];
    const right = [];
    for (let i = 0; i <= steps; i++) {
      const t = start + span * i / steps;
      const p = phaseTwoClawPoint(a, t);
      const before = phaseTwoClawPoint(a, Math.max(0, t - 0.01));
      const after = phaseTwoClawPoint(a, Math.min(1, t + 0.01));
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const frontWindow = Math.max(0.035, Math.min(0.11, end * 0.22));
      const frontTaper = taperAtEnd === false ? 1 : smoothstep((end - t) / frontWindow);
      const base = phaseTwoClawWidthAt(a, t) * 0.5 * widthScale * frontTaper;
      const leftNoise = 1 + Math.sin(t * 53 + phase) * 0.16 + Math.sin(t * 127 - phase * 1.4) * 0.08;
      const rightNoise = 1 + Math.sin(t * 47 - phase * 0.9) * 0.18 + Math.sin(t * 119 + phase * 1.8) * 0.07;
      const leftTongue = Math.pow(Math.max(0, Math.sin(t * 83 + phase * 2.1)), 7) * base * 0.34;
      const rightTongue = Math.pow(Math.max(0, Math.sin(t * 79 - phase * 1.7)), 7) * base * 0.32;
      left.push({ x: p.x + nx * (base * leftNoise + leftTongue), y: p.y + ny * (base * leftNoise + leftTongue) });
      right.push({ x: p.x - nx * (base * rightNoise + rightTongue), y: p.y - ny * (base * rightNoise + rightTongue) });
    }
    const tip = phaseTwoClawPoint(a, end);
    const tipBefore = phaseTwoClawPoint(a, Math.max(0, end - 0.015));
    const tipLen = Math.hypot(tip.x - tipBefore.x, tip.y - tipBefore.y) || 1;
    const spike = 5 + Math.abs(Math.sin(phase * 2.3)) * 9;
    const tipX = tip.x + (tip.x - tipBefore.x) / tipLen * spike;
    const tipY = tip.y + (tip.y - tipBefore.y) / tipLen * spike;
    actx.beginPath();
    actx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) actx.lineTo(left[i].x, left[i].y);
    if (taperAtEnd !== false) actx.lineTo(tipX, tipY);
    for (let i = right.length - 1; i >= 0; i--) actx.lineTo(right[i].x, right[i].y);
    actx.closePath();
  }

  function fillJaggedClaw(a, progress, widthScale, layer, animated, color, startAt, taperAtEnd) {
    traceJaggedClawShape(a, progress, widthScale, layer, animated, startAt, taperAtEnd);
    actx.fillStyle = color;
    actx.fill();
  }

  function strokeJaggedClaw(a, progress, widthScale, layer, animated, color, startAt, taperAtEnd) {
    traceJaggedClawShape(a, progress, widthScale, layer, animated, startAt, taperAtEnd);
    actx.strokeStyle = color;
    actx.lineWidth = 1;
    actx.stroke();
  }

  function strokeClawTexture(a, layer, alpha, progress, startAt) {
    const start = clamp01(startAt || 0);
    const end = clamp01(progress == null ? 1 : progress);
    const span = Math.max(0, end - start);
    const detail = phase2Attacks.length >= 3 ? 21 : 30;
    const steps = Math.max(6, Math.ceil(detail * span));
    const seed = a.seed * 0.021 + layer * 9.17;
    actx.strokeStyle = 'rgba(158, 38, 31, ' + alpha.toFixed(3) + ')';
    actx.lineWidth = layer % 2 ? 1 : 1.5;
    actx.lineCap = 'round';
    actx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = start + span * i / steps;
      const p = phaseTwoClawPoint(a, t);
      const before = phaseTwoClawPoint(a, Math.max(0, t - 0.012));
      const after = phaseTwoClawPoint(a, Math.min(1, t + 0.012));
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const len = Math.hypot(dx, dy) || 1;
      const width = phaseTwoClawWidthAt(a, t);
      const offset = (Math.sin(t * (18 + layer * 3) + seed) * 0.18 + (layer - 2) * 0.10) * width;
      const x = p.x - dy / len * offset;
      const y = p.y + dx / len * offset;
      if (i === 0) actx.moveTo(x, y); else actx.lineTo(x, y);
    }
    actx.stroke();
  }

  function renderShadowClaw(a, depthLayer) {
    if (a.state === 'waiting' || a.state === 'done') return;
    const telegraph = a.state === 'telegraph' || a.state === 'armed';
    const progress = telegraph ? phaseTwoClawReach(a) : 1;
    const split = 0.49;
    const foreground = depthLayer === 'front';
    const startAt = foreground ? split : 0;
    const endAt = foreground ? progress : Math.min(progress, split);
    const taperAtEnd = foreground || progress <= split;
    if (endAt - startAt <= 0.005) return;
    actx.save();
    if (!clipPhaseTwoClawToArena(a, depthLayer)) { actx.restore(); return; }
    actx.lineCap = 'round';
    actx.lineJoin = 'round';
    const reducedDetail = phase2Attacks.length >= 3;
    if (telegraph) {
      const armed = a.state === 'armed';
      const pulse = armed ? 0.88 + Math.sin(clock * 0.035) * 0.12 : 1;
      const visibility = foreground ? 1 : 1.24;
      const outerAlpha = a.rushMode ? 0.28 : 0.18;
      const bodyAlpha = a.rushMode ? 0.52 : 0.30;
      const textureAlpha = a.rushMode ? 0.20 : 0.14;
      const outlineAlpha = a.rushMode ? 0.78 : (foreground ? 0.48 : 0.62);
      fillJaggedClaw(a, endAt, 1.10, 0, true, 'rgba(24, 25, 28, ' + (outerAlpha * pulse * visibility).toFixed(3) + ')', startAt, taperAtEnd);
      fillJaggedClaw(a, endAt, 0.94, 1, true, 'rgba(12, 13, 15, ' + (bodyAlpha * pulse * visibility).toFixed(3) + ')', startAt, taperAtEnd);
      if (!reducedDetail) {
        fillJaggedClaw(a, endAt, 0.72, 2, true, 'rgba(50, 51, 54, ' + (textureAlpha * pulse * visibility).toFixed(3) + ')', startAt, taperAtEnd);
      }
      strokeJaggedClaw(a, endAt, 1.10, 0, true, 'rgba(128, 18, 20, ' + (outlineAlpha * pulse).toFixed(3) + ')', startAt, taperAtEnd);
      const texturePasses = reducedDetail ? 1 : 3;
      for (let i = 0; i < texturePasses; i++) strokeClawTexture(a, i, 0.035 * pulse, endAt, startAt);
    } else if (a.state === 'fire') {
      const life = 1 - smoothstep((a.fire - 0.38) / 0.62);
      const snap = 1 - smoothstep(a.fire / 0.16);
      if (foreground && snap > 0) {
        const b = a.board;
        actx.globalCompositeOperation = 'screen';
        actx.globalAlpha = snap * 0.16;
        actx.fillStyle = '#ffd8ce';
        actx.fillRect(b.left, b.top, b.width, b.height);
        actx.globalCompositeOperation = 'source-over';
        actx.globalAlpha = snap * 0.34;
        fillJaggedClaw(a, endAt, 1.34, 3, false, '#ffe0d8', startAt, true);
      }
      actx.globalAlpha = Math.max(0, life);
      fillJaggedClaw(a, endAt, 1.18, 0, true, '#ff2118', startAt, taperAtEnd);
      fillJaggedClaw(a, endAt, 1.00, 1, true, '#000000', startAt, taperAtEnd);
      const texturePasses = reducedDetail ? 2 : 5;
      for (let i = 0; i < texturePasses; i++) strokeClawTexture(a, i, (0.045 + snap * 0.025) * life, endAt, startAt);
    }
    actx.restore();
  }

  function phaseTwoCrackOpenScale(crack) {
    return crack.closing ? 1 - smoothstep(crack.closeTime / PHASE2_CRACK_CLOSE_MS) : 1;
  }

  function phaseTwoCrackPolygon(crack, visual) {
    const steps = visual ? (crack.pathSteps || 56) * 2 : (crack.pathSteps || 56);
    const open = phaseTwoCrackOpenScale(crack);
    const left = [];
    const right = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = phaseTwoClawPoint(crack, t);
      const before = phaseTwoClawPoint(crack, Math.max(0, t - 0.012));
      const after = phaseTwoClawPoint(crack, Math.min(1, t + 0.012));
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const frontTaper = smoothstep((1 - t) / 0.11);
      const halfWidth = phaseTwoClawWidthAt(crack, t) * 0.5 * frontTaper * open;
      const leftJag = visual
        ? 0.84 + Math.sin(t * 53 + crack.seed * 0.031) * 0.16
          + Math.sin(t * 149 - crack.seed * 0.017) * 0.09
          + Math.pow(Math.max(0, Math.sin(t * 101 + crack.seed)), 9) * 0.28
        : 1;
      const rightJag = visual
        ? 0.83 + Math.sin(t * 47 - crack.seed * 0.027) * 0.17
          + Math.sin(t * 143 + crack.seed * 0.021) * 0.09
          + Math.pow(Math.max(0, Math.sin(t * 97 - crack.seed * 1.3)), 9) * 0.30
        : 1;
      left.push({ x: point.x + nx * halfWidth * leftJag, y: point.y + ny * halfWidth * leftJag });
      right.push({ x: point.x - nx * halfWidth * rightJag, y: point.y - ny * halfWidth * rightJag });
    }
    return left.concat(right.reverse());
  }

  function renderPhaseTwoGroundCracks() {
    const board = getBoardRect();
    if (!board || !board.width) return;
    const sx = canvas.width / board.width;
    const sy = canvas.height / board.height;
    const toCanvas = (point) => ({ x: (point.x - board.left) * sx, y: (point.y - board.top) * sy });
    if (!phase2CrackMaskCanvas) phase2CrackMaskCanvas = document.createElement('canvas');
    if (!phase2CrackEdgeCanvas) phase2CrackEdgeCanvas = document.createElement('canvas');
    let resized = false;
    for (const buffer of [phase2CrackMaskCanvas, phase2CrackEdgeCanvas]) {
      if (buffer.width !== canvas.width || buffer.height !== canvas.height) {
        buffer.width = canvas.width;
        buffer.height = canvas.height;
        resized = true;
      }
    }
    const maskCtx = phase2CrackMaskCanvas.getContext('2d');
    const edgeCtx = phase2CrackEdgeCanvas.getContext('2d');
    const closing = phase2Cracks.some((crack) => crack.closing);
    const rebuildReady = resized || !closing || clock - phase2CrackCacheBuiltAt >= BG_FRAME_MS;
    if ((phase2CrackCacheDirty || resized) && rebuildReady) {
      maskCtx.clearRect(0, 0, canvas.width, canvas.height);
      maskCtx.fillStyle = '#fff';

      // Fill every rupture into one mask first. Canvas unioning removes internal
      // borders automatically where two attack corridors intersect.
      for (const crack of phase2Cracks) {
        const polygon = phaseTwoCrackPolygon(crack, true).map(toCanvas);
        if (polygon.length < 3) continue;
        maskCtx.beginPath();
        maskCtx.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) maskCtx.lineTo(polygon[i].x, polygon[i].y);
        maskCtx.closePath();
        maskCtx.fill();
      }

      // Build a pale outer edge from the union mask itself. Internal overlap
      // contours cannot survive this dilation-minus-mask operation.
      edgeCtx.clearRect(0, 0, canvas.width, canvas.height);
      edgeCtx.globalCompositeOperation = 'source-over';
      for (const offset of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        edgeCtx.drawImage(phase2CrackMaskCanvas, offset[0], offset[1]);
      }
      edgeCtx.globalCompositeOperation = 'destination-out';
      edgeCtx.drawImage(phase2CrackMaskCanvas, 0, 0);
      edgeCtx.globalCompositeOperation = 'source-in';
      edgeCtx.fillStyle = 'rgba(190, 190, 180, 0.72)';
      edgeCtx.fillRect(0, 0, canvas.width, canvas.height);
      edgeCtx.globalCompositeOperation = 'source-over';
      phase2CrackCacheDirty = false;
      phase2CrackCacheBuiltAt = clock;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(BORDER, BORDER, Math.max(1, canvas.width - BORDER * 2), Math.max(1, canvas.height - BORDER * 2));
    ctx.clip();

    // Secondary splits live only on intact floor; the union cutout below erases
    // any part of them that would otherwise cross an open intersection.
    for (const crack of phase2Cracks) {
      const open = phaseTwoCrackOpenScale(crack);
      ctx.strokeStyle = 'rgba(22, 22, 21, ' + (0.82 * open).toFixed(3) + ')';
      ctx.lineWidth = 2;
      for (let i = 2; i < 13; i++) {
        const t = i / 14;
        const point = toCanvas(phaseTwoClawPoint(crack, t));
        const before = toCanvas(phaseTwoClawPoint(crack, Math.max(0, t - 0.014)));
        const after = toCanvas(phaseTwoClawPoint(crack, Math.min(1, t + 0.014)));
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        const length = Math.hypot(dx, dy) || 1;
        const side = i % 2 ? 1 : -1;
        const branch = phaseTwoClawWidthAt(crack, t) * sx * (0.18 + (i % 3) * 0.055) * open;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(
          point.x - dy / length * branch * side + dx / length * 5,
          point.y + dx / length * branch * side + dy / length * 5
        );
        ctx.stroke();
      }
    }

    // Remove the complete union from the floor so the animated background is
    // genuinely visible through every opening and intersection.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(phase2CrackMaskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(phase2CrackEdgeCanvas, 0, 0);
    ctx.restore();
  }

  function renderPhaseTwoCrack(crack) {
    const b = crack.board;
    if (!b) return;
    actx.save();
    if (!clipPhaseTwoClawToArena(crack)) { actx.restore(); return; }
    actx.lineCap = 'round';
    actx.lineJoin = 'round';
    // Three broken fault lines describe the damaged corridor without leaving
    // the attack's filled silhouette lying on top of the floor.
    for (let lane = -1; lane <= 1; lane++) {
      const steps = 32;
      const seed = crack.seed * 0.017 + lane * 7.31;
      actx.beginPath();
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const point = phaseTwoClawPoint(crack, t);
        const before = phaseTwoClawPoint(crack, Math.max(0, t - 0.012));
        const after = phaseTwoClawPoint(crack, Math.min(1, t + 0.012));
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        const length = Math.hypot(dx, dy) || 1;
        const width = phaseTwoClawWidthAt(crack, t);
        const offset = lane * width * (0.24 + Math.sin(t * 31 + seed) * 0.045)
          + Math.sin(t * 91 - seed) * (2.5 + Math.abs(lane));
        const x = point.x - dy / length * offset;
        const y = point.y + dx / length * offset;
        if (i === 1) actx.moveTo(x, y); else actx.lineTo(x, y);
      }
      actx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
      actx.lineWidth = lane === 0 ? 5 : 3;
      actx.stroke();
      actx.strokeStyle = lane === 0 ? 'rgba(126, 37, 30, 0.72)' : 'rgba(106, 102, 94, 0.42)';
      actx.lineWidth = 1;
      actx.stroke();
    }

    // Short forks split away from the main faults, giving the floor a broken,
    // displaced texture instead of a decorative line painted over it.
    for (let i = 1; i <= 11; i++) {
      const t = 0.10 + i * 0.072;
      const point = phaseTwoClawPoint(crack, t);
      const before = phaseTwoClawPoint(crack, Math.max(0, t - 0.015));
      const after = phaseTwoClawPoint(crack, Math.min(1, t + 0.015));
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      const normalX = -dy / length;
      const normalY = dx / length;
      const side = i % 2 ? 1 : -1;
      const branch = phaseTwoClawWidthAt(crack, t) * (0.28 + 0.18 * Math.abs(Math.sin(crack.seed + i * 2.7)));
      const midX = point.x + normalX * branch * side * 0.48 + dx / length * (i % 3 - 1) * 5;
      const midY = point.y + normalY * branch * side * 0.48 + dy / length * (i % 3 - 1) * 5;
      const endX = point.x + normalX * branch * side;
      const endY = point.y + normalY * branch * side;
      actx.beginPath();
      actx.moveTo(point.x - dx / length * 8, point.y - dy / length * 8);
      actx.lineTo(midX, midY);
      actx.lineTo(endX, endY);
      actx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      actx.lineWidth = 3;
      actx.stroke();
      actx.strokeStyle = 'rgba(128, 118, 105, 0.38)';
      actx.lineWidth = 1;
      actx.stroke();
    }

    // A few lifted floor chips catch a dim edge highlight around the fractures.
    for (let i = 0; i < 8; i++) {
      const t = 0.16 + i * 0.095;
      const point = phaseTwoClawPoint(crack, t);
      const before = phaseTwoClawPoint(crack, Math.max(0, t - 0.012));
      const after = phaseTwoClawPoint(crack, Math.min(1, t + 0.012));
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const side = i % 2 ? 1 : -1;
      const offset = phaseTwoClawWidthAt(crack, t) * (0.14 + (i % 3) * 0.055) * side;
      const x = point.x + nx * offset;
      const y = point.y + ny * offset;
      const size = 5 + Math.abs(Math.sin(crack.seed + i * 3.1)) * 7;
      actx.beginPath();
      actx.moveTo(x - dx / length * size, y - dy / length * size * 0.35);
      actx.lineTo(x + nx * size * 0.55, y + ny * size * 0.55);
      actx.lineTo(x + dx / length * size * 0.75, y + dy / length * size * 0.28);
      actx.closePath();
      actx.fillStyle = 'rgba(3, 3, 4, 0.7)';
      actx.fill();
      actx.strokeStyle = 'rgba(158, 151, 136, 0.28)';
      actx.lineWidth = 1;
      actx.stroke();
    }
    actx.restore();
  }

  function ritualBounds() {
    const sprite = cultistFallenImg && cultistFallenImg.getBoundingClientRect();
    if (sprite && sprite.width) return sprite;
    return cultistElement ? cultistElement.getBoundingClientRect() : { left: window.innerWidth / 2 - 140, top: 120, width: 280, height: 220 };
  }

  function phaseTwoBodyPoint(bounds, target) {
    return {
      x: bounds.left + bounds.width * target.fx,
      y: bounds.top + bounds.height * target.fy,
    };
  }

  function drawTiltedRitualPentagram(cx, cy, radius, alpha) {
    if (alpha <= 0 || radius <= 0) return;
    const spin = clock * 0.0018;
    const tilt = 0.34; // hard perspective angle toward the cultist
    const project = (x, y) => ({
      x: cx + x + y * 0.22,
      y: cy + y * tilt,
    });
    const outer = [];
    const inner = [];
    for (let i = 0; i < 5; i++) {
      let a = -Math.PI / 2 + spin + i * Math.PI * 2 / 5;
      outer.push(project(Math.cos(a) * radius, Math.sin(a) * radius));
      a += Math.PI / 5;
      inner.push(project(Math.cos(a) * radius * 0.43, Math.sin(a) * radius * 0.43));
    }
    const order = [0, 2, 4, 1, 3, 0];
    actx.save();
    actx.globalAlpha = alpha;
    actx.lineJoin = 'round';
    actx.lineCap = 'round';
    actx.shadowColor = 'rgba(255, 0, 0, 0.95)';
    actx.shadowBlur = 18;
    actx.strokeStyle = '#d61b18';
    actx.lineWidth = 3;
    actx.beginPath();
    actx.ellipse(cx, cy, radius * 1.08, radius * tilt * 1.08, 0.22, 0, Math.PI * 2);
    actx.stroke();
    actx.strokeStyle = '#e31b17';
    actx.lineWidth = 4;
    actx.beginPath();
    for (let i = 0; i < order.length; i++) {
      const v = outer[order[i]];
      if (i === 0) actx.moveTo(v.x, v.y); else actx.lineTo(v.x, v.y);
    }
    actx.stroke();
    actx.lineWidth = 2;
    actx.strokeStyle = '#ff5a47';
    actx.beginPath();
    for (let i = 0; i < 10; i++) {
      const v = i % 2 === 0 ? outer[i / 2] : inner[(i - 1) / 2];
      if (i === 0) actx.moveTo(v.x, v.y); else actx.lineTo(v.x, v.y);
    }
    actx.closePath();
    actx.stroke();
    actx.restore();
  }

  function drawPhaseTwoOrb(orb, formP) {
    if (formP >= 1) return;
    const vanish = 1 - smoothstep(formP);
    const pulse = 1 + Math.sin(clock * 0.024) * 0.18;
    const launch = Math.min(1, phaseTwoRitualTime() / PHASE2_ORB_LAUNCH);
    const radius = (12 + 18 * formP) * pulse;
    actx.save();
    // Wisps of shed shadow trailing along the flight path behind the orb.
    for (let k = 1; k <= 6; k++) {
      const lag = easeOutCubic(Math.max(0, launch - k * 0.05));
      const tx = orb.hand.x + (orb.sky.x - orb.hand.x) * lag;
      const ty = orb.hand.y + (orb.sky.y - orb.hand.y) * lag;
      actx.globalAlpha = vanish * Math.max(0, 0.32 - k * 0.045);
      actx.fillStyle = '#12030a';
      actx.beginPath();
      actx.arc(tx, ty, (9 - k) * pulse, 0, Math.PI * 2);
      actx.fill();
    }
    actx.globalAlpha = vanish;
    actx.shadowColor = 'rgba(255, 30, 20, 1)';
    actx.shadowBlur = 28;
    actx.fillStyle = '#ff2118';
    actx.beginPath();
    actx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
    actx.fill();
    // A blackened heart inside the red shell.
    actx.shadowBlur = 0;
    actx.fillStyle = '#180003';
    actx.beginPath();
    actx.arc(orb.x, orb.y, radius * 0.55, 0, Math.PI * 2);
    actx.fill();
    actx.strokeStyle = '#180003';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
    actx.stroke();
    actx.restore();
  }

  // One shadow stream from the sky pentagram: a curved, tapering ribbon of
  // darkness sheathed in a red aura, with gobbets of shadow flowing down its
  // length and a splat + shockwave ring where it lands.
  function drawPhaseTwoBeam(pent, bounds, board, beam) {
    const r = phase2Ritual;
    let end;
    if (beam.kind === 'body') {
      end = phaseTwoBodyPoint(bounds, beam);
    } else {
      const geo = cocoonGeometry(bounds, board);
      end = cocoonSurfacePoint(geo, r.cocoon, beam.angle);
    }
    const start = { x: pent.x, y: pent.y + 8 };
    const headT = easeOutCubic(Math.min(1, beam.age / P2_BEAM_REACH));
    const relAge = beam.age - P2_BEAM_REACH - P2_BEAM_POUR;
    const tailT = relAge <= 0 ? 0 : smoothstep(relAge / P2_BEAM_RELEASE);
    const fade = 1 - smoothstep((beam.age - P2_BEAM_TOTAL) / 240);
    // The control point bows the stream sideways and breathes a little, and a
    // travelling ripple keeps the ribbon alive along its whole length.
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const seg = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / seg;
    const ny = dx / seg;
    const bow = beam.curve + Math.sin(clock * 0.007 + beam.seed * 7) * 9;
    const cpx = (start.x + end.x) / 2 + nx * bow;
    const cpy = (start.y + end.y) / 2 + ny * bow;
    const at = (u) => {
      const v = 1 - u;
      const wave = Math.sin(u * 9 - clock * 0.02 + beam.seed) * 3 * Math.sin(u * Math.PI);
      return {
        x: v * v * start.x + 2 * v * u * cpx + u * u * end.x + nx * wave,
        y: v * v * start.y + 2 * v * u * cpy + u * u * end.y + ny * wave,
      };
    };
    actx.save();
    if (tailT < 1) {
      const steps = 16;
      const pts = [];
      for (let i = 0; i <= steps; i++) pts.push(at(tailT + (headT - tailT) * (i / steps)));
      actx.lineCap = 'round';
      actx.lineJoin = 'round';
      // Soft red aura under the whole stream.
      actx.strokeStyle = 'rgba(150, 20, 26, 0.30)';
      actx.lineWidth = 16;
      actx.shadowColor = 'rgba(255, 40, 30, 0.8)';
      actx.shadowBlur = 16;
      actx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) actx.moveTo(pts[i].x, pts[i].y); else actx.lineTo(pts[i].x, pts[i].y);
      }
      actx.stroke();
      actx.shadowBlur = 0;
      // Crimson sheath, then black core, both tapering toward the impact.
      for (let pass = 0; pass < 2; pass++) {
        actx.strokeStyle = pass === 0 ? 'rgba(88, 8, 16, 0.85)' : 'rgba(5, 1, 3, 0.95)';
        for (let i = 0; i < steps; i++) {
          const u = tailT + (headT - tailT) * (i / steps);
          actx.lineWidth = pass === 0 ? 12 - u * 5 : 8 - u * 4;
          actx.beginPath();
          actx.moveTo(pts[i].x, pts[i].y);
          actx.lineTo(pts[i + 1].x, pts[i + 1].y);
          actx.stroke();
        }
      }
      // Gobbets of shadow flowing down into the impact.
      for (let k = 0; k < 4; k++) {
        const u = (clock * 0.0011 + k * 0.27 + beam.seed * 0.13) % 1;
        if (u < tailT || u > headT) continue;
        const p = at(u);
        actx.fillStyle = '#020103';
        actx.strokeStyle = 'rgba(160, 18, 24, 0.7)';
        actx.lineWidth = 1.5;
        actx.beginPath();
        actx.arc(p.x, p.y, 3.5 + Math.sin(clock * 0.02 + k * 2.4 + beam.seed) * 1.4, 0, Math.PI * 2);
        actx.fill();
        actx.stroke();
      }
      // The searching head while the stream is still reaching down.
      if (headT < 1) {
        const head = at(headT);
        actx.shadowColor = 'rgba(255, 40, 30, 0.9)';
        actx.shadowBlur = 14;
        actx.fillStyle = '#0a0105';
        actx.beginPath();
        actx.arc(head.x, head.y, 7, 0, Math.PI * 2);
        actx.fill();
        actx.shadowBlur = 0;
      }
    }
    // Impact: a pulsing splat of shadow, one expanding red shockwave ring and
    // a few embers thrown off the moment the stream connects.
    if (beam.hit) {
      actx.globalAlpha = fade;
      const ringT = Math.min(1, (beam.age - P2_BEAM_REACH) / 320);
      if (ringT < 1) {
        actx.strokeStyle = 'rgba(255, 60, 40, ' + (0.7 * (1 - ringT)).toFixed(3) + ')';
        actx.lineWidth = 2;
        actx.beginPath();
        actx.arc(end.x, end.y, 10 + 26 * easeOutCubic(ringT), 0, Math.PI * 2);
        actx.stroke();
        actx.strokeStyle = 'rgba(230, 40, 28, ' + (0.8 * (1 - ringT)).toFixed(3) + ')';
        actx.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) {
          const a = beam.seed + k * (Math.PI / 2) + 0.4;
          const d0 = 8 + 20 * easeOutCubic(ringT);
          actx.beginPath();
          actx.moveTo(end.x + Math.cos(a) * d0, end.y + Math.sin(a) * d0);
          actx.lineTo(end.x + Math.cos(a) * (d0 + 7), end.y + Math.sin(a) * (d0 + 7));
          actx.stroke();
        }
      }
      actx.fillStyle = '#000';
      actx.strokeStyle = 'rgba(140, 10, 16, 0.8)';
      actx.lineWidth = 2;
      actx.beginPath();
      actx.arc(end.x, end.y, 9 + Math.sin(clock * 0.02 + beam.seed) * 2, 0, Math.PI * 2);
      actx.fill();
      actx.stroke();
    }
    actx.restore();
  }

  // One organic blot of shadow in mask space: a smoothly lobed blob that sags
  // downward as it settles, like tar clinging to her body.
  function drawShadowBlot(targetCtx, x, y, radius, seed, settle) {
    const points = 14;
    targetCtx.beginPath();
    for (let i = 0; i <= points; i++) {
      const a = i / points * Math.PI * 2;
      let rr = radius * (0.78
        + 0.16 * Math.sin(a * 3 + seed)
        + 0.10 * Math.sin(a * 5 + seed * 2.7)
        + 0.06 * Math.sin(a * 8 - seed));
      rr *= 1 + Math.max(0, Math.sin(a)) * 0.35 * settle; // gravity droop
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) targetCtx.moveTo(px, py); else targetCtx.lineTo(px, py);
    }
    targetCtx.closePath();
    targetCtx.fill();
  }

  function ensurePhaseTwoEngulfMask(bounds) {
    if (!phase2Ritual || !cultistFallenImg || !cultistFallenImg.complete) return false;
    const w = Math.max(1, Math.round(bounds.width));
    const h = Math.max(1, Math.round(bounds.height));
    if (phase2Ritual.maskCanvas && phase2Ritual.maskW === w && phase2Ritual.maskH === h) return true;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext('2d');
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = w;
    sampleCanvas.height = h;
    const sampleCtx = sampleCanvas.getContext('2d');
    sampleCtx.drawImage(cultistFallenImg, 0, 0, w, h);
    const data = sampleCtx.getImageData(0, 0, w, h).data;
    const alphaAt = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return 0;
      return data[(y * w + x) * 4 + 3];
    };
    for (const target of phase2Ritual.targets) {
      let tx = Math.max(0, Math.min(w - 1, Math.round(target.fx * w)));
      let ty = Math.max(0, Math.min(h - 1, Math.round(target.fy * h)));
      if (alphaAt(tx, ty) < 40) {
        let found = null;
        for (let radius = 4; radius <= 70 && !found; radius += 4) {
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
            const x = Math.max(0, Math.min(w - 1, Math.round(tx + Math.cos(a) * radius)));
            const y = Math.max(0, Math.min(h - 1, Math.round(ty + Math.sin(a) * radius)));
            if (alphaAt(x, y) >= 40) { found = { x, y }; break; }
          }
        }
        if (found) {
          tx = found.x;
          ty = found.y;
          target.fx = tx / w;
          target.fy = ty / h;
        }
      }
    }
    // Interior dressing, baked once: ember specks and thin veins that will
    // smolder red inside the engulfed silhouette.
    const random = mulberry32(0x2f4c55);
    const opaquePoint = () => {
      for (let tries = 0; tries < 400; tries++) {
        const x = (random() * w) | 0;
        const y = (random() * h) | 0;
        if (data[(y * w + x) * 4 + 3] >= 40) return { x, y };
      }
      return { x: w / 2, y: h / 2 };
    };
    const embers = [];
    for (let i = 0; i < 70; i++) {
      const p = opaquePoint();
      embers.push({
        x: p.x, y: p.y,
        r: 0.8 + random() * 1.7,
        ph: random() * Math.PI * 2,
        sp: 0.0015 + random() * 0.002,
      });
    }
    const veins = [];
    for (let i = 0; i < 7; i++) {
      const p = opaquePoint();
      const pts = [{ x: p.x, y: p.y }];
      let ang = random() * Math.PI * 2;
      for (let s = 0; s < 4; s++) {
        ang += (random() - 0.5) * 1.4;
        const len = 14 + random() * 26;
        pts.push({
          x: pts[s].x + Math.cos(ang) * len,
          y: pts[s].y + Math.sin(ang) * len * 0.7 + len * 0.3, // veins run downhill
        });
      }
      veins.push({ pts, ph: random() * Math.PI * 2 });
    }
    phase2Ritual.maskCanvas = maskCanvas;
    phase2Ritual.maskCtx = maskCtx;
    phase2Ritual.maskW = w;
    phase2Ritual.maskH = h;
    phase2Ritual.embers = embers;
    phase2Ritual.veins = veins;
    return true;
  }

  function renderPhaseTwoSpriteEngulf(bounds) {
    if (!ensurePhaseTwoEngulfMask(bounds)) return;
    const r = phase2Ritual;
    if (!r.marks.length) return;
    const mctx = r.maskCtx;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, r.maskW, r.maskH);
    // Every landed strike is a blot that blooms out, plus a sagging bridge
    // back to the previous blot so the coverage crawls contiguously along her
    // body. Once the last strike lands, the flood scales everything up until
    // the whole silhouette is claimed.
    const flood = 1 + r.floodP * 3.4;
    mctx.fillStyle = '#000';
    mctx.strokeStyle = '#000';
    mctx.lineCap = 'round';
    for (let i = 0; i < r.marks.length; i++) {
      const m = r.marks[i];
      const settle = smoothstep((phaseTime - m.at) / P2_BLOT_GROW);
      const x = m.fx * r.maskW;
      const y = m.fy * r.maskH;
      drawShadowBlot(mctx, x, y, m.radius * (0.35 + 0.65 * settle) * flood, m.seed, settle);
      if (m.prev >= 0) {
        const pm = r.marks[m.prev];
        const reach = smoothstep((phaseTime - m.at) / 420);
        if (reach > 0) {
          const px = pm.fx * r.maskW;
          const py = pm.fy * r.maskH;
          mctx.lineWidth = Math.min(m.radius, pm.radius) * 0.8 * reach * flood;
          mctx.beginPath();
          mctx.moveTo(px, py);
          mctx.quadraticCurveTo((px + x) / 2, (py + y) / 2 + 9, px + (x - px) * reach, py + (y - py) * reach);
          mctx.stroke();
        }
      }
    }
    // Trim to her silhouette.
    mctx.globalCompositeOperation = 'destination-in';
    mctx.drawImage(cultistFallenImg, 0, 0, r.maskW, r.maskH);
    // Hints of red smoldering inside the black.
    mctx.globalCompositeOperation = 'source-atop';
    mctx.lineWidth = 1.5;
    for (const vein of r.veins) {
      const a = 0.16 + 0.14 * Math.abs(Math.sin(clock * 0.0011 + vein.ph));
      mctx.strokeStyle = 'rgba(120, 10, 16, ' + a.toFixed(3) + ')';
      mctx.beginPath();
      for (let i = 0; i < vein.pts.length; i++) {
        const p = vein.pts[i];
        if (i === 0) mctx.moveTo(p.x, p.y); else mctx.lineTo(p.x, p.y);
      }
      mctx.stroke();
    }
    for (const ember of r.embers) {
      const a = 0.10 + 0.30 * Math.abs(Math.sin(clock * ember.sp + ember.ph));
      mctx.fillStyle = 'rgba(200, 24, 22, ' + a.toFixed(3) + ')';
      mctx.fillRect(ember.x - ember.r / 2, ember.y - ember.r / 2, ember.r, ember.r);
    }
    mctx.globalCompositeOperation = 'source-over';
    actx.drawImage(r.maskCanvas, bounds.left, bounds.top, bounds.width, bounds.height);
  }

  // The cocoon's footprint: it starts hugging the engulfed sprite and swells
  // into a huge orb reaching past the sky pentagram and down over half the
  // playfield, driven by how much the beams have fed it (cocoon.p).
  function cocoonGeometry(bounds, board) {
    const c = phase2Ritual.cocoon;
    const cx = bounds.left + bounds.width * 0.50;
    // The mass sinks as it swells, claiming the playfield below first; only
    // near the end of the feeding does it lunge up past the sky pentagram.
    const cy0 = bounds.top + bounds.height * 0.55;
    const cy = cy0 + bounds.height * 0.42 * c.p;
    const bottom = board ? board.top + board.height * 0.54 : cy + bounds.height * 2;
    const ryMax = Math.max(bounds.height * 0.62, cy + 30, bottom - cy);
    const rxMax = Math.max(bounds.width * 0.54, ryMax * 0.94);
    // A single feed-driven curve from a near-invisible seed to the full orb;
    // the early power keeps it tiny through the first few feedings.
    const g = 0.02 + 0.98 * Math.pow(c.p, 1.6);
    const swell = 1 + c.pulse * 0.045;
    return {
      cx, cy,
      rx: rxMax * g * swell,
      ry: ryMax * g * swell,
    };
  }

  function angleGap(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Churning surface: layered rotating lobes plus a local bulge for each
  // feeding strike still rippling through the mass.
  function cocoonSurfacePoint(geo, c, a) {
    let w = 1
      + 0.050 * Math.sin(a * 3 + c.spin * 2.1)
      + 0.035 * Math.sin(a * 5 - c.spin * 3.4)
      + 0.025 * Math.sin(a * 8 + c.spin * 1.3);
    for (const rip of c.ripples) {
      const d = angleGap(a, rip.angle);
      w += Math.exp(-d * d * 8) * (1 - rip.t) * 0.07;
    }
    return { x: geo.cx + Math.cos(a) * geo.rx * w, y: geo.cy + Math.sin(a) * geo.ry * w };
  }

  function traceCocoonPath(geo, c) {
    const steps = 72;
    actx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = cocoonSurfacePoint(geo, c, i / steps * Math.PI * 2);
      if (i === 0) actx.moveTo(p.x, p.y); else actx.lineTo(p.x, p.y);
    }
    actx.closePath();
  }

  function renderPhaseTwoCocoon(bounds, board) {
    const r = phase2Ritual;
    const c = r.cocoon;
    if (c.alpha <= 0) return;
    const geo = cocoonGeometry(bounds, board);
    const R = Math.max(geo.rx, geo.ry);
    actx.save();
    actx.globalAlpha = c.alpha;
    // The world dims as the mass claims the screen.
    actx.fillStyle = 'rgba(2, 0, 1, ' + (0.34 * c.p).toFixed(3) + ')';
    actx.fillRect(0, 0, attackCanvas.width, attackCanvas.height);
    // The mass itself: a black heart with faint red breathing at the rim.
    traceCocoonPath(geo, c);
    const grad = actx.createRadialGradient(geo.cx, geo.cy, R * 0.2, geo.cx, geo.cy, R);
    grad.addColorStop(0, '#000000');
    grad.addColorStop(0.72, '#000000');
    grad.addColorStop(0.9, '#0d0104');
    grad.addColorStop(1, '#1c0308');
    actx.fillStyle = grad;
    actx.fill();
    // Cheap layered rim glow instead of a shadow blur on this huge path.
    actx.lineJoin = 'round';
    actx.strokeStyle = 'rgba(200, 20, 24, 0.10)';
    actx.lineWidth = 26;
    actx.stroke();
    actx.strokeStyle = 'rgba(220, 30, 26, 0.16)';
    actx.lineWidth = 10;
    actx.stroke();
    // Everything inside stays inside.
    traceCocoonPath(geo, c);
    actx.clip();
    // Counter-rotating swirl bands read as the mass churning.
    for (const s of c.swirls) {
      const a0 = c.spin * s.speed * 4 + s.ph;
      actx.strokeStyle = s.red
        ? 'rgba(130, 12, 18, ' + (s.alpha * 0.8).toFixed(3) + ')'
        : 'rgba(70, 4, 10, ' + s.alpha.toFixed(3) + ')';
      actx.lineWidth = s.width * (0.5 + c.p);
      actx.beginPath();
      actx.ellipse(geo.cx, geo.cy, geo.rx * s.rf, geo.ry * s.rf * 0.82, 0, a0, a0 + s.span);
      actx.stroke();
    }
    // Ember motes dragged around inside the dark.
    for (const m of c.motes) {
      const a = m.a0 + clock * m.sp;
      const mx = geo.cx + Math.cos(a) * geo.rx * m.rf;
      const my = geo.cy + Math.sin(a) * geo.ry * m.rf;
      const al = 0.08 + 0.26 * Math.abs(Math.sin(clock * 0.0016 + m.ph));
      actx.fillStyle = 'rgba(210, 30, 24, ' + al.toFixed(3) + ')';
      actx.fillRect(mx - m.size / 2, my - m.size / 2, m.size, m.size);
    }
    // A muffled arc of red lightning deep in the mass, every so often.
    const boltPeriod = 1300;
    const boltT = (clock % boltPeriod) / boltPeriod;
    if (boltT < 0.14) {
      const boltRng = mulberry32((((clock / boltPeriod) | 0) * 2654435761) >>> 0);
      const ba = boltRng() * Math.PI * 2;
      actx.strokeStyle = 'rgba(255, 46, 32, ' + (0.38 * (1 - boltT / 0.14)).toFixed(3) + ')';
      actx.lineWidth = 1.5;
      actx.beginPath();
      actx.moveTo(geo.cx, geo.cy);
      for (let i = 1; i <= 5; i++) {
        const f = i / 5;
        const spread = (boltRng() - 0.5) * 0.5;
        actx.lineTo(
          geo.cx + Math.cos(ba + spread) * geo.rx * f * 0.9,
          geo.cy + Math.sin(ba + spread) * geo.ry * f * 0.9
        );
      }
      actx.stroke();
    }
    actx.restore();
    // Surface shockwaves spreading out from fresh feeding strikes, then the
    // rim line to keep the mass defined against the dark.
    actx.save();
    actx.globalAlpha = c.alpha;
    actx.lineWidth = 2;
    for (const rip of c.ripples) {
      const span = 0.15 + rip.t * 0.55;
      actx.strokeStyle = 'rgba(220, 40, 30, ' + ((1 - rip.t) * 0.5).toFixed(3) + ')';
      actx.beginPath();
      actx.ellipse(geo.cx, geo.cy, geo.rx * (1 + rip.t * 0.05), geo.ry * (1 + rip.t * 0.05), 0, rip.angle - span, rip.angle + span);
      actx.stroke();
    }
    traceCocoonPath(geo, c);
    actx.strokeStyle = 'rgba(150, 12, 20, 0.5)';
    actx.stroke();
    actx.restore();
  }

  function renderSecondPhaseRitual() {
    if (phase2AvatarStarted) {
      if (phase2Avatar) phase2Avatar.render(actx);
      return;
    }
    if (!phase2Ritual) return;
    const r = ritualBounds();
    const board = getBoardRect();
    const orb = phaseTwoPentagramCenter(r);
    const ritualTime = phaseTwoRitualTime();
    const formP = Math.min(1, Math.max(0, (ritualTime - PHASE2_ORB_LAUNCH) / PHASE2_PENT_FORM));
    const pentP = easeOutCubic(formP);
    const pent = { x: orb.sky.x, y: orb.sky.y };
    // The pentagram holds until the mass has been fed nearly full — then it
    // lunges up and the seal sinks into the dark.
    const c = phase2Ritual.cocoon;
    if (c.alpha > 0) {
      const swallowed = c.hits >= P2_COCOON_HITS - 3;
      phase2Ritual.pentFade += ((swallowed ? 0 : 1) - phase2Ritual.pentFade) * 0.08;
      if (phase2Ritual.pentFade < 0.01) phase2Ritual.pentFade = 0;
    }
    drawPhaseTwoOrb(orb, formP);
    // Once the mass fully covers her sprite there is nothing of the engulf
    // left to see — skip the whole mask pipeline.
    if (c.p < 0.85) renderPhaseTwoSpriteEngulf(r);
    renderPhaseTwoCocoon(r, board);
    if (phase2Ritual.pentFade > 0) {
      drawTiltedRitualPentagram(
        pent.x, pent.y,
        (52 + 94 * pentP) * (1 + Math.sin(clock * 0.01) * 0.03),
        pentP * phase2Ritual.pentFade
      );
    }
    for (const beam of phase2Ritual.beams) drawPhaseTwoBeam(pent, r, board, beam);
  }

  // The summoning pentagram: a small dark-purple five-pointed star + ring, one
  // point aimed along `angle`. `glow` (0..1) brightens it as the beam charges;
  // `fade` (0..1, default 1) scales its overall opacity so it can ease out with
  // the beam instead of blinking away when the wave ends.
  function drawAttackPentagram(x, y, radius, angle, glow, fade) {
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
    actx.globalAlpha = fade == null ? 1 : Math.max(0, Math.min(1, fade));
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
      // The beam flares at the strike, holds an instant, then eases smoothly out
      // across the rest of the beat so it never blinks away in a single frame.
      const life = 1 - smoothstep((a.fire - 0.2) / 0.8);
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
      drawAttackPentagram(a.x, a.y, a.radius, a.angle, life, life);
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

  function pointAroundOpenRect(m, p, outward) {
    const w = m.w;
    const h = m.h;
    if (p < w) return { x: m.x0 + p, y: m.y0 - outward };
    p -= w;
    if (p < h) return { x: m.x1 + outward, y: m.y0 + p };
    p -= h;
    if (p < w) return { x: m.x1 - p, y: m.y1 + outward };
    p -= w;
    return { x: m.x0 - outward, y: m.y1 - p };
  }

  function quadPoint(x0, y0, cx, cy, x1, y1, t) {
    const u = 1 - t;
    return {
      x: u * u * x0 + 2 * u * t * cx + t * t * x1,
      y: u * u * y0 + 2 * u * t * cy + t * t * y1,
    };
  }

  function nearQuadPath(px, py, x0, y0, cx, cy, x1, y1, hw, until) {
    const end = Math.max(0, Math.min(1, until == null ? 1 : until));
    if (end <= 0) return false;
    const steps = Math.max(3, Math.ceil(18 * end));
    let prev = quadPoint(x0, y0, cx, cy, x1, y1, 0);
    for (let i = 1; i <= steps; i++) {
      const t = end * (i / steps);
      const next = quadPoint(x0, y0, cx, cy, x1, y1, t);
      if (distToSeg(px, py, prev.x, prev.y, next.x, next.y) <= hw) return true;
      prev = next;
    }
    return false;
  }

  function checkerboardZone(a, vx, vy, firing) {
    if (vx < a.x0 || vx > a.x0 + a.w || vy < a.y0 || vy > a.y0 + a.h) return null;
    const col = Math.min(a.cols - 1, Math.max(0, Math.floor((vx - a.x0) / a.tileW)));
    const row = Math.min(a.rows - 1, Math.max(0, Math.floor((vy - a.y0) / a.tileH)));
    if (((col + row) & 1) !== a.parity) return null;
    if (firing) return 'live';
    const cx = a.x0 + (col + 0.5) * a.tileW;
    const cy = a.y0 + (row + 0.5) * a.tileH;
    const theta = Math.atan2(vy - cy, vx - cx);
    return Math.hypot(vx - cx, vy - cy) <= checkerTileFront(a, col, row, theta) ? 'shadow' : null;
  }

  function checkerTileNoise(a, col, row, theta) {
    const s = a.seed + col * 2.31 + row * 3.73;
    return 0.5 +
      0.28 * Math.sin(theta * 7 + s) +
      0.16 * Math.sin(theta * 13 - s * 1.9) +
      0.08 * Math.sin(theta * 19 + s * 0.7);
  }

  function checkerTileEdgeRadius(a, theta) {
    const c = Math.abs(Math.cos(theta));
    const s = Math.abs(Math.sin(theta));
    const rx = c < 1e-4 ? Infinity : (a.tileW * 0.5) / c;
    const ry = s < 1e-4 ? Infinity : (a.tileH * 0.5) / s;
    return Math.min(rx, ry);
  }

  function checkerTileFront(a, col, row, theta) {
    const g = a.state === 'armed' ? 1 : Math.max(0, Math.min(1, a.stretch));
    const n = Math.max(0, Math.min(1, checkerTileNoise(a, col, row, theta)));
    const gEff = Math.max(0, Math.min(1, g + (n - 0.5) * Math.sin(Math.PI * g) * 0.65));
    return checkerTileEdgeRadius(a, theta) * gEff;
  }

  function sidePortalBulletPos(a, b, elapsedBeats) {
    const age = elapsedBeats - b.delay;
    if (age < 0) return null;
    const x = b.x0 + b.dir * b.speed * age;
    if (x < a.x0 - 46 * a.scale || x > a.x1 + 46 * a.scale) return null;
    const travel = Math.abs(x - b.x0);
    const y = b.y0 + Math.sin(travel * b.wave + b.phase) * b.amp;
    return { x, y, age };
  }

  function sidePortalZone(a, vx, vy, firing) {
    if (!firing) return null;
    const elapsed = a.fire * a.fireBeats;
    const r = SIDE_PORTAL_BULLET_RADIUS * a.scale;
    let shadow = false;
    for (const b of a.bullets) {
      const p = sidePortalBulletPos(a, b, elapsed);
      if (!p) continue;
      if (Math.hypot(vx - p.x, vy - p.y) <= r) return 'live';
      const q = sidePortalBulletPos(a, b, elapsed + SIDE_PORTAL_SHADOW_LEN / Math.max(1, b.speed));
      if (q && distToSeg(vx, vy, p.x, p.y, q.x, q.y) <= r) shadow = true;
    }
    return shadow ? 'shadow' : null;
  }

  function strokeQuad(x0, y0, cx, cy, x1, y1, until) {
    const end = Math.max(0, Math.min(1, until == null ? 1 : until));
    const steps = Math.max(2, Math.ceil(24 * end));
    actx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = quadPoint(x0, y0, cx, cy, x1, y1, end * (i / steps));
      if (i === 0) actx.moveTo(p.x, p.y); else actx.lineTo(p.x, p.y);
    }
  }

  function renderCheckerboard(a) {
    const firing = a.state === 'fire' || a.state === 'done';
    const glow = a.state === 'armed' ? 1 : Math.max(0, Math.min(1, a.stretch));
    const life = firing ? 1 - smoothstep((a.fire - 0.2) / 0.8) : 1;
    actx.save();
    actx.beginPath();
    actx.rect(a.x0, a.y0, a.w, a.h);
    actx.clip();
    for (let row = 0; row < a.rows; row++) {
      for (let col = 0; col < a.cols; col++) {
        if (((col + row) & 1) !== a.parity) continue;
        const x = a.x0 + col * a.tileW;
        const y = a.y0 + row * a.tileH;
        const cx = x + a.tileW * 0.5;
        const cy = y + a.tileH * 0.5;
        if (firing) {
          const burst = easeOutCubic(Math.min(1, a.fire / 0.34));
          const smoke = 1 - smoothstep((a.fire - 0.35) / 0.65);
          actx.fillStyle = 'rgba(58, 3, 8, ' + (0.4 * life).toFixed(3) + ')';
          actx.fillRect(x, y, a.tileW, a.tileH);
          const grad = actx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(a.tileW, a.tileH) * (0.25 + burst * 0.75));
          grad.addColorStop(0, 'rgba(255, 215, 170, ' + (0.9 * smoke).toFixed(3) + ')');
          grad.addColorStop(0.22, 'rgba(225, 38, 22, ' + (0.86 * smoke).toFixed(3) + ')');
          grad.addColorStop(0.7, 'rgba(96, 5, 8, ' + (0.7 * life).toFixed(3) + ')');
          grad.addColorStop(1, 'rgba(30, 0, 3, 0)');
          actx.fillStyle = grad;
          actx.fillRect(x, y, a.tileW, a.tileH);
          actx.strokeStyle = 'rgba(255, 104, 64, ' + (0.6 * smoke).toFixed(3) + ')';
          actx.lineWidth = 1.5;
          for (let k = 0; k < 5; k++) {
            const th = -Math.PI / 2 + k * Math.PI * 2 / 5 + checkerTileNoise(a, col, row, k) * 0.7;
            const r0 = Math.min(a.tileW, a.tileH) * 0.12;
            const r1 = Math.min(a.tileW, a.tileH) * (0.28 + burst * (0.35 + 0.08 * k));
            actx.beginPath();
            actx.moveTo(cx + Math.cos(th) * r0, cy + Math.sin(th) * r0);
            actx.lineTo(cx + Math.cos(th) * r1, cy + Math.sin(th) * r1);
            actx.stroke();
          }
          for (let k = 0; k < 4; k++) {
            const th = k * Math.PI * 0.5 + checkerTileNoise(a, col, row, k + 8) * 1.1;
            const px = cx + Math.cos(th) * a.tileW * (0.18 + 0.22 * burst);
            const py = cy + Math.sin(th) * a.tileH * (0.18 + 0.22 * burst);
            const rr = Math.min(a.tileW, a.tileH) * (0.05 + 0.05 * checkerTileNoise(a, col, row, k + 20)) * smoke;
            actx.fillStyle = 'rgba(120, 4, 8, ' + (0.82 * smoke).toFixed(3) + ')';
            actx.beginPath(); actx.arc(px, py, rr, 0, Math.PI * 2); actx.fill();
          }
        } else {
          const steps = 24;
          actx.beginPath();
          for (let k = 0; k <= steps; k++) {
            const theta = k / steps * Math.PI * 2;
            const r = checkerTileFront(a, col, row, theta);
            const px = cx + Math.cos(theta) * r;
            const py = cy + Math.sin(theta) * r;
            if (k === 0) actx.moveTo(px, py); else actx.lineTo(px, py);
          }
          actx.closePath();
          actx.fillStyle = 'rgba(40, 4, 58, 0.36)';
          actx.fill();
          actx.strokeStyle = 'rgba(168, 84, 232, ' + (0.35 + glow * 0.5).toFixed(3) + ')';
          actx.lineWidth = 1.5;
          actx.stroke();
        }
      }
    }
    if (!firing) {
      actx.strokeStyle = 'rgba(120, 40, 170, 0.3)';
      actx.lineWidth = 1;
      for (let col = 1; col < a.cols; col++) {
        const x = a.x0 + col * a.tileW;
        actx.beginPath(); actx.moveTo(x, a.y0); actx.lineTo(x, a.y0 + a.h); actx.stroke();
      }
      for (let row = 1; row < a.rows; row++) {
        const y = a.y0 + row * a.tileH;
        actx.beginPath(); actx.moveTo(a.x0, y); actx.lineTo(a.x0 + a.w, y); actx.stroke();
      }
    }
    actx.restore();
  }

  function renderPortalCurve(a) {
    const firing = a.state === 'fire' || a.state === 'done';
    if (a.state === 'waiting') {
      const beatsWaited = a.waitAgeBeats;
      const appear = smoothstep((beatsWaited - a.waitBeats + 0.24) / 0.24);
      if (appear > 0) drawAttackPentagram(a.x0, a.y0, a.radius * (0.45 + appear * 0.55), a.angle, appear, appear);
      return;
    }
    const glow = firing ? 1 - smoothstep((a.fire - 0.18) / 0.82) : (a.state === 'armed' ? 1 : a.stretch);
    actx.save();
    actx.lineCap = 'round';
    actx.lineJoin = 'round';
    if (firing) {
      strokeQuad(a.x0, a.y0, a.cx, a.cy, a.x1, a.y1, 1);
      actx.shadowColor = 'rgba(170, 70, 235, ' + (0.85 * glow).toFixed(3) + ')';
      actx.shadowBlur = 22 * glow;
      actx.strokeStyle = 'rgba(94, 20, 150, ' + (0.7 * glow).toFixed(3) + ')';
      actx.lineWidth = a.width;
      actx.stroke();
      strokeQuad(a.x0, a.y0, a.cx, a.cy, a.x1, a.y1, 1);
      actx.strokeStyle = 'rgba(232, 190, 255, ' + (0.92 * glow).toFixed(3) + ')';
      actx.lineWidth = a.width * 0.35;
      actx.stroke();
    } else {
      strokeQuad(a.x0, a.y0, a.cx, a.cy, a.x1, a.y1, a.stretch);
      actx.strokeStyle = 'rgba(58, 10, 80, 0.34)';
      actx.lineWidth = a.width;
      actx.stroke();
      const tip = quadPoint(a.x0, a.y0, a.cx, a.cy, a.x1, a.y1, a.stretch);
      actx.shadowColor = 'rgba(190, 100, 240, 0.9)';
      actx.shadowBlur = 13;
      actx.fillStyle = 'rgba(214, 150, 255, 0.9)';
      actx.beginPath(); actx.arc(tip.x, tip.y, 4, 0, Math.PI * 2); actx.fill();
    }
    drawAttackPentagram(a.x0, a.y0, a.radius, a.angle, glow, Math.max(0.25, glow));
    actx.restore();
  }

  function drawSidePortal(a, side, glow) {
    const left = side === 'left';
    const topHalf = a.phase === 0 ? !left : left;
    const x = left ? a.x0 - 14 * a.scale : a.x1 + 14 * a.scale;
    const y = topHalf ? a.y0 + a.h * 0.25 : a.y0 + a.h * 0.75;
    const h = a.h * 0.46;
    actx.save();
    actx.translate(x, y);
    actx.rotate(left ? 0 : Math.PI);
    actx.shadowColor = 'rgba(160, 50, 220, ' + (0.45 + glow * 0.45).toFixed(3) + ')';
    actx.shadowBlur = 18 + glow * 18;
    actx.strokeStyle = 'rgba(168, 84, 232, ' + (0.6 + glow * 0.35).toFixed(3) + ')';
    actx.lineWidth = 4 * a.scale;
    actx.beginPath();
    actx.ellipse(0, 0, 18 * a.scale, h / 2, 0, -Math.PI / 2, Math.PI / 2);
    actx.stroke();
    actx.strokeStyle = 'rgba(50, 8, 72, 0.8)';
    actx.lineWidth = 9 * a.scale;
    actx.beginPath();
    actx.ellipse(0, 0, 24 * a.scale, h / 2 + 9 * a.scale, 0, -Math.PI / 2, Math.PI / 2);
    actx.stroke();
    actx.restore();
  }

  function renderSidePortals(a) {
    const firing = a.state === 'fire' || a.state === 'done';
    const glow = firing ? 1 : (a.state === 'armed' ? 1 : a.stretch);
    drawSidePortal(a, 'left', glow);
    drawSidePortal(a, 'right', glow);
    actx.save();
    actx.beginPath();
    actx.rect(a.x0, a.y0, a.w, a.h);
    actx.clip();
    if (firing) {
      const elapsed = a.fire * a.fireBeats;
      const r = SIDE_PORTAL_BULLET_RADIUS * a.scale;
      for (const b of a.bullets) {
        const p = sidePortalBulletPos(a, b, elapsed);
        if (!p) continue;
        const q = sidePortalBulletPos(a, b, elapsed + SIDE_PORTAL_SHADOW_LEN / Math.max(1, b.speed));
        if (q) {
          actx.strokeStyle = 'rgba(58, 10, 88, 0.58)';
          actx.lineWidth = r * 2;
          actx.beginPath(); actx.moveTo(p.x, p.y); actx.lineTo(q.x, q.y); actx.stroke();
        }
        const fade = 1 - smoothstep((a.fire - 0.9) / 0.1);
        actx.shadowColor = 'rgba(255, 70, 28, ' + (0.85 * fade).toFixed(3) + ')';
        actx.shadowBlur = 12 * fade;
        actx.fillStyle = 'rgba(210, 42, 18, ' + (0.95 * fade).toFixed(3) + ')';
        actx.beginPath(); actx.arc(p.x, p.y, r, 0, Math.PI * 2); actx.fill();
        actx.fillStyle = 'rgba(255, 210, 120, ' + (0.85 * fade).toFixed(3) + ')';
        actx.beginPath(); actx.arc(p.x - b.dir * r * 0.2, p.y - r * 0.15, r * 0.42, 0, Math.PI * 2); actx.fill();
      }
    }
    actx.restore();
  }

  // The four diagonal arms of an X, written into a 4-corner corridor each.
  const X_ANGLES = [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4];

  function xArmCorridor(cx, cy, ang, reach, hw) {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const nx = -dy;
    const ny = dx;
    const ex = cx + dx * reach;
    const ey = cy + dy * reach;
    actx.beginPath();
    actx.moveTo(cx + nx * hw, cy + ny * hw);
    actx.lineTo(ex + nx * hw, ey + ny * hw);
    actx.lineTo(ex - nx * hw, ey - ny * hw);
    actx.lineTo(cx - nx * hw, cy - ny * hw);
    actx.closePath();
    return { ex, ey };
  }

  // A bloody column that drops from the top of the screen onto a strike point.
  // `descend` (0..1) is the head's progress down to the point; `alpha` fades it.
  // Drawn unclipped (it comes from the sky, above the box), so callers run it
  // before applying their playfield clip.
  function drawSkyRay(cx, cy, hw, descend, alpha) {
    if (alpha <= 0) return;
    const headY = cy * descend;
    actx.save();
    // Streak fading up into the dark, brightest at the descending head.
    const grad = actx.createLinearGradient(0, 0, 0, Math.max(1, headY));
    grad.addColorStop(0, 'rgba(150, 8, 10, 0)');
    grad.addColorStop(0.7, 'rgba(220, 24, 18, ' + (0.5 * alpha).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(255, 90, 60, ' + (0.9 * alpha).toFixed(3) + ')');
    actx.fillStyle = grad;
    actx.fillRect(cx - hw, 0, hw * 2, headY);
    // Hot inner core.
    actx.fillStyle = 'rgba(255, 210, 200, ' + (0.55 * alpha).toFixed(3) + ')';
    actx.fillRect(cx - hw * 0.32, 0, hw * 0.64, headY);
    // Glowing impact head.
    actx.shadowColor = 'rgba(255, 80, 60, ' + alpha.toFixed(3) + ')';
    actx.shadowBlur = 26 * alpha;
    actx.fillStyle = 'rgba(255, 220, 210, ' + alpha.toFixed(3) + ')';
    actx.beginPath(); actx.arc(cx, headY, hw * 1.15, 0, Math.PI * 2); actx.fill();
    actx.restore();
  }

  // The cross's super-fast strike ray, dropping at the instant it fires.
  function renderXSkyRay(a) {
    if (a.fire > 0.5) return;
    const descend = easeOutCubic(Math.min(1, a.fire / 0.16)); // head reaches centre fast
    const alpha = 1 - easeOutCubic(Math.min(1, a.fire / 0.5));
    drawSkyRay(a.cx, a.cy, a.armWidth * 0.5, descend, alpha);
  }

  // Foot of orbiting beam k at progress t (0..1 over the WHOLE motion): the ring
  // winds clockwise out to the rim over the first half, then unwinds
  // counter-clockwise back to the centre over the second half — one smooth
  // out-and-back, so the inward sweep flows straight out of the outward one.
  function bloodBeamFoot(a, k, t) {
    const u = t <= 0.5 ? t * 2 : 1 - (t - 0.5) * 2; // 0 -> 1 -> 0 (radius + wind)
    const ang = Math.PI * 2 * BLOOD_TURNS * u + k * Math.PI * 2 / BLOOD_BEAMS;
    const r = a.maxRadius * u;
    return { x: a.cx + Math.cos(ang) * r, y: a.cy + Math.sin(ang) * r };
  }

  // Spiral progress 0..1; waits a beat for the intro ray to land and split.
  function bloodTau(a) {
    return Math.max(0, Math.min(1, (a.fire - 0.08) / 0.92));
  }

  // Pentagram-arm progress, after the beams have dropped onto the tips.
  function pentLineT(a) {
    return a.fire < BLOOD_LINE_DROP ? 0 : Math.min(1, (a.fire - BLOOD_LINE_DROP) / (1 - BLOOD_LINE_DROP));
  }

  // Point on the pentagram's single-stroke star path for beam k at progress t
  // (each beam offset by 1/BEAMS so they spread across the five arms).
  function pentLinePoint(a, k, t) {
    let u = (t + k / BLOOD_BEAMS) % 1;
    if (u < 0) u += 1;
    const seg = Math.min(4, (u * 5) | 0);
    const frac = u * 5 - seg;
    const v0 = a.starV[PENT_STAR_ORDER[seg]];
    const v1 = a.starV[PENT_STAR_ORDER[(seg + 1) % 5]];
    return { x: v0.x + (v1.x - v0.x) * frac, y: v0.y + (v1.y - v0.y) * frac };
  }

  // The five pentagram tips, in viewport space.
  function pentVerts(board) {
    const sx = board.width / BOARD;
    const sy = board.height / BOARD;
    const v = [];
    for (let k = 0; k < 5; k++) {
      const ang = -Math.PI / 2 + k * Math.PI * 2 / 5;
      v.push({
        x: board.left + (ARENA_CX + Math.cos(ang) * PENT_RADIUS) * sx,
        y: board.top + (ARENA_CY + Math.sin(ang) * PENT_RADIUS) * sy,
      });
    }
    return v;
  }

  // The 10-vertex star outline (outer tips + inner crossings), viewport space.
  function pentStarPoly(board) {
    const sx = board.width / BOARD;
    const sy = board.height / BOARD;
    const innerR = PENT_RADIUS * PENT_INNER_RATIO;
    const poly = [];
    for (let k = 0; k < 5; k++) {
      const ao = -Math.PI / 2 + k * Math.PI * 2 / 5;
      const ai = ao + Math.PI / 5;
      poly.push({ x: board.left + (ARENA_CX + Math.cos(ao) * PENT_RADIUS) * sx, y: board.top + (ARENA_CY + Math.sin(ao) * PENT_RADIUS) * sy });
      poly.push({ x: board.left + (ARENA_CX + Math.cos(ai) * innerR) * sx, y: board.top + (ARENA_CY + Math.sin(ai) * innerR) * sy });
    }
    return poly;
  }

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  // Distance from the arena centre to the pentagram outline along `theta` (the
  // star is star-shaped about its centre, so a ray hits it exactly once).
  function starRadiusAt(a, theta) {
    const dx = Math.cos(theta), dy = Math.sin(theta);
    const poly = a.starPoly;
    let best = a.tideEdgeR;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j].x - a.cx, ay = poly[j].y - a.cy;
      const ex = (poly[i].x - a.cx) - ax, ey = (poly[i].y - a.cy) - ay;
      const det = ex * dy - dx * ey;
      if (Math.abs(det) < 1e-9) continue;
      const t = (ex * ay - ax * ey) / det;      // distance along the ray
      const s = (dx * ay - dy * ax) / det;      // param along the segment
      if (t >= 0 && s >= 0 && s <= 1 && t < best) best = t;
    }
    return best;
  }

  // Radius of the advancing shadow front at `theta`. It rolls in from tideEdgeR
  // (g=0) to the pentagram outline (g=1), with a ragged, angle-dependent profile
  // so it reads as a tide rather than a shrinking star.
  function bloodTideFront(a, theta, g) {
    const Rp = starRadiusAt(a, theta);
    let n = 0.5 + 0.34 * Math.sin(theta * 9 + a.seed) + 0.16 * Math.sin(theta * 17 - a.seed * 2.3);
    n = Math.max(0, Math.min(1, n));
    // Per-angle progress: 0 at the rim (g=0), the pentagram (g=1), ragged in the
    // middle so the front reads as a churning tide, not a shrinking star.
    const gEff = Math.max(0, Math.min(1, g + (n - 0.5) * Math.sin(Math.PI * g) * 0.7));
    return a.tideEdgeR + (Rp - a.tideEdgeR) * gEff;
  }

  function renderBloodSpiral(a) {
    const firing = a.state === 'fire' || a.state === 'done';
    const tau = firing ? bloodTau(a) : 0;
    // A quarter-second of orbit ahead of where the beams are now.
    const tauFuture = Math.max(0, Math.min(1, tau + (250 / (beatMs * a.fireBeats)) / 0.92));
    // Ease the whole attack out over its final stretch instead of cutting it.
    const endFade = 1 - smoothstep((a.fire - 0.82) / 0.18);

    // --- Sky beams (unclipped: they fall from above the box) ---------------
    if (firing) {
      // The outward spiral keeps a static centre beam (the eye of the orbit);
      // the inward one has no centre — its beams converge there at the end.
      if (a.spiralIntro) {
        const introDescend = easeOutCubic(Math.min(1, a.fire / 0.05));
        drawSkyRay(a.cx, a.cy, a.beamWidth * 0.9, introDescend, 0.92 * endFade);
      }
      // Five beams whose feet orbit the centre on a widening/narrowing ring.
      if (tau > 0) {
        for (let k = 0; k < BLOOD_BEAMS; k++) {
          const f = bloodBeamFoot(a, k, tau);
          drawSkyRay(f.x, f.y, a.beamWidth * 0.7, 1, 0.92 * endFade);
        }
      }
    }

    // --- Floor layer (clipped to the opening) -----------------------------
    actx.save();
    actx.beginPath();
    actx.rect(a.clipX0, a.clipY0, a.clipX1 - a.clipX0, a.clipY1 - a.clipY0);
    actx.clip();

    if (!firing) {
      // Purple reticle irising in onto the centre where the ray will land.
      const glow = a.state === 'armed' ? 1 : a.stretch;
      const retR = a.maxRadius * 0.5 * (1 - glow) + 3;
      actx.strokeStyle = 'rgba(120, 40, 170, 0.85)';
      actx.lineWidth = 2;
      actx.beginPath();
      actx.arc(a.cx, a.cy, retR, 0, Math.PI * 2);
      actx.stroke();
      actx.shadowColor = 'rgba(150, 60, 230, ' + (0.5 + glow * 0.5).toFixed(3) + ')';
      actx.shadowBlur = 8 + glow * 16;
      actx.fillStyle = 'rgba(168, 84, 232, ' + (0.6 + glow * 0.4).toFixed(3) + ')';
      actx.beginPath(); actx.arc(a.cx, a.cy, 4 + glow * 3, 0, Math.PI * 2); actx.fill();
    } else {
      actx.globalAlpha = endFade; // fade the floor layer out with the beams
      // Future-path shadow: where each orbiting beam will sweep over the next
      // second, in the same purple telegraph used by every other attack.
      if (tau > 0 && tauFuture > tau) {
        const steps = 14;
        const hw = a.beamWidth / 2;
        const fpx = [];
        const fpy = [];
        actx.lineCap = 'round';
        actx.lineJoin = 'round';
        for (let k = 0; k < BLOOD_BEAMS; k++) {
          for (let i = 0; i <= steps; i++) {
            const f = bloodBeamFoot(a, k, tau + (tauFuture - tau) * (i / steps));
            fpx[i] = f.x;
            fpy[i] = f.y;
          }
          // A dark shadow the full width of the column — subtle, not a bright line.
          actx.beginPath();
          actx.moveTo(fpx[0], fpy[0]);
          for (let i = 1; i <= steps; i++) actx.lineTo(fpx[i], fpy[i]);
          actx.strokeStyle = 'rgba(28, 5, 42, 0.55)';
          actx.lineWidth = a.beamWidth;
          actx.stroke();
          // Thin brighter outline down each edge of the band for definition.
          actx.strokeStyle = 'rgba(168, 84, 232, 0.5)';
          actx.lineWidth = 1;
          for (let side = -1; side <= 1; side += 2) {
            actx.beginPath();
            for (let i = 0; i <= steps; i++) {
              const p = Math.max(0, i - 1);
              const q = Math.min(steps, i + 1);
              const dx = fpx[q] - fpx[p];
              const dy = fpy[q] - fpy[p];
              const tl = Math.hypot(dx, dy) || 1;
              const x = fpx[i] + (-dy / tl) * hw * side;
              const y = fpy[i] + (dx / tl) * hw * side;
              if (i === 0) actx.moveTo(x, y); else actx.lineTo(x, y);
            }
            actx.stroke();
          }
          // Ghost foot where the beam will be a moment from now.
          const fEnd = bloodBeamFoot(a, k, tauFuture);
          actx.fillStyle = 'rgba(28, 5, 42, 0.55)';
          actx.beginPath(); actx.arc(fEnd.x, fEnd.y, hw * 1.4, 0, Math.PI * 2); actx.fill();
          actx.strokeStyle = 'rgba(168, 84, 232, 0.5)';
          actx.lineWidth = 1;
          actx.stroke();
        }
      }
      // Dark-blood pools where each beam meets the floor, plus the static eye.
      actx.shadowColor = 'rgba(160, 10, 12, 0.9)';
      actx.shadowBlur = 18;
      actx.fillStyle = 'rgba(90, 4, 8, 0.95)';
      if (tau > 0) {
        for (let k = 0; k < BLOOD_BEAMS; k++) {
          const f = bloodBeamFoot(a, k, tau);
          actx.beginPath(); actx.arc(f.x, f.y, a.beamWidth * 0.7, 0, Math.PI * 2); actx.fill();
        }
      }
      // The static eye pool, only while the centre beam is present (outward).
      if (a.spiralIntro) { actx.beginPath(); actx.arc(a.cx, a.cy, a.beamWidth * 0.6, 0, Math.PI * 2); actx.fill(); }
    }

    actx.restore();
  }

  // Phase 2: five sky-beams drop onto the pentagram tips, then chase its arms.
  function renderPentLine(a) {
    const firing = a.state === 'fire' || a.state === 'done';
    const t = firing ? pentLineT(a) : 0;
    // The beams fall onto the tips over the first slice of the strike.
    const descend = firing && a.fire < BLOOD_LINE_DROP ? easeOutCubic(a.fire / BLOOD_LINE_DROP) : 1;
    const endFade = 1 - smoothstep((a.fire - 0.85) / 0.15);

    if (firing) {
      for (let k = 0; k < BLOOD_BEAMS; k++) {
        const f = pentLinePoint(a, k, t);
        drawSkyRay(f.x, f.y, a.beamWidth * 0.7, descend, 0.92 * endFade);
      }
    }

    actx.save();
    actx.beginPath();
    actx.rect(a.clipX0, a.clipY0, a.clipX1 - a.clipX0, a.clipY1 - a.clipY0);
    actx.clip();
    actx.lineJoin = 'round';
    const traceStar = () => {
      actx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const v = a.starV[PENT_STAR_ORDER[i % 5]];
        if (i === 0) actx.moveTo(v.x, v.y); else actx.lineTo(v.x, v.y);
      }
    };

    if (!firing) {
      // Telegraph: the star path the beams will run, brightening as it arms.
      const glow = a.state === 'armed' ? 1 : a.stretch;
      traceStar();
      actx.strokeStyle = 'rgba(58, 10, 80, 0.5)';
      actx.lineWidth = a.beamWidth;
      actx.stroke();
      traceStar();
      actx.strokeStyle = 'rgba(168, 84, 232, ' + (0.4 + glow * 0.5).toFixed(3) + ')';
      actx.lineWidth = 2;
      actx.stroke();
    } else {
      actx.globalAlpha = endFade;
      // The dim arms (shadow) plus the dark-blood pools at each running foot.
      traceStar();
      actx.strokeStyle = 'rgba(28, 5, 42, 0.5)';
      actx.lineWidth = a.beamWidth;
      actx.stroke();
      traceStar();
      actx.strokeStyle = 'rgba(168, 84, 232, 0.35)';
      actx.lineWidth = 1;
      actx.stroke();
      actx.shadowColor = 'rgba(160, 10, 12, 0.9)';
      actx.shadowBlur = 18;
      actx.fillStyle = 'rgba(90, 4, 8, 0.95)';
      for (let k = 0; k < BLOOD_BEAMS; k++) {
        const f = pentLinePoint(a, k, t);
        actx.beginPath(); actx.arc(f.x, f.y, a.beamWidth * 0.7, 0, Math.PI * 2); actx.fill();
      }
    }
    actx.restore();
  }

  // Phase 3: a jagged shadow tide rolls in from the edges and halts on the
  // pentagram; once it lands a huge sky beam floods everything outside the seal.
  function renderOutsidePent(a) {
    const firing = a.state === 'fire' || a.state === 'done';
    const glow = a.state === 'armed' ? 1 : a.stretch;

    const traceStar = () => {
      actx.beginPath();
      actx.moveTo(a.starPoly[0].x, a.starPoly[0].y);
      for (let i = 1; i < a.starPoly.length; i++) actx.lineTo(a.starPoly[i].x, a.starPoly[i].y);
      actx.closePath();
    };
    // Opening rect + real star, for an even-odd "outside the seal" fill.
    const traceOutside = () => {
      actx.beginPath();
      actx.rect(a.clipX0, a.clipY0, a.clipX1 - a.clipX0, a.clipY1 - a.clipY0);
      actx.moveTo(a.starPoly[0].x, a.starPoly[0].y);
      for (let i = 1; i < a.starPoly.length; i++) actx.lineTo(a.starPoly[i].x, a.starPoly[i].y);
      actx.closePath();
    };
    // Opening rect + the ragged tide front, even-odd, so shadow fills only the
    // swept-in region between the edges and the jagged leading edge.
    const traceTide = (g) => {
      actx.beginPath();
      actx.rect(a.clipX0, a.clipY0, a.clipX1 - a.clipX0, a.clipY1 - a.clipY0);
      const N = 108;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        const r = bloodTideFront(a, th, g);
        const x = a.cx + Math.cos(th) * r;
        const y = a.cy + Math.sin(th) * r;
        if (i === 0) actx.moveTo(x, y); else actx.lineTo(x, y);
      }
      actx.closePath();
    };

    // --- Huge sky beam (unclipped: it slams down over the whole arena, hero
    //     and cultist included) ---------------------------------------------
    if (firing) {
      const life = 1 - smoothstep(a.fire / 0.55);
      const descend = easeOutCubic(Math.min(1, a.fire / 0.1));
      const W = a.clipX1 - a.clipX0;
      const mid = (a.clipX0 + a.clipX1) / 2;
      const halfW = W * 0.66;
      const headY = a.clipY1 * descend;
      actx.save();
      const grad = actx.createLinearGradient(0, 0, 0, Math.max(1, headY));
      grad.addColorStop(0, 'rgba(150, 8, 10, 0)');
      grad.addColorStop(0.55, 'rgba(230, 30, 22, ' + (0.55 * life).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(255, 150, 110, ' + (0.9 * life).toFixed(3) + ')');
      actx.fillStyle = grad;
      actx.fillRect(mid - halfW, 0, halfW * 2, headY);
      // White-hot core column.
      actx.fillStyle = 'rgba(255, 232, 222, ' + (0.55 * life).toFixed(3) + ')';
      actx.fillRect(mid - halfW * 0.5, 0, halfW, headY);
      actx.restore();
    }

    // --- Floor layer (clipped to the opening) -----------------------------
    actx.save();
    actx.beginPath();
    actx.rect(a.clipX0, a.clipY0, a.clipX1 - a.clipX0, a.clipY1 - a.clipY0);
    actx.clip();

    if (!firing) {
      // The ragged shadow tide filling in from the edges.
      traceTide(glow);
      actx.fillStyle = 'rgba(22, 3, 30, ' + (0.42 + glow * 0.3).toFixed(3) + ')';
      actx.fill('evenodd');
      // Faint bruised edge on the leading front for definition.
      traceTide(glow);
      actx.strokeStyle = 'rgba(120, 40, 170, ' + (0.28 + glow * 0.3).toFixed(3) + ')';
      actx.lineWidth = 1.5;
      actx.stroke();
      // Real seal outline, so the safe pocket reads from the start.
      traceStar();
      actx.strokeStyle = 'rgba(168, 84, 232, ' + (0.4 + glow * 0.45).toFixed(3) + ')';
      actx.lineWidth = 2;
      actx.stroke();
    } else {
      const life = 1 - smoothstep(a.fire / 0.6);
      // Blinding bloody flood everywhere outside the seal.
      traceOutside();
      actx.shadowColor = 'rgba(255, 60, 40, ' + (0.9 * life).toFixed(3) + ')';
      actx.shadowBlur = 44 * life;
      actx.fillStyle = 'rgba(200, 14, 12, ' + (0.85 * life).toFixed(3) + ')';
      actx.fill('evenodd');
      actx.shadowBlur = 0;
      traceOutside();
      actx.fillStyle = 'rgba(255, 214, 196, ' + (0.5 * life).toFixed(3) + ')';
      actx.fill('evenodd');
      // Bright seal rim.
      traceStar();
      actx.strokeStyle = 'rgba(255, 224, 196, ' + (0.7 * life).toFixed(3) + ')';
      actx.lineWidth = 3;
      actx.stroke();
    }
    actx.restore();
  }

  function renderXRay(a) {
    // The sky ray slams down outside the playfield clip (it falls from above).
    if (a.state === 'fire' || a.state === 'done') renderXSkyRay(a);

    actx.save();
    // Clip to the frame opening so arms tuck under the border like every attack.
    actx.beginPath();
    actx.rect(a.clipX0, a.clipY0, a.clipX1 - a.clipX0, a.clipY1 - a.clipY0);
    actx.clip();

    if (a.state === 'telegraph' || a.state === 'armed') {
      // The purple X expands from its middle point outward.
      const reach = a.armLen * a.stretch;
      const hw = a.armWidth / 2;
      for (const ang of X_ANGLES) {
        const tip = xArmCorridor(a.cx, a.cy, ang, reach, hw);
        actx.fillStyle = 'rgba(58, 10, 80, 0.22)';
        actx.fill();
        actx.strokeStyle = 'rgba(120, 40, 170, 0.85)';
        actx.lineWidth = 2;
        actx.stroke();
        // Bright crawling tip while the arm is still growing.
        if (a.state === 'telegraph') {
          actx.shadowColor = 'rgba(190, 100, 240, 0.9)';
          actx.shadowBlur = 14;
          actx.fillStyle = 'rgba(214, 150, 255, 0.95)';
          actx.beginPath(); actx.arc(tip.ex, tip.ey, 5, 0, Math.PI * 2); actx.fill();
          actx.shadowBlur = 0;
        }
      }
      // Glowing core at the middle, brightening as the cross arms.
      const glow = a.state === 'armed' ? 1 : a.stretch;
      actx.shadowColor = 'rgba(150, 60, 230, ' + (0.5 + glow * 0.5).toFixed(3) + ')';
      actx.shadowBlur = 8 + glow * 16;
      actx.fillStyle = 'rgba(168, 84, 232, ' + (0.6 + glow * 0.4).toFixed(3) + ')';
      actx.beginPath(); actx.arc(a.cx, a.cy, 4 + glow * 3, 0, Math.PI * 2); actx.fill();
    } else if (a.state === 'fire' || a.state === 'done') {
      // A fast bloody ray slams down in the same cross, flaring then fading.
      const life = 1 - easeOutCubic(a.fire);
      const hw = a.armWidth / 2;
      for (const ang of X_ANGLES) {
        // Outer bloody glow.
        xArmCorridor(a.cx, a.cy, ang, a.armLen, hw);
        actx.shadowColor = 'rgba(230, 30, 22, ' + (0.85 * life).toFixed(3) + ')';
        actx.shadowBlur = 26 * life;
        actx.fillStyle = 'rgba(150, 8, 10, ' + (0.6 * life).toFixed(3) + ')';
        actx.fill();
        // Hot core.
        xArmCorridor(a.cx, a.cy, ang, a.armLen, hw * 0.42);
        actx.shadowBlur = 16 * life;
        actx.fillStyle = 'rgba(255, 196, 180, ' + (0.92 * life).toFixed(3) + ')';
        actx.fill();
      }
      // Impact bloom at the crossing point.
      actx.shadowColor = 'rgba(255, 70, 50, ' + (0.9 * life).toFixed(3) + ')';
      actx.shadowBlur = 30 * life;
      actx.fillStyle = 'rgba(255, 210, 200, ' + (0.95 * life).toFixed(3) + ')';
      actx.beginPath(); actx.arc(a.cx, a.cy, hw * (0.8 + (1 - life) * 1.6), 0, Math.PI * 2); actx.fill();
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
    frameBoardRect = null;
    updateFpsCounter(time);
    updateSoundDebugHold();
    const dtRaw = Math.min(48, time - previousTime || 16);
    previousTime = time;
    updateHeroCombatFeedback(dtRaw);
    if (combatPaused) {
      updateBars();
      animationFrame = requestAnimationFrame(frame);
      return;
    }
    if (dead && deathSequence) {
      const timeScale = 1 - smoothstep(deathSequence.age / DEATH_SLOW_MS);
      const dt = dtRaw * timeScale;
      if (dt > 0.001) {
        clock += dt;
        phaseTime += dt;
        updateArena(dt);
        updatePhase(dt);
        if ((phase === PHASE.ACTIVE || phase === PHASE.SECOND) && !phase2TowerPattern) clampHero();
      }
      renderBackground(time, false);
      renderScene();
      renderAttackLayer();
      renderStrike();
      updateBars();
      if (updateDeathSequence(dtRaw)) return;
      animationFrame = requestAnimationFrame(frame);
      return;
    }
    // The strike flourish advances in real time but slows everything else down.
    const timeScale = updateStrike(dtRaw);
    const dt = dtRaw * timeScale;
    clock += dt;
    phaseTime += dt;
    updateArena(dt);
    updatePhase(dt);
    if ((phase === PHASE.ACTIVE || phase === PHASE.SECOND) && !phase2TowerPattern) clampHero();
    renderBackground(time, false);
    renderScene();
    renderAttackLayer();
    renderStrike();
    updateBars();
    if (dead) updateDeathSequence(0);
    animationFrame = requestAnimationFrame(frame);
  }

  // ---- Input -------------------------------------------------------------
  const MOVE_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ]);

  function handlePhaseTwoSwordGuardKey(code, repeat) {
    const pattern = phase2SwordRingPattern;
    if (!pattern) return false;
    if (code !== 'KeyW' && code !== 'KeyA' && code !== 'KeyS' && code !== 'KeyD') return false;
    keys.add(code);
    if (repeat) return true;
    const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const y = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
    spawnPhaseTwoSwordGuard(x, y);
    return true;
  }

  function onKeyDown(event) {
    if (!active) return;
    if (soundDebugOverlay && !soundDebugOverlay.classList.contains('hidden')) {
      if (event.code === 'Escape') setSoundDebugOverlayOpen(false);
      if (event.code === 'Escape' || MOVE_CODES.has(event.code) || event.code === 'Space') {
        event.preventDefault();
        return;
      }
    }
    resumeBossMusicAudio();
    // Secret debug sequence (2137): typing it bails out of the rift.
    if (event.key && event.key.length === 1 && event.key >= '0' && event.key <= '9') {
      debugBuffer = (debugBuffer + event.key).slice(-DEBUG_QUIT_SEQUENCE.length);
      if (debugBuffer === DEBUG_QUIT_SEQUENCE) { debugBuffer = ''; close(); return; }
    }
    if (dead) return; // only the PERSIST button responds on the death screen
    if (combatPaused) return;
    if (event.code === 'Enter') {
      if (phase === PHASE.SECOND) skipPhaseTwoTransition();
      else skipToActive();
      event.preventDefault();
      return;
    }
    if (handlePhaseTwoSwordGuardKey(event.code, event.repeat)) {
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyF' || event.code === 'Space') {
      playerAttack();
      event.preventDefault();
      return;
    }
    if (MOVE_CODES.has(event.code)) {
      if (phase2TowerPattern || phase2DoomPattern) {
        event.preventDefault();
        return;
      }
      if (phase2GridSpecial && phase2GridSpecial.tileMode) {
        if (!event.repeat) {
          if (event.code === 'KeyW' || event.code === 'ArrowUp') queuePhaseTwoGridHop(0, -1);
          else if (event.code === 'KeyS' || event.code === 'ArrowDown') queuePhaseTwoGridHop(0, 1);
          else if (event.code === 'KeyA' || event.code === 'ArrowLeft') queuePhaseTwoGridHop(-1, 0);
          else if (event.code === 'KeyD' || event.code === 'ArrowRight') queuePhaseTwoGridHop(1, 0);
        }
        event.preventDefault();
        return;
      }
      keys.add(event.code);
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (MOVE_CODES.has(event.code)) keys.delete(event.code);
  }

  function onMouseDown(event) {
    if (!active || event.button !== 0 || combatPaused || dead) return;
    if (phaseTwoDoomClick(event.clientX, event.clientY)) {
      event.preventDefault();
      return;
    }
    if (phaseTwoTowerDragStart(event.clientX, event.clientY)) event.preventDefault();
  }

  function onMouseMove(event) {
    if (!active) return;
    phaseTwoTowerDragMove(event.clientX, event.clientY);
  }

  function onMouseUp(event) {
    if (!active || event.button !== 0) return;
    phaseTwoTowerDragEnd();
  }

  function dispatchState() {
    window.dispatchEvent(new CustomEvent('aetherboss2dchange', { detail: { active } }));
  }

  // ---- Lifecycle ---------------------------------------------------------
  // Reset all combat state and (re)start the loop at the requested phase boundary.
  // A normal open starts from the phase-one fall; PERSIST may select phase two.
  function resetRun(restartPhase) {
    const checkpoint = restartPhase === PHASE.SECOND ? PHASE.SECOND : PHASE.FALL;
    stopSoundDebugHold();
    setSoundDebugOverlayOpen(false);
    stopBloodSpiralAudio(true);
    stopPhaseTwoMassAudio(true);
    combatPaused = false;
    updateCombatPauseButton();
    stopBossMusic(0);
    // Reset the scripted intro sequence.
    phase = PHASE.FALL;
    phaseTime = 0;
    clock = 0;
    landAt = -1;
    heroSquash = 0;
    tentacles = [];
    outerTentacles = [];
    phase2AvatarStarted = false;
    if (phase2Avatar) phase2Avatar.reset();
    resetPhaseTwoLayout();
    pentagram.arm = 0;
    pentagram.armTime = 0;
    pentagram.paused = false;
    pentagram.pauseTime = 0;
    pentagram.circleTime = 0;
    resetArenaState();
    hero.x = ARENA_CX;
    hero.y = FALL_START_Y;
    heroMove.x = 0;
    heroMove.y = 0;
    keys.clear();
    debugBuffer = '';
    if (overlay) overlay.classList.remove('phase-two', 'avatar-slammed');
    if (cultistElement) cultistElement.classList.remove('standing', 'phase-two', 'avatar-phase-two');
    if (wrathName) wrathName.textContent = 'THE SHADOW CULTIST';
    // Tempo / attacks idle until she stands (PHASE.ACTIVE -> startFight()).
    fightClock = 0;
    bpm = BASE_BPM;
    bpmBonus = 0;
    beatMs = 60000 / bpm;
    beatPhase = 0;
    beatIndex = 0;
    phaseOnePatternsCompleted = 0;
    bossMusicLayerCount = 0;
    lastAnimBpm = -1;
    attacks = [];
    phase2Attacks = [];
    phase2BurstActive = false;
    phase2BurstSize = 1;
    phase2BurstsAtSize = 0;
    phase2DashZone = 'top';
    phase2Cracks = [];
    phase2GridSpecial = null;
    phase2GridDebugQueued = false;
    phase2PlayerHits = 0;
    phase2PostGridCycles = 0;
    phase2ClawPatternStopped = false;
    phase2ClawRushMode = false;
    resetPhaseTwoRushEntities();
    phase2RushDebugQueued = false;
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2SwordRingDebugQueued = false;
    phase2PitfallPattern = null;
    phase2PitfallDebugQueued = false;
    phase2HexDebugQueued = false;
    phase2TowerPattern = null;
    phase2TowerDebugQueued = false;
    phase2DoomPattern = null;
    phase2DoomDebugQueued = false;
    phase2MayhemPattern = null;
    phase2MayhemDebugQueued = false;
    phase2SpearRainDebugQueued = false;
    phase2ChevronDebugQueued = false;
    phase2TrianglesDebugQueued = false;
    phase2WaveformDebugQueued = false;
    phase2CombatStarted = false;
    phase2DebugClawQueued = false;
    nextPhase2AttackBeat = Infinity;
    activeSet = [];
    singleQueue = [];
    lastSingle = null;
    nextSlotId = 1;
    nextAttackBeat = Infinity;
    hp = HP_MAX;
    vp = 0;
    entropy = 0;
    dead = false;
    deathSequence = null;
    strike = null;
    resetHeroCombatFeedback();
    if (cultistElement) cultistElement.classList.remove('aether-hit', 'aether-final-hit');
    if (deathScreen) deathScreen.classList.add('hidden');
    if (deathScreen) deathScreen.classList.remove('is-ready');
    if (deathCtx && deathCanvas) deathCtx.clearRect(0, 0, deathCanvas.width, deathCanvas.height);
    if (checkpoint === PHASE.SECOND) {
      skipToActive(true);
      startSecondPhase();
    } else {
      // The motif belongs to the whole cultist encounter, including the fall
      // into the arena and the seal-drawing intro before she stands.
      startBossMusic(2.4);
      playBossSfx('introFall');
    }
    updateBars();
    if (bpmElement) bpmElement.textContent = 'BPM --';
    fpsSampleStart = 0;
    fpsFrames = 0;
    if (fpsElement) fpsElement.textContent = 'FPS --';

    previousTime = performance.now();
    cancelAnimationFrame(animationFrame);
    renderBackground(previousTime, true);
    renderScene();
    animationFrame = requestAnimationFrame(frame);
  }

  function open() {
    if (active) return;
    setSavedEndgameScene('boss2d');
    if (!overlay) makeOverlay();
    if (!borderCanvas) buildBorder();
    if (!calcifiedBorderCanvas) buildCalcifiedBorder();
    if (!cobbledFloorCanvas) buildCobbledFloor();
    ensurePhaseTwoAvatar();
    overlay.classList.remove('hidden');
    document.body.classList.add('aether-boss2d-active');
    active = true;
    resumeBossMusicAudio();
    sizeBackground();
    sizeAttackCanvas();
    sizeDeathCanvas();
    if (phase2TowerPattern && phase2TowerPattern.course) {
      updatePhaseTwoTowerLayout(1);
      syncPhaseTwoTowerHero();
      if (phase2Avatar && phase2TowerPattern.mode === 'active') {
        const target = phaseTwoTowerBossTarget();
        phase2Avatar.dashTo(target.x, target.y, 220);
      }
    }
    resetRun();
    dispatchState();
  }

  // PERSIST: restart at the beginning of the phase in which the hero died.
  function restart() {
    if (!active) return;
    resumeBossMusicAudio();
    const checkpoint = deathSequence ? deathSequence.restartPhase : PHASE.FALL;
    resetRun(checkpoint);
  }

  function close() {
    if (!active) return;
    active = false;
    stopSoundDebugHold();
    setSoundDebugOverlayOpen(false);
    stopBloodSpiralAudio(true);
    stopPhaseTwoMassAudio(true);
    combatPaused = false;
    updateCombatPauseButton();
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    stopBossMusic(0.08);
    keys.clear();
    resetPhaseTwoLayout();
    overlay.classList.add('hidden');
    overlay.classList.remove('phase-two', 'avatar-slammed');
    if (cultistElement) cultistElement.classList.remove('avatar-phase-two');
    document.body.classList.remove('aether-boss2d-active');
    dispatchState();
  }

  function onResize() {
    if (!active) return;
    frameBoardRect = null;
    sizeBackground();
    sizeAttackCanvas();
    sizeDeathCanvas();
    if (dead && deathSequence) {
      deathSequence.cracks = makeDeathCracks(
        deathSequence.heroX,
        deathSequence.heroY,
        window.innerWidth,
        window.innerHeight
      );
      renderDeathSequence();
    }
    // Re-anchor the long tentacles to the box's new position, already grown.
    if (outerTentacles.length) spawnOuterTentacles(true);
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', () => {
    keys.clear();
    if (phase2TowerPattern && phase2TowerPattern.course) phase2TowerPattern.course.drag = null;
    stopSoundDebugHold();
  });

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
