<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/php/bootstrap.php';

$nested = Settings::deepMerge(
    ['gameOrigin' => 'http://127.0.0.1:8081', 'limits' => ['a' => 1], 'vocations' => ['a']],
    ['limits' => ['b' => 2], 'vocations' => ['b', 'c']]
);
assert($nested['gameOrigin'] === 'http://127.0.0.1:8081');
assert($nested['limits']['a'] === 1);
assert($nested['limits']['b'] === 2);
assert($nested['vocations'] === ['b', 'c']);

$committed = Settings::load([
    'root' => APP_ROOT,
    'env' => [],
    'localPath' => sys_get_temp_dir() . '/frontend-no-local-settings.json',
]);
assert($committed['httpPort'] === 8080);
assert($committed['gameOrigin'] === 'http://127.0.0.1:8081');
assert($committed['proxyApi'] === true);
assert($committed['contentPath'] === '../content');
assert(in_array('adept', $committed['vocations'], true));
assert(!array_key_exists('mysql', $committed));

$dir = sys_get_temp_dir() . '/fe-settings-' . bin2hex(random_bytes(4));
mkdir($dir . '/config', 0775, true);
file_put_contents($dir . '/config/settings.json', json_encode([
    'bind' => '0.0.0.0',
    'httpPort' => 8080,
    'proxyApi' => true,
    'gameOrigin' => 'http://127.0.0.1:8081',
    'limits' => ['proxyTimeoutMs' => 15000],
], JSON_PRETTY_PRINT) . "\n");
file_put_contents($dir . '/config/settings.local.json', json_encode([
    'httpPort' => 8099,
    'logLevel' => 'debug',
], JSON_PRETTY_PRINT) . "\n");

try {
    $s = Settings::load([
        'root' => $dir,
        'env' => [
            'FRONTEND_GAME_ORIGIN' => 'http://127.0.0.1:9000',
            'FRONTEND_BIND' => '127.0.0.1',
        ],
    ]);
    assert($s['gameOrigin'] === 'http://127.0.0.1:9000');
    assert($s['bind'] === '127.0.0.1');
    assert($s['httpPort'] === 8099);
    assert($s['logLevel'] === 'debug');
    Settings::assertBoot($s);
    $redacted = Settings::redact(['mysql' => ['password' => 'LEAK'], 'gameOrigin' => $s['gameOrigin']]);
    assert($redacted['mysql']['password'] === '***');
} finally {
    unlink($dir . '/config/settings.json');
    unlink($dir . '/config/settings.local.json');
    rmdir($dir . '/config');
    rmdir($dir);
}

$threw = false;
try {
    Settings::assertBoot(['httpPort' => 8080, 'proxyApi' => true, 'gameOrigin' => 'not-a-url']);
} catch (Throwable) {
    $threw = true;
}
assert($threw);

$threw = false;
try {
    Settings::assertBoot(['httpPort' => 8080, 'proxyApi' => true, 'gameOrigin' => 'ftp://x']);
} catch (Throwable) {
    $threw = true;
}
assert($threw);

fwrite(STDOUT, "ok load_settings\n");
