<?php
// ===========================================================
// respond.php – Einheitliche API-Antwort + Logging
// ===========================================================

require_once __DIR__ . '/logger.php';

/**
 * Einheitliche JSON-Antwort
 *
 * @param int   $statusCode HTTP-Statuscode
 * @param mixed $payload    Array oder Skalar, der als JSON gesendet wird
 * @param array $meta       Zusätzliche Log-Metadaten
 */
function respond(int $statusCode, $payload, array $meta = []): void
{
    http_response_code($statusCode);

    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');

    $json = json_encode(
        $payload,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );

    $path   = $_SERVER['REQUEST_URI']    ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? '';

    $logPayload = [
        'status' => $statusCode,
        'method' => $method,
        'path'   => $path,
    ];

    if (is_array($payload)) {
        if (isset($payload['error'])) {
            $logPayload['error'] = $payload['error'];
        }
        if (isset($payload['status'])) {
            $logPayload['payloadStatus'] = $payload['status'];
        }
        $logPayload['_meta'] = array_merge($meta, [
            'keys' => array_slice(array_keys($payload), 0, 8),
        ]);
    } else {
        $logPayload['_meta'] = $meta;
    }

    log_event("HTTP-$statusCode RESPONSE", $logPayload);

    if ($json === false) {
        echo '{"error":"encoding_failed"}';
    } else {
        echo $json;
    }
    exit;
}
