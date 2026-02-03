// Global variable to store the level data so we don't fetch it 100 times a second
let globalLevelData = [];

// 1. Initialize: Fetch data once, setup dropdown, and start the clock
window.addEventListener('DOMContentLoaded', () => {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            globalLevelData = data.levels;
            populateClickTiers(globalLevelData);
            
            // Run initial calculations now that we have data
            calculateRemainingTime();
            calculateLeeway();
            showRemainingEventTime();
        })
        .catch(error => console.error('Error fetching data:', error));

    // Clock Interval
    setInterval(function() {
        const currentDate = new Date();
        const currentDateString = currentDate.toISOString().slice(0, 16);
        document.getElementById('current-date').value = currentDateString;
        
        // We only recalculate time/leeway, we don't re-fetch data
        if(globalLevelData.length > 0) {
            calculateRemainingTime();
            calculateLeeway();
            showRemainingEventTime();
        }
    }, 1000);
});

// 2. Generate the Dropdown options based on unique tiers in JSON
function populateClickTiers(levels) {
    const tierSelect = document.getElementById('click-tier');
    tierSelect.innerHTML = ''; // Clear "Loading..."

    // Add Default Option
    const defaultOption = document.createElement('option');
    defaultOption.value = 'default';
    defaultOption.textContent = 'Default (Natural Progression)';
    tierSelect.appendChild(defaultOption);

    // Find unique combinations of XP and Cost
    const uniqueTiers = [];
    const seen = new Set();

    levels.forEach(level => {
        const identifier = `${level.xp_per_click}-${level.cost_per_click}`;
        if (!seen.has(identifier)) {
            seen.add(identifier);
            uniqueTiers.push({
                xp: level.xp_per_click,
                cost: level.cost_per_click
            });
        }
    });

    // Create options for each unique tier
    uniqueTiers.forEach(tier => {
        const option = document.createElement('option');
        // We store the values in the value attribute like "1000,10"
        option.value = `${tier.xp},${tier.cost}`; 
        option.textContent = `${tier.xp} XP per click (Cost: ${tier.cost})`;
        tierSelect.appendChild(option);
    });
}


// 3. Updated Calculation
function calculateRemainingTime() {
    // If data isn't loaded yet, stop.
    if (globalLevelData.length === 0) return;

    const currentPleasureLevel = parseInt(document.getElementById('current-pleasure-level').value) || 0;
    const currentPleasureXP = parseInt(document.getElementById('current-pleasure-xp').value) || 0;
    const selectedTierVal = document.getElementById('click-tier').value;

    let totalRemainingXP = 0;
    let totalRemainingTime = 0;

    // Parse selected manual tier if it's not default
    let manualXP = 0;
    let manualCost = 0;
    if (selectedTierVal !== 'default') {
        [manualXP, manualCost] = selectedTierVal.split(',').map(Number);
    }

    // Loop through levels
    for (let i = currentPleasureLevel; i < 15; i++) {
        const currentLevelData = globalLevelData.find(levelData => levelData.level === i);
        
        if (!currentLevelData) continue; // Safety check

        // LOGIC: Determine which stats to use for this specific level
        let activeXP = currentLevelData.xp_per_click;
        let activeCost = currentLevelData.cost_per_click;

        // If user selected a booster, we use the booster stats ONLY IF 
        // they are better than what the level naturally gives.
        // (e.g. If I bought 240XP tier, use it on Lvl 1. But if I reach Lvl 13 (1000XP), use natural 1000XP).
        if (selectedTierVal !== 'default') {
            if (manualXP > activeXP) {
                activeXP = manualXP;
                activeCost = manualCost;
            }
        }

        // Calculate XP needed for this specific level step
        // If it's the first loop (current level), subtract already gained XP
        const remainingXPNeeded = currentLevelData.xp_for_next_level - (i === currentPleasureLevel ? currentPleasureXP : 0);

        // Calculate time
        // validation to prevent division by zero
        if (activeXP > 0) {
            const remainingTimeNeeded = (remainingXPNeeded / activeXP) * activeCost;
            totalRemainingXP += remainingXPNeeded;
            totalRemainingTime += remainingTimeNeeded;
        }
    }

    // Display Result
    const hours = totalRemainingTime / 60;
    const days = hours / 24;

    document.getElementById('remaining-time').textContent = `${totalRemainingTime.toFixed(2)} minutes OR ${hours.toFixed(2)} hours OR ${days.toFixed(2)} days`;
}

// Keep existing helper functions
function calculateLeeway() {
    const remainingTimeText = document.getElementById('remaining-time').textContent;
    if (!remainingTimeText) return; // Guard clause
    
    const totalRemainingTime = parseFloat(remainingTimeText.split(' ')[0]) || 0;

    const remainingEventTimeText = document.getElementById('remaining-event-time').textContent;
    const totalRemainingEventTime = parseFloat(remainingEventTimeText.split(' ')[0]) || 0;

    const leeway = totalRemainingEventTime - totalRemainingTime;
    const hours = leeway / 60;
    const days = hours / 24;

    document.getElementById('leeway-minutes').textContent = `${leeway.toFixed(2)} minutes OR ${hours.toFixed(2)} hours OR ${days.toFixed(2)} days`;
}

function showRemainingEventTime() {
    const eventFinishDate = new Date(document.getElementById('event-finish-date').value);
    const currentDate = new Date();
    // Adjust for timezone logic as per your original co
    const currentDateUTC = new Date(currentDate.getTime() + currentDate.getTimezoneOffset() * 60000);

    const remainingEventTimeInMinutes = (eventFinishDate - currentDateUTC) / (1000 * 60);
    const remainingEventTimeInHours = remainingEventTimeInMinutes / 60;
    const remainingEventTimeInDays = remainingEventTimeInHours / 24;
    document.getElementById('remaining-event-time').textContent = `${remainingEventTimeInMinutes.toFixed(2)} minutes OR ${remainingEventTimeInHours.toFixed(2)} hours OR ${remainingEventTimeInDays.toFixed(2)} days`;
}

function goBack() {
    window.location.href = "/EROS/index.html";
}