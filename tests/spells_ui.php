<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/php/bootstrap.php';

$raw = [
    'spells' => [
        [
            'id' => 'snap_jab',
            'label' => 'Snap Jab',
            'mana' => 3,
            'level' => 1,
            'vocations' => ['mystic'],
            'range' => 1,
            'requiresTarget' => true,
            'isMelee' => true,
            'cooldowns' => ['primary' => ['attack' => 2]],
            'customUISprite' => 'snap_jab',
            'powerCurve' => 'melee_strike',
            'basePower' => 12,
            'damageAmplitude' => 0.1726,
            'delayed' => ['fuse' => 1],
            'field' => ['damage' => 10],
        ],
        [
            'id' => 'ice_wave',
            'label' => 'Ice Wave',
            'shape' => ['type' => 'wave', 'spread' => 2, 'length' => 4],
            'powerCurve' => 'magic_strike',
        ],
        [
            'id' => 'magic_patch',
            'kind' => 'heal',
            'requiresTarget' => false,
            'selfTarget' => true,
            'mana' => 6,
            'powerCurve' => 'magic_strike',
        ],
        [
            'id' => 'heal_light',
            'kind' => 'heal',
            'requiresTarget' => false,
            'mana' => 20,
        ],
        [
            'id' => 'heal_friend',
            'kind' => 'heal',
            'requiresTarget' => true,
            'allowOnSelf' => false,
        ],
    ],
];

$ui = Router::spellsUi($raw);
assert(isset($ui['spells']) && is_array($ui['spells']));
assert($ui['spells'][0]['id'] === 'snap_jab');
assert($ui['spells'][0]['label'] === 'Snap Jab');
assert($ui['spells'][0]['mana'] === 3);
assert($ui['spells'][0]['cooldowns']['primary']['attack'] === 2);
assert(!array_key_exists('powerCurve', $ui['spells'][0]));
assert(!array_key_exists('basePower', $ui['spells'][0]));
assert(!array_key_exists('damageAmplitude', $ui['spells'][0]));
assert(!array_key_exists('delayed', $ui['spells'][0]));
assert(!array_key_exists('field', $ui['spells'][0]));
assert($ui['spells'][1]['shape'] === ['type' => 'wave']);
assert(!isset($ui['spells'][1]['shape']['spread']));
assert(($ui['spells'][2]['selfTarget'] ?? null) === true);
assert(($ui['spells'][2]['kind'] ?? null) === 'heal');
assert(!array_key_exists('powerCurve', $ui['spells'][2]));
assert(($ui['spells'][3]['selfTarget'] ?? null) === true);
assert(($ui['spells'][4]['allowOnSelf'] ?? null) === false);
assert(!array_key_exists('selfTarget', $ui['spells'][4]));

$liveFile = dirname(__DIR__, 2) . '/content/spells.json';
if (is_file($liveFile)) {
    $live = json_decode((string) file_get_contents($liveFile), true);
    $filtered = Router::spellsUi($live);
    $buf = json_encode($filtered);
    assert(is_string($buf));
    assert(!str_contains($buf, 'powerCurve'));
    assert(!str_contains($buf, 'basePower'));
    assert(!str_contains($buf, 'damageAmplitude'));
    $found = false;
    foreach ($filtered['spells'] as $sp) {
        if (($sp['id'] ?? '') === 'snap_jab') {
            $found = true;
            assert(($sp['cooldowns']['primary']['attack'] ?? null) === 2);
        }
    }
    assert($found);
}

$classesRaw = [
    'classes' => [
        [
            'id' => 'mystic',
            'spells' => ['snap_jab', 'fang_clash', 'melee_auto'],
            'critChance' => 5,
            'baseHp' => 185,
            'skillRates' => ['melee' => 1.5],
        ],
    ],
];
$cui = Router::classesUi($classesRaw);
assert($cui['classes'][0]['id'] === 'mystic');
assert($cui['classes'][0]['spells'][0] === 'snap_jab');
assert(!array_key_exists('critChance', $cui['classes'][0]));
assert(!array_key_exists('baseHp', $cui['classes'][0]));
assert(!array_key_exists('skillRates', $cui['classes'][0]));

$liveClasses = dirname(__DIR__, 2) . '/content/classes.json';
if (is_file($liveClasses)) {
    $liveC = json_decode((string) file_get_contents($liveClasses), true);
    $filteredC = Router::classesUi($liveC);
    $bufC = json_encode($filteredC);
    assert(is_string($bufC));
    assert(!str_contains($bufC, 'critChance'));
    assert(!str_contains($bufC, 'baseHp'));
    assert(!str_contains($bufC, 'powerCurve'));
    $mystic = null;
    foreach ($filteredC['classes'] as $row) {
        if (($row['id'] ?? '') === 'mystic') {
            $mystic = $row;
        }
    }
    assert(is_array($mystic));
    assert(($mystic['spells'][0] ?? '') === 'snap_jab');
}

echo "ok spells_ui.php\n";
