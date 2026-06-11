/* ============================================================
   Aetherholm — spire.js
   THE SILVER SPIRE: a slingshot climb.
   Twin angelic towers at the WEST end of the kingsroad. Inside:
   a Jump-King-style vertical platformer with Angry-Birds input —
   press, drag, release to launch the hero with full jump/fall
   physics (a small capped arrow previews the angle). One long
   deterministic map; platforms thin out as you rise; falling is
   always easy. Your position is SAVED, even across Ascensions.
   Reach the CROWN at the very top ONCE per save: permanent
   x2 gold production, forever, through every Ascension.
   ============================================================ */

'use strict';

const SPIRE_GATE_TILE = [3, 60];     // west end of the horizontal kingsroad
const SPIRE_W = 520;                 // world width (px)
const SPIRE_H = 16000;               // world height — a LONG climb
const SPIRE_G = 1800;                // gravity px/s^2
const SPIRE_VCAP = 1060;             // max launch speed (jump apex ~312px, +25%)
const SPIRE_DRAG_K = 3.4;            // drag px -> launch speed
const SPIRE_MIN_DRAG = 18;           // smaller drags cancel
const SPIRE_PW = 22, SPIRE_PH = 30;  // player collision box
const SPIRE_ARROW_MAX = 50;          // preview arrow stays tiny
const SPIRE_PXM = 40;                // pixels per meter (for the altitude meter)
const SPIRE_PLAT_H = 12;             // platform thickness — solid from below!

/* ---------------- state ---------------- */

function spireEnsure(s) {
  if (!s.spire) s.spire = {};
  const p = s.spire;
  if (p.crowned === undefined) p.crowned = false; // permanent x2 gold (once per save!)
  if (p.x === undefined) p.x = SPIRE_W / 2 - SPIRE_PW / 2;
  if (p.y === undefined) p.y = SPIRE_H - 24 - SPIRE_PH;
  if (p.jumps === undefined) p.jumps = 0;
  if (p.falls === undefined) p.falls = 0;
  if (p.bestM === undefined)                      // best altitude in METERS (migrate old %)
    p.bestM = p.best ? (p.best / 100) * spireTotalM() : 0;
  return s;
}

/* altitude in meters above the floor; the climb's total length */
function spireAltM(py) {
  return Math.max(0, (SPIRE_H - 24 - SPIRE_PH - py) / SPIRE_PXM);
}
function spireTotalM() {
  return (SPIRE_H - 24 - 240) / SPIRE_PXM; // floor to the crown's dais
}

/* ---------------- the map (deterministic for everyone) ---------------- */

let SPIRE_PLATS = null;
const SPIRE_CROWN = { x: SPIRE_W / 2 - 27, y: 178, w: 54, h: 58 };

/* how far sideways a jump can carry while clearing dyUp pixels upward
   (capped launch speed, with a comfort margin) — keeps the map honest */
function spMaxDx(dyUp) {
  if (dyUp <= 0) return 380;
  const vy = Math.sqrt(2 * SPIRE_G * (dyUp + 30));   // clear the ledge by 30px
  if (vy >= SPIRE_VCAP) return 40;
  const vx = Math.sqrt(SPIRE_VCAP * SPIRE_VCAP - vy * vy);
  const t = (vy - Math.sqrt(Math.max(0, vy * vy - 2 * SPIRE_G * dyUp))) / SPIRE_G;
  return Math.max(40, vx * t * 0.85);
}

