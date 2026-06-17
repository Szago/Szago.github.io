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
    sword: 0, archer: 0, mage: 0, magePower: 0, turret: 0, cleric: 0, golem: 0, dragon: 0,
    knight: 0, plague: 0, valkyrie: 0, walls: 0,
    reaver: 0, seraph: 0, reaper: 0, leviathan: 0,   // ward units (unlocked by claiming outer wards)
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
  totalBuildingsBought: 0,            // lifetime — cosmetic city density (every 100 adds props)
  totalUnitsBought: 0,                // lifetime — cosmetic NPC density (every 100 adds wanderers)
  ascensions: 0,
  tree: {},                           // node id -> true
  inv: {},                            // "type:tier" -> count (persists ascension)
  equip: defaultEquip(),              // unit id -> slot array of {t, tier}|null
  stats: defaultStats(),
  buyAmount: 1,                       // legacy: migrated into buildBuyAmount
  buildBuyAmount: 1,
  unitBuyAmount: 1,
  endgameTimers: { item: 0, pot: 0 },
  autoOn: { bup: false, uup: false, build: false, unit: false, equip: false, skill: false, forge: false, fuse: false },
  notifyOff: {},
  lastSave: Date.now(),
};

/* fill anything missing after loading an older save */
function ensureShape(s) {
  const run = defaultRunState();
  for (const k in run) if (s[k] === undefined) s[k] = run[k];
  if (!s.inv) s.inv = {};
  /* outer gamemode gates: persist across ascension once unsealed */
  if (!s.modeTiles) s.modeTiles = {};
  /* ward units: persist across ascension once their ward is first claimed */
  if (!s.wardUnits) s.wardUnits = {};
  /* migration: any outer ward currently owned permanently unlocks its unit */
  for (const k of OUTER_WARD_KEYS) if (s.districts && s.districts.includes(k)) s.wardUnits[k] = true;
  /* lifetime cosmetic counters (drive city density / wandering NPCs) */
  if (typeof s.totalBuildingsBought !== 'number') s.totalBuildingsBought = 0;
  if (typeof s.totalUnitsBought !== 'number') s.totalUnitsBought = 0;
  if (!s.stats) s.stats = defaultStats();
  const st = defaultStats();
  for (const k in st) if (s.stats[k] === undefined) s.stats[k] = st[k];
  if (!s.endgameTimers) s.endgameTimers = { item: 0, pot: 0 };
  if (s.endgameTimers.item === undefined) s.endgameTimers.item = 0;
  if (s.endgameTimers.pot === undefined) s.endgameTimers.pot = 0;
  const eq = defaultEquip();
  if (!s.equip) s.equip = eq;
  for (const u of UNITS) {
    if (!Array.isArray(s.equip[u.id])) s.equip[u.id] = eq[u.id];
    /* Satchel Charms from the Rift Portal grant permanent extra slots */
    const slotPlus = (s.portal && s.portal.slotPlus && s.portal.slotPlus[u.id]) || 0;
    const treeSlots = (u.id === 'hero' && s.tree && s.tree.xfor6) ? 1 : 0; // Reliquary Straps
    while (s.equip[u.id].length < u.slots + Math.min(2, slotPlus) + treeSlots) s.equip[u.id].push(null);
  }
  if (!s.unitUp) s.unitUp = {};
  if (!s.bUp) s.bUp = {};
  if (!s.tree) s.tree = {};
  if (!s.notifyOff) s.notifyOff = {};
  if (s.debugUnlocked === undefined) s.debugUnlocked = false;
  /* automation toggles (the 8th branch) */
  if (!s.autoOn) s.autoOn = {};
  for (const k of ['bup', 'uup', 'build', 'unit', 'skill', 'forge', 'fuse'])
    if (s.autoOn[k] === undefined) s.autoOn[k] = false;
  if (s.autoOn.equip === undefined) s.autoOn.equip = !!s.tree.auto9;
  /* buy amounts are gated by Automation nodes — reset locked modes */
  const amtLocked = v => (String(v) === '10' && !s.tree.auto1) ||
    (['100', 'max', 'next10', 'next100'].includes(String(v)) && !s.tree.auto2);
  if (s.buildBuyAmount === undefined) s.buildBuyAmount = s.buyAmount === undefined ? 1 : s.buyAmount;
  if (s.unitBuyAmount === undefined) s.unitBuyAmount = 1;
  if (amtLocked(s.buildBuyAmount)) s.buildBuyAmount = 1;
  if (amtLocked(s.unitBuyAmount)) s.unitBuyAmount = 1;
  s.buyAmount = s.buildBuyAmount; // keep older tooling/saves readable
  /* tree rework migration: if any owned node no longer exists,
     wipe the tree and refund ALL sigils (free respec) */
  const validNodes = new Set(PRESTIGE_TREE.map(n => n.id));
  if (Object.keys(s.tree).some(id => !validNodes.has(id))) {
    s.tree = {};
    s.sigils = (s.sigilsEver || 0) + (s.bonusSigils || 0);
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
  if (!isFinite(n)) return '\u221e';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : String(Math.floor(n));
  const suffixes = ['', 'K', 'M', 'B', 'T'];
  let group = 0;
  while (n >= 1000) { n /= 1000; group++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + fmtSuffix(group, suffixes);
}

function fmtSuffix(group, suffixes) {
  if (group < suffixes.length) return suffixes[group];
  const abc = 'abcdefghijklmnopqrstuvwxyz';
  const n = group - suffixes.length;
  return abc[Math.floor(n / abc.length)] + abc[n % abc.length];
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

/* ---------------- lightweight performance profiler ----------------
   Enabled only while the draggable monitor is open, so normal play pays almost
   no instrumentation cost. Snapshots are rolled once per second. */

const perfStats = {
  enabled: false,
  current: Object.create(null),
  snapshot: Object.create(null),
  averageTotals: Object.create(null),
  sampleCount: 0,
  snapshotVersion: 0,
  windowStart: 0,
  fps: 0,
  frames: 0,
  frameStart: 0,
};
let perfOverlayOpen = false;
let perfOverlayRenderedVersion = -1;
let perfOverlayDrag = null;

function perfStart() {
  return perfStats.enabled ? performance.now() : 0;
}

function perfEnd(name, started) {
  if (!started) return;
  const ms = performance.now() - started;
  const row = perfStats.current[name] || (perfStats.current[name] = { total: 0, calls: 0, max: 0 });
  row.total += ms;
  row.calls++;
  if (ms > row.max) row.max = ms;
  const now = performance.now();
  if (!perfStats.windowStart) perfStats.windowStart = now;
  if (name === 'Tick total' && now - perfStats.windowStart >= 1000) {
    const seconds = Math.max(0.001, (now - perfStats.windowStart) / 1000);
    const next = Object.create(null);
    for (const key in perfStats.current) {
      const src = perfStats.current[key];
      next[key] = {
        total: src.total / seconds,
        calls: src.calls / seconds,
        avg: src.calls ? src.total / src.calls : 0,
        max: src.max,
      };
    }
    perfStats.snapshot = next;
    perfStats.sampleCount++;
    for (const key in next)
      perfStats.averageTotals[key] = (perfStats.averageTotals[key] || 0) + next[key].total;
    perfStats.snapshotVersion++;
    perfStats.current = Object.create(null);
    perfStats.windowStart = now;
  }
}

function perfFrame(now) {
  if (perfStats.enabled) {
    if (!perfStats.frameStart) perfStats.frameStart = now;
    perfStats.frames++;
    const elapsed = now - perfStats.frameStart;
    if (elapsed >= 1000) {
      perfStats.fps = perfStats.frames * 1000 / elapsed;
      perfStats.frames = 0;
      perfStats.frameStart = now;
    }
    renderPerformanceOverlay();
  } else {
    perfStats.frames = 0;
    perfStats.frameStart = 0;
  }
  requestAnimationFrame(perfFrame);
}

function perfReset() {
  perfStats.current = Object.create(null);
  perfStats.snapshot = Object.create(null);
  perfStats.averageTotals = Object.create(null);
  perfStats.sampleCount = 0;
  perfStats.snapshotVersion++;
  perfStats.windowStart = performance.now();
  perfStats.fps = 0;
  perfStats.frames = 0;
  perfStats.frameStart = 0;
  perfOverlayRenderedVersion = -1;
}

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
  if (hasTree('forg1')) m *= 1.30;  // Gilded Loot
  if (hasTree('fora2')) m *= 1.5;   // Artificer God
  return itemValue(t, tier) * m;
}

function affixFactor() {
  return hasTree('fors3') ? 1 : hasTree('fora1') ? 0.75 : 0.5;
}

/* an item can carry multiple affixes ("a+b" in keys) after Affix Fusion */
function affixList(a) { return a ? String(a).split('+') : []; }
function affixKey(list) { return list.slice().sort().join('+'); }

function itemAffixCategory(t) {
  const eff = ITEMS[t] && ITEMS[t].eff;
  if (eff === 'gold' || eff === 'bounty' || eff === 'boss') return 'wealth';
  if (eff === 'res' || eff === 'mana') return 'craft';
  if (eff === 'luck') return 'fortune';
  return 'combat';
}

function itemClusterName(list) {
  const counts = { combat: 0, wealth: 0, craft: 0, fortune: 0 };
  for (const t of list) counts[itemAffixCategory(t)]++;
  const active = Object.keys(counts).filter(k => counts[k] > 0).sort();
  const single = { combat: 'Warbound', wealth: 'Gilded', craft: 'Runewrought', fortune: 'Fated' };
  const pairs = {
    'combat,craft': 'Spellforged',
    'combat,fortune': 'Doomfavored',
    'combat,wealth': 'Conquering',
    'craft,fortune': 'Moonwoven',
    'craft,wealth': 'Provident',
    'fortune,wealth': 'Omen-Crowned',
  };
  const profile = active.length === 1 ? single[active[0]]
    : active.length === 2 ? pairs[active.join(',')]
    : active.length === 4 ? 'Pantheonic'
    : 'Concordant';
  const rank = ['','', '', '', '', 'Pentadic', 'Hexadic', 'Heptadic', 'Octadic', 'Enneadic', 'Decadic'][list.length] ||
    (list.length >= 11 ? 'Myriad' : 'Manyfold');
  return rank + ' ' + profile;
}

function itemName(t, tier, a) {
  const list = affixList(a);
  if (list.length > 4) return ITEMS[t].name + ' ' + tierName(tier) + ' - ' + itemClusterName(list);
  return ITEMS[t].name + ' ' + tierName(tier) +
    (list.length ? ' of ' + list.map(x => AFFIX_NAMES[x]).join(' & ') : '');
}

function itemStatLines(t, tier, a) {
  const lines = ['+' + effItemValue(t, tier).toFixed(1) + '% ' + ITEMS[t].txt];
  for (const affix of affixList(a)) {
    if (ITEMS[affix]) lines.push('+' + (effItemValue(affix, tier) * affixFactor()).toFixed(1) + '% ' + ITEMS[affix].txt);
  }
  return lines;
}

function itemStatsHtml(t, tier, a) {
  return itemStatLines(t, tier, a).map(line => '<span class="item-stat-line">' + line + '</span>').join('');
}

function softCapValue(raw, cap) {
  if (raw <= cap) return raw;
  return cap + cap * (1 - Math.exp(-(raw - cap) / cap * 0.35));
}

function itemDropChance(isBoss) {
  if (isBoss && hasTree('xfor3')) return 1;
  const base = (isBoss ? BOSS_DROP_CHANCE * (hasTree('for6') ? 2 : 1) : DROP_CHANCE) +
    (bUp('alch_phil') ? 0.005 : 0);
  const raw = base * C.dropMult;
  const capBoost = (hasTree('xfor9') ? 0.10 : 0) + (hasTree('xfor10') ? 0.15 : 0);
  const cap = Math.min(0.95, (isBoss ? 0.75 : 0.50) + capBoost);
  if (raw <= cap) return raw;
  return Math.min(0.995, cap + (1 - cap) * (1 - Math.exp(-(raw - cap) / Math.max(0.01, 1 - cap) * 0.35)));
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
  const E = { click: 0, archer: 0, mage: 0, turret: 0, cleric: 0, golem: 0, dragon: 0, knight: 0, plague: 0, valkyrie: 0, reaver: 0, seraph: 0, reaper: 0, leviathan: 0, bounty: 0, gold: 0, res: 0, mana: 0, luck: 0, boss: 0 };
  for (const uid in state.equip) {
    if (!unitActive(uid)) continue; // unrecruited units give nothing
    for (const it of state.equip[uid]) {
      if (!it) continue;
      E[ITEMS[it.t].eff] += effItemValue(it.t, it.tier);
      for (const a of affixList(it.a))
        if (ITEMS[a]) E[ITEMS[a].eff] += effItemValue(a, it.tier) * affixFactor();
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
  const buildingDoctrineMult = (target, ids, fullAt) => {
    const buildings = ids.reduce((sum, id) => sum + bCount(id), 0);
    return 1 + (target - 1) * Math.min(1, buildings / fullAt);
  };

  // HERO LEADERSHIP AURA: items worn by the hero inspire the whole city
  const auraFactor = HERO_AURA_FACTOR * (hasTree('war9') ? 1.5 : 1); // Heroic Saga
  let heroAuraRaw = 0;
  if (unitActive('hero')) // a Rift-slain hero inspires nobody
    for (const it of state.equip.hero) if (it) heroAuraRaw += effItemValue(it.t, it.tier) * auraFactor;
  const heroAuraCap = hasTree('xwar15') ? 500 : hasTree('xwar14') ? 250 : 150;
  const heroAura = softCapValue(heroAuraRaw, heroAuraCap);
  c.heroAuraRaw = heroAuraRaw;
  c.heroAuraCap = heroAuraCap;
  c.heroAura = heroAura;
  const auraMult = 1 + heroAura / 100;
  let enemyHpMult = Math.max(0.6, 1 - heroAura / 200); // enemies spawn weaker, cap -40%
  if (hasTree('xspirit2')) enemyHpMult *= 0.9;         // Cold Spots
  c.enemyHpMult = enemyHpMult;

  // bonus applied to every unit's damage (incl. clicks)
  let allUnit = (1 + 0.05 * decree) * (1 + 0.05 * bCount('barracks')) *
    (1 + 0.02 * bUp('barracks_drill')) * (1 + 0.05 * uUp('horn')) *
    (1 + 0.05 * bUp('trade_mercs')) * auraMult;
  allUnit *= 1 + 0.03 * (bCount('armory') + bCount('warcollege'));
  allUnit *= 1 + 0.03 * bUp('college_officers') + 0.03 * bUp('granary_rations') +
    0.05 * bUp('bank_bonds') + 0.10 * bUp('wonder_heroes');
  if (hasTree('war6')) allUnit *= 1.25;   // Drill Sergeants
  if (hasTree('warg1')) allUnit *= 1.5;   // Gilded Arms
  if (hasTree('wars1')) allUnit *= 1.5;   // Storm Blades
  if (hasTree('wara1')) allUnit *= 1.5;   // Aether Weapons
  if (hasTree('xwar2'))                   // Quartermasters
    allUnit *= 1 + 0.01 * (bCount('barracks') + bCount('armory') + bCount('warcollege') + bCount('siegeworkshop'));
  if (hasTree('xwar4')) allUnit *= 1 + Math.min(1, 0.01 * invTotal()); // Gilded Armory
  if (hasTree('xwar5') && night) allUnit *= 1.3;                      // Thunderhead
  if (hasTree('xwar6'))                   // Pantheon of War
    allUnit *= 1 + 0.10 * UNITS.filter(u => state[u.statKey] >= 100).length;
  if (hasTree('xwar8') && momentum.until > Date.now()) // Momentum
    allUnit *= 1 + 0.02 * momentum.stacks;

  // CROWN MASTER MULTIPLIER: final factor on ALL production & bounties
  // (the Sovereignty branch — scales off Crown Sigils in every form)
  let sigilPct = 0;
  if (hasTree('crown4')) sigilPct += 0.01;   // Banking Houses
  if (hasTree('crown7')) sigilPct += 0.01;   // Golden Age
  if (hasTree('crown10')) sigilPct += 0.02;  // Golden Aeon
  if (hasTree('crown13')) sigilPct += 0.03;  // Eternal Throne
  if (hasTree('crown16')) sigilPct += 0.05;  // Apotheosis
  if (hasTree('crown6')) sigilPct *= 1.25;   // Sigil Polish
  if (hasTree('crown14')) sigilPct *= 1.5;   // Crown of Crowns
  let sigilMaster = 1 + sigilPct * state.sigilsEver * (hasTree('xcrown5') ? 1.2 : 1); // Census of Storms
  const titheCap = hasTree('crown8') ? 2 : 1;                        // Twin Tithes
  if (hasTree('crown2')) sigilMaster *= 1 + Math.min(1 * titheCap, 0.005 * state.sigils);
  if (hasTree('crown9')) sigilMaster *= 1 + 0.002 * Math.max(0, state.sigilsEver - state.sigils);
  if (hasTree('crown18')) sigilMaster *= 2;                          // Sovereign of Ages
  if (hasTree('xcrown6')) sigilMaster *= 1 + 0.01 * ownedNodeCount(); // Throne of Ages
  if (hasTree('xward2')) sigilMaster *= 1 + 0.0025 * outerWardUpgradeLevels(); // Outer Works Mandate
  c.sigilMaster = sigilMaster;

  // global gold multiplier (applies to buildings AND kill bounties)
  const zoneBonus = ZONE_INCOME_BONUS * (state.zone - 1);
  let goldMult = (1 + zoneBonus) *
    (1 + 0.02 * bCount('temple') + 0.03 * bCount('cathedral') + 0.01 * bCount('harbor') +
      0.02 * bCount('lighthouse') + 0.05 * bCount('bank') + 0.10 * bCount('wonder') +
      0.01 * bCount('market') + 0.05 * bCount('keep') + 0.01 * bCount('wharf') +
      0.02 * bCount('tradeport') + 0.02 * bCount('beekeeper') + 0.02 * bCount('groves') +
      0.02 * bCount('granary') + 0.02 * bCount('voidmarket') + 0.015 * bCount('crownarchive') +
      0.02 * bCount('bloodtreasury') + 0.02 * bCount('pearlexchange'));
  goldMult *= 1 + 0.03 * bUp('temple_favor');
  goldMult *= 1 + 0.04 * bUp('cath_relics');
  goldMult *= 1 + 0.01 * bUp('market_guilds');
  goldMult *= 1 + 0.01 * bUp('crownarchive_ledgers') + 0.01 * bUp('pearl_ledgers');
  goldMult *= (1 + 0.05 * decree) * (1 + 0.05 * bUp('mint_standard'));
  if (bCount('crownarchive'))
    goldMult *= 1 + Math.min(1.5, 0.0005 * wardProgSpire() * (bCount('crownarchive') + bUp('crownarchive_ledgers')));
  goldMult *= 1 + DISTRICT_GOLD_BONUS * (state.districts.length - 1);
  goldMult *= 1 + E.gold / 100;
  if (state.spire && state.spire.crowned) goldMult *= hasTree('xspire4') ? 3 : 2; // Crown of the Silver Spire — forever (Gilded Crown: x3)
  /* era gates (Imperial Decree doubles their bonus part) */
  const gateBoost = hasTree('crown11') ? 2 : 1;
  const gateBonus = [0, 0, 0.25, 0.5, 0.75, 1, 1.5]; // by era
  let gatesOwned = 0;
  for (let e = 2; e <= 6; e++) if (hasTree('era' + e)) {
    gatesOwned++;
    goldMult *= 1 + gateBonus[e] * gateBoost;
  }
  /* prosperity & crown gold nodes */
  if (hasTree('pros5')) goldMult *= 1.2;
  if (hasTree('pros8')) goldMult *= 1.4;
  if (hasTree('prosi1')) goldMult *= 1.3;   // Caravan Network
  if (hasTree('prosg1')) goldMult *= 1.5;   // Gold Standard
  if (hasTree('pross1')) goldMult *= 1.5;   // Storm Markets
  if (hasTree('prosa1')) goldMult *= 2;     // Aether Economy
  if (hasTree('prosa2')) goldMult *= 2;     // Infinite Vaults
  if (hasTree('crown1')) goldMult *= 1 + 0.02 * state.ascensions;  // Royal Ledger
  if (hasTree('crown12')) goldMult *= 1 + 0.05 * state.ascensions; // Dynasty
  if (hasTree('crown3')) goldMult *= 1 + 0.15 * gatesOwned;        // Crown Authority
  if (hasTree('crown5')) goldMult *= 1 + Math.min(1.5 * titheCap, 0.03 * pendingSigils()); // Pending Glory
  if (hasTree('xcrown1')) goldMult *= 1 + 0.02 * state.districts.length; // Royal Census
  if (hasTree('xpros4')) goldMult *= 1 + Math.min(1.5, 0.03 * (bCount('mint') + bCount('bank'))); // Counting Houses
  if (hasTree('xmys6')) goldMult *= 1 + Math.min(1, state.mana / 100000); // Aether Tide
  if (hasTree('xspirit5') && night) goldMult *= 1.25; // Spirit Lanterns
  /* day bonus: Shrines of Dawn + Astral Clock + Sun Sigils */
  let dayBonus = (DAY_GOLD_BONUS + 0.03 * bCount('shrine') + 0.01 * bCount('dawnprism') + 0.01 * bUp('dawnprism_facets')) *
    (hasTree('mys6') ? 1.5 : 1) * (hasTree('mysg2') ? 2 : 1);
  c.dayBonus = dayBonus;
  /* Long Dusk: the day bonus lingers through the first 60s of night */
  const duskLinger = hasTree('xmys8') && night && (state.cycleSec % CYCLE_SEC) < DAY_SEC + 60;
  if (!night || duskLinger) goldMult *= 1 + dayBonus;
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
    fishmarket: 1 + 0.20 * bUp('fishmarket_provisions'),
    beekeeper: 1 + 0.20 * bUp('beekeeper_apiary'),
    riftbeacon: (1 + 0.20 * bUp('riftbeacon_lenses')) * (1 + Math.min(3, 0.01 * wardProgPortal() * riftWorksMult())),
    riftapothecary: 1 + 0.20 * bUp('riftapoth_stills'),
    voidmarket: 1 + 0.20 * bUp('voidmarket_contracts'),
    echoarsenal: 1 + Math.min(2, 0.02 * wardProgPortal() * riftWorksMult()),
    reliquarypress: (1 + 0.20 * bUp('reliq_imprint')) * (1 + Math.min(3, 0.01 * wardProgPortal() * riftWorksMult())),
    skyhookyard: 1 + 0.20 * bUp('skyhook_tension'),
    wayhouse: 1 + 0.20 * bUp('wayhouse_feathers'),
    cloudfoundry: 1 + 0.20 * bUp('cloudfoundry_anvils'),
    dawnprism: 1 + 0.20 * bUp('dawnprism_facets'),
    crownarchive: (1 + 0.20 * bUp('crownarchive_ledgers')) * (1 + Math.min(3, 0.005 * wardProgSpire() * spireWorksMult())),
    doomforge: (1 + 0.20 * bUp('doomforge_quench')) * (1 + Math.min(2, 0.01 * wardProgTower() * doomWorksMult())),
    beatfoundry: 1 + 0.20 * bUp('beat_calibration'),
    reapercloister: 1 + 0.20 * bUp('reaper_litany'),
    bloodtreasury: 1 + 0.20 * bUp('blood_vaults'),
    nightmetronome: 1 + 0.20 * bUp('metronome_mercy'),
    tidebreaker: 1 + 0.20 * bUp('tidebreaker_cranes'),
    pearlexchange: 1 + 0.20 * bUp('pearl_ledgers'),
    abyssalvault: 1 + 0.20 * bUp('abyssal_index'),
    moonpool: 1 + 0.20 * bUp('moonpool_tides'),
    leviathannest: 1 + 0.20 * bUp('leviathan_lullaby'),
  };
  if (hasTree('xpros1')) { // Market Day
    prodMult.tavern = (prodMult.tavern || 1) * 2;
    prodMult.market = (prodMult.market || 1) * 2;
  }
  if (hasTree('xpros2')) // Caravanserai
    for (const id of ['market', 'fishmarket', 'harbor', 'tradeport'])
      prodMult[id] = (prodMult[id] || 1) * 1.75;
  c.prodMult = prodMult;

  const prod = { gold: 0, wood: 0, stone: 0, mana: 0 };
  for (const b of BUILDINGS) {
    const n = bCount(b.id);
    if (!n) continue;
    let m = prodMult[b.id] || 1;
    if (hasTree('xind4')) m *= 1 + 0.10 * satTierFor(n); // Boomtowns
    if (hasTree('xind8') && n >= 100) m *= 2;            // Genesis Engines
    if (BUILDING_DISTRICT[b.id] === '4,2')
      m *= 1 + Math.min(hasTree('xdeep1') ? 2.5 : 1, (hasTree('xdeep1') ? 0.05 : 0.02) * wardProgSunken());
    for (const res in b.prod) prod[res] += b.prod[res] * n * m;
  }
  let manaMult = 1;
  if (hasSkill('arcane')) manaMult *= 1.5;
  if (hasTree('mys1')) manaMult *= 1.5;   // Mana Font
  if (hasTree('mysn1')) manaMult *= 1.5;  // Rune Wards
  if (hasTree('mys4')) manaMult *= 1.5;   // Mana Springs
  if (hasTree('mys7')) manaMult *= 2;     // Leyline Network
  if (hasTree('mys9')) manaMult *= 1.25;  // Lunar Covenant
  if (hasTree('mysg1')) manaMult *= 2;    // Gold-Threaded Robes
  if (hasTree('myss1')) manaMult *= 2;    // Storm Mana
  if (hasTree('mysa1')) manaMult *= 2;    // Aether Mind
  if (hasTree('mysa3')) manaMult *= 3;    // Mana Singularity
  if (hasTree('xmys1') && night) manaMult *= 1.5;       // Moonlit Font
  if (hasTree('xmys3')) manaMult *= 1 + 0.01 * state.walls; // Attuned Walls
  if (hasTree('xmys4'))                   // Scholarly Circle
    manaMult *= 1 + 0.03 * Object.keys(state.skills).filter(k => state.skills[k]).length;
  if (hasTree('xmys5')) manaMult *= 1 + 0.03 * (state.zone - 1); // Charged Air
  manaMult *= 1 + 0.02 * bCount('moonpool') + 0.01 * bUp('moonpool_tides') +
    0.01 * bCount('riftbeacon') + 0.01 * bCount('dawnprism');
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
  if (hasTree('indg1')) { woodMult *= 1.75; stoneMult *= 1.75; } // Golden Mills
  if (hasTree('indg2')) woodMult *= 2;    // Gilded Lumber
  if (hasTree('indg3')) stoneMult *= 2;   // Marble Quarries
  if (hasTree('inds2')) woodMult *= 2;    // Lightning Saws
  if (hasTree('inds3')) stoneMult *= 2;   // Thunder Drills
  if (hasTree('inda1')) woodMult *= 2;    // Aether Saws
  if (hasTree('inda2')) stoneMult *= 2;   // Aether Drills
  if (hasTree('xind3')) {                 // Mule Trains
    const dm = 1 + 0.05 * state.districts.length;
    woodMult *= dm; stoneMult *= dm;
  }
  woodMult *= 1 + 0.01 * bCount('tidebreaker') + 0.005 * bUp('tidebreaker_cranes');
  stoneMult *= 1 + 0.01 * bCount('abyssalvault') + 0.005 * bUp('abyssal_index') +
    0.005 * bCount('cloudfoundry');
  let goldProd = goldMult * (hasTree('pros2') ? 1.25 : 1);
  if (hasTree('pros4')) goldProd *= 1.3;  // Stone Granaries
  let industrial = hasTree('ind7') ? 1.25 : 1;
  if (hasTree('prosg2')) industrial *= 1.25;  // World's Fair
  if (hasTree('pross3')) industrial *= 1.3;   // Tempest Trade
  if (hasTree('inds1')) industrial *= 1.25;   // Storm Engines
  if (hasTree('prosa3')) industrial *= 3;     // Economy of Light
  if (hasTree('inda3')) industrial *= 1.25;   // World Engine
  if (hasTree('xind2') && night) industrial *= 1.2;  // Night Shifts
  if (hasTree('xind5'))                       // Automated Looms
    industrial *= 1 + 0.005 * Object.values(state.bUp).reduce((a, b) => a + b, 0);
  if (hasTree('xind6')) industrial *= 1 + Math.min(1, 0.25 * bCount('wonder')); // Wonder Engines
  if (hasTree('xcrown2')) industrial *= 1 + 0.10 * gatesOwned; // Jubilees
  if (hasTree('auto12')) industrial *= 1.15;  // Brass Foremen
  if (hasTree('auto18')) industrial *= 1.25;  // The Grand Automaton
  /* per-resource global factors (also used by the shop's per-each display).
     sigilMaster is the FINAL multiplier on everything. */
  const twBless = (state.tower && state.tower.resMult) || {}; // Tower of Doom blessings (tower.js)
  c.prodFactors = {
    gold: goldProd * auraMult * industrial * sigilMaster,
    wood: woodMult * auraMult * industrial * sigilMaster * (twBless.wood || 1),
    stone: stoneMult * auraMult * industrial * sigilMaster * (twBless.stone || 1),
    mana: manaMult * auraMult * industrial * sigilMaster * (twBless.mana || 1),
  };
  for (const res of RESOURCES) prod[res] *= c.prodFactors[res];
  c.prod = prod;

  // ---- idle DPS per unit ----
  let archerDps = state.archer * 1 * Math.pow(1.15, uUp('longbows')) * (1 + 0.10 * uUp('poison'));
  archerDps *= Math.pow(1.25, uUp('windlore'));        // Wind Lore training
  archerDps *= 1 + 0.02 * state.walls;                 // wall synergy
  archerDps *= 1 + 0.10 * bUp('tavern_tales');
  archerDps *= 1 + 0.05 * bCount('kennels') + 0.05 * bCount('lodge');
  archerDps *= 1 + 0.10 * bUp('kennels_alpha') + 0.10 * bUp('lodge_hunters');
  archerDps *= 1 + 0.05 * bUp('tan_saddles') + 0.05 * bUp('light_signals') + 0.10 * bUp('groves_feasts');
  if (hasSkill('volley')) archerDps *= 2;
  if (hasSkill('hawk')) archerDps *= 1 + 0.02 * (state.zone - 1);   // Hawk Companions
  if (hasTree('war4')) archerDps *= 2;                 // Crossbows
  if (hasTree('warg2')) archerDps *= 2;                // Golden Legions
  if (hasTree('xwar1')) archerDps *= 1 + 0.02 * (state.zone - 1); // Hunting Parties
  archerDps *= (1 + E.archer / 100) * allUnit;

  let mageDps = state.mage * 2 * Math.pow(1.25, state.magePower);
  mageDps *= 1 + 0.10 * bCount('magetower') + 0.10 * bCount('academy') + 0.03 * bCount('library') + 0.05 * bCount('monastery');
  mageDps *= 1 + 0.03 * bCount('manawell') + 0.03 * bCount('scriptorium') + 0.05 * bCount('worldtree') + 0.03 * bCount('crystalmine');
  mageDps *= 1 + 0.05 * bUp('magetower_focus') + 0.05 * bUp('acad_curriculum') + 0.01 * bUp('lib_archives');
  if (hasSkill('fireball')) mageDps *= 2;
  if (hasSkill('chain')) mageDps *= 1.5;
  if (uUp('archmage')) mageDps *= 1.5;
  if (hasTree('war2')) mageDps *= 1.5;                 // Veteran Mages
  if (hasTree('mys5')) mageDps *= 2;                   // Eternal Flame
  if (hasTree('mys8')) mageDps *= 2;                   // Storm Callers
  if (hasTree('myss2')) mageDps *= 2;                  // Maelstrom
  if (hasTree('mysa2')) mageDps *= 2;                  // Archmage Ascendant
  if (hasTree('xmys2') && night) mageDps *= 1.5;       // Starfall Hours
  mageDps *= (1 + E.mage / 100) * allUnit;

  let turretDps = state.turret * 6 * (1 + 0.10 * bCount('smith') + 0.10 * bCount('siegeworkshop'));
  turretDps *= 1 + Math.min(0.5, 0.01 * bCount('lumber')) + 0.02 * bCount('sawmill') + 0.03 * bCount('timberworks');
  turretDps *= 1 + 0.15 * uUp('bolts');
  turretDps *= Math.pow(1.25, uUp('siegecraft'));      // Siegecraft training
  if (uUp('twin')) turretDps *= 1.5;
  if (bUp('lumber_war')) turretDps *= 1.15;
  turretDps *= 1 + 0.05 * bUp('smith_forge') + 0.10 * bUp('siege_counter');
  turretDps *= 1 + 0.10 * bUp('harbor_ballistae') + 0.05 * bUp('light_signals');
  if (hasSkill('ironclad')) turretDps *= 1.5;
  if (hasSkill('warmachine')) turretDps *= 1 + 0.005 * totalBuildings(); // War Machine
  if (hasTree('war3')) turretDps *= 1.5;               // Siege Doctrine
  if (hasTree('war7')) turretDps *= 2;                 // Cannons
  if (hasTree('warg2')) turretDps *= 2;                // Golden Legions
  turretDps *= (1 + E.turret / 100) * allUnit;

  let clericDps = state.cleric * 60 * Math.pow(1.15, uUp('litanies'));
  clericDps *= Math.pow(1.25, uUp('hymnal'));          // Deeper Litanies training
  if (uUp('consecration')) clericDps *= 1.5;
  clericDps *= 1 + 0.05 * bCount('cathedral');
  clericDps *= 1 + 0.10 * bUp('cath_blessings') + 0.10 * bUp('mona_chants') + 0.10 * bUp('shrine_dawn');
  if (hasSkill('warhymn')) clericDps *= 2;
  if (hasSkill('masshymn'))                            // Mass Hymns
    clericDps *= 1 + 0.03 * (bCount('temple') + bCount('monastery') + bCount('cathedral') + bCount('shrine'));
  if (hasTree('war8')) clericDps *= 2;                 // Holy Crusade
  if (hasTree('wars2')) clericDps *= 2;                // Thunder Choir
  clericDps *= (1 + E.cleric / 100) * allUnit;

  let golemDps = state.golem * 25 * (1 + 0.10 * bCount('smith') + 0.10 * bCount('siegeworkshop') + 0.10 * bCount('foundry'));
  golemDps *= 1 + 0.15 * uUp('plating');
  golemDps *= Math.pow(1.25, uUp('attunement'));       // Core Attunement training
  if (uUp('molten')) golemDps *= 1.5;
  golemDps *= 1 + 0.10 * bUp('siege_counter') + 0.10 * bUp('foundry_runes');
  golemDps *= 1 + 0.10 * bUp('scrip_warglyphs') + 0.05 * bUp('druid_wild');
  if (hasSkill('ironclad')) golemDps *= 1.5;
  if (hasSkill('stonechoir'))                          // Stone Choir
    golemDps *= 1 + 0.02 * (bCount('quarry') + bCount('stonecutter') + bCount('deepmine') + bCount('crystalmine'));
  if (hasTree('wars2')) golemDps *= 2;                 // Thunder Choir
  golemDps *= (1 + E.golem / 100) * allUnit;

  let dragonDps = state.dragon * 500 * Math.pow(1.15, uUp('dragonfire'));
  dragonDps *= Math.pow(1.25, uUp('skymastery'));      // Sky Mastery training
  if (uUp('bond')) dragonDps *= 1.5;
  dragonDps *= 1 + 0.05 * bCount('academy') + 0.03 * bCount('druid');
  dragonDps *= 1 + 0.10 * bUp('acad_roosts') + 0.10 * bUp('obs_charts') +
    0.05 * bUp('tan_saddles') + 0.05 * bUp('druid_wild');
  if (hasSkill('dragonsoul')) dragonDps *= 1.5;
  if (hasSkill('wyrmpact') && night) dragonDps *= 2;   // Wyrm Pact
  if (hasTree('wara2')) dragonDps *= 2;                // Dragon Lords
  dragonDps *= (1 + E.dragon / 100) * allUnit;

  let knightDps = state.knight * 14 * Math.pow(1.15, uUp('lances'));
  knightDps *= Math.pow(1.25, uUp('barding'));         // Warhorse Barding training
  if (uUp('charge')) knightDps *= 1.5;
  knightDps *= 1 + 0.05 * bUp('tan_saddles') + 0.10 * bUp('fishmarket_provisions');
  knightDps *= 1 + 0.03 * bCount('armory');            // armory synergy
  knightDps *= 1 + 0.02 * bCount('tannery') + 0.03 * bCount('fishmarket');
  if (hasSkill('cavalcade')) knightDps *= 2;           // Royal Cavalcade
  if (hasSkill('lancewall'))                           // Wall of Lances
    knightDps *= 1 + 0.03 * (bCount('barracks') + bCount('armory') + bCount('warcollege') + bCount('siegeworkshop'));
  if (hasTree('xwar10')) knightDps *= 2;               // Knightly Orders
  if (hasTree('xwar12')) knightDps *= 1.75;            // Cavalier Banners
  if (hasTree('xwar13')) knightDps *= 2;               // The New Legions
  knightDps *= (1 + E.knight / 100) * allUnit;

  let plagueDps = state.plague * 120 * Math.pow(1.15, uUp('toxins'));
  plagueDps *= Math.pow(1.25, uUp('miasma'));          // Spreading Miasma training
  if (uUp('catalyst')) plagueDps *= 1.5;
  plagueDps *= 1 + 0.05 * bCount('alchemist') + 0.05 * bCount('enchanter');
  plagueDps *= 1 + 0.10 * bUp('alch_warbrew') + 0.10 * bUp('beekeeper_apiary');
  if (hasSkill('pandemic')) plagueDps *= 2;            // Pandemic
  if (hasSkill('corrosion'))                           // Corrosion
    plagueDps *= 1 + 0.02 * (bCount('alchemist') + bCount('enchanter') + bCount('scriptorium') + bCount('beekeeper') + bCount('druid'));
  if (hasTree('xmys10')) plagueDps *= 2;               // Plague Covens
  if (hasTree('xmys11')) plagueDps *= 2;               // Alchemy of War
  if (hasTree('xwar13')) plagueDps *= 2;               // The New Legions
  plagueDps *= (1 + E.plague / 100) * allUnit;

  let valkyrieDps = state.valkyrie * 800 * Math.pow(1.15, uUp('glaives'));
  valkyrieDps *= Math.pow(1.25, uUp('tempest'));       // Tempest Wings training
  if (uUp('valor')) valkyrieDps *= 1.5;
  valkyrieDps *= 1 + 0.05 * bCount('observatory') + 0.03 * bCount('cathedral');
  valkyrieDps *= 1 + 0.10 * bUp('obs_charts') + 0.05 * bUp('light_signals');
  if (hasSkill('ragnarok')) valkyrieDps *= 1.5;        // Ragnarok
  if (hasSkill('stormcall') && night) valkyrieDps *= 2; // Stormcall
  if (hasTree('xwar11')) valkyrieDps *= 2;             // Stormhost
  if (hasTree('xwar12')) valkyrieDps *= 1.75;          // Cavalier Banners
  if (hasTree('xwar13')) valkyrieDps *= 2;             // The New Legions
  valkyrieDps *= (1 + E.valkyrie / 100) * allUnit;

  let wallDps = state.walls * 2;
  wallDps *= 1 + Math.min(0.5, 0.01 * bCount('quarry')) + 0.02 * bCount('stonecutter') + 0.03 * bCount('deepmine');
  wallDps *= 1 + 0.05 * uUp('moat');
  wallDps *= Math.pow(1.2, uUp('garrison'));           // Garrison Drills training
  if (bUp('quarry_masonry')) wallDps *= 1.25;
  if (hasTree('war3')) wallDps *= 1.5;
  wallDps *= allUnit;

  /* ---- WARD UNITS: each scales with the PROGRESS of its outer ward's realm ---- */
  // Rift Reavers — scale with the Rift Portal's best stage
  let reaverDps = state.reaver * 700 * Math.pow(1.15, uUp('rendfang'));
  reaverDps *= Math.pow(1.25, uUp('voidcall'));        // Voidcalling training
  if (uUp('riftpact')) reaverDps *= 1.5;
  reaverDps *= 1 + 0.04 * wardProgPortal();            // +4% per Rift best stage
  reaverDps *= 1 + 0.05 * bCount('magetower') + 0.03 * bCount('observatory') +
    0.03 * bCount('riftbeacon') + 0.03 * bCount('echoarsenal'); // rift conduits
  reaverDps *= 1 + 0.10 * bUp('magetower_rifts') + 0.10 * bUp('echoarsenal_edges') +
    0.02 * bUp('riftbeacon_lenses') * riftWorksMult();
  if (hasSkill('riftsurge')) reaverDps *= 2;           // Rift Surge
  if (hasSkill('riftmaw')) reaverDps *= 1 + 0.01 * portalCardsHeld(); // The Hungering Maw
  if (hasTree('xreav1')) reaverDps *= 2;               // Riftborn Legion
  if (hasTree('xward1')) reaverDps *= 1 + 0.15 * (state.districts.length - 1); // Warden of the Wards
  reaverDps *= (1 + E.reaver / 100) * allUnit;

  // Skyward Seraphs — scale with the Silver Spire's best altitude
  let seraphDps = state.seraph * 1100 * Math.pow(1.15, uUp('radiant'));
  seraphDps *= Math.pow(1.25, uUp('skysong'));         // Choir of the Spire training
  if (uUp('skyrite')) seraphDps *= 1.5;
  seraphDps *= 1 + 0.01 * wardProgSpire();             // +1% per 5m climbed
  seraphDps *= 1 + 0.05 * bCount('cathedral') + 0.03 * bCount('observatory') +
    0.03 * bCount('cloudfoundry') + 0.02 * bCount('wayhouse') + 0.02 * bCount('dawnprism'); // celestial choirs
  seraphDps *= 1 + 0.10 * bUp('obs_seraphs') + 0.10 * bUp('cloudfoundry_anvils') * spireWorksMult();
  if (hasSkill('judgment')) seraphDps *= 2;            // Judgment
  if (state.spire && state.spire.crowned) seraphDps *= 1.5; // the Spire's crown empowers them
  if (hasTree('xser1')) seraphDps *= 2;                // Seraphic Host
  if (hasTree('xward1')) seraphDps *= 1 + 0.15 * (state.districts.length - 1);
  seraphDps *= (1 + E.seraph / 100) * allUnit;

  // Doomforged Reapers — scale with the Tower of Doom's best floor
  let reaperDps = state.reaper * 1500 * Math.pow(1.15, uUp('scythes'));
  reaperDps *= Math.pow(1.25, uUp('infernrite'));      // Infernal Rites training
  if (uUp('doompact')) reaperDps *= 1.5;
  reaperDps *= 1 + 0.04 * wardProgTower();             // +4% per Tower best floor
  reaperDps *= 1 + 0.05 * bCount('foundry') + 0.05 * bCount('siegeworkshop') +
    0.03 * bCount('doomforge') + 0.04 * bCount('reapercloister'); // hellforges
  reaperDps *= 1 + 0.10 * bUp('foundry_doom') + 0.10 * bUp('doomforge_quench') * doomWorksMult() +
    0.10 * bUp('reaper_litany');
  if (night) reaperDps *= 1 + 0.02 * bCount('nightmetronome') + 0.03 * bUp('metronome_mercy');
  if (hasSkill('reaping')) reaperDps *= 2;             // Grim Reaping
  if (hasSkill('doombrand') && night) reaperDps *= 2;  // Brand of Night
  if (hasTree('xreap1')) reaperDps *= 2;               // Legion of Doom
  if (hasTree('xward1')) reaperDps *= 1 + 0.15 * (state.districts.length - 1);
  reaperDps *= (1 + E.reaper / 100) * allUnit;

  // Drowned Leviathan — wakes with every Ascension (the sealed Sunken Ward)
  let leviathanDps = state.leviathan * 2600 * Math.pow(1.15, uUp('barbtide'));
  leviathanDps *= Math.pow(1.25, uUp('deepcall'));     // The Deep Calls training
  if (uUp('abysspact')) leviathanDps *= 1.5;
  leviathanDps *= 1 + 0.20 * wardProgSunken();         // +20% per Ascension
  leviathanDps *= 1 + 0.05 * bCount('harbor') + 0.03 * bCount('wharf') + 0.03 * bCount('fishmarket') +
    0.03 * bCount('tidebreaker') + 0.05 * bCount('leviathannest'); // deep tides
  leviathanDps *= 1 + 0.10 * bUp('harbor_leviathan') + 0.10 * bUp('leviathan_lullaby') +
    0.05 * bUp('tidebreaker_cranes');
  if (hasSkill('tidefury')) leviathanDps *= 2;         // Tidefury
  if (hasSkill('drowning')) leviathanDps *= 1 + 0.02 * state.districts.length; // Drowned Kingdom
  if (hasTree('xlev1')) leviathanDps *= 2;             // Pact of the Deep
  if (hasTree('xward1')) leviathanDps *= 1 + 0.15 * (state.districts.length - 1);
  leviathanDps *= (1 + E.leviathan / 100) * allUnit;

  let dragonDoctrine = 1;
  let valkyrieDoctrine = 1;
  if (hasTree('xwar16')) {
    dragonDoctrine = buildingDoctrineMult(180,
      ['academy', 'druid', 'skyhookyard', 'cloudfoundry'], 100);
    valkyrieDoctrine = buildingDoctrineMult(60,
      ['observatory', 'cathedral', 'cloudfoundry', 'dawnprism'], 100);
    dragonDps *= dragonDoctrine;
    valkyrieDps *= valkyrieDoctrine;
  }

  let wallDoctrine = 1;
  if (hasTree('xind9')) {
    wallDoctrine = buildingDoctrineMult(1000,
      ['quarry', 'stonecutter', 'deepmine', 'barracks', 'armory', 'warcollege', 'siegeworkshop'], 150);
    wallDps *= wallDoctrine;
  }

  let reaverDoctrine = 1;
  let seraphDoctrine = 1;
  let reaperDoctrine = 1;
  let leviathanDoctrine = 1;
  if (hasTree('xward3')) {
    reaverDoctrine = buildingDoctrineMult(30,
      ['riftbeacon', 'riftapothecary', 'voidmarket', 'echoarsenal', 'reliquarypress'], 100);
    seraphDoctrine = buildingDoctrineMult(22,
      ['skyhookyard', 'wayhouse', 'crownarchive', 'cloudfoundry', 'dawnprism'], 100);
    reaperDoctrine = buildingDoctrineMult(12,
      ['doomforge', 'beatfoundry', 'reapercloister', 'bloodtreasury', 'nightmetronome'], 100);
    leviathanDoctrine = buildingDoctrineMult(6,
      ['tidebreaker', 'pearlexchange', 'abyssalvault', 'moonpool', 'leviathannest'], 100);
    reaverDps *= reaverDoctrine;
    seraphDps *= seraphDoctrine;
    reaperDps *= reaperDoctrine;
    leviathanDps *= leviathanDoctrine;
  }

  /* Pantheon of War catches specialist armies up to Ballistae, whose
     building synergies already make them the natural siege benchmark. */
  if (hasTree('xwar6')) {
    archerDps *= 10;
    mageDps *= 10;
    clericDps *= 100;
    golemDps *= 10;
    dragonDps *= 100;
    knightDps *= 10;
    plagueDps *= 10;
    valkyrieDps *= 100;
    wallDps *= 1000000;
    reaverDps *= 100;
    seraphDps *= 100;
    reaperDps *= 100;
    leviathanDps *= 100;
  }

  /* units slain in the Rift fight for nothing until they recover */
  if (typeof portalUnitDead === 'function') {
    if (portalUnitDead('archer')) archerDps = 0;
    if (portalUnitDead('mage')) mageDps = 0;
    if (portalUnitDead('turret')) turretDps = 0;
    if (portalUnitDead('cleric')) clericDps = 0;
    if (portalUnitDead('golem')) golemDps = 0;
    if (portalUnitDead('dragon')) dragonDps = 0;
    if (portalUnitDead('knight')) knightDps = 0;
    if (portalUnitDead('plague')) plagueDps = 0;
    if (portalUnitDead('valkyrie')) valkyrieDps = 0;
    if (portalUnitDead('walls')) wallDps = 0;
    if (portalUnitDead('reaver')) reaverDps = 0;
    if (portalUnitDead('seraph')) seraphDps = 0;
    if (portalUnitDead('reaper')) reaperDps = 0;
    if (portalUnitDead('leviathan')) leviathanDps = 0;
  }

  c.archerDps = archerDps;
  c.mageDps = mageDps;
  c.turretDps = turretDps;
  c.clericDps = clericDps;
  c.golemDps = golemDps;
  c.dragonDps = dragonDps;
  c.knightDps = knightDps;
  c.plagueDps = plagueDps;
  c.valkyrieDps = valkyrieDps;
  c.wallDps = wallDps;
  c.reaverDps = reaverDps;
  c.seraphDps = seraphDps;
  c.reaperDps = reaperDps;
  c.leviathanDps = leviathanDps;
  c.dragonDoctrine = dragonDoctrine;
  c.valkyrieDoctrine = valkyrieDoctrine;
  c.wallDoctrine = wallDoctrine;
  c.reaverDoctrine = reaverDoctrine;
  c.seraphDoctrine = seraphDoctrine;
  c.reaperDoctrine = reaperDoctrine;
  c.leviathanDoctrine = leviathanDoctrine;
  c.dps = archerDps + mageDps + turretDps + clericDps + golemDps + dragonDps +
    knightDps + plagueDps + valkyrieDps + wallDps +
    reaverDps + seraphDps + reaperDps + leviathanDps;

  // click damage
  let click = (1 + state.sword) * Math.pow(2, Math.floor(state.sword / 25));
  if (hasTree('war1')) click *= 2;                     // Sharp Blades
  if (hasTree('war5')) click *= 2;                     // Steel Plate
  if (hasTree('warg3')) click *= 2;                    // Champion of Gold
  click *= 1 + 0.10 * bUp('tavern_rest');
  click *= 1 + Math.min(0.5, 0.005 * bCount('farm')) + Math.min(0.5, 0.01 * bCount('tavern')) + 0.03 * bCount('winery');
  if (night) click *= 1 + Math.min(0.5,
    0.005 * bCount('nightmetronome') + 0.015 * bUp('metronome_mercy'));
  click *= 1 + 0.10 * uUp('fury');
  click *= Math.pow(1.2, uUp('innerfire'));            // Inner Fire training
  click *= 1 + 0.10 * bUp('armory_master') + 0.10 * bUp('ench_blades') + 0.10 * bUp('winery_courage');
  click *= (1 + E.click / 100) * allUnit;
  const spiritBaseClick = click;
  let borrowedClick = 0;
  if (hasSkill('meteor')) borrowedClick += c.dps * 0.0005;
  if (hasTree('wara3')) borrowedClick += c.dps * 0.001; // Avatar of War
  click += borrowedClick;
  c.critChance = Math.min(0.6, 0.02 * uUp('crit') + (hasTree('wars3') ? 0.10 : 0) + (hasTree('xwar3') ? 0.05 : 0)); // Iron Resolve
  c.critMult = hasTree('wars3') ? 4 : 3;               // Eye of the Storm

  // ---- SPIRIT HANDS (the Spirit branch): passive ghost-clicks ----
  let spiritRate = 0;
  if (hasTree('spirit1')) {
    spiritRate = 2;
    if (hasTree('spirit2')) spiritRate += 1;
    if (hasTree('spirit4')) spiritRate += 2;
    if (hasTree('spirit7')) spiritRate += 3;
    if (hasTree('spiritg1')) spiritRate += 4;
    if (hasTree('spirits1')) spiritRate += 6;
    if (hasTree('spirita1')) spiritRate *= 2;          // Legion Eternal
    if (hasTree('spirit9') && night) spiritRate *= 1.25; // Restless Night
  }
  let spiritMult = 1;
  if (hasTree('spirit3')) spiritMult *= 1.5;
  if (hasTree('spirit6')) spiritMult *= 1.5;
  if (hasTree('spirit8')) spiritMult *= 2;
  if (hasTree('spiritg2')) spiritMult *= 2.5;
  if (hasTree('spirita2')) spiritMult *= 4;
  if (hasTree('xspirit1')) spiritMult *= 1 + Math.min(1.5, 0.01 * ownedNodeCount()); // Helpful Haunts
  if (hasTree('xspirit6')) spiritMult *= 1 + Math.min(1, 0.01 * state.ascensions); // Eternal Procession
  c.spiritRate = spiritRate;
  c.spiritDmg = spiritBaseClick * spiritMult + borrowedClick +
    (hasTree('spirits2') ? c.dps * 0.0005 : 0); // Spirit Avatar
  c.spiritCritChance = hasTree('spirit5') ? Math.min(0.75, c.critChance + (hasTree('spirits3') ? 0.15 : 0)) : 0;
  c.spiritCritMult = hasTree('spiritg3') ? 5 : c.critMult;  // Soul Harvest
  c.spiritDps = spiritRate * c.spiritDmg * (1 + c.spiritCritChance * (c.spiritCritMult - 1)) *
    (hasTree('xspirit4') ? 1.15 : 1); // Twin Hauntings
  if (hasTree('spirita3')) click = spiritBaseClick * spiritMult + borrowedClick; // One With the Ghosts

  if (typeof portalUnitDead === 'function' && portalUnitDead('hero')) {
    click = 1; // slain hero: feeble pokes only
    c.spiritRate = 0; c.spiritDmg = 0; c.spiritDps = 0; // his ghosts mourn with him
  }
  c.click = click;
  c.rosterDps = c.dps + c.spiritDps;

  // kill bounty multiplier (on top of monster base gold)
  let killMult = goldMult * (1 + 0.05 * state.walls) * (1 + 0.03 * uUp('banners') + 0.02 * uUp('moat'));
  killMult *= 1 + 0.05 * bCount('mint');
  if (hasSkill('frost')) killMult *= 1.25;
  if (hasSkill('midas')) killMult *= 1.5;
  if (hasSkill('kingsbanner')) killMult *= 1 + 0.01 * state.walls; // Banner of Kings
  if (hasTree('prosg3')) killMult *= 1.5;              // Royal Bounties
  if (hasTree('xpros3')) killMult *= 1 + 0.005 * (state.zone - 1); // War Profiteers
  if (hasTree('xpros5')) killMult *= 1 + 0.02 * state.walls;      // Storm Levies
  if (hasTree('xpros6')) killMult *= 2;                           // Aether Bounties
  killMult *= 1 + E.bounty / 100;
  killMult *= sigilMaster;                             // master multiplier
  c.killMult = killMult;
  /* Night's Embrace: night bounty bonus +50% stronger */
  c.nightBountyMult = 1 + (NIGHT_BOUNTY_MULT - 1) * (hasTree('myss3') ? 1.5 : 1);

  // item drop chance multiplier
  let dropMult = (1 + E.luck / 100) * auraMult;
  dropMult *= 1 + 0.02 * bCount('observatory') + 0.01 * bCount('reliquarypress') +
    0.01 * bCount('abyssalvault') + 0.02 * bUp('abyssal_index');
  if (hasTree('for1')) dropMult *= 1.2;                // Keen Eyes
  if (hasTree('for5')) dropMult *= 1.3;                // Magpie's Instinct
  if (hasTree('forg3')) dropMult *= 1.4;               // Deep Pockets
  if (hasTree('xfor4')) dropMult *= 1 + 0.10 * gatesOwned; // Hoard Sense
  if (hasTree('xcrown3')) dropMult *= 1 + Math.min(0.6, 0.02 * pendingSigils()); // Tribute Fleets
  if (night) {
    let nightMult = hasTree('mys9') ? NIGHT_DROP_MULT * 2 : NIGHT_DROP_MULT;
    if (hasTree('mys6')) nightMult *= 1.5;             // Astral Clock
    if (hasTree('myss3')) nightMult *= 1.5;            // Night's Embrace
    if (hasTree('xfor5')) nightMult *= 1.5;            // Lightning Luck
    nightMult *= 1 + 0.02 * bUp('dawnprism_facets') + 0.03 * bUp('moonpool_tides') +
      0.01 * bCount('moonpool');
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
    case 'knight': return C.knightDps;
    case 'plague': return C.plagueDps;
    case 'valkyrie': return C.valkyrieDps;
    case 'reaver': return C.reaverDps;
    case 'seraph': return C.seraphDps;
    case 'reaper': return C.reaperDps;
    case 'leviathan': return C.leviathanDps;
    default: return C.wallDps;
  }
}

function unitUnlocked(u) {
  if (!u.unlock) return true;
  if (u.unlock.ward) return wardUnitUnlocked(u.unlock.ward);
  return state.highestZone >= u.unlock.zone;
}

/* ward units unlock when their outer ward is first claimed — and STAY
   unlocked forever after (like the gamemode gates), even though the ward
   itself resets on Ascension. */
function wardUnitUnlocked(key) {
  return !!(state.wardUnits && state.wardUnits[key]) || state.districts.includes(key);
}

/* lock-screen blurb for a unit that isn't unlocked yet */
function unitUnlockText(u) {
  if (u.unlock && u.unlock.ward)
    return 'Claim the ' + (DISTRICT_NAMES[u.unlock.ward] || 'ward') + ' to recruit';
  return 'Unlocks at Zone ' + fmt(u.unlock ? u.unlock.zone : 0) + ' (best: ' + fmt(state.highestZone) + ')';
}

/* ---- ward progress: drives ward-unit scaling (all lifetime/permanent) ---- */
function wardProgPortal() { return (state.portal && state.portal.best) || 0; }   // best Rift stage
function wardProgTower()  { return (state.tower && state.tower.best) || 0; }     // best Tower floor
function wardProgSpire()  { return Math.floor(((state.spire && state.spire.bestM) || 0) / 5); } // per 5m
function wardProgSunken() { return state.ascensions || 0; }                      // Ascensions performed
function portalCardsHeld() { return (state.portal && state.portal.cards && state.portal.cards.length) || 0; }

function treeBoost(id) { return hasTree(id) ? 1.5 : 1; }
function riftWorksMult() { return treeBoost('xrift5'); }
function spireWorksMult() { return treeBoost('xspire5'); }
function doomWorksMult() { return treeBoost('xtow4'); }
function sunkenWorksMult() { return hasTree('xdeep1') ? 1.5 : 1; }

function outerWardUpgradeLevels() {
  let n = 0;
  for (const bid in BUILDING_UPGRADES) {
    if (!OUTER_WARD_KEYS.includes(BUILDING_DISTRICT[bid])) continue;
    for (const up of BUILDING_UPGRADES[bid]) n += bUp(up.id);
  }
  return n;
}

/* ---------------- economy ---------------- */

function costDisc() {
  let disc = hasTree('pros3') ? 0.9 : 1;
  if (hasTree('pros6')) disc *= 0.9;    // Guild Charters
  if (hasTree('prosi2')) disc *= 0.9;   // Royal Monopoly
  if (hasTree('pross2')) disc *= 0.85;  // Philosopher Kings
  if (hasTree('inda3')) disc *= 0.9;    // World Engine
  return disc;
}

/* Blueprints: building cost growth eases from x1.15 to x1.14 per owned */
function costGrowth() {
  return hasTree('xind7') ? 1.14 : COST_GROWTH;
}

function buildingCost(b, owned, amount) {
  const disc = costDisc();
  const g = costGrowth();
  const total = {};
  const n = Math.max(0, Math.floor(amount));
  if (!n) return total;
  if (n === 1) {
    for (const res in b.cost)
      total[res] = Math.ceil(b.cost[res] * Math.pow(g, owned) * disc);
    return total;
  }
  const growthSum = Math.pow(g, owned) * (Math.pow(g, n) - 1) / (g - 1);
  for (const res in b.cost) {
    total[res] = Math.ceil(b.cost[res] * growthSum * disc);
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

/* how many can we afford right now? Monotonic binary search avoids summing
   thousands of exponential terms for every shop row on every game tick. */
function maxAffordable(b) {
  const owned = bCount(b.id);
  const lim = hasTree('auto10') ? 5000 : 1000; // Court of Cogs
  let low = 0, high = lim;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (canAfford(buildingCost(b, owned, mid))) low = mid;
    else high = mid - 1;
  }
  return low;
}

/* resolve the buy-amount mode into a concrete count for this building */
function resolveAmount(b) {
  const mode = buyAmountFor('build');
  if (mode === 'max') return Math.max(1, maxAffordable(b));
  if (mode === 'next10') {
    const rem = bCount(b.id) % 10;
    return rem === 0 ? 10 : 10 - rem;
  }
  if (mode === 'next100') {
    const rem = bCount(b.id) % 100;
    return rem === 0 ? 100 : 100 - rem;
  }
  return Number(mode) || 1;
}

function buyBuilding(id) {
  if (!districtOwnedFor(id)) return;
  const b = BUILDINGS.find(x => x.id === id);
  const amt = buyAmountFor('build') === 'max' ? maxAffordable(b) : resolveAmount(b);
  if (amt < 1) return;
  const cost = buildingCost(b, bCount(id), amt);
  if (!canAfford(cost)) return;
  pay(cost);
  state.buildings[id] = bCount(id) + amt;
  state.totalBuildingsBought += amt;
  toast(b.name + ' built! (x' + fmt(bCount(id)) + ')');
  renderCity();
  refreshShop();
}

function buyBuildingOne(id, deferRender, knownCost) {
  if (!districtOwnedFor(id)) return;
  const b = BUILDINGS.find(x => x.id === id);
  const cost = knownCost || buildingCost(b, bCount(id), 1);
  if (!canAfford(cost)) return false;
  pay(cost);
  state.buildings[id] = bCount(id) + 1;
  state.totalBuildingsBought++;
  if (!deferRender) renderCity();
  return true;
}

/* buy ONE level of a building upgrade (greedy loops use this) */
function buyBuildingUpgradeStep(bid, upId, deferRender) {
  const up = (BUILDING_UPGRADES[bid] || []).find(u => u.id === upId);
  const lvl = bUp(upId);
  if (lvl >= up.max || bCount(bid) < 1) return false;
  const cost = ceilCost(up.cost(lvl));
  if (!canAfford(cost)) return false;
  pay(cost);
  state.bUp[upId] = lvl + 1;
  if (!deferRender && state.bUp[upId] >= up.max) renderCity(); // maybe earn the golden pennant
  return true;
}

function buyBuildingUpgrade(bid, upId) {
  const up = (BUILDING_UPGRADES[bid] || []).find(u => u.id === upId);
  const batch = subBatch(up.cost, bUp(upId), up.max);
  if (!batch.n || !canAfford(batch.cost)) return;
  let n = 0;
  while (n < batch.n && buyBuildingUpgradeStep(bid, upId)) n++;
  if (n) toast(up.name + ' Lv.' + bUp(upId) + '!');
}

function buyUnitMain(unitId) {
  const u = UNITS.find(x => x.id === unitId);
  if (!unitUnlocked(u)) return;
  const batch = subBatch(u.main.cost, state[u.statKey], Infinity, 'unit');
  const want = batch.n;
  if (!want || !batch.cost || !canAfford(batch.cost)) return;
  let bought = 0;
  while (bought < want) {
    const cost = ceilCost(u.main.cost(state[u.statKey]));
    if (!canAfford(cost)) break; // should only happen if another click spent resources first
    pay(cost);
    state[u.statKey]++;
    bought++;
  }
  if (!bought) return;
  state.totalUnitsBought += bought;
  if (typeof ambientRebuild === 'function') ambientRebuild(); // patrols reflect the army
}

/* buy ONE level of a unit sub-upgrade */
function buyUnitSubStep(unitId, subId) {
  const u = UNITS.find(x => x.id === unitId);
  const sub = u.subs.find(s => s.id === subId);
  const lvl = subLvl(sub);
  if (lvl >= sub.max) return false;
  const cost = ceilCost(sub.cost(lvl));
  if (!canAfford(cost)) return false;
  pay(cost);
  if (sub.statKey) state[sub.statKey]++;
  else state.unitUp[sub.id] = lvl + 1;
  return true;
}

function buyUnitSub(unitId, subId) {
  const u = UNITS.find(x => x.id === unitId);
  const sub = u.subs.find(s => s.id === subId);
  const batch = subBatch(sub.cost, subLvl(sub), sub.max, 'unit');
  if (!batch.n || !canAfford(batch.cost)) return;
  let n = 0;
  while (n < batch.n && buyUnitSubStep(unitId, subId)) n++;
}

/* ---- BUY ALL: greedy cheapest-first until the coffers run dry ---- */

function buyAllUnitUpgradesFor(unitId) {
  const u = UNITS.find(x => x.id === unitId);
  let total = 0, guard = 0;
  while (guard++ < 300) {
    let best = null;
    for (const sub of u.subs) {
      const lvl = subLvl(sub);
      if (lvl >= sub.max) continue;
      const cost = ceilCost(sub.cost(lvl));
      if (!canAfford(cost)) continue;
      const s = costScore(cost);
      if (!best || s < best.s) best = { sid: sub.id, s };
    }
    if (!best || !buyUnitSubStep(unitId, best.sid)) break;
    total++;
  }
  toast(total ? u.name + ': bought ' + total + ' upgrade level(s)!' : 'No affordable upgrades.');
}

function buyAllBuildingUpgradesFor(bid) {
  const ups = BUILDING_UPGRADES[bid] || [];
  let total = 0, guard = 0;
  while (guard++ < 300) {
    let best = null;
    for (const up of ups) {
      const lvl = bUp(up.id);
      if (lvl >= up.max) continue;
      const cost = ceilCost(up.cost(lvl));
      if (!canAfford(cost)) continue;
      const s = costScore(cost);
      if (!best || s < best.s) best = { uid: up.id, s };
    }
    if (!best || !buyBuildingUpgradeStep(bid, best.uid)) break;
    total++;
  }
  const b = BUILDINGS.find(x => x.id === bid);
  toast(total ? b.name + ': bought ' + total + ' upgrade level(s)!' : 'No affordable upgrades.');
}

function buyAllBuildingUpgrades() {
  let total = 0, guard = 0;
  while (guard++ < 500) {
    let best = null;
    for (const bid in BUILDING_UPGRADES) {
      if (bCount(bid) < 1) continue;
      for (const up of BUILDING_UPGRADES[bid]) {
        const lvl = bUp(up.id);
        if (lvl >= up.max) continue;
        const cost = ceilCost(up.cost(lvl));
        if (!canAfford(cost)) continue;
        const s = costScore(cost);
        if (!best || s < best.s) best = { bid, uid: up.id, s };
      }
    }
    if (!best || !buyBuildingUpgradeStep(best.bid, best.uid)) break;
    total++;
  }
  toast(total ? 'ROYAL WORKS: bought ' + total + ' upgrade level(s)!' : 'No affordable building upgrades.');
  if (rightTab === 'upgr' && !currentDetail) syncRightPanel();
}

/* ---------------- AUTOMATION (the 8th branch) ----------------
   Lategame toggles: silent greedy buyers run on a timer.
   Batches are small so a tick never stalls the frame.           */

function autoToggleBtn(flag, nodeId, label, title) {
  if (!hasTree(nodeId)) return null;
  const btn = document.createElement('button');
  const paint = () => {
    btn.className = 'menu-btn auto-toggle' + (state.autoOn[flag] ? ' on' : '');
    btn.textContent = (state.autoOn[flag] ? '⚙ ON · ' : '⚙ OFF · ') + label;
  };
  btn.title = title;
  btn.onclick = () => { state.autoOn[flag] = !state.autoOn[flag]; paint(); save(); };
  paint();
  return btn;
}

const AUTO_MODE_DEFS = [
  { flag: 'bup', node: 'auto13', label: 'BUILDING UPGRADES', desc: 'Buys the cheapest affordable building upgrade.' },
  { flag: 'uup', node: 'auto14', label: 'UNIT UPGRADES', desc: 'Buys the cheapest affordable unit upgrade.' },
  { flag: 'build', node: 'auto15', label: 'BUILDINGS', desc: 'Builds the cheapest affordable building across owned districts.' },
  { flag: 'unit', node: 'auto21', label: 'UNITS', desc: 'Buys the cheapest recruit, training level, hero level, or wall level.' },
  { flag: 'equip', node: 'auto9', label: 'AUTO-EQUIP', desc: 'Rebuilds active-unit loadouts: most affixes first, then highest tier.' },
  { flag: 'skill', node: 'auto16', label: 'ARCANE SKILLS', desc: 'Learns affordable Arcane Skills.' },
  { flag: 'forge', node: 'auto17', label: 'FORGE BAG', desc: 'Combines identical item pairs across the bag.' },
  { flag: 'fuse', node: 'auto19', label: 'FUSE AFFIXES', desc: 'Fuses compatible affixed items into multi-affix relics.' },
];

const NOTIFY_MODE_DEFS = [
  { key: 'item', node: 'auton1', label: 'ITEM DROPS', desc: 'Routine monster loot and twin-drop notices.' },
  { key: 'chest', node: 'auton2', label: 'CHESTS', desc: 'Treasure chest rewards and jackpots.' },
  { key: 'building', node: 'auton3', label: 'BUILDING OUTPUT', desc: 'Printed items and Portal supplies made by buildings.' },
];

function autoBuildPeriod() {
  if (hasTree('auto18') || hasTree('xauto2')) return 1;
  if (hasTree('xauto1')) return 2;
  return 5;
}

function autoBuildBatch() {
  if (hasTree('auto18')) return 100;
  if (hasTree('xauto2')) return 50;
  if (hasTree('xauto1')) return 15;
  return 5;
}

function autoBuildRate() {
  return autoBuildBatch() / autoBuildPeriod();
}

function autoUnitRate() {
  if (hasTree('xauto4') && hasTree('auto18')) return 100;
  if (hasTree('xauto4')) return 50;
  if (hasTree('xauto3')) return 10;
  return 1;
}

function autoModePeriod(flag) {
  if (flag === 'build' || flag === 'unit') return 0;
  if (hasTree('auto18')) return 1;
  return flag === 'forge' || flag === 'fuse' ? 10 : 5;
}

function autoUnlockText(nodeId) {
  const node = PRESTIGE_TREE.find(n => n.id === nodeId);
  return node ? 'Unlock in Ascension: ' + node.name + '.' : 'Unlock in Ascension.';
}

function automationModeRow(parent, def) {
  const row = document.createElement('div');
  row.className = 'auto-mode-row';
  const btn = document.createElement('button');
  row.appendChild(btn);
  const body = document.createElement('div');
  body.className = 'auto-mode-copy';
  body.innerHTML = '<div class="auto-mode-name">' + def.label + '</div><div class="auto-mode-desc">' + def.desc + '</div><div class="auto-mode-rate"></div>';
  row.appendChild(body);
  const rate = body.querySelector('.auto-mode-rate');

  const paint = () => {
    const unlocked = hasTree(def.node);
    btn.className = 'menu-btn auto-toggle' + (unlocked && state.autoOn[def.flag] ? ' on' : '');
    btn.disabled = !unlocked;
    btn.textContent = unlocked ? (state.autoOn[def.flag] ? 'ON' : 'OFF') : '🔒';
    btn.title = unlocked ? 'Toggle ' + def.label + '.' : autoUnlockText(def.node);
    rate.textContent = unlocked
      ? (def.flag === 'equip'
        ? 'Rechecks whenever the bag or equipped gear changes.'
        : def.flag === 'build' || def.flag === 'unit'
        ? 'Runs continuously at up to ' + fmt(def.flag === 'build' ? autoBuildRate() : autoUnitRate()) +
          (def.flag === 'build' ? ' buildings/s.' : ' units/s.')
        : 'Runs every ' + autoModePeriod(def.flag) + 's.')
      : autoUnlockText(def.node);
  };
  btn.onclick = () => {
    if (!hasTree(def.node)) return;
    state.autoOn[def.flag] = !state.autoOn[def.flag];
    if (def.flag === 'equip' && state.autoOn.equip) autoEquipBest();
    paint();
    save();
  };
  paint();
  viewUpdaters.push(paint);
  parent.appendChild(row);
}

function notificationModeRow(parent, def) {
  if (!hasTree(def.node)) return;
  const row = document.createElement('div');
  row.className = 'auto-mode-row notify-mode-row';
  const btn = document.createElement('button');
  const body = document.createElement('div');
  body.className = 'auto-mode-copy';
  body.innerHTML = '<div class="auto-mode-name">' + def.label + '</div><div class="auto-mode-desc">' + def.desc + '</div>';
  const paint = () => {
    const hidden = !!state.notifyOff[def.key];
    btn.className = 'menu-btn auto-toggle' + (hidden ? ' on' : '');
    btn.textContent = hidden ? 'HIDDEN' : 'SHOWN';
    btn.title = hidden ? 'Show these notifications.' : 'Hide these notifications.';
  };
  btn.onclick = () => {
    state.notifyOff[def.key] = !state.notifyOff[def.key];
    paint();
    save();
  };
  paint();
  row.appendChild(btn);
  row.appendChild(body);
  parent.appendChild(row);
}

function renderAutomationTab() {
  const list = $('auto-list');
  list.innerHTML = '';

  sectionTitle(list, 'MODES');
  for (const def of AUTO_MODE_DEFS) automationModeRow(list, def);

  sectionTitle(list, 'BUILD SPEED');
  const speed = document.createElement('div');
  speed.className = 'automation-note';
  speed.innerHTML =
    '<div><b>Auto-build rate:</b> up to ' + fmt(autoBuildRate()) + ' building(s) per second</div>' +
    '<div><b>Auto-recruit rate:</b> up to ' + fmt(autoUnitRate()) + ' unit(s) per second</div>' +
    '<div><b>Workload:</b> purchases are spread across game ticks for smoother input</div>' +
    '<div>' + (hasTree('xauto1') ? 'Fast Foremen owned.' : autoUnlockText('xauto1')) + '</div>' +
    '<div>' + (hasTree('xauto2') ? 'Instant Blueprints owned.' : autoUnlockText('xauto2')) + '</div>' +
    '<div>' + (hasTree('xauto3') ? 'Muster Drums owned.' : autoUnlockText('xauto3')) + '</div>' +
    '<div>' + (hasTree('xauto4') ? 'Legion Foundry owned.' : autoUnlockText('xauto4')) + '</div>';
  list.appendChild(speed);

  if (NOTIFY_MODE_DEFS.some(def => hasTree(def.node))) {
    sectionTitle(list, 'NOTIFICATIONS');
    for (const def of NOTIFY_MODE_DEFS) notificationModeRow(list, def);
  }
}

function autoBuyBuildingUpgrades() {
  let guard = 0, bought = 0, cityChanged = false;
  while (guard++ < 40) {
    let best = null;
    for (const bid in BUILDING_UPGRADES) {
      if (bCount(bid) < 1) continue;
      for (const up of BUILDING_UPGRADES[bid]) {
        const lvl = bUp(up.id);
        if (lvl >= up.max) continue;
        const cost = ceilCost(up.cost(lvl));
        if (!canAfford(cost)) continue;
        const s = costScore(cost);
        if (!best || s < best.s) best = { bid, uid: up.id, s };
      }
    }
    if (!best) break;
    const up = BUILDING_UPGRADES[best.bid].find(x => x.id === best.uid);
    if (!buyBuildingUpgradeStep(best.bid, best.uid, true)) break;
    bought++;
    if (bUp(best.uid) >= up.max) cityChanged = true;
  }
  if (cityChanged) renderCity();
  return bought;
}

function autoBuyUnitUpgrades() {
  let guard = 0;
  while (guard++ < 40) {
    let best = null;
    for (const u of UNITS) {
      if (!unitUnlocked(u)) continue;
      if (u.id !== 'hero' && state[u.statKey] < 1) continue;
      for (const sub of u.subs) {
        const lvl = subLvl(sub);
        if (lvl >= sub.max) continue;
        const cost = ceilCost(sub.cost(lvl));
        if (!canAfford(cost)) continue;
        const s = costScore(cost);
        if (!best || s < best.s) best = { uid: u.id, sid: sub.id, s };
      }
    }
    if (!best || !buyUnitSubStep(best.uid, best.sid)) break;
  }
}

/* Reused records keep continuous autobuy from creating fresh arrays and
   candidate objects every tick, reducing long-session garbage collection. */
const autoBuildingCandidates = BUILDINGS.map(b => ({ b, cost: null, active: false }));
const autoUnitCandidates = UNITS.map(u => ({ u, cost: null, active: false }));

function autoBuyBuildings(limit) {
  let bought = 0;
  const batch = Math.max(1, Math.min(autoBuildBatch(), Math.floor(limit || autoBuildBatch())));
  for (const candidate of autoBuildingCandidates) {
    candidate.active = districtOwnedFor(candidate.b.id);
    if (candidate.active)
      candidate.cost = buildingCost(candidate.b, bCount(candidate.b.id), 1);
  }
  const changedIds = new Set();
  const ambientTierBefore = Math.floor(totalBuildings() / 5);
  let cityStructureChanged = false;
  for (let i = 0; i < batch; i++) {
    let best = null, bestScore = Infinity;
    for (const candidate of autoBuildingCandidates) {
      if (!candidate.active) continue;
      if (!canAfford(candidate.cost)) continue;
      const s = costScore(candidate.cost);
      if (s < bestScore) {
        best = candidate;
        bestScore = s;
      }
    }
    if (!best) break;
    const b = best.b;
    const before = bCount(b.id);
    if (!cityStructureChanged) {
      const spots = (PLOTS[b.id] || [[ROAD_X, ROAD_Y]])
        .filter(([x, y]) => plotAvailable(x, y)).length;
      cityStructureChanged = Math.min(before + 1, spots) !== Math.min(before, spots);
    }
    if (!buyBuildingOne(b.id, true, best.cost)) break;
    best.cost = buildingCost(b, bCount(b.id), 1);
    changedIds.add(b.id);
    bought++;
  }
  if (bought) {
    queueAutoCityRefresh(changedIds, cityStructureChanged,
      Math.floor(totalBuildings() / 5) !== ambientTierBefore);
  }
  return bought;
}

function autoBuyUnits(limit) {
  let bought = 0;
  const batch = Math.max(1, Math.floor(limit || 1));
  const visualBefore = unitAmbientSignature();
  for (const candidate of autoUnitCandidates) {
    candidate.active = unitUnlocked(candidate.u);
    if (candidate.active)
      candidate.cost = ceilCost(candidate.u.main.cost(state[candidate.u.statKey]));
  }
  for (let i = 0; i < batch; i++) {
    let best = null, bestScore = Infinity;
    for (const candidate of autoUnitCandidates) {
      if (!candidate.active) continue;
      if (!canAfford(candidate.cost)) continue;
      const score = costScore(candidate.cost);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) break;
    const u = best.u;
    pay(best.cost);
    state[u.statKey]++;
    state.totalUnitsBought++;
    best.cost = ceilCost(u.main.cost(state[u.statKey]));
    bought++;
  }
  if (bought && unitAmbientSignature() !== visualBefore) autoUnitVisualPending = true;
  return bought;
}

function unitAmbientSignature() {
  const unitTier = Math.floor((state.totalUnitsBought || 0) / 100);
  const villagerCount = Math.min(2 + Math.floor(totalBuildings() / 5) + unitTier * 2, 36);
  const patrolCap = Math.min(12 + unitTier * 2, 28);
  const roster = UNITS.filter(u => u.id !== 'walls' && state[u.statKey] > 0)
    .map(u => u.id + ((u.id === 'archer' || u.id === 'mage') && state[u.statKey] >= 15 ? '2' : '1'))
    .join(',');
  return villagerCount + '|' + patrolCap + '|' + roster;
}

function autoLearnSkills() {
  let learned = 0;
  for (const s of SKILLS) {
    if (hasSkill(s.id)) continue;
    if (canAfford({ mana: Math.ceil(s.cost.mana * skillCostMult()) }) && buySkill(s.id, true)) learned++;
  }
  return learned;
}

let autoBuildAcc = 0, autoUnitAcc = 0, autoAcc = -0.25, autoForgeAcc = -0.5, autoFuseAcc = -0.75;
let autoCityRefreshAcc = 0, autoCityStructurePending = false, autoCityAmbientPending = false;
const autoCityChangedIds = new Set();
let autoForgeSeenVersion = -1, autoFuseSeenVersion = -1;
let autoEquipSeenVersion = -1;
let autoFusePending = false;
let autoUnitVisualAcc = 0, autoUnitVisualPending = false;

function queueAutoCityRefresh(ids, fullRender, ambient) {
  for (const id of ids) autoCityChangedIds.add(id);
  if (fullRender) autoCityStructurePending = true;
  if (ambient) autoCityAmbientPending = true;
}

function flushAutoCityRefresh(dt) {
  if (!autoCityChangedIds.size && !autoCityStructurePending && !autoCityAmbientPending) {
    autoCityRefreshAcc = 0;
    return;
  }
  autoCityRefreshAcc += dt;
  if (autoCityRefreshAcc < 0.25) return;
  autoCityRefreshAcc = 0;
  if (autoCityStructurePending) {
    renderCityBuildings(autoCityChangedIds);
    if (autoCityAmbientPending && typeof ambientRebuild === 'function') ambientRebuild();
  } else {
    refreshCityBuildingCounts(autoCityChangedIds);
    if (autoCityAmbientPending && typeof ambientRebuild === 'function') ambientRebuild();
  }
  autoCityChangedIds.clear();
  autoCityStructurePending = false;
  autoCityAmbientPending = false;
}

function runAutomations(dt) {
  const perfAll = perfStart();
  const a = state.autoOn;
  if (!a) {
    perfEnd('Automation total', perfAll);
    return;
  }

  if (a.equip && hasTree('auto9') && autoEquipSeenVersion !== invVersion) {
    const started = perfStart();
    autoEquipBest();
    perfEnd('Auto: equipment', started);
  }

  if (a.build && hasTree('auto15')) {
    autoBuildAcc += dt * autoBuildRate();
    const maxSlice = Math.max(1, Math.ceil(autoBuildRate() * TICK_MS / 1000));
    const due = Math.min(Math.floor(autoBuildAcc + 1e-9), maxSlice);
    if (due > 0) {
      autoBuildAcc -= due;
      const started = perfStart();
      if (autoBuyBuildings(due) < due) autoBuildAcc = 0;
      perfEnd('Auto: buildings', started);
    }
  } else {
    autoBuildAcc = 0;
  }

  if (a.unit && hasTree('auto21')) {
    autoUnitAcc += dt * autoUnitRate();
    const maxSlice = Math.max(1, Math.ceil(autoUnitRate() * TICK_MS / 1000));
    const due = Math.min(Math.floor(autoUnitAcc + 1e-9), maxSlice);
    if (due > 0) {
      autoUnitAcc -= due;
      const started = perfStart();
      if (autoBuyUnits(due) < due) autoUnitAcc = 0;
      perfEnd('Auto: units', started);
    }
  } else {
    autoUnitAcc = 0;
  }
  if (autoUnitVisualPending) {
    autoUnitVisualAcc += dt;
    if (autoUnitVisualAcc >= 2) {
      autoUnitVisualAcc = 0;
      autoUnitVisualPending = false;
      if (typeof ambientRebuild === 'function') ambientRebuild();
    }
  } else {
    autoUnitVisualAcc = 0;
  }
  if (a.forge && hasTree('auto17')) {
    autoForgeAcc += dt;
    const period = hasTree('auto18') ? 1 : 10;
    if (autoForgeAcc >= period) {
      autoForgeAcc = 0;
      if (autoForgeSeenVersion !== invVersion) {
        forgeAll(true);
        autoForgeSeenVersion = invVersion;
      }
    }
  }

  if (a.fuse && hasTree('auto19')) {
    autoFuseAcc += dt;
    const period = hasTree('auto18') ? 1 : 10;
    if (autoFuseAcc >= period) {
      autoFuseAcc = 0;
      if (autoFuseSeenVersion !== invVersion) {
        fuseAll(true);
        autoFuseSeenVersion = autoFusePending ? -1 : invVersion;
      }
    }
  }

  flushAutoCityRefresh(dt);

  autoAcc += dt;
  const period = hasTree('auto18') ? 1 : 5; // the Grand Automaton never rests
  if (autoAcc < period) {
    perfEnd('Automation total', perfAll);
    return;
  }
  autoAcc = 0;
  if (a.bup && hasTree('auto13')) {
    const started = perfStart();
    autoBuyBuildingUpgrades();
    perfEnd('Auto: building upgrades', started);
  }
  if (a.uup && hasTree('auto14')) {
    const started = perfStart();
    autoBuyUnitUpgrades();
    perfEnd('Auto: unit upgrades', started);
  }
  if (a.skill && hasTree('auto16')) {
    const started = perfStart();
    autoLearnSkills();
    perfEnd('Auto: skills', started);
  }
  perfEnd('Automation total', perfAll);
}

function autoEquipItemCompare(a, b) {
  const affixDiff = affixList(b.a).length - affixList(a.a).length;
  if (affixDiff) return affixDiff;
  if (b.tier !== a.tier) return b.tier - a.tier;
  const valueA = effItemValue(a.t, a.tier) +
    affixList(a.a).reduce((sum, t) => sum + (ITEMS[t] ? effItemValue(t, a.tier) * affixFactor() : 0), 0);
  const valueB = effItemValue(b.t, b.tier) +
    affixList(b.a).reduce((sum, t) => sum + (ITEMS[t] ? effItemValue(t, b.tier) * affixFactor() : 0), 0);
  return valueB - valueA || invKey(a.t, a.tier, a.a).localeCompare(invKey(b.t, b.tier, b.a));
}

function autoEquipBest(notificationCategory) {
  if (!hasTree('auto9') || !state.autoOn.equip) return 0;
  const activeUnits = UNITS.filter(u => unitActive(u.id) && Array.isArray(state.equip[u.id]))
    .sort((a, b) => (a.id === 'hero' ? -1 : b.id === 'hero' ? 1 : 0));
  if (!activeUnits.length) return 0;

  const pool = new Map();
  for (const [key, n] of Object.entries(state.inv)) if (n > 0) pool.set(key, n);
  const before = {};
  for (const u of activeUnits) {
    before[u.id] = state.equip[u.id].map(it => it ? invKey(it.t, it.tier, it.a) : '');
    for (const it of state.equip[u.id]) {
      if (!it) continue;
      const key = invKey(it.t, it.tier, it.a);
      pool.set(key, (pool.get(key) || 0) + 1);
    }
    state.equip[u.id].fill(null);
  }

  const entries = [...pool.entries()].map(([key, n]) => Object.assign(invParse(key), { key, n }))
    .sort(autoEquipItemCompare);
  for (const u of activeUnits) {
    for (let slot = 0; slot < state.equip[u.id].length; slot++) {
      const best = entries.find(e => e.n > 0 && itemAllowed(e.t, u.id));
      if (!best) break;
      state.equip[u.id][slot] = { t: best.t, tier: best.tier, a: best.a || null };
      best.n--;
    }
  }

  const nextInv = {};
  for (const e of entries) if (e.n > 0) nextInv[e.key] = e.n;
  state.inv = nextInv;
  let changed = 0;
  for (const u of activeUnits) {
    const after = state.equip[u.id].map(it => it ? invKey(it.t, it.tier, it.a) : '');
    for (let i = 0; i < after.length; i++) if (after[i] !== before[u.id][i]) changed++;
  }
  invDirty = true;
  invVersion++;
  autoEquipSeenVersion = invVersion;
  if (changed) {
    toast('AUTO-EQUIP: optimized ' + fmt(changed) + ' equipment slot(s).', notificationCategory || 'item');
    if (currentDetail && currentDetail.kind === 'unit') rebuildDetail();
  }
  return changed;
}

/* Inventory changes prompt a full Animated Armory loadout check. */
function autoEquipDrop(t, tier, a, notificationCategory) {
  autoEquipBest(notificationCategory);
}

function skillCostMult() {
  return (hasTree('mys2') ? 0.5 : 1) * (hasTree('mysg3') ? 0.5 : 1);
}

function buySkill(id, quiet) {
  const s = SKILLS.find(x => x.id === id);
  if (hasSkill(id)) return false;
  const cost = { mana: Math.ceil(s.cost.mana * skillCostMult()) };
  if (!canAfford(cost)) return false;
  pay(cost);
  state.skills[id] = true;
  if (!quiet) toast('Skill learned: ' + s.name + '!');
  return true;
}

/* ---------------- items & inventory ---------------- */

let invDirty = true, invVersion = 0, lastBagRenderAt = 0;

/* inventory keys: "type:tier" or "type:tier:affix" */
function invKey(t, tier, a) { return t + ':' + tier + (a ? ':' + a : ''); }
function invParse(k) {
  const p = k.split(':');
  return { t: p[0], tier: +p[1], a: p[2] || null };
}
function invCount(t, tier, a) { return state.inv[invKey(t, tier, a)] || 0; }

function invAdd(t, tier, n, a) {
  if (!n) return;
  const k = invKey(t, tier, a);
  state.inv[k] = (state.inv[k] || 0) + n;
  if (state.inv[k] <= 0) delete state.inv[k];
  invDirty = true;
  invVersion++;
}

function invTotal() {
  return Object.values(state.inv).reduce((a, b) => a + b, 0);
}

/* random drop: Quality Smithing can raise the tier,
   Mystic/Master Forging can roll a random affix */
function rollDrop(extraTier, extraAffixChance) {
  const types = Object.keys(ITEMS);
  const t = types[Math.floor(Math.random() * types.length)];
  let tier = 1 + (extraTier || 0);
  const upChance = hasTree('for9') ? 0.5 : hasTree('for4') ? 0.25 : 0;
  if (Math.random() < upChance) tier += 1;
  if (hasTree('fors1') && Math.random() < 0.2) tier += 2;  // Storm Salvage
  if (hasTree('fora3')) tier += 1;                         // Aether Reliquary
  let a = null;
  const affixChance = Math.min(1, (hasTree('fora1') ? 1 : hasTree('for7') ? 0.5 : 0) + (extraAffixChance || 0));
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
  toast('LOOT: ' + itemName(d.t, d.tier, d.a) + (isBoss ? ' (boss)' : '') + '!', 'item');
  spawnFloater('ITEM!', 'item');
  autoEquipDrop(d.t, d.tier, d.a); // Animated Armory
  if (hasTree('fors2') && Math.random() < 0.25) {     // Twin Drops
    const d2 = rollDrop();
    invAdd(d2.t, d2.tier, 1, d2.a);
    state.stats.itemsFound++;
    toast('TWIN DROP: ' + itemName(d2.t, d2.tier, d2.a) + '!', 'item');
    autoEquipDrop(d2.t, d2.tier, d2.a);
  }
}

function grantPrintedItem(label, extraTier, extraAffixChance) {
  const d = rollDrop(extraTier || 0, extraAffixChance || 0);
  invAdd(d.t, d.tier, 1, d.a);
  state.stats.itemsFound++;
  autoEquipDrop(d.t, d.tier, d.a, 'building');
  invDirty = true;
  toast(label + ': ' + itemName(d.t, d.tier, d.a) + '!', 'building');
}

function tickEndgameBuildings(dt) {
  if (!state.endgameTimers) state.endgameTimers = { item: 0, pot: 0 };

  const press = bCount('reliquarypress');
  const vault = bCount('abyssalvault');
  if (press || vault) {
    const pressPower = Math.sqrt(press) * (1 + 0.15 * bUp('reliq_imprint')) *
      (1 + Math.min(3, 0.01 * wardProgPortal() * riftWorksMult()));
    const vaultPower = Math.sqrt(vault) * 0.55 * (1 + 0.10 * bUp('abyssal_index'));
    state.endgameTimers.item += dt * (pressPower + vaultPower);
    let made = 0;
    while (state.endgameTimers.item >= 120 && made < 3) {
      state.endgameTimers.item -= 120;
      const extraTier = bUp('abyssal_index') >= 10 && Math.random() < 0.25 ? 1 : 0;
      const affix = 0.10 * bUp('reliq_affixes');
      grantPrintedItem('RELIQUARY PRESS', extraTier, affix);
      made++;
    }
  }

  const apoth = bCount('riftapothecary');
  if (apoth) {
    const power = Math.sqrt(apoth) * (1 + 0.15 * bUp('riftapoth_stills')) *
      (1 + Math.min(3, 0.01 * wardProgPortal() * riftWorksMult()));
    state.endgameTimers.pot += dt * power;
    let brewed = 0;
    while (state.endgameTimers.pot >= 150 && brewed < 3) {
      state.endgameTimers.pot -= 150;
      if (typeof portalEnsure === 'function') portalEnsure(state);
      if (state.portal && state.portal.pots) {
        const roll = Math.random();
        const key = roll < 0.42 ? 'revive' : roll < 0.76 ? 'energy' : roll < 0.96 ? 'elixir' : 'satchel';
        state.portal.pots[key]++;
        toast('RIFT APOTHECARY: brewed ' + PORTAL_POTS[key].name + '!', 'building');
      }
      brewed++;
    }
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

/* AFFIX FUSION (Ages Tree: Affix Fusion node) — same-type same-tier
   affixed items merge their affix sets. Multi-affix items can keep fusing. */
function fuseResultAffix(a1, a2) {
  const l1 = affixList(a1), l2 = affixList(a2);
  if (!l1.length || !l2.length) return null;
  const fused = affixKey([...new Set([...l1, ...l2])]);
  if (!fused) return null;
  const c = affixList(fused).length;
  return c > Math.max(l1.length, l2.length) ? fused : null;
}

function canFuseAffixes(a1, a2) {
  return !!fuseResultAffix(a1, a2);
}

function findBestFusionPair(entries) {
  const affixed = entries.filter(e => e.n > 0 && affixList(e.a).length > 0);
  const groups = new Map();
  for (const e of affixed) {
    const key = e.t + ':' + e.tier;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  let best = null;
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        const fused = fuseResultAffix(a.a, b.a);
        if (!fused) continue;
        const affCount = affixList(fused).length;
        const score = affCount * 100 + Math.min(affixList(a.a).length, affixList(b.a).length);
        if (!best || score > best.score) best = { a, b, fused, score };
      }
    }
  }
  return best;
}

function hasFusionPartner(item, entries) {
  if (!item || affixList(item.a).length < 1) return false;
  return entries.some(e => e.n > 0 && e.t === item.t && e.tier === item.tier &&
    e.a !== item.a && !!fuseResultAffix(item.a, e.a));
}

function fusionPartnerKeys(entries) {
  const keys = new Set();
  const groups = new Map();
  for (const e of entries) {
    if (e.n <= 0 || affixList(e.a).length < 1) continue;
    const groupKey = e.t + ':' + e.tier;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(e);
  }
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (!fuseResultAffix(group[i].a, group[j].a)) continue;
        keys.add(invKey(group[i].t, group[i].tier, group[i].a));
        keys.add(invKey(group[j].t, group[j].tier, group[j].a));
      }
    }
  }
  return keys;
}

function fuseItems(t, tier, a1, a2, quiet) {
  if (!hasTree('forg2')) return false;
  const fused = fuseResultAffix(a1, a2);
  if (!fused) return false;
  if (invCount(t, tier, a1) < 1 || invCount(t, tier, a2) < 1) return false;
  invAdd(t, tier, -1, a1);
  invAdd(t, tier, -1, a2);
  invAdd(t, tier, 1, fused);
  state.stats.itemsCombined++;
  if (!quiet) {
    toast('FUSED: ' + itemName(t, tier, fused) + '!');
    fuseSel = null;
    rebuildDetail();
  }
  return true;
}

function fuseAll(quiet) {
  if (!hasTree('forg2')) {
    if (!quiet) toast('Unlock Affix Fusion in the Fortune branch first.');
    return 0;
  }
  let total = 0, guard = 0, finished = false;
  const deadline = quiet ? performance.now() + 6 : Infinity;
  autoFusePending = false;
  while (guard++ < 250) {
    if (performance.now() >= deadline) break;
    const entries = Object.entries(state.inv)
      .map(([k, n]) => Object.assign(invParse(k), { n }))
      .filter(e => e.n > 0 && affixList(e.a).length > 0);
    const best = findBestFusionPair(entries);
    if (!best) {
      finished = true;
      break;
    }
    const amount = Math.min(best.a.n, best.b.n);
    if (amount < 1) break;
    invAdd(best.a.t, best.a.tier, -amount, best.a.a);
    invAdd(best.b.t, best.b.tier, -amount, best.b.a);
    invAdd(best.a.t, best.a.tier, amount, best.fused);
    total += amount;
  }
  autoFusePending = quiet && !finished;
  if (total) {
    state.stats.itemsCombined += total;
    if (!quiet) {
      toast('FUSE ALL: ' + total + ' fusion(s) made!');
      fuseSel = null;
      rebuildDetail();
    }
  } else if (!quiet) {
    toast('Nothing to fuse - need same-type, same-tier affixed items with new affixes.');
  }
  return total;
}

/* cross-forge: a double-affix item + a matching single-affix item of the
   same type & tier forge UP a tier — the 3-effect loadout survives. */
function crossForgePartner(t, tier, a) {
  const pair = affixList(a);
  if (pair.length !== 2) return null;
  for (const sub of pair) if (invCount(t, tier, sub) > 0) return sub;
  return null;
}

function crossForge(t, tier, a) {
  const partner = crossForgePartner(t, tier, a);
  if (!partner || invCount(t, tier, a) < 1) return;
  invAdd(t, tier, -1, a);
  invAdd(t, tier, -1, partner);
  invAdd(t, tier + 1, 1, a);
  state.stats.itemsCombined++;
  toast('Forged: ' + itemName(t, tier + 1, a) + ' (mixed pair)!');
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
    m.gold *= (C && C.nightBountyMult) || NIGHT_BOUNTY_MULT;
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
  /* Executioner: non-boss monsters below 15% HP are slain outright */
  if (hasTree('xwar9') && !m.isBoss && m.hp > 0 && m.hp < m.maxHp * 0.15) m.hp = 0;
  if (fromClick) {
    const area = $('monster-area');
    area.classList.remove('hit');
    void area.offsetWidth; // restart animation
    area.classList.add('hit');
  }
  if (m.hp <= 0) killMonster();
}

/* Momentum (xwar8): kill streak buff, runtime only */
const momentum = { stacks: 0, until: 0 };
let overkillDepth = 0;

function killMonster() {
  const m = state.monster;
  const overflow = hasTree('xwar7') ? -m.hp : 0; // Overkill: m.hp is the negative remainder
  if (hasTree('xwar8')) {                        // Momentum
    if (Date.now() > momentum.until) momentum.stacks = 0;
    momentum.stacks = Math.min(25, momentum.stacks + 1);
    momentum.until = Date.now() + 10000;
  }
  let bounty = m.gold * C.killMult;
  if (m.isBoss) bounty *= 1 + (C.equip.boss || 0) / 100;
  if (m.isBoss && hasTree('xfor1')) bounty *= 1.5; // Giantslayer Purse
  earnGold(bounty);
  state.totalKills++;
  if (m.isBoss) state.stats.bossKills++;
  spawnFloater('+' + fmt(bounty) + ' gold', 'gold');

  let dropped = false;
  if (m.isBoss && hasTree('xfor3')) dropped = true; // Trophy Cases: bosses always drop
  else if (Math.random() < itemDropChance(m.isBoss)) dropped = true;
  if (hasTree('xfor7') && !dropped) {              // Pity of the Gods
    state.dryKills = (state.dryKills || 0) + 1;
    if (state.dryKills >= 30) dropped = true;
  }
  if (dropped) {
    state.dryKills = 0;
    dropItem(m.isBoss);
  }

  state.killIdx++;
  if (state.killIdx > KILLS_PER_ZONE) {
    state.killIdx = 1;
    state.zone++;
    if (state.zone > state.highestZone) state.highestZone = state.zone;
    toast('Zone ' + fmt(state.zone) + ' — ' + zoneName(state.zone) + '! City income +2%');
  }
  spawnMonster();
  /* Overkill: the excess blow lands on the freshly spawned monster
     (depth-capped so one huge hit can't stall the frame) */
  if (overflow > 0 && overkillDepth < 30) {
    overkillDepth++;
    damageMonster(overflow, false);
    overkillDepth--;
  }
}

function onMonsterClick() {
  state.stats.clicks++;
  let dmg = C.click;
  if (Math.random() < C.critChance) {
    dmg *= C.critMult;
    state.stats.crits++;
    spawnFloater('CRIT -' + fmt(dmg), 'crit');
  } else {
    spawnFloater('-' + fmt(dmg), 'dmg');
  }
  /* Golden Touch: clicks plunder gold at the monster's bounty rate */
  const m = state.monster;
  if (hasTree('xpros7') && m && m.maxHp > 0)
    earnGold(Math.min(dmg, Math.max(0, m.hp)) * 0.02 * (m.gold / m.maxHp) * C.killMult);
  damageMonster(dmg, true);
  if (hasSkill('echo') && Math.random() < 0.2) {       // Echo Strike
    spawnFloater('ECHO -' + fmt(dmg), 'crit');
    damageMonster(dmg, false);
  }
}

/* ---------------- ascension ---------------- */

function pendingSigils() {
  const lifetime = state.lifetimeGold * (hasTree('crown15') ? 1.25 : 1); // Auric Memory
  return Math.max(0, sigilsFromLifetime(lifetime) - state.sigilsEver);
}

function ascend() {
  const gain = pendingSigils();
  if (gain < 1) return;
  if (!confirm('ASCEND?\n\nThe city falls to time... but the crown remembers.\n\nYou will gain ' + fmt(gain) + ' Crown Sigil(s).\nGold, resources, buildings, defenses and their upgrades reset.\nSigils, the Advancement Tree, and your ITEMS are kept forever.')) return;

  state.sigils += gain;
  state.sigilsEver += gain;
  state.ascensions++;

  /* Coronation Largesse: bonus Sigils per gate — spendable, but they don't
     count as "earned" (that would eat into future pending Sigils) */
  let largesse = 0;
  if (hasTree('xcrown7')) {
    for (let e = 2; e <= 6; e++) if (hasTree('era' + e)) largesse++;
    state.sigils += largesse;
    state.bonusSigils = (state.bonusSigils || 0) + largesse;
  }

  const keep = {
    lifetimeGold: state.lifetimeGold, highestZone: state.highestZone, totalKills: state.totalKills,
    totalBuildingsBought: state.totalBuildingsBought, totalUnitsBought: state.totalUnitsBought,
    sigils: state.sigils, sigilsEver: state.sigilsEver, ascensions: state.ascensions,
    bonusSigils: state.bonusSigils || 0,
    tree: state.tree, inv: state.inv, equip: state.equip, stats: state.stats,
    buyAmount: state.buildBuyAmount, buildBuyAmount: state.buildBuyAmount, unitBuyAmount: state.unitBuyAmount,
    autoOn: state.autoOn, notifyOff: state.notifyOff, lastSave: Date.now(),
    /* Rift Portal: stages, cards and deaths reset — permanent
       upgrades (elixirs, satchel slots) and supplies are kept */
    portal: { ...(state.portal || {}), stage: 0, cards: [], deadUntil: {}, team: [], flaskArmed: false },
    /* Tower of Doom: NOTHING resets — the climb is once per save */
    tower: state.tower,
    /* Silver Spire: NOTHING resets — the climb (and the Crown) are forever */
    spire: state.spire,
  };
  if (hasTree('crown17')) keep.gold = state.gold * 0.01; // The Crown Remembers
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
  toast('Ascension ' + fmt(state.ascensions) + '! +' + fmt(gain) + ' Crown Sigils' +
    (largesse ? ' (+' + fmt(largesse) + ' Coronation bonus)' : ''));
  save();
}

function applyTreeStarts() {
  if (hasTree('pros1')) { state.gold += 500; state.wood += 25; state.stone += 25; }
  if (hasTree('ind1')) {
    state.buildings.farm = (state.buildings.farm || 0) + 5;
    state.buildings.lumber = (state.buildings.lumber || 0) + 2;
    state.buildings.quarry = (state.buildings.quarry || 0) + 2;
  }
  if (hasTree('xind1')) { state.wood += 250; state.stone += 250; } // Stockpiles
  if (hasTree('xcrown4') && state.zone < 5) { // Regent's Writ
    state.zone = 5;
    state.killIdx = 1;
    if (state.highestZone < 5) state.highestZone = 5;
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
  if (id === 'xind1') {
    state.wood += 250; state.stone += 250;
    toast('Stockpiles: +250 Wood, +250 Stone!');
  }
  if (id === 'xfor6') {
    state.equip.hero.push(null);
    toast('Reliquary Straps: the Hero can carry one more item!');
  }
  /* Automation unlocks change buttons all over the UI — rebuild it */
  if (id.startsWith('auto') || id.startsWith('xauto') || id === 'forg2') {
    buildShop();
    buildUnitCards();
    syncRightPanel();
    refreshAmtLocks();
  }
}

function ownedNodeCount() {
  return Object.keys(state.tree).filter(k => state.tree[k]).length;
}

function eraUnlocked(era) {
  return era === 1 || hasTree('era' + era);
}

/* a node's requirements as a list (requires may be an id or an array) */
function nodeReqs(node) {
  if (!node.requires) return [];
  return Array.isArray(node.requires) ? node.requires : [node.requires];
}

function nodeAvailable(node) {
  if (hasTree(node.id)) return false;
  if (nodeReqs(node).some(r => !hasTree(r))) return false;
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

function buyAllPrestigeNodes() {
  if (!hasTree('auto20')) return;
  let bought = 0, spent = 0, gates = 0, guard = 0;
  while (guard++ < PRESTIGE_TREE.length * 2) {
    const options = PRESTIGE_TREE
      .filter(n => nodeAvailable(n) && state.sigils >= n.cost)
      .sort((a, b) => a.cost - b.cost || a.era - b.era || a.name.localeCompare(b.name));
    const node = options[0];
    if (!node) break;
    state.sigils -= node.cost;
    state.tree[node.id] = true;
    spent += node.cost;
    bought++;
    if (node.gate) gates++;
    applyNodeInstant(node.id);
  }
  if (gates) maybeTerrain(true);
  renderPrestige();
  save();
  toast(bought ? 'CROWN PLANNER: bought ' + fmt(bought) + ' node(s) for ' + fmt(spent) + ' Sigils.' : 'No affordable Advancement nodes.');
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
  const capH = hasTree('auto8') ? 16 : 8;            // Tireless Scribes
  const rate = hasTree('auto7') ? 0.75 : 0.5;        // Counting Engines
  const secs = Math.min(elapsed, capH * 3600);
  const c = calc();
  const gains = [];
  for (const res of RESOURCES) {
    const amt = c.prod[res] * secs * rate;
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

function notificationHidden(category) {
  const unlocks = { item: 'auton1', chest: 'auton2', building: 'auton3' };
  return !!(category && unlocks[category] && hasTree(unlocks[category]) && state.notifyOff[category]);
}

function toast(text, category) {
  if (notificationHidden(category)) return;
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  el.title = 'Click to dismiss';
  el.onclick = () => el.remove();
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 5000);
}

/* ---------------- UI: cost line ---------------- */

function costHtml(cost) {
  const parts = Object.entries(cost).map(([res, amt]) => {
    const ok = state[res] >= amt;
    return '<span class="cost-res ' + (ok ? 'ok' : 'no') + '" style="--rc:' + RES_META[res].color + '">' +
      fmt(amt) + ' ' + RES_META[res].name + '</span>';
  });
  /* multi-resource costs read better one per line */
  return parts.join(parts.length > 1 ? '<br>' : ' ');
}

/* ---------------- buy amount (separate for buildings and units) ---------------- */

/* buy amounts beyond x1 are unlocked by the Automation branch */
function amtUnlocked(v) {
  if (String(v) === '1') return true;
  if (String(v) === '10') return hasTree('auto1');
  return hasTree('auto2'); // 100 / max / next10 / next100
}

function normalizeBuyAmount(v) {
  return isNaN(Number(v)) ? v : Number(v);
}

function buyAmountFor(scope) {
  return scope === 'unit' ? state.unitBuyAmount : state.buildBuyAmount;
}

function setBuyAmount(v, scope) {
  if (!amtUnlocked(v)) return;
  scope = scope === 'unit' ? 'unit' : 'build';
  const amt = normalizeBuyAmount(v);
  if (scope === 'unit') state.unitBuyAmount = amt;
  else {
    state.buildBuyAmount = amt;
    state.buyAmount = amt; // legacy mirror
  }
  for (const b of document.querySelectorAll('.amt-btn')) {
    const btnScope = b.dataset.scope || 'build';
    b.classList.toggle('active', String(buyAmountFor(btnScope)) === b.dataset.amt);
  }
  refreshShop();
}

/* apply Automation-branch locks to every buy-amount button in the DOM
   (covers the static #amt-toggle strip in the building shop too) */
function legacyRefreshAmtLocks() {
  for (const btn of document.querySelectorAll('.amt-btn')) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent.replace('🔒', '');
    const locked = !amtUnlocked(btn.dataset.amt);
    btn.disabled = locked;
    btn.textContent = (locked ? '🔒' : '') + btn.dataset.label;
    btn.title = locked
      ? 'Unlock in the Ascension tree — Automation branch (' +
        (btn.dataset.amt === '10' ? 'Buying Ledgers' : 'Procurement Office') + ').'
      : (btn.dataset.amt === 'next10' ? 'Round up to the next multiple of 10' : '');
  }
}

/* a compact x1/x10/x100/MAX strip, used in the left panel and detail pages */
function legacyMakeAmtToggle() {
  const box = document.createElement('div');
  box.className = 'amt-inline';
  for (const v of ['1', '10', '100', 'max', 'next10']) {
    const btn = document.createElement('button');
    btn.className = 'amt-btn';
    btn.dataset.amt = v;
    const label = v === 'max' ? 'MAX' : v === 'next10' ? '⌖10' : 'x' + v;
    if (amtUnlocked(v)) {
      btn.textContent = label;
      if (v === 'next10') btn.title = 'Round up to the next multiple of 10';
      btn.onclick = () => setBuyAmount(v);
      btn.classList.toggle('active', String(state.buyAmount) === v);
    } else {
      btn.textContent = '🔒' + label;
      btn.disabled = true;
      btn.title = 'Unlock in the Ascension tree — Automation branch (' +
        (v === '10' ? 'Buying Ledgers' : 'Procurement Office') + ').';
    }
    box.appendChild(btn);
  }
  return box;
}

/* apply Automation-branch locks to every buy-amount button in the DOM
   (covers the static #amt-toggle strip in the building shop too) */
function refreshAmtLocks() {
  for (const btn of document.querySelectorAll('.amt-btn')) {
    if (!btn.dataset.scope) btn.dataset.scope = 'build';
    if (!btn.dataset.label) btn.dataset.label = btn.textContent.replace(/^🔒\s*/, '');
    const locked = !amtUnlocked(btn.dataset.amt);
    btn.disabled = locked;
    btn.textContent = (locked ? '🔒' : '') + btn.dataset.label;
    btn.title = locked
      ? 'Unlock in the Ascension tree - Automation branch (' +
        (btn.dataset.amt === '10' ? 'Buying Ledgers' : 'Procurement Office') + ').'
      : (btn.dataset.amt === 'next10' ? 'Round up to the next multiple of 10' :
        btn.dataset.amt === 'next100' ? 'Round up to the next multiple of 100' : '');
    btn.classList.toggle('active', !locked && String(buyAmountFor(btn.dataset.scope)) === btn.dataset.amt);
  }
}

/* a compact x1/x10/x100/MAX strip, used in the left panel and detail pages */
function makeAmtToggle(scope) {
  scope = scope === 'unit' ? 'unit' : 'build';
  const box = document.createElement('div');
  box.className = 'amt-inline';
  for (const v of ['1', '10', '100', 'max', 'next10', 'next100']) {
    const btn = document.createElement('button');
    btn.className = 'amt-btn';
    btn.dataset.amt = v;
    btn.dataset.scope = scope;
    const label = v === 'max' ? 'MAX' : v === 'next10' ? 'N10' : v === 'next100' ? 'N100' : 'x' + v;
    btn.dataset.label = label;
    btn.textContent = (amtUnlocked(v) ? '' : '🔒') + label;
    btn.disabled = !amtUnlocked(v);
    btn.title = !amtUnlocked(v)
      ? 'Unlock in the Ascension tree - Automation branch (' +
        (v === '10' ? 'Buying Ledgers' : 'Procurement Office') + ').'
      : (v === 'next10' ? 'Round up to the next multiple of 10' :
        v === 'next100' ? 'Round up to the next multiple of 100' : '');
    btn.onclick = () => setBuyAmount(v, scope);
    btn.classList.toggle('active', amtUnlocked(v) && String(buyAmountFor(scope)) === v);
    box.appendChild(btn);
  }
  return box;
}

/* how many levels of a leveled upgrade to buy at the current mode, and
   the summed cost. costFn(level) -> cost obj; respects maxLvl & wallet for MAX */
function subBatch(costFn, lvl, maxLvl, scope) {
  const mode = buyAmountFor(scope || 'build');
  let want;
  if (mode === 'max') want = 200;
  else if (mode === 'next10') { const rem = lvl % 10; want = rem === 0 ? 10 : 10 - rem; }
  else if (mode === 'next100') { const rem = lvl % 100; want = rem === 0 ? 100 : 100 - rem; }
  else want = Number(mode) || 1;
  want = Math.min(want, (isFinite(maxLvl) ? maxLvl : Infinity) - lvl);
  if (want <= 0) return { n: 0, cost: null };
  const total = {};
  const left = { ...state };
  let n = 0;
  for (let k = 0; k < want; k++) {
    const c = ceilCost(costFn(lvl + k));
    if (mode === 'max') {
      let ok = true;
      for (const r in c) if ((left[r] || 0) < c[r]) { ok = false; break; }
      if (!ok) break;
      for (const r in c) left[r] -= c[r];
    }
    for (const r in c) total[r] = (total[r] || 0) + c[r];
    n++;
  }
  if (mode === 'max' && n === 0) { // can't afford any: show the next single level
    return { n: 1, cost: ceilCost(costFn(lvl)) };
  }
  return { n, cost: total };
}

/* "how big a bite out of my wallet" score — used to sort & greedy-buy upgrades */
function costScore(cost) {
  let s = 0;
  for (const r in cost) s += cost[r] / Math.max(1, state[r]);
  return s;
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

let rightTab = 'build';          // 'build' | 'upgr' | 'bag' | 'auto'
let currentDetail = null;        // {kind:'unit'|'building', id}
let picker = null;               // {unitId, slot} equip picker open in unit detail
let pickerMaxOnly = false;       // picker filter: only the highest tier of each kind
let fuseSel = null;              // {t,tier,a} item armed for Affix Fusion in the bag
let viewUpdaters = [];           // per-tick updaters for the open detail/bag

function setRightTab(tab) {
  rightTab = tab;
  currentDetail = null;
  picker = null;
  fuseSel = null;
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
  const showUpgr = !currentDetail && rightTab === 'upgr';
  const showBag = !currentDetail && rightTab === 'bag';
  const showAuto = !currentDetail && rightTab === 'auto';
  $('view-shop').classList.toggle('hidden', !showShop);
  $('view-upgr').classList.toggle('hidden', !showUpgr);
  $('view-bag').classList.toggle('hidden', !showBag);
  $('view-auto').classList.toggle('hidden', !showAuto);
  $('view-detail').classList.toggle('hidden', !currentDetail);
  $('tab-build').classList.toggle('active', rightTab === 'build' && !currentDetail);
  $('tab-upgr').classList.toggle('active', rightTab === 'upgr' && !currentDetail);
  $('tab-bag').classList.toggle('active', rightTab === 'bag' && !currentDetail);
  $('tab-auto').classList.toggle('active', rightTab === 'auto' && !currentDetail);

  if (currentDetail) {
    if (currentDetail.kind === 'unit') buildUnitDetail(currentDetail.id);
    else if (currentDetail.kind === 'district') buildDistrictDetail(currentDetail.id);
    else buildBuildingDetail(currentDetail.id);
    $('right-title').textContent = currentDetail.kind === 'unit' ? 'WAR COUNCIL' : currentDetail.kind === 'district' ? 'LAND OFFICE' : 'ROYAL BUILDER';
  } else if (showBag) {
    renderBag();
    $('right-title').textContent = 'INVENTORY';
  } else if (showUpgr) {
    renderUpgradesTab();
    $('right-title').textContent = 'ROYAL WORKS';
  } else if (showAuto) {
    renderAutomationTab();
    $('right-title').textContent = 'AUTOMATION';
  } else {
    $('right-title').textContent = 'ROYAL BUILDER';
  }
}

/* ---------------- UPGRADES tab: every building upgrade, cheapest first ---------------- */

function renderUpgradesTab() {
  const list = $('upgr-list');
  list.innerHTML = '';

  const actions = document.createElement('div');
  actions.className = 'bag-actions';
  const allBtn = document.createElement('button');
  allBtn.className = 'menu-btn';
  if (hasTree('auto3')) {
    allBtn.textContent = 'BUY AS MUCH AS POSSIBLE';
    allBtn.title = 'Buy the cheapest available upgrades over and over until the resources run out';
    allBtn.onclick = buyAllBuildingUpgrades;
  } else {
    allBtn.textContent = '🔒 BUY AS MUCH AS POSSIBLE';
    allBtn.title = 'Unlock in the Ascension tree — Automation branch (Steward of Works).';
    allBtn.disabled = true;
  }
  actions.appendChild(allBtn);
  list.appendChild(actions);

  /* every upgrade of every built building, sorted by how affordable it is */
  const entries = [];
  for (const bid in BUILDING_UPGRADES) {
    const b = BUILDINGS.find(x => x.id === bid);
    for (const up of BUILDING_UPGRADES[bid]) {
      if (bUp(up.id) >= up.max) continue;
      entries.push({ bid, b, up, score: bCount(bid) < 1 ? Infinity : costScore(ceilCost(up.cost(bUp(up.id)))) });
    }
  }
  entries.sort((a, b) => a.score - b.score);

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.textContent = 'Every single upgrade is maxed. The Royal Works stand idle in awe.';
    list.appendChild(empty);
    return;
  }

  for (const e of entries.slice(0, 60)) {
    const locked = bCount(e.bid) < 1;
    upgradeRow(list, {
      name: e.up.name + ' <span class="upgr-bname">· ' + e.b.name + '</span>',
      info: e.up.info + (locked ? ' <span class="lock-note">— build a ' + e.b.name + ' first</span>' : ''),
      lvlText: () => e.up.max === 1 ? '' : 'Lv.' + fmt(bUp(e.up.id)) + '/' + fmt(e.up.max),
      cost: () => bUp(e.up.id) >= e.up.max ? null : ceilCost(e.up.cost(bUp(e.up.id))),
      onBuy: () => { buyBuildingUpgradeStep(e.bid, e.up.id) && toast(e.up.name + ' Lv.' + bUp(e.up.id) + '!'); },
      disabled: () => bCount(e.bid) < 1,
      doneText: e.up.max === 1 ? 'BUILT' : 'MAX',
    });
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
    const html = (opts.costPrefix ? opts.costPrefix() : '') + costHtml(cost);
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
      lines.push(['Crit chance', Math.round(C.critChance * 100) + '% (x' + C.critMult + ' dmg)']);
      lines.push(['Leadership aura', '+' + C.heroAura.toFixed(1) + '% (soft cap +' + fmt(C.heroAuraCap) + '%)']);
      lines.push(['Enemy HP', '-' + Math.round((1 - C.enemyHpMult) * 100) + '% on spawn']);
      if (C.spiritRate > 0) {
        lines.push(['Spirit Hands', C.spiritRate + ' clicks/s · ' + fmt(C.spiritDmg) + ' each']);
        lines.push(['Spirit DPS', fmt(C.spiritDps) + ' (' +
          contributionPct(C.spiritDps, C.rosterDps) + '% of total roster DPS)']);
      }
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
      if (hasTree('xwar16')) lines.push(['Concord of Wings', 'x' + C.dragonDoctrine.toFixed(2)]);
    } else if (u.id === 'golem') {
      lines.push(['Golem level', lvl]);
      lines.push(['Golem DPS', fmt(C.golemDps)]);
      lines.push(['Blacksmith bonus', '+' + (bCount('smith') * 10) + '%']);
    } else if (u.id === 'knight') {
      lines.push(['Knights', lvl]);
      lines.push(['Cavalry DPS', fmt(C.knightDps)]);
      lines.push(['Saddle bonus', '+' + (bUp('tan_saddles') * 5 + bUp('fishmarket_provisions') * 10) + '%']);
    } else if (u.id === 'plague') {
      lines.push(['Alchemists', lvl]);
      lines.push(['Toxin DPS', fmt(C.plagueDps)]);
      lines.push(['Alchemy bonus', '+' + ((bCount('alchemist') + bCount('enchanter')) * 5) + '%']);
    } else if (u.id === 'valkyrie') {
      lines.push(['Valkyries', lvl]);
      lines.push(['Storm DPS', fmt(C.valkyrieDps)]);
      lines.push(['Observatory bonus', '+' + (bCount('observatory') * 5) + '%']);
      if (hasTree('xwar16')) lines.push(['Concord of Wings', 'x' + C.valkyrieDoctrine.toFixed(2)]);
    } else if (u.id === 'reaver') {
      lines.push(['Reavers', lvl]);
      lines.push(['Rift DPS', fmt(C.reaverDps)]);
      lines.push(['Rift Portal best stage', fmt(wardProgPortal()) + ' (+' + fmt(wardProgPortal() * 4) + '%)']);
      if (hasTree('xward3')) lines.push(['Ward Covenant', 'x' + C.reaverDoctrine.toFixed(2)]);
    } else if (u.id === 'seraph') {
      lines.push(['Seraphs', lvl]);
      lines.push(['Radiant DPS', fmt(C.seraphDps)]);
      lines.push(['Spire best altitude', fmt(Math.round(((state.spire && state.spire.bestM) || 0))) + 'm (+' + fmt(wardProgSpire()) + '%)']);
      if (hasTree('xward3')) lines.push(['Ward Covenant', 'x' + C.seraphDoctrine.toFixed(2)]);
    } else if (u.id === 'reaper') {
      lines.push(['Reapers', lvl]);
      lines.push(['Doom DPS', fmt(C.reaperDps)]);
      lines.push(['Tower of Doom best floor', fmt(wardProgTower()) + ' (+' + fmt(wardProgTower() * 4) + '%)']);
      if (hasTree('xward3')) lines.push(['Ward Covenant', 'x' + C.reaperDoctrine.toFixed(2)]);
    } else if (u.id === 'leviathan') {
      lines.push(['Leviathans', lvl]);
      lines.push(['Abyss DPS', fmt(C.leviathanDps)]);
      lines.push(['Ascensions', fmt(wardProgSunken()) + ' (+' + fmt(wardProgSunken() * 20) + '%)']);
      if (hasTree('xward3')) lines.push(['Ward Covenant', 'x' + C.leviathanDoctrine.toFixed(2)]);
    } else {
      lines.push(['Wall level', lvl]);
      lines.push(['Wall DPS', fmt(C.wallDps)]);
      lines.push(['Bounty bonus', '+' + Math.round(state.walls * 5 + uUp('banners') * 3 + uUp('moat') * 2) + '%']);
      if (hasTree('xind9')) lines.push(['Living Ramparts', 'x' + C.wallDoctrine.toFixed(2)]);
    }
    statsEl.innerHTML = lines.map(l => '<div class="stat-row"><span>' + l[0] + '</span><b>' + l[1] + '</b></div>').join('');
  });

  // main upgrade (respects the buy-amount toggle)
  sectionTitle(box, 'UPGRADES');
  box.appendChild(makeAmtToggle('unit'));
  upgradeRow(box, {
    name: u.main.name,
    info: unitUnlocked(u) ? u.main.info : '🔒 ' + unitUnlockText(u) + '. ' + u.main.info,
    lvlText: () => 'Lv.' + fmt(state[u.statKey]),
    cost: () => subBatch(u.main.cost, state[u.statKey], Infinity, 'unit').cost,
    costPrefix: () => 'Buy x' + fmt(subBatch(u.main.cost, state[u.statKey], Infinity, 'unit').n) + ': ',
    onBuy: () => buyUnitMain(u.id),
    disabled: () => !unitUnlocked(u),
  });

  // sub upgrades (also batched by the toggle)
  for (const sub of u.subs) {
    upgradeRow(box, {
      name: sub.name,
      info: sub.info,
      lvlText: () => 'Lv.' + fmt(subLvl(sub)) + (isFinite(sub.max) ? '/' + fmt(sub.max) : ''),
      cost: () => subLvl(sub) >= sub.max ? null : subBatch(sub.cost, subLvl(sub), sub.max, 'unit').cost,
      costPrefix: () => 'Buy x' + fmt(subBatch(sub.cost, subLvl(sub), sub.max, 'unit').n) + ': ',
      onBuy: () => buyUnitSub(u.id, sub.id),
    });
  }
  const uAll = document.createElement('button');
  uAll.className = 'menu-btn detail-buyall';
  if (hasTree('auto3')) {
    uAll.textContent = 'BUY ALL UPGRADES';
    uAll.title = 'Buy the cheapest of this unit\'s upgrades over and over until the resources run out';
    uAll.onclick = () => buyAllUnitUpgradesFor(u.id);
  } else {
    uAll.textContent = '🔒 BUY ALL UPGRADES';
    uAll.title = 'Unlock in the Ascension tree — Automation branch (Steward of Works).';
    uAll.disabled = true;
  }
  box.appendChild(uAll);

  // arcane skills — every unit has its own now
  const mySkills = SKILLS.filter(s => s.unit === u.id);
  if (mySkills.length) {
    sectionTitle(box, 'ARCANE SKILLS');
    for (const s of mySkills) {
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
        const cost = { mana: Math.ceil(s.cost.mana * skillCostMult()) };
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
    auraNote.textContent += ' Aura gains beyond +' + fmt(C.heroAuraCap) + '% have diminishing returns.';
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
      tier.textContent = tierName(it.tier) + '+'.repeat(affixList(it.a).length);
      slot.appendChild(tier);
      slot.title = itemName(it.t, it.tier, it.a) + '\n' + itemStatLines(it.t, it.tier, it.a).join('\n') +
        '\nClick to unequip';
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
    pick.innerHTML = '<div class="picker-title">CHOOSE AN ITEM ' +
      '<button class="picker-filter' + (pickerMaxOnly ? ' on' : '') + '">TOP TIER ONLY: ' + (pickerMaxOnly ? 'ON' : 'OFF') + '</button>' +
      '<button class="picker-cancel">cancel</button></div>';
    pick.querySelector('.picker-cancel').onclick = () => { picker = null; syncRightPanel(); };
    pick.querySelector('.picker-filter').onclick = () => { pickerMaxOnly = !pickerMaxOnly; rebuildDetail(); };
    let entries = Object.entries(state.inv)
      .map(([k, n]) => Object.assign(invParse(k), { n }))
      .filter(e => e.n > 0 && itemAllowed(e.t, u.id))
      .sort((a, b) => a.t === b.t ? b.tier - a.tier : a.t.localeCompare(b.t));
    if (pickerMaxOnly) {
      /* keep only the highest available tier of each kind */
      const maxTier = {};
      for (const e of entries) maxTier[e.t] = Math.max(maxTier[e.t] || 0, e.tier);
      entries = entries.filter(e => e.tier === maxTier[e.t]);
    }
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
      body.innerHTML = '<div class="buy-top"><span class="buy-name">' + itemName(e.t, e.tier, e.a) + '</span><span class="buy-owned">x' + fmt(e.n) + '</span></div>' +
        '<div class="buy-prod item-stats">' + itemStatsHtml(e.t, e.tier, e.a) + '</div>';
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
    ownedEl.textContent = 'x' + fmt(bCount(bid));
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
  box.appendChild(makeAmtToggle('build'));
  upgradeRow(box, {
    name: 'Build ' + b.name,
    info: districtOwnedFor(bid) ? null : 'Requires the ' + DISTRICT_NAMES[BUILDING_DISTRICT[bid]] + ' district.',
    lvlText: () => 'x' + fmt(bCount(bid)),
    cost: () => buildingCost(b, bCount(bid), resolveAmount(b)),
    costPrefix: () => 'Buy x' + fmt(resolveAmount(b)) + ': ',
    onBuy: () => buyBuilding(bid),
    disabled: () => !districtOwnedFor(bid) || (buyAmountFor('build') === 'max' && maxAffordable(b) < 1),
  });

  const ups = BUILDING_UPGRADES[bid] || [];
  if (ups.length) {
    sectionTitle(box, 'INSTITUTE UPGRADES');
    for (const up of ups) {
      upgradeRow(box, {
        name: up.name,
        info: up.info,
        lvlText: () => up.max === 1 ? '' : 'Lv.' + fmt(bUp(up.id)) + '/' + fmt(up.max),
        cost: () => bUp(up.id) >= up.max ? null : subBatch(up.cost, bUp(up.id), up.max).cost,
        costPrefix: () => 'Buy x' + fmt(subBatch(up.cost, bUp(up.id), up.max).n) + ': ',
        onBuy: () => buyBuildingUpgrade(bid, up.id),
        disabled: () => bCount(bid) < 1,
        doneText: up.max === 1 ? 'BUILT' : 'MAX',
      });
    }
    const bAll = document.createElement('button');
    bAll.className = 'menu-btn detail-buyall';
    if (hasTree('auto3')) {
      bAll.textContent = 'BUY ALL UPGRADES';
      bAll.title = 'Buy the cheapest of this building\'s upgrades over and over until the resources run out';
      bAll.onclick = () => buyAllBuildingUpgradesFor(bid);
    } else {
      bAll.textContent = '🔒 BUY ALL UPGRADES';
      bAll.title = 'Unlock in the Ascension tree — Automation branch (Steward of Works).';
      bAll.disabled = true;
    }
    box.appendChild(bAll);
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

/* cascade-forge everything: 4x T1 -> 2x T2 -> 1x T3 ...
   quiet = the Phantom Smith automaton: no toasts, no empty-bag nagging */
function forgeAll(quiet) {
  let total = 0;
  const groups = new Map();
  for (const [k, n] of Object.entries(state.inv)) {
    if (n <= 0) continue;
    const e = invParse(k);
    const groupKey = e.t + '\0' + (e.a || '');
    if (!groups.has(groupKey)) groups.set(groupKey, { t: e.t, a: e.a, tiers: new Map() });
    groups.get(groupKey).tiers.set(e.tier, n);
  }

  const nextInv = {};
  for (const group of groups.values()) {
    const tiers = group.tiers;
    let tier = Math.min(...tiers.keys());
    let maxTier = Math.max(...tiers.keys());
    while (tier <= maxTier) {
      const count = tiers.get(tier) || 0;
      const pairs = Math.floor(count / 2);
      const remainder = count - pairs * 2;
      if (remainder > 0) nextInv[invKey(group.t, tier, group.a)] = remainder;
      if (pairs > 0) {
        total += pairs;
        tiers.set(tier + 1, (tiers.get(tier + 1) || 0) + pairs);
        maxTier = Math.max(maxTier, tier + 1);
      }
      tier++;
    }
  }

  if (total) {
    state.inv = nextInv;
    invDirty = true;
    invVersion++;
  }
  if (total) {
    state.stats.itemsCombined += total;
    if (!quiet) {
      toast('FORGE ALL: ' + total + ' combination(s) made!');
      rebuildDetail();
    }
  } else if (!quiet) {
    toast('Nothing to forge — need 2 identical items.');
  }
}

function renderBag() {
  lastBagRenderAt = performance.now();
  const rb = $('right-body');
  const keepScroll = rb.scrollTop;
  const list = $('inv-list');
  list.innerHTML = '';

  const actions = document.createElement('div');
  actions.className = 'bag-actions';
  const forgeBtn = document.createElement('button');
  forgeBtn.className = 'menu-btn';
  if (hasTree('auto4')) {
    forgeBtn.textContent = 'FORGE ALL';
    forgeBtn.title = 'Combine every pair of identical items, cascading to higher tiers';
    forgeBtn.onclick = () => forgeAll();
  } else {
    forgeBtn.textContent = '🔒 FORGE ALL';
    forgeBtn.title = 'Unlock in the Ascension tree — Automation branch (Bellows Engines).';
    forgeBtn.disabled = true;
  }
  const fuseBtn = document.createElement('button');
  fuseBtn.className = 'menu-btn';
  if (hasTree('forg2')) {
    fuseBtn.textContent = 'FUSE ALL';
    fuseBtn.title = 'Fuse compatible same-type, same-tier affixed items into larger multi-affix items';
    fuseBtn.onclick = () => fuseAll();
  } else {
    fuseBtn.textContent = '🔒 FUSE ALL';
    fuseBtn.title = 'Unlock in the Ascension tree - Fortune branch (Affix Fusion).';
    fuseBtn.disabled = true;
  }
  const unequipBtn = document.createElement('button');
  unequipBtn.className = 'menu-btn';
  unequipBtn.textContent = 'UNEQUIP ALL';
  unequipBtn.title = 'Return every equipped item to the bag';
  unequipBtn.onclick = unequipAll;
  actions.appendChild(forgeBtn);
  actions.appendChild(fuseBtn);
  actions.appendChild(unequipBtn);
  list.appendChild(actions);

  const entries = Object.entries(state.inv)
    .map(([k, n]) => Object.assign(invParse(k), { n }))
    .filter(e => e.n > 0)
    .sort((a, b) => a.t === b.t ? b.tier - a.tier : a.t.localeCompare(b.t));
  const fusionKeys = hasTree('forg2') ? fusionPartnerKeys(entries) : new Set();
  if (hasTree('forg2') && fusionKeys.size === 0) {
    fuseBtn.disabled = true;
    fuseBtn.title = 'No compatible same-type, same-tier affixed item pairs are in the bag.';
  }
  if (fuseSel && !fusionKeys.has(invKey(fuseSel.t, fuseSel.tier, fuseSel.a))) fuseSel = null;

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

  /* fusion banner while an item is armed */
  if (fuseSel) {
    const note = document.createElement('div');
    note.className = 'detail-note fuse-note';
    note.innerHTML = '⚗ FUSING: <b>' + itemName(fuseSel.t, fuseSel.tier, fuseSel.a) + '</b> — pick a partner of the same type & tier with a DIFFERENT affix. ';
    note.innerHTML = 'FUSING: <b>' + itemName(fuseSel.t, fuseSel.tier, fuseSel.a) + '</b> - pick a same-type, same-tier partner carrying at least one new affix. ';
    const cancel = document.createElement('button');
    cancel.className = 'combine-btn';
    cancel.textContent = 'CANCEL';
    cancel.onclick = () => { fuseSel = null; rebuildDetail(); };
    note.appendChild(cancel);
    list.appendChild(note);
  }

  for (const e of entries) {
    const def = ITEMS[e.t];
    const affs = affixList(e.a);
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
      '<div class="buy-top"><span class="buy-name">' + itemName(e.t, e.tier, e.a) + '</span><span class="buy-owned">x' + fmt(e.n) + '</span></div>' +
      '<div class="buy-prod item-stats">' + itemStatsHtml(e.t, e.tier, e.a) +
      '<span class="item-stat-line item-fit">Fits: ' + who + '</span></div>';
    row.appendChild(body);

    const comb = document.createElement('button');
    comb.className = 'combine-btn';
    comb.textContent = 'FORGE 2>1';
    comb.title = 'Combine 2x ' + itemName(e.t, e.tier, e.a) + ' into 1x ' + itemName(e.t, e.tier + 1, e.a) + ' (+25% stats)';
    comb.disabled = e.n < 2;
    comb.onclick = (ev) => { ev.stopPropagation(); combineItem(e.t, e.tier, e.a); };
    row.appendChild(comb);

    /* Affix Fusion (needs the tree node) */
    if (hasTree('forg2')) {
      if (fuseSel) {
        const isSel = fuseSel.t === e.t && fuseSel.tier === e.tier && fuseSel.a === e.a;
        const fused = fuseResultAffix(fuseSel.a, e.a);
        const eligible = !isSel && fuseSel.t === e.t && fuseSel.tier === e.tier && !!fused;
        if (eligible) {
          const fb = document.createElement('button');
          fb.className = 'combine-btn fuse';
          fb.textContent = '⚗ FUSE WITH';
          fb.title = 'Fuse into ' + itemName(e.t, e.tier, fused);
          fb.textContent = 'FUSE WITH';
          fb.onclick = (ev) => { ev.stopPropagation(); fuseItems(e.t, e.tier, fuseSel.a, e.a); };
          row.appendChild(fb);
          row.classList.add('fuse-target');
        } else if (isSel) {
          row.classList.add('fuse-armed');
        }
      } else if (affs.length >= 1 && fusionKeys.has(invKey(e.t, e.tier, e.a))) {
        const fb = document.createElement('button');
        fb.className = 'combine-btn fuse';
        fb.textContent = '⚗ FUSE';
        fb.title = 'Affix Fusion: pick another ' + def.name + ' ' + tierName(e.tier) + ' with a different affix — the result carries BOTH affixes.';
        fb.title = 'Affix Fusion: pick another ' + def.name + ' ' + tierName(e.tier) + ' carrying at least one new affix.';
        fb.textContent = 'FUSE';
        fb.onclick = (ev) => { ev.stopPropagation(); fuseSel = { t: e.t, tier: e.tier, a: e.a }; rebuildDetail(); };
        row.appendChild(fb);
        if (affs.length === 2) {
          const partner = crossForgePartner(e.t, e.tier, e.a);
          const upBtn = document.createElement('button');
          upBtn.className = 'combine-btn fuse';
          upBtn.textContent = 'FORGE UP';
          upBtn.title = partner
            ? 'Forge UP using 1x ' + itemName(e.t, e.tier, partner) + ': result is ' + itemName(e.t, e.tier + 1, e.a) + ' - all effects kept.'
            : 'Needs a ' + def.name + ' ' + tierName(e.tier) + ' carrying ONE of these affixes.';
          upBtn.disabled = !partner;
          upBtn.onclick = (ev) => { ev.stopPropagation(); crossForge(e.t, e.tier, e.a); };
          row.appendChild(upBtn);
        }
      } else if (affs.length === 2) {
        const partner = crossForgePartner(e.t, e.tier, e.a);
        const fb = document.createElement('button');
        fb.className = 'combine-btn fuse';
        fb.textContent = 'FORGE↑ PAIR';
        fb.title = partner
          ? 'Forge UP using 1x ' + itemName(e.t, e.tier, partner) + ': result is ' + itemName(e.t, e.tier + 1, e.a) + ' — all 3 effects kept.'
          : 'Needs a ' + def.name + ' ' + tierName(e.tier) + ' carrying ONE of these affixes.';
        fb.disabled = !partner;
        fb.onclick = (ev) => { ev.stopPropagation(); crossForge(e.t, e.tier, e.a); };
        row.appendChild(fb);
      }
    }
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
    const maxMode = buyAmountFor('build') === 'max';
    const maxBuy = maxMode ? maxAffordable(b) : 0;
    const amt = maxMode ? Math.max(1, maxBuy) : resolveAmount(b);
    const cost = buildingCost(b, owned, amt);
    const districtOk = districtOwnedFor(b.id);
    const afford = canAfford(cost) && districtOk && !(maxMode && maxBuy < 1);
    if (ui.row.disabled !== !afford) ui.row.disabled = !afford;
    ui.row.classList.toggle('afford', afford);
    setText(ui, 'owned', ui.ownedEl, owned > 0 ? 'x' + fmt(owned) : '');

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

    setHtml(ui, 'cost', ui.costEl, 'Buy x' + fmt(amt) + ': ' + costHtml(cost) +
      (districtOk ? '' : ' <span class="lock-note">needs ' + DISTRICT_NAMES[BUILDING_DISTRICT[b.id]] + '</span>'));
  }
}

/* ---------------- UI: unit cards (left panel) ---------------- */

const unitCards = {};
let lastUnitCardRefreshAt = -Infinity;

function buildUnitCards() {
  const list = $('unit-cards');
  list.innerHTML = '';
  lastUnitCardRefreshAt = -Infinity;
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

function refreshUnitCards(force) {
  const now = performance.now();
  if (!force && now - lastUnitCardRefreshAt < 250) return;
  lastUnitCardRefreshAt = now;
  for (const u of UNITS) {
    const ui = unitCards[u.id];
    const count = state[u.statKey];
    if (!unitUnlocked(u)) {
      ui.card.classList.add('locked-unit');
      setText(ui, 'lvl', ui.lvlEl, '🔒');
      setText(ui, 'dps', ui.dpsEl, unitUnlockText(u));
      setText(ui, 'share', ui.shareEl, '');
      ui.plus.style.display = 'none';
      continue;
    }
    ui.card.classList.remove('locked-unit');
    ui.plus.style.display = '';
    setText(ui, 'lvl', ui.lvlEl, u.lvlLabel + ' ' + fmt(count));
    const total = unitDpsValue(u.id);
    let eachTxt = u.dpsLabel + ': ' + fmt(total);
    if (u.id !== 'hero' && count > 0) eachTxt += ' (' + fmt(total / count) + ' each)';
    setText(ui, 'dps', ui.dpsEl, eachTxt);
    let share = '';
    if (u.id === 'hero' && C.spiritDps > 0) {
      share = contributionPct(C.spiritDps, C.rosterDps) + '% of total roster DPS from autoclicking';
    } else if (C.rosterDps > 0) {
      share = contributionPct(total, C.rosterDps) + '% of total roster DPS';
    }
    setText(ui, 'share', ui.shareEl, share);
    const batch = subBatch(u.main.cost, count, Infinity, 'unit');
    const afford = batch.n > 0 && batch.cost && canAfford(batch.cost);
    ui.plus.classList.toggle('afford', afford);
    ui.plus.title = u.main.verb + ' x' + fmt(batch.n || 0) + ' (' + u.main.name + ')';
  }
}

function contributionPct(part, total) {
  if (total <= 0 || part <= 0) return '0';
  const pct = part / total * 100;
  if (part < total && pct >= 99.995) return '<100';
  return pct.toFixed(2).replace(/\.?0+$/, '');
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

function nextDistrictRequirement() {
  return districtRequirement(state.districts.length - 1);
}

function districtRequirementsMet(req) {
  return state.highestZone >= req.zone && state.walls >= req.walls && totalBuildings() >= req.buildings;
}

function districtOwnedFor(buildingId) {
  const key = BUILDING_DISTRICT[buildingId];
  return !key || ownsDistrict(key);
}

function buyDistrict(key) {
  if (ownsDistrict(key)) return;
  if (key !== nextDistrictKey()) return;
  if (!districtRequirementsMet(nextDistrictRequirement())) return;
  const cost = nextDistrictCost();
  if (!canAfford(cost)) return;
  pay(cost);
  state.districts.push(key);
  toast('LAND DEED: ' + DISTRICT_NAMES[key] + ' joins Aetherholm! (+' + Math.round(DISTRICT_GOLD_BONUS * 100) + '% all gold)');
  unlockModeForWard(key); // cardinal wards open their gamemode gate for good
  unlockWardUnit(key);    // outer wards permanently unlock their ward unit
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
  const mg = MODE_BY_WARD[key];
  viewUpdaters.push(() => {
    const next = nextDistrictKey();
    const req = districtRequirement(Math.max(0, DISTRICT_ORDER.indexOf(key)));
    const lines = [
      ['Status', owned ? 'OWNED' : key === next ? 'FOR SALE (next in line)' : 'Locked — buy ' + DISTRICT_NAMES[next] + ' first'],
      ['District bonus', '+' + Math.round(DISTRICT_GOLD_BONUS * 100) + '% ALL gold each'],
      ['Districts owned', state.districts.length + ' / ' + (DISTRICT_ORDER.length + 1)],
      ['Best-zone requirement', 'Zone ' + fmt(req.zone) + ' (best ' + fmt(state.highestZone) + ')'],
      ['Wall requirement', 'Wall Lv.' + fmt(req.walls) + ' (now ' + fmt(state.walls) + ')'],
      ['City-size requirement', fmt(req.buildings) + ' buildings (now ' + fmt(totalBuildings()) + ')'],
      [mg ? 'Gamemode gate' : 'Unlocks buildings',
        mg ? (mg.open ? mg.name + (modeTileUnlocked(mg.id) ? ' (OPEN)' : ' (unlocks on purchase)') : 'Sealed — coming soon')
           : (builds.length ? String(builds.length) : 'none (royal gardens)')],
    ];
    statsEl.innerHTML = lines.map(l => '<div class="stat-row"><span>' + l[0] + '</span><b>' + l[1] + '</b></div>').join('');
  });

  const note = document.createElement('div');
  note.className = 'detail-note';
  note.textContent = mg
    ? (mg.open
        ? 'At the far edge of this ward stands ' + mg.name + '. Claim the ward and its gate opens — permanently, even through Ascension.'
        : 'A sealed gate stands at the far edge — its realm is not yet built. Claiming the ward still grants the district gold bonus.')
    : builds.length
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
    disabled: () => key !== nextDistrictKey() || !districtRequirementsMet(nextDistrictRequirement()),
    doneText: 'OWNED',
  });
}

function renderDistrictOverlays() {
  const box = $('districts');
  box.innerHTML = '';
  const next = nextDistrictKey();
  for (const key of DISTRICT_ORDER) {
    if (ownsDistrict(key)) continue;
    const [dx, dy] = key.split(',').map(Number);
    {
      const el = document.createElement('div');
      const buyable = key === next;
      const mg = MODE_BY_WARD[key];
      el.className = 'district-ov' + (buyable ? ' buyable' : '');
      el.style.left = (dx * DISTRICT_W / MAP_W * 100) + '%';
      el.style.top = (dy * DISTRICT_H / MAP_H * 100) + '%';
      el.style.width = (DISTRICT_W / MAP_W * 100) + '%';
      el.style.height = (DISTRICT_H / MAP_H * 100) + '%';
      let sub;
      if (buyable) {
        const cost = nextDistrictCost();
        const req = nextDistrictRequirement();
        const costLines = Object.entries(cost).map(([res, amt]) => fmt(amt) + ' ' + RES_META[res].name).join('<br>');
        sub = 'FOR SALE<br>' + costLines + '<br>Zone ' + fmt(req.zone) +
          ' / Wall ' + fmt(req.walls) + '<br>' + fmt(req.buildings) + ' buildings';
        el.title = DISTRICT_NAMES[key] + ' — click to open the Land Office';
      } else {
        const idx = DISTRICT_ORDER.indexOf(key);
        sub = '🔒<br>after ' + DISTRICT_NAMES[DISTRICT_ORDER[idx - 1]];
        el.title = DISTRICT_NAMES[key] + ' — wards unlock in order';
      }
      const builds = (DISTRICT_BUILDS[key] || []).map(id => BUILDINGS.find(b => b.id === id).name).join(', ');
      const tag = mg ? '<br><span class="district-builds">' + (mg.open ? '✦ ' + mg.name : '✦ ??? (sealed)') + '</span>' : '';
      el.innerHTML = '<span class="district-label">' + DISTRICT_NAMES[key] + '<br>' + sub +
        (builds ? '<br><span class="district-builds">' + builds + '</span>' : '') + tag + '</span>';
      el.onclick = () => { if (!mapDragged) openDistrict(key); };
      box.appendChild(el);
    }
  }
}

/* ---------------- outer gamemode gates ----------------
   A gamemode unlocks when its cardinal ward is bought. The unlock is stored
   permanently (so the gate stays open even after wards reset on Ascension),
   but the ward itself is just a normal land deed bought via the Land Office. */

function modeTileBought(id) { return !!(state.modeTiles && state.modeTiles[id]); }
function modeTileUnlocked(id) { return modeTileBought(id); } // gate is clickable once unlocked

/* called whenever a ward is bought: light up its gamemode gate for good */
function unlockModeForWard(key) {
  const m = MODE_BY_WARD[key];
  if (!m || !m.open || modeTileBought(m.id)) return;
  state.modeTiles[m.id] = true;
  toast('GATE OPEN: ' + m.name + ' awaits at the edge of ' + DISTRICT_NAMES[key] + '!');
}

/* outer wards permanently unlock their bound ward unit (kept through Ascension) */
function unlockWardUnit(key) {
  if (!OUTER_WARD_KEYS.includes(key) || (state.wardUnits && state.wardUnits[key])) return;
  if (!state.wardUnits) state.wardUnits = {};
  state.wardUnits[key] = true;
  const u = UNITS.find(x => x.unlock && x.unlock.ward === key);
  if (u) toast('NEW RECRUITS: ' + u.name + ' answer the call of ' + DISTRICT_NAMES[key] + '!');
}

/* dim & disable gate icons whose ward isn't claimed yet (called after gates exist) */
function refreshModeGates() {
  for (const m of MODE_GATES) {
    if (!m.gateId) continue;
    const gate = $(m.gateId);
    if (gate) gate.classList.toggle('mode-locked', !modeTileUnlocked(m.id));
  }
}

/* ---------------- UI: city map (middle) ---------------- */

let terrainKey = '';

function eraLevel() {
  return hasTree('era6') ? 3 : hasTree('era3') ? 2 : hasTree('era2') ? 1 : 0;
}

function maybeTerrain(force) {
  const tier = wallTier(state.walls);
  const houses = Math.floor(totalBuildings() / 4);
  const builtIds = BUILDINGS.filter(b => bCount(b.id) > 0 && districtOwnedFor(b.id)).map(b => b.id);
  const era = eraLevel();
  const satTiers = {};
  for (const id of builtIds) satTiers[id] = satTierFor(bCount(id));
  const propTier = propTierFor(state.totalBuildingsBought);
  const key = tier + '|' + houses + '|' + state.districts.join(';') + '|' +
    builtIds.map(id => id + ':' + satTiers[id]).join(';') + '|' + era + '|' + propTier;
  if (force || key !== terrainKey) {
    terrainKey = key;
    renderTerrain($('terrain'), tier, houses, state.districts, builtIds, era, satTiers, propTier);
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
  let wait = (8000 + Math.random() * 6000) * (hasTree('for2') ? 0.75 : 1); // Treasure Maps
  if (hasTree('auto6')) wait *= 0.5; // Punctual Couriers
  nextChestAt = Date.now() + wait;
}

function lootChest() {
  if (!activeChest) return;
  state.stats.chestsFound++;
  const m = state.monster;
  const r = Math.random();
  const jackpot = hasTree('xfor8') && Math.random() < 0.10; // Jackpot Chests
  const chestMult = (hasTree('xfor2') ? 2 : 1) * (jackpot ? 10 : 1);
  const sunkenChestMult = 1 + 0.02 * bCount('tidebreaker') + 0.05 * bUp('tidebreaker_cranes');
  if (jackpot) toast('💰 JACKPOT CHEST!', 'chest');
  if (r < 0.25) {
    const d = rollDrop();
    if (Math.random() < (hasTree('xfor2') ? 0.35 : 0.12) && d.tier === 1) d.tier = 2; // chests skew higher
    if (jackpot) d.tier += 2;
    invAdd(d.t, d.tier, 1, d.a);
    state.stats.itemsFound++;
    toast('CHEST: ' + itemName(d.t, d.tier, d.a) + '!', 'chest');
  } else if (r < 0.55) {
    const amt = Math.max(25, C.prod.gold * 30 + (m ? m.gold * C.killMult * 3 : 0)) * chestMult;
    earnGold(amt);
    toast('CHEST: +' + fmt(amt) + ' Gold!', 'chest');
  } else if (r < 0.72) {
    const amt = Math.max(15, C.prod.wood * 40) * chestMult * sunkenChestMult;
    state.wood += amt;
    toast('CHEST: +' + fmt(amt) + ' Wood!', 'chest');
  } else if (r < 0.88) {
    const amt = Math.max(10, C.prod.stone * 40) * chestMult * sunkenChestMult;
    state.stone += amt;
    toast('CHEST: +' + fmt(amt) + ' Stone!', 'chest');
  } else {
    const amt = Math.max(5, C.prod.mana * 40) * chestMult;
    state.mana += amt;
    toast('CHEST: +' + fmt(amt) + ' Mana!', 'chest');
  }
  removeChest();
}

function tickChests() {
  const now = Date.now();
  if (activeChest) {
    if (now > activeChest.expireAt) {
      if (hasTree('xspirit7')) lootChest(); // Grave Robbers: spirits grab what you missed
      else removeChest();
    }
  } else if (now >= nextChestAt) {
    spawnChest();
  }
}

function refreshCityBuildingCounts(ids) {
  if (!ids || !ids.size) return;
  const groups = new Map();
  for (const el of $('plots').children) {
    const id = el.dataset.building;
    if (!id || !ids.has(id)) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(el);
  }
  for (const id of ids) {
    const b = BUILDINGS.find(x => x.id === id);
    const plots = groups.get(id) || [];
    const count = bCount(id);
    for (const el of plots) el.title = b.name + ' x' + fmt(count) + ' - click for upgrades';
    if (!plots.length) continue;
    let badge = plots[0].querySelector('.badge');
    if (count > 1) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'badge';
        plots[0].appendChild(badge);
      }
      badge.textContent = 'x' + fmt(count);
    } else if (badge) {
      badge.remove();
    }
  }
}

function renderCityBuildings(ids) {
  if (!ids || !ids.size) return;
  const plots = $('plots');
  const fragment = document.createDocumentFragment();
  for (const el of Array.from(plots.children)) {
    if (ids.has(el.dataset.building)) el.remove();
  }
  for (const b of BUILDINGS) {
    if (!ids.has(b.id)) continue;
    const count = bCount(b.id);
    if (!count) continue;
    const spots = (PLOTS[b.id] || [[ROAD_X, ROAD_Y]]).filter(([x, y]) => plotAvailable(x, y));
    const shown = Math.min(count, spots.length);
    for (let i = 0; i < shown; i++) {
      const [tx, ty] = spots[i];
      const el = document.createElement('div');
      el.className = 'plot';
      el.dataset.building = b.id;
      el.style.left = ((tx + 0.5) / MAP_W * 100) + '%';
      el.style.top = ((ty + 1) / MAP_H * 100) + '%';
      el.style.zIndex = 10 + ty;
      el.title = b.name + ' x' + fmt(count) + ' - click for upgrades';
      el.onclick = () => { if (!mapDragged) openBuilding(b.id); };
      el.appendChild(spriteCanvas(b.sprite, 3, b.pal));
      if (b.id === 'windmill') {
        const blades = spriteCanvas('millblades', 3);
        blades.className = 'mill-blades';
        el.appendChild(blades);
      }
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
        badge.textContent = 'x' + fmt(count);
        el.appendChild(badge);
      }
      fragment.appendChild(el);
    }
  }
  plots.appendChild(fragment);
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
      el.dataset.building = b.id;
      el.style.left = ((tx + 0.5) / MAP_W * 100) + '%';
      el.style.top = ((ty + 1) / MAP_H * 100) + '%';
      el.style.zIndex = 10 + ty;
      el.title = b.name + ' x' + fmt(count) + ' — click for upgrades';
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
        badge.textContent = 'x' + fmt(count);
        el.appendChild(badge);
      }
      plots.appendChild(el);
    }
  }
  renderDistrictOverlays();
  refreshModeGates();
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

const TREE_WORLD = 6600;                 // world px, center at 3300
const treePan = { x: 0, y: 0, z: 1, min: 0.10, max: 1.6, init: false };

function treeNodePos(node) {
  const cx = TREE_WORLD / 2, cy = TREE_WORLD / 2;
  if (node.gate) {
    /* gates sit on the ring, on the War axis (top) */
    const r = ERA_RING_R[node.era - 1];
    return [cx, cy - r];
  }
  const a = TREE_BRANCHES[node.branch].angle * Math.PI / 180;
  const r = ERA_NODE_R0[node.era - 1] + node.step * TREE_NODE_STEP +
    (node.side ? TREE_SIDE_OUT : 0);
  let x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
  if (node.side) {
    const sameSlot = PRESTIGE_TREE.filter(n => !n.gate && n.side === node.side &&
      n.era === node.era && n.branch === node.branch && n.step === node.step);
    const slotIndex = sameSlot.findIndex(n => n.id === node.id);
    const stack = slotIndex > 0 ? slotIndex : 0;
    x += Math.cos(a + Math.PI / 2) * TREE_SIDE_OFF * node.side;
    y += Math.sin(a + Math.PI / 2) * TREE_SIDE_OFF * node.side;
    if (stack) {
      x += Math.cos(a + Math.PI / 2) * 175 * node.side * stack;
      y += Math.sin(a + Math.PI / 2) * 175 * node.side * stack;
    }
  }
  return [x, y];
}

function renderPrestige() {
  $('sigil-balance').textContent = fmt(state.sigils);
  $('sigil-pending').textContent = fmt(pendingSigils());
  $('modal-ascend-btn').disabled = pendingSigils() < 1;
  const foot = $('modal-ascend-btn').parentElement;
  let buyAll = $('tree-buyall-btn');
  if (hasTree('auto20')) {
    if (!buyAll) {
      buyAll = document.createElement('button');
      buyAll.id = 'tree-buyall-btn';
      buyAll.textContent = 'BUY ALL NODES';
      buyAll.onclick = buyAllPrestigeNodes;
      foot.insertBefore(buyAll, $('modal-ascend-btn'));
    }
    buyAll.disabled = !PRESTIGE_TREE.some(n => nodeAvailable(n) && state.sigils >= n.cost);
  } else if (buyAll) {
    buyAll.remove();
  }

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
    l.setAttribute('stroke', lit ? '#ffd23e' : '#56486f');
    l.setAttribute('stroke-width', lit ? 2.5 : 1.5);
    l.setAttribute('stroke-opacity', lit ? 0.42 : 0.20);
    svg.appendChild(l);
  };
  for (const node of PRESTIGE_TREE) {
    const [x, y] = treeNodePos(node);
    const reqs = nodeReqs(node);
    const froms = reqs.length
      ? reqs.map(id => treeNodePos(PRESTIGE_TREE.find(n => n.id === id)))
      : [[cx, cy]]; // chains from The Crown
    for (const from of froms) line(from[0], from[1], x, y, hasTree(node.id));
  }
  world.appendChild(svg);

  /* era rings */
  for (let era = 2; era <= 6; era++) {
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
    let costTxt = owned ? 'OWNED' : fmt(node.cost) + ' Sigil' + (node.cost > 1 ? 's' : '');
    if (!owned && node.gate && ownedNodeCount() < node.needNodes) {
      costTxt += ' • ' + ownedNodeCount() + '/' + node.needNodes;
    } else if (!owned && !avail) {
      costTxt = '🔒 • ' + costTxt;
    }
    btn.innerHTML = '<span class="node-name">' + node.name + '</span><span class="node-cost">' + costTxt + '</span>';
    btn.onmouseenter = () => { $('node-info').textContent = node.name + ' — ' + node.desc; };
    world.appendChild(btn);
  }

  if (!treePan.init) {
    const vp = $('tree-map').getBoundingClientRect();
    if (vp.width > 50 && vp.height > 50) { // only when the modal is actually visible
      treePan.init = true;
      treePan.x = vp.width / 2 - cx * treePan.z;
      treePan.y = vp.height / 2 - cy * treePan.z;
    }
  }
  applyTreePan();
}

