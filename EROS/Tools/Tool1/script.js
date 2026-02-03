let levels = null;
let isRangeMode = false;
let useAbbreviatedDisplayMode = false;

async function init() {
    try {
        const response = await fetch('levels.json');
        const data = await response.json();
        levels = data.levels;
    } catch (e) { console.error("Data load failed", e); }
}
init();

function setMode(mode) {
    isRangeMode = (mode === 'range');
    
    // UI Updates
    document.getElementById('simpleInputs').style.display = isRangeMode ? 'none' : 'block';
    document.getElementById('rangeInputs').style.display = isRangeMode ? 'flex' : 'none';
    
    document.getElementById('btnSimple').classList.toggle('active', !isRangeMode);
    document.getElementById('btnRange').classList.toggle('active', isRangeMode);
    
    retrieveCost();
}

function abbreviateNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
}

function calculateTotalCost(level) {
    const endIdx = parseInt(level) - 1;
    if (isNaN(endIdx) || endIdx < 0) return null;
    return levels.slice(0, endIdx + 1).reduce((a, b) => a + b, 0);
}

function updateDisplayMode() {
    useAbbreviatedDisplayMode = document.getElementById('displayModeCheckbox').checked;
    retrieveCost();
}

function retrieveCost() {
    if (!levels) return;
    
    const resultVal = document.getElementById('resultValue');
    const subVal = document.getElementById('secondaryResult');
    const tableCont = document.getElementById('tableResult');

    let total = 0;
    let breakdown = [];

    if (isRangeMode) {
        const start = parseInt(document.getElementById('startLevelInput').value) || 0;
        const end = parseInt(document.getElementById('endLevelInput').value) || 0;

        if (end > start && end <= 220) {
            const startCost = calculateTotalCost(start) || 0;
            const endCost = calculateTotalCost(end) || 0;
            total = endCost - startCost;
            
            for (let i = start; i < end; i++) {
                breakdown.push({ s: i, e: i + 1, c: levels[i] });
            }
            subVal.innerText = `Upgrading ${end - start} Levels`;
        }
    } else {
        const lvl = parseInt(document.getElementById('labelInput').value) || 0;
        if (lvl > 0 && lvl <= 220) {
            total = levels[lvl - 1];
            const cumulative = calculateTotalCost(lvl);
            
            for (let i = 0; i < lvl; i++) {
                breakdown.push({ s: i, e: i + 1, c: levels[i] });
            }
            subVal.innerText = `Total from Lv.1: ${useAbbreviatedDisplayMode ? abbreviateNumber(cumulative) : cumulative.toLocaleString()}`;
        }
    }

    // Display Results
    resultVal.innerText = total > 0 ? (useAbbreviatedDisplayMode ? abbreviateNumber(total) : total.toLocaleString()) : "0";
    
    if (breakdown.length > 0) {
        let html = `<table><tr><th>Start</th><th>End</th><th>Cost</th></tr>`;
        breakdown.forEach(row => {
            html += `<tr><td>Lv.${row.s}</td><td>Lv.${row.e}</td><td style="color:var(--accent)">${useAbbreviatedDisplayMode ? abbreviateNumber(row.c) : row.c.toLocaleString()}</td></tr>`;
        });
        tableCont.innerHTML = html + `</table>`;
    } else {
        tableCont.innerHTML = `<div class="empty-state">Enter valid levels (1-220)</div>`;
    }
}