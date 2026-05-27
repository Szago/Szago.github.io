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
}

function renderTile(char) {
    document.title = `Eros - ${char.name}`;
    document.getElementById('charName').textContent = char.name || '—';
    document.getElementById('charClass').textContent = char.class || '—';
    document.getElementById('charFaction').textContent = char.faction || '—';
    document.getElementById('charElement').textContent = char.element || '—';

    // Match the class icon in the tile header row.
    const classIcon = CLASS_ICONS[char.class];
    if (classIcon) {
        const el = document.querySelector('.meta-row .meta-label i.fa-shield-halved');
        if (el) el.className = `fas ${classIcon}`;
    }

    // Portrait: use the image if present, otherwise keep the placeholder icon.
    const portrait = document.getElementById('charPortrait');
    if (char.image) {
        portrait.style.backgroundImage = `url('${char.image}')`;
        portrait.classList.add('has-image');
        portrait.innerHTML = '';
    }
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
