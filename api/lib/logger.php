<?php
// ===========================================================
// logger.php – Zentrales Logging ins Backend-Logfile
// - Schreibt kompakte Metadaten, keine großen Payloads
// ===========================================================

function log_event(string $title, $data = null): void
{
    static $logFile = null;

    if ($logFile === null) {
        $dir = __DIR__ . '/../logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $logFile = $dir . '/app.log';
    }

    $ts  = date('Y-m-d H:i:s');
    $row = "[$ts] [$title]";

    if ($data !== null) {
        $summary = $data;

        if (is_array($data)) {
            $summary = [];

            if (isset($data['status'])) {
                $summary['status'] = $data['status'];
            }
            if (isset($data['error'])) {
                $summary['error'] = $data['error'];
            }
            if (isset($data['path'])) {
                $summary['path'] = $data['path'];
            }
            if (isset($data['method'])) {
                $summary['method'] = $data['method'];
            }
            if (!empty($data['_meta']) && is_array($data['_meta'])) {
                $summary['_meta'] = $data['_meta'];
            }
        }

        $json = json_encode(
            $summary,
            JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
        );
        if ($json !== false) {
            $row .= ' ' . $json;
        }
    }

    $row .= "\n";

    // Best effort – Fehler im Logging sollen eigentliche API nicht killen
    @file_put_contents($logFile, $row, FILE_APPEND);
}
