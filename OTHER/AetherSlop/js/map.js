/* ============================================================
   Aetherholm — map.js
   Top-down pixel terrain renderer for the 5x5 district world.
   Draws ground, biome decoration, roads, houses and the city
   wall around the UNION of owned districts onto one canvas.
   Deterministic: seeded RNG keeps the map stable across renders.
   Exposes WATER_TILES / TREE_TILES for the ambient layer.
   ============================================================ */

'use strict';

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MapPal = {
  grass: ['#3a7429', '#3f7d2e', '#45842f'],
  grassDark: '#356a26',
  flower: ['#e8c84a', '#e07b39', '#cfe8ff', '#d04f7e'],
  water: '#2f5fb8', waterLight: '#4f83d8', waterDark: '#24489a',
  sand: '#d8c27a',
  road: '#b3905a', roadDark: '#9a7848', roadLight: '#c7a76b',
  soil: '#7a5a30', wheat: '#e0b53e', wheatDark: '#b98e2c',
  plank: '#8a5a2b', plankDark: '#6e4720',
  rock: '#8d939c', rockDark: '#5d626b',
  trunk: '#6e4720',
  leaf: '#2f6b22', leafDark: '#24541a', leafLight: '#3f8a2c',
  wallWood: '#8a5a2b', wallWoodDark: '#6e4720',
  wallStone: '#8d939c', wallStoneDark: '#5d626b', wallStoneLight: '#a8aeb8',
  towerStone: '#7d838c', towerDark: '#565b63',
  banner: '#d63c3c',
  houseRoof: '#b5443c', houseRoofDark: '#8c2f2a',
  houseWall: '#d8c9a3', houseTimber: '#6e4720',
};

/* shared with the ambient animation layer */
let WATER_TILES = [];
let LAMP_POINTS = [];   // street lamp heads (night glow)

function inField(x, y) {
  return FIELDS.some(f => x >= f.x1 && x <= f.x2 && y >= f.y1 && y <= f.y2);
}

function inHills(x, y) {
  return HILLS.some(h => x >= h.x1 && x <= h.x2 && y >= h.y1 && y <= h.y2);
}

function wallTier(wallLevel) {
  return wallLevel >= 50 ? 4 : wallLevel >= 25 ? 3 : wallLevel >= 10 ? 2 : wallLevel >= 1 ? 1 : 0;
}

/* ---- density satellites: extra structures beside a busy building ---- */
function drawSatellite(ctx, rnd, kind, tx, ty, era) {
  const ox = tx * TILE, oy = ty * TILE;
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  switch (kind) {
    case 'field':
      rect(ox + 1, oy + 2, 14, 12, MapPal.soil);
      for (let r = 3; r < 13; r += 3) rect(ox + 1, oy + r, 14, 1, MapPal.wheat);
      break;
    case 'logs':
      rect(ox + 2, oy + 8, 12, 3, MapPal.plank);
      rect(ox + 2, oy + 11, 12, 3, MapPal.plankDark);
      rect(ox + 5, oy + 5, 7, 3, MapPal.plank);
      rect(ox + 3, oy + 8, 1, 6, '#4a2f17');
      break;
    case 'rocks':
      for (let i = 0; i < 3; i++) {
        const rx = ox + 1 + (rnd() * 8 | 0), ry = oy + 3 + (rnd() * 7 | 0);
        rect(rx, ry, 5, 4, MapPal.rock);
        rect(rx + 1, ry + 3, 4, 2, MapPal.rockDark);
      }
      break;
    case 'crystal':
      rect(ox + 6, oy + 4, 3, 8, '#5fd9ff');
      rect(ox + 7, oy + 2, 1, 2, '#d8f6ff');
      rect(ox + 6, oy + 12, 3, 2, '#2e8fd6');
      rect(ox + 11, oy + 8, 2, 5, '#5fd9ff');
      rect(ox + 3, oy + 9, 2, 4, '#2e8fd6');
      break;
    case 'crates':
      rect(ox + 2, oy + 6, 7, 7, '#8a5a2b');
      rect(ox + 3, oy + 7, 5, 5, '#6e4720');
      rect(ox + 10, oy + 5, 5, 8, '#6e4720');
      rect(ox + 10, oy + 7, 5, 1, '#4a2f17');
      rect(ox + 10, oy + 10, 5, 1, '#4a2f17');
      break;
    case 'garden':
      rect(ox + 1, oy + 3, 13, 10, '#2c5a20');
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = MapPal.flower[(rnd() * 4) | 0];
        ctx.fillRect(ox + 2 + (rnd() * 11 | 0), oy + 4 + (rnd() * 8 | 0), 1, 1);
      }
      break;
    case 'hives':
      rect(ox + 2, oy + 6, 5, 7, '#e0c060');
      rect(ox + 2, oy + 9, 5, 1, '#94783f');
      rect(ox + 9, oy + 5, 5, 8, '#ffd23e');
      rect(ox + 9, oy + 9, 5, 1, '#94783f');
      break;
    case 'banner':
    default:
      rect(ox + 7, oy + 2, 2, 12, '#4a2f17');
      rect(ox + 9, oy + 2, 6, 4, era >= 3 ? '#ffd23e' : MapPal.banner);
      rect(ox + 9, oy + 6, 4, 1, era >= 3 ? '#ffd23e' : MapPal.banner);
      break;
  }
}

