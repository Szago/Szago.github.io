/* ======================================================================
   Class Statue Calculator
   - Income flow mirrors Tool3 (idle coins/min + daily rushes).
   - Cost table (statuecost.csv) embedded as [startLvl, endLvl, costPerLevelUp].
     Each individual level-up while in a bracket costs that amount.
   - 4 statues (Mage, Tank, Fighter, Healer) share one cost table and one
     shared coin pool.
   ====================================================================== */

const MAX_LEVEL = 300;

const STATUES = [
    { key: 'mage',    name: 'Mage',    icon: 'fa-hat-wizard' },
    { key: 'tank',    name: 'Tank',    icon: 'fa-shield-halved' },
    { key: 'fighter', name: 'Fighter', icon: 'fa-khanda' },
    { key: 'healer',  name: 'Healer',  icon: 'fa-staff-snake' }
];

// [startLevel, endLevel, costPerLevelUp]  (from statuecost.csv)
const COST_BRACKETS = [
    [1, 20, 3000],     [21, 40, 4200],    [41, 60, 5800],
    [61, 80, 8200],    [81, 100, 11500],  [101, 120, 16000],
    [121, 140, 22500], [141, 160, 31500], [161, 180, 44200],
    [181, 200, 62000], [201, 220, 86000], [221, 240, 120000],
    [241, 260, 170000],[261, 280, 240000],[281, 300, 330000]
];

// --- Cost lookup tables -------------------------------------------------

const levelUpCost = new Array(MAX_LEVEL + 1).fill(Infinity);
const cumCost = new Array(MAX_LEVEL + 1).fill(0);

(function buildTables() {
    for (let L = 1; L < MAX_LEVEL; L++) {
        const b = COST_BRACKETS.find(([s, e]) => L >= s && L <= e);
        if (b) levelUpCost[L] = b[2];
    }
    for (let L = 2; L <= MAX_LEVEL; L++) {
        cumCost[L] = cumCost[L - 1] + levelUpCost[L - 1];
    }
})();

function projectLevel(startLevel, budget) {
    let lvl = startLevel;
    let spent = 0;
    while (lvl < MAX_LEVEL && budget - spent >= levelUpCost[lvl]) {
        spent += levelUpCost[lvl];
        lvl++;
    }
    return { level: lvl, spent: spent, gained: lvl - startLevel };
}

let allocations = {};    
STATUES.forEach(s => allocations[s.key] = 0);

function abbreviate(num) {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9)  return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6)  return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3)  return (num / 1e3).toFixed(1) + 'K';
    return Math.floor(num).toString();
}

function fmt(num) {
    if (!isFinite(num)) return '∞';
    return document.getElementById('abbreviateCheckbox').checked
        ? abbreviate(num)
        : Math.floor(num).toLocaleString();
}

function formatTime(days) {
    if (days <= 0) return 'Maxed';
    if (!isFinite(days)) return 'No income';

    const totalMinutes = days * 24 * 60;
    const mo = Math.floor(days / 30);
    const d  = Math.floor(days % 30);
    const h  = Math.floor((days * 24) % 24);
    const m  = Math.floor(totalMinutes % 60);

    if (mo > 0) return `${mo}mo ${d}d`;
    if (d > 0)  return `${d}d ${h}h`;
    if (h > 0)  return `${h}h ${m}m`;
    return `${m}m`;
}

function getLevel(key) {
    const v = parseInt(document.getElementById(`lvl-${key}`).value);
    if (isNaN(v)) return 1;
    return Math.min(MAX_LEVEL, Math.max(1, v));
}

function incomePerDay() {
    const perMin = parseFloat(document.getElementById('idlePerMin').value) || 0;
    const rushes = parseInt(document.getElementById('rushes').value) || 0;
    const idlePerDay = perMin * 60 * 24;        // 24h of idle
    const rushBonus  = perMin * 60 * 2 * rushes; // each rush = 2h of idle
    return idlePerDay + rushBonus;
}

function buildStatueInputs() {
    const wrap = document.getElementById('statueInputs');
    wrap.innerHTML = STATUES.map(s => `
        <div class="statue-input">
            <label><i class="fas ${s.icon}"></i> ${s.name}</label>
            <input type="number" id="lvl-${s.key}" min="1" max="${MAX_LEVEL}" value="1"
                   placeholder="1" oninput="recalc()">
        </div>`).join('');
}

function buildSimRows() {
    const body = document.getElementById('simBody');
    body.innerHTML = STATUES.map(s => `
        <div class="sim-row">
            <div class="sim-head">
                <span class="sim-name"><i class="fas ${s.icon}"></i> ${s.name}</span>
                <span class="sim-proj" id="proj-${s.key}">Lv 1 &rarr; 1</span>
            </div>
            <div class="sim-control">
                <button class="step-btn" onclick="stepLevel('${s.key}', -1)" title="One level down">&minus;</button>
                <input type="range" class="alloc-slider" id="alloc-${s.key}" min="0" max="0"
                       value="0" step="any" oninput="onAllocInput('${s.key}')">
                <button class="step-btn" onclick="stepLevel('${s.key}', 1)" title="One level up">+</button>
            </div>
            <div class="sim-foot">
                <span id="allocAmt-${s.key}">0 coins</span>
                <span class="sim-gain" id="gain-${s.key}">+0 levels</span>
            </div>
        </div>`).join('');
}

