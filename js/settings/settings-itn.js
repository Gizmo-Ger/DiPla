// ======================================================================
// settings-itn.js – v2.1 FINAL (DATE ONLY)
// ITN = ganztägiger Termin (nur Datum, keine Uhrzeit)
// Speicherung ausschließlich über plan.notes[*].text
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { loadMonthPlan, persistMonthPlan } from '/js/core/persist.js';
import { popup } from '/js/core/popup.js';

import {
  getCurrentYear,
  getWeekRangeFromDate,
  parseDate,
  toIso,
  formatDateWeekday,
} from '/js/misc/datetime.js';

// ----------------------------------------------------------------------
// Konstante
// ----------------------------------------------------------------------
const ITN_MARKER = 'ITN';

// ----------------------------------------------------------------------
// upsertSystemNote
// ----------------------------------------------------------------------
function upsertSystemNote(plan, note) {
  if (!plan || !note?.weekStart || !note?.text) return;
  if (!note.meta?.type) return; // zwingend

  if (!Array.isArray(plan.notes)) plan.notes = [];

  plan.notes = plan.notes.filter(
    (n) =>
      !(
        n.weekStart === note.weekStart &&
        n.source === 'system' &&
        n.meta?.type === note.meta.type
      )
  );

  plan.notes.push(note);
}

// ----------------------------------------------------------------------
// Helfer: Text bauen
// ----------------------------------------------------------------------
function buildItnLine(isoDate) {
  const label = formatDateWeekday(isoDate);
  return `${ITN_MARKER} am ${label}`;
}

// ----------------------------------------------------------------------
// INTERNER UI-Helper: ITN-Zeile aus notes parsen (nur Anzeige)
// Erwartet z.B.:
//   "ITN am Dienstag, 13.01.2026"
// ----------------------------------------------------------------------
function parseItnLine(line) {
  if (!line || typeof line !== 'string') return null;
  if (!line.trim().startsWith(ITN_MARKER)) return null;

  // Datum am Ende extrahieren (DD.MM.YYYY)
  const m = line.match(/(\d{1,2}\.\d{1,2}\.\d{4})$/);
  if (!m) return null;

  const d = parseDate(m[1]);
  if (!d) return null;

  return {
    isoDate: toIso(d),
  };
}

// ----------------------------------------------------------------------
// NOTES lesen
// ----------------------------------------------------------------------
function collectItnFromPlan(plan) {
  const out = [];
  if (!plan || !Array.isArray(plan.notes)) return out;

  for (const n of plan.notes) {
    if (!n?.weekStart) continue;

    // nur neue System-ITN-Notes
    if (n.source !== 'system') continue;
    if (n.meta?.type !== 'itn') continue;

    const line = String(n.text || '').trim();
    const parsed = parseItnLine(line);
    if (!parsed) continue;

    const d = parseDate(parsed.isoDate);
    if (!d) continue;

    out.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      isoDate: parsed.isoDate,
      weekStart: n.weekStart,
    });
  }

  return out;
}

// ----------------------------------------------------------------------
// ITN hinzufügen / ersetzen (pro KW max. 1 ITN)
// ----------------------------------------------------------------------
async function upsertItn(isoDate) {
  const d = parseDate(isoDate);
  if (!d) throw new Error('Ungültiges Datum');

  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const plan = await loadMonthPlan(year, month);
  if (!plan) throw new Error(`Plan fehlt für ${year}-${month}`);

  if (!Array.isArray(plan.notes)) plan.notes = [];

  const { start: weekStart } = getWeekRangeFromDate(d);
  const weekIso = toIso(weekStart);

  const line = buildItnLine(isoDate);

  upsertSystemNote(plan, {
    weekStart: weekIso,
    text: line,

    source: 'system',
    visibility: 'public',

    meta: {
      type: 'itn',
      date: isoDate,
      locked: true,
      generatedAt: new Date().toISOString(),
    },
  });

  await persistMonthPlan(plan);
  D.info('itn', 'ITN gesetzt', { isoDate });
}

// ----------------------------------------------------------------------
// ITN löschen
// ----------------------------------------------------------------------
async function deleteItn(itn) {
  const d = parseDate(itn.isoDate);
  if (!d) return;

  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const plan = await loadMonthPlan(year, month);
  if (!plan || !Array.isArray(plan.notes)) return;

  const { start: weekStart } = getWeekRangeFromDate(d);
  const weekIso = toIso(weekStart);

  const beforeLen = plan.notes.length;

  plan.notes = plan.notes.filter(
    (n) =>
      !(
        n.weekStart === weekIso &&
        n.source === 'system' &&
        n.meta?.type === 'itn'
      )
  );

  if (plan.notes.length === beforeLen) return;

  await persistMonthPlan(plan);
  D.info('itn', 'ITN gelöscht', itn);
}

