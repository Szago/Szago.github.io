/* ============================================================
   Aetherholm — game.js
   Engine: state, derived stats, combat, economy, items,
   unit & building panels, day/night, map view, prestige, UI.
   ============================================================ */

'use strict';

const SAVE_KEY = 'aetherholm_save_v1';
const TICK_MS = 100;
const TICKS_PER_SEC = 1000 / TICK_MS;

/* ---------------- state ---------------- */

function defaultRunState() {
  return {
    gold: 0, wood: 0, stone: 0, mana: 0,
    runGold: 0,                       // gold earned this run (for unlock reveals)
    buildings: {},                    // id -> count
    sword: 0, archer: 0, mage: 0, magePower: 0, turret: 0, cleric: 0, golem: 0, dragon: 0, walls: 0,
    skills: {},                       // skill id -> true
    unitUp: {},                       // sub-upgrade id -> level
    bUp: {},                          // building upgrade id -> level
    zone: 1, killIdx: 1,              // killIdx: 1..KILLS_PER_ZONE
    monster: null,                    // {sprite,name,hp,maxHp,gold,isBoss}
    cycleSec: 0,                      // day/night clock (resets on ascension: new dawn)
    districts: [HOME_KEY],            // owned city districts (expand the walls!)
  };
}

function defaultEquip() {
  const eq = {};
  for (const u of UNITS) eq[u.id] = new Array(u.slots).fill(null);
  return eq;
}

function defaultStats() {
  return { clicks: 0, crits: 0, bossKills: 0, itemsFound: 0, itemsCombined: 0, playSec: 0, chestsFound: 0 };
}

let state = {
  ...defaultRunState(),
  lifetimeGold: 0,                    // across all runs — drives sigil formula
  highestZone: 1,
  totalKills: 0,
  sigils: 0,                          // unspent
  sigilsEver: 0,                      // total earned (Golden Age scales off this)
  ascensions: 0,
  tree: {},                           // node id -> true
  inv: {},                            // "type:tier" -> count (persists ascension)
  equip: defaultEquip(),              // unit id -> slot array of {t, tier}|null
  stats: defaultStats(),
  buyAmount: 1,
  lastSave: Date.now(),
};

/* fill anything missing after loading an older save */
function ensureShape(s) {
  const run = defaultRunState();
  for (const k in run) if (s[k] === undefined) s[k] = run[k];
  if (!s.inv) s.inv = {};
  if (!s.stats) s.stats = defaultStats();
  const st = defaultStats();
  for (const k in st) if (s.stats[k] === undefined) s.stats[k] = st[k];
  const eq = defaultEquip();
  if (!s.equip) s.equip = eq;
  for (const u of UNITS) {
    if (!Array.isArray(s.equip[u.id])) s.equip[u.id] = eq[u.id];
    /* Satchel Charms from the Rift Portal grant permanent extra slots */
    const slotPlus = (s.portal && s.portal.slotPlus && s.portal.slotPlus[u.id]) || 0;
    while (s.equip[u.id].length < u.slots + Math.min(2, slotPlus)) s.equip[u.id].push(null);
  }
  if (!s.unitUp) s.unitUp = {};
  if (!s.bUp) s.bUp = {};
  if (!s.tree) s.tree = {};
  /* tree rework migration: if any owned node no longer exists,
     wipe the tree and refund ALL sigils (free respec) */
  const validNodes = new Set(PRESTIGE_TREE.map(n => n.id));
  if (Object.keys(s.tree).some(id => !validNodes.has(id))) {
    s.tree = {};
    s.sigils = s.sigilsEver || 0;
    s._respecced = true;
  }
  /* districts must form a valid prefix of DISTRICT_ORDER */
  const count = Array.isArray(s.districts) ? Math.max(1, s.districts.length) : 1;
  s.districts = [HOME_KEY, ...DISTRICT_ORDER.slice(0, count - 1)];
  /* migration: older saves may own buildings whose ward isn't owned yet —
     grant wards (in order) until every owned building has its district */
  let guard = 0;
  while (guard++ < DISTRICT_ORDER.length) {
    const missing = BUILDINGS.some(b => (s.buildings[b.id] || 0) > 0 &&
      BUILDING_DISTRICT[b.id] && !s.districts.includes(BUILDING_DISTRICT[b.id]));
    if (!missing) break;
    const next = DISTRICT_ORDER[s.districts.length - 1];
    if (!next) break;
    s.districts.push(next);
  }
  return s;
}

/* ---------------- helpers ---------------- */

const $ = id => document.getElementById(id);

function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : String(Math.floor(n));
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];
  let i = -1;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + units[i];
}

function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm ' + Math.floor(sec % 60) + 's';
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function hasTree(id) { return !!state.tree[id]; }
function hasSkill(id) { return !!state.skills[id]; }
function bCount(id) { return state.buildings[id] || 0; }
function bUp(id) { return state.bUp[id] || 0; }
function uUp(id) { return state.unitUp[id] || 0; }
function subLvl(sub) { return sub.statKey ? state[sub.statKey] : uUp(sub.id); }
function totalBuildings() { return BUILDINGS.reduce((n, b) => n + bCount(b.id), 0); }

/* ---------------- day / night ---------------- */

function isNight() {
  return (state.cycleSec % CYCLE_SEC) >= DAY_SEC;
}

function cycleRemaining() {
  const phase = state.cycleSec % CYCLE_SEC;
  return isNight() ? CYCLE_SEC - phase : DAY_SEC - phase;
}

/* ---------------- derived stats ---------------- */

/* item values, boosted by the Fortune branch */
function effItemValue(t, tier) {
  let m = 1;
  if (hasTree('for3')) m *= 1.10;   // Collector
  if (hasTree('for8')) m *= 1.25;   // Star Metal
  if (hasTree('for12')) m *= 1.5;   // Artificer God
  return itemValue(t, tier) * m;
}

function affixFactor() {
  return hasTree('for10') ? 0.75 : 0.5;
}

function itemName(t, tier, a) {
  return ITEMS[t].name + ' ' + tierName(tier) + (a ? ' of ' + AFFIX_NAMES[a] : '');
}

/* a unit's items only work if the unit actually exists.
   The Hero is always active — he IS you.
   Units slain in the Rift Portal count as gone until they recover. */
function unitActive(uid) {
  if (typeof portalUnitDead === 'function' && portalUnitDead(uid)) return false;
  if (uid === 'hero') return true;
  const u = UNITS.find(x => x.id === uid);
  return u ? state[u.statKey] > 0 : false;
}

function equipBonus() {
  const E = { click: 0, archer: 0, mage: 0, turret: 0, cleric: 0, golem: 0, dragon: 0, bounty: 0, gold: 0, res: 0, mana: 0, luck: 0, boss: 0 };
  for (const uid in state.equip) {
    if (!unitActive(uid)) continue; // unrecruited units give nothing
    for (const it of state.equip[uid]) {
      if (!it) continue;
      E[ITEMS[it.t].eff] += effItemValue(it.t, it.tier);
      if (it.a && ITEMS[it.a]) E[ITEMS[it.a].eff] += effItemValue(it.a, it.tier) * affixFactor();
    }
  }
  return E;
}

