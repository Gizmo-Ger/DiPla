<?php
declare(strict_types=1);

header("Content-Type: application/json");
header('Cache-Control: no-store, no-cache, must-revalidate');

// ------------------------------------------------------------
// SESSION-HÄRTUNG
// ------------------------------------------------------------
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
// ini_set('session.cookie_secure', '1'); // nur bei HTTPS

// ------------------------------------------------------------
// METHOD GUARD
// ------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
        echo json_encode([
            'status' => 'error',
            'reason' => 'method-not-allowed'
            ]);
    exit;
}

session_start();

// ------------------------------------------------------------
// KONFIG
// ------------------------------------------------------------
const IDLE_TIMEOUT = 30 * 60;

// ------------------------------------------------------------
// BASIS: Session vorhanden?
// ------------------------------------------------------------
if (
    empty($_SESSION['user']) ||
    !isset($_SESSION['isAdmin']) ||
    empty($_SESSION['loginAt'])
) {
    http_response_code(401);
    echo json_encode([
        'loggedIn' => false,
        'reason'   => 'no-session'
    ]);
    exit;
}

// ------------------------------------------------------------
// lastActivity absichern
// ------------------------------------------------------------
if (!isset($_SESSION['lastActivity'])) {
    $_SESSION['lastActivity'] = $_SESSION['loginAt'];
}

// ------------------------------------------------------------
// Idle-Timeout
// ------------------------------------------------------------
$now = time();

if (($now - (int)$_SESSION['lastActivity']) > IDLE_TIMEOUT) {
    session_unset();
    session_destroy();

    http_response_code(401);
    echo json_encode([
        'loggedIn' => false,
        'reason'   => 'timeout'
    ]);
    exit;
}

// ------------------------------------------------------------
// Sliding Timeout
// ------------------------------------------------------------
$_SESSION['lastActivity'] = $now;

// ------------------------------------------------------------
// CSRF sicherstellen
// ------------------------------------------------------------
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

// ------------------------------------------------------------
// OK
// ------------------------------------------------------------
http_response_code(200);
echo json_encode([
    'loggedIn' => true,
    'user'     => $_SESSION['user'],
    'isAdmin'  => (bool)$_SESSION['isAdmin'],
    'csrf'     => $_SESSION['csrf']
]);