function applyTreePan() {
  $('tree-world').style.transform =
    'translate(' + treePan.x + 'px,' + treePan.y + 'px) scale(' + treePan.z + ')';
}

function clampTreePan() {
  const r = $('tree-map').getBoundingClientRect();
  const w = TREE_WORLD * treePan.z, h = TREE_WORLD * treePan.z;
  treePan.x = w < r.width ? (r.width - w) / 2 : Math.min(400, Math.max(r.width - w - 400, treePan.x));
  treePan.y = h < r.height ? (r.height - h) / 2 : Math.min(400, Math.max(r.height - h - 400, treePan.y));
}

function zoomTreeAt(cx, cy, factor) {
  const z0 = treePan.z;
  const z = Math.min(treePan.max, Math.max(treePan.min, z0 * factor));
  treePan.x = cx - (cx - treePan.x) * (z / z0);
  treePan.y = cy - (cy - treePan.y) * (z / z0);
  treePan.z = z;
  clampTreePan();
  applyTreePan();
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
      treePan.x += dx;
      treePan.y += dy;
      clampTreePan();
      applyTreePan();
    }
  });
  const end = () => { dragging = false; };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);

  /* wheel to zoom — just like the city map */
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    zoomTreeAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18);
  }, { passive: false });
}

/* ---------------- UI: menu overlay (stats / settings) ---------------- */

