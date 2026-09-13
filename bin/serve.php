<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/php/bootstrap.php';

$settings = Settings::load();
Settings::assertBoot($settings);

$bind = (string) ($settings['bind'] ?? '127.0.0.1');
$port = (int) ($settings['httpPort'] ?? 8080);
$router = dirname(__DIR__) . '/index.php';

$cmd = [
    PHP_BINARY,
    '-S',
    $bind . ':' . $port,
    $router,
];

fwrite(STDOUT, json_encode([
    'ts' => gmdate('c'),
    'level' => 'info',
    'msg' => 'listen',
    'bind' => $bind,
    'port' => $port,
    'gameOrigin' => $settings['gameOrigin'] ?? '',
], JSON_UNESCAPED_SLASHES) . "\n");

passthru(implode(' ', array_map('escapeshellarg', $cmd)), $code);
exit($code);
