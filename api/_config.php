<?php
// ==========================================================
// File: api/_config.php
// Purpose: Gemeinsame Helfer für Settings + Plan API
// ==========================================================

declare(strict_types=1);

// Basisverzeichnis: Projektroot = eine Ebene über /api
$BASE_DIR   = dirname(__DIR__);
$DATA_DIR   = $BASE_DIR . DIRECTORY_SEPARATOR . 'data';
$SETTINGS_FILE = $DATA_DIR . DIRECTORY_SEPARATOR . 'settings.json';

// ----------------------------------------------------------
// JSON Response Helper
// ----------------------------------------------------------
function send_json($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// ----------------------------------------------------------
// Request Body als JSON
// ----------------------------------------------------------
function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        send_json(['ok' => false, 'error' => 'Invalid JSON body'], 400);
    }
    return $decoded;
}

// ----------------------------------------------------------
// Sicherstellen, dass ein Verzeichnis existiert
// ----------------------------------------------------------
function ensure_dir(string $dir): void {
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
            send_json(['ok' => false, 'error' => 'Failed to create directory: ' . $dir], 500);
        }
    }
}

// ----------------------------------------------------------
// Datei atomar schreiben (mit Lock)
// ----------------------------------------------------------
function write_json_file(string $file, array $data): void {
    $dir = dirname($file);
    ensure_dir($dir);

    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        send_json(['ok' => false, 'error' => 'Failed to encode JSON'], 500);
    }

    $tmp = $file . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        send_json(['ok' => false, 'error' => 'Failed to write temp file'], 500);
    }

    if (!rename($tmp, $file)) {
        @unlink($tmp);
        send_json(['ok' => false, 'error' => 'Failed to move temp file into place'], 500);
    }
}
