const EROS_BASE = '/eros';
const EROS_ABBREVIATION_KEY = 'eros-abbreviate-large-values';

const EROS_TOOLS = [
    {
        id: 'playroom',
        navId: 'nav-playroom',
        title: 'Playroom Calculator',
        navLabel: 'Playroom calculator',
        icon: 'fas fa-gamepad',
        accent: '#8c35f7',
        path: '/Tools/Tool4_playroom/tool.html',
        category: 'calculators'
    },
    {
        id: 'silver',
        navId: 'nav-silver',
        title: 'Silver Income Calculator',
        navLabel: 'Silver income calculator',
        icon: 'fas fa-coins',
        accent: '#2ec4b6',
        path: '/Tools/Tool3_silverincome/tool.html',
        category: 'calculators'
    },
    {
        id: 'shards',
        navId: 'nav-shards',
        title: 'Shard Drop Simulator',
        navLabel: 'Shard drop simulator',
        icon: 'fas fa-toolbox',
        accent: '#f59e0b',
        path: '/Tools/Tool2_sharddrop/tool.html',
        category: 'calculators'
    },
    {
        id: 'level',
        navId: 'nav-level',
        title: 'Level Cost Calculator',
        navLabel: 'Level cost calculator',
        icon: 'fas fa-person-arrow-up-from-line',
        accent: '#0ea5e9',
        path: '/Tools/Tool1_levelcost/tool.html',
        category: 'calculators'
    },
    {
        id: 'networth',
        navId: 'nav-networth',
        title: 'Net Worth Calculator',
        navLabel: 'Net worth calculator',
        icon: 'fas fa-building-columns',
        accent: '#ffd700',
        path: '/Tools/Tool6_networth/tool.html',
        category: 'calculators'
    },
    {
        id: 'statue',
        navId: 'nav-statue',
        title: 'Class Statue Calculator',
        navLabel: 'Class statue calculator',
        icon: 'fas fa-monument',
        accent: '#ef4444',
        path: '/Tools/Tool7_classstatue/tool.html',
        category: 'calculators',
        badge: 'new'
    },
    {
        id: 'unitstats',
        navId: 'nav-unitstats',
        title: 'Unit Stats Calculator',
        navLabel: 'Unit stats calculator',
        icon: 'fas fa-chart-simple',
        accent: '#ec4899',
        path: '/Tools/Tool8_unitstats/tool.html',
        category: 'calculators',
        badge: 'new'
    },
    {
        id: 'allunits',
        navId: 'nav-allunits',
        title: 'All Units',
        navLabel: 'All units',
        icon: 'fas fa-table-cells-large',
        accent: '#8c35f7',
        path: '/Characters/AllUnits/index.html',
        category: 'characters',
        badge: 'wip'
    },
    {
        id: 'tierlist',
        navId: 'nav-tierlist',
        title: 'Tier List',
        navLabel: 'Tier list',
        icon: 'fas fa-ranking-star',
        accent: '#8c35f7',
        path: '/Characters/Tierlist/index.html',
        category: 'characters',
        badge: 'wip'
    },
    {
        id: 'calendar',
        navId: 'nav-calendar',
        title: 'Calendar',
        icon: 'fas fa-calendar-days',
        accent: '#8c35f7',
        path: '/Data/Calendar/index.html',
        category: 'data',
        badge: 'wip'
    },
    {
        id: 'leaderboard',
        navId: 'nav-leaderboard',
        title: 'Leaderboard Monitoring',
        accent: '#8c35f7',
        path: '/Tools/Tool5_leaderboard/tool.html',
        category: 'calculators',
        showInSidebar: false,
        preload: false
    }
];

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function toolBadge(tool) {
    if (!tool.badge) return '';
    return `<span class="badge-${tool.badge}">${tool.badge === 'new' ? 'New' : 'WIP'}</span>`;
}

function toolLink(tool) {
    const href = workspaceHref(tool);
    return `<li><a href="${href}" id="${tool.navId}" data-tool="${tool.id}"><i class="${tool.icon}"></i><span>${tool.navLabel || tool.title}</span>${toolBadge(tool)}</a></li>`;
}

function workspaceHref(tool) {
    return tool.id === EROS_TOOLS[0].id ? `${EROS_BASE}/` : `${EROS_BASE}/?tool=${tool.id}`;
}

function categoryHTML(id, icon, label, tools, extraContent = '') {
    return `
        <div class="nav-category" id="cat-${id}">
            <button class="category-header" type="button" onclick="toggleCategory('cat-${id}')" aria-expanded="true">
                <i class="${icon} cat-icon"></i>
                <span class="cat-label">${label}</span>
                <i class="fas fa-chevron-down chevron"></i>
            </button>
            <ul class="nav-links category-links">
                ${tools.map(toolLink).join('')}
                ${extraContent}
            </ul>
        </div>`;
}