// ----------------------------------------------------------------------
// Jahr laden
// ----------------------------------------------------------------------
async function loadItnForYear(year) {
  const all = [];
  for (let m = 1; m <= 12; m++) {
    try {
      const plan = await loadMonthPlan(year, m);
      if (plan) all.push(...collectItnFromPlan(plan));
    } catch {}
  }
  return all.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

// ----------------------------------------------------------------------
// UI Helpers
// ----------------------------------------------------------------------
function renderYearOptions(y) {
  return Array.from({ length: 4 }, (_, i) => y - 1 + i)
    .map(
      (yr) =>
        `<option value="${yr}" ${yr === y ? 'selected' : ''}>${yr}</option>`
    )
    .join('');
}

function renderTable(list, year) {
  if (!list.length) {
    return `
      <tr class="sm-abs-empty">
        <td colspan="2">Keine ITN-Termine in ${year}</td>
      </tr>`;
  }

  return list
    .map(
      (e) => `
    <tr class="itn-row" data-iso="${e.isoDate}">
      <td>${formatDateWeekday(e.isoDate)}</td>
      <td style="text-align:right;">
        <button
          class="sm-btn-icon itn-delete-btn"
          title="ITN-Termin löschen">
          ✕
        </button>
      </td>
    </tr>
  `
    )
    .join('');
}

// ----------------------------------------------------------------------
// Plugin
// ----------------------------------------------------------------------
export const SettingsPlugin = {
  id: 'itn',
  title: 'ITN',
  order: 5,

  render() {
    const y = getCurrentYear();

    return `
      <div class="sm-team-root">

        <h3>ITN-Termine</h3>

        <div class="sm-editor-row">
          <label>Jahr</label>
          <select id="itn-year" class="sm-input" style="max-width:120px;">
            ${renderYearOptions(y)}
          </select>
        </div>

        <div class="sm-abs-list-wrapper" style="margin-top:10px;">
          <table class="sm-abs-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th style="text-align:right;">Aktion</th>
              </tr>
            </thead>
            <tbody id="itn-list"></tbody>
          </table>
        </div>

        <h4 style="margin-top:16px;">Neuer ITN-Termin</h4>

        <div class="sm-editor-row">
          <label>Datum</label>
          <input id="itn-date" type="date" class="sm-input" style="max-width:180px;">
        </div>

        <div class="sm-editor-buttons">
          <button id="itn-add" class="sm-btn sm-btn-primary">
            ITN hinzufügen
          </button>
        </div>

      </div>
    `;
  },

  async bind() {
    const panel = document.querySelector('.sm-panel');
    if (!panel) return;

    const yearSel = panel.querySelector('#itn-year');
    const listBody = panel.querySelector('#itn-list');
    const dateIn = panel.querySelector('#itn-date');
    const addBtn = panel.querySelector('#itn-add');

    let currentYear = Number(yearSel.value);
    let list = [];

    async function refresh(y) {
      currentYear = y;
      list = await loadItnForYear(y);
      listBody.innerHTML = renderTable(list, y);
    }

    await refresh(currentYear);

    yearSel.addEventListener('change', () => {
      refresh(Number(yearSel.value));
    });

    // Delete
    listBody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.itn-delete-btn');
      if (!btn) return;

      const row = btn.closest('.itn-row');
      const iso = row.dataset.iso;

      const ok = await popup.confirm(
        `ITN-Termin am ${formatDateWeekday(iso)} löschen?`,
        { type: 'warning', okText: 'Löschen' }
      );
      if (!ok) return;

      const loader = popup.loading('Lösche ITN-Termin…');
      try {
        await deleteItn({ isoDate: iso });
        await refresh(currentYear);
        popup.toast('ITN-Termin gelöscht', { type: 'success' });
      } catch {
        popup.alert('Löschen fehlgeschlagen', { type: 'error' });
      } finally {
        loader.close();
      }
    });

    // Add
    addBtn.addEventListener('click', async () => {
      const iso = dateIn.value.trim();
      if (!iso) {
        await popup.alert('Datum erforderlich.', { type: 'error' });
        return;
      }

      const d = parseDate(iso);
      if (!d) {
        await popup.alert('Ungültiges Datum.', { type: 'error' });
        return;
      }

      const { start } = getWeekRangeFromDate(d);
      const weekIso = toIso(start);

      const exists = list.some((e) => e.weekStart === weekIso);
      if (exists) {
        await popup.alert(
          'Für diese Kalenderwoche existiert bereits ein ITN-Termin.',
          { type: 'warning' }
        );
        return;
      }

      const loader = popup.loading('Speichere ITN-Termin…');
      try {
        await upsertItn(iso);
        if (d.getFullYear() === currentYear) {
          await refresh(currentYear);
        }
        popup.toast('ITN-Termin gespeichert', { type: 'success' });
        dateIn.value = '';
      } catch {
        popup.alert('Speichern fehlgeschlagen', { type: 'error' });
      } finally {
        loader.close();
      }
    });

    D.info('itn', 'SettingsPlugin itn v2.1 geladen');
  },
};
