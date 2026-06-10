/* ============================================================
   Aetherholm — data.js
   All game balance / content definitions live here so the game
   is easy to expand later without touching engine code.
   ============================================================ */

const RESOURCES = ['gold', 'wood', 'stone', 'mana'];

const RES_META = {
  gold:  { name: 'Gold',  icon: 'icoGold',  color: '#ffd23e' },
  wood:  { name: 'Wood',  icon: 'icoWood',  color: '#c79454' },
  stone: { name: 'Stone', icon: 'icoStone', color: '#aab0b8' },
  mana:  { name: 'Mana',  icon: 'icoMana',  color: '#5fd9ff' },
};

/* ---------------- DAY / NIGHT CYCLE ---------------- */
const DAY_SEC = 300;            // 5 minutes of day...
const NIGHT_SEC = 180;          // ...then 3 minutes of night
const CYCLE_SEC = DAY_SEC + NIGHT_SEC;
const DAY_GOLD_BONUS = 0.25;    // day: +25% gold production & bounties
const NIGHT_HP_MULT = 1.5;      // night: monsters spawn with +50% HP...
const NIGHT_BOUNTY_MULT = 1.5;  // ...but pay +50% gold...
const NIGHT_DROP_MULT = 2;      // ...and drop items twice as often

/* ---------------- CITY BUILDINGS ----------------
   cost: base cost (scales x1.15 per owned)
   prod: per-second production per building
   special: text + handled in calc() by id
   sprite + optional pal: palette-tinted variant of a base sprite */
