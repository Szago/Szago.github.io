// Helper to get cookie value by name
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Categories the user has collapsed (persisted across pages)
function getCollapsedCats() {
    const c = getCookie('collapsedCats');
    return c ? decodeURIComponent(c).split(',').filter(Boolean) : [];
}

function loadShell(pageTitle, alertType, alertMsg) {

    const isCollapsed = getCookie('sidebarStatus') === 'collapsed';
    const collapsedCats = getCollapsedCats();
    const catClass = id => collapsedCats.includes(id) ? 'collapsed' : '';

    const sidebarHTML = `
    <nav class="sidebar ${isCollapsed ? 'collapsed' : ''}" id="sidebar">
        <div class="sidebar-header">
            <span class="logo">EROS TOOLS</span>
            <button onclick="toggleSidebar()"><i class="fas fa-bars"></i></button>
        </div>

        <div class="nav-scroll">
            <div class="nav-category ${catClass('cat-calculators')}" id="cat-calculators">
                <button class="category-header" onclick="toggleCategory('cat-calculators')">
                    <i class="fas fa-calculator cat-icon"></i>
                    <span class="cat-label">Calculators</span>
                    <i class="fas fa-chevron-down chevron"></i>
                </button>
                <ul class="nav-links category-links">
                    <li><a href="/EROS/Tools/Tool4_playroom/tool.html" id="nav-playroom"><i class="fas fa-gamepad"></i><span>Playroom calculator</span></a></li>
                    <li><a href="/EROS/Tools/Tool3_silverincome/tool.html" id="nav-silver"><i class="fas fa-coins"></i><span>Silver income calculator</span></a></li>
                    <li><a href="/EROS/Tools/Tool2_sharddrop/tool.html" id="nav-shards"><i class="fas fa-toolbox"></i><span>Shard drop simulator</span></a></li>
                    <li><a href="/EROS/Tools/Tool1_levelcost/tool.html" id="nav-level"><i class="fas fa-person-arrow-up-from-line"></i><span>Level cost calculator</span></a></li>
                    <li><a href="/EROS/Tools/Tool6_networth/tool.html" id="nav-networth"><i class="fas fa-building-columns"></i><span>Net worth calculator</span></a></li>
                    <li><a href="/EROS/Tools/Tool7_classstatue/tool.html" id="nav-statue"><i class="fas fa-monument"></i><span>Class statue calculator</span><span class="badge-new">New</span></a></li>
                </ul>
            </div>

            <div class="nav-category ${catClass('cat-characters')}" id="cat-characters">
                <button class="category-header" onclick="toggleCategory('cat-characters')">
                    <i class="fas fa-users cat-icon"></i>
                    <span class="cat-label">Characters</span>
                    <i class="fas fa-chevron-down chevron"></i>
                </button>
                <ul class="nav-links category-links">
                    <li><a href="/EROS/Characters/AllUnits/index.html" id="nav-allunits"><i class="fas fa-table-cells-large"></i><span>All units</span></a></li>
                    <li><a href="/EROS/Characters/Tierlist/index.html" id="nav-tierlist"><i class="fas fa-ranking-star"></i><span>Tier list</span></a></li>
                </ul>
            </div>

            <div class="nav-category ${catClass('cat-guides')}" id="cat-guides">
                <button class="category-header" onclick="toggleCategory('cat-guides')">
                    <i class="fas fa-book-open cat-icon"></i>
                    <span class="cat-label">Guides</span>
                    <i class="fas fa-chevron-down chevron"></i>
                </button>
                <ul class="nav-links category-links">
                    <li class="coming-soon"><i class="fas fa-hourglass-half"></i><span>Coming soon</span></li>
                </ul>
            </div>
        </div>

        <ul class="nav-links bottom-nav">
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
    if(path.includes('Tool7')) document.getElementById('nav-statue').classList.add('active');
    if(path.includes('AllUnits')) document.getElementById('nav-allunits').classList.add('active');
    if(path.includes('Tierlist')) document.getElementById('nav-tierlist').classList.add('active');
}

function toggleCategory(id) {
    const cat = document.getElementById(id);
    if (!cat) return;
    cat.classList.toggle('collapsed');

    let list = getCollapsedCats();
    if (cat.classList.contains('collapsed')) {
        if (!list.includes(id)) list.push(id);
    } else {
        list = list.filter(x => x !== id);
    }
    document.cookie = "collapsedCats=" + encodeURIComponent(list.join(',')) +
        "; max-age=" + (30 * 24 * 60 * 60) + "; path=/; SameSite=Lax";
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