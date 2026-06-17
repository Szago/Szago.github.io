/* ============================================================
   Aetherholm — portal.js
   THE RIFT PORTAL: an active 4v4 arena gamemode.
   A portal at the north end of the kingsroad leads to a side-view
   battlefield: deploy 4 of your recruited units (2x2 formation)
   against a randomized monster team. Units auto-attack and charge
   an energy bar that auto-fires their special skill.
   Stats derive from the main game; enemies scale per stage with
   the same growth curve as the main zones. Stages reset on
   Ascension. Lost teams stay DEAD for 10 real minutes.
   ============================================================ */

'use strict';

/* ---------------- combat roles ----------------
   fighter — attacks the enemy FRONT row, tanky, slow & heavy
   ranged  — attacks the enemy BACK row, fast & precise
   aoe     — hits ALL enemies at once                          */
const PORTAL_ROLES = {
  fighter: { name: 'FIGHTER', hpM: 26, dmgM: 3.0, spd: 2.2, desc: 'Attacks the enemy FRONT row' },
  ranged:  { name: 'RANGED',  hpM: 13, dmgM: 1.7, spd: 1.4, desc: 'Attacks the enemy BACK row' },
  aoe:     { name: 'AOE',     hpM: 11, dmgM: 1.0, spd: 2.4, desc: 'Hits ALL enemies at once' },
};

const PORTAL_UNIT_ROLE = {
  hero: 'fighter', golem: 'fighter', walls: 'fighter', knight: 'fighter',
  archer: 'ranged', turret: 'ranged', dragon: 'ranged', valkyrie: 'ranged',
  mage: 'aoe', cleric: 'aoe', plague: 'aoe',
};

/* each unit's special — fires automatically when energy reaches its COST
   (different per unit: cheap = frequent small effects, pricey = big slow ones) */
const PORTAL_SPECIALS = {
  hero:   { name: 'Heroic Cleave',  cost: 100, desc: 'x2.5 damage to the whole enemy front row.' },
  golem:  { name: 'Seismic Slam',   cost: 120, desc: 'x3.5 damage to its target.' },
  walls:  { name: 'Shield Wall',    cost: 90,  desc: 'x2 damage; your team takes -30% damage for 4s.' },
  archer: { name: 'Arrow Storm',    cost: 70,  desc: 'x1.2 damage to ALL enemies.' },
  turret: { name: 'Piercing Bolt',  cost: 110, desc: 'x3 damage to the weakest enemy.' },
  dragon: { name: 'Dragonfire',     cost: 130, desc: 'x1.5 damage to ALL enemies.' },
  mage:   { name: 'Meteor Nova',    cost: 100, desc: 'x2.2 damage to ALL enemies.' },
  cleric: { name: 'Healing Hymn',   cost: 80,  desc: 'Heals all allies for 25% of their max HP.' },
  knight: { name: 'Lance Charge',   cost: 110, desc: 'x3 damage to its front-row target.' },
  plague: { name: 'Toxic Cloud',    cost: 100, desc: 'x2.2 damage to ALL enemies.' },
  valkyrie: { name: 'Thunder Dive', cost: 120, desc: 'x1.6 damage to ALL enemies.' },
};

/* enemy specials, by role — shown on their cards so you know what's coming */
const PORTAL_ENEMY_SPECIALS = {
  fighter: { name: 'Crushing Blow', cost: 110, desc: 'x2.5 damage to its target.' },
  ranged:  { name: 'Deadshot',      cost: 90,  desc: 'x3 damage to your WEAKEST unit.' },
  aoe:     { name: 'Dark Surge',    cost: 120, desc: 'x1.5 damage to ALL your units.' },
};

/* enemy scaling: same per-stage growth as main-game zones */
const PORTAL_ENEMY_HP_BASE = 55;
const PORTAL_ENEMY_DMG_BASE = 1.0;
const PORTAL_BOSS_EVERY = 10;
const PORTAL_DEATH_MS = 10 * 60 * 1000;  // lost teams stay dead 10 minutes
const PORTAL_ENERGY_RATE = 9;            // passive energy per second
const PORTAL_ENERGY_HIT = 8;             // bonus energy per attack landed
const PORTAL_GATE_TILE = [80, 3];        // far north edge of the Riftgate Ward

const PORTAL_ENEMY_ROLE = {
  fighter: { hpM: 1.6, dmgM: 1.2 },
  ranged:  { hpM: 0.8, dmgM: 1.0 },
  aoe:     { hpM: 0.7, dmgM: 0.55 },
};

/* rift cards: pick 1 of 3 after every 10th stage. Stack freely.
   Reset (with the stage) on Ascension. */
const PORTAL_CARDS = [
  { id: 'c_fighter', name: 'Blades of the Rift', desc: 'Your FIGHTERS deal +15% damage.' },
  { id: 'c_ranged',  name: 'Hawk Eyes',          desc: 'Your RANGED units deal +15% damage.' },
  { id: 'c_aoe',     name: 'Stormcalling',       desc: 'Your AOE units deal +15% damage.' },
  { id: 'c_hp',      name: 'Riftward Plating',   desc: 'Your units have +12% max HP.' },
  { id: 'c_burn',    name: 'Creeping Decay',     desc: 'Enemies lose 1% of their max HP every second.' },
  { id: 'c_start',   name: 'Charged Sigils',     desc: 'Your units start battles with +30 energy.' },
  { id: 'c_rate',    name: 'Mana Conduits',      desc: 'Your units gain energy 25% faster.' },
  { id: 'c_crit',    name: 'Riftborn Edge',      desc: 'Your attacks have +10% chance to CRIT for x2.' },
  { id: 'c_heal',    name: 'Soothing Mists',     desc: 'Your units regenerate 1.5% HP every second.' },
  { id: 'c_gold',    name: "Plunderer's Pact",   desc: '+25% gold from portal victories.' },
  { id: 'c_drop',    name: 'Rift Magnet',        desc: '+20% item drop chance from portal victories.' },
  { id: 'c_first',   name: 'Ambush',             desc: 'Your units open the battle twice as fast.' },
];