function sidebarHTML() {
    const isCollapsed = getCookie('sidebarStatus') === 'collapsed';
    const visibleTools = EROS_TOOLS.filter(tool => tool.showInSidebar !== false);
    const calculators = visibleTools.filter(tool => tool.category === 'calculators');
    const characters = visibleTools.filter(tool => tool.category === 'characters');
    const data = visibleTools.filter(tool => tool.category === 'data');

    return `
        <nav class="sidebar ${isCollapsed ? 'collapsed' : ''}" id="sidebar" aria-label="EROS tools">
            <div class="sidebar-header">
                <a class="sidebar-header-action" href="/index.html" aria-label="Back to main menu" title="Back to main menu"><i class="fas fa-arrow-left"></i></a>
                <span class="logo">EROS TOOLS</span>
                <button class="sidebar-header-action" type="button" onclick="toggleSidebar()" aria-label="Toggle sidebar" title="Toggle sidebar"><i class="fas fa-bars"></i></button>
            </div>

            <div class="nav-scroll">
                ${categoryHTML('calculators', 'fas fa-calculator', 'Calculators', calculators)}
                ${categoryHTML('characters', 'fas fa-users', 'Characters', characters)}
                ${categoryHTML('guides', 'fas fa-book-open', 'Guides', [], '<li class="coming-soon"><i class="fas fa-hourglass-half"></i><span>Coming soon</span></li>')}
                ${categoryHTML('data', 'fas fa-database', 'Data', data)}
            </div>

            <ul class="nav-links bottom-nav">
                <li class="bottom-link"><a href="/index.html"><i class="fas fa-arrow-left"></i><span>Back to Home</span></a></li>
            </ul>
        </nav>`;
}

function topBarHTML(pageTitle, alertType, alertMsg) {
    const alertHTML = (alertType === 'none' || !alertType)
        ? '<div class="header-section"></div>'
        : `<div class="header-alert ${alertType}">
            <i class="fas fa-exclamation-triangle"></i>
            <div class="alert-content">
                <strong>Note:</strong>
                <span>${alertMsg}</span>
            </div>
        </div>`;

    return `
        <header class="top-bar">
            <div class="header-section"><h1>${pageTitle}</h1></div>
            ${alertHTML}
            <div class="header-section">
                <div class="header-tools">
                    <div class="current-date-box">
                        <i class="far fa-clock"></i>
                        <input type="datetime-local" id="current-date" readonly>
                    </div>
                    <label class="global-abbreviation-toggle">
                        <input type="checkbox" id="global-abbreviation-toggle">
                        <span class="global-toggle-track" aria-hidden="true"></span>
                        <span>Abbreviate large values</span>
                    </label>
                </div>
            </div>
        </header>`;
}

function globalAbbreviationEnabled() {
    try {
        const stored = window.localStorage.getItem(EROS_ABBREVIATION_KEY);
        return stored === null ? true : stored === 'true';
    } catch (error) {
        return true;
    }
}

function dispatchGlobalAbbreviationChange(enabled) {
    window.dispatchEvent(new CustomEvent('eros:abbreviation-change', {
        detail: { enabled }
    }));
}

function syncGlobalAbbreviationControl(enabled) {
    const control = document.getElementById('global-abbreviation-toggle');
    if (control) control.checked = enabled;
}

function setGlobalAbbreviation(enabled) {
    try {
        window.localStorage.setItem(EROS_ABBREVIATION_KEY, String(enabled));
    } catch (error) {
        // The setting still applies to the current page if storage is blocked.
    }

    syncGlobalAbbreviationControl(enabled);
    dispatchGlobalAbbreviationChange(enabled);
}

function bindGlobalAbbreviationControl() {
    const control = document.getElementById('global-abbreviation-toggle');
    if (!control) return;

    control.checked = globalAbbreviationEnabled();
    control.addEventListener('change', () => setGlobalAbbreviation(control.checked));

    window.addEventListener('storage', event => {
        if (event.key !== EROS_ABBREVIATION_KEY) return;
        const enabled = globalAbbreviationEnabled();
        syncGlobalAbbreviationControl(enabled);
        dispatchGlobalAbbreviationChange(enabled);
    });
}

function startClock() {
    const clockEl = document.getElementById('current-date');
    if (!clockEl) return;

    const tick = () => {
        const now = new Date();
        clockEl.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };
    tick();
    window.setInterval(tick, 1000);
}

function isEmbeddedTool() {
    return window.self !== window.top || new URLSearchParams(window.location.search).get('embedded') === '1';
}

function toolForCurrentPage() {
    const normalizedPath = window.location.pathname.toLowerCase();
    return EROS_TOOLS.find(tool => normalizedPath.endsWith(`${EROS_BASE}${tool.path}`.toLowerCase()));
}

