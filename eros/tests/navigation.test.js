const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const erosRoot = path.resolve(__dirname, '..');
const navigationPath = path.join(erosRoot, 'navigation.js');
const source = fs.readFileSync(navigationPath, 'utf8');

const windowMock = {
    location: {
        href: 'https://szago.github.io/eros/',
        pathname: '/eros/',
        search: ''
    }
};
windowMock.self = windowMock;
windowMock.top = windowMock;

const context = {
    URL,
    URLSearchParams,
    window: windowMock,
    document: { cookie: '' }
};

vm.createContext(context);
vm.runInContext(`${source}\nthis.__erosTest = { EROS_BASE, EROS_ABBREVIATION_KEY, EROS_TOOLS, isEmbeddedTool, toolForCurrentPage, selectedWorkspaceTool, sidebarHTML, mobileNavigationHTML, topBarHTML, globalAbbreviationEnabled, workspaceHref, workspaceToolUrl, workspaceHistoryUrl, loadShell };`, context);

const {
    EROS_BASE,
    EROS_ABBREVIATION_KEY,
    EROS_TOOLS,
    isEmbeddedTool,
    toolForCurrentPage,
    selectedWorkspaceTool,
    sidebarHTML,
    mobileNavigationHTML,
    topBarHTML,
    globalAbbreviationEnabled,
    workspaceHref,
    workspaceToolUrl,
    workspaceHistoryUrl,
    loadShell
} = context.__erosTest;

assert.equal(EROS_BASE, '/eros');
assert.equal(EROS_ABBREVIATION_KEY, 'eros-abbreviate-large-values');
assert.equal(EROS_TOOLS.length, 11);
assert.equal(new Set(EROS_TOOLS.map(tool => tool.id)).size, EROS_TOOLS.length);
assert.equal(new Set(EROS_TOOLS.map(tool => tool.navId)).size, EROS_TOOLS.length);
assert.equal(new Set(EROS_TOOLS.map(tool => tool.path)).size, EROS_TOOLS.length);

