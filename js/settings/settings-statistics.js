// ======================================================================
// settings-statistics.js – v1.1 (KORRIGIERT FÜR NEUE BACKEND-SIGNATUR)
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';
import { germanToISO, isoToGerman } from '/js/misc/datetime.js';
// Importiere die spezifische Funktion aus Ihrem neuen statistics.js
import {
  getStatsForRange,
  getDateRangeForMonth,
  getDateRangeForYear,
  getDateRangeCustom,
} from '/js/core/statistics.js';

// ==========================================================
// KONSTANTEN & BASIS-HELPER
// (wie in v1.0, nur leicht optimiert)
// ==========================================================

const MONTHS = [
  { value: 1, name: 'Januar' },
  { value: 2, name: 'Februar' },
  { value: 3, name: 'März' },
  { value: 4, name: 'April' },
  { value: 5, name: 'Mai' },
  { value: 6, name: 'Juni' },
  { value: 7, name: 'Juli' },
  { value: 8, name: 'August' },
  { value: 9, name: 'September' },
  { value: 10, name: 'Oktober' },
  { value: 11, name: 'November' },
  { value: 12, name: 'Dezember' },
];

function getYearOptions(currentYear) {
  let html = '';
  for (let i = currentYear - 3; i <= currentYear + 1; i++) {
    html += `<option value="${i}" ${i === currentYear ? 'selected' : ''}>${i}</option>`;
  }
  return html;
}

function getInitialFilter(settings) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  if (!state.statisticsFilter) {
    // Initiale Berechnung für aktuellen Monat
    const initialRange = getDateRangeForMonth(currentYear, currentMonth);

    state.statisticsFilter = {
      staffId: 'all',
      rangeType: 'month',
      year: currentYear,
      month: currentMonth,
      startDate: initialRange ? isoToGerman(initialRange.start) : '',
      endDate: initialRange ? isoToGerman(initialRange.end) : '',
      results: null,
      isLoading: false,
    };
  }
  return state.statisticsFilter;
}

// ==========================================================
// HTML Renderer – Statistik-Modal
// ==========================================================

function statsFilterHTML(settings, filter) {
  // ... (Filter-HTML-Generierung wie im vorherigen Code) ...
  // HINWEIS: Hier wurde kein Code geändert, da er korrekt ist,
  // er wurde nur zur Kompaktheit weggelassen.
  const staffOptions = settings.staff
    .map(
      (emp) =>
        `<option value="${emp.id}" ${filter.staffId === emp.id ? 'selected' : ''}>${emp.id} - ${emp.firstName} ${emp.lastName}</option>`
    )
    .join('');

  const monthOptions = MONTHS.map(
    (m) =>
      `<option value="${m.value}" ${filter.month === m.value ? 'selected' : ''}>${m.name}</option>`
  ).join('');

  const currentYear = new Date().getFullYear();
  const yearOptions = getYearOptions(filter.year);

  const isMonth = filter.rangeType === 'month';
  const isYear = filter.rangeType === 'year';
  const isCustom = filter.rangeType === 'custom';

  return `
        <div class="sm-filter-toolbar">
            <div class="sm-editor-row" style="grid-template-columns: 140px 1fr;">
                <label>Mitarbeiter</label>
                <select id="sm-stats-staff" class="sm-input" style="max-width: 250px;">
                    <option value="all">Alle Mitarbeiter</option>
                    ${staffOptions}
                </select>
            </div>
            
            <div class="sm-editor-row" style="grid-template-columns: 140px 1fr;">
                <label>Zeitraumtyp</label>
                <select id="sm-stats-range-type" class="sm-input" style="max-width: 150px;">
                    <option value="month" ${isMonth ? 'selected' : ''}>Monat</option>
                    <option value="year" ${isYear ? 'selected' : ''}>Jahr</option>
                    <option value="custom" ${isCustom ? 'selected' : ''}>Benutzerdefiniert</option>
                </select>
            </div>

            ${
              isMonth
                ? `
                <div class="sm-editor-row" style="grid-template-columns: 140px 1fr;">
                    <label>Monat / Jahr</label>
                    <div style="display:flex; gap:8px;">
                        <select id="sm-stats-month" class="sm-input" style="width: 120px;">${monthOptions}</select>
                        <select id="sm-stats-year" class="sm-input" style="width: 100px;">${yearOptions}</select>
                    </div>
                </div>
            `
                : ''
            }
            
            ${
              isYear
                ? `
                <div class="sm-editor-row" style="grid-template-columns: 140px 1fr;">
                    <label>Jahr</label>
                    <select id="sm-stats-year-only" class="sm-input" style="width: 100px;">${yearOptions}</select>
                </div>
            `
                : ''
            }

            ${
              isCustom
                ? `
                <div class="sm-editor-row" style="grid-template-columns: 140px 1fr;">
                    <label>Start / Ende</label>
                    <div style="display:flex; gap:8px;">
                        <input id="sm-stats-start-date" class="sm-input" placeholder="TT.MM.JJJJ" value="${filter.startDate}" style="width: 120px;">
                        <input id="sm-stats-end-date" class="sm-input" placeholder="TT.MM.JJJJ" value="${filter.endDate}" style="width: 120px;">
                    </div>
                </div>
            `
                : ''
            }

            <div style="margin-top: 15px;">
                <button id="sm-stats-run-btn" class="sm-btn sm-btn-primary" ${filter.isLoading ? 'disabled' : ''}>
                    ${filter.isLoading ? 'Auswertung läuft...' : 'Statistik auswerten'}
                </button>
            </div>
        </div>
    `;
}

