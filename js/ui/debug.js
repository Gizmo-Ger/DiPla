// ==========================================================
// File: debug.js
// Purpose: Live-Debug-Panel, verschiebbar, state- & plan-aware
// ==========================================================

import { state } from '../core/state.js';
import { D } from '../core/diagnostics.js';
import {
  getWeekNumber,
  getWeekRangeFromDate,
  getDayIndex,
  toIso,
  buildHourSlots,
} from '../misc/datetime.js';

// optional Persist-Internals laden, falls vorhanden
import * as persist from '../core/persist.js';

// Interval-Helfer (Slot <-> Interval)
import { compressEmpDay } from '../core/interval.js';

let panelEl = null;
let toggleBtnEl = null;
let isVisible = false;

let dragOffsetX = 0;
let dragOffsetY = 0;
let isDragging = false;

let lastRenderEvent = null;

// ----------------------------------------------------------
// INIT
// ----------------------------------------------------------
export function initDebugPanel() {
  _ensureToggleButton();
  _ensurePanel();
  _bindDraggable();

  _renderDebug();

  document.addEventListener('plan-rendered', (ev) => {
    lastRenderEvent = ev.detail;
    _renderDebug();
  });

  document.addEventListener('settings-saved', _renderDebug);
  document.addEventListener('notes-updated', _renderDebug);

  document.addEventListener('persist-queued', _renderDebug);
  document.addEventListener('persist-saved', _renderDebug);

  document.addEventListener('drag-start', _renderDebug);
  document.addEventListener('drag-stop', _renderDebug);

  D.info('debug-panel', 'Debug-Panel initialisiert');
}

// ----------------------------------------------------------
// UI
// ----------------------------------------------------------
function _ensureToggleButton() {
  if (toggleBtnEl) return;

  toggleBtnEl = document.createElement('button');
  toggleBtnEl.id = 'debug-toggle-btn';
  toggleBtnEl.type = 'button';
  toggleBtnEl.textContent = 'Debug';

  toggleBtnEl.addEventListener('click', () => {
    isVisible = !isVisible;
    if (panelEl) panelEl.classList.toggle('visible', isVisible);
  });

  document.body.appendChild(toggleBtnEl);
}

function _ensurePanel() {
  if (panelEl) return;

  panelEl = document.createElement('aside');
  panelEl.id = 'debug-panel';

  panelEl.innerHTML = `
    <div class="debug-header">
      <span class="debug-title">Debug-Panel</span>
      <button type="button" id="debug-close-btn" class="debug-close-btn">×</button>
    </div>
    <div id="debug-content" class="debug-content"></div>
  `;

  document.body.appendChild(panelEl);

  panelEl.querySelector('#debug-close-btn').addEventListener('click', () => {
    isVisible = false;
    panelEl.classList.remove('visible');
  });
}

// ----------------------------------------------------------
// Drag-Funktionalität
// ----------------------------------------------------------
function _bindDraggable() {
  const header = panelEl.querySelector('.debug-header');
  if (!header) return;

  header.style.cursor = 'move';

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragOffsetX = e.clientX - panelEl.offsetLeft;
    dragOffsetY = e.clientY - panelEl.offsetTop;
    document.body.classList.add('debug-dragging');
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.classList.remove('debug-dragging');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panelEl.style.left = `${e.clientX - dragOffsetX}px`;
    panelEl.style.top = `${e.clientY - dragOffsetY}px`;
  });
}