/* consumable rewards (the pots themselves drop in task: rewards) */
const PORTAL_POTS = {
  revive:  { name: 'Phoenix Feather', desc: 'Instantly revives a fallen unit.' },
  energy:  { name: 'Aether Flask',    desc: 'Your team starts the next battle with FULL energy.' },
  elixir:  { name: 'Elixir of Vigor', desc: 'Permanently +10% HP & damage in the Rift for one unit.' },
  satchel: { name: 'Satchel Charm',   desc: 'Permanently +1 equipment slot for one unit (max +2).' },
};

/* ---------------- state ---------------- */

function portalEnsure(s) {
  if (!s.portal) s.portal = {};
  const p = s.portal;
  if (p.stage === undefined) p.stage = 0;      // stages beaten this ascension
  if (p.best === undefined) p.best = 0;        // lifetime best stage
  if (p.wins === undefined) p.wins = 0;
  if (p.losses === undefined) p.losses = 0;
  if (!Array.isArray(p.cards)) p.cards = [];   // chosen card ids (stack)
  if (!p.deadUntil) p.deadUntil = {};          // uid -> timestamp (ms)
  if (!p.pots) p.pots = {};
  for (const k in PORTAL_POTS) if (!p.pots[k]) p.pots[k] = 0;
  if (!p.perm) p.perm = {};                    // uid -> Elixir of Vigor stacks
  if (!p.slotPlus) p.slotPlus = {};            // uid -> extra equip slots (0..2)
  /* deployment: 4 grid slots — 0,1 = FRONT row, 2,3 = BACK row */
  p.team = normalizePortalTeam(Array.isArray(p.team) ? p.team : []);
  if (p.flaskArmed === undefined) p.flaskArmed = false; // Aether Flask queued for next battle
  if (p.auto === undefined) p.auto = false;             // auto-continue after victories
  if (p.auto && !(s.tree && s.tree.auto5)) p.auto = false; // gated by Rift Standing Orders
  return s;
}

/* accept any old/loose team shape and return a 4-slot array (uid|null);
   loose uid lists are auto-seated: fighters front, the rest back */
function normalizePortalTeam(team) {
  if (team.length === 4 && team.every(x => x === null || typeof x === 'string')) return team.slice();
  const uids = team.filter(x => typeof x === 'string');
  const slots = [null, null, null, null];
  const seat = (uid, pref) => {
    for (const i of pref) if (slots[i] === null) { slots[i] = uid; return; }
  };
  for (const uid of uids.slice(0, 4)) {
    if (PORTAL_UNIT_ROLE[uid] === 'fighter') seat(uid, [0, 1, 2, 3]);
    else seat(uid, [2, 3, 0, 1]);
  }
  return slots;
}

function portalCardCount(id) { return state.portal.cards.filter(c => c === id).length; }

function portalDeadUntil(uid) {
  return (state.portal && state.portal.deadUntil && state.portal.deadUntil[uid]) || 0;
}
function portalUnitDead(uid) { return Date.now() < portalDeadUntil(uid); }

/* ---------------- derived unit stats ---------------- */

/* a unit's "power" in the Rift = its main-game damage value
   (hero: click damage; others: their total idle DPS),
   so army upgrades, items, skills and tree nodes all carry over */
function portalUnitPower(uid) {
  return Math.max(1, C ? unitDpsValue(uid) : 1);
}

function portalUnitStats(uid) {
  const role = PORTAL_UNIT_ROLE[uid];
  const r = PORTAL_ROLES[role];
  const perm = 1 + 0.10 * (state.portal.perm[uid] || 0);
  const cardDmg = 1 + 0.15 * portalCardCount(
    role === 'fighter' ? 'c_fighter' : role === 'ranged' ? 'c_ranged' : 'c_aoe');
  const cardHp = 1 + 0.12 * portalCardCount('c_hp');
  const banners = hasTree('xrift1') ? 1.2 : 1; // Riftward Banners
  const P = portalUnitPower(uid);
  return {
    role,
    hp: Math.ceil(P * r.hpM * perm * cardHp * banners),
    dmg: Math.max(1, P * r.dmgM * perm * cardDmg * banners),
    spd: r.spd,
  };
}

/* units you can deploy: recruited (or the Hero) and unlocked */
function portalRoster() {
  return UNITS.filter(u => unitUnlocked(u) && (u.id === 'hero' || state[u.statKey] > 0));
}

/* ---------------- enemy team generation ---------------- */

function portalEnemyTeam(stageN) {
  const g = Math.pow(ZONE_HP_GROWTH, stageN - 1);
  const bossStage = stageN % PORTAL_BOSS_EVERY === 0;
  const roles = ['fighter', 'fighter',
    Math.random() < 0.5 ? 'ranged' : 'aoe',
    Math.random() < 0.5 ? 'ranged' : 'aoe'];
  const team = [];
  for (let i = 0; i < 4; i++) {
    const boss = bossStage && i === 0;
    const type = boss
      ? BOSS_TYPES[Math.floor(Math.random() * BOSS_TYPES.length)]
      : MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)];
    const role = boss ? 'fighter' : roles[i];
    const rm = PORTAL_ENEMY_ROLE[role];
    team.push({
      name: type.name + (boss ? ' [BOSS]' : ''),
      sprite: type.sprite, role, boss,
      row: i < 2 ? 'front' : 'back',
      hp: Math.ceil(PORTAL_ENEMY_HP_BASE * g * rm.hpM * (boss ? 6 : 1)),
      dmg: PORTAL_ENEMY_DMG_BASE * g * rm.dmgM * (boss ? 2 : 1),
      spd: PORTAL_ROLES[role].spd,
    });
  }
  return team;
}

/* ---------------- modal plumbing ---------------- */