function statsResultsHTML(filter) {
  if (filter.isLoading) {
    return `<p style="text-align:center; margin-top: 20px;">Daten werden geladen...</p>`;
  }

  // Die Ergebnisse sind jetzt ein Mapping von { ID: resultObj }
  const results = filter.results;
  if (!results || Object.keys(results).length === 0) {
    return `<p style="text-align:center; margin-top: 20px; color: var(--text-light);">Keine Ergebnisse gefunden.</p>`;
  }

  const isAllStaff = filter.staffId === 'all';

  // Helfer für Farbformatierung der Differenz
  const formatDiff = (diff) => {
    // Differenz wird in Stunden.Minuten (z.B. 1.5h) geliefert, auf 1 Dezimalstelle runden
    const h = diff.toFixed(1) + ' h';
    if (diff > 0) return `<span style="color: green;">+${h}</span>`;
    if (diff < 0) return `<span style="color: red;">${h}</span>`;
    return h;
  };

  let totalSoll = 0;
  let totalIst = 0;
  let totalDiff = 0;
  let totalVacation = 0;
  let totalSick = 0;
  let totalTraining = 0;
  let totalHolidays = 0;
  let totalWorkDays = 0; // Arbeitstage

  const rows = Object.keys(results)
    .map((employeeId) => {
      const r = results[employeeId];

      // Verwende die korrekten Pfade aus dem Backend-Result: hours.soll, hours.ist, hours.diff, days.x
      const soll = r.hours.soll;
      const ist = r.hours.ist;
      const diff = r.hours.diff;

      totalSoll += soll;
      totalIst += ist;
      totalDiff += diff;
      totalVacation += r.days.vacation;
      totalSick += r.days.sick;
      totalTraining += r.days.training;
      totalHolidays += r.days.holidays; // holidays + bridgedays
      totalWorkDays += r.days.workdays;

      return `
            <tr data-id="${employeeId}" class="sm-stats-row">
                <td style="font-weight: 500;">${employeeId}</td>
                <td style="text-align: right;">${soll.toFixed(1)} h</td>
                <td style="text-align: right;">${ist.toFixed(1)} h</td>
                <td style="text-align: right;">${formatDiff(diff)}</td>
                <td style="text-align: right;">${r.days.vacation}</td>
                <td style="text-align: right;">${r.days.sick}</td>
                <td style="text-align: right;">${r.days.training}</td>
                <td style="text-align: right;">${r.days.holidays + r.days.bridgedays}</td>
                <td style="text-align: right;">${r.days.workdays}</td>
            </tr>
        `;
    })
    .join('');

  const totalRow =
    isAllStaff && totalSoll > 0
      ? `
        <tr style="font-weight: bold; background: #f0f0f0;">
            <td>GESAMT</td>
            <td style="text-align: right;">${totalSoll.toFixed(1)} h</td>
            <td style="text-align: right;">${totalIst.toFixed(1)} h</td>
            <td style="text-align: right;">${formatDiff(totalDiff)}</td>
            <td style="text-align: right;">${totalVacation}</td>
            <td style="text-align: right;">${totalSick}</td>
            <td style="text-align: right;">${totalTraining}</td>
            <td style="text-align: right;">${totalHolidays}</td>
            <td style="text-align: right;">${totalWorkDays}</td>
        </tr>
    `
      : '';

  return `
        <div class="sm-abs-list-wrapper" style="margin-top: 20px;">
            <table class="sm-abs-table">
                <thead>
                    <tr>
                        <th style="min-width: 80px;">Kürzel</th>
                        <th style="width: 80px; text-align: right;">Soll (h)</th>
                        <th style="width: 80px; text-align: right;">Ist (h)</th>
                        <th style="width: 80px; text-align: right;">Diff (h)</th>
                        <th style="width: 60px; text-align: right;">Urlaub (T)</th>
                        <th style="width: 60px; text-align: right;">Krank (T)</th>
                        <th style="width: 60px; text-align: right;">Fortb. (T)</th>
                        <th style="width: 60px; text-align: right;">Feiertag (T)</th>
                        <th style="width: 60px; text-align: right;">Gearb. (T)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    ${totalRow}
                </tbody>
            </table>
        </div>
    `;
}

