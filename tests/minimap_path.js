'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mp = require('../static/js/minimap_path.js');
const pw = require('../static/js/path_walk.js');
const store = require('../static/js/minimap_store.js');

function open(x, y) {
    return x >= -8 && y >= -8 && x <= 80 && y <= 80;
}

function walkDirs(from, dirs) {
    let x = from.x | 0;
    let y = from.y | 0;
    for (let i = 0; i < dirs.length; i++) {
        const step = mp.DIRS[dirs[i]];
        assert.ok(step, 'dir ' + dirs[i]);
        x += step.dx;
        y += step.dy;
    }
    return { x: x, y: y };
}

function line(limit) {
    return function (x, y) {
        return y === 0 && x >= 0 && x <= limit;
    };
}

async function noteGrass(width, height, z, ox, oy, tiles, blocker) {
    const cells = tiles || [];
    if (!tiles) {
        for (let i = 0; i < width * height; i++) cells.push(1);
    }
    await store.noteWindow('isle', {
        originX: ox,
        originY: oy,
        z: z,
        width: width,
        height: height,
        tiles: cells
    }, blocker || null);
}

function quietStore() {
    store.resetForTests();
    store.setBackendForTests({
        getAll: function () { return Promise.resolve([]); },
        put: function () { return Promise.resolve(); }
    });
    store.setSchedulerForTests(function () { return 0; }, function () {});
}