const BUILDINGS = [
  /* ---- Old Town: the early game ---- */
  { id: 'farm',      name: 'Farm',          sprite: 'farm',      cost: { gold: 15 },                                          prod: { gold: 0.5 },   desc: 'Honest fields that feed the city.' },
  { id: 'lumber',    name: 'Lumber Mill',   sprite: 'lumber',    cost: { gold: 60 },                                          prod: { wood: 0.2 },   desc: 'Produces Wood for war machines & halls.' },
  { id: 'quarry',    name: 'Quarry',        sprite: 'quarry',    cost: { gold: 240 },                                         prod: { stone: 0.12 }, desc: 'Produces Stone for walls & temples.' },
  { id: 'tavern',    name: 'Tavern',        sprite: 'tavern',    cost: { gold: 420, wood: 15 },                               prod: { gold: 4 },     desc: 'Adventurers drink, the coffers fill.' },
  { id: 'windmill',  name: 'Windmill',      sprite: 'windmill',  cost: { gold: 950, wood: 30 },                               prod: { gold: 8 },     desc: 'Grain turns to flour, flour to gold.', special: '+5% Farm gold each' },
  { id: 'market',    name: 'Market',        sprite: 'market',    cost: { gold: 1600, wood: 45 },                              prod: { gold: 14 },    desc: 'Trade caravans from distant realms.' },
  { id: 'keep',      name: 'Castle Keep',   sprite: 'keep',      cost: { gold: 650000, wood: 850, stone: 850, mana: 220 },    prod: { gold: 2800 },  desc: 'The crown jewel of Aetherholm.' },

  /* ---- West Ward ---- */
  { id: 'alchemist', name: 'Alchemist',     sprite: 'alchemist', cost: { gold: 3200, wood: 60 },                              prod: { mana: 0.03 },  desc: 'Bubbling vials and early Mana.' },
  { id: 'smith',     name: 'Blacksmith',    sprite: 'smith',     cost: { gold: 5200, wood: 90, stone: 35 },                   prod: { gold: 42 },    desc: 'Forges of war.', special: '+10% Ballista & Golem damage each' },
  { id: 'tannery',   name: 'Tannery',       sprite: 'smith',     pal: { s: '#8a6a3c', S: '#6b4e26', F: '#c79454', f: '#e0c060' }, cost: { gold: 18000, wood: 200 },        prod: { gold: 150 },   desc: 'Leather for armies and saddles.' },
  { id: 'sawmill',   name: 'Sawmill',       sprite: 'lumber',    pal: { d: '#7a2f1f', b: '#a2653a', B: '#7d4a28' },           cost: { gold: 30000, stone: 150 },           prod: { wood: 1.5 },   desc: 'Water-driven blades. Wood, industrialized.' },
  { id: 'armory',    name: 'Armory',        sprite: 'barracks',  pal: { s: '#7d92ac', S: '#54667e', r: '#ffd23e' },           cost: { gold: 90000, wood: 300, stone: 200 }, prod: { gold: 120 },  desc: 'Racks of polished steel.', special: '+3% ALL unit damage each' },

  /* ---- East Ward ---- */
  { id: 'wharf',     name: 'Fishing Wharf', sprite: 'wharf',     cost: { gold: 8500, wood: 130 },                             prod: { gold: 70 },    desc: 'Nets in the river, silver in the hold.' },
  { id: 'manawell',  name: 'Mana Well',     sprite: 'manawell',  cost: { gold: 13000, stone: 90 },                            prod: { mana: 0.08 },  desc: 'Draws Mana from the leylines below.' },
  { id: 'stonecutter', name: 'Stonecutter', sprite: 'quarry',    pal: { s: '#c2a36b', S: '#94783f' },                         cost: { gold: 45000, wood: 400 },            prod: { stone: 0.8 },  desc: 'Sandstone blocks, cut to order.' },
  { id: 'fishmarket', name: 'Fish Market',  sprite: 'market',    pal: { o: '#3c6ed6', y: '#bfe3ff', r: '#5fd9ff' },           cost: { gold: 60000, wood: 500 },            prod: { gold: 350 },   desc: 'The morning catch, sold by noon.' },
  { id: 'harbor',    name: 'Harbor',        sprite: 'wharf',     pal: { b: '#9a6a33', w: '#ffd23e', o: '#c79454' },           cost: { gold: 220000, wood: 1500 },          prod: { gold: 900 },   desc: 'Tall ships and far-off flags.', special: '+1% all gold each' },

  /* ---- North Ward ---- */
  { id: 'library',   name: 'Library',       sprite: 'library',   cost: { gold: 26000, wood: 250, stone: 100 },                prod: { mana: 0.12 },  desc: 'Dusty tomes of forgotten wars.', special: '+3% Mage damage each' },
  { id: 'temple',    name: 'Temple',        sprite: 'temple',    cost: { gold: 44000, stone: 220, mana: 15 },                 prod: { gold: 230 },   desc: 'The gods smile on commerce.', special: '+2% all gold each' },
  { id: 'scriptorium', name: 'Scriptorium', sprite: 'library',   pal: { m: '#7d4ea0', M: '#5c3677' },                         cost: { gold: 120000, mana: 150 },           prod: { mana: 0.4 },   desc: 'Monks copying spell-scrolls by candlelight.' },
  { id: 'monastery', name: 'Monastery',     sprite: 'temple',    pal: { y: '#8d939c', Y: '#5d626b' },                         cost: { gold: 180000, stone: 800 },          prod: { gold: 600 },   desc: 'Quiet halls, loud prayers.', special: '+5% Mage damage each' },
  { id: 'observatory', name: 'Observatory', sprite: 'magetower', pal: { p: '#2a4da0', P: '#1c3470', M: '#ffe96b' },           cost: { gold: 400000, mana: 300 },           prod: { mana: 0.3 },   desc: 'Charting the stars for fortune.', special: '+2% item drop chance each' },

  /* ---- South Ward ---- */
  { id: 'barracks',  name: 'Barracks',      sprite: 'barracks',  cost: { gold: 65000, wood: 300, stone: 200 },                prod: { gold: 320 },   desc: 'Where the city learns to fight.', special: '+5% ALL unit damage each' },
  { id: 'magetower', name: 'Mage Tower',    sprite: 'magetower', cost: { gold: 140000, wood: 320, mana: 60 },                 prod: { mana: 0.22 },  desc: 'Arcane spires above the rooftops.', special: '+10% Mage damage each' },
  { id: 'siegeworkshop', name: 'Siege Workshop', sprite: 'smith', pal: { b: '#5d626b', d: '#3a3e46', F: '#e07b39' },          cost: { gold: 500000, wood: 2000, stone: 1000 }, prod: { gold: 800 }, desc: 'Counterweights and great arms.', special: '+10% Ballista & Golem damage each' },
  { id: 'enchanter', name: 'Enchanter',     sprite: 'alchemist', pal: { p: '#2e8fd6', P: '#1f5e96', M: '#a85ccc' },           cost: { gold: 900000, mana: 500 },           prod: { mana: 1.2 },   desc: 'Weapons that hum in the dark.' },
  { id: 'warcollege', name: 'War College',  sprite: 'barracks',  pal: { s: '#9c5454', S: '#6e3a3a' },                         cost: { gold: 1.2e6, stone: 2500 },          prod: { gold: 1500 },  desc: 'Strategy as a science.', special: '+3% ALL unit damage each' },

  /* ---- Wolfgate Ward ---- */
  { id: 'cathedral', name: 'Cathedral',     sprite: 'cathedral', cost: { gold: 320000, stone: 1500, mana: 150 },              prod: { gold: 1400 },  desc: 'Bells that ring across the valley.', special: '+3% all gold each' },
  { id: 'lodge',     name: "Hunters' Lodge", sprite: 'tavern',   pal: { r: '#3f7d2e', R: '#2c5a20' },                         cost: { gold: 1.5e6, wood: 3000 },           prod: { gold: 3000 },  desc: 'Trophies on every wall.' },
  { id: 'deepmine',  name: 'Deep Mine',     sprite: 'quarry',    pal: { s: '#5d626b', S: '#3a3e46', k: '#0c0914' },           cost: { gold: 2e6, wood: 4000 },             prod: { stone: 4 },    desc: 'Shafts that breathe cold air.' },
  { id: 'kennels',   name: 'Wolf Kennels',  sprite: 'farm',      pal: { r: '#6b4e26', R: '#4a3517', y: '#8d939c', Y: '#5d626b' }, cost: { gold: 2.2e6, wood: 3000 },       prod: { gold: 2000 },  desc: 'Howls at the moon.', special: '+5% Archer damage each' },
  { id: 'shrine',    name: 'Shrine of Dawn', sprite: 'temple',   pal: { W: '#ffe96b', w: '#e0c060' },                         cost: { gold: 2.8e6, mana: 1000 },           prod: { gold: 2500 },  desc: 'First light falls here.', special: 'Day gold bonus +3% each' },

  /* ---- Rivergate Ward ---- */
  { id: 'academy',   name: 'Wizard Academy', sprite: 'academy',  cost: { gold: 950000, wood: 1200, mana: 500 },               prod: { mana: 0.6 },   desc: 'Where apprentices become archmagi.', special: '+10% Mage damage each' },
  { id: 'timberworks', name: 'Timberworks', sprite: 'lumber',    pal: { b: '#c2a36b', B: '#94783f', d: '#6b4e26' },           cost: { gold: 3e6, stone: 5000 },            prod: { wood: 4 },     desc: 'Whole forests, planked and stacked.' },
  { id: 'tradeport', name: 'Trade Port',    sprite: 'wharf',     pal: { b: '#ffd23e', B: '#b9982f', M: '#234a92' },           cost: { gold: 5e6, wood: 6000, stone: 6000 }, prod: { gold: 8000 }, desc: 'The river road to every kingdom.' },
  { id: 'foundry',   name: 'Golem Foundry', sprite: 'smith',     pal: { b: '#3a3e46', F: '#ff8c2e', f: '#ffd23e', s: '#e07b39' }, cost: { gold: 6e6, stone: 8000, mana: 2000 }, prod: { gold: 4000 }, desc: 'Molten runes poured into stone.', special: '+10% Golem damage each' },
  { id: 'lighthouse', name: 'Lighthouse',   sprite: 'magetower', pal: { p: '#e8e4d4', P: '#c43c3c', s: '#e8e4d4', S: '#b8b4a0', M: '#ffe96b' }, cost: { gold: 7e6, stone: 5000 }, prod: { gold: 5000 }, desc: 'A flame against the night.', special: '+2% all gold each' },

  /* ---- Orchard Ward ---- */
  { id: 'mint',      name: 'Royal Mint',    sprite: 'mint',      cost: { gold: 3.2e6, wood: 2500, stone: 2500, mana: 800 },   prod: { gold: 9500 },  desc: 'The crown strikes its own coin.', special: '+5% gold per kill each' },
  { id: 'beekeeper', name: 'Beekeeper',     sprite: 'windmill',  pal: { B: '#e0c060', b: '#b9982f' },                         cost: { gold: 8e6, wood: 8000 },             prod: { gold: 9000 },  desc: 'Golden hives, golden honey.' },
  { id: 'groves',    name: 'Orchard Groves', sprite: 'farm',     pal: { r: '#3f7d2e', R: '#2c5a20', y: '#d04f7e', Y: '#a23a5e' }, cost: { gold: 1e7, wood: 10000 },        prod: { gold: 12000 }, desc: 'Apples, plums and quiet rows.' },
  { id: 'druid',     name: 'Druid Circle',  sprite: 'manawell',  pal: { s: '#3f7d2e', S: '#2c5a20', M: '#5ccb4a', m: '#2f8f23' }, cost: { gold: 1.5e7, mana: 5000 },       prod: { mana: 4 },     desc: 'Standing stones older than the crown.' },
  { id: 'winery',    name: 'Winery',        sprite: 'tavern',    pal: { r: '#a23a5e', R: '#7d2545' },                         cost: { gold: 2e7, wood: 15000 },            prod: { gold: 25000 }, desc: 'Vintages worth a war.' },

  /* ---- Harvest Ward: the endgame ---- */
  { id: 'granary',   name: 'Grand Granary', sprite: 'farm',      pal: { b: '#c2a36b', d: '#94783f' },                         cost: { gold: 5e7, wood: 30000, stone: 30000 }, prod: { gold: 60000 }, desc: 'A harvest that feeds ten cities.' },
  { id: 'worldtree', name: 'World Tree',    sprite: 'worldtree', cost: { gold: 7e7, mana: 20000 },                            prod: { wood: 20, mana: 2 },  desc: 'Its roots drink from the leylines.' },
  { id: 'crystalmine', name: 'Crystal Mine', sprite: 'quarry',   pal: { s: '#5fd9ff', S: '#2e8fd6', k: '#234a92' },           cost: { gold: 8e7, stone: 40000 },           prod: { stone: 15, mana: 2 }, desc: 'Veins of frozen starlight.' },
  { id: 'bank',      name: 'Royal Bank',    sprite: 'mint',      pal: { s: '#e8e4d4', S: '#b8b4a0' },                         cost: { gold: 1.5e8, wood: 50000, stone: 50000, mana: 30000 }, prod: { gold: 100000 }, desc: 'Vaults below, marble above.', special: '+5% all gold each' },
  { id: 'wonder',    name: 'Wonder of the Ages', sprite: 'wonder', cost: { gold: 1e9, wood: 200000, stone: 200000, mana: 100000 }, prod: { gold: 1e6 }, desc: 'They will speak of Aetherholm forever.', special: '+10% all gold each' },
];