let portalTimer = null;
let portalScreen = 'lobby';
let portalAutoToken = 0;   // cancels stale auto-continue timers
let portalNext = null;     // pre-rolled enemy team for the coming stage
let portalTeam = [];       // selected unit ids (max 4)
let battle = null;         // live battle object
let plDeadEls = [];        // [{uid, el}] dead-countdown labels in the lobby

function portalStageN() { return state.portal.stage + 1; }

function openPortal() {
  portalEnsure(state);
  portalNext = portalEnemyTeam(portalStageN());
  const ros = new Set(portalRoster().map(u => u.id));
  portalTeam = normalizePortalTeam(state.portal.team)
    .map(uid => (uid && ros.has(uid) && !portalUnitDead(uid)) ? uid : null);
  showPortalScreen('lobby');
  $('portal-modal').classList.remove('hidden');
  if (!portalTimer) portalTimer = setInterval(portalFrame, 100);
}

function closePortal() {
  if (battle && !battle.over) { portalRetreat(); return; }
  $('portal-modal').classList.add('hidden');
  clearInterval(portalTimer);
  portalTimer = null;
  battle = null;
  if (typeof save === 'function') save();
}

function showPortalScreen(name) {
  portalScreen = name;
  for (const id of ['portal-lobby', 'portal-battle', 'portal-result', 'portal-cards'])
    $(id).classList.toggle('hidden', id !== 'portal-' + name);
  const p = state.portal;
  $('portal-title').textContent = 'THE RIFT PORTAL — STAGE ' + portalStageN() +
    (p.best > 0 ? '  (BEST: ' + p.best + ')' : '');
  if (name === 'lobby') renderPortalLobby();
}

/* 100ms heartbeat while the modal is open */
let plTickAcc = 0;
function portalFrame() {
  if (battle && !battle.over) { battleTick(0.1); return; }
  /* lobby: refresh dead-unit countdowns once a second */
  plTickAcc += 1;
  if (portalScreen === 'lobby' && plTickAcc >= 10) {
    plTickAcc = 0;
    let expired = false;
    for (const d of plDeadEls) {
      const left = portalDeadUntil(d.uid) - Date.now();
      if (left <= 0) { expired = true; continue; }
      d.el.textContent = fmtClock(Math.ceil(left / 1000));
    }
    if (expired) renderPortalLobby(); // somebody woke up — unlock their card
  }
}

/* ---------------- lobby / deployment ---------------- */

/* auto-seat on click: fighters prefer the front, the rest the back */
function seatPortalUnit(uid) {
  const pref = PORTAL_UNIT_ROLE[uid] === 'fighter' ? [0, 1, 2, 3] : [2, 3, 0, 1];
  for (const i of pref) if (!portalTeam[i]) { portalTeam[i] = uid; return true; }
  return false;
}

/* drop onto a battlefield slot: from the roster ('r:uid') or another slot ('s:idx') */
function portalSlotDrop(idx, data) {
  if (!data) return;
  if (data.startsWith('r:')) {
    const uid = data.slice(2);
    if (portalUnitDead(uid) || !portalRoster().some(u => u.id === uid)) return;
    const cur = portalTeam.indexOf(uid);
    if (cur === idx) return;
    if (cur >= 0) portalTeam[cur] = portalTeam[idx]; // dragged from another slot: swap
    portalTeam[idx] = uid;
  } else if (data.startsWith('s:')) {
    const j = +data.slice(2);
    if (j === idx || isNaN(j)) return;
    const t = portalTeam[idx];
    portalTeam[idx] = portalTeam[j];
    portalTeam[j] = t;
  }
  renderPortalLobby();
}

