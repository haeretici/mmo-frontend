'use strict';

const assert = require('assert');
const ac = require('../static/js/area_centers.js');

function main() {
    const box = [
        [1, 1, 1],
        [1, 3, 1],
        [1, 1, 1]
    ];
    assert.deepStrictEqual(ac.findOriginInMatrix(box), { row: 1, col: 1, cell: 3 });

    const caster = { x: 0, y: 0 };
    const a = { tile: { x: 5, y: 5 } };
    const b = { x: 6, y: 5 };
    const ranked = ac.findTopAreaCenters(caster, [a, b], box, 4);
    assert.ok(ranked.length);
    assert.strictEqual(ranked[0].hits, 2);
    function covered(cx, cy, tx, ty) {
        return Math.abs(tx - cx) <= 1 && Math.abs(ty - cy) <= 1;
    }
    assert.ok(covered(ranked[0].x, ranked[0].y, 5, 5));
    assert.ok(covered(ranked[0].x, ranked[0].y, 6, 5));

    assert.deepStrictEqual(ac.findTopAreaCenters(caster, [], box), []);
    assert.deepStrictEqual(ac.findTopAreaCenters(caster, [a], [], 3), []);

    console.log('ok area_centers');
}

main();
