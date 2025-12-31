<?php
declare(strict_types=1);

/**
 * ======================================================================
 * month_create.php
 * ----------------------------------------------------------------------
 * Erstellt ein Backup für einen einzelnen Monatsplan (YYYY-MM).
 *
 * Regeln:
 * - Produktivdaten bleiben unverändert
 * - index.json ist Single Source of Truth
 * - Versionierung vXXXX pro Monat
 * - Exklusiver Lock
 * ======================================================================
 */

require_once __DIR__ . '/_lib.php';

/* ----------------------------------------------------------------------
 * METHOD & INPUT
 * ---------------------------------------------------------------------- */
requirePost();
$in = getJsonInput();

$year    = $in['year']  ?? null;
$month   = $in['month'] ?? null;
$comment = trim((string)($in['comment'] ?? ''));
$type    = 'manual';

if (!is_int($year) || $year < 2000 || $year > 2100) {
    error('INVALID_INPUT', 'Invalid year', 400);
}
if (!is_int($month) || $month < 1 || $month > 12) {
    error('INVALID_INPUT', 'Invalid month', 400);
}
if (strlen($comment) > 300) {
    error('INVALID_INPUT', 'Comment too long', 400);
}

/* ----------------------------------------------------------------------
 * PRODUKTIVDATEI
 * ---------------------------------------------------------------------- */
$key = sprintf('%04d-%02d', $year, $month);
$src = $DATA . "/$year/$month.json";

if (!is_file($src)) {
    error('FILE_NOT_FOUND', "Month plan not found: $key", 404);
}

/* ----------------------------------------------------------------------
 * KRITISCHER ABSCHNITT
 * ---------------------------------------------------------------------- */
$lock = acquireLock(true);

try {
    $index = loadIndex();

    if (!isset($index['months'][$key])) {
        $index['months'][$key] = [
            'year'     => $year,
            'month'    => $month,
            'latest'   => null,
            'versions' => []
        ];
    }

    $set =& $index['months'][$key];
    $vid = nextVersionId($set['versions']);

    /* --------------------------------------------------------------
     * Zielpfad: /backups/months/YYYY-MM/vXXXX.json
     * -------------------------------------------------------------- */
    $dir = $BACKUPS . "/months/$key";
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        error('IO_ERROR', 'Cannot create month backup directory', 500);
    }

    $rel = "months/$key/$vid.json";
    $abs = $BACKUPS . '/' . $rel;

    atomicWrite($abs, file_get_contents($src));
    $hash = hashFile($abs);

    /* --------------------------------------------------------------
     * Index aktualisieren
     * -------------------------------------------------------------- */
    $set['versions'][] = [
        'id'        => $vid,
        'file'      => $rel,
        'createdAt' => date(DATE_ATOM),
        'type'      => $type,
        'source'    => 'month',
        'comment'   => $comment,
        'hash'      => $hash,
        'valid'     => true
    ];

    applyRetention(
        $set['versions'],
        $index['policy']['monthMaxPerSet'] ?? 10
    );

    $set['latest'] =
        !empty($set['versions'])
            ? end($set['versions'])['id']
            : null;

    saveIndex($index);

} finally {
    releaseLock($lock);
}

/* ----------------------------------------------------------------------
 * RESPONSE
 * ---------------------------------------------------------------------- */
success(
    ['key' => $key, 'version' => $vid],
    'Month backup created'
);