function renderPortalLobby() {
  const box = $('portal-lobby');
  box.innerHTML = '';
  plDeadEls = [];
  const p = state.portal;
  const stageN = portalStageN();
  const bossStage = stageN % PORTAL_BOSS_EVERY === 0;

  /* --- the battlefield: your 2x2 slots vs their 2x2 positions --- */
  const secF = document.createElement('div');
  secF.className = 'pl-section';
  secF.innerHTML = '<div class="pl-head">THE BATTLEFIELD — <b>STAGE ' + stageN + '</b>' +
    (bossStage ? ' <b style="color:var(--hp)">BOSS STAGE!</b>' : '') +
    ' — drag your units into position</div>';
  const field = document.createElement('div');
  field.id = 'pl-field';

  /* your side: 4 droppable slots (front column faces the enemy) */
  const aGrid = document.createElement('div');
  aGrid.className = 'pb-side ps-grid';
  for (let idx = 0; idx < 4; idx++) {
    const slot = document.createElement('div');
    const uid = portalTeam[idx];
    slot.className = 'ps-slot' + (uid ? ' filled' : '');
    slot.style.gridColumn = idx < 2 ? 2 : 1;
    slot.style.gridRow = idx % 2 + 1;
    const tag = document.createElement('div');
    tag.className = 'ps-rowtag';
    tag.textContent = idx < 2 ? 'FRONT' : 'BACK';
    slot.appendChild(tag);
    if (uid) {
      const u = UNITS.find(x => x.id === uid);
      const sp = PORTAL_SPECIALS[uid];
      const st = portalUnitStats(uid);
      slot.title = u.name + ' — ' + PORTAL_ROLES[st.role].desc + '. ★ ' + sp.name +
        ' (' + sp.cost + '⚡): ' + sp.desc + ' Click to unseat, drag to move.';
      const nm = document.createElement('div');
      nm.className = 'pf-nm';
      nm.textContent = u.name;
      slot.appendChild(nm);
      slot.appendChild(spriteCanvas(u.portrait, 3));
      const chip = document.createElement('span');
      chip.className = 'role-chip ' + st.role;
      chip.textContent = PORTAL_ROLES[st.role].name;
      slot.appendChild(chip);
      const sl = document.createElement('div');
      sl.className = 'ps-spec';
      sl.textContent = '★ ' + sp.name + ' ' + sp.cost + '⚡';
      slot.appendChild(sl);
      slot.draggable = true;
      slot.ondragstart = ev => ev.dataTransfer.setData('text/plain', 's:' + idx);
      slot.onclick = () => { portalTeam[idx] = null; renderPortalLobby(); };
    } else {
      const e = document.createElement('div');
      e.className = 'ps-empty';
      e.textContent = 'drag a unit here';
      slot.appendChild(e);
    }
    slot.ondragover = ev => { ev.preventDefault(); slot.classList.add('dragover'); };
    slot.ondragleave = () => slot.classList.remove('dragover');
    slot.ondrop = ev => { ev.preventDefault(); portalSlotDrop(idx, ev.dataTransfer.getData('text/plain')); };
    aGrid.appendChild(slot);
  }
  field.appendChild(aGrid);

  const mid = document.createElement('div');
  mid.id = 'pl-vs';
  mid.textContent = 'VS';
  field.appendChild(mid);

  /* their side: real positions, roles and specials on display */
  const eGrid = document.createElement('div');
  eGrid.className = 'pb-side ps-grid';
  portalNext.forEach((e, i) => {
    const sp = PORTAL_ENEMY_SPECIALS[e.role];
    const el = document.createElement('div');
    el.className = 'pl-foe' + (e.boss ? ' boss' : '');
    el.style.gridColumn = i < 2 ? 1 : 2;
    el.style.gridRow = i % 2 + 1;
    el.title = e.name + ' — ' + PORTAL_ROLES[e.role].desc + '. ★ ' + sp.name +
      ' (' + sp.cost + '⚡): ' + sp.desc;
    el.innerHTML = '<div class="pl-nm">' + e.name + '</div>';
    el.appendChild(spriteCanvas(e.sprite, e.boss ? 4 : 3));
    const chip = document.createElement('span');
    chip.className = 'role-chip ' + e.role;
    chip.textContent = PORTAL_ROLES[e.role].name;
    el.appendChild(chip);
    const hp = document.createElement('div');
    hp.className = 'pl-hp';
    hp.textContent = 'HP ' + fmt(e.hp) + ' · DMG ' + fmt(e.dmg);
    el.appendChild(hp);
    const sl = document.createElement('div');
    sl.className = 'ps-spec';
    sl.textContent = '★ ' + sp.name + ' ' + sp.cost + '⚡';
    el.appendChild(sl);
    eGrid.appendChild(el);
  });
  field.appendChild(eGrid);
  secF.appendChild(field);
  box.appendChild(secF);

  /* --- your roster --- */
  const secR = document.createElement('div');
  secR.className = 'pl-section';
  secR.innerHTML = '<div class="pl-head">YOUR FORCES — drag onto the battlefield or click to auto-seat (' +
    portalTeam.filter(Boolean).length + '/4 deployed)</div>';
  const ros = document.createElement('div');
  ros.className = 'pl-roster';
  for (const u of portalRoster()) {
    const st = portalUnitStats(u.id);
    const dead = portalUnitDead(u.id);
    const el = document.createElement('div');
    el.className = 'pl-unit' + (portalTeam.includes(u.id) ? ' selected' : '') + (dead ? ' dead' : '');
    el.title = '★ ' + PORTAL_SPECIALS[u.id].name + ' (' + PORTAL_SPECIALS[u.id].cost + '⚡): ' +
      PORTAL_SPECIALS[u.id].desc + ' — ' + PORTAL_ROLES[st.role].desc + '.';
    const nm = document.createElement('div');
    nm.className = 'pl-nm';
    nm.textContent = u.name;
    el.appendChild(nm);
    el.appendChild(spriteCanvas(u.portrait, 3));
    const chip = document.createElement('span');
    chip.className = 'role-chip ' + st.role;
    chip.textContent = PORTAL_ROLES[st.role].name;
    el.appendChild(chip);
    const stats = document.createElement('div');
    stats.className = 'pl-st';
    stats.innerHTML = 'HP <b>' + fmt(st.hp) + '</b> · DMG <b>' + fmt(st.dmg) + '</b><br>' +
      '★ ' + PORTAL_SPECIALS[u.id].name + ' ' + PORTAL_SPECIALS[u.id].cost + '⚡';
    el.appendChild(stats);
    if (dead) {
      const tag = document.createElement('div');
      tag.className = 'pl-dead-tag';
      const cd = document.createElement('span');
      cd.textContent = fmtClock(Math.ceil((portalDeadUntil(u.id) - Date.now()) / 1000));
      tag.innerHTML = 'DEAD';
      tag.appendChild(cd);
      if (p.pots.revive > 0) {
        const rb = document.createElement('button');
        rb.className = 'pl-btn';
        rb.textContent = '🪶 REVIVE (' + p.pots.revive + ')';
        rb.title = PORTAL_POTS.revive.desc;
        rb.style.pointerEvents = 'auto';
        rb.onclick = (ev) => { ev.stopPropagation(); usePortalPot('revive', u.id); };
        tag.appendChild(rb);
      }
      el.appendChild(tag);
      plDeadEls.push({ uid: u.id, el: cd });
    } else {
      el.onclick = () => togglePortalUnit(u.id);
      el.style.pointerEvents = 'auto';
      el.draggable = true;
      el.ondragstart = ev => ev.dataTransfer.setData('text/plain', 'r:' + u.id);
      const btns = document.createElement('div');
      btns.className = 'pl-btnrow';
      if (p.pots.elixir > 0) {
        const eb = document.createElement('button');
        eb.className = 'pl-btn';
        eb.textContent = '⚗ +10%';
        eb.title = PORTAL_POTS.elixir.name + ': ' + PORTAL_POTS.elixir.desc +
          ' (now +' + 10 * (p.perm[u.id] || 0) + '%)';
        eb.style.pointerEvents = 'auto';
        eb.onclick = (ev) => { ev.stopPropagation(); usePortalPot('elixir', u.id); };
        btns.appendChild(eb);
      }
      if (p.pots.satchel > 0 && (p.slotPlus[u.id] || 0) < 2) {
        const sb = document.createElement('button');
        sb.className = 'pl-btn';
        sb.textContent = '🎒 +SLOT';
        sb.title = PORTAL_POTS.satchel.name + ': ' + PORTAL_POTS.satchel.desc;
        sb.style.pointerEvents = 'auto';
        sb.onclick = (ev) => { ev.stopPropagation(); usePortalPot('satchel', u.id); };
        btns.appendChild(sb);
      }
      if (btns.childNodes.length) el.appendChild(btns);
    }
    ros.appendChild(el);
  }
  secR.appendChild(ros);
  box.appendChild(secR);

  /* --- start --- */
  const secT = document.createElement('div');
  secT.className = 'pl-section';
  const start = document.createElement('button');
  start.id = 'pl-start';
  start.textContent = '⚔ BEGIN COMBAT';
  start.disabled = !portalTeam.some(Boolean);
  start.onclick = portalStartBattle;
  secT.appendChild(start);

  const auto = document.createElement('button');
  auto.id = 'pl-autobtn';
  if (hasTree('auto5')) {
    auto.className = 'pl-btn' + (p.auto ? ' on' : '');
    auto.textContent = p.auto ? '♻ AUTO MODE: ON' : '♻ AUTO MODE: OFF';
    auto.title = 'After each victory the next battle starts by itself. Card picks still wait for you; a defeat stops the chain.';
    auto.onclick = () => { p.auto = !p.auto; renderPortalLobby(); };
  } else {
    auto.className = 'pl-btn';
    auto.textContent = '🔒 AUTO MODE';
    auto.title = 'Unlock in the Ascension tree — Automation branch (Rift Standing Orders).';
    auto.disabled = true;
  }
  secT.appendChild(auto);

  const note = document.createElement('div');
  note.className = 'pl-note';
  note.innerHTML = 'Positions 🔒 when combat begins. Units auto-attack and fire their SPECIAL when ' +
    'their energy (⚡) fills — each one charges to a different cost.<br>' +
    'FIGHTERS hit the front row · RANGED hit the back row · AOE hit everyone — hover anything for details.<br>' +
    'Defeat leaves your deployed units DEAD for 10 minutes — they fight for nothing while dead. ' +
    'Stages reset on Ascension.';
  secT.appendChild(note);
  box.appendChild(secT);

  /* --- supplies & cards --- */
  const secP = document.createElement('div');
  secP.className = 'pl-section';
  secP.innerHTML = '<div class="pl-head">RIFT SUPPLIES & CARDS</div>';
  const pots = document.createElement('div');
  pots.className = 'pl-pots';
  for (const k in PORTAL_POTS) {
    const el = document.createElement('div');
    el.className = 'pl-pot';
    el.title = PORTAL_POTS[k].desc;
    el.innerHTML = PORTAL_POTS[k].name + ': <b>' + (p.pots[k] || 0) + '</b>';
    pots.appendChild(el);
  }
  if (p.pots.energy > 0 || p.flaskArmed) {
    const fb = document.createElement('button');
    fb.className = 'pl-btn';
    fb.textContent = p.flaskArmed ? '✓ FLASK ARMED — full energy next battle (cancel)' : '⚗ DRINK AETHER FLASK before next battle';
    fb.title = PORTAL_POTS.energy.desc;
    fb.onclick = () => {
      p.flaskArmed = !p.flaskArmed && p.pots.energy > 0;
      renderPortalLobby();
    };
    pots.appendChild(fb);
  }
  const cardCounts = {};
  for (const id of p.cards) cardCounts[id] = (cardCounts[id] || 0) + 1;
  for (const id in cardCounts) {
    const card = PORTAL_CARDS.find(c => c.id === id);
    const el = document.createElement('div');
    el.className = 'pl-pot';
    el.title = card.desc;
    el.innerHTML = '🃏 ' + card.name + (cardCounts[id] > 1 ? ' <b>x' + cardCounts[id] + '</b>' : '');
    pots.appendChild(el);
  }
  secP.appendChild(pots);
  box.appendChild(secP);
}

