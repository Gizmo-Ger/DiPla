// ==========================================================
// File: controls.js (FINAL v3.2.2)
// Purpose: Navigation, Workflow, Monats-Autofill, UI-Refresh
// Optimiert mit Debounce & stabiler Render-Pipeline
// ==========================================================

import { state } from '../core/state.js';
import { D } from '../core/diagnostics.js';
import { confirmChoice, toast, popup } from '../core/popup.js';
import { runPlanLogic } from '../logic/controller.js';
import { runPostReleaseNotifications } from '../core/notifications.js';

import { renderPlan } from './plan.js';
import {
  approvePlan,
  revokeApproval,
  markPlanModified,
} from '../core/plan-status.js';

import {
  getWeekNumber,
  getWeekRangeFromDate,
  getLocalMondayOfISOWeek,
  getISOWeekYear,
  formatDate,
  toIso,
} from '../misc/datetime.js';

import { openSettingsModal } from './settings-modal.js';
import { autofillMonthPlan } from '../core/autofill.js';
import { persistMonthPlan } from '../core/persist.js';
import { emit } from '../core/events.js';
import { initLegend } from './legend.js';
import { showInfo } from './info.js';

// ==========================================================
// DEBOUNCE
// ==========================================================
const debounce = (fn, delay = 120) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// ==========================================================
// INIT
// ==========================================================
export function initControls() {
  D.separator('UI CONTROLS INIT');

  const container = document.getElementById('controls-row');
  if (!container) {
    D.error('ui-controls', '#controls-row nicht gefunden');
    return;
  }
  
  if (!(state.activeWeekStart instanceof Date)) {
  D.error('ui-controls', 'activeWeekStart fehlt – bootstrap nicht korrekt?');
  return;
  }
  // Initiales HTML-Gerüst
  if (!container.querySelector('#week-display')) {
    container.innerHTML = `
      <div class="tabs-container">
        ${['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
          .map(
            (d) => `<button class="tab-button" data-day="${d}">${d}</button>`
          )
          .join('')}
      </div>

      <div class="controls-center">
        <button id="btn-prev-week" title="Vorherige Woche">◀</button>
        <span id="week-display" class="week-display"></span>
        <button id="btn-next-week" title="Nächste Woche">▶</button>
        <button id="btn-today" title="Heute">Heute</button>
      </div>

      <div class="controls-right">
        <select id="role-select" title="Rolle auswählen"></select>
        <select id="month-select" title="Monat auswählen"></select>
        <select id="year-select" title="Jahr auswählen"></select>

        <button id="btn-load-template" title="Vorlage laden">📄</button>
        <button id="btn-validate-plan" title="Plan prüfen">🔍</button>
        <button id="btn-approve-plan" title="Plan freigeben">🔒</button>

        <button id="btn-settings" title="Einstellungen">⚙</button>
        <button id="btn-info" title="Informationen">ℹ</button>
      </div>
    `;
  }

  // Initialzustand
  

  _populateRoleDropdown();
  _populateDateDropdowns(state.activeWeekStart);
  _updateLoadButtonLabel();

  
  _updateWeekDisplay(state.activeWeekStart);
  _updateTabTooltips(state.activeWeekStart);
  _setActiveTab(state.activeDay);

  _bindEvents(container);

  // Externe Settings → UI refresh
  document.addEventListener('settings-saved', () => {
    _populateRoleDropdown();
    _refreshActiveWeek();
  });

  document.addEventListener('plan-save-success', () => {
    D.debug('ui-controls', 'plan-save-success → refresh active week');
    _refreshActiveWeek();
  });

  // ----------------------------------------------------------
  // PLAN-MODIFIED: Status + Logic Live-Recheck
  // ----------------------------------------------------------
  const debouncedLogicUpdate = debounce(() => {
    const findings = runPlanLogic();
    if (findings) {
      popup.updateLogic(findings);
    }
    initLegend();
  }, 120);

  document.addEventListener('plan-status-changed', (e) => {
    D.debug('ui-controls', 'plan-status-changed empfangen', e.detail);

    _updateButtonsByPlanStatus();
    initLegend();
  });

  document.addEventListener('plan-modified', (e) => {
    const source = e?.detail?.source;

    // ❗ Notes sind rein informativ
    if (source === 'notes') {
      D.debug('ui-controls', 'plan-modified ignoriert (notes)');
      return;
    }

    markPlanModified(source || 'ui');
    _updateButtonsByPlanStatus();
    debouncedLogicUpdate();
  });

  // Initialer UI-Refresh
  _refreshActiveWeek();
}

