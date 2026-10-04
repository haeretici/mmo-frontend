'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const store = require('../static/js/minimap_store.js');
const view = require('../static/js/minimap_view.js');

const tiles = require('../../content/tiles/tiles.json');

function rgbAt(buf, width, x, y) {
    const i = (y * width + x) * 4;
    return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

function eq(a, b) {
    assert.strictEqual(a.length, b.length);
    for (let i = 0; i < a.length; i++) assert.strictEqual(a[i], b[i]);
}

function centerOf(width, height) {
    return {
        x: Math.floor((width - 1) / 2),
        y: Math.floor((height - 1) / 2)
    };
}

function fakeStore(cell) {
    return {
        queryCell: function () { return cell; }
    };
}

async function main() {
    assert.strictEqual(view.VIEW_W, 180);
    assert.strictEqual(view.VIEW_H, 140);
    assert.strictEqual(view.ZOOM_MIN, -2);
    assert.strictEqual(view.ZOOM_MAX, 2);
    assert.deepStrictEqual(view.scaleForZoom(0), 1);
    assert.deepStrictEqual(view.scaleForZoom(1), 2);
    assert.deepStrictEqual(view.scaleForZoom(2), 4);
    assert.deepStrictEqual(view.scaleForZoom(-1), 0.5);
    assert.deepStrictEqual(view.scaleForZoom(-2), 0.25);
    assert.deepStrictEqual(view.scaleForZoom(9), 4);
    assert.deepStrictEqual(view.scaleForZoom(-9), 0.25);

    tiles.tiles.forEach(function (tile) {
        assert.strictEqual(view.TILE_HEX[tile.id], tile.color);
    });

    const src = fs.readFileSync(path.join(__dirname, '../static/js/minimap_view.js'), 'utf8');
    assert.ok(!src.includes('/visual'));
    assert.ok(!src.includes('indexedDB'));
    assert.ok(!src.includes('MOVE_PATH'));

    const scss = fs.readFileSync(path.join(__dirname, '../scss/app.scss'), 'utf8');
    assert.ok(scss.includes('.play-minimap-canvas'));
    assert.ok(scss.includes('width: 180px'));
    assert.ok(scss.includes('height: 140px'));
    assert.ok(scss.includes('width: 192px'));

    const W = view.VIEW_W;
    const H = view.VIEW_H;
    const c = centerOf(W, H);
    const cam = { x: 40, y: 50, z: 7 };

    for (let id = 0; id <= 5; id++) {
        view.resetForTests();
        view.sync({
            mapId: 'isle',
            store: fakeStore({ seen: true, id: id }),
            player: null,
            live: null,
            camera: cam
        });
        const buf = view.paintBuffer(W, H);
        const px = rgbAt(buf, W, c.x, c.y);
        assert.strictEqual(px[0], parseInt(view.TILE_HEX[id].slice(1, 3), 16), 'id ' + id);
        assert.strictEqual(px[1], parseInt(view.TILE_HEX[id].slice(3, 5), 16), 'id ' + id);
        assert.strictEqual(px[2], parseInt(view.TILE_HEX[id].slice(5, 7), 16), 'id ' + id);
        assert.strictEqual(px[3], 255);
    }

    view.resetForTests();
    view.sync({
        mapId: 'isle',
        store: fakeStore({ seen: false, id: 0 }),
        player: null,
        live: null,
        camera: cam
    });
    const unseen = rgbAt(view.paintBuffer(W, H), W, c.x, c.y);
    eq(unseen, view.EMPTY_RGB.concat([255]));
    assert.notDeepStrictEqual(unseen.slice(0, 3), [0x3d, 0x6b, 0x48], 'unseen is not grass');
    assert.notDeepStrictEqual(unseen.slice(0, 3), [0x0b, 0x0b, 0x0c], 'unseen is not void');

    const here = view.pixelToTile(c.x, c.y, cam, 0, W, H);
    assert.strictEqual(here.x, 40);
    assert.strictEqual(here.y, 50);
    const east = view.pixelToTile(c.x + 1, c.y, cam, 0, W, H);
    assert.strictEqual(east.x, 41);
    assert.strictEqual(east.y, 50);
    for (let i = 0; i < 4; i++) {
        const wide = view.pixelToTile(c.x + i, c.y, cam, 2, W, H);
        assert.strictEqual(wide.x, 40, 'zoom 2 shares the camera tile');
    }
    assert.strictEqual(view.pixelToTile(c.x + 4, c.y, cam, 2, W, H).x, 41);
    assert.strictEqual(view.pixelToTile(c.x + 1, c.y, cam, -1, W, H).x, 42);
    assert.strictEqual(view.pixelToTile(c.x + 1, c.y, cam, -2, W, H).x, 44);

    store.resetForTests();
    store.setBackendForTests({
        getAll: function () { return Promise.resolve([]); },
        put: function () { return Promise.resolve(); }
    });
    store.setSchedulerForTests(function () { return 0; }, function () {});
    await store.noteWindow('isle', {
        originX: 10, originY: 20, z: 7, width: 1, height: 1, tiles: [1]
    }, function () { return false; });
    await store.noteWindow('isle', {
        originX: 30, originY: 40, z: 7, width: 1, height: 1, tiles: [3]
    }, function () { return false; });

    view.resetForTests();
    view.sync({
        mapId: 'isle',
        store: store,
        player: { x: 30, y: 40, z: 7 },
        live: {
            originX: 30, originY: 40, z: 7, width: 1, height: 1, tiles: [4]
        }
    });
    assert.strictEqual(view.camera().x, 30);
    assert.strictEqual(view.camera().z, 7);
    let buf = view.paintBuffer(W, H);
    eq(rgbAt(buf, W, c.x, c.y), view.CROSS_RGB.concat([255]));
    const leftBehind = view.pixelToTile(c.x - 20, c.y - 20, view.camera(), 0, W, H);
    assert.strictEqual(leftBehind.x, 10);
    assert.strictEqual(leftBehind.y, 20);
    eq(rgbAt(buf, W, c.x - 20, c.y - 20), [0x3d, 0x6b, 0x48, 255]);
    eq(rgbAt(buf, W, c.x + 2, c.y), view.EMPTY_RGB.concat([255]));

    view.sync({
        mapId: 'isle',
        store: store,
        player: null,
        live: { originX: 30, originY: 40, z: 7, width: 1, height: 1, tiles: [4] },
        camera: { x: 30, y: 40, z: 7 }
    });
    buf = view.paintBuffer(W, H);
    eq(rgbAt(buf, W, c.x, c.y), [0x2a, 0x4a, 0x6a, 255], 'live water wins inside the rectangle');
    eq(rgbAt(buf, W, c.x - 20, c.y - 20), [0x3d, 0x6b, 0x48, 255], 'stored grass stays outside it');

    view.sync({
        mapId: 'isle',
        store: store,
        player: { x: 30, y: 40, z: 7 },
        live: { originX: 30, originY: 40, z: 7, width: 1, height: 1, tiles: [4] }
    });
    assert.strictEqual(view.floorUp(), true);
    assert.strictEqual(view.camera().z, 6);
    assert.strictEqual(view.camera().x, 30, 'floor up does not pan');
    buf = view.paintBuffer(W, H);
    eq(rgbAt(buf, W, c.x, c.y), view.EMPTY_RGB.concat([255]), 'unvisited floor stays empty');
    eq(rgbAt(buf, W, c.x - 20, c.y - 20), view.EMPTY_RGB.concat([255]));
    assert.strictEqual(store.readByte('isle', 30, 40, 6), 0);
    assert.strictEqual(store.readByte('isle', 10, 20, 6), 0);
    assert.strictEqual(store.readByte('isle', 30, 40, 7), store.SEEN | 3, 'floor switch does not rewrite the visited floor');

    assert.strictEqual(view.floorDown(), true);
    assert.strictEqual(view.camera().z, 7);
    buf = view.paintBuffer(W, H);
    eq(rgbAt(buf, W, c.x, c.y), view.CROSS_RGB.concat([255]));
    eq(rgbAt(buf, W, c.x - 20, c.y - 20), [0x3d, 0x6b, 0x48, 255]);

    view.pointerDown(0, 0);
    view.pointerMove(2, 1);
    view.pointerUp();
    assert.strictEqual(view.camera().x, 30, 'a click does not pan');
    view.zoomIn();
    assert.strictEqual(view.zoom(), 1);
    view.pointerDown(0, 0);
    view.pointerMove(20, 0);
    assert.strictEqual(view.camera().x, 30 + (0 - 20) / 2);
    view.pointerUp();
    view.sync({
        mapId: 'isle',
        store: store,
        player: { x: 30, y: 40, z: 7 },
        live: null
    });
    assert.strictEqual(view.camera().x, 20, 'pan sticks while the player stands');
    view.sync({
        mapId: 'isle',
        store: store,
        player: { x: 31, y: 40, z: 7 },
        live: null
    });
    assert.strictEqual(view.camera().x, 31, 'the camera follows the next step');
    assert.strictEqual(view.camera().z, 7);

    view.floorUp();
    view.center();
    assert.strictEqual(view.camera().x, 31);
    assert.strictEqual(view.camera().y, 40);
    assert.strictEqual(view.camera().z, 7);

    view.resetForTests();
    view.sync({ mapId: 'isle', store: store, player: { x: 1, y: 1, z: 0 }, live: null });
    assert.strictEqual(view.floorUp(), false);
    view.sync({ mapId: 'isle', store: store, player: { x: 1, y: 1, z: 15 }, live: null });
    assert.strictEqual(view.floorDown(), false);
    while (view.zoomIn()) {}
    assert.strictEqual(view.zoom(), 2);
    assert.strictEqual(view.zoomIn(), false);
    view.resetForTests();
    view.sync({ mapId: 'isle', store: store, player: { x: 1, y: 1, z: 7 }, live: null });
    while (view.zoomOut()) {}
    assert.strictEqual(view.zoom(), -2);
    assert.strictEqual(view.zoomOut(), false);
    view.zoomBy(1);
    assert.strictEqual(view.zoom(), -1);

    view.resetForTests();
    view.sync({
        mapId: 'isle',
        store: fakeStore({ seen: true, id: 1 }),
        player: { x: 40, y: 50, z: 7 },
        live: null
    });
    const clicks = [];
    view.setTileClick(function (tile) { clicks.push(tile); });
    const mid = centerOf(W, H);
    view.pointerDown(mid.x, mid.y);
    view.pointerUp();
    assert.strictEqual(clicks.length, 1);
    assert.deepStrictEqual(clicks[0], { x: 40, y: 50, z: 7 });
    assert.strictEqual(view.camera().x, 40, 'a click does not pan');
    view.pointerDown(mid.x, mid.y);
    view.pointerUp(mid.x + 1, mid.y);
    assert.strictEqual(clicks.length, 2);
    assert.strictEqual(clicks[1].x, 41, 'release pixel picks the tile');
    view.pointerDown(mid.x, mid.y);
    view.pointerMove(mid.x + 2, mid.y);
    view.pointerUp(mid.x + 2, mid.y);
    assert.strictEqual(clicks.length, 3, 'a move inside the slop is still a click');
    view.pointerDown(0, 0);
    view.pointerMove(20, 0);
    view.pointerUp(20, 0);
    assert.strictEqual(clicks.length, 3, 'a drag does not walk');
    view.center();
    view.floorUp();
    view.pointerDown(mid.x, mid.y);
    view.pointerUp();
    assert.strictEqual(clicks[3].z, 6, 'the click uses the camera floor');
    assert.strictEqual(clicks[3].x, 40);

    view.resetForTests();
    store.resetForTests();
    console.log('minimap_view: ok');
}

main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