function setActiveTool(toolId) {
    document.querySelectorAll('.sidebar a[data-tool]').forEach(link => {
        const isActive = link.dataset.tool === toolId;
        link.classList.toggle('active', isActive);
        if (isActive) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
}

function loadShell(pageTitle, alertType, alertMsg) {
    const embedded = isEmbeddedTool();
    const currentTool = toolForCurrentPage();

    if (!embedded && currentTool) {
        window.location.replace(workspaceHref(currentTool));
        return;
    }

    if (embedded) {
        document.documentElement.classList.add('eros-embedded');
        document.body.classList.add('eros-embedded-body');
    } else {
        document.body.insertAdjacentHTML('afterbegin', sidebarHTML());
    }

    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.insertAdjacentHTML('afterbegin', topBarHTML(pageTitle, alertType, alertMsg));
    startClock();
    bindGlobalAbbreviationControl();

}

function selectedWorkspaceTool() {
    const requestedId = new URLSearchParams(window.location.search).get('tool');
    return EROS_TOOLS.find(tool => tool.id === requestedId) || EROS_TOOLS[0];
}

function workspaceToolUrl(tool) {
    return `${EROS_BASE}${tool.path}?embedded=1`;
}

function workspaceHistoryUrl(tool) {
    const url = new URL(window.location.href);
    url.pathname = `${EROS_BASE}/`;
    url.search = '';
    if (tool.id !== EROS_TOOLS[0].id) url.searchParams.set('tool', tool.id);
    url.hash = '';
    return url;
}

function activateWorkspaceTool(toolId, options = {}) {
    const tool = EROS_TOOLS.find(candidate => candidate.id === toolId) || EROS_TOOLS[0];
    const loading = document.getElementById('workspaceLoading');

    document.documentElement.style.setProperty('--accent', tool.accent);
    document.title = `${tool.title} - EROS Tools`;
    setActiveTool(tool.id);

    document.querySelectorAll('.workspace-frame').forEach(frame => {
        const isActive = frame.dataset.tool === tool.id;
        frame.classList.toggle('active', isActive);
        frame.setAttribute('aria-hidden', String(!isActive));
        frame.tabIndex = isActive ? 0 : -1;
    });

    const activeFrame = document.querySelector(`.workspace-frame[data-tool="${tool.id}"]`);
    if (activeFrame && !activeFrame.hasAttribute('src')) {
        delete activeFrame.dataset.loaded;
        activeFrame.src = activeFrame.dataset.src;
    }
    if (loading) loading.classList.toggle('hidden', activeFrame && activeFrame.dataset.loaded === 'true');

    if (options.updateHistory !== false) {
        window.history.pushState({ tool: tool.id }, '', workspaceHistoryUrl(tool));
    }
}

function loadWorkspace() {
    const workspace = document.getElementById('workspaceMain');
    if (!workspace) return;

    document.body.insertAdjacentHTML('afterbegin', sidebarHTML());

    EROS_TOOLS.forEach(tool => {
        const frame = document.createElement('iframe');
        frame.className = 'workspace-frame';
        frame.dataset.tool = tool.id;
        frame.title = tool.title;
        frame.dataset.src = workspaceToolUrl(tool);
        if (tool.preload !== false) frame.src = frame.dataset.src;
        frame.loading = tool.preload === false ? 'lazy' : 'eager';
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.addEventListener('load', () => {
            if (!frame.hasAttribute('src')) return;
            frame.dataset.loaded = 'true';
            if (frame.classList.contains('active')) {
                document.getElementById('workspaceLoading')?.classList.add('hidden');
            }
        });
        workspace.appendChild(frame);
    });

    document.querySelectorAll('.sidebar a[data-tool]').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            activateWorkspaceTool(link.dataset.tool);
        });
    });

    window.addEventListener('popstate', () => {
        activateWorkspaceTool(selectedWorkspaceTool().id, { updateHistory: false });
    });

    const initialTool = selectedWorkspaceTool();
    activateWorkspaceTool(initialTool.id, { updateHistory: false });
    window.history.replaceState({ tool: initialTool.id }, '', workspaceHistoryUrl(initialTool));
}

function toggleCategory(id) {
    const category = document.getElementById(id);
    if (!category) return;

    category.classList.toggle('collapsed');
    const button = category.querySelector('.category-header');
    if (button) button.setAttribute('aria-expanded', String(!category.classList.contains('collapsed')));
}

document.cookie = 'collapsedCats=; path=/; max-age=0; SameSite=Lax';

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        document.cookie = `sidebarStatus=collapsed; max-age=${30 * 24 * 60 * 60}; path=/; SameSite=Lax`;
    } else {
        document.cookie = 'sidebarStatus=expanded; path=/; max-age=0; SameSite=Lax';
    }
}
