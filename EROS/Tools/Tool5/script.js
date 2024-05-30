document.addEventListener('DOMContentLoaded', function() {
    fetchLeaderboardData();
    setupToggleButton();
    setupPrevNextButtons();
});

let currentDate;

async function fetchLeaderboardData(date = null) {
    const repo = 'Szago/Szago.github.io';
    const branch = 'main';
    const folderPath = 'EROS/Data';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${folderPath}?ref=${branch}`;

    let data = [];
    let files;

    try {
        const response = await fetch(apiUrl);
        files = await response.json();
    } catch (error) {
        console.error('Error fetching file list:', error);
        return;
    }

    const playerInfoFiles = files.filter(file => file.name.startsWith('PlayerInfo_'));

    if (playerInfoFiles.length === 0) {
        console.error('No PlayerInfo files found.');
        return;
    }

    let firstFile = playerInfoFiles[0];
    let firstTimestamp = getTimestamp(firstFile.name);
    currentDate = getCurrentDate(firstTimestamp);

    if (date) {
        currentDate = date;
    }

    let fetchPromises = playerInfoFiles.map(file => {
        let timestamp = getTimestamp(file.name);
        let fileDate = getCurrentDate(timestamp);
        if (fileDate === currentDate) {
            return fetchData(file.download_url);
        }
        return Promise.resolve(null);
    });

    try {
        const results = await Promise.all(fetchPromises);
        data = results.filter(result => result !== null);
        if (data.length === 0 && date !== null) {
            alert(`No data found for ${formatDate(date)}`);
            return [];
        }
        displayLeaderboard(data);
        updateDateDisplay(data);
    } catch (error) {
        console.error('Error fetching data:', error);
    }

    return data;
}

function getTimestamp(fileName) {
    return fileName.substring('PlayerInfo_'.length, 'PlayerInfo_YYYY-MM-DD_HH-MM-SS'.length);
}

function getCurrentDate(timestamp) {
    return timestamp.substring(0, 10);
}

async function fetchData(fileUrl) {
    try {
        const response = await fetch(fileUrl);
        const content = await response.text();
        let lines = content.split("\n");
        let players = [];

        for (let line of lines) {
            let parts = line.split(', ');
            if (parts.length === 3) {
                let playerData = {
                    rank: parts[0].split(': ')[1],
                    name: parts[1].split(': ')[1],
                    trophies: parts[2].split(': ')[1]
                };
                players.push(playerData);
            }
        }

        return {
            timestamp: fileUrl.substring(fileUrl.lastIndexOf('PlayerInfo_') + 'PlayerInfo_'.length, fileUrl.lastIndexOf('.txt')),
            players: players
        };
    } catch (error) {
        console.error('Error fetching file:', error);
        return null;
    }
}

function updateDateDisplay(data) {
    if (data.length > 0) {
        currentDate = data[0].timestamp.slice(0, 10);
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

    let prevTable = null;

    data.forEach(fileData => {
        const table = createTable(fileData);
        if (prevTable) {
            markChangedRows(prevTable, table);
        }
        leaderboardDiv.appendChild(table);
        prevTable = table;
    });
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

function markChangedRows(prevTable, currentTable) {
    const prevRows = prevTable.querySelectorAll('tr');
    const currentRows = currentTable.querySelectorAll('tr');
    const prevRowsMap = new Map();

    prevRows.forEach(prevRow => {
        const playerNameCell = prevRow.querySelectorAll('td')[1]; 
        if (playerNameCell) {
            const playerName = playerNameCell.textContent;
            prevRowsMap.set(playerName, prevRow);
        }
    });

    currentRows.forEach(currentRow => {
        const playerNameCell = currentRow.querySelectorAll('td')[1];
        if (playerNameCell) {
            const playerName = playerNameCell.textContent;
            const prevRow = prevRowsMap.get(playerName);

            if (prevRow) {
                const prevTrophiesCell = prevRow.querySelectorAll('td')[2]; 
                const currentTrophiesCell = currentRow.querySelectorAll('td')[2]; 
                if (prevTrophiesCell && currentTrophiesCell) {
                    const prevTrophies = parseInt(prevTrophiesCell.textContent);
                    const currentTrophies = parseInt(currentTrophiesCell.textContent);
                    if (!isNaN(prevTrophies) && !isNaN(currentTrophies)) {
                        if (currentTrophies > prevTrophies) {
                            currentRow.classList.add('points-increase');
                        } else if (currentTrophies < prevTrophies) {
                            currentRow.classList.add('points-decrease');
                        }
                    }
                }
            }
        }
    });
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

function reloadLeaderboard() {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '';
    fetchLeaderboardData(currentDate);
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
    loadPreviousDay(previousDate);
}

function handleNextDayClick() {
    const nextDate = getNextDate(currentDate);
    console.log(`Trying to load data for ${formatDate(nextDate)}`);
    loadNextDay(nextDate);
}

async function loadPreviousDay(date) {
    const data = await fetchLeaderboardData(date);
    if (data.length === 0) {
        alert(`No data found for ${formatDate(date)}`);
    }
}

async function loadNextDay(date) {
    const data = await fetchLeaderboardData(date);
    if (data.length === 0) {
        alert(`No data found for ${formatDate(date)}`);
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
