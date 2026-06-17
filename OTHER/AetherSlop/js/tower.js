/* ============================================================
   Aetherholm — tower.js
   THE TOWER OF DOOM: a rhythm-aim boss gauntlet.
   A dark tower at the SOUTH end of the kingsroad. Inside, the
   HERO alone faces a boss: hit squares appear on a grid at a
   set BPM in linear sweeps (and occasional triples). Click them
   (mouse or Z/X over the square) as their approach ring closes.
   On-time hits deal more damage; misses wound the hero — he CAN
   die (10 minutes, same as a Rift defeat). Every floor slightly
   raises BPM & approach rate and shrinks the squares.
   Rewards scale with the floor. Floors PERSIST through Ascension —
   the climb is once per save.
   ============================================================ */

'use strict';

/* ---------------- tuning ---------------- */

const TOWER_GATE_TILE = [80, 116];     // far south edge of the Doomgate Ward
const TW_COLS = 6, TW_ROWS = 4;        // note grid
const TW_WIN = { perfect: 0.09, great: 0.18, ok: 0.28 }; // timing windows (s)
const TW_DMG_MULT = { perfect: 4, great: 2, ok: 1 };
const TW_MISS_HP = 0.12;               // a miss costs 12% of the hero's max HP
const TW_TRIPLE_CHANCE = 0.15;         // chance a step becomes a 3-note burst
const TW_NOTES_TO_KILL = 35;           // ~notes of GREAT damage to fell floor-1 boss
const TW_BLESS_RES = ['wood', 'stone', 'mana']; // blessing pool — never gold
const TW_BLESS_STEP = 1.05;            // each beaten floor: +5% production on one random resource

/* per-floor difficulty: each boss is VERY slightly meaner.
   size: big & clustered early; spacing: the note grid SPREADS out
   each floor (more cursor travel), starting at half pitch. */
function towerParams(floorN) {
  const help = Math.min(0.45, (0.003 * bCount('beatfoundry') + 0.012 * bUp('beat_calibration')) * doomWorksMult());
  return {
    bpm: Math.min(220, 88 + 3 * (floorN - 1)),
    approach: Math.max(0.45, 1.5 - 0.026 * (floorN - 1)) * (1 + help * 0.5),
    size: Math.max(36, 116 - 2.4 * (floorN - 1)) * (1 + help),
    spacing: Math.min(1, 0.5 + 0.03 * (floorN - 1)),
  };
}

/* ascension-tree hooks */
function twMissHp() {
  const mercy = Math.min(0.5, (0.002 * bCount('nightmetronome') + 0.02 * bUp('metronome_mercy')) * doomWorksMult());
  return (hasTree('xtow2') ? 0.08 : TW_MISS_HP) * (1 - mercy);
}       // Steel Tempo
function twHitMult(j) {
  const base = j === 'perfect' && hasTree('xtow3') ? 5 : TW_DMG_MULT[j];
  return base * (1 + 0.01 * bUp('doomforge_quench') * doomWorksMult());
} // Resonant Blade

function towerBoss(floorN, clickDmg) {
  const type = BOSS_TYPES[(floorN - 1) % BOSS_TYPES.length];
  return {
    name: type.name + ' — Floor ' + floorN,
    sprite: type.sprite,
    hp: Math.ceil(clickDmg * TW_DMG_MULT.great * (TW_NOTES_TO_KILL + 2 * (floorN - 1))),
  };
}

/* ---------------- state ---------------- */

function towerEnsure(s) {
  if (!s.tower) s.tower = {};
  const t = s.tower;
  if (t.floor === undefined) t.floor = 0;   // floors cleared (kept through ascensions)
  if (t.best === undefined) t.best = 0;
  if (t.wins === undefined) t.wins = 0;
  if (t.losses === undefined) t.losses = 0;
  if (!t.resMult) {
    /* permanent production blessings — one roll per beaten floor, so saves
       from before this feature are blessed retroactively */
    t.resMult = { wood: 1, stone: 1, mana: 1 };
    for (let i = 0; i < t.floor; i++)
      t.resMult[TW_BLESS_RES[Math.floor(Math.random() * TW_BLESS_RES.length)]] *= TW_BLESS_STEP;
  }
  return s;
}

