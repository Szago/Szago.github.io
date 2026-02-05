let levels = null;

async function initLevels() {
    try {
        // Fetching from your provided URL
        const response = await fetch('https://szago.github.io/EROS/Tools/Tool1/levels.json');
        const data = await response.json();
        levels = data.levels;
    } catch (error) {
        console.error('Error loading levels:', error);
    }
}

initLevels();

function calculateTotalCost(level) {
    if (!levels) return null;
    const endIdx = parseInt(level) - 1;
    if (endIdx >= 0 && endIdx < levels.length) {
        return levels.slice(0, endIdx + 1).reduce((total, value) => total + value, 0);
    }
    return null;
}

function abbreviateNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
}

function calculateNetWorth() {
    if (!levels) return;

    const levelInput = document.getElementById('characterLevels').value;
    const resultElement = document.getElementById('netWorthResult');
    const tableElement = document.getElementById('netWorthTable');
    const charCountElement = document.getElementById('characterCount');
    const useAbbreviatedDisplay = document.getElementById('displayModeCheckbox').checked;

    // Parse levels: split by comma, remove whitespace, filter out non-numbers
    const levelsArray = levelInput.split(',')
        .map(lvl => parseInt(lvl.trim()))
        .filter(lvl => !isNaN(lvl) && lvl > 0);

    if (levelsArray.length === 0) {
        resultElement.textContent = "0";
        charCountElement.textContent = "0 Characters Tracked";
        tableElement.innerHTML = '<div class="empty-state">Enter character levels to see the breakdown</div>';
        return;
    }

    let totalWorth = 0;
    let tableHTML = `<table><thead><tr><th>Character</th><th>Level</th><th>Investment Value</th></tr></thead><tbody>`;

    levelsArray.forEach((lvl, index) => {
        const worth = calculateTotalCost(lvl);
        if (worth !== null) {
            totalWorth += worth;
            const displayWorth = useAbbreviatedDisplay ? abbreviateNumber(worth) : worth.toLocaleString();
            tableHTML += `
                <tr>
                    <td>Character #${index + 1}</td>
                    <td>Lv. ${lvl}</td>
                    <td style="color:var(--accent); font-weight:bold;">${displayWorth}</td>
                </tr>`;
        }
    });

    tableHTML += '</tbody></table>';
    
    // Update UI
    resultElement.innerHTML = useAbbreviatedDisplay ? abbreviateNumber(totalWorth) : totalWorth.toLocaleString();
    charCountElement.textContent = `${levelsArray.length} Character${levelsArray.length > 1 ? 's' : ''} Tracked`;
    tableElement.innerHTML = tableHTML;
}