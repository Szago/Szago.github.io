/* Character page — reads ?id=<character> from the URL, pulls that unit's
   data from the shared characters.json, and fills in the tile.
   The Details/Rating/Teams/Placement tabs are placeholders for now. */

const CHARACTERS_URL = '/EROS/Characters/characters.json';

// Class -> icon, so the tile shows a matching glyph.
const CLASS_ICONS = {
    Fighter: 'fa-khanda',
    Mage:    'fa-hat-wizard',
    Tank:    'fa-shield-halved',
    Healer:  'fa-staff-snake'
};

function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

// Render Markdown to HTML (falls back to escaped text if the lib is missing).
function renderMarkdown(text) {
    text = text || '';
    if (window.marked) { try { return marked.parse(text); } catch (e) { /* fall through */ } }
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
}

async function loadCharacter() {
    setupTabs();

    let roster;
    try {
        const res = await fetch(CHARACTERS_URL);
        roster = await res.json();
    } catch (e) {
        document.getElementById('charName').textContent = 'Could not load character data';
        return;
    }

    const id = getParam('id');
    // Fall back to the first character if no/invalid id was passed.
    const char = roster.find(c => c.id === id) || roster[0];
    if (!char) return;

    renderTile(char);
    renderTabs(char);
}

function setText(id, value) {
    document.getElementById(id).textContent = value || '—';
}

function renderTile(char) {
    document.title = `Eros - ${char.name}`;
    setText('charName', char.name);
    setText('charClass', char.class);
    setText('charRace', char.race);
    setText('charFaction', char.faction);
    setText('charElement', char.element);

    // Rarity, with a color class (rarity-legendary, etc.).
    const rarityEl = document.getElementById('charRarity');
    rarityEl.textContent = char.rarity || '—';
    rarityEl.className = 'meta-value' + (char.rarity ? ` rarity-${char.rarity.toLowerCase()}` : '');

    // Match the class icon in the tile header row.
    const classIcon = CLASS_ICONS[char.class];
    if (classIcon) document.getElementById('classIcon').className = `fas ${classIcon}`;

    // Portrait: use the image if present, otherwise keep the placeholder icon.
    const portrait = document.getElementById('charPortrait');
    if (char.image) {
        portrait.style.backgroundImage = `url('${char.image}')`;
        portrait.classList.add('has-image');
        portrait.innerHTML = '';
    }
}

// Fill the Details/Rating/Teams/Placement tabs from the character data.
function renderTabs(char) {
    ['details', 'rating', 'teams', 'placement'].forEach(key => {
        const panel = document.getElementById('tab-' + key);
        const text = (char[key] || '').trim();
        if (text) {
            panel.innerHTML = `<div class="panel-text">${renderMarkdown(text)}</div>`;
        } else {
            panel.innerHTML = `<div class="panel-empty">No ${key} info yet.</div>`;
        }
    });
}

function setupTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });
}
