import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.min.js';

const EYE_HEIGHT = 1.7;
const WORLD_LIMIT = 180;
const WALK_SPEED = 6.5;
const SPRINT_SPEED = 11;
const JUMP_SPEED = 8;
const GRAVITY = 24;
const PLAYER_RADIUS = 0.42;
const ROAD_WIDTH = 8.5;
const DEBUG_INFINITE_VISION = false;
const PLAYER_LIGHT_RADIUS = 20;
const NEAR_RENDER_RADIUS = 20;
const PLAYER_FOG_DENSITY = 1.55 / PLAYER_LIGHT_RADIUS;
const PLAYER_LIGHT_INTENSITY = 20;
const PLAYER_LIGHT_DECAY = 0.90;
const NEAR_RENDER_HYSTERESIS = 3;
const CULL_CELL_SIZE = 18;
const CULL_UPDATE_INTERVAL = 120;
const CULL_MOVE_THRESHOLD = 1.2;
const LOAD_BATCH_SIZE = 96;
const LOAD_SAMPLE_COUNT = 320;
const PLAYER_MAX_HP = 5;
const ATTACK_DURATION = 420;
const ATTACK_COOLDOWN = 620;
const TENTACLE_MAX_HP = 3;
const TENTACLE_FIRST_SPAWN_DELAY = 30000;
const TENTACLE_SPAWN_MIN_DELAY = 10000;
const TENTACLE_SPAWN_MAX_DELAY = 20000;
const TENTACLE_SPAWN_DISTANCE = PLAYER_LIGHT_RADIUS - 1.4;
const TENTACLE_ATTACK_RANGE = 11;
const TENTACLE_ATTACK_HALF_WIDTH = 1.45;
const TENTACLE_ATTACK_WINDUP = 1150;
const TENTACLE_ATTACK_RECOVERY = 650;
const TENTACLE_SWORD_RANGE = 3.6;
const PERFECT_PARRY_WINDOW = 260;
const PARRY_COOLDOWN = 425;
const COMBAT_EFFECT_DURATION = 360;
const CITY_CORE_HALF = 92;
const CITY_ARM_HALF = 31;
const CITY_ARM_END = 154;
const CITY_GATE_HALF = 6.5;
const EAST_RIVER_X = 128;
const EAST_RIVER_WIDTH = 13;
const EAST_BRIDGE_HALF_WIDTH = 7.2;
const EAST_BRIDGE_HEIGHT = 1.35;
const EAST_BRIDGE_RAMP_LENGTH = 9;
const MAX_MOUSE_DELTA = 90;
const POINTER_LOCK_SETTLE_MS = 80;
const EYE_GUARDIAN_MAX_HP = 5;
const EYE_GUARDIAN_WAKE_RANGE = 58;
const EYE_GUARDIAN_ATTACK_RANGE = 52;
const EYE_GUARDIAN_WINDUP = 900;
const EYE_GUARDIAN_RECOVERY = 350;
const EYE_BOLT_SPEED = 15;
const EYE_REFLECT_SPEED = 25;
const EYE_PARRY_FACING_DOT = Math.cos(THREE.MathUtils.degToRad(20));
const OPEN_GATE_RADIUS = 3.25;
const OPEN_GATE_DEPTH = 16;
const GATE_FADE_DURATION = 2000;
const ENDGAME_SCENE_STORAGE_KEY = 'aetherEndgameScene';
const DEBUG_GUARDIAN_PASSCODE = '2137';
const gateHoleUniforms = {
  opened: { value: 0 },
  radiusSq: { value: OPEN_GATE_RADIUS * OPEN_GATE_RADIUS }
};

let overlay;
let viewport;
let status;
let loadingPanel;
let loadingBar;
let loadingText;
let deathPanel;
let damageFlash;
let parryFlash;
let gateFade;
let wardenStatus;
let renderer;
let scene;
let camera;
let playerLight;
let sword;
let ruinMaterials;
let tentacleMaterials;
let landmarkMaterials;
let eyeMaterials;
let fountainGroup;
let openedGateGroup;
let gateOpened = false;
let wardensSlain = 0;
let fountainBasinCollider;
let fountainStatueCollider;
let animationFrame = 0;
let previousTime = 0;
let active = false;
let loading = false;
let warmupStarted = false;
let warmupComplete = false;
let warmupIndex = 0;
let loadSampleIndex = 0;
let loadSampleIndices = [];
let playerHp = PLAYER_MAX_HP;
let playerDead = false;
let parryHeld = false;
let parryStartedAt = 0;
let parryActiveUntil = 0;
let nextParryAt = 0;
let attackStartedAt = 0;
let attackUntil = 0;
let attackCooldownUntil = 0;
let worldEnteredAt = 0;
let nextTentacleSpawnAt = Infinity;
let combatStatusText = '';
let combatStatusUntil = 0;
let damageFlashUntil = 0;
let lastCullUpdate = 0;
let lastCullX = Infinity;
let lastCullZ = Infinity;
let maxCullableRadius = 1;
let yaw = 0;
let pitch = 0;
let grounded = true;
let pointerLockChangedAt = 0;
let debugPasscodeBuffer = '';
let gateTransitioning = false;

const velocity = new THREE.Vector3();
const desiredVelocity = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const keys = new Set();
const colliders = [];
const fires = [];
const tentacles = [];
const eyeGuardians = [];
const eyeBolts = [];
const combatEffects = [];
const cullables = [];
const cullGrid = new Map();
const visibleCullables = new Set();

function makeOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'aether-world-overlay';
  overlay.className = 'hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'The ruined city of Aetherholm');
  overlay.innerHTML =
    '<div id="aether-world-viewport"></div>' +
    '<div class="aether-world-hud">' +
      '<div class="aether-world-title">AETHERHOLM // AFTER THE CALAMITY</div>' +
      '<div id="aether-world-hearts" class="aether-world-hearts" aria-label="Health"></div>' +
      '<div id="aether-world-warden-status" class="aether-world-warden-status hidden"></div>' +
      '<div class="aether-world-crosshair"></div>' +
      '<div id="aether-world-damage-flash" class="aether-world-damage-flash"></div>' +
      '<div id="aether-world-parry-flash" class="aether-world-parry-flash"><span>PARRIED</span></div>' +
      '<div id="aether-world-gate-fade" class="aether-world-gate-fade"></div>' +
      '<div class="aether-world-help">' +
        'ESC TO UNFOCUS &nbsp; RIGHT CLICK TO PARRY' +
        '<span id="aether-world-status" class="aether-world-status">CLICK THE DARKNESS TO CAPTURE THE MOUSE</span>' +
      '</div>' +
    '</div>' +
    '<div id="aether-world-death" class="aether-world-death hidden">' +
      '<div class="aether-world-death-title">THE CITY HAS TAKEN YOU</div>' +
      '<div class="aether-world-death-copy">Your remains drift back toward the dead fountain.</div>' +
      '<button id="aether-world-resummon" type="button">RESUMMON AT FOUNTAIN</button>' +
    '</div>' +
    '<div id="aether-world-loading" class="aether-world-loading hidden">' +
      '<div class="aether-world-loading-title">THE RUINS ARE WAKING</div>' +
      '<div class="aether-world-loading-track"><div id="aether-world-loading-bar"></div></div>' +
      '<div id="aether-world-loading-text" class="aether-world-loading-text">0%</div>' +
    '</div>';
  document.body.appendChild(overlay);

  viewport = document.getElementById('aether-world-viewport');
  status = document.getElementById('aether-world-status');
  loadingPanel = document.getElementById('aether-world-loading');
  loadingBar = document.getElementById('aether-world-loading-bar');
  loadingText = document.getElementById('aether-world-loading-text');
  deathPanel = document.getElementById('aether-world-death');
  damageFlash = document.getElementById('aether-world-damage-flash');
  parryFlash = document.getElementById('aether-world-parry-flash');
  gateFade = document.getElementById('aether-world-gate-fade');
  wardenStatus = document.getElementById('aether-world-warden-status');
  renderHearts();
  document.getElementById('aether-world-resummon').addEventListener('click', resummonAtFountain);
  viewport.addEventListener('click', captureMouse);
}

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

