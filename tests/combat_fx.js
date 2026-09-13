'use strict';

const assert = require('assert');
const CombatFx = require('../static/js/combat_fx.js');

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
        arc: (x, y, r, s, e) => calls.push({ op: 'arc', x, y, r }),
        moveTo: (x, y) => calls.push({ op: 'moveTo', x, y }),
        lineTo: (x, y) => calls.push({ op: 'lineTo', x, y }),
        stroke: () => calls.push({ op: 'stroke' }),
        fill: () => calls.push({ op: 'fill' }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: '',
        globalAlpha: 1
    };
}

function main() {
    // 1. Colors
    assert.strictEqual(CombatFx.ELEMENT_COLORS.physical, '#ffffff');
    assert.strictEqual(CombatFx.ELEMENT_COLORS.crit, '#fbbf24');
    assert.strictEqual(CombatFx.ELEMENT_COLORS.fire, '#f97316');
    assert.strictEqual(CombatFx.ELEMENT_COLORS.healing, '#34d399');
    assert.strictEqual(CombatFx.ELEMENT_COLORS.exp, '#38bdf8');
    assert.strictEqual(CombatFx.ELEMENT_COLORS.miss, '#9ca3af');

    assert.strictEqual(CombatFx.elementColorForSpell('fire_strike'), '#f97316');
    assert.strictEqual(CombatFx.elementColorForSpell('ice_strike'), '#38bdf8');
    assert.strictEqual(CombatFx.elementColorForSpell('divine_grenade'), '#fde047');
    assert.strictEqual(CombatFx.elementColorForSpell('heal_light'), '#34d399');
    assert.strictEqual(CombatFx.elementColorForSpell('unknown_spell'), '#ffffff');

    // 2. FCT Queue & Expiry
    const fx = CombatFx.createCombatFx();
    assert.strictEqual(fx.getFctEntries().length, 0);

    fx.pushFct({ x: 5, y: 5, z: 0, text: '42', color: '#ffffff', life: 1.0 });
    assert.strictEqual(fx.getFctEntries().length, 1);
    const entry = fx.getFctEntries()[0];
    assert.strictEqual(entry.text, '42');
    assert.strictEqual(entry.age, 0);

    fx.update(0.5);
    assert.strictEqual(fx.getFctEntries().length, 1);
    assert.strictEqual(fx.getFctEntries()[0].age, 0.5);

    fx.update(0.6); // Total age 1.1 > life 1.0 -> removed
    assert.strictEqual(fx.getFctEntries().length, 0);

    // 3. FCT Max limit cap
    for (let i = 0; i < 100; i++) {
        fx.pushFct({ x: i, y: i, text: 'txt' + i });
    }
    assert.strictEqual(fx.getFctEntries().length, 64);
    fx.clear();
    assert.strictEqual(fx.getFctEntries().length, 0);

    // 4. Render FCT on canvas
    const ctx = createMockContext();
    fx.pushFct({ x: 10, y: 10, z: 0, text: '99!', color: '#fbbf24', isCrit: true });
    fx.render(ctx, { camX: 8, camY: 8, floorZ: 0, tw: 32, th: 32, nowSec: 100 });

    const strokeCalls = ctx.calls.filter((c) => c.op === 'strokeText');
    const fillCalls = ctx.calls.filter((c) => c.op === 'fillText');
    assert.strictEqual(strokeCalls.length, 1);
    assert.strictEqual(fillCalls.length, 1);
    assert.strictEqual(strokeCalls[0].text, '99!');
    assert.strictEqual(fillCalls[0].text, '99!');

    // Floor filter check: on floor 1, entry on floor 0 is skipped
    ctx.calls.length = 0;
    fx.render(ctx, { camX: 8, camY: 8, floorZ: 1, tw: 32, th: 32, nowSec: 100 });
    assert.strictEqual(ctx.calls.filter((c) => c.op === 'fillText').length, 0);

    // 5. Combat VFX: Melee, Projectile, AoE, Death
    fx.clear();
    fx.pushProjectile({ x0: 2, y0: 2, x1: 5, y1: 5, z: 0, color: '#ffffff' });
    fx.pushMelee({ x0: 2, y0: 2, x1: 3, y1: 2, z: 0, color: '#fbbf24' });
    fx.pushAoe({ x: 5, y: 5, z: 0, radius: 2, color: '#f97316' });
    fx.pushDeath({ x: 5, y: 5, z: 0, color: '#ff4444' });

    assert.strictEqual(fx.getFxEntries().length, 4);

    ctx.calls.length = 0;
    fx.render(ctx, { camX: 0, camY: 0, floorZ: 0, tw: 32, th: 32, nowSec: 200 });
    assert.ok(ctx.calls.some((c) => c.op === 'lineTo'));
    assert.ok(ctx.calls.some((c) => c.op === 'stroke'));
    assert.ok(ctx.calls.some((c) => c.op === 'fillRect'));

    fx.update(1.0); // All default fx have life < 0.5s -> all expired
    assert.strictEqual(fx.getFxEntries().length, 0);

    console.log('ok combat_fx');
}

main();
