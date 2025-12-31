<?php
header("Content-Type: text/plain");

echo "__DIR__              = " . __DIR__ . "\n";
echo "DOCUMENT_ROOT        = " . $_SERVER["DOCUMENT_ROOT"] . "\n";
echo "realpath(DOC_ROOT)   = " . realpath($_SERVER["DOCUMENT_ROOT"]) . "\n";
echo "exists(DOC_ROOT/data)= " . (is_dir($_SERVER["DOCUMENT_ROOT"] . "/data") ? "yes" : "no") . "\n";
echo "realpath(DATA)       = " . realpath($_SERVER["DOCUMENT_ROOT"] . "/data") . "\n";