const COST_GROWTH = 1.15;

/* ---------------- BUILDING UPGRADES ----------------
   Click a building (map or shop's i button) to open its panel. */
const BUILDING_UPGRADES = {
  farm: [
    { id: 'farm_quality', name: 'Golden Harvest', max: 10, cost: l => ({ gold: 200 * Math.pow(3, l), wood: 20 * Math.pow(2.5, l) }),
      info: 'Farms +20% gold AND Markets +5% gold per level.' },
  ],
  lumber: [
    { id: 'lumber_saws', name: 'Iron Saws', max: 10, cost: l => ({ gold: 400 * Math.pow(3, l), stone: 15 * Math.pow(2.5, l) }),
      info: 'Wood production +20% per level.' },
    { id: 'lumber_war', name: 'Timber for War', max: 1, cost: () => ({ gold: 2500, wood: 150 }),
      info: 'Ballistae +15% damage.' },
  ],
  quarry: [
    { id: 'quarry_veins', name: 'Deep Veins', max: 10, cost: l => ({ gold: 900 * Math.pow(3, l), wood: 40 * Math.pow(2.5, l) }),
      info: 'Stone production +20% per level.' },
    { id: 'quarry_masonry', name: 'Masonry', max: 1, cost: () => ({ gold: 6000, stone: 200 }),
      info: 'City Walls +25% damage.' },
  ],
  tavern: [
    { id: 'tavern_rest', name: "Hero's Rest", max: 5, cost: l => ({ gold: 1500 * Math.pow(3.5, l) }),
      info: 'Taverns +20% gold AND Hero click damage +10% per level.' },
    { id: 'tavern_tales', name: 'Tales of Valor', max: 5, cost: l => ({ gold: 4000 * Math.pow(3.5, l) }),
      info: 'Archers +10% damage per level.' },
  ],
  windmill: [
    { id: 'windmill_grind', name: 'Grindstones', max: 10, cost: l => ({ gold: 600 * Math.pow(3, l), stone: 25 * Math.pow(2.5, l) }),
      info: 'Windmills +20% gold AND Farms +5% gold per level.' },
  ],
  market: [
    { id: 'market_guilds', name: 'Trade Guilds', max: 10, cost: l => ({ gold: 4000 * Math.pow(3, l), wood: 60 * Math.pow(2.5, l) }),
      info: 'Markets +20% gold AND +1% ALL gold per level.' },
  ],
  alchemist: [
    { id: 'alch_transmute', name: 'Transmutation', max: 10, cost: l => ({ gold: 2500 * Math.pow(3, l), mana: 10 * Math.pow(2, l) }),
      info: 'Alchemist Mana +20% per level.' },
    { id: 'alch_phil', name: "Philosopher's Shard", max: 1, cost: () => ({ gold: 25000, mana: 120 }),
      info: 'Item drop chance +0.5% (absolute).' },
  ],
  smith: [
    { id: 'smith_forge', name: 'Master Forge', max: 10, cost: l => ({ gold: 9000 * Math.pow(3, l), stone: 80 * Math.pow(2.5, l) }),
      info: 'Blacksmiths +20% gold AND Ballistae +5% damage per level.' },
  ],
  sawmill: [
    { id: 'sawmill_blades', name: 'Crosscut Blades', max: 10, cost: l => ({ gold: 25000 * Math.pow(3, l), stone: 120 * Math.pow(2.2, l) }),
      info: 'Sawmills +20% Wood per level.' },
  ],
  stonecutter: [
    { id: 'stone_chisels', name: 'Diamond Chisels', max: 10, cost: l => ({ gold: 40000 * Math.pow(3, l), wood: 300 * Math.pow(2.2, l) }),
      info: 'Stonecutters +20% Stone per level.' },
  ],
  wharf: [
    { id: 'wharf_nets', name: 'Deep Nets', max: 10, cost: l => ({ gold: 6000 * Math.pow(3, l), wood: 80 * Math.pow(2.5, l) }),
      info: 'Wharves +20% gold per level.' },
    { id: 'wharf_trade', name: 'River Trade', max: 1, cost: () => ({ gold: 40000, wood: 400 }),
      info: 'Markets +15% gold.' },
  ],
  manawell: [
    { id: 'manawell_leyline', name: 'Leyline Tap', max: 10, cost: l => ({ gold: 20000 * Math.pow(3, l), mana: 20 * Math.pow(2, l) }),
      info: 'Mana production +20% per level.' },
  ],
  library: [
    { id: 'lib_archives', name: 'Archives', max: 10, cost: l => ({ gold: 18000 * Math.pow(3, l), mana: 25 * Math.pow(2, l) }),
      info: 'Libraries +20% Mana AND Mages +1% damage per level.' },
  ],
  temple: [
    { id: 'temple_favor', name: 'Divine Favor', max: 5, cost: l => ({ gold: 60000 * Math.pow(4, l), mana: 40 * Math.pow(2, l) }),
      info: '+3% ALL gold per level.' },
  ],
  barracks: [
    { id: 'barracks_drill', name: 'Drill Yards', max: 10, cost: l => ({ gold: 50000 * Math.pow(3, l), wood: 200 * Math.pow(2.5, l) }),
      info: '+2% ALL unit damage per level.' },
  ],
  magetower: [
    { id: 'magetower_focus', name: 'Arcane Focus', max: 10, cost: l => ({ gold: 150000 * Math.pow(3, l), mana: 80 * Math.pow(2, l) }),
      info: 'Mages +5% damage AND Mana production +10% per level.' },
  ],
  cathedral: [
    { id: 'cath_relics', name: 'Holy Relics', max: 5, cost: l => ({ gold: 400000 * Math.pow(4, l), mana: 100 * Math.pow(2, l) }),
      info: '+4% ALL gold per level.' },
  ],
  deepmine: [
    { id: 'mine_shafts', name: 'Lower Shafts', max: 10, cost: l => ({ gold: 1.5e6 * Math.pow(3, l), wood: 2000 * Math.pow(2.2, l) }),
      info: 'Deep Mines +20% Stone per level.' },
  ],
  keep: [
    { id: 'keep_decree', name: 'Royal Decree', max: 5, cost: l => ({ gold: 1e6 * Math.pow(4, l), wood: 500 * Math.pow(2.5, l), stone: 500 * Math.pow(2.5, l), mana: 300 * Math.pow(2, l) }),
      info: '+5% ALL gold AND +5% ALL unit damage per level.' },
  ],
  academy: [
    { id: 'acad_curriculum', name: 'Battle Curriculum', max: 10, cost: l => ({ gold: 800000 * Math.pow(3, l), mana: 200 * Math.pow(2, l) }),
      info: 'Mages +5% damage per level.' },
  ],
  timberworks: [
    { id: 'timber_lines', name: 'Log Flumes', max: 10, cost: l => ({ gold: 2.5e6 * Math.pow(3, l), stone: 3000 * Math.pow(2.2, l) }),
      info: 'Timberworks +20% Wood per level.' },
  ],
  mint: [
    { id: 'mint_standard', name: 'Gold Standard', max: 5, cost: l => ({ gold: 4e6 * Math.pow(4, l), mana: 300 * Math.pow(2, l) }),
      info: '+5% ALL gold AND +5% gold per kill per level.' },
  ],
  crystalmine: [
    { id: 'crystal_resonance', name: 'Resonance', max: 10, cost: l => ({ gold: 6e7 * Math.pow(3, l), mana: 5000 * Math.pow(2, l) }),
      info: 'Crystal Mines +20% Stone & Mana per level.' },
  ],
  worldtree: [
    { id: 'tree_blessing', name: "Dryad's Blessing", max: 10, cost: l => ({ gold: 5e7 * Math.pow(3, l), mana: 4000 * Math.pow(2, l) }),
      info: 'World Trees +20% Wood & Mana per level.' },
  ],
};

