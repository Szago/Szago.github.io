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
  { id: 'farm',      name: 'Farm',          sprite: 'farm',      cost: { gold: 15 },                                          prod: { gold: 0.5 },   desc: 'Honest fields that feed the city.', special: '+0.5% Hero click damage each (max +50%)' },
  { id: 'lumber',    name: 'Lumber Mill',   sprite: 'lumber',    cost: { gold: 60 },                                          prod: { wood: 0.2 },   desc: 'Produces Wood for war machines & halls.', special: '+1% Ballista damage each (max +50%)' },
  { id: 'quarry',    name: 'Quarry',        sprite: 'quarry',    cost: { gold: 240 },                                         prod: { stone: 0.12 }, desc: 'Produces Stone for walls & temples.', special: '+1% City Wall damage each (max +50%)' },
  { id: 'tavern',    name: 'Tavern',        sprite: 'tavern',    cost: { gold: 420, wood: 15 },                               prod: { gold: 4 },     desc: 'Adventurers drink, the coffers fill.', special: '+1% Hero click damage each (max +50%)' },
  { id: 'windmill',  name: 'Windmill',      sprite: 'windmill',  cost: { gold: 950, wood: 30 },                               prod: { gold: 8 },     desc: 'Grain turns to flour, flour to gold.', special: '+5% Farm gold each' },
  { id: 'market',    name: 'Market',        sprite: 'market',    cost: { gold: 1600, wood: 45 },                              prod: { gold: 14 },    desc: 'Trade caravans from distant realms.', special: '+1% all gold each' },
  { id: 'keep',      name: 'Castle Keep',   sprite: 'keep',      cost: { gold: 650000, wood: 850, stone: 850, mana: 220 },    prod: { gold: 2800 },  desc: 'The crown jewel of Aetherholm.', special: '+5% all gold each' },

  /* ---- West Ward ---- */
  { id: 'alchemist', name: 'Alchemist',     sprite: 'alchemist', cost: { gold: 3200, wood: 60 },                              prod: { mana: 0.03 },  desc: 'Bubbling vials and early Mana.', special: '+5% Plague Alchemist damage each' },
  { id: 'smith',     name: 'Blacksmith',    sprite: 'smith',     cost: { gold: 5200, wood: 90, stone: 35 },                   prod: { gold: 42 },    desc: 'Forges of war.', special: '+10% Ballista & Golem damage each' },
  { id: 'tannery',   name: 'Tannery',       sprite: 'smith',     pal: { s: '#8a6a3c', S: '#6b4e26', F: '#c79454', f: '#e0c060' }, cost: { gold: 18000, wood: 200 },        prod: { gold: 150 },   desc: 'Leather for armies and saddles.', special: '+2% Royal Knight damage each' },
  { id: 'sawmill',   name: 'Sawmill',       sprite: 'lumber',    pal: { d: '#7a2f1f', b: '#a2653a', B: '#7d4a28' },           cost: { gold: 30000, stone: 150 },           prod: { wood: 1.5 },   desc: 'Water-driven blades. Wood, industrialized.', special: '+2% Ballista damage each' },
  { id: 'armory',    name: 'Armory',        sprite: 'barracks',  pal: { s: '#7d92ac', S: '#54667e', r: '#ffd23e' },           cost: { gold: 90000, wood: 300, stone: 200 }, prod: { gold: 120 },  desc: 'Racks of polished steel.', special: '+3% ALL unit damage each' },

  /* ---- East Ward ---- */
  { id: 'wharf',     name: 'Fishing Wharf', sprite: 'wharf',     cost: { gold: 8500, wood: 130 },                             prod: { gold: 70 },    desc: 'Nets in the river, silver in the hold.', special: '+1% all gold each' },
  { id: 'manawell',  name: 'Mana Well',     sprite: 'manawell',  cost: { gold: 13000, stone: 90 },                            prod: { mana: 0.08 },  desc: 'Draws Mana from the leylines below.', special: '+3% Mage damage each' },
  { id: 'stonecutter', name: 'Stonecutter', sprite: 'quarry',    pal: { s: '#c2a36b', S: '#94783f' },                         cost: { gold: 45000, wood: 400 },            prod: { stone: 0.8 },  desc: 'Sandstone blocks, cut to order.', special: '+2% City Wall damage each' },
  { id: 'fishmarket', name: 'Fish Market',  sprite: 'market',    pal: { o: '#3c6ed6', y: '#bfe3ff', r: '#5fd9ff' },           cost: { gold: 60000, wood: 500 },            prod: { gold: 350 },   desc: 'The morning catch, sold by noon.', special: '+3% Royal Knight damage each' },
  { id: 'harbor',    name: 'Harbor',        sprite: 'wharf',     pal: { b: '#9a6a33', w: '#ffd23e', o: '#c79454' },           cost: { gold: 220000, wood: 1500 },          prod: { gold: 900 },   desc: 'Tall ships and far-off flags.', special: '+1% all gold each' },

  /* ---- North Ward ---- */
  { id: 'library',   name: 'Library',       sprite: 'library',   cost: { gold: 26000, wood: 250, stone: 100 },                prod: { mana: 0.12 },  desc: 'Dusty tomes of forgotten wars.', special: '+3% Mage damage each' },
  { id: 'temple',    name: 'Temple',        sprite: 'temple',    cost: { gold: 44000, stone: 220, mana: 15 },                 prod: { gold: 230 },   desc: 'The gods smile on commerce.', special: '+2% all gold each' },
  { id: 'scriptorium', name: 'Scriptorium', sprite: 'library',   pal: { m: '#7d4ea0', M: '#5c3677' },                         cost: { gold: 120000, mana: 150 },           prod: { mana: 0.4 },   desc: 'Monks copying spell-scrolls by candlelight.', special: '+3% Mage damage each' },
  { id: 'monastery', name: 'Monastery',     sprite: 'temple',    pal: { y: '#8d939c', Y: '#5d626b' },                         cost: { gold: 180000, stone: 800 },          prod: { gold: 600 },   desc: 'Quiet halls, loud prayers.', special: '+5% Mage damage each' },
  { id: 'observatory', name: 'Observatory', sprite: 'magetower', pal: { p: '#2a4da0', P: '#1c3470', M: '#ffe96b' },           cost: { gold: 400000, mana: 300 },           prod: { mana: 0.3 },   desc: 'Charting the stars for fortune.', special: '+2% item drop chance each' },

  /* ---- South Ward ---- */
  { id: 'barracks',  name: 'Barracks',      sprite: 'barracks',  cost: { gold: 65000, wood: 300, stone: 200 },                prod: { gold: 320 },   desc: 'Where the city learns to fight.', special: '+5% ALL unit damage each' },
  { id: 'magetower', name: 'Mage Tower',    sprite: 'magetower', cost: { gold: 140000, wood: 320, mana: 60 },                 prod: { mana: 0.22 },  desc: 'Arcane spires above the rooftops.', special: '+10% Mage damage each' },
  { id: 'siegeworkshop', name: 'Siege Workshop', sprite: 'smith', pal: { b: '#5d626b', d: '#3a3e46', F: '#e07b39' },          cost: { gold: 500000, wood: 2000, stone: 1000 }, prod: { gold: 800 }, desc: 'Counterweights and great arms.', special: '+10% Ballista & Golem damage each' },
  { id: 'enchanter', name: 'Enchanter',     sprite: 'alchemist', pal: { p: '#2e8fd6', P: '#1f5e96', M: '#a85ccc' },           cost: { gold: 900000, mana: 500 },           prod: { mana: 1.2 },   desc: 'Weapons that hum in the dark.', special: '+5% Plague Alchemist damage each' },
  { id: 'warcollege', name: 'War College',  sprite: 'barracks',  pal: { s: '#9c5454', S: '#6e3a3a' },                         cost: { gold: 1.2e6, stone: 2500 },          prod: { gold: 1500 },  desc: 'Strategy as a science.', special: '+3% ALL unit damage each' },

  /* ---- Wolfgate Ward ---- */
  { id: 'cathedral', name: 'Cathedral',     sprite: 'cathedral', cost: { gold: 320000, stone: 1500, mana: 150 },              prod: { gold: 1400 },  desc: 'Bells that ring across the valley.', special: '+3% all gold each' },
  { id: 'lodge',     name: "Hunters' Lodge", sprite: 'tavern',   pal: { r: '#3f7d2e', R: '#2c5a20' },                         cost: { gold: 1.5e6, wood: 3000 },           prod: { gold: 3000 },  desc: 'Trophies on every wall.', special: '+5% Archer damage each' },
  { id: 'deepmine',  name: 'Deep Mine',     sprite: 'quarry',    pal: { s: '#5d626b', S: '#3a3e46', k: '#0c0914' },           cost: { gold: 2e6, wood: 4000 },             prod: { stone: 4 },    desc: 'Shafts that breathe cold air.', special: '+3% City Wall damage each' },
  { id: 'kennels',   name: 'Wolf Kennels',  sprite: 'farm',      pal: { r: '#6b4e26', R: '#4a3517', y: '#8d939c', Y: '#5d626b' }, cost: { gold: 2.2e6, wood: 3000 },       prod: { gold: 2000 },  desc: 'Howls at the moon.', special: '+5% Archer damage each' },
  { id: 'shrine',    name: 'Shrine of Dawn', sprite: 'temple',   pal: { W: '#ffe96b', w: '#e0c060' },                         cost: { gold: 2.8e6, mana: 1000 },           prod: { gold: 2500 },  desc: 'First light falls here.', special: 'Day gold bonus +3% each' },

  /* ---- Rivergate Ward ---- */
  { id: 'academy',   name: 'Wizard Academy', sprite: 'academy',  cost: { gold: 950000, wood: 1200, mana: 500 },               prod: { mana: 0.6 },   desc: 'Where apprentices become archmagi.', special: '+10% Mage damage each' },
  { id: 'timberworks', name: 'Timberworks', sprite: 'lumber',    pal: { b: '#c2a36b', B: '#94783f', d: '#6b4e26' },           cost: { gold: 3e6, stone: 5000 },            prod: { wood: 4 },     desc: 'Whole forests, planked and stacked.', special: '+3% Ballista damage each' },
  { id: 'tradeport', name: 'Trade Port',    sprite: 'wharf',     pal: { b: '#ffd23e', B: '#b9982f', M: '#234a92' },           cost: { gold: 5e6, wood: 6000, stone: 6000 }, prod: { gold: 8000 }, desc: 'The river road to every kingdom.', special: '+2% all gold each' },
  { id: 'foundry',   name: 'Golem Foundry', sprite: 'smith',     pal: { b: '#3a3e46', F: '#ff8c2e', f: '#ffd23e', s: '#e07b39' }, cost: { gold: 6e6, stone: 8000, mana: 2000 }, prod: { gold: 4000 }, desc: 'Molten runes poured into stone.', special: '+10% Golem damage each' },
  { id: 'lighthouse', name: 'Lighthouse',   sprite: 'magetower', pal: { p: '#e8e4d4', P: '#c43c3c', s: '#e8e4d4', S: '#b8b4a0', M: '#ffe96b' }, cost: { gold: 7e6, stone: 5000 }, prod: { gold: 5000 }, desc: 'A flame against the night.', special: '+2% all gold each' },

  /* ---- Orchard Ward ---- */
  { id: 'mint',      name: 'Royal Mint',    sprite: 'mint',      cost: { gold: 3.2e6, wood: 2500, stone: 2500, mana: 800 },   prod: { gold: 9500 },  desc: 'The crown strikes its own coin.', special: '+5% gold per kill each' },
  { id: 'beekeeper', name: 'Beekeeper',     sprite: 'windmill',  pal: { B: '#e0c060', b: '#b9982f' },                         cost: { gold: 8e6, wood: 8000 },             prod: { gold: 9000 },  desc: 'Golden hives, golden honey.', special: '+2% all gold each' },
  { id: 'groves',    name: 'Orchard Groves', sprite: 'farm',     pal: { r: '#3f7d2e', R: '#2c5a20', y: '#d04f7e', Y: '#a23a5e' }, cost: { gold: 1e7, wood: 10000 },        prod: { gold: 12000 }, desc: 'Apples, plums and quiet rows.', special: '+2% all gold each' },
  { id: 'druid',     name: 'Druid Circle',  sprite: 'manawell',  pal: { s: '#3f7d2e', S: '#2c5a20', M: '#5ccb4a', m: '#2f8f23' }, cost: { gold: 1.5e7, mana: 5000 },       prod: { mana: 4 },     desc: 'Standing stones older than the crown.', special: '+3% Dragon damage each' },
  { id: 'winery',    name: 'Winery',        sprite: 'tavern',    pal: { r: '#a23a5e', R: '#7d2545' },                         cost: { gold: 2e7, wood: 15000 },            prod: { gold: 25000 }, desc: 'Vintages worth a war.', special: '+3% Hero click damage each' },

  /* ---- Harvest Ward: the endgame ---- */
  { id: 'granary',   name: 'Grand Granary', sprite: 'farm',      pal: { b: '#c2a36b', d: '#94783f' },                         cost: { gold: 5e7, wood: 30000, stone: 30000 }, prod: { gold: 60000 }, desc: 'A harvest that feeds ten cities.', special: '+2% all gold each' },
  { id: 'worldtree', name: 'World Tree',    sprite: 'worldtree', cost: { gold: 7e7, mana: 20000 },                            prod: { wood: 20, mana: 2 },  desc: 'Its roots drink from the leylines.', special: '+5% Mage damage each' },
  { id: 'crystalmine', name: 'Crystal Mine', sprite: 'quarry',   pal: { s: '#5fd9ff', S: '#2e8fd6', k: '#234a92' },           cost: { gold: 8e7, stone: 40000 },           prod: { stone: 15, mana: 2 }, desc: 'Veins of frozen starlight.', special: '+3% Mage damage each' },
  { id: 'bank',      name: 'Royal Bank',    sprite: 'mint',      pal: { s: '#e8e4d4', S: '#b8b4a0' },                         cost: { gold: 1.5e8, wood: 50000, stone: 50000, mana: 30000 }, prod: { gold: 100000 }, desc: 'Vaults below, marble above.', special: '+5% all gold each' },
  { id: 'wonder',    name: 'Wonder of the Ages', sprite: 'wonder', cost: { gold: 1e9, wood: 200000, stone: 200000, mana: 100000 }, prod: { gold: 1e6 }, desc: 'They will speak of Aetherholm forever.', special: '+10% all gold each' },

  /* ---- Riftgate Ward: Portal endgame ---- */
  { id: 'riftbeacon', name: 'Rift Beacon', sprite: 'portal', pal: { p: '#c66cff', P: '#7d4ea0', m: '#ffffff' }, cost: { gold: 2e9, stone: 120000, mana: 120000 }, prod: { mana: 18 }, desc: 'A city anchor hammered into the Rift.', special: '+1% Rift Portal team HP & damage each; output scales with best Rift stage' },
  { id: 'riftapothecary', name: 'Rift Apothecary', sprite: 'alchemist', pal: { p: '#a85ccc', P: '#5c3677', M: '#ff8cff' }, cost: { gold: 2.8e9, wood: 150000, mana: 160000 }, prod: { mana: 14, gold: 120000 }, desc: 'Bottles disasters before they happen.', special: 'Improves Portal potion drops and passively brews Portal supplies' },
  { id: 'voidmarket', name: 'Void Market', sprite: 'market', pal: { o: '#a85ccc', p: '#ff8cff', r: '#3c6ed6', y: '#ffd23e' }, cost: { gold: 4e9, wood: 220000, mana: 200000 }, prod: { gold: 450000 }, desc: 'A bazaar where tomorrow buys yesterday.', special: '+2% all gold each; Portal victories pay more' },
  { id: 'echoarsenal', name: 'Echo Arsenal', sprite: 'smith', pal: { F: '#a85ccc', f: '#e6ccff', s: '#6d4f92', S: '#3b2757' }, cost: { gold: 6e9, stone: 300000, mana: 260000 }, prod: { gold: 300000, stone: 35 }, desc: 'Weapons that remember every timeline.', special: '+3% Rift Reaver damage each; boosts Portal fighters' },
  { id: 'reliquarypress', name: 'Reliquary Press', sprite: 'library', pal: { m: '#a85ccc', M: '#5fd9ff', W: '#f2e6ff' }, cost: { gold: 9e9, wood: 320000, stone: 320000, mana: 360000 }, prod: { mana: 22 }, desc: 'Prints small miracles into the city bag.', special: 'Passively creates bag items; faster with Rift progress' },

  /* ---- Spirewatch Ward: Silver Spire endgame ---- */
  { id: 'skyhookyard', name: 'Skyhook Yard', sprite: 'spire', pal: { g: '#ffe96b', b: '#d8f6ff' }, cost: { gold: 2.2e9, wood: 140000, stone: 160000, mana: 100000 }, prod: { wood: 35, mana: 10 }, desc: 'Winches, halos and very long ropes.', special: 'Silver Spire launch power improves with each yard' },
  { id: 'wayhouse', name: 'Angelic Wayhouse', sprite: 'temple', pal: { W: '#f2f4fa', w: '#c7cede', y: '#ffd23e' }, cost: { gold: 3e9, stone: 220000, mana: 180000 }, prod: { gold: 220000, mana: 14 }, desc: 'Pilgrims leave feathers at the door.', special: 'Adds Spire waystone safety even before the ascension node' },
  { id: 'cloudfoundry', name: 'Cloud Foundry', sprite: 'smith', pal: { s: '#c7cede', S: '#8e98b8', F: '#9fd4ff', f: '#f2f4fa' }, cost: { gold: 5e9, stone: 360000, mana: 240000 }, prod: { stone: 42, mana: 16 }, desc: 'Turns thunderheads into marble.', special: '+3% Skyward Seraph damage each' },
  { id: 'dawnprism', name: 'Dawn Prism', sprite: 'magetower', pal: { p: '#e8e4d4', P: '#ffd23e', M: '#9fd4ff' }, cost: { gold: 7.5e9, stone: 400000, mana: 320000 }, prod: { gold: 520000, mana: 18 }, desc: 'Bends first light into coin and courage.', special: 'Day gold bonus rises; at night it feeds item luck' },
  { id: 'crownarchive', name: 'Crown Archive', sprite: 'library', pal: { m: '#f2f4fa', M: '#ffd23e', W: '#fff0a0' }, cost: { gold: 1.1e10, wood: 420000, stone: 420000, mana: 420000 }, prod: { gold: 700000, mana: 24 }, desc: 'Every failed climb becomes a useful footnote.', special: 'Spire best altitude boosts its production and all gold' },

  /* ---- Doomgate Ward: Tower endgame ---- */
  { id: 'doomforge', name: 'Doom Forge', sprite: 'smith', pal: { F: '#ff4a3c', f: '#ffd23e', s: '#4a3a5b', S: '#1c1622' }, cost: { gold: 3e9, stone: 240000, mana: 160000 }, prod: { stone: 35, gold: 260000 }, desc: 'Hammerfalls keep time with the Tower.', special: '+3% Doomforged Reaper damage each; Tower hits strike harder' },
  { id: 'beatfoundry', name: 'Beat Foundry', sprite: 'tower', pal: { r: '#ff8c2e', R: '#8d1f1f', K: '#332842' }, cost: { gold: 4.5e9, wood: 180000, stone: 320000, mana: 220000 }, prod: { gold: 360000, stone: 30 }, desc: 'Metronomes the size of houses.', special: 'Tower notes become a little larger and easier to read' },
  { id: 'reapercloister', name: 'Reaper Cloister', sprite: 'cathedral', pal: { W: '#c0c8d4', w: '#7a838f', m: '#8d1f1f', M: '#ff4a3c' }, cost: { gold: 7e9, stone: 420000, mana: 300000 }, prod: { mana: 18, gold: 420000 }, desc: 'A quiet place for loud endings.', special: '+4% Doomforged Reaper damage each; stronger at night' },
  { id: 'bloodtreasury', name: 'Blood Treasury', sprite: 'mint', pal: { y: '#ff4a3c', Y: '#ffd23e', s: '#332842', S: '#1c1622' }, cost: { gold: 1e10, wood: 360000, stone: 480000, mana: 360000 }, prod: { gold: 850000 }, desc: 'Floor trophies, audited in red ink.', special: '+2% all gold each; Tower rewards pay more' },
  { id: 'nightmetronome', name: 'Night Metronome', sprite: 'magetower', pal: { p: '#1c1622', P: '#332842', M: '#ff4a3c', y: '#ffd23e' }, cost: { gold: 1.4e10, stone: 520000, mana: 520000 }, prod: { mana: 28 }, desc: 'The city sleeps in perfect time.', special: 'Tower misses hurt less; each grants +0.5% night click damage (cap +50%) and +2% night Reaper damage' },

  /* ---- Sunken Ward: sealed-sea endgame ---- */
  { id: 'tidebreaker', name: 'Tidebreaker Dock', sprite: 'wharf', pal: { M: '#5fd9ff', m: '#1c5a8a', b: '#6b4e26' }, cost: { gold: 5e9, wood: 320000, stone: 180000, mana: 140000 }, prod: { wood: 48, gold: 320000 }, desc: 'Ships moor where roads cannot.', special: '+3% Drowned Leviathan damage each; better chest resources' },
  { id: 'pearlexchange', name: 'Pearl Exchange', sprite: 'market', pal: { o: '#d8f6ff', W: '#f2f4fa', p: '#5fd9ff', y: '#ffd23e' }, cost: { gold: 7e9, wood: 360000, mana: 220000 }, prod: { gold: 650000 }, desc: 'Every pearl has heard a secret.', special: '+2% all gold each; Sunken buildings scale with ascensions' },
  { id: 'abyssalvault', name: 'Abyssal Vault', sprite: 'quarry', pal: { s: '#1c5a8a', S: '#0a2436', k: '#02131f' }, cost: { gold: 1.05e10, stone: 520000, mana: 300000 }, prod: { stone: 60, mana: 16 }, desc: 'Locked below the riverbed and the law.', special: 'Boosts item drops and strengthens passive item printing' },
  { id: 'moonpool', name: 'Moonpool Sanctum', sprite: 'manawell', pal: { M: '#d8f6ff', m: '#5fd9ff', s: '#1c5a8a', S: '#0a2436' }, cost: { gold: 1.45e10, stone: 580000, mana: 420000 }, prod: { mana: 36 }, desc: 'The night sky, reflected from beneath.', special: 'Mana rises; night item-drop bonuses grow stronger' },
  { id: 'leviathannest', name: 'Leviathan Nursery', sprite: 'worldtree', pal: { l: '#2e8fd6', L: '#5fd9ff', t: '#0a2436', T: '#1c5a8a', M: '#d8f6ff' }, cost: { gold: 2e10, wood: 600000, stone: 600000, mana: 600000 }, prod: { gold: 900000, mana: 30 }, desc: 'A cradle for something that can swallow eras.', special: '+5% Drowned Leviathan damage each; ascensions deepen its output' },
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
    { id: 'alch_warbrew', name: 'War Brews', max: 10, cost: l => ({ gold: 60000 * Math.pow(3, l), mana: 200 * Math.pow(2, l) }),
      info: 'Plague Alchemists +10% damage per level.' },
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
    { id: 'magetower_rifts', name: 'Riftway Anchors', max: 10, cost: l => ({ gold: 4e7 * Math.pow(3, l), mana: 6000 * Math.pow(2, l) }),
      info: 'Rift Reavers +10% damage per level.' },
  ],
  cathedral: [
    { id: 'cath_relics', name: 'Holy Relics', max: 5, cost: l => ({ gold: 400000 * Math.pow(4, l), mana: 100 * Math.pow(2, l) }),
      info: '+4% ALL gold per level.' },
    { id: 'cath_blessings', name: 'War Blessings', max: 10, cost: l => ({ gold: 600000 * Math.pow(3, l), mana: 200 * Math.pow(2, l) }),
      info: 'Clerics +10% damage per level.' },
  ],
  armory: [
    { id: 'armory_master', name: 'Mastercraft Arms', max: 10, cost: l => ({ gold: 120000 * Math.pow(3, l), stone: 300 * Math.pow(2.2, l) }),
      info: 'Hero click damage +10% per level.' },
  ],
  kennels: [
    { id: 'kennels_alpha', name: 'Alpha Packs', max: 10, cost: l => ({ gold: 2e6 * Math.pow(3, l), wood: 3000 * Math.pow(2.2, l) }),
      info: 'Archers +10% damage per level.' },
  ],
  lodge: [
    { id: 'lodge_hunters', name: 'Master Hunters', max: 10, cost: l => ({ gold: 1.5e6 * Math.pow(3, l), wood: 2500 * Math.pow(2.2, l) }),
      info: 'Archers +10% damage per level.' },
  ],
  siegeworkshop: [
    { id: 'siege_counter', name: 'Counterweights', max: 10, cost: l => ({ gold: 700000 * Math.pow(3, l), wood: 2000 * Math.pow(2.2, l) }),
      info: 'Ballistae & Golem +10% damage per level.' },
  ],
  foundry: [
    { id: 'foundry_runes', name: 'Rune Forges', max: 10, cost: l => ({ gold: 8e6 * Math.pow(3, l), mana: 1500 * Math.pow(2, l) }),
      info: 'Golem +10% damage per level.' },
    { id: 'foundry_doom', name: 'Hellforge Crucibles', max: 10, cost: l => ({ gold: 6e7 * Math.pow(3, l), mana: 8000 * Math.pow(2, l) }),
      info: 'Doomforged Reapers +10% damage per level.' },
  ],
  tradeport: [
    { id: 'trade_mercs', name: 'Mercenary Contracts', max: 5, cost: l => ({ gold: 1e7 * Math.pow(4, l), wood: 5000 * Math.pow(2.5, l) }),
      info: '+5% ALL unit damage per level.' },
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
    { id: 'acad_roosts', name: 'Dragon Roosts', max: 10, cost: l => ({ gold: 2e7 * Math.pow(3, l), mana: 5000 * Math.pow(2, l) }),
      info: 'Dragons +10% damage per level.' },
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
  /* ---- late-game war synergies: every unit gets buildings to scale off ---- */
  tannery: [
    { id: 'tan_saddles', name: 'War Saddles', max: 10, cost: l => ({ gold: 80000 * Math.pow(3, l), wood: 500 * Math.pow(2.2, l) }),
      info: 'Archers +5%, Dragons +5% AND Knights +10% damage per level.' },
  ],
  fishmarket: [
    { id: 'fishmarket_provisions', name: 'Salted Provisions', max: 10, cost: l => ({ gold: 120000 * Math.pow(3, l), wood: 600 * Math.pow(2.2, l) }),
      info: 'Fish Markets +20% gold AND Knights +10% damage per level.' },
  ],
  beekeeper: [
    { id: 'beekeeper_apiary', name: 'Venom Apiary', max: 10, cost: l => ({ gold: 1.5e7 * Math.pow(3, l), mana: 4000 * Math.pow(2, l) }),
      info: 'Beekeepers +20% gold AND Plague Alchemists +10% damage per level.' },
  ],
  scriptorium: [
    { id: 'scrip_warglyphs', name: 'War Glyphs', max: 10, cost: l => ({ gold: 150000 * Math.pow(3, l), mana: 60 * Math.pow(2, l) }),
      info: 'Golem +10% damage per level.' },
  ],
  monastery: [
    { id: 'mona_chants', name: 'War Chants', max: 10, cost: l => ({ gold: 250000 * Math.pow(3, l), mana: 80 * Math.pow(2, l) }),
      info: 'Clerics +10% damage per level.' },
  ],
  observatory: [
    { id: 'obs_charts', name: 'Star Charts', max: 10, cost: l => ({ gold: 500000 * Math.pow(3, l), mana: 150 * Math.pow(2, l) }),
      info: 'Dragons +10% AND Valkyries +10% damage per level.' },
    { id: 'obs_seraphs', name: 'Celestial Beacons', max: 10, cost: l => ({ gold: 5e7 * Math.pow(3, l), mana: 7000 * Math.pow(2, l) }),
      info: 'Skyward Seraphs +10% damage per level.' },
  ],
  harbor: [
    { id: 'harbor_ballistae', name: 'Naval Ballistae', max: 10, cost: l => ({ gold: 300000 * Math.pow(3, l), wood: 1200 * Math.pow(2.2, l) }),
      info: 'Ballistae +10% damage per level.' },
    { id: 'harbor_leviathan', name: 'Abyssal Wards', max: 10, cost: l => ({ gold: 7e7 * Math.pow(3, l), mana: 9000 * Math.pow(2, l) }),
      info: 'Drowned Leviathan +10% damage per level.' },
  ],
  enchanter: [
    { id: 'ench_blades', name: 'Runed Blades', max: 10, cost: l => ({ gold: 1.2e6 * Math.pow(3, l), mana: 400 * Math.pow(2, l) }),
      info: 'Hero click damage +10% per level.' },
  ],
  warcollege: [
    { id: 'college_officers', name: 'Officer Corps', max: 10, cost: l => ({ gold: 1.5e6 * Math.pow(3, l), stone: 2000 * Math.pow(2.2, l) }),
      info: '+3% ALL unit damage per level.' },
  ],
  shrine: [
    { id: 'shrine_dawn', name: 'Dawn Blessing', max: 10, cost: l => ({ gold: 3e6 * Math.pow(3, l), mana: 800 * Math.pow(2, l) }),
      info: 'Clerics +10% damage per level.' },
  ],
  lighthouse: [
    { id: 'light_signals', name: 'Signal Fires', max: 10, cost: l => ({ gold: 8e6 * Math.pow(3, l), stone: 4000 * Math.pow(2.2, l) }),
      info: 'Archers +5%, Ballistae +5% AND Valkyries +5% damage per level.' },
  ],
  groves: [
    { id: 'groves_feasts', name: 'Harvest Feasts', max: 10, cost: l => ({ gold: 1.2e7 * Math.pow(3, l), wood: 6000 * Math.pow(2.2, l) }),
      info: 'Archers +10% damage per level.' },
  ],
  druid: [
    { id: 'druid_wild', name: 'Wild Allies', max: 10, cost: l => ({ gold: 1.6e7 * Math.pow(3, l), mana: 3000 * Math.pow(2, l) }),
      info: 'Golem +5% AND Dragons +5% damage per level.' },
  ],
  winery: [
    { id: 'winery_courage', name: 'Liquid Courage', max: 10, cost: l => ({ gold: 2.2e7 * Math.pow(3, l), wood: 8000 * Math.pow(2.2, l) }),
      info: 'Hero click damage +10% per level.' },
  ],
  granary: [
    { id: 'granary_rations', name: 'War Rations', max: 10, cost: l => ({ gold: 6e7 * Math.pow(3, l), wood: 15000 * Math.pow(2.2, l) }),
      info: '+3% ALL unit damage per level.' },
  ],
  bank: [
    { id: 'bank_bonds', name: 'War Bonds', max: 10, cost: l => ({ gold: 2e8 * Math.pow(3, l), mana: 20000 * Math.pow(2, l) }),
      info: '+5% ALL unit damage per level.' },
  ],
  wonder: [
    { id: 'wonder_heroes', name: 'Monument of Heroes', max: 10, cost: l => ({ gold: 1.5e9 * Math.pow(3, l), mana: 50000 * Math.pow(2, l) }),
      info: '+10% ALL unit damage per level.' },
  ],
  riftbeacon: [
    { id: 'riftbeacon_lenses', name: 'Fracture Lenses', max: 10, cost: l => ({ gold: 2.2e9 * Math.pow(3, l), mana: 120000 * Math.pow(2, l) }),
      info: 'Rift Beacons +20% Mana and Portal team HP/damage +2% per level.' },
  ],
  riftapothecary: [
    { id: 'riftapoth_stills', name: 'Paradox Stills', max: 10, cost: l => ({ gold: 3e9 * Math.pow(3, l), wood: 120000 * Math.pow(2.2, l), mana: 140000 * Math.pow(2, l) }),
      info: 'Rift Apothecaries +20% production and passive Portal-supply brewing +15% per level.' },
    { id: 'riftapoth_favor', name: 'Bottled Favors', max: 5, cost: l => ({ gold: 8e9 * Math.pow(4, l), mana: 260000 * Math.pow(2, l) }),
      info: 'Portal victory potion chances +3% per level.' },
  ],
  voidmarket: [
    { id: 'voidmarket_contracts', name: 'Impossible Contracts', max: 10, cost: l => ({ gold: 4.4e9 * Math.pow(3, l), mana: 180000 * Math.pow(2, l) }),
      info: 'Void Markets +20% gold and Portal victory gold +5% per level.' },
  ],
  echoarsenal: [
    { id: 'echoarsenal_edges', name: 'Echoing Edges', max: 10, cost: l => ({ gold: 6.4e9 * Math.pow(3, l), stone: 180000 * Math.pow(2.2, l), mana: 200000 * Math.pow(2, l) }),
      info: 'Rift Reavers +10% damage and Portal fighter damage +3% per level.' },
  ],
  reliquarypress: [
    { id: 'reliq_imprint', name: 'Runic Imprints', max: 10, cost: l => ({ gold: 9.5e9 * Math.pow(3, l), mana: 260000 * Math.pow(2, l) }),
      info: 'Reliquary Presses +20% Mana and passive item printing +15% per level.' },
    { id: 'reliq_affixes', name: 'Ink of Many Names', max: 5, cost: l => ({ gold: 1.8e10 * Math.pow(4, l), mana: 500000 * Math.pow(2, l) }),
      info: 'Passive printed items have +10% affix chance per level, even before Mystic Forging.' },
  ],
  skyhookyard: [
    { id: 'skyhook_tension', name: 'Halo Tensioners', max: 10, cost: l => ({ gold: 2.5e9 * Math.pow(3, l), wood: 100000 * Math.pow(2.2, l), mana: 100000 * Math.pow(2, l) }),
      info: 'Skyhook Yards +20% production and Silver Spire launch power +1.5% per level.' },
  ],
  wayhouse: [
    { id: 'wayhouse_feathers', name: 'Feathered Rails', max: 10, cost: l => ({ gold: 3.2e9 * Math.pow(3, l), stone: 140000 * Math.pow(2.2, l), mana: 140000 * Math.pow(2, l) }),
      info: 'Wayhouses +20% production and Spire waystones become more frequent.' },
  ],
  cloudfoundry: [
    { id: 'cloudfoundry_anvils', name: 'Nimbus Anvils', max: 10, cost: l => ({ gold: 5.3e9 * Math.pow(3, l), stone: 220000 * Math.pow(2.2, l), mana: 180000 * Math.pow(2, l) }),
      info: 'Cloud Foundries +20% production and Skyward Seraphs +10% damage per level.' },
  ],
  dawnprism: [
    { id: 'dawnprism_facets', name: 'Sun-Cut Facets', max: 10, cost: l => ({ gold: 8e9 * Math.pow(3, l), mana: 240000 * Math.pow(2, l) }),
      info: 'Dawn Prisms +20% production, day gold bonus +1% and night item luck +2% per level.' },
  ],
  crownarchive: [
    { id: 'crownarchive_ledgers', name: 'Altitude Ledgers', max: 10, cost: l => ({ gold: 1.15e10 * Math.pow(3, l), mana: 320000 * Math.pow(2, l) }),
      info: 'Crown Archives +20% production and all gold +1% per level.' },
  ],
  doomforge: [
    { id: 'doomforge_quench', name: 'Doom Quenching', max: 10, cost: l => ({ gold: 3.2e9 * Math.pow(3, l), stone: 150000 * Math.pow(2.2, l), mana: 120000 * Math.pow(2, l) }),
      info: 'Doom Forges +20% production, Reapers +10% damage and Tower hits +1% per level.' },
  ],
  beatfoundry: [
    { id: 'beat_calibration', name: 'Beat Calibration', max: 10, cost: l => ({ gold: 4.8e9 * Math.pow(3, l), stone: 200000 * Math.pow(2.2, l), mana: 170000 * Math.pow(2, l) }),
      info: 'Beat Foundries +20% production and Tower notes are larger/slower per level.' },
  ],
  reapercloister: [
    { id: 'reaper_litany', name: 'Litany of Endings', max: 10, cost: l => ({ gold: 7.5e9 * Math.pow(3, l), mana: 220000 * Math.pow(2, l) }),
      info: 'Reaper Cloisters +20% production and Doomforged Reapers +10% damage per level.' },
  ],
  bloodtreasury: [
    { id: 'blood_vaults', name: 'Scarlet Vaults', max: 10, cost: l => ({ gold: 1.05e10 * Math.pow(3, l), stone: 280000 * Math.pow(2.2, l), mana: 220000 * Math.pow(2, l) }),
      info: 'Blood Treasuries +20% gold and Tower rewards +5% per level.' },
  ],
  nightmetronome: [
    { id: 'metronome_mercy', name: 'Merciful Tempo', max: 10, cost: l => ({ gold: 1.5e10 * Math.pow(3, l), mana: 360000 * Math.pow(2, l) }),
      info: 'Night Metronomes +20% Mana; night clicks gain +1.5% and Reapers +3% per level.' },
  ],
  tidebreaker: [
    { id: 'tidebreaker_cranes', name: 'Tidal Cranes', max: 10, cost: l => ({ gold: 5.4e9 * Math.pow(3, l), wood: 190000 * Math.pow(2.2, l), stone: 130000 * Math.pow(2.2, l) }),
      info: 'Tidebreaker Docks +20% production and chest Wood/Stone rewards +5% per level.' },
  ],
  pearlexchange: [
    { id: 'pearl_ledgers', name: 'Mother-of-Pearl Ledgers', max: 10, cost: l => ({ gold: 7.4e9 * Math.pow(3, l), mana: 170000 * Math.pow(2, l) }),
      info: 'Pearl Exchanges +20% gold and all gold +1% per level.' },
  ],
  abyssalvault: [
    { id: 'abyssal_index', name: 'Abyssal Index', max: 10, cost: l => ({ gold: 1.1e10 * Math.pow(3, l), stone: 300000 * Math.pow(2.2, l), mana: 220000 * Math.pow(2, l) }),
      info: 'Abyssal Vaults +20% production, item drops +2% and passive item printing +10% per level.' },
  ],
  moonpool: [
    { id: 'moonpool_tides', name: 'Lunar Undertow', max: 10, cost: l => ({ gold: 1.5e10 * Math.pow(3, l), mana: 320000 * Math.pow(2, l) }),
      info: 'Moonpools +20% Mana and night item-drop bonuses +3% per level.' },
  ],
  leviathannest: [
    { id: 'leviathan_lullaby', name: 'Abyssal Lullaby', max: 10, cost: l => ({ gold: 2.1e10 * Math.pow(3, l), wood: 350000 * Math.pow(2.2, l), mana: 420000 * Math.pow(2, l) }),
      info: 'Leviathan Nurseries +20% production and Drowned Leviathan +10% damage per level.' },
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
      { id: 'innerfire', name: 'Inner Fire', max: Infinity, cost: l => ({ mana: 12 * Math.pow(1.6, l) }), info: '+20% click damage per level. Requires Mana.' },
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
      { id: 'windlore', name: 'Wind Lore', max: Infinity, cost: l => ({ mana: 10 * Math.pow(1.6, l) }), info: '+25% Archer damage per level. Requires Mana.' },
    ],
  },
  {
    id: 'mage', name: 'Battle Mages', portrait: 'magep', icon: 'icoMage', slots: 2, statKey: 'mage',
    lvlLabel: 'Mages', dpsLabel: 'MAGE DPS',
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
      { id: 'siegecraft', name: 'Siegecraft', max: Infinity, cost: l => ({ mana: 14 * Math.pow(1.6, l) }), info: '+25% Ballista damage per level. Requires Mana.' },
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
      { id: 'hymnal', name: 'Deeper Litanies', max: Infinity, cost: l => ({ mana: 60 * Math.pow(1.65, l) }), info: '+25% Cleric damage per level. Requires Mana.' },
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
      { id: 'attunement', name: 'Core Attunement', max: Infinity, cost: l => ({ mana: 20 * Math.pow(1.6, l) }), info: '+25% Golem damage per level. Requires Mana.' },
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
      { id: 'skymastery', name: 'Sky Mastery', max: Infinity, cost: l => ({ mana: 300 * Math.pow(1.7, l) }), info: '+25% Dragon damage per level. Requires Mana.' },
    ],
  },
  {
    id: 'knight', name: 'Royal Knights', portrait: 'knightp', icon: 'icoLance', slots: 2, statKey: 'knight',
    lvlLabel: 'Knights', dpsLabel: 'CAVALRY DPS', unlock: { zone: 8 },
    desc: 'Steel-clad lancers thundering out of the gates. Boosted by the Tannery & Fish Market.',
    main: { name: 'Knight Lance', verb: 'Knight', cost: l => ({ gold: 4000 * Math.pow(1.55, l), wood: 40 * Math.pow(1.4, l) }), info: 'Each knight deals 14 idle DPS. +5% per Tannery saddle upgrade.' },
    subs: [
      { id: 'lances', name: 'Steel Lances', max: 20, cost: l => ({ gold: 9000 * Math.pow(2, l), stone: 60 * Math.pow(1.6, l) }), info: '+15% Knight damage per level.' },
      { id: 'charge', name: 'Cavalry Charge', max: 1, cost: () => ({ gold: 250000, wood: 1500 }), info: 'Knight damage x1.5.' },
      { id: 'barding', name: 'Warhorse Barding', max: Infinity, cost: l => ({ mana: 18 * Math.pow(1.6, l) }), info: '+25% Knight damage per level. Requires Mana.' },
    ],
  },
  {
    id: 'plague', name: 'Plague Alchemists', portrait: 'plaguep', icon: 'icoVial', slots: 2, statKey: 'plague',
    lvlLabel: 'Alchemists', dpsLabel: 'TOXIN DPS', unlock: { zone: 14 },
    desc: 'Masked bombers hurling vials of seething venom. Blessed by the Alchemist & Beekeeper.',
    main: { name: 'Hire Alchemist', verb: 'Hire', cost: l => ({ gold: 120000 * Math.pow(1.55, l), mana: 80 * Math.pow(1.45, l) }), info: 'Each alchemist deals 120 idle DPS. +5% per Alchemist & Enchanter.' },
    subs: [
      { id: 'toxins', name: 'Refined Toxins', max: 20, cost: l => ({ gold: 400000 * Math.pow(2, l), mana: 200 * Math.pow(1.7, l) }), info: '+15% Plague damage per level.' },
      { id: 'catalyst', name: "Philosopher's Catalyst", max: 1, cost: () => ({ mana: 80000 }), info: 'Plague damage x1.5.' },
      { id: 'miasma', name: 'Spreading Miasma', max: Infinity, cost: l => ({ mana: 70 * Math.pow(1.65, l) }), info: '+25% Plague damage per level. Requires Mana.' },
    ],
  },
  {
    id: 'valkyrie', name: 'Storm Valkyries', portrait: 'valkyriep', icon: 'icoGlaive', slots: 2, statKey: 'valkyrie',
    lvlLabel: 'Valkyries', dpsLabel: 'STORM DPS', unlock: { zone: 22 },
    desc: 'Winged shield-maidens diving from thunderheads. Watched over by the Observatory & Cathedral.',
    main: { name: 'Summon Valkyrie', verb: 'Summon', cost: l => ({ gold: 3e6 * Math.pow(1.6, l), mana: 800 * Math.pow(1.5, l) }), info: 'Each valkyrie deals 800 idle DPS. +5% per Observatory.' },
    subs: [
      { id: 'glaives', name: 'Lightning Glaives', max: 20, cost: l => ({ gold: 1.2e7 * Math.pow(2, l), mana: 2500 * Math.pow(1.7, l) }), info: '+15% Valkyrie damage per level.' },
      { id: 'valor', name: "Valkyrie's Valor", max: 1, cost: () => ({ mana: 150000 }), info: 'Valkyrie damage x1.5.' },
      { id: 'tempest', name: 'Tempest Wings', max: Infinity, cost: l => ({ mana: 260 * Math.pow(1.7, l) }), info: '+25% Valkyrie damage per level. Requires Mana.' },
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
      { id: 'garrison', name: 'Garrison Drills', max: Infinity, cost: l => ({ mana: 16 * Math.pow(1.6, l) }), info: '+20% Wall damage per level. Requires Mana.' },
    ],
  },

  /* ---------------- WARD UNITS ----------------
     Four units, each unlocked by claiming an outer cardinal ward,
     and each scaling with the PROGRESS of that ward's realm.
     unlock: {ward} — permanent once the ward is first bought.  */
  {
    id: 'reaver', name: 'Rift Reavers', portrait: 'reaverp', icon: 'icoFang', slots: 2, statKey: 'reaver',
    lvlLabel: 'Reavers', dpsLabel: 'RIFT DPS', unlock: { ward: '2,0' },
    desc: 'Riftborn marauders dragged back through the Portal — they grow stronger the deeper you have pushed into the Rift.',
    main: { name: 'Drag Reaver', verb: 'Drag', cost: l => ({ gold: 8e6 * Math.pow(1.6, l), mana: 1200 * Math.pow(1.5, l) }), info: 'Each reaver deals 700 idle DPS. +4% damage per Rift Portal best stage.' },
    subs: [
      { id: 'rendfang', name: 'Rending Fangs', max: 20, cost: l => ({ gold: 3e7 * Math.pow(2, l), mana: 3500 * Math.pow(1.7, l) }), info: '+15% Reaver damage per level.' },
      { id: 'riftpact', name: 'Riftborn Pact', max: 1, cost: () => ({ mana: 300000 }), info: 'Reaver damage x1.5.' },
      { id: 'voidcall', name: 'Voidcalling', max: Infinity, cost: l => ({ mana: 320 * Math.pow(1.7, l) }), info: '+25% Reaver damage per level. Requires Mana.' },
    ],
  },
  {
    id: 'seraph', name: 'Skyward Seraphs', portrait: 'seraphp', icon: 'icoHalo', slots: 2, statKey: 'seraph',
    lvlLabel: 'Seraphs', dpsLabel: 'RADIANT DPS', unlock: { ward: '0,2' },
    desc: 'Winged celestials called down from the Silver Spire — every meter you have climbed lends them light.',
    main: { name: 'Call Seraph', verb: 'Call', cost: l => ({ gold: 1e7 * Math.pow(1.6, l), mana: 1500 * Math.pow(1.5, l) }), info: 'Each seraph deals 1,100 idle DPS. +1% damage per 5m of Silver Spire best altitude.' },
    subs: [
      { id: 'radiant', name: 'Radiant Wings', max: 20, cost: l => ({ gold: 4e7 * Math.pow(2, l), mana: 4000 * Math.pow(1.7, l) }), info: '+15% Seraph damage per level.' },
      { id: 'skyrite', name: 'Rite of Ascension', max: 1, cost: () => ({ mana: 400000 }), info: 'Seraph damage x1.5.' },
      { id: 'skysong', name: 'Choir of the Spire', max: Infinity, cost: l => ({ mana: 360 * Math.pow(1.7, l) }), info: '+25% Seraph damage per level. Requires Mana.' },
    ],
  },
  {
    id: 'reaper', name: 'Doomforged Reapers', portrait: 'reaperp', icon: 'icoBrand', slots: 2, statKey: 'reaper',
    lvlLabel: 'Reapers', dpsLabel: 'DOOM DPS', unlock: { ward: '2,4' },
    desc: 'Hellforged executioners climbing out of the Tower of Doom — each floor you have conquered tempers their scythes.',
    main: { name: 'Forge Reaper', verb: 'Forge', cost: l => ({ gold: 1.5e7 * Math.pow(1.6, l), stone: 4000 * Math.pow(1.5, l), mana: 1800 * Math.pow(1.5, l) }), info: 'Each reaper deals 1,500 idle DPS. +4% damage per Tower of Doom best floor.' },
    subs: [
      { id: 'scythes', name: 'Cruel Scythes', max: 20, cost: l => ({ gold: 6e7 * Math.pow(2, l), stone: 9000 * Math.pow(1.7, l) }), info: '+15% Reaper damage per level.' },
      { id: 'doompact', name: 'Pact of Doom', max: 1, cost: () => ({ mana: 500000 }), info: 'Reaper damage x1.5.' },
      { id: 'infernrite', name: 'Infernal Rites', max: Infinity, cost: l => ({ mana: 420 * Math.pow(1.7, l) }), info: '+25% Reaper damage per level. Requires Mana.' },
    ],
  },
  {
    id: 'leviathan', name: 'Drowned Leviathan', portrait: 'leviathanp', icon: 'icoTide', slots: 2, statKey: 'leviathan',
    lvlLabel: 'Leviathans', dpsLabel: 'ABYSS DPS', unlock: { ward: '4,2' },
    desc: 'An ancient horror stirring beneath the Sunken Ward, sealed behind a gate no key yet opens. It wakes a little more with every Ascension.',
    main: { name: 'Rouse Leviathan', verb: 'Rouse', cost: l => ({ gold: 3e7 * Math.pow(1.62, l), mana: 2500 * Math.pow(1.5, l) }), info: 'Each leviathan deals 2,600 idle DPS. +20% damage per Ascension performed.' },
    subs: [
      { id: 'barbtide', name: 'Barbed Tides', max: 20, cost: l => ({ gold: 1.2e8 * Math.pow(2, l), mana: 6000 * Math.pow(1.7, l) }), info: '+15% Leviathan damage per level.' },
      { id: 'abysspact', name: 'Abyssal Pact', max: 1, cost: () => ({ mana: 750000 }), info: 'Leviathan damage x1.5.' },
      { id: 'deepcall', name: 'The Deep Calls', max: Infinity, cost: l => ({ mana: 520 * Math.pow(1.7, l) }), info: '+25% Leviathan damage per level. Requires Mana.' },
    ],
  },
];