let menuOpen = false;
let menuTab = 'stats';
let menuUpdaters = [];

function updateDebugTab() {
  const tab = $('menu-tab-debug');
  if (!tab) return;
  tab.classList.toggle('hidden', !state.debugUnlocked);
  tab.classList.toggle('active', menuTab === 'debug' && state.debugUnlocked);
  if (menuTab === 'debug' && !state.debugUnlocked) menuTab = 'settings';
}

function debugAmount() {
  const el = $('debug-amount');
  const n = el ? Number(el.value) : 0;
  return isFinite(n) && n > 0 ? n : 1;
}

function debugRefresh(msg) {
  C = calc();
  if (!state.monster) spawnMonster();
  if (!deferRender) renderCity();
  maybeTerrain(true);
  buildShop();
  buildUnitCards();
  refreshShop();
  refreshUnitCards();
  syncRightPanel();
  updateHud();
  if (menuOpen) renderMenu();
  save();
  if (msg) toast(msg);
}

function unlockAllDistrictsAndModes() {
  state.districts = [HOME_KEY, ...DISTRICT_ORDER];
  for (const key of OUTER_WARD_KEYS) {
    unlockModeForWard(key);
    unlockWardUnit(key);
  }
}

function debugAddBuildings(ids, n) {
  for (const id of ids) state.buildings[id] = bCount(id) + n;
  state.totalBuildingsBought += ids.length * n;
}