function towerFloorN() { return state.tower.floor + 1; }

/* ---------------- modal plumbing ---------------- */

let twr = null;          // live fight
let towerScreen = 'lobby';

function openTower() {
  towerEnsure(state);
  portalEnsure(state); // hero death is shared with the Rift
  showTowerScreen('lobby');
  $('tower-modal').classList.remove('hidden');
}

function closeTower() {
  if (twr && !twr.over) { towerAbort(); return; }
  twStopFight();
  $('tower-modal').classList.add('hidden');
  if (typeof save === 'function') save();
}

function twStopFight() {
  if (twr && twr.raf) cancelAnimationFrame(twr.raf);
  twr = null;
}

function showTowerScreen(name) {
  towerScreen = name;
  for (const id of ['tower-lobby', 'tower-play', 'tower-result'])
    $(id).classList.toggle('hidden', id !== 'tower-' + name);
  $('tower-title').textContent = 'THE TOWER OF DOOM — FLOOR ' + fmt(towerFloorN()) +
    (state.tower.best > 0 ? '  (BEST: ' + fmt(state.tower.best) + ')' : '');
  if (name === 'lobby') renderTowerLobby();
}

/* ---------------- lobby ---------------- */

function renderTowerLobby() {
  const box = $('tower-lobby');
  box.innerHTML = '';
  const floorN = towerFloorN();
  const par = towerParams(floorN);
  const clickDmg = Math.max(1, C ? C.click : 1);
  const boss = towerBoss(floorN, clickDmg);
  const heroDead = portalUnitDead('hero');
  const heroHp = portalUnitStats('hero').hp;

  const secB = document.createElement('div');
  secB.className = 'pl-section';
  secB.innerHTML = '<div class="pl-head tw-head">THE FLOOR ' + floorN + ' OVERLORD</div>';
  const bossCard = document.createElement('div');
  bossCard.className = 'tw-bosscard';
  bossCard.appendChild(spriteCanvas(boss.sprite, 6));
  const bi = document.createElement('div');
  bi.className = 'tw-bossinfo';
  bi.innerHTML = '<b>' + boss.name + '</b><br>HP ' + fmt(boss.hp) +
    '<br><span class="dim2">Felled by rhythm alone — only the HERO\'s blade (' + fmt(clickDmg) + ' click damage) counts here.</span>';
  bossCard.appendChild(bi);
  secB.appendChild(bossCard);
  const chips = document.createElement('div');
  chips.className = 'pl-pots';
  chips.innerHTML =
    '<div class="pl-pot" title="Squares spawn on this beat — no music, pure rhythm.">♩ TEMPO: <b>' + par.bpm.toFixed(0) + ' BPM</b></div>' +
    '<div class="pl-pot" title="How long the approach ring takes to close. Lower = faster.">◎ APPROACH: <b>' + par.approach.toFixed(2) + 's</b></div>' +
    '<div class="pl-pot" title="Hit square size. Shrinks each floor.">□ SIZE: <b>' + par.size.toFixed(0) + 'px</b></div>' +
    '<div class="pl-pot" title="How far apart the squares sit on the grid. Spreads out each floor.">↔ SPREAD: <b>' + (par.spacing * 100).toFixed(0) + '%</b></div>' +
    '<div class="pl-pot" title="Your hero\'s health. Each miss costs ' + (twMissHp() * 100).toFixed(0) + '% of it.">❤ HERO HP: <b>' + fmt(heroHp) + '</b></div>';
  secB.appendChild(chips);
  box.appendChild(secB);

  const secH = document.createElement('div');
  secH.className = 'pl-section';
  secH.innerHTML = '<div class="pl-head tw-head">HOW TO FIGHT</div>' +
    '<div class="pl-note" style="text-align:left">' +
    'Squares flow in straight lines from the previous square — along a row, a column or a diagonal — ' +
    'sometimes in quick TRIPLES. Click each one (LEFT MOUSE, or hover + <b>Z</b>/<b>X</b>) exactly when its ring closes.<br>' +
    'PERFECT = x' + twHitMult('perfect') + ' damage · GREAT = x' + TW_DMG_MULT.great + ' · OK = x' + TW_DMG_MULT.ok +
    ' · MISS or clicking TOO EARLY = the boss strikes YOU (-' + (twMissHp() * 100).toFixed(0) + '% HP).<br>' +
    'Hit them IN ORDER — clicking a later square just shakes the one you owe first. ' +
    'Combos add up to +50% damage. If the hero falls he is DEAD for 10 minutes — in the city too.</div>';
  box.appendChild(secH);

  const secM = document.createElement('div');
  secM.className = 'pl-section';
  secM.innerHTML = '<div class="pl-head tw-head">TOWER BLESSINGS</div>' +
    '<div class="pl-note" style="text-align:left">Every floor beaten blesses the city: a PERMANENT +' +
    ((TW_BLESS_STEP - 1) * 100).toFixed(0) + '% production multiplier on a random resource other than Gold. ' +
    'Blessings stack and survive Ascension.</div>';
  const bchips = document.createElement('div');
  bchips.className = 'pl-pots';
  bchips.innerHTML = TW_BLESS_RES.map(r =>
    '<div class="pl-pot" title="Permanent ' + RES_META[r].name + ' production multiplier earned from beaten floors.">' +
    '<span style="color:' + RES_META[r].color + '">' + RES_META[r].name.toUpperCase() + '</span> <b>x' +
    state.tower.resMult[r].toFixed(2) + '</b></div>').join('');
  secM.appendChild(bchips);
  box.appendChild(secM);

  const secS = document.createElement('div');
  secS.className = 'pl-section';
  secS.style.textAlign = 'center';
  const start = document.createElement('button');
  start.id = 'tw-start';
  start.textContent = heroDead ? 'THE HERO IS DEAD' : '⚔ CLIMB THE TOWER';
  start.disabled = heroDead;
  start.onclick = towerStartFight;
  secS.appendChild(start);
  if (heroDead) {
    const cd = document.createElement('div');
    cd.className = 'pl-note';
    cd.innerHTML = 'He recovers in <b style="color:var(--hp)">' +
      fmtClock(Math.ceil((portalDeadUntil('hero') - Date.now()) / 1000)) + '</b>.';
    secS.appendChild(cd);
  }
  box.appendChild(secS);
}