// ----------------------------------------------------------
// RENDER PANEL
// ----------------------------------------------------------
function _renderDebug() {
  if (!panelEl) return;

  const content = panelEl.querySelector('#debug-content');
  if (!content) return;

  const now = new Date();
  const p = state.plan || {};

  const activeWeekStart =
    state.activeWeekStart instanceof Date ? state.activeWeekStart : null;

  const weekInfo = activeWeekStart
    ? getWeekRangeFromDate(activeWeekStart)
    : null;

  const weekNum = activeWeekStart ? getWeekNumber(activeWeekStart) : '-';

  const activeDayName = state.activeDay || 'Montag';
  let activeIso = null;

  if (weekInfo) {
    const idx = getDayIndex(activeDayName);
    const d = new Date(weekInfo.start);
    d.setDate(weekInfo.start.getDate() + idx);
    activeIso = toIso(d);
  }

  const daySlice = activeIso && p.days ? p.days[activeIso] : null;

  const loadedMonths = (() => {
    try {
      return persist._loadedMonths ? Array.from(persist._loadedMonths) : [];
    } catch {
      return [];
    }
  })();

  const saveQueueInfo = (() => {
    try {
      return {
        queueLength: persist._saveQueue?.length ?? 0,
        lastSave: persist._lastSaveTime ?? '-',
        nextPlanned: persist._nextSaveTimestamp ?? '-',
      };
    } catch {
      return { queueLength: '-', lastSave: '-', nextPlanned: '-' };
    }
  })();

  const rc = lastRenderEvent || {};

  const holidayApplied = !!(
    daySlice && Object.values(daySlice).some((emp) => emp && emp._holiday)
  );

  const absenceApplied = !!(
    daySlice && Object.values(daySlice).some((emp) => emp && emp._absence)
  );

  content.innerHTML = `
    <section class="debug-section">
      <h4>Global</h4>
      <div class="debug-row"><span>Now:</span><code>${now.toISOString()}</code></div>
      <div class="debug-row"><span>selectedRole:</span><code>${state.selectedRole || '(keine)'}</code></div>
      <div class="debug-row"><span>currentYear:</span><code>${state.currentYear ?? '-'}</code></div>
      <div class="debug-row"><span>currentMonth:</span><code>${state.currentMonth ?? '-'}</code></div>
    </section>

    <section class="debug-section">
      <h4>Woche</h4>
      <div class="debug-row"><span>activeWeekStart:</span><code>${activeWeekStart ? toIso(activeWeekStart) : '-'}</code></div>
      <div class="debug-row"><span>KW:</span><code>${weekNum}</code></div>
      <div class="debug-row"><span>Week-Range:</span><code>${
        weekInfo ? `${toIso(weekInfo.start)} – ${toIso(weekInfo.end)}` : '-'
      }</code></div>
      <div class="debug-row"><span>activeDay:</span><code>${activeDayName}</code></div>
      <div class="debug-row"><span>activeIso:</span><code>${activeIso || '-'}</code></div>
    </section>

    <section class="debug-section">
      <h4>Plan</h4>
      <div class="debug-row"><span>days keys:</span><code>${p.days ? Object.keys(p.days).length : 0}</code></div>
      <div class="debug-row"><span>notes count:</span><code>${Array.isArray(p.notes) ? p.notes.length : 0}</code></div>
    </section>

    <section class="debug-section">
      <h4>Aktiver Tag (${activeIso || '-'})</h4>
      <div class="debug-row"><span>Holiday:</span><code>${holidayApplied}</code></div>
      <div class="debug-row"><span>Absence:</span><code>${absenceApplied}</code></div>
      ${
        daySlice
          ? `<details class="debug-details">
             <summary>daySlice JSON</summary>
             <pre>${_safeJson(daySlice)}</pre>
           </details>`
          : `<div class="debug-row"><code>kein Eintrag</code></div>`
      }
    </section>

    <section class="debug-section">
      <h4>Logic</h4>
      ${_renderLogicDebug(activeIso)}
    </section>
  `;
}

// ----------------------------------------------------------
// LOGIC DEBUG (NEU)
// ----------------------------------------------------------
function _renderLogicDebug(activeIso) {
  const logic = state.logic?.findingsWeek;

  if (!logic) {
    return `<div class="debug-row"><code>Logic noch nicht ausgeführt</code></div>`;
  }

  const { summary, status, items } = logic;

  const filtered = activeIso
    ? items.filter((f) => f.scope?.date === activeIso)
    : items;

  return `
    <div class="debug-row">
      <span>Status:</span>
      <code>
        errors=${summary.errorCount},
        warnings=${summary.warningCount},
        approvable=${status.approvable}
      </code>
    </div>

    <div class="debug-row">
      <span>Findings gesamt:</span>
      <code>${items.length}</code>
    </div>

    <div class="debug-row">
      <span>Findings (aktiver Tag):</span>
      <code>${filtered.length}</code>
    </div>

    ${
      filtered.length
        ? `<details class="debug-details">
             <summary>Findings JSON</summary>
             <pre>${_safeJson(filtered)}</pre>
           </details>`
        : `<div class="debug-row"><code>keine Findings</code></div>`
    }
  `;
}

// ----------------------------------------------------------
// UTIL
// ----------------------------------------------------------
function _safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return '(JSON-Fehler)';
  }
}