function calc() {
  const c = {};
  const E = equipBonus();
  c.equip = E;
  const decree = bUp('keep_decree');
  const night = isNight();
  c.night = night;

  // HERO LEADERSHIP AURA: items worn by the hero inspire the whole city
  const auraFactor = HERO_AURA_FACTOR * (hasTree('war9') ? 1.5 : 1); // Heroic Saga
  let heroAura = 0;
  if (unitActive('hero')) // a Rift-slain hero inspires nobody
    for (const it of state.equip.hero) if (it) heroAura += effItemValue(it.t, it.tier) * auraFactor;
  c.heroAura = heroAura;
  const auraMult = 1 + heroAura / 100;
  c.enemyHpMult = Math.max(0.6, 1 - heroAura / 200); // enemies spawn weaker, cap -40%

  // bonus applied to every unit's damage (incl. clicks)
  let allUnit = (1 + 0.05 * decree) * (1 + 0.05 * bCount('barracks')) *
    (1 + 0.02 * bUp('barracks_drill')) * (1 + 0.05 * uUp('horn')) *
    (1 + 0.05 * bUp('trade_mercs')) * auraMult;
  allUnit *= 1 + 0.03 * (bCount('armory') + bCount('warcollege'));
  if (hasTree('war6')) allUnit *= 1.25;   // Drill Sergeants
  if (hasTree('war10')) allUnit *= 1.5;   // Aether Weapons

  // SIGIL MASTER MULTIPLIER: final factor on ALL production & bounties
  let sigilPct = 0;
  if (hasTree('pros7')) sigilPct += 0.01;
  if (hasTree('pros9')) sigilPct += 0.01;
  if (hasTree('pros12')) sigilPct += 0.02;
  const sigilMaster = 1 + sigilPct * state.sigilsEver;
  c.sigilMaster = sigilMaster;

  // global gold multiplier (applies to buildings AND kill bounties)
  const zoneBonus = ZONE_INCOME_BONUS * (state.zone - 1);
  let goldMult = (1 + zoneBonus) *
    (1 + 0.02 * bCount('temple') + 0.03 * bCount('cathedral') + 0.01 * bCount('harbor') +
      0.02 * bCount('lighthouse') + 0.05 * bCount('bank') + 0.10 * bCount('wonder'));
  goldMult *= 1 + 0.03 * bUp('temple_favor');
  goldMult *= 1 + 0.04 * bUp('cath_relics');
  goldMult *= 1 + 0.01 * bUp('market_guilds');
  goldMult *= (1 + 0.05 * decree) * (1 + 0.05 * bUp('mint_standard'));
  goldMult *= 1 + DISTRICT_GOLD_BONUS * (state.districts.length - 1);
  goldMult *= 1 + E.gold / 100;
  if (state.spire && state.spire.crowned) goldMult *= 2; // Crown of the Silver Spire — forever
  /* era gates & era prosperity nodes */
  if (hasTree('era2')) goldMult *= 1.25;
  if (hasTree('era3')) goldMult *= 1.5;
  if (hasTree('era4')) goldMult *= 2;
  if (hasTree('pros5')) goldMult *= 1.2;
  if (hasTree('pros8')) goldMult *= 1.4;
  if (hasTree('pros10')) goldMult *= 1.5;
  /* day bonus: Shrines of Dawn + Astral Clock */
  let dayBonus = (DAY_GOLD_BONUS + 0.03 * bCount('shrine')) * (hasTree('mys6') ? 1.5 : 1);
  c.dayBonus = dayBonus;
  if (!night) goldMult *= 1 + dayBonus;
  c.goldMult = goldMult;

  // per-building production multipliers from building upgrades & synergies
  const prodMult = {
    farm: (1 + 0.20 * bUp('farm_quality')) * (1 + 0.05 * bCount('windmill')) * (1 + 0.05 * bUp('windmill_grind')),
    windmill: 1 + 0.20 * bUp('windmill_grind'),
    market: (1 + 0.05 * bUp('farm_quality')) * (1 + 0.20 * bUp('market_guilds')) * (bUp('wharf_trade') ? 1.15 : 1),
    tavern: 1 + 0.20 * bUp('tavern_rest'),
    smith: 1 + 0.20 * bUp('smith_forge'),
    wharf: 1 + 0.20 * bUp('wharf_nets'),
    lumber: 1 + 0.20 * bUp('lumber_saws'),
    quarry: 1 + 0.20 * bUp('quarry_veins'),
    alchemist: 1 + 0.20 * bUp('alch_transmute'),
    manawell: 1 + 0.20 * bUp('manawell_leyline'),
    library: 1 + 0.20 * bUp('lib_archives'),
    magetower: 1 + 0.10 * bUp('magetower_focus'),
    sawmill: 1 + 0.20 * bUp('sawmill_blades'),
    stonecutter: 1 + 0.20 * bUp('stone_chisels'),
    deepmine: 1 + 0.20 * bUp('mine_shafts'),
    timberworks: 1 + 0.20 * bUp('timber_lines'),
    crystalmine: 1 + 0.20 * bUp('crystal_resonance'),
    worldtree: 1 + 0.20 * bUp('tree_blessing'),
  };
  c.prodMult = prodMult;

  const prod = { gold: 0, wood: 0, stone: 0, mana: 0 };
  for (const b of BUILDINGS) {
    const n = bCount(b.id);
    if (!n) continue;
    const m = prodMult[b.id] || 1;
    for (const res in b.prod) prod[res] += b.prod[res] * n * m;
  }
  let manaMult = 1;
  if (hasSkill('arcane')) manaMult *= 1.5;
  if (hasTree('mys1')) manaMult *= 1.5;   // Mana Font
  if (hasTree('mys4')) manaMult *= 1.5;   // Mana Springs
  if (hasTree('mys7')) manaMult *= 2;     // Leyline Network
  if (hasTree('mys9')) manaMult *= 1.25;  // Lunar Covenant
  if (hasTree('mys10')) manaMult *= 2;    // Aether Mind
  manaMult *= 1 + E.mana / 100;
  /* Industry branch: wood & stone separately */
  let woodMult = 1 + E.res / 100;
  let stoneMult = 1 + E.res / 100;
  if (hasTree('ind2')) woodMult *= 1.25;
  if (hasTree('ind3')) stoneMult *= 1.25;
  if (hasTree('ind4')) { woodMult *= 1.5; stoneMult *= 1.5; }
  if (hasTree('ind5')) woodMult *= 1.5;
  if (hasTree('ind6')) stoneMult *= 1.5;
  if (hasTree('ind8')) { woodMult *= 1.5; stoneMult *= 1.5; }
  if (hasTree('ind10')) woodMult *= 2;
  if (hasTree('ind11')) stoneMult *= 2;
  let goldProd = goldMult * (hasTree('pros2') ? 1.25 : 1);
  if (hasTree('pros4')) goldProd *= 1.3;  // Stone Granaries
  let industrial = hasTree('ind7') ? 1.25 : 1;
  if (hasTree('ind12')) industrial *= 1.25;
  /* per-resource global factors (also used by the shop's per-each display).
     sigilMaster is the FINAL multiplier on everything. */
  c.prodFactors = {
    gold: goldProd * auraMult * industrial * sigilMaster,
    wood: woodMult * auraMult * industrial * sigilMaster,
    stone: stoneMult * auraMult * industrial * sigilMaster,
    mana: manaMult * auraMult * industrial * sigilMaster,
  };
  for (const res of RESOURCES) prod[res] *= c.prodFactors[res];
  c.prod = prod;

  // ---- idle DPS per unit ----
  let archerDps = state.archer * 1 * Math.pow(1.15, uUp('longbows')) * (1 + 0.10 * uUp('poison'));
  archerDps *= 1 + 0.02 * state.walls;                 // wall synergy
  archerDps *= 1 + 0.10 * bUp('tavern_tales');
  archerDps *= 1 + 0.05 * bCount('kennels');
  archerDps *= 1 + 0.10 * bUp('kennels_alpha') + 0.10 * bUp('lodge_hunters');
  if (hasSkill('volley')) archerDps *= 2;
  if (hasTree('war4')) archerDps *= 2;                 // Crossbows
  archerDps *= (1 + E.archer / 100) * allUnit;

  let mageDps = state.mage * 2 * Math.pow(1.25, state.magePower);
  mageDps *= 1 + 0.10 * bCount('magetower') + 0.10 * bCount('academy') + 0.03 * bCount('library') + 0.05 * bCount('monastery');
  mageDps *= 1 + 0.05 * bUp('magetower_focus') + 0.05 * bUp('acad_curriculum') + 0.01 * bUp('lib_archives');
  if (hasSkill('fireball')) mageDps *= 2;
  if (hasSkill('chain')) mageDps *= 1.5;
  if (uUp('archmage')) mageDps *= 1.5;
  if (hasTree('war2')) mageDps *= 1.5;                 // Veteran Mages
  if (hasTree('mys5')) mageDps *= 2;                   // Eternal Flame
  if (hasTree('mys8')) mageDps *= 2;                   // Storm Callers
  if (hasTree('mys11')) mageDps *= 2;                  // Archmage Ascendant
  mageDps *= (1 + E.mage / 100) * allUnit;

  let turretDps = state.turret * 6 * (1 + 0.10 * bCount('smith') + 0.10 * bCount('siegeworkshop'));
  turretDps *= 1 + 0.15 * uUp('bolts');
  if (uUp('twin')) turretDps *= 1.5;
  if (bUp('lumber_war')) turretDps *= 1.15;
  turretDps *= 1 + 0.05 * bUp('smith_forge') + 0.10 * bUp('siege_counter');
  if (hasSkill('ironclad')) turretDps *= 1.5;
  if (hasTree('war3')) turretDps *= 1.5;               // Siege Doctrine
  if (hasTree('war7')) turretDps *= 2;                 // Cannons
  turretDps *= (1 + E.turret / 100) * allUnit;

  let clericDps = state.cleric * 60 * Math.pow(1.15, uUp('litanies'));
  if (uUp('consecration')) clericDps *= 1.5;
  clericDps *= 1 + 0.05 * bCount('cathedral');
  clericDps *= 1 + 0.10 * bUp('cath_blessings');
  if (hasSkill('warhymn')) clericDps *= 2;
  if (hasTree('war8')) clericDps *= 2;                 // Holy Crusade
  clericDps *= (1 + E.cleric / 100) * allUnit;

  let golemDps = state.golem * 25 * (1 + 0.10 * bCount('smith') + 0.10 * bCount('siegeworkshop') + 0.10 * bCount('foundry'));
  golemDps *= 1 + 0.15 * uUp('plating');
  if (uUp('molten')) golemDps *= 1.5;
  golemDps *= 1 + 0.10 * bUp('siege_counter') + 0.10 * bUp('foundry_runes');
  if (hasSkill('ironclad')) golemDps *= 1.5;
  golemDps *= (1 + E.golem / 100) * allUnit;

  let dragonDps = state.dragon * 500 * Math.pow(1.15, uUp('dragonfire'));
  if (uUp('bond')) dragonDps *= 1.5;
  dragonDps *= 1 + 0.05 * bCount('academy');
  dragonDps *= 1 + 0.10 * bUp('acad_roosts');
  if (hasSkill('dragonsoul')) dragonDps *= 1.5;
  if (hasTree('war11')) dragonDps *= 2;                // Dragon Lords
  dragonDps *= (1 + E.dragon / 100) * allUnit;

  let wallDps = state.walls * 2;
  wallDps *= 1 + 0.05 * uUp('moat');
  if (bUp('quarry_masonry')) wallDps *= 1.25;
  if (hasTree('war3')) wallDps *= 1.5;
  wallDps *= allUnit;

  /* units slain in the Rift fight for nothing until they recover */
  if (typeof portalUnitDead === 'function') {
    if (portalUnitDead('archer')) archerDps = 0;
    if (portalUnitDead('mage')) mageDps = 0;
    if (portalUnitDead('turret')) turretDps = 0;
    if (portalUnitDead('cleric')) clericDps = 0;
    if (portalUnitDead('golem')) golemDps = 0;
    if (portalUnitDead('dragon')) dragonDps = 0;
    if (portalUnitDead('walls')) wallDps = 0;
  }

  c.archerDps = archerDps;
  c.mageDps = mageDps;
  c.turretDps = turretDps;
  c.clericDps = clericDps;
  c.golemDps = golemDps;
  c.dragonDps = dragonDps;
  c.wallDps = wallDps;
  c.dps = archerDps + mageDps + turretDps + clericDps + golemDps + dragonDps + wallDps;

  // click damage
  let click = (1 + state.sword) * Math.pow(2, Math.floor(state.sword / 25));
  if (hasTree('war1')) click *= 2;                     // Sharp Blades
  if (hasTree('war5')) click *= 2;                     // Steel Plate
  click *= 1 + 0.10 * bUp('tavern_rest');
  click *= 1 + 0.10 * uUp('fury');
  click *= 1 + 0.10 * bUp('armory_master');
  click *= (1 + E.click / 100) * allUnit;
  if (hasSkill('meteor')) click += c.dps * 0.10;
  if (hasTree('war12')) click += c.dps * 0.25;         // Avatar of War
  if (typeof portalUnitDead === 'function' && portalUnitDead('hero')) click = 1; // slain hero: feeble pokes only
  c.click = click;
  c.critChance = Math.min(0.5, 0.02 * uUp('crit'));

  // kill bounty multiplier (on top of monster base gold)
  let killMult = goldMult * (1 + 0.05 * state.walls) * (1 + 0.03 * uUp('banners') + 0.02 * uUp('moat'));
  killMult *= 1 + 0.05 * bCount('mint');
  if (hasSkill('frost')) killMult *= 1.25;
  if (hasSkill('midas')) killMult *= 1.5;
  killMult *= 1 + E.bounty / 100;
  killMult *= sigilMaster;                             // master multiplier
  c.killMult = killMult;

  // item drop chance multiplier
  let dropMult = (1 + E.luck / 100) * auraMult;
  dropMult *= 1 + 0.02 * bCount('observatory');
  if (hasTree('for1')) dropMult *= 1.2;                // Keen Eyes
  if (hasTree('for5')) dropMult *= 1.3;                // Magpie's Instinct
  if (night) {
    let nightMult = hasTree('mys9') ? NIGHT_DROP_MULT * 2 : NIGHT_DROP_MULT;
    if (hasTree('mys6')) nightMult *= 1.5;             // Astral Clock
    dropMult *= nightMult;
  }
  c.dropMult = dropMult;

  return c;
}

let C = null; // recomputed each tick

function unitDpsValue(uid) {
  switch (uid) {
    case 'hero': return C.click;
    case 'archer': return C.archerDps;
    case 'mage': return C.mageDps;
    case 'turret': return C.turretDps;
    case 'cleric': return C.clericDps;
    case 'golem': return C.golemDps;
    case 'dragon': return C.dragonDps;
    default: return C.wallDps;
  }
}

function unitUnlocked(u) {
  return !u.unlock || state.highestZone >= u.unlock.zone;
}

/* ---------------- economy ---------------- */

function costDisc() {
  let disc = hasTree('pros3') ? 0.9 : 1;
  if (hasTree('pros6')) disc *= 0.9;    // Guild Charters
  if (hasTree('pros11')) disc *= 0.85;  // Philosopher Kings
  return disc;
}

function buildingCost(b, owned, amount) {
  const disc = costDisc();
  const total = {};
  for (const res in b.cost) {
    let sum = 0;
    for (let k = 0; k < amount; k++) sum += b.cost[res] * Math.pow(COST_GROWTH, owned + k);
    total[res] = Math.ceil(sum * disc);
  }
  return total;
}

function ceilCost(cost) {
  const out = {};
  for (const res in cost) out[res] = Math.ceil(cost[res]);
  return out;
}

function canAfford(cost) {
  for (const res in cost) if (state[res] < cost[res]) return false;
  return true;
}

function pay(cost) {
  for (const res in cost) state[res] -= cost[res];
}

function earnGold(amount) {
  state.gold += amount;
  state.runGold += amount;
  state.lifetimeGold += amount;
}

/* how many can we afford right now? (incremental, capped at 1000) */
function maxAffordable(b) {
  const owned = bCount(b.id);
  const disc = costDisc();
  const sums = {};
  for (const r in b.cost) sums[r] = 0;
  let n = 0;
  while (n < 1000) {
    let ok = true;
    for (const r in b.cost) {
      if (Math.ceil((sums[r] + b.cost[r] * Math.pow(COST_GROWTH, owned + n)) * disc) > state[r]) { ok = false; break; }
    }
    if (!ok) break;
    for (const r in b.cost) sums[r] += b.cost[r] * Math.pow(COST_GROWTH, owned + n);
    n++;
  }
  return n;
}

/* resolve the buy-amount mode into a concrete count for this building */
function resolveAmount(b) {
  const mode = state.buyAmount;
  if (mode === 'max') return Math.max(1, maxAffordable(b));
  if (mode === 'next10') {
    const rem = bCount(b.id) % 10;
    return rem === 0 ? 10 : 10 - rem;
  }
  return Number(mode) || 1;
}

function buyBuilding(id) {
  if (!districtOwnedFor(id)) return;
  const b = BUILDINGS.find(x => x.id === id);
  const amt = state.buyAmount === 'max' ? maxAffordable(b) : resolveAmount(b);
  if (amt < 1) return;
  const cost = buildingCost(b, bCount(id), amt);
  if (!canAfford(cost)) return;
  pay(cost);
  state.buildings[id] = bCount(id) + amt;
  toast(b.name + ' built! (x' + bCount(id) + ')');
  renderCity();
  refreshShop();
}

function buyBuildingOne(id) {
  if (!districtOwnedFor(id)) return;
  const b = BUILDINGS.find(x => x.id === id);
  const cost = buildingCost(b, bCount(id), 1);
  if (!canAfford(cost)) return;
  pay(cost);
  state.buildings[id] = bCount(id) + 1;
  renderCity();
  invDirty = true; // counts/costs update live — no panel rebuild (no flicker)
}

function buyBuildingUpgrade(bid, upId) {
  const up = (BUILDING_UPGRADES[bid] || []).find(u => u.id === upId);
  const lvl = bUp(upId);
  if (lvl >= up.max) return;
  const cost = ceilCost(up.cost(lvl));
  if (!canAfford(cost)) return;
  pay(cost);
  state.bUp[upId] = lvl + 1;
  toast(up.name + ' Lv.' + state.bUp[upId] + '!');
  if (state.bUp[upId] >= up.max) renderCity(); // maybe earn the golden pennant
  invDirty = true; // live updaters handle the rest — no panel rebuild
}