/* era-styled cottages: thatch -> stone-footed -> brick two-story -> aether */
function drawHouse(ctx, tx, ty, era) {
  const ox = tx * TILE + 2, oy = ty * TILE + 1;
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  if (era <= 0) {
    rect(ox + 1, oy + 6, 10, 7, MapPal.houseWall);
    rect(ox + 1, oy + 6, 10, 1, MapPal.houseTimber);
    rect(ox + 5, oy + 9, 2, 4, MapPal.houseTimber);
    rect(ox, oy + 4, 12, 2, MapPal.houseRoof);
    rect(ox + 1, oy + 2, 10, 2, MapPal.houseRoof);
    rect(ox + 3, oy, 6, 2, MapPal.houseRoofDark);
  } else if (era === 1) {
    rect(ox + 1, oy + 6, 10, 7, MapPal.houseWall);
    rect(ox + 1, oy + 11, 10, 2, MapPal.rock);          // stone footing
    rect(ox + 3, oy + 8, 2, 2, '#6b78b8');              // window
    rect(ox + 7, oy + 9, 2, 4, MapPal.houseTimber);
    rect(ox, oy + 4, 12, 2, MapPal.houseRoofDark);
    rect(ox + 1, oy + 2, 10, 2, MapPal.houseRoof);
    rect(ox + 3, oy, 6, 2, MapPal.houseRoofDark);
    rect(ox + 9, oy, 2, 4, MapPal.rockDark);            // chimney
  } else if (era === 2) {
    rect(ox + 1, oy + 3, 10, 10, '#b56a52');            // brick, two-story
    rect(ox + 2, oy + 5, 2, 2, '#6b78b8');
    rect(ox + 7, oy + 5, 2, 2, '#6b78b8');
    rect(ox + 2, oy + 9, 2, 2, '#6b78b8');
    rect(ox + 6, oy + 9, 2, 4, '#4a2f17');
    rect(ox, oy + 1, 12, 2, '#5d626b');                 // slate roof
    rect(ox + 2, oy - 1, 8, 2, '#454a52');
    rect(ox + 9, oy - 3, 2, 3, MapPal.rockDark);
  } else {
    rect(ox + 1, oy + 3, 10, 10, '#e8e4f5');            // aether stone
    rect(ox + 1, oy + 3, 10, 1, '#c9c2d8');
    rect(ox + 2, oy + 5, 2, 3, '#5fd9ff');
    rect(ox + 7, oy + 5, 2, 3, '#5fd9ff');
    rect(ox + 5, oy + 9, 2, 4, '#a89fc2');
    rect(ox, oy + 1, 12, 2, '#ffd23e');                 // gold trim roof
    rect(ox + 2, oy - 1, 8, 2, '#c9c2d8');
  }
  rect(ox + 2, oy + 13, 10, 1, 'rgba(0,0,0,0.25)');
}

