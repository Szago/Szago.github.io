// Helper to get cookie value by name
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function loadShell(pageTitle, alertType, alertMsg) {

    const isCollapsed = getCookie('sidebarStatus') === 'collapsed';

    const sidebarHTML = `
    <nav class="sidebar ${isCollapsed ? 'collapsed' : ''}" id="sidebar">
        <div class="sidebar-header">
            <span class="logo">EROS TOOLS</span>
            <button onclick="toggleSidebar()"><i class="fas fa-bars"></i></button>
        </div>
        <ul class="nav-links">
            <li><a href="../Tool4_playroom/tool.html" id="nav-playroom"><i class="fas fa-gamepad"></i><span>Playroom calculator</span></a></li>
            <li><a href="../Tool3_silverincome/tool.html" id="nav-silver"><i class="fas fa-coins"></i><span>Silver income calculator</span></a></li>
            <li><a href="../Tool2_sharddrop/tool.html" id="nav-shards"><i class="fas fa-toolbox"></i><span>Shard drop simulator</span></a></li>
            <li><a href="../Tool1_levelcost/tool.html" id="nav-level"><i class="fas fa-person-arrow-up-from-line"></i><span>Level cost calculator</span></a></li>
            <li><a href="../Tool6_networth/tool.html" id="nav-networth"><i class="fas fa-building-columns"></i><span>Net worth calculator</span></a></li>
            <li class="bottom-link"><a href="javascript:window.location.href='/EROS/index.html'"><i class="fas fa-arrow-left"></i><span>Back to Home</span></a></li>
        </ul>
    </nav>`;

    const alertHTML = (alertType === 'none' || !alertType) 
        ? `<div class="header-section"></div>` 
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

    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    document.querySelector('.main-content').insertAdjacentHTML('afterbegin', topBarHTML);
    
    // Highlight active link logic
    const path = window.location.href;
    if(path.includes('Tool4')) document.getElementById('nav-playroom').classList.add('active');
    if(path.includes('Tool3')) document.getElementById('nav-silver').classList.add('active');
    if(path.includes('Tool2')) document.getElementById('nav-shards').classList.add('active');
    if(path.includes('Tool1')) document.getElementById('nav-level').classList.add('active');
    if(path.includes('Tool6')) document.getElementById('nav-networth').classList.add('active');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    
    if (sidebar.classList.contains('collapsed')) {
        // Set cookie for 30 days, force root path so it works across all tool folders
        document.cookie = "sidebarStatus=collapsed; max-age=" + (30*24*60*60) + "; path=/; SameSite=Lax";
    } else {
        // Set to expanded and expire it immediately
        document.cookie = "sidebarStatus=expanded; path=/; max-age=0; SameSite=Lax";
    }
}