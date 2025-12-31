// ==========================================================
// File: js/logic/controller.js
// Purpose: Orchestrierung der Plan-Logik (App-Controller)
// ==========================================================

import { state } from '/js/core/state.js';
import { D } from '/js/core/diagnostics.js';
import { getWeekNumber, getISOWeekYear } from '/js/misc/datetime.js';import { runLogic } from './engine.js';
import { ensureLogicSettings } from './init.js';
import { canApprovePlan, markPlanModified } from '/js/core/plan-status.js';

// ----------------------------------------------------------
// Public API
// ----------------------------------------------------------

export function runPlanLogic() {
  // --------------------------------------------------------
  // Vorbedingungen
  // --------------------------------------------------------
  if (!state.plan) {
    D.warn('logic', 'Kein Plan im State – Logic übersprungen');
    return null;
  }

  if (!state.settings) {
    D.warn('logic', 'Keine Settings im State – Logic übersprungen');
    return null;
  }

  // --------------------------------------------------------
  // 🔒 Logic-Settings initialisieren (einmalig / defensiv)
  // --------------------------------------------------------
  ensureLogicSettings(state);

  if (!state.settings.logic?.rules) {
    D.warn('logic', 'Logic-Regeln fehlen – Logic übersprungen');
    return null;
  }

  // --------------------------------------------------------
  // 🔑 AKTIVER KONTEXT = activeWeekStart
  // --------------------------------------------------------
  if (!(state.activeWeekStart instanceof Date)) {
    D.error(
      'logic',
      'state.activeWeekStart fehlt oder ist ungültig – Logic abgebrochen',
      { activeWeekStart: state.activeWeekStart }
    );
    return null;
  }

  const year = getISOWeekYear(state.activeWeekStart);
  const week = getWeekNumber(state.activeWeekStart);
  const month = state.plan.month;

  if (!Number.isInteger(year) || !Number.isInteger(week)) {
    D.error('logic', 'Ungültiger Logic-Kontext', { year, week });
    return null;
  }

  // --------------------------------------------------------
  // Engine-Aufruf (einziger Einstiegspunkt!)
  // --------------------------------------------------------
  D.debug('logic', 'Starte Planlogik', {
    year,
    month,
    week,
    planStatus: state.plan.status,
  });

  const findingsWeek = runLogic({
    plan: state.plan,
    settings: state.settings,
    context: { year, week },
  });

  // --------------------------------------------------------
  // 🧩 Planstatus: Logic-Ergebnis bewerten
  // --------------------------------------------------------
  if (!canApprovePlan(findingsWeek.summary)) {
    // Logic-Fehler vorhanden → Freigabe ggf. zurücknehmen
    markPlanModified('logic');
    D.debug('logic', 'Plan nicht freigabefähig (Logic)', {
      errorCount: findingsWeek.summary.errorCount,
    });
  }

  // --------------------------------------------------------
  // State initialisieren
  // --------------------------------------------------------
  state.logic ??= {};
  state.logic.findingsWeek = findingsWeek;
  state.logic.findingsByWeek ??= {};

  // --------------------------------------------------------
  // 🧠 Wochenstatus speichern (NEU)
  // --------------------------------------------------------
  const weekKey = `${year}-${String(month).padStart(2, '0')}-W${week}`;

  state.logic.findingsByWeek[weekKey] = {
    approvable: findingsWeek.status.approvable,
    errorCount: findingsWeek.summary.errorCount,
  };

  // --------------------------------------------------------
  // 🟢 Monatsfreigabe berechnen (NEU)
  // --------------------------------------------------------
  state.logic.monthApprovable = isMonthApprovable(
    { year, month },
    state.logic.findingsByWeek
  );

  D.info('logic', 'Planlogik ausgeführt', {
    year,
    month,
    week,
    approvableWeek: findingsWeek.status.approvable,
    approvableMonth: state.logic.monthApprovable,
    errors: findingsWeek.summary.errorCount,
    warnings: findingsWeek.summary.warningCount,
  });

  return findingsWeek;
}

// ----------------------------------------------------------
// Accessor Helpers
// ----------------------------------------------------------

export function getCurrentFindings() {
  return state.logic?.findingsWeek || null;
}

export function clearFindings() {
  if (state.logic) {
    delete state.logic.findingsWeek;
    D.info('logic', 'Findings aus dem State entfernt');
  }
}

// ==========================================================
// Month Approval Helper (NEU)
// ==========================================================

function isMonthApprovable({ year, month }, findingsByWeek) {
  if (!findingsByWeek) return false;

  const prefix = `${year}-${String(month).padStart(2, '0')}-W`;

  const weeks = Object.entries(findingsByWeek)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value);

  if (weeks.length === 0) return false;

  return weeks.every((w) => w.approvable === true);
}
