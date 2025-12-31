// ==========================================================
// state.js — Globaler Zustand des Dienstplans
// Ziel: Minimal, konsistent, multi-month-safe
// ==========================================================

export const state = {
  // --------------------------------------------------------
  // NAVIGATION / UI
  // --------------------------------------------------------

  // Die aktuell dargestellte Kalenderwoche
  currentYear: null,
  currentWeek: null,

  // Aktiver Tag (nur UI: Montag–Samstag)
  activeDay: 'Montag',

  // Aktive Rolle aus dem Dropdown (string oder null)
  selectedRole: null,

  // --------------------------------------------------------
  // SETTINGS
  // Gefüllt von loadSettings()
  // Muss *nicht* vollständig vorausgefüllt sein
  // --------------------------------------------------------

  settings: {
    system: {
      startHour: 7,
      endHour: 19,
    },

    staff: [], // [{ id, name, initials, active }]
    roles: {}, // { 'Anmeldung': {color:'#fff', functional:true}, ... }
  },

  // --------------------------------------------------------
  // WEEK-WORKING PLAN (KW-Rendering)
  //
  // Wichtig:
  // - state.plan enthält IMMER den *zusammengebauten* KW-Plan
  //   für renderPlan(), unabhängig von Month-Files
  //
  // - state.plan.days ist ein ISO-Index:
  //   {
  //     '2025-10-31': {
  //         EMP1: { '07:00':'Anmeldung', _absence:{...} },
  //         EMP2: { },
  //         _holiday:{ name:'Reformationstag' }
  //     },
  //     '2025-11-01': { ... }
  //   }
  //
  // persistMonthPlan() splittet täglich nach Monat.
  // --------------------------------------------------------

  plan: {
    days: {}, // ISO -> per-day, per-employee, per-hour
    notes: [], // [{ weekStart, text }]
    holidays: [],
    absences: [], // { employeeId, type, start, end, note }
  },
};
