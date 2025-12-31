<?php
// Datei: admin_lock.php

define('ADMIN_LOCK_FILE', __DIR__ . '/admin.lock');
define('ADMIN_LOCK_TTL', 1800); // 30 Minuten

function getAdminLock(): ?array {
    if (!file_exists(ADMIN_LOCK_FILE)) return null;

    $lock = json_decode(file_get_contents(ADMIN_LOCK_FILE), true);
    if (!is_array($lock) || empty($lock['userId']) || empty($lock['since'])) {
        clearAdminLock();
        return null;
    }

    if ((time() - (int)$lock['since']) > ADMIN_LOCK_TTL) {
        clearAdminLock();
        return null;
    }

    return $lock;
}

function setAdminLock(string $userId): void {
    file_put_contents(
        ADMIN_LOCK_FILE,
        json_encode([
            'userId' => $userId,
            'since'  => time()
        ], JSON_PRETTY_PRINT),
        LOCK_EX
    );
}

// 🔹 NEU: Lock verlängern
function refreshAdminLock(string $userId): bool {
    $lock = getAdminLock();
    if (!$lock) return false;

    if ($lock['userId'] !== $userId) return false;

    setAdminLock($userId);
    return true;
}

function clearAdminLock(): void {
    if (file_exists(ADMIN_LOCK_FILE)) {
        unlink(ADMIN_LOCK_FILE);
    }
}
