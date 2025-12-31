// ==========================================================
// File: header.js (optimiert)
// Purpose: Kopfzeile – Heute, KW, Woche, Monat, Jahr
// Initialisiert Header inkl. Logout-Button
// ==========================================================

import { initLogout } from '../core/logout.js';
import {
  formatDate,
  getWeekRangeFromDate,
  getWeekNumber,
} from '../misc/datetime.js';
import { D } from '../core/diagnostics.js';

// ==========================================================
// INIT
// ==========================================================
export function initHeader() {
  const headerDate = document.getElementById('header-date');
  const headerUser = document.getElementById('header-user');

  if (headerDate) {
    const today = new Date();
    headerDate.textContent = `Heute ist der ${formatDate(today)}`;
  }

  if (headerUser && window.AUTH_USER?.user) {
    headerUser.textContent = `Angemeldet: ${window.AUTH_USER.user}`;
  }

  initLogout();
  updateHeader(new Date());

  D.debug('ui-header', 'Header initialisiert');
}

// ==========================================================
// UPDATE (von controls.js oder plan.js aufrufbar)
// ==========================================================
export function updateHeader(refDate) {
  try {
    const weekLabel = document.getElementById('week-label');
    const monthLabel = document.getElementById('month-label');

    if (!weekLabel && !monthLabel) return;

    const week = getWeekNumber(refDate);
    const { start, end } = getWeekRangeFromDate(refDate);

    if (weekLabel) {
      weekLabel.textContent = `KW ${week} (${formatDate(start)} – ${formatDate(end)})`;
    }

    if (monthLabel) {
      const monthNames = [
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
      const m = monthNames[refDate.getMonth()];
      monthLabel.textContent = `${m} ${refDate.getFullYear()}`;
    }

    D.debug('ui-header', 'Header aktualisiert', {
      week,
      start: formatDate(start),
      end: formatDate(end),
    });
  } catch (err) {
    D.error('ui-header', 'Fehler in updateHeader()', err);
  }
}
