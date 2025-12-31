<?php
// ===========================================================
// settings.php – Laden/Speichern von settings.json
// - CORS Variante B (lokal großzügig)
// - Atomic Write
// ===========================================================

require_once __DIR__ . '/lib/logger.php';

// -----------------------------------------------------------
// CORS (Variante B: lokale Entwicklung, 192.168.x.x, localhost)
// -----------------------------------------------------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($origin) {
    if (preg_match('#^https?://(localhost|127\.0\.0\.1|192\.168\.)#i', $origin)) {
        header("Access-Control-Allow-Origin: $origin");
        header("Vary: Origin");
        header("Access-Control-Allow-Credentials: true");
    }
} else {
    // z.B. file:// oder kein Origin → für Tests freigeben
    header('Access-Control-Allow-Origin: *');
}

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/lib/respond.php';

$settingsFile = __DIR__ . '/../data/settings.json';

// -----------------------------------------------------------
// GET -> Settings lesen
// -----------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    if (!file_exists($settingsFile)) {
        respond(500, ['error' => 'settings.json fehlt'], ['path' => $settingsFile]);
    }

    $raw  = file_get_contents($settingsFile);
    $json = json_decode($raw, true);

    if ($json === null) {
        respond(500, ['error' => 'settings.json beschädigt'], ['path' => $settingsFile]);
    }

    respond(200, $json);
}

// -----------------------------------------------------------
// POST -> Settings speichern (atomic)
// -----------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if ($data === null) {
        respond(400, ['error' => 'Ungültiges JSON']);
    }

    $dir = dirname($settingsFile);
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0775, true) && !is_dir($dir)) {
            respond(500, ['error' => 'settings-Verzeichnis konnte nicht erstellt werden'], ['path' => $dir]);
        }
    }

    $tmpFile = $settingsFile . '.tmp';

    $json = json_encode(
        $data,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );
    if ($json === false) {
        respond(400, ['error' => 'Settings konnten nicht serialisiert werden']);
    }

    $bytes = @file_put_contents($tmpFile, $json, LOCK_EX);
    if ($bytes === false) {
        respond(500, ['error' => 'Temporäre Settings-Datei konnte nicht geschrieben werden'], ['tmp' => $tmpFile]);
    }

    @chmod($tmpFile, 0664);

    if (!@rename($tmpFile, $settingsFile)) {
        @unlink($tmpFile);
        respond(500, ['error' => 'Settings-Datei konnte nicht ersetzt werden'], ['target' => $settingsFile]);
    }

    respond(200, ['status' => 'ok']);
}

// -----------------------------------------------------------
// Falsche Methode
// -----------------------------------------------------------
respond(405, ['error' => 'Method Not Allowed']);
