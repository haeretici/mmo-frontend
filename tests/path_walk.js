'use strict';

const assert = require('assert');
const pw = require('../static/js/path_walk.js');

function main() {
    const grid = {
        originX: 0,
        originY: 0,
        width: 5,
        height: 5,
        tiles: [
            1, 1, 1, 1, 1,
            1, 3, 3, 3, 1,
            1, 1, 1, 3, 1,
            1, 3, 1, 1, 1,
            1, 1, 1, 1, 1
        ]
    };
    function walkable(x, y) {
        const t = pw.tileAt(grid, x, y);
        return t != null && pw.walkTile(t);
    }

    assert.deepStrictEqual(pw.findOrthogonalPath({ x: 0, y: 0 }, { x: 0, y: 0 }, walkable), []);

    const around = pw.findOrthogonalPath({ x: 0, y: 2 }, { x: 4, y: 2 }, walkable);
    assert.ok(around && around.length > 0);
    let x = 0, y = 2;
    around.forEach(function (dir) {
        const d = pw.DIRS[dir];
        x += d.dx;
        y += d.dy;
        assert.ok(walkable(x, y), 'step onto ' + x + ',' + y);
    });
    assert.strictEqual(x, 4);
    assert.strictEqual(y, 2);

    assert.strictEqual(pw.findOrthogonalPath({ x: 0, y: 0 }, { x: 1, y: 1 }, walkable), null);

    const open = {
        originX: 0, originY: 0, width: 3, height: 3,
        tiles: [
            1, 1, 1,
            1, 1, 1,
            1, 1, 1
        ]
    };
    function openWalk(x, y) {
        const t = pw.tileAt(open, x, y);
        return t != null && pw.walkTile(t);
    }
    assert.deepStrictEqual(
        pw.findOrthogonalPath({ x: 0, y: 2 }, { x: 1, y: 1 }, openWalk),
        [7],
        'open ground takes one north-east step'
    );

    const pinched = {
        originX: 0, originY: 0, width: 3, height: 3,
        tiles: [
            1, 3, 1,
            3, 1, 3,
            1, 3, 1
        ]
    };
    function pinchWalk(x, y) {
        const t = pw.tileAt(pinched, x, y);
        return t != null && pw.walkTile(t);
    }
    assert.strictEqual(
        pw.findOrthogonalPath({ x: 1, y: 1 }, { x: 0, y: 0 }, pinchWalk),
        null,
        'both cardinal sides closed blocks the diagonal'
    );
    assert.strictEqual(pw.diagonalClosed(1, 1, -1, -1, pinchWalk), true);

    const oneSide = {
        originX: 0, originY: 0, width: 3, height: 3,
        tiles: [
            1, 1, 1,
            3, 1, 1,
            1, 1, 1
        ]
    };
    function oneWalk(x, y) {
        const t = pw.tileAt(oneSide, x, y);
        return t != null && pw.walkTile(t);
    }
    assert.deepStrictEqual(
        pw.findOrthogonalPath({ x: 1, y: 1 }, { x: 0, y: 0 }, oneWalk),
        [6],
        'one open side still allows north-west'
    );

    const approach = pw.nearestApproach({ x: 0, y: 0 }, { x: 4, y: 0 }, 1, walkable);
    assert.ok(approach);
    assert.ok(pw.chebyshev(approach.x, approach.y, 4, 0) <= 1);

    assert.strictEqual(pw.CHASE_APPROACH_RANGE, 1, 'chase is adjacent, not weapon range');
    const chaseDest = pw.nearestApproach(
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        pw.CHASE_APPROACH_RANGE,
        walkable
    );
    assert.ok(chaseDest);
    assert.strictEqual(pw.chebyshev(chaseDest.x, chaseDest.y, 4, 0), 1);
    assert.ok(!(chaseDest.x === 0 && chaseDest.y === 0), 'Scout 4 sqm away still walks in');

    function stairAt(x, y) {
        return x === 2 && y === 1;
    }
    function openRow(x, y) {
        return y >= 0 && y <= 2 && x >= 0 && x <= 4;
    }
    function corridor(x, y) {
        return y === 1 && x >= 0 && x <= 4;
    }
    function trace(from, dirs) {
        const cells = [];
        let x = from.x | 0;
        let y = from.y | 0;
        for (let i = 0; i < dirs.length; i++) {
            const step = pw.DIRS[dirs[i]];
            x += step.dx;
            y += step.dy;
            cells.push(x + ',' + y);
        }
        return cells;
    }
    const stairAround = pw.findOrthogonalPath(
        { x: 0, y: 1 },
        { x: 4, y: 1 },
        pw.avoidHopPads(openRow, stairAt, { x: 4, y: 1 })
    );
    assert.ok(stairAround && stairAround.length > 1, 'path goes around the stair');
    const aroundCells = trace({ x: 0, y: 1 }, stairAround);
    assert.ok(aroundCells.indexOf('2,1') < 0, 'around path does not enter the stair');
    assert.strictEqual(aroundCells[aroundCells.length - 1], '4,1');

    const onto = pw.findOrthogonalPath(
        { x: 0, y: 1 },
        { x: 2, y: 1 },
        pw.avoidHopPads(openRow, stairAt, { x: 2, y: 1 })
    );
    assert.ok(onto && onto.length > 0, 'click on the stair still walks there');
    assert.strictEqual(trace({ x: 0, y: 1 }, onto).pop(), '2,1');

    assert.strictEqual(
        pw.findOrthogonalPath(
            { x: 0, y: 1 },
            { x: 4, y: 1 },
            pw.avoidHopPads(corridor, stairAt, { x: 4, y: 1 })
        ),
        null,
        'a stair blocking the only corridor is not a shortcut'
    );
    const stand = pw.nearestApproach(
        { x: 0, y: 1 },
        { x: 4, y: 1 },
        1,
        pw.avoidHopPads(openRow, stairAt, null)
    );
    assert.ok(stand);
    assert.ok(!(stand.x === 2 && stand.y === 1), 'approach does not stand on the stair');

    assert.strictEqual(pw.isDamageFieldKind('fire'), true);
    assert.strictEqual(pw.isDamageFieldKind('fire_field'), true);
    assert.strictEqual(pw.isDamageFieldKind('poison'), true);
    assert.strictEqual(pw.isDamageFieldKind('poisonfield'), true);
    assert.strictEqual(pw.isDamageFieldKind('earth'), true);
    assert.strictEqual(pw.isDamageFieldKind('energy'), true);
    assert.strictEqual(pw.isDamageFieldKind('energy_field'), true);
    assert.strictEqual(pw.isDamageFieldKind('barrier'), false);
    assert.strictEqual(pw.isDamageFieldKind('vine'), false);
    assert.strictEqual(pw.isDamageFieldKind('magic_wall'), false);
    assert.strictEqual(pw.isDamageFieldKind(''), false);

    function fireAt(x, y) {
        return x === 2 && y === 1;
    }
    const aroundFire = pw.findOrthogonalPath(
        { x: 0, y: 1 },
        { x: 4, y: 1 },
        pw.avoidHopPads(openRow, fireAt, { x: 4, y: 1 })
    );
    assert.ok(aroundFire && aroundFire.length > 1, 'path goes around the fire field');
    assert.ok(trace({ x: 0, y: 1 }, aroundFire).indexOf('2,1') < 0, 'around path does not enter the fire');
    const ontoFire = pw.findOrthogonalPath(
        { x: 0, y: 1 },
        { x: 2, y: 1 },
        pw.avoidHopPads(openRow, fireAt, { x: 2, y: 1 })
    );
    assert.strictEqual(trace({ x: 0, y: 1 }, ontoFire).pop(), '2,1', 'click on the field still walks there');
    const standOffFire = pw.nearestApproach(
        { x: 0, y: 1 },
        { x: 3, y: 1 },
        1,
        pw.avoidHopPads(openRow, fireAt, null)
    );
    assert.ok(standOffFire);
    assert.ok(!(standOffFire.x === 2 && standOffFire.y === 1), 'approach does not stand on the field');

    console.log('ok path_walk');
}

main();
