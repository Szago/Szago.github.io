/* ============================================================
   Aetherholm — ambient.js
   Cosmetic life on the city map, drawn on a canvas layered
   between the terrain and the building sprites:
   - shimmering / flowing water
   - villagers walking the kingsroads (more as the city grows)
   - chimney smoke from the forges and taverns
   - roaming monsters in the wilderness (no gameplay effect)
   Runs at ~12fps via requestAnimationFrame. Entities are rebuilt
   by ambientRebuild() whenever the city changes.
   ============================================================ */

'use strict';

let ambCtx = null;
let ambLast = 0;
let ambPrev = 0;
let ambVillagers = [];
let ambRoamers = [];
let ambSmokes = [];
let ambPatrols = [];
let ambGlows = [];      // night window glows: [x, y, seed]
let ambFireflies = [];  // wilderness night sparks
let ambBoats = [];      // river traffic
let ambBirds = [];      // flocks crossing the sky
let nextFlockAt = 5000;

const VILLAGER_COLORS = ['#b5443c', '#3c6ed6', '#7d4ea0', '#e07b39', '#2f8f23', '#c9a23c'];
const SKIN = '#f0c8a0';

let lightsCtx = null;
let glowWarm = null, glowGreen = null;
let cityGlow = null; // {x, y, r} ambient dome over the city

/* a soft radial glow sprite, drawn smoothly (NOT pixelated) */
function makeGlow(r, g, b) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
  grad.addColorStop(0.4, 'rgba(' + r + ',' + g + ',' + b + ',0.45)');
  grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return c;
}

function ambientInit() {
  const c = document.getElementById('anim');
  c.width = MAP_W * TILE;
  c.height = MAP_H * TILE;
  ambCtx = c.getContext('2d');
  ambCtx.imageSmoothingEnabled = false;
  const l = document.getElementById('lights');
  l.width = MAP_W * TILE;
  l.height = MAP_H * TILE;
  lightsCtx = l.getContext('2d');
  lightsCtx.imageSmoothingEnabled = true; // smooth, moody light
  glowWarm = makeGlow(255, 200, 110);
  glowGreen = makeGlow(190, 255, 130);
  requestAnimationFrame(ambientFrame);
}

