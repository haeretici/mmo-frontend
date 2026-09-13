'use strict';

const assert = require('assert');
const SpritePres = require('../static/js/sprite_presentation.js');

function createMockContext() {
    const calls = [];
    return {
        calls,
        save: () => calls.push({ op: 'save' }),
        restore: () => calls.push({ op: 'restore' }),
        fillRect: (x, y, w, h) => calls.push({ op: 'fillRect', x, y, w, h }),
        strokeRect: (x, y, w, h) => calls.push({ op: 'strokeRect', x, y, w, h }),
        beginPath: () => calls.push({ op: 'beginPath' }),
        ellipse: (cx, cy, rx, ry, rot, s, e) => calls.push({ op: 'ellipse', cx, cy, rx, ry }),
        fill: () => calls.push({ op: 'fill' }),
        stroke: () => calls.push({ op: 'stroke' }),
        translate: (x, y) => calls.push({ op: 'translate', x, y }),
        scale: (x, y) => calls.push({ op: 'scale', x, y }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        shadowColor: '',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        globalAlpha: 1
    };
}

function main() {
    // 1. Constants
    assert.strictEqual(SpritePres.HIT_FLASH_SEC, 0.12);
    assert.strictEqual(SpritePres.HIT_RECOIL_SEC, 0.1);
    assert.strictEqual(SpritePres.HIT_RECOIL_TILES, 0.1);
    assert.strictEqual(SpritePres.SHADOW_ALPHA, 0.28);
    assert.strictEqual(SpritePres.TARGET_SHADOW_ALPHA, 0.62);

    // 2. stepBobOffsetPx
    assert.strictEqual(SpritePres.stepBobOffsetPx(null), 0);
    assert.strictEqual(SpritePres.stepBobOffsetPx({ moveDur: 0 }), 0);
    const movingEnt = { moveAt: 1000, moveDur: 200 };
    // t = 0 -> 0
    assert.strictEqual(SpritePres.stepBobOffsetPx(movingEnt, 1000, 32, 0.1), 0);
    // t = 0.5 -> peak = -sin(pi/2) * 32 * 0.1 = -3.2
    const peak = SpritePres.stepBobOffsetPx(movingEnt, 1100, 32, 0.1);
    assert.ok(Math.abs(peak - (-3.2)) < 1e-4);
    // t = 1 -> 0
    assert.strictEqual(SpritePres.stepBobOffsetPx(movingEnt, 1200, 32, 0.1), 0);
    // t > 1 -> 0
    assert.strictEqual(SpritePres.stepBobOffsetPx(movingEnt, 1300, 32, 0.1), 0);

    // 3. beginHitFeedback, hitFlashStrength, getHitRecoilOffset
    const defender = { x: 5, y: 5 };
    const attacker = { x: 4, y: 5 };
    SpritePres.beginHitFeedback(defender, attacker, 10.0);

    assert.strictEqual(defender._hitFlashUntil, 10.0 + SpritePres.HIT_FLASH_SEC);
    assert.strictEqual(defender._hitRecoilUntil, 10.0 + SpritePres.HIT_RECOIL_SEC);
    assert.ok(defender._hitRecoilDx > 0); // Attacker is to the left (x=4), recoil pushes right (>0)
    assert.strictEqual(defender._hitRecoilDy, 0);

    // Flash strength at start
    const flashStart = SpritePres.hitFlashStrength(defender, 10.0);
    assert.ok(Math.abs(flashStart - 1.0) < 1e-4);
    // Flash strength mid
    const flashMid = SpritePres.hitFlashStrength(defender, 10.0 + SpritePres.HIT_FLASH_SEC / 2);
    assert.ok(Math.abs(flashMid - 0.5) < 1e-4);
    // Flash strength after expired
    const flashEnd = SpritePres.hitFlashStrength(defender, 10.0 + SpritePres.HIT_FLASH_SEC + 0.01);
    assert.strictEqual(flashEnd, 0);

    // Recoil offset at start
    const recoilStart = SpritePres.getHitRecoilOffset(defender, 10.0, 32, 32);
    assert.ok(Math.abs(recoilStart.x - 0.1 * 32) < 1e-4);
    assert.strictEqual(recoilStart.y, 0);
    // Recoil offset at mid
    const recoilMid = SpritePres.getHitRecoilOffset(defender, 10.0 + SpritePres.HIT_RECOIL_SEC / 2, 32, 32);
    assert.ok(Math.abs(recoilMid.x - 0.05 * 32) < 1e-4);
    // Recoil offset after expired
    const recoilEnd = SpritePres.getHitRecoilOffset(defender, 10.0 + SpritePres.HIT_RECOIL_SEC + 0.01, 32, 32);
    assert.strictEqual(recoilEnd.x, 0);
    assert.strictEqual(recoilEnd.y, 0);

    // 4. drawEntityShadow
    const ctx = createMockContext();
    SpritePres.drawEntityShadow(ctx, 100, 100, 32, 32);
    assert.ok(ctx.calls.some((c) => c.op === 'save'));
    assert.ok(ctx.calls.some((c) => c.op === 'ellipse'));
    assert.ok(ctx.calls.some((c) => c.op === 'fill'));
    assert.ok(ctx.calls.some((c) => c.op === 'restore'));

    // Target highlight shadow
    ctx.calls.length = 0;
    SpritePres.drawEntityShadow(ctx, 100, 100, 32, 32, 1, null, false, { combatTargetHighlight: true });
    assert.strictEqual(ctx.globalAlpha, SpritePres.TARGET_SHADOW_ALPHA);
    assert.ok(ctx.fillStyle.startsWith('#'));

    // 5. drawSpriteHitFlash
    ctx.calls.length = 0;
    SpritePres.drawSpriteHitFlash(ctx, { dx: 10, dy: 10, dw: 32, dh: 32 }, 1.0);
    assert.ok(ctx.calls.some((c) => c.op === 'fillRect'));
    assert.strictEqual(ctx.fillStyle, '#ffffff');

    // 6. resolveEntityRarityTier
    assert.strictEqual(SpritePres.resolveEntityRarityTier(null), null);
    assert.strictEqual(SpritePres.resolveEntityRarityTier({ isPlayer: true, isBoss: true }), null);
    assert.strictEqual(SpritePres.resolveEntityRarityTier({ rarity: 'rare' }), 'rare');
    assert.strictEqual(SpritePres.resolveEntityRarityTier({ affixes: ['elite', 'rare'] }), 'elite');
    assert.strictEqual(SpritePres.resolveEntityRarityTier({ boss: true }), 'boss');

    // 7. drawEntityRarityAura
    ctx.calls.length = 0;
    SpritePres.drawEntityRarityAura(ctx, null, { dx: 10, dy: 10, dw: 32, dh: 32 }, false, 'boss');
    assert.ok(ctx.calls.some((c) => c.op === 'strokeRect'));
    assert.strictEqual(ctx.strokeStyle, SpritePres.RARITY_AURA.boss.color);

    console.log('ok sprite_presentation');
}

main();
