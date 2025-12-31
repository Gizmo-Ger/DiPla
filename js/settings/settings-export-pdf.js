// ======================================================================
// settings-export-pdf.js – v1.1 "Plan-Layout"
// PDF-Export: Monatsplan als Wochenübersicht
// Layout pro Seite (Querformat):
//  - Titel mit Monat/Jahr + KW + Datumsrange
//  - 3 Zeilen x 2 Spalten = bis zu 6 Tages-Pläne (Mo–Sa)
//  - JEDER Tages-Plan sieht aus wie der UI-Plan:
//      Spalte Zeit, dann Spalten = Mitarbeiter-Kürzel
//      Zellen farbig nach Rolle, KEIN Text in den Zellen
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';
import { loadMonthPlan } from '/js/core/persist.js';
import {
  getCurrentYear,
  getCurrentMonth,
  getMonthName,
  getDaysInMonth,
  getWeekNumber,
  getWeekRangeFromDate,
  buildHourSlots,
  toIso,
  formatDate,
} from '/js/misc/datetime.js';

// ----------------------------------------------------------------------
// Lazy Loader für jsPDF (UMD-Build unter /vendor/jspdf.umd.min.js)
// ----------------------------------------------------------------------
let jsPdfPromise = null;

async function loadJsPdf() {
  if (jsPdfPromise) return jsPdfPromise;

  jsPdfPromise = (async () => {
    try {
      const esm = await import('/vendor/jspdf.umd.min.js').catch(() => null);

      let jsPDF = null;

      if (esm) {
        if (esm.jsPDF) jsPDF = esm.jsPDF;
        else if (esm.default && esm.default.jsPDF) jsPDF = esm.default.jsPDF;
      }

      if (!jsPDF && window.jspdf && window.jspdf.jsPDF) {
        jsPDF = window.jspdf.jsPDF;
      }

      if (!jsPDF) {
        throw new Error(
          'jsPDF nicht gefunden – ist die UMD-Datei korrekt eingebunden?'
        );
      }

      D.info('export-pdf', 'jsPDF erfolgreich geladen');
      return jsPDF;
    } catch (err) {
      D.error('export-pdf', 'Fehler beim Laden von jsPDF', err);
      throw err;
    }
  })();

  return jsPdfPromise;
}

// ----------------------------------------------------------------------
// Hilfsfunktionen
// ----------------------------------------------------------------------

function getStaffList() {
  const staff = state.settings?.staff || [];
  // veraltete Mitarbeiter nicht drucken
  return staff.filter((e) => !e.deprecated);
}

function getRoleConfigMap() {
  return state.settings?.roles || {};
}

/**
 * daysByWeek: weekNumber → Array<Date> (alle Tage des Monats in dieser KW)
 */
function groupDaysByWeek(year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  const map = new Map();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const kw = getWeekNumber(date);

    if (!map.has(kw)) {
      map.set(kw, []);
    }
    map.get(kw).push(date);
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => a - b);
  }

  return map;
}

/**
 * Liefert Rolle für eine Zelle (wie im Plan):
 * Priorität: _absence -> _holiday -> Slot-Rolle
 */
function getRoleForCell(dayMeta, empId, hourSlot) {
  if (!dayMeta || !dayMeta[empId]) return null;

  const empDay = dayMeta[empId];

  if (empDay._absence && empDay._absence.type) {
    return empDay._absence.type;
  }

  if (empDay._holiday && empDay._holiday.role) {
    return empDay._holiday.role;
  }

  const saved = empDay[hourSlot];
  return saved || null;
}

/**
 * Hex nach RGB
 */
