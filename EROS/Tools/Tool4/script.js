function calculateRemainingTime() {
    // Read the current pleasure level and pleasure XP from the input fields
    const currentPleasureLevel = parseInt(document.getElementById('current-pleasure-level').value);
    const currentPleasureXP = parseInt(document.getElementById('current-pleasure-xp').value);

    // Read the levels data from the JSON file
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            // Initialize variables to hold the total remaining XP and time needed
            let totalRemainingXP = 0;
            let totalRemainingTime = 0;

            // Loop through each level from the current level to level 14
            for (let i = currentPleasureLevel; i < 15; i++) {
                // Find the current level data
                const currentLevelData = data.levels.find(levelData => levelData.level === i);

                // Calculate the remaining XP needed to reach the next level
                const remainingXPNeeded = currentLevelData.xp_for_next_level - (i === currentPleasureLevel ? currentPleasureXP : 0);

                // Calculate the remaining time needed to reach the next level
                const remainingTimeNeeded = remainingXPNeeded / currentLevelData.xp_per_click * currentLevelData.cost_per_click;

                // Add the remaining XP and time to the total
                totalRemainingXP += remainingXPNeeded;
                totalRemainingTime += remainingTimeNeeded;
            }

            // Display the total remaining time in the HTML
            const hours = totalRemainingTime / 60;
            const days = hours / 24;

            document.getElementById('remaining-time').textContent = `${totalRemainingTime.toFixed(2)} minutes OR ${hours.toFixed(2)} hours OR ${days.toFixed(2)} days`;
        })
        .catch(error => console.error('Error fetching data:', error));
}

function calculateLeeway() {
    // Read the remaining time from the HTML
    const remainingTimeText = document.getElementById('remaining-time').textContent;
    const totalRemainingTime = parseFloat(remainingTimeText.split(' ')[0]);

    // Read the remaining event time from the HTML
    const remainingEventTimeText = document.getElementById('remaining-event-time').textContent;
    const totalRemainingEventTime = parseFloat(remainingEventTimeText.split(' ')[0]);

    // Subtract the remaining event time from the remaining time to get the leeway
    const leeway = totalRemainingEventTime - totalRemainingTime;

    // Display the leeway in the HTML
    const hours = leeway / 60;
    const days = hours / 24;

    document.getElementById('leeway-minutes').textContent = `${leeway.toFixed(2)} minutes OR ${hours.toFixed(2)} hours OR ${days.toFixed(2)} days`;
}

function showRemainingEventTime() {
    const eventFinishDate = new Date(document.getElementById('event-finish-date').value);

    // Get the current date in UTC
    const currentDate = new Date();
    const currentDateUTC = new Date(currentDate.getTime() + currentDate.getTimezoneOffset() * 60000);

    // Calculate the difference between the current date and the event finish date in minutes
    const remainingEventTimeInMinutes = (eventFinishDate - currentDateUTC) / (1000 * 60);

    // Convert the difference to hours and days
    const remainingEventTimeInHours = remainingEventTimeInMinutes / 60;
    const remainingEventTimeInDays = remainingEventTimeInHours / 24;

    document.getElementById('remaining-event-time').textContent = `${remainingEventTimeInMinutes.toFixed(2)} minutes OR ${remainingEventTimeInHours.toFixed(2)} hours OR ${remainingEventTimeInDays.toFixed(2)} days`;
}
function goBack() {
    window.location.href = "/EROS/eros.html";
}