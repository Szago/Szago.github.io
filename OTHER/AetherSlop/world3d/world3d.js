import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.min.js';

const EYE_HEIGHT = 1.7;
const WORLD_LIMIT = 74;
const WALK_SPEED = 6.5;
const SPRINT_SPEED = 11;
const JUMP_SPEED = 8;
const GRAVITY = 24;
const PLAYER_RADIUS = 0.42;
const ROAD_WIDTH = 8.5;
const DEBUG_INFINITE_VISION = true;

let overlay;
let viewport;
let status;
let renderer;
let scene;
let camera;
let playerLight;
let ruinMaterials;
let animationFrame = 0;
let previousTime = 0;
let active = false;
let yaw = 0;
let pitch = 0;
let grounded = true;

const velocity = new THREE.Vector3();
const desiredVelocity = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const keys = new Set();
const colliders = [];
const fires = [];

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
      '<div class="aether-world-crosshair"></div>' +
      '<div class="aether-world-help">' +
        'WASD MOVE &nbsp; SHIFT SPRINT &nbsp; SPACE JUMP &nbsp; MOUSE LOOK' +
        '<span id="aether-world-status" class="aether-world-status">CLICK THE DARKNESS TO CAPTURE THE MOUSE</span>' +
      '</div>' +
    '</div>' +
    '<button id="aether-world-close" type="button">LEAVE RUINS</button>';
  document.body.appendChild(overlay);

  viewport = document.getElementById('aether-world-viewport');
  status = document.getElementById('aether-world-status');
  document.getElementById('aether-world-close').addEventListener('click', close);
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
  return makeCanvasTexture(32, 32, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(73, 0, 0, 0.92)';
    for (let i = 0; i < 9; i++) {
      const x = width * (0.3 + random() * 0.4);
      const y = height * (0.3 + random() * 0.4);
      const rx = 3 + random() * 9;
      const ry = 2 + random() * 7;
      ctx.beginPath();
      ctx.ellipse(x + (random() - 0.5) * 10, y + (random() - 0.5) * 10, rx, ry, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(120, 5, 0, 0.72)';
    for (let i = 0; i < 24; i++) ctx.fillRect((random() * width) | 0, (random() * height) | 0, 1 + (random() * 3 | 0), 1 + (random() * 2 | 0));
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

function initMaterials() {
  const roadMap = makeNoiseTexture('#423a34', [
    { color: '#211d1a', count: 180, size: random => 1 + (random() * 2 | 0) },
    { color: '#655e55', count: 120, size: random => 1 + (random() * 2 | 0) },
    { color: '#711912', count: 20, size: random => 1 + (random() * 3 | 0) }
  ], 0xA370AD);
  roadMap.repeat.set(4, 34);

  const stoneMap = makeNoiseTexture('#56525a', [
    { color: '#747078', count: 120, size: random => 1 + (random() * 2 | 0) },
    { color: '#252228', count: 150, size: random => 1 + (random() * 3 | 0) }
  ], 0x5700AE);
  stoneMap.repeat.set(2.5, 2.5);

  const ashMap = makeNoiseTexture('#211d19', [
    { color: '#332b25', count: 140, size: random => 1 + (random() * 2 | 0) },
    { color: '#0d0b09', count: 210, size: random => 1 + (random() * 3 | 0) },
    { color: '#6f1d10', count: 26, size: random => 1 + (random() * 2 | 0) }
  ], 0xC0FFEE);
  ashMap.repeat.set(2, 2);

  ruinMaterials = {
    ground: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ashMap, roughness: 1 }),
    road: new THREE.MeshStandardMaterial({ color: 0xffffff, map: roadMap, roughness: 1 }),
    roadEdge: new THREE.MeshStandardMaterial({ color: 0x151311, roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneMap, roughness: 0.94 }),
    darkStone: new THREE.MeshStandardMaterial({ color: 0x3b3840, roughness: 0.98 }),
    char: new THREE.MeshStandardMaterial({ color: 0x090706, roughness: 1 }),
    ember: new THREE.MeshBasicMaterial({ color: 0xff5a18, transparent: true, opacity: 0.82 }),
    windowFire: new THREE.MeshBasicMaterial({ color: 0xff8b23, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
    blood: new THREE.MeshBasicMaterial({ map: makeBloodTexture(0xB100D), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    oldBlood: new THREE.MeshBasicMaterial({ map: makeBloodTexture(0xD15EA5E), color: 0x7d120d, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
    smoke: new THREE.SpriteMaterial({ map: makeSmokeTexture(0x5A10AE), color: 0x2a2421, transparent: true, opacity: 0.48, depthWrite: false })
  };
}

function makeWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090705);
  scene.fog = DEBUG_INFINITE_VISION ? null : new THREE.FogExp2(0x020101, 0.055);

  camera = new THREE.PerspectiveCamera(72, 1, 0.05, DEBUG_INFINITE_VISION ? 1200 : 180);
  camera.position.set(0, EYE_HEIGHT, 10.8);
  camera.rotation.order = 'YXZ';

  initMaterials();

  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 0.82));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEBUG_INFINITE_VISION ? 1.38 : 1.05;
  viewport.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0x8b8f90, 0x22100c, DEBUG_INFINITE_VISION ? 0.82 : 0.08));

  const ashenMoon = new THREE.DirectionalLight(0xd4cfc0, DEBUG_INFINITE_VISION ? 2.05 : 0.22);
  ashenMoon.position.set(-46, 74, 35);
  ashenMoon.castShadow = true;
  ashenMoon.shadow.mapSize.set(1024, 1024);
  scene.add(ashenMoon);

  playerLight = new THREE.PointLight(0xffd6a0, DEBUG_INFINITE_VISION ? 32 : 27, DEBUG_INFINITE_VISION ? 90 : 13, 1.8);
  playerLight.castShadow = true;
  playerLight.shadow.mapSize.set(512, 512);
  playerLight.shadow.bias = -0.002;
  scene.add(playerLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_LIMIT * 2.22, WORLD_LIMIT * 2.22),
    ruinMaterials.ground
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  addRoads();
  addFountain();
  addRuinedCity();
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

function addRoadDamage() {
  const random = mulberry32(0xB10D51);
  const roadPoint = (edgeBias = 0) => {
    const along = (random() * 2 - 1) * WORLD_LIMIT * 0.98;
    const offsetRange = ROAD_WIDTH * (edgeBias ? 0.62 : 0.42);
    const offset = (random() * 2 - 1) * offsetRange;
    if (random() < 0.5) return { x: offset, z: along, axis: 'z' };
    return { x: along, z: offset, axis: 'x' };
  };

  for (let i = 0; i < 58; i++) {
    const p = roadPoint();
    if (Math.hypot(p.x, p.z) < 10) continue;
    const pothole = new THREE.Mesh(new THREE.CircleGeometry(0.55 + random() * 1.35, 9), ruinMaterials.char);
    pothole.rotation.x = -Math.PI / 2;
    pothole.rotation.z = random() * Math.PI;
    pothole.scale.set(1 + random() * 1.5, 0.45 + random() * 0.8, 1);
    pothole.position.set(p.x, 0.038, p.z);
    scene.add(pothole);
  }

  for (let i = 0; i < 92; i++) {
    const p = roadPoint(1);
    if (Math.hypot(p.x, p.z) < 9) continue;
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.055 + random() * 0.06, 0.026, 0.9 + random() * 4.3), ruinMaterials.char);
    crack.position.set(p.x, 0.054, p.z);
    crack.rotation.y = (p.axis === 'z' ? 0 : Math.PI / 2) + (random() - 0.5) * 1.1;
    scene.add(crack);
  }

  for (let i = 0; i < 74; i++) {
    const p = roadPoint();
    if (Math.hypot(p.x, p.z) < 8.5) continue;
    addBloodSplatter(p.x, p.z, 0.65 + random() * 2.5, random() * Math.PI, random() < 0.4);
  }

  for (let i = 0; i < 140; i++) {
    const p = roadPoint(1);
    if (Math.hypot(p.x, p.z) < 7) continue;
    const rubble = new THREE.Mesh(
      new THREE.BoxGeometry(0.14 + random() * 0.7, 0.08 + random() * 0.38, 0.14 + random() * 0.85),
      random() < 0.72 ? ruinMaterials.darkStone : ruinMaterials.char
    );
    rubble.position.set(p.x, rubble.geometry.parameters.height / 2 + 0.055, p.z);
    rubble.rotation.set(random() * 0.6, random() * Math.PI, random() * 0.6);
    rubble.castShadow = true;
    scene.add(rubble);
  }
}

