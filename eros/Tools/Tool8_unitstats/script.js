const CHARACTER_DATA_URL = '../../Characters/characters.json';
const MAX_LEVEL = 240;
const MAX_RANK = 21;
const MAX_AFFECTION = 20;

const CORE_STATS = [
    { key: 'damage', label: 'Damage', icon: 'fa-burst', rawPrefix: 'damage' },
    { key: 'armor', label: 'Armor', icon: 'fa-shield', rawPrefix: 'armor' },
    { key: 'magicRes', label: 'Magic Resist', icon: 'fa-wand-magic-sparkles', rawPrefix: 'magicRes' },
    { key: 'health', label: 'Health', icon: 'fa-heart', rawPrefix: 'health' }
];

const AFFECTION_STEP_BONUSES = [0.5, 1, 1.5, 3, 4];
const formatter = new Intl.NumberFormat('en-US');
const f32 = Math.fround;

let characters = [];
let selectedCharacter = null;
let filteredCharacters = [];
let highlightedResult = -1;

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

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Affection advances Damage -> Armor -> Magic Resist -> Health at every tier.
function calculateAffectionBonuses(level) {
    const bonuses = Object.fromEntries(CORE_STATS.map(stat => [stat.key, 0]));
    for (let step = 1; step <= level; step += 1) {
        const stat = CORE_STATS[(step - 1) % CORE_STATS.length];
        const tier = Math.floor((step - 1) / CORE_STATS.length);
        bonuses[stat.key] += AFFECTION_STEP_BONUSES[tier];
    }
    return bonuses;
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

function calculateStats(character, level, rank, affection) {
    const data = character.gameData;
    const affectionBonuses = calculateAffectionBonuses(affection);
    const result = {};

    CORE_STATS.forEach(stat => {
        const flatBonus = numberInput(`main-${stat.key}`) + numberInput(`class-${stat.key}`);
        result[stat.key] = calculateCoreStat(
            data,
            stat.rawPrefix,
            level,
            rank,
            affectionBonuses[stat.key],
            flatBonus
        );
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
    return globalAbbreviationEnabled() ? abbreviate(value) : formatter.format(value);
}

function renderStatCards(values) {
    document.getElementById('calculatedStats').innerHTML = CORE_STATS.map(stat => `
        <div class="stat-card">
            <div class="stat-label"><i class="fas ${stat.icon}"></i>${stat.label}</div>
            <div class="stat-value">${formatCore(values[stat.key])}</div>
        </div>`).join('');
}

function renderStatueRows(targetId, prefix) {
    document.getElementById(targetId).innerHTML = CORE_STATS.map(stat => `
        <label class="statue-field" for="${prefix}-${stat.key}">
            <span><i class="fas ${stat.icon}"></i>${stat.label}</span>
            <input type="number" id="${prefix}-${stat.key}" step="1" value="0" aria-label="${stat.label} flat bonus">
        </label>`).join('');
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
        <span class="meta-chip"><i class="fas ${icon}"></i>${label}: <strong>${escapeHtml(value || '-')}</strong></span>`).join('');
}

function characterSearchText(character) {
    return [character.name, character.class, character.secondaryClass, character.rarity, character.element]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
}

function openCharacterResults(query = '') {
    const normalized = query.trim().toLocaleLowerCase();
    filteredCharacters = normalized
        ? characters.filter(character => characterSearchText(character).includes(normalized))
        : characters;
    highlightedResult = -1;
    renderCharacterResults();
}

function renderCharacterResults() {
    const results = document.getElementById('characterResults');
    results.innerHTML = filteredCharacters.length
        ? filteredCharacters.map((character, index) => `
            <button type="button" class="character-result${index === highlightedResult ? ' highlighted' : ''}" role="option" data-character-id="${escapeHtml(character.id)}" aria-selected="${index === highlightedResult}">
                <span>${escapeHtml(character.name)}</span>
                <small>${escapeHtml(character.class)} · ${escapeHtml(character.rarity)}</small>
            </button>`).join('')
        : '<div class="no-results">No characters found</div>';
    results.hidden = false;
    document.getElementById('characterSearch').setAttribute('aria-expanded', 'true');

    results.querySelectorAll('.character-result').forEach(button => {
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => chooseCharacter(button.dataset.characterId));
    });
}

function closeCharacterResults() {
    document.getElementById('characterResults').hidden = true;
    document.getElementById('characterSearch').setAttribute('aria-expanded', 'false');
    highlightedResult = -1;
}

function chooseCharacter(id) {
    selectedCharacter = characters.find(character => character.id === id) || characters[0] || null;
    if (!selectedCharacter) return;

    document.getElementById('characterSearch').value = selectedCharacter.name;
    closeCharacterResults();
    renderMeta(selectedCharacter);
    recalculate();
}

function moveCharacterHighlight(direction) {
    if (!filteredCharacters.length) return;
    highlightedResult = (highlightedResult + direction + filteredCharacters.length) % filteredCharacters.length;
    renderCharacterResults();
    document.querySelector('.character-result.highlighted')?.scrollIntoView({ block: 'nearest' });
}

function handleCharacterKeydown(event) {
    const resultsOpen = !document.getElementById('characterResults').hidden;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!resultsOpen) openCharacterResults(event.currentTarget.value);
        moveCharacterHighlight(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && resultsOpen && highlightedResult >= 0) {
        event.preventDefault();
        chooseCharacter(filteredCharacters[highlightedResult].id);
    } else if (event.key === 'Escape') {
        closeCharacterResults();
        event.currentTarget.value = selectedCharacter ? selectedCharacter.name : '';
    }
}

function recalculate() {
    if (!selectedCharacter) return;

    const levelInput = document.getElementById('levelInput');
    const rankInput = document.getElementById('rankInput');
    const affectionInput = document.getElementById('affectionInput');
    const level = clampInteger(levelInput.value, 1, MAX_LEVEL);
    const rank = clampInteger(rankInput.value, 1, MAX_RANK);
    const affection = clampInteger(affectionInput.value, 1, MAX_AFFECTION);
    levelInput.value = level;
    rankInput.value = rank;
    affectionInput.value = affection;

    renderStatCards(calculateStats(selectedCharacter, level, rank, affection));
    saveState();
}

function resetModifiers() {
    document.querySelectorAll('.statue-fields input').forEach(input => { input.value = 0; });
    recalculate();
}

function saveState() {
    if (!selectedCharacter) return;

    const statues = {};
    CORE_STATS.forEach(stat => {
        statues[stat.key] = {
            main: numberInput(`main-${stat.key}`),
            class: numberInput(`class-${stat.key}`)
        };
    });

    localStorage.setItem('eros-unitstats-state', JSON.stringify({
        characterId: selectedCharacter.id,
        level: clampInteger(document.getElementById('levelInput').value, 1, MAX_LEVEL),
        rank: clampInteger(document.getElementById('rankInput').value, 1, MAX_RANK),
        affection: clampInteger(document.getElementById('affectionInput').value, 1, MAX_AFFECTION),
        statues
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
    document.getElementById('affectionInput').value = clampInteger(state.affection || 1, 1, MAX_AFFECTION);

    CORE_STATS.forEach(stat => {
        const saved = state.statues && state.statues[stat.key];
        if (!saved) return;
        document.getElementById(`main-${stat.key}`).value = saved.main || 0;
        document.getElementById(`class-${stat.key}`).value = saved.class || 0;
    });
}

async function initialize() {
    renderStatueRows('mainStatueRows', 'main');
    renderStatueRows('classStatueRows', 'class');
    document.querySelectorAll('.statue-fields input').forEach(input => input.addEventListener('input', recalculate));

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

    const search = document.getElementById('characterSearch');
    search.disabled = false;
    restoreState(state);

    const initialId = characters.some(character => character.id === state.characterId)
        ? state.characterId
        : (characters.find(character => character.id === 'gabriela') || characters[0]).id;
    chooseCharacter(initialId);
}

const characterSearch = document.getElementById('characterSearch');
characterSearch.addEventListener('focus', event => openCharacterResults(event.currentTarget.value === selectedCharacter?.name ? '' : event.currentTarget.value));
characterSearch.addEventListener('input', event => openCharacterResults(event.currentTarget.value));
characterSearch.addEventListener('keydown', handleCharacterKeydown);
characterSearch.addEventListener('blur', () => {
    closeCharacterResults();
    characterSearch.value = selectedCharacter ? selectedCharacter.name : '';
});
document.getElementById('levelInput').addEventListener('input', recalculate);
document.getElementById('rankInput').addEventListener('input', recalculate);
document.getElementById('affectionInput').addEventListener('input', recalculate);
document.getElementById('resetModifiers').addEventListener('click', resetModifiers);
window.addEventListener('eros:abbreviation-change', recalculate);

initialize();
