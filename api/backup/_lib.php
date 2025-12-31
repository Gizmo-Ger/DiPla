<?php
declare(strict_types=1);

/**
 * ======================================================================
 * _lib.php
 * ----------------------------------------------------------------------
 * Zentrale Hilfsbibliothek für das Backup-Backend
 *
 * Aufgaben:
 * - Zentrale Pfaddefinitionen
 * - Einheitliches JSON-Response-Handling
 * - Globales Locking (Race-Condition-Schutz)
 * - Index-Verwaltung (Single Source of Truth)
 * - Atomare Dateioperationen
 * - Hashing & Versionierung
 *
 * Design-Prinzipien (pragmatisch):
 * - EIN globales Lock (statt viele File-Locks)
 * - atomare Writes (tmp + rename)
 * - saubere Fehlermeldungen für das Frontend
 * - keine unnötige try/catch-Orgie
 * ======================================================================
 */

/* ----------------------------------------------------------------------
 * BASIS-PFADE
 * ---------------------------------------------------------------------- */

$DOCROOT = rtrim($_SERVER['DOCUMENT_ROOT'] ?? '/var/www/html', '/');
$DATA    = $DOCROOT . '/data';
$BACKUPS = $DATA . '/backups';
$INDEX   = $BACKUPS . '/index.json';

/* ----------------------------------------------------------------------
 * STANDARD-HEADER
 * ---------------------------------------------------------------------- */

header('Content-Type: application/json; charset=utf-8');

/* ----------------------------------------------------------------------
 * RESPONSE-HELPER
 * ---------------------------------------------------------------------- */

/**
 * Erfolgsantwort (einheitliches API-Format)
 */
