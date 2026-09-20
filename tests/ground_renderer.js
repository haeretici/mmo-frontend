'use strict';

const assert = require('assert');
const Ground = require('../static/js/ground_renderer.js');

function createMockContext() {
    const calls = [];
    return {
        calls,
        save: () => calls.push({ op: 'save' }),
        restore: () => calls.push({ op: 'restore' }),
        fillRect: (x, y, w, h) => calls.push({ op: 'fillRect', x, y, w, h }),
        strokeRect: (x, y, w, h) => calls.push({ op: 'strokeRect', x, y, w, h }),
        fillText: (text, x, y) => calls.push({ op: 'fillText', text, x, y }),
        strokeText: (text, x, y) => calls.push({ op: 'strokeText', text, x, y }),
        beginPath: () => calls.push({ op: 'beginPath' }),
        closePath: () => calls.push({ op: 'closePath' }),
        moveTo: (x, y) => calls.push({ op: 'moveTo', x, y }),
        lineTo: (x, y) => calls.push({ op: 'lineTo', x, y }),
        arc: (cx, cy, r, s, e) => calls.push({ op: 'arc', cx, cy, r }),
        drawImage: (img, dx, dy, dw, dh) => calls.push({ op: 'drawImage', img, dx, dy, dw, dh }),
        fill: () => calls.push({ op: 'fill' }),
        stroke: () => calls.push({ op: 'stroke' }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1.0,
        font: '',
        textAlign: '',
        textBaseline: ''
    };
}

function main() {
    // 1. Constants
    assert.strictEqual(Ground.MAX_GROUND_RENDER, 10);
    assert.strictEqual(Ground.DEFAULT_TILE_SIZE, 32);
    assert.strictEqual(Ground.FIELD_KINDS.FIRE, 'fire');
    assert.strictEqual(Ground.FIELD_KINDS.POISON, 'poison');
    assert.strictEqual(Ground.FIELD_KINDS.ENERGY, 'energy');
    assert.strictEqual(Ground.FIELD_KINDS.BARRIER, 'barrier');
    assert.strictEqual(Ground.FIELD_KINDS.VINE, 'vine');

    assert.strictEqual(Ground.FIELD_DURATIONS.fire.stage1, 200);
    assert.strictEqual(Ground.FIELD_DURATIONS.fire.stage2, 348);
    assert.strictEqual(Ground.FIELD_DURATIONS.fire.total, 446);
    assert.strictEqual(Ground.FIELD_DURATIONS.barrier.total, 20);

    assert.ok(Ground.PIN_SPRITE_MAPPINGS.chest);
    assert.ok(Ground.PIN_SPRITE_MAPPINGS.door);
    assert.ok(Ground.PIN_SPRITE_MAPPINGS.lever);
    assert.ok(Ground.PIN_SPRITE_MAPPINGS.teleport);

    // 2. slugify
    assert.strictEqual(Ground.slugify('Dragon King'), 'dragon_king');
    assert.strictEqual(Ground.slugify("Necromancer's Bone"), 'necromancers_bone');
    assert.strictEqual(Ground.slugify('  Ancient--Chest  '), 'ancient_chest');

    // 3. normalizeFieldKind
    assert.strictEqual(Ground.normalizeFieldKind('fire'), 'fire');
    assert.strictEqual(Ground.normalizeFieldKind('fire_field'), 'fire');
    assert.strictEqual(Ground.normalizeFieldKind('POISON'), 'poison');
    assert.strictEqual(Ground.normalizeFieldKind('earthfield'), 'poison');
    assert.strictEqual(Ground.normalizeFieldKind('energy'), 'energy');
    assert.strictEqual(Ground.normalizeFieldKind('barrier_wall'), 'barrier');
    assert.strictEqual(Ground.normalizeFieldKind('magic_wall'), 'barrier');
    assert.strictEqual(Ground.normalizeFieldKind('wild_growth'), 'vine');

    // 4. resolveFieldState
    // Fire stages
    const now = 1000;
    const fireStage1 = Ground.resolveFieldState({ kind: 'fire', createdAt: now - 50 }, now);
    assert.strictEqual(fireStage1.kind, 'fire');
    assert.strictEqual(fireStage1.stage, 1);
    assert.strictEqual(fireStage1.isObstacle, false);
    assert.strictEqual(fireStage1.fill, Ground.FIELD_COLORS.fire.stage1.fill);

    const fireStage2 = Ground.resolveFieldState({ kind: 'fire', createdAt: now - 250 }, now);
    assert.strictEqual(fireStage2.stage, 2);
    assert.strictEqual(fireStage2.fill, Ground.FIELD_COLORS.fire.stage2.fill);

    const fireStage3 = Ground.resolveFieldState({ kind: 'fire', createdAt: now - 400 }, now);
    assert.strictEqual(fireStage3.stage, 3);
    assert.strictEqual(fireStage3.fill, Ground.FIELD_COLORS.fire.stage3.fill);

    const fireExpired = Ground.resolveFieldState({ kind: 'fire', createdAt: now - 500 }, now);
    assert.strictEqual(fireExpired.stage, 4);
    assert.strictEqual(fireExpired.fill, Ground.FIELD_COLORS.fire.expired.fill);

    // Obstacle walls
    const barrier = Ground.resolveFieldState({ kind: 'barrier', createdAt: now }, now);
    assert.strictEqual(barrier.isObstacle, true);
    assert.ok(barrier.hatch);
    assert.ok(barrier.alphaMul >= 0.65 && barrier.alphaMul <= 1.0);

    const vine = Ground.resolveFieldState({ kind: 'vine', createdAt: now }, now);
    assert.strictEqual(vine.isObstacle, true);
    assert.ok(vine.hatch);

    // 5. drawField
    const ctxField = createMockContext();
    Ground.drawField(ctxField, { kind: 'barrier', x: 2, y: 3, z: 7 }, 64, 96, 32, 32, 0);
    assert.ok(ctxField.calls.some((c) => c.op === 'fillRect'));
    assert.ok(ctxField.calls.some((c) => c.op === 'strokeRect'));
    // Obstacle cross-hatch lines
    const lineTos = ctxField.calls.filter((c) => c.op === 'lineTo');
    assert.strictEqual(lineTos.length, 2);

    // 6. drawCorpse fallback
    const ctxCorpse = createMockContext();
    Ground.drawCorpse(ctxCorpse, { id: 101, name: 'Rat', x: 5, y: 6, z: 7 }, 160, 192, 32, 32, {});
    const fills = ctxCorpse.calls.filter((c) => c.op === 'fillRect');
    assert.ok(fills.length >= 3); // Base container + straps + gold buckle
    assert.strictEqual(ctxCorpse.calls[0].op, 'save');
    assert.strictEqual(ctxCorpse.calls[ctxCorpse.calls.length - 1].op, 'restore');

    // 7. drawCorpse with ready sprite image
    const mockImage = { naturalWidth: 32, naturalHeight: 32 };
    const mockSprites = {
        prefetch: () => {},
        getReady: () => mockImage
    };
    const ctxCorpseSprite = createMockContext();
    Ground.drawCorpse(ctxCorpseSprite, { id: 102, name: 'Spider' }, 0, 0, 32, 32, { sprites: mockSprites });
    assert.ok(ctxCorpseSprite.calls.some((c) => c.op === 'drawImage' && c.img === mockImage));

    // 8. drawWorldPin fallback per kind
    const ctxChest = createMockContext();
    Ground.drawWorldPin(ctxChest, { id: 201, kind: 'chest', x: 1, y: 1 }, 32, 32, 32, 32, {});
    assert.ok(ctxChest.calls.some((c) => c.op === 'fillRect'));

    const ctxDoor = createMockContext();
    Ground.drawWorldPin(ctxDoor, { id: 202, kind: 'door', x: 2, y: 2 }, 64, 64, 32, 32, {});
    assert.ok(ctxDoor.calls.some((c) => c.op === 'strokeRect'));

    const ctxLever = createMockContext();
    Ground.drawWorldPin(ctxLever, { id: 203, kind: 'lever', x: 3, y: 3 }, 96, 96, 32, 32, {});
    assert.ok(ctxLever.calls.some((c) => c.op === 'lineTo'));

    const ctxTeleport = createMockContext();
    Ground.drawWorldPin(ctxTeleport, { id: 204, kind: 'teleport', x: 4, y: 4 }, 128, 128, 32, 32, {});
    assert.ok(ctxTeleport.calls.some((c) => c.op === 'arc'));

    // 9. drawGroundItemStack
    const ctxStack = createMockContext();
    const items = [
        { id: 'gold_coin', count: 100 },
        { id: 'sword', count: 1 },
        { id: 'shield', count: 1 },
        { id: 'apple', count: 5 },
        { id: 'stone', count: 2 }
    ];
    Ground.drawGroundItemStack(ctxStack, items, 0, 0, 32, 32, {});
    const stackFills = ctxStack.calls.filter((c) => c.op === 'fillRect');
    assert.strictEqual(stackFills.length, 5);
    assert.ok(stackFills.length <= Ground.MAX_GROUND_RENDER);
    // Staggered offsets: step = 32 / 10 = 3
    assert.strictEqual(stackFills[0].x, 8); // 0 + pad
    assert.strictEqual(stackFills[1].x, 11); // 3 + pad
    assert.strictEqual(stackFills[2].x, 14); // 6 + pad
    assert.strictEqual(stackFills[3].x, 17); // 9 + pad
    const textCalls = ctxStack.calls.filter((c) => c.op === 'fillText');
    assert.strictEqual(textCalls.length, 1);
    assert.strictEqual(textCalls[0].text, '2');

    // 10. Master render
    const ctxMaster = createMockContext();
    const fields = new Map([
        ['0,0,7', { x: 0, y: 0, z: 7, kind: 'fire', createdAt: now }],
        ['1,0,8', { x: 1, y: 0, z: 8, kind: 'poison', createdAt: now }] // Different floor
    ]);
    const corpses = new Map([
        [1, { id: 1, x: 2, y: 0, z: 7, name: 'Troll' }]
    ]);
    const groundItems = new Map([
        ['0,2,7', { x: 0, y: 2, z: 7, items: [{ id: 'potion', count: 1 }] }]
    ]);
    const worldPins = new Map([
        [10, { id: 10, x: 3, y: 3, z: 7, kind: 'chest' }]
    ]);

    Ground.render(ctxMaster, {
        fields: fields,
        corpses: corpses,
        groundItems: groundItems,
        worldPins: worldPins,
        camX: 0,
        camY: 0,
        floorZ: 7,
        tw: 32,
        th: 32,
        nowSec: now
    });

    // Verify drawing calls executed for floor 7 items only
    assert.ok(ctxMaster.calls.length > 10);
    // Ensure floor 8 poison field was ignored
    const poisonCalls = ctxMaster.calls.filter((c) => c.fillStyle === Ground.FIELD_COLORS.poison.fill);
    assert.strictEqual(poisonCalls.length, 0);

    console.log('ok ground_renderer');
}

main();