function buyUnitMain(unitId) {
  const u = UNITS.find(x => x.id === unitId);
  if (!unitUnlocked(u)) return;
  const cost = ceilCost(u.main.cost(state[u.statKey]));
  if (!canAfford(cost)) return;
  pay(cost);
  state[u.statKey]++;
  if (typeof ambientRebuild === 'function') ambientRebuild(); // patrols reflect the army
  invDirty = true;
}

function buyUnitSub(unitId, subId) {
  const u = UNITS.find(x => x.id === unitId);
  const sub = u.subs.find(s => s.id === subId);
  const lvl = subLvl(sub);
  if (lvl >= sub.max) return;
  const cost = ceilCost(sub.cost(lvl));
  if (!canAfford(cost)) return;
  pay(cost);
  if (sub.statKey) state[sub.statKey]++;
  else state.unitUp[sub.id] = lvl + 1;
  invDirty = true;
}

function buySkill(id) {
  const s = SKILLS.find(x => x.id === id);
  if (hasSkill(id)) return;
  const mult = hasTree('mys2') ? 0.5 : 1;
  const cost = { mana: Math.ceil(s.cost.mana * mult) };
  if (!canAfford(cost)) return;
  pay(cost);
  state.skills[id] = true;
  toast('Skill learned: ' + s.name + '!');
  invDirty = true; // skill row flips to LEARNED via its live updater
}

/* ---------------- items & inventory ---------------- */

let invDirty = true;

/* inventory keys: "type:tier" or "type:tier:affix" */
function invKey(t, tier, a) { return t + ':' + tier + (a ? ':' + a : ''); }
function invParse(k) {
  const p = k.split(':');
  return { t: p[0], tier: +p[1], a: p[2] || null };
}
function invCount(t, tier, a) { return state.inv[invKey(t, tier, a)] || 0; }

function invAdd(t, tier, n, a) {
  const k = invKey(t, tier, a);
  state.inv[k] = (state.inv[k] || 0) + n;
  if (state.inv[k] <= 0) delete state.inv[k];
  invDirty = true;
}

function invTotal() {
  return Object.values(state.inv).reduce((a, b) => a + b, 0);
}

/* random drop: Quality Smithing can raise the tier,
   Mystic/Master Forging can roll a random affix */
function rollDrop() {
  const types = Object.keys(ITEMS);
  const t = types[Math.floor(Math.random() * types.length)];
  const upChance = hasTree('for9') ? 0.5 : hasTree('for4') ? 0.25 : 0;
  const tier = Math.random() < upChance ? 2 : 1;
  let a = null;
  const affixChance = hasTree('for10') ? 1 : hasTree('for7') ? 0.5 : 0;
  if (Math.random() < affixChance) {
    const others = types.filter(x => x !== t);
    a = others[Math.floor(Math.random() * others.length)];
  }
  return { t, tier, a };
}

function dropItem(isBoss) {
  const d = rollDrop();
  invAdd(d.t, d.tier, 1, d.a);
  state.stats.itemsFound++;
  toast('LOOT: ' + itemName(d.t, d.tier, d.a) + (isBoss ? ' (boss)' : '') + '!');
  spawnFloater('ITEM!', 'item');
  if (hasTree('for11') && Math.random() < 0.25) {     // Twin Drops
    const d2 = rollDrop();
    invAdd(d2.t, d2.tier, 1, d2.a);
    state.stats.itemsFound++;
    toast('TWIN DROP: ' + itemName(d2.t, d2.tier, d2.a) + '!');
  }
}

function combineItem(t, tier, a) {
  if (invCount(t, tier, a) < 2) return;
  invAdd(t, tier, -2, a);
  invAdd(t, tier + 1, 1, a);
  state.stats.itemsCombined++;
  toast('Forged: ' + itemName(t, tier + 1, a) + '!');
  rebuildDetail();
}

function itemAllowed(t, unitId) {
  const u = ITEMS[t].units;
  return !u || u.includes(unitId);
}

function equipItem(unitId, slot, t, tier, a) {
  if (invCount(t, tier, a) < 1 || !itemAllowed(t, unitId)) return;
  if (state.equip[unitId][slot]) unequipItem(unitId, slot);
  invAdd(t, tier, -1, a);
  state.equip[unitId][slot] = { t, tier, a: a || null };
  picker = null;
  rebuildDetail();
}

function unequipItem(unitId, slot) {
  const it = state.equip[unitId][slot];
  if (!it) return;
  invAdd(it.t, it.tier, 1, it.a);
  state.equip[unitId][slot] = null;
  rebuildDetail();
}

/* ---------------- combat ---------------- */

function spawnMonster() {
  const m = monsterFor(state.zone, state.killIdx);
  if (isNight()) {
    m.hp = Math.ceil(m.hp * NIGHT_HP_MULT);
    m.gold *= NIGHT_BOUNTY_MULT;
    m.night = true;
  }
  if (C && C.enemyHpMult < 1) m.hp = Math.ceil(m.hp * C.enemyHpMult); // hero aura
  state.monster = { ...m, maxHp: m.hp };
  drawSprite($('monster-canvas'), SPRITES[m.sprite], 9);
  $('monster-name').textContent = (m.night ? '☽ ' : '') + m.name;
  $('monster-area').classList.toggle('boss', m.isBoss);
  renderPips();
}

function damageMonster(dmg, fromClick) {
  const m = state.monster;
  if (!m) return;
  m.hp -= dmg;
  if (fromClick) {
    const area = $('monster-area');
    area.classList.remove('hit');
    void area.offsetWidth; // restart animation
    area.classList.add('hit');
  }
  if (m.hp <= 0) killMonster();
}

function killMonster() {
  const m = state.monster;
  let bounty = m.gold * C.killMult;
  if (m.isBoss) bounty *= 1 + (C.equip.boss || 0) / 100;
  earnGold(bounty);
  state.totalKills++;
  if (m.isBoss) state.stats.bossKills++;
  spawnFloater('+' + fmt(bounty) + ' gold', 'gold');

  let base = (m.isBoss ? BOSS_DROP_CHANCE * (hasTree('for6') ? 2 : 1) : DROP_CHANCE) + (bUp('alch_phil') ? 0.005 : 0);
  if (Math.random() < Math.min(0.75, base * C.dropMult)) dropItem(m.isBoss);

  state.killIdx++;
  if (state.killIdx > KILLS_PER_ZONE) {
    state.killIdx = 1;
    state.zone++;
    if (state.zone > state.highestZone) state.highestZone = state.zone;
    toast('Zone ' + state.zone + ' — ' + zoneName(state.zone) + '! City income +2%');
  }
  spawnMonster();
}

function onMonsterClick() {
  state.stats.clicks++;
  let dmg = C.click;
  if (Math.random() < C.critChance) {
    dmg *= 3;
    state.stats.crits++;
    spawnFloater('CRIT -' + fmt(dmg), 'crit');
  } else {
    spawnFloater('-' + fmt(dmg), 'dmg');
  }
  damageMonster(dmg, true);
}

/* ---------------- ascension ---------------- */

function pendingSigils() {
  return Math.max(0, sigilsFromLifetime(state.lifetimeGold) - state.sigilsEver);
}

function ascend() {
  const gain = pendingSigils();
  if (gain < 1) return;
  if (!confirm('ASCEND?\n\nThe city falls to time... but the crown remembers.\n\nYou will gain ' + gain + ' Crown Sigil(s).\nGold, resources, buildings, defenses and their upgrades reset.\nSigils, the Advancement Tree, and your ITEMS are kept forever.')) return;

  state.sigils += gain;
  state.sigilsEver += gain;
  state.ascensions++;

  const keep = {
    lifetimeGold: state.lifetimeGold, highestZone: state.highestZone, totalKills: state.totalKills,
    sigils: state.sigils, sigilsEver: state.sigilsEver, ascensions: state.ascensions,
    tree: state.tree, inv: state.inv, equip: state.equip, stats: state.stats,
    buyAmount: state.buyAmount, lastSave: Date.now(),
    /* Rift Portal: stages, cards and deaths reset — permanent
       upgrades (elixirs, satchel slots) and supplies are kept */
    portal: { ...(state.portal || {}), stage: 0, cards: [], deadUntil: {}, team: [], flaskArmed: false },
    /* Tower of Doom: floors reset, lifetime best kept */
    tower: { ...(state.tower || {}), floor: 0 },
    /* Silver Spire: NOTHING resets — the climb (and the Crown) are forever */
    spire: state.spire,
  };
  state = ensureShape({ ...defaultRunState(), ...keep });
  applyTreeStarts();

  C = calc();
  spawnMonster();
  renderCity();
  maybeTerrain(true);
  buildShop();
  buildUnitCards();
  closeDetail();
  closePrestige();
  invDirty = true;
  toast('Ascension ' + state.ascensions + '! +' + gain + ' Crown Sigils');
  save();
}

function applyTreeStarts() {
  if (hasTree('pros1')) { state.gold += 500; state.wood += 25; state.stone += 25; }
  if (hasTree('ind1')) {
    state.buildings.farm = (state.buildings.farm || 0) + 5;
    state.buildings.lumber = (state.buildings.lumber || 0) + 2;
    state.buildings.quarry = (state.buildings.quarry || 0) + 2;
  }
}

/* start-grant nodes apply IMMEDIATELY when bought (not just next rebirth) */
function applyNodeInstant(id) {
  if (id === 'pros1') {
    state.gold += 500; state.wood += 25; state.stone += 25;
    toast('The Royal Treasury opens: +500 Gold, +25 Wood, +25 Stone!');
  }
  if (id === 'ind1') {
    state.buildings.farm = (state.buildings.farm || 0) + 5;
    state.buildings.lumber = (state.buildings.lumber || 0) + 2;
    state.buildings.quarry = (state.buildings.quarry || 0) + 2;
    toast('Royal Charter: 5 Farms, 2 Lumber Mills and 2 Quarries granted!');
    renderCity();
  }
}

function ownedNodeCount() {
  return Object.keys(state.tree).filter(k => state.tree[k]).length;
}

function eraUnlocked(era) {
  return era === 1 || hasTree('era' + era);
}

function nodeAvailable(node) {
  if (hasTree(node.id)) return false;
  if (node.requires && !hasTree(node.requires)) return false;
  if (node.gate) {
    if (ownedNodeCount() < node.needNodes) return false;
  } else if (!eraUnlocked(node.era)) {
    return false;
  }
  return true;
}

function buyNode(id) {
  const node = PRESTIGE_TREE.find(n => n.id === id);
  if (!nodeAvailable(node)) return;
  if (state.sigils < node.cost) return;
  state.sigils -= node.cost;
  state.tree[id] = true;
  toast('Advancement: ' + node.name + '!');
  applyNodeInstant(id);
  if (node.gate) maybeTerrain(true); // the roads get better!
  renderPrestige();
  save();
}

/* ---------------- save / load / import / export ---------------- */

function save() {
  state.lastSave = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    Object.assign(state, data);
    ensureShape(state);
    offlineProgress();
  } catch (e) {
    console.warn('Save corrupted, starting fresh.', e);
  }
}

function offlineProgress() {
  const elapsed = (Date.now() - (state.lastSave || Date.now())) / 1000;
  if (elapsed < 60) return;
  const secs = Math.min(elapsed, 8 * 3600); // cap 8h
  const c = calc();
  const gains = [];
  for (const res of RESOURCES) {
    const amt = c.prod[res] * secs * 0.5; // offline at 50% rate
    if (amt <= 0) continue;
    if (res === 'gold') earnGold(amt); else state[res] += amt;
    gains.push(fmt(amt) + ' ' + RES_META[res].name);
  }
  if (gains.length) toast('While you were away (' + Math.floor(secs / 60) + 'min): +' + gains.join(', +'));
}

