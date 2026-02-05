function toggleMode() {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    document.getElementById("targetMode").style.display = mode === "target" ? "block" : "none";
    document.getElementById("fixedMode").style.display = mode === "fixed" ? "block" : "none";
}

function loadPreset(preset) {
    const fields = [
        "shardOdds5",
        "shardOdds10",
        "shardOdds15",
        "shardOdds25",
        "shardOdds50",
        "shardOdds75"
    ];

    const presets = {
        legendary: {
            shardOdds5:  "0.0000",
            shardOdds10: "0.0000",
            shardOdds15: "0.0472",
            shardOdds25: "0.0079",
            shardOdds50: "0.0011",
            shardOdds75: "0.0000"
        },
        mythic: {
            shardOdds5:  "0.0000",
            shardOdds10: "0.0000",
            shardOdds15: "0.1120",
            shardOdds25: "0.0187",
            shardOdds50: "0.0027",
            shardOdds75: "0.0000"
        },
        blank: {} // intentionally empty → will fall back to zeros
    };

    const selectedPreset = presets[preset];

    if (!selectedPreset) {
        alert("This preset is currently empty.");
        return;
    }

    fields.forEach(id => {
        document.getElementById(id).value =
            selectedPreset[id] ?? "0.0000";
    });
}


function simulate() {
    const resultEl = document.getElementById("result");
    resultEl.innerText = "Simulating...";
    
    // Small timeout to allow UI to update to "Simulating..."
    setTimeout(() => {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const odds = [
            parseFloat(document.getElementById("shardOdds5").value) || 0,
            parseFloat(document.getElementById("shardOdds10").value) || 0,
            parseFloat(document.getElementById("shardOdds15").value) || 0,
            parseFloat(document.getElementById("shardOdds25").value) || 0,
            parseFloat(document.getElementById("shardOdds50").value) || 0,
            parseFloat(document.getElementById("shardOdds75").value) || 0
        ];
        const shardValues = [5, 10, 15, 25, 50, 75];
        const numSimulations = parseInt(document.getElementById("numSimulations").value) || 1000;
        
        const maxDuration = 10000;
        const startTime = Date.now();

        if (mode === "target") {
            const totalTarget = parseInt(document.getElementById("totalShards").value) || 1;
            let totalChestsRun = 0;

            for (let i = 0; i < numSimulations; i++) {
                let shards = 0;
                let chests = 0;
                while (shards < totalTarget) {
                    chests++;
                    const rand = Math.random();
                    let cumulative = 0;
                    for (let j = 0; j < odds.length; j++) {
                        cumulative += odds[j];
                        if (rand < cumulative) {
                            shards += shardValues[j];
                            break;
                        }
                    }
                    if (Date.now() - startTime > maxDuration) {
                        resultEl.innerText = "Timeout: Too complex!";
                        return;
                    }
                }
                totalChestsRun += chests;
            }
            const avg = Math.ceil(totalChestsRun / numSimulations);
            resultEl.innerHTML = `Avg. Chests Needed: <span style="color:var(--accent)">${avg}</span>`;
        } else {
            const chestsToOpen = parseInt(document.getElementById("chestsToOpen").value) || 1;
            let totalShardsRun = 0;

            for (let i = 0; i < numSimulations; i++) {
                let shards = 0;
                for (let c = 0; c < chestsToOpen; c++) {
                    const rand = Math.random();
                    let cumulative = 0;
                    for (let j = 0; j < odds.length; j++) {
                        cumulative += odds[j];
                        if (rand < cumulative) {
                            shards += shardValues[j];
                            break;
                        }
                    }
                }
                totalShardsRun += shards;
            }
            const avg = Math.ceil(totalShardsRun / numSimulations);
            resultEl.innerHTML = `Avg. Shards Gained: <span style="color:var(--accent)">${avg}</span>`;
        }
    }, 50);
}