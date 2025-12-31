// ======================================================================
// auth-guard.js
// Zentrale Zugriffskontrolle (Admin / Viewer)
// ======================================================================

// ----------------------------------------------------------------------
// DEV-SCHALTER
// ----------------------------------------------------------------------
// ⚠️ NUR FÜR ENTWICKLUNG
const AUTH_DISABLED = false;

// ----------------------------------------------------------------------
// KONFIG
// ----------------------------------------------------------------------
const API_CHECK = '/api/auth/check.php';
const LOGIN_URL = '/login.html';

// ----------------------------------------------------------------------
// ENTRY
// ----------------------------------------------------------------------
if (AUTH_DISABLED) {
  console.warn('[auth-guard] AUTH DISABLED (DEV MODE)');

  window.AUTH_USER = Object.freeze({
    user: 'DEV',
    isAdmin: true,
    csrf: 'dev-csrf',
  });
} else {
  enforceAuth();
}

// ----------------------------------------------------------------------
// AUTH LOGIK
// ----------------------------------------------------------------------
async function enforceAuth() {
  try {
    const resp = await fetch(API_CHECK, {
      credentials: 'same-origin',
      cache: 'no-store',
    });

    let data = null;
    try {
      data = await resp.json();
    } catch (_) {
      /* ignore */
    }

    // ------------------------------------------------------------
    // Session ungültig / Timeout
    // ------------------------------------------------------------
    if (resp.status === 401) {
      redirectToLogin(data?.reason || null);
      return;
    }

    // ------------------------------------------------------------
    // Harte Fehler
    // ------------------------------------------------------------
    if (!resp.ok) {
      throw new Error('Auth check failed');
    }

    // ------------------------------------------------------------
    // Nicht eingeloggt
    // ------------------------------------------------------------
    if (!data || data.loggedIn !== true) {
      redirectToLogin();
      return;
    }

    // ------------------------------------------------------------
    // Globaler Auth-Kontext
    // ------------------------------------------------------------
    window.AUTH_USER = Object.freeze({
      user: data.user,
      isAdmin: !!data.isAdmin,
      csrf: data.csrf || null,
    });

    // ------------------------------------------------------------
    // Seitenabhängige Zugriffskontrolle
    // ------------------------------------------------------------
    const path = location.pathname;
    const isIndexPage = path.endsWith('/index.html');
    const isViewerPage = path.endsWith('/viewer.html');

    // Admin-UI nur für Admins
    if (isIndexPage && !data.isAdmin) {
      location.href = '/viewer.html';
      return;
    }

    // Viewer darf alles sehen
    if (isViewerPage) {
      return;
    }
  } catch (err) {
    console.error('[auth-guard]', err);
    redirectToLogin();
  }
}

// ----------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------
function redirectToLogin(reason = null) {
  if (location.pathname.endsWith('/login.html')) return;

  let url = LOGIN_URL;
  if (reason) {
    url += `?reason=${encodeURIComponent(reason)}`;
  }

  location.href = url;
}