/* ---------------- fight setup ---------------- */

function towerStartFight() {
  if (portalUnitDead('hero')) return;
  const floorN = towerFloorN();
  const par = towerParams(floorN);
  const clickDmg = Math.max(1, C ? C.click : 1);
  const boss = towerBoss(floorN, clickDmg);
  const heroHp = portalUnitStats('hero').hp;
  twr = {
    floorN, clickDmg,
    bpm: par.bpm, approach: par.approach, size: par.size, spacing: par.spacing,
    boss: { ...boss, maxHp: boss.hp },
    hero: { hp: heroHp, maxHp: heroHp },
    queue: [], notes: [], seq: 0,
    gen: {
      t: par.approach + 0.9,          // lead-in before the first note
      cell: [Math.floor(Math.random() * TW_COLS), Math.floor(Math.random() * TW_ROWS)],
      dir: null, run: 0,              // current straight-line walk
    },
    combo: 0, maxCombo: 0,
    counts: { perfect: 0, great: 0, ok: 0, miss: 0 },
    mouse: { x: 0, y: 0 },
    over: false, t0: performance.now(), raf: 0,
  };
  buildTowerDom();
  showTowerScreen('play');
  twr.raf = requestAnimationFrame(twLoop);
}

function buildTowerDom() {
  const bh = $('tw-bosshud');
  bh.innerHTML = '';
  bh.appendChild(spriteCanvas(twr.boss.sprite, 4));
  const bw = document.createElement('div');
  bw.className = 'tw-hudcol';
  bw.innerHTML = '<div class="tw-hudname">' + twr.boss.name + '</div>' +
    '<div class="tw-bar tw-bosshp"><div></div><span></span></div>';
  bh.appendChild(bw);

  const hh = $('tw-herohud');
  hh.innerHTML = '';
  hh.appendChild(spriteCanvas('hero', 3));
  const hw = document.createElement('div');
  hw.className = 'tw-hudcol';
  hw.innerHTML = '<div class="tw-hudname">Hero Aldric</div>' +
    '<div class="tw-bar tw-herohp"><div></div><span></span></div>';
  hh.appendChild(hw);
  const stats = document.createElement('div');
  stats.className = 'tw-hudstats';
  stats.innerHTML = '<span id="tw-combo">0x</span><span id="tw-acc">100%</span>';
  hh.appendChild(stats);

  const field = $('tw-field');
  field.innerHTML = '';
  field.onmousemove = ev => { if (twr) { twr.mouse.x = ev.clientX; twr.mouse.y = ev.clientY; } };
}

