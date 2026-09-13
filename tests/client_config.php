<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/php/bootstrap.php';

$copiedHop = ['connection', 'keep-alive', 'upgrade', 'transfer-encoding'];
foreach ($copiedHop as $h) {
    assert($h !== '');
}

$cfg = ClientConfig::public([
    'proxyApi' => true,
    'gameOrigin' => 'http://127.0.0.1:8081',
    'siteName' => 'Engine',
    'vocations' => ['scout'],
    'limits' => ['passwordMin' => 10, 'maxChars' => 4],
]);
assert($cfg['apiBase'] === '');
assert($cfg['wsUrl'] === 'ws://127.0.0.1:8081/v1/ws');
assert($cfg['mapId'] === 'firstlight_isle');
assert(!array_key_exists('mysql', $cfg));
assert(!array_key_exists('clientOrigin', $cfg));
assert(!str_contains(json_encode($cfg), 'password_hash'));

$direct = ClientConfig::public([
    'proxyApi' => false,
    'gameOrigin' => 'http://127.0.0.1:8081',
    'vocations' => [],
]);
assert($direct['apiBase'] === 'http://127.0.0.1:8081');

assert(ClientConfig::gameWsUrl(['gameOrigin' => 'https://play.example', 'gameWsUrl' => '']) === 'wss://play.example/v1/ws');
assert(ClientConfig::gameWsUrl(['gameOrigin' => 'http://x', 'gameWsUrl' => 'ws://custom/v1/ws']) === 'ws://custom/v1/ws');

$ok = Http::safeRel('/css/site.css', APP_STATIC);
assert($ok !== null && str_starts_with(realpath($ok) ?: $ok, realpath(APP_STATIC)));
assert(Http::safeRel('/css/../../config/settings.json', APP_STATIC) === null);
assert(Http::safeRel('/.gitignore', APP_STATIC) === null);
$index = Http::safeRel('/', APP_STATIC);
assert($index !== null && str_ends_with($index, 'index.html'));

fwrite(STDOUT, "ok client_config\n");
