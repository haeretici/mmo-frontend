'use strict';

const assert = require('assert');
const Hud = require('../static/js/entity_hud.js');

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
        ellipse: (cx, cy, rx, ry, rot, s, e) => calls.push({ op: 'ellipse', cx, cy, rx, ry }),
        fill: () => calls.push({ op: 'fill' }),
        stroke: () => calls.push({ op: 'stroke' }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: '',
        shadowColor: '',
        shadowBlur: 0
    };
}

function main() {
    // 1. Constants
    assert.strictEqual(Hud.BAR_H, 4);
    assert.strictEqual(Hud.BAR_GAP, 1);
    assert.strictEqual(Hud.STACK_PAD, 2);
    assert.strictEqual(Hud.NAME_GAP, 3);
    assert.strictEqual(Hud.MANA_SHIELD_BAR_FILL, '#a855f7');
    assert.strictEqual(Hud.HOVER_STROKE, '#ffd700');
    assert.strictEqual(Hud.HOVER_LINE_WIDTH, 2);
    assert.strictEqual(Hud.HOVER_SHADOW_BLUR, 6);

    // 2. hpFill 3-tier ramp
    assert.strictEqual(Hud.hpFill(1.0), '#00ff00');
    assert.strictEqual(Hud.hpFill(0.71), '#00ff00');
    assert.strictEqual(Hud.hpFill(0.70), '#ffff00');
    assert.strictEqual(Hud.hpFill(0.41), '#ffff00');
    assert.strictEqual(Hud.hpFill(0.40), '#ff0000');
    assert.strictEqual(Hud.hpFill(0.10), '#ff0000');
    assert.strictEqual(Hud.hpFill(0.0), '#ff0000');

    // 3. resolveManaShieldBar
    assert.strictEqual(Hud.resolveManaShieldBar(null), null);
    assert.strictEqual(Hud.resolveManaShieldBar({}), null);
    const entWithShield = { manaShield: { remaining: 50, max: 100 } };
    const shieldBar = Hud.resolveManaShieldBar(entWithShield);
    assert.ok(shieldBar);
    assert.strictEqual(shieldBar.kind, 'mana_shield');
    assert.strictEqual(shieldBar.frac, 0.5);
    assert.strictEqual(shieldBar.fill, '#a855f7');

    const entWithCond = { conditions: [{ kind: 'mana_shield', poolRemaining: 30, poolMax: 60 }] };
    const condBar = Hud.resolveManaShieldBar(entWithCond);
    assert.ok(condBar);
    assert.strictEqual(condBar.frac, 0.5);

    // 4. nameplateBarsForEntity
    const entFull = {
        name: 'Player',
        hp: 80,
        hpMax: 100,
        mp: 40,
        mpMax: 50,
        manaShield: { remaining: 25, max: 50 }
    };
    const barsPlayer = Hud.nameplateBarsForEntity(entFull, true);
    assert.strictEqual(barsPlayer.length, 3);
    assert.strictEqual(barsPlayer[0].kind, 'mana_shield');
    assert.strictEqual(barsPlayer[0].frac, 0.5);
    assert.strictEqual(barsPlayer[1].kind, 'hp');
    assert.strictEqual(barsPlayer[1].frac, 0.8);
    assert.strictEqual(barsPlayer[1].fill, '#00ff00');
    assert.strictEqual(barsPlayer[2].kind, 'mp');
    assert.strictEqual(barsPlayer[2].frac, 0.8);
    assert.strictEqual(barsPlayer[2].fill, '#0000ff');

    const creatureBars = Hud.nameplateBarsForEntity({ hp: 10, hpMax: 50 }, false);
    assert.strictEqual(creatureBars.length, 1);
    assert.strictEqual(creatureBars[0].kind, 'hp');
    assert.strictEqual(creatureBars[0].frac, 0.2);
    assert.strictEqual(creatureBars[0].fill, '#ff0000');

    // 5. drawBarAt
    const ctxBar = createMockContext();
    Hud.drawBarAt(ctxBar, 10, 20, 32, 0.5, '#00ff00');
    const fillRects = ctxBar.calls.filter((c) => c.op === 'fillRect');
    assert.strictEqual(fillRects.length, 2);
    assert.deepStrictEqual(fillRects[0], { op: 'fillRect', x: 10, y: 20, w: 32, h: 4 });
    assert.deepStrictEqual(fillRects[1], { op: 'fillRect', x: 10, y: 20, w: 16, h: 4 });
    const strokeRects = ctxBar.calls.filter((c) => c.op === 'strokeRect');
    assert.strictEqual(strokeRects.length, 1);
    assert.deepStrictEqual(strokeRects[0], { op: 'strokeRect', x: 10.5, y: 20.5, w: 31, h: 3 });

    // 6. drawNameplate
    const ctxName = createMockContext();
    Hud.drawNameplate(ctxName, { name: 'Dragon', hp: 50, hpMax: 100 }, 64, 100, 32, false);
    const strokeTexts = ctxName.calls.filter((c) => c.op === 'strokeText');
    assert.strictEqual(strokeTexts.length, 1);
    assert.strictEqual(strokeTexts[0].text, 'Dragon');
    assert.strictEqual(strokeTexts[0].x, 64 + 16); // Centered on tile
    const fillTexts = ctxName.calls.filter((c) => c.op === 'fillText');
    assert.strictEqual(fillTexts.length, 1);
    assert.strictEqual(fillTexts[0].text, 'Dragon');

    // 7. targetPulse
    const pulse1 = Hud.targetPulse(0);
    assert.ok(pulse1.fill.startsWith('#ff')); // Cos(0) = 1 -> #ff0000
    assert.strictEqual(pulse1.alpha, 0.62);

    // 8. drawTargetReticle
    const ctxReticle = createMockContext();
    Hud.drawTargetReticle(ctxReticle, 32, 64, 32, 32, 0);
    assert.ok(ctxReticle.calls.some((c) => c.op === 'ellipse'));
    assert.ok(ctxReticle.calls.some((c) => c.op === 'fill'));
    assert.ok(ctxReticle.calls.some((c) => c.op === 'stroke'));

    // 9. drawHoverHighlight
    const ctxHover = createMockContext();
    Hud.drawHoverHighlight(ctxHover, { dx: 10, dy: 20, dw: 30, dh: 40 });
    const hoverStroke = ctxHover.calls.find((c) => c.op === 'strokeRect');
    assert.ok(hoverStroke);
    assert.strictEqual(hoverStroke.x, 8); // dx - 2
    assert.strictEqual(hoverStroke.y, 18); // dy - 2
    assert.strictEqual(hoverStroke.w, 34); // dw + 4
    assert.strictEqual(hoverStroke.h, 44); // dh + 4

    // 10. Stacked bar positions above sprite
    const ctxMulti = createMockContext();
    Hud.drawNameplate(ctxMulti, entFull, 0, 200, 32, true);
    // 3 bars (shield, hp, mp) -> barsH = 3 * 4 + 2 * 1 = 14
    // cursorY = 200 - 2 - 14 = 184
    // shield at y=184, hp at y=189, mp at y=194
    const barFills = ctxMulti.calls.filter((c) => c.op === 'fillRect' && c.w === 32);
    assert.strictEqual(barFills.length, 3);
    assert.strictEqual(barFills[0].y, 184);
    assert.strictEqual(barFills[1].y, 189);
    assert.strictEqual(barFills[2].y, 194);

    // 11. Mirror math around sprite center
    const box = { dx: 16, dy: 32, dw: 32, dh: 32 };
    const cx = box.dx + box.dw / 2;
    assert.strictEqual(cx, 32);

    console.log('ok entity_hud');
}

main();
