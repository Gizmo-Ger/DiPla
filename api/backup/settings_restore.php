<?php
declare(strict_types=1);

/**
 * ======================================================================
 * settings_restore.php
 * ----------------------------------------------------------------------
 * Stellt eine bestehende Settings-Backup-Version wieder her.
 *
 * Regeln:
 * - Restore erzeugt KEIN neues Backup
 * - index.json bleibt unverändert
 * - Produktivdatei wird atomar ersetzt
 * - Exklusiver Lock
 * ======================================================================
 */

require_once __DIR__ . '/_lib.php';

/* ----------------------------------------------------------------------
 * METHOD & INPUT
 * ---------------------------------------------------------------------- */
requirePost();
$in = getJsonInput();

$version = (string)($in['version'] ?? '');
if (!preg_match('/^v\d{4}$/', $version)) {
    error('INVALID_INPUT', 'Invalid version', 400);
}

/* ----------------------------------------------------------------------
 * KRITISCHER ABSCHNITT
 * ---------------------------------------------------------------------- */
$lock = acquireLock(true);

try {
    $index = loadIndex();

    if (
        !isset($index['settings']) ||
        !is_array($index['settings']['versions'] ?? null)
    ) {
        error('INDEX_CORRUPT', 'Invalid settings index structure', 500);
    }

    $entry = null;
    foreach ($index['settings']['versions'] as $v) {
        if (($v['id'] ?? '') === $version) {
            $entry = $v;
            break;
        }
    }

    if (!$entry) {
        error('NOT_FOUND', 'Settings backup version not found', 404);
    }

    $src = $BACKUPS . '/' . $entry['file'];

    // Sicherheitscheck: Backup-Datei muss innerhalb BACKUPS liegen
    $base = realpath($BACKUPS);
    $file = realpath($src);
    if (!$file || !$base || strpos($file, $base) !== 0) {
        error('SECURITY_ERROR', 'Invalid backup file path', 403);
    }

    validateHash($file, (string)$entry['hash']);

    $content = file_get_contents($file);
    if ($content === false) {
        error('IO_ERROR', 'Cannot read backup file', 500);
    }

    atomicWrite($DATA . '/settings.json', $content);

} finally {
    releaseLock($lock);
}

/* ----------------------------------------------------------------------
 * RESPONSE
 * ---------------------------------------------------------------------- */
success(
    ['version' => $version],
    'Settings restored successfully'
);
