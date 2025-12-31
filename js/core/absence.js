// ==========================================================
// File: absence.js (FINAL – mit Draft-Detection + plan-modified Events)
// Purpose: Urlaub / Krank / Fortbildung – KW-basiert + Statistik
// ==========================================================

import { state } from './state.js';
import { D } from './diagnostics.js';
import { toIso } from '../misc/datetime.js';
import { markPlanModified } from './plan-status.js';

// ----------------------------------------------------------
// SAFE LOCAL DATE PARSER (kein UTC-Shift)
// ----------------------------------------------------------
function isoToLocalDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d); // lokale Mitternacht – korrekt
}

function intersectRanges(startA, endA, startB, endB) {
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  if (start > end) return null;
  return { start, end };
}

// ==========================================================
// APPLY ABSENCE TO PLAN
// ==========================================================
export function applyAbsenceToPlan(plan, weekStartIso, weekEndIso) {
  try {
    if (!plan) return;

    if (!plan.days || typeof plan.days !== 'object') {
      plan.days = {};
    }

    const absences = Array.isArray(state.plan?.absences)
      ? state.plan.absences
      : [];

    if (!absences.length) return;

    const staff = Array.isArray(state.settings?.staff)
      ? state.settings.staff
      : [];
    const staffIds = new Set(staff.map((e) => e.id));

    const weekStart = isoToLocalDate(weekStartIso);
    const weekEnd = isoToLocalDate(weekEndIso);

    if (!weekStart || !weekEnd) {
      D.warn('absence', 'Ungültiger weekStart/weekEnd', {
        weekStartIso,
        weekEndIso,
      });
      return;
    }

    // Vorher-Zustand für Draft-Erkennung
    const beforeJSON = JSON.stringify(plan);

    let applied = 0;

    for (const a of absences) {
      if (!a?.employeeId || !a?.type || !a?.start || !a?.end) continue;
      if (!staffIds.has(a.employeeId)) continue;

      const absStart = isoToLocalDate(a.start);
      const absEnd = isoToLocalDate(a.end);
      if (!absStart || !absEnd) continue;

      const range = intersectRanges(absStart, absEnd, weekStart, weekEnd);
      if (!range) continue;

      // Iteration über lokale Datumsobjekte
      for (
        let d = new Date(range.start);
        d <= range.end;
        d.setDate(d.getDate() + 1)
      ) {
        const iso = toIso(d);

        if (!plan.days[iso]) plan.days[iso] = {};
        if (!plan.days[iso][a.employeeId]) plan.days[iso][a.employeeId] = {};

        const empDay = plan.days[iso][a.employeeId];

        // Feiertag blockiert Abwesenheit
        if (empDay._holiday) continue;

        // funktionale Rollen entfernen (volle Blockierung)
        Object.keys(empDay).forEach((k) => {
          if (!k.startsWith('_')) delete empDay[k];
        });

        empDay._absence = {
          type: a.type,
          note: a.note || '',
        };

        applied++;
      }
    }

    if (applied) {
      D.debug('absence', 'applyAbsenceToPlan ausgeführt', {
        applied,
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
      });
    }

    // ------------------------------------------------------
    // Draft-Erkennung
    // ------------------------------------------------------
    const afterJSON = JSON.stringify(plan);

    if (beforeJSON !== afterJSON) {
      D.info('absence', 'Abwesenheit verändert Planinhalt', {
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
      });

      markPlanModified('absence');
    }
  } catch (err) {
    D.error('absence', 'Fehler in applyAbsenceToPlan()', err);
  }
}

// ==========================================================
// STATISTIK
// ==========================================================
export function countAbsenceDaysForYear(
  employeeId,
  year,
  type,
  holidaySet = null
) {
  const absences = Array.isArray(state.plan?.absences)
    ? state.plan.absences
    : [];

  const holidays = holidaySet instanceof Set ? holidaySet : new Set();
  let total = 0;

  for (const a of absences) {
    if (!a || a.employeeId !== employeeId || a.type !== type) continue;

    const start = isoToLocalDate(a.start);
    const end = isoToLocalDate(a.end);
    if (!start || !end) continue;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() !== year) continue;

      const iso = toIso(d);
      if (holidays.has(iso)) continue;

      total++;
    }
  }

  return total;
}

export function getAbsenceSummaryForEmployee(
  employeeId,
  year,
  holidaySet = null
) {
  const types = ['Urlaub', 'Krank', 'Fortbildung'];
  const summary = {};

  for (const t of types) {
    summary[t] = countAbsenceDaysForYear(employeeId, year, t, holidaySet);
  }

  return summary;
}