/* ---------------- pattern generation ---------------- */

/* every note steps from the PREVIOUS one along one of the 8 grid
   axes (0° / 45° / 90°), walking straight runs of 3-6 notes;
   bouncing off a wall changes axis but stays grid-aligned */
const TW_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const TW_CARDINALS = TW_DIRS.slice(0, 4);
const TW_DIAGONALS = TW_DIRS.slice(4);

/* direction priority: keep going straight > turn onto a row/column > diagonal */
function towerPickDir(prev) {
  const r = Math.random();
  if (prev && r < 0.35) return prev.slice();                  // linear continuation
  const pool = Math.random() < 0.78 ? TW_CARDINALS : TW_DIAGONALS;
  return pool[Math.floor(Math.random() * pool.length)].slice();
}

function towerNextCell() {
  const g = twr.gen;
  if (g.run <= 0 || !g.dir) {
    g.dir = towerPickDir(g.dir);
    g.run = 3 + Math.floor(Math.random() * 4);
  }
  let [c, r] = g.cell;
  let [dc, dr] = g.dir;
  if (c + dc < 0 || c + dc >= TW_COLS) dc = -dc;
  if (r + dr < 0 || r + dr >= TW_ROWS) dr = -dr;
  g.dir = [dc, dr];
  g.cell = [c + dc, r + dr];
  g.run--;
  return g.cell.slice();
}

function towerScheduleMore() {
  const beat = 60 / twr.bpm;
  for (let i = 0; i < 8; i++) {
    if (Math.random() < TW_TRIPLE_CHANCE) {
      for (let k = 0; k < 3; k++)
        twr.queue.push({ cell: towerNextCell(), hitT: twr.gen.t + k * beat / 2 });
      twr.gen.t += beat * 2;
      i += 2;
    } else {
      twr.queue.push({ cell: towerNextCell(), hitT: twr.gen.t });
      twr.gen.t += beat;
    }
  }
}

/* ---------------- note lifecycle ---------------- */

/* grid positions, pulled toward the centre by the floor's spread factor */
function twNoteXY(cell) {
  const sp = twr ? twr.spacing : 1;
  return {
    x: 50 + (cell[0] - (TW_COLS - 1) / 2) * (86 / TW_COLS) * sp,
    y: 50 + (cell[1] - (TW_ROWS - 1) / 2) * (84 / TW_ROWS) * sp,
  };
}

function twSpawnNote(n) {
  const el = document.createElement('div');
  el.className = 'tw-note';
  const p = twNoteXY(n.cell);
  el.style.left = p.x + '%';
  el.style.top = p.y + '%';
  /* the element IS the hit square, so cursor tests match what you see */
  el.style.width = el.style.height = twr.size + 'px';
  el.style.zIndex = String(Math.max(3, 5000 - twr.seq++)); // earlier notes stack on top
  const sq = document.createElement('div');
  sq.className = 'tw-sq';
  el.appendChild(sq);
  const ring = document.createElement('div');
  ring.className = 'tw-ring';
  ring.style.width = ring.style.height = (twr.size + 8) + 'px';
  el.appendChild(ring);
  el.onmousedown = ev => { ev.preventDefault(); ev.stopPropagation(); towerHitAttempt(n, twNow()); };
  $('tw-field').appendChild(el);
  n.el = el;
  n.ring = ring;
  n.judged = false;
  twr.notes.push(n);
}