function exportSave() {
  save();
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

function importSave(text) {
  let data;
  try {
    data = JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
  } catch (e) {
    alert('Import failed: that does not look like a valid Aetherholm save.');
    return;
  }
  if (typeof data !== 'object' || data === null || data.zone === undefined || data.buildings === undefined) {
    alert('Import failed: that does not look like a valid Aetherholm save.');
    return;
  }
  if (!confirm('Import this save? Your CURRENT progress will be overwritten.')) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  location.reload();
}

function wipeSave() {
  if (!confirm('Wipe ALL progress (including Ascensions and items)? This cannot be undone.')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  location.reload();
}

/* ---------------- UI: floaters & toasts ---------------- */

function spawnFloater(text, cls) {
  const area = $('monster-area');
  const el = document.createElement('span');
  el.className = 'floater ' + cls;
  el.textContent = text;
  el.style.left = (25 + Math.random() * 45) + '%';
  el.style.top = (25 + Math.random() * 30) + '%';
  area.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function toast(text) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 5000);
}

/* ---------------- UI: cost line ---------------- */

function costHtml(cost) {
  return Object.entries(cost).map(([res, amt]) => {
    const ok = state[res] >= amt;
    return '<span class="cost-res ' + (ok ? 'ok' : 'no') + '" style="--rc:' + RES_META[res].color + '">' +
      fmt(amt) + ' ' + RES_META[res].name + '</span>';
  }).join(' ');
}

/* ============================================================
   MAP VIEW — drag to pan, wheel to zoom
   ============================================================ */

const mapView = { x: 0, y: 0, z: 1, min: 0.3, max: 5 };
let worldW = 0, worldH = 0;
let mapDragged = false; // suppresses plot clicks after a drag

function viewSize() {
  const r = $('city-view').getBoundingClientRect();
  return [r.width, r.height];
}

function applyMapView() {
  const t = 'translate(' + mapView.x + 'px,' + mapView.y + 'px) scale(' + mapView.z + ')';
  $('map-world').style.transform = t;
  $('lights').style.transform = t; // lights canvas tracks the world above the night tint
}

function clampMapView() {
  const [vw, vh] = viewSize();
  const m = 80; // slack so edges can be pulled into view comfortably
  const w = worldW * mapView.z, h = worldH * mapView.z;
  mapView.x = w < vw ? (vw - w) / 2 : Math.min(m, Math.max(vw - w - m, mapView.x));
  mapView.y = h < vh ? (vh - h) / 2 : Math.min(m, Math.max(vh - h - m, mapView.y));
  applyMapView();
}

function centerMapOn(wx, wy) {
  const [vw, vh] = viewSize();
  mapView.x = vw / 2 - wx * mapView.z;
  mapView.y = vh / 2 - wy * mapView.z;
  clampMapView();
}

function zoomMapAt(cx, cy, factor) {
  const z0 = mapView.z;
  const z = Math.min(mapView.max, Math.max(mapView.min, z0 * factor));
  mapView.x = cx - (cx - mapView.x) * (z / z0);
  mapView.y = cy - (cy - mapView.y) * (z / z0);
  mapView.z = z;
  clampMapView();
}

function fitMapView() {
  const [vw, vh] = viewSize();
  mapView.min = Math.min(vw / worldW, vh / worldH) * 0.95; // can zoom out to whole map
  mapView.max = 5;
  /* default: frame the home district (Old Town) plus a margin */
  const coreTiles = (DISTRICT_W + 8) * TILE;
  mapView.z = Math.min(Math.max(vw / coreTiles, mapView.min), mapView.max);
  centerMapOn((2 * DISTRICT_W + DISTRICT_W / 2) * TILE, (2 * DISTRICT_H + DISTRICT_H / 2 + 2) * TILE);
}

function initMapView() {
  worldW = MAP_W * TILE;
  worldH = MAP_H * TILE;
  const w = $('map-world');
  w.style.width = worldW + 'px';
  w.style.height = worldH + 'px';
  fitMapView();

  const view = $('city-view');
  let dragging = false, lastX = 0, lastY = 0, moved = 0;

  view.addEventListener('pointerdown', e => {
    if (e.target.closest('#menu-overlay') || e.target.closest('#map-ui')) return;
    dragging = true;
    mapDragged = false;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    /* NOTE: do NOT capture the pointer here — capturing on pointerdown
       redirects the subsequent click away from plots/districts and
       breaks all map clicks. We capture lazily, once a drag starts. */
  });
  view.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6 && !mapDragged) {
      mapDragged = true;
      try { view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    lastX = e.clientX;
    lastY = e.clientY;
    if (mapDragged) {
      mapView.x += dx;
      mapView.y += dy;
      clampMapView();
    }
  });
  const endDrag = e => { dragging = false; };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);

  view.addEventListener('wheel', e => {
    if (e.target.closest('#menu-overlay')) return;
    e.preventDefault();
    const r = view.getBoundingClientRect();
    zoomMapAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18);
  }, { passive: false });

  $('zoom-in').onclick = () => { const [vw, vh] = viewSize(); zoomMapAt(vw / 2, vh / 2, 1.3); };
  $('zoom-out').onclick = () => { const [vw, vh] = viewSize(); zoomMapAt(vw / 2, vh / 2, 1 / 1.3); };
  $('zoom-fit').onclick = fitMapView;
  window.addEventListener('resize', clampMapView);
}

/* ============================================================
   RIGHT PANEL — tabs (BUILD / BAG) + detail views
   ============================================================ */

let rightTab = 'build';          // 'build' | 'bag'
let currentDetail = null;        // {kind:'unit'|'building', id}
let picker = null;               // {unitId, slot} equip picker open in unit detail
let viewUpdaters = [];           // per-tick updaters for the open detail/bag

function setRightTab(tab) {
  rightTab = tab;
  currentDetail = null;
  picker = null;
  syncRightPanel();
}

let savedListScroll = 0; // shop/bag scroll position, restored on BACK

function openUnit(id) {
  if (!currentDetail) savedListScroll = $('right-body').scrollTop;
  currentDetail = { kind: 'unit', id };
  picker = null;
  syncRightPanel();
  $('right-body').scrollTop = 0;
}

function openBuilding(id) {
  if (!currentDetail) savedListScroll = $('right-body').scrollTop;
  currentDetail = { kind: 'building', id };
  picker = null;
  syncRightPanel();
  $('right-body').scrollTop = 0;
}

function closeDetail() {
  currentDetail = null;
  picker = null;
  syncRightPanel();
  $('right-body').scrollTop = savedListScroll;
}

/* structural rebuild (equip slots, picker, district status...) — keeps scroll.
   Plain number changes don't need this: live updaters handle them. */
function rebuildDetail() {
  invDirty = true;
  const rb = $('right-body');
  const st = rb.scrollTop;
  syncRightPanel();
  rb.scrollTop = st;
}

function syncRightPanel() {
  viewUpdaters = [];
  const showShop = !currentDetail && rightTab === 'build';
  const showBag = !currentDetail && rightTab === 'bag';
  $('view-shop').classList.toggle('hidden', !showShop);
  $('view-bag').classList.toggle('hidden', !showBag);
  $('view-detail').classList.toggle('hidden', !currentDetail);
  $('tab-build').classList.toggle('active', rightTab === 'build' && !currentDetail);
  $('tab-bag').classList.toggle('active', rightTab === 'bag' && !currentDetail);

  if (currentDetail) {
    if (currentDetail.kind === 'unit') buildUnitDetail(currentDetail.id);
    else if (currentDetail.kind === 'district') buildDistrictDetail(currentDetail.id);
    else buildBuildingDetail(currentDetail.id);
    $('right-title').textContent = currentDetail.kind === 'unit' ? 'WAR COUNCIL' : currentDetail.kind === 'district' ? 'LAND OFFICE' : 'ROYAL BUILDER';
  } else if (showBag) {
    renderBag();
    $('right-title').textContent = 'INVENTORY';
  } else {
    $('right-title').textContent = 'ROYAL BUILDER';
  }
}

/* a small helper: row button with live cost/affordability */
function upgradeRow(parent, opts) {
  const row = document.createElement('button');
  row.className = 'buy-row small';
  row.innerHTML =
    '<div class="buy-body">' +
    '<div class="buy-top"><span class="buy-name">' + opts.name + '</span><span class="buy-owned"></span></div>' +
    (opts.info ? '<div class="buy-prod">' + opts.info + '</div>' : '') +
    '<div class="buy-cost"></div></div>';
  row.onclick = opts.onBuy;
  parent.appendChild(row);
  const ownedEl = row.querySelector('.buy-owned');
  const costEl = row.querySelector('.buy-cost');
  const cache = {};
  viewUpdaters.push(() => {
    const lvl = opts.lvlText();
    if (cache.lvl !== lvl) { cache.lvl = lvl; ownedEl.textContent = lvl; }
    const cost = opts.cost();
    if (!cost) {
      const done = opts.doneText || 'MAX';
      if (cache.cost !== done) { cache.cost = done; costEl.textContent = done; }
      if (!row.disabled) row.disabled = true;
      row.classList.add('owned');
      row.classList.remove('afford');
      return;
    }
    const html = costHtml(cost);
    if (cache.cost !== html) { cache.cost = html; costEl.innerHTML = html; }
    const ok = canAfford(cost) && !(opts.disabled && opts.disabled());
    if (row.disabled !== !ok) row.disabled = !ok;
    row.classList.toggle('afford', ok);
  });
  return row;
}

/* ---------------- UNIT DETAIL ---------------- */

function buildUnitDetail(unitId) {
  const u = UNITS.find(x => x.id === unitId);
  const box = $('detail-content');
  box.innerHTML = '';

  // header
  const head = document.createElement('div');
  head.className = 'detail-head';
  const portrait = spriteCanvas(u.portrait, 4);
  portrait.classList.add('detail-portrait');
  head.appendChild(portrait);
  const ht = document.createElement('div');
  ht.innerHTML = '<div class="detail-name">' + u.name + '</div><div class="detail-desc">' + u.desc + '</div>';
  head.appendChild(ht);
  box.appendChild(head);

  // stats block
  const statsEl = document.createElement('div');
  statsEl.className = 'detail-stats';
  box.appendChild(statsEl);
  viewUpdaters.push(() => {
    const lines = [];
    const lvl = state[u.statKey];
    if (u.id === 'hero') {
      lines.push(['Blade level', lvl]);
      lines.push(['Click damage', fmt(C.click)]);
      lines.push(['Crit chance', Math.round(C.critChance * 100) + '% (x3 dmg)']);
      lines.push(['Leadership aura', '+' + C.heroAura.toFixed(1) + '% units, income & drops']);
      lines.push(['Enemy HP', '-' + Math.round((1 - C.enemyHpMult) * 100) + '% on spawn']);
    } else if (u.id === 'archer') {
      lines.push(['Archers', lvl]);
      lines.push(['Archer DPS', fmt(C.archerDps)]);
      lines.push(['Wall synergy', '+' + (state.walls * 2) + '%']);
    } else if (u.id === 'mage') {
      lines.push(['Mages hired', lvl]);
      lines.push(['Training level', state.magePower]);
      lines.push(['Mage DPS', fmt(C.mageDps)]);
    } else if (u.id === 'turret') {
      lines.push(['Ballistae built', lvl]);
      lines.push(['Siege DPS', fmt(C.turretDps)]);
      lines.push(['Blacksmith bonus', '+' + (bCount('smith') * 10) + '%']);
    } else if (u.id === 'cleric') {
      lines.push(['Clerics ordained', lvl]);
      lines.push(['Holy DPS', fmt(C.clericDps)]);
      lines.push(['Cathedral bonus', '+' + (bCount('cathedral') * 5) + '%']);
    } else if (u.id === 'dragon') {
      lines.push(['Riders bonded', lvl]);
      lines.push(['Dragon DPS', fmt(C.dragonDps)]);
      lines.push(['Academy bonus', '+' + (bCount('academy') * 5) + '%']);
    } else if (u.id === 'golem') {
      lines.push(['Golem level', lvl]);
      lines.push(['Golem DPS', fmt(C.golemDps)]);
      lines.push(['Blacksmith bonus', '+' + (bCount('smith') * 10) + '%']);
    } else {
      lines.push(['Wall level', lvl]);
      lines.push(['Wall DPS', fmt(C.wallDps)]);
      lines.push(['Bounty bonus', '+' + Math.round(state.walls * 5 + uUp('banners') * 3 + uUp('moat') * 2) + '%']);
    }
    statsEl.innerHTML = lines.map(l => '<div class="stat-row"><span>' + l[0] + '</span><b>' + l[1] + '</b></div>').join('');
  });

  // main upgrade
  sectionTitle(box, 'UPGRADES');
  upgradeRow(box, {
    name: u.main.name,
    info: unitUnlocked(u) ? u.main.info : 'LOCKED — reach Zone ' + (u.unlock ? u.unlock.zone : 0) + ' to recruit. ' + u.main.info,
    lvlText: () => 'Lv.' + state[u.statKey],
    cost: () => ceilCost(u.main.cost(state[u.statKey])),
    onBuy: () => buyUnitMain(u.id),
    disabled: () => !unitUnlocked(u),
  });

  // sub upgrades
  for (const sub of u.subs) {
    upgradeRow(box, {
      name: sub.name,
      info: sub.info,
      lvlText: () => 'Lv.' + subLvl(sub) + (isFinite(sub.max) ? '/' + sub.max : ''),
      cost: () => subLvl(sub) >= sub.max ? null : ceilCost(sub.cost(subLvl(sub))),
      onBuy: () => buyUnitSub(u.id, sub.id),
    });
  }

  // mage skills
  if (u.skills) {
    sectionTitle(box, 'MAGE SKILLS');
    for (const s of SKILLS) {
      const row = document.createElement('button');
      row.className = 'skill-row';
      row.onclick = () => buySkill(s.id);
      row.innerHTML = '<span class="skill-name">' + s.name + '</span><span class="skill-desc">' + s.desc + '</span><span class="skill-cost"></span>';
      box.appendChild(row);
      const costEl = row.querySelector('.skill-cost');
      viewUpdaters.push(() => {
        if (hasSkill(s.id)) {
          row.disabled = true;
          row.classList.add('owned');
          costEl.textContent = 'LEARNED';
          return;
        }
        const cost = { mana: Math.ceil(s.cost.mana * (hasTree('mys2') ? 0.5 : 1)) };
        costEl.innerHTML = costHtml(cost);
        row.disabled = !canAfford(cost);
        row.classList.toggle('afford', canAfford(cost));
      });
    }
  }

  // equipment
  sectionTitle(box, 'EQUIPMENT');
  if (!unitActive(u.id)) {
    const warn = document.createElement('div');
    warn.className = 'detail-note inactive-warn';
    warn.textContent = 'This unit is not recruited yet — equipped items give NO bonuses until you have at least 1!';
    box.appendChild(warn);
  }
  if (u.id === 'hero') {
    const auraNote = document.createElement('div');
    auraNote.className = 'detail-note';
    auraNote.textContent = 'Items worn by the Hero also inspire the city: each grants ' +
      Math.round(HERO_AURA_FACTOR * 100) + '% of its value as bonus unit damage, resource income and item drop chance — and weakens enemy spawns.';
    box.appendChild(auraNote);
  }
  const slotsEl = document.createElement('div');
  slotsEl.className = 'slot-row';
  box.appendChild(slotsEl);
  state.equip[u.id].forEach((it, i) => {
    const slot = document.createElement('button');
    slot.className = 'slot' + (it ? ' filled' : '');
    if (it) {
      slot.appendChild(spriteCanvas(ITEMS[it.t].icon, 3));
      const tier = document.createElement('span');
      tier.className = 'slot-tier';
      tier.textContent = tierName(it.tier) + (it.a ? '+' : '');
      slot.appendChild(tier);
      slot.title = itemName(it.t, it.tier, it.a) + ' — +' + effItemValue(it.t, it.tier).toFixed(1) + '% ' + ITEMS[it.t].txt +
        (it.a ? ' & +' + (effItemValue(it.a, it.tier) * affixFactor()).toFixed(1) + '% ' + ITEMS[it.a].txt : '') +
        ' (click to unequip)';
      slot.onclick = () => unequipItem(u.id, i);
    } else {
      slot.textContent = '+';
      slot.title = 'Empty slot — click to equip';
      slot.onclick = () => {
        picker = { unitId: u.id, slot: i };
        syncRightPanel();
        const rb = $('right-body');
        rb.scrollTop = rb.scrollHeight; // picker lives at the bottom
      };
    }
    slotsEl.appendChild(slot);
  });

  // equip picker
  if (picker && picker.unitId === u.id) {
    const pick = document.createElement('div');
    pick.className = 'picker';
    pick.innerHTML = '<div class="picker-title">CHOOSE AN ITEM <button class="picker-cancel">cancel</button></div>';
    pick.querySelector('.picker-cancel').onclick = () => { picker = null; syncRightPanel(); };
    const entries = Object.entries(state.inv)
      .map(([k, n]) => Object.assign(invParse(k), { n }))
      .filter(e => e.n > 0 && itemAllowed(e.t, u.id))
      .sort((a, b) => a.t === b.t ? b.tier - a.tier : a.t.localeCompare(b.t));
    if (!entries.length) {
      const none = document.createElement('div');
      none.className = 'picker-empty';
      none.textContent = 'No usable items. Monsters rarely drop them — bosses and night hunts more often!';
      pick.appendChild(none);
    }
    for (const e of entries) {
      const row = document.createElement('button');
      row.className = 'inv-row afford';
      row.appendChild(spriteCanvas(ITEMS[e.t].icon, 3));
      const body = document.createElement('div');
      body.className = 'buy-body';
      body.innerHTML = '<div class="buy-top"><span class="buy-name">' + itemName(e.t, e.tier, e.a) + '</span><span class="buy-owned">x' + e.n + '</span></div>' +
        '<div class="buy-prod">+' + effItemValue(e.t, e.tier).toFixed(1) + '% ' + ITEMS[e.t].txt +
        (e.a ? ' • +' + (effItemValue(e.a, e.tier) * affixFactor()).toFixed(1) + '% ' + ITEMS[e.a].txt : '') + '</div>';
      row.appendChild(body);
      row.onclick = () => equipItem(u.id, picker.slot, e.t, e.tier, e.a);
      pick.appendChild(row);
    }
    box.appendChild(pick);
  }
}