function debugGrantItems(n) {
  const count = Math.min(500, Math.floor(n));
  for (let i = 0; i < count; i++) {
    const d = rollDrop();
    invAdd(d.t, d.tier, 1, d.a);
    state.stats.itemsFound++;
    autoEquipDrop(d.t, d.tier, d.a);
  }
  invDirty = true;
  return count;
}

function ensurePerformanceOverlay() {
  let panel = $('perf-overlay');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'perf-overlay';
  panel.className = 'perf-overlay hidden';
  panel.innerHTML =
    '<div id="perf-overlay-head">' +
      '<span>LIVE PERFORMANCE</span>' +
      '<button id="perf-overlay-close" title="Close performance monitor">X</button>' +
    '</div>' +
    '<div class="perf-overlay-body">' +
      '<div class="perf-summary">' +
        '<span>FPS <b id="perf-overlay-fps">sampling...</b></span>' +
        '<span>Tick <b id="perf-overlay-tick">sampling...</b></span>' +
        '<span>Budget <b>' + TICK_MS + ' ms</b></span>' +
      '</div>' +
      '<div class="perf-overlay-note">Live = last second. Average = since opened/reset. Auto rows are included in Automation total.</div>' +
      '<div id="perf-overlay-rows"></div>' +
      '<div class="menu-btns"><button id="perf-overlay-reset" class="menu-btn">RESET AVERAGES</button></div>' +
    '</div>';
  document.body.appendChild(panel);

  $('perf-overlay-close').onclick = () => setPerformanceOverlay(false);
  $('perf-overlay-reset').onclick = perfReset;
  const head = $('perf-overlay-head');
  head.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    perfOverlayDrag = { pointerId: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
    panel.style.right = 'auto';
    try { head.setPointerCapture(e.pointerId); } catch (err) { /* pointer may already be gone */ }
    panel.classList.add('dragging');
    e.preventDefault();
  });
  head.addEventListener('pointermove', e => {
    if (!perfOverlayDrag || perfOverlayDrag.pointerId !== e.pointerId) return;
    const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - panel.offsetHeight);
    panel.style.left = Math.max(0, Math.min(maxX, e.clientX - perfOverlayDrag.dx)) + 'px';
    panel.style.top = Math.max(0, Math.min(maxY, e.clientY - perfOverlayDrag.dy)) + 'px';
  });
  const stopDrag = e => {
    if (!perfOverlayDrag || perfOverlayDrag.pointerId !== e.pointerId) return;
    perfOverlayDrag = null;
    panel.classList.remove('dragging');
  };
  head.addEventListener('pointerup', stopDrag);
  head.addEventListener('pointercancel', stopDrag);
  return panel;
}