/* street lamps along the kingsroads inside the walls */
function drawLamps(ctx, ownedKeys, era) {
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const owned = new Set(ownedKeys);
  const lampAt = (tx, ty) => {
    const [dx, dy] = districtOf(tx, ty);
    if (!isCityDistrict(dx, dy) || !owned.has(dKey(dx, dy))) return;
    if (isWater(tx, ty) || isRoad(tx, ty) || ALL_PLOT_TILES.has(tx + ',' + ty)) return;
    const ox = tx * TILE + 7, oy = ty * TILE + 4;
    if (era >= 2) {
      rect(ox, oy + 3, 2, 9, '#3a3e46');                // iron post
      rect(ox - 1, oy, 4, 3, '#ffd76b');                // lamp box
      rect(ox - 1, oy, 4, 1, '#3a3e46');
    } else {
      rect(ox, oy + 4, 2, 8, '#6e4720');                // torch post
      rect(ox - 1, oy + 1, 4, 3, '#ff8c2e');
    }
    LAMP_POINTS.push([ox + 1, oy + 1]);
  };
  for (let x = 2; x < MAP_W; x += 6) { lampAt(x, ROAD_Y - 1); lampAt(x + 3, ROAD_Y + 1); }
  for (let y = 2; y < MAP_H; y += 6) { lampAt(ROAD_X - 1, y); lampAt(ROAD_X + 1, y + 3); }
}

/* ---- walls around the union of owned districts ----
   Runs follow district borders but jog inward in 5-tile blocks
   (an organic, castle-like trace that stays within the district).
   Insets are forced to 0 near run ends (corners) and gates so
   towers and gates stay aligned.
   Returns Map 'x,y' -> {h, v} (orientation flags). */
function wallRuns(ownedKeys) {
  const owned = new Set(ownedKeys);
  const runs = [];
  for (const key of ownedKeys) {
    const [dx, dy] = key.split(',').map(Number);
    const X0 = dx * DISTRICT_W, X1 = X0 + DISTRICT_W - 1;
    const Y0 = dy * DISTRICT_H, Y1 = Y0 + DISTRICT_H - 1;
    if (!owned.has(dKey(dx, dy - 1))) runs.push({ dir: 'h', fixed: Y0, from: X0, to: X1, inward: 1 });
    if (!owned.has(dKey(dx, dy + 1))) runs.push({ dir: 'h', fixed: Y1, from: X0, to: X1, inward: -1 });
    if (!owned.has(dKey(dx - 1, dy))) runs.push({ dir: 'v', fixed: X0, from: Y0, to: Y1, inward: 1 });
    if (!owned.has(dKey(dx + 1, dy))) runs.push({ dir: 'v', fixed: X1, from: Y0, to: Y1, inward: -1 });
  }
  return runs;
}

function wallInset(i, run) {
  if (i - run.from < 2 || run.to - i < 2) return 0;           // corners
  const roadCoord = run.dir === 'h' ? ROAD_X : ROAD_Y;
  if (Math.abs(i - roadCoord) <= 1) return 0;                 // gates
  return Math.floor(i / 5) % 2;                               // 5-tile jogs
}

function buildWallSet(ownedKeys) {
  const walls = new Map();
  const mark = (x, y, o) => {
    const k = x + ',' + y;
    const cur = walls.get(k) || { h: false, v: false };
    cur[o] = true;
    walls.set(k, cur);
  };
  for (const run of wallRuns(ownedKeys)) {
    for (let i = run.from; i <= run.to; i++) {
      const ins = wallInset(i, run);
      const x = run.dir === 'h' ? i : run.fixed + run.inward * ins;
      const y = run.dir === 'h' ? run.fixed + run.inward * ins : i;
      mark(x, y, run.dir);
      if (i < run.to) {
        const insNext = wallInset(i + 1, run);
        if (insNext !== ins) {
          /* connector tile so the jog stays continuous */
          const cx = run.dir === 'h' ? i + 1 : run.fixed + run.inward * ins;
          const cy = run.dir === 'h' ? run.fixed + run.inward * ins : i + 1;
          mark(cx, cy, run.dir);
        }
      }
    }
  }
  return walls;
}

