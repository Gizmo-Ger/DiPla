<?php
declare(strict_types=1);

/**
 * ======================================================================
 * settings_create.php
 * ----------------------------------------------------------------------
 * Erzeugt ein neues Backup der settings.json.
 *
 * Regeln:
 * - Vollständiges Backup
 * - Produktivdatei bleibt unverändert
 * - index.json ist Single Source of Truth
 * - Exklusiver Lock
 * ======================================================================
 */

require_once __DIR__ . '/_lib.php';

/* ----------------------------------------------------------------------
 * METHOD & INPUT
 * ---------------------------------------------------------------------- */
requirePost();
$in = getJsonInput();

$comment = trim((string)($in['comment'] ?? ''));
$type    = 'manual';

if (strlen($comment) > 300) {
    error('INVALID_INPUT', 'Comment too long', 400);
}

$src = $DATA . '/settings.json';
if (!is_file($src)) {
    error('FILE_NOT_FOUND', 'settings.json not found', 404);
}

/* ----------------------------------------------------------------------
 * KRITISCHER ABSCHNITT
 * ---------------------------------------------------------------------- */
$lock = acquireLock(true);

try {
    $index = loadIndex();

    $vid = nextVersionId($index['settings']['versions']);

    $dir = $BACKUPS . '/settings';
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        error('IO_ERROR', 'Cannot create backups/settings directory', 500);
    }

    $rel = "settings/$vid.json";
    $abs = $BACKUPS . '/' . $rel;

    // Sicherheitscheck: Ziel liegt innerhalb von BACKUPS
    $base = realpath($BACKUPS);
    $targetDir = realpath(dirname($abs));
    if (!$base || !$targetDir || strpos($targetDir, $base) !== 0) {
        error('SECURITY_ERROR', 'Invalid backup path', 403);
    }

    $content = file_get_contents($src);
    if ($content === false) {
        error('IO_ERROR', 'Cannot read settings.json', 500);
    }

    atomicWrite($abs, $content);

    $hash = hashFile($abs);

    $index['settings']['versions'][] = [
        'id'        => $vid,
        'file'      => $rel,
        'createdAt' => date(DATE_ATOM),
        'type'      => $type,
        'source'    => 'settings',
        'comment'   => $comment,
        'hash'      => $hash,
        'valid'     => true
    ];

    $index['settings']['latest'] = $vid;

    applyRetention(
        $index['settings']['versions'],
        $index['policy']['settingsMax'] ?? 50
    );

    if (!empty($index['settings']['versions'])) {
        $index['settings']['latest'] =
            end($index['settings']['versions'])['id'];
    }

    saveIndex($index);

} finally {
    releaseLock($lock);
}

/* ----------------------------------------------------------------------
 * RESPONSE
 * ---------------------------------------------------------------------- */
success(
    ['version' => $vid],
    'Settings backup created'
);
