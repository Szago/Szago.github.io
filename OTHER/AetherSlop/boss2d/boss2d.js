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
  let phase2TileRuinPattern = null;
  let phase2TileRuinDebugQueued = false;
  let phase2SwordRingPattern = null;
  let phase2SwordRingDebugQueued = false;
  let phase2PitfallPattern = null;
  let phase2PitfallDebugQueued = false;
  let nextPhase2AttackBeat = Infinity;
  let nextAttackBeat = 0;            // earliest beat the next attack wave may spawn
  let nextSlotId = 1;

  // ---- Combat: wrath, HP, VP ---------------------------------------------
  // Wrath is the cultist's tempo gauge (= current BPM, 0..200). HP is the
  // hero's health, VP the virtue points earned by braving an attack's shadow.
  // Damage and VP both accrue per beat spent inside the relevant hitbox.
  const WRATH_MAX = 200;
  const HP_MAX = 1000;                // testing cap
  const VP_MAX = 1000;               // testing cap
  const DAMAGE_PER_BEAT = 50;        // HP lost per beat per overlapping live skill
  const VP_PER_BEAT = 175;           // VP gained per beat per overlapping shadow
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
    overlay.classList.remove('avatar-phase-two');
    overlay.style.removeProperty('--phase2-stage-w');
    overlay.style.removeProperty('--phase2-stage-h');
    overlay.style.removeProperty('--phase2-vbar-h');
    overlay.style.removeProperty('--phase2-row-left');
    overlay.style.removeProperty('--phase2-row-top');
    overlay.style.removeProperty('--phase2-wrath-top');
    phase2LayoutAnchor = null;
    phase2LayoutSignature = '';
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

  function restorePhaseTwoSquareArena() {
    if (!overlay || !canvas || phase2SquareArenaLocked) return;
    phase2SquareArenaLocked = true;
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
    const impactAt = PHASE2_GRID_RECALL_MS + special.channelMs;
    const activeAt = impactAt + PHASE2_GRID_IMPACT_MS;
    return { impactAt, activeAt };
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
    const opening = smoothstep((special.elapsed - timeline.impactAt) / 130);
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
    const depth = platform.age / platform.duration;
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
      ? 1 - smoothstep((platform.age / platform.duration - PHASE2_PITFALL_HIT_DEPTH) / 0.10)
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

  function renderPhaseTwoPitfall(sceneW, sceneH) {
    const pattern = phase2PitfallPattern;
    if (!pattern) return;
    const entry = smoothstep(pattern.elapsed / PHASE2_PITFALL_ENTRY_MS);
    const cx = sceneW / 2;
    const cy = sceneH / 2;
    ctx.save();
    ctx.fillStyle = '#020104';
    ctx.fillRect(0, 0, sceneW, sceneH);

    const vanishingX = cx;
    const vanishingY = sceneH * 0.40;
    const innerWidth = sceneW - (BORDER + PAD) * 2;
    const innerHeight = sceneH - (BORDER + PAD) * 2;
    for (let group = 0; group < 3; group++) {
      ctx.beginPath();
      for (let i = group; i < 9; i += 3) {
        const travel = (i / 9 + pattern.tunnelOffset / 1180) % 1;
        const scale = 0.025 + easeInQuad(travel) * 0.955;
        const width = innerWidth * scale;
        const height = innerHeight * scale;
        const ringY = vanishingY + (cy - vanishingY) * travel;
        ctx.rect(cx - width / 2, ringY - height / 2, width, height);
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

    const platforms = pattern.platforms.slice().sort((a, b) => a.age - b.age);
    for (const platform of platforms) renderPhaseTwoPitfallPlatform(platform);
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

  function renderScene() {
    const sceneW = canvas ? canvas.width : BOARD;
    const sceneH = canvas ? canvas.height : BOARD;
    ctx.clearRect(0, 0, sceneW, sceneH);
    const calcify = phaseTwoArenaProgress();
    ctx.save();
    arenaPath(ctx, 0);
    ctx.clip();

    const pitfallActive = phase === PHASE.SECOND && !!phase2PitfallPattern;
    const settledGrid = phase === PHASE.SECOND && phase2GridSpecial && phase2GridSpecial.settled;
    if (pitfallActive) {
      ctx.fillStyle = '#040406';
      ctx.fillRect(0, 0, sceneW, sceneH);
      if (!cobbledFloorPattern) cobbledFloorPattern = ctx.createPattern(cobbledFloorCanvas, 'repeat');
      if (cobbledFloorPattern) {
        ctx.fillStyle = cobbledFloorPattern;
        ctx.fillRect(0, 0, sceneW, sceneH);
      }
      renderPhaseTwoPitfall(sceneW, sceneH);
    } else if (settledGrid) {
      ctx.drawImage(phaseTwoGridFloorBuffer(phase2GridSpecial), 0, 0);
    } else {
      // The empty plane inside the current arena geometry, slowly paving over
      // into darker cobbled stone as the second phase takes possession.
      ctx.fillStyle = '#040406';
      ctx.fillRect(0, 0, sceneW, sceneH);
    }
    if (!pitfallActive && !settledGrid && calcify > 0.001) {
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
    if (!pitfallActive && tentacles.length) {
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

    if (!pitfallActive && phase === PHASE.SECOND && phase2GridSpecial && !phase2GridSpecial.settled) renderPhaseTwoGridFloor();
    if (!pitfallActive && phase === PHASE.SECOND && phase2Cracks.length) renderPhaseTwoGroundCracks();
    if (!pitfallActive && phase === PHASE.SECOND) renderPhaseTwoFinalTile();
    drawHero();
    if (pitfallActive) renderPhaseTwoPitfallImpact();
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
  function countOverlaps(vx, vy) {
    let live = 0;
    let shadow = 0;
    const activeAttacks = phase === PHASE.SECOND ? phase2Attacks : attacks;
    for (const a of activeAttacks) {
      const zone = heroAttackZone(a, vx, vy);
      if (zone === 'live') live++;
      else if (zone === 'shadow') shadow++;
    }
    if (phase === PHASE.SECOND && phaseTwoBossContains(vx, vy)) live++;
    // Overlapping cracks are rendered as one connected hole and count as one
    // terrain hazard, rather than multiplying damage at their intersections.
    const hoppingTiles = phase2GridSpecial && phase2GridSpecial.hop;
    if (phase === PHASE.SECOND && !hoppingTiles && viewportTouchesPhaseTwoCrack(vx, vy)) live++;
    if (phase === PHASE.SECOND && phaseTwoTileRuinContains(vx, vy)) live++;
    if (phase === PHASE.SECOND && phaseTwoTileRuinShadowContains(vx, vy)) shadow++;
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
    const fireP = Math.min(1, pattern.elapsed / (beatMs * PHASE2_TILE_RUIN_FIRE_BEATS));
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
    // The hero's centre, carried into the attack canvas's viewport space.
    const board = getBoardRect();
    const heroV = worldPointToViewport(hero.x, hero.y, board);
    const vx = heroV.x;
    const vy = heroV.y;
    const beats = dt / beatMs;
    const { live, shadow } = countOverlaps(vx, vy);
    // Damage scales with overlaps (two attacks at once drain twice as fast).
    if (live > 0) hp = Math.max(0, hp - DAMAGE_PER_BEAT * live * beats);
    // VP is earned only in a shadow, never in the live skill itself.
    if (shadow > 0) vp = Math.min(VP_MAX, vp + VP_PER_BEAT * shadow * beats);
    if (hp <= 0) die();
  }

  // The hero spends a full VP meter to strike: heals a little, stokes the
  // current boss's tempo gauge, and launches the slow-mo angelic-sword flourish.
  // Bound to F / Space.
  function playerAttack() {
    if (!active || dead || (phase !== PHASE.ACTIVE && phase !== PHASE.SECOND) || strike) return;
    if (phase === PHASE.SECOND && !phase2CombatStarted) return;
    if (vp < VP_MAX) return;
    vp = 0;
    hp = Math.min(HP_MAX, hp + HP_MAX * ATTACK_HEAL_FRAC);
    // Wrath only flares once the blade actually lands (see updateStrike).
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
      finalHit: false,
      phaseTwo: phase === PHASE.SECOND,
      fromX,
      fromY,
      toX: phase === PHASE.SECOND && avatar ? avatar.x : (sprite ? sprite.left + sprite.width / 2 : fromX),
      toY: phase === PHASE.SECOND && avatar ? avatar.y : (sprite ? sprite.top + sprite.height * 0.45 : board.top),
    };
  }

  function wrathAfterStrike() {
    return BASE_BPM + Math.floor(fightClock / BPM_RAMP_MS) + bpmBonus + ATTACK_WRATH_GAIN;
  }

  // Advances the strike flourish in REAL time (so the cinematic plays at full
  // speed while gameplay crawls) and returns the gameplay time-scale to apply.
  function updateStrike(dtRaw) {
    if (!strike) return 1;
    strike.t += dtRaw;
    const p = strike.t / STRIKE_DURATION;
    if (!strike.impacted && strike.t >= STRIKE_IMPACT_AT) {
      if (strike.phaseTwo) {
        strike.impacted = true;
        entropy = Math.min(ENTROPY_MAX, entropy + ENTROPY_PER_STRIKE);
        bpm = phaseTwoBpm();
        beatMs = 60000 / bpm;
        phase2PlayerHits++;
        if (phase2PlayerHits === 2 && !phase2GridSpecial) startPhaseTwoGridSpecial();
        surgeWrath();
        return 1 - Math.sin(Math.min(1, p) * Math.PI) * (1 - STRIKE_SLOW);
      }
      const finalHit = wrathAfterStrike() >= WRATH_MAX;
      strike.impacted = true;
      strike.finalHit = finalHit;
      if (finalHit) strike.duration = FINAL_STRIKE_DURATION;
      shakeCultist(finalHit);
      bpmBonus += ATTACK_WRATH_GAIN; // wrath surges on impact, not on keypress
      if (finalHit) bpm = WRATH_MAX;
      surgeWrath();
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
    const x = s.toX;
    const y = s.toY;
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

  // The flourish itself, painted over the attack layer in viewport space.
  function renderStrike() {
    if (!strike || !actx) return;
    const p = Math.min(strike.t, STRIKE_DURATION) / STRIKE_DURATION;
    const angle = Math.atan2(strike.toY - strike.fromY, strike.toX - strike.fromX);
    // The sword materialises, hovers, then is cast fast at the boss.
    const castStart = 0.55;
    const castEnd = 0.82;
    let sp = 0;
    if (p >= castEnd) sp = 1;
    else if (p > castStart) sp = easeInQuad((p - castStart) / (castEnd - castStart));
    const x = strike.fromX + (strike.toX - strike.fromX) * sp;
    const y = strike.fromY + (strike.toY - strike.fromY) * sp;
    const appear = Math.min(1, p / 0.18);
    let fade = p > 0.86 ? Math.max(0, 1 - (p - 0.86) / 0.14) : 1;
    let scale = (0.7 + 0.6 * easeOutCubic(appear)) * (1 + sp * 0.25);
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
    if (p >= 0.82) {
      const fp = Math.min(1, (p - 0.82) / 0.12);
      actx.save();
      actx.globalAlpha = (1 - fp) * 0.9;
      actx.shadowColor = 'rgba(255, 230, 180, 0.95)';
      actx.shadowBlur = 40;
      actx.fillStyle = 'rgba(255, 245, 220, 0.9)';
      actx.beginPath(); actx.arc(strike.toX, strike.toY, 26 + fp * 46, 0, Math.PI * 2); actx.fill();
      actx.restore();
    }
    drawAngelicSword(x, y, angle, scale, alpha);
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
    if (deathScreen) deathScreen.classList.toggle('is-ready', deathSequence.age >= DEATH_PERSIST_AT);
    renderDeathSequence();
    return false;
  }

  function die() {
    if (dead) return;
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
      reviving: false,
      reviveAge: 0,
      reviveFromProgress: 0,
      cut: makeDeathCut(heroViewport.x, heroViewport.y),
      cracks: makeDeathCracks(heroViewport.x, heroViewport.y, window.innerWidth, window.innerHeight),
    };
    dead = true;
    keys.clear();
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
    if (vpFill) vpFill.style.height = (Math.max(0, vp) / VP_MAX * 100) + '%';
    if (vpBar) vpBar.classList.toggle('is-full', vp >= VP_MAX);
  }

  // ---- Phase machine -----------------------------------------------------
  function setPhase(next) {
    phase = next;
    phaseTime = 0;
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
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2SwordRingDebugQueued = false;
    phase2PitfallPattern = null;
    phase2PitfallDebugQueued = false;
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
  function startFight() {
    fightClock = 0;
    bpm = BASE_BPM;
    bpmBonus = 0;
    beatMs = 60000 / bpm;
    beatPhase = 0;
    beatIndex = 0;
    lastAnimBpm = -1;
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
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2SwordRingDebugQueued = false;
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
    if (activeSet.length === 0 && beat < nextAttackBeat) return;
    // Arm/rearm only if a wave actually spawned (the stage might not be
    // measurable yet); otherwise retry on the next beat.
    if (spawnWave(beat)) updateNextAttackBeat();
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

  // Debug primer: enter normal combat one strike away from the phase-two
  // transition, without skipping the actual strike -> wrath-fill flow.
  function primePhaseTwoCombat() {
    if (!active || phase !== PHASE.ACTIVE) return;
    fightClock = 0;
    bpmBonus = WRATH_MAX - BASE_BPM - ATTACK_WRATH_GAIN;
    bpm = WRATH_MAX - ATTACK_WRATH_GAIN;
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
    if (phase === PHASE.SECOND && phase2CombatStarted) {
      const target = Math.max(PHASE2_BPM_MIN, Math.min(PHASE2_BPM_MAX, phaseTwoBpm() + delta));
      entropy = (target - PHASE2_BPM_MIN) / (PHASE2_BPM_MAX - PHASE2_BPM_MIN) * ENTROPY_MAX;
      bpm = phaseTwoBpm();
    } else {
      const naturalBpm = BASE_BPM + Math.floor(fightClock / BPM_RAMP_MS);
      const target = Math.max(BASE_BPM, Math.min(WRATH_MAX, bpm + delta));
      bpmBonus = Math.max(0, target - naturalBpm);
      bpm = Math.min(WRATH_MAX, naturalBpm + bpmBonus);
    }
    beatMs = 60000 / bpm;
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
    if (!phase2CombatStarted || !canvas || !phase2Avatar || phase2GridSpecial) return false;
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
    keys.clear();
    dashPhaseTwoAvatarToBase();
    phase2GridSpecial = {
      elapsed: 0,
      channelMs: beatMs * PHASE2_GRID_CHANNEL_BEATS,
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
    const impactAt = PHASE2_GRID_RECALL_MS + special.channelMs;
    const activeAt = impactAt + PHASE2_GRID_IMPACT_MS;
    if (!special.struck && special.elapsed >= impactAt) {
      special.struck = true;
      special.tileMode = true;
      keys.clear();
      const tile = nearestPhaseTwoGridTile(special.layout, hero.x, hero.y);
      beginPhaseTwoGridHop(tile, PHASE2_GRID_IMPACT_MS);
    }
    if (!special.settled && special.elapsed >= activeAt) {
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
      targets,
      impacted: false,
      seed: Math.random() * 1000,
    };
    phase2TileRuinDebugQueued = false;
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
      hp = Math.max(0, hp - PHASE2_VOID_EJECT_DAMAGE * damageScale);
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
      const strikeMs = phaseTwoSwordDuration(PHASE2_SWORD_STRIKE_MS, pattern, true);
      const strikeP = easeInQuad(Math.min(1, pattern.elapsed / strikeMs));
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
      vp = Math.min(VP_MAX, vp + PHASE2_SWORD_PARRY_VP);
    } else {
      hp = Math.max(0, hp - PHASE2_BOSS_SLAM_DAMAGE * (bpm / PHASE2_BPM_MIN));
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
      pattern.successfulParries++;
      hp = Math.min(
        HP_MAX,
        hp + PHASE2_SWORD_PARRY_HEAL * (bpm / PHASE2_BPM_MIN)
      );
      vp = Math.min(VP_MAX, vp + PHASE2_SWORD_PARRY_VP);
      if (!pattern.finalClockwise && pattern.successfulParries >= PHASE2_SWORD_FINAL_PARRIES) {
        pattern.finalClockwisePending = true;
      }
    }
    if (type === 'hit') {
      hp = Math.max(0, hp - PHASE2_SWORD_RING_DAMAGE * (bpm / PHASE2_BPM_MIN));
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
      slot.respawnAge += dt;
      const respawnMs = phaseTwoSwordDuration(
        PHASE2_SWORD_RESPAWN_DELAY_MS + PHASE2_SWORD_RESPAWN_FORM_MS,
        pattern,
        false
      );
      if (slot.respawnAge >= respawnMs) {
        slot.status = 'ready';
        slot.respawnAge = 0;
      }
    }
    pattern.guardSwapAge += dt;
    if (pattern.parryFlashAge >= 0) pattern.parryFlashAge += dt;
    pattern.elapsed += dt;
    if (pattern.state === 'bossSlam') {
      updatePhaseTwoBossSlam(pattern, dt);
      return;
    }
    const formMs = phaseTwoSwordDuration(PHASE2_SWORD_RING_FORM_MS, pattern, false);
    const flashMs = phaseTwoSwordDuration(PHASE2_SWORD_FLASH_MS, pattern, true);
    const strikeMs = phaseTwoSwordDuration(PHASE2_SWORD_STRIKE_MS, pattern, true);
    const impactMs = phaseTwoSwordDuration(PHASE2_SWORD_IMPACT_MS, pattern, true);
    if (pattern.state === 'forming' && pattern.elapsed >= formMs) {
      beginPhaseTwoSwordAttack(pattern, 0);
    } else if (pattern.state === 'flash' && pattern.elapsed >= flashMs) {
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
                 pattern.elapsed >= strikeMs)) {
        resolvePhaseTwoSwordStrike(pattern, 'hit', geometry);
      }
    } else if (pattern.state === 'impact' && pattern.elapsed >= impactMs) {
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
    } else if (pattern.state === 'waiting' && pattern.elapsed >=
               phaseTwoSwordDuration(pattern.nextDelayMs, pattern, true)) {
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
      if (pattern.elapsed >= beatMs * PHASE2_TILE_RUIN_TELEGRAPH_BEATS) {
        pattern.state = 'fire';
        pattern.elapsed = 0;
        pattern.impacted = false;
      }
    } else if (pattern.state === 'fire') {
      const fireP = pattern.elapsed / (beatMs * PHASE2_TILE_RUIN_FIRE_BEATS);
      if (!pattern.impacted && fireP >= 0.72) {
        pattern.impacted = true;
        removePhaseTwoGridTiles(pattern.targets);
      }
      if (pattern.elapsed >= beatMs * PHASE2_TILE_RUIN_FIRE_BEATS) {
        pattern.state = 'rest';
        pattern.elapsed = 0;
      }
    } else if (pattern.state === 'rest' &&
               pattern.elapsed >= beatMs * PHASE2_TILE_RUIN_REST_BEATS) {
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
        pattern.impacted = false;
      }
    }
  }

  function beginPhaseTwoCombat() {
    if (phase2CombatStarted) return;
    phase2CombatStarted = true;
    entropy = 0;
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
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2PitfallPattern = null;
    nextPhase2AttackBeat = phase2DebugClawQueued ? 0 : 2;
    if (bpmElement) bpmElement.textContent = 'BPM ' + Math.round(bpm);
    if (phase2PitfallDebugQueued) beginDebugPhaseTwoPitfall();
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
    return Math.pow(clamp01(a.stretch), 1.8);
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
    const dx = heroV.x - avatar.x;
    const dy = heroV.y - avatar.y;
    const distance = Math.hypot(dx, dy) || 1;
    const dirX = dx / distance;
    const dirY = dy / distance;
    const scaleX = board.width / (canvas && canvas.width ? canvas.width : BOARD);
    const pastHero = Math.max(105, HERO_W * scaleX * 4.8);
    if (!a.turnSign) a.turnSign = heroV.x >= avatar.x ? -1 : 1;
    a.targetX = heroV.x + dirX * pastHero;
    a.targetY = heroV.y + dirY * pastHero;
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

  function spawnPhaseTwoShadowClaw(board) {
    if (!board || !board.width || !phase2Avatar || !phase2Avatar.state) return false;
    const makeClaw = (turnSign, waitBeats) => ({
      type: 'shadowClaw',
      state: waitBeats > 0 ? 'waiting' : 'telegraph',
      waitTime: 0,
      waitBeats,
      x0: 0, y0: 0, c1x: 0, c1y: 0, c2x: 0, c2y: 0, x1: 0, y1: 0,
      width: Math.max(52, Math.min(78, Math.min(board.width, board.height) * 0.10)),
      startWidth: 9,
      turnSign,
      pathSteps: 56,
      pathPoints: [],
      headX: 0,
      headY: 0,
      headAngle: 0,
      targetX: 0,
      targetY: 0,
      baseStep: 16,
      stretch: 0,
      stretchBeats: PHASE2_CLAW_TELEGRAPH_BEATS,
      holdBeats: PHASE2_CLAW_HOLD_BEATS,
      holdTime: 0,
      fire: 0,
      fireBeats: PHASE2_CLAW_FIRE_BEATS,
      restBeats: PHASE2_CLAW_REST_BEATS,
      crackSpawned: false,
      seed: Math.random() * 1000,
      board: null,
    });
    const claws = [];
    for (let i = 0; i < phase2BurstSize; i++) {
      const turnSign = (i + phase2BurstsAtSize) % 2 === 0 ? -1 : 1;
      claws.push(makeClaw(turnSign, i * 0.42));
    }
    if (!retargetPhaseTwoShadowClaw(claws[0], board)) return false;
    phase2Attacks.push(...claws);
    phase2BurstActive = true;
    return true;
  }

  function triggerPhaseTwoDash() {
    if (!canvas || !phase2Avatar || typeof phase2Avatar.dashTo !== 'function') return;
    const board = getBoardRect();
    const avatar = phase2Avatar.state && phase2Avatar.state.avatar;
    if (!board.width || !board.height || !avatar) return;
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
        a.waitTime += dt;
        if (a.waitTime >= beatMs * a.waitBeats) {
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
          a.holdTime = 0;
        }
      } else if (a.state === 'armed') {
        a.holdTime += dt;
        if (a.holdTime >= beatMs * a.holdBeats) {
          a.state = 'fire';
          a.fire = 0;
          leavePhaseTwoCrack(a);
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
    bpm = phaseTwoBpm();
    beatMs = 60000 / bpm;
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
      phase2GridDebugQueued = false;
      phase2ClawPatternStopped = false;
      phase2TileRuinPattern = null;
      phase2TileRuinDebugQueued = false;
      phase2SwordRingPattern = null;
      phase2SwordRingDebugQueued = false;
      phase2PitfallPattern = null;
      phase2PitfallDebugQueued = false;
      phase2Attacks = [];
      phase2BurstActive = false;
      nextPhase2AttackBeat = beatIndex;
      onPhaseTwoBeat(beatIndex);
    }
  }

  function beginDebugPhaseTwoSwordRing() {
    if (!phase2CombatStarted || !canvas) return false;
    phase2SwordRingDebugQueued = false;
    phase2GridDebugQueued = false;
    phase2DebugClawQueued = false;
    phase2ClawPatternStopped = true;
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2PitfallPattern = null;
    phase2PitfallDebugQueued = false;
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
    return {
      x: clamp01((hero.x - left) / width),
      y: clamp01((hero.y - top) / height),
      halfX: HERO_W * 0.36 / width,
      halfY: HERO_H * 0.36 / height,
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
    const depth = platform.age / platform.duration;
    if (platform.resolved || depth < 0.10 || depth > PHASE2_PITFALL_HIT_DEPTH) return false;
    const projection = phaseTwoPitfallProjection(platform);
    const threshold = Math.max(5, projection.scale * 9);
    for (const gap of platform.gaps) {
      for (let i = 0; i < gap.points.length; i++) {
        const a = gap.points[i];
        const b = gap.points[(i + 1) % gap.points.length];
        const ax = projection.left + a.x * projection.width;
        const ay = projection.top + a.y * projection.height;
        const bx = projection.left + b.x * projection.width;
        const by = projection.top + b.y * projection.height;
        if (distToSeg(hero.x, hero.y, ax, ay, bx, by) <= threshold) return true;
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
    return {
      id: pattern.nextId++,
      age: 0,
      duration: beatMs * PHASE2_PITFALL_TRAVEL_BEATS,
      gaps: [gap],
      seed: random() * 1000,
      resolved: false,
      hit: false,
      hitAge: -1,
    };
  }

  function startPhaseTwoPitfallPattern() {
    if (!canvas || phase2PitfallPattern) return false;
    if (!phase2SquareArenaLocked) restorePhaseTwoSquareArena();
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
      elapsed: 0,
      spawnClock: beatMs * PHASE2_PITFALL_SPAWN_BEATS,
      platforms: [],
      nextId: 1,
      nextGapX: 0.5,
      nextGapY: 0.5,
      tunnelOffset: 0,
      impactAge: -1,
      safeAge: -1,
      seed,
      random: mulberry32(seed),
    };
    return true;
  }

  function updatePhaseTwoPitfallMovement(dt) {
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

  function updatePhaseTwoPitfallPattern(dt) {
    const pattern = phase2PitfallPattern;
    if (!pattern) return;
    const fallDt = dt * PHASE2_PITFALL_TIME_SCALE;
    pattern.elapsed += fallDt;
    pattern.tunnelOffset += fallDt * (bpm / PHASE2_BPM_MIN);
    if (pattern.impactAge >= 0) pattern.impactAge += dt;
    if (pattern.safeAge >= 0) pattern.safeAge += dt;
    if (pattern.elapsed >= PHASE2_PITFALL_ENTRY_MS * 0.58) {
      const interval = beatMs * PHASE2_PITFALL_SPAWN_BEATS;
      pattern.spawnClock = Math.min(interval, pattern.spawnClock + fallDt);
      const incoming = pattern.platforms.some((platform) => !platform.resolved);
      if (!incoming && pattern.spawnClock >= interval && pattern.platforms.length < 5) {
        pattern.spawnClock -= interval;
        pattern.platforms.push(makePhaseTwoPitfallPlatform(pattern));
      }
    }
    let shadowEdges = 0;
    for (const platform of pattern.platforms) {
      platform.age += fallDt * PHASE2_PITFALL_APPROACH_SCALE;
      if (platform.hitAge >= 0) platform.hitAge += dt;
      if (phaseTwoPitfallHeroOnShadowEdge(platform)) shadowEdges++;
      const depth = platform.age / platform.duration;
      if (!platform.resolved && depth >= PHASE2_PITFALL_HIT_DEPTH) {
        platform.resolved = true;
        if (phaseTwoPitfallHeroInGap(platform)) {
          pattern.safeAge = 0;
        } else {
          platform.hit = true;
          platform.hitAge = 0;
          pattern.impactAge = 0;
          hp = Math.max(0, hp - PHASE2_PITFALL_DAMAGE * (bpm / PHASE2_BPM_MIN));
          if (hp <= 0) die();
        }
      }
    }
    if (shadowEdges > 0) {
      vp = Math.min(VP_MAX, vp + VP_PER_BEAT * shadowEdges * dt / beatMs);
    }
    pattern.platforms = pattern.platforms.filter((platform) => platform.age / platform.duration < 1.16);
  }

  function beginDebugPhaseTwoPitfall() {
    if (!phase2CombatStarted || !canvas) return false;
    phase2PitfallPattern = null;
    const started = startPhaseTwoPitfallPattern();
    if (started && phase2Avatar && typeof phase2Avatar.dashHome === 'function') {
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

  function updateSecondPhase(dt) {
    for (const a of fadingAttacks) a.fadeTime += dt;
    fadingAttacks = fadingAttacks.filter((a) => a.fadeTime < a.fadeDuration);
    if (phase2PitfallPattern) {
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
          onSlam: () => {
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
        if (phase2PitfallPattern) {
          updatePhaseTwoPitfallPattern(dt);
          updateCombat(dt);
          return;
        }
        updatePhaseTwoGridSpecial(dt);
        updatePhaseTwoAttacks(dt);
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
    for (let i = attackStart; i < attacks.length; i++) attacks[i].slotId = slot.id;
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
      holdTime: 0,
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
      holdTime: 0,
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
      holdTime: 0,
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
      holdTime: 0,
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
        waitTime: 0,
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
        holdTime: 0,
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
      holdTime: 0,
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
      holdTime: 0,
      fire: 0,               // 0..1 beam life
      fireBeats: 1,
      restBeats: ATTACK_REST_BEATS,
    });
  }

  function updateAttacks(dt) {
    for (const a of attacks) {
      if (a.state === 'waiting') {
        a.waitTime += dt;
        if (a.waitTime >= beatMs * a.waitBeats) {
          a.state = 'telegraph';
          a.stretch = 0;
        }
      } else if (a.state === 'telegraph') {
        // The snake advances at the beat's pace, reaching the far edge in one beat.
        a.stretch += dt / (beatMs * a.stretchBeats);
        if (a.stretch >= 1) {
          a.stretch = 1;
          a.state = 'armed';
          a.holdTime = 0;
        }
      } else if (a.state === 'armed') {
        // Hold fully telegraphed for a fixed, tempo-relative beat fraction, then
        // strike. This decouples the strike from beat boundaries, so the lead
        // time (telegraph + hold) is identical every wave instead of swinging by
        // up to a beat depending on where the telegraph happened to finish.
        a.holdTime += dt;
        if (a.holdTime >= beatMs * a.holdBeats) { a.state = 'fire'; a.fire = 0; }
      } else if (a.state === 'fire') {
        a.fire += dt / (beatMs * a.fireBeats);
        if (a.fire >= 1) { a.fire = 1; a.state = 'done'; }
      }
    }
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
    const channelP = smoothstep(
      (special.elapsed - PHASE2_GRID_RECALL_MS) / Math.max(1, special.channelMs)
    );
    const impactAge = special.elapsed - timeline.impactAt;
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
      ? Math.min(1, pattern.elapsed / (beatMs * PHASE2_TILE_RUIN_TELEGRAPH_BEATS))
      : 1;
    const fireP = fire ? Math.min(1, pattern.elapsed / (beatMs * PHASE2_TILE_RUIN_FIRE_BEATS)) : 0;
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
    const impactMs = phaseTwoSwordDuration(PHASE2_SWORD_IMPACT_MS, pattern, true);
    const p = Math.min(1, pattern.elapsed / impactMs);
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
    const flashMs = phaseTwoSwordDuration(PHASE2_SWORD_PARRY_FLASH_MS, pattern, false);
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
    const formMs = phaseTwoSwordDuration(PHASE2_SWORD_RING_FORM_MS, pattern, false);
    const formP = forming ? smoothstep(Math.min(1, pattern.elapsed / formMs)) : 1;
    for (let i = 0; i < PHASE2_SWORD_DIRECTIONS.length; i++) {
      const slot = pattern.slots[i];
      if (!slot || slot.status === 'spent' ||
          (slot.status === 'active' && pattern.state === 'impact')) continue;
      let slotP = 1;
      if (slot.status === 'respawning') {
        const respawnDelayMs = phaseTwoSwordDuration(PHASE2_SWORD_RESPAWN_DELAY_MS, pattern, false);
        const respawnFormMs = phaseTwoSwordDuration(PHASE2_SWORD_RESPAWN_FORM_MS, pattern, false);
        if (slot.respawnAge < respawnDelayMs) continue;
        slotP = smoothstep(
          (slot.respawnAge - respawnDelayMs) / respawnFormMs
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
        const flashMs = phaseTwoSwordDuration(PHASE2_SWORD_FLASH_MS, pattern, true);
        renderPhaseTwoSwordEcho(
          x,
          y,
          aim,
          swordScale,
          Math.min(1, pattern.elapsed / flashMs),
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
        const parryFlashMs = phaseTwoSwordDuration(PHASE2_SWORD_PARRY_FLASH_MS, pattern, true);
        if (pattern.parryFlashAge > parryFlashMs) continue;
        const bladeX = swordGeometry.bladeTipX;
        const bladeY = swordGeometry.bladeTipY;
        renderPhaseTwoSwordFlash(bladeX, bladeY, pattern.parryFlashAge / parryFlashMs);
      }
    }

    renderPhaseTwoSwordGuard(pattern, geometry);
    renderPhaseTwoSwordImpactFrame(pattern);
    renderPhaseTwoBossSlamCue(pattern);
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
      fillJaggedClaw(a, endAt, 1.10, 0, true, 'rgba(24, 25, 28, ' + (0.18 * pulse * visibility).toFixed(3) + ')', startAt, taperAtEnd);
      fillJaggedClaw(a, endAt, 0.94, 1, true, 'rgba(12, 13, 15, ' + (0.30 * pulse * visibility).toFixed(3) + ')', startAt, taperAtEnd);
      if (!reducedDetail) {
        fillJaggedClaw(a, endAt, 0.72, 2, true, 'rgba(50, 51, 54, ' + (0.14 * pulse * visibility).toFixed(3) + ')', startAt, taperAtEnd);
      }
      strokeJaggedClaw(a, endAt, 1.10, 0, true, 'rgba(128, 18, 20, ' + ((foreground ? 0.48 : 0.62) * pulse).toFixed(3) + ')', startAt, taperAtEnd);
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
      const beatsWaited = a.waitTime / beatMs;
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
    const dtRaw = Math.min(48, time - previousTime || 16);
    previousTime = time;
    if (dead && deathSequence) {
      const timeScale = 1 - smoothstep(deathSequence.age / DEATH_SLOW_MS);
      const dt = dtRaw * timeScale;
      if (dt > 0.001) {
        clock += dt;
        phaseTime += dt;
        updateArena(dt);
        updatePhase(dt);
        if (phase === PHASE.ACTIVE || phase === PHASE.SECOND) clampHero();
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
    if (phase === PHASE.ACTIVE || phase === PHASE.SECOND) clampHero();
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
    // Secret debug sequence (2137): typing it bails out of the rift.
    if (event.key && event.key.length === 1 && event.key >= '0' && event.key <= '9') {
      debugBuffer = (debugBuffer + event.key).slice(-DEBUG_QUIT_SEQUENCE.length);
      if (debugBuffer === DEBUG_QUIT_SEQUENCE) { debugBuffer = ''; close(); return; }
    }
    if (dead) return; // only the PERSIST button responds on the death screen
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

  function dispatchState() {
    window.dispatchEvent(new CustomEvent('aetherboss2dchange', { detail: { active } }));
  }

  // ---- Lifecycle ---------------------------------------------------------
  // Reset all combat state and (re)start the loop at the requested phase boundary.
  // A normal open starts from the phase-one fall; PERSIST may select phase two.
  function resetRun(restartPhase) {
    const checkpoint = restartPhase === PHASE.SECOND ? PHASE.SECOND : PHASE.FALL;
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
    phase2TileRuinPattern = null;
    phase2TileRuinDebugQueued = false;
    phase2SwordRingPattern = null;
    phase2SwordRingDebugQueued = false;
    phase2PitfallPattern = null;
    phase2PitfallDebugQueued = false;
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
    if (cultistElement) cultistElement.classList.remove('aether-hit', 'aether-final-hit');
    if (deathScreen) deathScreen.classList.add('hidden');
    if (deathScreen) deathScreen.classList.remove('is-ready');
    if (deathCtx && deathCanvas) deathCtx.clearRect(0, 0, deathCanvas.width, deathCanvas.height);
    if (checkpoint === PHASE.SECOND) {
      skipToActive();
      startSecondPhase();
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
    sizeBackground();
    sizeAttackCanvas();
    sizeDeathCanvas();
    resetRun();
    dispatchState();
  }

  // PERSIST: restart at the beginning of the phase in which the hero died.
  function restart() {
    if (!active) return;
    const checkpoint = deathSequence ? deathSequence.restartPhase : PHASE.FALL;
    resetRun(checkpoint);
  }

  function close() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
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