/* ---------------- UNITS (War Council) ----------------
   statKey: field in state holding the main level/count.
   unlock: {zone} — revealed by reaching that zone (any run).   */
const UNITS = [
  {
    id: 'hero', name: 'Hero Aldric', portrait: 'hero', icon: 'icoSword', slots: 3, statKey: 'sword',
    lvlLabel: 'Blade Lv.', dpsLabel: 'CLICK DMG',
    desc: 'The champion of Aetherholm. Your clicks are their sword strikes.',
    main: { name: 'Hero Blade', verb: 'Sharpen', cost: l => ({ gold: 15 * Math.pow(1.5, l) }), info: '+1 click damage per level. Every 25 levels: damage x2.' },
    subs: [
      { id: 'crit', name: 'Keen Edge', max: 25, cost: l => ({ gold: 100 * Math.pow(2.2, l) }), info: '+2% chance to CRIT for x3 damage per level.' },
      { id: 'fury', name: 'Battle Fury', max: 10, cost: l => ({ gold: 800 * Math.pow(2.5, l) }), info: '+10% click damage per level.' },
      { id: 'horn', name: 'War Horn', max: 5, cost: l => ({ gold: 5000 * Math.pow(3, l) }), info: '+5% ALL unit damage per level.' },
    ],
  },
  {
    id: 'archer', name: 'Archer Company', portrait: 'archer', icon: 'icoBow', slots: 2, statKey: 'archer',
    lvlLabel: 'Archers', dpsLabel: 'ARCHER DPS',
    desc: 'Keen-eyed scouts on the rooftops. Cheap, plentiful, deadly in numbers.',
    main: { name: 'Recruit Archer', verb: 'Recruit', cost: l => ({ gold: 25 * Math.pow(1.4, l) }), info: 'Each archer deals 1 idle DPS. +2% damage per Wall level.' },
    subs: [
      { id: 'longbows', name: 'Longbows', max: 20, cost: l => ({ gold: 250 * Math.pow(2, l), wood: 15 * Math.pow(1.6, l) }), info: '+15% Archer damage per level.' },
      { id: 'poison', name: 'Poison Tips', max: 10, cost: l => ({ mana: 15 * Math.pow(1.8, l) }), info: '+10% Archer damage per level.' },
    ],
  },
  {
    id: 'mage', name: 'Battle Mages', portrait: 'magep', icon: 'icoMage', slots: 2, statKey: 'mage',
    lvlLabel: 'Mages', dpsLabel: 'MAGE DPS', skills: true,
    desc: 'Robed destroyers raining fire from the towers.',
    main: { name: 'Hire Mage', verb: 'Hire', cost: l => ({ gold: 60 * Math.pow(1.45, l) }), info: 'Each mage deals 2 idle DPS (before bonuses).' },
    subs: [
      { id: 'training', name: 'Mage Training', max: Infinity, statKey: 'magePower', cost: l => ({ mana: 8 * Math.pow(1.6, l) }), info: '+25% Mage damage per level. Requires Mana.' },
      { id: 'archmage', name: 'Archmage Rite', max: 1, cost: () => ({ mana: 2000 }), info: 'Mage damage x1.5.' },
    ],
  },
  {
    id: 'turret', name: 'Ballistae', portrait: 'ballista', icon: 'icoTurret', slots: 2, statKey: 'turret',
    lvlLabel: 'Ballistae', dpsLabel: 'SIEGE DPS',
    desc: 'Massive bolt-throwers mounted on the towers.',
    main: { name: 'Build Ballista', verb: 'Build', cost: l => ({ gold: 320 * Math.pow(1.5, l), wood: 20 * Math.pow(1.4, l) }), info: 'Each ballista deals 6 idle DPS. Boosted by Blacksmiths.' },
    subs: [
      { id: 'bolts', name: 'Fire Bolts', max: 20, cost: l => ({ gold: 600 * Math.pow(2, l), wood: 40 * Math.pow(1.6, l) }), info: '+15% Ballista damage per level.' },
      { id: 'twin', name: 'Twin Arms', max: 1, cost: () => ({ gold: 60000, wood: 800 }), info: 'Ballista damage x1.5.' },
    ],
  },
  {
    id: 'cleric', name: 'War Clerics', portrait: 'clericp', icon: 'icoCenser', slots: 2, statKey: 'cleric',
    lvlLabel: 'Clerics', dpsLabel: 'HOLY DPS', unlock: { zone: 12 },
    desc: 'Hymns that crack skulls. Blessed by the Cathedral.',
    main: { name: 'Ordain Cleric', verb: 'Ordain', cost: l => ({ gold: 50000 * Math.pow(1.55, l), mana: 50 * Math.pow(1.4, l) }), info: 'Each cleric deals 60 idle DPS. +5% per Cathedral.' },
    subs: [
      { id: 'litanies', name: 'War Litanies', max: 20, cost: l => ({ gold: 200000 * Math.pow(2, l), mana: 150 * Math.pow(1.7, l) }), info: '+15% Cleric damage per level.' },
      { id: 'consecration', name: 'Consecration', max: 1, cost: () => ({ mana: 50000 }), info: 'Cleric damage x1.5.' },
    ],
  },
  {
    id: 'golem', name: 'War Golem', portrait: 'golem', icon: 'icoCore', slots: 2, statKey: 'golem',
    lvlLabel: 'Golem Lv.', dpsLabel: 'GOLEM DPS',
    desc: 'A runic colossus awakened beneath the quarry. Slow, unstoppable.',
    main: { name: 'Awaken Golem', verb: 'Empower', cost: l => ({ gold: 25000 * Math.pow(1.6, l), stone: 150 * Math.pow(1.5, l) }), info: 'Each level: +25 idle DPS. Boosted by Blacksmiths.' },
    subs: [
      { id: 'plating', name: 'Runic Plating', max: 20, cost: l => ({ stone: 200 * Math.pow(1.7, l), mana: 30 * Math.pow(1.6, l) }), info: '+15% Golem damage per level.' },
      { id: 'molten', name: 'Molten Core', max: 1, cost: () => ({ mana: 400, stone: 1000 }), info: 'Golem damage x1.5.' },
    ],
  },
  {
    id: 'dragon', name: 'Dragon Riders', portrait: 'dragonp', icon: 'icoTalon', slots: 2, statKey: 'dragon',
    lvlLabel: 'Riders', dpsLabel: 'DRAGON DPS', unlock: { zone: 25 },
    desc: 'Sky-fire on leather wings. The endgame of warfare.',
    main: { name: 'Bond Dragon', verb: 'Bond', cost: l => ({ gold: 5e6 * Math.pow(1.6, l), mana: 1000 * Math.pow(1.5, l) }), info: 'Each rider deals 500 idle DPS. +5% per Wizard Academy.' },
    subs: [
      { id: 'dragonfire', name: 'Dragonfire', max: 20, cost: l => ({ gold: 2e7 * Math.pow(2, l), mana: 3000 * Math.pow(1.7, l) }), info: '+15% Dragon damage per level.' },
      { id: 'bond', name: 'Ancient Bond', max: 1, cost: () => ({ mana: 200000 }), info: 'Dragon damage x1.5.' },
    ],
  },
  {
    id: 'walls', name: 'City Walls', portrait: 'wallseg', icon: 'icoWall', slots: 2, statKey: 'walls',
    lvlLabel: 'Wall Lv.', dpsLabel: 'WALL DPS',
    desc: 'Stone and timber. Archers on every rampart. Visible on the city map!',
    main: { name: 'Fortify', verb: 'Fortify', cost: l => ({ gold: 500 * Math.pow(1.6, l), stone: 15 * Math.pow(1.45, l) }), info: '+2 idle DPS (wall archers) and +5% gold per kill per level.' },
    subs: [
      { id: 'banners', name: 'War Banners', max: 20, cost: l => ({ gold: 800 * Math.pow(2, l), stone: 30 * Math.pow(1.6, l) }), info: '+3% gold per kill per level.' },
      { id: 'moat', name: 'Moat Works', max: 10, cost: l => ({ gold: 3000 * Math.pow(2.5, l), stone: 100 * Math.pow(1.8, l) }), info: '+5% Wall damage AND +2% gold per kill per level.' },
    ],
  },
];

