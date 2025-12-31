<?php
declare(strict_types=1);

/**
 * ======================================================================
 * index.php
 * ----------------------------------------------------------------------
 * Liefert den aktuellen Backup-Index (index.json).
 *
 * Eigenschaften:
 * - READ-ONLY
 * - Shared Lock (LOCK_SH)
 * - Keine Strukturänderung, keine Validierung, kein Rewriting
 * - index.json ist die einzige Wahrheit
 *
 * Zweck:
 * - Frontend erhält vollständige Backup-Historie
 * - Grundlage für Anzeigen, Restore-Buttons, Delete-Logik
 * ======================================================================
 */

require_once __DIR__ . '/_lib.php';

/* ----------------------------------------------------------------------
 * KRITISCHER ABSCHNITT – READ LOCK
 * ---------------------------------------------------------------------- */

$lock = acquireLock(false); // shared lock
try {
    $index = loadIndex();
} finally {
    releaseLock($lock);
}

/* ----------------------------------------------------------------------
 * RESPONSE
 * ----------------------------------------------------------------------
 * Einheitliches API-Format:
 * {
 *   status: "success",
 *   message: "...",
 *   data: { index.json }
 * }
 * ---------------------------------------------------------------------- */

success($index, 'Backup index loaded');
