// ============================================================================
// viewer.js – Read-Only Mitarbeiter-Viewer (Mo–Sa, final)
// ============================================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';
import { initLogout } from '/js/core/logout.js';
import { loadSettings, loadMonthPlan } from '/js/core/persist.js';
import { applyHolidaysToPlan } from '/js/core/holidays.js';
import { applyAbsenceToPlan } from '/js/core/absence.js';

import {
  getWeeksForMonth,
  buildHourSlots,
  formatDate,
  toIso,
} from '/js/misc/datetime.js';

document.addEventListener('DOMContentLoaded', async () => {
  await waitForAuth();
  initViewer();
});

// ============================================================================
// Auth-Wait
// ============================================================================

function waitForAuth() {
  return new Promise((resolve) => {
    if (window.AUTH_USER) return resolve();
    const i = setInterval(() => {
      if (window.AUTH_USER) {
        clearInterval(i);
        resolve();
      }
    }, 10);
  });
}

// ============================================================================
// Viewer Notes Filter
// ============================================================================

function getViewerNotesForWeek(plan, weekStartIso, employeeId) {
  if (!Array.isArray(plan.notes)) return [];

  return plan.notes.filter((n) => {
    if (n.weekStart !== weekStartIso) return false;

    // Systemnotes → immer sichtbar
    if (n.source === 'system') return true;

    // Öffentliche User-Notes
    if (n.visibility === 'public') return true;

    // Private Notes → nur für Empfänger
    if (
      n.visibility === 'private' &&
      Array.isArray(n.recipients) &&
      n.recipients.includes(employeeId)
    ) {
      return true;
    }

    return false;
  });
}

