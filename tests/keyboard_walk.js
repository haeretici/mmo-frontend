'use strict';

const assert = require('assert');
const kw = require('../static/js/keyboard_walk.js');

function countEmits(holdMs, pollEvery, stepDelayMs) {
    const w = kw.create();
    const sent = [];
    assert.strictEqual(w.keyDown('ArrowUp', 0), true);
    let dir = w.readyDir(0, stepDelayMs);
    if (dir != null) {
        sent.push({ t: 0, dir: dir });
        w.markEmitted(0);
    }
    for (let t = pollEvery; t <= holdMs; t += pollEvery) {
        dir = w.readyDir(t, stepDelayMs);
        if (dir != null) {
            sent.push({ t: t, dir: dir });
            w.markEmitted(t);
        }
    }
    return sent;
}

function main() {
    assert.strictEqual(kw.AUTO_REPEAT_DELAY_MS, 200);
    assert.strictEqual(kw.KEY_PRESS_REPEAT_MS, 30);
    assert.strictEqual(kw.dirOf('ArrowUp'), 0);
    assert.strictEqual(kw.dirOf('KeyD'), 1);
    assert.strictEqual(kw.dirOf('KeyS'), 2);
    assert.strictEqual(kw.dirOf('KeyA'), 3);
    assert.strictEqual(kw.dirOf('Space'), null);

    const w = kw.create();
    assert.strictEqual(w.keyDown('ArrowUp', 0), true);
    assert.strictEqual(w.readyDir(0, 200), 0);
    w.markEmitted(0);
    assert.strictEqual(w.keyDown('ArrowUp', 16), false);
    assert.strictEqual(w.readyDir(16, 200), null);
    assert.strictEqual(w.readyDir(199, 200), null);
    assert.strictEqual(w.readyDir(200, 200), 0);
    w.markEmitted(200);
    assert.strictEqual(w.readyDir(250, 200), null);
    assert.strictEqual(w.readyDir(400, 200), 0);

    const held1s = countEmits(1000, 16, 200);
    assert.strictEqual(held1s[0].t, 0);
    assert.ok(held1s.length <= 6, 'hold 1s at 200ms → ≤6 steps, got ' + held1s.length);
    assert.ok(held1s.length >= 5, 'hold 1s at 200ms → ≥5 steps, got ' + held1s.length);

    const flood = kw.create();
    assert.strictEqual(flood.keyDown('KeyW', 0), true);
    let n = 0;
    if (flood.readyDir(0, 200) != null) {
        n += 1;
        flood.markEmitted(0);
    }
    for (let t = 33; t <= 1000; t += 33) {
        assert.strictEqual(flood.keyDown('KeyW', t), false);
        if (flood.readyDir(t, 200) != null) {
            n += 1;
            flood.markEmitted(t);
        }
    }
    assert.ok(n <= 6, 'OS-repeat keydowns must not add steps, got ' + n);

    const turn = kw.create();
    assert.strictEqual(turn.keyDown('ArrowUp', 0), true);
    assert.strictEqual(turn.readyDir(0, 200), 0);
    turn.markEmitted(0);
    assert.strictEqual(turn.keyDown('ArrowRight', 100), true);
    assert.strictEqual(turn.currentDir(), 1);
    assert.strictEqual(turn.readyDir(100, 200), null);
    assert.strictEqual(turn.readyDir(200, 200), 1);
    turn.keyUp('ArrowRight');
    assert.strictEqual(turn.currentDir(), 0);
    turn.keyUp('ArrowUp');
    assert.strictEqual(turn.isHeld(), false);
    assert.strictEqual(turn.readyDir(400, 200), null);

    const slow = countEmits(800, 16, 400);
    assert.strictEqual(slow.length, 3);

    console.log('ok keyboard_walk');
}

main();
