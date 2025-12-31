<?php
declare(strict_types=1);

/**
 * ======================================================================
 * delete_settings.php
 * ----------------------------------------------------------------------
 * Löscht eine einzelne Settings-Backup-Version.
 *
 * Regeln:
 * - NUR Backup-Dateien
 * - KEINE Änderung an /data/settings.json
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

$version = $input['version'] ?? null;

if (!is_string($version) || !preg_match('/^v\d{4}$/', $version)) {
    error('INVALID_INPUT', 'Invalid version', 400);
}

/* ----------------------------------------------------------------------
 * KRITISCHER ABSCHNITT
 * ---------------------------------------------------------------------- */
$lock = acquireLock(true);

try {
    $index = loadIndex();

    $versions =& $index['settings']['versions'];

    if (count($versions) <= 1) {
        error(
            'FORBIDDEN',
            'Cannot delete the last remaining settings backup',
            403
        );
    }

    $file = null;
    $newVersions = [];

    foreach ($versions as $v) {
        if (($v['id'] ?? null) === $version) {
            $file = $v['file'] ?? null;
            continue;
        }
        $newVersions[] = $v;
    }

    if (!$file) {
        error('NOT_FOUND', 'Settings backup version not found', 404);
    }

    /* --------------------------------------------------------------
     * Datei löschen (sicherer Pfad)
     * -------------------------------------------------------------- */
    $abs  = realpath($BACKUPS . '/' . $file);
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
    $index['settings']['versions'] = array_values($newVersions);
    $index['settings']['latest']   =
        end($index['settings']['versions'])['id'] ?? null;

    saveIndex($index);

} finally {
    releaseLock($lock);
}

/* ----------------------------------------------------------------------
 * RESPONSE
 * ---------------------------------------------------------------------- */
success(
    ['version' => $version],
    'Settings backup version deleted'
);
