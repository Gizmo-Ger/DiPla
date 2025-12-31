// ======================================================================
// settings-bridgedays.js – v3.3 FINAL
// Brückentage = alle holidays außer gesetzliche Feiertage
// Quelle: month.json (source of truth)
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';
import { loadMonthPlan, persistMonthPlan } from '/js/core/persist.js';
import { popup } from '/js/core/popup.js';

// ----------------------------------------------------------
// OFFICIAL HOLIDAYS
// ----------------------------------------------------------
const OFFICIAL_NAMES = new Set([
  'Neujahrstag',
  'Tag der Arbeit',
  'Tag der Deutschen Einheit',
  'Reformationstag',
  'Heiligabend',
  '1. Weihnachtstag',
  '2. Weihnachtstag',
  'Silvester',
  'Karfreitag',
  'Ostermontag',
  'Christi Himmelfahrt',
  'Pfingstmontag',
]);

const isOfficialHoliday = (name) => OFFICIAL_NAMES.has(name);

// ----------------------------------------------------------
// YEARS
// ----------------------------------------------------------
function buildYearOptions() {
  const now = new Date().getFullYear();
  return [now - 1, now, now + 1, now + 2, now + 3];
}

// ----------------------------------------------------------
// PLUGIN
// ----------------------------------------------------------
export const SettingsPlugin = {
  id: 'bridgedays',
  title: 'Brückentage',
  order: 6,

  // MUST NOT BE async
  render() {
    const years = buildYearOptions();
    const curYear =
      state.currentYear && years.includes(state.currentYear)
        ? state.currentYear
        : new Date().getFullYear();

    const yearOptions = years
      .map(
        (y) =>
          `<option value="${y}" ${y === curYear ? 'selected' : ''}>${y}</option>`
      )
      .join('');

    return `
      <div class="sm-system-root">

        <h3>Brückentage</h3>

        <div class="sm-editor-row">
          <label>Jahr</label>
          <select id="bd-year" class="sm-input" style="max-width:120px;">
            ${yearOptions}
          </select>
        </div>

        <div class="sm-abs-list-wrapper" style="margin-top:14px;">
          <table class="sm-abs-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Name</th>
                <th style="width:50px;"></th>
              </tr>
            </thead>
            <tbody id="bd-list-body">
              <tr>
                <td colspan="3" class="sm-abs-empty">Lade…</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="sm-editor-row" style="margin-top:14px;">
          <label>Hinzufügen</label>
          <div style="display:flex; gap:10px; align-items:center;">
            <input id="bd-date" type="date" class="sm-input" style="max-width:150px;">
            <input id="bd-name" class="sm-input" placeholder="Bezeichnung" style="max-width:240px;">
            <button id="bd-add" class="sm-btn sm-btn-primary">+</button>
          </div>
        </div>

      </div>
    `;
  },

  async bind() {
    const panel = document.querySelector('.sm-panel');
    if (!panel) {
      D.error('bridgedays', 'Panel fehlt');
      return;
    }

    const yearEl = panel.querySelector('#bd-year');
    const listEl = panel.querySelector('#bd-list-body');
    const dateEl = panel.querySelector('#bd-date');
    const nameEl = panel.querySelector('#bd-name');
    const addBtn = panel.querySelector('#bd-add');

    if (!yearEl || !listEl || !dateEl || !nameEl || !addBtn) {
      D.error('bridgedays', 'DOM-Elemente fehlen');
      return;
    }

    // ------------------------------------------------------
    // LOAD YEAR OVERVIEW
    // ------------------------------------------------------
    const loadYear = async (year) => {
      const rows = [];

      for (let m = 1; m <= 12; m++) {
        const plan = await loadMonthPlan(year, m);
        if (!plan?.holidays) continue;

        for (const h of plan.holidays) {
          const [iso, name] = h.split(' – ');
          if (!iso || !name) continue;
          if (isOfficialHoliday(name)) continue;

          rows.push({ iso, name, month: m });
        }
      }

      rows.sort((a, b) => a.iso.localeCompare(b.iso));

      if (!rows.length) {
        listEl.innerHTML = `<tr><td colspan="3" class="sm-abs-empty">Keine Brückentage im Jahr ${year}</td></tr>`;
        return;
      }

      listEl.innerHTML = rows
        .map(
          (r) => `
        <tr data-iso="${r.iso}" data-month="${r.month}">
          <td>${r.iso}</td>
          <td>${r.name}</td>
          <td style="text-align:right;">
            <button
              class="sm-btn-icon bd-del"
              title="Brückentag löschen">
              ✕
            </button>
          </td>
        </tr>
      `
        )
        .join('');

      // DELETE
      listEl.querySelectorAll('.bd-del').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr');
          const iso = tr.dataset.iso;
          const month = Number(tr.dataset.month);
          const name = tr.children[1].textContent;

          const ok = await popup.confirm(
            `Brückentag ${iso} – ${name} löschen?`,
            { type: 'warning', okText: 'Löschen' }
          );
          if (!ok) return;

          const loader = popup.loading('Lösche Brückentag…');
          try {
            const plan = await loadMonthPlan(Number(iso.slice(0, 4)), month);

            const label = `${iso} – ${name}`;
            plan.holidays = plan.holidays.filter((e) => e !== label);

            if (plan.days?.[iso]) {
              delete plan.days[iso]._holiday;
              if (Object.keys(plan.days[iso]).length === 0) {
                delete plan.days[iso];
              }
            }

            await persistMonthPlan(plan);
            await loadYear(Number(yearEl.value));
            popup.toast('Brückentag gelöscht', { type: 'success' });
          } catch {
            popup.alert('Löschen fehlgeschlagen', { type: 'error' });
          } finally {
            loader.close();
          }
        });
      });
    };

    // Init
    await loadYear(Number(yearEl.value));

    yearEl.addEventListener('change', () => {
      loadYear(Number(yearEl.value));
    });

    // ------------------------------------------------------
    // ADD ENTRY
    // ------------------------------------------------------
    addBtn.addEventListener('click', async () => {
      const date = dateEl.value.trim();
      let name = nameEl.value.trim();

      if (!date) {
        await popup.alert('Bitte Datum eingeben.', { type: 'error' });
        return;
      }
      if (!name) name = 'Brückentag';

      const year = Number(date.slice(0, 4));
      const month = Number(date.slice(5, 7));

      const loader = popup.loading('Speichere Brückentag…');
      try {
        const plan = await loadMonthPlan(year, month);
        plan.holidays = Array.isArray(plan.holidays) ? plan.holidays : [];

        const label = `${date} – ${name}`;
        if (plan.holidays.includes(label)) {
          loader.close();
          await popup.alert('Eintrag existiert bereits.', { type: 'warning' });
          return;
        }

        plan.holidays.push(label);

        if (!plan.days[date]) plan.days[date] = {};
        plan.days[date]._holiday = { name };

        await persistMonthPlan(plan);

        dateEl.value = '';
        nameEl.value = '';

        await loadYear(Number(yearEl.value));
        popup.toast('Brückentag gespeichert', { type: 'success' });
      } catch {
        popup.alert('Speichern fehlgeschlagen', { type: 'error' });
      } finally {
        loader.close();
      }
    });

    D.info('bridgedays', 'SettingsPlugin bridgedays v3.3 geladen');
  },
};
