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
vm.runInContext(`${source}\nthis.__erosTest = { EROS_BASE, EROS_TOOLS, isEmbeddedTool, toolForCurrentPage, selectedWorkspaceTool, sidebarHTML, workspaceHref, workspaceToolUrl, workspaceHistoryUrl, loadShell };`, context);

const {
    EROS_BASE,
    EROS_TOOLS,
    isEmbeddedTool,
    toolForCurrentPage,
    selectedWorkspaceTool,
    sidebarHTML,
    workspaceHref,
    workspaceToolUrl,
    workspaceHistoryUrl,
    loadShell
} = context.__erosTest;

assert.equal(EROS_BASE, '/eros');
assert.equal(EROS_TOOLS.length, 11);
assert.equal(new Set(EROS_TOOLS.map(tool => tool.id)).size, EROS_TOOLS.length);
assert.equal(new Set(EROS_TOOLS.map(tool => tool.navId)).size, EROS_TOOLS.length);
assert.equal(new Set(EROS_TOOLS.map(tool => tool.path)).size, EROS_TOOLS.length);

const sidebar = sidebarHTML();
assert.equal((sidebar.match(/data-tool=/g) || []).length, 10);
assert.match(sidebar, /href="\/index\.html"/);
assert.doesNotMatch(sidebar, /href="\/eros\/Tools\//);
assert.doesNotMatch(sidebar, /data-tool="leaderboard"/);

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
