<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

requirePost();

// Für Download via HTML-Form (application/x-www-form-urlencoded)
$mode = $_POST['mode'] ?? 'data_only';
if (!in_array($mode, ['data_only', 'full'], true)) fail('INVALID_INPUT', 'Invalid mode', 400);

global $DATA, $BACKUPS;

$lock = acquireLock(false);
try {
  $index = loadIndex();

  $stamp = date('Y-m-d_H-i');
  $zipName = "export_$stamp.zip";
  $tmpZip = tempnam(sys_get_temp_dir(), 'export_');

  $zip = new ZipArchive();
  if ($zip->open($tmpZip, ZipArchive::OVERWRITE) !== true) {
    fail('IO_ERROR', 'Cannot create zip archive', 500);
  }

  // Produktiv: settings.json
  if (is_file("$DATA/settings.json")) {
    $zip->addFile("$DATA/settings.json", "data/settings.json");
  }

  // Produktiv: month plans – Scan der Produktivdaten (nicht Index!)
  if (is_dir($DATA)) {
    foreach (scandir($DATA) as $y) {
      if (!preg_match('/^\d{4}$/', $y)) continue;
      $yearDir = "$DATA/$y";
      if (!is_dir($yearDir)) continue;

      foreach (glob("$yearDir/*.json") as $f) {
        $base = basename($f, '.json');
        if (!preg_match('/^\d{1,2}$/', $base)) continue;
        $zip->addFile($f, "data/$y/$base.json");
      }
    }
  }

  // Optional: Backups + Index
  if ($mode === 'full') {
    if (is_file("$BACKUPS/index.json")) $zip->addFile("$BACKUPS/index.json", "backups/index.json");

    // settings backups
    if (is_dir("$BACKUPS/settings")) {
      foreach (glob("$BACKUPS/settings/*.json") as $f) {
        $zip->addFile($f, "backups/settings/" . basename($f));
      }
    }

    // month backups gemäß index.json (Historie)
    foreach ($index['months'] as $set) {
      foreach (($set['versions'] ?? []) as $v) {
        $rel = $v['file'] ?? '';
        if (!$rel) continue;
        $abs = "$BACKUPS/$rel";
        if (is_file($abs)) $zip->addFile($abs, "backups/$rel");
      }
    }
  }

  $zip->close();

} finally {
  releaseLock($lock);
}

// Stream ZIP
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $zipName . '"');
header('Content-Length: ' . filesize($tmpZip));
readfile($tmpZip);
@unlink($tmpZip);
exit;