function updatePerformanceToggle() {
  const btn = $('perf-toggle');
  if (!btn) return;
  btn.classList.toggle('on', perfOverlayOpen);
  btn.textContent = perfOverlayOpen ? 'ON - HIDE MONITOR' : 'OFF - SHOW MONITOR';
}

function setPerformanceOverlay(open) {
  perfOverlayOpen = !!open;
  const panel = ensurePerformanceOverlay();
  panel.classList.toggle('hidden', !perfOverlayOpen);
  perfStats.enabled = perfOverlayOpen;
  perfOverlayDrag = null;
  if (perfOverlayOpen) {
    perfReset();
    renderPerformanceOverlay(true);
  }
  updatePerformanceToggle();
}

function renderPerformanceOverlay(force) {
  if (!perfOverlayOpen) return;
  const panel = ensurePerformanceOverlay();
  if (!force && perfOverlayRenderedVersion === perfStats.snapshotVersion) return;
  perfOverlayRenderedVersion = perfStats.snapshotVersion;
  const snap = perfStats.snapshot;
  const tick = snap['Tick total'];
  const tickAverage = perfStats.sampleCount
    ? (perfStats.averageTotals['Tick total'] || 0) / perfStats.sampleCount
    : 0;
  $('perf-overlay-fps').textContent = perfStats.fps ? perfStats.fps.toFixed(1) : 'sampling...';
  $('perf-overlay-tick').textContent = tick
    ? tick.avg.toFixed(2) + ' ms/call | average ' + tickAverage.toFixed(2) + ' ms/s'
    : 'sampling...';
  const tickLive = tick ? tick.total : 0;
  const names = new Set([...Object.keys(perfStats.averageTotals), ...Object.keys(snap)]);
  names.delete('Tick total');
  const ordered = [...names].sort((a, b) => {
    const liveDiff = (snap[b] ? snap[b].total : 0) - (snap[a] ? snap[a].total : 0);
    if (liveDiff) return liveDiff;
    return (perfStats.averageTotals[b] || 0) - (perfStats.averageTotals[a] || 0);
  });
  $('perf-overlay-rows').innerHTML = ordered.length ? ordered.map(name => {
    const row = snap[name] || { total: 0, avg: 0, max: 0 };
    const share = tickLive > 0 ? row.total / tickLive * 100 : 0;
    const average = perfStats.sampleCount
      ? (perfStats.averageTotals[name] || 0) / perfStats.sampleCount
      : 0;
    return '<div class="perf-row"><span>' + name + '</span><b>' +
      row.total.toFixed(2) + ' ms/s</b><small>average ' + average.toFixed(2) +
      ' ms/s | ' + share.toFixed(1) + '% of tick | ' +
      row.avg.toFixed(3) + ' ms/call | max ' + row.max.toFixed(2) + '</small></div>';
  }).join('') : '<div class="perf-overlay-note">Collecting a one-second sample...</div>';

  /* Keep the panel reachable if resizing made its saved position invalid. */
  const rect = panel.getBoundingClientRect();
  if (rect.right > window.innerWidth)
    panel.style.left = Math.max(0, window.innerWidth - rect.width) + 'px';
  if (rect.bottom > window.innerHeight)
    panel.style.top = Math.max(0, window.innerHeight - rect.height) + 'px';
}