function usePortalPot(kind, uid) {
  const p = state.portal;
  if (!p.pots[kind]) return;
  const name = UNITS.find(u => u.id === uid).name;
  if (kind === 'revive') {
    if (!portalUnitDead(uid)) return;
    p.pots.revive--;
    delete p.deadUntil[uid];
    toast('🪶 ' + name + ' returns to life!');
  } else if (kind === 'elixir') {
    p.pots.elixir--;
    p.perm[uid] = (p.perm[uid] || 0) + 1;
    toast('⚗ ' + name + ': permanently +10% Rift HP & damage (now +' + 10 * p.perm[uid] + '%)!');
  } else if (kind === 'satchel') {
    if ((p.slotPlus[uid] || 0) >= 2) return;
    p.pots.satchel--;
    p.slotPlus[uid] = (p.slotPlus[uid] || 0) + 1;
    state.equip[uid].push(null); // new slot appears in the unit's panel
    toast('🎒 ' + name + ' gains a permanent equipment slot!');
  }
  renderPortalLobby();
  if (typeof save === 'function') save();
}

function togglePortalUnit(uid) {
  const i = portalTeam.indexOf(uid);
  if (i >= 0) portalTeam[i] = null;
  else if (!seatPortalUnit(uid)) { toast('The battlefield is full — unseat someone first!'); return; }
  renderPortalLobby();
}

/* ---------------- battle engine ---------------- */

function makeAlly(uid, slot) {
  const u = UNITS.find(x => x.id === uid);
  const st = portalUnitStats(uid);
  return {
    uid, name: u.name, sprite: u.portrait, role: st.role, side: 'ally',
    gridSlot: slot, row: slot < 2 ? 'front' : 'back',
    hp: st.hp, maxHp: st.hp, dmg: st.dmg, spd: st.spd,
    energy: 0, energyMax: PORTAL_SPECIALS[uid].cost,
    cd: st.spd * (0.4 + Math.random() * 0.5), alive: true, boss: false,
  };
}

