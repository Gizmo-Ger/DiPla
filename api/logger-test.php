<?php
require_once __DIR__ . '/lib/logger.php';

log_event("LOGGER OK", ["test" => "backend"]);

echo "PHP OK – logger.php loaded – log_event() executed.";