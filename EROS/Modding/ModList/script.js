const MOD_TILE_COUNT = 20;

// Replace placeholder fields as releases become available. Screenshots accepts
// an array of relative or absolute image URLs and the viewer updates itself.
const MODS = Array.from({ length: MOD_TILE_COUNT }, (_, index) => ({
    title: `Mod ${String(index + 1).padStart(2, '0')}`,
    downloadUrl: '',
    repositoryUrl: '',
    description: 'Description will be added when this mod is ready to publish.',
    version: 'v0.0.0',
    author: 'TBA',
    screenshotSlots: 3,
    screenshots: []
}));

function actionMarkup(button, url, label, iconClass, className) {
    if (!url) {
        button.className = className;
        button.disabled = true;
        button.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i> ${label}`;
        return button;
    }

    const link = document.createElement('a');
    link.className = className;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i> ${label}`;
    button.replaceWith(link);
    return link;
}

function updateViewer(card, mod, requestedIndex) {
    const screenshots = mod.screenshots || [];
    const total = Math.max(screenshots.length, mod.screenshotSlots || 0);
    const index = total ? (requestedIndex + total) % total : 0;
    const screenshot = screenshots[index] || '';
    const hasImage = Boolean(screenshot);
    card.dataset.screenshotIndex = String(index);

    const image = card.querySelector('.screenshot-stage img');
    const placeholder = card.querySelector('.screenshot-placeholder');
    const stage = card.querySelector('.screenshot-stage');
    const previous = card.querySelector('.previous-shot');
    const next = card.querySelector('.next-shot');
    const counter = card.querySelector('.screenshot-counter');
    const dots = card.querySelector('.viewer-dots');

    counter.textContent = total ? `${index + 1} / ${total}` : '0 / 0';
    image.hidden = !hasImage;
    placeholder.hidden = hasImage;
    placeholder.querySelector('span').textContent = total
        ? `Screenshot ${index + 1} coming soon`
        : 'Screenshots coming soon';
    stage.disabled = total < 2;
    previous.disabled = total < 2;
    next.disabled = total < 2;

    if (hasImage) {
        image.src = screenshot;
        image.alt = `${mod.title} screenshot ${index + 1} of ${total}`;
    } else {
        image.removeAttribute('src');
        image.alt = '';
    }

    dots.replaceChildren(...Array.from({ length: total }, (_, dotIndex) => {
        const dot = document.createElement('span');
        dot.className = dotIndex === index ? 'viewer-dot active' : 'viewer-dot';
        return dot;
    }));
}

function setCardExpanded(card, expanded) {
    const details = card.querySelector('.mod-details');
    const expandButton = card.querySelector('.expand-footer');
    const title = card.querySelector('.mod-title').textContent;

    card.classList.toggle('expanded', expanded);
    expandButton.setAttribute('aria-expanded', String(expanded));
    expandButton.setAttribute('aria-label', `${expanded ? 'Hide' : 'Show'} details for ${title}`);
    details.setAttribute('aria-hidden', String(!expanded));
    details.inert = !expanded;
}

function toggleCard(card) {
    setCardExpanded(card, !card.classList.contains('expanded'));
}

function renderModCard(mod, index) {
    const template = document.getElementById('modCardTemplate');
    const card = template.content.firstElementChild.cloneNode(true);
    const details = card.querySelector('.mod-details');
    const expandButton = card.querySelector('.expand-footer');
    card.dataset.modIndex = String(index);
    details.id = `mod-details-${index + 1}`;
    expandButton.setAttribute('aria-controls', details.id);
    card.querySelector('.slot-label').textContent = mod.version;
    card.querySelector('.mod-title').textContent = mod.title;
    card.querySelector('.mod-description').textContent = mod.description;
    card.querySelector('.mod-version').textContent = mod.version;
    card.querySelector('.mod-author').textContent = mod.author;

    actionMarkup(card.querySelector('.download-button'), mod.downloadUrl, 'Download', 'fas fa-download', 'download-button');
    actionMarkup(card.querySelector('.repo-button'), mod.repositoryUrl, 'Check repo', 'fab fa-github', 'repo-button');

    expandButton.addEventListener('click', () => toggleCard(card));

    const showRelativeScreenshot = offset => {
        const current = Number(card.dataset.screenshotIndex || 0);
        updateViewer(card, mod, current + offset);
    };
    card.querySelector('.previous-shot').addEventListener('click', () => showRelativeScreenshot(-1));
    card.querySelector('.next-shot').addEventListener('click', () => showRelativeScreenshot(1));
    card.querySelector('.screenshot-stage').addEventListener('click', () => showRelativeScreenshot(1));

    updateViewer(card, mod, 0);
    setCardExpanded(card, false);
    return card;
}

function renderModList() {
    const grid = document.getElementById('modGrid');
    if (!grid) return;

    grid.replaceChildren(...MODS.map(renderModCard));
    const count = document.getElementById('modCount');
    if (count) count.textContent = String(MODS.length);
}

renderModList();