function makeFoe(e, i) {
  return {
    ...e, side: 'enemy', gridSlot: i,
    maxHp: e.hp, energy: 0, energyMax: PORTAL_ENEMY_SPECIALS[e.role].cost,
    cd: e.spd * (0.6 + Math.random() * 0.6), alive: true,
  };
}

function portalStartBattle() {
  const picked = portalTeam
    .map((uid, slot) => (uid && !portalUnitDead(uid)) ? { uid, slot } : null)
    .filter(Boolean);
  if (!picked.length) { toast('Deploy at least one unit!'); return; }
  state.portal.team = portalTeam.slice(); // positions lock in
  const allies = picked.map(p => makeAlly(p.uid, p.slot));
  const enemies = portalNext.map(makeFoe);
  let flask = false;
  if (state.portal.flaskArmed && state.portal.pots.energy > 0) {
    state.portal.pots.energy--;
    state.portal.flaskArmed = false;
    flask = true;
    toast('Aether Flask! Your team enters with FULL energy.');
  }
  const startE = 30 * portalCardCount('c_start');
  const firstM = portalCardCount('c_first') ? 0.5 : 1;
  for (const a of allies) {
    a.energy = flask ? a.energyMax : Math.min(a.energyMax - 5, startE);
    a.cd *= firstM;
  }
  battle = { allies, enemies, t: 0, over: false, shieldT: 0 };
  buildBattleDom();
  showPortalScreen('battle');
}

function buildBattleDom() {
  $('pb-stagebar').textContent = 'STAGE ' + portalStageN() + ' — THE RIFT';
  $('pb-foot').innerHTML = 'Closing the portal mid-fight counts as <b>DEFEAT</b>!';
  for (const [holder, team, frontCol] of [
    [$('pb-allies'), battle.allies, 2],   // allies face right: front = right column
    [$('pb-enemies'), battle.enemies, 1], // enemies face left: front = left column
  ]) {
    holder.innerHTML = '';
    for (const c of team) {
      const cell = document.createElement('div');
      cell.className = 'pf-cell';
      /* same grid coordinates the player saw (and set) in the lobby */
      cell.style.gridColumn = c.gridSlot < 2 ? frontCol : (frontCol === 2 ? 1 : 2);
      cell.style.gridRow = c.gridSlot % 2 + 1;
      const sp = c.side === 'ally' ? PORTAL_SPECIALS[c.uid] : PORTAL_ENEMY_SPECIALS[c.role];
      cell.title = c.name + ' — ' + PORTAL_ROLES[c.role].desc + '. ★ ' + sp.name +
        ' (' + sp.cost + '⚡): ' + sp.desc;
      const nm = document.createElement('div');
      nm.className = 'pf-nm';
      nm.textContent = c.name;
      cell.appendChild(nm);
      cell.appendChild(spriteCanvas(c.sprite, c.boss ? 4 : 3));
      const bars = document.createElement('div');
      bars.className = 'pf-bars';
      const hpBar = document.createElement('div');
      hpBar.className = 'pf-hpbar';
      hpBar.appendChild(document.createElement('div'));
      const enBar = document.createElement('div');
      enBar.className = 'pf-enbar';
      enBar.appendChild(document.createElement('div'));
      bars.appendChild(hpBar);
      bars.appendChild(enBar);
      cell.appendChild(bars);
      holder.appendChild(cell);
      c.el = cell;
      c.hpEl = hpBar;
      c.enEl = enBar.firstChild;
    }
  }
}

function pfFloat(c, text, cls) {
  if (!c.el) return;
  const f = document.createElement('span');
  f.className = 'pf-float ' + (cls || '');
  f.textContent = text;
  c.el.appendChild(f);
  setTimeout(() => f.remove(), 850);
}

function pfFlash(c) {
  if (!c.el) return;
  c.el.classList.add('flash');
  setTimeout(() => c.el.classList.remove('flash'), 130);
}

function hurtC(c, dmg, opts) {
  if (!c.alive) return;
  c.hp -= dmg;
  if (opts && opts.quiet) { /* damage-over-time: no floater spam */ }
  else {
    pfFloat(c, '-' + fmt(dmg), (opts && opts.crit) ? 'crit' : 'hurt');
    pfFlash(c);
  }
  if (c.hp <= 0) {
    c.hp = 0;
    c.alive = false;
    if (c.el) {
      c.el.classList.add('dead');
      const sk = document.createElement('div');
      sk.className = 'pf-dead-skull';
      sk.textContent = '💀';
      c.el.appendChild(sk);
    }
  }
}

function healC(c, amt, quiet) {
  if (!c.alive) return;
  const real = Math.min(c.maxHp - c.hp, amt);
  if (real <= 0) return;
  c.hp += real;
  if (!quiet) pfFloat(c, '+' + fmt(real), 'heal');
}

function pickTargets(c, foes) {
  const alive = foes.filter(f => f.alive);
  if (!alive.length) return [];
  if (c.role === 'aoe') return alive;
  const prefRow = c.role === 'ranged' ? 'back' : 'front';
  const pref = alive.filter(f => f.row === prefRow);
  return [(pref.length ? pref : alive)[0]];
}

function attackDamage(c, isAlly, mult) {
  let dmg = c.dmg * (mult || 1);
  let crit = false;
  const critC = 0.10 * portalCardCount('c_crit');
  if (isAlly && critC && Math.random() < critC) { dmg *= 2; crit = true; }
  if (!isAlly && battle.shieldT > 0) dmg *= 0.7; // Shield Wall
  return { dmg, crit };
}

function doAttack(c, foes, isAlly) {
  for (const t of pickTargets(c, foes)) {
    const { dmg, crit } = attackDamage(c, isAlly, 1);
    hurtC(t, dmg, { crit });
  }
}

