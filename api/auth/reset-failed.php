<?php
declare(strict_types=1);

// ------------------------------------------------------------
// METHOD GUARD (POST ONLY)
// ------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode([
        'status'  => 'error',
        'message' => 'Method not allowed'
    ]);
    exit;
}

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

// ------------------------------------------------------------
// Session-Härtung
// ------------------------------------------------------------
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
// ini_set('session.cookie_secure', '1'); // nur bei HTTPS

session_start();

// ------------------------------------------------------------
// AUTH CHECK – NUR ADMINS
// ------------------------------------------------------------
if (
    empty($_SESSION['user']) ||
    !isset($_SESSION['isAdmin']) ||
    $_SESSION['isAdmin'] !== true
) {
    http_response_code(403);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Nicht autorisiert'
    ]);
    exit;
}

// ------------------------------------------------------------
// CSRF CHECK
// ------------------------------------------------------------
$csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

if (
    empty($_SESSION['csrf']) ||
    !hash_equals($_SESSION['csrf'], $csrf)
) {
    http_response_code(403);
    echo json_encode([
        'status'  => 'error',
        'message' => 'CSRF ungültig'
    ]);
    exit;
}

// ------------------------------------------------------------
// PATHS
// ------------------------------------------------------------
$DOCROOT = rtrim($_SERVER['DOCUMENT_ROOT'] ?? '/var/www/html', '/');
$DATA    = $DOCROOT . '/data';
$USERS   = $DATA . '/users.json';

// ------------------------------------------------------------
// INPUT
// ------------------------------------------------------------
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

$user = strtoupper(trim($data['user'] ?? ''));

if (!preg_match('/^[A-Z0-9]{2,10}$/', $user)) {
    http_response_code(400);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Ungültige Benutzer-ID'
    ]);
    exit;
}

// ------------------------------------------------------------
// LOAD USERS
// ------------------------------------------------------------
if (!is_file($USERS)) {
    http_response_code(404);
    echo json_encode([
        'status'  => 'error',
        'message' => 'users.json nicht vorhanden'
    ]);
    exit;
}

$users = json_decode(file_get_contents($USERS), true);
if (!is_array($users)) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'users.json beschädigt'
    ]);
    exit;
}

if (!isset($users[$user])) {
    http_response_code(404);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Benutzer nicht gefunden'
    ]);
    exit;
}

if ((int)($users[$user]['failed'] ?? 0) === 0) {
    http_response_code(409);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Keine Fehlversuche vorhanden'
    ]);
    exit;
}

// ------------------------------------------------------------
// RESET FAILED COUNTER
// ------------------------------------------------------------
$users[$user]['failed']  = 0;
$users[$user]['resetAt'] = date('Y-m-d H:i:s');
$users[$user]['resetBy'] = $_SESSION['user'];

file_put_contents(
    $USERS,
    json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

// ------------------------------------------------------------
// DONE
// ------------------------------------------------------------
http_response_code(200);
echo json_encode([
    'status' => 'ok',
    'user'   => $user
]);
