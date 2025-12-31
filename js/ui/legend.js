// ==========================================================
// File: legend.js – FINAL
// Purpose:
// - Anzeige Planstatus der aktuellen Woche (Ampel + Text)
// - Anzeige Rollenfarben
// ==========================================================

import { state } from '../core/state.js';
import { D } from '../core/diagnostics.js';

// ==========================================================
// INIT
// ==========================================================
export function initLegend() {
  D.debug('ui-legend', 'Legend gerendert', {
    hasFindings: !!state.logic?.findingsWeek,
    roles: Object.keys(state.settings?.roles || {}).length,
  });

  const container = document.getElementById('legend-container');
  if (!container) {
    D.error('ui-legend', 'Legend-Container nicht gefunden');
    return;
  }

  let html = '';

  // --------------------------------------------------------
  // 0) Freigabestatus (Workflow)
  // --------------------------------------------------------
  html += renderApprovalStatus();

  // --------------------------------------------------------
  // 1) Planstatus der aktuellen Woche
  // --------------------------------------------------------
  html += renderPlanStatus();

  // --------------------------------------------------------
  // 2) Rollen-Legende
  // --------------------------------------------------------
  html += renderRolesLegend();

  container.innerHTML = html;
}

// ==========================================================
// APPROVAL STATUS (Ampel)
// ==========================================================
function renderApprovalStatus() {
  const status = state.plan?.status;

  let label = 'Plan nicht freigegeben';
  let css = 'legend-approval-draft';

  if (status === 'approved') {
    label = 'Plan freigegeben';
    css = 'legend-approval-approved';
  }

  return `
    <div class="legend-section">
      <div class="legend-title">Freigabe</div>
      <div class="legend-status ${css}">
        <span class="legend-dot"></span>
        <span class="legend-status-text">${label}</span>
      </div>
    </div>
  `;
}

// ==========================================================
// PLANSTATUS (Ampel)
// ==========================================================
function renderPlanStatus() {
  const fw = state.logic?.findingsWeek;

  let label = 'Woche nicht geprüft';
  let css = 'legend-status-unchecked';

  if (fw && fw.summary) {
    const { errorCount = 0, warningCount = 0 } = fw.summary;

    if (errorCount > 0) {
      label = 'Fehler – keine Freigabe';
      css = 'legend-status-error';
    } else if (warningCount > 0) {
      label = 'Warnungen – freigabefähig';
      css = 'legend-status-warning';
    } else {
      label = 'OK – freigabefähig';
      css = 'legend-status-ok';
    }
  }

  return `
    <div class="legend-section">
      <div class="legend-title">Planstatus (Woche)</div>
      <div class="legend-status ${css}">
        <span class="legend-dot"></span>
        <span class="legend-status-text">${label}</span>
      </div>
    </div>
  `;
}

/// ==========================================================
// ROLLEN (kompakt: links funktional, rechts nicht verfügbar)
// ==========================================================
function renderRolesLegend() {
  const roles = state.settings?.roles || {};
  const keys = Object.keys(roles);

  if (keys.length === 0) {
    return `
      <div class="legend-section">
        <div class="legend-empty">Keine Rollen definiert</div>
      </div>
    `;
  }

  const functional = keys.filter((k) => roles[k].functional !== false);
  const nonFunctional = keys.filter((k) => roles[k].functional === false);

  return `
    <div class="legend-section legend-roles-combined">
      <div class="legend-title">Rollen</div>

      <div class="legend-roles-row">
        <div class="legend-roles-left">
          ${functional.map((r) => legendItem(r, roles[r].color)).join('')}
        </div>

        ${
          nonFunctional.length > 0
            ? `
          <div class="legend-roles-right">
            ${nonFunctional.map((r) => legendItem(r, roles[r].color)).join('')}
          </div>
        `
            : ''
        }
      </div>
    </div>
  `;
}

// ==========================================================
// HELPER
// ==========================================================
function legendItem(name, color) {
  const safeColor = color || '#cccccc';
  return `
    <div class="legend-item">
      <span class="legend-color" style="background-color:${safeColor};"></span>
      <span class="legend-label">${name}</span>
    </div>
  `;
}
