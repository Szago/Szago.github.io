import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.min.js';

const EYE_HEIGHT = 1.7;
const WORLD_LIMIT = 74;
const WALK_SPEED = 6.5;
const SPRINT_SPEED = 11;
const JUMP_SPEED = 8;
const GRAVITY = 24;

let overlay;
let viewport;
let status;
let renderer;
let scene;
let camera;
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

function makeOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'aether-world-overlay';
  overlay.className = 'hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Aetherholm first-person world');
  overlay.innerHTML =
    '<div id="aether-world-viewport"></div>' +
    '<div class="aether-world-hud">' +
      '<div class="aether-world-title">AETHERHOLM // WORLD PROTOTYPE</div>' +
      '<div class="aether-world-crosshair"></div>' +
      '<div class="aether-world-help">' +
        'WASD MOVE &nbsp; SHIFT SPRINT &nbsp; SPACE JUMP &nbsp; MOUSE LOOK' +
        '<span id="aether-world-status" class="aether-world-status">CLICK THE WORLD TO CAPTURE THE MOUSE</span>' +
      '</div>' +
    '</div>' +
    '<button id="aether-world-close" type="button">CLOSE WORLD</button>';
  document.body.appendChild(overlay);

  viewport = document.getElementById('aether-world-viewport');
  status = document.getElementById('aether-world-status');
  document.getElementById('aether-world-close').addEventListener('click', close);
  viewport.addEventListener('click', captureMouse);
}

function makeWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101827);
  scene.fog = new THREE.FogExp2(0x101827, 0.018);

  camera = new THREE.PerspectiveCamera(72, 1, 0.05, 350);
  camera.position.set(0, EYE_HEIGHT, 10);
  camera.rotation.order = 'YXZ';

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);

  const skyLight = new THREE.HemisphereLight(0x9fc9ff, 0x29311f, 2.25);
  scene.add(skyLight);

  const sun = new THREE.DirectionalLight(0xffe1a8, 3.2);
  sun.position.set(-28, 45, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -65;
  sun.shadow.camera.right = 65;
  sun.shadow.camera.top = 65;
  sun.shadow.camera.bottom = -65;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x25352d, roughness: 0.93, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(160, 80, 0x8aa398, 0x41564c);
  grid.position.y = 0.012;
  grid.material.transparent = true;
  grid.material.opacity = 0.24;
  scene.add(grid);

  addLandmarks();
}

function addLandmarks() {
  const stone = new THREE.MeshStandardMaterial({ color: 0x4b4a61, roughness: 0.78 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x4e6e87,
    emissive: 0x173d5c,
    emissiveIntensity: 1.5,
    roughness: 0.45
  });

  const dais = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 0.7, 8), stone);
  dais.position.set(0, 0.35, -28);
  dais.receiveShadow = true;
  dais.castShadow = true;
  scene.add(dais);

  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 1.6), stone);
    pillar.position.set(Math.cos(angle) * 16, 4.5, -28 + Math.sin(angle) * 16);
    pillar.rotation.y = -angle;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);

    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(1.15), glow);
    cap.position.set(pillar.position.x, 10, pillar.position.z);
    cap.rotation.y = angle;
    cap.castShadow = true;
    scene.add(cap);
  }

  const archTop = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 1.8), stone);
  archTop.position.set(0, 8.2, -47);
  archTop.castShadow = true;
  scene.add(archTop);

  for (const x of [-4.3, 4.3]) {
    const archSide = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8, 1.8), stone);
    archSide.position.set(x, 4, -47);
    archSide.castShadow = true;
    scene.add(archSide);
  }
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
    ? 'MOUSE CAPTURED // ESC RELEASES CURSOR'
    : 'CLICK THE WORLD TO CAPTURE THE MOUSE';
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

  camera.position.addScaledVector(velocity, dt);
  if (camera.position.y <= EYE_HEIGHT) {
    camera.position.y = EYE_HEIGHT;
    velocity.y = 0;
    grounded = true;
  }

  const clampedX = THREE.MathUtils.clamp(camera.position.x, -WORLD_LIMIT, WORLD_LIMIT);
  const clampedZ = THREE.MathUtils.clamp(camera.position.z, -WORLD_LIMIT, WORLD_LIMIT);
  if (clampedX !== camera.position.x) velocity.x = 0;
  if (clampedZ !== camera.position.z) velocity.z = 0;
  camera.position.x = clampedX;
  camera.position.z = clampedZ;
}

function frame(time) {
  if (!active) return;
  animationFrame = requestAnimationFrame(frame);
  const dt = Math.min((time - previousTime) / 1000 || 0, 0.05);
  previousTime = time;
  updateMovement(dt);
  renderer.render(scene, camera);
}

function dispatchState() {
  window.dispatchEvent(new CustomEvent('aetherworldchange', { detail: { active } }));
}

function open() {
  if (active) return;
  if (!overlay) makeOverlay();
  if (!renderer) makeWorld();

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