function addBloodSplatter(x, z, scale, rotation, old = false) {
  const material = old ? ruinMaterials.oldBlood : ruinMaterials.blood;
  const splatter = new THREE.Mesh(new THREE.PlaneGeometry(scale * (0.85 + scale * 0.08), scale), material);
  splatter.rotation.set(-Math.PI / 2, 0, rotation);
  splatter.position.set(x, 0.066, z);
  splatter.renderOrder = 5;
  scene.add(splatter);
}

function addFountain() {
  const random = mulberry32(0xF0A7A1);
  const deadWater = new THREE.MeshStandardMaterial({ color: 0x160706, roughness: 0.45, metalness: 0.08 });

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(9.8, 9.35, 0.18, 18), ruinMaterials.darkStone);
  plaza.position.y = 0.09;
  plaza.rotation.y = 0.08;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.05, 4.45, 0.42, 16), ruinMaterials.stone);
  basin.position.y = 0.31;
  basin.castShadow = true;
  basin.receiveShadow = true;
  scene.add(basin);

  for (let i = 0; i < 18; i++) {
    if (random() < 0.3) continue;
    const angle = (i / 18) * Math.PI * 2 + random() * 0.08;
    const radius = 4.35 + random() * 0.16;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.25 + random() * 0.65, 0.52 + random() * 0.2, 0.72), ruinMaterials.stone);
    rim.position.set(Math.cos(angle) * radius, 0.75 + random() * 0.08, Math.sin(angle) * radius);
    rim.rotation.set((random() - 0.5) * 0.2, -angle + Math.PI / 2, (random() - 0.5) * 0.38);
    rim.castShadow = true;
    rim.receiveShadow = true;
    scene.add(rim);
  }

  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.35, 0.08, 13), deadWater);
  water.position.y = 0.58;
  scene.add(water);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.08, 2.05, 7), ruinMaterials.stone);
  pedestal.position.set(-0.32, 1.62, 0.18);
  pedestal.rotation.set(0.05, -0.18, 0.22);
  pedestal.castShadow = true;
  scene.add(pedestal);

  const brokenFigure = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.0, 0.56), ruinMaterials.stone);
  brokenFigure.position.set(-0.12, 2.9, -0.12);
  brokenFigure.rotation.set(0.35, 0.34, -0.52);
  brokenFigure.castShadow = true;
  scene.add(brokenFigure);

  const fallenPiece = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.65, 0.58), ruinMaterials.stone);
  fallenPiece.position.set(2.45, 0.95, -1.1);
  fallenPiece.rotation.set(0.2, 0.8, 1.28);
  fallenPiece.castShadow = true;
  scene.add(fallenPiece);

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
    scene.add(rubble);
  }

  for (let i = 0; i < 14; i++) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.05 + random() * 0.05, 0.035, 2.2 + random() * 4.5), ruinMaterials.char);
    const angle = random() * Math.PI * 2;
    const radius = 1.5 + random() * 7.4;
    crack.position.set(Math.cos(angle) * radius, 0.205, Math.sin(angle) * radius);
    crack.rotation.y = angle + (random() - 0.5) * 0.7;
    scene.add(crack);
  }

  addBloodSplatter(1.6, -4.1, 2.5, 0.1);
  addBloodSplatter(-4.8, 1.2, 1.8, -0.7, true);
  addFire(2.8, 1.7, 0.55, random);

  colliders.push({ minX: -5.25, maxX: 5.25, minZ: -5.25, maxZ: 5.25 });
}

