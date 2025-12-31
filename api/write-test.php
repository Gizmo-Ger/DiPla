<?php
header("Content-Type: text/plain");

$root = realpath(__DIR__ . "/..");     // /var/www/html
$data = $root . "/data";
$testDir = $data . "/_test_write";
$testFile = $testDir . "/probe.txt";

echo "ROOT: $root\n";
echo "DATA: $data\n";

echo "Creating dir: $testDir\n";
$ok1 = mkdir($testDir, 0775, true);
echo "mkdir result: "; var_dump($ok1);

echo "is_dir? "; var_dump(is_dir($testDir));

echo "Writing file: $testFile\n";
$ok2 = file_put_contents($testFile, "TEST");
echo "file_put_contents result: "; var_dump($ok2);

echo "is_file? "; var_dump(is_file($testFile));
