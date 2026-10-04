'use strict';

const assert = require('assert');
const bf = require('../static/js/browse_field.js');

function slot(id, uid, stackIndex, flags, count) {
    return {
        stackIndex: stackIndex | 0,
        uid: uid,
        id: id,
        count: count == null ? 1 : count,
        flags: flags | 0
    };
}

function harness() {
    const sent = [];
    let player = { x: 0, y: 0, z: 7 };
    let approach = function () { return null; };
    const ui = bf.attach({
        getPlayer: function () { return player; },
        nearestApproach: function (from, tile, range, walkable) {
            return approach(from, tile, range, walkable);
        },
        isWalkable: function () { return true; },
        sendBrowse: function (x, y, z) { sent.push(['open', x, y, z]); },
        sendClose: function (x, y, z) { sent.push(['close', x, y, z]); },
        fct: function (text) { sent.push(['fct', text]); },
        startWalk: function (dest, then) { sent.push(['walk', dest.x, dest.y, then.x, then.y, then.z]); },
        floatRoot: function () { return null; }
    });
    return {
        ui: ui,
        sent: sent,
        setPlayer: function (p) { player = p; },
        setApproach: function (fn) { approach = fn; }
    };
}

function main() {
    assert.strictEqual(bf.TITLE, 'Browse Field');
    assert.strictEqual(bf.BROWSE_FIELD_CAPACITY, 30);
    assert.strictEqual(bf.MAX_BROWSE_WINDOWS, 8);
    assert.strictEqual(bf.floorText(7, 6), 'First go upstairs.');
    assert.strictEqual(bf.floorText(7, 8), 'First go downstairs.');
    assert.strictEqual(bf.floorText(7, 7), '');

    const near = bf.planOpen({ x: 0, y: 0, z: 7 }, { x: 1, y: 0, z: 7 }, function () {
        throw new Error('already adjacent');
    }, function () { return true; });
    assert.strictEqual(near.type, 'send');

    const up = bf.planOpen({ x: 0, y: 0, z: 7 }, { x: 0, y: 0, z: 6 });
    assert.strictEqual(up.type, 'fct');
    assert.strictEqual(up.text, 'First go upstairs.');
    const down = bf.planOpen({ x: 0, y: 0, z: 7 }, { x: 0, y: 0, z: 8 });
    assert.strictEqual(down.text, 'First go downstairs.');

    const blocked = bf.planOpen(
        { x: 0, y: 0, z: 7 },
        { x: 5, y: 0, z: 7 },
        function () { return null; },
        function () { return false; }
    );
    assert.strictEqual(blocked.type, 'fct');
    assert.strictEqual(blocked.text, 'There is no way.');

    const walked = bf.planOpen(
        { x: 0, y: 0, z: 7 },
        { x: 5, y: 0, z: 7 },
        function () { return { x: 4, y: 0 }; },
        function () { return true; }
    );
    assert.strictEqual(walked.type, 'walk');
    assert.strictEqual(walked.dest.x, 4);
    assert.strictEqual(walked.tile.z, 7);

    const h = harness();
    const opened = h.ui.applySnapshot({
        x: 1, y: 0, z: 7, n: 2,
        slots: [slot('top', 'u-top', 0, 0, 3), slot('bag', 'u-bag', 1, 1, 1)]
    });
    assert.strictEqual(opened.closed, false);
    assert.strictEqual(opened.top.id, 'top');
    assert.strictEqual(opened.top.stackIndex, 0);
    assert.strictEqual(opened.capacity, 30);
    assert.strictEqual(h.ui.isOpen(1, 0, 7), true);

    const deep = [];
    for (let i = 0; i < 40; i++) deep.push(slot('d' + i, 'd' + i, i, 0, 1));
    const grown = h.ui.applySnapshot({ x: 1, y: 0, z: 7, n: 40, slots: deep });
    assert.strictEqual(grown.capacity, 40);
    assert.strictEqual(grown.top.id, 'd0');
    assert.strictEqual(h.sent.length, 0, 'refresh does not close');

    h.ui.chooseTile(1, 0, 7);
    assert.deepStrictEqual(h.sent[h.sent.length - 1], ['close', 1, 0, 7]);
    assert.strictEqual(h.ui.isOpen(1, 0, 7), false);

    h.sent.length = 0;
    const again = h.ui.chooseTile(1, 0, 7);
    assert.strictEqual(again.action, 'open');
    assert.deepStrictEqual(h.sent[0], ['open', 1, 0, 7]);
    h.ui.chooseTile(1, 0, 7);
    assert.deepStrictEqual(h.sent[1], ['close', 1, 0, 7]);

    h.sent.length = 0;
    h.ui.chooseTile(0, 0, 6);
    assert.deepStrictEqual(h.sent[0], ['fct', 'First go upstairs.']);
    h.ui.chooseTile(0, 0, 8);
    assert.deepStrictEqual(h.sent[1], ['fct', 'First go downstairs.']);

    h.setApproach(function () { return null; });
    h.ui.chooseTile(5, 0, 7);
    assert.deepStrictEqual(h.sent[2], ['fct', 'There is no way.']);

    h.setApproach(function () { return { x: 4, y: 0 }; });
    h.ui.chooseTile(5, 0, 7);
    assert.deepStrictEqual(h.sent[3], ['walk', 4, 0, 5, 0, 7]);
    h.setPlayer({ x: 4, y: 0, z: 7 });
    h.ui.arrive({ x: 5, y: 0, z: 7 });
    assert.deepStrictEqual(h.sent[4], ['open', 5, 0, 7]);

    h.sent.length = 0;
    h.ui.applySnapshot({
        x: 5, y: 0, z: 7, n: 1, slots: [slot('coin', 'c', 0, 0, 1)]
    });
    h.ui.applySnapshot({ x: 5, y: 0, z: 7, n: 0, slots: [] });
    assert.strictEqual(h.ui.isOpen(5, 0, 7), false);
    assert.ok(!h.sent.some(function (row) { return row[0] === 'close'; }), 'empty snapshot does not send close');

    h.setPlayer({ x: 0, y: 0, z: 7 });
    h.ui.applySnapshot({
        x: 1, y: 0, z: 7, n: 1, slots: [slot('coin', 'live', 0, 0, 1)]
    });
    h.ui.onPlayerMoved({ x: 0, y: 0, z: 7 }, { x: 1, y: 0, z: 7 });
    assert.strictEqual(h.ui.isOpen(1, 0, 7), true);
    h.ui.onPlayerMoved({ x: 1, y: 0, z: 7 }, { x: 3, y: 0, z: 7 });
    assert.strictEqual(h.ui.isOpen(1, 0, 7), false);
    assert.deepStrictEqual(h.sent[h.sent.length - 1], ['close', 1, 0, 7]);

    h.ui.applySnapshot({
        x: 1, y: 0, z: 7, n: 1, slots: [slot('coin', 'floor', 0, 0, 1)]
    });
    h.ui.applySnapshot({
        x: 2, y: 0, z: 7, n: 1, slots: [slot('coin', 'other', 0, 0, 1)]
    });
    h.ui.onPlayerMoved({ x: 1, y: 0, z: 7 }, { x: 1, y: 0, z: 8 });
    assert.strictEqual(h.ui.openCount(), 0);
    assert.ok(h.sent.some(function (row) { return row[0] === 'close' && row[1] === 1; }));
    assert.ok(h.sent.some(function (row) { return row[0] === 'close' && row[1] === 2; }));

    h.sent.length = 0;
    for (let i = 0; i < 9; i++) {
        h.ui.applySnapshot({
            x: i, y: 2, z: 7, n: 1, slots: [slot('coin', 'w' + i, 0, 0, 1)]
        });
    }
    assert.strictEqual(h.ui.openCount(), 8);
    assert.strictEqual(h.ui.isOpen(0, 2, 7), false);
    assert.strictEqual(h.ui.isOpen(8, 2, 7), true);
    assert.deepStrictEqual(h.sent[0], ['close', 0, 2, 7]);

    const browseNode = {
        closest: function (sel) {
            return String(sel).indexOf('data-browse-field') >= 0 ? { dataset: { browseField: '1' } } : null;
        }
    };
    const bagNode = {
        dataset: { containerUid: 'bag-1' },
        closest: function () { return null; }
    };
    assert.deepStrictEqual(bf.dropPlan(browseNode), { type: 'NONE' });
    assert.strictEqual(bf.dropPlan(bagNode), null);
    assert.strictEqual(h.ui.isBrowseSurface(browseNode), true);
    assert.strictEqual(bf.isUseWithItem({ id: 'rope' }), true);
    assert.strictEqual(bf.isUseWithItem({ id: 'gold_coin' }), false);

    const traded = bf.menuRows({ id: 'rope', count: 1, flags: 0, stackIndex: 1 }, {
        tradeLabel: function (it) { return it && it.id ? 'Trade with …' : ''; }
    });
    assert.strictEqual(traded[traded.length - 1].label, 'Trade with …');
    assert.strictEqual(traded[traded.length - 1].action, 'TRADE');
    assert.ok(traded.some(function (row) { return row.action === 'PICKUP'; }));
    const plain = bf.menuRows({ id: 'gold_coin', count: 4, flags: 0 }, {});
    assert.ok(!plain.some(function (row) { return row.action === 'TRADE'; }));
    const bagRow = bf.menuRows({ id: 'backpack', flags: 1 }, {
        tradeLabel: function () { return 'Trade with …'; }
    });
    assert.ok(bagRow.some(function (row) { return row.action === 'OPEN'; }));
    assert.ok(bagRow.some(function (row) { return row.action === 'TRADE'; }));
    const unlabeled = bf.menuRows({ id: '', flags: 0 }, {
        tradeLabel: function () { return ''; }
    });
    assert.ok(!unlabeled.some(function (row) { return row.action === 'TRADE'; }));

    console.log('ok browse_field');
}

main();
