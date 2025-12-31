// ==========================================================
// File: interval.js
// Purpose: Slot-Plan <-> Intervall-Plan konvertieren
// - Keine Abhängigkeit von state (pure functions)
// - UI bleibt weiterhin slot-basiert
// - JSON kann kompakt als Intervalle gespeichert werden
// ==========================================================

import { D } from './diagnostics.js';
import { pad } from '../misc/datetime.js';

// ----------------------------------------------------------
// Helper: ist ein Slot-Key wie "07-08"?
// ----------------------------------------------------------
function isSlotKey(key) {
  return typeof key === 'string' && /^\d{2}-\d{2}$/.test(key);
}

// ----------------------------------------------------------
// Helper: Slot "07-08" -> { from: 7, to: 8 }
// ----------------------------------------------------------
function parseSlotKey(slotKey) {
  if (!isSlotKey(slotKey)) return null;
  const [sh, eh] = slotKey.split('-').map((n) => parseInt(n, 10));
  if (Number.isNaN(sh) || Number.isNaN(eh) || sh >= eh) return null;
  return { from: sh, to: eh };
}

// ----------------------------------------------------------
// Helper: Hours -> "HH:MM"
// ----------------------------------------------------------
function hourToTimeString(h) {
  return `${pad(h)}:00`;
}

// ----------------------------------------------------------
// Helper: Zeit "HH:MM" -> Stunde (int)
// ----------------------------------------------------------
function timeStringToHour(t) {
  if (typeof t !== 'string') return null;
  const [hh] = t.split(':');
  const h = parseInt(hh, 10);
  return Number.isNaN(h) ? null : h;
}

// ----------------------------------------------------------
// EMPLOYEE-DAY: Slots -> Intervalle
// empDaySlots: { '07-08':'Arzt', '08-09':'Arzt', _absence:{...}, ... }
// Rückgabe: { intervals:[{start,end,role},...], meta:{...} }
// ----------------------------------------------------------
function compressEmpDaySlotsToIntervals(empDaySlots) {
  if (!empDaySlots || typeof empDaySlots !== 'object') {
    return { intervals: [], meta: {} };
  }

  const meta = {};
  const pairs = [];

  for (const [key, val] of Object.entries(empDaySlots)) {
    if (key.startsWith('_')) {
      // Meta übernehmen (_absence, _holiday, ...)
      meta[key] = val;
      continue;
    }
    if (!isSlotKey(key)) continue;
    if (typeof val !== 'string' || !val) continue;

    const range = parseSlotKey(key);
    if (!range) continue;

    pairs.push({
      startHour: range.from,
      endHour: range.to,
      role: val,
    });
  }

  if (!pairs.length) {
    return { intervals: [], meta };
  }

  // nach Startzeit sortieren
  pairs.sort((a, b) => {
    if (a.startHour !== b.startHour) return a.startHour - b.startHour;
    if (a.endHour !== b.endHour) return a.endHour - b.endHour;
    if (a.role < b.role) return -1;
    if (a.role > b.role) return 1;
    return 0;
  });

  const intervals = [];
  let current = null;

  for (const p of pairs) {
    if (!current) {
      current = { startHour: p.startHour, endHour: p.endHour, role: p.role };
      continue;
    }

    // gleicher Role und nahtlos angrenzend -> zusammenfassen
    if (p.role === current.role && p.startHour === current.endHour) {
      current.endHour = p.endHour;
    } else {
      intervals.push(current);
      current = { startHour: p.startHour, endHour: p.endHour, role: p.role };
    }
  }

  if (current) {
    intervals.push(current);
  }

  // in Textform "HH:MM"
  const out = intervals.map((it) => ({
    start: hourToTimeString(it.startHour),
    end: hourToTimeString(it.endHour),
    role: it.role,
  }));

  return { intervals: out, meta };
}

// ----------------------------------------------------------
// EMPLOYEE-DAY: Intervalle -> Slots
// empDay: { intervals:[{start:"07:00",end:"12:00",role}], _absence?... }
// Mutiert empDay: fügt Slot-Keys hinzu, lässt Meta unverändert
// ----------------------------------------------------------
function expandEmpDayIntervalsToSlots(empDay) {
  if (!empDay || typeof empDay !== 'object') return empDay;

  const intervals = Array.isArray(empDay.intervals) ? empDay.intervals : null;
  if (!intervals || !intervals.length) {
    return empDay;
  }

  // vorhandene Slots löschen, Meta behalten
  for (const key of Object.keys(empDay)) {
    if (!key.startsWith('_') && isSlotKey(key)) {
      delete empDay[key];
    }
  }

  for (const iv of intervals) {
    if (!iv || typeof iv.role !== 'string') continue;

    const fromH = timeStringToHour(iv.start);
    const toH = timeStringToHour(iv.end);

    if (fromH == null || toH == null || fromH >= toH) continue;

    for (let h = fromH; h < toH; h++) {
      const slotKey = `${pad(h)}-${pad(h + 1)}`;
      empDay[slotKey] = iv.role;
    }
  }

  // optional: Intervalle im Laufbetrieb nicht mehr nötig
  // delete empDay.intervals;

  return empDay;
}