// ==========================================================
// EVENT-BINDING
// ==========================================================
function _bindEvents(container) {
  const roleSelect = document.getElementById('role-select');
  const prevBtn = document.getElementById('btn-prev-week');
  const nextBtn = document.getElementById('btn-next-week');
  const todayBtn = document.getElementById('btn-today');
  const yearSelect = document.getElementById('year-select');
  const monthSelect = document.getElementById('month-select');
  const settingsBtn = document.getElementById('btn-settings');
  const infoBtn = document.getElementById('btn-info');

  roleSelect?.addEventListener('change', (e) => {
    state.selectedRole = e.target.value || '';
  });

  prevBtn?.addEventListener('click', () => _shiftWeek(-1));
  nextBtn?.addEventListener('click', () => _shiftWeek(1));
  todayBtn?.addEventListener('click', () => _goToToday());

  const debouncedMonthYearChange = debounce(() => {
    _updateLoadButtonLabel();
    _onYearOrMonthChange();
  }, 80);

  yearSelect?.addEventListener('change', debouncedMonthYearChange);
  monthSelect?.addEventListener('change', debouncedMonthYearChange);

  [...container.querySelectorAll('.tab-button')].forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const dayName = e.currentTarget.dataset.day;
      state.activeDay = dayName;
      _setActiveTab(dayName);
      _refreshActiveWeek();
    });
  });

  settingsBtn?.addEventListener('click', openSettingsModal);

  infoBtn?.addEventListener('click', () => {
    showInfo();
  });

  _bindWorkflowButtons();
}

// ==========================================================
// HEUTE
// ==========================================================
function _goToToday() {
  const today = new Date();
  const monday = getLocalMondayOfISOWeek(
    getISOWeekYear(today),
    getWeekNumber(today)
  );

  const dayNames = [
    'Sonntag',
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
  ];

  let todayName = dayNames[today.getDay()];
  if (todayName === 'Sonntag') todayName = 'Montag';

  state.activeWeekStart = monday;
  state.activeDay = todayName;

  _refreshActiveWeek();
  _populateDateDropdowns(monday);
  _updateLoadButtonLabel();
  _updateWeekDisplay(monday);
  _updateTabTooltips(monday);
  _setActiveTab(todayName);
}

// ==========================================================
// WOCHE SHIFTEN
// ==========================================================
function _shiftWeek(offset) {
  const base = new Date(state.activeWeekStart);
  base.setDate(base.getDate() + offset * 7);

  state.activeWeekStart = base;

  _refreshActiveWeek();
  _populateDateDropdowns(base);
  _updateLoadButtonLabel();
  _updateWeekDisplay(base);
  _updateTabTooltips(base);
}

// ==========================================================
// MONAT/Jahr Change
// ==========================================================
function _onYearOrMonthChange() {
  const y = Number(document.getElementById('year-select')?.value);
  const m = Number(document.getElementById('month-select')?.value);

  const monday = _getFirstMondayOfMonth(y, m);

  state.activeWeekStart = monday;
  state.activeDay = state.activeDay || 'Montag';

  _refreshActiveWeek();
  _updateWeekDisplay(monday);
  _updateTabTooltips(monday);
  _setActiveTab(state.activeDay);
}