/* deterministic per-district tree generation */
function districtTrees(dx, dy, ownedKeys) {
  const rnd = mulberry32(7919 + dx * 131 + dy * 977);
  const biome = districtBiome(dx, dy);
  const density = { forest: 28, rocky: 12, riverlands: 12, farmland: 8, meadow: 12, city: 5 }[biome] || 8;
  const trees = [];
  const houseSet = new Set(houseSlots([HOME_KEY, ...DISTRICT_ORDER]).map(([x, y]) => x + ',' + y));
  let attempts = density * 4;
  while (trees.length < density && attempts-- > 0) {
    const x = dx * DISTRICT_W + 1 + Math.floor(rnd() * (DISTRICT_W - 2));
    const y = dy * DISTRICT_H + 1 + Math.floor(rnd() * (DISTRICT_H - 2));
    if (isWater(x, y) || isRoad(x, y) || isRoad(x, y + 1)) continue;
    if (inField(x, y) || inHills(x, y)) continue;
    if (ALL_PLOT_TILES.has(x + ',' + y) || houseSet.has(x + ',' + y)) continue;
    if (isCityDistrict(dx, dy)) {
      /* keep district edges clear for walls */
      const ex = x % DISTRICT_W, ey = y % DISTRICT_H;
      if (ex === 0 || ex === DISTRICT_W - 1 || ey === 0 || ey === DISTRICT_H - 1) continue;
    }
    trees.push([x, y]);
  }
  return trees;
}