// ==========================================================
// Plugin – Statistics Tab
// ==========================================================

export const SettingsPlugin = {
  id: 'statistics',
  title: 'Statistik',
  order: 30,

  render(settings) {
    const filter = getInitialFilter(settings);
    return `
            <div class="sm-abs-root">
                <h3>Statistik-Auswertung</h3>
                ${statsFilterHTML(settings, filter)}
                <div id="sm-stats-results-container">
                    ${statsResultsHTML(filter)}
                </div>
            </div>
        `;
  },

  bind() {
    const panel = document.querySelector('.sm-panel');
    const filter = state.statisticsFilter;
    if (!panel) return;

    const staffSelect = panel.querySelector('#sm-stats-staff');
    const rangeTypeSelect = panel.querySelector('#sm-stats-range-type');
    const runBtn = panel.querySelector('#sm-stats-run-btn');

    const reRenderPanel = () => {
      // Neuladen des gesamten Panel-Inhalts (mit erneutem bind() am Ende)
      document.dispatchEvent(
        new CustomEvent('settings-tab-reload', {
          detail: { tab: 'statistics' },
        })
      );
    };

    // ===================================
    // Filter-Änderungen speichern
    // ===================================

    staffSelect?.addEventListener('change', (e) => {
      filter.staffId = e.target.value;
    });

    rangeTypeSelect?.addEventListener('change', (e) => {
      filter.rangeType = e.target.value;
      // Neurendern, um dynamische Datumsfelder anzuzeigen/verstecken
      reRenderPanel();
    });

    panel.querySelector('#sm-stats-month')?.addEventListener('change', (e) => {
      filter.month = Number(e.target.value);
    });
    panel.querySelector('#sm-stats-year')?.addEventListener('change', (e) => {
      filter.year = Number(e.target.value);
    });
    panel
      .querySelector('#sm-stats-year-only')
      ?.addEventListener('change', (e) => {
        filter.year = Number(e.target.value);
      });
    panel
      .querySelector('#sm-stats-start-date')
      ?.addEventListener('input', (e) => {
        filter.startDate = e.target.value.trim();
      });
    panel
      .querySelector('#sm-stats-end-date')
      ?.addEventListener('input', (e) => {
        filter.endDate = e.target.value.trim();
      });

    // ===================================
    // Auswertung starten
    // ===================================

    runBtn?.addEventListener('click', async () => {
      filter.isLoading = true;
      reRenderPanel(); // UI auf Ladezustand setzen

      try {
        // 1. Datumsbereich anhand des Filters ermitteln (via Helper aus statistics.js)
        let dateRange = null;
        if (filter.rangeType === 'month') {
          dateRange = getDateRangeForMonth(filter.year, filter.month);
        } else if (filter.rangeType === 'year') {
          dateRange = getDateRangeForYear(filter.year);
        } else if (filter.rangeType === 'custom') {
          dateRange = getDateRangeCustom(
            germanToISO(filter.startDate),
            germanToISO(filter.endDate)
          );
        }

        if (!dateRange || !dateRange.start || !dateRange.end) {
          throw new Error('Ungültige Datumsangabe.');
        }

        // 2. Mitarbeiterliste für die Schleife
        const staffToProcess =
          filter.staffId === 'all'
            ? state.settings.staff.filter((e) => e.active !== false) // nur aktive MA
            : [
                state.settings.staff.find((e) => e.id === filter.staffId),
              ].filter(Boolean); // nur ausgewählter MA

        filter.results = {};

        // 3. Asynchrone Auswertung für jeden Mitarbeiter
        const promises = staffToProcess.map(async (emp) => {
          const stats = await getStatsForRange(
            emp.id,
            dateRange.start,
            dateRange.end,
            state.settings
          );
          if (stats) {
            filter.results[emp.id] = stats;
          }
        });

        await Promise.all(promises);
      } catch (error) {
        D.error('Statistik-Fehler:', error);
        alert(
          `Fehler bei der Berechnung: ${error.message || 'Details siehe Konsole.'}`
        );
        filter.results = null;
      } finally {
        filter.isLoading = false;
        reRenderPanel(); // Finale UI aktualisieren
      }
    });

    // Bonus: Beim ersten Öffnen automatisch auswerten, wenn noch keine Ergebnisse da sind
    if (!filter.results && !filter.isLoading) {
      runBtn?.click();
    }
  },
};