function _getFirstMondayOfMonth(year, month) {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ==========================================================
// WOCHE REFRESHEN (debounced)
// ==========================================================
const _refreshActiveWeek = debounce(async () => {
  try {
    const ws = new Date(state.activeWeekStart);

    await renderPlan(ws);
    _updateButtonsByPlanStatus();

    // LOGIC: Woche gewechselt → Findings neu berechnen
    // updateLogic() rendert nur, wenn Popup offen ist (Guard in popup.js)
    // ----------------------------------------------------------
    const findings = runPlanLogic();
    if (findings) popup.updateLogic(findings);
    initLegend();

    const { start, end } = getWeekRangeFromDate(ws);

    D.debug('ui-controls', 'Woche aktualisiert', {
      weekStart: toIso(start),
      weekEnd: toIso(end),
      activeDay: state.activeDay,
    });
  } catch (err) {
    D.error('ui-controls', 'Fehler _refreshActiveWeek()', err);
  }
}, 40);

// ==========================================================
// WORKFLOW: MONATS-AUTOFILL (vereinfachtes Popup via confirm)
// ==========================================================
function _bindWorkflowButtons() {
  const btnLoad = document.getElementById('btn-load-template');
  const btnCheck = document.getElementById('btn-validate-plan');
  const btnAppr = document.getElementById('btn-approve-plan');

  // MONATS-AUTOFILL
  btnLoad?.addEventListener('click', async () => {
    try {
      const y = Number(document.getElementById('year-select')?.value);
      const m = Number(document.getElementById('month-select')?.value);

      if (!y || !m) {
        alert('Bitte Jahr und Monat auswählen.');
        return;
      }

      // Plan vorbereiten
      if (!state.plan || typeof state.plan !== 'object') {
        state.plan = {
          year: y,
          month: m,
          days: {},
          notes: [],
          holidays: [],
          absences: [],
        };
      } else {
        state.plan.year = y;
        state.plan.month = m;
      }

      // ------------------------------------------------------------------
      // EINFACHES, SICHERES POPUP:
      // Monat komplett leeren? JA → reset, NEIN → nur ergänzen
      // ------------------------------------------------------------------
      const action = await confirmChoice(
        `Monat ${m}/${y} laden.\n\nWie soll vorgegangen werden?`,
        [
          {
            label: 'Komplett ersetzen',
            value: 'reset',
          },
          {
            label: 'Ergänzen',
            value: 'append',
          },
          {
            label: 'Abbrechen',
            value: 'cancel',
          },
        ],
        {
          type: 'warn',
        }
      );

      if (action === 'cancel') {
        toast('Vorgang abgebrochen', {
          type: 'info',
        });
        return;
      }

      if (action === 'reset') {
        state.plan.days = {};
        D.info('ui-controls', 'Monat komplett geleert', {
          y,
          m,
        });
      } else {
        D.info('ui-controls', 'Monat wird ergänzt', {
          y,
          m,
        });
      }

      // MONATS-AUTOFILL (ergänzt nur freie Slots)
      await autofillMonthPlan(y, m, state.settings, state.plan);
      markPlanModified('controls-autofill');

      // Erste Woche bestimmen
      const first = new Date(y, m - 1, 1);
      while (first.getDay() !== 1) first.setDate(first.getDate() + 1);
      state.activeWeekStart = first;

      // Speichern + Render
      await persistMonthPlan();
      emit('plan-modified', {
        source: 'controls-autofill',
      });
      await renderPlan(first);

      // UI aktualisieren
      _updateWeekDisplay(first);
      _updateTabTooltips(first);
      _setActiveTab(state.activeDay);
      _updateButtonsByPlanStatus();
      _updateLoadButtonLabel();

      D.info('ui-controls', 'Monats-Autofill abgeschlossen', {
        y,
        m,
      });
    } catch (err) {
      D.error('ui-controls', 'Fehler beim Monats-Autofill', err);
      alert('Fehler beim Monats-Autofill.');
    }
  });

  // VALIDIEREN
  btnCheck?.addEventListener('click', () => {
    const findingsWeek = runPlanLogic();

    if (!findingsWeek) {
      toast('Planlogik konnte nicht ausgeführt werden', {
        type: 'error',
      });
      return;
    }

    popup.logic(findingsWeek, {
      draggable: true,
      onSelect: (finding) => {
        // Vorbereitung für später:
        // Tag / Slot fokussieren
        // z.B.:
        // state.activeDay = ...
        // state.activeWeekStart = ...
        // emit('focus-slot', finding.scope)
      },
    });

    // UI reagiert explizit auf neues Logic-Ergebnis
    _updateButtonsByPlanStatus();
  });

  // FREIGEBEN
  btnAppr?.addEventListener('click', async () => {
    const findings = state.logic?.findingsWeek;

    if (!findings) {
      toast('Plan muss zuerst geprüft werden', {
        type: 'warn',
      });
      return;
    }

    if (state.plan.status === 'approved') {
      revokeApproval('manual');
      await persistMonthPlan();
      _updateButtonsByPlanStatus();
      initLegend();

      toast('Freigabe aufgehoben', {
        type: 'info',
      });
      return;
    }

    const ok = approvePlan(findings.summary);
    if (!ok) {
      toast('Freigabe nicht möglich – Fehler im Plan', {
        type: 'error',
      });
      return;
    }

      // 1) Status approved speichern
    await persistMonthPlan();

    // 2) Post-Release Notifications
    const changed = await runPostReleaseNotifications(state.plan, state.settings);

    // 3) Nur speichern, wenn Notes ergänzt wurden
    if (changed) {
      await persistMonthPlan();
    }

    _updateButtonsByPlanStatus();
    initLegend();

    toast('Plan freigegeben', { type: 'success' });
  });
}

// ==========================================================
// BUTTON-STATUS
// ==========================================================
function _updateButtonsByPlanStatus() {
  const loadBtn = document.getElementById('btn-load-template');
  const checkBtn = document.getElementById('btn-validate-plan');
  const apprBtn = document.getElementById('btn-approve-plan');

  if (!loadBtn || !checkBtn || !apprBtn) return;

  const status = state.plan?.status || 'empty';
  const findings = state.logic?.findingsWeek || null;

  // --------------------------------------------------
  // Defaults
  // --------------------------------------------------
  loadBtn.disabled = false;
  checkBtn.disabled = true;
  apprBtn.disabled = true;

  apprBtn.classList.remove('approved');
  apprBtn.title = 'Plan freigeben';

  // --------------------------------------------------
  // EMPTY
  // --------------------------------------------------
  if (status === 'empty') {
    checkBtn.disabled = true;
    apprBtn.disabled = true;

    D.debug('ui-controls', 'Buttons: Status EMPTY');
    return;
  }

  // --------------------------------------------------
  // DRAFT
  // --------------------------------------------------
  if (status === 'draft') {
    checkBtn.disabled = false;

    if (findings && findings.summary?.errorCount === 0) {
      apprBtn.disabled = false;
      apprBtn.title = 'Plan freigeben';
    } else {
      apprBtn.disabled = true;
      apprBtn.title = 'Freigabe erst nach fehlerfreier Prüfung möglich';
    }

    D.debug('ui-controls', 'Buttons: Status DRAFT', {
      errors: findings?.summary?.errorCount ?? 'n/a',
    });
    return;
  }

  // --------------------------------------------------
  // APPROVED
  // --------------------------------------------------
  if (status === 'approved') {
    checkBtn.disabled = false;
    apprBtn.disabled = false;

    apprBtn.classList.add('approved');
    apprBtn.title = 'Freigabe aufheben';

    D.debug('ui-controls', 'Buttons: Status APPROVED');
  }
}

// ==========================================================
// DROPDOWNS
// ==========================================================
function _populateRoleDropdown() {
  const el = document.getElementById('role-select');
  if (!el) return;

  const rolesObj = state.settings?.roles || {};

  const roles = Object.entries(rolesObj)
    .filter(([_, cfg]) => cfg?.functional === true)
    .map(([name]) => name);

  const current = state.selectedRole || '';

  el.innerHTML = [
    `<option value="">Rolle auswählen</option>`,
    ...roles.map((r) => `<option value="${r}">${r}</option>`),
  ].join('');

  if (current && roles.includes(current)) {
    el.value = current;
  } else {
    el.value = '';
    state.selectedRole = '';
  }
}

function _populateDateDropdowns(refDate) {
  const yearEl = document.getElementById('year-select');
  const monthEl = document.getElementById('month-select');
  if (!yearEl || !monthEl) return;

  const y = refDate.getFullYear();
  const m = refDate.getMonth() + 1;

  yearEl.innerHTML = Array.from(
    {
      length: 11,
    },
    (_, i) => {
      const yy = 2020 + i;
      return `<option value="${yy}" ${yy === y ? 'selected' : ''}>${yy}</option>`;
    }
  ).join('');

  const MONTH_NAMES = [
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

  monthEl.innerHTML = MONTH_NAMES.map((name, idx) => {
    const mm = idx + 1;
    return `<option value="${mm}" ${mm === m ? 'selected' : ''}>${name}</option>`;
  }).join('');
}

// ==========================================================
// LOAD BUTTON LABEL
// ==========================================================
function _updateLoadButtonLabel() {
  const btn = document.getElementById('btn-load-template');
  const yearEl = document.getElementById('year-select');
  const monthEl = document.getElementById('month-select');

  if (!btn || !yearEl || !monthEl) return;

  const y = Number(yearEl.value);
  const m = Number(monthEl.value);

  const MONTH_NAMES = [
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

  btn.textContent = `📄 Monat laden: ${MONTH_NAMES[m - 1]} ${y}`;
}

// ==========================================================
// WEEK DISPLAY
// ==========================================================
function _updateWeekDisplay(refDate) {
  const el = document.getElementById('week-display');
  if (!el) return;

  const { start, end } = getWeekRangeFromDate(refDate);
  el.textContent = `KW ${getWeekNumber(refDate)}: ${formatDate(start)} – ${formatDate(end)}`;
}

// ==========================================================
// TOOLTIP
// ==========================================================
function _updateTabTooltips(refDate) {
  const { start } = getWeekRangeFromDate(refDate);
  const days = [
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
  ];

  days.forEach((d, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    const btn = document.querySelector(`.tab-button[data-day="${d}"]`);
    if (btn) btn.title = `${d} – ${formatDate(date)}`;
  });
}

// ==========================================================
// AKTIVER TAB
// ==========================================================
function _setActiveTab(dayName) {
  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.day === dayName);
  });
}
