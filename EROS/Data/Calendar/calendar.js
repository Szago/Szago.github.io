/* ======================================================================
   CALENDAR TIMELINE — shared renderer.
   Draws a "line styled" calendar: a horizontal time axis with one row per
   line, each event drawn as a bar spanning its start→end duration.

   Used by BOTH:
     - the public page  /EROS/Data/Calendar/index.html
     - the internal editor preview  /EROS/Characters/Editor/index.html
   so the editor preview always matches what the live page will show.

   Data shape (calendar.json):
     { "rows": 10,
       "events": [ { "name", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD",
                     "row": 0, "color": "#rrggbb" } ] }
   ====================================================================== */
(function (global) {
    const DAY = 86400000;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // Default bar colours, cycled when an event has no explicit colour.
    const PALETTE = ['#8c35f7', '#2ec4b6', '#ff9447', '#ff4d6d', '#6bcb77', '#5aa9e6', '#ffd23f', '#c77dff'];

    // Parse "YYYY-MM-DD" into a UTC date (noon-safe — avoids timezone drift).
    function parseDate(s) {
        if (!s) return null;
        const p = String(s).split('-').map(Number);
        if (p.length < 3 || p.some(isNaN)) return null;
        return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    }
    function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / DAY); }
    function fmt(d) { return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderCalendar(container, data, opts) {
        opts = Object.assign({
            dayWidth: 26, rowHeight: 40, labelWidth: 140,
            minPastMonths: 1, minFutureMonths: 2
        }, opts || {});
        const dayWidth = opts.dayWidth, rowHeight = opts.rowHeight;
        data = data || {};

        const rows = Math.max(1, parseInt(data.rows, 10) || 10);
        const rowNames = Array.isArray(data.rowNames) ? data.rowNames : [];
        const events = (data.events || []).map((e, i) => ({
            name: e.name || '',
            start: parseDate(e.start),
            end: parseDate(e.end),
            row: parseInt(e.row, 10) || 0,
            color: e.color || PALETTE[i % PALETTE.length]
        })).filter(e => e.start && e.end && e.end >= e.start);

        // Date domain: starts from the events' span (or today, if none),
        // then expanded so the calendar ALWAYS shows a reasonable window
        // around today — otherwise an empty / past-only schedule looks
        // like a frozen void you can't scroll.
        let domainStart, domainEnd;
        if (events.length) {
            domainStart = events.reduce((m, e) => e.start < m ? e.start : m, events[0].start);
            domainEnd   = events.reduce((m, e) => e.end   > m ? e.end   : m, events[0].end);
        } else {
            const n = new Date();
            domainStart = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
            domainEnd   = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0));
        }
        // Snap to whole months.
        domainStart = new Date(Date.UTC(domainStart.getUTCFullYear(), domainStart.getUTCMonth(), 1));
        domainEnd   = new Date(Date.UTC(domainEnd.getUTCFullYear(),   domainEnd.getUTCMonth() + 1, 0));

        // Always include a window around today so the timeline stays useful
        // when events are sparse, all in the past, or absent entirely.
        const nowD = new Date();
        const minStart = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - opts.minPastMonths, 1));
        const minEnd   = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() + opts.minFutureMonths + 1, 0));
        if (minStart < domainStart) domainStart = minStart;
        if (minEnd   > domainEnd)   domainEnd   = minEnd;
        const today = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate()));

        const totalDays = daysBetween(domainStart, domainEnd) + 1;
        const width = totalDays * dayWidth;

        // ---- Month band (one block per month, sized to its day count) ----
        const months = [];
        let cur = new Date(domainStart);
        while (cur <= domainEnd) {
            const mEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
            const to = mEnd > domainEnd ? domainEnd : mEnd;
            months.push({
                label: MONTHS[cur.getUTCMonth()] + ' ' + cur.getUTCFullYear(),
                days: daysBetween(cur, to) + 1
            });
            cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
        }
        const monthsHtml = months.map(m =>
            `<div class="cal-month" style="width:${m.days * dayWidth}px">${esc(m.label)}</div>`).join('');

        // ---- Day ticks (weekends shaded) ----
        let daysHtml = '';
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(domainStart.getTime() + i * DAY);
            const wd = d.getUTCDay();
            const weekend = wd === 0 || wd === 6 ? ' weekend' : '';
            daysHtml += `<div class="cal-day${weekend}" style="width:${dayWidth}px">${d.getUTCDate()}</div>`;
        }

        // ---- Row tracks + event bars ----
        let tracksHtml = '';
        for (let r = 0; r < rows; r++) {
            const bars = events.filter(e => e.row === r).map(e => {
                const left = daysBetween(domainStart, e.start) * dayWidth;
                const w = (daysBetween(e.start, e.end) + 1) * dayWidth;
                const label = e.name || '(unnamed)';
                return `<div class="cal-event" title="${esc(label)} · ${fmt(e.start)} → ${fmt(e.end)}" ` +
                    `style="left:${left}px;width:${w}px;background:${esc(e.color)}"><span>${esc(label)}</span></div>`;
            }).join('');
            tracksHtml += `<div class="cal-track" style="height:${rowHeight}px">${bars}</div>`;
        }

        // ---- "Today" marker (only if it falls within the domain) ----
        let todayHtml = '';
        if (today >= domainStart && today <= domainEnd) {
            const left = (daysBetween(domainStart, today) + 0.5) * dayWidth;
            todayHtml = `<div class="cal-today" style="left:${left}px" title="Today"></div>`;
        }

        // ---- Left gutter row labels (rowNames if provided, else "1".."N") ----
        let labelsHtml = '';
        for (let r = 0; r < rows; r++) {
            const name = (rowNames[r] || '').trim() || String(r + 1);
            labelsHtml += `<div class="cal-rowlabel" style="height:${rowHeight}px" title="${esc(name)}">${esc(name)}</div>`;
        }

        // Per-day vertical gridlines behind the tracks.
        const gridBg = `background-image:linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px);` +
            `background-size:${dayWidth}px 100%;`;

        // Expose the domain on the DOM so the controller (mountCalendar)
        // can do date-aware things like "scroll by one month" without
        // re-parsing the data.
        const isoStart = domainStart.toISOString().slice(0, 10);

        container.innerHTML = `
        <div class="cal-wrap">
            <div class="cal-labels" style="width:${opts.labelWidth}px">
                <div class="cal-labels-head"></div>
                <div class="cal-labels-body">${labelsHtml}</div>
            </div>
            <div class="cal-scroll">
                <div class="cal-timeline"
                     data-domain-start="${isoStart}"
                     data-total-days="${totalDays}"
                     data-day-width="${dayWidth}"
                     style="width:${width}px">
                    <div class="cal-head">
                        <div class="cal-months">${monthsHtml}</div>
                        <div class="cal-days">${daysHtml}</div>
                    </div>
                    <div class="cal-rows" style="${gridBg}">${tracksHtml}${todayHtml}</div>
                </div>
            </div>
        </div>`;
    }

    /* ------------------------------------------------------------------
       mountCalendar — wraps renderCalendar with a toolbar + interactions.
       Returns an API used by the page and the editor preview:
         setData(data)      — re-render with new data, preserves view
         scrollToToday()    — center the today marker (or jump to start)
         scrollByMonths(n)  — pan one month at a time, snapped
         zoomIn() / zoomOut()
       Interactions: drag-to-pan, Ctrl/Cmd + wheel to zoom (anchored on
       the cursor), Shift + wheel to scroll horizontally.
       ------------------------------------------------------------------ */
    function mountCalendar(container, data, opts) {
        opts = Object.assign({
            dayWidth: 26, minDay: 8, maxDay: 80,
            rowHeight: 40, labelWidth: 96,
            autoScrollToToday: true
        }, opts || {});

        const baseDayWidth = opts.dayWidth;
        const state = { data: data || {}, dayWidth: opts.dayWidth };
        let firstRender = true;

        container.classList.add('cal-mount');
        container.innerHTML =
            '<div class="cal-toolbar">' +
                '<div class="cal-tools-left">' +
                    '<button class="cal-btn" data-act="prev" title="Previous month"><i class="fas fa-chevron-left"></i></button>' +
                    '<button class="cal-btn" data-act="today" title="Jump to today">Today</button>' +
                    '<button class="cal-btn" data-act="next" title="Next month"><i class="fas fa-chevron-right"></i></button>' +
                '</div>' +
                '<div class="cal-tools-right">' +
                    '<button class="cal-btn" data-act="zoom-out" title="Zoom out (Ctrl + wheel down)"><i class="fas fa-magnifying-glass-minus"></i></button>' +
                    '<span class="cal-zoom-label" title="Zoom level">100%</span>' +
                    '<button class="cal-btn" data-act="zoom-in" title="Zoom in (Ctrl + wheel up)"><i class="fas fa-magnifying-glass-plus"></i></button>' +
                '</div>' +
            '</div>' +
            '<div class="cal-host"></div>';

        const host = container.querySelector('.cal-host');
        const zoomLabel = container.querySelector('.cal-zoom-label');

        container.querySelectorAll('.cal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const act = btn.dataset.act;
                if (act === 'prev')      scrollByMonths(-1);
                else if (act === 'next') scrollByMonths(1);
                else if (act === 'today')scrollToToday();
                else if (act === 'zoom-in')  zoomIn();
                else if (act === 'zoom-out') zoomOut();
            });
        });

        let currentScroll = null;

        function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

        function render() {
            // Preserve the day at the centre of the viewport across re-renders
            // (zoom, data change). Pixel scrollLeft would shift; the centre
            // day is what the user expects to stay put.
            let centreDay = null;
            const dom = readDomain();
            if (currentScroll && dom) {
                centreDay = (currentScroll.scrollLeft + currentScroll.clientWidth / 2) / dom.dayWidth;
            }

            renderCalendar(host, state.data, {
                dayWidth: state.dayWidth,
                rowHeight: opts.rowHeight,
                labelWidth: opts.labelWidth
            });

            currentScroll = host.querySelector('.cal-scroll');
            bindScrollInteractions(currentScroll);

            if (firstRender && opts.autoScrollToToday) {
                requestAnimationFrame(() => scrollToToday(false));
            } else if (centreDay !== null) {
                const newDom = readDomain();
                if (newDom) {
                    const target = centreDay * newDom.dayWidth - currentScroll.clientWidth / 2;
                    currentScroll.scrollLeft = clamp(target, 0, currentScroll.scrollWidth - currentScroll.clientWidth);
                }
            }
            firstRender = false;
            updateZoomLabel();
        }

        function bindScrollInteractions(scroll) {
            if (!scroll) return;

            // Drag-to-pan using Pointer Events with capture. Capturing the
            // pointer means we keep getting move events even if the cursor
            // leaves .cal-scroll — no window-level listeners needed, and no
            // stale-closure issues across re-renders.
            let dragging = false;
            let startX = 0;
            let startScroll = 0;

            scroll.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;                 // left button only
                if (e.pointerType === 'touch') return;      // let native touch scroll
                dragging = true;
                startX = e.clientX;
                startScroll = scroll.scrollLeft;
                scroll.classList.add('dragging');
                try { scroll.setPointerCapture(e.pointerId); } catch (_) { /* old browser */ }
            });
            scroll.addEventListener('pointermove', (e) => {
                if (!dragging) return;
                scroll.scrollLeft = startScroll - (e.clientX - startX);
            });
            const endDrag = (e) => {
                if (!dragging) return;
                dragging = false;
                scroll.classList.remove('dragging');
                if (e && e.pointerId != null) {
                    try { scroll.releasePointerCapture(e.pointerId); } catch (_) {}
                }
            };
            scroll.addEventListener('pointerup', endDrag);
            scroll.addEventListener('pointercancel', endDrag);
            scroll.addEventListener('lostpointercapture', endDrag);

            // Block the browser's native drag-start on the inner bars so a
            // click-and-drag on an event becomes a pan instead of a ghost drag.
            scroll.addEventListener('dragstart', (e) => e.preventDefault());

            scroll.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    zoomAt(e.clientX, e.deltaY < 0 ? 1 : -1);
                } else if (e.shiftKey && e.deltaY !== 0 && e.deltaX === 0) {
                    e.preventDefault();
                    scroll.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        }

        function readDomain() {
            const tl = host.querySelector('.cal-timeline');
            if (!tl) return null;
            const start = tl.dataset.domainStart;
            const total = parseInt(tl.dataset.totalDays, 10);
            const dw    = parseInt(tl.dataset.dayWidth, 10);
            if (!start || !total || !dw) return null;
            const p = start.split('-').map(Number);
            return { start: new Date(Date.UTC(p[0], p[1] - 1, p[2])), totalDays: total, dayWidth: dw };
        }

        function setDayWidthAnchored(target, anchorClientX) {
            const next = clamp(Math.round(target), opts.minDay, opts.maxDay);
            if (next === state.dayWidth) return;
            // Remember the world-x under the anchor so we can keep it pinned.
            let worldX = null;
            if (currentScroll && anchorClientX != null) {
                const rect = currentScroll.getBoundingClientRect();
                worldX = (anchorClientX - rect.left + currentScroll.scrollLeft) / state.dayWidth;
            }
            state.dayWidth = next;
            render();
            if (worldX != null && currentScroll) {
                const rect = currentScroll.getBoundingClientRect();
                const newScrollLeft = worldX * next - (anchorClientX - rect.left);
                currentScroll.scrollLeft = clamp(newScrollLeft, 0, currentScroll.scrollWidth - currentScroll.clientWidth);
            }
        }

        function zoomAt(clientX, dir) {
            const factor = 1.2;
            setDayWidthAnchored(state.dayWidth * (dir > 0 ? factor : 1 / factor), clientX);
        }
        function zoomIn()  { setDayWidthAnchored(state.dayWidth * 1.25); }
        function zoomOut() { setDayWidthAnchored(state.dayWidth / 1.25); }

        function setData(d) { state.data = d || {}; render(); }

        function updateZoomLabel() {
            if (zoomLabel) zoomLabel.textContent = Math.round(100 * state.dayWidth / baseDayWidth) + '%';
        }

        function scrollByMonths(n) {
            const dom = readDomain();
            if (!currentScroll || !dom) return;
            const maxScroll = Math.max(0, currentScroll.scrollWidth - currentScroll.clientWidth);
            if (maxScroll <= 0) return;  // nothing to scroll

            // Use the LEFT edge of the viewport as the anchor — that matches
            // user intuition ("show me the next month" = align next month to
            // the left), and works the same regardless of zoom level.
            const leftDay = Math.round(currentScroll.scrollLeft / dom.dayWidth);
            const leftDate = new Date(dom.start.getTime() + leftDay * 86400000);

            // For n=+1 (next), jump to the start of the NEXT calendar month.
            // For n=-1 (prev), jump to the start of the PREVIOUS month — but
            // if the left edge already sits past day 1 of its own month, the
            // first "prev" press should snap back to day 1 of that month
            // (otherwise it would skip a whole month).
            let targetY = leftDate.getUTCFullYear();
            let targetM = leftDate.getUTCMonth() + n;
            if (n < 0 && leftDate.getUTCDate() > 1) targetM += 1;

            const target = new Date(Date.UTC(targetY, targetM, 1));
            const targetDay = Math.round((target - dom.start) / 86400000);
            const targetX = clamp(targetDay * dom.dayWidth, 0, maxScroll);
            currentScroll.scrollTo({ left: targetX, behavior: 'smooth' });
        }

        function scrollToToday(smooth) {
            if (!currentScroll) return;
            const marker = host.querySelector('.cal-today');
            const target = marker
                ? parseFloat(marker.style.left) - currentScroll.clientWidth / 2
                : 0;
            const clamped = clamp(target, 0, currentScroll.scrollWidth - currentScroll.clientWidth);
            currentScroll.scrollTo({ left: clamped, behavior: smooth === false ? 'auto' : 'smooth' });
        }

        render();
        return { setData, scrollToToday, scrollByMonths, zoomIn, zoomOut };
    }

    global.renderCalendar = renderCalendar;
    global.mountCalendar  = mountCalendar;
    global.CalendarPalette = PALETTE;
})(window);
