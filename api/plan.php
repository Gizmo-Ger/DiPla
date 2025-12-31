<?php
// ===========================================================
// plan.php – Laden/Speichern von Monatsplänen
// - CORS Variante B
// - Eingangsvalidierung year/month
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
    header('Access-Control-Allow-Origin: *');
}

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/lib/respond.php';

// -----------------------------------------------------------
// Eingangsparameter validieren
// -----------------------------------------------------------
$year  = isset($_GET['year'])  ? (int)$_GET['year']  : 0;
$month = isset($_GET['month']) ? (int)$_GET['month'] : 0;

if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) {
    respond(400, ['error' => 'year/month ungültig'], ['year' => $year, 'month' => $month]);
}

$baseDir  = __DIR__ . "/../data/$year";
$planFile = "$baseDir/$month.json";

// -----------------------------------------------------------
// GET -> Monatsplan lesen
// -----------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    if (!file_exists($planFile)) {
        // Leere Struktur zurückgeben
        respond(200, [
            'year'     => $year,
            'month'    => $month,
            'status'   => 'empty',
            'days'     => [],
            'notes'    => [],
            'holidays' => []
        ], ['path' => $planFile, 'new' => true]);
    }

    $raw = file_get_contents($planFile);
    $json = json_decode($raw, true);

    if ($json === null) {
        respond(500, ['error' => 'Plan-Datei beschädigt'], ['path' => $planFile]);
    }

    // Jahr/Monat aus URL als Fallback
    if (!isset($json['year']))  $json['year']  = $year;
    if (!isset($json['month'])) $json['month'] = $month;

    respond(200, $json, ['path' => $planFile, 'new' => false]);
}

// -----------------------------------------------------------
// POST -> Monatsplan speichern (atomic)
// -----------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if ($data === null) {
        respond(400, ['error' => 'Ungültiges JSON']);
    }

    // Erzwinge serverseitig, dass year/month mit der URL übereinstimmen
    $data['year']  = $year;
    $data['month'] = $month;

    if (!is_dir($baseDir)) {
        if (!@mkdir($baseDir, 0775, true) && !is_dir($baseDir)) {
            respond(500, ['error' => 'Plan-Verzeichnis konnte nicht erstellt werden'], ['dir' => $baseDir]);
        }
    }

    $tmpFile = $planFile . '.tmp';

    $json = json_encode(
        $data,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );
    if ($json === false) {
        respond(400, ['error' => 'Plan konnte nicht serialisiert werden']);
    }

    $bytes = @file_put_contents($tmpFile, $json, LOCK_EX);
    if ($bytes === false) {
        respond(500, ['error' => 'Temporäre Plan-Datei konnte nicht geschrieben werden'], ['tmp' => $tmpFile]);
    }

    @chmod($tmpFile, 0664);

    if (!@rename($tmpFile, $planFile)) {
        @unlink($tmpFile);
        respond(500, ['error' => 'Plan-Datei konnte nicht ersetzt werden'], ['target' => $planFile]);
    }

    respond(200, ['status' => 'ok']);
}

// -----------------------------------------------------------
// Falsche Methode
// -----------------------------------------------------------
respond(405, ['error' => 'Method Not Allowed']);
