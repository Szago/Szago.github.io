import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.min.js';

const EYE_HEIGHT = 1.7;
const WORLD_LIMIT = 74;
const WALK_SPEED = 6.5;
const SPRINT_SPEED = 11;
const JUMP_SPEED = 8;
const GRAVITY = 24;
const PLAYER_RADIUS = 0.42;
const ROAD_WIDTH = 8;

let overlay;
let viewport;
let status;
let renderer;
let scene;
let camera;
let playerLight;
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

function makeWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010101);

  camera = new THREE.PerspectiveCamera(72, 1, 0.05, 180);
  camera.position.set(0, EYE_HEIGHT, 7.8);
  camera.rotation.order = 'YXZ';

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  viewport.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0x10121a, 0x030100, 0.08));

  playerLight = new THREE.PointLight(0xffd6a0, 27, 13, 1.8);
  playerLight.castShadow = true;
  playerLight.shadow.mapSize.set(512, 512);
  playerLight.shadow.bias = -0.002;
  scene.add(playerLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x11110f, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  addRoads();
  addFountain();
  addRuinedCity();
}

function addRoads() {
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x282522, roughness: 1 });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x171513, roughness: 1 });
  const length = 214;

  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, length), roadMaterial);
    road.rotation.set(-Math.PI / 2, 0, angle);
    road.position.y = 0.012;
    road.receiveShadow = true;
    scene.add(road);

    for (const side of [-1, 1]) {
      const verge = new THREE.Mesh(new THREE.PlaneGeometry(0.65, length), edgeMaterial);
      verge.rotation.set(-Math.PI / 2, 0, angle);
      verge.position.set(
        Math.cos(angle) * side * (ROAD_WIDTH / 2 + 0.32),
        0.018,
        -Math.sin(angle) * side * (ROAD_WIDTH / 2 + 0.32)
      );
      scene.add(verge);
    }
  }
}

function addFountain() {
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x292b30, roughness: 0.84 });
  const chippedStone = new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.9 });
  const deadWater = new THREE.MeshStandardMaterial({ color: 0x090d10, roughness: 0.35, metalness: 0.12 });

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 0.18, 16), darkStone);
  plaza.position.y = 0.09;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.25, 4.65, 0.82, 16), chippedStone);
  basin.position.y = 0.48;
  basin.castShadow = true;
  basin.receiveShadow = true;
  scene.add(basin);

  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.75, 3.75, 0.12, 16), deadWater);
  water.position.y = 0.93;
  scene.add(water);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.15, 2.8, 8), chippedStone);
  pedestal.position.y = 2.05;
  pedestal.rotation.z = 0.08;
  pedestal.castShadow = true;
  scene.add(pedestal);

  const brokenFigure = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.45, 0.62), chippedStone);
  brokenFigure.position.set(0.14, 3.75, -0.08);
  brokenFigure.rotation.set(0.12, 0.28, -0.18);
  brokenFigure.castShadow = true;
  scene.add(brokenFigure);

  const fallenPiece = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.48), chippedStone);
  fallenPiece.position.set(2.1, 1.42, -0.6);
  fallenPiece.rotation.set(0.2, 0.8, 1.18);
  fallenPiece.castShadow = true;
  scene.add(fallenPiece);

  colliders.push({ minX: -4.8, maxX: 4.8, minZ: -4.8, maxZ: 4.8 });
}

function isNearRoad(x, z, padding) {
  const distanceA = Math.abs(x - z) / Math.SQRT2;
  const distanceB = Math.abs(x + z) / Math.SQRT2;
  return distanceA < ROAD_WIDTH / 2 + padding || distanceB < ROAD_WIDTH / 2 + padding;
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

  for (let attempt = 0; attempt < 900 && placed < 68; attempt++) {
    const x = (random() * 2 - 1) * 67;
    const z = (random() * 2 - 1) * 67;
    const width = 4.5 + random() * 5.5;
    const depth = 4.5 + random() * 5.5;
    const radius = Math.max(width, depth) * 0.58;

    if (Math.hypot(x, z) < 12 || isNearRoad(x, z, radius + 1.3)) continue;
    const minX = x - width / 2;
    const maxX = x + width / 2;
    const minZ = z - depth / 2;
    const maxZ = z + depth / 2;
    if (overlapsCollider(minX, maxX, minZ, maxZ, 1.4)) continue;

    addRuin(x, z, width, depth, random);
    colliders.push({ minX, maxX, minZ, maxZ });
    placed++;
  }
}

function addRuin(x, z, width, depth, random) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const height = 3.2 + random() * 8.5;
  const wallThickness = 0.38 + random() * 0.28;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.06, 0.08, 0.12 + random() * 0.08),
    roughness: 0.92
  });
  const charMaterial = new THREE.MeshStandardMaterial({ color: 0x100d0b, roughness: 1 });

  const wallSpecs = [
    [width, height * (0.58 + random() * 0.42), wallThickness, 0, -depth / 2],
    [width, height * (0.35 + random() * 0.62), wallThickness, 0, depth / 2],
    [wallThickness, height * (0.45 + random() * 0.55), depth, -width / 2, 0],
    [wallThickness, height * (0.3 + random() * 0.7), depth, width / 2, 0]
  ];

  for (let i = 0; i < wallSpecs.length; i++) {
    if (random() < 0.18) continue;
    const [w, h, d, ox, oz] = wallSpecs[i];
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial);
    wall.position.set(ox, h / 2, oz);
    wall.rotation.z = (random() - 0.5) * 0.035;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
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

  scene.add(group);

  if (random() < 0.34) {
    const fireX = x + (random() - 0.5) * width * 0.85;
    const fireZ = z + (random() - 0.5) * depth * 0.85;
    addFire(fireX, fireZ, 0.7 + random() * 0.75, random);
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

  const light = new THREE.PointLight(0xff4d16, 2.7 * scale, 5.5 + scale * 2.5, 2);
  light.position.y = 1.05 * scale;
  group.add(light);
  scene.add(group);

  fires.push({
    group,
    outer,
    inner,
    light,
    baseScale: scale,
    phase: random() * Math.PI * 2
  });
}

function resize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
  playerLight.intensity = 26.5 + Math.sin(time * 0.0027) * 0.8 + Math.sin(time * 0.011) * 0.3;

  for (const fire of fires) {
    const flicker = 0.84 + Math.sin(time * 0.009 + fire.phase) * 0.12 +
      Math.sin(time * 0.021 + fire.phase * 2.3) * 0.06;
    fire.outer.scale.set(1 + Math.sin(time * 0.014 + fire.phase) * 0.11, flicker, 1);
    fire.inner.scale.set(0.9 + Math.sin(time * 0.018 + fire.phase) * 0.08, 1.04 / flicker, 0.9);
    fire.light.intensity = (2.25 + flicker * 0.8) * fire.baseScale;
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
  camera.position.set(0, EYE_HEIGHT, 7.8);
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
