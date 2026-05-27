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
        opts = Object.assign({ dayWidth: 26, rowHeight: 40, labelWidth: 96 }, opts || {});
        const dayWidth = opts.dayWidth, rowHeight = opts.rowHeight;
        data = data || {};

        const rows = Math.max(1, parseInt(data.rows, 10) || 10);
        const events = (data.events || []).map((e, i) => ({
            name: e.name || '',
            start: parseDate(e.start),
            end: parseDate(e.end),
            row: parseInt(e.row, 10) || 0,
            color: e.color || PALETTE[i % PALETTE.length]
        })).filter(e => e.start && e.end && e.end >= e.start);

        // Date domain: the span actually covered by events, snapped out to
        // whole months. With no events, fall back to the current month.
        let domainStart, domainEnd;
        if (events.length) {
            domainStart = events.reduce((m, e) => e.start < m ? e.start : m, events[0].start);
            domainEnd = events.reduce((m, e) => e.end > m ? e.end : m, events[0].end);
        } else {
            const n = new Date();
            domainStart = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
            domainEnd = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0));
        }
        domainStart = new Date(Date.UTC(domainStart.getUTCFullYear(), domainStart.getUTCMonth(), 1));
        domainEnd = new Date(Date.UTC(domainEnd.getUTCFullYear(), domainEnd.getUTCMonth() + 1, 0));

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
        const n = new Date();
        const today = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
        if (today >= domainStart && today <= domainEnd) {
            const left = (daysBetween(domainStart, today) + 0.5) * dayWidth;
            todayHtml = `<div class="cal-today" style="left:${left}px" title="Today"></div>`;
        }

        // ---- Left gutter row labels (1..rows) ----
        let labelsHtml = '';
        for (let r = 0; r < rows; r++) {
            labelsHtml += `<div class="cal-rowlabel" style="height:${rowHeight}px">${r + 1}</div>`;
        }

        // Per-day vertical gridlines behind the tracks.
        const gridBg = `background-image:linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px);` +
            `background-size:${dayWidth}px 100%;`;

        container.innerHTML = `
        <div class="cal-wrap">
            <div class="cal-labels" style="width:${opts.labelWidth}px">
                <div class="cal-labels-head"></div>
                <div class="cal-labels-body">${labelsHtml}</div>
            </div>
            <div class="cal-scroll">
                <div class="cal-timeline" style="width:${width}px">
                    <div class="cal-head">
                        <div class="cal-months">${monthsHtml}</div>
                        <div class="cal-days">${daysHtml}</div>
                    </div>
                    <div class="cal-rows" style="${gridBg}">${tracksHtml}${todayHtml}</div>
                </div>
            </div>
        </div>`;
    }

    global.renderCalendar = renderCalendar;
    global.CalendarPalette = PALETTE;
})(window);