function spirePlats() {
  if (SPIRE_PLATS) return SPIRE_PLATS;
  const rng = mulberry32(20260611);
  const plats = [{ x: 0, y: SPIRE_H - 24, w: SPIRE_W }]; // the floor
  let prev = plats[0];
  while (prev.y > 620) {
    const t = 1 - prev.y / SPIRE_H;                  // 0 bottom -> 1 top
    const gap = 120 + 95 * t + rng() * 30;           // wider gaps — heaven is far
    const ny = prev.y - gap;
    const w = Math.max(33, (130 - 75 * t) * 0.75 + rng() * 15);
    /* every path platform stays inside the physics envelope of the previous;
       the 22px wall margin always leaves room to slip around the sides */
    const reach = spMaxDx(gap) + (prev.w + w) / 2 - 12;
    const cx = prev.x + prev.w / 2 + (rng() * 2 - 1) * reach;
    const nx = Math.min(SPIRE_W - w - 22, Math.max(22, cx - w / 2));
    const plat = { x: nx, y: ny, w };
    plats.push(plat);
    if (rng() < 0.45) {                              // a decoy ledge — now also an OBSTACLE
      const w2 = Math.max(33, (110 - 60 * t) * 0.75);
      const x2 = 22 + rng() * (SPIRE_W - w2 - 44);
      if (Math.abs(x2 - nx) > 110) plats.push({ x: x2, y: ny - 18 - rng() * 30, w: w2 });
    }
    prev = plat;
  }
  /* final approach: a clean stair to the crown's dais */
  while (prev.y - 240 > 190) {
    const ny = prev.y - (150 + rng() * 30);
    const w = 44;
    const reach = spMaxDx(prev.y - ny) + (prev.w + w) / 2 - 12;
    const dir = (SPIRE_W / 2 - (prev.x + prev.w / 2)) > 0 ? 1 : -1;
    const cx = prev.x + prev.w / 2 + dir * Math.min(reach, Math.abs(SPIRE_W / 2 - (prev.x + prev.w / 2)));
    const nx = Math.min(SPIRE_W - w - 22, Math.max(22, cx - w / 2));
    const plat = { x: nx, y: ny, w };
    plats.push(plat);
    prev = plat;
  }
  plats.push({ x: SPIRE_W / 2 - 75, y: 240, w: 150 }); // the crown's dais
  SPIRE_PLATS = plats;
  return plats;
}

/* ---------------- modal & world DOM ---------------- */

let sp = null; // live session: { vx, vy, grounded, drag, camY, raf, peakY, jumpY, playerEl, arrowEl }

function openSpire() {
  spireEnsure(state);
  buildSpireWorld();
  sp = {
    vx: 0, vy: 0, grounded: false, drag: null,
    camY: 0, raf: 0, last: 0,
    peakY: state.spire.y, jumpY: state.spire.y,
    playerEl: $('sp-player'), arrowEl: $('sp-arrow'),
  };
  sp.camY = Math.max(0, Math.min(SPIRE_H - spViewH(), state.spire.y - spViewH() * 0.55));
  $('spire-modal').classList.remove('hidden');
  $('sp-win').classList.add('hidden');
  spUpdateHud();
  sp.last = performance.now();
  sp.raf = requestAnimationFrame(spLoop);
}

function closeSpire() {
  if (sp && sp.raf) cancelAnimationFrame(sp.raf);
  sp = null;
  $('spire-modal').classList.add('hidden');
  if (typeof save === 'function') save();
}

function spViewH() { return $('sp-view').clientHeight || 560; }

function buildSpireWorld() {
  const world = $('sp-world');
  world.innerHTML = '';
  world.style.width = SPIRE_W + 'px';
  world.style.height = SPIRE_H + 'px';
  for (const p of spirePlats()) {
    const el = document.createElement('div');
    el.className = 'sp-plat';
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.width = p.w + 'px';
    world.appendChild(el);
  }
  const crown = document.createElement('div');
  crown.id = 'sp-crown';
  crown.className = state.spire.crowned ? 'claimed' : '';
  crown.style.left = SPIRE_CROWN.x + 'px';
  crown.style.top = SPIRE_CROWN.y + 'px';
  crown.title = state.spire.crowned ? 'The crown is yours. Gold x2, forever.' :
    'The Crown of the Silver Spire: permanent x2 gold production!';
  crown.appendChild(spriteCanvas('crown', 6));
  world.appendChild(crown);

  const player = document.createElement('div');
  player.id = 'sp-player';
  player.appendChild(spriteCanvas('hero', 2));
  world.appendChild(player);

  const arrow = document.createElement('div');
  arrow.id = 'sp-arrow';
  arrow.className = 'hidden';
  world.appendChild(arrow);
}

/* ---------------- physics ---------------- */