function makeCanvasTexture(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  painter(ctx, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function colorFill(ctx, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

function makeNoiseTexture(base, flecks, seed) {
  const random = mulberry32(seed);
  return makeCanvasTexture(64, 64, (ctx, width, height) => {
    colorFill(ctx, width, height, base);
    for (const fleck of flecks) {
      ctx.fillStyle = fleck.color;
      const count = fleck.count || 80;
      for (let i = 0; i < count; i++) {
        const size = fleck.size ? fleck.size(random) : 1;
        ctx.fillRect((random() * width) | 0, (random() * height) | 0, size, size);
      }
    }
  });
}

function makeBloodTexture(seed) {
  const random = mulberry32(seed);
  return makeCanvasTexture(48, 48, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    // congealed pool
    ctx.fillStyle = 'rgba(54, 1, 3, 0.95)';
    for (let i = 0; i < 11; i++) {
      const x = width * (0.3 + random() * 0.4);
      const y = height * (0.3 + random() * 0.4);
      const rx = 4 + random() * 13;
      const ry = 3 + random() * 10;
      ctx.beginPath();
      ctx.ellipse(x + (random() - 0.5) * 16, y + (random() - 0.5) * 16, rx, ry, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // dark dried centre
    ctx.fillStyle = 'rgba(26, 2, 5, 0.7)';
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height * 0.5, 8, 6, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    // bright fresh spatter
    ctx.fillStyle = 'rgba(104, 6, 2, 0.82)';
    for (let i = 0; i < 42; i++) ctx.fillRect((random() * width) | 0, (random() * height) | 0, 1 + (random() * 3 | 0), 1 + (random() * 2 | 0));
    // flung droplet trails
    ctx.fillStyle = 'rgba(70, 1, 1, 0.88)';
    for (let i = 0; i < 9; i++) {
      const x = (random() * width) | 0;
      const y = (random() * height) | 0;
      const len = 3 + (random() * 11 | 0);
      ctx.fillRect(x, y, 1, len);
      ctx.fillRect(x, y + len, 2, 2);
    }
  });
}

function makeSmokeTexture(seed) {
  const random = mulberry32(seed);
  return makeCanvasTexture(32, 32, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < 7; i++) {
      const alpha = 0.08 + random() * 0.12;
      ctx.fillStyle = `rgba(16, 14, 14, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(10 + random() * 12, 10 + random() * 14, 5 + random() * 9, 4 + random() * 8, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function strokeCrack(ctx, random, width, height, color, segments, step) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  let x = (random() * width) | 0;
  let y = (random() * height) | 0;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let s = 0; s < segments; s++) {
    x += (random() - 0.5) * step;
    y += (random() - 0.5) * step;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Scorched earth: soot blotches, grey ash dust, charcoal grit, cracks, embers.
function makeAshTexture(seed) {
  const random = mulberry32(seed);
  return makeCanvasTexture(64, 64, (ctx, w, h) => {
    colorFill(ctx, w, h, '#16120f');
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = random() < 0.5 ? '#0a0807' : '#241d17';
      const s = 4 + (random() * 12 | 0);
      ctx.fillRect((random() * w) | 0, (random() * h) | 0, s, s);
    }
    ctx.fillStyle = '#39312a';
    for (let i = 0; i < 150; i++) ctx.fillRect((random() * w) | 0, (random() * h) | 0, 1, 1);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = '#050403';
      ctx.fillRect((random() * w) | 0, (random() * h) | 0, 1 + (random() * 2 | 0), 1 + (random() * 2 | 0));
    }
    for (let i = 0; i < 7; i++) strokeCrack(ctx, random, w, h, '#040302', 5, 16);
    for (let i = 0; i < 16; i++) {
      const ex = (random() * w) | 0;
      const ey = (random() * h) | 0;
      ctx.fillStyle = '#5a1606';
      ctx.fillRect(ex - 1, ey - 1, 3, 3);
      ctx.fillStyle = '#ff6a1e';
      ctx.fillRect(ex, ey, 1, 1);
    }
  });
}

// Ruined masonry: offset brick courses, soot-streaked, cracked, chipped.
function makeBrickTexture(seed, palette) {
  const random = mulberry32(seed);
  return makeCanvasTexture(64, 64, (ctx, w, h) => {
    colorFill(ctx, w, h, palette.mortar);
    const rows = 7;
    const bh = h / rows;
    const bw = 17;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const bx = x + offset + 1;
        const by = r * bh + 1;
        const bwid = bw - 2;
        const bhei = bh - 2;
        const t = random();
        ctx.fillStyle = t < 0.22 ? palette.dark : (t < 0.5 ? palette.light : palette.mid);
        ctx.fillRect(bx, by, bwid, bhei);
        ctx.fillStyle = palette.soot;
        const grit = 2 + (random() * 4 | 0);
        for (let g = 0; g < grit; g++) ctx.fillRect(bx + (random() * bwid | 0), by + (random() * bhei | 0), 1, 1);
        if (random() < 0.12) {
          ctx.fillStyle = palette.mortar;
          ctx.fillRect(bx + (random() * bwid * 0.6 | 0), by, 2 + (random() * 3 | 0), bhei);
        }
      }
    }
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(6,5,4,0.5)';
      ctx.fillRect((random() * w) | 0, 0, 2 + (random() * 3 | 0), h);
    }
    for (let i = 0; i < 3; i++) strokeCrack(ctx, random, w, h, '#0a0808', 8, 12);
  });
}

// Charcoal with smouldering ember cracks.
function makeCharTexture(seed) {
  const random = mulberry32(seed);
  return makeCanvasTexture(32, 32, (ctx, w, h) => {
    colorFill(ctx, w, h, '#0a0807');
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = random() < 0.5 ? '#161210' : '#030202';
      ctx.fillRect((random() * w) | 0, (random() * h) | 0, 1 + (random() * 2 | 0), 1 + (random() * 2 | 0));
    }
    for (let i = 0; i < 9; i++) {
      const ex = (random() * w) | 0;
      const ey = (random() * h) | 0;
      const len = 1 + (random() * 3 | 0);
      ctx.fillStyle = '#4a1204';
      ctx.fillRect(ex, ey, 1, len);
      if (random() < 0.6) {
        ctx.fillStyle = '#d8430d';
        ctx.fillRect(ex, ey + (random() * len | 0), 1, 1);
      }
    }
  });
}

// Cobblestone street, grimed and bloodstained.
function makeRoadTexture(seed) {
  const random = mulberry32(seed);
  return makeCanvasTexture(64, 64, (ctx, w, h) => {
    colorFill(ctx, w, h, '#22201d');
    const cs = 9;
    for (let y = 0; y < h; y += cs) {
      const off = ((y / cs) % 2) ? cs / 2 : 0;
      for (let x = -cs; x < w; x += cs) {
        const shade = 0.6 + random() * 0.6;
        const base = Math.min(70, 46 * shade) | 0;
        ctx.fillStyle = `rgb(${base},${Math.max(0, base - 6)},${Math.max(0, base - 11)})`;
        ctx.fillRect(x + off + 1, y + 1, cs - 2, cs - 2);
      }
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = '#0f0c0a';
      ctx.fillRect((random() * w) | 0, (random() * h) | 0, 1 + (random() * 2 | 0), 1 + (random() * 2 | 0));
    }
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = 'rgba(58,7,4,0.5)';
      ctx.fillRect((random() * w) | 0, (random() * h) | 0, 2 + (random() * 4 | 0), 2 + (random() * 3 | 0));
    }
  });
}

// Fire glowing through a window: dark frame, hot light rising from below.
function makeWindowFireTexture(seed) {
  const random = mulberry32(seed);
  return makeCanvasTexture(32, 48, (ctx, w, h) => {
    colorFill(ctx, w, h, '#160500');
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const heat = Math.pow(t, 1.4);
      const r = Math.min(255, 40 + heat * 215 | 0);
      const g = Math.min(255, 8 + heat * 150 | 0);
      const b = (heat * 45) | 0;
      const inset = ((1 - heat) * w * 0.5) | 0;
      const wob = (Math.sin(y * 0.7) * 2 + (random() - 0.5) * 3) | 0;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(inset + wob, h - 1 - y, Math.max(1, w - inset * 2), 1);
    }
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = '#ffd66a';
      ctx.fillRect((random() * w) | 0, (h * 0.4 + random() * h * 0.6) | 0, 1, 1);
    }
  });
}

// Soft flame silhouette (white alpha mask, tinted by the material colour).
function makeFlameTexture(seed) {
  const random = mulberry32(seed);
  return makeCanvasTexture(32, 48, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const prof = Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5);
      let half = prof * (w * 0.5) * (0.45 + t * 0.6);
      half *= 0.78 + random() * 0.3;
      const alpha = Math.min(1, (1 - Math.pow(1 - t, 1.6)) * 1.25);
      const cx = w / 2 + Math.sin(y * 0.5) * 1.4;
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.fillRect((cx - half) | 0, h - 1 - y, Math.max(1, (half * 2) | 0), 1);
    }
  });
}

function cullCellCoord(value) {
  return Math.floor(value / CULL_CELL_SIZE);
}

function cullCellKey(cx, cz) {
  return cx + ',' + cz;
}

function addCullableToGrid(entry) {
  const cx = cullCellCoord(entry.x);
  const cz = cullCellCoord(entry.z);
  const key = cullCellKey(cx, cz);
  let bucket = cullGrid.get(key);
  if (!bucket) {
    bucket = [];
    cullGrid.set(key, bucket);
  }
  bucket.push(entry);
  maxCullableRadius = Math.max(maxCullableRadius, entry.radius);
}

function addCullable(object, x, z, radius = 1) {
  object.visible = false;
  scene.add(object);
  const entry = { object, x, z, radius };
  cullables.push(entry);
  addCullableToGrid(entry);
  return object;
}

function setObjectVisible(object, visible) {
  if (object.visible === visible) return;
  object.visible = visible;
}

function setLoadingVisible(visible) {
  if (!loadingPanel) return;
  loadingPanel.classList.toggle('hidden', !visible);
}

function renderHearts() {
  const hearts = document.getElementById('aether-world-hearts');
  if (!hearts) return;

  let html = '';
  for (let i = 0; i < PLAYER_MAX_HP; i++) {
    const amount = THREE.MathUtils.clamp(playerHp - i, 0, 1);
    const stateClass = amount >= 1 ? '' : amount >= 0.5 ? ' half' : ' empty';
    html += '<span class="aether-world-heart' + stateClass + '"></span>';
  }
  hearts.innerHTML = html;
}

function setPlayerHp(value) {
  playerHp = THREE.MathUtils.clamp(Math.round(value * 2) / 2, 0, PLAYER_MAX_HP);
  renderHearts();
}

function updateWardenStatus() {
  if (!wardenStatus) return;
  if (wardensSlain <= 0) {
    wardenStatus.classList.add('hidden');
    wardenStatus.textContent = '';
    return;
  }

  wardenStatus.classList.remove('hidden');
  const remaining = Math.max(0, eyeGuardians.length - wardensSlain);
  wardenStatus.textContent = remaining > 0
    ? remaining + ' warden' + (remaining === 1 ? '' : 's') + ' remain'
    : 'the gate has opened';
}

function removeCollider(collider) {
  const index = colliders.indexOf(collider);
  if (index >= 0) colliders.splice(index, 1);
}

function setOpenedGateState(opened) {
  gateOpened = opened;
  gateHoleUniforms.opened.value = opened ? 1 : 0;
  if (fountainGroup) fountainGroup.visible = !opened;
  if (openedGateGroup) openedGateGroup.visible = opened;

  if (opened) {
    removeCollider(fountainBasinCollider);
    removeCollider(fountainStatueCollider);
  } else {
    if (fountainBasinCollider && !colliders.includes(fountainBasinCollider)) colliders.push(fountainBasinCollider);
    if (fountainStatueCollider && !colliders.includes(fountainStatueCollider)) colliders.push(fountainStatueCollider);
  }
}

function setCombatStatus(text, duration = 900, time = performance.now()) {
  combatStatusText = text;
  combatStatusUntil = time + duration;
}

function getSavedEndgameScene() {
  try {
    return window.localStorage.getItem(ENDGAME_SCENE_STORAGE_KEY) || 'world3d';
  } catch (err) {
    return 'world3d';
  }
}

function setSavedEndgameScene(sceneName) {
  try {
    window.localStorage.setItem(ENDGAME_SCENE_STORAGE_KEY, sceneName);
  } catch (err) {
    // Storage may be unavailable in some embedded/preview contexts.
  }
}

function resetSavedEndgameScene() {
  try {
    window.localStorage.removeItem(ENDGAME_SCENE_STORAGE_KEY);
  } catch (err) {
    // Storage may be unavailable in some embedded/preview contexts.
  }
}

function openBossScene() {
  setSavedEndgameScene('boss2d');
  if (window.AetherBoss2D && typeof window.AetherBoss2D.open === 'function') {
    window.AetherBoss2D.open();
    return;
  }
  window.location.href = new URL('../boss2d/preview.html', import.meta.url).href;
}

function disableFogOnMaterials(materials) {
  for (const material of Object.values(materials)) {
    if (material) material.fog = false;
  }
}

function applyGateHoleCutout(material) {
  material.onBeforeCompile = shader => {
    shader.uniforms.gateHoleOpen = gateHoleUniforms.opened;
    shader.uniforms.gateHoleRadiusSq = gateHoleUniforms.radiusSq;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGateWorldPosition;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGateWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float gateHoleOpen;\nuniform float gateHoleRadiusSq;\nvarying vec3 vGateWorldPosition;')
      .replace(
        '#include <dithering_fragment>',
        'if (gateHoleOpen > 0.5 && dot(vGateWorldPosition.xz, vGateWorldPosition.xz) < gateHoleRadiusSq) discard;\n#include <dithering_fragment>'
      );
  };
}

function randomTentacleDelay() {
  return THREE.MathUtils.lerp(TENTACLE_SPAWN_MIN_DELAY, TENTACLE_SPAWN_MAX_DELAY, Math.random());
}

function updateLoadingProgress(label = 'WARMING RUINS', pctOverride = null) {
  if (!loadingBar || !loadingText) return;
  const total = Math.max(1, cullables.length);
  const pct = pctOverride === null
    ? (warmupComplete ? 100 : Math.min(99, Math.floor((warmupIndex / total) * 100)))
    : pctOverride;
  loadingBar.style.width = pct + '%';
  loadingText.textContent = label + ' // ' + pct + '%';
}

function runWhenIdle(callback, timeout = 400) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout });
    return;
  }

  window.setTimeout(() => callback({ timeRemaining: () => 0 }), 16);
}

function initMaterials() {
  const ashMap = makeAshTexture(0xC0FFEE);
  ashMap.repeat.set(7, 7);

  const roadMap = makeRoadTexture(0xA370AD);
  roadMap.repeat.set(3, 20);

  const stoneMap = makeBrickTexture(0x5700AE, {
    mortar: '#322d31', light: '#706b71', mid: '#565158', dark: '#3b373e', soot: '#1a1718'
  });
  stoneMap.repeat.set(2, 2.4);

  const darkStoneMap = makeNoiseTexture('#2b2930', [
    { color: '#3a3842', count: 90, size: random => 1 + (random() * 2 | 0) },
    { color: '#141318', count: 140, size: random => 1 + (random() * 3 | 0) }
  ], 0x0DDBA11);
  darkStoneMap.repeat.set(2, 2);

  const charMap = makeCharTexture(0xC4A1);
  charMap.repeat.set(2, 2);

  const flameMap = makeFlameTexture(0xF1A3E);

  ruinMaterials = {
    ground: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ashMap, roughness: 1 }),
    road: new THREE.MeshStandardMaterial({ color: 0xffffff, map: roadMap, roughness: 1 }),
    roadEdge: new THREE.MeshStandardMaterial({ color: 0x120f0d, roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneMap, roughness: 0.95 }),
    darkStone: new THREE.MeshStandardMaterial({ color: 0xffffff, map: darkStoneMap, roughness: 0.98 }),
    char: new THREE.MeshStandardMaterial({ color: 0xffffff, map: charMap, roughness: 1 }),
    ember: new THREE.MeshBasicMaterial({ color: 0xff5a18, transparent: true, opacity: 0.82 }),
    windowFire: new THREE.MeshBasicMaterial({ map: makeWindowFireTexture(0x717D0), color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
    blood: new THREE.MeshBasicMaterial({ map: makeBloodTexture(0xB100D), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    oldBlood: new THREE.MeshBasicMaterial({ map: makeBloodTexture(0xD15EA5E), color: 0x7d120d, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
    smoke: new THREE.SpriteMaterial({ map: makeSmokeTexture(0x5A10AE), color: 0x2a2421, transparent: true, opacity: 0.48, depthWrite: false }),
    // Shared flame materials — a tinted flame silhouette reused by every flame
    // of a given type instead of allocating thousands of materials.
    flameWallOuter: new THREE.MeshBasicMaterial({ map: flameMap, color: 0xe5430d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    flameWallInner: new THREE.MeshBasicMaterial({ map: flameMap, color: 0xffc24b, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
    flameTreeOuter: new THREE.MeshBasicMaterial({ map: flameMap, color: 0xe5430d, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide }),
    flameTreeInner: new THREE.MeshBasicMaterial({ map: flameMap, color: 0xffcb55, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
    fireOuter: new THREE.MeshBasicMaterial({ color: 0xe73b0c, transparent: true, opacity: 0.72 }),
    fireInner: new THREE.MeshBasicMaterial({ color: 0xffc43d, transparent: true, opacity: 0.9 })
  };
  applyGateHoleCutout(ruinMaterials.ground);
  applyGateHoleCutout(ruinMaterials.road);
  applyGateHoleCutout(ruinMaterials.roadEdge);

  tentacleMaterials = {
    flesh: new THREE.MeshStandardMaterial({
      color: 0x050308,
      roughness: 0.42,
      metalness: 0.18,
      emissive: 0x110006,
      emissiveIntensity: 0.75
    }),
    ridge: new THREE.MeshStandardMaterial({
      color: 0x160714,
      roughness: 0.62,
      emissive: 0x220009,
      emissiveIntensity: 0.65
    }),
    maw: new THREE.MeshBasicMaterial({
      color: 0x240008,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    })
  };

  landmarkMaterials = {
    portalStone: new THREE.MeshStandardMaterial({ color: 0x30263c, roughness: 0.86, metalness: 0.08 }),
    portalGlow: new THREE.MeshBasicMaterial({ color: 0x9f49d7, transparent: true, opacity: 0.52, side: THREE.DoubleSide }),
    silverStone: new THREE.MeshStandardMaterial({ color: 0xaeb5c4, roughness: 0.76, metalness: 0.18 }),
    silverDark: new THREE.MeshStandardMaterial({ color: 0x555e70, roughness: 0.9 }),
    doomStone: new THREE.MeshStandardMaterial({ color: 0x211923, roughness: 0.94 }),
    doomEmber: new THREE.MeshBasicMaterial({ color: 0xb71818, transparent: true, opacity: 0.72 }),
    river: new THREE.MeshStandardMaterial({ color: 0x100c11, roughness: 0.24, metalness: 0.15, transparent: true, opacity: 0.96 }),
    riverSheen: new THREE.MeshBasicMaterial({ color: 0x8c3038, transparent: true, opacity: 0.46, depthWrite: false }),
    bridgeWood: new THREE.MeshStandardMaterial({ color: 0x21130e, roughness: 1 }),
    bridgeIron: new THREE.MeshStandardMaterial({ color: 0x29282d, roughness: 0.72, metalness: 0.48 }),
    gateVoid: new THREE.MeshBasicMaterial({ color: 0x050006, fog: false, side: THREE.DoubleSide }),
    gateMouth: new THREE.MeshBasicMaterial({ color: 0x020003, fog: false, side: THREE.DoubleSide }),
    gateBlood: new THREE.MeshBasicMaterial({ color: 0x6e0613, fog: false, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
    gateRune: new THREE.MeshBasicMaterial({
      color: 0x7a0013,
      fog: false,
      side: THREE.DoubleSide
    }),
    gateEmber: new THREE.MeshBasicMaterial({
      color: 0x8f0018,
      fog: false
    })
  };

  eyeMaterials = {
    flesh: new THREE.MeshStandardMaterial({
      color: 0x090408,
      roughness: 0.34,
      metalness: 0.18,
      emissive: 0x210007,
      emissiveIntensity: 0.72
    }),
    blood: new THREE.MeshStandardMaterial({
      color: 0x4d0008,
      roughness: 0.42,
      emissive: 0x390006,
      emissiveIntensity: 0.95
    }),
    iris: new THREE.MeshBasicMaterial({ color: 0xd20b19 }),
    pupil: new THREE.MeshBasicMaterial({ color: 0x020003 }),
    vein: new THREE.MeshBasicMaterial({ color: 0x8c0712 }),
    bolt: new THREE.MeshBasicMaterial({ color: 0x12000f, transparent: true, opacity: 0.96 }),
    boltGlow: new THREE.MeshBasicMaterial({
      color: 0xb20a25,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  };
  disableFogOnMaterials(eyeMaterials);
}

function makeWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(DEBUG_INFINITE_VISION ? 0x090705 : 0x020101);
  scene.fog = DEBUG_INFINITE_VISION ? null : new THREE.FogExp2(0x020101, PLAYER_FOG_DENSITY);

  camera = new THREE.PerspectiveCamera(72, 1, 0.05, DEBUG_INFINITE_VISION ? 1200 : EYE_GUARDIAN_WAKE_RANGE + 32);
  camera.position.set(0, EYE_HEIGHT, 10.8);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  initMaterials();

  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 0.82));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // The world geometry is static and the only shadow-caster is the fixed moon
  // light, so the shadow map never needs to re-render after the first bake.
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEBUG_INFINITE_VISION ? 1.38 : 1.0;
  viewport.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(
    DEBUG_INFINITE_VISION ? 0x8b8f90 : 0x201817,
    DEBUG_INFINITE_VISION ? 0x22100c : 0x050101,
    DEBUG_INFINITE_VISION ? 0.82 : 0.055
  ));

  const ashenMoon = new THREE.DirectionalLight(
    DEBUG_INFINITE_VISION ? 0xd4cfc0 : 0x6e5d55,
    DEBUG_INFINITE_VISION ? 2.05 : 0.12
  );
  ashenMoon.position.set(-46, 74, 35);
  ashenMoon.castShadow = true;
  ashenMoon.shadow.mapSize.set(1024, 1024);
  scene.add(ashenMoon);

  playerLight = new THREE.PointLight(
    0xffb16a,
    DEBUG_INFINITE_VISION ? 32 : PLAYER_LIGHT_INTENSITY,
    DEBUG_INFINITE_VISION ? 0 : PLAYER_LIGHT_RADIUS,
    DEBUG_INFINITE_VISION ? 2.2 : PLAYER_LIGHT_DECAY
  );
  playerLight.castShadow = false;
  scene.add(playerLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_LIMIT * 2.22, WORLD_LIMIT * 2.22),
    ruinMaterials.ground
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  addRoads();
  addEasternRiverAndBridge();
  addFountain();
  addRuinedCityWalls();
  addCardinalLandmarks();
  addEyeGuardians();
  addRuinedCity();
  addDeadForest();
  addPlayerSword();
}

function makeWeaponMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false
  });
}

function addPlayerSword() {
  sword = new THREE.Group();
  sword.position.set(0.54, -0.48, -0.88);
  sword.rotation.set(-0.28, -0.48, -0.42);
  sword.renderOrder = 10000;

  // The weapon is drawn with depthTest off (always on top), so visible layering
  // is controlled purely by renderOrder: low = behind, high = in front.
  const add = (geometry, material, order, place) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10000 + order;
    place(mesh);
    sword.add(mesh);
    return mesh;
  };

  const steel = makeWeaponMaterial(0xaab0b8);
  const steelDark = makeWeaponMaterial(0x5f656d);
  const edge = makeWeaponMaterial(0xe8edf2);
  const bloodMat = makeWeaponMaterial(0x5c0c0c);
  const iron = makeWeaponMaterial(0x33333a);
  const brass = makeWeaponMaterial(0x8a6a32);
  const leather = makeWeaponMaterial(0x261711);

  // Blade — flat tapered steel with a dark central spine and bright bevels.
  add(new THREE.BoxGeometry(0.115, 0.94, 0.026), steel, 51, m => m.position.y = 0.53);
  add(new THREE.BoxGeometry(0.034, 0.92, 0.04), steelDark, 52, m => m.position.y = 0.53);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.016, 0.92, 0.03), edge, 52, m => m.position.set(side * 0.05, 0.53, 0));
  }

  // Point — a slim pyramid with a bright leading edge.
  add(new THREE.ConeGeometry(0.082, 0.2, 4), steel, 51, m => { m.position.y = 1.08; m.rotation.y = Math.PI / 4; });
  add(new THREE.ConeGeometry(0.046, 0.2, 4), edge, 52, m => { m.position.y = 1.085; m.rotation.y = Math.PI / 4; });

  // Dried blood smeared down the blade.
  add(new THREE.BoxGeometry(0.12, 0.28, 0.03), bloodMat, 53, m => m.position.set(0.012, 0.86, 0.003));
  add(new THREE.BoxGeometry(0.105, 0.15, 0.032), bloodMat, 53, m => m.position.set(-0.02, 0.5, -0.003));

  // Crossguard — drooping iron bar with brass end caps.
  add(new THREE.BoxGeometry(0.46, 0.07, 0.09), iron, 52, m => { m.position.y = 0.05; m.rotation.z = -0.05; });
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.085, 0.1), brass, 52, m => m.position.set(side * 0.24, 0.04, 0));
  }

  // Grip — wrapped leather with iron binding rings.
  add(new THREE.CylinderGeometry(0.05, 0.045, 0.34, 6), leather, 51, m => m.position.y = -0.16);
  for (let i = 0; i < 4; i++) {
    add(new THREE.BoxGeometry(0.105, 0.018, 0.105), iron, 52, m => m.position.y = -0.05 - i * 0.075);
  }

  // Pommel — faceted iron knob.
  add(new THREE.IcosahedronGeometry(0.072, 0), iron, 52, m => m.position.y = -0.35);

  camera.add(sword);
}

function addRoads() {
  const length = WORLD_LIMIT * 2.12;
  const vertical = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, length), ruinMaterials.road);
  vertical.rotation.x = -Math.PI / 2;
  vertical.position.y = 0.012;
  vertical.receiveShadow = true;
  scene.add(vertical);

  const horizontal = new THREE.Mesh(new THREE.PlaneGeometry(length, ROAD_WIDTH), ruinMaterials.road);
  horizontal.rotation.x = -Math.PI / 2;
  horizontal.position.y = 0.014;
  horizontal.receiveShadow = true;
  scene.add(horizontal);

  for (const side of [-1, 1]) {
    const xVerge = new THREE.Mesh(new THREE.PlaneGeometry(0.75, length), ruinMaterials.roadEdge);
    xVerge.rotation.x = -Math.PI / 2;
    xVerge.position.set(side * (ROAD_WIDTH / 2 + 0.36), 0.02, 0);
    scene.add(xVerge);

    const zVerge = new THREE.Mesh(new THREE.PlaneGeometry(length, 0.75), ruinMaterials.roadEdge);
    zVerge.rotation.x = -Math.PI / 2;
    zVerge.position.set(0, 0.022, side * (ROAD_WIDTH / 2 + 0.36));
    scene.add(zVerge);
  }

  addRoadDamage();
}

function addEasternRiverAndBridge() {
  const riverLength = WORLD_LIMIT * 2.16;
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(EAST_RIVER_WIDTH, riverLength),
    landmarkMaterials.river
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(EAST_RIVER_X, 0.047, 0);
  scene.add(river);

  for (const side of [-1, 1]) {
    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.3, riverLength),
      ruinMaterials.char
    );
    bank.position.set(EAST_RIVER_X + side * (EAST_RIVER_WIDTH / 2 + 0.35), 0.04, 0);
    scene.add(bank);
  }

  const random = mulberry32(0xE457B1D6);
  for (let i = 0; i < 26; i++) {
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12 + random() * 0.28, 2.5 + random() * 8),
      landmarkMaterials.riverSheen
    );
    sheen.rotation.x = -Math.PI / 2;
    sheen.rotation.z = (random() - 0.5) * 0.18;
    sheen.position.set(
      EAST_RIVER_X + (random() - 0.5) * (EAST_RIVER_WIDTH - 1),
      0.056,
      (random() * 2 - 1) * WORLD_LIMIT
    );
    addCullable(sheen, sheen.position.x, sheen.position.z, 5);
  }

  const bridge = new THREE.Group();
  bridge.position.set(EAST_RIVER_X, EAST_BRIDGE_HEIGHT - 0.13, 0);
  const bridgeLength = EAST_RIVER_WIDTH + 5;
  const plankCount = 12;
  for (let i = 0; i < plankCount; i++) {
    if (i === 3 || i === 9) continue;
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(bridgeLength / plankCount * 0.92, 0.22, ROAD_WIDTH * 0.88),
      landmarkMaterials.bridgeWood
    );
    plank.position.set(-bridgeLength / 2 + (i + 0.5) * bridgeLength / plankCount, 0.13 + (i % 3) * 0.018, 0);
    plank.rotation.y = (random() - 0.5) * 0.025;
    plank.rotation.z = (random() - 0.5) * 0.035;
    bridge.add(plank);
  }

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(bridgeLength, 0.16, 0.18),
      landmarkMaterials.bridgeIron
    );
    rail.position.set(0, 1.0, side * (ROAD_WIDTH * 0.46));
    bridge.add(rail);

    for (let i = 0; i < 7; i++) {
      if ((side === -1 && i === 4) || (side === 1 && i === 2)) continue;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.65, 0.16), landmarkMaterials.bridgeIron);
      post.position.set(-bridgeLength / 2 + i * bridgeLength / 6, 0.52, side * (ROAD_WIDTH * 0.46));
      post.rotation.z = (random() - 0.5) * 0.08;
      bridge.add(post);
    }
  }

  for (const side of [-1, 1]) {
    const support = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 1.2, ROAD_WIDTH + 1.3),
      ruinMaterials.darkStone
    );
    support.position.set(side * (bridgeLength / 2 - 0.75), -EAST_BRIDGE_HEIGHT * 0.62, 0);
    bridge.add(support);
  }

  addCullable(bridge, EAST_RIVER_X, 0, 30);

  for (const side of [-1, 1]) {
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(EAST_BRIDGE_RAMP_LENGTH, 0.3, ROAD_WIDTH * 0.9),
      landmarkMaterials.bridgeWood
    );
    const angle = Math.atan2(EAST_BRIDGE_HEIGHT, EAST_BRIDGE_RAMP_LENGTH);
    ramp.position.set(
      EAST_RIVER_X + side * (bridgeLength / 2 + EAST_BRIDGE_RAMP_LENGTH / 2 - 0.4),
      EAST_BRIDGE_HEIGHT / 2 - 0.15,
      0
    );
    ramp.rotation.z = -side * angle;
    scene.add(ramp);
  }

  const riverMinX = EAST_RIVER_X - EAST_RIVER_WIDTH / 2;
  const riverMaxX = EAST_RIVER_X + EAST_RIVER_WIDTH / 2;
  colliders.push({ minX: riverMinX, maxX: riverMaxX, minZ: -WORLD_LIMIT, maxZ: -EAST_BRIDGE_HALF_WIDTH });
  colliders.push({ minX: riverMinX, maxX: riverMaxX, minZ: EAST_BRIDGE_HALF_WIDTH, maxZ: WORLD_LIMIT });
}

function addBrokenWallSegment(x1, z1, x2, z2, seed) {
  const random = mulberry32(seed);
  const horizontal = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  const length = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  const direction = horizontal ? Math.sign(x2 - x1) : Math.sign(z2 - z1);
  const chunkLength = 4.5;
  const count = Math.max(1, Math.ceil(length / chunkLength));
  const group = new THREE.Group();
  const centerX = (x1 + x2) / 2;
  const centerZ = (z1 + z2) / 2;
  group.position.set(centerX, 0, centerZ);

  for (let i = 0; i < count; i++) {
    const start = i * length / count;
    const end = (i + 1) * length / count;
    const size = Math.max(0.4, end - start - 0.18);
    const along = (start + end) / 2;
    const worldX = horizontal ? x1 + direction * along : x1;
    const worldZ = horizontal ? z1 : z1 + direction * along;

    if (random() < 0.18 && i > 0 && i < count - 1) {
      const rubble = new THREE.Mesh(
        new THREE.BoxGeometry(1.2 + random() * 1.6, 0.45 + random() * 0.55, 0.8 + random() * 1.3),
        ruinMaterials.darkStone
      );
      rubble.position.set(worldX - centerX, rubble.geometry.parameters.height / 2, worldZ - centerZ);
      rubble.rotation.set(random() * 0.7, random() * Math.PI, random() * 0.7);
      group.add(rubble);
      continue;
    }

    const height = 6.8 + random() * 5.2;
    const thickness = 1.35 + random() * 0.55;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? size : thickness, height, horizontal ? thickness : size),
      random() < 0.28 ? ruinMaterials.darkStone : ruinMaterials.stone
    );
    wall.position.set(worldX - centerX, height / 2, worldZ - centerZ);
    wall.rotation.set((random() - 0.5) * 0.025, 0, (random() - 0.5) * 0.055);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    if (random() < 0.32) {
      const battlement = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? Math.min(1.25, size) : thickness * 1.1, 1.05, horizontal ? thickness * 1.12 : Math.min(1.25, size)),
        ruinMaterials.darkStone
      );
      battlement.position.set(worldX - centerX, height + 0.48, worldZ - centerZ);
      group.add(battlement);
    }

    const halfX = horizontal ? size / 2 : thickness / 2;
    const halfZ = horizontal ? thickness / 2 : size / 2;
    colliders.push({
      minX: worldX - halfX,
      maxX: worldX + halfX,
      minZ: worldZ - halfZ,
      maxZ: worldZ + halfZ
    });
  }

  addCullable(group, centerX, centerZ, length / 2 + 4);
}

function addRuinedCityWalls() {
  const C = CITY_CORE_HALF;
  const A = CITY_ARM_HALF;
  const E = CITY_ARM_END;
  const G = CITY_GATE_HALF;
  const segments = [
    [-C, -C, -A, -C], [A, -C, C, -C],
    [-C, C, -A, C], [A, C, C, C],
    [-C, -C, -C, -A], [-C, A, -C, C],
    [C, -C, C, -A], [C, A, C, C],
    [-A, -C, -A, -E], [A, -C, A, -E],
    [-A, C, -A, E], [A, C, A, E],
    [-C, -A, -E, -A], [-C, A, -E, A],
    [C, -A, E, -A], [C, A, E, A],
    [-A, -E, -G, -E], [G, -E, A, -E],
    [-A, E, -G, E], [G, E, A, E],
    [-E, -A, -E, -G], [-E, G, -E, A],
    [E, -A, E, -G], [E, G, E, A]
  ];

  segments.forEach((segment, index) => {
    addBrokenWallSegment(segment[0], segment[1], segment[2], segment[3], 0xA11CE + index * 977);
  });

  const corners = [
    [-C, -C], [C, -C], [-C, C], [C, C],
    [-A, -E], [A, -E], [-A, E], [A, E],
    [-E, -A], [-E, A], [E, -A], [E, A]
  ];
  const random = mulberry32(0xCA571E);
  for (const [x, z] of corners) {
    if (random() < 0.2) continue;
    const height = 10 + random() * 6.5;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.9, height, 7),
      random() < 0.35 ? ruinMaterials.darkStone : ruinMaterials.stone
    );
    tower.position.set(x, height / 2, z);
    tower.rotation.z = (random() - 0.5) * 0.08;
    tower.castShadow = true;
    addCullable(tower, x, z, 7);
    colliders.push({ type: 'circle', x, z, radius: 3.6 });
  }
}

function addRuinedPortal() {
  const random = mulberry32(0xB07A1);
  const group = new THREE.Group();
  group.position.set(0, 0, -168);

  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, side === -1 ? 11.5 : 8.7, 3.1),
      landmarkMaterials.portalStone
    );
    column.position.set(side * 6.1, column.geometry.parameters.height / 2, 0);
    column.rotation.z = side * (side === -1 ? 0.035 : 0.11);
    column.castShadow = true;
    group.add(column);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(5.1, 1.2, 4.8), ruinMaterials.darkStone);
    foot.position.set(side * 6.1, 0.6, 0);
    foot.rotation.y = side * 0.08;
    group.add(foot);
  }

  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(6.1, 1.55, 6, 18, Math.PI * 0.82),
    landmarkMaterials.portalStone
  );
  arch.position.set(-0.55, 10.7, 0);
  arch.rotation.z = 0.13;
  group.add(arch);

  for (let i = 0; i < 9; i++) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 + random() * 1.4, 0.45 + random() * 0.7, 0.65 + random()),
      i % 3 ? landmarkMaterials.portalStone : ruinMaterials.char
    );
    shard.position.set((random() - 0.5) * 15, shard.geometry.parameters.height / 2, 2 + random() * 5);
    shard.rotation.set(random(), random() * Math.PI, random());
    group.add(shard);
  }

  addCullable(group, 0, -168, 64);
  colliders.push({ minX: -8.5, maxX: 8.5, minZ: -171, maxZ: -165 });
  addFire(-6.2, -164.8, 0.9, mulberry32(0xF071A1));
}

function addRuinedSpire() {
  const random = mulberry32(0x5A1AE);
  const group = new THREE.Group();
  group.position.set(-168, 0, 0);

  const addSpire = (z, height, lean, broken) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 9.5, 8.2, 7), landmarkMaterials.silverDark);
    base.position.set(0, 4.1, z);
    base.rotation.z = lean * 0.35;
    group.add(base);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 6.4, height, 7), landmarkMaterials.silverStone);
    shaft.position.set(lean * height * 0.18, 8 + height / 2, z);
    shaft.rotation.z = lean;
    shaft.castShadow = true;
    group.add(shaft);

    if (!broken) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(4.4, 13, 6), landmarkMaterials.silverStone);
      crown.position.set(lean * height * 0.32, 8 + height + 5.8, z);
      crown.rotation.z = lean;
      group.add(crown);
    }
  };

  addSpire(-10, 52, -0.055, false);
  addSpire(10, 36, 0.12, true);

  const fallenCrown = new THREE.Mesh(new THREE.ConeGeometry(4.5, 14, 6), landmarkMaterials.silverStone);
  fallenCrown.position.set(13, 3.4, 13);
  fallenCrown.rotation.z = Math.PI / 2 - 0.2;
  group.add(fallenCrown);

  for (let i = 0; i < 11; i++) {
    const marble = new THREE.Mesh(
      new THREE.BoxGeometry(0.8 + random() * 1.8, 0.5 + random(), 0.8 + random() * 1.6),
      i % 4 ? landmarkMaterials.silverStone : landmarkMaterials.silverDark
    );
    marble.position.set((random() - 0.5) * 15, marble.geometry.parameters.height / 2, (random() - 0.5) * 17);
    marble.rotation.set(random(), random() * Math.PI, random());
    group.add(marble);
  }

  addCullable(group, -168, 0, 88);
  colliders.push({ minX: -178, maxX: -158, minZ: -20, maxZ: 20 });
}

function addCrumpledTower() {
  const random = mulberry32(0xD00A);
  const group = new THREE.Group();
  group.position.set(0, 0, 168);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 16.5, 9.5, 8), landmarkMaterials.doomStone);
  base.position.y = 4.75;
  base.castShadow = true;
  group.add(base);

  const shell = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 13.2, 38, 8, 1, true, 0.25, Math.PI * 1.5), landmarkMaterials.doomStone);
  shell.position.set(-1.1, 27, 0);
  shell.rotation.z = -0.06;
  shell.castShadow = true;
  group.add(shell);

  const emberCore = new THREE.Mesh(new THREE.PlaneGeometry(9, 22), landmarkMaterials.doomEmber);
  emberCore.position.set(0.8, 25, -1.5);
  emberCore.rotation.y = Math.PI;
  group.add(emberCore);

  const fallenTop = new THREE.Mesh(new THREE.CylinderGeometry(7, 9.2, 18, 8), landmarkMaterials.doomStone);
  fallenTop.position.set(18, 6, 7);
  fallenTop.rotation.z = Math.PI / 2 - 0.12;
  fallenTop.rotation.y = 0.35;
  group.add(fallenTop);

  for (let i = 0; i < 14; i++) {
    const rubble = new THREE.Mesh(
      new THREE.BoxGeometry(0.8 + random() * 2.2, 0.45 + random() * 1.3, 0.8 + random() * 2),
      i % 3 ? landmarkMaterials.doomStone : ruinMaterials.char
    );
    rubble.position.set((random() - 0.5) * 21, rubble.geometry.parameters.height / 2, (random() - 0.5) * 17);
    rubble.rotation.set(random(), random() * Math.PI, random());
    group.add(rubble);
  }

  addCullable(group, 0, 168, 92);
  colliders.push({ type: 'circle', x: 0, z: 168, radius: 15.5 });
  colliders.push({ type: 'circle', x: 18, z: 175, radius: 8.5 });
  addFire(-5.8, 162.7, 1.05, mulberry32(0xD00F1E));
}

function addCardinalLandmarks() {
  addRuinedPortal();
  addRuinedSpire();
  addCrumpledTower();
}

function setCylinderBetween(mesh, start, end, thicknessScale = 1) {
  const direction = end.clone().sub(start);
  const distance = direction.length();
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.scale.set(thicknessScale, distance * 1.08, thicknessScale);
}

function eyeWingCurvePoint(wing, t, charge) {
  const bendEnd = 0.68;
  const curveT = Math.min(1, t / bendEnd);
  const theta = curveT * Math.PI / 2;
  const bendRadius = wing.length * 0.48;
  const verticalTail = wing.length * 0.5 * Math.max(0, (t - bendEnd) / (1 - bendEnd));
  const idle = new THREE.Vector3(
    wing.side * bendRadius * Math.sin(theta),
    bendRadius * (1 - Math.cos(theta)) + verticalTail,
    Math.sin(t * Math.PI * 1.8 + wing.phase) * 0.16 * (1 - t * 0.45)
  );
  const outward = new THREE.Vector3(
    wing.side * wing.length * t,
    0.18 + t * 0.34,
    Math.sin(t * Math.PI * 1.6 + wing.phase) * 0.05
  );
  return idle.lerp(outward, charge);
}

function updateEyeWingPose(wing, charge) {
  for (let i = 0; i < wing.segments.length; i++) {
    const start = eyeWingCurvePoint(wing, i / wing.segments.length, charge);
    const end = eyeWingCurvePoint(wing, (i + 1) / wing.segments.length, charge);
    setCylinderBetween(wing.segments[i], start, end);
  }

  const barbStart = eyeWingCurvePoint(wing, 0.94, charge);
  const barbEnd = eyeWingCurvePoint(wing, 1, charge);
  setCylinderBetween(wing.barb, barbStart, barbEnd, 1);
}

function makeEyeWingTentacle(length, radius, seed, side) {
  const random = mulberry32(seed);
  const group = new THREE.Group();
  const segments = 9;
  const segmentMeshes = [];

  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments;
    const taper = Math.max(0.16, 1 - t * 0.84);
    const segment = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * taper * 0.76, radius * taper, 1, 7),
      i % 3 === 1 ? eyeMaterials.blood : eyeMaterials.flesh
    );
    segment.castShadow = false;
    group.add(segment);
    segmentMeshes.push(segment);
  }

  const barb = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.48, 1, 5), eyeMaterials.blood);
  group.add(barb);
  const wing = {
    group,
    segments: segmentMeshes,
    barb,
    length,
    side,
    phase: random() * Math.PI * 2
  };
  updateEyeWingPose(wing, 0);
  return wing;
}

function createEyeGuardian(id, x, z, hoverHeight, seed) {
  const random = mulberry32(seed);
  const root = new THREE.Group();
  root.position.set(x, hoverHeight, z);

  const visual = new THREE.Group();
  visual.scale.setScalar(1.32);
  root.add(visual);

  const body = new THREE.Mesh(new THREE.SphereGeometry(2.85, 18, 12), eyeMaterials.flesh);
  body.scale.set(1.05, 1.02, 0.58);
  visual.add(body);

  const iris = new THREE.Mesh(new THREE.SphereGeometry(1.48, 16, 10), eyeMaterials.iris);
  iris.scale.set(1.1, 1, 0.25);
  iris.position.z = 1.53;
  visual.add(iris);

  const bloodyRim = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.24, 7, 22), eyeMaterials.blood);
  bloodyRim.position.z = 1.2;
  bloodyRim.scale.y = 0.72;
  visual.add(bloodyRim);

  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.64, 14, 9), eyeMaterials.pupil);
  pupil.scale.set(0.58, 1.25, 0.2);
  pupil.position.z = 1.9;
  visual.add(pupil);

  for (let i = 0; i < 12; i++) {
    const vein = new THREE.Mesh(
      new THREE.BoxGeometry(0.045 + random() * 0.05, 0.9 + random() * 1.25, 0.035),
      eyeMaterials.vein
    );
    const angle = i / 12 * Math.PI * 2 + random() * 0.18;
    const radius = 1.8 + random() * 0.45;
    vein.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62, 1.46);
    vein.rotation.z = angle + Math.PI / 2 + (random() - 0.5) * 0.35;
    visual.add(vein);
  }

  const wings = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 2.3, -0.65 + i * 0.34, -0.2 - i * 0.08);
      const tentacle = makeEyeWingTentacle(
        5.25 + i * 0.62,
        0.44 - i * 0.028,
        seed + side * 100 + i * 17,
        side
      );
      pivot.add(tentacle.group);
      visual.add(pivot);
      wings.push({
        pivot,
        ...tentacle,
        phase: random() * Math.PI * 2
      });
    }
  }

  root.visible = false;
  scene.add(root);
  eyeGuardians.push({
    id,
    root,
    visual,
    body,
    iris,
    pupil,
    wings,
    home: new THREE.Vector3(x, hoverHeight, z),
    hp: EYE_GUARDIAN_MAX_HP,
    alive: true,
    nextAttackAt: Infinity,
    attackStartedAt: 0,
    activeBolt: null,
    hitFlashUntil: 0,
    phase: random() * Math.PI * 2
  });
}

function addEyeGuardians() {
  createEyeGuardian('portal', 0, -145, 9.5, 0xE1E001);
  createEyeGuardian('spire', -143, 0, 12, 0xE1E002);
  createEyeGuardian('tower', 0, 142, 11, 0xE1E003);
  createEyeGuardian('bridge', 148, -13, 9, 0xE1E004);
}

function addRoadDamage() {
  const random = mulberry32(0xB10D51);
  const roadPoint = (edgeBias = 0) => {
    const along = (random() * 2 - 1) * WORLD_LIMIT * 0.98;
    const offsetRange = ROAD_WIDTH * (edgeBias ? 0.62 : 0.42);
    const offset = (random() * 2 - 1) * offsetRange;
    if (random() < 0.5) return { x: offset, z: along, axis: 'z' };
    return { x: along, z: offset, axis: 'x' };
  };

  for (let i = 0; i < 170; i++) {
    const p = roadPoint();
    if (Math.hypot(p.x, p.z) < 10) continue;
    const pothole = new THREE.Mesh(new THREE.CircleGeometry(0.55 + random() * 1.35, 9), ruinMaterials.char);
    pothole.rotation.x = -Math.PI / 2;
    pothole.rotation.z = random() * Math.PI;
    pothole.scale.set(1 + random() * 1.5, 0.45 + random() * 0.8, 1);
    pothole.position.set(p.x, 0.038, p.z);
    addCullable(pothole, p.x, p.z, 1.8);
  }

  for (let i = 0; i < 260; i++) {
    const p = roadPoint(1);
    if (Math.hypot(p.x, p.z) < 9) continue;
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.055 + random() * 0.06, 0.026, 0.9 + random() * 4.3), ruinMaterials.char);
    crack.position.set(p.x, 0.054, p.z);
    crack.rotation.y = (p.axis === 'z' ? 0 : Math.PI / 2) + (random() - 0.5) * 1.1;
    addCullable(crack, p.x, p.z, 2.8);
  }

  for (let i = 0; i < 220; i++) {
    const p = roadPoint();
    if (Math.hypot(p.x, p.z) < 8.5) continue;
    addBloodSplatter(p.x, p.z, 0.65 + random() * 2.5, random() * Math.PI, random() < 0.4);
  }

  for (let i = 0; i < 380; i++) {
    const p = roadPoint(1);
    if (Math.hypot(p.x, p.z) < 7) continue;
    const rubble = new THREE.Mesh(
      new THREE.BoxGeometry(0.14 + random() * 0.7, 0.08 + random() * 0.38, 0.14 + random() * 0.85),
      random() < 0.72 ? ruinMaterials.darkStone : ruinMaterials.char
    );
    rubble.position.set(p.x, rubble.geometry.parameters.height / 2 + 0.055, p.z);
    rubble.rotation.set(random() * 0.6, random() * Math.PI, random() * 0.6);
    rubble.castShadow = true;
    addCullable(rubble, p.x, p.z, 1.2);
  }
}

function addBloodSplatter(x, z, scale, rotation, old = false) {
  const material = old ? ruinMaterials.oldBlood : ruinMaterials.blood;
  const splatter = new THREE.Mesh(new THREE.PlaneGeometry(scale * (0.85 + scale * 0.08), scale), material);
  splatter.rotation.set(-Math.PI / 2, 0, rotation);
  splatter.position.set(x, 0.066, z);
  splatter.renderOrder = 5;
  addCullable(splatter, x, z, Math.max(1.2, scale * 0.7));
}

function addFountain() {
  const random = mulberry32(0xF0A7A1);
  const deadWater = new THREE.MeshStandardMaterial({ color: 0x160706, roughness: 0.45, metalness: 0.08 });
  fountainGroup = new THREE.Group();
  scene.add(fountainGroup);

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(9.8, 9.35, 0.18, 18), ruinMaterials.darkStone);
  plaza.position.y = 0.09;
  plaza.rotation.y = 0.08;
  plaza.receiveShadow = true;
  fountainGroup.add(plaza);

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.05, 4.45, 0.42, 16), ruinMaterials.stone);
  basin.position.y = 0.31;
  basin.castShadow = true;
  basin.receiveShadow = true;
  fountainGroup.add(basin);

  for (let i = 0; i < 18; i++) {
    if (random() < 0.3) continue;
    const angle = (i / 18) * Math.PI * 2 + random() * 0.08;
    const radius = 4.35 + random() * 0.16;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.25 + random() * 0.65, 0.52 + random() * 0.2, 0.72), ruinMaterials.stone);
    rim.position.set(Math.cos(angle) * radius, 0.75 + random() * 0.08, Math.sin(angle) * radius);
    rim.rotation.set((random() - 0.5) * 0.2, -angle + Math.PI / 2, (random() - 0.5) * 0.38);
    rim.castShadow = true;
    rim.receiveShadow = true;
    fountainGroup.add(rim);
  }

  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.35, 0.08, 13), deadWater);
  water.position.y = 0.58;
  fountainGroup.add(water);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.08, 2.05, 7), ruinMaterials.stone);
  pedestal.position.set(-0.32, 1.62, 0.18);
  pedestal.rotation.set(0.05, -0.18, 0.22);
  pedestal.castShadow = true;
  fountainGroup.add(pedestal);

  const brokenFigure = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.0, 0.56), ruinMaterials.stone);
  brokenFigure.position.set(-0.12, 2.9, -0.12);
  brokenFigure.rotation.set(0.35, 0.34, -0.52);
  brokenFigure.castShadow = true;
  fountainGroup.add(brokenFigure);

  const fallenPiece = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.65, 0.58), ruinMaterials.stone);
  fallenPiece.position.set(2.45, 0.95, -1.1);
  fallenPiece.rotation.set(0.2, 0.8, 1.28);
  fallenPiece.castShadow = true;
  fountainGroup.add(fallenPiece);

  for (let i = 0; i < 34; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 3.8 + random() * 6.6;
    if (Math.abs(Math.cos(angle)) < 0.15 || Math.abs(Math.sin(angle)) < 0.15) continue;
    const rubble = new THREE.Mesh(
      new THREE.BoxGeometry(0.32 + random() * 1.15, 0.14 + random() * 0.42, 0.3 + random() * 1.05),
      random() < 0.8 ? ruinMaterials.stone : ruinMaterials.char
    );
    rubble.position.set(Math.cos(angle) * radius, rubble.geometry.parameters.height / 2 + 0.05, Math.sin(angle) * radius);
    rubble.rotation.set(random() * 0.5, random() * Math.PI, random() * 0.5);
    rubble.castShadow = true;
    fountainGroup.add(rubble);
  }

  for (let i = 0; i < 14; i++) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.05 + random() * 0.05, 0.035, 2.2 + random() * 4.5), ruinMaterials.char);
    const angle = random() * Math.PI * 2;
    const radius = 1.5 + random() * 7.4;
    crack.position.set(Math.cos(angle) * radius, 0.205, Math.sin(angle) * radius);
    crack.rotation.y = angle + (random() - 0.5) * 0.7;
    fountainGroup.add(crack);
  }

  addBloodSplatter(1.6, -4.1, 2.5, 0.1);
  addBloodSplatter(-4.8, 1.2, 1.8, -0.7, true);
  addFire(2.8, 1.7, 0.55, random);

  fountainBasinCollider = { type: 'circle', x: 0, z: 0, radius: 4.15 };
  fountainStatueCollider = { minX: 1.8, maxX: 3.0, minZ: -1.8, maxZ: -0.3 };
  colliders.push(fountainBasinCollider, fountainStatueCollider);
  addOpenedGateCrater();
}

function makeGateRune(angle, radius, width = 0.12, length = 1.15, y = 0.11) {
  const rune = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, length), landmarkMaterials.gateRune);
  rune.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  rune.rotation.y = -angle + (angle % 0.7) * 0.35;
  return rune;
}

function makeGatePentagramArm(start, end, y) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, length), landmarkMaterials.gateEmber);
  arm.position.set((start.x + end.x) * 0.5, y, (start.z + end.z) * 0.5);
  arm.rotation.y = Math.atan2(dx, dz);
  return arm;
}

function makeJaggedGatePit(random) {
  const segments = 34;
  const levels = 9;
  const positions = [];
  const normals = [];
  const indices = [];
  const radii = [];

  for (let yLevel = 0; yLevel <= levels; yLevel++) {
    const depthT = yLevel / levels;
    const baseRadius = THREE.MathUtils.lerp(OPEN_GATE_RADIUS * 1.03, OPEN_GATE_RADIUS * 0.68, depthT);
    const ring = [];
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const strata = Math.sin(angle * 3 + yLevel * 0.9) * 0.28 +
        Math.sin(angle * 7 - yLevel * 0.45) * 0.16;
      const chip = (random() - 0.5) * 0.5;
      ring.push(baseRadius + strata + chip);
    }
    radii.push(ring);
  }

  for (let yLevel = 0; yLevel <= levels; yLevel++) {
    const y = -OPEN_GATE_DEPTH * (yLevel / levels);
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const radius = radii[yLevel][i];
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      normals.push(Math.cos(angle), 0.18, Math.sin(angle));
    }
  }

  for (let yLevel = 0; yLevel < levels; yLevel++) {
    const row = yLevel * segments;
    const nextRow = (yLevel + 1) * segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(row + i, nextRow + i, row + next);
      indices.push(row + next, nextRow + i, nextRow + next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addOpenedGateCrater() {
  const random = mulberry32(0x6A7E0);
  openedGateGroup = new THREE.Group();
  openedGateGroup.visible = false;

  const outerScorch = new THREE.Mesh(new THREE.RingGeometry(OPEN_GATE_RADIUS * 1.02, 9.4, 24), ruinMaterials.char);
  outerScorch.rotation.x = -Math.PI / 2;
  outerScorch.position.y = 0.072;
  openedGateGroup.add(outerScorch);

  const rim = new THREE.Mesh(new THREE.RingGeometry(OPEN_GATE_RADIUS, 6.45, 28), ruinMaterials.darkStone);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.092;
  openedGateGroup.add(rim);

  const pitMaterial = ruinMaterials.darkStone.clone();
  pitMaterial.side = THREE.DoubleSide;
  const pit = new THREE.Mesh(makeJaggedGatePit(random), pitMaterial);
  openedGateGroup.add(pit);

  const bottomY = -OPEN_GATE_DEPTH + 0.06;
  const gateGlow = new THREE.PointLight(0x720010, 3.8, 13, 1.2);
  gateGlow.position.set(0, bottomY + 0.8, 0);
  openedGateGroup.add(gateGlow);

  const starPoints = [];
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + i * Math.PI * 4 / 5;
    starPoints.push(new THREE.Vector3(Math.cos(angle) * 3.0, bottomY + 0.08, Math.sin(angle) * 3.0));
  }
  const starGeometry = new THREE.BufferGeometry().setFromPoints([...starPoints, starPoints[0]]);
  const star = new THREE.Line(starGeometry, landmarkMaterials.gateEmber);
  openedGateGroup.add(star);
  for (let i = 0; i < starPoints.length; i++) {
    openedGateGroup.add(makeGatePentagramArm(starPoints[i], starPoints[(i + 1) % starPoints.length], bottomY + 0.082));
  }

  const runeCount = 18;
  for (let i = 0; i < runeCount; i++) {
    const angle = i / runeCount * Math.PI * 2;
    const rune = makeGateRune(angle, 4.55 + (i % 2) * 0.25, 0.09 + (i % 3) * 0.025, 0.65 + (i % 4) * 0.2, bottomY + 0.07);
    openedGateGroup.add(rune);
  }

  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2 + random() * 0.16;
    const radius = 5.7 + random() * 1.25;
    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(0.8 + random() * 1.2, 0.35 + random() * 0.65, 0.7 + random() * 1.1),
      random() < 0.45 ? ruinMaterials.char : ruinMaterials.darkStone
    );
    rock.position.set(Math.cos(angle) * radius, rock.geometry.parameters.height / 2, Math.sin(angle) * radius);
    rock.rotation.set(random() * 0.65, random() * Math.PI, random() * 0.65);
    openedGateGroup.add(rock);
  }

  for (let i = 0; i < 44; i++) {
    const angle = random() * Math.PI * 2;
    const depth = 0.8 + random() * (OPEN_GATE_DEPTH - 1.8);
    const wallT = depth / OPEN_GATE_DEPTH;
    const radius = THREE.MathUtils.lerp(OPEN_GATE_RADIUS * 1.02, OPEN_GATE_RADIUS * 0.72, wallT) - 0.08 + random() * 0.28;
    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(0.25 + random() * 0.8, 0.18 + random() * 0.9, 0.35 + random() * 1.2),
      random() < 0.58 ? ruinMaterials.darkStone : ruinMaterials.char
    );
    rock.position.set(Math.cos(angle) * radius, -depth, Math.sin(angle) * radius);
    rock.rotation.set(random() * Math.PI, -angle + random() * 0.65, random() * Math.PI);
    rock.scale.set(0.8 + random() * 0.8, 0.7 + random() * 1.6, 0.75 + random() * 1.1);
    openedGateGroup.add(rock);
  }

  for (let i = 0; i < 10; i++) {
    const angle = i / 10 * Math.PI * 2 + 0.15;
    const tentacle = makeTentacleStrand(2.0 + random() * 1.25, 0.24 + random() * 0.11, 0.48 + random() * 0.28, 7);
    tentacle.position.set(Math.cos(angle) * 5.1, 0.08, Math.sin(angle) * 5.1);
    tentacle.rotation.y = -angle + Math.PI;
    tentacle.rotation.z = 0.42 + (random() - 0.5) * 0.18;
    openedGateGroup.add(tentacle);
  }

  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2 + 0.3;
    const stream = new THREE.Mesh(
      new THREE.BoxGeometry(0.38 + random() * 0.5, 0.035, 4.2 + random() * 1.8),
      landmarkMaterials.gateBlood
    );
    stream.rotation.y = -angle;
    stream.position.set(Math.cos(angle) * 3.55, 0.13, Math.sin(angle) * 3.55);
    openedGateGroup.add(stream);
  }

  scene.add(openedGateGroup);
}

function isNearRoad(x, z, padding) {
  return Math.abs(x) < ROAD_WIDTH / 2 + padding || Math.abs(z) < ROAD_WIDTH / 2 + padding;
}

function overlapsCollider(minX, maxX, minZ, maxZ, margin = 0) {
  return colliders.some(collider => {
    if (collider.type === 'circle') {
      const nearestX = THREE.MathUtils.clamp(collider.x, minX, maxX);
      const nearestZ = THREE.MathUtils.clamp(collider.z, minZ, maxZ);
      return Math.hypot(collider.x - nearestX, collider.z - nearestZ) < collider.radius + margin;
    }

    return minX < collider.maxX + margin && maxX > collider.minX - margin &&
      minZ < collider.maxZ + margin && maxZ > collider.minZ - margin;
  });
}

function isInsideCityShape(x, z, padding = 0) {
  const core = CITY_CORE_HALF - padding;
  const arm = CITY_ARM_HALF - padding;
  const end = CITY_ARM_END - padding;
  return (Math.abs(x) < core && Math.abs(z) < core) ||
    (Math.abs(x) < arm && Math.abs(z) < end) ||
    (Math.abs(z) < arm && Math.abs(x) < end);
}

function addRuinedCity() {
  const random = mulberry32(0xAE7E40);
  let placed = 0;

  for (let attempt = 0; attempt < 9000 && placed < 520; attempt++) {
    const x = (random() * 2 - 1) * WORLD_LIMIT * 0.94;
    const z = (random() * 2 - 1) * WORLD_LIMIT * 0.94;
    const width = 3.6 + random() * 8.5;
    const depth = 3.8 + random() * 8.2;
    const radius = Math.max(width, depth) * 0.58;

    if (!isInsideCityShape(x, z, radius + 2.5)) continue;
    if (Math.hypot(x, z) < 13 || isNearRoad(x, z, radius + 0.9)) continue;
    const minX = x - width / 2;
    const maxX = x + width / 2;
    const minZ = z - depth / 2;
    const maxZ = z + depth / 2;
    if (overlapsCollider(minX, maxX, minZ, maxZ, 1.05)) continue;

    addRuin(x, z, width, depth, random);
    colliders.push({ minX, maxX, minZ, maxZ });
    placed++;
  }
}

function addDeadForest() {
  const random = mulberry32(0x7AEE5);
  let placed = 0;

  for (let attempt = 0; attempt < 2600 && placed < 360; attempt++) {
    const x = (random() * 2 - 1) * WORLD_LIMIT * 0.96;
    const z = (random() * 2 - 1) * WORLD_LIMIT * 0.96;
    const radius = 0.75 + random() * 1.7;

    if (Math.hypot(x, z) < 12 || isNearRoad(x, z, 1.8 + radius)) continue;
    if (overlapsCollider(x - radius, x + radius, z - radius, z + radius, 0.55)) continue;

    addDeadTree(x, z, random);
    placed++;
  }
}

function addDeadTree(x, z, random) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const height = 2.1 + random() * 4.8;
  const trunkWidth = 0.16 + random() * 0.22;
  const burned = random() < 0.46;
  const leaning = (random() - 0.5) * 0.36;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkWidth * 0.55, trunkWidth, height, 5),
    burned ? ruinMaterials.char : ruinMaterials.darkStone
  );
  trunk.position.y = height / 2;
  trunk.rotation.set(leaning * 0.35, random() * Math.PI, leaning);
  trunk.castShadow = true;
  group.add(trunk);

  const branchCount = 3 + Math.floor(random() * 5);
  for (let i = 0; i < branchCount; i++) {
    const length = 0.75 + random() * 2.1;
    const branch = new THREE.Mesh(
      new THREE.BoxGeometry(0.08 + random() * 0.08, 0.08 + random() * 0.08, length),
      burned || random() < 0.55 ? ruinMaterials.char : ruinMaterials.darkStone
    );
    branch.position.set((random() - 0.5) * 0.28, height * (0.34 + random() * 0.55), (random() - 0.5) * 0.28);
    branch.rotation.set((random() - 0.5) * 0.85, random() * Math.PI, 0.55 + random() * 0.75);
    branch.castShadow = true;
    group.add(branch);
  }

  if (random() < 0.34) {
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(trunkWidth * 1.8, trunkWidth * 2.2, 0.16, 5), ruinMaterials.char);
    stump.position.y = 0.08;
    group.add(stump);
  }

  if (burned) addTreeFlames(group, height, random);

  addCullable(group, x, z, 2.7 + height * 0.28);

  if (burned && random() < 0.42) {
    addFire(x + (random() - 0.5) * 1.2, z + (random() - 0.5) * 1.2, 0.34 + random() * 0.42, random);
  }
}

function addTreeFlames(group, height, random) {
  const count = 1 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const flame = new THREE.Group();
    const size = 0.45 + random() * 0.55;
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size * 1.7),
      ruinMaterials.flameTreeOuter
    );
    const inner = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 0.42, size * 0.9),
      ruinMaterials.flameTreeInner
    );
    inner.position.z = 0.012;
    flame.add(outer, inner);
    flame.position.set((random() - 0.5) * 0.34, height * (0.18 + random() * 0.6), (random() - 0.5) * 0.34);
    flame.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.2);
    group.add(flame);
  }
}

function addRuin(x, z, width, depth, random) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const height = 3.6 + random() * 12.8;
  const wallThickness = 0.38 + random() * 0.28;
  const wallMaterial = random() < 0.28 ? ruinMaterials.darkStone : ruinMaterials.stone;
  const charMaterial = ruinMaterials.char;

  const wallSpecs = [
    { w: width, h: height * (0.5 + random() * 0.5), d: wallThickness, x: 0, z: -depth / 2, side: 'north' },
    { w: width, h: height * (0.3 + random() * 0.7), d: wallThickness, x: 0, z: depth / 2, side: 'south' },
    { w: wallThickness, h: height * (0.42 + random() * 0.58), d: depth, x: -width / 2, z: 0, side: 'west' },
    { w: wallThickness, h: height * (0.25 + random() * 0.75), d: depth, x: width / 2, z: 0, side: 'east' }
  ];

  for (const spec of wallSpecs) {
    if (random() < 0.16) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), wallMaterial);
    wall.position.set(spec.x, spec.h / 2, spec.z);
    wall.rotation.z = (random() - 0.5) * 0.035;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    const scorchCount = 1 + Math.floor(random() * 4);
    for (let i = 0; i < scorchCount; i++) {
      const scorch = new THREE.Mesh(
        new THREE.BoxGeometry(spec.side === 'north' || spec.side === 'south' ? 0.32 + random() * 1.2 : 0.035, 0.5 + random() * 2.2, spec.side === 'east' || spec.side === 'west' ? 0.32 + random() * 1.2 : 0.035),
        charMaterial
      );
      const xPos = spec.side === 'east' || spec.side === 'west'
        ? spec.x + (spec.side === 'east' ? -0.025 : 0.025)
        : (random() - 0.5) * spec.w * 0.8;
      const zPos = spec.side === 'north' || spec.side === 'south'
        ? spec.z + (spec.side === 'south' ? -0.025 : 0.025)
        : (random() - 0.5) * spec.d * 0.8;
      scorch.position.set(xPos, 0.5 + random() * Math.max(0.6, spec.h - 0.9), zPos);
      group.add(scorch);
    }

    if (random() < 0.94) addBurningWindows(group, spec, random);
    if (random() < 0.9) addWallFlames(group, spec, random);
  }

  if (random() < 0.72) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.16, depth * 0.92), charMaterial);
    floor.position.y = 0.09;
    floor.receiveShadow = true;
    group.add(floor);
  }

  const rubbleCount = 2 + Math.floor(random() * 5);
  for (let i = 0; i < rubbleCount; i++) {
    const rubble = new THREE.Mesh(
      new THREE.BoxGeometry(0.45 + random() * 1.3, 0.25 + random() * 0.75, 0.45 + random() * 1.3),
      random() < 0.7 ? wallMaterial : charMaterial
    );
    rubble.position.set((random() - 0.5) * width * 1.35, rubble.geometry.parameters.height / 2, (random() - 0.5) * depth * 1.35);
    rubble.rotation.set(random() * 1.4, random() * Math.PI, random() * 1.4);
    rubble.castShadow = true;
    group.add(rubble);
  }

  const beamCount = 2 + Math.floor(random() * 6);
  for (let i = 0; i < beamCount; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18 + random() * 0.18, 0.18 + random() * 0.22, 2.4 + random() * Math.max(width, depth) * 0.8), charMaterial);
    beam.position.set((random() - 0.5) * width * 0.85, 2 + random() * height * 0.65, (random() - 0.5) * depth * 0.85);
    beam.rotation.set((random() - 0.5) * 0.9, random() * Math.PI, (random() - 0.5) * 0.7);
    beam.castShadow = true;
    group.add(beam);
  }

  if (random() < 0.34) {
    const towerWidth = 1.5 + random() * 1.5;
    const towerHeight = height * (0.65 + random() * 0.5);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(towerWidth, towerHeight, towerWidth), wallMaterial);
    tower.position.set((random() < 0.5 ? -1 : 1) * width * 0.32, towerHeight / 2, (random() < 0.5 ? -1 : 1) * depth * 0.32);
    tower.rotation.z = (random() - 0.5) * 0.08;
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);
  }

  addCullable(group, x, z, Math.max(width, depth) * 0.85 + 3);

  const fireCount = random() < 0.95 ? 2 + Math.floor(random() * 4) : 0;
  for (let i = 0; i < fireCount; i++) {
    const alongWall = random() < 0.5;
    const side = random() < 0.5 ? -1 : 1;
    const fireX = alongWall ? x + (random() - 0.5) * width : x + side * width * 0.52;
    const fireZ = alongWall ? z + side * depth * 0.52 : z + (random() - 0.5) * depth;
    addFire(fireX, fireZ, 0.52 + random() * 1.18, random);
  }

  if (random() < 0.18) {
    addBloodSplatter(x + (random() - 0.5) * width, z + (random() - 0.5) * depth, 0.8 + random() * 1.6, random() * Math.PI, true);
  }
}

function addBurningWindows(group, spec, random) {
  const horizontalWall = spec.side === 'north' || spec.side === 'south';
  const span = horizontalWall ? spec.w : spec.d;
  const count = Math.max(1, Math.floor(span / 2.7));
  const floors = Math.min(4, Math.max(1, Math.floor(spec.h / 2.35)));

  for (let floor = 0; floor < floors; floor++) {
    for (let i = 0; i < count; i++) {
      if (random() < 0.18) continue;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.46 + random() * 0.18, 0.64 + random() * 0.22), ruinMaterials.windowFire);
      const along = -span * 0.38 + (span * 0.76) * ((i + random() * 0.4) / Math.max(1, count - 0.65));
      const y = 1.05 + floor * 1.95 + random() * 0.35;

      if (horizontalWall) {
        glow.position.set(along, y, spec.z + (spec.side === 'south' ? -0.235 : 0.235));
      } else {
        glow.position.set(spec.x + (spec.side === 'east' ? -0.235 : 0.235), y, along);
        glow.rotation.y = Math.PI / 2;
      }

      glow.renderOrder = 3;
      group.add(glow);
    }
  }
}

function addWallFlames(group, spec, random) {
  const horizontalWall = spec.side === 'north' || spec.side === 'south';
  const span = horizontalWall ? spec.w : spec.d;
  const count = 2 + Math.floor(random() * 4);

  for (let i = 0; i < count; i++) {
    const flame = new THREE.Group();
    const w = 0.55 + random() * 0.45;
    const h = 1.05 + random() * 1.3;

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      ruinMaterials.flameWallOuter
    );
    const inner = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.48, h * 0.58),
      ruinMaterials.flameWallInner
    );
    inner.position.z = 0.012;
    flame.add(outer, inner);

    const along = (random() - 0.5) * span * 0.76;
    const y = 0.9 + random() * Math.max(0.8, spec.h * 0.55);
    if (horizontalWall) {
      flame.position.set(along, y, spec.z + (spec.side === 'south' ? -0.255 : 0.255));
    } else {
      flame.position.set(spec.x + (spec.side === 'east' ? -0.255 : 0.255), y, along);
      flame.rotation.y = Math.PI / 2;
    }
    flame.rotation.z = (random() - 0.5) * 0.18;
    group.add(flame);
  }
}

function addFire(x, z, scale, random) {
  const group = new THREE.Group();
  group.position.set(x, 0.12, z);

  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.42 * scale, 1.3 * scale, 7),
    ruinMaterials.fireOuter
  );
  outer.position.y = 0.65 * scale;
  group.add(outer);

  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.24 * scale, 0.85 * scale, 7),
    ruinMaterials.fireInner
  );
  inner.position.y = 0.46 * scale;
  group.add(inner);

  const coal = new THREE.Mesh(new THREE.CylinderGeometry(0.52 * scale, 0.72 * scale, 0.12 * scale, 7), ruinMaterials.char);
  coal.position.y = 0.04;
  group.add(coal);

  const smokeSprites = [];
  for (let i = 0; i < 3; i++) {
    const smoke = new THREE.Sprite(ruinMaterials.smoke.clone());
    smoke.position.set((random() - 0.5) * scale * 0.5, 1.0 * scale + i * 0.55 * scale, (random() - 0.5) * scale * 0.5);
    smoke.scale.setScalar((1.4 + random() * 1.4) * scale);
    group.add(smoke);
    smokeSprites.push(smoke);
  }

  addCullable(group, x, z, 4 + scale * 1.8);

  fires.push({
    group,
    outer,
    inner,
    smokeSprites,
    baseScale: scale,
    phase: random() * Math.PI * 2
  });
}

function resize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 0.82));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function captureMouse() {
  if (!active || playerDead || document.pointerLockElement === renderer.domElement) return;
  renderer.domElement.requestPointerLock();
}

function isParrying(time = performance.now()) {
  return active && !playerDead && time <= parryActiveUntil;
}

function isAttacking(time = performance.now()) {
  return active && time < attackUntil;
}

function triggerAttack(time = performance.now()) {
  if (!active || playerDead || parryHeld || time < attackCooldownUntil) return false;
  attackStartedAt = time;
  attackUntil = time + ATTACK_DURATION;
  attackCooldownUntil = time + ATTACK_COOLDOWN;
  hitTentacleWithSword(time);
  return true;
}

function onMouseDown(event) {
  if (!active) return;
  if (event.button === 0) {
    triggerAttack();
    return;
  }
  if (event.button === 2) {
    event.preventDefault();
    if (playerDead || parryHeld) return;
    parryHeld = true;
    const now = performance.now();
    if (now < nextParryAt) return;
    parryStartedAt = now;
    parryActiveUntil = parryStartedAt + PERFECT_PARRY_WINDOW;
    nextParryAt = parryStartedAt + PARRY_COOLDOWN;
    attackUntil = 0;
  }
}

function onMouseUp(event) {
  if (event.button === 2) parryHeld = false;
}

function onContextMenu(event) {
  if (!overlay || !overlay.contains(event.target)) return;
  event.preventDefault();
}

let lastStatusText = '';
function updatePointerStatus() {
  if (!status) return;
  const now = performance.now();
  const text = playerDead
    ? 'YOU ARE DEAD // THE FOUNTAIN REMEMBERS'
    : now < combatStatusUntil
      ? combatStatusText
      : isParrying()
    ? 'PARRY WINDOW OPEN'
    : document.pointerLockElement === renderer.domElement
      ? 'THE DARKNESS IS LISTENING // ESC RELEASES CURSOR'
      : 'CLICK THE DARKNESS TO CAPTURE THE MOUSE';
  // Avoid touching the DOM every frame — only write when the text changes.
  if (text === lastStatusText) return;
  lastStatusText = text;
  status.textContent = text;
}

function onMouseMove(event) {
  if (!active || playerDead || document.pointerLockElement !== renderer.domElement) return;
  if (performance.now() - pointerLockChangedAt < POINTER_LOCK_SETTLE_MS) return;
  if (!Number.isFinite(event.movementX) || !Number.isFinite(event.movementY)) return;

  const movementX = THREE.MathUtils.clamp(event.movementX, -MAX_MOUSE_DELTA, MAX_MOUSE_DELTA);
  const movementY = THREE.MathUtils.clamp(event.movementY, -MAX_MOUSE_DELTA, MAX_MOUSE_DELTA);
  yaw -= movementX * 0.0022;
  pitch -= movementY * 0.0022;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  camera.rotation.set(pitch, yaw, 0);
}

function onPointerLockChange() {
  pointerLockChangedAt = performance.now();
  updatePointerStatus();
}

function processDebugPasscode(event) {
  if (event.repeat || !/^\d$/.test(event.key)) return false;
  debugPasscodeBuffer = (debugPasscodeBuffer + event.key).slice(-DEBUG_GUARDIAN_PASSCODE.length);
  if (debugPasscodeBuffer !== DEBUG_GUARDIAN_PASSCODE) return false;
  debugPasscodeBuffer = '';
  killAllGuardiansDebug(performance.now());
  event.preventDefault();
  return true;
}

function onKeyDown(event) {
  if (!active && !loading) return;
  if (loading && event.code === 'Escape') {
    close();
    return;
  }
  if (!active) return;
  if (gateTransitioning) {
    event.preventDefault();
    return;
  }
  if (processDebugPasscode(event)) return;
  if (playerDead) return;
  if (event.code === 'Escape' && document.pointerLockElement !== renderer.domElement) {
    close();
    return;
  }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space'].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
  if (event.code === 'Space' && grounded) {
    velocity.y = JUMP_SPEED;
    grounded = false;
  }
}

function onKeyUp(event) {
  keys.delete(event.code);
}

function collidesAt(x, z) {
  return colliders.some(collider => {
    if (collider.type === 'circle') {
      return Math.hypot(x - collider.x, z - collider.z) < collider.radius + PLAYER_RADIUS;
    }

    return x + PLAYER_RADIUS > collider.minX && x - PLAYER_RADIUS < collider.maxX &&
      z + PLAYER_RADIUS > collider.minZ && z - PLAYER_RADIUS < collider.maxZ;
  });
}

function groundHeightAt(x, z) {
  if (gateOpened && Math.hypot(x, z) <= OPEN_GATE_RADIUS * 0.92) return -OPEN_GATE_DEPTH;
  if (Math.abs(z) > EAST_BRIDGE_HALF_WIDTH) return 0;
  const bridgeHalfLength = (EAST_RIVER_WIDTH + 5) / 2;
  const distanceFromCenter = Math.abs(x - EAST_RIVER_X);
  if (distanceFromCenter <= bridgeHalfLength) return EAST_BRIDGE_HEIGHT;
  if (distanceFromCenter >= bridgeHalfLength + EAST_BRIDGE_RAMP_LENGTH) return 0;
  const rampProgress = (distanceFromCenter - bridgeHalfLength) / EAST_BRIDGE_RAMP_LENGTH;
  return EAST_BRIDGE_HEIGHT * (1 - rampProgress);
}

function makeTentacleStrand(height, radius, bend, segments = 8) {
  const strand = new THREE.Group();
  const segmentHeight = height / segments;

  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments;
    const taper = Math.max(0.18, 1 - t * 0.82);
    const segment = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * taper * 0.82, radius * taper, segmentHeight * 1.12, 7),
      i % 2 ? tentacleMaterials.flesh : tentacleMaterials.ridge
    );
    segment.position.set(
      Math.sin(t * Math.PI * 1.35) * bend * t,
      segmentHeight * (i + 0.5),
      Math.sin(t * Math.PI * 0.75) * bend * 0.34 * t
    );
    segment.rotation.z = -Math.sin(t * Math.PI) * bend * 0.24;
    segment.rotation.x = Math.sin(t * Math.PI * 1.5) * bend * 0.08;
    segment.castShadow = false;
    strand.add(segment);
  }

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.22, 7, 5),
    tentacleMaterials.ridge
  );
  tip.scale.y = 1.8;
  tip.position.set(Math.sin(Math.PI * 1.35) * bend, height + radius * 0.1, Math.sin(Math.PI * 0.75) * bend * 0.34);
  strand.add(tip);
  return strand;
}

function createTentacle(x, z, time) {
  const group = new THREE.Group();
  group.position.set(x, 0.03, z);

  const wound = new THREE.Mesh(new THREE.RingGeometry(0.45, 1.25, 18), tentacleMaterials.maw);
  wound.rotation.x = -Math.PI / 2;
  wound.position.y = 0.025;
  group.add(wound);

  const attackRig = new THREE.Group();
  attackRig.add(makeTentacleStrand(4.9, 0.52, 0.72, 10));
  group.add(attackRig);

  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI * 0.5 + Math.random() * 0.5;
    const side = makeTentacleStrand(1.35 + Math.random() * 1.15, 0.2 + Math.random() * 0.12, 0.35 + Math.random() * 0.35, 6);
    side.position.set(Math.cos(angle) * 0.58, 0, Math.sin(angle) * 0.58);
    side.rotation.y = angle;
    side.rotation.z = (Math.random() - 0.5) * 0.35;
    group.add(side);
  }

  group.scale.y = 0.01;
  scene.add(group);
  tentacles.push({
    group,
    attackRig,
    hp: TENTACLE_MAX_HP,
    spawnedAt: time,
    nextAttackAt: time + 1900 + Math.random() * 1100,
    attackStartedAt: 0,
    attackResolved: false,
    attackDirection: new THREE.Vector3(),
    phase: Math.random() * Math.PI * 2,
    hitFlashUntil: 0
  });
}

function removeTentacle(tentacle) {
  scene.remove(tentacle.group);
  tentacle.group.traverse(object => {
    if (object.geometry) object.geometry.dispose();
  });
  const index = tentacles.indexOf(tentacle);
  if (index >= 0) tentacles.splice(index, 1);
}

function clearTentacles() {
  while (tentacles.length) removeTentacle(tentacles[tentacles.length - 1]);
}

function findTentacleSpawnPosition() {
  const lookAngle = yaw + Math.PI;
  for (let attempt = 0; attempt < 14; attempt++) {
    const angle = lookAngle + (Math.random() - 0.5) * 0.9;
    const distance = TENTACLE_SPAWN_DISTANCE + Math.random() * 1.25;
    const x = THREE.MathUtils.clamp(camera.position.x + Math.sin(angle) * distance, -WORLD_LIMIT + 2, WORLD_LIMIT - 2);
    const z = THREE.MathUtils.clamp(camera.position.z + Math.cos(angle) * distance, -WORLD_LIMIT + 2, WORLD_LIMIT - 2);
    const overlapsTentacle = tentacles.some(tentacle =>
      Math.hypot(x - tentacle.group.position.x, z - tentacle.group.position.z) < 3
    );
    if (!collidesAt(x, z) && !overlapsTentacle && Math.hypot(x, z) > 5.5) return { x, z };
  }
  return null;
}

function trySpawnTentacle(time) {
  if (playerDead || time < worldEnteredAt + TENTACLE_FIRST_SPAWN_DELAY || time < nextTentacleSpawnAt) return;
  if (velocity.x * velocity.x + velocity.z * velocity.z < 0.5) return;

  const position = findTentacleSpawnPosition();
  if (!position) {
    nextTentacleSpawnAt = time + 1000;
    return;
  }

  createTentacle(position.x, position.z, time);
  nextTentacleSpawnAt = time + randomTentacleDelay();
  setCombatStatus('SOMETHING IS RISING AHEAD', 1300, time);
}

function createCombatBurst(position, color, time, scale = 1) {
  const group = new THREE.Group();
  group.position.copy(position);

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28 * scale, 0.4 * scale, 12), material);
  group.add(ring);

  for (const rotation of [-0.72, 0.72]) {
    const slash = new THREE.Mesh(new THREE.PlaneGeometry(0.12 * scale, 1.5 * scale), material.clone());
    slash.rotation.z = rotation;
    group.add(slash);
  }

  scene.add(group);
  combatEffects.push({ group, startedAt: time, duration: COMBAT_EFFECT_DURATION });
}

function updateCombatEffects(time) {
  for (let i = combatEffects.length - 1; i >= 0; i--) {
    const effect = combatEffects[i];
    const progress = (time - effect.startedAt) / effect.duration;
    if (progress >= 1) {
      scene.remove(effect.group);
      effect.group.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
      combatEffects.splice(i, 1);
      continue;
    }

    effect.group.lookAt(camera.position);
    const pulse = 0.75 + Math.sin(progress * Math.PI) * 1.15;
    effect.group.scale.setScalar(pulse);
    effect.group.rotation.z += 0.08;
    effect.group.traverse(object => {
      if (object.material) object.material.opacity = 1 - progress;
    });
  }
}

function clearCombatEffects() {
  while (combatEffects.length) {
    const effect = combatEffects.pop();
    scene.remove(effect.group);
    effect.group.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
  }
}

function showParryFeedback(tentacle, time) {
  const burstPosition = tentacle.group.position.clone();
  burstPosition.y = 2.8;
  createCombatBurst(burstPosition, 0x9eefff, time, 1.35);
  tentacle.parryStaggerUntil = time + 520;
  if (parryFlash) {
    parryFlash.classList.remove('visible');
    void parryFlash.offsetWidth;
    parryFlash.classList.add('visible');
    window.setTimeout(() => parryFlash && parryFlash.classList.remove('visible'), 430);
  }
}

function hitTentacleWithSword(time) {
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  let best = null;
  let bestScore = -Infinity;

  for (const tentacle of tentacles) {
    if (time - tentacle.spawnedAt < 550) continue;
    const dx = tentacle.group.position.x - camera.position.x;
    const dz = tentacle.group.position.z - camera.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > TENTACLE_SWORD_RANGE || distance < 0.001) continue;
    const facing = (dx * forward.x + dz * forward.z) / distance;
    if (facing < 0.64) continue;
    const score = facing * 3 - distance * 0.18;
    if (score > bestScore) {
      best = tentacle;
      bestScore = score;
    }
  }

  if (!best) return;
  best.hp -= 1;
  best.hitFlashUntil = time + 260;
  const impactPosition = best.group.position.clone();
  impactPosition.y = 2.2 + Math.random() * 1.2;
  createCombatBurst(impactPosition, 0xff3150, time, 1);
  if (best.hp > 0) {
    setCombatStatus('TENTACLE WOUNDED // ' + best.hp + ' HITS REMAIN', 850, time);
    return;
  }

  removeTentacle(best);
  setPlayerHp(playerHp + 0.5);
  setCombatStatus('TENTACLE SEVERED // +0.5 HEART', 1300, time);
}

function damagePlayer(amount, time, message = 'THE TENTACLE TORE INTO YOU // -1 HEART') {
  if (playerDead) return;
  setPlayerHp(playerHp - amount);
  damageFlashUntil = time + 240;
  if (damageFlash) damageFlash.classList.add('visible');

  if (playerHp <= 0) {
    killPlayer(time);
    return;
  }
  setCombatStatus(message, 1200, time);
}

function killPlayer(time = performance.now()) {
  playerDead = true;
  keys.clear();
  velocity.set(0, 0, 0);
  parryHeld = false;
  attackUntil = 0;
  clearEyeBolts(time);
  setCombatStatus('YOU ARE DEAD // THE FOUNTAIN REMEMBERS', 999999, time);
  if (renderer && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  if (deathPanel) deathPanel.classList.remove('hidden');
}

function resummonAtFountain() {
  if (!active || !playerDead) return;
  clearTentacles();
  clearEyeBolts();
  resetEyeGuardianAttacks(performance.now());
  clearCombatEffects();
  playerDead = false;
  setPlayerHp(PLAYER_MAX_HP);
  resetPlayer();
  const time = performance.now();
  nextTentacleSpawnAt = time + randomTentacleDelay();
  combatStatusUntil = 0;
  damageFlashUntil = 0;
  if (damageFlash) damageFlash.classList.remove('visible');
  if (parryFlash) parryFlash.classList.remove('visible');
  if (deathPanel) deathPanel.classList.add('hidden');
  updateCulledObjects(true, time);
}

function createEyeBolt(guardian, time) {
  const group = new THREE.Group();
  group.position.copy(guardian.root.position);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), eyeMaterials.bolt);
  group.add(core);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.82, 10, 8), eyeMaterials.boltGlow);
  group.add(glow);

  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72 + i * 0.12, 0.045, 5, 12), eyeMaterials.boltGlow);
    ring.rotation.set(i * 0.8, i * 0.55, i * 0.7);
    group.add(ring);
  }

  const target = camera.position.clone();
  target.y -= 0.05;
  const direction = target.sub(group.position).normalize();
  scene.add(group);

  const bolt = {
    group,
    guardian,
    direction,
    reflected: false,
    bornAt: time,
    speed: EYE_BOLT_SPEED,
    phase: Math.random() * Math.PI * 2
  };
  guardian.activeBolt = bolt;
  eyeBolts.push(bolt);
}

function removeEyeBolt(bolt, time = performance.now()) {
  scene.remove(bolt.group);
  bolt.group.traverse(object => {
    if (object.geometry) object.geometry.dispose();
  });
  const index = eyeBolts.indexOf(bolt);
  if (index >= 0) eyeBolts.splice(index, 1);
  if (bolt.guardian.activeBolt === bolt) {
    bolt.guardian.activeBolt = null;
    if (bolt.guardian.alive) bolt.guardian.nextAttackAt = time + EYE_GUARDIAN_RECOVERY + Math.random() * 350;
  }
}

function clearEyeBolts(time = performance.now()) {
  while (eyeBolts.length) removeEyeBolt(eyeBolts[eyeBolts.length - 1], time);
}

function resetEyeGuardianAttacks(time = performance.now()) {
  for (const guardian of eyeGuardians) {
    guardian.attackStartedAt = 0;
    guardian.activeBolt = null;
    guardian.nextAttackAt = time + 450 + Math.random() * 450;
  }
}

function resetEyeGuardians(time = performance.now()) {
  clearEyeBolts(time);
  for (const guardian of eyeGuardians) {
    guardian.hp = EYE_GUARDIAN_MAX_HP;
    guardian.alive = true;
    guardian.root.visible = false;
    guardian.root.scale.setScalar(1);
    guardian.attackStartedAt = 0;
    guardian.activeBolt = null;
    guardian.nextAttackAt = time + 450 + Math.random() * 450;
    guardian.hitFlashUntil = 0;
  }
}

function playerFacesGuardian(guardian) {
  const look = new THREE.Vector3();
  camera.getWorldDirection(look);
  const towardEye = guardian.root.position.clone().sub(camera.position).normalize();
  return look.dot(towardEye) >= EYE_PARRY_FACING_DOT;
}

function showEyeParryFeedback(guardian, time) {
  createCombatBurst(camera.position.clone().addScaledVector(forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)), 1.6), 0x9eefff, time, 1.45);
  if (parryFlash) {
    parryFlash.classList.remove('visible');
    void parryFlash.offsetWidth;
    parryFlash.classList.add('visible');
    window.setTimeout(() => parryFlash && parryFlash.classList.remove('visible'), 430);
  }
  guardian.hitFlashUntil = Math.max(guardian.hitFlashUntil, time + 120);
}

function damageEyeGuardian(guardian, time) {
  if (!guardian.alive) return;
  guardian.hp -= 1;
  guardian.hitFlashUntil = time + 280;
  createCombatBurst(guardian.root.position, 0xff233f, time, 2.1);

  if (guardian.hp > 0) {
    setCombatStatus('THE EYE BLEEDS // ' + guardian.hp + ' REFLECTIONS REMAIN', 1300, time);
    return;
  }

  guardian.alive = false;
  guardian.attackStartedAt = 0;
  guardian.root.visible = false;
  createCombatBurst(guardian.root.position, 0xff001f, time, 4.5);
  wardensSlain++;
  updateWardenStatus();

  if (wardensSlain >= eyeGuardians.length) {
    setOpenedGateState(true);
    setCombatStatus('THE GATE HAS OPENED', 2400, time);
    return;
  }

  setCombatStatus('THE WATCHING EYE IS BLINDED', 1800, time);
}

function killAllGuardiansDebug(time = performance.now()) {
  let killed = 0;
  for (const guardian of eyeGuardians) {
    if (!guardian.alive) continue;
    guardian.hp = 0;
    guardian.alive = false;
    guardian.attackStartedAt = 0;
    guardian.activeBolt = null;
    guardian.root.visible = false;
    createCombatBurst(guardian.root.position, 0xff001f, time, 4.5);
    killed++;
  }

  if (!killed) {
    setCombatStatus('DEBUG // GUARDIANS ALREADY DEAD', 1100, time);
    return;
  }

  clearEyeBolts(time);
  wardensSlain = eyeGuardians.filter(guardian => !guardian.alive).length;
  updateWardenStatus();
  if (wardensSlain >= eyeGuardians.length) setOpenedGateState(true);
  setCombatStatus('DEBUG // GUARDIANS SLAIN', 1500, time);
}

function updateEyeBolts(time, dt) {
  for (const bolt of [...eyeBolts]) {
    if (!eyeBolts.includes(bolt)) continue;
    if (!bolt.guardian.alive || time - bolt.bornAt > 9000) {
      removeEyeBolt(bolt, time);
      continue;
    }

    if (bolt.reflected) {
      bolt.direction.copy(bolt.guardian.root.position).sub(bolt.group.position).normalize();
    }
    bolt.group.position.addScaledVector(bolt.direction, bolt.speed * dt);
    const pulse = 0.88 + Math.sin(time * 0.018 + bolt.phase) * 0.18;
    bolt.group.scale.setScalar(pulse);
    bolt.group.rotation.x += dt * 3.8;
    bolt.group.rotation.y += dt * 5.1;

    if (bolt.reflected) {
      if (bolt.group.position.distanceTo(bolt.guardian.root.position) <= 3.7) {
        const guardian = bolt.guardian;
        removeEyeBolt(bolt, time);
        damageEyeGuardian(guardian, time);
      }
      continue;
    }

    if (bolt.group.position.distanceTo(camera.position) > 1.35) continue;
    if (!isParrying(time)) {
      removeEyeBolt(bolt, time);
      damagePlayer(1, time, 'THE DARK BOLT PIERCED YOU // -1 HEART');
      continue;
    }

    if (!playerFacesGuardian(bolt.guardian)) {
      createCombatBurst(bolt.group.position, 0x708c9e, time, 1.2);
      removeEyeBolt(bolt, time);
      setCombatStatus('BOLT DEFLECTED // FACE THE EYE TO REFLECT IT', 1300, time);
      continue;
    }

    bolt.reflected = true;
    bolt.speed = EYE_REFLECT_SPEED;
    bolt.bornAt = time;
    showEyeParryFeedback(bolt.guardian, time);
    setCombatStatus('PERFECT REFLECTION', 900, time);
  }
}

function updateEyeGuardians(time, dt) {
  for (const guardian of eyeGuardians) {
    if (!guardian.alive) {
      guardian.root.visible = false;
      continue;
    }

    const dx = camera.position.x - guardian.home.x;
    const dz = camera.position.z - guardian.home.z;
    const distance = Math.hypot(dx, dz);
    guardian.root.visible = distance <= EYE_GUARDIAN_WAKE_RANGE + 25;
    if (!guardian.root.visible) continue;

    guardian.root.position.set(
      guardian.home.x,
      guardian.home.y + Math.sin(time * 0.0018 + guardian.phase) * 0.65,
      guardian.home.z
    );
    guardian.visual.rotation.y = Math.atan2(dx, dz);
    guardian.visual.rotation.x = 0;
    const verticalLook = THREE.MathUtils.clamp(
      Math.atan2(guardian.root.position.y - camera.position.y, Math.max(1, distance)),
      -0.55,
      0.72
    );
    guardian.pupil.position.set(0, -verticalLook * 0.58, 1.9);
    const breathing = 1 + Math.sin(time * 0.003 + guardian.phase) * 0.035;
    guardian.body.scale.set(1.05 * breathing, 1.02 / breathing, 0.58);
    const hitPulse = time < guardian.hitFlashUntil ? 1.2 : 1;
    guardian.iris.scale.set(1.1 * hitPulse, hitPulse, 0.25);

    let charge = 0;
    if (!playerDead && distance <= EYE_GUARDIAN_ATTACK_RANGE && !guardian.activeBolt) {
      if (!guardian.attackStartedAt && time >= guardian.nextAttackAt) {
        guardian.attackStartedAt = time;
        setCombatStatus('THE EYE OPENS // READY YOUR PARRY', EYE_GUARDIAN_WINDUP, time);
      }

      if (guardian.attackStartedAt) {
        const attackAge = time - guardian.attackStartedAt;
        charge = THREE.MathUtils.smoothstep(attackAge, 0, EYE_GUARDIAN_WINDUP);
        if (attackAge >= EYE_GUARDIAN_WINDUP) {
          createEyeBolt(guardian, time);
          guardian.attackStartedAt = 0;
          guardian.nextAttackAt = Infinity;
          charge = 1;
        }
      }
    } else if (distance > EYE_GUARDIAN_ATTACK_RANGE) {
      guardian.attackStartedAt = 0;
      guardian.nextAttackAt = Math.min(guardian.nextAttackAt, time + 350);
    }

    for (const wing of guardian.wings) {
      const flutter = Math.sin(time * 0.0032 + wing.phase) * 0.035 * (1 - charge);
      wing.pivot.rotation.x = flutter;
      updateEyeWingPose(wing, charge);
    }
  }

  updateEyeBolts(time, dt);
}

function tentacleStrikeHitsPlayer(tentacle) {
  const directionX = tentacle.attackDirection.x;
  const directionZ = tentacle.attackDirection.z;
  const relativeX = camera.position.x - tentacle.group.position.x;
  const relativeZ = camera.position.z - tentacle.group.position.z;
  const forwardDistance = relativeX * directionX + relativeZ * directionZ;
  const sidewaysDistance = Math.abs(relativeX * directionZ - relativeZ * directionX);
  return forwardDistance >= 0.7 &&
    forwardDistance <= TENTACLE_ATTACK_RANGE &&
    sidewaysDistance <= TENTACLE_ATTACK_HALF_WIDTH;
}

function updateTentacles(time) {
  trySpawnTentacle(time);

  for (const tentacle of [...tentacles]) {
    const age = time - tentacle.spawnedAt;
    const emerge = THREE.MathUtils.smoothstep(age, 0, 850);
    tentacle.group.scale.y = emerge * (time < tentacle.hitFlashUntil ? 0.88 : 1);
    const dx = camera.position.x - tentacle.group.position.x;
    const dz = camera.position.z - tentacle.group.position.z;
    const distance = Math.hypot(dx, dz);
    const insideLight = DEBUG_INFINITE_VISION || distance <= PLAYER_LIGHT_RADIUS;
    tentacle.group.visible = insideLight;

    let lunge = 0;
    if (!insideLight && tentacle.attackStartedAt) {
      tentacle.attackStartedAt = 0;
      tentacle.attackResolved = false;
      tentacle.nextAttackAt = time + 900 + Math.random() * 700;
    }

    if (!playerDead && insideLight && age > 1100 && !tentacle.attackStartedAt && distance <= Math.min(TENTACLE_ATTACK_RANGE, PLAYER_LIGHT_RADIUS) && time >= tentacle.nextAttackAt) {
      tentacle.attackStartedAt = time;
      tentacle.attackResolved = false;
      tentacle.attackDirection.set(dx, 0, dz).normalize();
      setCombatStatus('PARRY OR DODGE THE LUNGE', TENTACLE_ATTACK_WINDUP, time);
    }

    if (tentacle.attackStartedAt) {
      const attackAge = time - tentacle.attackStartedAt;
      if (attackAge < TENTACLE_ATTACK_WINDUP) {
        lunge = THREE.MathUtils.smoothstep(attackAge, 0, TENTACLE_ATTACK_WINDUP);
      } else {
        const recovery = (attackAge - TENTACLE_ATTACK_WINDUP) / TENTACLE_ATTACK_RECOVERY;
        lunge = 1 - THREE.MathUtils.smoothstep(recovery, 0, 1);
        if (!tentacle.attackResolved) {
          tentacle.attackResolved = true;
          if (!tentacleStrikeHitsPlayer(tentacle)) {
            setCombatStatus('DODGED', 700, time);
          } else if (isParrying(time)) {
            setCombatStatus('PARRIED', 900, time);
            showParryFeedback(tentacle, time);
          } else {
            damagePlayer(1, time);
          }
        }
      }

      if (attackAge >= TENTACLE_ATTACK_WINDUP + TENTACLE_ATTACK_RECOVERY) {
        tentacle.attackStartedAt = 0;
        tentacle.nextAttackAt = time + 1800 + Math.random() * 1400;
        lunge = 0;
      }
    }

    const idleX = Math.sin(time * 0.0018 + tentacle.phase) * 0.075;
    const idleZ = Math.cos(time * 0.0015 + tentacle.phase) * 0.065;
    const stagger = time < tentacle.parryStaggerUntil
      ? Math.sin((tentacle.parryStaggerUntil - time) * 0.08) * 0.22
      : 0;
    const target = tentacle.attackDirection;
    tentacle.attackRig.rotation.x = idleX + target.z * lunge * 1.24 - Math.abs(stagger) * 1.8;
    tentacle.attackRig.rotation.z = idleZ - target.x * lunge * 1.24 + stagger;
    tentacle.attackRig.scale.y = 1 + lunge * 0.58;
    tentacle.attackRig.scale.x = 1 - lunge * 0.16;
    tentacle.attackRig.scale.z = 1 - lunge * 0.16;
  }

  if (damageFlash && time >= damageFlashUntil) damageFlash.classList.remove('visible');
  updateCombatEffects(time);
}

function updateMovement(dt) {
  if (gateTransitioning) return;
  const forwardInput = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const rightInput = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED;

  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  desiredVelocity.set(0, 0, 0)
    .addScaledVector(forward, forwardInput)
    .addScaledVector(right, rightInput);
  if (desiredVelocity.lengthSq() > 1) desiredVelocity.normalize();
  desiredVelocity.multiplyScalar(speed);

  const responsiveness = grounded ? 12 : 3.5;
  const blend = 1 - Math.exp(-responsiveness * dt);
  velocity.x = THREE.MathUtils.lerp(velocity.x, desiredVelocity.x, blend);
  velocity.z = THREE.MathUtils.lerp(velocity.z, desiredVelocity.z, blend);
  velocity.y -= GRAVITY * dt;

  const nextX = THREE.MathUtils.clamp(camera.position.x + velocity.x * dt, -WORLD_LIMIT, WORLD_LIMIT);
  if (!collidesAt(nextX, camera.position.z)) camera.position.x = nextX;
  else velocity.x = 0;

  const nextZ = THREE.MathUtils.clamp(camera.position.z + velocity.z * dt, -WORLD_LIMIT, WORLD_LIMIT);
  if (!collidesAt(camera.position.x, nextZ)) camera.position.z = nextZ;
  else velocity.z = 0;

  camera.position.y += velocity.y * dt;
  const standingHeight = EYE_HEIGHT + groundHeightAt(camera.position.x, camera.position.z);
  if (camera.position.y <= standingHeight) {
    camera.position.y = standingHeight;
    velocity.y = 0;
    grounded = true;
  }
}

function startGateTransition(time = performance.now()) {
  gateTransitioning = true;
  keys.clear();
  velocity.set(0, 0, 0);
  setCombatStatus('DESCENDING THROUGH THE OPEN GATE', GATE_FADE_DURATION, time);
  if (gateFade) {
    gateFade.classList.remove('visible');
    void gateFade.offsetWidth;
    gateFade.classList.add('visible');
  }

  window.setTimeout(() => {
    close();
    openBossScene();
  }, GATE_FADE_DURATION);
}

function maybeExitThroughOpenedGate() {
  if (!gateOpened || playerDead || gateTransitioning) return false;
  if (Math.hypot(camera.position.x, camera.position.z) > OPEN_GATE_RADIUS * 0.86) return false;
  if (camera.position.y > EYE_HEIGHT - Math.min(7, OPEN_GATE_DEPTH * 0.5)) return false;
  startGateTransition();
  return true;
}

function updateAtmosphere(time) {
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  playerLight.position.set(
    camera.position.x + forward.x * 1.35,
    camera.position.y - 0.45,
    camera.position.z + forward.z * 1.35
  );
  playerLight.intensity = PLAYER_LIGHT_INTENSITY +
    Math.sin(time * 0.0027) * 2.4 +
    Math.sin(time * 0.011) * 0.8;

  for (const fire of fires) {
    if (!fire.group.visible) continue;
    const flicker = 0.84 + Math.sin(time * 0.009 + fire.phase) * 0.12 +
      Math.sin(time * 0.021 + fire.phase * 2.3) * 0.06;
    fire.outer.scale.set(1 + Math.sin(time * 0.014 + fire.phase) * 0.11, flicker, 1);
    fire.inner.scale.set(0.9 + Math.sin(time * 0.018 + fire.phase) * 0.08, 1.04 / flicker, 0.9);
    for (let i = 0; i < fire.smokeSprites.length; i++) {
      const smoke = fire.smokeSprites[i];
      const drift = time * 0.00045 + fire.phase + i;
      smoke.position.x = Math.sin(drift * 2.1) * fire.baseScale * 0.32;
      smoke.position.z = Math.cos(drift * 1.7) * fire.baseScale * 0.26;
      smoke.material.opacity = 0.22 + Math.sin(drift * 3.2) * 0.08;
    }
  }
}

function updateSword(time) {
  if (!sword) return;

  const idle = Math.sin(time * 0.0035) * 0.018;
  const attackProgress = time < attackUntil
    ? THREE.MathUtils.clamp((time - attackStartedAt) / ATTACK_DURATION, 0, 1)
    : 0;
  const attackSwing = attackProgress > 0 ? Math.sin(attackProgress * Math.PI) : 0;
  const attackSnap = attackProgress > 0 ? Math.sin(Math.min(1, attackProgress * 1.35) * Math.PI) : 0;

  if (isParrying(time)) {
    sword.position.set(0.2, -0.28 + idle * 0.4, -0.82);
    sword.rotation.set(-1.14, 0.18, 1.38);
    return;
  }

  sword.position.set(
    0.54 - attackSwing * 0.38,
    -0.48 + idle + attackSwing * 0.12,
    -0.88 - attackSwing * 0.12
  );
  sword.rotation.set(
    -0.28 - attackSwing * 0.72,
    -0.48 + attackSwing * 0.58,
    -0.42 - attackSnap * 1.55
  );
}

function updateCulledObjects(force = false, time = performance.now()) {
  const x = camera.position.x;
  const z = camera.position.z;
  const movedSq = (x - lastCullX) * (x - lastCullX) + (z - lastCullZ) * (z - lastCullZ);
  if (!force && time - lastCullUpdate < CULL_UPDATE_INTERVAL && movedSq < CULL_MOVE_THRESHOLD * CULL_MOVE_THRESHOLD) return;

  lastCullUpdate = time;
  lastCullX = x;
  lastCullZ = z;

  const nextVisible = new Set();
  const range = Math.ceil((NEAR_RENDER_RADIUS + NEAR_RENDER_HYSTERESIS + maxCullableRadius) / CULL_CELL_SIZE);
  const cx = cullCellCoord(x);
  const cz = cullCellCoord(z);

  for (let gz = cz - range; gz <= cz + range; gz++) {
    for (let gx = cx - range; gx <= cx + range; gx++) {
      const bucket = cullGrid.get(cullCellKey(gx, gz));
      if (!bucket) continue;

      for (const entry of bucket) {
        const dx = entry.x - x;
        const dz = entry.z - z;
        const limit = NEAR_RENDER_RADIUS + entry.radius + (entry.object.visible ? NEAR_RENDER_HYSTERESIS : 0);
        if (dx * dx + dz * dz <= limit * limit) nextVisible.add(entry);
      }
    }
  }

  for (const entry of visibleCullables) {
    if (!nextVisible.has(entry)) {
      setObjectVisible(entry.object, false);
      visibleCullables.delete(entry);
    }
  }

  for (const entry of nextVisible) {
    if (!visibleCullables.has(entry)) {
      setObjectVisible(entry.object, true);
      visibleCullables.add(entry);
    }
  }
}

function updateAllCullablesForWarmup() {
  const x = camera.position.x;
  const z = camera.position.z;

  visibleCullables.clear();
  for (const entry of cullables) {
    const dx = entry.x - x;
    const dz = entry.z - z;
    const limit = NEAR_RENDER_RADIUS + entry.radius + (entry.object.visible ? NEAR_RENDER_HYSTERESIS : 0);
    const visible = dx * dx + dz * dz <= limit * limit;
    setObjectVisible(entry.object, visible);
    if (visible) visibleCullables.add(entry);
  }

  lastCullUpdate = performance.now();
  lastCullX = x;
  lastCullZ = z;
}

function compileVisibleScene() {
  if (!renderer || !scene || !camera) return;
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
}

function warmupIndexedCullables(indices, start, count) {
  const end = Math.min(indices.length, start + count);
  const touched = [];

  for (let i = start; i < end; i++) {
    const entry = cullables[indices[i]];
    if (!entry) continue;
    touched.push({ object: entry.object, visible: entry.object.visible });
    entry.object.visible = true;
  }

  compileVisibleScene();

  for (const entry of touched) entry.object.visible = entry.visible;
  return end;
}

function prepareLoadingSamples() {
  const indices = new Set();
  updateAllCullablesForWarmup();

  for (let i = 0; i < cullables.length; i++) {
    if (cullables[i].object.visible) indices.add(i);
  }

  const sampleCount = Math.min(LOAD_SAMPLE_COUNT, cullables.length);
  const stride = cullables.length / Math.max(1, sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    indices.add(Math.min(cullables.length - 1, Math.floor(i * stride)));
  }

  loadSampleIndices = Array.from(indices).sort((a, b) => a - b);
  loadSampleIndex = 0;
}

function startWorldAfterLoading() {
  if (!loading) return;
  loading = false;
  setLoadingVisible(false);
  updateCulledObjects(true);
  // Bake the shadow map once now that the spawn area is populated; with
  // autoUpdate off it then stays free for the rest of the session.
  if (renderer) renderer.shadowMap.needsUpdate = true;
  compileVisibleScene();
  active = true;
  previousTime = performance.now();
  beginWorldRun(previousTime);
  dispatchState();
  animationFrame = requestAnimationFrame(frame);
}

function processLoadingWarmup() {
  if (!loading) return;
  if (!renderer) {
    makeWorld();
    resetPlayer();
    resize();
  }

  if (!loadSampleIndices.length) prepareLoadingSamples();

  if (!warmupComplete && loadSampleIndex < loadSampleIndices.length) {
    loadSampleIndex = warmupIndexedCullables(loadSampleIndices, loadSampleIndex, LOAD_BATCH_SIZE);
    const pct = Math.min(99, Math.floor((loadSampleIndex / Math.max(1, loadSampleIndices.length)) * 100));
    updateLoadingProgress('WARMING RUINS', pct);
    window.setTimeout(processLoadingWarmup, 0);
    return;
  }

  warmupComplete = true;
  updateLoadingProgress('ENTERING');
  window.setTimeout(startWorldAfterLoading, 80);
}

function frame(time) {
  if (!active) return;
  animationFrame = requestAnimationFrame(frame);
  const dt = Math.min((time - previousTime) / 1000 || 0, 0.05);
  previousTime = time;
  if (!playerDead) updateMovement(dt);
  if (maybeExitThroughOpenedGate()) return;
  updateCulledObjects(false, time);
  updateAtmosphere(time);
  updateSword(time);
  updateTentacles(time);
  updateEyeGuardians(time, dt);
  updatePointerStatus();
  renderer.render(scene, camera);
}

function dispatchState() {
  window.dispatchEvent(new CustomEvent('aetherworldchange', { detail: { active: active || loading } }));
}

function resetPlayer() {
  camera.position.set(0, EYE_HEIGHT, 10.8);
  yaw = 0;
  pitch = 0;
  camera.rotation.set(0, 0, 0);
  velocity.set(0, 0, 0);
  parryHeld = false;
  parryStartedAt = 0;
  parryActiveUntil = 0;
  nextParryAt = 0;
  attackUntil = 0;
  attackCooldownUntil = 0;
  attackStartedAt = 0;
  grounded = true;
  updateSword(performance.now());
}

function beginWorldRun(time = performance.now()) {
  clearTentacles();
  wardensSlain = 0;
  debugPasscodeBuffer = '';
  gateTransitioning = false;
  if (gateFade) gateFade.classList.remove('visible');
  setOpenedGateState(false);
  updateWardenStatus();
  resetEyeGuardians(time);
  playerDead = false;
  setPlayerHp(PLAYER_MAX_HP);
  worldEnteredAt = time;
  nextTentacleSpawnAt = time + TENTACLE_FIRST_SPAWN_DELAY;
  combatStatusText = '';
  combatStatusUntil = 0;
  damageFlashUntil = 0;
  clearCombatEffects();
  if (damageFlash) damageFlash.classList.remove('visible');
  if (parryFlash) parryFlash.classList.remove('visible');
  if (deathPanel) deathPanel.classList.add('hidden');
}

function open(options = {}) {
  if (active || loading) return;
  const forceWorld = Boolean(options.forceWorld);
  if (!forceWorld && getSavedEndgameScene() === 'boss2d' &&
      window.AetherBoss2D && typeof window.AetherBoss2D.open === 'function') {
    openBossScene();
    return;
  }

  if (!overlay) makeOverlay();
  setSavedEndgameScene('world3d');

  overlay.classList.remove('hidden');
  document.body.classList.add('aether-world-active');

  if (!warmupComplete) {
    // First entry: paint the loading screen FIRST, then build + warm the
    // scene on the next tick so the heavy makeWorld() never freezes the page.
    loading = true;
    warmupStarted = true;
    setLoadingVisible(true);
    updateLoadingProgress('WARMING RUINS', 0);
    dispatchState();
    // Wait for the loading screen to actually paint (two frames) before the
    // heavy synchronous makeWorld() runs, so the bar is visible up front.
    requestAnimationFrame(() => requestAnimationFrame(processLoadingWarmup));
    return;
  }

  // Already built and warmed (re-opening after a previous visit).
  if (!renderer) makeWorld();
  resetPlayer();
  updateCulledObjects(true);
  resize();
  loading = true;
  startWorldAfterLoading();
}

function close() {
  if (!active && !loading) return;
  active = false;
  loading = false;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  keys.clear();
  velocity.set(0, 0, 0);
  parryHeld = false;
  parryActiveUntil = 0;
  nextParryAt = 0;
  debugPasscodeBuffer = '';
  gateTransitioning = false;
  playerDead = false;
  attackUntil = 0;
  attackCooldownUntil = 0;
  if (renderer && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  setLoadingVisible(false);
  clearTentacles();
  clearEyeBolts();
  for (const guardian of eyeGuardians) guardian.root.visible = false;
  clearCombatEffects();
  if (deathPanel) deathPanel.classList.add('hidden');
  if (parryFlash) parryFlash.classList.remove('visible');
  if (gateFade) gateFade.classList.remove('visible');
  overlay.classList.add('hidden');
  document.body.classList.remove('aether-world-active');
  dispatchState();
}

window.addEventListener('resize', resize);
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mousedown', onMouseDown);
document.addEventListener('mouseup', onMouseUp);
document.addEventListener('contextmenu', onContextMenu);
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);
document.addEventListener('pointerlockchange', onPointerLockChange);
window.addEventListener('blur', () => {
  keys.clear();
  parryHeld = false;
  parryActiveUntil = 0;
});

window.AetherWorld3D = Object.freeze({
  open,
  close,
  isOpen: () => active || loading,
  isParrying,
  isAttacking,
  setPlayerHp
});

window.AetherEndgame = Object.freeze({
  open: () => open(),
  openWorld: () => open({ forceWorld: true }),
  openBoss: openBossScene,
  getScene: getSavedEndgameScene,
  setScene: setSavedEndgameScene,
  resetScene: resetSavedEndgameScene
});
