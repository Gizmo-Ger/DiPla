<?php
declare(strict_types=1);

header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate");

// ------------------------------------------------------------
// DEPENDENCIES
// ------------------------------------------------------------
require_once __DIR__ . '/admin_lock.php';

// ------------------------------------------------------------
// METHOD GUARD
// ------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Method not allowed'
    ]);
    exit;
}

// ------------------------------------------------------------
// Session-Härtung
// ------------------------------------------------------------
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.use_only_cookies', '1');
// ini_set('session.cookie_secure', '1'); // nur bei HTTPS

// ------------------------------------------------------------
// INPUT
// ------------------------------------------------------------
$user = strtoupper(trim($_POST["user"] ?? ""));
$pass = $_POST["password"] ?? "";

// Wird für Admin-Lock benötigt
$currentUserId = $user;

// ------------------------------------------------------------
// BASISVALIDIERUNG
// ------------------------------------------------------------
if ($user === "" || $pass === "") {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "message" => "Benutzer oder Passwort fehlt"
    ]);
    exit;
}

// ------------------------------------------------------------
// IP
// ------------------------------------------------------------
function getClientIP(): string {
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        return trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    }
    if (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        return $_SERVER['HTTP_X_REAL_IP'];
    }
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

// ------------------------------------------------------------
// PATHS
// ------------------------------------------------------------
$DOCROOT  = rtrim($_SERVER["DOCUMENT_ROOT"] ?? "/var/www/html", "/");
$DATA     = $DOCROOT . "/data";
$AUTH     = $DATA . "/users.json";
$SETTINGS = $DATA . "/settings.json";

// ------------------------------------------------------------
// SETTINGS LADEN
// ------------------------------------------------------------
if (!is_file($SETTINGS)) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => "Systemfehler"
    ]);
    exit;
}

$settings = json_decode(file_get_contents($SETTINGS), true);
$staff    = is_array($settings['staff'] ?? null) ? $settings['staff'] : [];

$emp = null;
foreach ($staff as $s) {
    if (($s["id"] ?? "") === $user) {
        $emp = $s;
        break;
    }
}

if (!$emp) {
    sleep(1);
    http_response_code(401);
    echo json_encode([
        "status"  => "error",
        "message" => "Unbekannter Benutzer"
    ]);
    exit;
}

$isAdmin = (bool)($emp["isAdmin"] ?? false);

// ------------------------------------------------------------
// ADMIN LOCK (NUR FÜR ADMINS)
// ------------------------------------------------------------
if ($isAdmin) {
    $lock = getAdminLock();
    if ($lock && ($lock['userId'] ?? null) !== $currentUserId) {
        http_response_code(423); // Locked
        echo json_encode([
            'status'  => 'locked',
            'message' => 'Ein Administrator bearbeitet derzeit den Plan.'
        ]);
        exit;
    }
}

// ------------------------------------------------------------
// AUTH-DATEN
// ------------------------------------------------------------
if (!is_file($AUTH)) {
    http_response_code(403);
    echo json_encode([
        "status"  => "error",
        "message" => "Kein Passwort gesetzt. Bitte Administrator kontaktieren."
    ]);
    exit;
}

$auth = json_decode(file_get_contents($AUTH), true);
if (!is_array($auth)) {
    $auth = [];
}

$entry = $auth[$user] ?? null;

if (!$entry || empty($entry["password"])) {
    http_response_code(403);
    echo json_encode([
        "status"  => "error",
        "message" => "Kein Passwort gesetzt. Bitte Administrator kontaktieren."
    ]);
    exit;
}

// ------------------------------------------------------------
// FEHLVERSUCHE
// ------------------------------------------------------------
$failed = (int)($entry["failed"] ?? 0);
if ($failed >= 3) {
    http_response_code(403);
    echo json_encode([
        "status"  => "error",
        "message" => "Zu viele Fehlversuche. Bitte Administrator kontaktieren."
    ]);
    exit;
}

// ------------------------------------------------------------
// PASSWORT PRÜFEN
// ------------------------------------------------------------
if (!password_verify($pass, $entry["password"])) {

    $auth[$user]["failed"] = $failed + 1;

    file_put_contents(
        $AUTH,
        json_encode($auth, JSON_PRETTY_PRINT),
        LOCK_EX
    );

    sleep(1);

    http_response_code(401);
    echo json_encode([
        "status"  => "error",
        "message" => "Falsches Passwort"
    ]);
    exit;
}

// ------------------------------------------------------------
// ERFOLG
// ------------------------------------------------------------
$auth[$user]["failed"]    = 0;
$auth[$user]["lastLogin"] = date('Y-m-d H:i:s');
$auth[$user]["lastIP"]    = getClientIP();
$auth[$user]["lastUA"]    = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);

file_put_contents(
    $AUTH,
    json_encode($auth, JSON_PRETTY_PRINT),
    LOCK_EX
);

// Admin-Lock nur bei Admin-Login setzen
if ($isAdmin) {
    setAdminLock($currentUserId);
}

// Session-Fixation verhindern
session_start();
session_regenerate_id(true);

$_SESSION["user"]         = $user;
$_SESSION["isAdmin"]      = $isAdmin;
$_SESSION["loginAt"]      = time();
$_SESSION["lastActivity"] = time();
$_SESSION["csrf"]         = bin2hex(random_bytes(16));

// ------------------------------------------------------------
// REDIRECT
// ------------------------------------------------------------
$redirect = $isAdmin
    ? "/index.html"
    : "/viewer.html";

http_response_code(200);
echo json_encode([
    "status"   => "ok",
    "redirect" => $redirect
]);
