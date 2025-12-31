// ==========================================================
// File: info.js (RAW v0.1)
// Purpose:
// - Zentrale Info-/Hilfeanzeige
// - KEIN eigenes UI
// - Delegiert vollständig an popup.js
// ==========================================================

import popup from '../core/popup.js';
import { state } from '../core/state.js';
import { D } from '../core/diagnostics.js';

// ----------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------

export function showInfo() {
  try {
    const html = buildInfoMarkup();
    popup.confirmChoice(html, [{ label: 'Schließen', value: 'close' }], {
      type: 'info',
      allowHTML: true,
    });

    D.info('info', 'Info-Popup geöffnet');
  } catch (err) {
    D.error('info', 'showInfo fehlgeschlagen', err);
    popup.alert('Info konnte nicht angezeigt werden');
  }
}

// ----------------------------------------------------------
// CONTENT
// ----------------------------------------------------------

function buildInfoMarkup() {
  const user = state.user?.user || '–';
  const isAdmin = state.user?.isAdmin ? 'Admin' : 'Viewer';

  const planStatus = state.plan?.status || 'unbekannt';

  const logic = state.logic?.findingsWeek;
  const errors = logic?.summary?.errorCount ?? 0;
  const warnings = logic?.summary?.warningCount ?? 0;

  return `
    <div class="info-popup">

      <h3>System</h3>
      <ul>
        <li><strong>Benutzer:</strong> ${user} (${isAdmin})</li>
        <li><strong>Planstatus:</strong> ${planStatus}</li>
      </ul>

      <h3>Planprüfung</h3>
      <ul>
        <li>Fehler: ${errors}</li>
        <li>Warnungen: ${warnings}</li>
      </ul>

      <h3>Status-Legende</h3>
      <ul>
        <li><span style="color:#999">●</span> nicht geprüft</li>
        <li><span style="color:#d9534f">●</span> Fehler – keine Freigabe</li>
        <li><span style="color:#f0ad4e">●</span> Warnungen – freigabefähig</li>
        <li><span style="color:#5cb85c">●</span> OK – freigabefähig</li>
      </ul>

    </div>
  `;
}
