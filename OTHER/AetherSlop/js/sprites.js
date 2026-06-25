/* ============================================================
   Aetherholm — sprites.js
   Programmatic pixel art. Each sprite is a palette + row strings.
   '.' or ' ' = transparent. Rows may have different lengths;
   the renderer treats missing cells as transparent.
   ============================================================ */

/* Raster sprites can coexist with the programmatic atlas. Display widths are
   keyed by the scale values already used by City Defense, Portal and Tower. */
const RASTER_SPRITES = {
  starmaiden: {
    src: 'assets/enemies/celestine-starblade-generated.png',
    display: { 4: 112, 6: 176, 9: 221 },
  },
  riftwitch: {
    src: 'assets/enemies/kurohana-rift-witch.png',
    display: { 4: 112, 6: 176, 9: 256 },
  },
  thornempress: {
    src: 'assets/enemies/morgathra-thorn-empress.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'riftwitch',
  },
  gravemoon: {
    src: 'assets/enemies/vespera-grave-moon.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'starmaiden',
  },
  velvetfang: {
    src: 'assets/enemies/nyxara-velvet-fang.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'riftwitch',
  },
  quickpurse: {
    src: 'assets/enemies/pipra-quickpurse.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'starmaiden',
  },
  velvetsin: {
    src: 'assets/enemies/seraphyne-velvet-sin.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'riftwitch',
  },
  severedhalo: {
    src: 'assets/enemies/elyssia-severed-halo.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'starmaiden',
  },
  brokencovenant: {
    src: 'assets/enemies/vaeloria-broken-covenant.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'severedhalo',
  },
  ninthsky: {
    src: 'assets/enemies/caelora-queen-ninth-sky.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'starmaiden',
  },
  jubilantooze: {
    src: 'assets/enemies/mellumi-jubilant-ooze.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'quickpurse',
  },
  hollowreaper: {
    src: 'assets/enemies/luvia-hollow-reaper.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'severedhalo',
  },
  silentsigil: {
    src: 'assets/enemies/aria-silent-sigil.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'starmaiden',
  },
  runegaze: {
    src: 'assets/enemies/lua-rune-gaze.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'silentsigil',
  },
  redhunt: {
    src: 'assets/enemies/valla-demon-hunter.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'velvetfang',
  },
  sixfoldgrace: {
    src: 'assets/enemies/havia-sixfold-grace.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'silentsigil',
  },
  stringapostate: {
    src: 'assets/enemies/mirelle-string-apostate.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'velvetsin',
  },
  carrionbloom: {
    src: 'assets/enemies/thessa-carrion-bloom.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'thornempress',
  },
  velvetundertow: {
    src: 'assets/enemies/nymora-velvet-undertow.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'gravemoon',
  },
  cinderverdict: {
    src: 'assets/enemies/zafira-cinder-verdict.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'runegaze',
  },
  brokenmercy: {
    src: 'assets/enemies/calyra-broken-mercy.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'brokencovenant',
  },
  plaguewing: {
    src: 'assets/enemies/eiraxa-plaguewing-matron.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'velvetsin',
  },
  gildeddue: {
    src: 'assets/enemies/karessa-gilded-due.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'cinderverdict',
  },
  shatteredreflection: {
    src: 'assets/enemies/velune-shattered-reflection.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'silentsigil',
  },
  widowbelow: {
    src: 'assets/enemies/sythra-widow-below.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'velvetfang',
  },
  rimebetrothed: {
    src: 'assets/enemies/isolde-rime-betrothed.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'gravemoon',
  },
  shadowcultist: {
    src: 'assets/enemies/shadow-cultist.png',
    display: { 4: 112, 6: 176, 9: 256 },
    fallback: 'cultist',
  },
};