function twNow() { return twr ? (performance.now() - twr.t0) / 1000 : 0; }

function twFloat(n, text, cls) {
  const f = document.createElement('span');
  f.className = 'tw-judge ' + cls;
  f.textContent = text;
  f.style.left = n.el.style.left;
  f.style.top = n.el.style.top;
  $('tw-field').appendChild(f);
  setTimeout(() => f.remove(), 700);
}

function twRemoveNote(n) {
  n.judged = true;
  if (n.el) { n.el.remove(); n.el = null; }
}

/* ---------------- judgment & damage ---------------- */

function towerEarliest() {
  let e = null;
  for (const n of twr.notes) if (!n.judged && (!e || n.hitT < e.hitT)) e = n;
  return e;
}

function twShake(n) {
  if (!n || !n.el) return;
  n.el.classList.remove('shake');
  void n.el.offsetWidth; // restart the animation
  n.el.classList.add('shake');
}

/* a click/keypress lands on note n: enforce order, then judge.
   Wrong order = no harm, but the note you owe first shakes.
   Too early on the RIGHT note = a real miss. */
function towerHitAttempt(n, t) {
  if (!twr || twr.over || n.judged) return;
  const first = towerEarliest();
  if (first && first !== n) { twShake(first); return; }
  if (t - n.hitT < -TW_WIN.ok) { towerMiss(n, true); return; }
  towerJudge(n, t);
}

function towerJudge(n, t) {
  if (!twr || twr.over || n.judged) return;
  const dt = t - n.hitT;
  if (dt < -TW_WIN.ok) return;          // (direct calls only — towerHitAttempt punishes this)
  const adt = Math.abs(dt);
  const j = adt <= TW_WIN.perfect ? 'perfect' : adt <= TW_WIN.great ? 'great' : 'ok';
  twr.counts[j]++;
  twr.combo++;
  if (twr.combo > twr.maxCombo) twr.maxCombo = twr.combo;
  const comboMult = 1 + Math.min(0.5, twr.combo * 0.01);
  const dmg = twr.clickDmg * twHitMult(j) * comboMult;
  twr.boss.hp -= dmg;
  twFloat(n, (j === 'perfect' ? 'PERFECT! ' : j === 'great' ? 'GREAT ' : 'OK ') + '-' + fmt(dmg), j);
  twRemoveNote(n);
  if (twr.boss.hp <= 0 && !twr.over) {
    twr.boss.hp = 0;
    twr.over = true;
    setTimeout(towerWin, 500);
  }
}

function towerMiss(n, early) {
  twr.counts.miss++;
  twr.combo = 0;
  twr.hero.hp -= twr.hero.maxHp * twMissHp();
  twFloat(n, early ? 'TOO EARLY!' : 'MISS', 'miss');
  twRemoveNote(n);
  $('tw-field').classList.add('hurt');
  setTimeout(() => $('tw-field').classList.remove('hurt'), 180);
  if (twr.hero.hp <= 0 && !twr.over) {
    twr.hero.hp = 0;
    twr.over = true;
    setTimeout(() => towerLose(false), 500);
  }
}

/* Z/X: hit whatever square the cursor is over (earliest one) */
function towerKeyHit() {
  if (!twr || twr.over) return;
  const t = twNow();
  let best = null;
  for (const n of twr.notes) {
    if (n.judged || !n.el) continue;
    const r = n.el.getBoundingClientRect();
    if (twr.mouse.x >= r.left && twr.mouse.x <= r.right &&
        twr.mouse.y >= r.top && twr.mouse.y <= r.bottom) {
      if (!best || n.hitT < best.hitT) best = n;
    }
  }
  if (best) towerHitAttempt(best, t);
}