function doSpecial(c, team, foes, isAlly) {
  const aliveFoes = foes.filter(f => f.alive);
  if (!aliveFoes.length && c.uid !== 'cleric') return;
  const name = isAlly ? PORTAL_SPECIALS[c.uid].name : PORTAL_ENEMY_SPECIALS[c.role].name;
  pfFloat(c, '★ ' + name, 'shout');

  const hitMany = (targets, mult) => {
    for (const t of targets) {
      const { dmg, crit } = attackDamage(c, isAlly, mult);
      hurtC(t, dmg, { crit });
    }
  };
  const hitOne = (t, mult) => t && hitMany([t], mult);

  if (isAlly) {
    switch (c.uid) {
      case 'hero': {
        const front = aliveFoes.filter(f => f.row === 'front');
        hitMany(front.length ? front : aliveFoes.slice(0, 1), 2.5);
        break;
      }
      case 'golem': hitOne(pickTargets(c, foes)[0], 3.5); break;
      case 'walls': hitOne(pickTargets(c, foes)[0], 2); battle.shieldT = 4; break;
      case 'archer': hitMany(aliveFoes, 1.2); break;
      case 'turret': hitOne(aliveFoes.slice().sort((a, b) => a.hp - b.hp)[0], 3); break;
      case 'dragon': hitMany(aliveFoes, 1.5); break;
      case 'mage': hitMany(aliveFoes, 2.2); break;
      case 'knight': hitOne(pickTargets(c, foes)[0], 3); break;
      case 'plague': hitMany(aliveFoes, 2.2); break;
      case 'valkyrie': hitMany(aliveFoes, 1.6); break;
      case 'cleric':
        for (const a of team) healC(a, a.maxHp * 0.25);
        break;
    }
  } else {
    /* enemy specials match what their card advertises */
    if (c.role === 'aoe') hitMany(aliveFoes, 1.5);                                      // Dark Surge
    else if (c.role === 'ranged') hitOne(aliveFoes.slice().sort((a, b) => a.hp - b.hp)[0], 3); // Deadshot
    else hitOne(pickTargets(c, foes)[0], 2.5);                                          // Crushing Blow
  }
}

function battleTick(dt) {
  if (!battle || battle.over) return;
  battle.t += dt;
  if (battle.shieldT > 0) battle.shieldT -= dt;

  for (const [team, foes, isAlly] of [
    [battle.allies, battle.enemies, true],
    [battle.enemies, battle.allies, false],
  ]) {
    for (const c of team) {
      if (!c.alive) continue;
      const rate = PORTAL_ENERGY_RATE * (isAlly ? 1 + 0.25 * portalCardCount('c_rate') : 1);
      c.energy += rate * dt;
      c.cd -= dt;
      if (c.cd <= 0) {
        c.cd += c.spd * (0.9 + Math.random() * 0.2);
        doAttack(c, foes, isAlly);
        c.energy += PORTAL_ENERGY_HIT;
      }
      if (c.energy >= c.energyMax && c.alive) {
        c.energy = 0;
        doSpecial(c, team, foes, isAlly);
      }
    }
  }

  /* card auras */
  const burn = portalCardCount('c_burn');
  if (burn) for (const e of battle.enemies) if (e.alive) hurtC(e, e.maxHp * 0.01 * burn * dt, { quiet: true });
  const regen = portalCardCount('c_heal');
  if (regen) for (const a of battle.allies) if (a.alive) healC(a, a.maxHp * 0.015 * regen * dt, true);

  updateBattleDom();

  if (!battle.enemies.some(e => e.alive)) {
    battle.over = true;
    setTimeout(portalWin, 650);
  } else if (!battle.allies.some(a => a.alive)) {
    battle.over = true;
    setTimeout(() => portalLose(false), 650);
  }
}

function updateBattleDom() {
  for (const c of [...battle.allies, ...battle.enemies]) {
    if (!c.el) continue;
    const hpPct = Math.max(0, c.hp / c.maxHp);
    c.hpEl.firstChild.style.width = (hpPct * 100).toFixed(1) + '%';
    c.hpEl.classList.toggle('low', hpPct < 0.3);
    c.enEl.style.width = Math.min(100, c.energy / c.energyMax * 100).toFixed(0) + '%';
  }
}

/* ---------------- win / lose ---------------- */

function portalWin() {
  const p = state.portal;
  const stageN = portalStageN();
  const bossStage = stageN % PORTAL_BOSS_EVERY === 0;
  p.stage++;
  p.wins++;
  if (p.stage > p.best) p.best = p.stage;

  const lines = [];
  const g = Math.pow(ZONE_GOLD_GROWTH, stageN - 1);
  const goldGain = 6 * g * 25 * (C ? C.killMult : 1) * (1 + 0.25 * portalCardCount('c_gold')) * (bossStage ? 3 : 1) *
    (hasTree('xrift2') ? 1.5 : 1); // Rift Plunder
  earnGold(goldGain);
  lines.push('<span class="gold">+' + fmt(goldGain) + ' Gold</span>');

  if (C) {
    const wood = Math.max(8, C.prod.wood * 15), stone = Math.max(8, C.prod.stone * 15);
    state.wood += wood;
    state.stone += stone;
    lines.push('+' + fmt(wood) + ' Wood · +' + fmt(stone) + ' Stone');
  }

  const dropC = Math.min(0.95, (bossStage ? 1 : 0.4) * (C ? C.dropMult : 1) * (1 + 0.20 * portalCardCount('c_drop')) *
    (hasTree('xrift2') ? 1.25 : 1)); // Rift Plunder
  if (Math.random() < dropC) {
    const d = rollDrop();
    invAdd(d.t, d.tier, 1, d.a);
    state.stats.itemsFound++;
    lines.push('<span class="item">' + itemName(d.t, d.tier, d.a) + '</span>');
  }

  /* consumable drops — the Rift's real prize */
  const potRoll = (chance, key) => {
    if (hasTree('xrift4')) chance = Math.min(1, chance * 2); // Alchemist's Favor
    if (Math.random() >= chance) return;
    p.pots[key]++;
    lines.push('<span class="item">🧪 ' + PORTAL_POTS[key].name + '</span> <span class="dim">— ' + PORTAL_POTS[key].desc + '</span>');
  };
  potRoll(bossStage ? 0.35 : 0.10, 'revive');
  potRoll(bossStage ? 0.35 : 0.12, 'energy');
  potRoll(bossStage ? 0.30 : 0.03, 'elixir');
  if (bossStage) potRoll(stageN === 10 ? 1 : 0.20, 'satchel'); // first boss always pays out

  portalNext = portalEnemyTeam(portalStageN());
  showPortalResult(true, lines, bossStage ? stageN : 0);
}