const SPRITES = {

  /* ---------------- BUILDINGS (16-wide-ish) ---------------- */

  farm: {
    pal: { r: '#b5443c', R: '#8c2f2a', b: '#8a5a2b', d: '#4a2f17', w: '#bfe3ff', y: '#e8c84a', Y: '#b9982f', g: '#3f7d2e' },
    rows: [
      '......yy........',
      '..rrrrrrrr......',
      '.rrrrrrrrrr.....',
      'rrRRrrrrRRrr....',
      '.bbbbbbbbbb.....',
      '.bwwb..bwwb.yY..',
      '.bwwb..bwwb.yY..',
      '.bbbbbbbbbb.yY..',
      '.bb.dd...bb.yY..',
      '.bb.dd...bb.yY..',
      'gggggggggggggggg',
    ],
  },

  lumber: {
    pal: { d: '#4a2f17', b: '#8a5a2b', B: '#6e4720', w: '#bfe3ff', o: '#9a6a33', O: '#c79454', g: '#3f7d2e', s: '#9aa0a8' },
    rows: [
      '....dd..........',
      '...dddd.........',
      '..dddddd........',
      '.bbbbbbbb..s....',
      '.bBBbbbBb.sss...',
      '.bwwbbbbb..s....',
      '.bwwbbbbb..OOO..',
      '.bbbbbbbb.OoooO.',
      '.bb.dd.bb.OoooO.',
      '.bb.dd.bb..OOO..',
      'gggggggggggggggg',
    ],
  },

  quarry: {
    pal: { s: '#8d939c', S: '#5d626b', k: '#1c1e24', g: '#3f7d2e', b: '#8a5a2b' },
    rows: [
      '......ssss......',
      '....ssssssss....',
      '...sSssssssSs...',
      '..ssssSSSSssss..',
      '..sssSkkkkSsss..',
      '.ssssSkkkkSssss.',
      '.ssSsskkkkssSss.',
      '.sssssssssssss..',
      '..b..........b..',
      'gggggggggggggggg',
    ],
  },

  tavern: {
    pal: { r: '#7d4ea0', R: '#5c3677', b: '#8a5a2b', B: '#6e4720', d: '#4a2f17', w: '#ffd76b', y: '#e8c84a', g: '#3f7d2e' },
    rows: [
      '..rrrrrrrrrr....',
      '.rrrrrrrrrrrr...',
      '.rRRrrrrrrRRr...',
      '.bbbbbbbbbbbb...',
      '.bwwbBBbwwbb.y..',
      '.bwwbBBbwwbb.y..',
      '.bbbbbbbbbbb.yy.',
      '.bbwwbddbwwb.yy.',
      '.bbwwbddbwwb....',
      '.bbbbbddbbbb....',
      'gggggggggggggggg',
    ],
  },

  market: {
    pal: { o: '#e07b39', W: '#f2ead8', b: '#8a5a2b', y: '#e8c84a', p: '#a85ccc', r: '#c0504a', g: '#3f7d2e' },
    rows: [
      '.oWoWoWoWoWo....',
      '.oooooooooooo...',
      '..b........b....',
      '..b.yyy.ppp.b...',
      '..b.yyy.ppp.b...',
      '..b.rrr.yyy.b...',
      '..bbbbbbbbbb....',
      'gggggggggggggggg',
    ],
  },

  smith: {
    pal: { s: '#8d939c', S: '#5d626b', b: '#8a5a2b', d: '#4a2f17', w: '#bfe3ff', F: '#ff8c2e', f: '#ffd23e', k: '#23252b', g: '#3f7d2e' },
    rows: [
      '...ss...........',
      '...ss...........',
      '.SSSSSSSSSS.....',
      '.SssssssssS.....',
      '.bbbbbbbbbb.....',
      '.bFFbbbbwwb.....',
      '.bFfbbbbwwb.kk..',
      '.bFFbbbbbbb.kk..',
      '.bbbbbbbbbbkkkk.',
      '.bb.dd..bbb.....',
      'gggggggggggggggg',
    ],
  },

  manawell: {
    pal: { b: '#8a5a2b', B: '#6e4720', s: '#8d939c', S: '#5d626b', M: '#5fd9ff', m: '#2e8fd6', g: '#3f7d2e' },
    rows: [
      '....bbbbbb......',
      '...bbBBBBbb.....',
      '....s....s......',
      '....s.MM.s......',
      '....s.mM.s......',
      '...sssMMsss.....',
      '...sSSmmSSs.....',
      '...ssssssss.....',
      'gggggggggggggggg',
    ],
  },

  temple: {
    pal: { y: '#e8c84a', Y: '#b9982f', W: '#f2ead8', w: '#cfc6ae', d: '#4a2f17', g: '#3f7d2e' },
    rows: [
      '.......yy.......',
      '.....yyyyyy.....',
      '...yyyyyyyyyy...',
      '..YYYYYYYYYYYY..',
      '..WWWWWWWWWWWW..',
      '..W.Ww.WW.wW.W..',
      '..W.Ww.WW.wW.W..',
      '..W.Ww.WW.wW.W..',
      '..WWWWWdddWWWW..',
      '..WWWWWdddWWWW..',
      'gggggggggggggggg',
    ],
  },

  magetower: {
    pal: { y: '#ffe96b', p: '#7d4ea0', P: '#5c3677', s: '#8d939c', S: '#5d626b', M: '#5fd9ff', g: '#3f7d2e' },
    rows: [
      '.......y........',
      '......ppp.......',
      '.....ppppp......',
      '....pPpppPp.....',
      '.....sssss......',
      '.....sMMss......',
      '.....sssss......',
      '.....ssMss......',
      '.....sssss......',
      '.....sSsSs......',
      '....sssssss.....',
      '....sssssss.....',
      'gggggggggggggggg',
    ],
  },

  keep: {
    pal: { r: '#d63c3c', s: '#8d939c', S: '#5d626b', k: '#23252b', M: '#5fd9ff', g: '#3f7d2e' },
    rows: [
      '.......r........',
      '.......rr.......',
      '.......k........',
      '..ss.ssksss.ss..',
      '..ssssssssssss..',
      '..sSssssssssSs..',
      '..ssMss..ssMss..',
      '..ssssssssssss..',
      '..sSssskkssssS..',
      '..sssskkkksss s.',
      '..sssskkkkssss..',
      'gggggggggggggggg',
    ],
  },

  /* ---------------- MONSTERS ---------------- */

  slime: {
    pal: { g: '#5ccb4a', G: '#2f8f23', k: '#16331a', w: '#d9ffd2' },
    rows: [
      '.....gggggg.....',
      '...gggwgggggg...',
      '..ggwggggggggg..',
      '..ggkkggggkkgg..',
      '..ggkkggggkkgg..',
      '.gggggggggggggg.',
      '.ggggggkkgggggg.',
      '.gGGggggggggGGg.',
      '..GGGGGGGGGGGG..',
    ],
  },

  bat: {
    pal: { p: '#8a55b5', P: '#5c3677', k: '#1c1024', r: '#ff5050' },
    rows: [
      '..p..........p..',
      '.ppp........ppp.',
      '.pppp..pp..pppp.',
      '.Pppppppppppp P.',
      '..PppprpprpppP..',
      '...ppppppppp....',
      '....Ppp..ppP....',
      '.....p....p.....',
    ],
  },

  goblin: {
    pal: { g: '#6da33c', G: '#49702a', k: '#1d2410', r: '#d04040', b: '#7a5230' },
    rows: [
      '..gg......gg....',
      '..gggggggggg....',
      '...gkggggkg.....',
      '...gggggggg.....',
      '....ggrrgg......',
      '..gggggggggg.b..',
      '.g.gggggggg.b...',
      '...gGGggGGg.....',
      '...gg....gg.....',
    ],
  },

  skeleton: {
    pal: { W: '#e8e4d4', w: '#b8b4a0', k: '#1c1e24', y: '#c9a23c' },
    rows: [
      '....WWWWW...y...',
      '....WkWkW...y...',
      '....WWWWW..yy...',
      '.....WwW....y...',
      '...WWWWWWW..y...',
      '..W.wWWWw.W.y...',
      '....WWWWW...y...',
      '....Ww.wW.......',
      '...WW...WW......',
    ],
  },

  orc: {
    pal: { g: '#4f8a3a', G: '#34602a', k: '#101a0c', W: '#e8e4d4', S: '#5d626b', s: '#8d939c' },
    rows: [
      '...gggggggg.....',
      '..gggggggggg....',
      '..gkkggggkkg....',
      '..gggggggggg....',
      '..gWgg..ggWg....',
      '..SSSSSSSSSS....',
      '.gSssSSSSssSg...',
      '.gSSSSSSSSSSg...',
      '..GG......GG....',
    ],
  },

  imp: {
    pal: { r: '#d04040', R: '#8c2424', k: '#240c0c', y: '#ffd23e' },
    rows: [
      '..k..........k..',
      '...k........k...',
      '...rrrrrrrrrr...',
      '..rryyrrrryyrr..',
      '..rrrrrrrrrrrr..',
      '...rrrrkkrrrr...',
      '....rrrrrrrr....',
      '...rRr....rRr...',
      '...rr......rr...',
    ],
  },

  golem: {
    pal: { s: '#8d939c', S: '#5d626b', M: '#5fd9ff', k: '#23252b', m: '#3c6e80' },
    rows: [
      '...ssssssssss...',
      '..ssSssssssSss..',
      '..ssMMssssMMss..',
      '..ssssssssssss..',
      '.sssSSsMMsSSsss.',
      '.ss.ssssssss.ss.',
      '.ss.sSSssSSs.ss.',
      '....ssss ssss...',
      '...sss....sss...',
    ],
  },

  dragon: {
    pal: { r: '#c43c3c', R: '#7d1f1f', k: '#240c0c', W: '#f2ead8', o: '#ff8c2e', y: '#ffd23e' },
    rows: [
      '....rr......rr..',
      '...rrrr....rrrr.',
      '...rrrrrrrrrrr..',
      '..rrrkkrrrrkkr..',
      '.rrrrrrrrrrrrrr.',
      '..rrWWrrrrWWrr..',
      '...rrrroorrrr...',
      '....rrroyorr....',
      '...rRr.oo.rRr...',
      '...rr......rr...',
    ],
  },

  /* additional monsters and bosses */
  wolf: {
    pal: { d: '#4b5360', D: '#2c3038', k: '#11151a', w: '#c9d0d8', y: '#ffd23e' },
    rows: [
      '..d.........d...',
      '.ddd.......ddd..',
      '.ddddddddddddd..',
      '..ddydddddydd...',
      '..ddddkdddddd...',
      '.DDddddddddDD...',
      'ddd.dddddd.ddd..',
      '..dd......dd....',
      '.dd........dd...',
    ],
  },

  spider: {
    pal: { p: '#684079', P: '#3b2447', k: '#161019', r: '#ff5050' },
    rows: [
      'p...p......p...p',
      '.p..pp....pp..p.',
      '..p.PppppppP.p..',
      '...ppprrppp.....',
      '..ppppkkpppp....',
      '.p..PppppP..p...',
      'p..p.pppp.p..p..',
      '..p........p....',
    ],
  },

  wraith: {
    pal: { c: '#88d8e8', C: '#477b91', w: '#d9fbff', k: '#17272d', p: '#6f4e91' },
    rows: [
      '.....cccc.......',
      '...ccwwwwcc.....',
      '..ccwkwkwccc....',
      '..cccccccccc....',
      '...ccCppCcc.....',
      '..ccCccccCcc....',
      '.ccC.cccc.Ccc...',
      '..C..c..c..C....',
      '.....c..c.......',
    ],
  },

  mushroom: {
    pal: { r: '#b93e57', R: '#76283a', w: '#f4d9c4', k: '#32202a', b: '#96704d' },
    rows: [
      '....rrrrrr......',
      '..rrwrrwrrrr....',
      '.rrrrrrrrrrrrr...',
      'rrRrrRrrRrrRrr..',
      '...wwwwwwww.....',
      '....wkwkw.......',
      '...wwwwwww......',
      '..bwwwbwwwb.....',
      '..bb.....bb.....',
    ],
  },

  lizard: {
    pal: { g: '#4f9b63', G: '#2f6542', k: '#122519', y: '#f3cf4d', b: '#765433' },
    rows: [
      '..........gg....',
      '..ggggggggggg...',
      '.ggyggggggkgg...',
      '..gggggggggg....',
      '...GGggGGgg..b..',
      '..ggggggggg.bb..',
      '.gg.ggggg.gg.b..',
      '...gg....gg.....',
      '..gg......gg....',
    ],
  },

  cultist: {
    pal: { p: '#713b7e', P: '#44234d', k: '#171019', r: '#e34c55', s: '#a8adb8' },
    rows: [
      '.....pppp.......',
      '....pPPPPp......',
      '...ppkkkkpp.....',
      '...ppkrkkpp.....',
      '..pppppppppp.s..',
      '..pPppppppPp.ss.',
      '.ppPppppppPpp.s.',
      '...pp....pp...s.',
      '..pp......pp....',
    ],
  },

  mimic: {
    pal: { b: '#9a6234', B: '#5f3b22', y: '#d6aa3b', k: '#1a1010', r: '#d74444', W: '#f2ead8' },
    rows: [
      '..bbbbbbbbbbbb..',
      '.bByyyyyyyyyBb..',
      '.bbBbbbbbbBbbb..',
      '.bbkbbkkbbkbbb..',
      '.brrrrrrrrrrrb..',
      '.brWrWrWrWrWrb..',
      '.brrrrrrrrrrrb..',
      '..BBb......bBB..',
      '.bbb........bbb.',
    ],
  },

  harpy: {
    pal: { b: '#9a693f', B: '#60432c', f: '#e8b98f', k: '#251c18', y: '#ffd23e' },
    rows: [
      'b............b..',
      'bbb....BB....bbb',
      '.bbbb.BffB.bbbb.',
      '..bb..fkyf..bb..',
      '...bbbffffbbb....',
      '..bb.bffffb.bb...',
      '.bb...BffB...bb..',
      '.....bb..bb......',
      '....by....yb.....',
    ],
  },

  scorpion: {
    pal: { o: '#bb6238', O: '#763b27', k: '#24130e', y: '#ffd23e', s: '#c6b7a6' },
    rows: [
      '...........OOo..',
      '............Ooo.',
      '..oo......OOoo..',
      '.oOOooooooOOo...',
      'oOOoyoooooyOOo..',
      '.ooookkkooooo...',
      'o..oo....oo..o..',
      '..oo......oo....',
      '.ss........ss...',
    ],
  },

  frostling: {
    pal: { c: '#73cbe8', C: '#397b9c', w: '#e8fbff', k: '#173142', p: '#7958a5' },
    rows: [
      '..c..........c..',
      '...c..cccc..c...',
      '....ccwwwwcc....',
      '...ccwkwkwcc....',
      '..CccccccccC....',
      '..CCcppppcCC....',
      '.CCccppppccCC...',
      '...cc....cc.....',
      '..cc......cc....',
    ],
  },

  treant: {
    pal: { b: '#6e472b', B: '#432c1d', g: '#4f8b3d', G: '#2f5d2a', y: '#e7c84d' },
    rows: [
      'ggg....ggg......',
      '.ggg..ggg.......',
      '..gggggg........',
      '..gbbbbbg.......',
      '.gbbybbybbg.....',
      'ggbbbbbbbbgg....',
      '..bBbbbbBb......',
      '..bb....bb......',
      '.bbb....bbb.....',
    ],
  },

  watcher: {
    pal: { p: '#9757b5', P: '#59346e', w: '#f4e8ff', k: '#22132a', r: '#ff4d6d' },
    rows: [
      '.....pppp.......',
      '...ppPPPPpp.....',
      '..pppwwwwppp....',
      '.pppwrrrrwppp...',
      '..ppwrkkkrwpp...',
      '...pwwrrwwp.....',
      '..PPppppppPP....',
      '.P..pp..pp..P...',
      '....p....p......',
    ],
  },

  hydra: {
    pal: { g: '#477d4a', G: '#294d31', y: '#ffd23e', r: '#d34a45' },
    rows: [
      '..gg...gg...gg..',
      '.gygg.ggyg.ggyg.',
      '.ggg...gg...ggg.',
      '..ggg.ggg.ggg...',
      '...ggggggggg....',
      '..GGgggggggGG...',
      '.GGGggrrrggGGG..',
      '..gggggggggg....',
      '.ggg..gg..ggg...',
      '.gg...gg...gg...',
    ],
  },

  lich: {
    pal: { p: '#71458e', P: '#3f2855', W: '#e8e4d4', k: '#17121d', c: '#63d6df', y: '#ffd23e' },
    rows: [
      '.....yyyy.......',
      '...yyWyyWyy.....',
      '....WWWWW.......',
      '....WkWkW...c...',
      '...ppWWWpp..ccc.',
      '..pPpppppPp..c..',
      '.pPpppppppPp.c..',
      '...pp....pp..c..',
      '..pp......pp.c..',
    ],
  },

  titan: {
    pal: { b: '#6b4b35', B: '#3e2d24', g: '#557d3b', G: '#334e2b', y: '#f0ca4d' },
    rows: [
      '..gggggggggg....',
      '.ggGggggggGgg...',
      '.gggyggggyg.gg...',
      '.gggggBBggggg...',
      'gggBBBbbBBBggg..',
      'ggBbbbbbbbbBgg..',
      '.gBbbBbbBbbBg...',
      '..bbb....bbb....',
      '.bbbb....bbbb...',
    ],
  },

  kraken: {
    pal: { p: '#73519a', P: '#402e5c', c: '#4db6c7', C: '#2d7180', k: '#171425', y: '#ffd23e' },
    rows: [
      '....pppppp......',
      '..ppPPppPPpp....',
      '.ppyppppppypp...',
      '.pppppkkppppp...',
      '..pppppppppp....',
      '.cCcppppppcCc...',
      'cCcc.pppp.ccCc..',
      '.cc..c..c..cc...',
      'c...cc..cc...c..',
    ],
  },

  phoenix: {
    pal: { r: '#d84a35', R: '#8c2c24', o: '#ff8c2e', y: '#ffd23e', Y: '#fff0a0', k: '#32130d' },
    rows: [
      'r......yy......r',
      'rr...yyyyyy...rr',
      '.rr.oyoYYoyo.rr.',
      '..rroyyyyyorr...',
      '...rrykykrr.....',
      '..rrroyyorrr....',
      '.rr..ryyr..rr...',
      'r...rr..rr...r..',
      '...oo....oo.....',
    ],
  },

  voidlord: {
    pal: { k: '#15101f', K: '#28203b', p: '#7845a1', P: '#b45cff', r: '#ff4568', s: '#aeb4c2' },
    rows: [
      '....KkKKkK......',
      '...KkkkkkkK.....',
      '..KkPkkkkPkK....',
      '..KkkkrrkkkkK...',
      '.KkkkKkkKkkkkK..',
      '.KkKkkkkkkkkKk..',
      '..KkkKppKkkK....',
      '..sssKkkKsss....',
      '.ss..K..K..ss...',
    ],
  },

  starmaiden: {
    pal: {
      k: '#2b2030', K: '#4a354f',
      y: '#e9ad38', Y: '#ffe887', h: '#fff6bd',
      f: '#eeb58f', F: '#ffd5ad', r: '#d86c82',
      e: '#65d9ff', E: '#287fb7',
      w: '#f8f4ff', W: '#c9cce9',
      b: '#537edf', B: '#294b92', n: '#172c61',
      p: '#e878c4', P: '#9d4f9b',
      s: '#dce7f5', S: '#788ba8',
    },
    rows: [
      '.........yy.............',
      '.......yyYYyy...........',
      '......yYhYYhYy..........',
      '.....yYyyyyyyYy.........',
      '.....yyFFFFFyyy.........',
      '....yyFkeFekFyy.........',
      '....yyFFrFFfFyy.........',
      '.....yFfffffFy..........',
      '......kkfffkk...........',
      '......wwkkkww......s....',
      '.....wWwbbbwwW....ss....',
      '....wwBbbbbBwww..sSs....',
      '...ppwBbwPwbBwp..sSs....',
      '..pPPwbbbbbbbwPp.sSs....',
      '..pPwwbBbbBbbwwp.sSs....',
      '...wwbbbppbbbww..sSs....',
      '....wbbbbbbbbw...sSs....',
      '....WbbBbbBbbW...sSs....',
      '.....bbBbbBbb....sSs....',
      '.....bBBbbBBb....sSs....',
      '....bbBbbbbBbb...sSs....',
      '...wwWBb..bBWww..sSs....',
      '..wwWWW....WWWww.sSs....',
      '....BB......BB...sSs....',
      '...BBB......BBB..sSs....',
      '..nnn........nnn.sss....',
    ],
  },

  riftwitch: {
    pal: {
      k: '#17111f', K: '#31203d',
      v: '#7141a0', V: '#3b235c', q: '#ad63d1',
      f: '#eeb08e', F: '#ffd0aa', r: '#cf607a',
      e: '#ef73e8', E: '#8e3dad',
      p: '#d85aad', P: '#7e357c',
      c: '#63dbe8', C: '#258a9f', a: '#c8fbff',
      w: '#f4ecff', W: '#aaa0c7',
      g: '#41364e', G: '#211a29',
    },
    rows: [
      '...vv........vv.........',
      '....vvv....vvv..........',
      '.....vVvvvvVv...........',
      '....vVVVvvVVVv..........',
      '...vVvFFFFFFvVv.........',
      '...vvFkeFekFvv..........',
      '..vVvFFrFFFfvVv.........',
      '..vvvFfffffFvvv.........',
      '..vVVkkfffkkVVv....c....',
      '..vvvppkkkppvv....ccc...',
      '.vvvPpppppppPvv..cCaCc..',
      'vvVVppvpppvppVVv.ccccc..',
      'vVVvppvPpPvppvVv..cC....',
      '.vvppppppppppvv...cC....',
      '..vppPppppPppv....cC....',
      '..vvpppqqpppvv....cC....',
      '...vpppqqpppv.....cC....',
      '...VppPppPppV.....cC....',
      '....ppPppPpp......cC....',
      '...ppPPppPPpp.....cC....',
      '..gggPp..pPggg....cC....',
      '.ggGGg....gGGgg...cC....',
      '..ggg......ggg....cC....',
      '..GG........GG....cC....',
      '.GGG........GGG...cC....',
      'kkk..........kkk..CCC...',
    ],
  },

  /* windmill tower only — blades are a separate sprite spun via CSS */
  windmill: {
    pal: { b: '#8a5a2b', B: '#a07440', d: '#4a2f17', W: '#e8e4d4', g: '#3f7d2e' },
    rows: [
      '......WW........',
      '......BB........',
      '.....BBBB.......',
      '.....BBBB.......',
      '....BBBBBB......',
      '....BBBBBB......',
      '....BB.dBB......',
      'gggggggggggggggg',
    ],
  },

  millblades: {
    pal: { b: '#8a5a2b', B: '#6e4720', W: '#e8e4d4' },
    rows: [
      'b.......b',
      'Bb.....bB',
      '.Bb...bB.',
      '..Bb.bB..',
      '....W....',
      '..bB.Bb..',
      '.bB...Bb.',
      'bB.....Bb',
      'b.......b',
    ],
  },

  alchemist: {
    pal: { p: '#7d4ea0', P: '#5c3677', b: '#8a5a2b', w: '#ffd76b', d: '#4a2f17', M: '#5fd9ff', g: '#3f7d2e' },
    rows: [
      '..pppppppp......',
      '.pPpppppppP.....',
      '.bbbbbbbbbb..M..',
      '.bwwbbbbwwb..M..',
      '.bwwbbbbwwb.MMM.',
      '.bbbbbbbbbb.MMM.',
      '.bb.dd..bbb..M..',
      'gggggggggggggggg',
    ],
  },

  wharf: {
    pal: { b: '#8a5a2b', B: '#6e4720', w: '#bfe3ff', o: '#9a6a33', M: '#2f5fb8', m: '#4f83d8', g: '#3f7d2e' },
    rows: [
      '...bbbbbb.......',
      '..bbbbbbbb......',
      '..bwwbbbbb......',
      '..bbbbbbbb......',
      'oooooooooooooo..',
      '.o...o...o..o...',
      'MMMmMMMMmMMMMM..',
      '.MM.bBBb.MMmM...',
      'MmMM.bb.MMMMM...',
    ],
  },

  library: {
    pal: { m: '#3c6ed6', M: '#2a4da0', W: '#f2ead8', w: '#cfc6ae', d: '#4a2f17', g: '#3f7d2e' },
    rows: [
      '...mmmmmmmm.....',
      '..mmMmmmmMmm....',
      '..WWWWWWWWWW....',
      '..W.ww.ww..W....',
      '..W.ww.ww..W....',
      '..WWWWWWWWWW....',
      '..WWWdddWWWW....',
      'gggggggggggggggg',
    ],
  },

  barracks: {
    pal: { r: '#d63c3c', k: '#23252b', S: '#5d626b', s: '#8d939c', w: '#bfe3ff', d: '#4a2f17', g: '#3f7d2e' },
    rows: [
      '.r..............',
      '.rr.............',
      '.k.SSSSSSSSSS...',
      '..SssssssssS....',
      '..SssssssssS....',
      '..SwwSssSwwS....',
      '..SssssssssS....',
      '..SSSSddSSSS....',
      'gggggggggggggggg',
    ],
  },

  cathedral: {
    pal: { y: '#ffd23e', W: '#f2ead8', w: '#cfc6ae', m: '#7d4ea0', M: '#3c6ed6', d: '#4a2f17', g: '#3f7d2e' },
    rows: [
      '.......y........',
      '......yyy.......',
      '.......W........',
      '......WWW.......',
      '.....WWWWW......',
      '....WWWWWWW.....',
      '....WmmWMMW.....',
      '....WWWWWWW.....',
      '....WMMWmmW.....',
      '....WWWWWWW.....',
      '....WWdddWW.....',
      'gggggggggggggggg',
    ],
  },

  academy: {
    pal: { y: '#ffe96b', p: '#7d4ea0', P: '#5c3677', s: '#8d939c', S: '#5d626b', M: '#5fd9ff', g: '#3f7d2e' },
    rows: [
      '..y.....y....y..',
      '.ppp...ppp..ppp.',
      '.pPp...pPp..pPp.',
      '.sss...sss..sss.',
      '.sMs...sMs..sMs.',
      '.sss...sss..sss.',
      '.sssssssssssss..',
      '.ssssssMMsssss..',
      '.ssssssMMsssss..',
      '.sSssssssssSss..',
      'gggggggggggggggg',
    ],
  },

  mint: {
    pal: { S: '#5d626b', s: '#8d939c', y: '#ffd23e', Y: '#b9982f', d: '#23252b', g: '#3f7d2e' },
    rows: [
      '..SSSSSSSSSS....',
      '..SssssssssS....',
      '..Sss.yy.ssS....',
      '..Ss.yYYy.sS....',
      '..Ss.yYYy.sS....',
      '..Sss.yy.ssS....',
      '..SssssssssS....',
      '..SSSSddSSSS....',
      'gggggggggggggggg',
    ],
  },

  /* ---------------- UNIT PORTRAITS ---------------- */

  archer: {
    pal: { g: '#3f7d2e', G: '#2c5a20', f: '#f0c8a0', b: '#8a5a2b', W: '#e8e4d4', d: '#4a2f17' },
    rows: [
      '.....ggg.....b..',
      '....ggggg...bW..',
      '....gfffg..b.W..',
      '....ggggg..b.W..',
      '...gGgggGg.b.W..',
      '...ggggggg.b.W..',
      '...ggggggg..bW..',
      '...gGgggGg..bW..',
      '....gg.gg....b..',
      '....dd.dd.......',
    ],
  },

  hero: {
    pal: { r: '#d63c3c', s: '#aab2bd', S: '#6b7480', k: '#1c1e24', y: '#ffd23e', W: '#e8e4d4', f: '#f0c8a0' },
    rows: [
      '......rr........',
      '.....ssss.......',
      '.....skks.......',
      '.....ffff.......',
      '....SSSSSS......',
      '...SSyySSSS.....',
      '...SSSSSSSS..W..',
      '...SSSSSSSS..W..',
      '...SSSSSSSS..W..',
      '...SSyyyySS..W..',
      '....SS..SS...y..',
      '....ss..ss...y..',
    ],
  },

  magep: {
    pal: { p: '#7d4ea0', P: '#5c3677', f: '#f0c8a0', k: '#1c1e24', y: '#c9a23c', M: '#5fd9ff' },
    rows: [
      '.....ppp....M...',
      '....ppppp...y...',
      '...ppPpPpp..y...',
      '.....fff....y...',
      '....pfkfp...y...',
      '....ppppp...y...',
      '...ppppppp..y...',
      '...ppPpPpp..y...',
      '...ppppppp..y...',
      '...pPpppPp..y...',
      '....pp.pp.......',
    ],
  },

  ballista: {
    pal: { b: '#8a5a2b', B: '#6e4720', s: '#5d626b', W: '#e8e4d4', o: '#9a6a33' },
    rows: [
      '..........W.....',
      '.........W......',
      '.b......W.......',
      '..b....W........',
      '...b..W.........',
      '....bW..........',
      '....bb..........',
      '...bBBb.........',
      '..bbBBbb........',
      '.obbBBbbo.......',
      '.ssssssss.......',
      '.ss....ss.......',
    ],
  },

  wallseg: {
    pal: { s: '#8d939c', S: '#5d626b', k: '#23252b', r: '#d63c3c' },
    rows: [
      '..r.............',
      '..rr............',
      '..k.............',
      'ss.ss.ss.ss.ss..',
      'ssssssssssssss..',
      'sSssSssSssSssS..',
      'ssssssssssssss..',
      'ssSssSssSssSss..',
      'ssssssssssssss..',
      'sSsskkkkssSsss..',
      'sssskkkkssssss..',
    ],
  },

  worldtree: {
    pal: { t: '#6e4720', T: '#4a2f17', l: '#2f6b22', L: '#3f8a2c', d: '#24541a', M: '#5fd9ff', g: '#3f7d2e' },
    rows: [
      '.....LLLLL......',
      '...LLlllllLL....',
      '..LlllllllllL...',
      '.LlllMllllllL...',
      '.LllllllMlllL...',
      '..LlldllllldL...',
      '...LlllllllL....',
      '.....dTtTd......',
      '.....TttT.......',
      '....TTttTT......',
      'gggggggggggggggg',
    ],
  },

  wonder: {
    pal: { y: '#ffd23e', Y: '#b9982f', W: '#fff0a0', s: '#8d939c', S: '#5d626b', g: '#3f7d2e' },
    rows: [
      '.......y........',
      '......yWy.......',
      '.....yyWyy......',
      '......yWy.......',
      '....yyyWyyy.....',
      '...yYyyyyyYy....',
      '...sssssssss....',
      '..sSsssssssSs...',
      '..ssyyYYYyyss...',
      '..sssssssssss...',
      '.sSsssssssssSs..',
      'gggggggggggggggg',
    ],
  },

  clericp: {
    pal: { W: '#f2ead8', w: '#cfc6ae', f: '#f0c8a0', y: '#ffd23e', k: '#1c1e24' },
    rows: [
      '.....WWW....y...',
      '....WWWWW..yyy..',
      '.....fff....y...',
      '....WfkfW...y...',
      '....WWWWW...y...',
      '...WWyWyWW..y...',
      '...WWWWWWW..y...',
      '...WWyWyWW..y...',
      '...WwWWWwW......',
      '....WW.WW.......',
    ],
  },

  dragonp: {
    pal: { r: '#c43c3c', R: '#7d1f1f', k: '#240c0c', y: '#ffd23e', s: '#8d939c', W: '#f2ead8' },
    rows: [
      '...rr......rr...',
      '..rrrr....rrrr..',
      '...rrrrssrrrr...',
      '..rrrksssskrr...',
      '..rrrrrssrrrrr..',
      '...rrrryyrrrr...',
      '....rrrWWrrr....',
      '...rR..rr..Rr...',
      '...r...rr...r...',
    ],
  },

  /* Royal Knights — mounted lancer in steel plate, red plume */
  knightp: {
    pal: { r: '#d63c3c', s: '#c0c8d4', S: '#7a838f', k: '#1c1e24', y: '#ffd23e', b: '#6b4e26', B: '#4a3517', W: '#e8e4d4' },
    rows: [
      '......rr........',
      '.....ssss....W..',
      '.....skks....W..',
      '.....ssss....W..',
      '....SssssS...W..',
      '...SsyyysS...W..',
      '...SssssssS..W..',
      '...SssssssS..W..',
      '..bSssssssSb.W..',
      '..bBsssssBb..y..',
      '..bB.BBBB.Bb.y..',
      '..bb.b..b.bb....',
    ],
  },

  /* Plague Alchemists — hooded green-robed bomber, beaked mask */
  plaguep: {
    pal: { g: '#3f7d2e', G: '#2c5a20', k: '#1c1e24', w: '#cfc6ae', y: '#bfe34a', M: '#5ccb4a', b: '#6b4e26' },
    rows: [
      '.....ggg........',
      '....ggggg.......',
      '...ggGGGgg......',
      '...gwkkkwg......',
      '....gkwkg...M...',
      '....ggggg..MMM..',
      '...gggGggg.MyM..',
      '...gggggGg..M...',
      '...ggGgggg..b...',
      '...gGgggGg......',
      '....gg.gg.......',
      '....GG.GG.......',
    ],
  },

  /* Storm Valkyries — winged spear-maiden, white wings, blue mail */
  valkyriep: {
    pal: { W: '#f2f4fa', w: '#c7cede', m: '#3c6ed6', M: '#2a4da0', f: '#f0c8a0', y: '#ffd23e', s: '#5fd9ff' },
    rows: [
      'W.....yy.....W..',
      'Ww...mMMm...wW..',
      'WWw..mMMm..wWW..',
      '.Ww..ffff..wW.s.',
      '..w.mMMMMm.w.ss.',
      '....mMmMMm...s..',
      '...mMMMMMMm..s..',
      '...mMmMMmMm..s..',
      '...mMMMMMMm..s..',
      '....mM..Mm...s..',
      '....mm..mm......',
      '....ww..ww......',
    ],
  },

  /* ---- WARD UNIT PORTRAITS ---- */
  reaverp: {
    pal: { p: '#9a4fd4', P: '#5c2f8a', k: '#241038', m: '#e6ccff', r: '#ff3b5c', y: '#f2e6ff' },
    rows: [
      '....k....k......',
      '...kPk..kPk.....',
      '...kPPPPPPk.....',
      '..kPpppppppk....',
      '..kPpmkkmppk....',
      '..kPprPPrppk....',
      '..kPppmmpppk....',
      '..kPppyyPppk....',
      '...kPpPPpPk.....',
      '..ypPPPPPPpy....',
      '.ykpPpPPpPpky...',
      '.yk.pP..Pp.ky...',
      '....pk..kp......',
      '...yk....ky.....',
    ],
  },
  seraphp: {
    pal: { w: '#f2f4fa', s: '#c7cede', g: '#ffd23e', G: '#b9982f', f: '#f0c8a0', b: '#5fd9ff' },
    rows: [
      '.....gggg.......',
      '....g....g......',
      '....g.ff.g......',
      '.....ffff.......',
      '..w..fbbf..w....',
      '.www.ffff.www...',
      'wwsw.wwww.wsww..',
      'wwsw.wwww.wsww..',
      '.ww.gwwwwg.ww...',
      '....gwbbwg......',
      '....wwwwww......',
      '.....wwww.......',
      '.....w..w.......',
    ],
  },
  reaperp: {
    pal: { k: '#1c1622', K: '#332842', r: '#ff4a3c', R: '#8d1f1f', s: '#5d626b', S: '#c0c8d4', y: '#ffd23e' },
    rows: [
      '.......S........',
      '......SS........',
      '.....S.kkkkk....',
      '....S.kKKKKKk...',
      '...S.kKKkkKKKk..',
      '...s.kKrKKrKKk..',
      '.....kKKKKKKKk..',
      '.....kKrrrrKKk..',
      '....kKKKKKKKKk..',
      '...kKKKsssKKKk..',
      '..kKKk.sSs.kKk..',
      '.......sSs......',
      '.......sSs......',
      '......RssR......',
    ],
  },
  leviathanp: {
    pal: { c: '#5fd9ff', m: '#2e8fd6', M: '#1c5a8a', k: '#0a2436', W: '#d8f6ff', r: '#ff3b5c', y: '#f2e6ff' },
    rows: [
      '..M..........M..',
      '..Mm........mM..',
      '...Mmmmmmmmmm...',
      '..MmccccccccmM..',
      '..MmcWkkkkWcmM..',
      '..MmcrMMMMrcmM..',
      '..MmccccccccmM..',
      '..MmcyWWWWycmM..',
      '...Mmcyyyycm....',
      '....Mmccccmm....',
      '..M..Mmmmm..M...',
      '.Mm...MMM...mM..',
      'Mm..........mM..',
      'm............m..',
    ],
  },

  chest: {
    pal: { b: '#8a5a2b', B: '#6e4720', y: '#ffd23e', Y: '#b9982f', k: '#23252b' },
    rows: [
      '....bbbbbbbb....',
      '...bBBBBBBBBb...',
      '...bbbbbbbbbb...',
      '...byyyyyyyyb...',
      '...bbbbYYbbbb...',
      '...bBBByyBBBb...',
      '...bBBBYYBBBb...',
      '...bbbbbbbbbb...',
      '....k......k....',
    ],
  },

  portal: {
    pal: { s: '#8d939c', S: '#5d626b', r: '#cab8d8', p: '#a85ccc', P: '#7d4ea0', m: '#e6ccff', k: '#2a1640', K: '#180b2c' },
    rows: [
      '.....rssssr.....',
      '...ssSSssSSss...',
      '..sSppppppppSs..',
      '..sPpPPkkPPpPs..',
      '.sSpPkKmmKkPpSs.',
      '.sSpPKmppmKPpSs.',
      '.sSpPkmpKpmkPpS.',
      '.sSpPkmpKpmkPpS.',
      '.sSpPKmppmKPpSs.',
      '.sSpPkKmmKkPpSs.',
      '..sPpPPkkPPpPs..',
      '..sSpp....ppSs..',
      '..sS........Ss..',
      '.sSS........SSs.',
      '.sSs........sSs.',
    ],
  },

  tower: {
    pal: { k: '#1c1622', K: '#332842', s: '#4a3a5b', r: '#ff4a3c', R: '#8d1f1f', y: '#ffd23e', g: '#3f7d2e' },
    rows: [
      '.......r........',
      '.......rr.......',
      '.......k........',
      '....KkKkKkK.....',
      '....KKKKKKK.....',
      '.....kKKKk......',
      '.....KsKsK......',
      '.....KrrrK......',
      '.....KrRrK......',
      '.....KsKsK......',
      '.....kKKKk......',
      '....KKkKkKK.....',
      '....KKKKKKK.....',
      '...kKKsKsKKk....',
      '...KKKKKKKKK....',
      'gggggggggggggggg',
    ],
  },

  /* the Silver Spire — twin angelic towers, white marble & gold */
  spire: {
    pal: { w: '#f2f4fa', s: '#c7cede', S: '#8e98b8', g: '#ffd23e', G: '#b9982f', b: '#9fd4ff', e: '#3f7d2e' },
    rows: [
      '...g........g...',
      '...w........w...',
      '..sws......sws..',
      '..www......www..',
      '..wbw......wbw..',
      '..www......www..',
      '..wsw..gg..wsw..',
      '..www.wwww.www..',
      '..wbw.wbbw.wbw..',
      '..www.wbbw.www..',
      '..wswwwwwwwwsw..',
      '..wwwwsbbswwww..',
      '..wbwwwbbwwwbw..',
      '..wwwSwbbwSwww..',
      '.SwwwSwwwwSwwwS.',
      'eeeeeeeeeeeeeeee',
    ],
  },

  crown: {
    pal: { g: '#ffd23e', G: '#b9982f', r: '#e04848', b: '#5fd9ff' },
    rows: [
      'g...g...g',
      'gg..g..gg',
      'gGgggggGg',
      'ggrgbgrgg',
      'ggggggggg',
      'GGGGGGGGG',
    ],
  },

  pennant: {
    pal: { p: '#4a2f17', y: '#ffd23e', Y: '#fff0a0' },
    rows: [
      'pyyyy...',
      'pyYYyy..',
      'pyYYyyy.',
      'pyyyy...',
      'pyy.....',
      'p.......',
      'p.......',
      'p.......',
    ],
  },

  /* ---------------- ICONS (8x8) ---------------- */

  icoOrb:    { pal: { p: '#a85ccc', P: '#5c3677', W: '#e8d8f5' }, rows: ['..pppp..', '.pWppppP', 'pWWppppP', 'pWpppppP', 'ppppppPP', 'pppppPPP', '.ppPPPP.', '..PPPP..'] },
  icoBanner: { pal: { r: '#d63c3c', R: '#8c2424', y: '#ffd23e', b: '#8a5a2b' }, rows: ['b.......', 'brrrrrr.', 'brryrrr.', 'brryrrR.', 'brrrrR..', 'brrrR...', 'b.......', 'b.......'] },
  icoCharm:  { pal: { g: '#5ccb4a', G: '#2f8f23', y: '#ffd23e' }, rows: ['.....g..', '....gg..', '..gggG..', '.ggggG..', '.gggGG..', '.ggGG...', '.yGG....', '.y......'] },
  icoBow:    { pal: { b: '#8a5a2b', W: '#e8e4d4' }, rows: ['..bb....', '.b..W...', 'b....W..', 'b....W..', 'b....W..', 'b....W..', '.b..W...', '..bb....'] },
  icoCore:   { pal: { o: '#b85c1e', O: '#e07b39', y: '#ffd23e' }, rows: ['..oooo..', '.oOOOOo.', 'oOOyyOOo', 'oOyyyyOo', 'oOyyyyOo', 'oOOyyOOo', '.oOOOOo.', '..oooo..'] },
  icoMoon:   { pal: { c: '#d8e3f5', C: '#9fb4d8' }, rows: ['...ccc..', '..cc..C.', '.cc.....', '.cc.....', '.cc.....', '.cc...C.', '..cc....', '...ccc..'] },
  icoSkull:  { pal: { W: '#e8e4d4', k: '#1c1e24' }, rows: ['..WWWW..', '.WWWWWW.', '.WkWWkW.', '.WWWWWW.', '..WWWW..', '..WkkW..', '..W..W..', '........'] },
  icoSun:    { pal: { y: '#ffd23e', Y: '#fff0a0' }, rows: ['y..yy..y', '.yYYYYy.', '.YYYYYY.', 'yYYYYYYy', 'yYYYYYYy', '.YYYYYY.', '.yYYYYy.', 'y..yy..y'] },
  icoCenser: { pal: { y: '#ffd23e', Y: '#b9982f', o: '#ff8c2e' }, rows: ['...yy...', '..yYYy..', '.yYYYYy.', '.yYooYy.', '..yYYy..', '...yy...', '...Y....', '..yyy...'] },
  icoTalon:  { pal: { W: '#e8e4d4', w: '#b8b4a0', r: '#c43c3c' }, rows: ['......W.', '.....WW.', '....WW..', '.W.WW...', '.WWWw...', '..WWw...', '...Ww...', '....r...'] },
  icoLance:  { pal: { s: '#c0c8d4', S: '#7a838f', b: '#6b4e26', r: '#d63c3c' }, rows: ['.......s', '......ss', '.....sS.', '..r.sS..', '.rr.S...', 'rrbS....', '.bb.....', 'b.......'] },
  icoVial:   { pal: { g: '#5ccb4a', G: '#2f8f23', w: '#cfc6ae', y: '#bfe34a' }, rows: ['..ww....', '..gw....', '..gg....', '.gggy...', '.gyggy..', 'gggggy..', 'gGgggg..', '.gGGg...'] },
  icoGlaive: { pal: { s: '#5fd9ff', m: '#3c6ed6', M: '#2a4da0', y: '#ffd23e' }, rows: ['......ss', '.....sm.', '....sm..', '...sm...', '..ym....', '..ym....', '..yM....', '..M.....'] },

  icoGold:  { pal: { o: '#b9982f', y: '#ffd23e', Y: '#fff0a0' }, rows: ['..oooo..', '.oyyyyo.', 'oyYyyyyo', 'oyYyyyyo', 'oyyyyyyo', 'oyyyyyyo', '.oyyyyo.', '..oooo..'] },
  icoWood:  { pal: { b: '#8a5a2b', B: '#6e4720', o: '#c79454' }, rows: ['........', '.bbbbbo.', 'bBBBBboo', 'bbbbbboo', 'bBBBBbo.', '.bbbbb..', '........', '........'] },
  icoStone: { pal: { s: '#8d939c', S: '#5d626b' }, rows: ['........', '..ssss..', '.sSssss.', 'ssssssSs', 'sSssssss', 'ssssSsss', '.ssssss.', '........'] },
  icoMana:  { pal: { M: '#5fd9ff', m: '#2e8fd6', W: '#d8f6ff' }, rows: ['...M....', '...MM...', '..MMMM..', '.MWMMMm.', '.MWMMMm.', '.MMMMmm.', '..MMmm..', '...mm...'] },
  icoSigil: { pal: { y: '#ffd23e', Y: '#fff0a0', o: '#b9982f' }, rows: ['...y....', '..yYy...', '.yyYyy..', 'yyYYYyy.', '.oyYyo..', '.yy.yy..', 'yo...oy.', '........'] },
  icoSword: { pal: { W: '#e8e4d4', s: '#8d939c', b: '#8a5a2b', y: '#ffd23e' }, rows: ['......W.', '.....WW.', '....WW..', '...WW...', '.y.W....', '..yy....', '.byy....', 'b.......'] },
  icoMage:  { pal: { p: '#7d4ea0', P: '#5c3677', f: '#f0c8a0', M: '#5fd9ff' }, rows: ['...p....', '..ppp...', '.ppppp..', '..fff...', '.ppppp.M', '.ppppp.M', '.ppppp.M', '..p.p..M'] },
  icoTurret:{ pal: { b: '#8a5a2b', B: '#6e4720', s: '#5d626b', W: '#e8e4d4' }, rows: ['......W.', '.....W..', 'b...W...', '.b.W....', '..bb....', '.bBBb...', 'bbBBbb..', 'ssssss..'] },
  icoWall:  { pal: { s: '#8d939c', S: '#5d626b' }, rows: ['s.s.s.s.', 'ssssssss', 'sSssSssS', 'ssssssss', 'ssSssSss', 'ssssssss', 'sSssSssS', 'ssssssss'] },
  icoFang:  { pal: { p: '#a85ccc', P: '#5c3677', m: '#e6ccff' }, rows: ['......m.', '.....pm.', '....ppm.', '...ppP..', '..ppP...', '.ppP....', 'PpP.....', 'm.......'] },
  icoHalo:  { pal: { y: '#ffd23e', Y: '#fff0a0', w: '#f2f4fa' }, rows: ['.yyyyy..', 'yY...Yy.', 'y.....y.', '.yyyyy..', '..ww....', '.wwww...', 'wwwwww..', '.wwww...'] },
  icoBrand: { pal: { r: '#ff4a3c', R: '#8d1f1f', s: '#5d626b', S: '#c0c8d4' }, rows: ['...rrrr.', '..rR..r.', '.rR...r.', '.R...rr.', '....Ss..', '...Ss...', '..Ss....', '.Ss.....'] },
  icoTide:  { pal: { c: '#5fd9ff', m: '#2e8fd6', M: '#1c5a8a', W: '#d8f6ff' }, rows: ['...m....', '..mcm...', '.mcccm..', 'mcWccmM.', 'mccccmM.', 'mcccmMM.', '.mmMMM..', '..MMM...'] },
};