function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const num = parseInt(m[1], 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Mapt JavaScript Date (Mo–So) auf Index 0–5 (Mo–Sa), sonst -1.
 */
function getDayIdxMondayToSaturday(date) {
  const dow = date.getDay(); // 0=So,1=Mo,...,6=Sa
  if (dow === 0) return -1; // Sonntag ignorieren
  if (dow >= 1 && dow <= 6) return dow - 1; // Mo=0 .. Sa=5
  return -1;
}

// ----------------------------------------------------------------------
// Rendering einer Tages-Tabelle (wie Plan)
// ----------------------------------------------------------------------

/**
 * Zeichnet EINEN Tages-Plan innerhalb eines Rechtecks:
 *  - areaX, areaY, areaW, areaH definieren den Bereich
 *  - Spalte links: Zeit
 *  - Spalten: Mitarbeiter-Kürzel (Header)
 *  - Zellen: nur Farbe nach Rolle, kein Text
 */
function renderDayLikePlan(
  doc,
  plan,
  date,
  staffList,
  rolesMap,
  areaX,
  areaY,
  areaW,
  areaH
) {
  const iso = toIso(date);
  const dayMeta = plan.days?.[iso];

  // Wenn für diesen Tag nichts im Plan ist, trotzdem Rahmen + Header & Zeiten anzeigen
  const hours = buildHourSlots(state.settings);
  if (!hours || !hours.length) return;

  const timeColWidth = 12; // etwas breiter für „07-08“ etc.
  const staffCount = staffList.length;
  if (staffCount === 0) return;

  const tableTop = areaY + 6; // oben etwas Platz für Datum
  const tableHeight = areaH - 8; // unten minimaler Rand
  const rowCount = hours.length + 1; // Header + Stunden
  const rowHeight = tableHeight / rowCount;

  const tableLeft = areaX;
  const tableWidth = areaW;

  const staffTotalWidth = tableWidth - timeColWidth;
  const staffColWidth = staffTotalWidth / staffCount;

  // --- Tag-Header (Titel: z.B. „Mo 01.12.2025“) ---
  const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const idx = getDayIdxMondayToSaturday(date);
  if (idx >= 0) {
    const label = weekdayLabels[idx];
    const dateStr = formatDate(date);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label} ${dateStr}`, areaX + 2, areaY + 4);
  }

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setDrawColor(0);
  doc.setLineWidth(0.1);

  // --- Header-Zeile ---
  const headerY = tableTop;
  // Zeit-Header
  doc.rect(tableLeft, headerY, timeColWidth, rowHeight);
  doc.text('Zeit', tableLeft + timeColWidth / 2, headerY + rowHeight / 2 + 1, {
    align: 'center',
  });

  // Mitarbeiter-Kürzel im Header
  staffList.forEach((emp, sIdx) => {
    const colX = tableLeft + timeColWidth + sIdx * staffColWidth;
    doc.rect(colX, headerY, staffColWidth, rowHeight);
    doc.text(emp.id, colX + staffColWidth / 2, headerY + rowHeight / 2 + 1, {
      align: 'center',
    });
  });

  doc.setFont('helvetica', 'normal');

  // --- Body-Zeilen ---
  for (let r = 0; r < hours.length; r++) {
    const hourLabel = hours[r];
    const y = headerY + (r + 1) * rowHeight;

    // Zeitspalte
    doc.rect(tableLeft, y, timeColWidth, rowHeight);
    doc.text(hourLabel, tableLeft + timeColWidth / 2, y + rowHeight / 2 + 1, {
      align: 'center',
    });

    // Mitarbeiter-Zellen
    staffList.forEach((emp, sIdx) => {
      const colX = tableLeft + timeColWidth + sIdx * staffColWidth;
      const cellW = staffColWidth;
      const cellH = rowHeight;

      let role = null;
      if (dayMeta) {
        role = getRoleForCell(dayMeta, emp.id, hourLabel);
      }

      // Standard: leere Zelle mit Rahmen
      if (!role) {
        doc.rect(colX, y, cellW, cellH);
        return;
      }

      // Rolle gefunden -> Farbe über Rollen-Config
      const cfg = rolesMap[role] || rolesMap[role?.toString()] || null;
      const rgb = cfg && cfg.color ? hexToRgb(cfg.color) : null;

      if (rgb) {
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.rect(colX, y, cellW, cellH, 'F'); // gefülltes Rechteck
        doc.setDrawColor(0);
        doc.rect(colX, y, cellW, cellH, 'S'); // Rahmen
      } else {
        // Kein Farbeintrag -> nur Rahmen
        doc.rect(colX, y, cellW, cellH);
      }
    });
  }

  // Textfarbe zurücksetzen
  doc.setTextColor(0, 0, 0);
}

// ----------------------------------------------------------------------
// Rendering einer KW-Seite (Raster 3x2 Tage, wie Plan)
// ----------------------------------------------------------------------

function renderWeekPageLikePlan(
  doc,
  plan,
  year,
  month,
  kw,
  weekDays,
  staffList,
  rolesMap
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 10;

  // Titel
  const { start, end } = getWeekRangeFromDate(
    weekDays[0] || new Date(year, month - 1, 1)
  );
  const rangeText = `${formatDate(start)} – ${formatDate(end)}`;
  const monthName = getMonthName(month);

  const title = `Dienstplan ${monthName} ${year} – KW ${kw} (${rangeText})`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, pageWidth / 2, margin, { align: 'center' });

  // Inhalt-Bereich unter dem Titel
  const contentTop = margin + 4;
  const contentBottom = pageHeight - margin;
  const contentHeight = contentBottom - contentTop;
  const contentLeft = margin;
  const contentRight = pageWidth - margin;
  const contentWidth = contentRight - contentLeft;

  // 3 Zeilen x 2 Spalten für Mo–Sa
  const rows = 3;
  const cols = 2;
  const cellAreaHeight = contentHeight / rows;
  const cellAreaWidth = contentWidth / cols;

  // Tage der KW auf Slots 0..5 (Mo..Sa) mappen
  const daySlots = new Array(6).fill(null);
  for (const d of weekDays) {
    const idx = getDayIdxMondayToSaturday(d);
    if (idx >= 0 && idx < 6) {
      daySlots[idx] = d;
    }
  }

  // Mon–Sa → Position im 3x2 Raster:
  //  0 (Mo): row 0, col 0
  //  1 (Di): row 0, col 1
  //  2 (Mi): row 1, col 0
  //  3 (Do): row 1, col 1
  //  4 (Fr): row 2, col 0
  //  5 (Sa): row 2, col 1
  for (let dayIdx = 0; dayIdx < 6; dayIdx++) {
    const date = daySlots[dayIdx];
    if (!date) continue; // Tag fällt evtl. nicht in diesen Monat / KW-Edge

    const row = Math.floor(dayIdx / 2);
    const col = dayIdx % 2;

    const areaX = contentLeft + col * cellAreaWidth + 1; // minimaler Innenabstand
    const areaY = contentTop + row * cellAreaHeight + 2;
    const areaW = cellAreaWidth - 2;
    const areaH = cellAreaHeight - 4;

    renderDayLikePlan(
      doc,
      plan,
      date,
      staffList,
      rolesMap,
      areaX,
      areaY,
      areaW,
      areaH
    );
  }
}

// ----------------------------------------------------------------------
// Plugin-Definition
// ----------------------------------------------------------------------
export const SettingsPlugin = {
  id: 'export-pdf',
  title: 'Export PDF',
  order: 80,

  render(settings) {
    const year = getCurrentYear();
    const month = getCurrentMonth();

    const yearsOptions = Array.from({ length: 11 }, (_, i) => {
      const y = 2020 + i;
      const sel = y === year ? 'selected' : '';
      return `<option value="${y}" ${sel}>${y}</option>`;
    }).join('');

    const monthsOptions = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const sel = m === month ? 'selected' : '';
      return `<option value="${m}" ${sel}>${getMonthName(m)}</option>`;
    }).join('');

    return `
      <div class="sm-export-root">
        <h3>PDF-Export (Monatsplan)</h3>

        <div class="sm-editor-row">
          <label>Zeitraum</label>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <select id="sm-export-year" class="sm-input" style="max-width:120px;">
              ${yearsOptions}
            </select>
            <select id="sm-export-month" class="sm-input" style="max-width:180px;">
              ${monthsOptions}
            </select>
          </div>
        </div>

        <div class="sm-editor-row">
          <label>Layout</label>
          <div class="sm-export-hint">
            Der PDF-Export nutzt das gleiche Layout wie der Plan:
            links die Zeitspalte, daneben Spalten mit den Mitarbeiter-Kürzeln.
            Die Zellen werden farbig nach Rolle gefüllt (z.B. Arzt, Assistenz, JVA,
            Urlaub, Krank, Fortbildung). Pro Kalenderwoche wird eine Seite erzeugt,
            auf der die Tage Montag bis Samstag als kleine Pläne (3 Zeilen × 2 Spalten)
            angeordnet sind.
          </div>
        </div>

        <div class="sm-editor-buttons">
          <button id="sm-export-pdf-btn" class="sm-btn sm-btn-primary">
            PDF erzeugen
          </button>
        </div>
      </div>
    `;
  },

  bind() {
    const panel = document.querySelector('.sm-panel');
    if (!panel) {
      D.error('export-pdf', 'sm-panel nicht gefunden');
      return;
    }

    const btn = panel.querySelector('#sm-export-pdf-btn');
    const yearEl = panel.querySelector('#sm-export-year');
    const monthEl = panel.querySelector('#sm-export-month');

    if (!btn || !yearEl || !monthEl) {
      D.error('export-pdf', 'Controls nicht gefunden');
      return;
    }

    btn.addEventListener('click', async () => {
      try {
        const year = parseInt(yearEl.value, 10) || getCurrentYear();
        const month = parseInt(monthEl.value, 10) || getCurrentMonth();

        const jsPDF = await loadJsPdf();

        const plan = await loadMonthPlan(year, month);
        if (!plan || !plan.days) {
          alert('Kein Plan für diesen Monat vorhanden.');
          return;
        }

        const staffList = getStaffList();
        if (!staffList.length) {
          alert('Keine aktiven Mitarbeiter in den Einstellungen definiert.');
          return;
        }

        const rolesMap = getRoleConfigMap();
        const weekMap = groupDaysByWeek(year, month);
        const weeks = Array.from(weekMap.keys()).sort((a, b) => a - b);

        if (!weeks.length) {
          alert('Keine Tage in diesem Monat gefunden.');
          return;
        }

        const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4',
        });

        weeks.forEach((kw, idx) => {
          if (idx > 0) doc.addPage();
          const weekDays = weekMap.get(kw) || [];
          renderWeekPageLikePlan(
            doc,
            plan,
            year,
            month,
            kw,
            weekDays,
            staffList,
            rolesMap
          );
        });

        const fileName = `Dienstplan_${year}_${String(month).padStart(2, '0')}.pdf`;
        doc.save(fileName);

        D.info('export-pdf', 'PDF erfolgreich erzeugt', {
          year,
          month,
          weeks: weeks.length,
        });
      } catch (err) {
        D.error('export-pdf', 'Fehler beim PDF-Export', err);
        alert('Fehler beim PDF-Export. Details in der Konsole.');
      }
    });
  },
};
