<?php
declare(strict_types=1);

header("Content-Type: application/json");
session_start();

// ---------------------------------------------------------------------
// PATHS
// ---------------------------------------------------------------------
$DOCROOT  = rtrim($_SERVER["DOCUMENT_ROOT"] ?? "/var/www/html", "/");
$DATA     = $DOCROOT . "/data";
$SETTINGS = $DATA . "/settings.json";
$AUTHFILE = $DATA . "/users.json";

// ---------------------------------------------------------------------
// SETTINGS LADEN (für Staff + Admin-Erkennung)
// ---------------------------------------------------------------------
if (!is_file($SETTINGS)) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => "Systemfehler (settings)"
    ]);
    exit;
}

$settings = json_decode(file_get_contents($SETTINGS), true);
$staff    = $settings["staff"] ?? [];

// ---------------------------------------------------------------------
// HELPER: Existiert bereits ein Admin-Passwort?
// ---------------------------------------------------------------------
function adminPasswordExists(string $authFile, array $staff): bool {
    if (!is_file($authFile)) return false;

    $auth = json_decode(file_get_contents($authFile), true);
    if (!is_array($auth)) return false;

    foreach ($staff as $s) {
        if (!empty($s["isAdmin"])) {
            $id = strtoupper($s["id"] ?? "");
            if ($id && !empty($auth[$id]["password"])) {
                return true;
            }
        }
    }
    return false;
}

$bootstrapAllowed = !adminPasswordExists($AUTHFILE, $staff);

// ---------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------
$user = strtoupper(trim($_POST["user"] ?? ""));
$pass = $_POST["password"] ?? "";

// ---------------------------------------------------------------------
// BASIC VALIDATION
// ---------------------------------------------------------------------
if ($user === "" || $pass === "") {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "message" => "Benutzer oder Passwort fehlt"
    ]);
    exit;
}

if (strlen($pass) < 8) {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "message" => "Passwort zu kurz (min. 8 Zeichen)"
    ]);
    exit;
}

// ---------------------------------------------------------------------
// USER MUSS IN settings.json EXISTIEREN
// ---------------------------------------------------------------------
$emp = null;
foreach ($staff as $s) {
    if (($s["id"] ?? "") === $user) {
        $emp = $s;
        break;
    }
}

if (!$emp) {
    http_response_code(404);
    echo json_encode([
        "status"  => "error",
        "message" => "Benutzer existiert nicht"
    ]);
    exit;
}

// ---------------------------------------------------------------------
// AUTH CHECK
// ---------------------------------------------------------------------
if (!$bootstrapAllowed) {
    // Normalbetrieb → Admin-Session nötig
    if (
        empty($_SESSION["user"]) ||
        empty($_SESSION["isAdmin"]) ||
        $_SESSION["isAdmin"] !== true
    ) {
        http_response_code(403);
        echo json_encode([
            "status"  => "error",
            "message" => "Nicht autorisiert"
        ]);
        exit;
    }
} else {
    // Bootstrap → nur Admin-User darf initial setzen
    if (empty($emp["isAdmin"]) || $emp["isAdmin"] !== true) {
        http_response_code(403);
        echo json_encode([
            "status"  => "error",
            "message" => "Initiales Passwort nur für Administrator erlaubt"
        ]);
        exit;
    }
}

// ---------------------------------------------------------------------
// AUTH STORAGE PREP
// ---------------------------------------------------------------------


$auth = [];
if (is_file($AUTHFILE)) {
    $auth = json_decode(file_get_contents($AUTHFILE), true);
    if (!is_array($auth)) $auth = [];
}

// ---------------------------------------------------------------------
// HASH + STORE
// ---------------------------------------------------------------------
$hash = password_hash($pass, PASSWORD_ARGON2ID);

$auth[$user] = [
    "password"  => $hash,
    "failed"    => 0,
    "updatedAt" => date("Y-m-d H:i:s"),
    "updatedBy" => $_SESSION["user"] ?? "BOOTSTRAP"
];

file_put_contents(
    $AUTHFILE,
    json_encode($auth, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

// ---------------------------------------------------------------------
// DONE
// ---------------------------------------------------------------------
http_response_code(200);
echo json_encode([
    "status"    => "ok",
    "bootstrap" => $bootstrapAllowed
]);