/* a narrow dirt lane from a building to the nearest kingsroad */
function drawSidePath(ctx, rnd, bx, by) {
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const vertical = Math.abs(by - ROAD_Y) <= Math.abs(bx - ROAD_X);
  const steps = [];
  if (vertical) {
    const dir = by < ROAD_Y ? 1 : -1;
    for (let y = by; y !== ROAD_Y; y += dir) {
      if (isRoad(bx, y)) break;
      steps.push([bx, y, true]);
    }
  } else {
    const dir = bx < ROAD_X ? 1 : -1;
    for (let x = bx; x !== ROAD_X; x += dir) {
      if (isRoad(x, by)) break;
      steps.push([x, by, false]);
    }
  }
  for (const [tx, ty, vert] of steps) {
    const ox = tx * TILE, oy = ty * TILE;
    if (isWater(tx, ty)) continue;
    if (vert) rect(ox + 5, oy, 6, TILE, MapPal.road);
    else rect(ox, oy + 5, TILE, 6, MapPal.road);
    for (let i = 0; i < 3; i++) {
      const sx = ox + (vert ? 5 + (rnd() * 6 | 0) : (rnd() * 16 | 0));
      const sy = oy + (vert ? (rnd() * 16 | 0) : 5 + (rnd() * 6 | 0));
      ctx.fillStyle = rnd() < 0.5 ? MapPal.roadDark : MapPal.roadLight;
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
}

/* main entry: draw everything.
   tier = wall tier, houseCount = cottages shown, ownedKeys = district keys,
   builtIds = building ids that exist (each gets a lane to the kingsroad),
   era = 0..3 — ascension Ages upgrade the kingsroads visually,
   satTiers = {id: 0..5} — density satellites per built building */
function renderTerrain(canvas, tier, houseCount, ownedKeys, builtIds, era, satTiers) {
  era = era || 0;
  satTiers = satTiers || {};
  canvas.width = MAP_W * TILE;
  canvas.height = MAP_H * TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rnd = mulberry32(1337);
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  WATER_TILES = [];
  LAMP_POINTS = [];

  /* --- pass 1: ground tiles --- */
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const ox = tx * TILE, oy = ty * TILE;

      if (isWater(tx, ty)) {
        rect(ox, oy, TILE, TILE, MapPal.water);
        for (let i = 0; i < 3; i++) px(ox + (rnd() * 16 | 0), oy + (rnd() * 16 | 0), MapPal.waterLight);
        if (!isWater(tx, ty + 1)) rect(ox, oy + 14, TILE, 2, MapPal.waterDark);
        WATER_TILES.push([tx, ty]);
        continue;
      }

      rect(ox, oy, TILE, TILE, MapPal.grass[(rnd() * 3) | 0]);
      for (let i = 0; i < 4; i++) px(ox + (rnd() * 16 | 0), oy + (rnd() * 16 | 0), MapPal.grassDark);

      if (inField(tx, ty)) {
        rect(ox, oy, TILE, TILE, MapPal.soil);
        for (let r = 1; r < TILE; r += 4) {
          rect(ox, oy + r, TILE, 2, MapPal.wheat);
          for (let i = 0; i < 3; i++) px(ox + (rnd() * 16 | 0), oy + r + (rnd() * 2 | 0), MapPal.wheatDark);
        }
      } else if (inHills(tx, ty)) {
        rect(ox, oy, TILE, TILE, MapPal.grassDark);
        const n = 1 + (rnd() * 2 | 0);
        for (let i = 0; i < n; i++) {
          const rx = ox + 2 + (rnd() * 9 | 0), ry = oy + 3 + (rnd() * 9 | 0);
          rect(rx, ry, 5, 4, MapPal.rock);
          rect(rx + 1, ry + 3, 4, 2, MapPal.rockDark);
          px(rx + 1, ry, MapPal.wallStoneLight);
        }
      } else if (rnd() < 0.05) {
        const fx = ox + 2 + (rnd() * 12 | 0), fy = oy + 2 + (rnd() * 12 | 0);
        px(fx, fy, MapPal.flower[(rnd() * 4) | 0]);
        px(fx + 1, fy, MapPal.flower[(rnd() * 4) | 0]);
      }

      if (isWater(tx + 1, ty)) for (let i = 0; i < 6; i++) px(ox + 14 + (rnd() * 2 | 0), oy + (rnd() * 16 | 0), MapPal.sand);
      if (isWater(tx - 1, ty)) for (let i = 0; i < 6; i++) px(ox + (rnd() * 2 | 0), oy + (rnd() * 16 | 0), MapPal.sand);
    }
  }

  /* --- pass 2: roads & bridge --- */
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (!isRoad(tx, ty)) continue;
      const ox = tx * TILE, oy = ty * TILE;
      if (isWater(tx, ty)) {
        rect(ox, oy, TILE, TILE, MapPal.plank);
        for (let r = 0; r < TILE; r += 4) rect(ox, oy + r, TILE, 1, MapPal.plankDark);
        rect(ox, oy, TILE, 2, MapPal.plankDark);
        rect(ox, oy + 14, TILE, 2, MapPal.plankDark);
      } else if (era === 0) {
        /* dirt road */
        rect(ox, oy, TILE, TILE, MapPal.road);
        for (let i = 0; i < 5; i++) px(ox + (rnd() * 16 | 0), oy + (rnd() * 16 | 0), MapPal.roadDark);
        for (let i = 0; i < 3; i++) px(ox + (rnd() * 16 | 0), oy + (rnd() * 16 | 0), MapPal.roadLight);
      } else if (era === 1) {
        /* gravelled (Age of Stone) */
        rect(ox, oy, TILE, TILE, '#a89a82');
        for (let i = 0; i < 8; i++) px(ox + (rnd() * 16 | 0), oy + (rnd() * 16 | 0), rnd() < 0.5 ? '#8d8270' : '#c2b6a0');
      } else if (era === 2) {
        /* cobblestone (Age of Iron) */
        rect(ox, oy, TILE, TILE, '#9a9aa2');
        for (let r = 0; r < TILE; r += 4) rect(ox, oy + r, TILE, 1, '#7a7a84');
        for (let ccol = ((tx + ty) % 2) * 4; ccol < TILE; ccol += 8) rect(ox + ccol, oy, 1, TILE, '#7a7a84');
        for (let i = 0; i < 2; i++) px(ox + (rnd() * 16 | 0), oy + (rnd() * 16 | 0), '#b8b8c0');
      } else {
        /* aether-paved (Age of Aether) */
        rect(ox, oy, TILE, TILE, '#c9c2d8');
        for (let r = 0; r < TILE; r += 4) rect(ox, oy + r, TILE, 1, '#a89fc2');
        for (let i = 0; i < 3; i++) px(ox + (rnd() * 16 | 0), oy + (rnd() * 16 | 0), '#5fd9ff');
      }
    }
  }

  /* side lanes: every standing building connects to the kingsroad */
  for (const id of (builtIds || [])) {
    const plot = PLOTS[id] && PLOTS[id][0];
    if (plot) drawSidePath(ctx, rnd, plot[0], plot[1]);
  }

  /* plaza fountain — grows grander with the eras */
  {
    const cx = ((PLAZA.x1 + PLAZA.x2 + 1) / 2) * TILE, cy = ((PLAZA.y1 + PLAZA.y2 + 1) / 2) * TILE;
    if (era >= 2) {
      rect(cx - 7, cy - 7, 14, 14, MapPal.rockDark);
      rect(cx - 6, cy - 6, 12, 12, MapPal.rock);
      rect(cx - 4, cy - 4, 8, 8, era >= 3 ? '#5fd9ff' : MapPal.water);
      rect(cx - 1, cy - 5, 2, 6, MapPal.wallStoneLight);  // statue plinth
      rect(cx - 1, cy - 7, 2, 2, '#ffd23e');              // gilded figure
      px(cx + 2, cy + 1, MapPal.waterLight);
      px(cx - 3, cy - 2, MapPal.waterLight);
    } else {
      rect(cx - 4, cy - 4, 8, 8, MapPal.rockDark);
      rect(cx - 3, cy - 3, 6, 6, MapPal.rock);
      rect(cx - 2, cy - 2, 4, 4, MapPal.water);
      px(cx - 1, cy - 1, MapPal.waterLight);
    }
  }

  /* density satellites: busy buildings sprawl onto nearby tiles */
  const houseShown = new Set(houseSlots(ownedKeys).slice(0, houseCount).map(([x, y]) => x + ',' + y));
  for (const id of (builtIds || [])) {
    const t = satTiers[id] || 0;
    if (t < 1) continue;
    const plot = PLOTS[id] && PLOTS[id][0];
    if (!plot) continue;
    const kind = SAT_KINDS[id] || 'crates';
    let placed = 0;
    for (const [sx, sy] of SAT_OFFSETS) {
      if (placed >= t) break;
      const tx = plot[0] + sx, ty = plot[1] + sy;
      if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) continue;
      if (isWater(tx, ty) || isRoad(tx, ty)) continue;
      if (ALL_PLOT_TILES.has(tx + ',' + ty) || houseShown.has(tx + ',' + ty)) continue;
      drawSatellite(ctx, rnd, kind, tx, ty, era);
      placed++;
    }
  }

  /* street lamps (glow at night via the ambient layer) */
  drawLamps(ctx, ownedKeys, era);

  /* --- pass 3: trees (per-district biomes) --- */
  for (let dy = 0; dy < DISTRICT_GRID; dy++) {
    for (let dx = 0; dx < DISTRICT_GRID; dx++) {
      for (const [tx, ty] of districtTrees(dx, dy, ownedKeys)) {
        const ox = tx * TILE, oy = ty * TILE;
        rect(ox + 7, oy + 10, 3, 5, MapPal.trunk);
        const widths = [4, 8, 12, 14, 14, 12, 8];
        for (let r = 0; r < widths.length; r++) {
          const w = widths[r];
          rect(ox + 8 - w / 2, oy - 2 + r * 2, w, 2, r < 2 ? MapPal.leafLight : r > 4 ? MapPal.leafDark : MapPal.leaf);
        }
        for (let i = 0; i < 4; i++) px(ox + 3 + (rnd() * 10 | 0), oy + (rnd() * 8 | 0), MapPal.leafLight);
      }
    }
  }

  /* --- pass 4: cottages (era-styled, grow with the city) --- */
  const slots = houseSlots(ownedKeys);
  for (let h = 0; h < Math.min(houseCount, slots.length); h++) {
    const [tx, ty] = slots[h];
    drawHouse(ctx, tx, ty, era);
  }

  /* --- pass 5: city walls around the owned union --- */
  if (tier > 0) {
    const walls = buildWallSet(ownedKeys);
    for (const [k, o] of walls) {
      const [tx, ty] = k.split(',').map(Number);
      if (isRoad(tx, ty)) { drawGate(ctx, tx, ty, tier, o.h); continue; }
      if (o.h && o.v) continue; // corner: tower drawn after
      drawWallTile(ctx, rnd, tx, ty, tier);
    }
    for (const [k, o] of walls) {
      if (!(o.h && o.v)) continue;
      const [tx, ty] = k.split(',').map(Number);
      drawTower(ctx, tx, ty, tier);
    }
  }
}

