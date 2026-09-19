<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/php/bootstrap.php';

$fixture = dirname(__DIR__, 2) . '/content/tests/fixtures/hybrid_8x8';
assert(is_file($fixture . '/pack.json'));

$crop = Visual::cropU16(null, 8, 8, 0, 0, 4, 4);
assert(strlen($crop) === 4 * 4 * 2);

$raw = '';
for ($i = 0; $i < 8 * 8; $i++) {
    $raw .= pack('v', $i);
}
$win = Visual::cropU16($raw, 8, 8, 2, 1, 3, 2);
assert(strlen($win) === 3 * 2 * 2);
$u0 = unpack('v', substr($win, 0, 2))[1];
assert($u0 === (1 * 8 + 2));

$doc = Visual::window($fixture, [
    'map' => 'room',
    'z' => 0,
    'x' => 0,
    'y' => 0,
    'w' => 8,
    'h' => 8,
]);
assert($doc['ok'] === true);
assert($doc['present'] === true);
assert($doc['mapId'] === 'room');
assert($doc['width'] === 8);
assert($doc['height'] === 8);
assert(!array_key_exists('spawns', $doc));
assert(!array_key_exists('world', $doc));
assert(isset($doc['layers']['ground']));
$ground = base64_decode($doc['layers']['ground'], true);
assert(is_string($ground) && strlen($ground) === 8 * 8 * 2);
$json = json_encode($doc);
assert($json !== false);
assert(!str_contains($json, '"spawns"'));
assert(!str_contains($json, 'creatureId'));

$missing = Visual::window($fixture, ['map' => 'room', 'z' => 7, 'w' => 8, 'h' => 8]);
assert($missing['present'] === false);

$threw = false;
try {
    Visual::window($fixture, ['map' => 'room', 'z' => 0, 'w' => 200, 'h' => 8]);
} catch (InvalidArgumentException $e) {
    $threw = true;
}
assert($threw);

$live = Settings::resolveContentPath(Settings::load([
    'root' => APP_ROOT,
    'env' => [],
    'localPath' => sys_get_temp_dir() . '/frontend-no-local-settings.json',
]));
if (is_file($live . '/maps/firstlight_isle/hybrid/floor-06/map.json')) {
    $plaza = Visual::window($live, [
        'map' => 'firstlight_isle',
        'z' => 6,
        'x' => 64,
        'y' => 116,
        'w' => 32,
        'h' => 32,
    ]);
    assert($plaza['present'] === true);
    assert($plaza['width'] === 32);
    assert($plaza['height'] === 32);
    assert($plaza['mapCols'] === 225);
    assert($plaza['genre'] === 'rpg_fantasy');
    assert(!array_key_exists('spawns', $plaza));
    $water = null;
    foreach ($plaza['palette'] as $slot) {
        if (is_array($slot) && ($slot['catalogId'] ?? '') === 'ref_water_fill') {
            $water = $slot;
            break;
        }
    }
    assert($water !== null, 'plaza palette includes ref_water_fill');
    assert(isset($water['anim']['frames']) && (int) $water['anim']['frames'] > 1, 'water tiles carry cycling anim');
    $bytes = 0;
    foreach ($plaza['layers'] as $b64) {
        $bytes += strlen(base64_decode($b64, true) ?: '');
    }
    assert($bytes === 32 * 32 * 2 * 5);
    assert($bytes < 225 * 198 * 2);
}

fwrite(STDOUT, "ok visual\n");
