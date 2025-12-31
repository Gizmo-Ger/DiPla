// ==========================================================
// File: logout.js
// Purpose: Sauberer Logout inkl. Admin-Lock & Heartbeat
// ==========================================================

import { stopAdminHeartbeat } from '/js/core/admin-heartbeat.js';
import { D } from './diagnostics.js';

export function initLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) {
    D.warn('auth', 'Logout-Button nicht gefunden');
    return;
  }

  btn.addEventListener('click', async () => {
    try {
      // 🔴 Heartbeat SOFORT stoppen
      stopAdminHeartbeat();
      D.info('auth', 'Admin-Heartbeat gestoppt');

      // Server-Logout
      await fetch('/api/auth/logout.php', {
        method: 'POST',
        credentials: 'include',
      });

      window.location.href = '/login.html';
    } catch (err) {
      D.error('auth', 'Logout fehlgeschlagen', err);
      alert('Logout fehlgeschlagen');
    }
  });
}
