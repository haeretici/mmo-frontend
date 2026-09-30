'use strict';

const assert = require('assert');
const General = require('../static/js/general_hotkeys.js');
const prefs = require('../static/js/prefs.js');

function main() {
    const defaults = General.defaults();
    assert.deepStrictEqual(defaults.actions.moveNorth, ['ARROWUP', 'W']);
    assert.deepStrictEqual(defaults.actions.moveEast, ['ARROWRIGHT', 'D']);
    assert.deepStrictEqual(defaults.actions.moveSouth, ['ARROWDOWN', 'S']);
    assert.deepStrictEqual(defaults.actions.moveWest, ['ARROWLEFT', 'A']);
    assert.deepStrictEqual(defaults.actions.moveNorthEast, []);
    assert.deepStrictEqual(defaults.actions.moveSouthEast, []);
    assert.deepStrictEqual(defaults.actions.moveSouthWest, []);
    assert.deepStrictEqual(defaults.actions.moveNorthWest, []);
    assert.deepStrictEqual(defaults.actions.targetNext, ['SPACE']);
    assert.deepStrictEqual(defaults.actions.targetPrev, ['SHIFT+SPACE']);
    assert.deepStrictEqual(defaults.actions.toggleAutoChase, []);
    assert.deepStrictEqual(defaults.actions.stopAutowalk, ['ESCAPE']);
    assert.strictEqual(General.cardinalDir('W', defaults), 0);
    assert.strictEqual(General.cardinalDir('ARROWUP', defaults), 0);
    assert.strictEqual(General.cardinalDir('D', defaults), 1);
    assert.strictEqual(General.cardinalDir('SPACE', defaults), null);
    const ne = General.setKey(defaults, 'moveNorthEast', 'Q', -1);
    assert.strictEqual(General.moveDir('Q', ne), 7);
    assert.strictEqual(General.cardinalDir('Q', ne), 7);
    const nw = General.setKey(defaults, 'moveNorthWest', 'Z', -1);
    assert.strictEqual(General.moveDir('Z', nw), 6);
    assert.strictEqual(General.match(defaults, 'SHIFT+SPACE'), 'targetPrev');
    assert.strictEqual(General.match(defaults, 'SPACE'), 'targetNext');

    const rebound = General.setKey(defaults, 'moveNorth', 'I', -1);
    assert.ok(rebound.actions.moveNorth.indexOf('I') >= 0);
    assert.ok(rebound.actions.moveNorth.indexOf('ARROWUP') >= 0);
    assert.strictEqual(General.cardinalDir('I', rebound), 0);
    const replaced = General.setKey(rebound, 'moveNorth', 'K', 0);
    assert.strictEqual(replaced.actions.moveNorth[0], 'K');
    assert.ok(replaced.actions.moveNorth.indexOf('ARROWUP') < 0);
    const stolen = General.setKey(replaced, 'targetNext', 'K', -1);
    assert.ok(stolen.actions.moveNorth.indexOf('K') < 0);
    assert.ok(stolen.actions.targetNext.indexOf('K') >= 0);
    const cleared = General.removeHotkey(stolen, 'K');
    assert.strictEqual(General.match(cleared, 'K'), '');
    const emptyNorth = General.removeAt(defaults, 'moveNorth', 0);
    emptyNorth.actions.moveNorth = General.removeAt(emptyNorth, 'moveNorth', 0).actions.moveNorth;
    const keptEmpty = General.normalize(emptyNorth);
    assert.deepStrictEqual(keptEmpty.actions.moveNorth, []);

    prefs.clearActionBarsMem();
    const savedDoc = General.setKey(General.defaults(), 'moveEast', 'L', -1);
    return prefs.saveGeneralHotkeys(savedDoc).then(function (saved) {
        assert.ok(saved.actions.moveEast.indexOf('L') >= 0);
        assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'profiles'));
        return prefs.saveActionBarProfiles({
            v: 1,
            lastProfileId: 'Mystic',
            profiles: {
                Mystic: { v: 1, bars: [{ id: 1, slots: [{ i: 0, k: 'F1', t: 'spell', id: 'snap_jab' }] }] },
                Aldric: { v: 1, bars: [{ id: 1, slots: [{ i: 0, k: 'F2', t: 'spell', id: 'fang_clash' }] }] }
            }
        });
    }).then(function () {
        return prefs.saveActionBarProfiles({
            v: 1,
            lastProfileId: 'Aldric',
            profiles: {
                Mystic: { v: 1, bars: [{ id: 1 }] },
                Aldric: { v: 1, bars: [{ id: 1 }] }
            }
        });
    }).then(function () {
        return Promise.all([prefs.loadGeneralHotkeys(), prefs.loadActionBarProfiles()]);
    }).then(function (pair) {
        const loaded = General.normalize(pair[0]);
        assert.ok(loaded.actions.moveEast.indexOf('L') >= 0, 'general hotkeys survive a profile change');
        assert.ok(loaded.actions.moveEast.indexOf('D') >= 0);
        assert.strictEqual(pair[1].lastProfileId, 'Aldric');
        assert.ok(!Object.prototype.hasOwnProperty.call(pair[1], 'hotkeys'));
        assert.ok(!pair[1].profiles.Mystic.hotkeys);
        assert.strictEqual(General.cardinalDir('ARROWUP', loaded), 0);
        console.log('ok general_hotkeys');
    });
}

main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
