// ======================================================================
// settings-schoolholidays.js – FINAL (Schema v2 + Übersicht)
// Schulferien (SH) → system notes + Anzeige
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { loadMonthPlan, persistMonthPlan } from '/js/core/persist.js';
import {
  fetchSchoolHolidays,
  buildSchoolHolidayLine,
  STATE_SH,
} from '/js/misc/schoolholidays.js';
import { confirmChoice, toast, loading } from '/js/core/popup.js';
import { getWeekRangeFromDate, toIso, parseDate } from '/js/misc/datetime.js';

// ----------------------------------------------------------------------
// System-Note Helper (lokal, kein Quer-Import)
// ----------------------------------------------------------------------
function upsertSystemNote(plan, note) {
  if (!plan || !note?.weekStart || !note?.meta?.type) return;

  if (!Array.isArray(plan.notes)) plan.notes = [];

  plan.notes = plan.notes.filter(
    (n) =>
      !(
        n.weekStart === note.weekStart &&
        n.source === 'system' &&
        n.meta?.type === note.meta.type &&
        n.meta?.start === note.meta.start &&
        n.meta?.end === note.meta.end
      )
  );

  plan.notes.push(note);
}

// ----------------------------------------------------------------------
// CLEANUP: Alle Schulferien-Systemnotes eines Jahres entfernen
// Entfernt alte UND neue Syntax zuverlässig
// ----------------------------------------------------------------------
function removeSchoolHolidayNotesForYear(plan, year) {
  if (!plan || !Array.isArray(plan.notes)) return;

  const y = String(year);

  plan.notes = plan.notes.filter((n) => {
    // Nur Systemnotes behalten, die KEINE Schulferien sind
    if (n.source !== 'system') return true;
    if (n.meta?.type !== 'schoolholidays') return true;

    // Neue Syntax: über meta.start
    if (typeof n.meta?.start === 'string') {
      return !n.meta.start.startsWith(y);
    }

    // Alte Syntax: Fallback über Text
    // (SCHULFERIEN: ... (19.12.2025–06.01.2026))
    const m = n.text?.match(/\b(\d{4})\b/);
    if (m) {
      return m[1] !== y;
    }

    // Im Zweifel: löschen
    return false;
  });
}


// ----------------------------------------------------------------------
// Anzeige: Schulferien-Liste (UI-only)
// ----------------------------------------------------------------------
function renderHolidayList(container, periods, year) {
  if (!container) return;

  const list = periods
    .filter((p) => p.start?.startsWith(String(year)))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (!list.length) {
    container.innerHTML =
      `<div class="sm-hint">Keine Schulferien für ${year}.</div>`;
    return;
  }

  container.innerHTML = `
    <ul class="sm-list">
      ${list
        .map(
          (p) =>
            `<li>${buildSchoolHolidayLine(p).replace(/^SCHULFERIEN:\s*/, '')}</li>`
        )
        .join('')}
    </ul>
  `;
}

// ======================================================================
// Plugin
// ======================================================================
export const SettingsPlugin = {
  id: 'schoolholidays',
  title: 'Schulferien',
  order: 7,

  // --------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------
  render() {
    const now = new Date().getFullYear();
    const years = [now - 1, now, now + 1, now + 2];

    return `
      <div class="sm-system-root">

        <h3>Schulferien (SH)</h3>

        <div class="sm-editor-row">
          <label>Jahr</label>
          <select id="sf-year" class="sm-input" style="max-width:120px;">
            ${years
              .map(
                (y) =>
                  `<option value="${y}" ${y === now ? 'selected' : ''}>${y}</option>`
              )
              .join('')}
          </select>
        </div>

        <div class="sm-editor-row" style="margin-top:12px;">
          <label>Aktion</label>
          <div>
            <button id="sf-import" class="sm-btn sm-btn-primary">
              Schulferien importieren
            </button>
          </div>
        </div>

        <div class="sm-hint" style="margin-top:10px;">
          Vorhandene Schulferien-Einträge werden ersetzt.
        </div>

        <div class="sm-schoolholiday-list" id="sf-list" style="margin-top:14px;"></div>

      </div>
    `;
  },

  // --------------------------------------------------------------------
  // BIND
  // --------------------------------------------------------------------
  async bind() {
    const panel = document.querySelector('.sm-panel');
    if (!panel) return;

    const yearSel = panel.querySelector('#sf-year');
    const importBtn = panel.querySelector('#sf-import');
    const listEl = panel.querySelector('#sf-list');

    // ----------------------------
    // Initiale Anzeige
    // ----------------------------
    await loadAndRender(Number(yearSel.value));

    yearSel.addEventListener('change', async () => {
      await loadAndRender(Number(yearSel.value));
    });

    // ----------------------------
    // Import
    // ----------------------------
    importBtn.addEventListener('click', async () => {
      const year = Number(yearSel.value);
      if (!year) return;

      let periods;
      try {
        periods = await fetchSchoolHolidays(STATE_SH, year);
      } catch (e) {
        D.error('schoolholidays', 'Fetch fehlgeschlagen', e);
        toast('Schulferien konnten nicht geladen werden.', { type: 'error' });
        return;
      }

      if (!periods.length) {
        toast(`Keine Schulferien für ${year} gefunden.`, { type: 'warn' });
        return;
      }

      const preview = `
        <div style="text-align:left;">
          <strong>Schulferien SH – ${year}</strong>
          <ul style="margin-top:6px;">
            ${periods
              .map(
                (p) =>
                  `<li>${buildSchoolHolidayLine(p).replace(/^SCHULFERIEN:\s*/, '')}</li>`
              )
              .join('')}
          </ul>
        </div>
      `;

      const ok = await confirmChoice(
        preview,
        [
          { label: 'Import starten', value: 'import' },
          { label: 'Abbrechen', value: null },
        ],
        { type: 'warn', allowHTML: true }
      );

      if (ok !== 'import') return;

      const loader = loading('Schulferien werden importiert…');

      try {
        for (const p of periods) {
          const start = parseDate(p.start);
          const end = parseDate(p.end);
          if (!start || !end) continue;

          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const { start: weekStart } = getWeekRangeFromDate(d);
            const weekIso = toIso(weekStart);

            const plan = await loadMonthPlan(
              weekStart.getFullYear(),
              weekStart.getMonth() + 1
            );
            if (!plan) continue;

            removeSchoolHolidayNotesForYear(plan, year);

            upsertSystemNote(plan, {
              weekStart: weekIso,
              text: buildSchoolHolidayLine(p),

              source: 'system',
              visibility: 'public',

              meta: {
                type: 'schoolholidays',
                locked: true,
                start: p.start,
                end: p.end,
                generatedAt: new Date().toISOString(),
              },
            });

            await persistMonthPlan(plan);
          }
        }

        loader.close();
        toast(`Schulferien ${year} importiert.`, { type: 'success' });
        D.info('schoolholidays', 'Import abgeschlossen', { year });

        // Anzeige aktualisieren
        await loadAndRender(year);
      } catch (e) {
        loader.close();
        D.error('schoolholidays', 'Import fehlgeschlagen', e);
        toast('Fehler beim Import der Schulferien.', { type: 'error' });
      }
    });

    // ----------------------------
    // Helper: Fetch + Render
    // ----------------------------
    async function loadAndRender(year) {
      let periods;
      try {
        periods = await fetchSchoolHolidays(STATE_SH, year);
      } catch (e) {
        D.error('schoolholidays', 'Fetch fehlgeschlagen', e);
        toast('Schulferien konnten nicht geladen werden.', { type: 'error' });
        return;
      }

      renderHolidayList(listEl, periods, year);
    }
  },
};
