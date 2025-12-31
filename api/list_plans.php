<?php
header("Content-Type: application/json; charset=utf-8");

$baseDir = __DIR__ . "/../data";

$result = [];

$years = glob($baseDir . "/*", GLOB_ONLYDIR);

foreach ($years as $yDir) {
    $year = basename($yDir);
    $files = glob("$yDir/*.json");

    foreach ($files as $file) {
        $month = basename($file, ".json");

        $result[] = [
            "year"  => $year,
            "month" => $month,
            "file"  => "data/$year/$month.json"
        ];
    }
}

echo json_encode($result);
