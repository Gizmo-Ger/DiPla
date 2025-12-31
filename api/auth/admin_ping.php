<?php
declare(strict_types=1);

header("Content-Type: application/json");
header("Cache-Control: no-store");

session_start();

require_once __DIR__ . '/admin_lock.php';

// ------------------------------------------------------------
// Auth prüfen
// ------------------------------------------------------------
if (empty($_SESSION['user']) || empty($_SESSION['isAdmin'])) {
    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'message' => 'Nicht authentifiziert'
    ]);
    exit;
}

$userId = $_SESSION['user'];

// ------------------------------------------------------------
// Lock verlängern
// ------------------------------------------------------------
if (!refreshAdminLock($userId)) {
    http_response_code(409);
    echo json_encode([
        'status' => 'lost',
        'message' => 'Admin-Lock verloren'
    ]);
    exit;
}

echo json_encode([
    'status' => 'ok',
    'ts'     => time()
]);
