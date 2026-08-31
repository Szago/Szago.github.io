const CHARACTER_DATA_URL = '../../Characters/characters.json';
const MAX_LEVEL = 240;
const MAX_RANK = 21;

const CORE_STATS = [
    { key: 'damage', label: 'Damage', icon: 'fa-burst', rawPrefix: 'damage' },
    { key: 'health', label: 'Health', icon: 'fa-heart', rawPrefix: 'health' },
    { key: 'armor', label: 'Armor', icon: 'fa-shield', rawPrefix: 'armor' },
    { key: 'magicRes', label: 'Magic Resist', icon: 'fa-wand-magic-sparkles', rawPrefix: 'magicRes' }
];

const SPECIAL_STATS = [
    { key: 'criticalChance', label: 'Critical Chance', icon: 'fa-crosshairs', rawField: 'criticalChance' },
    { key: 'criticalDamage', label: 'Critical Damage', icon: 'fa-bolt', rawField: 'criticalDamageMultiplier' },
    { key: 'tenacity', label: 'Tenacity', icon: 'fa-hand-fist', rawField: 'tenacity' }
];

const ALL_STATS = [...CORE_STATS, ...SPECIAL_STATS];
const formatter = new Intl.NumberFormat('en-US');
const f32 = Math.fround;

let characters = [];
let selectedCharacter = null;

function clampInteger(value, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return minimum;
    return Math.min(maximum, Math.max(minimum, parsed));
}

function numberInput(id) {
    const value = Number.parseFloat(document.getElementById(id).value);
    return Number.isFinite(value) ? value : 0;
}

function gameValue(data, name, fallback = 0) {
    const value = data[name];
    return value === undefined || value === null ? fallback : value;
}

// Mirrors Character_data.GetStatValue and Unity's float32 intermediates.
function calculateCoreStat(data, prefix, level, rank, percentBonus = 0, flatBonus = 0) {
    const base = f32(gameValue(data, `${prefix}Base`));
    const multiplier = f32(gameValue(data, `${prefix}Multiplier`));
    const exponential = f32(gameValue(data, `${prefix}Exponential`));
    const rankModifier = f32(f32(rank - 1) * f32(0.05));
    const scaledLevel = f32(f32(level) * f32(multiplier / f32(100)));
    const rankExponent = f32(f32(rankModifier * f32(level)) / f32(1000));
    const exponent = f32(f32(exponential / f32(100)) + rankExponent);
    const growth = f32(Math.pow(scaledLevel, exponent));
    const preModifier = f32(f32(base + growth) - f32(1));
    const modifier = f32(f32(1) + f32(percentBonus / 100));
    const modified = f32(preModifier * modifier);
    const withRank = f32(modified + f32(rank * 10));
    return Math.trunc(f32(withRank + f32(flatBonus)));
}

function calculateSpecialStat(data, field, percentBonus = 0, flatPoints = 0) {
    const base = f32(gameValue(data, field));
    const modifier = f32(f32(1) + f32(percentBonus / 100));
    return f32(f32(base * modifier) + f32(flatPoints / 100));
}

function calculateStats(character, level, rank, withModifiers) {
    const data = character.gameData;
    const result = {};

    CORE_STATS.forEach(stat => {
        const percent = withModifiers ? numberInput(`percent-${stat.key}`) : 0;
        const flat = withModifiers ? numberInput(`flat-${stat.key}`) : 0;
        result[stat.key] = calculateCoreStat(data, stat.rawPrefix, level, rank, percent, flat);
    });

    SPECIAL_STATS.forEach(stat => {
        const percent = withModifiers ? numberInput(`percent-${stat.key}`) : 0;
        const flat = withModifiers ? numberInput(`flat-${stat.key}`) : 0;
        result[stat.key] = calculateSpecialStat(data, stat.rawField, percent, flat);
    });

    return result;
}

