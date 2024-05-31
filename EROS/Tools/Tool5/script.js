document.addEventListener('DOMContentLoaded', function() {
    fetchLatestLeaderboardData();
    setupToggleButton();
    setupPrevNextButtons();
});

let currentDate;

async function fetchLatestLeaderboardData() {
    const repo = 'Szago/Szago.github.io';
    const branch = 'main';
    const folderPath = 'EROS/Data';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${folderPath}?ref=${branch}`;

    try {
        const response = await fetch(apiUrl);
        const files = await response.json();

        const playerInfoFiles = files.filter(file => file.name.startsWith('PlayerInfo_') && file.type === 'file');

        if (playerInfoFiles.length === 0) {
            console.error('No PlayerInfo files found.');
            return;
        }

        // Sort files to find the latest files
        playerInfoFiles.sort((a, b) => getTimestamp(b.name).localeCompare(getTimestamp(a.name)));

        let latestFiles = playerInfoFiles.slice(0, 3);
        let data = [];

        for (let file of latestFiles) {
            let fileData = await fetchData(file.download_url);
            if (fileData) {
                data.push(fileData);
            }
        }

        displayLeaderboard(data);

    } catch (error) {
        console.error('Error fetching file list:', error);
    }
}

async function fetchData(fileUrl) {
    try {
        const response = await fetch(fileUrl);
        const content = await response.text();

        const data = parseData(content);
        return data;
    } catch (error) {
        console.error('Error fetching file:', error);
        return null;
    }
}

function getTimestamp(fileName) {
    const timestamp = fileName.match(/PlayerInfo_(\d{4}-\d{2}-\d{2})/);
    return timestamp ? timestamp[1] : null;
}

function parseData(content) {
    const entries = content.split('---').map(entry => entry.trim()).filter(entry => entry.length > 0);

    return entries.map(entry => {
        const lines = entry.split('\n');
        const timestamp = lines[0].replace('Data recorded at: ', '').trim();
        const players = lines.slice(1).map(line => {
            const [rankPart, namePart, trophiesPart] = line.split(', ');
            return {
                rank: rankPart.split(': ')[1],
                name: namePart.split(': ')[1],
                trophies: trophiesPart.split(': ')[1]
            };
        });

        return {
            timestamp,
            players
        };
    });
}

function updateDateDisplay(data) {
    if (data.length > 0) {
        const dateDisplayDiv = document.getElementById('date-display');
        dateDisplayDiv.innerHTML = `Current Date: ${formatDate(currentDate)}`;
    }
}

function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function displayLeaderboard(data) {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '';

    let prevData = null;

    for (let i = 0; i < data.length; i++) {
        if (prevData && !isDifferent(prevData.players, data[i].players)) {
            continue;
        }

        const table = createTable(data[i]);
        leaderboardDiv.appendChild(table);
        prevData = data[i];
    }
}

function isDifferent(players1, players2) {
    if (players1.length !== players2.length) return true;

    for (let i = 0; i < players1.length; i++) {
        if (players1[i].rank !== players2[i].rank ||
            players1[i].name !== players2[i].name ||
            players1[i].trophies !== players2[i].trophies) {
            return true;
        }
    }
    return false;
}

function createTable(fileData) {
    const table = document.createElement('table');
    const timestampRow = document.createElement('tr');
    const timestampCell = document.createElement('td');
    timestampCell.colSpan = 3;
    timestampCell.textContent = 'Timestamp: ' + fileData.timestamp;
    timestampRow.appendChild(timestampCell);
    table.appendChild(timestampRow);

    const headerRow = document.createElement('tr');
    const header1 = document.createElement('th');
    header1.textContent = 'Rank';
    const header2 = document.createElement('th');
    header2.textContent = 'Name';
    const header3 = document.createElement('th');
    header3.textContent = 'Trophies';
    headerRow.appendChild(header1);
    headerRow.appendChild(header2);
    headerRow.appendChild(header3);
    table.appendChild(headerRow);

    fileData.players.forEach(player => {
        const row = document.createElement('tr');
        const rankCell = document.createElement('td');
        rankCell.textContent = player.rank;
        const nameCell = document.createElement('td');
        nameCell.textContent = player.name;
        const trophiesCell = document.createElement('td');
        trophiesCell.textContent = player.trophies;
        row.appendChild(rankCell);
        row.appendChild(nameCell);
        row.appendChild(trophiesCell);
        table.appendChild(row);
    });

    return table;
}

function setupToggleButton() {
    const toggleButton = document.getElementById('toggleButton');
    toggleButton.addEventListener('click', function() {
        if (toggleButton.dataset.state === 'highlighted') {
            reloadLeaderboard();
            toggleButton.dataset.state = 'original';
            toggleButton.textContent = 'Highlight Changed Rows';
        } else {
            filterHighlightedRows();
            toggleButton.dataset.state = 'highlighted';
            toggleButton.textContent = 'Show Original';
        }
    });
}

function setupPrevNextButtons() {
    document.getElementById('prevDayButton').addEventListener('click', handlePrevDayClick);
    document.getElementById('nextDayButton').addEventListener('click', handleNextDayClick);
}

function reloadLeaderboard() {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '';
    fetchLatestLeaderboardData();
}

function filterHighlightedRows() {
    const tables = document.querySelectorAll('#leaderboard table');
    tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        let hasHighlightedRow = false;

        for (let i = rows.length - 1; i > 0; i--) { 
            const row = rows[i];
            if (!row.classList.contains('points-increase') && !row.classList.contains('points-decrease')) {
                row.remove();
            } else {
                hasHighlightedRow = true;
            }
        }

        if (!hasHighlightedRow) {
            table.remove(); 
        }
    });
}

function handlePrevDayClick() {
    const previousDate = getPreviousDate(currentDate);
    console.log(`Trying to load data for ${formatDate(previousDate)}`);
    fetchAndDisplayDataForDate(previousDate);
}

function handleNextDayClick() {
    const nextDate = getNextDate(currentDate);
    console.log(`Trying to load data for ${formatDate(nextDate)}`);
    fetchAndDisplayDataForDate(nextDate);
}

async function fetchAndDisplayDataForDate(date) {
    const repo = 'Szago/Szago.github.io';
    const branch = 'main';
    const folderPath = 'EROS/Data';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${folderPath}/PlayerInfo_${date}?ref=${branch}`;

    try {
        const response = await fetch(apiUrl);
        const file = await response.json();

        if (file) {
            currentDate = date;
            await fetchAndDisplayData(file.download_url);
        } else {
            alert(`No data found for ${formatDate(date)}`);
        }
    } catch (error) {
        console.error('Error fetching file:', error);
    }
}

function getPreviousDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getNextDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
