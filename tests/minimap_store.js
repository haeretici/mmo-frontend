'use strict';

const assert = require('assert');
const store = require('../static/js/minimap_store.js');

function fakeDb() {
    const rows = new Map();
    const api = {
        failPuts: 0,
        puts: 0,
        getAll: function (mapId) {
            const prefix = mapId + '\t';
            const out = [];
            rows.forEach(function (cells, key) {
                if (String(key).indexOf(prefix) === 0) {
                    out.push({ key: key, cells: cells.slice() });
                }
            });
            return Promise.resolve(out);
        },
        put: function (key, cells) {
            api.puts += 1;
            if (api.failPuts > 0) {
                api.failPuts -= 1;
                return Promise.reject(new Error('quota'));
            }
            rows.set(key, cells.slice());
            return Promise.resolve();
        },
        rows: rows
    };
    return api;
}

function windowOf(originX, originY, z, width, height, tiles) {
    return {
        originX: originX,
        originY: originY,
        z: z,
        width: width,
        height: height,
        tiles: tiles
    };
}

function grass(n) {
    const tiles = [];
    for (let i = 0; i < n; i++) tiles.push(1);
    return tiles;
}

async function main() {
    assert.strictEqual(store.DB_NAME, 'engine.minimap');
    assert.strictEqual(store.STORE_NAME, 'blocks');
    assert.strictEqual(store.BLOCK, 64);
    assert.strictEqual(store.SEEN, 0x80);
    assert.strictEqual(store.BLOCKER, 0x40);
    assert.strictEqual(store.FLUSH_DEBOUNCE_MS, 400);

    store.resetForTests();
    const db = fakeDb();
    store.setBackendForTests(db);

    await store.noteWindow('firstlight_isle', windowOf(10, 20, 7, 2, 2, [1, 3, 4, 5]), function () {
        return false;
    });
    assert.strictEqual(store.readByte('firstlight_isle', 10, 20, 7), store.SEEN | 1);
    assert.strictEqual(store.readByte('firstlight_isle', 11, 20, 7), store.SEEN | 3);
    assert.strictEqual(store.readByte('firstlight_isle', 10, 21, 7), store.SEEN | 4);
    assert.strictEqual(store.readByte('firstlight_isle', 11, 21, 7), store.SEEN | 5);
    assert.strictEqual(store.readByte('firstlight_isle', 12, 20, 7), 0, 'outside the rectangle stays unseen');
    assert.strictEqual(store.readByte('firstlight_isle', 10, 20, 8), 0, 'another floor stays unseen');

    const seenGrass = store.queryCell('firstlight_isle', 10, 20, 7, null);
    assert.strictEqual(seenGrass.seen, true);
    assert.strictEqual(seenGrass.id, 1);
    assert.strictEqual(seenGrass.walkable, true);
    const wall = store.queryCell('firstlight_isle', 11, 20, 7, null);
    assert.strictEqual(wall.walkable, false);
    const unseen = store.queryCell('firstlight_isle', 12, 20, 7, null);
    assert.strictEqual(unseen.seen, false);
    assert.strictEqual(unseen.walkable, false);

    await store.noteWindow('firstlight_isle', windowOf(10, 20, 7, 1, 1, [0]), function () {
        return false;
    });
    assert.strictEqual(store.readByte('firstlight_isle', 10, 20, 7), store.SEEN, 'void overwrites grass');
    assert.strictEqual(store.readByte('firstlight_isle', 11, 20, 7), store.SEEN | 3, 'neighbor outside the new window stays');
    const voidCell = store.queryCell('firstlight_isle', 10, 20, 7, null);
    assert.strictEqual(voidCell.seen, true);
    assert.strictEqual(voidCell.id, 0);
    assert.strictEqual(voidCell.walkable, false);

    await store.noteWindow('firstlight_isle', windowOf(0, 0, 7, 3, 1, [1, 1, 1]), function (x) {
        return x === 1;
    });
    assert.strictEqual(store.readByte('firstlight_isle', 1, 0, 7), store.SEEN | store.BLOCKER | 1);
    assert.strictEqual(store.readByte('firstlight_isle', 0, 0, 7), store.SEEN | 1);
    assert.strictEqual(store.readByte('firstlight_isle', 2, 0, 7), store.SEEN | 1);
    const blocked = store.queryCell('firstlight_isle', 1, 0, 7, null);
    assert.strictEqual(blocked.blocker, true);
    assert.strictEqual(blocked.id, 1);
    assert.strictEqual(blocked.walkable, false);

    await store.noteWindow('firstlight_isle', windowOf(1, 0, 7, 1, 1, [1]), function () {
        return false;
    });
    assert.strictEqual(store.readByte('firstlight_isle', 1, 0, 7), store.SEEN | 1, 'a later window clears the blocker');

    await store.noteWindow('firstlight_isle', windowOf(63, 0, 6, 2, 1, [2, 1]), function () {
        return false;
    });
    assert.strictEqual(store.readByte('firstlight_isle', 63, 0, 6), store.SEEN | 2);
    assert.strictEqual(store.readByte('firstlight_isle', 64, 0, 6), store.SEEN | 1);
    assert.strictEqual(store.readByte('firstlight_isle', 63, 0, 7), 0);

    await store.noteWindow('firstlight_isle', windowOf(-1, -1, 7, 1, 1, [1]), function () {
        return false;
    });
    assert.strictEqual(store.readByte('firstlight_isle', -1, -1, 7), store.SEEN | 1);

    await store.noteWindow('other_map', windowOf(10, 20, 7, 1, 1, [5]), function () {
        return false;
    });
    assert.strictEqual(store.readByte('other_map', 10, 20, 7), store.SEEN | 5);
    assert.strictEqual(store.readByte('firstlight_isle', 10, 20, 7), store.SEEN, 'maps do not share cells');

    await store.noteWindow('firstlight_isle', windowOf(4, 4, 7, 1, 1, [255]), function () {
        return false;
    });
    assert.strictEqual(store.readByte('firstlight_isle', 4, 4, 7), store.SEEN, 'ids outside 0–5 store as void');

    const putsBefore = db.puts;
    await store.flush();
    assert.ok(db.puts > putsBefore, 'flush writes dirty blocks');
    const putsAfter = db.puts;
    await store.noteWindow('firstlight_isle', windowOf(11, 20, 7, 1, 1, [3]), function () {
        return false;
    });
    await store.flush();
    assert.strictEqual(db.puts, putsAfter, 'an unchanged cell does not write again');

    store.clearMemoryForTests();
    assert.strictEqual(store.readByte('firstlight_isle', 63, 0, 6), 0);
    await store.load('firstlight_isle');
    assert.strictEqual(store.readByte('firstlight_isle', 63, 0, 6), store.SEEN | 2, 'load restores the block');
    assert.strictEqual(store.readByte('firstlight_isle', 64, 0, 6), store.SEEN | 1);
    assert.strictEqual(store.readByte('firstlight_isle', -1, -1, 7), store.SEEN | 1);
    assert.strictEqual(store.readByte('other_map', 10, 20, 7), 0, 'load is per map id');
    await store.load('other_map');
    assert.strictEqual(store.readByte('other_map', 10, 20, 7), store.SEEN | 5);

    store.resetForTests();
    const quota = fakeDb();
    quota.failPuts = 1;
    store.setBackendForTests(quota);
    await store.noteWindow('firstlight_isle', windowOf(0, 0, 7, 1, 1, grass(1)), function () {
        return false;
    });
    const wrote = await store.flush();
    assert.strictEqual(wrote, false);
    assert.strictEqual(store.readByte('firstlight_isle', 0, 0, 7), store.SEEN | 1);
    assert.ok(store.dirtyCount() > 0, 'a failed write stays dirty');
    assert.strictEqual(quota.rows.size, 0);
    const retried = await store.flush();
    assert.strictEqual(retried, true);
    assert.strictEqual(store.dirtyCount(), 0);
    assert.strictEqual(quota.rows.size, 1);

    store.resetForTests();
    const broken = {
        getAll: function () { return Promise.reject(new Error('private')); },
        put: function () { return Promise.reject(new Error('quota')); }
    };
    store.setBackendForTests(broken);
    await store.noteWindow('firstlight_isle', windowOf(2, 2, 7, 1, 1, [1]), function () {
        return false;
    });
    assert.strictEqual(store.readByte('firstlight_isle', 2, 2, 7), store.SEEN | 1, 'play keeps the memory copy');
    assert.strictEqual(await store.flush(), false);
    assert.strictEqual(store.readByte('firstlight_isle', 2, 2, 7), store.SEEN | 1);

    store.resetForTests();
    const liveDb = fakeDb();
    store.setBackendForTests(liveDb);
    await store.noteWindow('firstlight_isle', windowOf(0, 0, 7, 1, 1, [1]), function () {
        return false;
    });
    await store.noteWindow('firstlight_isle', windowOf(8, 8, 7, 1, 1, [3]), function () {
        return false;
    });
    const live = {
        z: 7,
        originX: 0,
        originY: 0,
        width: 2,
        height: 1,
        tiles: [4, 1],
        bakedBlocker: function (x) { return x === 1; },
        walkable: function (x) { return x !== 0 && x !== 1; }
    };
    const creature = store.queryCell('firstlight_isle', 0, 0, 7, live);
    assert.strictEqual(creature.live, true);
    assert.strictEqual(creature.id, 4, 'live id wins inside the rectangle');
    assert.strictEqual(creature.blocker, false, 'a creature is not a baked blocker');
    assert.strictEqual(creature.walkable, false);
    const door = store.queryCell('firstlight_isle', 1, 0, 7, live);
    assert.strictEqual(door.live, true);
    assert.strictEqual(door.id, 1);
    assert.strictEqual(door.blocker, true);
    assert.strictEqual(door.walkable, false);
    const storedWall = store.queryCell('firstlight_isle', 8, 8, 7, live);
    assert.strictEqual(storedWall.live, false);
    assert.strictEqual(storedWall.id, 3);
    assert.strictEqual(storedWall.walkable, false);
    const otherFloor = store.queryCell('firstlight_isle', 0, 0, 6, live);
    assert.strictEqual(otherFloor.live, false);
    assert.strictEqual(otherFloor.seen, false);

    store.resetForTests();
    let scheduled = 0;
    let ran = null;
    store.setBackendForTests(fakeDb());
    store.setSchedulerForTests(function (fn) {
        scheduled += 1;
        ran = fn;
        return scheduled;
    }, function () { ran = null; });
    await store.noteWindow('firstlight_isle', windowOf(0, 0, 7, 1, 1, [1]), function () { return false; });
    await store.noteWindow('firstlight_isle', windowOf(1, 0, 7, 1, 1, [3]), function () { return false; });
    assert.strictEqual(scheduled, 1, 'dirty blocks share one debounce');
    assert.strictEqual(store.dirtyCount(), 1);
    ran();
    await store.flush();
    assert.strictEqual(store.dirtyCount(), 0);

    store.resetForTests();
    let release = null;
    const delayed = fakeDb();
    delayed.getAll = function () {
        return new Promise(function (resolve) {
            release = function () { resolve([]); };
        });
    };
    store.setBackendForTests(delayed);
    const noted = store.noteWindow('firstlight_isle', windowOf(5, 5, 9, 1, 1, [5]), function () {
        return false;
    });
    const flushing = store.flush();
    await Promise.resolve();
    assert.strictEqual(typeof release, 'function');
    assert.strictEqual(store.readByte('firstlight_isle', 5, 5, 9), 0, 'merge waits for the load');
    release();
    await noted;
    assert.strictEqual(await flushing, true);
    assert.strictEqual(store.readByte('firstlight_isle', 5, 5, 9), store.SEEN | 5);
    assert.strictEqual(delayed.rows.size, 1);

    store.resetForTests();
    console.log('minimap_store: ok');
}

main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