/* ---------------- BUILDING DETAIL ---------------- */

function buildBuildingDetail(bid) {
  const b = BUILDINGS.find(x => x.id === bid);
  const box = $('detail-content');
  box.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'detail-head';
  const icon = spriteCanvas(b.sprite, 4, b.pal);
  icon.classList.add('detail-portrait');
  head.appendChild(icon);
  const ht = document.createElement('div');
  ht.innerHTML = '<div class="detail-name">' + b.name + ' <span class="detail-owned"></span></div><div class="detail-desc">' + b.desc + '</div>';
  head.appendChild(ht);
  box.appendChild(head);
  const ownedEl = head.querySelector('.detail-owned');

  const statsEl = document.createElement('div');
  statsEl.className = 'detail-stats';
  box.appendChild(statsEl);
  viewUpdaters.push(() => {
    ownedEl.textContent = 'x' + bCount(bid);
    const lines = [];
    const m = (C.prodMult && C.prodMult[bid]) || 1;
    for (const res in b.prod) {
      lines.push(['Each produces', '+' + fmt(b.prod[res] * m) + ' ' + RES_META[res].name + '/s']);
      lines.push(['Total', '+' + fmt(b.prod[res] * m * bCount(bid)) + ' ' + RES_META[res].name + '/s']);
    }
    if (b.special) lines.push(['Bonus', b.special]);
    statsEl.innerHTML = lines.map(l => '<div class="stat-row"><span>' + l[0] + '</span><b>' + l[1] + '</b></div>').join('');
  });

  sectionTitle(box, 'CONSTRUCTION');
  upgradeRow(box, {
    name: 'Build ' + b.name,
    info: districtOwnedFor(bid) ? null : 'Requires the ' + DISTRICT_NAMES[BUILDING_DISTRICT[bid]] + ' district.',
    lvlText: () => 'x' + bCount(bid),
    cost: () => buildingCost(b, bCount(bid), 1),
    onBuy: () => buyBuildingOne(bid),
    disabled: () => !districtOwnedFor(bid),
  });

  const ups = BUILDING_UPGRADES[bid] || [];
  if (ups.length) {
    sectionTitle(box, 'INSTITUTE UPGRADES');
    for (const up of ups) {
      upgradeRow(box, {
        name: up.name,
        info: up.info,
        lvlText: () => up.max === 1 ? '' : 'Lv.' + bUp(up.id) + '/' + up.max,
        cost: () => bUp(up.id) >= up.max ? null : ceilCost(up.cost(bUp(up.id))),
        onBuy: () => buyBuildingUpgrade(bid, up.id),
        disabled: () => bCount(bid) < 1,
        doneText: up.max === 1 ? 'BUILT' : 'MAX',
      });
    }
    const note = document.createElement('div');
    note.className = 'detail-note';
    note.textContent = 'Upgrades require at least one ' + b.name + '.';
    box.appendChild(note);
  }
}

function sectionTitle(parent, text) {
  const el = document.createElement('div');
  el.className = 'section-title';
  el.textContent = text;
  parent.appendChild(el);
}

/* ---------------- BAG (inventory) ---------------- */

function unequipAll() {
  let n = 0;
  for (const uid in state.equip) {
    state.equip[uid].forEach((it, i) => {
      if (!it) return;
      invAdd(it.t, it.tier, 1, it.a);
      state.equip[uid][i] = null;
      n++;
    });
  }
  if (n) { toast('Unequipped ' + n + ' item(s).'); rebuildDetail(); }
}

/* cascade-forge everything: 4x T1 -> 2x T2 -> 1x T3 ... */
function forgeAll() {
  let total = 0, changed = true;
  while (changed) {
    changed = false;
    for (const k of Object.keys(state.inv)) {
      const e = invParse(k);
      while (invCount(e.t, e.tier, e.a) >= 2) {
        invAdd(e.t, e.tier, -2, e.a);
        invAdd(e.t, e.tier + 1, 1, e.a);
        total++;
        changed = true;
      }
    }
  }
  if (total) {
    state.stats.itemsCombined += total;
    toast('FORGE ALL: ' + total + ' combination(s) made!');
    rebuildDetail();
  } else {
    toast('Nothing to forge — need 2 identical items.');
  }
}

function renderBag() {
  const rb = $('right-body');
  const keepScroll = rb.scrollTop;
  const list = $('inv-list');
  list.innerHTML = '';

  const actions = document.createElement('div');
  actions.className = 'bag-actions';
  const forgeBtn = document.createElement('button');
  forgeBtn.className = 'menu-btn';
  forgeBtn.textContent = 'FORGE ALL';
  forgeBtn.title = 'Combine every pair of identical items, cascading to higher tiers';
  forgeBtn.onclick = forgeAll;
  const unequipBtn = document.createElement('button');
  unequipBtn.className = 'menu-btn';
  unequipBtn.textContent = 'UNEQUIP ALL';
  unequipBtn.title = 'Return every equipped item to the bag';
  unequipBtn.onclick = unequipAll;
  actions.appendChild(forgeBtn);
  actions.appendChild(unequipBtn);
  list.appendChild(actions);

  const entries = Object.entries(state.inv)
    .map(([k, n]) => Object.assign(invParse(k), { n }))
    .filter(e => e.n > 0)
    .sort((a, b) => a.t === b.t ? b.tier - a.tier : a.t.localeCompare(b.t));

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.innerHTML = 'Your bag is empty.<br><br>Monsters have a ' + (DROP_CHANCE * 100).toFixed(1) +
      '% chance to drop items (' + Math.round(BOSS_DROP_CHANCE * 100) + '% for bosses, doubled at night).<br><br>' +
      'Combine 2 identical items to forge a stronger tier (x' + ITEM_TIER_MULT + ' stats). Equip them from a unit\'s panel.';
    list.appendChild(empty);
    invDirty = false;
    rb.scrollTop = keepScroll;
    return;
  }

  for (const e of entries) {
    const def = ITEMS[e.t];
    const row = document.createElement('div');
    row.className = 'inv-row static clickable';
    const targetUnit = def.units ? def.units[0] : 'hero';
    row.title = 'Open ' + UNITS.find(u => u.id === targetUnit).name + ' to equip this';
    row.onclick = () => openUnit(targetUnit);
    row.appendChild(spriteCanvas(def.icon, 3));
    const body = document.createElement('div');
    body.className = 'buy-body';
    const who = def.units ? def.units.map(uid => UNITS.find(u => u.id === uid).name).join(', ') : 'Anyone';
    body.innerHTML =
      '<div class="buy-top"><span class="buy-name">' + itemName(e.t, e.tier, e.a) + '</span><span class="buy-owned">x' + e.n + '</span></div>' +
      '<div class="buy-prod">+' + effItemValue(e.t, e.tier).toFixed(1) + '% ' + def.txt +
      (e.a ? ' • +' + (effItemValue(e.a, e.tier) * affixFactor()).toFixed(1) + '% ' + ITEMS[e.a].txt : '') +
      ' • Fits: ' + who + '</div>';
    row.appendChild(body);
    const comb = document.createElement('button');
    comb.className = 'combine-btn';
    comb.textContent = 'FORGE 2>1';
    comb.title = 'Combine 2x ' + itemName(e.t, e.tier, e.a) + ' into 1x ' + itemName(e.t, e.tier + 1, e.a) + ' (+25% stats)';
    comb.disabled = e.n < 2;
    comb.onclick = (ev) => { ev.stopPropagation(); combineItem(e.t, e.tier, e.a); };
    row.appendChild(comb);
    list.appendChild(row);
  }
  invDirty = false;
  rb.scrollTop = keepScroll;
}

/* ---------------- UI: shop list ---------------- */

const shopRows = {}; // id -> row elements + caches
let shopFilter = 'all';

function buildShop() {
  const list = $('shop-list');
  list.innerHTML = '';
  for (const b of BUILDINGS) {
    const row = document.createElement('button');
    row.className = 'buy-row tall';
    row.onclick = () => buyBuilding(b.id);

    const icon = spriteCanvas(b.sprite, 3, b.pal);
    icon.classList.add('buy-icon');

    const body = document.createElement('div');
    body.className = 'buy-body';
    body.innerHTML =
      '<div class="buy-top"><span class="buy-name">' + b.name + '</span><span class="buy-owned"></span></div>' +
      '<div class="buy-line buy-each"></div>' +
      '<div class="buy-line buy-total"></div>' +
      '<div class="buy-line buy-shareline"></div>' +
      (b.special ? '<div class="buy-line buy-special">' + b.special + '</div>' : '') +
      '<div class="buy-cost"></div>';

    const info = document.createElement('span');
    info.className = 'row-info';
    info.textContent = 'i';
    info.title = 'Open ' + b.name + ' upgrades & details';
    info.onclick = (ev) => { ev.stopPropagation(); openBuilding(b.id); };

    row.appendChild(icon);
    row.appendChild(body);
    row.appendChild(info);
    list.appendChild(row);

    shopRows[b.id] = {
      row, info,
      nameEl: body.querySelector('.buy-name'),
      ownedEl: body.querySelector('.buy-owned'),
      eachEl: body.querySelector('.buy-each'),
      totalEl: body.querySelector('.buy-total'),
      shareEl: body.querySelector('.buy-shareline'),
      costEl: body.querySelector('.buy-cost'),
      cache: {},
    };
  }
  refreshShop();
}

