// ==========================================================
// js/logic/analyze.js
// Erzeugt einen Analyse-Snapshot für Regeln
// ==========================================================

import { getISOWeekDates, buildHourSlots } from '/js/misc/datetime.js';
import { D } from '/js/core/diagnostics.js';

/**
 * analyzePlan
 * @param {Object} input
 * @param {Object} input.plan
 * @param {Object} input.settings
 * @param {Object} input.context { year, week }
 *
 * @returns {Object} analysis (read-only)
 */
export function analyzePlan({ plan, settings, context }) {
  const { year, week } = context;

  // --------------------------------------------------------
  // Kontext validieren (hart)
  // --------------------------------------------------------
  if (!Number.isInteger(year) || !Number.isInteger(week)) {
    throw new Error(
      `analyzePlan: invalid context (year=${year}, week=${week})`
    );
  }
  // --------------------------------------------------------
  // Feiertag / Brückentag prüfen
  // --------------------------------------------------------
  function isHolidayOrBridgeday(plan, iso, dayData) {
    // 1) Laufzeit-Flag (applyHolidaysToPlan)
    if (dayData?._holiday) return true;

    // 2) Mitarbeiter-Flag (redundant, aber sicher)
    for (const empDay of Object.values(dayData || {})) {
      if (empDay?._holiday) return true;
    }

    // 3) Persistierte Feiertage / Brückentage aus month.json
    if (Array.isArray(plan?.holidays)) {
      return plan.holidays.some((h) => String(h).startsWith(iso + ' –'));
    }

    return false;
  }

  // --------------------------------------------------------
  // Analyse-Snapshot
  // --------------------------------------------------------
  const analysis = {
    meta: { year, week },

    // Rohdaten für tagesbasierte Regeln (ITN etc.)
    notes: Array.isArray(plan?.notes) ? plan.notes : [],

    days: {},
  };

  // --------------------------------------------------------
  // ISO-Tage der Woche
  // --------------------------------------------------------
  const weekDates = getISOWeekDates(year, week);

  // --------------------------------------------------------
  // Stunden-Slots (defensiv!)
  // --------------------------------------------------------
  const rawSlots = buildHourSlots(settings);
  const hourSlots = Array.isArray(rawSlots) ? rawSlots : [];

  // --------------------------------------------------------
  // Tage analysieren
  // --------------------------------------------------------
  for (const iso of weekDates) {
    const dayData = plan?.days?.[iso] || {};

    // 🔴 NEU: Feiertag / Brückentag früh erkennen
    if (isHolidayOrBridgeday(plan, iso, dayData)) {
      D.debug('logic-analyze', 'Tag übersprungen (Feiertag/Brückentag)', {
        iso,
      });
      continue; // ❗ KEINE REGELN FÜR DIESEN TAG
    }

    const day = {
      _flags: {
        holiday: false,
        absence: false,
      },
      hours: {},
    };

    // ----------------------------------------------
    // Tages-Flags (Abwesenheit – Feiertag ist schon raus)
    // ----------------------------------------------
    for (const empId of Object.keys(dayData)) {
      const empDay = dayData[empId];
      if (!empDay || typeof empDay !== 'object') continue;

      if (empDay._absence) day._flags.absence = true;
    }

    // ----------------------------------------------
    // Slots auswerten (nur wenn vorhanden)
    // ----------------------------------------------
    for (const slot of hourSlots) {
      const roles = {};
      const employees = [];

      for (const empId of Object.keys(dayData)) {
        if (empId.startsWith('_')) continue;

        const empDay = dayData[empId];
        if (!empDay || typeof empDay !== 'object') continue;

        const role = empDay[slot];
        if (!role) continue;

        roles[role] = (roles[role] || 0) + 1;
        employees.push({ empId, role });
      }

      day.hours[slot] = {
        roles,
        employees,
      };
    }

    // ✅ KEINE zusätzliche Hülle
    analysis.days[iso] = day;
  }

  return analysis;
}