function isNearRoad(x, z, padding) {
  return Math.abs(x) < ROAD_WIDTH / 2 + padding || Math.abs(z) < ROAD_WIDTH / 2 + padding;
}

function overlapsCollider(minX, maxX, minZ, maxZ, margin = 0) {
  return colliders.some(box =>
    minX < box.maxX + margin && maxX > box.minX - margin &&
    minZ < box.maxZ + margin && maxZ > box.minZ - margin
  );
}

function addRuinedCity() {
  const random = mulberry32(0xAE7E40);
  let placed = 0;

  for (let attempt = 0; attempt < 1600 && placed < 112; attempt++) {
    const x = (random() * 2 - 1) * WORLD_LIMIT * 0.92;
    const z = (random() * 2 - 1) * WORLD_LIMIT * 0.92;
    const width = 3.6 + random() * 8.5;
    const depth = 3.8 + random() * 8.2;
    const radius = Math.max(width, depth) * 0.58;

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

    if (random() < 0.72) addBurningWindows(group, spec, random);
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

  scene.add(group);

  if (random() < 0.64) {
    const fireX = x + (random() - 0.5) * width * 0.85;
    const fireZ = z + (random() - 0.5) * depth * 0.85;
    addFire(fireX, fireZ, 0.62 + random() * 1.05, random);
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
      if (random() < 0.58) continue;
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

function addFire(x, z, scale, random) {
  const group = new THREE.Group();
  group.position.set(x, 0.12, z);

  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.42 * scale, 1.3 * scale, 7),
    new THREE.MeshBasicMaterial({ color: 0xe73b0c, transparent: true, opacity: 0.72 })
  );
  outer.position.y = 0.65 * scale;
  group.add(outer);

  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.24 * scale, 0.85 * scale, 7),
    new THREE.MeshBasicMaterial({ color: 0xffc43d, transparent: true, opacity: 0.9 })
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

  const light = new THREE.PointLight(0xff4d16, 2.7 * scale, DEBUG_INFINITE_VISION ? 13 + scale * 5 : 5.5 + scale * 2.5, 2);
  light.position.y = 1.05 * scale;
  group.add(light);
  scene.add(group);

  fires.push({
    group,
    outer,
    inner,
    light,
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
  if (!active || document.pointerLockElement === renderer.domElement) return;
  renderer.domElement.requestPointerLock();
}

function updatePointerStatus() {
  if (!status) return;
  status.textContent = document.pointerLockElement === renderer.domElement
    ? 'THE DARKNESS IS LISTENING // ESC RELEASES CURSOR'
    : 'CLICK THE DARKNESS TO CAPTURE THE MOUSE';
}

function onMouseMove(event) {
  if (!active || document.pointerLockElement !== renderer.domElement) return;
  yaw -= event.movementX * 0.0022;
  pitch -= event.movementY * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  camera.rotation.set(pitch, yaw, 0);
}

function onKeyDown(event) {
  if (!active) return;
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
  return colliders.some(box =>
    x + PLAYER_RADIUS > box.minX && x - PLAYER_RADIUS < box.maxX &&
    z + PLAYER_RADIUS > box.minZ && z - PLAYER_RADIUS < box.maxZ
  );
}

function updateMovement(dt) {
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
  if (camera.position.y <= EYE_HEIGHT) {
    camera.position.y = EYE_HEIGHT;
    velocity.y = 0;
    grounded = true;
  }
}

function updateAtmosphere(time) {
  playerLight.position.set(camera.position.x, camera.position.y + 0.12, camera.position.z);
  const playerLightBase = DEBUG_INFINITE_VISION ? 32 : 26.5;
  playerLight.intensity = playerLightBase + Math.sin(time * 0.0027) * 0.8 + Math.sin(time * 0.011) * 0.3;

  for (const fire of fires) {
    const flicker = 0.84 + Math.sin(time * 0.009 + fire.phase) * 0.12 +
      Math.sin(time * 0.021 + fire.phase * 2.3) * 0.06;
    fire.outer.scale.set(1 + Math.sin(time * 0.014 + fire.phase) * 0.11, flicker, 1);
    fire.inner.scale.set(0.9 + Math.sin(time * 0.018 + fire.phase) * 0.08, 1.04 / flicker, 0.9);
    fire.light.intensity = (2.25 + flicker * 0.8) * fire.baseScale;
    for (let i = 0; i < fire.smokeSprites.length; i++) {
      const smoke = fire.smokeSprites[i];
      const drift = time * 0.00045 + fire.phase + i;
      smoke.position.x = Math.sin(drift * 2.1) * fire.baseScale * 0.32;
      smoke.position.z = Math.cos(drift * 1.7) * fire.baseScale * 0.26;
      smoke.material.opacity = 0.22 + Math.sin(drift * 3.2) * 0.08;
    }
  }
}

function frame(time) {
  if (!active) return;
  animationFrame = requestAnimationFrame(frame);
  const dt = Math.min((time - previousTime) / 1000 || 0, 0.05);
  previousTime = time;
  updateMovement(dt);
  updateAtmosphere(time);
  renderer.render(scene, camera);
}

function dispatchState() {
  window.dispatchEvent(new CustomEvent('aetherworldchange', { detail: { active } }));
}

function resetPlayer() {
  camera.position.set(0, EYE_HEIGHT, 10.8);
  yaw = 0;
  pitch = 0;
  camera.rotation.set(0, 0, 0);
  velocity.set(0, 0, 0);
  grounded = true;
}

function open() {
  if (active) return;
  if (!overlay) makeOverlay();
  if (!renderer) makeWorld();

  resetPlayer();
  active = true;
  overlay.classList.remove('hidden');
  document.body.classList.add('aether-world-active');
  resize();
  previousTime = performance.now();
  dispatchState();
  animationFrame = requestAnimationFrame(frame);
}

function close() {
  if (!active) return;
  active = false;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  keys.clear();
  velocity.set(0, 0, 0);
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  overlay.classList.add('hidden');
  document.body.classList.remove('aether-world-active');
  dispatchState();
}

window.addEventListener('resize', resize);
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);
document.addEventListener('pointerlockchange', updatePointerStatus);
window.addEventListener('blur', () => keys.clear());

window.AetherWorld3D = Object.freeze({
  open,
  close,
  isOpen: () => active
});