/* ---------------- ARCANE SKILLS (one-time, cost Mana) ----------------
   Every unit has its own list now (unit: id) — shown in its panel. */
const SKILLS = [
  /* mage */
  { id: 'fireball', unit: 'mage',   name: 'Fireball',        cost: { mana: 50 },     desc: 'Mage damage x2.' },
  { id: 'arcane',   unit: 'mage',   name: 'Arcane Mastery',  cost: { mana: 320 },    desc: 'Mana production +50%.' },
  { id: 'chain',    unit: 'mage',   name: 'Chain Lightning', cost: { mana: 2600 },   desc: 'Mage damage x1.5.' },
  /* hero */
  { id: 'meteor',   unit: 'hero',   name: 'Meteor Brand',    cost: { mana: 900 },    desc: 'Clicks deal +0.05% of your unit idle DPS.' },
  { id: 'frost',    unit: 'hero',   name: 'Frost Sigil',     cost: { mana: 130 },    desc: '+25% gold from kills.' },
  { id: 'echo',     unit: 'hero',   name: 'Echo Strike',     cost: { mana: 120000 }, desc: 'Clicks have a 20% chance to strike TWICE.' },
  /* archer */
  { id: 'volley',   unit: 'archer', name: 'Blessed Volley',  cost: { mana: 15000 },  desc: 'Archer damage x2.' },
  { id: 'hawk',     unit: 'archer', name: 'Hawk Companions', cost: { mana: 45000 },  desc: 'Archers deal +2% damage per Zone reached this run.' },
  /* ballistae */
  { id: 'ironclad', unit: 'turret', name: 'Ironclad Rune',   cost: { mana: 40000 },  desc: 'Ballista & Golem damage x1.5.' },
  { id: 'warmachine', unit: 'turret', name: 'War Machine',   cost: { mana: 180000 }, desc: 'Ballistae deal +0.5% damage per building standing in the city.' },
  /* cleric */
  { id: 'warhymn',  unit: 'cleric', name: 'War Hymn',        cost: { mana: 100000 }, desc: 'Cleric damage x2.' },
  { id: 'masshymn', unit: 'cleric', name: 'Mass Hymns',      cost: { mana: 300000 }, desc: 'Clerics deal +3% damage per holy building (Temples, Monasteries, Cathedrals, Shrines).' },
  /* golem */
  { id: 'stonechoir', unit: 'golem', name: 'Stone Choir',    cost: { mana: 90000 },  desc: 'Golem deals +2% damage per stone building (Quarries, Stonecutters, Deep Mines, Crystal Mines).' },
  /* dragon */
  { id: 'dragonsoul', unit: 'dragon', name: 'Dragon Soul',   cost: { mana: 250000 }, desc: 'Dragon damage x1.5.' },
  { id: 'wyrmpact', unit: 'dragon', name: 'Wyrm Pact',       cost: { mana: 600000 }, desc: 'Dragons deal DOUBLE damage at night.' },
  /* knight */
  { id: 'cavalcade', unit: 'knight', name: 'Royal Cavalcade', cost: { mana: 30000 },  desc: 'Knight damage x2.' },
  { id: 'lancewall', unit: 'knight', name: 'Wall of Lances',  cost: { mana: 90000 },  desc: 'Knights deal +3% damage per military building (Barracks, Armory, War College, Siege Workshop).' },
  /* plague */
  { id: 'pandemic',  unit: 'plague', name: 'Pandemic',        cost: { mana: 120000 }, desc: 'Plague damage x2.' },
  { id: 'corrosion', unit: 'plague', name: 'Corrosion',       cost: { mana: 320000 }, desc: 'Plague deal +2% damage per alchemy building (Alchemist, Enchanter, Scriptorium, Beekeeper, Druid).' },
  /* valkyrie */
  { id: 'ragnarok',  unit: 'valkyrie', name: 'Ragnarok',      cost: { mana: 280000 }, desc: 'Valkyrie damage x1.5.' },
  { id: 'stormcall', unit: 'valkyrie', name: 'Stormcall',     cost: { mana: 650000 }, desc: 'Valkyries deal DOUBLE damage at night.' },
  /* walls */
  { id: 'midas',    unit: 'walls',  name: 'Midas Curse',     cost: { mana: 6500 },   desc: '+50% gold from kills.' },
  { id: 'kingsbanner', unit: 'walls', name: 'Banner of Kings', cost: { mana: 70000 }, desc: 'Gold per kill +1% per Wall level.' },
  /* reaver (Rift) */
  { id: 'riftsurge', unit: 'reaver', name: 'Rift Surge',      cost: { mana: 400000 }, desc: 'Reaver damage x2.' },
  { id: 'riftmaw',   unit: 'reaver', name: 'The Hungering Maw', cost: { mana: 900000 }, desc: 'Reavers deal +1% damage per Rift card you have claimed.' },
  /* seraph (Spire) */
  { id: 'judgment',  unit: 'seraph', name: 'Judgment',        cost: { mana: 500000 }, desc: 'Seraph damage x2.' },
  /* reaper (Doom) */
  { id: 'reaping',   unit: 'reaper', name: 'Grim Reaping',    cost: { mana: 600000 }, desc: 'Reaper damage x2.' },
  { id: 'doombrand', unit: 'reaper', name: 'Brand of Night',  cost: { mana: 1.2e6 },  desc: 'Reapers deal DOUBLE damage at night.' },
  /* leviathan (Sunken) */
  { id: 'tidefury',  unit: 'leviathan', name: 'Tidefury',     cost: { mana: 900000 }, desc: 'Leviathan damage x2.' },
  { id: 'drowning',  unit: 'leviathan', name: 'Drowned Kingdom', cost: { mana: 2e6 }, desc: 'Leviathans deal +2% damage per District owned.' },
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
  lance:  { name: "Knight's Lance",  icon: 'icoLance',  units: ['knight'], eff: 'knight', base: 15, txt: 'Knight damage' },
  vial:   { name: 'Vial of Venom',   icon: 'icoVial',   units: ['plague'], eff: 'plague', base: 15, txt: 'Plague damage' },
  glaive: { name: 'Storm Glaive',    icon: 'icoGlaive', units: ['valkyrie'], eff: 'valkyrie', base: 15, txt: 'Valkyrie damage' },
  fang:   { name: 'Riftborn Fang',   icon: 'icoFang',   units: ['reaver'], eff: 'reaver', base: 15, txt: 'Reaver damage' },
  halo:   { name: 'Seraph Halo',     icon: 'icoHalo',   units: ['seraph'], eff: 'seraph', base: 15, txt: 'Seraph damage' },
  brand:  { name: 'Doom Brand',      icon: 'icoBrand',  units: ['reaper'], eff: 'reaper', base: 15, txt: 'Reaper damage' },
  tide:   { name: 'Abyssal Pearl',   icon: 'icoTide',   units: ['leviathan'], eff: 'leviathan', base: 15, txt: 'Leviathan damage' },
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
  lance: 'Charging', vial: 'Plague', glaive: 'Storms',
  fang: 'the Rift', halo: 'the Heavens', brand: 'Doom', tide: 'the Abyss',
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
const DISTRICT_GOLD_BONUS = 0.05; // +5% all gold per extra district

function dKey(dx, dy) { return dx + ',' + dy; }
function districtOf(x, y) { return [Math.floor(x / DISTRICT_W), Math.floor(y / DISTRICT_H)]; }
/* the city is a PLUS: the 3x3 core plus four cardinal "gamemode" wards
   reaching out along the kingsroad arms (N, W, E, S). */
function isCityDistrict(dx, dy) {
  if (dx >= 1 && dx <= 3 && dy >= 1 && dy <= 3) return true;      // core 3x3
  if (dx === 2 && (dy === 0 || dy === 4)) return true;           // N / S arms
  if (dy === 2 && (dx === 0 || dx === 4)) return true;           // W / E arms
  return false;
}

function districtCost(nOwnedExtra) {
  const cost = {
    gold: Math.ceil(100000 * Math.pow(5, nOwnedExtra)),
    wood: Math.ceil(1500 * Math.pow(2.5, nOwnedExtra)),
    stone: Math.ceil(1500 * Math.pow(2.5, nOwnedExtra)),
  };
  if (nOwnedExtra >= 4) cost.mana = Math.ceil(750 * Math.pow(2.8, nOwnedExtra - 4));
  return cost;
}

const DISTRICT_REQUIREMENTS = [
  { zone: 3, walls: 5, buildings: 10 },
  { zone: 6, walls: 7, buildings: 25 },
  { zone: 10, walls: 9, buildings: 45 },
  { zone: 15, walls: 11, buildings: 70 },
  { zone: 22, walls: 13, buildings: 100 },
  { zone: 30, walls: 15, buildings: 140 },
  { zone: 40, walls: 17, buildings: 190 },
  { zone: 52, walls: 19, buildings: 250 },
  { zone: 70, walls: 21, buildings: 325 },
  { zone: 92, walls: 23, buildings: 415 },
  { zone: 118, walls: 25, buildings: 525 },
  { zone: 150, walls: 27, buildings: 650 },
];

function districtRequirement(nOwnedExtra) {
  return DISTRICT_REQUIREMENTS[Math.min(nOwnedExtra, DISTRICT_REQUIREMENTS.length - 1)];
}

const DISTRICT_NAMES = {
  '2,2': 'Old Town', '1,2': 'West Ward', '3,2': 'East Ward', '2,1': 'North Ward', '2,3': 'South Ward',
  '1,1': 'Wolfgate Ward', '3,1': 'Rivergate Ward', '1,3': 'Orchard Ward', '3,3': 'Harvest Ward',
  /* outer cardinal "gamemode" wards reaching down the kingsroad arms */
  '2,0': 'Riftgate Ward', '0,2': 'Spirewatch Ward', '2,4': 'Doomgate Ward', '4,2': 'Sunken Ward',
};

/* FIXED purchase order — each ward is adjacent to the previous union.
   The four gamemode wards come LAST, in the order portal -> spire -> tower -> ??? */
const DISTRICT_ORDER = ['1,2', '3,2', '2,1', '2,3', '1,1', '3,1', '1,3', '3,3', '2,0', '0,2', '2,4', '4,2'];

/* ---- GAMEMODE GATES ----
   Each gamemode lives at the FAR (outer) edge of its own cardinal ward.
   Buying that ward (a normal land deed, last in the purchase order) is what
   unlocks the gamemode — permanently, even after the ward resets on Ascension.
   The fourth ward (Sunken) is a sealed placeholder for a realm not yet built. */
const MODE_GATES = [
  { id: 'portal',  name: 'The Rift Portal',   sprite: 'portal', open: 'openPortal', gateId: 'portal-gate', tile: [80, 3],   wardKey: '2,0' },
  { id: 'spire',   name: 'The Silver Spire',  sprite: 'spire',  open: 'openSpire',  gateId: 'spire-gate',  tile: [3, 60],   wardKey: '0,2' },
  { id: 'tower',   name: 'The Tower of Doom', sprite: 'tower',  open: 'openTower',  gateId: 'tower-gate',  tile: [80, 116], wardKey: '2,4' },
  { id: 'mystery', name: 'The Sealed Gate',   sprite: null,     open: null,         gateId: null,          tile: [155, 60], wardKey: '4,2' },
];
const MODE_BY_ID = {};
const MODE_BY_WARD = {};
for (const m of MODE_GATES) { MODE_BY_ID[m.id] = m; MODE_BY_WARD[m.wardKey] = m; }

/* the four outer cardinal wards, in purchase order — each gates one ward unit */
const OUTER_WARD_KEYS = MODE_GATES.map(m => m.wardKey);

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
  /* Riftgate (2,0): 64..95 x 0..23 */
  riftbeacon: [72, 10], riftapothecary: [88, 10], voidmarket: [68, 18], echoarsenal: [92, 18], reliquarypress: [84, 21],
  /* Spirewatch (0,2): 0..31 x 48..71 */
  skyhookyard: [12, 54], wayhouse: [24, 54], crownarchive: [18, 49], cloudfoundry: [12, 66], dawnprism: [24, 66],
  /* Doomgate (2,4): 64..95 x 96..119 */
  doomforge: [72, 102], beatfoundry: [88, 102], nightmetronome: [82, 107], reapercloister: [70, 112], bloodtreasury: [90, 112],
  /* Sunken (4,2): 128..159 x 48..71 */
  tidebreaker: [145, 54], pearlexchange: [156, 54], leviathannest: [132, 64], abyssalvault: [144, 66], moonpool: [154, 66],
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
  observatory: 'crystal', worldtree: 'crystal', riftbeacon: 'crystal', riftapothecary: 'crystal',
  reliquarypress: 'crystal', skyhookyard: 'crystal', cloudfoundry: 'crystal', dawnprism: 'crystal',
  crownarchive: 'crystal', nightmetronome: 'crystal', abyssalvault: 'crystal', moonpool: 'crystal',
  library: 'garden', temple: 'garden', monastery: 'garden', cathedral: 'garden', shrine: 'garden',
  wayhouse: 'garden', reapercloister: 'garden',
  beekeeper: 'hives',
  keep: 'banner', barracks: 'banner', armory: 'banner', warcollege: 'banner', wonder: 'banner',
  echoarsenal: 'banner', doomforge: 'banner', beatfoundry: 'banner', bloodtreasury: 'banner',
  leviathannest: 'crystal',
  tidebreaker: 'crates', voidmarket: 'crates', pearlexchange: 'crates',
  /* everything else (trade & industry) defaults to crates */
};
const SAT_OFFSETS = [[-2, 0], [2, 0], [0, 2], [-2, 2], [2, 2], [-1, -2], [2, -2], [-3, 1]];
function satTierFor(count) { return Math.min(5, Math.floor(count / 100)); }