/* ---------------- frame loop ---------------- */

function towerTick(t) {
  if (!twr || twr.over) return;
  if (twr.queue.length < 6) towerScheduleMore();
  /* spawn notes whose approach window has begun */
  while (twr.queue.length && twr.queue[0].hitT - twr.approach <= t) {
    twSpawnNote(twr.queue.shift());
  }
  /* shrink rings; expire stragglers */
  for (const n of twr.notes) {
    if (n.judged) continue;
    if (t > n.hitT + TW_WIN.ok) { towerMiss(n); continue; }
    if (n.ring) {
      const k = 1 + 1.5 * Math.max(0, (n.hitT - t) / twr.approach);
      n.ring.style.transform = 'translate(-50%, -50%) scale(' + k.toFixed(3) + ')';
      n.ring.style.opacity = Math.min(1, 0.35 + 0.65 * (1 - Math.max(0, (n.hitT - t) / twr.approach)));
    }
  }
  if (twr.notes.length > 60) twr.notes = twr.notes.filter(n => !n.judged);
}

function twUpdateHud() {
  if (!twr) return;
  const b = document.querySelector('.tw-bosshp');
  if (b) {
    b.firstChild.style.width = Math.max(0, twr.boss.hp / twr.boss.maxHp * 100).toFixed(1) + '%';
    b.lastChild.textContent = fmt(Math.max(0, twr.boss.hp)) + ' / ' + fmt(twr.boss.maxHp);
  }
  const h = document.querySelector('.tw-herohp');
  if (h) {
    h.firstChild.style.width = Math.max(0, twr.hero.hp / twr.hero.maxHp * 100).toFixed(1) + '%';
    h.lastChild.textContent = fmt(Math.max(0, twr.hero.hp)) + ' / ' + fmt(twr.hero.maxHp);
  }
  const c = twr.counts;
  const hits = c.perfect + c.great + c.ok;
  const acc = hits + c.miss ? (100 * hits / (hits + c.miss)) : 100;
  const ce = $('tw-combo'), ae = $('tw-acc');
  if (ce) ce.textContent = twr.combo + 'x';
  if (ae) ae.textContent = acc.toFixed(0) + '%';
}

function twLoop() {
  if (!twr || twr.over) return;
  towerTick(twNow());
  twUpdateHud();
  if (twr && !twr.over) twr.raf = requestAnimationFrame(twLoop);
}

/* ---------------- win / lose ---------------- */

function towerWin() {
  const floorN = twr ? twr.floorN : towerFloorN();
  const counts = twr ? twr.counts : { perfect: 0, great: 0, ok: 0, miss: 0 };
  const maxCombo = twr ? twr.maxCombo : 0;
  state.tower.floor++;
  state.tower.wins++;
  if (state.tower.floor > state.tower.best) state.tower.best = state.tower.floor;

  const lines = [];
  const towerCityReward = 1 + (0.02 * bCount('bloodtreasury') + 0.05 * bUp('blood_vaults')) * doomWorksMult();
  const plunder = (hasTree('xtow1') ? 2 : 1) * towerCityReward; // Tower Plunder
  const g = Math.pow(ZONE_GOLD_GROWTH, floorN - 1);
  const goldGain = 6 * g * 40 * (C ? C.killMult : 1) * plunder;
  earnGold(goldGain);
  lines.push('<span class="gold">+' + fmt(goldGain) + ' Gold</span>');
  if (C) {
    const wood = Math.max(10, C.prod.wood * 20) * plunder, stone = Math.max(10, C.prod.stone * 20) * plunder;
    state.wood += wood;
    state.stone += stone;
    lines.push('+' + fmt(wood) + ' Wood · +' + fmt(stone) + ' Stone');
  }
  const itemChance = Math.min(0.98, 0.6 * (C ? C.dropMult : 1) *
    (1 + (0.01 * bCount('reliquarypress') + 0.02 * bUp('reliq_imprint'))));
  if (hasTree('xtow3') || Math.random() < itemChance) { // Resonant Blade: guaranteed
    const d = rollDrop();
    invAdd(d.t, d.tier, 1, d.a);
    state.stats.itemsFound++;
    lines.push('<span class="item">' + itemName(d.t, d.tier, d.a) + '</span>');
  }
  /* the floor's blessing: +5% production on a random non-gold resource, forever */
  towerEnsure(state);
  const bless = TW_BLESS_RES[Math.floor(Math.random() * TW_BLESS_RES.length)];
  const blessStep = TW_BLESS_STEP + 0.002 * bUp('doomforge_quench') * doomWorksMult();
  state.tower.resMult[bless] *= blessStep;
  lines.push('<span style="color:' + RES_META[bless].color + '">★ BLESSING: +' +
    ((blessStep - 1) * 100).toFixed(0) + '% ' + RES_META[bless].name +
    ' production, forever (now x' + state.tower.resMult[bless].toFixed(2) + ')</span>');
  lines.push('<span class="dim">' + fmt(counts.perfect) + ' PERFECT · ' + fmt(counts.great) + ' GREAT · ' +
    fmt(counts.ok) + ' OK · ' + fmt(counts.miss) + ' MISS — max combo ' + fmt(maxCombo) + 'x</span>');

  twStopFight();
  showTowerResult(true, lines);
}