async function main() {
    assert.strictEqual(mp.MAX_DISTANCE, 250);
    assert.strictEqual(mp.MAX_ITERATIONS, 4096);
    assert.strictEqual(mp.PACKET_CAP, 165);
    assert.strictEqual(mp.DIRS.length, 8);
    assert.strictEqual(mp.DIRS[0].dir, 0);
    assert.strictEqual(mp.DIRS[7].dir, 7);

    const src = fs.readFileSync(path.join(__dirname, '../static/js/minimap_path.js'), 'utf8');
    assert.ok(!src.includes('indexedDB'));
    assert.ok(!src.includes('pathfinder'));
    assert.ok(!src.includes('/visual'));
    assert.ok(!src.includes('MOVE_PATH'));
    assert.strictEqual(mp.FLOOR_TEXT, 'You cannot walk to that floor.');
    assert.strictEqual(mp.RANGE_TEXT, 'Destination is out of range.');

    const play = fs.readFileSync(path.join(__dirname, '../static/js/play.js'), 'utf8');
    assert.ok(play.includes('MinimapPath'));
    assert.ok(play.includes('findOrthogonalPath'));
    assert.ok(play.includes('MOVE_STEP'));
    assert.ok(play.includes('avoidHopPads'));
    assert.ok(play.includes('hopPadAt'));
    assert.ok(!play.includes('indexedDB'));

    assert.deepStrictEqual(mp.findPath({ x: 0, y: 0 }, { x: 0, y: 0 }, open), []);
    assert.deepStrictEqual(mp.findPath({ x: 0, y: 0 }, { x: 1, y: 0 }, open), [1]);
    assert.deepStrictEqual(mp.findPath({ x: 0, y: 0 }, { x: 0, y: -1 }, open), [0]);
    assert.deepStrictEqual(mp.findPath({ x: 0, y: 0 }, { x: 0, y: 1 }, open), [2]);
    assert.deepStrictEqual(mp.findPath({ x: 0, y: 0 }, { x: -1, y: 0 }, open), [3]);
    assert.deepStrictEqual(mp.findPath({ x: 0, y: 0 }, { x: -1, y: 1 }, open), [4]);
    assert.deepStrictEqual(mp.findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, open), [5]);
    assert.deepStrictEqual(mp.findPath({ x: 0, y: 0 }, { x: -1, y: -1 }, open), [6]);
    assert.deepStrictEqual(mp.findPath({ x: 0, y: 0 }, { x: 1, y: -1 }, open), [7]);

    const east = mp.findPath({ x: 2, y: 3 }, { x: 6, y: 3 }, open);
    assert.deepStrictEqual(east, [1, 1, 1, 1]);
    assert.deepStrictEqual(walkDirs({ x: 2, y: 3 }, east), { x: 6, y: 3 });

    function stairAt(x, y) {
        return x === 2 && y === 1;
    }
    function openBand(x, y) {
        return y >= 0 && y <= 2 && x >= 0 && x <= 4;
    }
    const aroundStair = mp.findPath(
        { x: 0, y: 1 },
        { x: 4, y: 1 },
        pw.avoidHopPads(openBand, stairAt, { x: 4, y: 1 })
    );
    assert.ok(aroundStair && aroundStair.length > 1);
    let sx = 0;
    let sy = 1;
    for (let i = 0; i < aroundStair.length; i++) {
        sx += mp.DIRS[aroundStair[i]].dx;
        sy += mp.DIRS[aroundStair[i]].dy;
        assert.ok(!(sx === 2 && sy === 1), 'A* does not enter the stair');
    }
    assert.strictEqual(sx, 4);
    assert.strictEqual(sy, 1);
    const ontoStair = mp.findPath(
        { x: 0, y: 1 },
        { x: 2, y: 1 },
        pw.avoidHopPads(openBand, stairAt, { x: 2, y: 1 })
    );
    assert.deepStrictEqual(walkDirs({ x: 0, y: 1 }, ontoStair), { x: 2, y: 1 });

    function pinch(x, y) {
        if (x === 2 && y === 1) return false;
        if (x === 1 && y === 2) return false;
        if (x < 0 || y < 0 || x > 2 || y > 2) return false;
        return true;
    }
    assert.strictEqual(mp.diagonalClosed(1, 1, 1, 1, pinch), true);
    assert.strictEqual(pw.diagonalClosed(1, 1, 1, 1, pinch), true);
    assert.strictEqual(mp.findPath({ x: 1, y: 1 }, { x: 2, y: 2 }, pinch), null, 'both sides closed');

    function oneSide(x, y) {
        if (x === 2 && y === 1) return false;
        if (x < 0 || y < 0 || x > 2 || y > 2) return false;
        return true;
    }
    assert.strictEqual(mp.diagonalClosed(1, 1, 1, 1, oneSide), false);
    assert.deepStrictEqual(mp.findPath({ x: 1, y: 1 }, { x: 2, y: 2 }, oneSide), [5]);

    function unknownSide(x, y) {
        if (x === 0 && y === 1) return false;
        return x >= 0 && y >= 0 && x <= 3 && y <= 3;
    }
    assert.strictEqual(mp.diagonalClosed(1, 1, -1, -1, unknownSide), false);
    assert.deepStrictEqual(
        mp.findPath({ x: 1, y: 1 }, { x: 0, y: 0 }, unknownSide),
        [6],
        'one unseen side still allows the diagonal'
    );

    function wallGoal(x, y) {
        if (x === 2 && y === 0) return false;
        return y === 0 && x >= 0 && x <= 2;
    }
    assert.strictEqual(mp.findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, wallGoal), null, 'goal is not skipped');

    let farCalls = 0;
    function farSpy() {
        farCalls += 1;
        return true;
    }
    assert.strictEqual(mp.findPath({ x: 0, y: 0 }, { x: 251, y: 0 }, farSpy), null);
    assert.strictEqual(farCalls, 0, 'a goal past 250 does not search');
    assert.strictEqual(mp.tooFar(0, 0, 250, 0), false);
    assert.strictEqual(mp.tooFar(0, 0, 251, 0), true);
    assert.strictEqual(mp.tooFar(0, 0, 177, 177), true);
    assert.strictEqual(mp.tooFar(0, 0, 176, 177), false);

    const to250 = mp.findPath({ x: 0, y: 0 }, { x: 250, y: 0 }, line(250));
    assert.ok(to250);
    assert.strictEqual(to250.length, 250);
    assert.deepStrictEqual(walkDirs({ x: 0, y: 0 }, to250), { x: 250, y: 0 });

    let maxEntered = 0;
    function radiusSpy(x, y) {
        const dist2 = x * x + y * y;
        if (dist2 > maxEntered) maxEntered = dist2;
        return y === 0 && x >= 0 && x <= 3;
    }
    const near = mp.findPath({ x: 0, y: 0 }, { x: 3, y: 0 }, radiusSpy, { maxDistance: 4 });
    assert.ok(near);
    assert.ok(maxEntered <= 16, 'expansion stays inside the cap');

    function detour(x, y) {
        if (y === 0 && x >= 0 && x <= 10 && x !== 5) return true;
        if (x === 0 && y > 0 && y <= 300) return true;
        if (x === 5 && y > 0 && y <= 300) return true;
        if (y === 300 && x >= 0 && x <= 5) return true;
        return false;
    }
    assert.strictEqual(
        mp.findPath({ x: 0, y: 0 }, { x: 10, y: 0 }, detour),
        null,
        'a detour past 250 is not entered'
    );

    const reached = mp.findPath(
        { x: 0, y: 0 },
        { x: 4096, y: 0 },
        line(4096),
        { maxDistance: 5000 }
    );
    assert.ok(reached);
    assert.strictEqual(reached.length, 4096);
    assert.strictEqual(
        mp.findPath({ x: 0, y: 0 }, { x: 4097, y: 0 }, line(4097), { maxDistance: 5000 }),
        null,
        'the 4097th expansion fails'
    );
    assert.strictEqual(
        mp.findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, line(4), { maxIterations: 2 }),
        null
    );
    assert.ok(mp.findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, line(2), { maxIterations: 2 }));

    assert.strictEqual(
        mp.findPath({ x: 0, y: 0, z: 7 }, { x: 1, y: 0, z: 6 }, open),
        null,
        'another floor does not search'
    );

    const player = { x: 10, y: 20, z: 7 };
    assert.deepStrictEqual(mp.clickPlan(player, { x: 10, y: 20, z: 6 }), {
        type: 'text',
        text: 'You cannot walk to that floor.'
    });
    assert.deepStrictEqual(mp.clickPlan(player, { x: 10, y: 20, z: 7 }), { type: 'arrive' });
    assert.deepStrictEqual(mp.clickPlan(player, { x: 300, y: 20, z: 7 }), {
        type: 'text',
        text: 'Destination is out of range.'
    });
    assert.deepStrictEqual(mp.clickPlan(player, { x: 12, y: 20 }), { type: 'search', x: 12, y: 20, z: 7 });

    const long = [];
    for (let i = 0; i < 200; i++) long.push(1);
    const clipped = mp.clipSteps(long);
    assert.strictEqual(clipped.length, 165);
    assert.strictEqual(long.length, 200);
    assert.deepStrictEqual(mp.clipSteps([1, 2, 3]), [1, 2, 3]);
    assert.strictEqual(mp.afterStep(165, false, true), 'wait');
    assert.strictEqual(mp.afterStep(2, false, true), 'wait');
    assert.strictEqual(mp.afterStep(1, false, true), 'continue');
    assert.strictEqual(mp.afterStep(1, true, true), 'arrive');
    assert.strictEqual(mp.afterStep(40, true, false), 'arrive');
    assert.strictEqual(mp.afterStep(40, false, false), 'cancel-floor');

    const beside = mp.nearestApproach({ x: 0, y: 0 }, { x: 4, y: 0 }, 1, function (x, y) {
        if (x === 4 && y === 0) return false;
        return y === 0 && x >= 0 && x <= 4;
    });
    assert.deepStrictEqual(beside, { x: 3, y: 0 });
    assert.deepStrictEqual(
        mp.nearestApproach({ x: 4, y: 1 }, { x: 4, y: 0 }, 1, function () { return false; }),
        { x: 4, y: 1 }
    );

    quietStore();
    await noteGrass(11, 1, 7, 0, 0);
    function storedWalk(x, y) {
        return store.queryCell('isle', x, y, 7, null).walkable;
    }
    const outside = mp.findPath({ x: 0, y: 0 }, { x: 10, y: 0 }, storedWalk);
    assert.ok(outside);
    assert.strictEqual(outside.length, 10);
    assert.deepStrictEqual(walkDirs({ x: 0, y: 0 }, outside), { x: 10, y: 0 });

    quietStore();
    await noteGrass(4, 1, 7, 0, 0);
    await noteGrass(4, 1, 7, 5, 0);
    assert.strictEqual(store.readByte('isle', 4, 0, 7), 0);
    assert.strictEqual(
        mp.findPath({ x: 0, y: 0 }, { x: 8, y: 0 }, function (x, y) {
            return store.queryCell('isle', x, y, 7, null).walkable;
        }),
        null,
        'an unseen cell is blocked'
    );

    quietStore();
    await noteGrass(8, 1, 7, 0, 0, null, function (x) { return x === 4; });
    assert.strictEqual(
        mp.findPath({ x: 0, y: 0 }, { x: 7, y: 0 }, function (x, y) {
            return store.queryCell('isle', x, y, 7, null).walkable;
        }),
        null,
        'a baked blocker is not walkable'
    );

    quietStore();
    await noteGrass(6, 2, 7, 0, 0);
    const live = {
        originX: 0,
        originY: 0,
        z: 7,
        width: 6,
        height: 2,
        tiles: [
            1, 1, 1, 1, 1, 1,
            1, 1, 1, 1, 1, 1
        ],
        walkable: function (x, y) {
            if (x === 2 && y === 1) return false;
            return x >= 0 && y >= 0 && x < 6 && y < 2;
        }
    };
    function liveWalk(x, y) {
        return store.queryCell('isle', x, y, 7, live).walkable;
    }
    assert.strictEqual(liveWalk(2, 1), false, 'a creature on the goal blocks');
    assert.strictEqual(mp.findPath({ x: 0, y: 1 }, { x: 2, y: 1 }, liveWalk), null);
    const around = mp.findPath({ x: 0, y: 1 }, { x: 4, y: 1 }, liveWalk);
    assert.ok(around);
    let cx = 0;
    let cy = 1;
    for (let i = 0; i < around.length; i++) {
        const step = mp.DIRS[around[i]];
        cx += step.dx;
        cy += step.dy;
        assert.ok(!(cx === 2 && cy === 1), 'the path does not step on the creature');
        assert.ok(liveWalk(cx, cy));
    }
    assert.strictEqual(cx, 4);
    assert.strictEqual(cy, 1);

    quietStore();
    await noteGrass(21, 2, 7, 0, 0);
    const windowLive = {
        originX: 0,
        originY: 0,
        z: 7,
        width: 5,
        height: 2,
        tiles: [
            1, 1, 1, 1, 1,
            1, 1, 1, 1, 1
        ],
        walkable: function (x, y) {
            if (x === 2 && y === 0) return false;
            return x >= 0 && x < 5 && y >= 0 && y < 2;
        }
    };
    function mixedWalk(x, y) {
        return store.queryCell('isle', x, y, 7, windowLive).walkable;
    }
    assert.strictEqual(store.queryCell('isle', 12, 0, 7, windowLive).live, false);
    assert.strictEqual(mixedWalk(12, 0), true, 'stored grass outside the rectangle walks');
    assert.strictEqual(mixedWalk(2, 0), false);
    const mixed = mp.findPath({ x: 0, y: 0 }, { x: 12, y: 0 }, mixedWalk);
    assert.ok(mixed);
    cx = 0;
    cy = 0;
    for (let i = 0; i < mixed.length; i++) {
        const step = mp.DIRS[mixed[i]];
        cx += step.dx;
        cy += step.dy;
        assert.ok(!(cx === 2 && cy === 0));
    }
    assert.strictEqual(cx, 12);
    assert.strictEqual(cy, 0);

    store.resetForTests();
    console.log('minimap_path: ok');
}

main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
