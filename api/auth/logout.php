<?php
declare(strict_types=1);

header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Pragma: no-cache");

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');

// ------------------------------------------------------------
// DEPENDENCIES
// ------------------------------------------------------------
require_once __DIR__ . '/admin_lock.php';

// ------------------------------------------------------------
// SESSION START
// ------------------------------------------------------------
session_start();

// ------------------------------------------------------------
// ADMIN LOCK FREIGEBEN (NUR WENN ADMIN)
// ------------------------------------------------------------

if (!empty($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true) {
    clearAdminLock();
}

// ------------------------------------------------------------
// Session leeren
// ------------------------------------------------------------
$_SESSION = [];

// ------------------------------------------------------------
// Session-Cookie invalidieren
// ------------------------------------------------------------
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();

    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'],
        $params['domain'],
        $params['secure'],
        $params['httponly']
    );
}

// ------------------------------------------------------------
// Session zerstören
// ------------------------------------------------------------
session_destroy();

// ------------------------------------------------------------
// Antwort
// ------------------------------------------------------------
http_response_code(200);
echo json_encode([
    "status"   => "ok",
    "redirect" => "/login.html"
]);
