'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({
  console,
  document: { addEventListener() {} },
  window: { addEventListener() {} },
  performance: { now: () => 0 },
  requestAnimationFrame() {},
  setTimeout() {},
  clearTimeout() {},
  setInterval() {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});

for (const file of ['js/data.js', 'js/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

function run(source) {
  return vm.runInContext(source, context);
}

const shape = JSON.parse(run(`JSON.stringify({
  total: PRESTIGE_TREE.length,
  offline: PRESTIGE_TREE.filter(node => node.branch === 'offline').length,
  gold: OFFLINE_GOLD_NODE_IDS.length,
  combat: OFFLINE_COMBAT_NODE_IDS.length,
  loot: OFFLINE_LOOT_NODE_IDS.length,
  cap: OFFLINE_CAP_NODE_IDS.length,
  missing: [...OFFLINE_GOLD_NODE_IDS, ...OFFLINE_COMBAT_NODE_IDS, ...OFFLINE_LOOT_NODE_IDS, ...OFFLINE_CAP_NODE_IDS]
    .filter(id => !PRESTIGE_TREE.some(node => node.id === id)),
  firstCosts: ['off1', 'xoffwood', 'xoffwar1', 'xoffloot1']
    .map(id => PRESTIGE_TREE.find(node => node.id === id).cost),
})`));

assert.equal(shape.gold, 15, 'the Gold spine must have fifteen 10% nodes');
assert.equal(shape.combat, 4, 'offline combat should have four 25% tiers');
assert.equal(shape.loot, 4, 'offline loot should have four 25% tiers');
assert.equal(shape.cap, 7, 'offline duration should have seven cap-removal steps');
assert.equal(shape.missing.length, 0, 'every configured offline node must exist in the tree');
assert.ok(shape.offline >= 26, 'the Aftertime branch should contain its spine and side paths');
assert.ok(shape.firstCosts.every(cost => cost <= 2), 'entry nodes should stay very cheap');
assert.equal(run('new Set(PRESTIGE_TREE.map(node => node.id)).size'), shape.total, 'tree node ids must remain unique');
assert.equal(run(`PRESTIGE_TREE.flatMap(node => Array.isArray(node.requires) ? node.requires : node.requires ? [node.requires] : [])
  .filter(id => !PRESTIGE_TREE.some(node => node.id === id)).length`), 0, 'every tree prerequisite must point to a node');
for (const [id, gate, previous] of [
  ['off4', 'era2', 'off3'], ['off7', 'era3', 'off6'], ['off10', 'era4', 'off9'],
  ['off12', 'era5', 'off11'], ['off14', 'era6', 'off13'],
]) {
  const requires = JSON.parse(run(`JSON.stringify(PRESTIGE_TREE.find(node => node.id === '${id}').requires)`));
  assert.deepEqual(requires, [gate, previous], `${id} should continue the spine through its Era gate`);
}
for (const [id, requires] of [
  ['xautotime1', ['era4', 'auto8']],
  ['xautotime2', 'xautotime1'],
  ['xautotime3', ['era5', 'xautotime2']],
  ['xautotime4', ['era6', 'xautotime3']],
  ['xautotime5', ['xautotime4', 'auto20']],
]) {
  const actual = JSON.parse(run(`JSON.stringify(PRESTIGE_TREE.find(node => node.id === '${id}').requires)`));
  assert.deepEqual(actual, requires, `${id} should stay on the intended late-game duration chain`);
}

const layout = JSON.parse(run(`JSON.stringify(PRESTIGE_TREE.map(node => ({
  id: node.id,
  branch: node.branch,
  era: node.era,
  gate: !!node.gate,
  side: !!node.side,
  pos: treeNodePos(node),
})))`));
const layoutPairs = [];
const capLayoutIds = new Set(['auto7', 'auto8', 'xautotime1', 'xautotime2', 'xautotime3', 'xautotime4', 'xautotime5']);
for (let i = 0; i < layout.length; i++) for (let j = i + 1; j < layout.length; j++) {
  if (layout[i].branch === 'offline' || layout[j].branch === 'offline' ||
      capLayoutIds.has(layout[i].id) || capLayoutIds.has(layout[j].id) ||
      (layout[i].era === 1 && layout[j].era === 1)) layoutPairs.push([layout[i], layout[j]]);
}
for (const node of layout.filter(node => node.branch === 'offline')) {
  assert.ok(node.pos.every(value => value > 0 && value < 6600), `${node.id} must remain inside the tree world`);
}
for (const [node, other] of layoutPairs) {
  const dx = Math.abs(node.pos[0] - other.pos[0]);
  const dy = Math.abs(node.pos[1] - other.pos[1]);
  const width = item => item.gate ? 150 : item.branch === 'offline' && item.side ? 100 : 148;
  const minDx = (width(node) + width(other)) / 2;
  assert.ok(dx >= minDx || dy >= 54, `${node.id} should not overlap ${other.id} (${dx.toFixed(1)}x${dy.toFixed(1)}px apart)`);
}

run('state.tree = {}');
assert.equal(run('offlineGoldRate()'), 0, 'fresh saves start with no offline production');
assert.equal(run('offlineCombatRate()'), 0, 'fresh saves start with no offline combat');
assert.equal(run('offlineLootRate()'), 0, 'fresh saves start with no offline loot');

run('state.tree = Object.fromEntries(OFFLINE_GOLD_NODE_IDS.map(id => [id, true]))');
assert.equal(run('offlineGoldRate()'), 1.5, 'the Gold spine caps at 150%');
run("state.tree.xoffwood = true; state.tree.xoffstone = true; state.tree.xoffmana = true");
assert.deepEqual(
  JSON.parse(run("JSON.stringify(RESOURCES.filter(offlineResourceEnabled))")),
  ['gold', 'wood', 'stone', 'mana'],
  'material unlocks should add every non-Gold resource',
);

run('state.tree = Object.fromEntries(OFFLINE_COMBAT_NODE_IDS.map(id => [id, true]))');
assert.equal(run('offlineCombatRate()'), 1, 'offline combat caps at normal idle damage');
run('state.tree = Object.fromEntries(OFFLINE_LOOT_NODE_IDS.map(id => [id, true]))');
assert.equal(run('offlineLootRate()'), 1, 'offline loot caps at normal drop chance');
for (const [nodes, hours, label] of [
  [[], 4, '4 hours'],
  [['auto7'], 8, '8 hours'],
  [['auto7', 'auto8'], 12, '12 hours'],
  [['auto7', 'auto8', 'xautotime1'], 16, '16 hours'],
  [['auto7', 'auto8', 'xautotime1', 'xautotime2'], 20, '20 hours'],
  [['auto7', 'auto8', 'xautotime1', 'xautotime2', 'xautotime3'], 24, '24 hours'],
  [['auto7', 'auto8', 'xautotime1', 'xautotime2', 'xautotime3', 'xautotime4'], 48, '48 hours'],
]) {
  run(`state.tree = Object.fromEntries(${JSON.stringify(nodes)}.map(id => [id, true]))`);
  assert.equal(run('offlineCapHours()'), hours);
  assert.equal(run('offlineCapLabel()'), label);
  assert.equal(run('offlineElapsedSeconds(72 * 3600)'), hours * 3600);
}
run("state.tree.xautotime5 = true");
assert.equal(run('offlineCapHours()'), Infinity, 'Clock Beyond Time should remove the offline cap');
assert.equal(run('offlineCapLabel()'), 'Uncapped');
assert.equal(run('offlineElapsedSeconds(72 * 3600)'), 72 * 3600, 'uncapped progress should count the entire elapsed period');

run(`
  state = ensureShape({ ...state, ...defaultRunState(), tree: { off1: true, xoffwar1: true } });
  state.totalKills = 0;
  state.archer = 1;
  state.monster = null;
  C = calc();
`);
const patrol = JSON.parse(run('JSON.stringify(simulateOfflineCombat(C, 60, offlineCombatRate(), 0))'));
assert.equal(patrol.kills, 1, '25% of one Archer for 60s should clear the first 15 HP enemy');
assert.equal(run('state.killIdx'), 2, 'offline kills should advance the main combat stage');

run(`
  state = ensureShape({ ...state, ...defaultRunState(), tree: { off1: true, xoffwar1: true } });
  state.totalKills = 0;
  state.archer = 1;
  state.monster = null;
  delete state._offlineMonsterHp;
  C = calc();
  simulateOfflineCombat(C, 20, offlineCombatRate(), 0);
`);
assert.equal(run('state.totalKills'), 0, 'partial offline damage must not count as a kill');
assert.equal(run('state._offlineMonsterHp'), 10, 'partial offline damage should survive into the rendered monster');

run(`
  let testToast = '';
  let testSaves = 0;
  toast = message => { testToast = message; };
  save = () => { state.lastSave = Date.now(); testSaves++; };
  state = ensureShape({ ...state, ...defaultRunState(), tree: {}, totalKills: 0,
    lifetimeGold: 0, runGold: 0, lastSave: Date.now() - 3600 * 1000 });
  offlineProgress();
`);
assert.equal(run('state.gold'), 0, 'an empty Aftertime tree must award no offline Gold');
assert.match(run('testToast'), /Aftertime is dormant/, 'fresh saves should explain why no offline reward was earned');

run(`
  state = ensureShape({ ...state, ...defaultRunState(), tree: { off1: true }, totalKills: 0,
    lifetimeGold: 0, runGold: 0, lastSave: Date.now() - 3600 * 1000 });
  state.buildings.farm = 1;
  offlineProgress();
`);
const claimedGold = run('state.gold');
assert.ok(claimedGold > 0, 'Closed Ledgers should award time-based Gold production');
run('offlineProgress()');
assert.equal(run('state.gold'), claimedGold, 'the same elapsed period must not be claimable twice');
assert.ok(run('testSaves') >= 2, 'offline claims should advance and persist the save timestamp');

console.log('offline progression tests passed');