function portalLose(retreated) {
  const p = state.portal;
  p.losses++;
  const until = Date.now() + PORTAL_DEATH_MS;
  const fallen = [], revived = [];
  for (const a of battle.allies) {
    /* Standing Reserves: Phoenix Feathers are spent the moment they fall */
    if (hasTree('auto11') && p.pots.revive > 0) {
      p.pots.revive--;
      revived.push(a.name);
      continue;
    }
    p.deadUntil[a.uid] = until;
    fallen.push(a.name);
  }
  const lines = [(retreated ? 'You fled the Rift...' : 'Your team was slain...')];
  if (fallen.length) {
    lines.push('<span class="dim">' + fallen.join(', ') + '</span>');
    lines.push('DEAD for <b style="color:var(--hp)">10:00</b> — they give NO damage or item bonuses until they recover!');
  }
  if (revived.length)
    lines.push('<span class="item">🧪 Standing Reserves: ' + revived.join(', ') + ' revived by Phoenix Feather!</span>');
  showPortalResult(false, lines, 0);
}

function portalRetreat() {
  if (!battle || battle.over) return;
  battle.over = true;
  toast('You retreated from the Rift — that counts as a defeat!');
  portalLose(true);
}

function showPortalResult(won, lines, cardStage) {
  battle = null;
  const box = $('portal-result');
  box.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'pr-title ' + (won ? 'win' : 'lose');
  title.textContent = won ? '✦ VICTORY ✦' : '✝ DEFEAT ✝';
  box.appendChild(title);
  const body = document.createElement('div');
  body.className = 'pr-lines';
  body.innerHTML = lines.join('<br>');
  box.appendChild(body);
  const btn = document.createElement('button');
  btn.className = 'pr-btn';
  btn.textContent = cardStage ? 'CHOOSE A RIFT CARD' : 'CONTINUE';
  btn.onclick = () => { cardStage ? showCardPick() : showPortalScreen('lobby'); };
  box.appendChild(btn);

  /* AUTO MODE: victories roll straight into the next stage */
  if (won && state.portal.auto && !cardStage) {
    const note = document.createElement('div');
    note.className = 'pr-lines';
    note.innerHTML = '<span class="dim">♻ AUTO — the next battle begins in a moment…</span>';
    box.appendChild(note);
    btn.textContent = 'STOP AUTO (lobby)';
    const myToken = ++portalAutoToken;
    btn.onclick = () => { portalAutoToken++; showPortalScreen('lobby'); };
    setTimeout(() => {
      if (myToken === portalAutoToken && portalScreen === 'result' && !battle &&
          state.portal.auto && !$('portal-modal').classList.contains('hidden')) {
        portalStartBattle();
      }
    }, 1200);
  }
  showPortalScreen('result');
  if (typeof save === 'function') save();
}

/* ---------------- rift cards (1 of 3 every 10 stages) ---------------- */

function showCardPick() {
  const box = $('portal-cards');
  box.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'pr-title win';
  title.textContent = 'THE RIFT OFFERS A BARGAIN';
  box.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'pr-lines';
  sub.innerHTML = '<span class="dim">Choose ONE card — it empowers your Rift battles until Ascension.</span>';
  box.appendChild(sub);
  const row = document.createElement('div');
  row.className = 'pc-row';
  const pool = PORTAL_CARDS.slice();
  const offers = hasTree('xrift3') ? 4 : 3; // Cartomancer
  for (let i = 0; i < offers && pool.length; i++) {
    const card = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const el = document.createElement('div');
    el.className = 'pc-card';
    el.style.pointerEvents = 'auto';
    el.innerHTML = '<div class="pc-nm">' + card.name + '</div><div class="pc-ds">' + card.desc + '</div>';
    el.onclick = () => {
      state.portal.cards.push(card.id);
      toast('Rift Card: ' + card.name + '!');
      if (state.portal.auto) portalStartBattle(); // auto rolls on after the pick
      else showPortalScreen('lobby');
      if (typeof save === 'function') save();
    };
    row.appendChild(el);
  }
  box.appendChild(row);
  showPortalScreen('cards');
}

/* ---------------- the gate on the map ---------------- */

function makePortalGate() {
  if ($('portal-gate')) return;
  const [tx, ty] = PORTAL_GATE_TILE;
  const el = document.createElement('div');
  el.id = 'portal-gate';
  el.style.left = ((tx + 0.5) / MAP_W * 100) + '%';
  el.style.top = ((ty + 1) / MAP_H * 100) + '%';
  el.title = 'The Rift Portal — enter the arena! (Stage ' + portalStageN() + ')';
  el.appendChild(spriteCanvas('portal', 3));
  el.onclick = (ev) => {
    ev.stopPropagation();
    if (mapDragged) return;
    if (typeof modeTileUnlocked === 'function' && !modeTileUnlocked('portal')) return; // claim Riftgate Ward first
    openPortal();
  };
  $('map-world').appendChild(el);
  if (typeof refreshModeGates === 'function') refreshModeGates();
}

/* ---------------- init (runs after game.js init) ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  portalEnsure(state);
  makePortalGate();
  $('close-portal').onclick = closePortal;
});
