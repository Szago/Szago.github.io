function loadShell(pageTitle, alertType, alertMsg) {
    const sidebarHTML = `
    <nav class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <span class="logo">EROS TOOLS</span>
            <button onclick="toggleSidebar()"><i class="fas fa-bars"></i></button>
        </div>
        <ul class="nav-links">
            <li><a href="../Tool4/tool.html" id="nav-playroom"><i class="fas fa-gamepad"></i><span>Playroom calculator</span></a></li>
            <li><a href="../Tool3/tool.html" id="nav-silver"><i class="fas fa-coins"></i><span>Silver income calculator</span></a></li>
            <li><a href="../Tool2/tool.html" id="nav-shards"><i class="fas fa-toolbox"></i><span>Shard drop simulator</span></a></li>
            <li class="bottom-link"><a href="javascript:window.location.href='/EROS/index.html'"><i class="fas fa-arrow-left"></i><span>Back to Home</span></a></li>
        </ul>
    </nav>`;

    // Determine if we should show the alert or keep it empty
    const alertHTML = (alertType === 'none' || !alertType) 
        ? `<div class="header-section"></div>` // Placeholder to maintain flex spacing
        : `<div class="header-alert ${alertType}">
            <i class="fas fa-exclamation-triangle"></i>
            <div class="alert-content">
                <strong>Note:</strong>
                <span>${alertMsg}</span>
            </div>
          </div>`;

    const topBarHTML = `
    <header class="top-bar">
        <div class="header-section"><h1>${pageTitle}</h1></div>
        ${alertHTML}
        <div class="header-section">
            <div class="current-date-box">
                <i class="far fa-clock"></i>
                <input type="datetime-local" id="current-date" readonly>
            </div>
        </div>
    </header>`;

    // Inject into the start of body
    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    // Inject into the main-content container
    document.querySelector('.main-content').insertAdjacentHTML('afterbegin', topBarHTML);
    
    // Highlight active link
    if(window.location.href.includes('Tool4')) document.getElementById('nav-playroom').classList.add('active');
    if(window.location.href.includes('Tool3')) document.getElementById('nav-silver').classList.add('active');
    if(window.location.href.includes('Tool2')) document.getElementById('nav-shards').classList.add('active');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}