function drawWallTile(ctx, rnd, tx, ty, tier) {
  const ox = tx * TILE, oy = ty * TILE;
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  if (tier === 1) {
    for (let i = 0; i < TILE; i += 2) {
      rect(ox + i, oy + 3, 2, 13, i % 4 === 0 ? MapPal.wallWood : MapPal.wallWoodDark);
      rect(ox + i, oy + 1, 1, 2, i % 4 === 0 ? MapPal.wallWood : MapPal.wallWoodDark);
    }
    rect(ox, oy + 14, TILE, 2, 'rgba(0,0,0,0.3)');
  } else if (tier >= 4) {
    /* royal walls: pale stone with a gold band */
    rect(ox, oy + 2, TILE, 14, '#c9c8d2');
    for (let r = 5; r < 16; r += 4) rect(ox, oy + r, TILE, 1, '#9a99a8');
    rect(ox, oy + 6, TILE, 1, '#ffd23e');
    for (let m = 0; m < TILE; m += 4) rect(ox + m, oy, 2, 3, '#e8e7ef');
    rect(ox, oy + 14, TILE, 2, '#9a99a8');
  } else {
    rect(ox, oy + 2, TILE, 14, MapPal.wallStone);
    for (let r = 5; r < 16; r += 4) rect(ox, oy + r, TILE, 1, MapPal.wallStoneDark);
    for (let ccol = (ty % 2) * 4; ccol < TILE; ccol += 8) rect(ox + ccol, oy + 8, 1, 3, MapPal.wallStoneDark);
    for (let m = 0; m < TILE; m += 4) rect(ox + m, oy, 2, 3, MapPal.wallStoneLight);
    rect(ox, oy + 14, TILE, 2, MapPal.wallStoneDark);
  }
}

