// ======================================================================
// settings-export-ical.js – v1.0 FINAL
// Export als .ics (pro Monat) + WebCal-Link pro Mitarbeiter
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';
import {
  toIso,
  getDateRange,
  parseDate,
  formatDate,
} from '/js/misc/datetime.js';
import { loadMonthPlan } from '/js/core/persist.js';

// ======================================================================
// KONFIG: Basis-URL für WebCal-Feeds
// Für Testumgebung (Variante A):
//    webcal://<host>/calendar/employee/HL.ics
// ======================================================================
export const ICAL_BASE_URL = '/calendar/employee/';
// später z.B.:
// export const ICAL_BASE_URL = "https://praxis-cloud.de/ical/";

// ======================================================================
// ICS HELFER
// ======================================================================

function icsEscape(s = '') {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function dt(date) {
  const d = parseDate(date);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function dtTime(dateIso, timeHHMM) {
  const d = parseDate(dateIso);
  if (!d) return '';
  const [hh, mm] = timeHHMM.split(':').map(Number);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const HH = String(hh).padStart(2, '0');
  const MM = String(mm).padStart(2, '0');
  return `${y}${m}${day}T${HH}${MM}00`;
}

function generateUID(empId, dateIso, info = '') {
  const clean = (info || '').replace(/[^a-z0-9]/gi, '_');
  return `${empId}-${dateIso}-${clean}@dienstplan`;
}

function getRoleFromDayCell(cell) {
  if (!cell) return '';
  for (const [key, val] of Object.entries(cell)) {
    if (key.startsWith('_')) continue;
    if (typeof val === 'string' && val.trim() !== '') {
      return val.trim();
    }
  }
  return '';
}

// ======================================================================
// ICS LOGIK PRO MITARBEITER / PRO MONAT
// ======================================================================

function buildEmployeeICSEvents(employeeId, monthPlan, rolesMap) {
  const events = [];
  const absences = monthPlan.absences || [];
  const daysObj = monthPlan.days || {};
  const notes = monthPlan.notes || [];

  // ------------------------------------------------------
  // 1) Abwesenheiten (ganztägig)
  // ------------------------------------------------------
  absences
    .filter((a) => a.employeeId === employeeId)
    .forEach((a) => {
      const dates = getDateRange(a.start, a.end);
      dates.forEach((iso) => {
        const uid = generateUID(employeeId, iso, a.type);

        events.push({
          uid,
          dtStart: dt(iso),
          dtEnd: dt(iso),
          summary: a.type,
          allDay: true,
          description: a.note || '',
        });
      });
    });

  // ------------------------------------------------------
  // 2) Notes (Teamsitzungen usw.) → ganztägig
  // ------------------------------------------------------
  notes.forEach((n) => {
    if (!n.text || !n.weekStart) return;

    // Erwartete Struktur: "03.11.2025 Teamsitzung (12:30–14:00)"
    // Wir extrahieren das erste Datum.
    const isoRaw = getDateFromNote(n.text);
    if (!isoRaw) return;

    const uid = generateUID(employeeId, isoRaw, 'note');

    events.push({
      uid,
      dtStart: dt(isoRaw),
      dtEnd: dt(isoRaw),
      summary: n.text,
      allDay: true,
    });
  });

  // ------------------------------------------------------
  // 3) Schichten / Arbeitsrollen pro Tag
  // ------------------------------------------------------
  for (const iso of Object.keys(daysObj)) {
    const day = daysObj[iso];
    const cell = day?.[employeeId];
    if (!cell) continue;

    // Abwesenheit-Meta → überspringen (Urlaub/Krank bereits oben)
    if (cell._absence) continue;

    // Feiertag → nicht exportieren
    if (cell._holiday) continue;

    const role = getRoleFromDayCell(cell);
    if (!role) continue;

    // "frei" → kein Termin
    if (role.toLowerCase() === 'frei') continue;

    // Schule → kein Termin
    if (role.toLowerCase() === 'schule') continue;

    // JVA → 08-14 Uhr
    if (role === 'JVA') {
      events.push({
        uid: generateUID(employeeId, iso, 'JVA'),
        dtStart: dtTime(iso, '08:00'),
        dtEnd: dtTime(iso, '14:00'),
        summary: 'JVA',
      });
      continue;
    }

    // Normale funktionale Rolle → ganztägig
    if (rolesMap[role]?.functional === true) {
      events.push({
        uid: generateUID(employeeId, iso, role),
        dtStart: dt(iso),
        dtEnd: dt(iso),
        summary: role,
        allDay: true,
      });
      continue;
    }

    // Fortbildung → in absences abgedeckt
  }

  return events;
}

// Hilfsfunktion: Extrahiert ISO aus Notes (z.B. "03.11.2025")
function getDateFromNote(text) {
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

// ======================================================================
// ICS GENERATOR
// ======================================================================

function buildICSFile(events, employeeId) {
  const lines = [];

  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Dienstplan//DE');
  lines.push('CALSCALE:GREGORIAN');
  lines.push(`X-WR-CALNAME:${icsEscape(employeeId)}`);

  events.forEach((ev) => {
    lines.push('BEGIN:VEVENT');

    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${ev.dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${ev.dtEnd}`);
    } else {
      lines.push(`DTSTART:${ev.dtStart}`);
      lines.push(`DTEND:${ev.dtEnd}`);
    }

    lines.push(`UID:${ev.uid}`);
    lines.push(`SUMMARY:${icsEscape(ev.summary)}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
    }

    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

// ======================================================================
// WEB UI – SETTINGS PLUGIN
// ======================================================================

export const SettingsPlugin = {
  id: 'export-ical',
  title: 'Export iCal',
  order: 80,

  render() {
    const staff = state.settings?.staff || [];
    const year = new Date().getFullYear();

    return `
      <div class="sm-export-root">
        <h3>Kalender Export (ICS)</h3>

        <p>ICS pro Mitarbeiter und Monat.</p>

        <div class="sm-editor-row">
          <label>Jahr</label>
          <select id="sm-ical-year" class="sm-input">
            ${Array.from({ length: 5 })
              .map((_, i) => {
                const y = year - 2 + i;
                return `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`;
              })
              .join('')}
          </select>
        </div>

        <div class="sm-editor-row">
          <label>Monat</label>
          <select id="sm-ical-month" class="sm-input">
            ${[...Array(12)]
              .map((_, i) => {
                const m = i + 1;
                return `<option value="${m}">${m.toString().padStart(2, '0')}</option>`;
              })
              .join('')}
          </select>
        </div>

        <h4>Mitarbeiter</h4>
        <div class="sm-export-list">
          ${staff
            .map(
              (emp) => `
            <div class="sm-export-row">
              <div>${emp.firstName || ''} ${emp.lastName || ''} (${emp.id})</div>
              <button class="sm-btn sm-btn-primary sm-ical-btn" data-id="${emp.id}">
                Monat exportieren (.ics)
              </button>
            </div>
          `
            )
            .join('')}
        </div>

        <h4>WebCal-Links</h4>
        <div class="sm-export-list">
          ${staff
            .map(
              (emp) => `
            <div class="sm-export-row">
              <div>${emp.firstName || ''} ${emp.lastName || ''} (${emp.id})</div>
              <input class="sm-input" readonly value="webcal://REPLACE${ICAL_BASE_URL}${emp.id}.ics">
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  },

  bind() {
    const panel = document.querySelector('.sm-panel');
    if (!panel) return;

    const yearEl = panel.querySelector('#sm-ical-year');
    const monthEl = panel.querySelector('#sm-ical-month');

    panel.querySelectorAll('.sm-ical-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const empId = btn.dataset.id;
        const year = Number(yearEl.value);
        const month = Number(monthEl.value);

        try {
          const monthPlan = await loadMonthPlan(year, month);
          const roles = state.settings.roles || {};

          const events = buildEmployeeICSEvents(empId, monthPlan, roles);
          const ics = buildICSFile(events, empId);

          const blob = new Blob([ics], { type: 'text/calendar' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = `${empId}-${year}-${String(month).padStart(2, '0')}.ics`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          URL.revokeObjectURL(url);

          D.info('export-ical', 'ICS generiert', {
            empId,
            year,
            month,
            events: events.length,
          });
        } catch (err) {
          D.error('export-ical', 'Fehler beim ICS-Export', err);
          alert('Fehler beim ICS-Export. Details in Konsole.');
        }
      });
    });
  },
};
