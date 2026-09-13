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
    const trap = hit({
        worldPin: { id: 3000000003, kind: 'trap', catalogId: 'spike' }
    });
    intents = md.processMouseAction({ button: 'right', mode: 1, hit: trap });
    assert.notStrictEqual(intents[0].type, 'USE');
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

    console.log('ok mouse_dispatcher');
}

main();
