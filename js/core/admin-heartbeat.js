import { D } from './diagnostics.js';

let heartbeatTimer = null;

export function startAdminHeartbeat() {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/auth/admin_ping.php', {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        D.error('heartbeat', 'Admin-Lock verloren');
        stopAdminHeartbeat();
        alert('Admin-Sitzung beendet. Bitte neu anmelden.');
        location.href = '/login.html';
      }
    } catch (err) {
      D.error('heartbeat', 'Ping fehlgeschlagen', err);
    }
  }, 60_000); // 60 Sekunden
}

export function stopAdminHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
