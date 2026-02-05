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
    document.getElementById('simpleInputs').style.display = isRangeMode ? 'none' : 'block';
    document.getElementById('rangeInputs').style.display = isRangeMode ? 'flex' : 'none';
    document.getElementById('btnSimple').classList.toggle('active', !isRangeMode);
    document.getElementById('btnRange').classList.toggle('active', isRangeMode);
    
    // Update Labels
    document.getElementById('labelLeft').innerText = isRangeMode ? "LEVELS TO GAIN" : "LEVEL COST";
    document.getElementById('labelRight').innerText = isRangeMode ? "RANGE TOTAL" : "TOTAL INVESTMENT";
    document.getElementById('subLeft').innerText = isRangeMode ? "Level Span" : "Current Level Only";
    document.getElementById('subRight').innerText = isRangeMode ? "Cost for Range" : "Accumulated from Lv.1";

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
    if (isNaN(endIdx) || endIdx < 0) return 0;
    return levels.slice(0, endIdx + 1).reduce((a, b) => a + b, 0);
}

function updateDisplayMode() {
    useAbbreviatedDisplayMode = document.getElementById('displayModeCheckbox').checked;
    retrieveCost();
}

function retrieveCost() {
    if (!levels) return;
    
    const resLeft = document.getElementById('resultLeft');
    const resRight = document.getElementById('resultRight');
    const tableCont = document.getElementById('tableResult');

    let breakdown = [];
    let leftVal = "0";
    let rightVal = "0";

    if (isRangeMode) {
        const start = parseInt(document.getElementById('startLevelInput').value) || 0;
        const end = parseInt(document.getElementById('endLevelInput').value) || 0;

        if (end > start && end <= 220) {
            const startTotal = calculateTotalCost(start);
            const endTotal = calculateTotalCost(end);
            const diff = endTotal - startTotal;
            
            leftVal = `${start} → ${end}`;
            rightVal = useAbbreviatedDisplayMode ? abbreviateNumber(diff) : diff.toLocaleString();
            
            for (let i = start; i < end; i++) {
                breakdown.push({ s: i, e: i + 1, c: levels[i] });
            }
        }
    } else {
        const lvl = parseInt(document.getElementById('labelInput').value) || 0;
        if (lvl > 0 && lvl <= 220) {
            const singleCost = levels[lvl - 1];
            const cumulative = calculateTotalCost(lvl);
            
            leftVal = useAbbreviatedDisplayMode ? abbreviateNumber(singleCost) : singleCost.toLocaleString();
            rightVal = useAbbreviatedDisplayMode ? abbreviateNumber(cumulative) : cumulative.toLocaleString();
            
            for (let i = 0; i < lvl; i++) {
                breakdown.push({ s: i, e: i + 1, c: levels[i] });
            }
        }
    }

    resLeft.innerText = leftVal;
    resRight.innerText = rightVal;
    
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