function drawTower(ctx, tx, ty, tier) {
  const ox = tx * TILE, oy = ty * TILE;
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const body = tier === 1 ? MapPal.wallWoodDark : tier >= 4 ? '#b8b7c4' : MapPal.towerStone;
  const dark = tier === 1 ? '#4a2f17' : tier >= 4 ? '#86859a' : MapPal.towerDark;
  rect(ox - 1, oy - 3, TILE + 2, TILE + 3, body);
  rect(ox - 1, oy + 11, TILE + 2, 5, dark);
  for (let m = -1; m < TILE + 1; m += 4) rect(ox + m, oy - 5, 2, 3, body);
  rect(ox + 6, oy + 6, 3, 5, dark);
  if (tier >= 3) {
    const flag = tier >= 4 ? '#ffd23e' : MapPal.banner;
    rect(ox + 7, oy - 11, 1, 7, dark);
    rect(ox + 8, oy - 11, 5, 3, flag);
    rect(ox + 8, oy - 8, 3, 1, flag);
  }
}

function drawGate(ctx, tx, ty, tier, horizontalWall) {
  const ox = tx * TILE, oy = ty * TILE;
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const post = tier === 1 ? MapPal.wallWoodDark : MapPal.towerStone;
  if (horizontalWall) {
    /* wall runs east-west, road passes vertically: posts left & right */
    rect(ox - 2, oy + 2, 4, 12, post);
    rect(ox + 14, oy + 2, 4, 12, post);
  } else {
    rect(ox + 2, oy - 2, 12, 4, post);
    rect(ox + 2, oy + 14, 12, 4, post);
  }
}