/* ---------------- MAGE SKILLS (one-time, cost Mana) ---------------- */
const SKILLS = [
  { id: 'fireball', name: 'Fireball',        cost: { mana: 50 },   desc: 'Mage damage x2.' },
  { id: 'frost',    name: 'Frost Sigil',     cost: { mana: 130 },  desc: '+25% gold from kills.' },
  { id: 'arcane',   name: 'Arcane Mastery',  cost: { mana: 320 },  desc: 'Mana production +50%.' },
  { id: 'meteor',   name: 'Meteor Brand',    cost: { mana: 900 },  desc: 'Clicks deal +10% of your idle DPS.' },
  { id: 'chain',    name: 'Chain Lightning', cost: { mana: 2600 }, desc: 'Mage damage x1.5.' },
  { id: 'midas',    name: 'Midas Curse',     cost: { mana: 6500 }, desc: '+50% gold from kills.' },
];

/* ---------------- ITEMS ----------------
   Random drops from monsters. Combine 2 identical items to forge
   tier+1 with stats x1.25. units: null = anyone.
   Lategame ascension nodes add tier-up drops and AFFIXES (a random
   second effect rolled on drop).                                   */
const ITEMS = {
  sword:  { name: 'Rusty Sword',     icon: 'icoSword',  units: ['hero'],   eff: 'click',  base: 15, txt: 'click damage' },
  quiver: { name: 'Feather Quiver',  icon: 'icoBow',    units: ['archer'], eff: 'archer', base: 15, txt: 'Archer damage' },
  orb:    { name: 'Arcane Orb',      icon: 'icoOrb',    units: ['mage'],   eff: 'mage',   base: 15, txt: 'Mage damage' },
  bolts:  { name: 'Serrated Bolts',  icon: 'icoTurret', units: ['turret'], eff: 'turret', base: 15, txt: 'Ballista damage' },
  censer: { name: 'War Censer',      icon: 'icoCenser', units: ['cleric'], eff: 'cleric', base: 15, txt: 'Cleric damage' },
  core:   { name: 'Ember Core',      icon: 'icoCore',   units: ['golem'],  eff: 'golem',  base: 15, txt: 'Golem damage' },
  talon:  { name: 'Dragon Talon',    icon: 'icoTalon',  units: ['dragon'], eff: 'dragon', base: 15, txt: 'Dragon damage' },
  banner: { name: 'Watch Banner',    icon: 'icoBanner', units: ['walls'],  eff: 'bounty', base: 12, txt: 'gold per kill' },
  coin:   { name: 'Lucky Coin',      icon: 'icoGold',   units: null,       eff: 'gold',   base: 10, txt: 'ALL gold' },
  charm:  { name: 'Harvest Charm',   icon: 'icoCharm',  units: null,       eff: 'res',    base: 12, txt: 'Wood & Stone production' },
  shard:  { name: 'Mana Shard',      icon: 'icoMana',   units: null,       eff: 'mana',   base: 12, txt: 'Mana production' },
  moon:   { name: 'Moon Charm',      icon: 'icoMoon',   units: null,       eff: 'luck',   base: 10, txt: 'item drop chance' },
  skull:  { name: 'Boss Sigil',      icon: 'icoSkull',  units: null,       eff: 'boss',   base: 20, txt: 'gold from BOSSES' },
};

/* affix display: "Rusty Sword II of Luck" */
const AFFIX_NAMES = {
  sword: 'Slaying', quiver: 'Winds', orb: 'Sorcery', bolts: 'Piercing', censer: 'Devotion',
  core: 'Embers', talon: 'Dragons', banner: 'Plunder', coin: 'Wealth', charm: 'Harvest',
  shard: 'Mana', moon: 'Luck', skull: 'Reaping',
};

const ITEM_TIER_MULT = 1.25;
const DROP_CHANCE = 0.10;
const BOSS_DROP_CHANCE = 0.25;

/* items worn by the HERO also inspire the whole city: each grants
   30% of its value as unit damage / income / drop luck, and half
   of that as an enemy-HP reduction (capped at -40%). */
const HERO_AURA_FACTOR = 0.3;