/* called by game.js after terrain/city changes */
function ambientRebuild() {
  if (!ambCtx || typeof state === 'undefined') return;

  /* walking range: bounding box of owned districts, padded outward */
  let minX = MAP_W, maxX = 0, minY = MAP_H, maxY = 0;
  for (const key of state.districts) {
    const [dx, dy] = key.split(',').map(Number);
    minX = Math.min(minX, dx * DISTRICT_W);
    maxX = Math.max(maxX, (dx + 1) * DISTRICT_W);
    minY = Math.min(minY, dy * DISTRICT_H);
    maxY = Math.max(maxY, (dy + 1) * DISTRICT_H);
  }
  const pad = 8 * TILE;
  const hMin = Math.max(0, minX * TILE - pad), hMax = Math.min(MAP_W * TILE, maxX * TILE + pad);
  const vMin = Math.max(0, minY * TILE - pad), vMax = Math.min(MAP_H * TILE, maxY * TILE + pad);

  /* wanderers grow with the army you've ever raised: +2 per 100 units bought */
  const unitTier = Math.floor((state.totalUnitsBought || 0) / 100);
  const want = Math.min(2 + Math.floor(totalBuildings() / 5) + unitTier * 2, 36);
  ambVillagers = [];
  for (let i = 0; i < want; i++) {
    const horizontal = i % 2 === 0;
    ambVillagers.push({
      h: horizontal,
      min: horizontal ? hMin : vMin,
      max: horizontal ? hMax : vMax,
      p: 0, // set below
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: 7 + Math.random() * 9,
      lane: 3 + Math.floor(Math.random() * 9),
      col: VILLAGER_COLORS[i % VILLAGER_COLORS.length],
      seed: Math.random() * 10,
    });
    const v = ambVillagers[i];
    v.p = v.min + Math.random() * (v.max - v.min);
  }

  /* roaming wilderness monsters */
  if (!ambRoamers.length) {
    ambRoamers = ROAMERS.map(([tx, ty, sprite]) => ({
      sprite,
      hx: tx * TILE, hy: ty * TILE,         // home
      x: tx * TILE, y: ty * TILE,
      tx: tx * TILE, ty: ty * TILE,
      speed: 6 + Math.random() * 6,
      pause: Math.random() * 2,
    }));
  }

  /* your units patrol the city: one figure per owned unit type
     (archers/mages get a second one when you have 15+) */
  ambPatrols = [];
  for (const u of UNITS) {
    if (u.id === 'walls') continue;
    const count = state[u.statKey];
    if (!count) continue;
    const figures = (u.id === 'archer' || u.id === 'mage') && count >= 15 ? 2 : 1;
    const patrolCap = Math.min(12 + unitTier * 2, 28);
    for (let f = 0; f < figures && ambPatrols.length < patrolCap; f++) {
      const home = state.districts[Math.floor(Math.random() * state.districts.length)];
      const [hdx, hdy] = home.split(',').map(Number);
      const px2 = (hdx * DISTRICT_W + 4 + Math.random() * (DISTRICT_W - 8)) * TILE;
      const py2 = (hdy * DISTRICT_H + 4 + Math.random() * (DISTRICT_H - 8)) * TILE;
      ambPatrols.push({ sprite: u.portrait, x: px2, y: py2, tx: px2, ty: py2, speed: 9 + Math.random() * 6, pause: Math.random() * 2 });
    }
  }

  /* chimney smoke: first shown smith, tavern and the keep */
  ambSmokes = [];
  for (const id of ['smith', 'tavern', 'keep']) {
    if (!bCount(id)) continue;
    const avail = (PLOTS[id] || []).filter(([x, y]) => plotAvailable(x, y));
    if (!avail.length) continue;
    const [tx, ty] = avail[0];
    ambSmokes.push({ x: tx * TILE + 10, y: ty * TILE - 24 });
  }

  /* night window glows: every built building + every shown cottage */
  ambGlows = [];
  for (const b of BUILDINGS) {
    if (!bCount(b.id) || !plotAvailable(PLOTS[b.id][0][0], PLOTS[b.id][0][1])) continue;
    const [tx, ty] = PLOTS[b.id][0];
    ambGlows.push([tx * TILE + 6, ty * TILE + 2, Math.random() * 10]);
  }
  const hc = Math.floor(totalBuildings() / 4);
  for (const [tx, ty] of houseSlots(state.districts).slice(0, hc)) {
    ambGlows.push([tx * TILE + 6, ty * TILE + 8, Math.random() * 10]);
  }

  /* fireflies: wilderness sparks at night */
  ambFireflies = [];
  let ffTries = 60;
  while (ambFireflies.length < 16 && ffTries-- > 0) {
    const tx = 2 + Math.floor(Math.random() * (MAP_W - 4));
    const ty = 2 + Math.floor(Math.random() * (MAP_H - 4));
    if (isWater(tx, ty) || tileInsideCity(tx, ty)) continue;
    ambFireflies.push([tx * TILE + 8, ty * TILE + 8, Math.random() * 10]);
  }

  /* boats drifting down the river */
  if (!ambBoats.length) {
    ambBoats = [
      { y: Math.random() * MAP_H * TILE, speed: 5 + Math.random() * 3, sail: '#f2ead8' },
      { y: Math.random() * MAP_H * TILE, speed: 4 + Math.random() * 3, sail: '#c43c3c' },
    ];
  }

  /* ambient warm dome over the owned city (keeps town bright at night) */
  {
    let minX2 = MAP_W, maxX2 = 0, minY2 = MAP_H, maxY2 = 0;
    for (const key of state.districts) {
      const [dx, dy] = key.split(',').map(Number);
      minX2 = Math.min(minX2, dx * DISTRICT_W);
      maxX2 = Math.max(maxX2, (dx + 1) * DISTRICT_W);
      minY2 = Math.min(minY2, dy * DISTRICT_H);
      maxY2 = Math.max(maxY2, (dy + 1) * DISTRICT_H);
    }
    cityGlow = {
      x: (minX2 + maxX2) / 2 * TILE,
      y: (minY2 + maxY2) / 2 * TILE,
      r: Math.max(maxX2 - minX2, maxY2 - minY2) * TILE * 0.75,
    };
  }
}

/* monsters never enter owned districts — the walls keep them out */
function tileInsideCity(txi, tyi) {
  const [dx, dy] = districtOf(txi, tyi);
  return isCityDistrict(dx, dy) && state.districts.includes(dKey(dx, dy));
}

function roamerNewTarget(r) {
  for (let tries = 0; tries < 8; tries++) {
    const nx = r.hx + (Math.random() - 0.5) * 12 * TILE;
    const ny = r.hy + (Math.random() - 0.5) * 12 * TILE;
    const txi = Math.floor(nx / TILE), tyi = Math.floor(ny / TILE);
    if (txi < 1 || tyi < 1 || txi >= MAP_W - 1 || tyi >= MAP_H - 1) continue;
    if (isWater(txi, tyi) || tileInsideCity(txi, tyi)) continue;
    r.tx = nx; r.ty = ny;
    return;
  }
}

