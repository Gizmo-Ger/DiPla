// ==========================================================
// File: plan.js (FINAL – workflow-kompatibel, stabil, draft-aware)
// ==========================================================

import { state } from '../core/state.js';
import { D } from '../core/diagnostics.js';

import { loadMonthPlan } from '../core/persist.js';
import { applyHolidaysToPlan } from '../core/holidays.js';
import { applyAbsenceToPlan } from '../core/absence.js';
import { updateNotesBox } from './notes.js';

import {
  getWeekRangeFromDate,
  getWeekNumber,
  getDayIndex,
  buildHourSlots,
  toIso,
} from '../misc/datetime.js';

import { DragService } from './drag.js';

if (!window.dragService) {
  window.dragService = new DragService();
}

// ----------------------------------------------------------
// Status-Merge-Priorität: empty < approved < draft
// ----------------------------------------------------------
function normalizeStatus(st) {
  if (st === 'draft' || st === 'approved' || st === 'empty') return st;
  return 'empty';
}

function mergeStatus(a, b) {
  const order = { empty: 0, approved: 1, draft: 2 };
  const na = normalizeStatus(a);
  const nb = normalizeStatus(b);
  return order[na] >= order[nb] ? na : nb;
}

// ----------------------------------------------------------
// Plan rendern
// ----------------------------------------------------------
export async function renderPlan(refDate = new Date()) {
  try {
    const table = document.getElementById('plan-table');
    if (!table) throw new Error('plan-table nicht gefunden');

    const { start, end } = getWeekRangeFromDate(refDate);
    const isoStart = toIso(start);
    const isoEnd = toIso(end);

    state.activeWeekStart = start;

    // betroffene Monate
    const months = new Set([
      `${start.getFullYear()}-${start.getMonth() + 1}`,
      `${end.getFullYear()}-${end.getMonth() + 1}`,
    ]);

    // Basis für Merge
    let merged = {
      year: start.getFullYear(),
      month: start.getMonth() + 1,
      status: 'empty',
      days: {},
      notes: [],
      holidays: [],
      absences: [],
    };

    // Monat(e) laden & mergen
    for (const key of months) {
      const [y, m] = key.split('-').map(Number);
      const plan = await loadMonthPlan(y, m);
      merged = mergePlans(merged, plan);
    }

    // finaler Plan
    state.plan = merged;

    // ----------------------------------------------------------
    // Feiertage & Abwesenheiten der Woche einblenden
    // ----------------------------------------------------------
    applyHolidaysToPlan(state.plan, isoStart, isoEnd);
    applyAbsenceToPlan(state.plan, isoStart, isoEnd);

    // ----------------------------------------------------------
    // Rendering vorbereiten
    // ----------------------------------------------------------
    const staff = (state.settings?.staff || [])
      .filter((s) => !s.deprecated)
      .sort((a, b) => {
        const da = staffSortIndex(a);
        const db = staffSortIndex(b);
        if (da !== db) return da - db;
        return (a.id || '').localeCompare(b.id || '');
      });

    const hours = buildHourSlots(state.settings);

    const activeDay = state.activeDay || 'Montag';
    const dayIndex = getDayIndex(activeDay);

    const activeDate = new Date(start);
    activeDate.setDate(start.getDate() + dayIndex);
    const activeIso = toIso(activeDate);

    const dayMeta = state.plan.days?.[activeIso] || {};

    const roles = state.settings.roles || {};
    const roleColor = (r) => roles?.[r]?.color || '';
    const isNF = (r) => roles?.[r] && roles[r].functional === false;

    table.innerHTML = '';

    // ----------------------------------------------------------
    // HEAD
    // ----------------------------------------------------------
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');

    addTh(hr, 'Zeit');
    for (const emp of staff) addTh(hr, emp.id);

    thead.appendChild(hr);
    table.appendChild(thead);

    // ----------------------------------------------------------
    // BODY
    // ----------------------------------------------------------
    const tbody = document.createElement('tbody');

    hours.forEach((hourLabel, rowIndex) => {
      const tr = document.createElement('tr');
      addTd(tr, hourLabel);

      for (const emp of staff) {
        const td = document.createElement('td');
        td.classList.add('time-cell');

        td.dataset.row = rowIndex;
        td.dataset.employeeId = emp.id;
        td.dataset.day = activeDay;
        td.dataset.hour = hourLabel;
        td.dataset.date = activeIso;

        const empData = dayMeta[emp.id] || {};

        const abs = empData._absence || null;
        const hol = empData._holiday || null;

        let displayRole = null;
        let bg = '';
        const classes = ['time-cell'];

        // 1) Abwesenheit blockiert
        if (abs) {
          displayRole = abs.type;
          bg = roleColor(displayRole);
          classes.push('absence-cell', 'locked-role');

          // 2) Feiertag / Brückentag
        } else if (hol) {
          displayRole = hol.role || 'Feiertag';
          bg = roleColor(displayRole) || '#ddd';
          classes.push('holiday-cell', 'locked-role');

          // 3) normale Rolle
        } else {
          const saved = empData[hourLabel] || null;
          if (saved) {
            displayRole = saved;
            bg = roleColor(saved);
            if (isNF(saved)) classes.push('locked-role');
          }
        }

        if (displayRole) {
          td.dataset.role = displayRole;
          if (bg) td.style.backgroundColor = bg;
        }

        classes.forEach((c) => td.classList.add(c));
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    // Drag & Drop aktivieren
    window.dragService.initialize(table);

    // Wochen-Notizen aktualisieren
    updateNotesBox(refDate);

    // UI informieren
    document.dispatchEvent(
      new CustomEvent('plan-rendered', {
        detail: { refDate, weekStart: isoStart, weekEnd: isoEnd, activeIso },
      })
    );

    D.info('ui-plan', 'Plan gerendert', {
      week: getWeekNumber(refDate),
      activeIso,
      status: state.plan.status,
    });
  } catch (err) {
    D.error('ui-plan', 'Fehler in renderPlan()', err);
  }
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------
function addTh(tr, text) {
  const th = document.createElement('th');
  th.textContent = text;
  tr.appendChild(th);
}

function addTd(tr, text) {
  const td = document.createElement('td');
  td.textContent = text;
  tr.appendChild(td);
}

const ROLE_ORDER = [
  'Arzt',
  'Abrechnung',
  'Anmeldung',
  'Assistenz',
  'Prophylaxe',
];

function staffSortIndex(emp) {
  const role = String(emp.primaryRole || '').trim();
  const idx = ROLE_ORDER.indexOf(role);
  return idx === -1 ? 999 : idx;
}

// ----------------------------------------------------------
// Merge zweier Pläne
// ----------------------------------------------------------
function mergePlans(a, b) {
  const mergedStatus = mergeStatus(a.status, b.status);

  D.debug('ui-plan', 'Planstatus gemerged', {
    a: a.status,
    b: b.status,
    result: mergedStatus,
  });

  const days = { ...(a.days || {}) };

  Object.entries(b.days || {}).forEach(([iso, data]) => {
    days[iso] = {
      ...(days[iso] || {}),
      ...data,
    };
  });

  return {
    year: b.year ?? a.year,
    month: b.month ?? a.month,
    status: mergedStatus,
    days,
    notes: [...(a.notes || []), ...(b.notes || [])],
    holidays: [...(a.holidays || []), ...(b.holidays || [])],
    absences: [...(a.absences || []), ...(b.absences || [])],
  };
}
