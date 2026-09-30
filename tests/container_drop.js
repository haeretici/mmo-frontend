#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const drop = require('../static/js/container_drop.js');
const fe = require('../static/js/protocol.js');
const messages = require('../../server/src/protocol/messages.js');

const playJs = fs.readFileSync(path.join(__dirname, '../static/js/play.js'), 'utf8');
const playHtml = fs.readFileSync(path.join(__dirname, '../static/play.html'), 'utf8');
const appCss = fs.readFileSync(path.join(__dirname, '../static/css/app.css'), 'utf8');

function decoded(plan) {
    assert.strictEqual(plan.type, 'MOVE_ITEM');
    return messages.decodeMoveItem(fe.encodeMoveItem(plan.from, plan.to, plan.count));
}

function main() {
    const sword = { kind: 'container', containerId: 'root', slotIndex: 2, item: { id: 'iron_longsword', count: 1 } };
    const miss = drop.planDrop({
        drag: sword,
        container: { surfaceUid: 'bag-9', slotIndex: null, slotItem: null },
        modifiers: {}
    });
    const onGold = drop.planDrop({
        drag: sword,
        container: {
            surfaceUid: 'bag-9',
            slotIndex: 3,
            slotItem: { id: 'gold_coin', count: 4, flags: 0 },
            slotMeta: { id: 'gold_coin', category: 'currency' }
        },
        modifiers: {}
    });
    assert.deepStrictEqual(miss.to, onGold.to);
    assert.deepStrictEqual(miss.to, {
        kind: 'container',
        containerUid: 'bag-9',
        index: drop.CONTAINER_INSERT_INDEX
    });
    const missMove = decoded(miss);
    const slotMove = decoded(onGold);
    assert.strictEqual(missMove.to.kind, 'container');
    assert.strictEqual(missMove.to.containerUid, 'bag-9');
    assert.strictEqual(missMove.to.index, 255);
    assert.deepStrictEqual(missMove.to, slotMove.to);
    assert.strictEqual(missMove.from.containerUid, 'root');
    assert.strictEqual(missMove.from.index, 2);

    const onBag = drop.planDrop({
        drag: sword,
        container: {
            surfaceUid: 'root',
            slotIndex: 3,
            slotItem: { id: 'bag', count: 1, flags: 1 },
            slotMeta: { id: 'bag', category: 'container' }
        },
        modifiers: {}
    });
    const entered = decoded(onBag);
    assert.strictEqual(entered.to.containerUid, 'root');
    assert.strictEqual(entered.to.index, 3);
    assert.strictEqual(onBag.highlight, 'slot');

    const fromEquip = drop.planDrop({
        drag: { kind: 'equipment', slot: 'weapon', item: { id: 'iron_longsword', count: 1 } },
        container: { surfaceUid: 'root', slotIndex: null, slotItem: null },
        modifiers: {}
    });
    assert.strictEqual(fromEquip.type, 'MOVE_ITEM');
    assert.notStrictEqual(fromEquip.type, 'UNEQUIP');
    const equipMove = decoded(fromEquip);
    assert.strictEqual(equipMove.from.kind, 'equipment');
    assert.strictEqual(equipMove.from.slot, 'weapon');
    assert.strictEqual(equipMove.to.kind, 'container');
    assert.strictEqual(equipMove.to.containerUid, 'root');
    assert.strictEqual(equipMove.to.index, 255);
    assert.strictEqual(equipMove.count, 0);

    const shifted = drop.planDrop({
        drag: { kind: 'container', containerId: 'root', slotIndex: 1, item: { id: 'gold_coin', count: 6 } },
        container: { surfaceUid: 'bag-9', slotIndex: null, slotItem: null },
        modifiers: { shift: true, ctrl: false, moveStack: false }
    });
    assert.strictEqual(decoded(shifted).count, 1);

    const split = drop.planDrop({
        drag: { kind: 'container', containerId: 'root', slotIndex: 2, item: { id: 'gold_coin', count: 6 } },
        container: {
            surfaceUid: 'root',
            slotIndex: 0,
            slotItem: { id: 'rope', count: 1, flags: 0 }
        },
        modifiers: { shift: false, ctrl: false, moveStack: false, chosen: 2 }
    });
    const splitMove = decoded(split);
    assert.strictEqual(splitMove.from.containerUid, 'root');
    assert.strictEqual(splitMove.from.index, 2);
    assert.strictEqual(splitMove.to.containerUid, 'root');
    assert.strictEqual(splitMove.to.index, 255);
    assert.strictEqual(splitMove.count, 2);

    const plain = drop.planDrop({
        drag: { kind: 'container', containerId: 'root', slotIndex: 2, item: { id: 'gold_coin', count: 6 } },
        container: { surfaceUid: 'root', slotIndex: null, slotItem: null },
        modifiers: { shift: false, ctrl: false, moveStack: false }
    });
    assert.strictEqual(plain.type, 'MODAL');
    assert.strictEqual(plain.max, 6);

    const whole = drop.planDrop({
        drag: { kind: 'container', containerId: 'root', slotIndex: 2, item: { id: 'gold_coin', count: 6 } },
        container: { surfaceUid: 'root', slotIndex: null, slotItem: null },
        modifiers: { shift: false, ctrl: true, moveStack: false }
    });
    assert.strictEqual(decoded(whole).count, 0);

    for (const mode of [0, 1, 2]) {
        const decision = drop.resolveStackMoveAmount({
            count: 6,
            shift: false,
            ctrl: false,
            moveStack: false,
            mouseControlMode: mode
        });
        assert.strictEqual(decision.kind, 'modal');
        assert.strictEqual(decision.max, 6);
    }

    const ammo = drop.planDrop({
        drag: { kind: 'container', containerId: 'root', slotIndex: 4, item: { id: 'arrow', count: 10 } },
        dragMeta: { id: 'arrow', category: 'ammo', type: ['ammunition'] },
        paperdoll: {
            targetSlot: 'shield',
            equippedItem: { id: 'unicorn_quiver', count: 1, flags: 1 },
            equippedMeta: { id: 'unicorn_quiver', category: 'quiver' }
        },
        modifiers: { shift: true, ctrl: false, moveStack: false }
    });
    assert.strictEqual(ammo.type, 'MOVE_ITEM');
    const ammoMove = decoded(ammo);
    assert.strictEqual(ammoMove.to.kind, 'equipment');
    assert.strictEqual(ammoMove.to.slot, 'shield');
    assert.strictEqual(ammoMove.from.kind, 'container');
    assert.strictEqual(ammoMove.count, 1);

    const shieldOnQuiver = drop.planDrop({
        drag: { kind: 'container', containerId: 'root', slotIndex: 1, item: { id: 'wooden_shield', count: 1 } },
        dragMeta: { id: 'wooden_shield', category: 'shield' },
        paperdoll: {
            targetSlot: 'shield',
            equippedItem: { id: 'unicorn_quiver', count: 1, flags: 1 },
            equippedMeta: { id: 'unicorn_quiver', category: 'quiver' }
        },
        modifiers: {}
    });
    assert.strictEqual(shieldOnQuiver.type, 'EQUIP');
    assert.strictEqual(shieldOnQuiver.slot, 'shield');

    const dropFn = playJs.slice(playJs.indexOf('function onContainerDrop'), playJs.indexOf('function showEquipMenu'));
    assert.ok(dropFn.includes('ContainerDrop.planDrop'), 'container drop asks planDrop');
    assert.ok(!dropFn.includes('encodeUnequip'), 'container drop does not unequip');
    assert.ok(!dropFn.includes('UNEQUIP'), 'container drop does not unequip');
    assert.ok(playJs.includes('function resolveStackMoveAmount'), 'play.js keeps the stack helper');
    assert.ok(playJs.includes('highlightDropTarget'), 'drag highlight follows the container surface');
    assert.ok(!playJs.includes('0xFFFF'), 'no legacy position word');

    const htmlDrop = playHtml.indexOf('/js/container_drop.js');
    const htmlPlay = playHtml.indexOf('/js/play.js');
    assert.ok(htmlDrop > 0 && htmlDrop < htmlPlay, 'container_drop.js loads before play.js');
    assert.ok(appCss.includes('game-backpack-panel.drag-over'), 'backpack surface highlight is compiled');

    console.log('ok container_drop');
}

main();
