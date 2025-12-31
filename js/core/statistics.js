// ==========================================================
// File: statistics.js (FINAL v5.0)
// - Liest NUR persistente Daten via loadMonthPlan()
// - Unterstützt Intervalle & Stunden-Slots
// - Zählt Urlaub/Krank/Fortbildung/Feiertage/Brückentage korrekt
// ==========================================================

import { D } from './diagnostics.js';
import { state } from './state.js';
import { loadMonthPlan } from './persist.js';

import {
  parseDate,
  toIso,
  formatDate,
  getWeekNumber,
  buildHourSlots,
} from '../misc/datetime.js';

// ----------------------------------------------------------
// Konstanten
// ----------------------------------------------------------
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ==========================================================
// Range-Helfer
// ==========================================================
export function formatStatsRangeLabel(startIso, endIso) {
  const s = formatDate(startIso);
  const e = formatDate(endIso);
  return s === e ? s : `${s} – ${e}`;
}

export function getDateRangeForYear(year) {
  if (!year) return null;
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

export function getDateRangeForMonth(year, month) {
  if (!year || !month) return null;

  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();

  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getDateRangeCustom(startIso, endIso) {
  if (!startIso || !endIso) return null;
  if (startIso > endIso) return null;
  return { start: startIso, end: endIso };
}

// ==========================================================
// Shift-Logik (Rotation + Versionen) – nur für SOLL
// ==========================================================
function getFirstMondayOfMonth(year, month) {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getRotationIndexForDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;

  const fm = getFirstMondayOfMonth(y, m);
  if (date < fm) return null;

  const diffDays = Math.floor((date - fm) / MS_PER_DAY);
  return (((Math.floor(diffDays / 7) % 4) + 4) % 4) + 1; // 1..4
}

function normalizeShiftVersion(v) {
  if (!v.shifts) v.shifts = {};
  for (const w of ['1', '2', '3', '4']) {
    if (!v.shifts[w]) v.shifts[w] = {};
  }
}

function getShiftVersionForDate(emp, date) {
  const versions = Array.isArray(emp.shiftVersions) ? emp.shiftVersions : [];
  if (!versions.length) return null;

  versions.forEach(normalizeShiftVersion);

  const enriched = versions
    .map((v) => {
      const d = parseDate(v.validFrom);
      return {
        version: v,
        from: d instanceof Date && !Number.isNaN(d.getTime()) ? d : null,
      };
    })
    .filter((e) => e.from);

  const valid = enriched.filter((e) => e.from <= date);
  if (!valid.length) return null;

  valid.sort((a, b) => b.from - a.from);
  return valid[0].version;
}

function getDayKeyForDate(date) {
  const js = date.getDay(); // 0=So..6=Sa
  switch (js) {
    case 1:
      return 'mo';
    case 2:
      return 'di';
    case 3:
      return 'mi';
    case 4:
      return 'do';
    case 5:
      return 'fr';
    case 6:
      return 'sa';
    default:
      return null; // Sonntag
  }
}

function parsePatternToRanges(pattern) {
  if (!pattern) return null;

  let s = String(pattern).trim().toLowerCase();
  if (!s || s === 'frei' || s === '-') return null;

  s = s
    .replace(/[–—−]/g, '-')
    .replace(/uhr/g, '')
    .replace(/h/g, '')
    .replace(/bis/g, '-')
    .replace(/\s+/g, '')
    .replace(/(\d+)\.(\d+)/g, '$1:$2')
    .replace(/:00/g, '');

  const parts = s.split('/');
  const ranges = [];

  for (const p of parts) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(p);
    if (!m) continue;

    const from = Number(m[1]);
    const to = Number(m[2]);

    if (from < 0 || from > 23) continue;
    if (to < 1 || to > 24) continue;
    if (to <= from) continue;

    ranges.push({ from, to });
  }

  return ranges.length ? ranges : null;
}

/**
 * Sollstunden anhand der Schichtversionen.
 * Rückgabe: { targetHours, isRegularWorkday }
 */
function getDailyTargetFromShifts(emp, date) {
  const dayKey = getDayKeyForDate(date);
  if (!dayKey) return { targetHours: 0, isRegularWorkday: false }; // Sonntag

  const version = getShiftVersionForDate(emp, date);
  if (!version) return { targetHours: 0, isRegularWorkday: false };

  const rot = getRotationIndexForDate(date);
  if (!rot) return { targetHours: 0, isRegularWorkday: false };

  const weekCfg = version.shifts?.[String(rot)];
  if (!weekCfg) return { targetHours: 0, isRegularWorkday: false };

  let pattern = weekCfg[dayKey] || '';
  pattern = String(pattern).trim();
  if (!pattern) return { targetHours: 0, isRegularWorkday: false };

  const ranges = parsePatternToRanges(pattern);
  if (!ranges || !ranges.length) {
    // Nicht-numerische Pattern wie "Schule" lassen wir als 0h laufen.
    return { targetHours: 0, isRegularWorkday: false };
  }

  let total = 0;
  for (const r of ranges) {
    total += r.to - r.from;
  }

  return {
    targetHours: total,
    isRegularWorkday: total > 0,
  };
}

// ==========================================================
// Feiertage / Brückentage / Abwesenheit
// ==========================================================
function resolveHolidayForDate(plan, iso) {
  const result = {
    isHoliday: false,
    isBridgeday: false,
    name: null,
  };

  const list = Array.isArray(plan.holidays) ? plan.holidays : [];
  for (const h of list) {
    const [d, n] = String(h).split(' – ');
    if (d === iso) {
      const name = n || '';
      const lower = name.toLowerCase();
      const isBridge = lower.includes('brück');
      result.isHoliday = !isBridge;
      result.isBridgeday = isBridge;
      result.name = name;
      break;
    }
  }

  return result;
}

function findAbsenceForEmployee(plan, employeeId, iso) {
  const absences = Array.isArray(plan.absences) ? plan.absences : [];
  if (!absences.length) return null;

  const date = parseDate(iso);
  if (!date) return null;

  for (const a of absences) {
    if (!a || a.employeeId !== employeeId) continue;

    const s = parseDate(a.start);
    const e = parseDate(a.end);
    if (!s || !e) continue;

    if (s <= date && date <= e) {
      return a;
    }
  }

  return null;
}

// ==========================================================
// Iststunden: Intervalle ODER Stunden-Slots
// ==========================================================
function parseTimeToMinutes(str) {
  if (!str) return null;
  const [hStr, mStr] = String(str).split(':');
  const h = Number(hStr);
  const m = Number(mStr || '0');
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function computeIstHoursForDate(plan, employeeId, iso, settings) {
  const dayObj = plan.days?.[iso];
  if (!dayObj) return 0;

  const empDay = dayObj[employeeId];
  if (!empDay) return 0;

  // 1) Neue Struktur: interval-basierte Speicherung
  if (Array.isArray(empDay.intervals)) {
    let sumMinutes = 0;
    for (const it of empDay.intervals) {
      if (!it || !it.start || !it.end) continue;
      const startMin = parseTimeToMinutes(it.start);
      const endMin = parseTimeToMinutes(it.end);
      if (startMin == null || endMin == null) continue;
      if (endMin <= startMin) continue;
      sumMinutes += endMin - startMin;
    }
    return sumMinutes / 60;
  }

  // 2) Fallback: Stunden-Slots ("08-09", "09-10", ...)
  const slots = buildHourSlots(settings);
  let sum = 0;

  for (const slot of slots) {
    const val = empDay[slot];
    if (typeof val === 'string' && !slot.startsWith('_')) {
      sum += 1;
    }
  }

  return sum;
}

// ==========================================================
// HAUPTFUNKTION: Statistik pro Mitarbeiter + Zeitraum
// ==========================================================
export async function getStatsForRange(
  employeeId,
  startIso,
  endIso,
  settingsOverride
) {
  try {
    // --- Zeitraum validieren ----------------------------------------
    const s = parseDate(startIso);
    const e = parseDate(endIso);

    if (!s || !e || s > e) {
      throw new Error(`Ungültiger Zeitraum: ${startIso} – ${endIso}`);
    }

    // --- Settings + Mitarbeiter -------------------------------------
    const settings = settingsOverride || state.settings || {};
    const staff = settings.staff || [];
    const emp = staff.find((x) => x.id === employeeId) || null;

    if (!emp) {
      D.error('statistics', 'Mitarbeiter nicht gefunden', { employeeId });
      return null;
    }

    const employeeName =
      `${emp.firstName || emp.vorname || ''} ${emp.lastName || emp.nachname || ''}`.trim() ||
      emp.id;

    const result = {
      employeeId,
      employeeName,
      range: { start: startIso, end: endIso },
      hours: {
        soll: 0,
        ist: 0,
        diff: 0,
      },
      days: {
        workdays: 0,
        vacation: 0,
        sick: 0,
        training: 0,
        holidays: 0,
        bridgedays: 0,
      },
      entries: [],
    };

    // --- Monats-Cache ----------------------------------------------
    const monthCache = new Map(); // "YYYY-M" -> plan

    async function ensurePlanForDate(date) {
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const key = `${y}-${m}`;

      if (monthCache.has(key)) return monthCache.get(key);

      let plan;
      try {
        plan = await loadMonthPlan(y, m);
      } catch (err) {
        D.error('statistics', 'Fehler beim Laden des Monatsplans', {
          year: y,
          month: m,
          err,
        });
      }

      const safePlan = plan || {
        year: y,
        month: m,
        status: 'empty',
        days: {},
        notes: [],
        holidays: [],
        absences: [],
      };

      monthCache.set(key, safePlan);
      return safePlan;
    }

    // --- Tag für Tag durch Zeitraum --------------------------------
    for (let t = s.getTime(); t <= e.getTime(); t += MS_PER_DAY) {
      const date = new Date(t);
      const jsDay = date.getDay(); // 0=So

      // Sonntag komplett ignorieren
      if (jsDay === 0) continue;

      const iso = toIso(date);
      const weekday = date.toLocaleDateString('de-DE', { weekday: 'short' });
      const kw = getWeekNumber(date);

      const plan = await ensurePlanForDate(date);

      // Sollstunden aus Schichtversionen
      const { targetHours: soll, isRegularWorkday } = getDailyTargetFromShifts(
        emp,
        date
      );

      // Feiertag / Brückentag
      const hol = resolveHolidayForDate(plan, iso);
      const isHoliday = hol.isHoliday;
      const isBridgeday = hol.isBridgeday;

      // Abwesenheit
      const absence = findAbsenceForEmployee(plan, employeeId, iso);
      const absenceType = absence?.type || null;

      // Iststunden (Intervalle oder Slots)
      const ist = computeIstHoursForDate(plan, employeeId, iso, settings);

      // ---------------------------
      // Tageszählungen
      // ---------------------------

      // Feiertage / Brückentage werden NUR gezählt, wenn regulärer Arbeitstag
      if (isRegularWorkday && isHoliday) {
        result.days.holidays++;
      }
      if (isRegularWorkday && isBridgeday) {
        result.days.bridgedays++;
      }

      // Abwesenheiten NUR auf regulären Arbeitstagen ohne gesetzlichen Feiertag
      if (isRegularWorkday && !isHoliday) {
        if (absenceType === 'Urlaub' && !isBridgeday) {
          // Urlaubstag auf regulärem Arbeitstag, aber NICHT auf gesetzlichem Feiertag
          result.days.vacation++;
        } else if (absenceType === 'Krank') {
          result.days.sick++;
        } else if (absenceType === 'Fortbildung') {
          result.days.training++;
        }
      }

      // Brückentage gelten immer als Urlaubstag (Option D = ja)
      if (isRegularWorkday && isBridgeday) {
        result.days.vacation++;
      }

      // Arbeitstage = Tage mit IST > 0, keine Abwesenheit, kein Feiertag/Brückentag (Option C)
      if (ist > 0 && !isHoliday && !isBridgeday && !absenceType) {
        result.days.workdays++;
      }

      // ---------------------------
      // Stunden & Diff
      // ---------------------------
      let dayDiff = 0;

      const isPaidAbsence =
        (isRegularWorkday && (isHoliday || isBridgeday)) ||
        (isRegularWorkday &&
          (absenceType === 'Urlaub' ||
            absenceType === 'Krank' ||
            absenceType === 'Fortbildung'));

      if (isPaidAbsence) {
        // Bezahlte Freistellung: Sollstunden werden vergütet, Diff = 0
        result.hours.soll += soll;
        result.hours.ist += soll;
        dayDiff = 0;
      } else {
        // Normale Logik
        result.hours.soll += soll;
        result.hours.ist += ist;

        dayDiff = ist - soll;

        // Spezialfall: Frei-Tag ohne Soll, aber gearbeitet -> Diff = IST
        if (
          soll === 0 &&
          ist > 0 &&
          !isHoliday &&
          !isBridgeday &&
          !absenceType
        ) {
          dayDiff = ist;
        }
      }

      result.hours.diff += dayDiff;

      // ---------------------------
      // Detail-Eintrag
      // ---------------------------
      let holidayLabel = null;
      if (isHoliday) holidayLabel = 'Feiertag';
      else if (isBridgeday) holidayLabel = 'Brückentag';

      result.entries.push({
        date: iso,
        weekday,
        kw,
        sollHours: soll,
        istHours: ist,
        diff: dayDiff,
        absence: absenceType,
        holiday: holidayLabel,
      });
    }

    D.info('statistics', 'Stats berechnet', {
      employeeId,
      range: { startIso, endIso },
      hours: result.hours,
      days: result.days,
      entries: result.entries.length,
    });

    return result;
  } catch (err) {
    D.error('statistics', 'Fehler in getStatsForRange()', err);
    throw err;
  }
}