function spireStep(dt) {
  const S = state.spire;
  if (!sp.grounded) {
    sp.vy += SPIRE_G * dt;
    let nx = S.x + sp.vx * dt;
    let ny = S.y + sp.vy * dt;
    if (nx < 0) { nx = 0; sp.vx = -sp.vx * 0.55; }                              // marble walls: bounce off
    if (nx > SPIRE_W - SPIRE_PW) { nx = SPIRE_W - SPIRE_PW; sp.vx = -sp.vx * 0.55; }
    if (sp.vy < 0) {                                                            // rising: undersides are SOLID
      const headPrev = S.y, headNew = ny;
      for (const p of spirePlats()) {
        const bottom = p.y + SPIRE_PLAT_H;
        if (headPrev >= bottom - 0.01 && headNew < bottom &&
            nx + SPIRE_PW > p.x && nx < p.x + p.w) {
          ny = bottom + 0.1;
          sp.vy = -sp.vy * 0.2;                                                 // bonk! you drop
          break;
        }
      }
    }
    if (ny < sp.peakY) sp.peakY = ny;
    if (sp.vy > 0) {                                                            // falling: land on tops
      const footPrev = S.y + SPIRE_PH, footNew = ny + SPIRE_PH;
      for (const p of spirePlats()) {
        if (footPrev <= p.y + 0.01 && footNew >= p.y) {
          const cx = nx + SPIRE_PW / 2;
          if (cx >= p.x - 2 && cx <= p.x + p.w + 2) {
            ny = p.y - SPIRE_PH;
            spLand(ny);
            break;
          }
        }
      }
    }
    S.x = nx; S.y = ny;
  }
  /* the crown! */
  if (!S.crowned &&
      S.x < SPIRE_CROWN.x + SPIRE_CROWN.w && S.x + SPIRE_PW > SPIRE_CROWN.x &&
      S.y < SPIRE_CROWN.y + SPIRE_CROWN.h && S.y + SPIRE_PH > SPIRE_CROWN.y) {
    spireCrown();
  }
}

function spLand(ny) {
  const S = state.spire;
  sp.vy = 0; sp.vx = 0;
  sp.grounded = true;
  const gained = sp.jumpY - ny;
  if (gained < -500) {
    S.falls++;
    toast('You plummet ' + Math.round(-gained / SPIRE_PXM) + 'm down the Spire...');
  }
  const alt = spireAltM(ny);
  if (alt > S.bestM) S.bestM = alt;
}

/* ---------------- slingshot input ---------------- */

function spDragStart(x, y) {
  if (!sp || !sp.grounded) return;
  sp.drag = { sx: x, sy: y, cx: x, cy: y };
}

function spDragMove(x, y) {
  if (!sp || !sp.drag) return;
  sp.drag.cx = x; sp.drag.cy = y;
}

function spDragVec() {
  const d = sp.drag;
  let vx = (d.sx - d.cx) * SPIRE_DRAG_K, vy = (d.sy - d.cy) * SPIRE_DRAG_K;
  const mag = Math.hypot(vx, vy);
  if (mag > SPIRE_VCAP) { vx *= SPIRE_VCAP / mag; vy *= SPIRE_VCAP / mag; }
  return { vx, vy, mag: Math.min(mag, SPIRE_VCAP) };
}

function spDragEnd() {
  if (!sp || !sp.drag) return;
  const d = sp.drag;
  const pulled = Math.hypot(d.sx - d.cx, d.sy - d.cy);
  const v = spDragVec();
  sp.drag = null;
  sp.arrowEl.classList.add('hidden');
  if (pulled < SPIRE_MIN_DRAG || v.vy >= 0) return;  // tiny pulls & downward shots cancel
  sp.vx = v.vx; sp.vy = v.vy;
  sp.grounded = false;
  sp.jumpY = state.spire.y;
  sp.peakY = state.spire.y;
  state.spire.jumps++;
}

/* ---------------- frame loop & render ---------------- */

function spLoop() {
  if (!sp) return;
  const now = performance.now();
  let dt = Math.min(0.05, (now - sp.last) / 1000);
  sp.last = now;
  spireStep(dt / 2);
  spireStep(dt / 2);
  spRender();
  if (sp) sp.raf = requestAnimationFrame(spLoop);
}

