// ==========================================================
// File: bootstrap.js (Phase 1.4 – Final Clean Version)
// Central initialization of all modules
// ==========================================================

// ----------------------------------------------------------
// AUTH / SECURITY – MUSS ZUERST
// ----------------------------------------------------------
import '/js/core/auth-guard.js';
import { initLogout } from '/js/core/logout.js';
import { startAdminHeartbeat } from '/js/core/admin-heartbeat.js';

// ----------------------------------------------------------
// CORE
// ----------------------------------------------------------
import { on } from './core/events.js';
import { toast } from './core/popup.js';
import { D } from './core/diagnostics.js';
import { state } from './core/state.js';
import { loadSettings, loadMonthPlan } from './core/persist.js';
import { getWeekNumber,
         getLocalMondayOfISOWeek,
         getISOWeekYear
} from './misc/datetime.js';
import { popup } from '/js/core/popup.js';

window.state = state;
window.popup = popup;

// ----------------------------------------------------------
// Logic Engine
// ----------------------------------------------------------
// import { runLogic } from '/js/logic/engine.js';
import { runPlanLogic } from '/js/logic/controller.js';
import { ensureLogicSettings } from '/js/logic/init.js';

// ----------------------------------------------------------
// UI
// ----------------------------------------------------------
import { initHeader } from './ui/header.js';
import { initControls } from './ui/controls.js';
import { initLegend } from './ui/legend.js';
import { initNotesBox, updateNotesBox } from './ui/notes.js';
import { renderPlan } from './ui/plan.js';
import { initSettingsModal } from './ui/settings-modal.js';
import { initDebugPanel } from './ui/debug.js';

// -----------------------------------------------------------
// MAIN BOOTSTRAP
// -----------------------------------------------------------
if (window.matchMedia('(pointer: coarse)').matches) {
  throw new Error('Bootstrap aborted on touch device');
}

document.addEventListener('DOMContentLoaded', bootstrap);

export async function bootstrap() {
  D.separator('BOOTSTRAP START');

  try {
    // -------------------------------------------------------
    // 0) Logout-Button initialisieren (Header existiert bereits)
    // -------------------------------------------------------
    initLogout();

    // -------------------------------------------------------
    // 1) Basisdatum setzen
    // -------------------------------------------------------
    const today = new Date();

// ISO-Montag der aktuellen Woche
const monday = getLocalMondayOfISOWeek(
  getISOWeekYear(today),
  getWeekNumber(today)
);

// Aktiven Wochenstart setzen
state.activeWeekStart = monday;

// Aktiven Tag setzen
const DAY_NAMES = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

let dayName = DAY_NAMES[today.getDay()];
if (dayName === 'Sonntag') dayName = 'Montag';

state.activeDay = dayName;

// Kalenderkontext (für Monatsplan etc.)
state.currentYear = today.getFullYear();
state.currentMonth = today.getMonth() + 1;

    // -------------------------------------------------------
    // 2) Settings laden
    // -------------------------------------------------------
    await loadSettings();
    if (!state.settings?.staff?.length) {
      throw new Error('Settings: keine Mitarbeiterdaten vorhanden');
    }
    if (state?.user?.isAdmin === true) {
      startAdminHeartbeat();
    }
    ensureLogicSettings(state);

    // -------------------------------------------------------
    // 3) Monatsplan laden
    // -------------------------------------------------------
    await loadMonthPlan(state.currentYear, state.currentMonth);

    // -------------------------------------------------------
    // 4) UI initialisieren
    // -------------------------------------------------------
    initHeader();
    initControls(); // setzt activeWeekStart & Tabs
    initNotesBox();
    await initSettingsModal();
    initDebugPanel();

    // -------------------------------------------------------
    // SAVE STATUS INDICATOR (global)
    // -------------------------------------------------------
    on('plan-save-start', () => {
      toast('Speichere Plan …', { type: 'info', duration: 800 });
    });

    on('plan-save-success', (e) => {
      const { month, year } = e.detail || {};
      toast(`Plan ${month}/${year} gespeichert`, { type: 'success' });
    });

    on('plan-save-error', () => {
      toast('Fehler beim Speichern des Plans', {
        type: 'error',
        duration: 4000,
      });
    });

    // -------------------------------------------------------
    // Logic Engine ausführen
    // -------------------------------------------------------

    runPlanLogic();
    initLegend();

    // -------------------------------------------------------
    // 5) Initialer Render
    // -------------------------------------------------------
    const start =
      state.activeWeekStart instanceof Date ? state.activeWeekStart : now;

    await renderPlan(start);
    updateNotesBox(start);

    D.info('bootstrap', 'System erfolgreich initialisiert');
  } catch (err) {
    D.error('bootstrap', 'Fehler beim Initialstart', err);
  } finally {
    D.separator('BOOTSTRAP ENDE');
  }
}
