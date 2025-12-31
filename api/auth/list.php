<?php
declare(strict_types=1);

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

// ------------------------------------------------------------
// SESSION-HÄRTUNG
// ------------------------------------------------------------
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
// ini_set('session.cookie_secure', '1'); // nur bei HTTPS

// ------------------------------------------------------------
// METHOD GUARD (GET)
// ------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Method not allowed'
    ]);
    exit;
}

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
// PATHS
// ------------------------------------------------------------
$DOCROOT  = rtrim($_SERVER['DOCUMENT_ROOT'] ?? '/var/www/html', '/');
$DATA     = $DOCROOT . '/data';
$SETTINGS = $DATA . '/settings.json';
$USERS    = $DATA . '/users.json';

// ------------------------------------------------------------
// LOAD SETTINGS
// ------------------------------------------------------------
if (!is_file($SETTINGS)) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'settings.json fehlt'
    ]);
    exit;
}

$settings = json_decode(file_get_contents($SETTINGS), true);
$staff    = $settings['staff'] ?? [];

if (!is_array($staff)) {
    $staff = [];
}

// ------------------------------------------------------------
// LOAD USERS (AUTH-DATEN)
// ------------------------------------------------------------
$users = [];
if (is_file($USERS)) {
    $users = json_decode(file_get_contents($USERS), true);
    if (!is_array($users)) {
        $users = [];
    }
}

// ------------------------------------------------------------
// MERGE + FILTER
// ------------------------------------------------------------
$result = [];

foreach ($staff as $s) {

    if (empty($s['id'])) {
        continue;
    }

    $id = strtoupper(trim($s['id']));

    // 🔑 WICHTIG:
    // active default = true (Rückwärtskompatibilität)
    $isActive     = ($s['active'] ?? true) === true;
    $isDeprecated = !empty($s['deprecated']);

    if (!$isActive || $isDeprecated) {
        continue;
    }

    $u = $users[$id] ?? [];

    // Name robust aufbauen
    $name = trim(
        ($s['firstName'] ?? '') . ' ' . ($s['lastName'] ?? '')
    );
    if ($name === '') {
        $name = $id;
    }

    $result[] = [
        'id'          => $id,
        'name'        => $name,
        'isAdmin'     => (bool)($s['isAdmin'] ?? false),
        'passwordSet' => !empty($u['password']),
        'failed'      => (int)($u['failed'] ?? 0),
        'lastLogin'   => $u['lastLogin'] ?? null,
        'lastIP'      => $u['lastIP'] ?? null,
    ];
}

// ------------------------------------------------------------
// SORTIERUNG (nach ID)
// ------------------------------------------------------------
usort(
    $result,
    fn ($a, $b) => strcmp($a['id'], $b['id'])
);

// ------------------------------------------------------------
// DONE
// ------------------------------------------------------------
http_response_code(200);
echo json_encode([
    'status' => 'ok',
    'users'  => $result
]);