function buildingRevealed(b) {
  if (b.cost.gold <= 60) return true; // starter buildings always visible
  return bCount(b.id) > 0 || state.runGold >= b.cost.gold * 0.35 || state.gold >= b.cost.gold * 0.35;
}

/* set text/html only when it changed — avoids killing in-flight clicks */
function setText(ui, key, el, txt) {
  if (ui.cache[key] === txt) return;
  ui.cache[key] = txt;
  el.textContent = txt;
}
function setHtml(ui, key, el, html) {
  if (ui.cache[key] === html) return;
  ui.cache[key] = html;
  el.innerHTML = html;
}

function refreshShop() {
  for (const b of BUILDINGS) {
    const ui = shopRows[b.id];
    /* resource filter */
    const matches = shopFilter === 'all' || b.prod[shopFilter] !== undefined;
    ui.row.style.display = matches ? '' : 'none';
    if (!matches) continue;

    if (!buildingRevealed(b)) {
      ui.row.classList.add('locked');
      ui.row.disabled = true;
      ui.info.style.display = 'none';
      setText(ui, 'name', ui.nameEl, '???');
      setText(ui, 'owned', ui.ownedEl, '');
      setText(ui, 'each', ui.eachEl, '? ? ?');
      setText(ui, 'total', ui.totalEl, '');
      setText(ui, 'share', ui.shareEl, '');
      setHtml(ui, 'cost', ui.costEl, 'Earn more gold to reveal');
      continue;
    }
    setText(ui, 'name', ui.nameEl, b.name);
    ui.row.classList.remove('locked');
    ui.info.style.display = '';
    const owned = bCount(b.id);
    const amt = resolveAmount(b);
    const cost = buildingCost(b, owned, amt);
    const districtOk = districtOwnedFor(b.id);
    const afford = canAfford(cost) && districtOk && !(state.buyAmount === 'max' && maxAffordable(b) < 1);
    if (ui.row.disabled !== !afford) ui.row.disabled = !afford;
    ui.row.classList.toggle('afford', afford);
    setText(ui, 'owned', ui.ownedEl, owned > 0 ? 'x' + owned : '');

    const eachTxt = Object.entries(b.prod).map(([res, a]) => {
      const each = a * ((C.prodMult && C.prodMult[b.id]) || 1) * ((C.prodFactors && C.prodFactors[res]) || 1);
      return '+' + fmt(each) + ' ' + RES_META[res].name + '/s';
    }).join(' • ');
    setText(ui, 'each', ui.eachEl, 'Each: ' + eachTxt);

    const totalTxt = owned > 0 ? Object.entries(b.prod).map(([res, a]) => {
      const each = a * ((C.prodMult && C.prodMult[b.id]) || 1) * ((C.prodFactors && C.prodFactors[res]) || 1);
      return '+' + fmt(each * owned) + ' ' + RES_META[res].name + '/s';
    }).join(' • ') : '—';
    setText(ui, 'total', ui.totalEl, 'Total: ' + totalTxt);

    const shareTxt = owned > 0 ? Object.entries(b.prod).map(([res, a]) => {
      const each = a * ((C.prodMult && C.prodMult[b.id]) || 1) * ((C.prodFactors && C.prodFactors[res]) || 1);
      const share = C.prod[res] > 0 ? (each * owned / C.prod[res] * 100) : 0;
      return share.toFixed(1) + '% of ' + RES_META[res].name + ' production';
    }).join(' • ') : '';
    setText(ui, 'share', ui.shareEl, shareTxt);

    setHtml(ui, 'cost', ui.costEl, 'Buy x' + amt + ': ' + costHtml(cost) +
      (districtOk ? '' : ' <span class="lock-note">needs ' + DISTRICT_NAMES[BUILDING_DISTRICT[b.id]] + '</span>'));
  }
}

/* ---------------- UI: unit cards (left panel) ---------------- */

const unitCards = {};

function buildUnitCards() {
  const list = $('unit-cards');
  list.innerHTML = '';
  for (const u of UNITS) {
    const card = document.createElement('div');
    card.className = 'unit-card';
    card.onclick = () => openUnit(u.id);
    card.title = 'Open ' + u.name + ' details';

    const icon = spriteCanvas(u.portrait, 2);
    icon.classList.add('uc-portrait');
    card.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'uc-body';
    body.innerHTML = '<div class="uc-top"><span class="uc-name">' + u.name + '</span><span class="uc-lvl"></span></div>' +
      '<div class="uc-dps"></div><div class="uc-share"></div>';
    card.appendChild(body);

    const plus = document.createElement('span');
    plus.className = 'uc-plus';
    plus.textContent = '+';
    plus.title = u.main.verb + ' (' + u.main.name + ')';
    plus.onclick = (ev) => { ev.stopPropagation(); buyUnitMain(u.id); };
    card.appendChild(plus);

    list.appendChild(card);
    unitCards[u.id] = {
      card, plus,
      lvlEl: body.querySelector('.uc-lvl'),
      dpsEl: body.querySelector('.uc-dps'),
      shareEl: body.querySelector('.uc-share'),
      cache: {},
    };
  }
}

function refreshUnitCards() {
  for (const u of UNITS) {
    const ui = unitCards[u.id];
    const count = state[u.statKey];
    if (!unitUnlocked(u)) {
      ui.card.classList.add('locked-unit');
      setText(ui, 'lvl', ui.lvlEl, 'LOCKED');
      setText(ui, 'dps', ui.dpsEl, 'Unlocks at Zone ' + u.unlock.zone + ' (best: ' + state.highestZone + ')');
      setText(ui, 'share', ui.shareEl, '');
      ui.plus.style.display = 'none';
      continue;
    }
    ui.card.classList.remove('locked-unit');
    ui.plus.style.display = '';
    setText(ui, 'lvl', ui.lvlEl, u.lvlLabel + ' ' + count);
    const total = unitDpsValue(u.id);
    let eachTxt = u.dpsLabel + ': ' + fmt(total);
    if (u.id !== 'hero' && count > 0) eachTxt += ' (' + fmt(total / count) + ' each)';
    setText(ui, 'dps', ui.dpsEl, eachTxt);
    const share = (u.id !== 'hero' && C.dps > 0) ? (total / C.dps * 100).toFixed(1) + '% of idle DPS' : '';
    setText(ui, 'share', ui.shareEl, share);
    const afford = canAfford(ceilCost(u.main.cost(count)));
    ui.plus.classList.toggle('afford', afford);
  }
}

/* ---------------- districts (city expansion) ---------------- */

function ownsDistrict(key) { return state.districts.includes(key); }

function plotAvailable(tx, ty) {
  const [dx, dy] = districtOf(tx, ty);
  if (!isCityDistrict(dx, dy)) return true; // wilderness outposts always available
  return ownsDistrict(dKey(dx, dy));
}

/* districts unlock in a FIXED order (DISTRICT_ORDER) */
function nextDistrictKey() {
  return DISTRICT_ORDER[state.districts.length - 1] || null;
}

function nextDistrictCost() {
  const c = districtCost(state.districts.length - 1);
  if (hasTree('ind9')) for (const r in c) c[r] = Math.ceil(c[r] * 0.75); // Land Surveys
  return c;
}

function districtOwnedFor(buildingId) {
  const key = BUILDING_DISTRICT[buildingId];
  return !key || ownsDistrict(key);
}

function buyDistrict(key) {
  if (ownsDistrict(key)) return;
  if (key !== nextDistrictKey()) return;
  if (state.walls < DISTRICT_WALL_REQ) return;
  const cost = nextDistrictCost();
  if (!canAfford(cost)) return;
  pay(cost);
  state.districts.push(key);
  toast('LAND DEED: ' + DISTRICT_NAMES[key] + ' joins Aetherholm! (+' + Math.round(DISTRICT_GOLD_BONUS * 100) + '% all gold)');
  maybeTerrain(true);
  renderCity();
  refreshShop();
  rebuildDetail();
  save();
}

function openDistrict(key) {
  if (!currentDetail) savedListScroll = $('right-body').scrollTop;
  currentDetail = { kind: 'district', id: key };
  picker = null;
  syncRightPanel();
  $('right-body').scrollTop = 0;
}

function buildDistrictDetail(key) {
  const box = $('detail-content');
  box.innerHTML = '';
  const [dx, dy] = key.split(',').map(Number);
  const owned = ownsDistrict(key);

  const head = document.createElement('div');
  head.className = 'detail-head';
  const icon = spriteCanvas('keep', 4);
  icon.classList.add('detail-portrait');
  head.appendChild(icon);
  const ht = document.createElement('div');
  ht.innerHTML = '<div class="detail-name">' + DISTRICT_NAMES[key] + '</div>' +
    '<div class="detail-desc">' + (owned
      ? 'Part of Aetherholm. The walls embrace it; its plots are open for construction.'
      : 'Untamed land beside the city. Buy the deed and the walls will be extended to enclose it.') + '</div>';
  head.appendChild(ht);
  box.appendChild(head);

  const statsEl = document.createElement('div');
  statsEl.className = 'detail-stats';
  box.appendChild(statsEl);
  const builds = (DISTRICT_BUILDS[key] || []).map(id => BUILDINGS.find(b => b.id === id).name);
  viewUpdaters.push(() => {
    const next = nextDistrictKey();
    const lines = [
      ['Status', owned ? 'OWNED' : key === next ? 'FOR SALE (next in line)' : 'Locked — buy ' + DISTRICT_NAMES[next] + ' first'],
      ['District bonus', '+' + Math.round(DISTRICT_GOLD_BONUS * 100) + '% ALL gold each'],
      ['Districts owned', state.districts.length + ' / 9'],
      ['Wall requirement', 'Wall Lv.' + DISTRICT_WALL_REQ + ' (now ' + state.walls + ')'],
      ['Unlocks buildings', builds.length ? String(builds.length) : 'none (royal gardens)'],
    ];
    statsEl.innerHTML = lines.map(l => '<div class="stat-row"><span>' + l[0] + '</span><b>' + l[1] + '</b></div>').join('');
  });

  const note = document.createElement('div');
  note.className = 'detail-note';
  note.textContent = builds.length
    ? 'Unlocks: ' + builds.join(', ') + ' — plus room for more cottages.'
    : 'No new buildings here — but more cottages, parkland, and the district gold bonus.';
  box.appendChild(note);

  sectionTitle(box, 'LAND DEED');
  upgradeRow(box, {
    name: 'Buy ' + DISTRICT_NAMES[key],
    info: 'Extends the city walls around the new ward.',
    lvlText: () => '',
    cost: () => owned ? null : nextDistrictCost(),
    onBuy: () => buyDistrict(key),
    disabled: () => key !== nextDistrictKey() || state.walls < DISTRICT_WALL_REQ,
    doneText: 'OWNED',
  });
}

function renderDistrictOverlays() {
  const box = $('districts');
  box.innerHTML = '';
  const next = nextDistrictKey();
  for (let dy = 1; dy <= 3; dy++) {
    for (let dx = 1; dx <= 3; dx++) {
      const key = dKey(dx, dy);
      if (ownsDistrict(key)) continue;
      const el = document.createElement('div');
      const buyable = key === next;
      el.className = 'district-ov' + (buyable ? ' buyable' : '');
      el.style.left = (dx * DISTRICT_W / MAP_W * 100) + '%';
      el.style.top = (dy * DISTRICT_H / MAP_H * 100) + '%';
      el.style.width = (DISTRICT_W / MAP_W * 100) + '%';
      el.style.height = (DISTRICT_H / MAP_H * 100) + '%';
      let sub;
      if (buyable) {
        const cost = nextDistrictCost();
        sub = 'FOR SALE<br>' + fmt(cost.gold) + ' Gold<br>' + fmt(cost.wood) + ' Wood + ' + fmt(cost.stone) + ' Stone';
        el.title = DISTRICT_NAMES[key] + ' — click to open the Land Office';
      } else {
        const idx = DISTRICT_ORDER.indexOf(key);
        sub = 'LOCKED<br>after ' + DISTRICT_NAMES[DISTRICT_ORDER[idx - 1]];
        el.title = DISTRICT_NAMES[key] + ' — wards unlock in order';
      }
      const builds = (DISTRICT_BUILDS[key] || []).map(id => BUILDINGS.find(b => b.id === id).name).join(', ');
      el.innerHTML = '<span class="district-label">' + DISTRICT_NAMES[key] + '<br>' + sub +
        (builds ? '<br><span class="district-builds">' + builds + '</span>' : '') + '</span>';
      el.onclick = () => { if (!mapDragged) openDistrict(key); };
      box.appendChild(el);
    }
  }
}

/* ---------------- UI: city map (middle) ---------------- */