/* ---- cosmetic city props ----
   Lifetime buildings bought / 100 = how many extra decorative props
   (wells, stalls, carts, cottages…) sprinkle into each owned district.
   Purely visual — caps so the city stays lively, not cluttered. */
function propTierFor(totalBought) { return Math.min(28, Math.floor((totalBought || 0) / 100)); }
const CITY_PROPS = ['cottage', 'cottage', 'well', 'stall', 'cart', 'barrels', 'planter', 'haystack', 'crates', 'brazier'];

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

const ZONE_HP_GROWTH = 1.62;    // monster HP multiplier per zone
const ZONE_GOLD_GROWTH = 1.14;  // main-zone bounty growth after the opening zones
const MODE_GOLD_GROWTH = 1.35;  // Portal/Tower rewards keep a healthier independent curve
const BOSS_HP_MULT = 12;
const BOSS_GOLD_MULT = 5;
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
  const earlyRewardZones = Math.min(zone - 1, 4);
  const lateRewardZones = Math.max(0, zone - 5);
  const gold = 6 * Math.pow(1.5, earlyRewardZones) * Math.pow(ZONE_GOLD_GROWTH, lateRewardZones) *
    (isBoss ? BOSS_GOLD_MULT : 1);
  return { sprite: type.sprite, name: type.name + (isBoss ? ' [BOSS]' : ''), hp: Math.ceil(hp), gold, isBoss };
}

