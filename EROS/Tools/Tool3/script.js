function goBack() {
    window.location.href = "/EROS/eros.html";
}

function calculateIncome() {
    const idleSilverPerMinute = parseFloat(document.getElementById('idleSilver').value);
    const rushes = parseInt(document.getElementById('rushes').value);
    const idleSilverPerDay = idleSilverPerMinute * 60 * 24; // Convert silver per minute to silver per day
    const rushBonusPerDay = idleSilverPerMinute * 60 * 2 * rushes; // Convert 2 hours per rush to minutes
    const totalSilverPerDay = idleSilverPerDay + rushBonusPerDay;
    const totalSilverPerHour = totalSilverPerDay / 24;
    const totalSilverPerWeek = totalSilverPerDay * 7;
    const totalSilverPerMonth = totalSilverPerDay * 30; // Assuming 30 days in a month
    const totalSilverPerYear = totalSilverPerDay * 365; // Assuming 365 days in a year

    const abbreviateCheckbox = document.getElementById('abbreviateCheckbox');
    const abbreviateNumbers = abbreviateCheckbox.checked;

    document.getElementById('incomeDay').value = abbreviateNumbers ? abbreviateNumber(totalSilverPerDay) : (Math.floor(totalSilverPerDay) + '');
    document.getElementById('incomeHour').value = abbreviateNumbers ? abbreviateNumber(totalSilverPerHour) : (Math.floor(totalSilverPerHour) + '');
    document.getElementById('incomeWeek').value = abbreviateNumbers ? abbreviateNumber(totalSilverPerWeek) : (Math.floor(totalSilverPerWeek) + '');
    document.getElementById('incomeMonth').value = abbreviateNumbers ? abbreviateNumber(totalSilverPerMonth) : (Math.floor(totalSilverPerMonth) + '');
    document.getElementById('incomeYear').value = abbreviateNumbers ? abbreviateNumber(totalSilverPerYear) : (Math.floor(totalSilverPerYear) + '');
}

function updateRushesDisplay() {
    const rushes = parseInt(document.getElementById('rushes').value);
    document.getElementById('rushesDisplay').textContent = `Rushes: ${rushes}`;
}

function abbreviateNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    } else {
        return num;
    }
}