let terrainKey = '';

function eraLevel() {
  return hasTree('era4') ? 3 : hasTree('era3') ? 2 : hasTree('era2') ? 1 : 0;
}

function maybeTerrain(force) {
  const tier = wallTier(state.walls);
  const houses = Math.floor(totalBuildings() / 4);
  const builtIds = BUILDINGS.filter(b => bCount(b.id) > 0 && districtOwnedFor(b.id)).map(b => b.id);
  const era = eraLevel();
  const satTiers = {};
  for (const id of builtIds) satTiers[id] = satTierFor(bCount(id));
  const key = tier + '|' + houses + '|' + state.districts.join(';') + '|' +
    builtIds.map(id => id + ':' + satTiers[id]).join(';') + '|' + era;
  if (force || key !== terrainKey) {
    terrainKey = key;
    renderTerrain($('terrain'), tier, houses, state.districts, builtIds, era, satTiers);
    if (typeof ambientRebuild === 'function') ambientRebuild();
  }
}

/* ---------------- treasure chests ---------------- */

let activeChest = null;
let nextChestAt = Date.now() + 8000;

function spawnChest() {
  for (let tries = 0; tries < 12; tries++) {
    const tx = 2 + Math.floor(Math.random() * (MAP_W - 4));
    const ty = 2 + Math.floor(Math.random() * (MAP_H - 4));
    if (isWater(tx, ty) || ALL_PLOT_TILES.has(tx + ',' + ty)) continue;
    const el = document.createElement('div');
    el.className = 'chest';
    el.style.left = ((tx + 0.5) / MAP_W * 100) + '%';
    el.style.top = ((ty + 1) / MAP_H * 100) + '%';
    el.title = 'A treasure chest! Click it before it vanishes!';
    el.appendChild(spriteCanvas('chest', 2));
    el.onclick = (ev) => { ev.stopPropagation(); if (!mapDragged) lootChest(); };
    $('chests').appendChild(el);
    activeChest = { el, expireAt: Date.now() + (hasTree('for2') ? 7000 : 5000) };
    return;
  }
  nextChestAt = Date.now() + 4000; // crowded roll, retry soon
}

function removeChest() {
  if (!activeChest) return;
  activeChest.el.remove();
  activeChest = null;
  const wait = (8000 + Math.random() * 6000) * (hasTree('for2') ? 0.75 : 1); // Treasure Maps
  nextChestAt = Date.now() + wait;
}

function lootChest() {
  if (!activeChest) return;
  state.stats.chestsFound++;
  const m = state.monster;
  const r = Math.random();
  if (r < 0.25) {
    const d = rollDrop();
    if (Math.random() < 0.12 && d.tier === 1) d.tier = 2; // chests skew higher
    invAdd(d.t, d.tier, 1, d.a);
    state.stats.itemsFound++;
    toast('CHEST: ' + itemName(d.t, d.tier, d.a) + '!');
  } else if (r < 0.55) {
    const amt = Math.max(25, C.prod.gold * 30 + (m ? m.gold * C.killMult * 3 : 0));
    earnGold(amt);
    toast('CHEST: +' + fmt(amt) + ' Gold!');
  } else if (r < 0.72) {
    const amt = Math.max(15, C.prod.wood * 40);
    state.wood += amt;
    toast('CHEST: +' + fmt(amt) + ' Wood!');
  } else if (r < 0.88) {
    const amt = Math.max(10, C.prod.stone * 40);
    state.stone += amt;
    toast('CHEST: +' + fmt(amt) + ' Stone!');
  } else {
    const amt = Math.max(5, C.prod.mana * 40);
    state.mana += amt;
    toast('CHEST: +' + fmt(amt) + ' Mana!');
  }
  removeChest();
}

function tickChests() {
  const now = Date.now();
  if (activeChest) {
    if (now > activeChest.expireAt) removeChest();
  } else if (now >= nextChestAt) {
    spawnChest();
  }
}

function renderCity() {
  const plots = $('plots');
  plots.innerHTML = '';
  for (const b of BUILDINGS) {
    const count = bCount(b.id);
    if (!count) continue;
    const spots = (PLOTS[b.id] || [[ROAD_X, ROAD_Y]]).filter(([x, y]) => plotAvailable(x, y));
    const shown = Math.min(count, spots.length);
    for (let i = 0; i < shown; i++) {
      const [tx, ty] = spots[i];
      const el = document.createElement('div');
      el.className = 'plot';
      el.style.left = ((tx + 0.5) / MAP_W * 100) + '%';
      el.style.top = ((ty + 1) / MAP_H * 100) + '%';
      el.style.zIndex = 10 + ty;
      el.title = b.name + ' x' + count + ' — click for upgrades';
      el.onclick = () => { if (!mapDragged) openBuilding(b.id); };
      el.appendChild(spriteCanvas(b.sprite, 3, b.pal));
      if (b.id === 'windmill') {
        const blades = spriteCanvas('millblades', 3);
        blades.className = 'mill-blades';
        el.appendChild(blades);
      }
      /* golden pennant once every upgrade of this building is maxed */
      const ups = BUILDING_UPGRADES[b.id];
      if (ups && ups.length && ups.every(up => bUp(up.id) >= up.max)) {
        const pen = spriteCanvas('pennant', 2);
        pen.className = 'max-pennant';
        pen.title = b.name + ': all upgrades maxed!';
        el.appendChild(pen);
      }
      if (i === 0 && count > 1) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'x' + count;
        el.appendChild(badge);
      }
      plots.appendChild(el);
    }
  }
  renderDistrictOverlays();
  maybeTerrain(false);
  if (typeof ambientRebuild === 'function') ambientRebuild();
}

/* ---------------- UI: prestige modal ---------------- */

function openPrestige() {
  $('prestige-modal').classList.remove('hidden');
  renderPrestige();
}
function closePrestige() {
  $('prestige-modal').classList.add('hidden');
}

/* ---- solar-system tree rendering ---- */

const TREE_WORLD = 3000;                 // world px, center at 1500
const treePan = { x: 0, y: 0, init: false };

function treeNodePos(node) {
  const cx = TREE_WORLD / 2, cy = TREE_WORLD / 2;
  if (node.gate) {
    /* gates sit on the ring, on the War axis (top) */
    const r = ERA_RING_R[node.era - 1];
    return [cx, cy - r];
  }
  const a = TREE_BRANCHES[node.branch].angle * Math.PI / 180;
  const r = ERA_NODE_R0[node.era - 1] + node.step * TREE_NODE_STEP;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

function renderPrestige() {
  $('sigil-balance').textContent = state.sigils;
  $('sigil-pending').textContent = pendingSigils();
  $('modal-ascend-btn').disabled = pendingSigils() < 1;

  const world = $('tree-world');
  world.innerHTML = '';
  world.style.width = TREE_WORLD + 'px';
  world.style.height = TREE_WORLD + 'px';
  const cx = TREE_WORLD / 2, cy = TREE_WORLD / 2;

  /* edges (SVG underlay) */
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', TREE_WORLD);
  svg.setAttribute('height', TREE_WORLD);
  svg.id = 'tree-edges';
  const line = (x1, y1, x2, y2, lit) => {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', lit ? '#ffd23e' : '#4a3a6b');
    l.setAttribute('stroke-width', lit ? 4 : 3);
    svg.appendChild(l);
  };
  for (const node of PRESTIGE_TREE) {
    const [x, y] = treeNodePos(node);
    let from;
    if (node.requires) {
      const req = PRESTIGE_TREE.find(n => n.id === node.requires);
      from = treeNodePos(req);
    } else {
      from = [cx, cy]; // chains from The Crown
    }
    line(from[0], from[1], x, y, hasTree(node.id));
  }
  world.appendChild(svg);

  /* era rings */
  for (let era = 2; era <= 4; era++) {
    const r = ERA_RING_R[era - 1];
    const ring = document.createElement('div');
    ring.className = 'era-ring' + (eraUnlocked(era) ? ' unlocked' : '');
    ring.style.left = (cx - r) + 'px';
    ring.style.top = (cy - r) + 'px';
    ring.style.width = (r * 2) + 'px';
    ring.style.height = (r * 2) + 'px';
    world.appendChild(ring);
    const label = document.createElement('div');
    label.className = 'era-ring-label' + (eraUnlocked(era) ? ' unlocked' : '');
    label.textContent = ERA_NAMES[era - 1].toUpperCase() + (eraUnlocked(era) ? '' : ' — SEALED');
    label.style.left = (cx + r * 0.72) + 'px';
    label.style.top = (cy - r * 0.72) + 'px';
    world.appendChild(label);
  }

  /* center: The Crown */
  const center = document.createElement('div');
  center.className = 'tree-center';
  center.style.left = cx + 'px';
  center.style.top = cy + 'px';
  center.innerHTML = '<span>THE<br>CROWN</span>';
  world.appendChild(center);

  /* branch labels around era 1 */
  for (const key in TREE_BRANCHES) {
    const br = TREE_BRANCHES[key];
    const a = br.angle * Math.PI / 180;
    const lbl = document.createElement('div');
    lbl.className = 'branch-ray-label';
    lbl.textContent = br.name.toUpperCase();
    lbl.style.left = (cx + Math.cos(a) * 90) + 'px';
    lbl.style.top = (cy + Math.sin(a) * 90) + 'px';
    world.appendChild(lbl);
  }

  /* nodes */
  for (const node of PRESTIGE_TREE) {
    const [x, y] = treeNodePos(node);
    const owned = hasTree(node.id);
    const avail = nodeAvailable(node);
    const btn = document.createElement('button');
    btn.className = 'node snode' + (node.gate ? ' gate-node' : '') + (owned ? ' owned' : avail ? '' : ' locked');
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    btn.disabled = owned || !avail || state.sigils < node.cost;
    btn.onclick = () => { if (!treeDragged) buyNode(node.id); };
    let costTxt = owned ? 'OWNED' : node.cost + ' Sigil' + (node.cost > 1 ? 's' : '');
    if (!owned && node.gate && ownedNodeCount() < node.needNodes) {
      costTxt += ' • ' + ownedNodeCount() + '/' + node.needNodes;
    } else if (!owned && !avail) {
      costTxt = 'LOCKED • ' + costTxt;
    }
    btn.innerHTML = '<span class="node-name">' + node.name + '</span><span class="node-cost">' + costTxt + '</span>';
    btn.onmouseenter = () => { $('node-info').textContent = node.name + ' — ' + node.desc; };
    world.appendChild(btn);
  }

  if (!treePan.init) {
    const vp = $('tree-map').getBoundingClientRect();
    if (vp.width > 50 && vp.height > 50) { // only when the modal is actually visible
      treePan.init = true;
      treePan.x = vp.width / 2 - cx;
      treePan.y = vp.height / 2 - cy;
    }
  }
  applyTreePan();
}

function applyTreePan() {
  $('tree-world').style.transform = 'translate(' + treePan.x + 'px,' + treePan.y + 'px)';
}

let treeDragged = false;

function initTreePan() {
  const vp = $('tree-map');
  let dragging = false, lastX = 0, lastY = 0, moved = 0;
  vp.addEventListener('pointerdown', e => {
    dragging = true; treeDragged = false; moved = 0;
    lastX = e.clientX; lastY = e.clientY;
  });
  vp.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6 && !treeDragged) {
      treeDragged = true;
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    lastX = e.clientX; lastY = e.clientY;
    if (treeDragged) {
      const r = vp.getBoundingClientRect();
      treePan.x = Math.min(400, Math.max(r.width - TREE_WORLD - 400, treePan.x + dx));
      treePan.y = Math.min(400, Math.max(r.height - TREE_WORLD - 400, treePan.y + dy));
      applyTreePan();
    }
  });
  const end = () => { dragging = false; };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
}

/* ---------------- UI: menu overlay (stats / settings) ---------------- */

let menuOpen = false;
let menuTab = 'stats';
let menuUpdaters = [];

function openMenu(tab) {
  menuOpen = true;
  menuTab = tab || 'stats';
  $('menu-overlay').classList.remove('hidden');
  renderMenu();
}

function closeMenu() {
  menuOpen = false;
  menuUpdaters = [];
  $('menu-overlay').classList.add('hidden');
}

