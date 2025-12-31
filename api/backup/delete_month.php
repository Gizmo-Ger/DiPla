<?php
declare(strict_types=1);

/**
 * ======================================================================
 * delete_month.php
 * ----------------------------------------------------------------------
 * Löscht eine einzelne Monatsplan-Backup-Version.
 *
 * Regeln:
 * - NUR Backup-Dateien
 * - KEINE Produktivdaten
 * - index.json ist Single Source of Truth
 * - Letzte Version darf NICHT gelöscht werden
 * - Exklusiver Lock
 * ======================================================================
 */

require_once __DIR__ . '/_lib.php';

/* ----------------------------------------------------------------------
 * METHOD & INPUT
 * ---------------------------------------------------------------------- */
requirePost();
$input = getJsonInput();

$key     = $input['key']     ?? null; // YYYY-MM
$version = $input['version'] ?? null;

if (!is_string($key) || !preg_match('/^\d{4}-\d{2}$/', $key)) {
    error('INVALID_INPUT', 'Invalid month key', 400);
}

if (!is_string($version) || !preg_match('/^v\d{4}$/', $version)) {
    error('INVALID_INPUT', 'Invalid version', 400);
}

/* ----------------------------------------------------------------------
 * KRITISCHER ABSCHNITT
 * ---------------------------------------------------------------------- */
$lock = acquireLock(true);

try {
    $index = loadIndex();

    if (!isset($index['months'][$key])) {
        error('NOT_FOUND', 'Month backup set not found', 404);
    }

    $set =& $index['months'][$key];

    if (count($set['versions']) <= 1) {
        error(
            'FORBIDDEN',
            'Cannot delete the last remaining backup version',
            403
        );
    }

    $file = null;
    $newVersions = [];

    foreach ($set['versions'] as $v) {
        if ($v['id'] === $version) {
            $file = $v['file'] ?? null;
            continue;
        }
        $newVersions[] = $v;
    }

    if (!$file) {
        error('NOT_FOUND', 'Backup version not found', 404);
    }

    /* --------------------------------------------------------------
     * Datei löschen (sicherer Pfad)
     * -------------------------------------------------------------- */
    $abs = realpath($BACKUPS . '/' . $file);
    $base = realpath($BACKUPS);

    if (!$abs || strpos($abs, $base) !== 0) {
        error('SECURITY', 'Invalid backup file path', 500);
    }

    if (is_file($abs) && !unlink($abs)) {
        error('IO_ERROR', 'Failed to delete backup file', 500);
    }

    /* --------------------------------------------------------------
     * Index aktualisieren
     * -------------------------------------------------------------- */
    $set['versions'] = array_values($newVersions);
    $set['latest']   = end($set['versions'])['id'] ?? null;

    saveIndex($index);

} finally {
    releaseLock($lock);
}

/* ----------------------------------------------------------------------
 * RESPONSE
 * ---------------------------------------------------------------------- */
success([
    'key'     => $key,
    'version' => $version,
], 'Month backup version deleted');
