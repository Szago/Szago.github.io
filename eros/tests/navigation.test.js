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
vm.runInContext(`${source}\nthis.__erosTest = { EROS_BASE, EROS_TOOLS, isEmbeddedTool, toolForCurrentPage, selectedWorkspaceTool, sidebarHTML, workspaceToolUrl, workspaceHistoryUrl };`, context);

const {
    EROS_BASE,
    EROS_TOOLS,
    isEmbeddedTool,
    toolForCurrentPage,
    selectedWorkspaceTool,
    sidebarHTML,
    workspaceToolUrl,
    workspaceHistoryUrl
} = context.__erosTest;

assert.equal(EROS_BASE, '/eros');
assert.equal(EROS_TOOLS.length, 10);
assert.equal(new Set(EROS_TOOLS.map(tool => tool.id)).size, EROS_TOOLS.length);
assert.equal(new Set(EROS_TOOLS.map(tool => tool.navId)).size, EROS_TOOLS.length);
assert.equal(new Set(EROS_TOOLS.map(tool => tool.path)).size, EROS_TOOLS.length);

const sidebar = sidebarHTML();
assert.equal((sidebar.match(/data-tool=/g) || []).length, EROS_TOOLS.length);
assert.match(sidebar, /href="\/index\.html"/);
assert.doesNotMatch(sidebar, /href="\/eros\/Tools\//);

for (const tool of EROS_TOOLS) {
    assert.ok(fs.existsSync(path.join(erosRoot, tool.path)), `Missing tool page: ${tool.path}`);
    assert.equal(workspaceToolUrl(tool), `/eros${tool.path}?embedded=1`);
}

assert.equal(workspaceHistoryUrl(EROS_TOOLS[0]).pathname, '/eros/');
assert.equal(workspaceHistoryUrl(EROS_TOOLS[0]).search, '');
assert.equal(workspaceHistoryUrl(EROS_TOOLS[1]).search, '?tool=silver');

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
windowMock.top = {};
assert.equal(isEmbeddedTool(), true);

console.log('EROS navigation tests passed.');