/* patrols wander INSIDE the walls (owned districts only) */
function patrolNewTarget(p) {
  for (let tries = 0; tries < 8; tries++) {
    const home = state.districts[Math.floor(Math.random() * state.districts.length)];
    const [hdx, hdy] = home.split(',').map(Number);
    const nx = (hdx * DISTRICT_W + 3 + Math.random() * (DISTRICT_W - 6)) * TILE;
    const ny = (hdy * DISTRICT_H + 3 + Math.random() * (DISTRICT_H - 6)) * TILE;
    if (isWater(Math.floor(nx / TILE), Math.floor(ny / TILE))) continue;
    p.tx = nx; p.ty = ny;
    return;
  }
}

function ambientFrame(ts) {
  requestAnimationFrame(ambientFrame);
  if (ts - ambLast < 80) return; // ~12 fps
  const dt = Math.min((ts - ambPrev) / 1000, 0.3);
  ambPrev = ts;
  ambLast = ts;
  if (!ambCtx) return;
  const ctx = ambCtx;
  ctx.clearRect(0, 0, MAP_W * TILE, MAP_H * TILE);

  /* --- water shimmer & flow --- */
  const phase = Math.floor(ts / 200);
  ctx.fillStyle = MapPal.waterLight;
  for (const [tx, ty] of WATER_TILES) {
    const h1 = (tx * 13 + ty * 7) % 11;
    const px = tx * TILE + ((h1 * 3 + phase) % 14);
    const py = ty * TILE + ((tx * 5 + ty * 11 + phase * 2) % 14); // drifts: flow feel
    ctx.fillRect(px, py, 2, 1);
    if ((tx + ty + phase) % 3 === 0) ctx.fillRect(tx * TILE + ((h1 * 7 + phase * 2) % 13), ty * TILE + ((h1 + phase) % 13), 1, 1);
  }

  /* --- villagers --- */
  for (const v of ambVillagers) {
    v.p += v.dir * v.speed * dt;
    if (v.p < v.min) { v.p = v.min; v.dir = 1; }
    if (v.p > v.max) { v.p = v.max; v.dir = -1; }
    const bob = Math.floor(ts / 220 + v.seed) % 2;
    const x = v.h ? v.p : ROAD_X * TILE + v.lane;
    const y = (v.h ? ROAD_Y * TILE + v.lane : v.p) - bob;
    ctx.fillStyle = SKIN;
    ctx.fillRect(x, y - 5, 2, 2);
    ctx.fillStyle = v.col;
    ctx.fillRect(x - 1, y - 3, 4, 3);
    ctx.fillStyle = '#2a2138';
    ctx.fillRect(x - 1 + (bob ? 0 : 2), y, 2, 1);
  }

  /* --- your units on patrol inside the walls --- */
  for (const p of ambPatrols) {
    if (p.pause > 0) {
      p.pause -= dt;
    } else {
      const ddx = p.tx - p.x, ddy = p.ty - p.y;
      const d = Math.hypot(ddx, ddy);
      if (d < 2) {
        p.pause = 1.5 + Math.random() * 3;
        patrolNewTarget(p);
      } else {
        p.x += ddx / d * p.speed * dt;
        p.y += ddy / d * p.speed * dt;
      }
    }
    const hop = p.pause > 0 ? 0 : Math.floor(ts / 200) % 2;
    drawSpriteToCtx(ctx, SPRITES[p.sprite], Math.round(p.x) - 8, Math.round(p.y) - 8 - hop, 1);
  }

  /* --- roaming monsters (cosmetic) --- */
  for (const r of ambRoamers) {
    if (r.pause > 0) {
      r.pause -= dt;
    } else {
      const ddx = r.tx - r.x, ddy = r.ty - r.y;
      const d = Math.hypot(ddx, ddy);
      if (d < 2) {
        r.pause = 1 + Math.random() * 3;
        roamerNewTarget(r);
      } else {
        const nx = r.x + ddx / d * r.speed * dt;
        const ny = r.y + ddy / d * r.speed * dt;
        if (tileInsideCity(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
          roamerNewTarget(r); // bounced off the walls
        } else {
          r.x = nx;
          r.y = ny;
        }
      }
    }
    const hop = r.pause > 0 ? 0 : Math.floor(ts / 180) % 2;
    drawSpriteToCtx(ctx, SPRITES[r.sprite], Math.round(r.x) - 8, Math.round(r.y) - 8 - hop, 1);
  }

  /* --- chimney smoke --- */
  for (let i = 0; i < ambSmokes.length; i++) {
    const s = ambSmokes[i];
    for (let k = 0; k < 3; k++) {
      const ph = ((ts / 1100) + k / 3 + i * 0.37) % 1;
      const y = s.y - ph * 26;
      const x = s.x + Math.round(Math.sin(ph * 6 + i + k) * 2);
      ctx.fillStyle = 'rgba(205,205,215,' + (0.45 * (1 - ph)).toFixed(2) + ')';
      const sz = 2 + Math.floor(ph * 3);
      ctx.fillRect(x, y, sz, sz);
    }
  }

  /* --- boats drifting down the river --- */
  for (const b of ambBoats) {
    b.y += b.speed * dt;
    if (b.y > MAP_H * TILE + 24) b.y = -24;
    const tileY = Math.max(0, Math.min(MAP_H - 1, Math.floor(b.y / TILE)));
    const bx = (riverX(tileY) + 1.5) * TILE + Math.sin(ts / 900 + b.speed) * 2;
    const by = Math.round(b.y);
    ctx.fillStyle = '#6e4720';
    ctx.fillRect(bx - 4, by, 9, 3);
    ctx.fillRect(bx - 3, by + 3, 7, 1);
    ctx.fillStyle = '#4a2f17';
    ctx.fillRect(bx, by - 7, 1, 7);
    ctx.fillStyle = b.sail;
    ctx.fillRect(bx + 1, by - 7, 4, 5);
  }

  /* --- bird flocks --- */
  if (ts > nextFlockAt) {
    nextFlockAt = ts + 18000 + Math.random() * 22000;
    const fromLeft = Math.random() < 0.5;
    const baseY = 20 + Math.random() * (MAP_H * TILE * 0.5);
    const flock = [];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) flock.push([i * -10 * (fromLeft ? 1 : -1), (i % 2) * 6 - 3]);
    ambBirds.push({ x: fromLeft ? -30 : MAP_W * TILE + 30, y: baseY, vx: (fromLeft ? 1 : -1) * (28 + Math.random() * 14), flock });
  }
  for (let i = ambBirds.length - 1; i >= 0; i--) {
    const f = ambBirds[i];
    f.x += f.vx * dt;
    if (f.x < -60 || f.x > MAP_W * TILE + 60) { ambBirds.splice(i, 1); continue; }
    const flap = Math.floor(ts / 160) % 2;
    ctx.fillStyle = '#2a2138';
    for (const [ox, oy] of f.flock) {
      const bx = Math.round(f.x + ox), by = Math.round(f.y + oy);
      ctx.fillRect(bx - 1, by - (flap ? 1 : 0), 2, 1);
      ctx.fillRect(bx + 1, by - (flap ? 0 : 1), 2, 1);
    }
  }

  /* --- night: REAL light — smooth additive radial glows on the
     #lights canvas above the tint. The city stays warm and bright. --- */
  if (lightsCtx) {
    const lctx = lightsCtx;
    lctx.clearRect(0, 0, MAP_W * TILE, MAP_H * TILE);
    if (typeof isNight === 'function' && isNight()) {
      lctx.globalCompositeOperation = 'lighter';

      /* warm ambient dome over the whole city */
      if (cityGlow) {
        lctx.globalAlpha = 0.22;
        lctx.drawImage(glowWarm, cityGlow.x - cityGlow.r, cityGlow.y - cityGlow.r, cityGlow.r * 2, cityGlow.r * 2);
      }

      /* street lamps: pools of light with gentle flicker */
      for (let i = 0; i < LAMP_POINTS.length; i++) {
        const [lx, ly] = LAMP_POINTS[i];
        const flick = 0.85 + 0.15 * Math.sin(ts / 350 + i * 1.7);
        lctx.globalAlpha = 0.55 * flick;
        lctx.drawImage(glowWarm, lx - 26, ly - 26, 52, 52);
        lctx.globalAlpha = 0.9 * flick;
        lctx.drawImage(glowWarm, lx - 8, ly - 8, 16, 16);
      }

      /* windows: cosy hearth light */
      for (const [gx, gy, seed] of ambGlows) {
        const flick = 0.8 + 0.2 * Math.sin(ts / 700 + seed);
        lctx.globalAlpha = 0.4 * flick;
        lctx.drawImage(glowWarm, gx - 14, gy - 14, 30, 30);
        lctx.globalAlpha = 0.85 * flick;
        lctx.drawImage(glowWarm, gx - 4, gy - 4, 10, 10);
      }

      /* fireflies: soft green sparks in the wild */
      for (const [fx, fy, seed] of ambFireflies) {
        const blink = Math.sin(ts / 500 + seed * 3);
        if (blink < 0.2) continue;
        lctx.globalAlpha = blink * 0.8;
        const ox2 = Math.sin(ts / 700 + seed) * 4, oy2 = Math.cos(ts / 900 + seed) * 3;
        lctx.drawImage(glowGreen, fx + ox2 - 5, fy + oy2 - 5, 10, 10);
      }

      lctx.globalAlpha = 1;
      lctx.globalCompositeOperation = 'source-over';
    }
  }
}