/* Render a sprite onto a canvas at integer scale.
   palOver: optional palette overrides for tinted building variants. */
function drawSprite(canvas, sprite, scale, palOver) {
  const rows = sprite.rows;
  const pal = palOver ? Object.assign({}, sprite.pal, palOver) : sprite.pal;
  const w = Math.max(...rows.map(r => r.length));
  const h = rows.length;
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.' || c === ' ') continue;
      const col = pal[c];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

/* Convenience: make a fresh canvas element with a sprite drawn on it. */
function spriteCanvas(spriteName, scale, palOver) {
  const raster = RASTER_SPRITES[spriteName];
  if (raster) {
    const img = document.createElement('img');
    img.className = 'pix raster-sprite';
    img.src = raster.src;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.style.width = (raster.display[scale] || raster.display[4] || 112) + 'px';
    img.style.height = 'auto';
    img.onerror = () => {
      const fallback = document.createElement('canvas');
      fallback.className = 'pix';
      drawSprite(fallback, SPRITES[raster.fallback || spriteName], scale, palOver);
      img.replaceWith(fallback);
    };
    return img;
  }
  const c = document.createElement('canvas');
  c.className = 'pix';
  drawSprite(c, SPRITES[spriteName], scale, palOver);
  return c;
}

/* Draw a sprite onto an existing 2d context at (px, py). Used by the
   ambient animation layer for roaming creatures. */
function drawSpriteToCtx(ctx, sprite, px, py, scale) {
  const rows = sprite.rows;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.' || c === ' ') continue;
      const col = sprite.pal[c];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(px + x * scale, py + y * scale, scale, scale);
    }
  }
}
