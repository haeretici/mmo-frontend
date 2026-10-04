'use strict';

/**
 * Minimap cell cache for /play.
 * Memory is sparse 64×64 blocks per map id and floor.
 * IndexedDB `engine.minimap` stores those blocks. play.js must not open IndexedDB.
 * A cell byte is 0 when unseen. Bit 7 means seen, bit 6 is a baked door, field,
 * or chest, and the low 3 bits are the debug id 0–5. Creatures are not stored.
 * A failed write keeps the memory copy.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineMinimapStore = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DB_NAME = 'engine.minimap';
    const DB_VERSION = 1;
    const STORE_NAME = 'blocks';
    const BLOCK = 64;
    const SEEN = 0x80;
    const BLOCKER = 0x40;
    const FLUSH_DEBOUNCE_MS = 400;

    let blocks = new Map();
    let dirty = new Set();
    let loaded = new Set();
    let loads = new Map();
    let pending = [];
    let flushTimer = 0;
    let testBackend = null;
    let idbBackend = null;
    let scheduleFn = function (fn, ms) { return setTimeout(fn, ms); };
    let cancelFn = function (id) { clearTimeout(id); };

    function cleanMapId(mapId) {
        return String(mapId || '').replace(/\t/g, '');
    }

    function blockOrigin(n) {
        return Math.floor((n | 0) / BLOCK) * BLOCK;
    }

    function blockKey(mapId, z, bx, by) {
        return mapId + '\t' + (z | 0) + '\t' + (bx | 0) + '\t' + (by | 0);
    }

    function parseBlockKey(key) {
        const parts = String(key).split('\t');
        if (parts.length !== 4 || !parts[0]) return null;
        return {
            mapId: parts[0],
            z: parts[1] | 0,
            bx: parts[2] | 0,
            by: parts[3] | 0
        };
    }

    function normalizeDebugId(raw) {
        const n = raw | 0;
        if (n < 0 || n > 5) return 0;
        return n;
    }

    function debugWalkable(id) {
        return id === 1 || id === 2 || id === 5;
    }

    function decodeByte(byte) {
        const n = byte & 255;
        if ((n & SEEN) === 0) {
            return { seen: false, id: 0, blocker: false, walkable: false };
        }
        const id = n & 7;
        const blocker = (n & BLOCKER) !== 0;
        return {
            seen: true,
            id: id,
            blocker: blocker,
            walkable: debugWalkable(id) && !blocker
        };
    }

    function toCells(raw) {
        const out = new Uint8Array(BLOCK * BLOCK);
        if (!raw || typeof raw.length !== 'number') return out;
        const n = Math.min(raw.length, out.length);
        for (let i = 0; i < n; i++) out[i] = raw[i] & 255;
        return out;
    }

    function ensureBlock(mapId, z, bx, by) {
        const key = blockKey(mapId, z, bx, by);
        let block = blocks.get(key);
        if (!block) {
            block = {
                key: key,
                mapId: mapId,
                z: z | 0,
                bx: bx | 0,
                by: by | 0,
                cells: new Uint8Array(BLOCK * BLOCK),
                rev: 0
            };
            blocks.set(key, block);
        }
        return block;
    }

    function writeCell(mapId, x, y, z, byte) {
        const bx = blockOrigin(x);
        const by = blockOrigin(y);
        const block = ensureBlock(mapId, z, bx, by);
        const i = ((y | 0) - by) * BLOCK + ((x | 0) - bx);
        const next = byte & 255;
        if (block.cells[i] === next) return false;
        block.cells[i] = next;
        block.rev += 1;
        dirty.add(block.key);
        return true;
    }

    function readByte(mapId, x, y, z) {
        const id = cleanMapId(mapId);
        if (!id) return 0;
        const bx = blockOrigin(x);
        const by = blockOrigin(y);
        const block = blocks.get(blockKey(id, z | 0, bx, by));
        if (!block) return 0;
        return block.cells[((y | 0) - by) * BLOCK + ((x | 0) - bx)] & 255;
    }

    function inside(rect, x, y) {
        const lx = x - (rect.originX | 0);
        const ly = y - (rect.originY | 0);
        return lx >= 0 && ly >= 0 && lx < (rect.width | 0) && ly < (rect.height | 0);
    }

    function queryCell(mapId, x, y, z, live) {
        const id = cleanMapId(mapId);
        const px = x | 0;
        const py = y | 0;
        const pz = z | 0;
        if (live && (live.z | 0) === pz && inside(live, px, py)) {
            let raw = 0;
            if (typeof live.tileAt === 'function') raw = live.tileAt(px, py);
            else if (live.tiles) {
                const lx = px - (live.originX | 0);
                const ly = py - (live.originY | 0);
                raw = live.tiles[ly * (live.width | 0) + lx];
            }
            const debugId = normalizeDebugId(raw);
            const blocker = typeof live.bakedBlocker === 'function'
                ? !!live.bakedBlocker(px, py, pz)
                : false;
            const walkable = typeof live.walkable === 'function'
                ? !!live.walkable(px, py)
                : (debugWalkable(debugId) && !blocker);
            return {
                seen: true,
                id: debugId,
                blocker: blocker,
                walkable: walkable,
                live: true
            };
        }
        const decoded = decodeByte(readByte(id, px, py, pz));
        decoded.live = false;
        return decoded;
    }

    function applyJob(job) {
        const writes = job.writes;
        let changed = false;
        for (let i = 0; i < writes.length; i++) {
            const w = writes[i];
            if (writeCell(job.mapId, w.x, w.y, w.z, w.byte)) changed = true;
        }
        if (changed || dirty.size) scheduleFlush();
    }

    function drain(mapId) {
        if (!pending.length) return;
        const stay = [];
        for (let i = 0; i < pending.length; i++) {
            const job = pending[i];
            if (job.mapId === mapId) applyJob(job);
            else stay.push(job);
        }
        pending = stay;
    }

    function installRows(mapId, rows) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.key == null || blocks.has(row.key)) continue;
            const parsed = parseBlockKey(row.key);
            if (!parsed || parsed.mapId !== mapId) continue;
            blocks.set(row.key, {
                key: row.key,
                mapId: mapId,
                z: parsed.z,
                bx: parsed.bx,
                by: parsed.by,
                cells: toCells(row.cells),
                rev: 0
            });
        }
    }

    function finishLoad(mapId) {
        loaded.add(mapId);
        loads.delete(mapId);
        drain(mapId);
    }

    function beginLoad(mapId) {
        if (loaded.has(mapId)) return Promise.resolve();
        const existing = loads.get(mapId);
        if (existing) return existing;
        const p = openBackend().then(function (db) {
            return db.getAll(mapId);
        }).then(function (rows) {
            installRows(mapId, rows || []);
        }, function () {
            /* Missing database, private window, or quota: keep an empty cache. */
        }).then(function () {
            finishLoad(mapId);
        }, function () {
            finishLoad(mapId);
        });
        loads.set(mapId, p);
        return p;
    }

    function noteWindow(mapId, viewport, bakedBlocker) {
        const id = cleanMapId(mapId);
        if (!id || !viewport) return Promise.resolve();
        const z = viewport.z | 0;
        const w = viewport.width | 0;
        const h = viewport.height | 0;
        if (w < 1 || h < 1) return Promise.resolve();
        const ox = viewport.originX | 0;
        const oy = viewport.originY | 0;
        const tiles = viewport.tiles || [];
        const writes = new Array(w * h);
        for (let ly = 0; ly < h; ly++) {
            for (let lx = 0; lx < w; lx++) {
                const x = ox + lx;
                const y = oy + ly;
                let byte = SEEN | normalizeDebugId(tiles[ly * w + lx]);
                if (typeof bakedBlocker === 'function' && bakedBlocker(x, y, z)) byte |= BLOCKER;
                writes[ly * w + lx] = { x: x, y: y, z: z, byte: byte };
            }
        }
        const job = { mapId: id, writes: writes };
        if (loaded.has(id)) {
            applyJob(job);
            return Promise.resolve();
        }
        pending.push(job);
        return beginLoad(id);
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = scheduleFn(function () {
            flushTimer = 0;
            flushDirty();
        }, FLUSH_DEBOUNCE_MS);
    }

    function flushDirty() {
        const keys = [];
        dirty.forEach(function (key) { keys.push(key); });
        if (!keys.length) return Promise.resolve(true);
        const snap = [];
        for (let i = 0; i < keys.length; i++) {
            const block = blocks.get(keys[i]);
            if (!block) {
                dirty.delete(keys[i]);
                continue;
            }
            snap.push({ key: block.key, rev: block.rev, cells: block.cells.slice() });
        }
        if (!snap.length) return Promise.resolve(true);
        return openBackend().then(function (db) {
            let chain = Promise.resolve();
            for (let i = 0; i < snap.length; i++) {
                const row = snap[i];
                chain = chain.then(function () {
                    return db.put(row.key, row.cells).then(function () {
                        const block = blocks.get(row.key);
                        if (block && block.rev === row.rev) dirty.delete(row.key);
                    }, function () {
                        /* Keep the memory copy and the dirty flag. */
                    });
                });
            }
            return chain.then(function () { return dirty.size === 0; });
        }).catch(function () {
            return false;
        });
    }

    function flush() {
        if (flushTimer) {
            cancelFn(flushTimer);
            flushTimer = 0;
        }
        const waits = [];
        loads.forEach(function (p) { waits.push(p); });
        return Promise.all(waits).then(function () { return flushDirty(); });
    }

    function openIndexedDb() {
        return new Promise(function (resolve, reject) {
            if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') {
                reject(new Error('no indexedDB'));
                return;
            }
            let req;
            try {
                req = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) {
                reject(e);
                return;
            }
            req.onupgradeneeded = function () {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('minimap db')); };
        });
    }

    function wrapIdb(db) {
        return {
            getAll: function (mapId) {
                return new Promise(function (resolve, reject) {
                    let tx;
                    try {
                        tx = db.transaction(STORE_NAME, 'readonly');
                    } catch (e) {
                        reject(e);
                        return;
                    }
                    const prefix = mapId + '\t';
                    const rows = [];
                    const cur = tx.objectStore(STORE_NAME).openCursor(
                        IDBKeyRange.bound(prefix, prefix + '\uffff')
                    );
                    cur.onsuccess = function () {
                        const c = cur.result;
                        if (!c) {
                            resolve(rows);
                            return;
                        }
                        if (String(c.key).indexOf(prefix) === 0) {
                            rows.push({ key: c.key, cells: c.value });
                        }
                        c.continue();
                    };
                    cur.onerror = function () { reject(cur.error || new Error('minimap read')); };
                });
            },
            put: function (key, cells) {
                return new Promise(function (resolve, reject) {
                    let tx;
                    try {
                        tx = db.transaction(STORE_NAME, 'readwrite');
                    } catch (e) {
                        reject(e);
                        return;
                    }
                    const req = tx.objectStore(STORE_NAME).put(cells, key);
                    req.onsuccess = function () { resolve(); };
                    req.onerror = function () { reject(req.error || new Error('minimap write')); };
                });
            }
        };
    }

    function openBackend() {
        if (testBackend) return Promise.resolve(testBackend);
        if (idbBackend) return Promise.resolve(idbBackend);
        return openIndexedDb().then(function (db) {
            idbBackend = wrapIdb(db);
            return idbBackend;
        });
    }

    function cancelTimer() {
        if (!flushTimer) return;
        cancelFn(flushTimer);
        flushTimer = 0;
    }

    function clearMemory() {
        cancelTimer();
        blocks = new Map();
        dirty = new Set();
        loaded = new Set();
        loads = new Map();
        pending = [];
    }

    function resetForTests() {
        clearMemory();
        testBackend = null;
        idbBackend = null;
        scheduleFn = function (fn, ms) { return setTimeout(fn, ms); };
        cancelFn = function (id) { clearTimeout(id); };
    }

    function setBackendForTests(backend) {
        testBackend = backend || null;
        idbBackend = null;
    }

    function setSchedulerForTests(schedule, cancel) {
        cancelTimer();
        if (!schedule) {
            scheduleFn = function (fn, ms) { return setTimeout(fn, ms); };
            cancelFn = function (id) { clearTimeout(id); };
            return;
        }
        scheduleFn = schedule;
        cancelFn = cancel || function () {};
    }

    return {
        DB_NAME: DB_NAME,
        DB_VERSION: DB_VERSION,
        STORE_NAME: STORE_NAME,
        BLOCK: BLOCK,
        SEEN: SEEN,
        BLOCKER: BLOCKER,
        FLUSH_DEBOUNCE_MS: FLUSH_DEBOUNCE_MS,
        noteWindow: noteWindow,
        queryCell: queryCell,
        readByte: readByte,
        load: function (mapId) {
            const id = cleanMapId(mapId);
            if (!id) return Promise.resolve();
            return beginLoad(id);
        },
        flush: flush,
        dirtyCount: function () { return dirty.size; },
        resetForTests: resetForTests,
        clearMemoryForTests: clearMemory,
        setBackendForTests: setBackendForTests,
        setSchedulerForTests: setSchedulerForTests
    };
});
