// ======================================================================
// settings-export.js – v1.0
// Exporte: Settings.json, Month.json, PDF (4 Wochen), ICS pro Mitarbeiter
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';
import { loadMonthPlan } from '/js/core/persist.js';
import { getWeekNumber, formatDate } from '/js/misc/datetime.js';

// ----------------------------------------------------------------------
// Hilfsfunktionen allgemein
// ----------------------------------------------------------------------
function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function isoFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoToYMD(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function formatDateDE(isoOrDate) {
  if (typeof isoOrDate === 'string') {
    const { y, m, d } = isoToYMD(isoOrDate);
    return `${pad2(d)}.${pad2(m)}.${y}`;
  } else if (isoOrDate instanceof Date) {
    return `${pad2(isoOrDate.getDate())}.${pad2(isoOrDate.getMonth() + 1)}.${isoOrDate.getFullYear()}`;
  }
  return String(isoOrDate || '');
}

function getFirstMondayOfMonth(year, month) {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 1) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthNameDE(m) {
  const names = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  return names[m - 1] || String(m);
}

// ----------------------------------------------------------------------
// Slot-Minuten aus Plan ableiten (z.B. 60 oder 30)
// ----------------------------------------------------------------------
function parseHM(h) {
  const [H, M] = h.split(':').map(Number);
  return (H || 0) * 60 + (M || 0);
}

function hmFromMinutes(total) {
  const H = Math.floor(total / 60);
  const M = total % 60;
  return `${pad2(H)}:${pad2(M)}`;
}

function getGlobalSlotMinutes(plan) {
  if (!plan || !plan.days) return 60;
  for (const dayObj of Object.values(plan.days)) {
    if (!dayObj || typeof dayObj !== 'object') continue;
    for (const empDay of Object.values(dayObj)) {
      if (!empDay || typeof empDay !== 'object') continue;
      const times = Object.keys(empDay)
        .filter((k) => !k.startsWith('_'))
        .sort();
      if (times.length >= 2) {
        const diff = parseHM(times[1]) - parseHM(times[0]);
        if (diff > 0 && diff <= 240) {
          return diff;
        }
      }
    }
  }
  return 60; // Fallback
}

// ----------------------------------------------------------------------
// Absence-Helfer (aus month.absences, nicht aus _meta)
// ----------------------------------------------------------------------
function findAbsenceForEmployeeOnDate(plan, empId, iso) {
  if (!plan || !Array.isArray(plan.absences)) return null;
  for (const a of plan.absences) {
    if (!a || a.employeeId !== empId) continue;
    if (!a.start || !a.end) continue;
    if (iso >= a.start && iso <= a.end) {
      return a; // { employeeId, type, start, end, note }
    }
  }
  return null;
}

// ----------------------------------------------------------------------
// Schichten eines Tages für einen Mitarbeiter zu Blöcken komprimieren
// → wird für PDF & ICS genutzt
// ----------------------------------------------------------------------
function collectShiftBlocksForEmployeeDay(plan, iso, empId, slotMinutes) {
  const dayObj = plan.days?.[iso];
  if (!dayObj) return [];

  const empDay = dayObj[empId];
  if (!empDay || typeof empDay !== 'object') return [];

  const times = Object.keys(empDay)
    .filter((k) => !k.startsWith('_'))
    .sort();

  if (!times.length) return [];

  const blocks = [];
  let current = null;

  for (const t of times) {
    const rawVal = empDay[t];
    if (!rawVal) continue;

    const val = String(rawVal).trim();
    const low = val.toLowerCase();

    // "frei" → kein Eintrag
    if (low === 'frei') continue;

    // Schule → ignorieren
    if (low.includes('schule')) continue;

    // Abwesenheitstypen (falls jemand sie versehentlich im Plan setzt) → ignorieren hier;
    // echte Abwesenheiten kommen aus month.absences als ganztägige Events.
    if (low === 'urlaub' || low === 'krank' || low === 'fortbildung') continue;

    // Zusammenhängende Blöcke gleicher Rolle kleben
    if (!current) {
      current = { role: val, startSlot: t, lastSlot: t };
    } else if (current.role === val) {
      current.lastSlot = t;
    } else {
      blocks.push(current);
      current = { role: val, startSlot: t, lastSlot: t };
    }
  }

  if (current) blocks.push(current);

  // Slot-Minuten bestimmen
  const minutesPerSlot = slotMinutes || 60;
  const result = [];

  for (const b of blocks) {
    let startHM = b.startSlot;
    let endHM;

    // Spezieller Fall: JVA immer 08–14, egal, wie die Slots liegen
    if (b.role.toLowerCase().includes('jva')) {
      startHM = '08:00';
      endHM = '14:00';
    } else {
      const startMin = parseHM(b.startSlot);
      const lastMin = parseHM(b.lastSlot);
      const endMin = lastMin + minutesPerSlot;
      endHM = hmFromMinutes(endMin);
    }

    result.push({
      role: b.role,
      startHM,
      endHM,
    });
  }

  return result;
}

// ----------------------------------------------------------------------
// ICS-Generierung
// ----------------------------------------------------------------------
function icsEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildIcsForEmployee(plan, year, month, empId) {
  const staff = (state.settings?.staff || []).find((e) => e.id === empId);
  const calName = staff
    ? `${staff.firstName || ''} ${staff.lastName || ''} (${empId})`.trim()
    : `Mitarbeiter ${empId}`;

  const slotMinutes = getGlobalSlotMinutes(plan);

  const lines = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Dienstplan//DE');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${icsEscape(calName)}`);

  const isoMonth = pad2(month);

  // 1) Abwesenheiten → ganztägige Events (Urlaub, Krank, Fortbildung)
  if (Array.isArray(plan.absences)) {
    plan.absences.forEach((a, idx) => {
      if (!a || a.employeeId !== empId) return;
      const low = String(a.type || '').toLowerCase();
      if (!['urlaub', 'krank', 'fortbildung'].includes(low)) return;
      if (!a.start || !a.end) return;

      const startIso = a.start;
      const endIso = a.end;

      const { y: ys, m: ms, d: ds } = isoToYMD(startIso);
      const { y: ye, m: me, d: de } = isoToYMD(endIso);

      // ICS all-day: DTEND = day after letztes Datum
      const endDateObj = new Date(ye, me - 1, de);
      endDateObj.setDate(endDateObj.getDate() + 1);
      const endIsoPlus = isoFromDate(endDateObj);

      const dtStart = startIso.replace(/-/g, '');
      const dtEnd = endIsoPlus.replace(/-/g, '');

      const summary = a.type || 'Abwesenheit';
      const note = a.note ? ` (${a.note})` : '';

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${empId}-${idx}-ABS@dienstplan`);
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      lines.push(`SUMMARY:${icsEscape(summary + note)}`);
      lines.push('END:VEVENT');
    });
  }

  // 2) Schichten pro Tag → Zeit-Events mit funktionaler Rolle
  if (plan.days && typeof plan.days === 'object') {
    const allIsos = Object.keys(plan.days).sort();
    let eventIndex = 0;

    for (const iso of allIsos) {
      const { y, m } = isoToYMD(iso);
      if (y !== year || pad2(m) !== isoMonth) continue;

      // Wenn an dem Tag eine Abwesenheit für diesen MA existiert → keine Schichten
      const abs = findAbsenceForEmployeeOnDate(plan, empId, iso);
      if (abs && ['Urlaub', 'Krank', 'Fortbildung'].includes(abs.type)) {
        continue;
      }

      const blocks = collectShiftBlocksForEmployeeDay(
        plan,
        iso,
        empId,
        slotMinutes
      );
      if (!blocks.length) continue;

      const dayObj = plan.days[iso];
      if (!dayObj || !dayObj[empId]) continue;

      // Events pro Block
      for (const b of blocks) {
        const startStr = `${iso.replace(/-/g, '')}T${b.startHM.replace(':', '')}00`;
        const endStr = `${iso.replace(/-/g, '')}T${b.endHM.replace(':', '')}00`;

        const role = b.role || 'Dienst';

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${empId}-${iso}-${eventIndex}@dienstplan`);
        lines.push(`DTSTART:${startStr}`);
        lines.push(`DTEND:${endStr}`);
        lines.push(`SUMMARY:${icsEscape(role)}`);
        lines.push('END:VEVENT');

        eventIndex++;
      }
    }
  }

  // 3) Notes (Teamsitzung etc.) als zusätzliche Events
  if (Array.isArray(plan.notes)) {
    let noteIdx = 0;

    for (const note of plan.notes) {
      if (!note || !note.weekStart || !note.text) continue;
      const linesText = String(note.text).split('\n');

      for (const rawLine of linesText) {
        const lineText = rawLine.trim();
        if (!lineText) continue;

        let dateIso = null;
        let startHM = null;
        let endHM = null;
        let summary = lineText;

        // Pattern: "DD.MM.YYYY rest..."
        const m1 = lineText.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(.*)$/);
        if (m1) {
          const [_, dd, mm, yyyy, rest] = m1;
          dateIso = `${yyyy}-${mm}-${dd}`;
          summary = rest.trim();

          // Optional: "(HH:MM–HH:MM)" am Ende
          const m2 = summary.match(
            /^(.*)\((\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\)\s*$/
          );
          if (m2) {
            summary = m2[1].trim();
            startHM = m2[2];
            endHM = m2[3];
          }
        } else {
          // Fallback: weekStart nutzen
          dateIso = note.weekStart;
        }

        // Nur Events im gewünschten Monat/Jahr
        if (!dateIso) continue;
        const { y, m } = isoToYMD(dateIso);
        if (y !== year || pad2(m) !== isoMonth) continue;

        if (startHM && endHM) {
          const dtStart = `${dateIso.replace(/-/g, '')}T${startHM.replace(':', '')}00`;
          const dtEnd = `${dateIso.replace(/-/g, '')}T${endHM.replace(':', '')}00`;

          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${empId}-NOTE-${noteIdx}@dienstplan`);
          lines.push(`DTSTART:${dtStart}`);
          lines.push(`DTEND:${dtEnd}`);
          lines.push(`SUMMARY:${icsEscape(summary)}`);
          lines.push('END:VEVENT');
        } else {
          const dtStart = dateIso.replace(/-/g, '');
          const dObj = new Date(y, m - 1, isoToYMD(dateIso).d);
          dObj.setDate(dObj.getDate() + 1);
          const dtEnd = isoFromDate(dObj).replace(/-/g, '');

          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${empId}-NOTE-${noteIdx}@dienstplan`);
          lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
          lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
          lines.push(`SUMMARY:${icsEscape(summary)}`);
          lines.push('END:VEVENT');
        }

        noteIdx++;
      }
    }
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

// ----------------------------------------------------------------------
// PDF-HTML für 4 Wochen (4 Seiten, A4 Landscape, Druckdialog)
// Layout: pro Seite eine Woche, Zeilen = Mitarbeiter, Spalten = Mo–Sa
// Zelle: zusammengefasste Zeitblöcke mit Rolle(n) oder Abwesenheit
// ----------------------------------------------------------------------
function buildPdfHtml(plan, year, month) {
  const staff = (state.settings?.staff || []).filter(
    (s) => s.active !== false && !s.deprecated
  );
  const slotMinutes = getGlobalSlotMinutes(plan);
  const firstMonday = getFirstMondayOfMonth(year, month);
  const monthLabel = `${monthNameDE(month)} ${year}`;

  const daysNames = [
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
  ];

  function summarizeDay(iso, empId) {
    const abs = findAbsenceForEmployeeOnDate(plan, empId, iso);
    if (abs && abs.type) {
      return abs.type + (abs.note ? ` (${abs.note})` : '');
    }

    const blocks = collectShiftBlocksForEmployeeDay(
      plan,
      iso,
      empId,
      slotMinutes
    );
    if (!blocks.length) return '';

    return blocks.map((b) => `${b.startHM}–${b.endHM} ${b.role}`).join('\n');
  }

  let pages = '';

  for (let w = 0; w < 4; w++) {
    const monday = new Date(firstMonday);
    monday.setDate(monday.getDate() + w * 7);

    const weekDates = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      weekDates.push(d);
    }

    const start = weekDates[0];
    const end = weekDates[5];
    const kw = getWeekNumber(monday);

    const title = `Dienstplan ${monthLabel} – KW ${kw} (${formatDateDE(start)} – ${formatDateDE(end)})`;

    let tableHead = '<tr><th>Mitarbeiter</th>';
    for (let i = 0; i < 6; i++) {
      const d = weekDates[i];
      const iso = isoFromDate(d);
      const { m } = isoToYMD(iso);
      const label = `${daysNames[i]} ${formatDateDE(d)}`;
      // Nur Tage im Monat, sonst Kopf trotzdem anzeigen, aber die Zellen bleiben leer
      tableHead += `<th>${label}</th>`;
    }
    tableHead += '</tr>';

    let body = '';

    for (const emp of staff) {
      body += '<tr>';
      const name =
        `${emp.firstName || emp.vorname || ''} ${emp.lastName || emp.nachname || ''}`.trim() ||
        emp.id;
      body += `<td><strong>${name}</strong><br><span style="font-size:9px;">${emp.id}</span></td>`;

      for (let i = 0; i < 6; i++) {
        const d = weekDates[i];
        const iso = isoFromDate(d);
        const { m } = isoToYMD(iso);

        let cellText = '';
        if (m === month) {
          cellText = summarizeDay(iso, emp.id);
        }

        body += `<td style="white-space:pre-wrap;">${cellText || ''}</td>`;
      }

      body += '</tr>';
    }

    pages += `
      <div class="week-page">
        <div class="page-header">
          <h2>${title}</h2>
        </div>
        <table class="week-table">
          <thead>${tableHead}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Dienstplan ${monthLabel}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 10mm;
  }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 10px;
    color: #000;
  }
  .week-page {
    page-break-after: always;
  }
  .week-page:last-child {
    page-break-after: auto;
  }
  .page-header {
    margin-bottom: 8px;
  }
  h2 {
    margin: 0 0 4px 0;
    font-size: 16px;
  }
  table.week-table {
    width: 100%;
    border-collapse: collapse;
  }
  table.week-table th,
  table.week-table td {
    border: 1px solid #ccc;
    padding: 3px 4px;
    vertical-align: top;
  }
  table.week-table th {
    background: #f0f0f0;
    text-align: left;
  }
</style>
</head>
<body>
${pages}
</body>
</html>
`;
}

// ----------------------------------------------------------------------
// Download-Helfer
// ----------------------------------------------------------------------
function downloadString(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function fetchRawMonthJson(year, month) {
  const url = `/api/plan.php?year=${year}&month=${month}&ts=${Date.now()}`;
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ======================================================================
// PLUGIN
// ======================================================================
export const SettingsPlugin = {
  id: 'export',
  title: 'Export',
  order: 80,

  render(settings) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const years = [];
    for (let y = currentYear - 2; y <= currentYear + 3; y++) {
      years.push(y);
    }

    const yearOptions = years
      .map(
        (y) =>
          `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
      )
      .join('');

    const monthOptions = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${monthNameDE(m)}</option>`;
    }).join('');

    const staff = settings.staff || [];
    const staffOptions = [
      `<option value="">– Mitarbeiter auswählen –</option>`,
      ...staff.map((emp) => {
        const name =
          `${emp.firstName || emp.vorname || ''} ${emp.lastName || emp.nachname || ''}`.trim();
        const label = `${name || emp.id} (${emp.id})`;
        return `<option value="${emp.id}">${label}</option>`;
      }),
    ].join('');

    return `
      <div class="sm-export-root">
        <h3>Exporte</h3>

        <!-- Abschnitt: JSON -->
        <section class="sm-export-section">
          <h4>JSON-Export</h4>

          <div class="sm-editor-row">
            <label>Settings.json</label>
            <button id="sm-exp-settings-json" class="sm-btn sm-btn-primary">
              Settings.json herunterladen
            </button>
          </div>

          <div class="sm-editor-row">
            <label>Monatsplan (month.json)</label>
            <div class="sm-export-inline">
              <select id="sm-exp-year" class="sm-input" style="max-width:120px;">
                ${yearOptions}
              </select>
              <select id="sm-exp-month" class="sm-input" style="max-width:160px;">
                ${monthOptions}
              </select>
              <button id="sm-exp-month-json" class="sm-btn sm-btn-secondary">
                month.json herunterladen
              </button>
            </div>
          </div>
        </section>

        <hr style="margin:16px 0; border:none; border-top:1px solid var(--border-light);">

        <!-- Abschnitt: PDF -->
        <section class="sm-export-section">
          <h4>PDF-Export (4 Wochen, Landscape)</h4>
          <div class="sm-editor-row">
            <label>Monat / Jahr</label>
            <div class="sm-export-inline">
              <select id="sm-exp-pdf-year" class="sm-input" style="max-width:120px;">
                ${yearOptions}
              </select>
              <select id="sm-exp-pdf-month" class="sm-input" style="max-width:160px;">
                ${monthOptions}
              </select>
              <button id="sm-exp-month-pdf" class="sm-btn sm-btn-secondary">
                PDF-Ansicht öffnen
              </button>
            </div>
          </div>
          <p style="font-size:11px; color:#555; margin-top:4px;">
            Hinweis: Die PDF wird über den Browser-Druckdialog erzeugt (A4 Landscape auswählen).
          </p>
        </section>

        <hr style="margin:16px 0; border:none; border-top:1px solid var(--border-light);">

        <!-- Abschnitt: Kalender (ICS) -->
        <section class="sm-export-section">
          <h4>Kalender-Abo (ICS pro Mitarbeiter)</h4>

          <div class="sm-editor-row">
            <label>Mitarbeiter</label>
            <select id="sm-exp-staff" class="sm-input">
              ${staffOptions}
            </select>
          </div>

          <div class="sm-editor-row">
            <label>Monat / Jahr</label>
            <div class="sm-export-inline">
              <select id="sm-exp-ics-year" class="sm-input" style="max-width:120px;">
                ${yearOptions}
              </select>
              <select id="sm-exp-ics-month" class="sm-input" style="max-width:160px;">
                ${monthOptions}
              </select>
              <button id="sm-exp-staff-ics" class="sm-btn sm-btn-primary">
                ICS für Mitarbeiter herunterladen
              </button>
            </div>
          </div>

          <p style="font-size:11px; color:#555; margin-top:4px;">
            Enthält: funktionale Rollen mit Start/Ende, ganztägig Urlaub/Krank/Fortbildung und Notes.
            Feiertage werden nicht exportiert (macht das Endgerät selbst).
          </p>
        </section>
      </div>
    `;
  },

  bind() {
    const panel = document.querySelector('.sm-panel');
    if (!panel) {
      D.error('export', 'sm-panel nicht gefunden');
      return;
    }

    // ---------------- JSON: Settings ----------------
    const btnSettingsJson = panel.querySelector('#sm-exp-settings-json');
    btnSettingsJson?.addEventListener('click', () => {
      try {
        const json = JSON.stringify(state.settings || {}, null, 2);
        downloadString('settings.json', 'application/json', json);
        D.info('export', 'Settings.json exportiert');
      } catch (err) {
        D.error('export', 'Fehler beim Settings-Export', err);
        alert('Fehler beim Export von settings.json. Details in der Konsole.');
      }
    });

    // ---------------- JSON: Month ----------------
    const btnMonthJson = panel.querySelector('#sm-exp-month-json');
    btnMonthJson?.addEventListener('click', async () => {
      try {
        const yearEl = panel.querySelector('#sm-exp-year');
        const monthEl = panel.querySelector('#sm-exp-month');
        const year = parseInt(yearEl?.value || '', 10);
        const month = parseInt(monthEl?.value || '', 10);

        if (!year || !month) {
          alert('Bitte Jahr und Monat wählen.');
          return;
        }

        const raw = await fetchRawMonthJson(year, month);
        const json = JSON.stringify(raw || {}, null, 2);
        const fname = `month-${year}-${pad2(month)}.json`;

        downloadString(fname, 'application/json', json);
        D.info('export', 'month.json exportiert', { year, month });
      } catch (err) {
        D.error('export', 'Fehler beim month.json Export', err);
        alert('Fehler beim Export von month.json. Details in der Konsole.');
      }
    });

    // ---------------- PDF: Month (4 Wochen) ----------------
    const btnMonthPdf = panel.querySelector('#sm-exp-month-pdf');
    btnMonthPdf?.addEventListener('click', async () => {
      try {
        const yearEl = panel.querySelector('#sm-exp-pdf-year');
        const monthEl = panel.querySelector('#sm-exp-pdf-month');
        const year = parseInt(yearEl?.value || '', 10);
        const month = parseInt(monthEl?.value || '', 10);

        if (!year || !month) {
          alert('Bitte Jahr und Monat für den PDF-Export wählen.');
          return;
        }

        const plan = await loadMonthPlan(year, month);

        const html = buildPdfHtml(plan, year, month);
        const w = window.open('', '_blank');

        if (!w) {
          alert(
            'Popup wurde blockiert. Bitte Popups für diese Seite erlauben.'
          );
          return;
        }

        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();

        D.info('export', 'PDF-Ansicht geöffnet', { year, month });
      } catch (err) {
        D.error('export', 'Fehler beim PDF-Export', err);
        alert('Fehler beim PDF-Export. Details in der Konsole.');
      }
    });

    // ---------------- ICS: Mitarbeiter ----------------
    const btnStaffIcs = panel.querySelector('#sm-exp-staff-ics');
    btnStaffIcs?.addEventListener('click', async () => {
      try {
        const staffEl = panel.querySelector('#sm-exp-staff');
        const yearEl = panel.querySelector('#sm-exp-ics-year');
        const monthEl = panel.querySelector('#sm-exp-ics-month');

        const empId = staffEl?.value || '';
        const year = parseInt(yearEl?.value || '', 10);
        const month = parseInt(monthEl?.value || '', 10);

        if (!empId) {
          alert('Bitte einen Mitarbeiter auswählen.');
          return;
        }
        if (!year || !month) {
          alert('Bitte Jahr und Monat wählen.');
          return;
        }

        const plan = await loadMonthPlan(year, month);

        // Nur freigegebene Pläne exportieren
        const status = plan.status || 'empty';
        if (status !== 'approved') {
          const ok = confirm(
            `Der Monatsplan ist nicht freigegeben (Status: ${status}).\n` +
              `Trotzdem ICS exportieren?`
          );
          if (!ok) return;
        }

        const ics = buildIcsForEmployee(plan, year, month, empId);
        const fname = `dienstplan-${empId}-${year}-${pad2(month)}.ics`;

        downloadString(fname, 'text/calendar', ics);
        D.info('export', 'ICS exportiert', { empId, year, month });
      } catch (err) {
        D.error('export', 'Fehler beim ICS-Export', err);
        alert('Fehler beim ICS-Export. Details in der Konsole.');
      }
    });

    D.info('export', 'Export-Tab gebunden');
  },
};