function totalAllocated() {
    return STATUES.reduce((sum, s) => sum + allocations[s.key], 0);
}

function onAllocInput(key) {
    const budget = parseFloat(document.getElementById('stackedCoins').value) || 0;
    const slider = document.getElementById(`alloc-${key}`);
    let value = parseFloat(slider.value) || 0;

    
    const others = totalAllocated() - allocations[key];
    const maxForThis = Math.max(0, budget - others);
    if (value > maxForThis) {
        value = maxForThis;
        slider.value = value;
    }
    allocations[key] = value;
    renderSimulator();
}

function stepLevel(key, dir) {
    const budget = parseFloat(document.getElementById('stackedCoins').value) || 0;
    const base = getLevel(key);
    const current = projectLevel(base, allocations[key]).level;

    let target = current + dir;
    if (target < base) target = base;
    if (target > MAX_LEVEL) target = MAX_LEVEL;

    let needed = cumCost[target] - cumCost[base];

    const others = totalAllocated() - allocations[key];
    const maxForThis = Math.max(0, budget - others);
    if (needed > maxForThis) needed = maxForThis;

    allocations[key] = needed;
    const sl = document.getElementById(`alloc-${key}`);
    if (sl) sl.value = needed;
    renderSimulator();
}

function resetAllocations() {
    STATUES.forEach(s => {
        allocations[s.key] = 0;
        const sl = document.getElementById(`alloc-${s.key}`);
        if (sl) sl.value = 0;
    });
    renderSimulator();
}

function renderSimulator() {
    const budget = parseFloat(document.getElementById('stackedCoins').value) || 0;

    STATUES.forEach(s => {
        const sl = document.getElementById(`alloc-${s.key}`);
        sl.max = budget;
        sl.step = budget > 0 ? Math.max(1, budget / 1000) : 1;
        if (allocations[s.key] > budget) { allocations[s.key] = budget; sl.value = budget; }
    });

    let usedToLevel = 0; 
    STATUES.forEach(s => {
        const base = getLevel(s.key);
        const proj = projectLevel(base, allocations[s.key]);
        usedToLevel += proj.spent;

        document.getElementById(`proj-${s.key}`).innerHTML = `Lv ${base} &rarr; ${proj.level}`;
        document.getElementById(`allocAmt-${s.key}`).textContent = fmt(allocations[s.key]) + ' coins';

        const gainEl = document.getElementById(`gain-${s.key}`);
        gainEl.textContent = `+${proj.gained} levels`;
        gainEl.classList.toggle('zero', proj.gained === 0);
    });

    const allocated = totalAllocated();
    document.getElementById('allocated').textContent = fmt(allocated);
    document.getElementById('budgetTotal').textContent = fmt(budget);
    document.getElementById('budgetLeft').textContent = fmt(Math.max(0, budget - usedToLevel));

    const fill = document.getElementById('budgetFill');
    fill.style.width = budget > 0 ? Math.min(100, (allocated / budget) * 100) + '%' : '0%';
}

function timeToMax(remaining, banked, perDay) {
    if (remaining <= 0) return 'Maxed';
    const needed = Math.max(0, remaining - banked);
    if (needed === 0) return 'In bank ✓';     // already affordable right now
    if (perDay <= 0) return 'No income';
    return formatTime(needed / perDay);
}

function renderSummary() {
    const perDay = incomePerDay();
    const banked = parseFloat(document.getElementById('stackedCoins').value) || 0;
    document.getElementById('incomePerDay').textContent = fmt(perDay);
    document.getElementById('incomePerHour').textContent = fmt(perDay / 24);

    let totalInvested = 0;
    let totalRemaining = 0;

    const rows = STATUES.map(s => {
        const lvl = getLevel(s.key);
        const invested = cumCost[lvl];
        const remaining = cumCost[MAX_LEVEL] - cumCost[lvl];
        totalInvested += invested;
        totalRemaining += remaining;

        const timeStr = timeToMax(remaining, banked, perDay);
        const pct = (lvl / MAX_LEVEL) * 100;

        return `
            <div class="summary-item">
                <div class="summary-top">
                    <span class="s-name"><i class="fas ${s.icon}"></i> ${s.name}</span>
                    <span class="s-lvl">Lv ${lvl}/${MAX_LEVEL}</span>
                </div>
                <div class="s-progress"><div class="s-progress-fill" style="width:${pct}%"></div></div>
                <div class="summary-stats">
                    <div><label>Invested</label><span>${fmt(invested)}</span></div>
                    <div><label>To max</label><span>${fmt(remaining)}</span></div>
                    <div><label>Time to max</label><span class="accent-text">${timeStr}</span></div>
                </div>
            </div>`;
    }).join('');

    document.getElementById('summaryTable').innerHTML = rows;
    document.getElementById('totalInvested').textContent = fmt(totalInvested);
    document.getElementById('totalRemaining').textContent = fmt(totalRemaining);

    document.getElementById('totalTime').textContent = timeToMax(totalRemaining, banked, perDay);
}

function recalc() {
    document.getElementById('rushesDisplay').textContent =
        document.getElementById('rushes').value;
    renderSummary();
    renderSimulator();
}

window.addEventListener('DOMContentLoaded', () => {
    buildStatueInputs();
    buildSimRows();
    recalc();
});