function towerLose(fled) {
  state.tower.losses++;
  /* the hero falls — same 10-minute death as a Rift defeat */
  state.portal.deadUntil.hero = Date.now() + PORTAL_DEATH_MS;
  const lines = [
    fled ? 'You fled the Tower...' : 'The boss strikes the final blow...',
    'Hero Aldric is <b style="color:var(--hp)">DEAD for 10:00</b> — no click damage, no aura, no item bonuses until he recovers.',
  ];
  twStopFight();
  showTowerResult(false, lines);
}

function towerAbort() {
  if (!twr || twr.over) return;
  twr.over = true;
  toast('You fled the Tower — the boss counts it as a kill!');
  towerLose(true);
}

function showTowerResult(won, lines) {
  const box = $('tower-result');
  box.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'pr-title ' + (won ? 'win' : 'lose');
  title.textContent = won ? '♪ FLOOR CLEARED ♪' : '✝ THE HERO FALLS ✝';
  box.appendChild(title);
  const body = document.createElement('div');
  body.className = 'pr-lines';
  body.innerHTML = lines.join('<br>');
  box.appendChild(body);
  const btn = document.createElement('button');
  btn.className = 'pr-btn';
  btn.textContent = 'CONTINUE';
  btn.onclick = () => showTowerScreen('lobby');
  box.appendChild(btn);
  showTowerScreen('result');
  if (typeof save === 'function') save();
}

/* ---------------- the gate on the map ---------------- */

function makeTowerGate() {
  if ($('tower-gate')) return;
  const [tx, ty] = TOWER_GATE_TILE;
  const el = document.createElement('div');
  el.id = 'tower-gate';
  el.style.left = ((tx + 0.5) / MAP_W * 100) + '%';
  el.style.top = ((ty + 1) / MAP_H * 100) + '%';
  el.title = 'The Tower of Doom — rhythm boss gauntlet! (Floor ' + fmt(towerFloorN()) + ')';
  el.appendChild(spriteCanvas('tower', 3));
  el.onclick = (ev) => {
    ev.stopPropagation();
    if (mapDragged) return;
    if (typeof modeTileUnlocked === 'function' && !modeTileUnlocked('tower')) return; // claim Doomgate Ward first
    openTower();
  };
  $('map-world').appendChild(el);
  if (typeof refreshModeGates === 'function') refreshModeGates();
}

/* ---------------- init (after game.js & portal.js) ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  towerEnsure(state);
  makeTowerGate();
  $('close-tower').onclick = closeTower;
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'z' && ev.key !== 'x' && ev.key !== 'Z' && ev.key !== 'X') return;
    if ($('tower-modal').classList.contains('hidden') || towerScreen !== 'play') return;
    ev.preventDefault();
    towerKeyHit();
  });
});