/* ---------------- ASCENSION: THE AGES TREE ----------------
   Crown Sigils: floor((lifetime gold / SIGIL_BASE) ^ SIGIL_EXP),
   cumulative. Much slower than the old sqrt — Sigils stay rare
   and precious deep into the lategame.
   The tree spans 6 ERAS. Era gates require a number of owned
   nodes (needNodes) + sigils, and upgrade the kingsroads on the
   map. Everything can eventually be bought out.                */
const SIGIL_BASE = 1e8;
const SIGIL_EXP = 0.24;

function sigilsFromLifetime(lifetimeGold) {
  return Math.floor(Math.pow(Math.max(0, lifetimeGold) / SIGIL_BASE, SIGIL_EXP));
}

const ERA_NAMES = ['Age of Wood', 'Age of Stone', 'Age of Iron', 'Age of Gold', 'Age of Storms', 'Age of Aether'];

/* ---- THE AGES TREE: solar-system layout ----
   Center = The Crown. EIGHT branches radiate outward; eras are
   concentric rings. Era gates sit ON the ring and act as starter
   nodes: every branch of that era chains from the gate.
   Nodes may carry side: -1|1 — they hang off the spine at a
   perpendicular offset (sub-branches).                           */
const TREE_BRANCHES = {
  war:    { name: 'War',        angle: -90 },
  pros:   { name: 'Prosperity', angle: -90 + 45 },
  for:    { name: 'Fortune',    angle: -90 + 2 * 45 },
  mys:    { name: 'Mysticism',  angle: -90 + 3 * 45 },
  ind:    { name: 'Industry',   angle: -90 + 4 * 45 },
  crown:  { name: 'Sovereignty', angle: -90 + 5 * 45 },
  spirit: { name: 'Spirit',     angle: -90 + 6 * 45 },
  auto:   { name: 'Automation', angle: -90 + 7 * 45 },
};
const ERA_RING_R = [0, 560, 1080, 1600, 2120, 2640];      // gate ring radius (era 2..6)
const ERA_NODE_R0 = [190, 690, 1210, 1730, 2250, 2770];   // first node radius per era
const TREE_NODE_STEP = 150;
const TREE_SIDE_OFF = 215;   // side nodes: perpendicular offset from the spine
const TREE_SIDE_OUT = 70;    // ...plus a small outward push (diagonal hang)

