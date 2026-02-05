// Global variable to store the level data so we don't fetch it 100 times a second
let globalLevelData = [];

// --- 1. INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            globalLevelData = data.levels;
            populateClickTiers(globalLevelData);
            
            // Initial trigger
            runAllCalculations();
        })
        .catch(error => console.error('Error fetching data:', error));

    // Clock Interval: Updates every second
    setInterval(function() {
        const currentDate = new Date();
        const currentDateString = currentDate.toISOString().slice(0, 16);
        document.getElementById('current-date').value = currentDateString;
        
        if(globalLevelData.length > 0) {
            runAllCalculations();
        }
    }, 1000);
});

// --- 2. UI HELPERS ---

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function populateClickTiers(levels) {
    const tierSelect = document.getElementById('click-tier');
    tierSelect.innerHTML = ''; 

    const defaultOption = document.createElement('option');
    defaultOption.value = 'default';
    defaultOption.textContent = 'Default (Natural Progression)';
    tierSelect.appendChild(defaultOption);

    const uniqueTiers = [];
    const seen = new Set();

    levels.forEach(level => {
        const identifier = `${level.xp_per_click}-${level.cost_per_click}`;
        if (!seen.has(identifier)) {
            seen.add(identifier);
            uniqueTiers.push({ xp: level.xp_per_click, cost: level.cost_per_click });
        }
    });

    uniqueTiers.forEach(tier => {
        const option = document.createElement('option');
        option.value = `${tier.xp},${tier.cost}`; 
        option.textContent = `${tier.xp} XP per click (Cost: ${tier.cost})`;
        tierSelect.appendChild(option);
    });
}

/**
 * Converts raw minutes into "Xd Xh Xm" format
 */
function formatHumanTime(totalMinutes) {
    const isNegative = totalMinutes < 0;
    const absMinutes = Math.abs(totalMinutes);

    const d = Math.floor(absMinutes / (24 * 60));
    const h = Math.floor((absMinutes % (24 * 60)) / 60);
    const m = Math.floor(absMinutes % 60);

    let result = "";
    if (d > 0) result += `<span class="num">${d}</span><span class="unit">d</span> `;
    if (h > 0 || d > 0) result += `<span class="num">${h}</span><span class="unit">h</span> `;
    result += `<span class="num">${m}</span><span class="unit">m</span>`;

    return isNegative ? `<span class="overdue">-${result}</span>` : result;
}

// --- 3. CORE CALCULATIONS ---

function runAllCalculations() {
    const finishMin = calculateRemainingTime();
    const eventMin = getRemainingEventMinutes();
    
    // Update Displays
    document.getElementById('remaining-time-display').innerHTML = formatHumanTime(finishMin);
    document.getElementById('event-time-display').innerHTML = formatHumanTime(eventMin);
    
    // Leeway logic
    const leeway = eventMin - finishMin;
    const leewayEl = document.getElementById('leeway-display');
    const statusEl = document.getElementById('status-indicator');
    
    leewayEl.innerHTML = formatHumanTime(leeway);

    // Visual feedback for Leeway
    if (leeway < 0) {
        statusEl.textContent = "NOT ENOUGH TIME";
        statusEl.className = "status-badge danger";
        leewayEl.parentElement.classList.add('text-danger');
    } else if (leeway < 480) { // Less than 8 hours
        statusEl.textContent = "CUTTING IT CLOSE";
        statusEl.className = "status-badge warning";
        leewayEl.parentElement.classList.remove('text-danger');
    } else {
        statusEl.textContent = "ON TRACK";
        statusEl.className = "status-badge success";
        leewayEl.parentElement.classList.remove('text-danger');
    }
}

function calculateRemainingTime() {
    if (globalLevelData.length === 0) return 0;

    const currentPleasureLevel = parseInt(document.getElementById('current-pleasure-level').value) || 0;
    const currentPleasureXP = parseInt(document.getElementById('current-pleasure-xp').value) || 0;
    const selectedTierVal = document.getElementById('click-tier').value;

    let totalRemainingTime = 0;

    let manualXP = 0;
    let manualCost = 0;
    if (selectedTierVal !== 'default') {
        [manualXP, manualCost] = selectedTierVal.split(',').map(Number);
    }

    for (let i = currentPleasureLevel; i < 15; i++) {
        const currentLevelData = globalLevelData.find(levelData => levelData.level === i);
        if (!currentLevelData) continue;

        let activeXP = currentLevelData.xp_per_click;
        let activeCost = currentLevelData.cost_per_click;

        // Use booster if stronger than natural progression
        if (selectedTierVal !== 'default' && manualXP > activeXP) {
            activeXP = manualXP;
            activeCost = manualCost;
        }

        const remainingXPNeeded = currentLevelData.xp_for_next_level - (i === currentPleasureLevel ? currentPleasureXP : 0);

        if (activeXP > 0) {
            totalRemainingTime += (remainingXPNeeded / activeXP) * activeCost;
        }
    }
    return totalRemainingTime;
}

function getRemainingEventMinutes() {
    const eventFinishDate = new Date(document.getElementById('event-finish-date').value);
    const currentDate = new Date();
    // UTC adjustment
    const currentDateUTC = new Date(currentDate.getTime() + currentDate.getTimezoneOffset() * 60000);
    return (eventFinishDate - currentDateUTC) / (1000 * 60);
}

function goBack() {
    window.location.href = "/EROS/index.html";
}