// ----------------------------------------------------------
// PLAN: Slots -> Intervalle (neue Struktur, Plan selbst bleibt unverändert)
// slotPlan: dein aktueller state.plan (Slot-basiert)
// Rückgabe: NEUER Plan mit Intervallen
// ----------------------------------------------------------
export function compressPlanToIntervals(slotPlan) {
  try {
    if (!slotPlan || typeof slotPlan !== 'object') {
      D.error('interval', 'compressPlanToIntervals: ungültiger Plan', slotPlan);
      return {
        year: null,
        month: null,
        status: 'empty',
        days: {},
        notes: [],
        holidays: [],
      };
    }

    const outDays = {};

    const days =
      slotPlan.days && typeof slotPlan.days === 'object' ? slotPlan.days : {};

    for (const [iso, dayData] of Object.entries(days)) {
      if (!dayData || typeof dayData !== 'object') continue;

      const newDay = {};

      for (const [key, val] of Object.entries(dayData)) {
        // evtl. spätere Day-Meta: "_something"
        if (key.startsWith('_')) {
          newDay[key] = val;
          continue;
        }

        // Mitarbeiter-ID
        const empId = key;
        const empDaySlots = val && typeof val === 'object' ? val : {};

        const { intervals, meta } = compressEmpDaySlotsToIntervals(empDaySlots);

        // Wenn weder Intervalle noch Meta -> Mitarbeiter-Tag leer, auslassen
        const hasMeta = Object.keys(meta).length > 0;
        if (!intervals.length && !hasMeta) continue;

        const empOut = {};

        if (intervals.length) {
          empOut.intervals = intervals;
        }

        for (const [mKey, mVal] of Object.entries(meta)) {
          empOut[mKey] = mVal;
        }

        newDay[empId] = empOut;
      }

      if (Object.keys(newDay).length > 0) {
        outDays[iso] = newDay;
      }
    }

    const outPlan = {
      year: slotPlan.year ?? null,
      month: slotPlan.month ?? null,
      status: slotPlan.status || 'empty',
      days: outDays,
      notes: Array.isArray(slotPlan.notes) ? slotPlan.notes : [],
      holidays: Array.isArray(slotPlan.holidays) ? slotPlan.holidays : [],
    };

    D.debug('interval', 'Plan zu Intervallen komprimiert', {
      year: outPlan.year,
      month: outPlan.month,
      days: Object.keys(outDays).length,
    });

    return outPlan;
  } catch (err) {
    D.error('interval', 'compressPlanToIntervals Exception', err);
    return {
      year: null,
      month: null,
      status: 'empty',
      days: {},
      notes: [],
      holidays: [],
    };
  }
}

// ----------------------------------------------------------
// PLAN: Intervalle -> Slots (in-place, mutiert Plan!)
// Wird typischerweise direkt nach loadMonthPlan() aufgerufen
// Unterstützt alte Builds (rein slot-basierte JSONs) -> no-op
// ----------------------------------------------------------
export function expandPlanFromIntervals(plan) {
  try {
    if (!plan || typeof plan !== 'object') {
      D.error('interval', 'expandPlanFromIntervals: ungültiger Plan', plan);
      return plan;
    }

    if (!plan.days || typeof plan.days !== 'object') {
      plan.days = {};
      return plan;
    }

    for (const [iso, dayData] of Object.entries(plan.days)) {
      if (!dayData || typeof dayData !== 'object') continue;

      for (const [key, val] of Object.entries(dayData)) {
        if (key.startsWith('_')) continue; // day-level meta

        const empDay = val && typeof val === 'object' ? val : {};
        // Nur wenn intervals existieren, expandieren
        if (Array.isArray(empDay.intervals) && empDay.intervals.length) {
          expandEmpDayIntervalsToSlots(empDay);
          dayData[key] = empDay;
        }
      }
    }

    D.debug('interval', 'Plan-Intervalle zu Slots expandiert');
    return plan;
  } catch (err) {
    D.error('interval', 'expandPlanFromIntervals Exception', err);
    return plan;
  }
}

// ----------------------------------------------------------
// OPTIONAL: direkte Helfer für einzelne Tage/Mitarbeiter (exportiert)
// ----------------------------------------------------------

// Nur für gezielte Tests oder spätere Features
export function compressEmpDay(empDaySlots) {
  return compressEmpDaySlotsToIntervals(empDaySlots);
}

export function expandEmpDay(empDay) {
  return expandEmpDayIntervalsToSlots(empDay);
}
