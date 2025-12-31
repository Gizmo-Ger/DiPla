// ======================================================================
// settings-teammeeting.js – FINAL
// Verwaltung von Teamsitzungen über SYSTEM-NOTES in month.json
// - exakt analog zu settings-itn.js
// - eine Teamsitzung = eine System-Note pro Woche
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
// KONSTANTEN
// ----------------------------------------------------------------------
const TM_MARKER = 'Teamsitzung';

// ----------------------------------------------------------------------
// SYSTEM-NOTE UPSERT (lokal, bewusst)
// ----------------------------------------------------------------------
function upsertSystemNote(plan, note) {
  if (!plan || !note?.weekStart || !note?.text) return;
  if (!note.meta?.type) return;

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
// TEXT BUILDER / PARSER
// ----------------------------------------------------------------------
// Beispiel:
// "Teamsitzung am Montag, 29.01.2026 (12:30–14:00)"
function buildTmLine(isoDate, startTime, endTime) {
  const label = formatDateWeekday(isoDate);
  return `${TM_MARKER} am ${label} (${startTime}–${endTime})`;
}

function parseTmLine(text) {
  if (typeof text !== 'string') return null;
  if (!text.startsWith(TM_MARKER)) return null;

  const re = /^Teamsitzung am (.+)\s+\((\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})\)$/;
  const m = text.trim().match(re);
  if (!m) return null;

  const parts = m[1].split(',');
  const dateStr = parts[parts.length - 1].trim();

  const d = parseDate(dateStr);
  if (!d) return null;

  return {
    isoDate: toIso(d),
    startTime: m[2],
    endTime: m[3],
  };
}

// ----------------------------------------------------------------------
// NOTES → TEAMMEETINGS (NUR SYSTEM-NOTES)
// ----------------------------------------------------------------------
function collectTmFromPlan(plan) {
  const out = [];
  if (!plan || !Array.isArray(plan.notes)) return out;

  for (const n of plan.notes) {
    if (n.source !== 'system') continue;
    if (n.meta?.type !== 'teammeeting') continue;
    if (typeof n.text !== 'string') continue;

    const parsed = parseTmLine(n.text.trim());
    if (!parsed) continue;

    const d = parseDate(parsed.isoDate);
    if (!d) continue;

    out.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      isoDate: parsed.isoDate,
      weekStart: n.weekStart,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
    });
  }

  return out;
}

// ----------------------------------------------------------------------
// TEAMMEETING SETZEN
// ----------------------------------------------------------------------
async function upsertTm(isoDate, startTime, endTime) {
  const d = parseDate(isoDate);
  if (!d) throw new Error('Ungültiges Datum');

  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const plan = await loadMonthPlan(year, month);
  if (!plan) throw new Error(`Plan fehlt für ${year}-${month}`);

  const { start } = getWeekRangeFromDate(d);
  const weekIso = toIso(start);

  upsertSystemNote(plan, {
    weekStart: weekIso,
    text: buildTmLine(isoDate, startTime, endTime),

    source: 'system',
    visibility: 'public',

    meta: {
      type: 'teammeeting',
      locked: true,
      generatedAt: new Date().toISOString(),
    },
  });

  await persistMonthPlan(plan);
  D.info('teammeeting', 'Teamsitzung gesetzt', {
    isoDate,
    startTime,
    endTime,
  });
}

// ----------------------------------------------------------------------
// TEAMMEETING LÖSCHEN
// ----------------------------------------------------------------------
async function deleteTm(meeting) {
  const d = parseDate(meeting.isoDate);
  if (!d) return;

  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const plan = await loadMonthPlan(year, month);
  if (!plan || !Array.isArray(plan.notes)) return;

  const { start } = getWeekRangeFromDate(d);
  const weekIso = toIso(start);

  const before = plan.notes.length;

  plan.notes = plan.notes.filter(
    (n) =>
      !(
        n.weekStart === weekIso &&
        n.source === 'system' &&
        n.meta?.type === 'teammeeting'
      )
  );

  if (plan.notes.length === before) return;

  await persistMonthPlan(plan);
  D.info('teammeeting', 'Teamsitzung gelöscht', meeting);
}

