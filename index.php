<?php

declare(strict_types=1);

require_once __DIR__ . '/php/bootstrap.php';

try {
    $settings = Settings::load();
    Router::dispatch($settings);
} catch (Throwable $e) {
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
    }
    echo '{"error":"internal"}';
}
