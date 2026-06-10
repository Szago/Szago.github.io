# Aetherholm — Idle Kingdom

A pixel-art fantasy idle/clicker city builder. No build step, no dependencies —
open `index.html` in a browser and play.

## Layout

| Panel | What it is |
|---|---|
| **Left — City Defense** | The clicker. Click the monster; unit cards (Hero, Archers, Mages, Ballistae, Golem, Walls) open detail panels. |
| **Middle — The City** | Top-down pixel world of **5x5 districts** (100x80 tiles), **drag to pan, wheel to zoom**. You start owning Old Town (center); the 3x3 city block is purchasable land. Outer ring is wilderness: west forest, south farmland, east riverlands, north rocks. Click a building for its upgrade panel. Walls physically wrap the union of owned districts (palisade → stone → banner towers), with gates at the roads. |
| **Right — Royal Builder** | Tabs: BUILD (buy 18 buildings x1/x10) and BAG (inventory). Also hosts unit / building / land-deed panels. |

## City expansion

**47 buildings**, at least 5 per ward, each with exactly ONE plot on the map
(a count badge shows how many you own). Old Town holds the early game; each
further ward unlocks its building types — including higher resource tiers
(Sawmill / Timberworks / World Tree for Wood, Stonecutter / Deep Mine /
Crystal Mine for Stone) and lategame engines up to the 1-billion-gold
**Wonder of the Ages**. Wards are bought **in a fixed order** via the
**Land Office** (click a hatched ward — the next one shows its price on the
map). A deed requires Wall Lv.5, costs gold+wood+stone (x2.2 each), extends
the walls around the new ward, and grants **+5% ALL gold per district**.
9 districts total (3x3 endgame city). The shop's i button also opens each
building's upgrade panel.

## Ambient life & visuals

A separate animation layer (~12fps) adds: flowing/shimmering water, villagers
walking the kingsroads (more as the city grows), chimney smoke from the forges,
spinning windmill blades, your own units patrolling inside the walls, boats
drifting down the river, bird flocks crossing the sky, and cosmetic monsters
roaming the wilderness (they can't cross the walls).

**Density:** every 100 owned of a building (up to 500) it sprawls — satellite
structures appear beside it (wheat fields, log piles, crystals, crates,
gardens, banners...). Walls gain a 4th look at Lv.50 (pale stone, gold banners).
A **golden pennant** marks buildings with all upgrades maxed.

**Night:** the map darkens while windows light up in every building and
cottage, street lamps glow along the roads (drawn above the darkness), and
fireflies blink in the wilderness.

**Eras** restyle the city: roads (dirt -> gravel -> cobble -> aether),
cottages (thatch -> stone-footed -> brick two-story -> aether stone), torch
posts become iron lamps, and the plaza fountain grows a gilded statue.

## Hero aura & treasure

Items worn by the Hero also inspire the city: each grants 30% of its value as
bonus unit damage, resource income and item drop chance, and weakens enemy
spawns (up to -40% HP). Base item drop rate is 10% (25% from bosses, doubled
at night). Treasure chests spawn somewhere on the map every ~10s and vanish
after 5s — click them for randomized gold/resources/items.

## Day & night

8-minute cycle (5 day / 3 night), clock in the resource bar. **Day:** +25% gold
production & bounties. **Night:** monsters spawn with +50% HP but +50% bounty and
x2 item drops (x4 with the Lunar Covenant ascension node). The map darkens at night.

## Core loops

- **Combat:** 10 monsters per zone, the 10th is a boss (8x HP, 10x bounty).
  Each zone: monster HP x1.6, bounty x1.5. Unlosable — there is no player HP.
- **Economy:** Buildings produce Gold and the special resources **Wood / Stone / Mana**,
  which gate higher buildings *and* unit upgrades.
- **Units:** 8 of them — Hero (clicks), Archers (+2%/Wall level), Mages, Ballistae,
  **War Clerics** (unlock at Zone 12), War Golem, **Dragon Riders** (Zone 25), Walls.
  Each has a main upgrade + 2-3 sub-upgrades, 2-3 equipment slots; the Mages carry
  the 6 one-time skills.
- **Items:** monsters drop items (1.5%, bosses 12%). Combine 2 identical items to
  forge the next tier at x1.25 stats. Some items are unit-specific, some fit anyone.
  Items survive Ascension.
- **Building upgrades:** click a building on the map — upgrades cross-boost other
  systems (Golden Harvest boosts Farms *and* Markets, Masonry boosts Walls,
  Hero's Rest boosts click damage, Royal Decree boosts everything...).
- **Ascension (rebirth):** lifetime gold converts to **Crown Sigils**
  (`floor(sqrt(lifetime / 3e6))`, cumulative). Sigils buy permanent nodes in **THE
  AGES TREE**: 45 nodes across 4 eras (Wood / Stone / Iron / Aether) x 3 branches
  (Economy / War / Mysticism), ~1430 sigils to buy out completely. Era gates
  require owned-node counts, buff all gold, and **visibly upgrade the kingsroads**
  (dirt -> gravel -> cobblestone -> glowing aether). Era tech includes Crossbows,
  Cannons, Aether Weapons, Quality Smithing (+1 tier drops), **Mystic/Master
  Forging (items roll random AFFIXES** — a second effect, e.g. "Rusty Sword II of
  Luck"), Star Metal (+25% item values) and the Spirit Legion auto-clicker.
- **Menu (bottom bar):** full statistics screen + settings with save export/import
  (base64 code, copy or download) and wipe.

## Files

- `index.html` — static markup: three panels, menu overlay, ascension modal
- `css/style.css` — pixel fantasy UI theme
- `js/sprites.js` — programmatic pixel art (palette + row strings, rendered to canvas)
- `js/map.js` — terrain renderer: district biomes, union walls, houses, water list
- `js/ambient.js` — animation layer: water flow, villagers, smoke, roaming monsters
- `js/data.js` — **all content & balance**: buildings + their upgrades, units + subs,
  skills, items, district world (plots, biomes, costs), monsters, zones, prestige tree
- `js/game.js` — engine: state, derived stats, combat, items/equipment, districts,
  pan/zoom, day/night, panels, save

Saves to `localStorage` every 15s (offline progress: 50% production rate, 8h cap).
To expand the game, almost everything lives in `js/data.js` — add a building, item,
upgrade, monster type or prestige node there and the engine picks it up.
