<?php
declare(strict_types=1);

/**
 * ======================================================================
 * available_months.php
 * ----------------------------------------------------------------------
 * Liefert alle verfügbaren Produktiv-Monatspläne aus ./data/YYYY/MM.json
 *
 * Eigenschaften:
 * - READ ONLY
 * - Shared Lock
 * - Keine Abhängigkeit vom Backup-Index
 * - Keine JSON-Validierung der Monatsdateien
 *
 * Rückgabe:
 * {
 *   status: "success",
 *   message: "...",
 *   data: [
 *     { year: 2025, month: 12 },
 *     ...
 *   ]
 * }
 * ======================================================================
 */

require_once __DIR__ . '/_lib.php';

/* ----------------------------------------------------------------------
 * METHOD CHECK
 * ---------------------------------------------------------------------- */
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    error('INVALID_METHOD', 'GET required', 405);
}

global $DATA;

/* ----------------------------------------------------------------------
 * KRITISCHER ABSCHNITT – READ LOCK
 * ---------------------------------------------------------------------- */
$lock = acquireLock(false); // shared lock
try {
    $months = [];

    if (is_dir($DATA)) {
        foreach (scandir($DATA) as $y) {

            // YYYY
            if (!preg_match('/^\d{4}$/', $y)) {
                continue;
            }

            $yearDir = $DATA . '/' . $y;
            if (!is_dir($yearDir)) {
                continue;
            }

            // MM.json
            foreach (glob($yearDir . '/*.json') as $file) {
                $base = basename($file, '.json');

                if (!preg_match('/^\d{1,2}$/', $base)) {
                    continue;
                }

                $month = (int)$base;
                if ($month < 1 || $month > 12) {
                    continue;
                }

                $months[] = [
                    'year'  => (int)$y,
                    'month' => $month,
                ];
            }
        }
    }

    // Chronologisch sortieren
    usort(
        $months,
        fn ($a, $b) =>
            $a['year'] === $b['year']
                ? $a['month'] <=> $b['month']
                : $a['year'] <=> $b['year']
    );

} finally {
    releaseLock($lock);
}

/* ----------------------------------------------------------------------
 * RESPONSE
 * ---------------------------------------------------------------------- */
success($months, 'Available months loaded');