const sidebar = sidebarHTML();
assert.equal((sidebar.match(/data-tool=/g) || []).length, 10);
assert.match(sidebar, /href="\/index\.html"/);
assert.doesNotMatch(sidebar, /href="\/eros\/Tools\//);
assert.doesNotMatch(sidebar, /data-tool="leaderboard"/);
assert.match(sidebar, /class="sidebar-header-action" href="\/index\.html"/);
assert.match(sidebar, /class="sidebar-header-action" type="button" onclick="toggleSidebar\(\)"/);

const mobileNavigation = mobileNavigationHTML();
assert.match(mobileNavigation, /class="mobile-nav-toggle"/);
assert.match(mobileNavigation, /aria-controls="sidebar"/);
assert.match(mobileNavigation, /class="sidebar-backdrop"/);

const topBar = topBarHTML('Test Calculator', 'none');
assert.match(topBar, /id="global-abbreviation-toggle"/);
assert.match(topBar, /Abbreviate large values/);
assert.equal(globalAbbreviationEnabled(), true);
windowMock.localStorage = { getItem: () => 'false' };
assert.equal(globalAbbreviationEnabled(), false);

const unitStats = EROS_TOOLS.find(tool => tool.id === 'unitstats');
assert.equal(unitStats.accent, '#ec4899');
assert.match(fs.readFileSync(path.join(erosRoot, 'Tools', 'Tool8_unitstats', 'style.css'), 'utf8'), /--accent: #ec4899/);

const sharedShell = fs.readFileSync(path.join(erosRoot, 'shared-shell.css'), 'utf8');
assert.match(sharedShell, /--nav-icon-column: 34px/);
assert.match(sharedShell, /grid-template-columns: var\(--nav-icon-column\) minmax\(0, 1fr\) auto/);
assert.match(sharedShell, /\.sidebar\.collapsed \.nav-links li a[\s\S]*?grid-template-columns: 1fr/);
assert.match(sharedShell, /\.sidebar\.collapsed \.nav-scroll::\-webkit-scrollbar[\s\S]*?width: 0/);
assert.match(sharedShell, /html\.eros-embedded \{[\s\S]*?scrollbar-gutter: stable/);
assert.match(sharedShell, /@media \(max-width: 900px\)[\s\S]*?\.sidebar\.mobile-open/);
assert.match(sharedShell, /html\.eros-embedded\.eros-mobile-shell \.top-bar/);

const workspaceStyle = fs.readFileSync(path.join(erosRoot, 'erosStyle.css'), 'utf8');
assert.match(workspaceStyle, /@media \(max-width: 900px\)[\s\S]*?\.workspace-main[\s\S]*?left: 0/);

const calculatorTheme = fs.readFileSync(path.join(erosRoot, 'calculator-theme.css'), 'utf8');
assert.match(calculatorTheme, /--card-bg: #1e1e26/);
assert.match(calculatorTheme, /\.card \{[\s\S]*?border-radius: 16px/);
assert.match(calculatorTheme, /\.card-header \{[\s\S]*?border-bottom: 1px solid var\(--panel-border\)/);

const calculatorPages = [
    'Tools/Tool1_levelcost/tool.html',
    'Tools/Tool2_sharddrop/tool.html',
    'Tools/Tool3_silverincome/tool.html',
    'Tools/Tool4_playroom/tool.html',
    'Tools/Tool6_networth/tool.html',
    'Tools/Tool7_classstatue/tool.html',
    'Tools/Tool8_unitstats/tool.html'
];

for (const page of calculatorPages) {
    const html = fs.readFileSync(path.join(erosRoot, page), 'utf8');
    assert.match(html, /style\.css[\s\S]*calculator-theme\.css/, `Shared calculator theme must load last: ${page}`);
}

for (const page of [
    'Tools/Tool1_levelcost/tool.html',
    'Tools/Tool3_silverincome/tool.html',
    'Tools/Tool6_networth/tool.html',
    'Tools/Tool7_classstatue/tool.html',
    'Tools/Tool8_unitstats/tool.html'
]) {
    const html = fs.readFileSync(path.join(erosRoot, page), 'utf8');
    assert.doesNotMatch(html, /id="(?:displayModeCheckbox|abbreviateCheckbox)"/, `Local abbreviation toggle remains: ${page}`);
}

for (const tool of EROS_TOOLS) {
    assert.ok(fs.existsSync(path.join(erosRoot, tool.path)), `Missing tool page: ${tool.path}`);
    assert.equal(workspaceToolUrl(tool), `/eros${tool.path}?embedded=1`);
}

assert.equal(workspaceHistoryUrl(EROS_TOOLS[0]).pathname, '/eros/');
assert.equal(workspaceHistoryUrl(EROS_TOOLS[0]).search, '');
assert.equal(workspaceHistoryUrl(EROS_TOOLS[1]).search, '?tool=silver');
assert.equal(workspaceHref(EROS_TOOLS[0]), '/eros/');
assert.equal(workspaceHref(EROS_TOOLS.at(-1)), '/eros/?tool=leaderboard');

windowMock.location.search = '?tool=calendar';
assert.equal(selectedWorkspaceTool().id, 'calendar');
windowMock.location.search = '?tool=unknown';
assert.equal(selectedWorkspaceTool().id, 'playroom');
windowMock.location.search = '';

windowMock.location.pathname = '/eros/Tools/Tool8_unitstats/tool.html';
assert.equal(toolForCurrentPage().id, 'unitstats');
windowMock.location.pathname = '/EROS/TOOLS/TOOL8_UNITSTATS/TOOL.HTML';
assert.equal(toolForCurrentPage().id, 'unitstats');

assert.equal(isEmbeddedTool(), false);
let standaloneRedirect = null;
windowMock.location.replace = target => { standaloneRedirect = String(target); };
loadShell('Unit Stats Calculator', 'none');
assert.equal(standaloneRedirect, '/eros/?tool=unitstats');

windowMock.top = {};
assert.equal(isEmbeddedTool(), true);

const leaderboardHtml = fs.readFileSync(path.join(erosRoot, 'Tools', 'Tool5_leaderboard', 'tool.html'), 'utf8');
assert.match(leaderboardHtml, /window\.self === window\.top/);
assert.match(leaderboardHtml, /\/eros\/\?tool=leaderboard/);

const notFoundHtml = fs.readFileSync(path.resolve(erosRoot, '..', '404.html'), 'utf8');
const redirectScript = notFoundHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
let legacyRedirect = null;
const legacyWindow = {
    location: {
        href: 'https://szago.github.io/EROS/Tools/Tool1_levelcost/tool.html?from=bookmark#result',
        replace: target => { legacyRedirect = String(target); }
    }
};
vm.runInNewContext(redirectScript, { URL, window: legacyWindow });
assert.equal(legacyRedirect, 'https://szago.github.io/eros/Tools/Tool1_levelcost/tool.html?from=bookmark#result');

console.log('EROS navigation tests passed.');