function renderMenu() {
  menuUpdaters = [];
  $('menu-tab-stats').classList.toggle('active', menuTab === 'stats');
  $('menu-tab-settings').classList.toggle('active', menuTab === 'settings');
  const body = $('menu-body');
  body.innerHTML = '';

  if (menuTab === 'stats') {
    const groups = [
      ['TREASURY', [
        ['Gold (current)', () => fmt(state.gold)],
        ['Gold earned this run', () => fmt(state.runGold)],
        ['Gold earned (lifetime)', () => fmt(state.lifetimeGold)],
        ['Gold per second', () => fmt(C.prod.gold) + '/s'],
        ['Wood / Stone per second', () => fmt(C.prod.wood) + '/s • ' + fmt(C.prod.stone) + '/s'],
        ['Mana per second', () => fmt(C.prod.mana) + '/s'],
        ['Global gold multiplier', () => 'x' + C.goldMult.toFixed(2)],
      ]],
      ['WAR', [
        ['Click damage', () => fmt(C.click)],
        ['Crit chance', () => Math.round(C.critChance * 100) + '%'],
        ['Idle DPS (total)', () => fmt(C.dps)],
        ['— Archers / Mages / Clerics', () => fmt(C.archerDps) + ' / ' + fmt(C.mageDps) + ' / ' + fmt(C.clericDps)],
        ['— Ballistae / Golem / Dragons / Walls', () => fmt(C.turretDps) + ' / ' + fmt(C.golemDps) + ' / ' + fmt(C.dragonDps) + ' / ' + fmt(C.wallDps)],
        ['Kill bounty multiplier', () => 'x' + C.killMult.toFixed(2)],
        ['Monsters slain', () => state.totalKills],
        ['Bosses slain', () => state.stats.bossKills],
        ['Clicks (this save)', () => state.stats.clicks + ' (' + state.stats.crits + ' crits)'],
        ['Current zone / best', () => state.zone + ' / ' + state.highestZone],
      ]],
      ['DAY & NIGHT', [
        ['Current phase', () => (isNight() ? 'NIGHT ☽' : 'DAY ☀') + ' (' + fmtClock(cycleRemaining()) + ' left)'],
        ['Day bonus', () => '+' + Math.round(C.dayBonus * 100) + '% gold production & bounty'],
        ['Night effects', () => '+50% mob HP, +50% bounty, x' + ((hasTree('mys9') ? NIGHT_DROP_MULT * 2 : NIGHT_DROP_MULT) * (hasTree('mys6') ? 1.5 : 1)) + ' drops'],
      ]],
      ['ITEMS', [
        ['Items found', () => state.stats.itemsFound],
        ['Items forged', () => state.stats.itemsCombined],
        ['Items in bag', () => invTotal()],
        ['Chests looted', () => state.stats.chestsFound],
        ['Hero leadership aura', () => '+' + C.heroAura.toFixed(1) + '% (enemy HP -' + Math.round((1 - C.enemyHpMult) * 100) + '%)'],
        ['Drop chance now', () => {
          const base = DROP_CHANCE + (bUp('alch_phil') ? 0.005 : 0);
          return (Math.min(0.5, base * C.dropMult) * 100).toFixed(1) + '% (' + (Math.min(0.5, (BOSS_DROP_CHANCE + (bUp('alch_phil') ? 0.005 : 0)) * C.dropMult) * 100).toFixed(0) + '% boss)';
        }],
      ]],
      ['THE CROWN', [
        ['Buildings standing', () => totalBuildings()],
        ['Districts owned', () => state.districts.length + ' / 9 (+' + Math.round(DISTRICT_GOLD_BONUS * 100 * (state.districts.length - 1)) + '% gold)'],
        ['Ascensions', () => state.ascensions],
        ['Crown Sigils (held / ever)', () => state.sigils + ' / ' + state.sigilsEver],
        ['Pending Sigils', () => pendingSigils()],
        ['Time played (this save)', () => fmtTime(state.stats.playSec)],
      ]],
    ];
    for (const [title, rows] of groups) {
      const sec = document.createElement('div');
      sec.className = 'menu-section';
      sec.innerHTML = '<div class="menu-section-title">' + title + '</div>';
      for (const [label, fn] of rows) {
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = '<span>' + label + '</span><b></b>';
        const v = row.querySelector('b');
        menuUpdaters.push(() => { v.textContent = fn(); });
        sec.appendChild(row);
      }
      body.appendChild(sec);
    }
    for (const f of menuUpdaters) f();
  } else {
    /* SETTINGS */
    const sec = document.createElement('div');
    sec.className = 'menu-section';
    sec.innerHTML =
      '<div class="menu-section-title">SAVE</div>' +
      '<div class="menu-note">The game autosaves every 15 seconds and on close. Offline production runs at 50% rate, capped at 8 hours.</div>' +
      '<div class="menu-section-title">EXPORT SAVE</div>' +
      '<textarea id="export-area" readonly placeholder="Press EXPORT to generate your save code..."></textarea>' +
      '<div class="menu-btns">' +
      '<button id="export-btn" class="menu-btn">EXPORT</button>' +
      '<button id="copy-btn" class="menu-btn">COPY</button>' +
      '<button id="download-btn" class="menu-btn">DOWNLOAD</button></div>' +
      '<div class="menu-section-title">IMPORT SAVE</div>' +
      '<textarea id="import-area" placeholder="Paste a save code here, then press IMPORT."></textarea>' +
      '<div class="menu-btns"><button id="import-btn" class="menu-btn">IMPORT</button></div>' +
      '<div class="menu-section-title">DANGER</div>' +
      '<div class="menu-btns"><button id="wipe-btn" class="menu-btn danger">WIPE ALL PROGRESS</button></div>';
    body.appendChild(sec);

    $('export-btn').onclick = () => { $('export-area').value = exportSave(); };
    $('copy-btn').onclick = () => {
      if (!$('export-area').value) $('export-area').value = exportSave();
      $('export-area').select();
      try { navigator.clipboard.writeText($('export-area').value); toast('Save copied to clipboard.'); }
      catch (e) { document.execCommand('copy'); toast('Save copied.'); }
    };
    $('download-btn').onclick = () => {
      const blob = new Blob([exportSave()], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'aetherholm-save-' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
      URL.revokeObjectURL(a.href);
    };
    $('import-btn').onclick = () => importSave($('import-area').value);
    $('wipe-btn').onclick = wipeSave;
  }
}

/* ---------------- UI: per-tick refresh ---------------- */

function renderPips() {
  const box = $('zone-pips');
  box.innerHTML = '';
  for (let i = 1; i <= KILLS_PER_ZONE; i++) {
    const pip = document.createElement('span');
    pip.className = 'pip' + (i < state.killIdx ? ' done' : '') + (i === KILLS_PER_ZONE ? ' bosspip' : '');
    box.appendChild(pip);
  }
}

let lastNight = null;

function updateCycleUi() {
  const night = isNight();
  if (night !== lastNight) {
    lastNight = night;
    drawSprite($('ico-cycle'), night ? SPRITES.icoMoon : SPRITES.icoSun, 2);
    $('cycle-phase').textContent = night ? 'NIGHT' : 'DAY';
    $('night-tint').classList.toggle('on', night);
    document.body.classList.toggle('night', night);
  }
  $('cycle-time').textContent = fmtClock(cycleRemaining());
}

function updateHud() {
  $('res-gold').textContent = fmt(state.gold);
  $('res-gold-rate').textContent = '+' + fmt(C.prod.gold) + '/s';
  $('res-wood').textContent = fmt(state.wood);
  $('res-wood-rate').textContent = '+' + fmt(C.prod.wood) + '/s';
  $('res-stone').textContent = fmt(state.stone);
  $('res-stone-rate').textContent = '+' + fmt(C.prod.stone) + '/s';
  $('res-mana').textContent = fmt(state.mana);
  $('res-mana-rate').textContent = '+' + fmt(C.prod.mana) + '/s';

  $('zone-name').textContent = 'Zone ' + state.zone + ' — ' + zoneName(state.zone);
  const m = state.monster;
  if (m) {
    const pct = Math.max(0, m.hp / m.maxHp * 100);
    $('hp-fill').style.width = pct + '%';
    $('hp-text').textContent = fmt(Math.max(0, m.hp)) + ' / ' + fmt(m.maxHp);
  }
  $('stat-click').textContent = fmt(C.click);
  $('stat-dps').textContent = fmt(C.dps);
  $('stat-bounty').textContent = fmt((m ? m.gold : 0) * C.killMult);

  const pending = pendingSigils();
  const ascBtn = $('ascend-btn');
  ascBtn.textContent = 'ASCEND (+' + pending + ' Sigils)';
  ascBtn.classList.toggle('ready', pending >= 1);
  const nextAt = SIGIL_BASE * Math.pow(state.sigilsEver + pending + 1, 2);
  ascBtn.title = 'ASCENSION — the rebirth mechanic.\n' +
    'Crown Sigils = floor(sqrt(lifetime gold / ' + fmt(SIGIL_BASE) + ')).\n' +
    'Lifetime gold earned: ' + fmt(state.lifetimeGold) + '\n' +
    'Next Sigil at: ' + fmt(nextAt) + ' lifetime gold\n' +
    (pending >= 1
      ? 'READY: ascending now grants ' + pending + ' Sigil(s) to spend in the Advancement Tree.'
      : 'Keep earning gold — you can ascend once at least 1 Sigil is pending.');
  $('sigil-count').textContent = state.sigils;
  $('stat-line').textContent =
    'Kills: ' + state.totalKills + '  •  Best zone: ' + state.highestZone + '  •  Ascensions: ' + state.ascensions;
  $('bag-count').textContent = invTotal() > 0 ? invTotal() : '';

  updateCycleUi();
}

/* ---------------- main loop ---------------- */

let autoClickAcc = 0;

function tick() {
  const wasNight = isNight();
  state.cycleSec += TICK_MS / 1000;
  if (isNight() !== wasNight) {
    toast(isNight()
      ? '☽ Night falls... monsters grow bold (+50% HP & bounty, x2 item drops).'
      : '☀ Dawn breaks over Aetherholm! (+25% gold production)');
  }

  C = calc();

  if (C.dps > 0) damageMonster(C.dps / TICKS_PER_SEC, false);

  if (hasTree('mys3')) {
    const rate = hasTree('mys12') ? 6 : 2; // Spirit Legion
    autoClickAcc += rate / TICKS_PER_SEC;
    while (autoClickAcc >= 1) {
      autoClickAcc -= 1;
      let dmg = C.click;
      if (hasTree('mys12') && Math.random() < C.critChance) dmg *= 3;
      damageMonster(dmg, false);
    }
  }

  for (const res of RESOURCES) {
    const amt = C.prod[res] / TICKS_PER_SEC;
    if (amt <= 0) continue;
    if (res === 'gold') earnGold(amt); else state[res] += amt;
  }

  state.stats.playSec += TICK_MS / 1000;

  tickChests();
  updateHud();
  refreshShop();
  refreshUnitCards();
  for (const f of viewUpdaters) f();
  if (menuOpen) for (const f of menuUpdaters) f();
  if (invDirty && rightTab === 'bag' && !currentDetail) renderBag();
  maybeTerrain(false);
}

/* ---------------- init ---------------- */

function init() {
  load();
  applyTreeStartsIfFresh();
  C = calc();

  drawSprite($('ico-gold'), SPRITES.icoGold, 2);
  drawSprite($('ico-wood'), SPRITES.icoWood, 2);
  drawSprite($('ico-stone'), SPRITES.icoStone, 2);
  drawSprite($('ico-mana'), SPRITES.icoMana, 2);
  drawSprite($('ico-sigil'), SPRITES.icoSigil, 2);

  initMapView();
  ambientInit();
  maybeTerrain(true);
  buildShop();
  buildUnitCards();
  renderCity();
  spawnMonster();
  syncRightPanel();
  updateCycleUi();

  $('monster-area').addEventListener('pointerdown', onMonsterClick);
  $('ascend-btn').onclick = openPrestige;
  $('modal-ascend-btn').onclick = ascend;
  $('close-prestige').onclick = closePrestige;
  $('menu-btn').onclick = () => openMenu('stats');
  $('menu-close').onclick = closeMenu;
  $('menu-tab-stats').onclick = () => { menuTab = 'stats'; renderMenu(); };
  $('menu-tab-settings').onclick = () => { menuTab = 'settings'; renderMenu(); };
  $('tab-build').onclick = () => setRightTab('build');
  $('tab-bag').onclick = () => setRightTab('bag');
  $('detail-back').onclick = closeDetail;
  initTreePan();

  for (const btn of document.querySelectorAll('.amt-btn')) {
    btn.onclick = () => {
      const v = btn.dataset.amt;
      state.buyAmount = isNaN(Number(v)) ? v : Number(v);
      for (const b of document.querySelectorAll('.amt-btn')) b.classList.toggle('active', b === btn);
      refreshShop();
    };
    btn.classList.toggle('active', String(state.buyAmount) === btn.dataset.amt);
  }

  for (const btn of document.querySelectorAll('.filter-btn')) {
    btn.onclick = () => {
      shopFilter = btn.dataset.filter;
      for (const b of document.querySelectorAll('.filter-btn')) b.classList.toggle('active', b === btn);
      refreshShop();
    };
  }

  setInterval(tick, TICK_MS);
  setInterval(save, 15000);
  window.addEventListener('beforeunload', save);

  if (state._respecced) {
    delete state._respecced;
    setTimeout(() => toast('The Ages Tree has been reforged — all your Sigils were refunded for a free respec!'), 500);
  }
}

function applyTreeStartsIfFresh() {
  if (state.totalKills === 0 && state.runGold === 0 && state.gold === 0) applyTreeStarts();
}

document.addEventListener('DOMContentLoaded', init);
