'use strict';

const assert = require('assert');
const {
    resolveTileDrawBox,
    resolvePlacementRender,
    compareDrawOrder,
    sortDrawables,
    collectTallPropsFromFloor,
    DRAW_SUB_PROP,
    DRAW_SUB_ENTITY,
    normalizeAnchor
} = require('../static/js/tile_draw.js');

function main() {
    const mid = resolveTileDrawBox(0, 0, 32, 32, 32, 32, 1, 'middle_center');
    assert.ok(Math.abs(mid.dx) < 1e-9);
    assert.ok(Math.abs(mid.dy) < 1e-9);
    assert.ok(Math.abs(mid.dw - 32) < 1e-9);

    const tree = resolveTileDrawBox(100, 200, 32, 32, 16, 32, 1.4, 'bottom_center');
    assert.strictEqual(tree.anchor, 'bottom_center');
    assert.ok(Math.abs(tree.dh - 32 * 1.4) < 1e-9);
    assert.ok(Math.abs(tree.dy - (200 + 32 - tree.dh)) < 1e-6);

    assert.strictEqual(normalizeAnchor('BOTTOM_CENTER'), 'bottom_center');

    const role = { render: { scale: 1.2, anchor: 'bottom_center', variant: 'small' } };
    const fromRole = resolvePlacementRender(
        { catalogId: 'oak', kind: 'objects', roleId: 'scenery_blocking' },
        role
    );
    assert.strictEqual(fromRole.catalogId, 'oak');
    assert.ok(Math.abs(fromRole.scale - 1.2) < 1e-9);
    const override = resolvePlacementRender(
        { catalogId: 'oak', kind: 'objects', scale: 1.4, anchor: 'middle_center', variant: 'icon' },
        role
    );
    assert.ok(Math.abs(override.scale - 1.4) < 1e-9);
    assert.strictEqual(override.variant, 'icon');

    const a = { sortY: 5, subOrder: DRAW_SUB_PROP, stableKey: 'p' };
    const b = { sortY: 5, subOrder: DRAW_SUB_ENTITY, stableKey: 'e' };
    const c = { sortY: 3, subOrder: DRAW_SUB_ENTITY, stableKey: 'n' };
    assert.ok(compareDrawOrder(c, a) < 0);
    assert.ok(compareDrawOrder(a, b) < 0);
    const list = [
        { sortY: 2, subOrder: DRAW_SUB_ENTITY, stableKey: 'e2' },
        { sortY: 1, subOrder: DRAW_SUB_PROP, stableKey: 'p1' },
        { sortY: 1, subOrder: DRAW_SUB_ENTITY, stableKey: 'e1' },
        { sortY: 2, subOrder: DRAW_SUB_PROP, stableKey: 'p2' }
    ];
    sortDrawables(list);
    assert.deepStrictEqual(list.map((d) => d.stableKey), ['p1', 'e1', 'p2', 'e2']);

    const cells = (cols, rows, hits) => {
        const a = new Uint16Array(cols * rows);
        hits.forEach(([x, y, v]) => { a[y * cols + x] = v; });
        return a;
    };
    const floor = {
        cols: 4,
        rows: 4,
        z: 0,
        palette: [
            null,
            { catalogId: 'damp_moss_floor', kind: 'tiles', roleId: 'floor' },
            { catalogId: 'simple_dead_tree', kind: 'objects', roleId: 'scenery_blocking', scale: 1.4, anchor: 'bottom_center' },
            { catalogId: 'broken_cave_stairs', kind: 'tiles', roleId: 'stairs_up' }
        ],
        subLayers: [
            { id: 'ground', cells: cells(4, 4, [[1, 1, 1]]) },
            { id: 'path', cells: cells(4, 4, []) },
            { id: 'scenery', cells: cells(4, 4, [[2, 2, 2]]) },
            { id: 'furniture', cells: cells(4, 4, []) },
            { id: 'vertical', cells: cells(4, 4, [[0, 3, 3]]) }
        ]
    };
    const props = collectTallPropsFromFloor(floor, { z: 0 });
    assert.strictEqual(props.length, 2);
    const oak = props.find((p) => p.catalogId === 'simple_dead_tree');
    assert.ok(oak);
    assert.strictEqual(oak.tileX, 2);
    assert.strictEqual(oak.subOrder, DRAW_SUB_PROP);
    const region = collectTallPropsFromFloor(floor, { x0: 2, y0: 2, x1: 2, y1: 2 });
    assert.strictEqual(region.length, 1);

    console.log('ok tile_draw');
}

main();