/* node costs per era per step — the incline gets BRUTAL in the
   outer rings, because Sigil masters scale off every one earned */
const ERA_NODE_COST = [
  [1, 3, 7],
  [20, 35, 60],
  [250, 450, 800],
  [4000, 7000, 12000],
  [75000, 130000, 220000],
  [1500000, 2500000, 4000000],
];
const ERA_GATE_COST = [0, 30, 400, 6000, 100000, 2000000];
const ERA_GATE_NEED = [0, 14, 36, 64, 94, 125];

/* node helper: n(id, era, branch, step, name, desc, opts)
   opts.req  — explicit requirement: a node id, or an ARRAY (needs all)
   opts.side — -1|1: hang off the spine as a sub-branch node
   opts.cost — explicit Sigil cost (default: ERA_NODE_COST by step)
   Side nodes never become the chain tail — the spine continues
   from the last non-side node.                                   */
const PRESTIGE_TREE = (() => {
  const T = [];
  let last = null; // tail of the current spine chain
  const n = (id, era, branch, step, name, desc, opts) => {
    opts = opts || {};
    const requires = opts.req !== undefined ? opts.req
      : step === 0 ? (era === 1 ? null : 'era' + era)
      : last;
    const cost = opts.cost !== undefined ? opts.cost
      : ERA_NODE_COST[era - 1][Math.min(step, 2)];
    const node = { id, era, branch, step, name, cost, requires, desc };
    if (opts.side) node.side = opts.side;
    T.push(node);
    if (!opts.side) last = id;
  };
  const gate = (id, era, name, desc) => {
    T.push({ id, era, branch: 'gate', gate: true, needNodes: ERA_GATE_NEED[era - 1], cost: ERA_GATE_COST[era - 1], requires: era === 2 ? null : 'era' + (era - 1), name, desc: desc + ' (Requires ' + ERA_GATE_NEED[era - 1] + ' nodes owned)' });
  };

  /* ===== ERA 1 — AGE OF WOOD ===== */
  n('war1', 1, 'war', 0, 'Sharp Blades', 'Click damage x2.');
  n('war2', 1, 'war', 1, 'Veteran Mages', 'Mage damage +50%.');
  n('war3', 1, 'war', 2, 'Siege Doctrine', 'Ballista & Wall damage +50%.');
  n('xwar1', 1, 'war', 2, 'Hunting Parties', 'Archers deal +2% damage per Zone reached this run.', { req: 'war3', side: 1 });
  n('pros1', 1, 'pros', 0, 'Royal Treasury', 'Start each run with 500 Gold, 25 Wood and 25 Stone. (Granted immediately when bought!)');
  n('pros2', 1, 'pros', 1, 'Trade Routes', 'Buildings produce +25% Gold.');
  n('pros3', 1, 'pros', 2, 'Tax Reform', 'All building costs -10%.');
  n('xpros1', 1, 'pros', 2, 'Market Day', 'Taverns & Markets produce DOUBLE Gold.', { req: 'pros3', side: 1 });
  n('for1', 1, 'for', 0, 'Keen Eyes', 'Item drop chance +20%.');
  n('for2', 1, 'for', 1, 'Treasure Maps', 'Chests spawn 25% more often and stay 2s longer.');
  n('for3', 1, 'for', 2, 'Collector', 'ALL item values +10%.');
  n('xfor1', 1, 'for', 2, 'Giantslayer Purse', 'Gold from BOSSES +50%.', { req: 'for3', side: 1 });
  n('mys1', 1, 'mys', 0, 'Mana Font', 'Mana production +50%.');
  n('mys2', 1, 'mys', 1, 'Arcane Library', 'Arcane Skills cost 50% less Mana.');
  n('mysn1', 1, 'mys', 2, 'Rune Wards', 'Mana production +50%.');
  n('xmys1', 1, 'mys', 2, 'Moonlit Font', 'Mana production +50% at NIGHT.', { req: 'mysn1', side: 1 });
  n('ind1', 1, 'ind', 0, 'Royal Charter', 'Start each run with 5 Farms, 2 Lumber Mills and 2 Quarries. (Granted immediately when bought!)');
  n('ind2', 1, 'ind', 1, 'Sturdy Axes', 'Wood production +25%.');
  n('ind3', 1, 'ind', 2, 'Deep Veins', 'Stone production +25%.');
  n('xind1', 1, 'ind', 2, 'Stockpiles', 'Start each run with 250 Wood and 250 Stone. (Granted immediately when bought!)', { req: 'ind3', side: 1 });
  n('crown1', 1, 'crown', 0, 'Royal Ledger', '+2% ALL gold per Ascension performed.');
  n('crown2', 1, 'crown', 1, 'Sigil Tithe', '+0.5% ALL production & bounties per UNSPENT Crown Sigil (cap +100%).');
  n('crown3', 1, 'crown', 2, 'Crown Authority', '+15% ALL gold per Era gate owned.');
  n('xcrown1', 1, 'crown', 2, 'Royal Census', '+2% ALL gold per District owned.', { req: 'crown3', side: 1 });
  n('spirit1', 1, 'spirit', 0, 'Spirit Hands', 'Ghostly hands click the enemy 2 times per second.');
  n('spirit2', 1, 'spirit', 1, 'Nimble Spirits', 'Spirit Hands click +1 more time per second.');
  n('spirit3', 1, 'spirit', 2, 'Spirit Focus', 'Spirit clicks deal +50% damage.');
  n('xspirit1', 1, 'spirit', 2, 'Helpful Haunts', 'Spirit clicks deal +1% damage per Advancement node owned.', { req: 'spirit3', side: 1 });
  n('auto1', 1, 'auto', 0, 'Buying Ledgers', '🔓 the x10 buy amount.');
  n('auto2', 1, 'auto', 1, 'Procurement Office', '🔓 the x100, N10, N100 and MAX buy amounts.');
  n('auto3', 1, 'auto', 2, 'Steward of Works', '🔓 the 💰 BUY ALL UPGRADES buttons (units, buildings & the Royal Works).');

  /* ===== GATE + ERA 2 — AGE OF STONE ===== */
  gate('era2', 2, 'Age of Stone', '+25% ALL gold. The kingsroads are gravelled. Every Age of Stone branch starts here.');
  n('war4', 2, 'war', 0, 'Crossbows', 'Archer damage x2.');
  n('xwar2', 2, 'war', 0, 'Quartermasters', '+1% ALL unit damage per military building (Barracks, Armory, War College, Siege Workshop).', { req: 'war4', side: 1 });
  n('war5', 2, 'war', 1, 'Steel Plate', 'Click damage x2.');
  n('xtow1', 2, 'war', 1, 'Tower Plunder', 'TOWER OF DOOM: floor rewards are DOUBLED (Gold, Wood & Stone).', { req: 'war5', side: -1 });
  n('war6', 2, 'war', 2, 'Drill Sergeants', 'ALL unit damage +25%.', { req: ['war5', 'xwar2'] });
  n('xwar10', 2, 'war', 1, 'Knightly Orders', 'Royal Knight damage x2.', { req: 'war5', side: 1 });
  n('pros4', 2, 'pros', 0, 'Stone Granaries', 'Buildings produce +30% Gold.');
  n('xpros2', 2, 'pros', 0, 'Caravanserai', 'Markets, Fish Markets, Harbors & Trade Ports produce +75% Gold.', { req: 'pros4', side: 1 });
  n('xpros7', 2, 'pros', 1, 'Golden Touch', 'Your clicks PLUNDER: each click loots gold worth 2% of damage dealt, at the monster\'s bounty rate.', { req: 'xpros2', side: 1 });
  n('pros5', 2, 'pros', 1, 'Royal Highways', '+20% ALL gold. Trade moves faster on good roads.');
  n('pros6', 2, 'pros', 2, 'Guild Charters', 'All building costs another -10%.', { req: ['pros5', 'xpros2'] });
  n('for4', 2, 'for', 0, 'Quality Smithing', '25% of item drops come one tier higher.');
  n('xfor2', 2, 'for', 0, 'Treasure Hunters', 'Chests pay DOUBLE Gold & resources, and chest items skew a tier higher far more often.', { req: 'for4', side: 1 });
  n('xfor7', 2, 'for', 1, 'Pity of the Gods', '30 kills without loot GUARANTEES the next kill drops an item.', { req: 'xfor2', side: 1 });
  n('for5', 2, 'for', 1, "Magpie's Instinct", 'Item drop chance +30%.');
  n('xrift1', 2, 'for', 1, 'Riftward Banners', 'RIFT PORTAL: your units fight with +20% HP & damage.', { req: 'for5', side: -1 });
  n('for6', 2, 'for', 2, 'Boss Trophies', 'Bosses drop items twice as often.', { req: ['for5', 'xfor2'] });
  n('mys4', 2, 'mys', 0, 'Mana Springs', 'Mana production +50%.');
  n('xmys2', 2, 'mys', 0, 'Starfall Hours', 'Mages deal +50% damage at NIGHT.', { req: 'mys4', side: 1 });
  n('mys5', 2, 'mys', 1, 'Eternal Flame', 'Mage damage x2.');
  n('mys6', 2, 'mys', 2, 'Astral Clock', 'Day gold bonus AND night drop bonus +50% stronger.', { req: ['mys5', 'xmys2'] });
  n('ind4', 2, 'ind', 0, 'Runed Quarries', 'Wood & Stone production +50%.');
  n('xind2', 2, 'ind', 0, 'Night Shifts', 'ALL production +20% at NIGHT.', { req: 'ind4', side: 1 });
  n('ind5', 2, 'ind', 1, "Sawyers' Guild", 'Wood production +50%.');
  n('ind6', 2, 'ind', 2, "Masons' Guild", 'Stone production +50%.', { req: ['ind5', 'xind2'] });
  n('crown4', 2, 'crown', 0, 'Banking Houses', 'MASTER: +1% ALL production & bounties per Crown Sigil ever earned.');
  n('xcrown2', 2, 'crown', 0, 'Jubilees', '+10% ALL production per Era gate owned.', { req: 'crown4', side: 1 });
  n('crown5', 2, 'crown', 1, 'Pending Glory', '+3% ALL gold per PENDING Sigil (cap +150%).');
  n('crown6', 2, 'crown', 2, 'Sigil Polish', 'Per-Sigil MASTER bonuses are 25% stronger.', { req: ['crown5', 'xcrown2'] });
  n('spirit4', 2, 'spirit', 0, 'Poltergeist Pack', 'Spirit Hands click +2 more times per second.');
  n('xspirit2', 2, 'spirit', 0, 'Cold Spots', 'The haunting unnerves your foes: monsters spawn with -10% HP.', { req: 'spirit4', side: 1 });
  n('spirit5', 2, 'spirit', 1, 'Spectral Edge', 'Spirit clicks can CRIT.');
  n('xspire1', 2, 'spirit', 1, 'Featherweight', 'SILVER SPIRE: spirits lighten your step — launch power +10%.', { req: 'spirit5', side: -1 });
  n('spirit6', 2, 'spirit', 2, 'Ghostly Discipline', 'Spirit clicks deal another +50% damage.', { req: ['spirit5', 'xspirit2'] });
  n('auto4', 2, 'auto', 0, 'Bellows Engines', '🔓 the FORGE ALL button in the bag.');
  n('auton1', 2, 'auto', 0, 'Quiet Hunt', 'AUTOMATION SETTING: hide routine item-drop notifications.', { req: 'auto4', side: 1 });
  n('auto5', 2, 'auto', 1, 'Rift Standing Orders', '🔓 the Rift Portal\'s ♻ AUTO MODE.');
  n('auton2', 2, 'auto', 1, 'Silent Couriers', 'AUTOMATION SETTING: hide treasure-chest notifications.', { req: 'auto5', side: 1 });
  n('auto6', 2, 'auto', 2, 'Punctual Couriers', 'Treasure chests are delivered TWICE as often.');
  n('auton3', 2, 'auto', 2, 'Workshop Ledgers', 'AUTOMATION SETTING: hide items and Portal supplies created by buildings.', { req: 'auto6', side: 1 });

  /* ===== GATE + ERA 3 — AGE OF IRON ===== */
  gate('era3', 3, 'Age of Iron', '+50% ALL gold. The kingsroads are cobbled. Every Age of Iron branch starts here.');
  n('war7', 3, 'war', 0, 'Cannons', 'Ballista damage x2.');
  n('war8', 3, 'war', 1, 'Holy Crusade', 'Cleric damage x2.');
  n('xtow2', 3, 'war', 1, 'Steel Tempo', 'TOWER OF DOOM: misses cost only 8% of the Hero\'s HP (instead of 12%).', { req: 'xtow1', side: -1 });
  n('xwar3', 3, 'war', 1, 'Iron Resolve', 'Hero crit chance +5% (absolute).', { req: 'war8', side: 1 });
  n('xwar7', 3, 'war', 2, 'Overkill', 'Damage beyond a monster\'s last breath CARRIES OVER to the next one.', { req: 'xwar3', side: 1 });
  n('war9', 3, 'war', 2, 'Heroic Saga', "The Hero's leadership aura is 50% stronger.");
  n('xwar14', 3, 'war', 2, 'Commanding Presence', 'Raises the Hero aura soft cap from +150% to +250%; gains beyond it have diminishing returns.', { req: 'war9', side: -1 });
  n('xwar11', 3, 'war', 0, 'Stormhost', 'Storm Valkyrie damage x2.', { req: 'war7', side: 1 });
  n('prosi1', 3, 'pros', 0, 'Caravan Network', '+30% ALL gold.');
  n('pros8', 3, 'pros', 1, 'Trade Empire', '+40% ALL gold.');
  n('xpros3', 3, 'pros', 1, 'War Profiteers', 'Gold per kill +0.5% per Zone reached this run.', { req: 'pros8', side: 1 });
  n('prosi2', 3, 'pros', 2, 'Royal Monopoly', 'All building costs another -10%.');
  n('for7', 3, 'for', 0, 'Mystic Forging', 'Item drops have a 50% chance to roll a random AFFIX (second effect at half value).');
  n('for8', 3, 'for', 1, 'Star Metal', 'ALL item values +25%.');
  n('xrift2', 3, 'for', 1, 'Rift Plunder', 'RIFT PORTAL: victories pay +50% Gold and item drop chance +25%.', { req: 'xrift1', side: -1 });
  n('xfor3', 3, 'for', 1, 'Trophy Cases', 'BOSSES always drop an item.', { req: 'for8', side: 1 });
  n('for9', 3, 'for', 2, 'Master Smith', '50% of item drops come one tier higher.');
  n('mys7', 3, 'mys', 0, 'Leyline Network', 'Mana production x2.');
  n('mys8', 3, 'mys', 1, 'Storm Callers', 'Mage damage x2.');
  n('xmys3', 3, 'mys', 1, 'Attuned Walls', 'Mana production +1% per Wall level.', { req: 'mys8', side: 1 });
  n('xmys7', 3, 'mys', 2, 'Witching Hour', 'Every DAWN grants a surge of Mana worth 120s of production.', { req: 'xmys3', side: 1 });
  n('mys9', 3, 'mys', 2, 'Lunar Covenant', 'Night item-drop bonus doubled AND Mana production +25%.');
  n('xmys10', 3, 'mys', 0, 'Plague Covens', 'Plague Alchemist damage x2.', { req: 'mys7', side: 1 });
  n('ind7', 3, 'ind', 0, 'Industrial Mills', 'ALL production +25% (Gold, Wood, Stone, Mana).');
  n('ind8', 3, 'ind', 1, 'Conveyor Carts', 'Wood & Stone production +50%.');
  n('xind3', 3, 'ind', 1, 'Mule Trains', 'Wood & Stone production +5% per District owned.', { req: 'ind8', side: 1 });
  n('ind9', 3, 'ind', 2, 'Land Surveys', 'District land deeds cost -25%.');
  n('crown7', 3, 'crown', 0, 'Golden Age', 'MASTER: another +1% ALL production & bounties per Sigil ever earned.');
  n('crown8', 3, 'crown', 1, 'Twin Tithes', 'Sigil Tithe & Pending Glory caps are DOUBLED.');
  n('xcrown3', 3, 'crown', 1, 'Tribute Fleets', 'Item drop chance +2% per PENDING Sigil (cap +60%).', { req: 'crown8', side: 1 });
  n('crown9', 3, 'crown', 2, 'Spent Splendor', '+0.2% ALL production & bounties per Sigil SPENT on this tree.');
  n('spirit7', 3, 'spirit', 0, 'Spirit Legion', 'Spirit Hands click +3 more times per second.');
  n('spirit8', 3, 'spirit', 1, 'Haunting Echoes', 'Spirit clicks deal +100% damage.');
  n('xspire2', 3, 'spirit', 1, 'Angelic Waystones', 'SILVER SPIRE: a waystone every 50m — long falls return you to the last waystone you passed.', { req: 'xspire1', side: -1 });
  n('xspirit3', 3, 'spirit', 1, 'Soul Tithe', 'Every spirit click also gathers 0.5 Mana.', { req: 'spirit8', side: 1 });
  n('xspirit7', 3, 'spirit', 2, 'Grave Robbers', 'Spirits LOOT any treasure chest you let slip away — chests never vanish unclaimed.', { req: 'xspirit3', side: 1 });
  n('spirit9', 3, 'spirit', 2, 'Restless Night', 'Spirit Hands click 25% faster at night.');
  n('auto7', 3, 'auto', 0, 'Counting Engines', 'Offline progress runs at 75% rate (instead of 50%).');
  n('auto8', 3, 'auto', 1, 'Tireless Scribes', 'Offline progress is counted for up to 16 hours (instead of 8).');
  n('auto9', 3, 'auto', 2, 'Animated Armory', 'TOGGLE: automatically equips the best loadout, prioritizing more affixes and then higher tiers.');

  /* ===== GATE + ERA 4 — AGE OF GOLD ===== */
  gate('era4', 4, 'Age of Gold', '+75% ALL gold. The kingsroads are paved in marble. Every Age of Gold branch starts here.');
  n('warg1', 4, 'war', 0, 'Gilded Arms', 'ALL unit damage +50%.');
  n('xwar4', 4, 'war', 0, 'Gilded Armory', '+1% ALL unit damage per item in your bag (cap +100%).', { req: 'warg1', side: 1 });
  n('xwar8', 4, 'war', 1, 'Momentum', 'Each kill grants +2% ALL unit damage for 10s. Stacks up to 25 times.', { req: 'xwar4', side: 1 });
  n('warg2', 4, 'war', 1, 'Golden Legions', 'Archer & Ballista damage x2.');
  n('xtow3', 4, 'war', 1, 'Resonant Blade', 'TOWER OF DOOM: every floor drops an item, and PERFECT hits deal x5 damage.', { req: 'xtow2', side: -1 });
  n('xreap1', 4, 'war', 1, 'Legion of Doom', 'WARD UNIT: Doomforged Reaper damage x2.', { req: 'xtow3', side: -1 });
  n('xtow4', 4, 'war', 1, 'Doomworks', 'DOOMGATE BUILDINGS: Tower timing, reward and Reaper bonuses are 50% stronger.', { req: 'xreap1', side: -1 });
  n('warg3', 4, 'war', 2, 'Champion of Gold', 'Click damage x2.', { req: ['warg2', 'xwar4'] });
  n('xwar12', 4, 'war', 2, 'Cavalier Banners', 'Knight & Valkyrie damage +75%.', { req: 'warg2', side: 1 });
  n('prosg1', 4, 'pros', 0, 'Gold Standard', 'ALL gold x1.5.');
  n('xpros4', 4, 'pros', 0, 'Counting Houses', '+3% ALL gold per Royal Mint & Royal Bank owned (cap +150%).', { req: 'prosg1', side: 1 });
  n('xpros8', 4, 'pros', 1, 'Compound Interest', 'Your treasury earns 0.5% INTEREST per second — up to your city\'s gold production rate.', { req: 'xpros4', side: 1 });
  n('prosg2', 4, 'pros', 1, "World's Fair", 'ALL production +25%.');
  n('prosg3', 4, 'pros', 2, 'Royal Bounties', 'Gold per kill +50%.', { req: ['prosg2', 'xpros4'] });
  n('forg1', 4, 'for', 0, 'Gilded Loot', 'ALL item values +30%.');
  n('xfor4', 4, 'for', 0, 'Hoard Sense', 'Item drop chance +10% per Era gate owned.', { req: 'forg1', side: 1 });
  n('xfor8', 4, 'for', 1, 'Jackpot Chests', 'Chests have a 10% chance to be JACKPOTS: x10 Gold & resources, items +2 tiers.', { req: 'xfor4', side: 1 });
  n('forg2', 4, 'for', 1, 'Affix Fusion', 'FORGE 🔓: fuse two same-tier items with DIFFERENT affixes into one item carrying BOTH.');
  n('xfor9', 4, 'for', 1, 'Overflowing Fortune', 'Raises normal and boss item-drop soft caps by 10 percentage points; overflow chance has diminishing returns.', { req: 'forg2', side: 1 });
  n('xrift3', 4, 'for', 1, 'Cartomancer', 'RIFT PORTAL: the Rift\'s bargains offer FOUR cards to choose from (instead of three).', { req: 'xrift2', side: -1 });
  n('xreav1', 4, 'for', 1, 'Riftborn Legion', 'WARD UNIT: Rift Reaver damage x2.', { req: 'xrift3', side: -1 });
  n('forg3', 4, 'for', 2, 'Deep Pockets', 'Item drop chance +40%.', { req: ['forg2', 'xfor4'] });
  n('mysg1', 4, 'mys', 0, 'Gold-Threaded Robes', 'Mana production x2.');
  n('xmys4', 4, 'mys', 0, 'Scholarly Circle', 'Mana production +3% per Arcane Skill learned.', { req: 'mysg1', side: 1 });
  n('mysg2', 4, 'mys', 1, 'Sun Sigils', 'Day gold bonus another +100% stronger.');
  n('mysg3', 4, 'mys', 2, 'Arcane Bazaar', 'Arcane Skills cost another 50% less Mana.', { req: ['mysg2', 'xmys4'] });
  n('xmys11', 4, 'mys', 1, 'Alchemy of War', 'Plague Alchemist damage x2.', { req: 'mysg2', side: 1 });
  n('xlev1', 4, 'mys', 1, 'Pact of the Deep', 'WARD UNIT: Drowned Leviathan damage x2.', { req: 'xmys11', side: 1 });
  n('indg1', 4, 'ind', 0, 'Golden Mills', 'Wood & Stone production +75%.');
  n('xind4', 4, 'ind', 0, 'Boomtowns', 'Each building\'s satellite growth tier grants it +10% production.', { req: 'indg1', side: 1 });
  n('xind7', 4, 'ind', 1, 'Blueprints', 'City planning perfected: building costs grow x1.14 per owned instead of x1.15.', { req: 'xind4', side: 1 });
  n('indg2', 4, 'ind', 1, 'Gilded Lumber', 'Wood production x2.');
  n('indg3', 4, 'ind', 2, 'Marble Quarries', 'Stone production x2.', { req: ['indg2', 'xind4'] });
  n('crown10', 4, 'crown', 0, 'Golden Aeon', 'MASTER: another +2% ALL production & bounties per Sigil ever earned.');
  n('xcrown4', 4, 'crown', 0, "Regent's Writ", 'Every run starts at ZONE 5 (applies from your next Ascension).', { req: 'crown10', side: 1 });
  n('crown11', 4, 'crown', 1, 'Imperial Decree', 'Era-gate gold bonuses are DOUBLED.');
  n('crown12', 4, 'crown', 2, 'Dynasty', 'Another +5% ALL gold per Ascension performed.', { req: ['crown11', 'xcrown4'] });
  n('spiritg1', 4, 'spirit', 0, 'Wraith Captains', 'Spirit Hands click +4 more times per second.');
  n('xspirit4', 4, 'spirit', 0, 'Twin Hauntings', 'Spirit clicks have a 15% chance to strike TWICE.', { req: 'spiritg1', side: 1 });
  n('spiritg2', 4, 'spirit', 1, 'Golden Geists', 'Spirit clicks deal +150% damage.');
  n('xspire3', 4, 'spirit', 1, 'Zephyr Crown', 'SILVER SPIRE: launch power another +10%.', { req: 'xspire2', side: -1 });
  n('xser1', 4, 'spirit', 1, 'Seraphic Host', 'WARD UNIT: Skyward Seraph damage x2.', { req: 'xspire3', side: -1 });
  n('spiritg3', 4, 'spirit', 2, 'Soul Harvest', 'Spirit CRITS deal x5 damage (instead of x3).', { req: ['spiritg2', 'xspirit4'] });
  n('auto10', 4, 'auto', 0, 'Court of Cogs', 'MAX buying handles up to 5,000 at once (instead of 1,000).');
  n('auto11', 4, 'auto', 1, 'Standing Reserves', 'RIFT PORTAL: a defeat auto-revives your team with Phoenix Feathers, if you carry them.');
  n('auto12', 4, 'auto', 2, 'Brass Foremen', 'Mechanized labor: ALL production +15%.');

  /* ===== GATE + ERA 5 — AGE OF STORMS ===== */
  gate('era5', 5, 'Age of Storms', '+100% ALL gold. Lightning dances along the kingsroads. Every Age of Storms branch starts here.');
  n('wars1', 5, 'war', 0, 'Storm Blades', 'ALL unit damage +50%.');
  n('wars2', 5, 'war', 1, 'Thunder Choir', 'Cleric & Golem damage x2.');
  n('xwar5', 5, 'war', 1, 'Thunderhead', 'ALL unit damage +30% at NIGHT.', { req: 'wars2', side: 1 });
  n('xwar9', 5, 'war', 2, 'Executioner', 'Non-boss monsters below 15% HP are slain OUTRIGHT.', { req: 'xwar5', side: 1 });
  n('wars3', 5, 'war', 2, 'Eye of the Storm', 'Crit chance +10% (absolute) and crits deal x4 damage.');
  n('pross1', 5, 'pros', 0, 'Storm Markets', 'ALL gold x1.5.');
  n('pross2', 5, 'pros', 1, 'Philosopher Kings', 'All building costs another -15%.');
  n('xpros5', 5, 'pros', 1, 'Storm Levies', 'Gold per kill +2% per Wall level.', { req: 'pross2', side: 1 });
  n('pross3', 5, 'pros', 2, 'Tempest Trade', 'ALL production +30%.');
  n('fors1', 5, 'for', 0, 'Storm Salvage', '20% of item drops come TWO tiers higher.');
  n('fors2', 5, 'for', 1, 'Twin Drops', 'Item drops have a 25% chance to be doubled.');
  n('xrift4', 5, 'for', 1, "Alchemist's Favor", 'RIFT PORTAL: potion drop chances from victories are DOUBLED.', { req: 'xrift3', side: -1 });
  n('xrift5', 5, 'for', 1, 'Rift Infrastructure', 'RIFTGATE BUILDINGS: Portal reward, supply-brewing and item-printing bonuses are 50% stronger.', { req: 'xrift4', side: -1 });
  n('xfor5', 5, 'for', 1, 'Lightning Luck', 'The night item-drop bonus is another +50% stronger.', { req: 'fors2', side: 1 });
  n('fors3', 5, 'for', 2, 'Tempered Affixes', 'Affixes carry FULL value (100%).');
  n('myss1', 5, 'mys', 0, 'Storm Mana', 'Mana production x2.');
  n('myss2', 5, 'mys', 1, 'Maelstrom', 'Mage damage x2.');
  n('xmys5', 5, 'mys', 1, 'Charged Air', 'Mana production +3% per Zone reached this run.', { req: 'myss2', side: 1 });
  n('xdeep1', 5, 'mys', 1, 'Abyssal Holdings', 'SUNKEN BUILDINGS: production from the sealed ward gains +5% per Ascension (cap +250%).', { req: 'xlev1', side: 1 });
  n('xmys8', 5, 'mys', 2, 'Long Dusk', 'The day\'s gold bonus LINGERS through the first 60s of every night.', { req: 'xmys5', side: 1 });
  n('myss3', 5, 'mys', 2, "Night's Embrace", 'Night bounty AND night drop bonuses +50% stronger.');
  n('inds1', 5, 'ind', 0, 'Storm Engines', 'ALL production +25%.');
  n('inds2', 5, 'ind', 1, 'Lightning Saws', 'Wood production x2.');
  n('xind5', 5, 'ind', 1, 'Automated Looms', 'ALL production +0.5% per building-upgrade level owned across the city.', { req: 'inds2', side: 1 });
  n('inds3', 5, 'ind', 2, 'Thunder Drills', 'Stone production x2.');
  n('crown13', 5, 'crown', 0, 'Eternal Throne', 'MASTER: another +3% ALL production & bounties per Sigil ever earned.');
  n('xward1', 5, 'crown', 0, 'Warden of the Wards', 'WARD UNITS: Reavers, Seraphs, Reapers & Leviathan each deal +15% damage per District owned.', { req: 'crown13', side: 1 });
  n('crown14', 5, 'crown', 1, 'Crown of Crowns', 'Per-Sigil MASTER bonuses another +50% stronger.');
  n('xcrown5', 5, 'crown', 1, 'Census of Storms', 'Sigils ever earned count +20% HIGHER for MASTER bonuses.', { req: 'crown14', side: 1 });
  n('crown15', 5, 'crown', 2, 'Auric Memory', 'Lifetime gold counts +25% higher for Sigil gain.');
  n('spirits1', 5, 'spirit', 0, 'Geist Storm', 'Spirit Hands click +6 more times per second.');
  n('spirits2', 5, 'spirit', 1, 'Spirit Avatar', 'Each spirit click also deals +0.05% of unit idle DPS. Borrowed damage is not multiplied by Spirit bonuses.');
  n('xspire4', 5, 'spirit', 1, 'Gilded Crown', 'SILVER SPIRE: the Crown\'s blessing becomes GOLD x3 (instead of x2).', { req: 'xspire3', side: -1 });
  n('xspire5', 5, 'spirit', 1, 'Spireworks', 'SPIREWATCH BUILDINGS: launch power, waystones and Seraph bonuses are 50% stronger.', { req: 'xspire4', side: -1 });
  n('xspirit5', 5, 'spirit', 1, 'Spirit Lanterns', 'Ghost-lights line the streets: +25% ALL gold at NIGHT.', { req: 'spirits2', side: 1 });
  n('spirits3', 5, 'spirit', 2, 'Deathless Vigil', 'Spirit crit chance +15% (absolute).');
  n('auto13', 5, 'auto', 0, 'The Brass Steward', 'TOGGLE: automatically buys BUILDING UPGRADES (cheapest first) every 5s.');
  n('auto14', 5, 'auto', 1, 'The Iron Quartermaster', 'TOGGLE: automatically buys UNIT UPGRADES (cheapest first) every 5s.');
  n('auto21', 5, 'auto', 1, 'The Clockwork Recruiter', 'TOGGLE: continuously buys the cheapest recruitable UNIT at up to 1 unit per second.', { req: 'auto14', side: -1 });
  n('auto15', 5, 'auto', 2, 'The Clockwork Architect', 'TOGGLE: automatically builds the cheapest BUILDINGS every 5s.');
  n('xauto1', 5, 'auto', 2, 'Fast Foremen', 'AUTO BUILD works continuously at up to 7.5 buildings per second.', { req: 'auto15', side: -1 });
  n('xauto2', 5, 'auto', 2, 'Instant Blueprints', 'AUTO BUILD works continuously at up to 50 buildings per second.', { req: 'xauto1', side: 1 });
  n('xauto3', 5, 'auto', 2, 'Muster Drums', 'AUTO RECRUIT works continuously at up to 10 units per second.', { req: 'auto21', side: -1 });

  /* ===== GATE + ERA 6 — AGE OF AETHER ===== */
  gate('era6', 6, 'Age of Aether', '+150% ALL gold. The kingsroads glow with aether. The final ring.');
  n('wara1', 6, 'war', 0, 'Aether Weapons', 'ALL unit damage x1.5.');
  n('xwar6', 6, 'war', 0, 'Pantheon of War', 'Final catch-up: most armies x10; Clerics, Valkyries, Dragon Riders and Ward units x100; Walls x1,000,000. Then ALL units gain +10% damage per unit type at level 100+.', { req: 'wara1', side: 1 });
  n('wara2', 6, 'war', 1, 'Dragon Lords', 'Dragon damage x2.');
  n('wara3', 6, 'war', 2, 'Avatar of War', 'Clicks deal +0.1% of your unit idle DPS (stacks with Meteor Brand).', { req: ['wara2', 'xwar6'] });
  n('xwar13', 6, 'war', 1, 'The New Legions', 'Knight, Plague & Valkyrie damage x2.', { req: 'wara2', side: 1 });
  n('xwar16', 6, 'war', 2, 'Concord of Wings', 'SKY LEGIONS: Academy, Druid, Observatory and Spireworks buildings gradually raise Dragon Rider damage up to x180 and Valkyrie damage up to x60.', { req: 'xwar13', side: 1 });
  n('prosa1', 6, 'pros', 0, 'Aether Economy', 'ALL gold x2.');
  n('xpros6', 6, 'pros', 0, 'Aether Bounties', 'Gold per kill x2.', { req: 'prosa1', side: 1 });
  n('prosa2', 6, 'pros', 1, 'Infinite Vaults', 'ALL gold x2.');
  n('prosa3', 6, 'pros', 2, 'Economy of Light', 'ALL building production x3.', { req: ['prosa2', 'xpros6'] });
  n('fora1', 6, 'for', 0, 'Master Forging', 'Affixes are GUARANTEED on every drop.');
  n('xfor6', 6, 'for', 0, 'Reliquary Straps', 'The HERO carries +1 item. (Granted immediately when bought!)', { req: 'fora1', side: 1 });
  n('fora2', 6, 'for', 1, 'Artificer God', 'ALL item values another +50%.');
  n('xfor10', 6, 'for', 1, 'Fortune Without End', 'Raises normal and boss item-drop soft caps by another 15 percentage points.', { req: 'xfor9', side: 1 });
  n('fora3', 6, 'for', 2, 'Aether Reliquary', 'ALL item drops come one tier higher (stacks with other tier-ups).', { req: ['fora2', 'xfor6'] });
  n('mysa1', 6, 'mys', 0, 'Aether Mind', 'Mana production x2.');
  n('xmys6', 6, 'mys', 0, 'Aether Tide', '+1% ALL gold per 1,000 Mana you currently hold (cap +100%).', { req: 'mysa1', side: 1 });
  n('mysa2', 6, 'mys', 1, 'Archmage Ascendant', 'Mage damage x2.');
  n('mysa3', 6, 'mys', 2, 'Mana Singularity', 'Mana production x3.', { req: ['mysa2', 'xmys6'] });
  n('inda1', 6, 'ind', 0, 'Aether Saws', 'Wood production x2.');
  n('xind6', 6, 'ind', 0, 'Wonder Engines', '+25% ALL production per Wonder of the Ages owned (cap +100%).', { req: 'inda1', side: 1 });
  n('xind8', 6, 'ind', 1, 'Genesis Engines', 'Buildings you own 100+ of produce DOUBLE.', { req: 'xind6', side: 1 });
  n('xind9', 6, 'ind', 2, 'Living Ramparts', 'WALLS: every military and masonry building joins the defense, gradually raising Wall damage up to x1,000.', { req: 'xind8', side: 1 });
  n('inda2', 6, 'ind', 1, 'Aether Drills', 'Stone production x2.');
  n('inda3', 6, 'ind', 2, 'World Engine', 'ALL production +25% AND building costs another -10%.', { req: ['inda2', 'xind6'] });
  n('crown16', 6, 'crown', 0, 'Apotheosis', 'MASTER: another +5% ALL production & bounties per Sigil ever earned.');
  n('xcrown6', 6, 'crown', 0, 'Throne of Ages', '+1% ALL production & bounties per Advancement node owned.', { req: 'crown16', side: 1 });
  n('xcrown7', 6, 'crown', 1, 'Coronation Largesse', 'Every Ascension grants +1 BONUS Sigil per Era gate owned.', { req: 'xcrown6', side: 1 });
  n('xward2', 6, 'crown', 1, 'Outer Works Mandate', 'OUTER-WARD building upgrade levels grant +0.25% ALL production & bounties each.', { req: 'xward1', side: -1 });
  n('xward3', 6, 'crown', 2, 'Fourfold Ward Covenant', 'WARD UNITS: each ward\'s buildings gradually raise its guardian toward x30 Reaver, x22 Seraph, x12 Reaper and x6 Leviathan damage.', { req: 'xward2', side: -1 });
  n('crown17', 6, 'crown', 1, 'The Crown Remembers', 'Carry 1% of your Gold through each Ascension.');
  n('crown18', 6, 'crown', 2, 'Sovereign of Ages', 'ALL production & bounties x2.', { req: ['crown17', 'xcrown6'] });
  n('spirita1', 6, 'spirit', 0, 'Legion Eternal', 'Spirit Hands click rate DOUBLED.');
  n('xspirit6', 6, 'spirit', 0, 'Eternal Procession', 'Spirit clicks deal +1% damage per Ascension performed (cap +100%).', { req: 'spirita1', side: 1 });
  n('spirita2', 6, 'spirit', 1, 'Spirit Sovereign', 'Spirit clicks deal +300% damage.');
  n('xwar15', 6, 'war', 1, 'Aura of the First King', 'Raises the Hero aura soft cap from +250% to +500%.', { req: 'xwar14', side: -1 });
  n('spirita3', 6, 'spirit', 2, 'One With the Ghosts', 'YOUR clicks gain all spirit damage bonuses.', { req: ['spirita2', 'xspirit6'] });
  n('auto16', 6, 'auto', 0, 'The Arcane Vizier', 'TOGGLE: automatically learns ARCANE SKILLS the moment you can afford them.');
  n('auto17', 6, 'auto', 1, 'The Phantom Smith', 'TOGGLE: automatically FORGES your whole bag every 10s.');
  n('auto19', 6, 'auto', 1, 'The Fusion Loom', 'TOGGLE: automatically FUSES compatible affixed items every 10s.', { req: 'auto17', side: 1 });
  n('auto18', 6, 'auto', 2, 'The other automatons work EVERY SECOND, AUTO BUILD reaches 100 buildings/s, Legion Foundry reaches 100 units/s, and ALL production +25%.');
  n('xauto4', 6, 'auto', 2, 'Legion Foundry', 'AUTO RECRUIT works continuously at up to 50 units per second, or 100 with the Grand Automaton.', { req: 'xauto3', side: -1 });
  n('auto20', 6, 'auto', 2, 'Crown Planner', 'ASCENSION: unlocks BUY ALL NODES, buying the cheapest available Advancement nodes first.', { req: 'auto18', side: 1 });

  return T;
})();
