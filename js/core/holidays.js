// ==========================================================
// File: holidays.js (FINAL – Draft-Detection + plan-modified)
// Purpose: Feiertage + Brückentage ganztägig, KW- und Monatsübergreifend
// ==========================================================

import { D } from './diagnostics.js';
import { state } from './state.js';
import { markPlanModified } from './plan-status.js';

// ----------------------------------------------------------
// 1) Feste Feiertage
// ----------------------------------------------------------
const FIX_HOLIDAYS = [
  { name: 'Neujahrstag', calc: (y) => `${y}-01-01` },
  { name: 'Tag der Arbeit', calc: (y) => `${y}-05-01` },
  { name: 'Tag der Deutschen Einheit', calc: (y) => `${y}-10-03` },
  { name: 'Reformationstag', calc: (y) => `${y}-10-31` },
  { name: 'Heiligabend', calc: (y) => `${y}-12-24` },
  { name: '1. Weihnachtstag', calc: (y) => `${y}-12-25` },
  { name: '2. Weihnachtstag', calc: (y) => `${y}-12-26` },
  { name: 'Silvester', calc: (y) => `${y}-12-31` },
];

// ----------------------------------------------------------
// 2) Bewegliche Feiertage
// ----------------------------------------------------------
function calculateEasterSunday(year) {
  const f = Math.floor;
  const a = year % 19;
  const b = f(year / 100);
  const c = year % 100;
  const d = f(b / 4);
  const e = b % 4;
  const g = f((8 * b + 13) / 25);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = f(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = f((a + 11 * h + 22 * l) / 451);
  const month = f((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getMovableHolidays(year) {
  const easter = calculateEasterSunday(year);
  return [
    { name: 'Karfreitag', iso: addDays(easter, -2) },
    { name: 'Ostermontag', iso: addDays(easter, 1) },
    { name: 'Christi Himmelfahrt', iso: addDays(easter, 39) },
    { name: 'Pfingstmontag', iso: addDays(easter, 50) },
  ];
}

// ----------------------------------------------------------
// 3) Feiertagsliste für Jahr
// ----------------------------------------------------------
export function getHolidaysForYear(year) {
  const fixed = FIX_HOLIDAYS.map((h) => ({ name: h.name, iso: h.calc(year) }));
  const movable = getMovableHolidays(year);
  return [...fixed, ...movable];
}

// ----------------------------------------------------------
// 4) APPLY HOLIDAYS + BRIDGEDAYS TO PLAN (KW)
// ----------------------------------------------------------
export function applyHolidaysToPlan(plan, weekStartIso, weekEndIso) {
  try {
    if (!plan?.days) {
      D.warn('holidays', 'applyHolidaysToPlan: plan.days fehlt oder ungültig');
      return;
    }

    const staff = state.settings?.staff || [];
    const roles = state.settings?.roles || {};
    const hasHolidayRole = !!roles['Feiertag'];

    const y1 = parseInt(weekStartIso.slice(0, 4), 10);
    const y2 = parseInt(weekEndIso.slice(0, 4), 10);

    let all = getHolidaysForYear(y1);
    if (y2 !== y1) all = [...all, ...getHolidaysForYear(y2)];

    if (Array.isArray(plan.holidays)) {
      const fromMonthJson = plan.holidays
        .map((h) => {
          const [iso, name] = String(h).split(' – ');
          return iso && name ? { iso, name } : null;
        })
        .filter(Boolean);

      all = [...all, ...fromMonthJson];
    }

    if (!Array.isArray(plan.holidays)) plan.holidays = [];

    const beforeJSON = JSON.stringify(plan);

    let applied = 0;

    // ------------------------------------------
    // FEIERTAGE & BRÜCKENTAGE anwenden
    // ------------------------------------------
    for (const h of all) {
      const iso = h.iso;
      const name = h.name;

      if (iso < weekStartIso || iso > weekEndIso) continue;

      const label = `${iso} – ${name}`;
      if (!plan.holidays.includes(label)) {
        plan.holidays.push(label);
      }

      if (!plan.days[iso]) plan.days[iso] = {};
      const dayObj = plan.days[iso];

      const isBridgeday = plan.holidays.some(
        (e) => e === label && name.toLowerCase().includes('brück')
      );

      dayObj._holiday = { name, type: isBridgeday ? 'bridgeday' : 'feiertag' };

      for (const emp of staff) {
        const id = emp.id;
        if (!id) continue;

        if (!dayObj[id]) dayObj[id] = {};
        const empDay = dayObj[id];

        Object.keys(empDay).forEach((k) => {
          if (!k.startsWith('_')) delete empDay[k];
        });

        empDay._holiday = {
          name,
          type: isBridgeday ? 'bridgeday' : 'feiertag',
        };
        if (hasHolidayRole && !isBridgeday) empDay._holiday.role = 'Feiertag';
      }

      applied++;
    }

    // --------------------------------------------------
    // DEBUG: fachliche Wirkung
    // --------------------------------------------------
    if (applied > 0) {
      D.debug('holidays', 'applyHolidaysToPlan ausgeführt', {
        applied,
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
      });
    }

    // --------------------------------------------------
    // STATUS + WORKFLOW (zentral!)
    // --------------------------------------------------
    if (beforeJSON !== JSON.stringify(plan)) {
      D.info('holidays', 'Feiertage/Brückentage verändern Planinhalt', {
        applied,
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
      });

      markPlanModified('holidays');
    }
  } catch (err) {
    D.error('holidays', 'applyHolidaysToPlan Fehler', err);
  }
}
