<?php
// ===========================================================
// list-settings-modules.php
// Liefert alle Settings-Module als Dateiliste zurück
// ===========================================================

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

$baseDir = realpath(__DIR__ . '/../js/ui/settings');
if ($baseDir === false) {
    echo json_encode([]);
    exit;
}

$files = glob($baseDir . '/*.js');
$out = [];

foreach ($files as $path) {
    $name = basename($path);
    // Nur JS-Dateien zurückgeben
    if (substr($name, -3) === '.js') {
        $out[] = $name;
    }
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
exit;