function success(mixed $data = null, string $message = 'OK'): never
{
    http_response_code(200);
    echo json_encode([
        'status'  => 'success',
        'message' => $message,
        'data'    => $data
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Fehlerantwort (bricht sofort ab)
 */
function error(string $code, string $message, int $http = 400): never
{
    http_response_code($http);
    echo json_encode([
        'status'  => 'error',
        'code'    => $code,
        'message' => $message
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/* ----------------------------------------------------------------------
 * REQUEST-VALIDIERUNG
 * ---------------------------------------------------------------------- */

/**
 * Erzwingt POST-Requests
 */
function requirePost(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        error('INVALID_METHOD', 'POST required', 405);
    }
}

/**
 * Liest und dekodiert JSON-Input
 */
function getJsonInput(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false) {
        error('INVALID_INPUT', 'Cannot read request body');
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        error('INVALID_INPUT', 'Invalid JSON payload');
    }

    return $data;
}

/* ----------------------------------------------------------------------
 * GLOBAL LOCKING
 * ---------------------------------------------------------------------- */

/**
 * Erwirbt einen globalen Lock für das Backup-System.
 *
 * exclusive = true  → Schreiboperation
 * exclusive = false → Leseoperation
 *
 * Warum globaler Lock?
 * - Einfach
 * - ausreichend für JSON-Dateien
 * - verhindert Race Conditions zuverlässig
 */
function acquireLock(bool $exclusive = true)
{
    global $BACKUPS;

    if (!is_dir($BACKUPS) && !mkdir($BACKUPS, 0755, true)) {
        error('IO_ERROR', 'Cannot create backups directory', 500);
    }

    $lockFile = $BACKUPS . '/.lock';
    $fh = fopen($lockFile, 'c');
    if (!$fh) {
        error('IO_ERROR', 'Cannot open lock file', 500);
    }

    $mode = $exclusive ? LOCK_EX : LOCK_SH;

    if (!flock($fh, $mode)) {
        fclose($fh);
        error('IO_ERROR', 'Cannot acquire lock', 500);
    }

    return $fh;
}

/**
 * Gibt den Lock wieder frei
 */
function releaseLock($fh): void
{
    if ($fh) {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

/* ----------------------------------------------------------------------
 * INDEX-VERWALTUNG
 * ---------------------------------------------------------------------- */

/**
 * Leere Initialstruktur für index.json
 */
function emptyIndex(): array
{
    return [
        'schemaVersion' => 1,
        'updatedAt'     => null,
        'settings' => [
            'latest'   => null,
            'versions' => []
        ],
        'months' => [],
        'policy' => [
            'settingsMax'    => 50,
            'monthMaxPerSet' => 10
        ]
    ];
}

/**
 * Lädt index.json oder erzeugt sie neu
 */
function loadIndex(): array
{
    global $BACKUPS, $INDEX;

    if (!is_dir($BACKUPS) && !mkdir($BACKUPS, 0755, true)) {
        error('IO_ERROR', 'Cannot create backups directory', 500);
    }

    if (!is_file($INDEX)) {
        $idx = emptyIndex();
        saveIndex($idx);
        return $idx;
    }

    $raw = file_get_contents($INDEX);
    if ($raw === false) {
        error('IO_ERROR', 'Cannot read index.json', 500);
    }

    $json = json_decode($raw, true);
    if (!is_array($json)) {
        error('INDEX_CORRUPT', 'index.json is invalid', 500);
    }

    return $json;
}

/**
 * Speichert index.json atomar
 */
function saveIndex(array $index): void
{
    global $INDEX;

    $index['updatedAt'] = date(DATE_ATOM);

    $json = json_encode(
        $index,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );

    if ($json === false) {
        error('IO_ERROR', 'Failed to encode index.json', 500);
    }

    atomicWrite($INDEX, $json);
}

/* ----------------------------------------------------------------------
 * ATOMARES SCHREIBEN
 * ---------------------------------------------------------------------- */

/**
 * Atomarer Write:
 * - schreibt in .tmp
 * - ersetzt Original per rename()
 */
function atomicWrite(string $path, string $content): void
{
    $tmp = $path . '.tmp';

    if (file_put_contents($tmp, $content) === false) {
        error('IO_ERROR', 'Cannot write temp file', 500);
    }

    if (!rename($tmp, $path)) {
        @unlink($tmp);
        error('IO_ERROR', 'Cannot replace target file', 500);
    }
}

/* ----------------------------------------------------------------------
 * HASHING & VALIDIERUNG
 * ---------------------------------------------------------------------- */

/**
 * Berechnet SHA256-Hash einer Datei
 */
function hashFile(string $path): string
{
    if (!is_file($path)) {
        error('FILE_NOT_FOUND', 'File not found', 404);
    }

    $hash = hash_file('sha256', $path);
    if ($hash === false) {
        error('IO_ERROR', 'Hashing failed', 500);
    }

    return 'sha256:' . $hash;
}

/**
 * Prüft gespeicherten Hash gegen Datei
 */
function validateHash(string $path, string $expected): void
{
    if (hashFile($path) !== $expected) {
        error('HASH_MISMATCH', 'Backup integrity check failed', 409);
    }
}

/* ----------------------------------------------------------------------
 * VERSIONIERUNG
 * ---------------------------------------------------------------------- */

/**
 * Ermittelt nächste Versions-ID (v0001, v0002, …)
 */
function nextVersionId(array $versions): string
{
    $max = 0;

    foreach ($versions as $v) {
        if (!empty($v['id']) && preg_match('/^v(\d{4})$/', $v['id'], $m)) {
            $max = max($max, (int)$m[1]);
        }
    }

    return 'v' . str_pad((string)($max + 1), 4, '0', STR_PAD_LEFT);
}

/* ----------------------------------------------------------------------
 * RETENTION
 * ---------------------------------------------------------------------- */

/**
 * Entfernt alte Versionen über dem Limit.
 * Löscht auch die zugehörigen Dateien.
 */
function applyRetention(array &$versions, int $max): void
{
    global $BACKUPS;

    if (count($versions) <= $max) return;

    usort($versions, fn($a, $b) =>
        strcmp($a['createdAt'], $b['createdAt'])
    );

    while (count($versions) > $max) {
        $old = array_shift($versions);
        if (!empty($old['file'])) {
            $file = $BACKUPS . '/' . $old['file'];
            if (is_file($file)) {
                @unlink($file);
            }
        }
    }
}
