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

    const approach = pw.nearestApproach({ x: 0, y: 0 }, { x: 4, y: 0 }, 1, walkable);
    assert.ok(approach);
    assert.ok(pw.chebyshev(approach.x, approach.y, 4, 0) <= 1);

    console.log('ok path_walk');
}

main();