function abbreviate(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
    if (absolute >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (absolute >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (absolute >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return formatter.format(value);
}

function formatCore(value) {
    return document.getElementById('abbreviateCheckbox').checked ? abbreviate(value) : formatter.format(value);
}

function formatPercent(value) {
    const percentage = value * 100;
    return `${Number(percentage.toFixed(3)).toLocaleString()}%`;
}

function renderStatCards(targetId, values, baseline = null) {
    document.getElementById(targetId).innerHTML = ALL_STATS.map(stat => {
        const isSpecial = SPECIAL_STATS.some(item => item.key === stat.key);
        const value = isSpecial ? formatPercent(values[stat.key]) : formatCore(values[stat.key]);
        let delta = '';

        if (baseline) {
            const rawDelta = values[stat.key] - baseline[stat.key];
            const deltaText = isSpecial ? formatPercent(rawDelta) : formatCore(rawDelta);
            delta = `<div class="stat-delta ${rawDelta > 0 ? 'positive' : ''}">${rawDelta >= 0 ? '+' : ''}${deltaText} vs baseline</div>`;
        }

        return `
            <div class="stat-card">
                <div class="stat-label"><i class="fas ${stat.icon}"></i>${stat.label}</div>
                <div class="stat-value">${value}</div>
                ${delta}
            </div>`;
    }).join('');
}

function renderModifierRows() {
    document.getElementById('modifierRows').innerHTML = ALL_STATS.map(stat => `
        <tr>
            <td><i class="fas ${stat.icon}"></i> ${stat.label}</td>
            <td><input type="number" id="percent-${stat.key}" step="0.01" value="0" aria-label="${stat.label} percentage bonus"></td>
            <td><input type="number" id="flat-${stat.key}" step="0.01" value="0" aria-label="${stat.label} flat bonus"></td>
        </tr>`).join('');

    document.querySelectorAll('#modifierRows input').forEach(input => {
        input.addEventListener('input', recalculate);
    });
}

function renderMeta(character) {
    const data = character.gameData;
    const damageType = gameValue(data, 'damageType') === 1 ? 'Magical' : 'Physical';
    const position = gameValue(data, 'formationPreferredPosition') === 1 ? 'Backline' : 'Frontline';
    const secondary = character.secondaryClass && character.secondaryClass !== character.class
        ? `${character.class} / ${character.secondaryClass}`
        : character.class;

    const chips = [
        ['fa-shield-halved', 'Class', secondary],
        ['fa-gem', 'Rarity', character.rarity],
        ['fa-wind', 'Element', character.element],
        ['fa-dna', 'Race', character.race],
        ['fa-burst', 'Damage', damageType],
        ['fa-people-arrows', 'Position', position]
    ];

    document.getElementById('unitMeta').innerHTML = chips.map(([icon, label, value]) => `
        <span class="meta-chip"><i class="fas ${icon}"></i>${label}: <strong>${value || '-'}</strong></span>`).join('');
}

function modifierCount() {
    return ALL_STATS.reduce((count, stat) => {
        return count + (numberInput(`percent-${stat.key}`) !== 0 || numberInput(`flat-${stat.key}`) !== 0 ? 1 : 0);
    }, 0);
}

function recalculate() {
    if (!selectedCharacter) return;

    const levelInput = document.getElementById('levelInput');
    const rankInput = document.getElementById('rankInput');
    const level = clampInteger(levelInput.value, 1, MAX_LEVEL);
    const rank = clampInteger(rankInput.value, 1, MAX_RANK);
    levelInput.value = level;
    rankInput.value = rank;

    const baseline = calculateStats(selectedCharacter, level, rank, false);
    const adjusted = calculateStats(selectedCharacter, level, rank, true);

    renderStatCards('baselineStats', baseline);
    renderStatCards('adjustedStats', adjusted, baseline);

    const count = modifierCount();
    document.getElementById('modifierSummary').textContent = count
        ? `${count} modified stat${count === 1 ? '' : 's'}`
        : 'No modifiers';

    saveState();
}

function selectCharacter() {
    const id = document.getElementById('characterSelect').value;
    selectedCharacter = characters.find(character => character.id === id) || characters[0] || null;
    if (!selectedCharacter) return;

    renderMeta(selectedCharacter);
    recalculate();
}

function resetModifiers() {
    document.querySelectorAll('#modifierRows input').forEach(input => { input.value = 0; });
    recalculate();
}

function saveState() {
    if (!selectedCharacter) return;

    const modifiers = {};
    ALL_STATS.forEach(stat => {
        modifiers[stat.key] = {
            percent: numberInput(`percent-${stat.key}`),
            flat: numberInput(`flat-${stat.key}`)
        };
    });

    localStorage.setItem('eros-unitstats-state', JSON.stringify({
        characterId: selectedCharacter.id,
        level: clampInteger(document.getElementById('levelInput').value, 1, MAX_LEVEL),
        rank: clampInteger(document.getElementById('rankInput').value, 1, MAX_RANK),
        abbreviate: document.getElementById('abbreviateCheckbox').checked,
        modifiers
    }));
}

function loadState() {
    try {
        return JSON.parse(localStorage.getItem('eros-unitstats-state')) || {};
    } catch (error) {
        return {};
    }
}

function restoreState(state) {
    document.getElementById('levelInput').value = clampInteger(state.level || 221, 1, MAX_LEVEL);
    document.getElementById('rankInput').value = clampInteger(state.rank || 15, 1, MAX_RANK);
    document.getElementById('abbreviateCheckbox').checked = Boolean(state.abbreviate);

    ALL_STATS.forEach(stat => {
        const saved = state.modifiers && state.modifiers[stat.key];
        if (!saved) return;
        document.getElementById(`percent-${stat.key}`).value = saved.percent || 0;
        document.getElementById(`flat-${stat.key}`).value = saved.flat || 0;
    });
}

async function initialize() {
    renderModifierRows();

    const state = loadState();
    try {
        const response = await fetch(CHARACTER_DATA_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        characters = (await response.json()).filter(character => character.gameData);
    } catch (error) {
        const message = document.getElementById('loadError');
        message.hidden = false;
        message.textContent = `Could not load character data: ${error.message}`;
        return;
    }

    const select = document.getElementById('characterSelect');
    select.innerHTML = characters.map(character => `
        <option value="${character.id}">${character.name} - ${character.class}, ${character.rarity}</option>`).join('');
    select.disabled = false;

    const initialId = characters.some(character => character.id === state.characterId)
        ? state.characterId
        : (characters.find(character => character.id === 'gabriela') || characters[0]).id;
    select.value = initialId;

    restoreState(state);
    selectCharacter();
}

document.getElementById('characterSelect').addEventListener('change', selectCharacter);
document.getElementById('levelInput').addEventListener('input', recalculate);
document.getElementById('rankInput').addEventListener('input', recalculate);
document.getElementById('abbreviateCheckbox').addEventListener('change', recalculate);
document.getElementById('resetModifiers').addEventListener('click', resetModifiers);

initialize();
