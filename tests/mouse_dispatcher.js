'use strict';

const assert = require('assert');
const md = require('../static/js/mouse_dispatcher.js');

function hit(extra) {
    return Object.assign({
        x: 10,
        y: 12,
        z: 6,
        walkable: true,
        isPlayerTile: false,
        creature: null,
        isNpc: false,
        corpse: null,
        isCorpse: false,
        useStair: false
    }, extra || {});
}

function main() {
    const rat = hit({
        creature: { id: 1000000001, name: 'Rat' }
    });
    const npc = hit({
        creature: { id: 7, name: 'Guide', isNpc: true },
        isNpc: true
    });
    const corpse = hit({
        corpse: { id: 2000000001, name: 'Dead rat' },
        isCorpse: true
    });
    const empty = hit({ x: 11, y: 12 });
    const self = hit({ isPlayerTile: true, x: 8, y: 8 });

    let intents = md.processMouseAction({ button: 'right', mode: 1, hit: rat });
    assert.strictEqual(intents[0].type, 'SET_TARGET');
    assert.strictEqual(intents[0].targetId, 1000000001);

    intents = md.processMouseAction({ button: 'left', mode: 1, hit: empty });
    assert.strictEqual(intents[0].type, 'START_AUTOWALK');
    assert.strictEqual(intents[0].dest.x, 11);

    intents = md.processMouseAction({ button: 'left', mode: 1, hit: self });
    assert.strictEqual(intents[0].type, 'STOP_AUTOWALK');

    intents = md.processMouseAction({ button: 'right', mode: 1, hit: npc });
    assert.strictEqual(intents[0].type, 'TALK_NPC');

    intents = md.processMouseAction({ button: 'right', mode: 1, hit: corpse });
    assert.strictEqual(intents[0].type, 'QUICKLOOT');
    const opened = md.mapStubQuicklootToOpen(intents[0]);
    assert.strictEqual(opened.type, 'OPEN_CORPSE');
    assert.strictEqual(opened.corpseId, 2000000001);

    intents = md.processMouseAction({
        button: 'right',
        mode: 1,
        hit: empty,
        modifiers: { ctrl: true }
    });
    assert.strictEqual(intents[0].type, 'OPEN_CONTEXT_MENU');

    intents = md.processMouseAction({
        button: 'left',
        mode: 1,
        hit: rat,
        modifiers: { shift: true }
    });
    assert.strictEqual(intents[0].type, 'LOOK');
    assert.strictEqual(intents[0].text, 'Rat');

    intents = md.processMouseAction({ button: 'right', mode: 0, hit: rat });
    assert.strictEqual(intents[0].type, 'OPEN_CONTEXT_MENU');

    intents = md.processMouseAction({ button: 'left', mode: 2, hit: npc });
    assert.strictEqual(intents[0].type, 'TALK_NPC');

    intents = md.processMouseAction({ button: 'left', mode: 2, hit: rat });
    assert.strictEqual(intents[0].type, 'SET_TARGET');

    const def = md.processMouseAction({ button: 'right', hit: rat });
    assert.strictEqual(def[0].type, 'SET_TARGET');

    assert.strictEqual(md.isClassicLookChord({
        mode: 1, button: 'right', leftPressed: true, rightPressed: false
    }), true);
    assert.strictEqual(md.isClassicLookChord({
        mode: 0, button: 'right', leftPressed: true
    }), false);

    const resolved = md.resolveCanvasHit({
        tile: { x: 3, y: 4, z: 6 },
        player: { id: 1, x: 1, y: 1, z: 6 },
        others: [{ id: 9, name: 'Guide', x: 3, y: 4, z: 6, flags: 1 }],
        corpses: [],
        tileId: 1,
        walkable: true
    });
    assert.strictEqual(resolved.isNpc, true);
    assert.strictEqual(resolved.creature.name, 'Guide');

    const menu = md.buildCanvasContextMenuEntries(npc);
    assert.ok(menu.some((e) => e.action === 'TALK_NPC'));
    assert.ok(menu.some((e) => e.action === 'LOOK'));

    const herb = hit({
        worldPin: { id: 3000000001, kind: 'harvest', catalogId: 'abandoned_flower_patch' }
    });
    intents = md.processMouseAction({ button: 'right', mode: 1, hit: herb });
    assert.strictEqual(intents[0].type, 'USE');
    assert.strictEqual(intents[0].worldPinKind, 'harvest');
    const crate = hit({
        worldPin: { id: 3000000002, kind: 'container', catalogId: 'crate' }
    });
    intents = md.processMouseAction({ button: 'right', mode: 1, hit: crate });
    assert.strictEqual(intents[0].type, 'OPEN_CONTAINER');
    intents = md.processMouseAction({
        button: 'left',
        mode: 2,
        hit: crate,
        modifiers: { ctrl: true }
    });
    assert.strictEqual(intents[0].type, 'OPEN_CONTAINER', 'Smart Ctrl crate opens');
    intents = md.processMouseAction({
        button: 'right',
        mode: 2,
        hit: crate,
        modifiers: { ctrl: true }
    });
    assert.strictEqual(intents[0].type, 'OPEN_CONTAINER', 'Smart Ctrl RMB crate opens');
    intents = md.processMouseAction({
        button: 'left',
        mode: 2,
        hit: corpse,
        modifiers: { ctrl: true }
    });
    assert.strictEqual(intents[0].type, 'OPEN_CORPSE', 'Smart Ctrl corpse opens');
    intents = md.processMouseAction({
        button: 'left',
        mode: 2,
        hit: empty,
        modifiers: { ctrl: true }
    });
    assert.strictEqual(intents[0].type, 'OPEN_CONTEXT_MENU', 'Smart Ctrl empty is menu');
    intents = md.processMouseAction({
        button: 'left',
        mode: 2,
        hit: herb,
        modifiers: { ctrl: true }
    });
    assert.strictEqual(intents[0].type, 'OPEN_CONTEXT_MENU', 'Smart Ctrl harvest is menu');
    intents = md.processMouseAction({
        button: 'left',
        mode: 0,
        hit: crate,
        modifiers: { ctrl: true }
    });
    assert.strictEqual(intents[0].type, 'OPEN_CONTAINER', 'Regular Ctrl crate still opens');
    const trap = hit({
        worldPin: { id: 3000000003, kind: 'trap', catalogId: 'spike' }
    });
    intents = md.processMouseAction({ button: 'right', mode: 1, hit: trap });
    assert.notStrictEqual(intents[0].type, 'USE');
    intents = md.processMouseAction({
        button: 'left',
        mode: 2,
        hit: trap,
        modifiers: { ctrl: true }
    });
    assert.strictEqual(intents[0].type, 'OPEN_CONTEXT_MENU', 'Smart Ctrl trap is menu');
    const pinHit = md.resolveCanvasHit({
        tile: { x: 62, y: 138, z: 7 },
        player: { id: 1, x: 62, y: 137, z: 7 },
        others: [],
        corpses: [],
        worldPins: [{ id: 9, kind: 'harvest', catalogId: 'abandoned_flower_patch', x: 62, y: 138, z: 7 }],
        tileId: 1,
        walkable: true
    });
    assert.strictEqual(pinHit.worldPin.kind, 'harvest');
    const pinMenu = md.buildCanvasContextMenuEntries(herb);
    assert.ok(pinMenu.some((e) => e.action === 'USE'));

    const bagHit = hit({
        groundUseUid: 'i9',
        groundUseItem: { uid: 'i9', id: 'bag', flags: 1 },
        groundMoveUid: 'i9',
        groundMoveItem: { uid: 'i9', id: 'bag', flags: 1, stackIndex: 0 },
        groundLookUid: 'i9',
        groundLookItem: { uid: 'i9', id: 'bag', flags: 1 }
    });
    intents = md.processMouseAction({ button: 'right', mode: 1, hit: bagHit });
    assert.strictEqual(intents[0].type, 'OPEN_BAG');
    assert.strictEqual(intents[0].index, 255);
    intents = md.processMouseAction({
        button: 'left',
        mode: 2,
        hit: bagHit,
        modifiers: { ctrl: true }
    });
    assert.strictEqual(intents[0].type, 'OPEN_BAG', 'Smart Ctrl ground bag opens');
    const coinHit = hit({
        pickableUid: 'i3',
        pickableItem: { uid: 'i3', id: 'gold_coin', count: 6, stackIndex: 0 },
        pickableStackIndex: 0,
        groundMoveUid: 'i3',
        groundMoveItem: { uid: 'i3', id: 'gold_coin', count: 6, stackIndex: 0 },
        groundLookUid: 'i3',
        groundLookItem: { uid: 'i3', id: 'gold_coin', count: 6 }
    });
    intents = md.processMouseAction({ button: 'right', mode: 1, hit: coinHit });
    assert.strictEqual(intents[0].type, 'PICKUP');
    intents = md.processMouseAction({ button: 'left', mode: 2, hit: coinHit });
    assert.strictEqual(intents[0].type, 'PICKUP', 'Smart LMB loose pickupable picks up');
    assert.strictEqual(md.allowGroundLmbDrag({ hit: coinHit, mode: 2 }), true);
    assert.strictEqual(md.allowGroundLmbDrag({ hit: bagHit, mode: 2 }), false, 'Smart does not drag bags');
    assert.strictEqual(md.allowGroundLmbDrag({ hit: bagHit, mode: 1 }), true);
    const resolvedG = md.resolveCanvasHit({
        tile: { x: 4, y: 4, z: 0 },
        player: { id: 1, x: 4, y: 3, z: 0 },
        others: [],
        corpses: [],
        worldPins: [],
        groundItems: [{
            x: 4, y: 4, z: 0,
            items: [
                { uid: 'i1', id: 'gold_coin', count: 2, flags: 0, stackIndex: 1 },
                { uid: 'i2', id: 'bag', count: 1, flags: 1, stackIndex: 0 }
            ]
        }],
        tileId: 1,
        walkable: true
    });
    assert.strictEqual(resolvedG.groundUseUid, 'i2');
    assert.strictEqual(resolvedG.pickableUid, 'i1');
    assert.strictEqual(resolvedG.groundMoveUid, 'i2');
    const gMenu = md.buildCanvasContextMenuEntries(resolvedG);
    const resolvedCorpseStack = md.resolveCanvasHit({
        tile: { x: 5, y: 5, z: 0 },
        player: { id: 1, x: 4, y: 5, z: 0 },
        others: [],
        corpses: [
            { id: 2001, name: 'Old Rat', x: 5, y: 5, z: 0 },
            { id: 2002, name: 'New Troll', x: 5, y: 5, z: 0 }
        ],
        worldPins: [],
        groundItems: [],
        tileId: 1,
        walkable: true
    });
    assert.strictEqual(resolvedCorpseStack.isCorpse, true);
    assert.strictEqual(resolvedCorpseStack.corpseId, 2002, 'topmost corpse is selected');
    assert.strictEqual(resolvedCorpseStack.corpse.name, 'New Troll');

    console.log('ok mouse_dispatcher');
}

main();