// ============================================================================
// INIT
// ============================================================================
async function initViewer() {
  // --------------------------------------------------------------------------
  // 1) Settings laden
  // --------------------------------------------------------------------------
  await loadSettings();

  // --------------------------------------------------------------------------
  // 2) Auth-User ermitteln
  // --------------------------------------------------------------------------
  const empId = window.AUTH_USER?.user;
  if (!empId) {
    D.error('viewer/init', 'AUTH_USER fehlt');
    return;
  }

  state.viewerEmployee = empId;

  // --------------------------------------------------------------------------
  // 3) Mitarbeiterdaten aus settings holen
  // --------------------------------------------------------------------------
  const staff = state.settings?.staff || [];
  const emp = staff.find((e) => e.id === empId);

  let displayName = empId;
  if (emp) {
    displayName =
      emp.firstName && emp.lastName
        ? `${emp.firstName} ${emp.lastName}`
        : emp.firstName || emp.lastName || empId;
  }

  // Anzeige: Name (+ Kürzel), kein Präfix
  const userEl = document.getElementById('vw-username');
  if (userEl) {
    userEl.textContent =
      displayName !== empId ? `${displayName} (${empId})` : empId;
  }

  // --------------------------------------------------------------------------
  // 4) Print-Button
  // --------------------------------------------------------------------------
  const printBtn = document.getElementById('vw-print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  // --------------------------------------------------------------------------
  // 5) Logout + UI initialisieren
  // --------------------------------------------------------------------------
  initLogout();
  initDropdowns();
  await renderSelection();
}

// ============================================================================
// DROPDOWNS
// ============================================================================
function initDropdowns() {
  const yearSel = document.getElementById('vw-year');
  const monthSel = document.getElementById('vw-month');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Jahre
  for (let y = currentYear - 1; y <= currentYear + 2; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    yearSel.appendChild(opt);
  }

  // Monate
  const months = [
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

  months.forEach((name, idx) => {
    const m = idx + 1;
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = name;
    if (m === currentMonth) opt.selected = true;
    monthSel.appendChild(opt);
  });

  yearSel.addEventListener('change', renderSelection);
  monthSel.addEventListener('change', renderSelection);
}

// ============================================================================
// RENDER ENTRYPOINT
// ============================================================================
async function renderSelection() {
  const year = Number(document.getElementById('vw-year').value);
  const month = Number(document.getElementById('vw-month').value);

  state.viewerYear = year;
  state.viewerMonth = month;

  const plan = await loadMonthPlan(year, month);
  state.plan = plan;

  await renderViewerMonth(year, month, plan);
}

// ============================================================================
// MONATS-VIEW (Mo–Sa)
// ============================================================================
async function renderViewerMonth(year, month, plan) {
  const container = document.getElementById('vw-content');
  if (!container) {
    D.error('viewer/render', 'vw-content fehlt');
    return;
  }

  container.innerHTML = '';

  const weeks = getWeeksForMonth(year, month);
  const employeeId = state.viewerEmployee;
  const hours = buildHourSlots(state.settings);

  const roles = state.settings.roles || {};
  const roleColor = (r) => roles?.[r]?.color || '';

  for (const w of weeks) {
    const weekStart = w.weekStartDate;
    const weekEnd = w.weekEndDate;

    const weekStartIso = w.weekStartIso;
    const weekEndIso = w.weekEndIso;
    const isoWeek = w.isoWeek;

    applyHolidaysToPlan(plan, weekStartIso, weekEndIso);
    applyAbsenceToPlan(plan, weekStartIso, weekEndIso);

    const viewerNotes = getViewerNotesForWeek(plan, weekStartIso, employeeId);

    const notesText = viewerNotes
      .slice()
      .sort((a, b) => {
        if (a.source === b.source) return 0;
        return a.source === 'system' ? -1 : 1;
      })
      .map((n) => (n.source === 'system' ? `⚠ ${n.text}` : n.text))
      .join(' · ');

    // ----------------------------------------------
    // CARD BLOCK
    // ----------------------------------------------
    const card = document.createElement('div');
    card.className = 'vw-week-card';

    card.addEventListener('mouseenter', () => card.classList.add('hover'));
    card.addEventListener('mouseleave', () => card.classList.remove('hover'));

    // ----------------------------------------------
    // HEADER
    // ----------------------------------------------
    const header = document.createElement('div');
    header.className = 'vw-week-header';
    header.textContent = `KW ${isoWeek}` + (notesText ? ` – ${notesText}` : '');
    card.appendChild(header);

    // ----------------------------------------------
    // TABLE
    // ----------------------------------------------
    const table = document.createElement('table');
    table.className = 'vw-week-table';

    // COLGROUP: Zeit + 6 Tage
    const colgroup = document.createElement('colgroup');

    const colTime = document.createElement('col');
    colTime.style.width = '48px';
    colgroup.appendChild(colTime);

    for (let i = 0; i < 6; i++) {
      colgroup.appendChild(document.createElement('col'));
    }

    table.appendChild(colgroup);

    // TABLE HEAD (Mo–Sa)
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.className = 'time-label';
    hr.appendChild(thTime);

    const weekDays = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(weekStart.getTime());
      d.setDate(d.getDate() + i);
      weekDays.push({
        dateObj: d,
        iso: toIso(d),
      });
    }

    weekDays.forEach((d) => {
      const th = document.createElement('th');
      th.className = 'vw-day-header';

      th.textContent = d.dateObj.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      });

      if (d.dateObj.getMonth() + 1 !== month) {
        th.classList.add('outside-month');
      }

      hr.appendChild(th);
    });

    thead.appendChild(hr);
    table.appendChild(thead);

    // TABLE BODY
    const tbody = document.createElement('tbody');

    for (const hourLabel of hours) {
      const tr = document.createElement('tr');

      const tdTime = document.createElement('td');
      tdTime.className = 'time-label';
      tdTime.textContent = hourLabel;
      tr.appendChild(tdTime);

      for (const day of weekDays) {
        const iso = day.iso;
        const cell = document.createElement('td');
        cell.className = 'time-cell';

        const empData = plan.days?.[iso]?.[employeeId] || {};
        const abs = empData._absence || null;
        const hol = empData._holiday || null;

        let roleId = null;
        let tooltip = '';

        if (abs) {
          roleId = abs.type;
          tooltip =
            `Abwesenheit: ${abs.type}` + (abs.note ? ` – ${abs.note}` : '');
        } else if (hol) {
          roleId = hol.role || 'Feiertag';
          const kind = hol.type === 'bridgeday' ? 'Brückentag' : 'Feiertag';
          tooltip = `${kind}: ${hol.name}`;
        } else if (empData[hourLabel]) {
          roleId = empData[hourLabel];
          tooltip = `Rolle: ${roleId}`;
        }

        if (roleId) {
          const col = roleColor(roleId);
          if (col) cell.style.backgroundColor = col;
          cell.dataset.role = roleId;
        }

        if (tooltip) {
          cell.setAttribute('data-tip', tooltip);
        }

        if (day.dateObj.getMonth() + 1 !== month) {
          cell.classList.add('outside-month');
        }

        tr.appendChild(cell);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    // COMPLETE CARD
    card.appendChild(table);
    container.appendChild(card);
  }

  renderLegend();
}

// ============================================================================
// LEGENDE
// ============================================================================
function renderLegend() {
  const legend = document.getElementById('vw-legend');
  if (!legend) return;

  legend.innerHTML = '';

  const roles = state.settings?.roles || {};

  Object.entries(roles).forEach(([id, r]) => {
    const item = document.createElement('div');
    item.className = 'vw-legend-item';

    const color = document.createElement('span');
    color.className = 'vw-legend-color';
    color.style.backgroundColor = r.color || '#ccc';

    const label = document.createElement('span');
    label.textContent = id;

    item.appendChild(color);
    item.appendChild(label);
    legend.appendChild(item);
  });
}

// ============================================================================
// MOBILE PHONE HANDLING (LANDSCAPE ONLY)
// ============================================================================
function enforcePhoneLandscape() {
  const isPhone = window.innerWidth <= 767;
  const isLandscape = window.matchMedia('(orientation: landscape)').matches;

  document.body.classList.toggle('vw-phone-rotate', isPhone && !isLandscape);
}

window.addEventListener('resize', enforcePhoneLandscape);
window.addEventListener('orientationchange', enforcePhoneLandscape);
document.addEventListener('DOMContentLoaded', enforcePhoneLandscape);
