<?php
declare(strict_types=1);

/**
 * ======================================================================
 * month_restore.php
 * ----------------------------------------------------------------------
 * Stellt eine einzelne Monatsplan-Backup-Version wieder her.
 *
 * Regeln:
 * - KEIN neues Backup
 * - index.json bleibt unverändert
 * - Hash wird vor Restore geprüft
 * - Produktivdatei wird atomar ersetzt
 * ======================================================================
 */

require_once __DIR__ . '/_lib.php';

/* ----------------------------------------------------------------------
 * METHOD & INPUT
 * ---------------------------------------------------------------------- */
requirePost();
$in = getJsonInput();

$year    = $in['year']    ?? null;
$month   = $in['month']   ?? null;
$version = (string)($in['version'] ?? '');

if (!is_int($year) || $year < 2000 || $year > 2100) {
    error('INVALID_INPUT', 'Invalid year', 400);
}
if (!is_int($month) || $month < 1 || $month > 12) {
    error('INVALID_INPUT', 'Invalid month', 400);
}
if (!preg_match('/^v\d{4}$/', $version)) {
    error('INVALID_INPUT', 'Invalid version', 400);
}

$key = sprintf('%04d-%02d', $year, $month);

/* ----------------------------------------------------------------------
 * KRITISCHER ABSCHNITT
 * ---------------------------------------------------------------------- */
$lock = acquireLock(true);

try {
    $index = loadIndex();

    if (!isset($index['months'][$key])) {
        error('NOT_FOUND', 'Month backup set not found', 404);
    }

    $entry = null;
    foreach ($index['months'][$key]['versions'] as $v) {
        if (($v['id'] ?? '') === $version) {
            $entry = $v;
            break;
        }
    }

    if (!$entry) {
        error('NOT_FOUND', 'Month backup version not found', 404);
    }

    if (($entry['valid'] ?? true) !== true) {
        error('INVALID_BACKUP', 'Backup marked as invalid', 409);
    }

    $rel = (string)$entry['file'];
    $src = realpath($BACKUPS . '/' . $rel);

    if (!$src || strpos($src, realpath($BACKUPS)) !== 0) {
        error('SECURITY_ERROR', 'Invalid backup path', 403);
    }

    validateHash($src, (string)$entry['hash']);

    $targetDir = $DATA . "/$year";
    if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true)) {
        error('IO_ERROR', 'Cannot create year directory', 500);
    }

    $content = file_get_contents($src);
    if ($content === false) {
        error('IO_ERROR', 'Cannot read backup file', 500);
    }

    atomicWrite("$targetDir/$month.json", $content);

} finally {
    releaseLock($lock);
}

/* ----------------------------------------------------------------------
 * RESPONSE
 * ---------------------------------------------------------------------- */
success(
    [
        'key'     => $key,
        'version' => $version
    ],
    'Month backup restored'
);
