'use strict';

const assert = require('assert');
const profiles = require('../static/js/action_bar_profiles.js');
const prefs = require('../static/js/prefs.js');

function resolve(opts) {
    return profiles.resolveProfile(opts);
}

function main() {
    assert.strictEqual(
        profiles.classLabel('mystic', { classes: [{ id: 'mystic', label: 'Mystic' }] }),
        'Mystic'
    );
    assert.strictEqual(
        profiles.classLabel('mystic', { classes: [{ id: 'mystic' }] }),
        'mystic'
    );
    assert.strictEqual(profiles.classLabel('scout', null), 'scout');

    const aldricDoc = { mark: 'aldric' };
    const characterHit = resolve({
        characterName: 'aldric',
        vocationId: 'mystic',
        vocationLabel: 'Mystic',
        profiles: { Aldric: aldricDoc, Mystic: { mark: 'vocation' } },
        lastProfileId: 'Mystic'
    });
    assert.strictEqual(characterHit.id, 'Aldric');
    assert.strictEqual(characterHit.created, false);
    assert.strictEqual(characterHit.profiles.Aldric, aldricDoc);

    const mysticDoc = { v: 1, bars: [{ id: 1 }] };
    const vocationInput = { Mystic: mysticDoc };
    const vocationHit = resolve({
        characterName: 'Aldric',
        vocationId: 'mystic',
        vocationLabel: 'Mystic',
        profiles: vocationInput,
        lastProfileId: 'Scout'
    });
    assert.strictEqual(vocationHit.id, 'Mystic');
    assert.strictEqual(vocationHit.created, false);
    assert.deepStrictEqual(Object.keys(vocationHit.profiles), ['Mystic']);
    assert.strictEqual(vocationHit.profiles.Mystic, mysticDoc);
    assert.deepStrictEqual(Object.keys(vocationInput), ['Mystic']);

    const aliasDoc = { v: 1, bars: [{ id: 1, slots: [{ id: 'snap_jab' }] }] };
    const aliasHit = resolve({
        characterName: 'Aldric',
        vocationId: 'mystic',
        vocationLabel: 'Wizard',
        profiles: { mystic: aliasDoc },
        lastProfileId: ''
    });
    assert.strictEqual(aliasHit.id, 'mystic');
    assert.strictEqual(aliasHit.created, false);

    const labelFold = resolve({
        characterName: 'Ned',
        vocationId: 'mystic',
        vocationLabel: 'Mystic',
        profiles: { mystic: aliasDoc },
        lastProfileId: 'Scout'
    });
    assert.strictEqual(labelFold.id, 'mystic');
    assert.strictEqual(labelFold.created, false);

    const lastHit = resolve({
        characterName: 'Ned',
        vocationId: 'mystic',
        vocationLabel: 'Mystic',
        profiles: { Scout: { v: 1, bars: [{ id: 1 }] } },
        lastProfileId: 'scout'
    });
    assert.strictEqual(lastHit.id, 'Scout');
    assert.strictEqual(lastHit.created, false);

    const seed = {
        v: 1,
        bars: [{ id: 1, slots: [{ i: 0, t: 'spell', id: 'snap_jab', k: 'F1' }] }]
    };
    const emptyInput = {};
    const seeded = resolve({
        characterName: 'Iria',
        vocationId: 'mystic',
        vocationLabel: 'Mystic',
        profiles: emptyInput,
        lastProfileId: '',
        seedDoc: seed
    });
    assert.strictEqual(seeded.id, 'Mystic');
    assert.strictEqual(seeded.created, true);
    assert.strictEqual(seeded.profiles.Mystic.bars[0].slots[0].id, 'snap_jab');
    assert.deepStrictEqual(Object.keys(emptyInput), []);
    assert.notStrictEqual(seeded.profiles.Mystic, seed);
    seed.bars[0].slots[0].id = 'changed';
    assert.strictEqual(seeded.profiles.Mystic.bars[0].slots[0].id, 'snap_jab');

    const scoutDoc = { v: 1, bars: [{ id: 1 }] };
    const createdBeside = resolve({
        characterName: 'Ned',
        vocationId: 'mystic',
        vocationLabel: 'Mystic',
        profiles: { Scout: scoutDoc },
        lastProfileId: 'Gone',
        seedDoc: seed
    });
    assert.strictEqual(createdBeside.id, 'Mystic');
    assert.strictEqual(createdBeside.created, true);
    assert.strictEqual(createdBeside.profiles.Scout, scoutDoc);

    const own = { mark: 'own' };
    const vocation = { mark: 'vocation' };
    const both = { Guardian: own, Scout: vocation };
    const before = JSON.stringify(both);
    const kept = resolve({
        characterName: 'Guardian',
        vocationId: 'scout',
        vocationLabel: 'Scout',
        profiles: both,
        lastProfileId: 'Scout'
    });
    assert.strictEqual(JSON.stringify(both), before);
    assert.strictEqual(kept.id, 'Guardian');
    assert.strictEqual(kept.created, false);
    assert.strictEqual(kept.profiles.Guardian, own);
    assert.strictEqual(kept.profiles.Scout, vocation);

    const scoutOwn = { mark: 'own' };
    const namedLikeVocation = resolve({
        characterName: 'Scout',
        vocationId: 'scout',
        vocationLabel: 'Scout',
        profiles: { Scout: scoutOwn },
        lastProfileId: ''
    });
    assert.strictEqual(namedLikeVocation.id, 'Scout');
    assert.strictEqual(namedLikeVocation.created, false);
    assert.deepStrictEqual(Object.keys(namedLikeVocation.profiles), ['Scout']);
    assert.strictEqual(namedLikeVocation.profiles.Scout, scoutOwn);

    const added = profiles.addProfile({ Mystic: { v: 1, bars: [{ id: 1 }] } }, 'Iria', { v: 1, bars: [] });
    assert.strictEqual(added.ok, true);
    assert.strictEqual(added.id, 'Iria');
    assert.ok(added.profiles.Mystic);
    assert.strictEqual(profiles.addProfile(added.profiles, 'iria', { v: 1, bars: [] }).ok, false);
    assert.strictEqual(profiles.addProfile(added.profiles, '  ', { v: 1, bars: [] }).reason, 'empty');
    const copied = profiles.copyProfile(added.profiles, 'Mystic', 'Aldric');
    assert.strictEqual(copied.ok, true);
    assert.strictEqual(copied.profiles.Aldric.bars[0].id, 1);
    assert.notStrictEqual(copied.profiles.Aldric, copied.profiles.Mystic);
    const renamed = profiles.renameProfile(copied.profiles, 'aldric', 'Nia');
    assert.strictEqual(renamed.ok, true);
    assert.strictEqual(renamed.profiles.Nia.bars[0].id, 1);
    assert.ok(!renamed.profiles.Aldric);
    assert.strictEqual(profiles.renameProfile(renamed.profiles, 'Nia', 'Mystic').reason, 'exists');
    const removed = profiles.removeProfile(renamed.profiles, 'Nia');
    assert.strictEqual(removed.ok, true);
    assert.strictEqual(removed.nextId, 'Mystic');
    assert.ok(!removed.profiles.Nia);
    const only = profiles.removeProfile({ Mystic: { v: 1, bars: [] } }, 'Mystic');
    assert.strictEqual(only.ok, false);
    assert.strictEqual(only.reason, 'last');
    assert.ok(only.profiles.Mystic);

    const none = resolve({ profiles: {}, lastProfileId: '', seedDoc: seed });
    assert.strictEqual(none.id, '');
    assert.strictEqual(none.created, false);

    prefs.clearActionBarsMem();
    const legacy = {
        v: 1,
        bars: [{ id: 1, slots: [{ id: 'old_spell' }] }]
    };
    return prefs.saveActionBars(42, legacy).then(function () {
        return prefs.saveActionBarProfiles({
            v: 1,
            lastProfileId: 'Mystic',
            hotkeys: { moveNorth: 'KeyW' },
            profiles: {
                Mystic: { v: 1, bars: [{ id: 1 }], hotkeys: { stop: 'Escape' } }
            }
        });
    }).then(function (saved) {
        assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'hotkeys'));
        assert.ok(!Object.prototype.hasOwnProperty.call(saved.profiles.Mystic, 'hotkeys'));
        assert.strictEqual(saved.lastProfileId, 'Mystic');
        return prefs.loadActionBars(42);
    }).then(function (old) {
        assert.strictEqual(old.bars[0].slots[0].id, 'old_spell');
        return prefs.loadActionBarProfiles();
    }).then(function (map) {
        assert.strictEqual(map.lastProfileId, 'Mystic');
        assert.strictEqual(map.profiles.Mystic.bars[0].id, 1);
        assert.ok(!Object.prototype.hasOwnProperty.call(map.profiles.Mystic, 'hotkeys'));
        assert.ok(!Object.prototype.hasOwnProperty.call(map, 'hotkeys'));
        console.log('ok action_bar_profiles');
    });
}

main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
