'use strict';

const assert = require('assert');
const assign = require('../static/js/action_bar_assign.js');
global.EngineActionBarAssign = assign;
global.EngineActionBarProfiles = require('../static/js/action_bar_profiles.js');
const bars = require('../static/js/action_bars.js');
const prefs = require('../static/js/prefs.js');

function main() {
    assert.strictEqual(bars.VISIBLE_SLOTS, 12);
    assert.strictEqual(bars.VISIBLE_SLOTS_VERTICAL, 10);
    assert.strictEqual(bars.MAX_SLOTS, 50);
    assert.strictEqual(bars.maxPageFor(1), 38);
    assert.strictEqual(bars.maxPageFor(4), 40);
    assert.strictEqual(bars.BAR1_KEYS[0], 'F1');
    assert.strictEqual(bars.BAR1_KEYS[11], 'F12');
    assert.strictEqual(bars.cdTicks(2, 20), 40);

    const seed = bars.seedBar1(['melee_auto', 'distance_auto', 'wand_auto', 'snap_jab', 'fang_clash']);
    assert.strictEqual(seed.bars[0].slots[0].id, 'snap_jab');
    assert.strictEqual(bars.dockVisibleCount(seed, 'bottom'), 1);
    assert.strictEqual(bars.dockVisibleCount(seed, 'left'), 0);
    assert.strictEqual(bars.barShown(seed.bars[0]), true);
    assert.strictEqual(seed.bars[0].slots[0].k, 'F1');
    assert.ok(!seed.bars[0].slots.some((s) => /_auto$/.test(s.id)));
    const mysticList = bars.knownSpellsFor({
        classes: [{ id: 'mystic', spells: ['snap_jab', 'fang_clash', 'melee_auto'] }]
    }, 'mystic');
    assert.strictEqual(bars.seedBar1(mysticList).bars[0].slots[0].id, 'snap_jab');
    assert.ok(bars.isEmptyDoc({}));
    assert.ok(bars.isEmptyDoc({ v: 1, bars: [] }));
    assert.strictEqual(bars.remainingTicks(40, 0), 40);
    assert.strictEqual(bars.remainingTicks(40, 40), 0);
    assert.strictEqual(bars.remainingTicks(40, 41), 0);
    assert.strictEqual(bars.cdProgress(40, 40), 0);
    assert.strictEqual(bars.cdProgress(0, 40), 100);
    assert.strictEqual(bars.POLL_MS_CD, 100);
    assert.strictEqual(bars.POLL_MS_HIDDEN, 4000);
    assert.strictEqual(bars.formatCdTimer(40, 20), '2');
    assert.strictEqual(bars.formatCdTimer(10, 20), '0.5');
    assert.strictEqual(bars.formatCdTimer(0, 20), '');
    assert.strictEqual(bars.cdPaintSig(200, 200, 20), '100:0');
    assert.strictEqual(bars.cdPaintSig(199, 200, 20), '100:0');
    assert.notStrictEqual(bars.cdPaintSig(198, 200, 20), '100:0');
    assert.strictEqual(bars.roundCdProgress(12.34), 12.3);
    assert.strictEqual(bars.roundCdProgress(12.35), 12.4);

    const loc = bars.findItemLoc('gold_coin', {
        containerId: 'root',
        slots: [{ index: 3, id: 'gold_coin', count: 4 }]
    }, null, {});
    assert.strictEqual(loc.containerId, 'root');
    assert.strictEqual(loc.index, 3);

    assert.strictEqual(bars.itemIsEquipable({ slot: 'rightHand' }), true);
    assert.strictEqual(bars.itemIsEquipable({ category: 'rune' }), false);

    const self = { id: 1, x: 10, y: 10, z: 6, hp: 100 };
    const tgt = { id: 9, x: 11, y: 10, z: 6, hp: 20 };
    const others = new Map([[9, tgt]]);
    const aim = bars.resolveSpellAim(
        { t: 'spell', id: 'snap_jab', m: 'smart_target' },
        { id: 'snap_jab', requiresTarget: true },
        {
            getSelf: function () { return self; },
            getTargetId: function () { return 9; },
            getOthers: function () { return others; },
            entityById: function (id) { return id === 9 ? tgt : self; }
        }
    );
    assert.strictEqual(aim.targetId, 9);
    assert.strictEqual(aim.x, 11);

    const patchSelf = bars.resolveSpellAim(
        { t: 'spell', id: 'magic_patch', m: 'smart_target' },
        { id: 'magic_patch', kind: 'heal', requiresTarget: false, selfTarget: true },
        {
            getSelf: function () { return self; },
            getTargetId: function () { return 9; },
            getOthers: function () { return others; },
            entityById: function (id) { return id === 9 ? tgt : self; }
        }
    );
    assert.strictEqual(patchSelf.targetId, 1);
    assert.strictEqual(patchSelf.x, 10);
    const patchCursor = bars.resolveSpellAim(
        { t: 'spell', id: 'magic_patch', m: 'cursor_prompt' },
        { id: 'magic_patch', kind: 'heal', requiresTarget: false },
        {
            getSelf: function () { return self; },
            getTargetId: function () { return 9; },
            getOthers: function () { return others; }
        }
    );
    assert.ok(!patchCursor.prompt);
    assert.strictEqual(patchCursor.targetId, 1);
    assert.strictEqual(bars.isSelfTargetSpell({ id: 'heal_friend', kind: 'heal', requiresTarget: true }), false);

    const none = bars.resolveSpellAim(
        { t: 'spell', id: 'snap_jab', m: 'active_target' },
        { id: 'snap_jab', requiresTarget: true },
        {
            getSelf: function () { return self; },
            getTargetId: function () { return 0; },
            getOthers: function () { return new Map(); }
        }
    );
    assert.strictEqual(none, null);

    const ctrl = bars.create();
    ctrl._state.spells.snap_jab = {
        id: 'snap_jab',
        cooldowns: { primary: { attack: 2 } }
    };
    ctrl._state.ups = 20;
    ctrl._state.lastTick = 100;
    ctrl._state.lastTickAt = 0;
    ctrl.onCast({ sourceId: 1, spellId: 'snap_jab' });
    assert.strictEqual(ctrl._state.bucketDur['primary.attack'], 40);
    assert.strictEqual(ctrl._state.buckets['primary.attack'], 140);

    let writes = 0;
    function fakeSlot() {
        return {
            classList: {
                add: function () { writes += 1; },
                remove: function () { writes += 1; }
            },
            _abOverlay: {
                style: {
                    setProperty: function () { writes += 1; },
                    removeProperty: function () { writes += 1; }
                }
            },
            _abTimer: { textContent: '' },
            _abSig: ''
        };
    }
    ctrl._state.doc = bars.seedBar1(['snap_jab']);
    ctrl._state.slotNodes = [fakeSlot()];
    writes = 0;
    ctrl.onCast({ sourceId: 1, spellId: 'snap_jab' });
    const firstPaint = writes;
    assert.ok(firstPaint > 0, 'first CD paint writes DOM');
    ctrl.onCast({ sourceId: 1, spellId: 'snap_jab' });
    assert.strictEqual(writes, firstPaint, 'same remaining/progress buckets skip DOM');
    ctrl.reset();
    assert.strictEqual(ctrl._state.pollTimer, 0);

    prefs.clearActionBarsMem();
    const sent = [];
    const persistCtrl = bars.create();
    persistCtrl._state.classes = {
        classes: [{ id: 'mystic', label: 'Mystic', spells: ['snap_jab', 'fang_clash', 'melee_auto'] }]
    };
    persistCtrl.bindHost({
        prefs: prefs,
        send: function (op) { sent.push(op); },
        protocol: { C2S: { CAST: 16 }, encodeCast: function () { return new Uint8Array(0); } },
        getSelf: function () { return self; },
        getTargetId: function () { return 9; },
        getOthers: function () { return others; },
        entityById: function (id) { return id === 9 ? tgt : self; },
        isDowned: function () { return false; }
    });
    return persistCtrl.onEnter({ characterId: 42, name: 'Iria', vocation: 'mystic' }).then(function () {
        assert.strictEqual(persistCtrl._state.profileId, 'Mystic');
        assert.ok(!Object.prototype.hasOwnProperty.call(persistCtrl._state.profiles, 'Iria'));
        assert.strictEqual(persistCtrl._state.doc.bars[0].slots[0].id, 'snap_jab');
        assert.ok(!sent.includes(17), 'seed does not send SET_HOTKEYS');
        persistCtrl.assignSlot(1, { t: 'spell', id: 'haste', m: 'self' });
        return new Promise(function (resolve) { setTimeout(resolve, bars.SET_DEBOUNCE_MS + 50); });
    }).then(function () {
        assert.ok(!sent.includes(17), 'assign does not send SET_HOTKEYS');
        return prefs.loadActionBarProfiles();
    }).then(function (saved) {
        assert.strictEqual(saved.lastProfileId, 'Mystic');
        assert.strictEqual(saved.profiles.Mystic.bars[0].slots[1].id, 'haste');
        assert.ok(!saved.hotkeys);
        assert.ok(!saved.profiles.Mystic.hotkeys);
        return prefs.loadActionBars(42);
    }).then(function (legacy) {
        assert.strictEqual(legacy, null, 'enter does not write an id-keyed bar doc');
        const relog = bars.create();
        relog._state.classes = persistCtrl._state.classes;
        relog.bindHost({ prefs: prefs });
        return relog.onEnter({ characterId: 42, name: 'Iria', vocation: 'mystic' });
    }).then(function () {
        return prefs.loadActionBarProfiles();
    }).then(function (again) {
        assert.strictEqual(again.profiles.Mystic.bars[0].slots[0].k, 'F1');
        assert.strictEqual(again.profiles.Mystic.bars[0].slots[1].id, 'haste');
        const bram = bars.create();
        bram._state.classes = persistCtrl._state.classes;
        bram.bindHost({ prefs: prefs });
        return bram.onEnter({ characterId: 43, name: 'Bram', vocation: 'mystic' }).then(function () {
            assert.strictEqual(bram._state.profileId, 'Mystic');
            assert.strictEqual(bram._state.doc.bars[0].slots[1].id, 'haste');
            assert.ok(!Object.prototype.hasOwnProperty.call(bram._state.profiles, 'Bram'));
            return prefs.saveActionBars(99, {
                v: 1,
                bars: [{
                    id: 1,
                    side: 'bottom',
                    visible: true,
                    locked: false,
                    page: 0,
                    slots: [{ i: 0, t: 'spell', id: 'old_spell', k: 'F1', m: 'smart_target' }]
                }]
            });
        }).then(function () {
            const nia = bars.create();
            nia._state.classes = persistCtrl._state.classes;
            nia.bindHost({ prefs: prefs });
            return nia.onEnter({ characterId: 99, name: 'Nia', vocation: 'mystic' });
        });
    }).then(function () {
        return prefs.loadActionBars(99);
    }).then(function (oldDoc) {
        assert.strictEqual(oldDoc.bars[0].slots[0].id, 'old_spell');
        return prefs.loadActionBarProfiles();
    }).then(function (map) {
        map.profiles.Aldric = {
            v: 1,
            bars: [{
                id: 1,
                side: 'bottom',
                visible: true,
                locked: false,
                page: 0,
                slots: [{ i: 0, t: 'spell', id: 'haste', k: 'F1', m: 'self' }]
            }]
        };
        map.profiles.Scout = {
            v: 1,
            bars: [{
                id: 1,
                side: 'bottom',
                visible: true,
                locked: false,
                page: 0,
                slots: [{ i: 0, t: 'spell', id: 'fang_clash', k: 'F1', m: 'smart_target' }]
            }]
        };
        return prefs.saveActionBarProfiles(map);
    }).then(function () {
        const named = bars.create();
        named._state.classes = {
            classes: [
                { id: 'scout', label: 'Scout', spells: ['fang_clash'] },
                { id: 'mystic', label: 'Mystic', spells: ['snap_jab'] }
            ]
        };
        named.bindHost({ prefs: prefs });
        return named.onEnter({ characterId: 5, name: 'aldric', vocation: 'scout' });
    }).then(function () {
        return prefs.loadActionBarProfiles();
    }).then(function (namedMap) {
        assert.strictEqual(namedMap.lastProfileId, 'Aldric');
        assert.strictEqual(namedMap.profiles.Aldric.bars[0].slots[0].id, 'haste');
        assert.strictEqual(namedMap.profiles.Scout.bars[0].slots[0].id, 'fang_clash');
        assert.ok(!Object.prototype.hasOwnProperty.call(namedMap.profiles, 'aldric'));
        persistCtrl._state.profiles = namedMap.profiles;
        persistCtrl._state.profileId = 'Mystic';
        persistCtrl._state.doc = namedMap.profiles.Mystic;
        assert.strictEqual(persistCtrl.switchProfile('Scout'), true);
        assert.strictEqual(persistCtrl._state.doc.bars[0].slots[0].id, 'fang_clash');
        assert.strictEqual(persistCtrl._state.profiles.Mystic.bars[0].slots[1].id, 'haste');
        assert.strictEqual(persistCtrl.switchProfile('missing'), false);
        assert.strictEqual(persistCtrl.switchProfile('Mystic'), true);
        assert.strictEqual(persistCtrl._state.profileId, 'Mystic');
        assert.strictEqual(persistCtrl._state.doc.bars[0].slots[0].id, 'snap_jab');
        assert.strictEqual(persistCtrl._state.doc.bars[0].slots[1].id, 'haste');
        persistCtrl._state.spells.snap_jab = { id: 'snap_jab', requiresTarget: true };
        const fired = persistCtrl.fireSlot(persistCtrl._state.doc.bars[0].slots[0]);
        assert.ok(fired);
        assert.ok(sent.includes(16), 'F1 fires CAST');
        assert.ok(!sent.includes(17));

        assert.strictEqual(bars.MULTI_ACTION_DEPTH, 3);
        assert.strictEqual(
            bars.parseDropItemId(JSON.stringify({
                kind: 'container',
                item: { id: 'potion_health', count: 2 }
            })),
            'potion_health'
        );
        assert.strictEqual(bars.countItemId('potion_health', {
            slots: [{ id: 'potion_health', count: 5 }]
        }, null, { ring: { id: 'potion_health', count: 1 } }), 6);

        const quiverView = {
            containerId: 'i2',
            slots: [{ index: 0, id: 'simple_arrow', count: 100 }]
        };
        const nestedView = {
            containerId: 'i5',
            slots: [{ index: 1, id: 'gold_coin', count: 3 }]
        };
        assert.strictEqual(bars.countItemId('simple_arrow', {
            containerId: 'root',
            slots: []
        }, nestedView, {}), 0, 'single unfocused open bag is not the quiver');
        assert.strictEqual(bars.countItemId('simple_arrow', {
            containerId: 'root',
            slots: []
        }, [nestedView, quiverView], {}), 100, 'count sums every open BAG window');
        assert.strictEqual(bars.countItemId('gold_coin', {
            containerId: 'root',
            slots: [{ index: 2, id: 'gold_coin', count: 4 }]
        }, [nestedView, quiverView], {}), 7);
        const arrowLoc = bars.findItemLoc('simple_arrow', {
            containerId: 'root',
            slots: []
        }, [nestedView, quiverView], {});
        assert.strictEqual(arrowLoc.containerId, 'i2');
        assert.strictEqual(arrowLoc.index, 0);
        const focusedFirst = bars.findItemLoc('gold_coin', {
            containerId: 'root',
            slots: []
        }, [nestedView, {
            containerId: 'i9',
            slots: [{ index: 0, id: 'gold_coin', count: 1 }]
        }], {});
        assert.strictEqual(focusedFirst.containerId, 'i5', 'find prefers the first open view (focused)');

        persistCtrl.assignSlot(3, { t: 'item', id: 'potion_health', m: 'self' });
        assert.strictEqual(persistCtrl._state.doc.bars[0].slots.find((s) => s.i === 3).id, 'potion_health');
        persistCtrl.assignSlot(4, { t: 'text', text: 'Pulling south' });
        const textSlot = persistCtrl._state.doc.bars[0].slots.find((s) => s.i === 4);
        assert.strictEqual(textSlot.t, 'text');
        assert.strictEqual(textSlot.text, 'Pulling south');
        persistCtrl.assignSlot(5, {
            t: 'multi',
            multi: [
                { t: 'spell', id: 'snap_jab', m: 'smart_target' },
                { t: 'item', id: 'potion_health', m: 'self' }
            ]
        });
        const multi = persistCtrl._state.doc.bars[0].slots.find((s) => s.i === 5);
        assert.strictEqual(multi.t, 'multi');
        assert.strictEqual(multi.multi.length, 3);
        assert.strictEqual(multi.multi[1].id, 'potion_health');

        persistCtrl.assignSlot(6, { t: 'spell', id: 'haste', k: 'F1' });
        const stolen = persistCtrl._state.doc.bars[0].slots.find((s) => s.i === 0);
        assert.strictEqual(stolen.k, '');
        assert.strictEqual(persistCtrl._state.doc.bars[0].slots.find((s) => s.i === 6).k, 'F1');
        assert.strictEqual(persistCtrl.assignBarSlot(2, 0, { t: 'spell', id: 'haste', k: 'F2' }), true);
        const bar2 = persistCtrl._state.doc.bars.find((b) => (b.id | 0) === 2);
        assert.strictEqual(bar2.side, 'bottom');
        assert.strictEqual(bar2.slots.find((s) => s.i === 0).k, 'F2');
        const clearedF2 = persistCtrl._state.doc.bars.find((b) => (b.id | 0) === 1).slots.find((s) => s.i === 1);
        assert.strictEqual(clearedF2.k, '');
        const f3 = persistCtrl.findHotkeySlot('F3');
        assert.strictEqual(f3.barId, 1);
        assert.strictEqual(f3.index, 2);

        persistCtrl.setBarLocked(true);
        assert.strictEqual(persistCtrl.assignSlot(7, { t: 'item', id: 'potion_health' }), false);
        persistCtrl.setBarLocked(false);

        const fct = [];
        persistCtrl.bindHost({
            prefs: prefs,
            send: function (op) { sent.push(op); },
            protocol: {
                C2S: { CAST: 16, USE_ITEM: 43, EQUIP: 40 },
                encodeCast: function () { return new Uint8Array(0); },
                encodeContainerSlot: function () { return new Uint8Array(0); }
            },
            getSelf: function () { return self; },
            getTargetId: function () { return 9; },
            getOthers: function () { return others; },
            entityById: function (id) { return id === 9 ? tgt : self; },
            isDowned: function () { return false; },
            getBag: function () {
                return { containerId: 'root', slots: [{ index: 0, id: 'potion_health', count: 2 }] };
            },
            getOpenBag: function () { return null; },
            getEquipment: function () { return {}; },
            fct: function (text, color) { fct.push({ text: text, color: color }); }
        });
        persistCtrl._state.items.potion_health = { id: 'potion_health', category: 'potion' };
        assert.ok(persistCtrl.fireSlot(textSlot));
        assert.strictEqual(fct[0].text, 'Pulling south');
        const itemUse = persistCtrl.fireSlot({ t: 'item', id: 'potion_health' });
        assert.ok(itemUse);
        assert.ok(sent.includes(43), 'item slot fires USE_ITEM');
        persistCtrl._state.buckets['primary.attack'] = 9999;
        persistCtrl._state.bucketDur['primary.attack'] = 40;
        persistCtrl._state.spells.snap_jab = {
            id: 'snap_jab',
            cooldowns: { primary: { attack: 2 } }
        };
        const multiFired = persistCtrl.fireSlot(multi);
        assert.ok(multiFired, 'multi skips CD spell and uses potion');

        const usedSlots = [];
        persistCtrl.bindHost({
            prefs: prefs,
            send: function (op) { sent.push(op); },
            protocol: {
                C2S: { CAST: 16, USE_ITEM: 43, EQUIP: 40 },
                encodeCast: function () { return new Uint8Array(0); },
                encodeContainerSlot: function (containerId, index) {
                    usedSlots.push({ containerId: containerId, index: index | 0 });
                    return new Uint8Array(0);
                }
            },
            getSelf: function () { return self; },
            getTargetId: function () { return 9; },
            getOthers: function () { return others; },
            entityById: function (id) { return id === 9 ? tgt : self; },
            isDowned: function () { return false; },
            getBag: function () {
                return { containerId: 'root', slots: [] };
            },
            getOpenBag: function () { return nestedView; },
            getOpenBags: function () { return [quiverView, nestedView]; },
            getEquipment: function () { return {}; }
        });
        persistCtrl._state.items.simple_arrow = { id: 'simple_arrow', category: 'ammo' };
        const arrowUse = persistCtrl.fireSlot({ t: 'item', id: 'simple_arrow' });
        assert.ok(arrowUse, 'item slot fires from a non-focused open BAG');
        assert.strictEqual(usedSlots[0].containerId, 'i2');
        assert.strictEqual(usedSlots[0].index, 0);
        const goldUse = persistCtrl.fireSlot({ t: 'item', id: 'gold_coin' });
        assert.ok(goldUse);
        assert.strictEqual(usedSlots[1].containerId, 'i5', 'focused open BAG wins when both have a match');

        assert.strictEqual(persistCtrl.addProfile(''), false);
        assert.strictEqual(persistCtrl.addProfile('Mystic'), false);
        assert.strictEqual(persistCtrl.addProfile('Iria'), true);
        assert.strictEqual(persistCtrl._state.profileId, 'Iria');
        assert.ok(persistCtrl._state.profiles.Iria);
        assert.ok(!persistCtrl._state.profiles.Iria.hotkeys);
        assert.strictEqual(persistCtrl.copyProfile('Aldric Two'), true);
        assert.strictEqual(persistCtrl._state.profileId, 'Aldric Two');
        assert.strictEqual(persistCtrl.renameProfile('Aldric'), false);
        assert.strictEqual(persistCtrl.renameProfile('Nia'), true);
        assert.strictEqual(persistCtrl._state.profileId, 'Nia');
        while (Object.keys(persistCtrl._state.profiles).length > 1) {
            assert.strictEqual(persistCtrl.removeProfile(), true);
        }
        assert.strictEqual(persistCtrl.removeProfile(), false);
        assert.strictEqual(Object.keys(persistCtrl._state.profiles).length, 1);
        assert.strictEqual(persistCtrl.setDockCount('left', 2), 2);
        assert.strictEqual(bars.dockVisibleCount(persistCtrl._state.doc, 'left'), 2);
        const left4 = persistCtrl._state.doc.bars.find((b) => (b.id | 0) === 4);
        const left6 = persistCtrl._state.doc.bars.find((b) => (b.id | 0) === 6);
        assert.strictEqual(left4.visible, true);
        assert.strictEqual(left4.side, 'left');
        assert.strictEqual(left6.visible, false);
        assert.strictEqual(persistCtrl.setDockCount('bottom', 0), 0);
        assert.strictEqual(bars.barShown(persistCtrl._state.doc.bars.find((b) => (b.id | 0) === 1)), false);
        assert.strictEqual(persistCtrl.setDockCount('bottom', 1), 1);
        assert.strictEqual(persistCtrl.setBarPage(1, 999), 38);
        assert.strictEqual(persistCtrl._state.doc.bars.find((b) => (b.id | 0) === 1).page, 38);
        assert.strictEqual(persistCtrl.setBarPage(4, -4), 0);
        assert.strictEqual(persistCtrl.assignBarSlot(1, 20, { t: 'spell', id: 'snap_jab', k: 'CTRL+1' }), true);
        const paged = persistCtrl.findHotkeySlot('CTRL+1');
        assert.strictEqual(paged.barId, 1);
        assert.strictEqual(paged.index, 20);
        assert.strictEqual(persistCtrl.assignBarSlot(7, 0, { t: 'spell', id: 'snap_jab', k: 'CTRL+9' }), true);
        assert.strictEqual(persistCtrl._state.doc.bars.find((b) => (b.id | 0) === 7).visible, false);
        const hiddenHk = persistCtrl.findHotkeySlot('CTRL+9');
        assert.strictEqual(hiddenHk.barId, 7);
        assert.strictEqual(hiddenHk.index, 0);
        console.log('ok action_bars');
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