function itemValue(type, tier) {
  return ITEMS[type].base * Math.pow(ITEM_TIER_MULT, tier - 1);
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
function tierName(tier) { return ROMAN[tier - 1] || 'T' + tier; }

/* ---------------- CITY MAP: 5x5 DISTRICT WORLD ---------------- */
const DISTRICT_W = 32, DISTRICT_H = 24;
const DISTRICT_GRID = 5;
const MAP_W = DISTRICT_W * DISTRICT_GRID;  // 160
const MAP_H = DISTRICT_H * DISTRICT_GRID;  // 120
const TILE = 16;

const HOME_KEY = '2,2';
const DISTRICT_WALL_REQ = 5;      // wall level needed before buying land
const DISTRICT_GOLD_BONUS = 0.05; // +5% all gold per extra district

function dKey(dx, dy) { return dx + ',' + dy; }
function districtOf(x, y) { return [Math.floor(x / DISTRICT_W), Math.floor(y / DISTRICT_H)]; }
function isCityDistrict(dx, dy) { return dx >= 1 && dx <= 3 && dy >= 1 && dy <= 3; }

function districtCost(nOwnedExtra) {
  return {
    gold: Math.ceil(25000 * Math.pow(2.2, nOwnedExtra)),
    wood: Math.ceil(500 * Math.pow(1.8, nOwnedExtra)),
    stone: Math.ceil(500 * Math.pow(1.8, nOwnedExtra)),
  };
}

const DISTRICT_NAMES = {
  '2,2': 'Old Town', '1,2': 'West Ward', '3,2': 'East Ward', '2,1': 'North Ward', '2,3': 'South Ward',
  '1,1': 'Wolfgate Ward', '3,1': 'Rivergate Ward', '1,3': 'Orchard Ward', '3,3': 'Harvest Ward',
};

/* FIXED purchase order — each ward is adjacent to the previous union */
const DISTRICT_ORDER = ['1,2', '3,2', '2,1', '2,3', '1,1', '3,1', '1,3', '3,3'];

/* roads: a kingsroad cross spanning the whole world */
const ROAD_X = 80, ROAD_Y = 60;
const VROAD = { x: ROAD_X, y1: 0, y2: MAP_H - 1 };
const HROAD = { y: ROAD_Y, x1: 0, x2: MAP_W - 1 };
const PLAZA = { x1: 79, y1: 59, x2: 81, y2: 61 };

function isRoad(x, y) {
  if (y === HROAD.y && x >= HROAD.x1 && x <= HROAD.x2) return true;
  if (x === VROAD.x && y >= VROAD.y1 && y <= VROAD.y2) return true;
  if (x >= PLAZA.x1 && x <= PLAZA.x2 && y >= PLAZA.y1 && y <= PLAZA.y2) return true;
  return false;
}

/* water: river along the east, lake top-right, pond south-west */
function riverX(y) { return 135 + Math.round(Math.sin(y * 0.1) * 2.5); }
function isWater(x, y) {
  if (y <= 8 && x >= 138) return true;           // lake
  const pdx = (x - 14) / 4.0, pdy = (y - 108) / 3.2;
  if (pdx * pdx + pdy * pdy <= 1) return true;   // pond
  const rx = riverX(y);
  return x >= rx && x <= rx + 2;                 // river, 3 tiles wide
}

/* one plot per building, locked to its district. */
const BUILDING_PLOT = {
  /* Old Town (2,2): 64..95 x 48..71 */
  farm: [69, 64], lumber: [74, 67], quarry: [91, 65], tavern: [85, 63],
  windmill: [88, 53], market: [73, 55], keep: [80, 51],
  /* West Ward (1,2): 32..63 x 48..71 */
  alchemist: [42, 56], smith: [52, 62], sawmill: [36, 52], tannery: [56, 52], armory: [46, 66],
  /* East Ward (3,2): 96..127 x 48..71 */
  wharf: [115, 57], manawell: [104, 64], stonecutter: [100, 52], fishmarket: [110, 66], harbor: [122, 52],
  /* North Ward (2,1): 64..95 x 24..47 */
  library: [72, 32], temple: [86, 34], scriptorium: [68, 40], monastery: [90, 42], observatory: [76, 28],
  /* South Ward (2,3): 64..95 x 72..95 */
  barracks: [72, 82], magetower: [88, 80], siegeworkshop: [68, 76], warcollege: [90, 90], enchanter: [70, 92],
  /* Wolfgate (1,1): 32..63 x 24..47 */
  cathedral: [44, 32], deepmine: [36, 28], lodge: [53, 28], shrine: [37, 40], kennels: [51, 44],
  /* Rivergate (3,1): 96..127 x 24..47 */
  academy: [108, 32], timberworks: [100, 28], tradeport: [118, 28], lighthouse: [122, 40], foundry: [100, 42],
  /* Orchard (1,3): 32..63 x 72..95 */
  mint: [44, 82], groves: [36, 76], beekeeper: [54, 76], winery: [38, 90], druid: [54, 90],
  /* Harvest (3,3): 96..127 x 72..95 */
  granary: [100, 76], crystalmine: [120, 76], worldtree: [110, 84], bank: [100, 90], wonder: [118, 92],
};

const PLOTS = {};
const BUILDING_DISTRICT = {};
const DISTRICT_BUILDS = {};
for (const id in BUILDING_PLOT) {
  const [x, y] = BUILDING_PLOT[id];
  PLOTS[id] = [[x, y]];
  const [dx, dy] = districtOf(x, y);
  const key = dKey(dx, dy);
  BUILDING_DISTRICT[id] = key;
  (DISTRICT_BUILDS[key] = DISTRICT_BUILDS[key] || []).push(id);
}

const ALL_PLOT_TILES = new Set();
for (const id in PLOTS) for (const [x, y] of PLOTS[id]) ALL_PLOT_TILES.add(x + ',' + y);

/* ---- density satellites ----
   Every 100 owned (up to 500) a building grows: satellite structures
   appear on nearby tiles. kind -> what gets drawn (map.js). */
const SAT_KINDS = {
  farm: 'field', windmill: 'field', groves: 'field', granary: 'field', kennels: 'field',
  lumber: 'logs', sawmill: 'logs', timberworks: 'logs',
  quarry: 'rocks', stonecutter: 'rocks', deepmine: 'rocks',
  crystalmine: 'crystal', manawell: 'crystal', magetower: 'crystal', academy: 'crystal',
  enchanter: 'crystal', scriptorium: 'crystal', alchemist: 'crystal', druid: 'crystal',
  observatory: 'crystal', worldtree: 'crystal',
  library: 'garden', temple: 'garden', monastery: 'garden', cathedral: 'garden', shrine: 'garden',
  beekeeper: 'hives',
  keep: 'banner', barracks: 'banner', armory: 'banner', warcollege: 'banner', wonder: 'banner',
  /* everything else (trade & industry) defaults to crates */
};
const SAT_OFFSETS = [[-2, 0], [2, 0], [0, 2], [-2, 2], [2, 2], [-1, -2], [2, -2], [-3, 1]];
function satTierFor(count) { return Math.min(5, Math.floor(count / 100)); }

/* wheat fields: just the kitchen garden by the Old Town farm */
const FIELDS = [
  { x1: 66, y1: 62, x2: 72, y2: 66 },
];
/* rocky hills (east riverlands + northern outcrops) */
const HILLS = [
  { x1: 146, y1: 70, x2: 157, y2: 84 },
  { x1: 146, y1: 92, x2: 156, y2: 104 },
  { x1: 4, y1: 4, x2: 16, y2: 10 },
  { x1: 40, y1: 3, x2: 56, y2: 9 },
];

/* cottage slots per city district (shown as the city grows) */
const HOUSE_OFFSETS = [[8, 6], [16, 5], [24, 7], [6, 12], [26, 12], [10, 18], [18, 19], [25, 18], [14, 9], [20, 15]];
function houseSlots(ownedKeys) {
  const out = [];
  const order = [HOME_KEY, ...DISTRICT_ORDER].filter(k => ownedKeys.includes(k));
  for (const key of order) {
    const [dx, dy] = key.split(',').map(Number);
    for (const [ox, oy] of HOUSE_OFFSETS) {
      const x = dx * DISTRICT_W + ox, y = dy * DISTRICT_H + oy;
      if (isRoad(x, y) || isWater(x, y) || ALL_PLOT_TILES.has(x + ',' + y)) continue;
      out.push([x, y]);
    }
  }
  return out;
}

/* wilderness biome per outer district (used for decoration) */
function districtBiome(dx, dy) {
  if (isCityDistrict(dx, dy)) return 'city';
  if (dx === 4) return 'riverlands';
  if (dy === 4) return 'farmland';
  if (dx === 0) return 'forest';
  if (dy === 0) return dx < 2 ? 'rocky' : 'forest';
  return 'meadow';
}

/* cosmetic roaming monsters in the wilderness: [x, y, sprite].
   They never enter owned districts (the walls keep them out). */
const ROAMERS = [
  [20, 8, 'goblin'], [50, 5, 'slime'], [88, 6, 'bat'], [118, 9, 'imp'], [146, 20, 'skeleton'],
  [6, 30, 'orc'], [8, 58, 'slime'], [5, 88, 'goblin'], [22, 104, 'bat'],
  [40, 110, 'imp'], [65, 112, 'orc'], [95, 110, 'skeleton'], [120, 106, 'slime'],
  [150, 40, 'goblin'], [148, 86, 'imp'],
];

/* ---------------- MONSTERS & ZONES ---------------- */
const KILLS_PER_ZONE = 10;

const MONSTER_TYPES = [
  { sprite: 'slime',    name: 'Gloop Slime' },
  { sprite: 'bat',      name: 'Cave Bat' },
  { sprite: 'goblin',   name: 'Goblin Raider' },
  { sprite: 'skeleton', name: 'Restless Bones' },
  { sprite: 'orc',      name: 'Orc Marauder' },
  { sprite: 'imp',      name: 'Ember Imp' },
];

const BOSS_TYPES = [
  { sprite: 'golem',  name: 'Runic Golem' },
  { sprite: 'dragon', name: 'Wyrm of the Pass' },
];

const ZONE_NAMES = ['Greenfields', 'Dark Forest', 'Mistmoor', 'Cursed Crypts', 'Ashen Peaks', 'Demon Gate'];

const ZONE_HP_GROWTH = 1.6;     // monster HP multiplier per zone
const ZONE_GOLD_GROWTH = 1.5;   // kill bounty multiplier per zone
const BOSS_HP_MULT = 8;
const BOSS_GOLD_MULT = 10;
const ZONE_INCOME_BONUS = 0.02; // city income bonus per zone reached

function zoneName(zone) {
  const base = ZONE_NAMES[(zone - 1) % ZONE_NAMES.length];
  const loop = Math.floor((zone - 1) / ZONE_NAMES.length);
  return loop > 0 ? base + ' ' + 'II III IV V VI VII VIII IX X'.split(' ')[loop - 1] : base;
}

function monsterFor(zone, idx) {
  const isBoss = idx === KILLS_PER_ZONE;
  const type = isBoss
    ? BOSS_TYPES[(zone - 1) % BOSS_TYPES.length]
    : MONSTER_TYPES[(zone - 1 + idx - 1) % MONSTER_TYPES.length];
  const hp = 15 * Math.pow(ZONE_HP_GROWTH, zone - 1) * (1 + 0.06 * (idx - 1)) * (isBoss ? BOSS_HP_MULT : 1);
  const gold = 6 * Math.pow(ZONE_GOLD_GROWTH, zone - 1) * (isBoss ? BOSS_GOLD_MULT : 1);
  return { sprite: type.sprite, name: type.name + (isBoss ? ' [BOSS]' : ''), hp: Math.ceil(hp), gold, isBoss };
}

/* ---------------- ASCENSION: THE AGES TREE ----------------
   Crown Sigils: floor(sqrt(lifetime gold / 3e6)), cumulative.
   The tree spans 4 ERAS. Era gates require a number of owned
   nodes (needNodes) + sigils, and upgrade the kingsroads on the
   map. Everything can eventually be bought out.                */
const SIGIL_BASE = 3e6;

function sigilsFromLifetime(lifetimeGold) {
  return Math.floor(Math.sqrt(lifetimeGold / SIGIL_BASE));
}

const ERA_NAMES = ['Age of Wood', 'Age of Stone', 'Age of Iron', 'Age of Aether'];

const PRESTIGE_TREE = [
  /* ============ ERA 1 — AGE OF WOOD ============ */
  { id: 'eco1', era: 1, branch: 'Economy',   name: 'Royal Treasury',   cost: 1, requires: null,   desc: 'Start each run with 500 Gold, 25 Wood and 25 Stone.' },
  { id: 'eco2', era: 1, branch: 'Economy',   name: 'Trade Routes',     cost: 2, requires: 'eco1', desc: 'Buildings produce +25% Gold.' },
  { id: 'eco3', era: 1, branch: 'Economy',   name: 'Tax Reform',       cost: 3, requires: 'eco2', desc: 'All building costs -10%.' },
  { id: 'eco4', era: 1, branch: 'Economy',   name: 'Golden Age',       cost: 5, requires: 'eco3', desc: '+1% all Gold per Crown Sigil ever earned.' },
  { id: 'eco5', era: 1, branch: 'Economy',   name: 'Royal Charter',    cost: 8, requires: 'eco4', desc: 'Start each run with 5 Farms, 2 Lumber Mills and 2 Quarries.' },
  { id: 'war1', era: 1, branch: 'War',       name: 'Sharp Blades',     cost: 1, requires: null,   desc: 'Click damage x2.' },
  { id: 'war2', era: 1, branch: 'War',       name: 'Veteran Mages',    cost: 2, requires: 'war1', desc: 'Mage damage +50%.' },
  { id: 'war3', era: 1, branch: 'War',       name: 'Siege Doctrine',   cost: 3, requires: 'war2', desc: 'Ballista & Wall damage +50%.' },
  { id: 'war4', era: 1, branch: 'War',       name: "Warlord's Banner", cost: 5, requires: 'war3', desc: 'Zone income bonus doubled (2% -> 4% per zone).' },
  { id: 'war5', era: 1, branch: 'War',       name: 'Crown Marshal',    cost: 8, requires: 'war4', desc: 'ALL unit damage +25%.' },
  { id: 'mys1', era: 1, branch: 'Mysticism', name: 'Mana Font',        cost: 1, requires: null,   desc: 'Mana production +50%.' },
  { id: 'mys2', era: 1, branch: 'Mysticism', name: 'Arcane Library',   cost: 2, requires: 'mys1', desc: 'Mage Skills cost 50% less Mana.' },
  { id: 'mys3', era: 1, branch: 'Mysticism', name: 'Spirit Hands',     cost: 4, requires: 'mys2', desc: 'Ghostly hands click the enemy 2 times per second.' },
  { id: 'mys4', era: 1, branch: 'Mysticism', name: 'Eternal Flame',    cost: 6, requires: 'mys3', desc: 'Mage damage x2.' },
  { id: 'mys5', era: 1, branch: 'Mysticism', name: 'Lunar Covenant',   cost: 8, requires: 'mys4', desc: 'Night item-drop bonus doubled (x4) AND Mana production +25%.' },

  /* ============ GATE + ERA 2 — AGE OF STONE ============ */
  { id: 'era2', era: 2, branch: 'Ages', gate: true, needNodes: 6, cost: 10, requires: null,
    name: 'Advance: Age of Stone', desc: '+25% ALL gold. The kingsroads are gravelled. Unlocks Age of Stone advancements. (Requires 6 nodes owned)' },
  { id: 'eco6', era: 2, branch: 'Economy',   name: 'Stone Granaries',  cost: 8,  requires: null,   desc: 'Buildings produce +30% Gold.' },
  { id: 'eco7', era: 2, branch: 'Economy',   name: 'Royal Highways',   cost: 12, requires: 'eco6', desc: '+20% ALL gold. Trade moves faster on good roads.' },
  { id: 'eco8', era: 2, branch: 'Economy',   name: 'Guild Charters',   cost: 16, requires: 'eco7', desc: 'All building costs another -10%.' },
  { id: 'war6', era: 2, branch: 'War',       name: 'Crossbows',        cost: 8,  requires: null,   desc: 'Archer damage x2.' },
  { id: 'war7', era: 2, branch: 'War',       name: 'Steel Plate',      cost: 12, requires: 'war6', desc: 'Click damage x2.' },
  { id: 'war8', era: 2, branch: 'War',       name: 'Siege Foundries',  cost: 16, requires: 'war7', desc: 'Ballista & Golem damage +50%.' },
  { id: 'mys6', era: 2, branch: 'Mysticism', name: 'Runed Quarries',   cost: 8,  requires: null,   desc: 'Wood & Stone production +50%.' },
  { id: 'mys7', era: 2, branch: 'Mysticism', name: 'Quality Smithing', cost: 12, requires: 'mys6', desc: '25% of item drops come one tier higher.' },
  { id: 'mys8', era: 2, branch: 'Mysticism', name: 'Mana Springs',     cost: 16, requires: 'mys7', desc: 'Mana production +50%.' },

  /* ============ GATE + ERA 3 — AGE OF IRON ============ */
  { id: 'era3', era: 3, branch: 'Ages', gate: true, needNodes: 16, cost: 25, requires: 'era2',
    name: 'Advance: Age of Iron', desc: '+50% ALL gold. The kingsroads are cobbled. Unlocks Age of Iron advancements. (Requires 16 nodes owned)' },
  { id: 'eco10', era: 3, branch: 'Economy',   name: 'Banking Houses',  cost: 25, requires: null,    desc: '+1% all Gold per Crown Sigil ever earned (stacks).' },
  { id: 'eco11', era: 3, branch: 'Economy',   name: 'Trade Empire',    cost: 35, requires: 'eco10', desc: '+40% ALL gold.' },
  { id: 'eco12', era: 3, branch: 'Economy',   name: 'Industrial Mills', cost: 50, requires: 'eco11', desc: 'ALL production +25% (Gold, Wood, Stone, Mana).' },
  { id: 'war10', era: 3, branch: 'War',       name: 'Cannons',         cost: 25, requires: null,    desc: 'Ballista damage x2.' },
  { id: 'war11', era: 3, branch: 'War',       name: 'Drilled Legions', cost: 35, requires: 'war10', desc: 'ALL unit damage +30%.' },
  { id: 'war12', era: 3, branch: 'War',       name: 'Heroic Saga',     cost: 50, requires: 'war11', desc: "The Hero's leadership aura is 50% stronger." },
  { id: 'mys10', era: 3, branch: 'Mysticism', name: 'Astral Clock',    cost: 25, requires: null,    desc: 'Day gold bonus AND night drop bonus +50% stronger.' },
  { id: 'mys11', era: 3, branch: 'Mysticism', name: 'Mystic Forging',  cost: 35, requires: 'mys10', desc: 'Item drops have a 50% chance to roll a random AFFIX (second effect at half value).' },
  { id: 'mys12', era: 3, branch: 'Mysticism', name: 'Leyline Network', cost: 50, requires: 'mys11', desc: 'Mana production x2.' },

  /* ============ GATE + ERA 4 — AGE OF AETHER ============ */
  { id: 'era4', era: 4, branch: 'Ages', gate: true, needNodes: 28, cost: 60, requires: 'era3',
    name: 'Advance: Age of Aether', desc: '+100% ALL gold. The kingsroads glow with aether. Unlocks the final advancements. (Requires 28 nodes owned)' },
  { id: 'eco13', era: 4, branch: 'Economy',   name: 'Aether Economy',    cost: 70,  requires: null,    desc: 'ALL gold x1.5.' },
  { id: 'eco14', era: 4, branch: 'Economy',   name: 'Philosopher Kings', cost: 90,  requires: 'eco13', desc: 'All building costs another -15%.' },
  { id: 'eco15', era: 4, branch: 'Economy',   name: 'Golden Aeon',       cost: 120, requires: 'eco14', desc: '+2% all Gold per Crown Sigil ever earned (stacks).' },
  { id: 'war13', era: 4, branch: 'War',       name: 'Aether Weapons',    cost: 70,  requires: null,    desc: 'ALL unit damage x1.5.' },
  { id: 'war14', era: 4, branch: 'War',       name: 'Storm Callers',     cost: 90,  requires: 'war13', desc: 'Mage damage x2.' },
  { id: 'war15', era: 4, branch: 'War',       name: 'Avatar of War',     cost: 120, requires: 'war14', desc: 'Clicks deal +25% of your idle DPS (stacks with Meteor Brand).' },
  { id: 'mys13', era: 4, branch: 'Mysticism', name: 'Star Metal',        cost: 70,  requires: null,    desc: 'ALL item values +25%.' },
  { id: 'mys14', era: 4, branch: 'Mysticism', name: 'Master Forging',    cost: 90,  requires: 'mys13', desc: 'Affixes are guaranteed on drops and 75% value.' },
  { id: 'mys15', era: 4, branch: 'Mysticism', name: 'Spirit Legion',     cost: 120, requires: 'mys14', desc: 'Spirit Hands click 6 times per second and can CRIT.' },
];