// ----------------------------------------------------------------------
// JAHR LADEN
// ----------------------------------------------------------------------
async function loadTmForYear(year) {
  const all = [];

  for (let m = 1; m <= 12; m++) {
    try {
      const plan = await loadMonthPlan(year, m);
      if (plan) all.push(...collectTmFromPlan(plan));
    } catch {}
  }

  return all.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

// ----------------------------------------------------------------------
// UI HELPERS
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
        <td colspan="3">Keine Teamsitzungen in ${year}</td>
      </tr>`;
  }

  return list
    .map(
      (e) => `
    <tr class="tm-row"
        data-iso="${e.isoDate}"
        data-start="${e.startTime}"
        data-end="${e.endTime}">
      <td>${formatDateWeekday(e.isoDate)}</td>
      <td>${e.startTime}–${e.endTime}</td>
      <td style="text-align:right;">
        <button class="sm-btn-icon tm-delete-btn" title="Teamsitzung löschen">
          ✕
        </button>
      </td>
    </tr>
  `
    )
    .join('');
}

// ----------------------------------------------------------------------
// SETTINGS PLUGIN
// ----------------------------------------------------------------------
export const SettingsPlugin = {
  id: 'teammeeting',
  title: 'Teamsitzung',
  order: 3,

  render() {
    const y = getCurrentYear();

    return `
      <div class="sm-team-root">

        <h3>Teamsitzungen</h3>

        <div class="sm-editor-row">
          <label>Jahr</label>
          <select id="tm-year" class="sm-input" style="max-width:120px;">
            ${renderYearOptions(y)}
          </select>
        </div>

        <div class="sm-abs-list-wrapper" style="margin-top:10px;">
          <table class="sm-abs-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Uhrzeit</th>
                <th style="text-align:right;">Aktion</th>
              </tr>
            </thead>
            <tbody id="tm-list"></tbody>
          </table>
        </div>

        <h4 style="margin-top:16px;">Neue Teamsitzung</h4>

        <div class="sm-editor-row">
          <label>Datum</label>
          <input id="tm-date" type="date" class="sm-input" style="max-width:180px;">
        </div>

        <div class="sm-editor-row">
          <label>Uhrzeit</label>
          <div style="display:flex; gap:8px;">
            <input id="tm-start" type="time" class="sm-input">
            <span>bis</span>
            <input id="tm-end" type="time" class="sm-input">
          </div>
        </div>

        <div class="sm-editor-buttons">
          <button id="tm-add" class="sm-btn sm-btn-primary">
            Teamsitzung hinzufügen
          </button>
        </div>

      </div>
    `;
  },

  async bind() {
    const panel = document.querySelector('.sm-panel');
    if (!panel) return;

    const yearSel = panel.querySelector('#tm-year');
    const listBody = panel.querySelector('#tm-list');
    const dateIn = panel.querySelector('#tm-date');
    const startIn = panel.querySelector('#tm-start');
    const endIn = panel.querySelector('#tm-end');
    const addBtn = panel.querySelector('#tm-add');

    let currentYear = Number(yearSel.value);
    let list = [];

    async function refresh(y) {
      currentYear = y;
      list = await loadTmForYear(y);
      listBody.innerHTML = renderTable(list, y);
    }

    await refresh(currentYear);

    yearSel.addEventListener('change', () => refresh(Number(yearSel.value)));

    listBody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.tm-delete-btn');
      if (!btn) return;

      const row = btn.closest('.tm-row');
      const iso = row.dataset.iso;
      const st = row.dataset.start;
      const en = row.dataset.end;

      const ok = await popup.confirm(
        `Teamsitzung am ${formatDateWeekday(iso)} (${st}–${en}) löschen?`,
        { type: 'warning', okText: 'Löschen' }
      );
      if (!ok) return;

      const loader = popup.loading('Lösche Teamsitzung…');
      try {
        await deleteTm({ isoDate: iso, startTime: st, endTime: en });
        await refresh(currentYear);
        popup.toast('Teamsitzung gelöscht', { type: 'success' });
      } catch {
        popup.alert('Löschen fehlgeschlagen', { type: 'error' });
      } finally {
        loader.close();
      }
    });

    addBtn.addEventListener('click', async () => {
      const iso = dateIn.value.trim();
      const st = startIn.value.trim();
      const en = endIn.value.trim();

      if (!iso || !st || !en) {
        await popup.alert('Datum und Uhrzeiten sind erforderlich.', {
          type: 'error',
        });
        return;
      }

      if (st >= en) {
        await popup.alert('Endzeit muss nach der Startzeit liegen.', {
          type: 'error',
        });
        return;
      }

      const exists = list.some(
        (e) => e.isoDate === iso && e.startTime === st && e.endTime === en
      );

      if (exists) {
        await popup.alert(
          'Für diesen Termin existiert bereits eine Teamsitzung.',
          { type: 'warning' }
        );
        return;
      }

      const loader = popup.loading('Speichere Teamsitzung…');
      try {
        await upsertTm(iso, st, en);
        if (parseDate(iso).getFullYear() === currentYear) {
          await refresh(currentYear);
        }
        popup.toast('Teamsitzung gespeichert', { type: 'success' });
        dateIn.value = '';
        startIn.value = '';
        endIn.value = '';
      } catch {
        popup.alert('Speichern fehlgeschlagen', { type: 'error' });
      } finally {
        loader.close();
      }
    });

    D.info('teammeeting', 'Settings Plugin Teammeeting geladen');
  },
};
