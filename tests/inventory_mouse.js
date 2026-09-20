#!/usr/bin/env node
/**
 * Inventory + combat-list mouse matrix (C5). Canvas stays in mouse_dispatcher.js.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const inv = require('../static/js/inventory_mouse.js');
const md = require('../static/js/mouse_dispatcher.js');

function slot(item, extra) {
    return inv.slotFromItem(item, extra);
}

function act(opts) {
    return inv.processInventoryAction(opts);
}

function typeOf(intents) {
    assert.ok(Array.isArray(intents) && intents.length, 'intents');
    return intents[0].type;
}

function main() {
    const bag = { id: 'bag', flags: 1, category: 'container' };
    const quiver = { id: 'quiver', flags: 1, category: 'quiver', slot: 'leftHand' };
    const potion = { id: 'health_potion', category: 'potion' };
    const sword = { id: 'iron_longsword', slot: 'rightHand', atk: 12 };
    const helmet = { id: 'steel_helmet', slot: 'helmet', category: 'helmet' };
    const rope = { id: 'rope', category: 'tool' };
    const gold = { id: 'gold_coin', category: 'currency', count: 6 };

    assert.strictEqual(inv.itemIsContainer(bag), true);
    assert.strictEqual(inv.itemIsContainer(quiver), true);
    assert.strictEqual(inv.itemIsUsable(potion), true);
    assert.strictEqual(inv.itemIsUsable(bag), false);
    assert.strictEqual(inv.itemIsMultiUse(rope), true);
    assert.strictEqual(inv.itemIsEquipable(sword), true);
    assert.strictEqual(inv.itemIsEquipable(potion), false);
    assert.strictEqual(inv.classifyItem(gold).isContainer, false);
    assert.strictEqual(inv.classifyItem(gold).isUsable, false);
    assert.strictEqual(inv.classifyItem(gold).isEquipable, false);

    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, slot: slot(bag)
    })), 'OPEN_BAG');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, slot: slot(bag, { alreadyOpen: true })
    })), 'CLOSE_BAG');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, modifiers: { ctrl: true }, slot: slot(bag)
    })), 'OPEN_CONTEXT_MENU');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 0, slot: slot(bag)
    })), 'OPEN_CONTEXT_MENU');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 0, modifiers: { ctrl: true }, slot: slot(bag)
    })), 'OPEN_BAG');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 2, slot: slot(bag)
    })), 'OPEN_CONTEXT_MENU');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 2, modifiers: { ctrl: true }, slot: slot(bag)
    })), 'OPEN_BAG');

    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, slot: slot(potion)
    })), 'USE_ITEM');
    assert.strictEqual(typeOf(act({
        button: 'right',
        mode: 1,
        leftPressed: true,
        rightPressed: true,
        slot: slot(potion)
    })), 'LOOK');
    assert.strictEqual(typeOf(act({
        button: 'right',
        mode: 0,
        leftPressed: true,
        rightPressed: true,
        slot: slot(potion)
    })), 'OPEN_CONTEXT_MENU');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, modifiers: { shift: true }, slot: slot(potion)
    })), 'LOOK');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 0, modifiers: { shift: true }, slot: slot(potion)
    })), 'LOOK');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, modifiers: { alt: true }, slot: slot(potion)
    })), 'IGNORE');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 0, modifiers: { ctrl: true }, slot: slot(potion)
    })), 'USE_ITEM');

    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, slot: slot(sword)
    })), 'EQUIP');
    assert.strictEqual(typeOf(act({
        button: 'right',
        mode: 1,
        slot: slot(helmet, { kind: 'equipment' })
    })), 'UNEQUIP');
    assert.strictEqual(typeOf(act({
        button: 'right',
        mode: 1,
        slot: slot(quiver, { kind: 'equipment' })
    })), 'OPEN_BAG');
    assert.strictEqual(typeOf(act({
        button: 'right',
        mode: 1,
        slot: slot(bag, { kind: 'equipment', isMainBackpackSlot: true })
    })), 'OPEN_BACKPACK');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, slot: slot(rope)
    })), 'ENTER_USE_WITH');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, slot: slot(gold)
    })), 'OPEN_CONTEXT_MENU');
    assert.strictEqual(typeOf(act({
        button: 'right', mode: 1, slot: slot(null)
    })), 'IGNORE');

    assert.strictEqual(typeOf(act({
        button: 'left', mode: 1, slot: slot(bag)
    })), 'SELECT');
    assert.strictEqual(typeOf(act({
        button: 'left', mode: 1, modifiers: { ctrl: true }, slot: slot(bag)
    })), 'OPEN_CONTEXT_MENU');
    assert.strictEqual(typeOf(act({
        button: 'left', mode: 0, modifiers: { ctrl: true }, slot: slot(potion)
    })), 'USE_ITEM');
    assert.strictEqual(typeOf(act({
        button: 'left',
        mode: 1,
        leftPressed: true,
        rightPressed: true,
        slot: slot(potion)
    })), 'LOOK');

    const combat = inv.processCombatRowAction.bind(inv);
    assert.strictEqual(typeOf(combat({ button: 'right', mode: 1 })), 'OPEN_CONTEXT_MENU');
    assert.strictEqual(typeOf(combat({ button: 'right', mode: 0 })), 'OPEN_CONTEXT_MENU');
    assert.strictEqual(typeOf(combat({ button: 'right', mode: 2 })), 'OPEN_CONTEXT_MENU');
    assert.strictEqual(typeOf(combat({
        button: 'right', mode: 1, leftPressed: true, rightPressed: true
    })), 'LOOK');
    assert.strictEqual(typeOf(combat({ button: 'left', mode: 1 })), 'SET_TARGET');
    assert.strictEqual(typeOf(combat({
        button: 'left', mode: 0, modifiers: { shift: true }
    })), 'LOOK');
    const menu = inv.buildCombatContextMenuEntries();
    assert.deepStrictEqual(menu.map((e) => e.action), ['ATTACK', 'LOOK', 'CHASE']);

    const dispatcherSrc = fs.readFileSync(
        path.join(__dirname, '../static/js/mouse_dispatcher.js'),
        'utf8'
    );
    assert.ok(!dispatcherSrc.includes('processInventoryAction'),
        'canvas dispatcher stays canvas-pure');
    assert.ok(!dispatcherSrc.includes('processCombatRowAction'),
        'combat-list matrix is not in mouse_dispatcher.js');

    const rat = {
        x: 10, y: 12, z: 6, walkable: true, isPlayerTile: false,
        creature: { id: 1000000001, name: 'Rat' },
        isNpc: false, corpse: null, isCorpse: false, useStair: false
    };
    const canvasRight = md.processMouseAction({ button: 'right', mode: 1, hit: rat });
    assert.strictEqual(canvasRight[0].type, 'SET_TARGET',
        'C5 does not change canvas Classic RMB creature order');

    console.log('ok inventory_mouse');
}

main();