function spRender() {
  const S = state.spire;
  /* camera follows, eased */
  const target = Math.max(0, Math.min(SPIRE_H - spViewH(), S.y - spViewH() * 0.55));
  sp.camY += (target - sp.camY) * 0.16;
  $('sp-world').style.transform = 'translateY(' + (-sp.camY).toFixed(1) + 'px)';

  sp.playerEl.style.left = (S.x + SPIRE_PW / 2) + 'px';
  sp.playerEl.style.top = (S.y + SPIRE_PH) + 'px';

  /* the tiny preview arrow */
  if (sp.drag && sp.grounded) {
    const v = spDragVec();
    if (v.mag > SPIRE_MIN_DRAG * SPIRE_DRAG_K) {
      const len = 14 + (v.mag / SPIRE_VCAP) * (SPIRE_ARROW_MAX - 14);
      const ang = Math.atan2(v.vy, v.vx) * 180 / Math.PI;
      const a = sp.arrowEl;
      a.classList.remove('hidden');
      a.style.left = (S.x + SPIRE_PW / 2) + 'px';
      a.style.top = (S.y + SPIRE_PH / 2) + 'px';
      a.style.width = len.toFixed(0) + 'px';
      a.style.transform = 'rotate(' + ang.toFixed(1) + 'deg)';
    } else {
      sp.arrowEl.classList.add('hidden');
    }
  }
  spUpdateHud();
}

function spUpdateHud() {
  const S = state.spire;
  $('sp-alt').textContent = 'ALT ' + spireAltM(S.y).toFixed(1) + 'm';
  $('sp-best').textContent = 'BEST ' + S.bestM.toFixed(1) + 'm';
  $('sp-total').textContent = 'SPIRE ' + spireTotalM().toFixed(0) + 'm';
  $('sp-status').innerHTML = S.crowned ? '👑 <b>CROWNED — GOLD x2</b>' : '👑 uncrowned';
}

/* ---------------- the crown ---------------- */

function spireCrown() {
  state.spire.crowned = true;
  const c = $('sp-crown');
  if (c) c.classList.add('claimed');
  toast('👑 THE CROWN OF THE SILVER SPIRE! Gold production x2 — permanently, through every Ascension!');
  const win = $('sp-win');
  win.innerHTML = '<div class="pr-title win">👑 CROWNED 👑</div>' +
    '<div class="pr-lines">You conquered the Silver Spire.<br>' +
    '<span class="gold">ALL GOLD PRODUCTION IS DOUBLED — FOREVER.</span><br>' +
    '<span class="dim">This blessing survives every Ascension. There is nothing above the sky.</span></div>';
  const btn = document.createElement('button');
  btn.className = 'pr-btn';
  btn.textContent = 'DESCEND IN GLORY';
  btn.onclick = closeSpire;
  win.appendChild(btn);
  win.classList.remove('hidden');
  if (typeof save === 'function') save();
}

/* ---------------- the gate on the map ---------------- */

function makeSpireGate() {
  if ($('spire-gate')) return;
  const [tx, ty] = SPIRE_GATE_TILE;
  const el = document.createElement('div');
  el.id = 'spire-gate';
  el.style.left = ((tx + 0.5) / MAP_W * 100) + '%';
  el.style.top = ((ty + 1) / MAP_H * 100) + '%';
  el.title = 'The Silver Spire — climb to the Crown! (best: ' + (state.spire ? state.spire.bestM.toFixed(0) : 0) + 'm of ' + spireTotalM().toFixed(0) + 'm)';
  el.appendChild(spriteCanvas('spire', 3));
  el.onclick = (ev) => { ev.stopPropagation(); if (!mapDragged) openSpire(); };
  $('map-world').appendChild(el);
}

/* ---------------- init (after game.js) ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  spireEnsure(state);
  makeSpireGate();
  $('close-spire').onclick = closeSpire;
  const view = $('sp-view');
  view.addEventListener('mousedown', ev => { ev.preventDefault(); spDragStart(ev.clientX, ev.clientY); });
  view.addEventListener('mousemove', ev => spDragMove(ev.clientX, ev.clientY));
  window.addEventListener('mouseup', () => spDragEnd());
  view.addEventListener('mouseleave', () => { if (sp && sp.drag) { sp.drag = null; sp.arrowEl.classList.add('hidden'); } });
});
