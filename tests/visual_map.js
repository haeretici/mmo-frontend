'use strict';

const assert = require('assert');
const Visual = require('../static/js/visual_map.js');
const TileDraw = require('../static/js/tile_draw.js');

function main() {
    const win = Visual.desiredWindow(80, 132, 15, 11);
    assert.ok(win.w <= Visual.MAX_WINDOW);
    assert.ok(win.h <= Visual.MAX_WINDOW);
    assert.ok(win.w >= 15);
    assert.ok(win.x < 80);

    const url = Visual.windowUrl({ mapId: 'firstlight_isle', z: 6, x: 64, y: 116, w: 32, h: 32 });
    assert.ok(url.startsWith('/visual?'));
    assert.ok(url.includes('map=firstlight_isle'));
    assert.ok(!url.includes('spawns'));

    const empty = new Uint16Array(4);
    empty[0] = 2;
    const b64 = Buffer.from(empty.buffer, empty.byteOffset, empty.byteLength).toString('base64');
    const floor = Visual.decodeWindow({
        ok: true,
        present: true,
        mapId: 'room',
        z: 0,
        genre: 'rpg_fantasy',
        originX: 10,
        originY: 20,
        width: 2,
        height: 2,
        mapCols: 8,
        mapRows: 8,
        palette: [
            null,
            { catalogId: 'floor', kind: 'tiles' },
            { catalogId: 'tree', kind: 'objects', scale: 1.4, anchor: 'bottom_center' }
        ],
        layers: {
            ground: b64,
            path: b64,
            scenery: b64,
            furniture: b64,
            vertical: b64
        }
    });
    assert.strictEqual(floor.originX, 10);
    assert.strictEqual(Visual.paletteAt(floor, 'ground', 10, 20), 2);
    assert.strictEqual(Visual.paletteAt(floor, 'ground', 0, 0), 0);

    const big = Object.assign({}, floor, { originX: 0, originY: 0, width: 48, height: 48 });
    assert.ok(Visual.coversView(big, 8, 8, 15, 11));
    assert.ok(!Visual.coversView(floor, 0, 0, 15, 11));

    const props = Visual.collectWorldProps(floor, { x0: 10, y0: 20, x1: 11, y1: 21 });
    assert.ok(Array.isArray(props));
    const tree = props.find((p) => p.catalogId === 'tree');
    assert.ok(tree, 'tall prop from scenery cells');
    assert.strictEqual(tree.tileX, 10);
    assert.strictEqual(tree.tileY, 20);
    assert.ok(TileDraw.compareDrawOrder(
        { sortY: tree.sortY, subOrder: TileDraw.DRAW_SUB_PROP, stableKey: 'p' },
        { sortY: tree.sortY, subOrder: TileDraw.DRAW_SUB_ENTITY, stableKey: 'e' }
    ) < 0);

    // TilemapCache tests
    const cacheMgr = Visual.createTilemapCache({ margin: 2 });
    assert.strictEqual(cacheMgr.dirty, true);
    assert.strictEqual(cacheMgr.cache, null);

    // Mock target context and surface allocator
    const targetDrawCalls = [];
    const mockTargetCtx = {
        drawImage: function (img, sx, sy, sw, sh, dx, dy, dw, dh) {
            targetDrawCalls.push({ sx, sy, sw, sh, dx, dy, dw, dh });
        }
    };
    const surfaceDrawCalls = [];
    function mockAllocSurface(w, h) {
        return {
            canvas: { width: w, height: h },
            ctx: {
                clearRect: function () {},
                drawImage: function () {}
            }
        };
    }
    const placementsDrawn = [];
    function mockDrawPlacement(tx, ty, placement, genre, ctx, cx, cy, tw, th) {
        placementsDrawn.push({ tx, ty, id: placement.catalogId });
        return true;
    }

    const rendered = cacheMgr.render(mockTargetCtx, floor, 10, 20, { w: 2, h: 2 }, {
        tw: 32,
        th: 32,
        allocSurface: mockAllocSurface,
        drawPlacement: mockDrawPlacement
    });
    assert.strictEqual(rendered, true);
    assert.strictEqual(cacheMgr.dirty, false);
    assert.ok(cacheMgr.cache);
    assert.strictEqual(targetDrawCalls.length, 1);
    const initialPlacements = placementsDrawn.length;
    assert.ok(initialPlacements > 0);

    // Render again with small camera slide (within margin) -> single blit, no rebuild
    const renderedPan = cacheMgr.render(mockTargetCtx, floor, 10.2, 20.2, { w: 2, h: 2 }, {
        tw: 32,
        th: 32,
        allocSurface: mockAllocSurface,
        drawPlacement: mockDrawPlacement
    });
    assert.strictEqual(renderedPan, true);
    assert.strictEqual(targetDrawCalls.length, 2);
    assert.strictEqual(placementsDrawn.length, initialPlacements); // No new tile placements drawn!

    // Invalidate triggers rebuild on next render
    cacheMgr.invalidate();
    assert.strictEqual(cacheMgr.dirty, true);
    cacheMgr.render(mockTargetCtx, floor, 10.2, 20.2, { w: 2, h: 2 }, {
        tw: 32,
        th: 32,
        allocSurface: mockAllocSurface,
        drawPlacement: mockDrawPlacement
    });
    assert.strictEqual(cacheMgr.dirty, false);
    assert.ok(placementsDrawn.length > initialPlacements);

    assert.strictEqual(Visual.isCyclingTileAnim({ frames: 4, fps: 1 }), true);
    assert.strictEqual(Visual.isCyclingTileAnim({ frames: 1, fps: 1 }), false);
    assert.strictEqual(Visual.tileAnimFrameIndex({ frames: 4, fps: 1 }, 0), 0);
    assert.strictEqual(Visual.tileAnimFrameIndex({ frames: 4, fps: 1 }, 2.1), 2);

    const mixedCells = new Uint16Array(4);
    mixedCells[0] = 1;
    mixedCells[1] = 2;
    const mixedB64 = Buffer.from(mixedCells.buffer, mixedCells.byteOffset, mixedCells.byteLength).toString('base64');
    const animFloor = Visual.decodeWindow({
        ok: true,
        present: true,
        mapId: 'room',
        z: 0,
        genre: 'rpg_fantasy',
        originX: 10,
        originY: 20,
        width: 2,
        height: 2,
        mapCols: 8,
        mapRows: 8,
        palette: [
            null,
            { catalogId: 'floor', kind: 'tiles' },
            { catalogId: 'ref_water_fill', kind: 'tiles', anim: { frames: 4, fps: 1 } }
        ],
        layers: {
            ground: mixedB64,
            path: mixedB64,
            scenery: mixedB64,
            furniture: mixedB64,
            vertical: mixedB64
        }
    });
    const animCache = Visual.createTilemapCache({ margin: 2 });
    const animDrawn = [];
    function drawAnim(tx, ty, placement, genre, ctx, cx, cy, tw, th, frame) {
        animDrawn.push({ id: placement.catalogId, frame: frame | 0, cycling: Visual.isCyclingTileAnim(Visual.normalizeTileAnim(placement.anim)) });
        return true;
    }
    const animTarget = {
        drawImage: function () { targetDrawCalls.push({ overlay: true }); }
    };
    animCache.render(animTarget, animFloor, 10, 20, { w: 2, h: 2 }, {
        tw: 32,
        th: 32,
        timeSec: 2.1,
        allocSurface: mockAllocSurface,
        drawPlacement: drawAnim
    });
    const staticDraws = animDrawn.filter((d) => !d.cycling);
    const overlayDraws = animDrawn.filter((d) => d.cycling);
    assert.ok(staticDraws.length > 0, 'static tiles still paint into cache');
    assert.ok(overlayDraws.length > 0, 'cycling tiles paint on overlay');
    assert.ok(overlayDraws.every((d) => d.frame === 2), 'overlay uses current anim frame');
    assert.ok(animCache.overlay, 'anim overlay surface exists');

    console.log('ok visual_map');
}

main();