function debugRender() {
  const body = $('menu-body');
  const perfSec = document.createElement('div');
  perfSec.className = 'menu-section hidden';
  perfSec.innerHTML =
    '<div class="menu-section-title">LIVE PERFORMANCE</div>' +
    '<div class="menu-note">Measured only while this tab is open. “ms/s” is main-thread time consumed per second; nested Auto rows are included in Automation total.</div>' +
    '<div class="perf-summary"><span>FPS <b id="perf-fps">—</b></span><span>Tick <b id="perf-tick">—</b></span><span>Budget <b>' + TICK_MS + ' ms</b></span></div>' +
    '<div id="perf-rows"></div>' +
    '<div class="menu-btns"><button id="perf-reset" class="menu-btn">RESET MEASUREMENTS</button></div>';
  body.appendChild(perfSec);

  const monitorSec = document.createElement('div');
  monitorSec.className = 'menu-section';
  monitorSec.innerHTML =
    '<div class="menu-section-title">PERFORMANCE MONITOR</div>' +
    '<div class="menu-note">Opens a draggable monitor over the game. It shows the latest one-second cost and a running average for every entry.</div>' +
    '<div class="menu-btns"><button id="perf-toggle" class="menu-btn perf-toggle"></button></div>';
  body.appendChild(monitorSec);

  const sec = document.createElement('div');
  sec.className = 'menu-section';
  sec.innerHTML =
    '<div class="menu-section-title">DEBUG</div>' +
    '<div class="menu-note">Use this for local testing. Amount accepts large values like 1e12.</div>' +
    '<div class="debug-row"><label for="debug-amount">Amount</label><input id="debug-amount" class="debug-input" value="1000000" inputmode="decimal"></div>' +
    '<div class="menu-btns debug-btns">' +
    '<button id="dbg-res" class="menu-btn">ADD ALL RESOURCES</button>' +
    '<button id="dbg-gold" class="menu-btn">ADD GOLD</button>' +
    '<button id="dbg-sigils" class="menu-btn">ADD SIGILS</button>' +
    '<button id="dbg-zone" class="menu-btn">ADD ZONES</button>' +
    '<button id="dbg-districts" class="menu-btn">UNLOCK DISTRICTS/MODES</button>' +
    '<button id="dbg-buildings" class="menu-btn">ADD ALL BUILDINGS</button>' +
    '<button id="dbg-outer" class="menu-btn">ADD OUTER BUILDINGS</button>' +
    '<button id="dbg-items" class="menu-btn">GENERATE ITEMS</button>' +
    '<button id="dbg-pots" class="menu-btn">ADD PORTAL SUPPLIES</button>' +
    '</div>';
  body.appendChild(sec);

  let renderedSnapshot = null;
  const renderPerf = () => {
    const snap = perfStats.snapshot;
    if (snap === renderedSnapshot) return;
    renderedSnapshot = snap;
    const tick = snap['Tick total'];
    $('perf-fps').textContent = perfStats.fps ? perfStats.fps.toFixed(1) : 'sampling…';
    $('perf-tick').textContent = tick ? tick.avg.toFixed(2) + ' ms avg / ' + tick.max.toFixed(2) + ' max' : 'sampling…';
    const total = tick ? tick.total : 0;
    const ordered = Object.keys(snap)
      .filter(name => name !== 'Tick total')
      .sort((a, b) => snap[b].total - snap[a].total);
    $('perf-rows').innerHTML = ordered.length ? ordered.map(name => {
      const row = snap[name];
      const share = total > 0 ? row.total / total * 100 : 0;
      return '<div class="perf-row"><span>' + name + '</span><b>' +
        row.total.toFixed(2) + ' ms/s</b><small>' + share.toFixed(1) + '% · ' +
        row.avg.toFixed(3) + ' ms/call · max ' + row.max.toFixed(2) + '</small></div>';
    }).join('') : '<div class="menu-note">Collecting a one-second sample…</div>';
  };
  renderPerf();
  $('perf-reset').onclick = perfReset;
  updatePerformanceToggle();
  $('perf-toggle').onclick = () => setPerformanceOverlay(!perfOverlayOpen);

  $('dbg-res').onclick = () => {
    const n = debugAmount();
    earnGold(n); state.wood += n; state.stone += n; state.mana += n;
    debugRefresh('DEBUG: +' + fmt(n) + ' all resources.');
  };
  $('dbg-gold').onclick = () => {
    const n = debugAmount();
    earnGold(n);
    debugRefresh('DEBUG: +' + fmt(n) + ' Gold.');
  };
  $('dbg-sigils').onclick = () => {
    const n = Math.floor(debugAmount());
    state.sigils += n;
    state.sigilsEver += n;
    debugRefresh('DEBUG: +' + fmt(n) + ' Crown Sigils.');
  };
  $('dbg-zone').onclick = () => {
    const n = Math.floor(debugAmount());
    state.zone = Math.max(1, state.zone + n);
    state.highestZone = Math.max(state.highestZone, state.zone);
    state.killIdx = 1;
    spawnMonster();
    debugRefresh('DEBUG: advanced to Zone ' + fmt(state.zone) + '.');
  };
  $('dbg-districts').onclick = () => {
    unlockAllDistrictsAndModes();
    debugRefresh('DEBUG: all districts, gates and ward units unlocked.');
  };
  $('dbg-buildings').onclick = () => {
    const n = Math.floor(debugAmount());
    unlockAllDistrictsAndModes();
    debugAddBuildings(BUILDINGS.map(b => b.id), n);
    debugRefresh('DEBUG: +' + fmt(n) + ' of every building.');
  };
  $('dbg-outer').onclick = () => {
    const n = Math.floor(debugAmount());
    unlockAllDistrictsAndModes();
    const ids = BUILDINGS.filter(b => OUTER_WARD_KEYS.includes(BUILDING_DISTRICT[b.id])).map(b => b.id);
    debugAddBuildings(ids, n);
    debugRefresh('DEBUG: +' + fmt(n) + ' of every outer-ward building.');
  };
  $('dbg-items').onclick = () => {
    const made = debugGrantItems(debugAmount());
    debugRefresh('DEBUG: generated ' + fmt(made) + ' item(s).');
  };
  $('dbg-pots').onclick = () => {
    const n = Math.floor(debugAmount());
    if (typeof portalEnsure === 'function') portalEnsure(state);
    if (state.portal && state.portal.pots) for (const k in PORTAL_POTS) state.portal.pots[k] += n;
    debugRefresh('DEBUG: +' + fmt(n) + ' of every Portal supply.');
  };
}

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
  updateDebugTab();
  $('menu-tab-stats').classList.toggle('active', menuTab === 'stats');
  $('menu-tab-settings').classList.toggle('active', menuTab === 'settings');
  updateDebugTab();
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
        ['Roster passive DPS', () => fmt(C.rosterDps)],
        ['Unit idle DPS', () => fmt(C.dps)],
        ['Spirit Hands DPS', () => C.spiritRate > 0 ? fmt(C.spiritDps) + ' (' + C.spiritRate + '/s)' : '—'],
        ['— Archers / Mages / Clerics', () => fmt(C.archerDps) + ' / ' + fmt(C.mageDps) + ' / ' + fmt(C.clericDps)],
        ['— Ballistae / Golem / Dragons / Walls', () => fmt(C.turretDps) + ' / ' + fmt(C.golemDps) + ' / ' + fmt(C.dragonDps) + ' / ' + fmt(C.wallDps)],
        ['— Knights / Alchemists / Valkyries', () => fmt(C.knightDps) + ' / ' + fmt(C.plagueDps) + ' / ' + fmt(C.valkyrieDps)],
        ['— Reavers / Seraphs / Reapers / Leviathan', () => fmt(C.reaverDps) + ' / ' + fmt(C.seraphDps) + ' / ' + fmt(C.reaperDps) + ' / ' + fmt(C.leviathanDps)],
        ['Kill bounty multiplier', () => 'x' + C.killMult.toFixed(2)],
        ['Monsters slain', () => fmt(state.totalKills)],
        ['Bosses slain', () => fmt(state.stats.bossKills)],
        ['Clicks (this save)', () => fmt(state.stats.clicks) + ' (' + fmt(state.stats.crits) + ' crits)'],
        ['Current zone / best', () => fmt(state.zone) + ' / ' + fmt(state.highestZone)],
      ]],
      ['DAY & NIGHT', [
        ['Current phase', () => (isNight() ? 'NIGHT ☽' : 'DAY ☀') + ' (' + fmtClock(cycleRemaining()) + ' left)'],
        ['Day bonus', () => '+' + Math.round(C.dayBonus * 100) + '% gold production & bounty'],
        ['Night effects', () => '+50% mob HP, +' + Math.round((C.nightBountyMult - 1) * 100) + '% bounty, x' +
          ((hasTree('mys9') ? NIGHT_DROP_MULT * 2 : NIGHT_DROP_MULT) * (hasTree('mys6') ? 1.5 : 1) * (hasTree('myss3') ? 1.5 : 1)) + ' drops'],
      ]],
      ['ITEMS', [
        ['Items found', () => fmt(state.stats.itemsFound)],
        ['Items forged', () => fmt(state.stats.itemsCombined)],
        ['Items in bag', () => fmt(invTotal())],
        ['Chests looted', () => fmt(state.stats.chestsFound)],
        ['Hero leadership aura', () => '+' + C.heroAura.toFixed(1) + '% / +' + fmt(C.heroAuraCap) +
          '% soft cap (raw +' + C.heroAuraRaw.toFixed(1) + '%)'],
        ['Drop chance now', () => (itemDropChance(false) * 100).toFixed(1) + '% (' +
          (itemDropChance(true) * 100).toFixed(1) + '% boss)'],
      ]],
      ['THE CROWN', [
        ['Buildings standing', () => fmt(totalBuildings())],
        ['Buildings built (lifetime)', () => fmt(state.totalBuildingsBought)],
        ['Units raised (lifetime)', () => fmt(state.totalUnitsBought)],
        ['Districts owned', () => state.districts.length + ' / ' + (DISTRICT_ORDER.length + 1) + ' (+' + Math.round(DISTRICT_GOLD_BONUS * 100 * (state.districts.length - 1)) + '% gold)'],
        ['Ascensions', () => fmt(state.ascensions)],
        ['Crown Sigils (held / ever)', () => fmt(state.sigils) + ' / ' + fmt(state.sigilsEver)],
        ['Pending Sigils', () => fmt(pendingSigils())],
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
  } else if (menuTab === 'debug' && state.debugUnlocked) {
    debugRender();
  } else {
    /* SETTINGS */
    const sec = document.createElement('div');
    sec.className = 'menu-section';
    sec.innerHTML =
      '<div class="menu-section-title">SAVE</div>' +
      '<div class="menu-note">The game autosaves every 15 seconds and on close. Offline production runs at 50% rate, capped at 8 hours.</div>' +
      '<div class="menu-section-title">INPUT CODE</div>' +
      '<div class="debug-code-row"><input id="debug-code" class="debug-input" placeholder="Enter code..." maxlength="16">' +
      '<button id="debug-code-btn" class="menu-btn">OK</button></div>' +
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

    const unlockDebug = () => {
      if ($('debug-code').value.trim() !== '2137') return;
      state.debugUnlocked = true;
      menuTab = 'debug';
      updateDebugTab();
      renderMenu();
      save();
      toast('Debug menu unlocked.');
    };
    $('debug-code-btn').onclick = unlockDebug;
    $('debug-code').oninput = unlockDebug;
    $('debug-code').onkeydown = e => { if (e.key === 'Enter') unlockDebug(); };

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

  $('zone-name').textContent = 'Zone ' + fmt(state.zone) + ' — ' + zoneName(state.zone);
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
  ascBtn.textContent = 'ASCEND (+' + fmt(pending) + ' Sigils)';
  ascBtn.classList.toggle('ready', pending >= 1);
  const nextAt = SIGIL_BASE * Math.pow(state.sigilsEver + pending + 1, 1 / SIGIL_EXP) /
    (hasTree('crown15') ? 1.25 : 1);
  ascBtn.title = 'ASCENSION — the rebirth mechanic.\n' +
    'Crown Sigils = floor((lifetime gold / ' + fmt(SIGIL_BASE) + ') ^ ' + SIGIL_EXP + ').\n' +
    'Lifetime gold earned: ' + fmt(state.lifetimeGold) + '\n' +
    'Next Sigil at: ' + fmt(nextAt) + ' lifetime gold\n' +
    (pending >= 1
      ? 'READY: ascending now grants ' + fmt(pending) + ' Sigil(s) to spend in the Advancement Tree.'
      : 'Keep earning gold — you can ascend once at least 1 Sigil is pending.');
  $('sigil-count').textContent = fmt(state.sigils);
  $('stat-line').textContent =
    'Kills: ' + fmt(state.totalKills) + '  •  Best zone: ' + fmt(state.highestZone) + '  •  Ascensions: ' + fmt(state.ascensions);
  $('bag-count').textContent = invTotal() > 0 ? fmt(invTotal()) : '';

  updateCycleUi();
}

/* ---------------- main loop ---------------- */

let autoClickAcc = 0;

function tick() {
  const perfTick = perfStart();
  let perfPart = perfStart();
  const wasNight = isNight();
  state.cycleSec += TICK_MS / 1000;
  if (isNight() !== wasNight) {
    toast(isNight()
      ? '☽ Night falls... monsters grow bold (+50% HP & bounty, x2 item drops).'
      : '☀ Dawn breaks over Aetherholm! (+25% gold production)');
    if (!isNight() && hasTree('xmys7') && C) { // Witching Hour
      const surge = C.prod.mana * 120;
      state.mana += surge;
      toast('🜍 Witching Hour: the dawn surge grants +' + fmt(surge) + ' Mana!');
    }
  }

  perfEnd('Cycle/events', perfPart);
  perfPart = perfStart();
  C = calc();
  perfEnd('Derived stats calc', perfPart);

  perfPart = perfStart();
  if (C.dps > 0) damageMonster(C.dps / TICKS_PER_SEC, false);

  if (C.spiritRate > 0) {
    autoClickAcc += C.spiritRate / TICKS_PER_SEC;
    while (autoClickAcc >= 1) {
      autoClickAcc -= 1;
      let dmg = C.spiritDmg;
      if (Math.random() < C.spiritCritChance) dmg *= C.spiritCritMult;
      damageMonster(dmg, false);
      if (hasTree('xspirit4') && Math.random() < 0.15) damageMonster(dmg, false); // Twin Hauntings
      if (hasTree('xspirit3')) state.mana += 0.5; // Soul Tithe
    }
  }

  for (const res of RESOURCES) {
    const amt = C.prod[res] / TICKS_PER_SEC;
    if (amt <= 0) continue;
    if (res === 'gold') earnGold(amt); else state[res] += amt;
  }

  /* Compound Interest: the treasury works for you, capped at production rate */
  if (hasTree('xpros8') && state.gold > 0)
    earnGold(Math.min(C.prod.gold, 0.005 * state.gold) / TICKS_PER_SEC);

  state.stats.playSec += TICK_MS / 1000;
  perfEnd('Combat & income', perfPart);

  runAutomations(TICK_MS / 1000);
  perfPart = perfStart();
  tickEndgameBuildings(TICK_MS / 1000);
  tickChests();
  perfEnd('Buildings & chests', perfPart);
  perfPart = perfStart();
  updateHud();
  perfEnd('HUD refresh', perfPart);
  perfPart = perfStart();
  refreshShop();
  perfEnd('Shop refresh', perfPart);
  perfPart = perfStart();
  refreshUnitCards();
  perfEnd('Unit cards refresh', perfPart);
  perfPart = perfStart();
  for (const f of viewUpdaters) f();
  if (menuOpen) for (const f of menuUpdaters) f();
  if (invDirty && rightTab === 'bag' && !currentDetail &&
      performance.now() - lastBagRenderAt >= 250) renderBag();
  perfEnd('Open panels refresh', perfPart);
  perfPart = perfStart();
  maybeTerrain(false);
  perfEnd('Terrain check/render', perfPart);
  perfEnd('Tick total', perfTick);
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
  $('menu-tab-debug').onclick = () => { if (state.debugUnlocked) { menuTab = 'debug'; renderMenu(); } };
  $('tab-build').onclick = () => setRightTab('build');
  $('tab-upgr').onclick = () => setRightTab('upgr');
  $('tab-bag').onclick = () => setRightTab('bag');
  $('tab-auto').onclick = () => setRightTab('auto');
  $('detail-back').onclick = closeDetail;
  initTreePan();

  for (const btn of document.querySelectorAll('#amt-toggle .amt-btn')) {
    btn.dataset.scope = 'build';
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.onclick = () => setBuyAmount(btn.dataset.amt, 'build');
    btn.classList.toggle('active', String(state.buildBuyAmount) === btn.dataset.amt);
  }

  /* left panel: buy-amount strip for recruiting */
  const ua = $('unit-amt');
  if (ua) ua.appendChild(makeAmtToggle('unit'));
  refreshAmtLocks();

  for (const btn of document.querySelectorAll('.filter-btn')) {
    btn.onclick = () => {
      shopFilter = btn.dataset.filter;
      for (const b of document.querySelectorAll('.filter-btn')) b.classList.toggle('active', b === btn);
      refreshShop();
    };
  }

  setInterval(tick, TICK_MS);
  setInterval(save, 15000);
  requestAnimationFrame(perfFrame);
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
