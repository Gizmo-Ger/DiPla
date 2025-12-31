// ======================================================================
// settings-auth.js
// Admin-Übersicht für Benutzerkonten (AUTH) – FINAL
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { formatDateTime } from '/js/misc/datetime.js';
import { popup } from '/js/core/popup.js';

// ----------------------------------------------------------------------
// API
// ----------------------------------------------------------------------
const API_LIST = '/api/auth/list.php';
const API_RESET = '/api/auth/reset-failed.php';

// ----------------------------------------------------------------------
// Plugin Definition
// ----------------------------------------------------------------------
export const SettingsPlugin = {
  id: 'auth',
  title: 'Auth',
  order: 90,

  render() {
    return `
      <div class="sa-root">

        <div id="sa-error" class="sm-error" style="display:none;"></div>

        <div class="sa-sticky-header">
          <h3>Benutzerkonten</h3>

          <table class="sa-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Admin</th>
                <th>Passwort</th>
                <th>Fehlversuche</th>
                <th>Letzter Login</th>
                <th>Letzte IP</th>
                <th>Aktion</th>
              </tr>
            </thead>
          </table>
        </div>

        <div class="sa-scroll-body">
          <table class="sa-table">
            <tbody id="sa-body">
              <tr>
                <td colspan="8" class="sa-loading">Lade Daten…</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    `;
  },

  async bind() {
    D.debug('settings-auth', 'bind() gestartet');

    await waitForAuthDOM();

    const body = document.getElementById('sa-body');
    body?.addEventListener('click', onBodyClick);

    await loadAuthList();
  },
};

// ----------------------------------------------------------------------
// DOM READY (Panel)
// ----------------------------------------------------------------------
function waitForAuthDOM() {
  return new Promise((resolve) => {
    const check = () => {
      if (document.getElementById('sa-body')) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

// ----------------------------------------------------------------------
// Daten laden
// ----------------------------------------------------------------------
async function loadAuthList() {
  const body = document.getElementById('sa-body');
  const errorBox = document.getElementById('sa-error');

  if (!body || !errorBox) {
    D.warn('settings-auth', 'DOM nicht bereit');
    return;
  }

  errorBox.style.display = 'none';
  errorBox.textContent = '';

  D.debug('settings-auth', 'Lade Benutzerliste…');

  try {
    const resp = await fetch(API_LIST, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });

    const data = await safeJson(resp);

    if (!resp.ok || data?.status !== 'ok') {
      throw new Error(data?.message || 'Fehler beim Laden');
    }

    const users = Array.isArray(data.users) ? data.users : [];

    if (!users.length) {
      body.innerHTML = `
        <tr>
          <td colspan="8" class="sa-empty">Keine Benutzer</td>
        </tr>
      `;
      return;
    }

    body.innerHTML = users.map(rowHTML).join('');
    D.debug('settings-auth', 'Benutzer geladen', { count: users.length });
  } catch (err) {
    D.error('settings-auth', err);

    errorBox.textContent = err?.message || 'Fehler beim Laden';
    errorBox.style.display = 'block';

    body.innerHTML = `
      <tr>
        <td colspan="8" class="sa-empty">Fehler beim Laden</td>
      </tr>
    `;
  }
}

// ----------------------------------------------------------------------
// Event Delegation – Reset Failed Logins
// ----------------------------------------------------------------------
async function onBodyClick(e) {
  const btn = e.target.closest('.sa-reset-btn');
  if (!btn) return;

  const user = btn.dataset.id;
  if (!user) return;

  const ok = await popup.confirm(`Fehlversuche für ${user} zurücksetzen?`, {
    type: 'warn',
    okText: 'Reset',
    cancelText: 'Abbrechen',
  });
  if (!ok) return;

  try {
    const csrf = window.AUTH_USER?.csrf;
    if (!csrf) throw new Error('CSRF fehlt – Session ungültig');

    btn.disabled = true;

    const resp = await fetch(API_RESET, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify({ user }),
    });

    const data = await safeJson(resp);

    if (!resp.ok || data?.status !== 'ok') {
      throw new Error(data?.message || 'Reset fehlgeschlagen');
    }

    popup.toast(`Fehlversuche für ${user} zurückgesetzt`, {
      type: 'success',
    });

    await loadAuthList();
  } catch (err) {
    D.error('settings-auth', err);
    popup.toast(err?.message || 'Reset fehlgeschlagen', {
      type: 'error',
    });
  } finally {
    btn.disabled = false;
  }
}

// ----------------------------------------------------------------------
// Row Renderer
// ----------------------------------------------------------------------
function rowHTML(u) {
  const id = esc(u.id);
  const name = esc(u.name || '–');
  const admin = u.isAdmin ? '✓' : '–';

  const passIcon = u.passwordSet
    ? `<span class="sa-ok" title="Passwort gesetzt">✓</span>`
    : `<span class="sa-bad" title="Kein Passwort">✗</span>`;

  const failed = Number.isFinite(u.failed) ? u.failed : 0;
  const lastIP = esc(u.lastIP || '–');

  return `
    <tr>
      <td>${id}</td>
      <td>${name}</td>
      <td>${admin}</td>
      <td class="sa-pass">${passIcon}</td>
      <td>${failed}</td>
      <td>${formatDateTime(u.lastLogin)}</td>
      <td>${lastIP}</td>
      <td>
        <button
          class="sm-btn sm-btn-secondary sa-reset-btn"
          data-id="${id}"
          ${failed > 0 ? '' : 'disabled'}
        >
          Reset
        </button>
      </td>
    </tr>
  `;
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------
async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

function esc(v) {
  return String(v).replace(
    /[&<>"']/g,
    (m) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[m]
  );
}
