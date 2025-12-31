<?php
// auth-update-user.php
// Aktualisiert /data/users.json anhand von POST-JSON
// Eingabe: { staffId, role, password? }

header('Content-Type: application/json; charset=utf-8');

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

$staffId = isset($input['staffId']) ? trim($input['staffId']) : '';
$role    = isset($input['role']) ? trim($input['role']) : 'staff';
$password= isset($input['password']) ? $input['password'] : null;

if ($staffId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'staffId fehlt']);
    exit;
}

if ($role !== 'admin' && $role !== 'staff') {
    $role = 'staff';
}

$usersFile = __DIR__ . '/data/users.json';
if (!is_dir(dirname($usersFile))) {
    mkdir(dirname($usersFile), 0770, true);
}

$users = [];
if (file_exists($usersFile)) {
    $json = file_get_contents($usersFile);
    $decoded = json_decode($json, true);
    if (is_array($decoded)) {
        $users = $decoded;
    }
}

// User suchen oder neu anlegen
$found = false;
foreach ($users as &$u) {
    if (!isset($u['staffId'])) continue;
    if ($u['staffId'] === $staffId) {
        $found = true;
        $u['role'] = $role;
        if ($password !== null && $password !== '') {
            $u['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
        }
        break;
    }
}
unset($u);

if (!$found) {
    $entry = [
        'staffId' => $staffId,
        'role'    => $role
    ];
    if ($password !== null && $password !== '') {
        $entry['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
    } else {
        // Kein Passwort gesetzt -> Login später nicht möglich, bis Passwort vergeben
        $entry['passwordHash'] = null;
    }
    $users[] = $entry;
}

// Datei atomar schreiben
$tmpFile = $usersFile . '.tmp';
file_put_contents($tmpFile, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
rename($tmpFile, $usersFile);

echo json_encode(['ok' => true]);
