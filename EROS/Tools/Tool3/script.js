window.addEventListener('DOMContentLoaded', () => {
    // Clock setup
    setInterval(() => {
        const currentDate = new Date();
        document.getElementById('current-date').value = currentDate.toISOString().slice(0, 16);
    }, 1000);
});

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function calculateIncome() {
    const idleSilverPerMinute = parseFloat(document.getElementById('idleSilver').value) || 0;
    const rushes = parseInt(document.getElementById('rushes').value);
    const abbreviateNumbers = document.getElementById('abbreviateCheckbox').checked;

    const idleSilverPerDay = idleSilverPerMinute * 60 * 24; 
    const rushBonusPerDay = idleSilverPerMinute * 60 * 2 * rushes; 
    
    const totalSilverPerDay = idleSilverPerDay + rushBonusPerDay;
    const totalSilverPerHour = totalSilverPerDay / 24;
    const totalSilverPerWeek = totalSilverPerDay * 7;
    const totalSilverPerMonth = totalSilverPerDay * 30; 
    const totalSilverPerYear = totalSilverPerDay * 365;

    // Display updates
    updateDisplay('incomeHour', totalSilverPerHour, abbreviateNumbers);
    updateDisplay('incomeDay', totalSilverPerDay, abbreviateNumbers);
    updateDisplay('incomeWeek', totalSilverPerWeek, abbreviateNumbers);
    updateDisplay('incomeMonth', totalSilverPerMonth, abbreviateNumbers);
    updateDisplay('incomeYear', totalSilverPerYear, abbreviateNumbers);
}

function updateDisplay(id, value, abbreviate) {
    const element = document.getElementById(id);
    if (abbreviate) {
        element.textContent = abbreviateNumber(value);
    } else {
        element.textContent = Math.floor(value).toLocaleString(); // Added commas for readability
    }
}

function updateRushesDisplay() {
    const rushes = document.getElementById('rushes').value;
    document.getElementById('rushesDisplay').textContent = rushes;
}

function abbreviateNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.floor(num).toString();
}

function goBack() {
    window.location.href = "/EROS/index.html";
}