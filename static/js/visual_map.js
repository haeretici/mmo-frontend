'use strict';

(function (root, factory) {
    const api = factory(root.EngineTileDraw);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineVisual = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TileDraw) {
    const TD = TileDraw || (typeof require === 'function' ? require('./tile_draw.js') : null);
    const MARGIN_MIN = 8;
    const MAX_WINDOW = 64;
    const TRIP = 2;
    const TERRAIN = TD ? TD.TERRAIN_SUB_LAYER_IDS : ['ground', 'path'];

    function b64ToU16(b64) {
        if (!b64) return new Uint16Array(0);
        let bytes;
        if (typeof Buffer === 'function') {
            bytes = Buffer.from(b64, 'base64');
        } else {
            const bin = atob(b64);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        }
        const n = bytes.length >> 1;
        const out = new Uint16Array(n);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let i = 0; i < n; i++) out[i] = view.getUint16(i * 2, true);
        return out;
    }

    function windowUrl(opts) {
        const o = opts || {};
        const q = [
            'map=' + encodeURIComponent(String(o.mapId || '')),
            'z=' + (o.z | 0),
            'x=' + (o.x | 0),
            'y=' + (o.y | 0),
            'w=' + (o.w | 0),
            'h=' + (o.h | 0)
        ];
        return '/visual?' + q.join('&');
    }

    function desiredWindow(camX, camY, viewW, viewH) {
        const vw = Math.max(1, viewW | 0);
        const vh = Math.max(1, viewH | 0);
        const mx = Math.max(MARGIN_MIN, Math.ceil(vw / 2));
        const my = Math.max(MARGIN_MIN, Math.ceil(vh / 2));
        const w = Math.min(MAX_WINDOW, vw + 2 * mx);
        const h = Math.min(MAX_WINDOW, vh + 2 * my);
        const x = Math.floor(camX + vw / 2 - w / 2);
        const y = Math.floor(camY + vh / 2 - h / 2);
        return { x: x, y: y, w: w, h: h };
    }

    function coversView(floor, camX, camY, viewW, viewH) {
        if (!floor || !floor.present) return false;
        const left = camX - TRIP;
        const top = camY - TRIP;
        const right = camX + viewW + TRIP;
        const bottom = camY + viewH + TRIP;
        return left >= floor.originX
            && top >= floor.originY
            && right <= floor.originX + floor.width
            && bottom <= floor.originY + floor.height;
    }

    function decodeWindow(doc) {
        if (!doc || !doc.ok) return null;
        const width = doc.width | 0;
        const height = doc.height | 0;
        const layers = doc.layers && typeof doc.layers === 'object' ? doc.layers : {};
        const subLayers = [];
        const ids = ['ground', 'path', 'scenery', 'furniture', 'vertical'];
        const expect = width * height;
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const cells = b64ToU16(layers[id] || '');
            let buf = cells;
            if (cells.length !== expect) {
                buf = new Uint16Array(expect);
                if (cells.length) buf.set(cells.subarray(0, Math.min(cells.length, expect)));
            }
            subLayers.push({ id: id, cells: buf });
        }
        return {
            present: !!doc.present,
            mapId: String(doc.mapId || ''),
            z: doc.z | 0,
            genre: String(doc.genre || 'rpg_fantasy'),
            originX: doc.originX | 0,
            originY: doc.originY | 0,
            width: width,
            height: height,
            cols: width,
            rows: height,
            mapCols: doc.mapCols | 0,
            mapRows: doc.mapRows | 0,
            palette: Array.isArray(doc.palette) ? doc.palette : [null],
            subLayers: subLayers
        };
    }

    function offsetProps(props, originX, originY) {
        const ox = originX | 0;
        const oy = originY | 0;
        for (let i = 0; i < props.length; i++) {
            const p = props[i];
            p.tileX = (p.tileX | 0) + ox;
            p.tileY = (p.tileY | 0) + oy;
            p.sortY = Number(p.sortY) + oy;
            p.stableKey = 'prop:' + p.subLayerId + ':' + p.tileX + ',' + p.tileY;
        }
        return props;
    }

    function collectWorldProps(floor, region) {
        if (!floor || !floor.present || !TD) return [];
        const ox = floor.originX | 0;
        const oy = floor.originY | 0;
        const local = {
            x0: region && region.x0 != null ? (region.x0 | 0) - ox : 0,
            y0: region && region.y0 != null ? (region.y0 | 0) - oy : 0,
            x1: region && region.x1 != null ? (region.x1 | 0) - ox : floor.cols - 1,
            y1: region && region.y1 != null ? (region.y1 | 0) - oy : floor.rows - 1,
            z: floor.z
        };
        return offsetProps(TD.collectTallPropsFromFloor(floor, local), ox, oy);
    }

    function paletteAt(floor, layerId, worldX, worldY) {
        if (!floor || !floor.present) return 0;
        const x = (worldX | 0) - (floor.originX | 0);
        const y = (worldY | 0) - (floor.originY | 0);
        if (x < 0 || y < 0 || x >= floor.width || y >= floor.height) return 0;
        let sl = null;
        for (let i = 0; i < floor.subLayers.length; i++) {
            if (floor.subLayers[i].id === layerId) {
                sl = floor.subLayers[i];
                break;
            }
        }
        if (!sl || !sl.cells) return 0;
        return sl.cells[y * floor.width + x] | 0;
    }

    function createLoader(fetchFn) {
        const fetchImpl = fetchFn || (typeof fetch === 'function' ? fetch.bind(typeof window !== 'undefined' ? window : globalThis) : null);
        let floor = null;
        let inflight = null;
        let inflightKey = '';

        function keyOf(mapId, z, win) {
            return mapId + ':' + z + ':' + win.x + ',' + win.y + ',' + win.w + 'x' + win.h;
        }

        function ensure(opts) {
            const o = opts || {};
            const mapId = String(o.mapId || '');
            const z = o.z | 0;
            const camX = Number(o.camX) || 0;
            const camY = Number(o.camY) || 0;
            const viewW = o.viewW | 0;
            const viewH = o.viewH | 0;
            if (floor && floor.mapId === mapId && floor.z === z && coversView(floor, camX, camY, viewW, viewH)) {
                return floor;
            }
            if (!fetchImpl || !mapId) return floor;
            const win = desiredWindow(camX, camY, viewW, viewH);
            const k = keyOf(mapId, z, win);
            if (inflight && inflightKey === k) return floor;
            inflightKey = k;
            inflight = fetchImpl(windowUrl({
                mapId: mapId,
                z: z,
                x: win.x,
                y: win.y,
                w: win.w,
                h: win.h
            })).then(function (res) {
                return typeof res.json === 'function' ? res.json() : res;
            }).then(function (doc) {
                const next = decodeWindow(doc);
                if (next) floor = next;
                inflight = null;
                inflightKey = '';
                return floor;
            }).catch(function () {
                inflight = null;
                inflightKey = '';
                return floor;
            });
            return floor;
        }

        return {
            get floor() { return floor; },
            ensure: ensure,
            reset: function () { floor = null; inflight = null; inflightKey = ''; }
        };
    }

    function createTilemapCache(opts) {
        const o = opts || {};
        const margin = o.margin != null ? Math.max(1, o.margin | 0) : 2;
        let cache = null;
        let dirty = true;

        function allocSurface(wPx, hPx) {
            const w = Math.max(1, wPx | 0);
            const h = Math.max(1, hPx | 0);
            if (typeof OffscreenCanvas !== 'undefined') {
                try {
                    const canvas = new OffscreenCanvas(w, h);
                    const ctx = canvas.getContext('2d');
                    if (ctx) return { canvas, ctx };
                } catch (_e) {}
            }
            if (typeof document !== 'undefined' && document.createElement) {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (ctx) return { canvas, ctx };
                } catch (_e) {}
            }
            return null;
        }

        function invalidate() {
            dirty = true;
        }

        function render(targetCtx, floor, camX, camY, viewSize, renderOpts) {
            if (!targetCtx || !floor || !floor.present) return false;
            const ro = renderOpts || {};
            const tw = ro.tw || 32;
            const th = ro.th || 32;
            const drawPlacement = ro.drawPlacement;
            const viewW = viewSize.w;
            const viewH = viewSize.h;
            const z = floor.z | 0;
            const mapId = floor.mapId || '';

            let needRebuild = dirty || !cache;
            if (cache && !needRebuild) {
                if (cache.mapId !== mapId ||
                    cache.z !== z ||
                    cache.tw !== tw ||
                    cache.th !== th ||
                    cache.viewW !== viewW ||
                    cache.viewH !== viewH ||
                    cache.genre !== floor.genre ||
                    cache.pendingSprites > 0) {
                    needRebuild = true;
                } else {
                    const needX0 = camX;
                    const needY0 = camY;
                    const needX1 = camX + viewW;
                    const needY1 = camY + viewH;
                    if (needX0 < cache.x || needY0 < cache.y || needX1 > cache.x + cache.w || needY1 > cache.y + cache.h) {
                        needRebuild = true;
                    }
                }
            }

            if (needRebuild) {
                const cacheX = Math.floor(camX) - margin;
                const cacheY = Math.floor(camY) - margin;
                const cacheW = Math.ceil(viewW) + 2 * margin + 1;
                const cacheH = Math.ceil(viewH) + 2 * margin + 1;
                const pixelW = cacheW * tw;
                const pixelH = cacheH * th;

                let surface = (cache && cache.canvas && cache.ctx && cache.canvas.width === pixelW && cache.canvas.height === pixelH)
                    ? { canvas: cache.canvas, ctx: cache.ctx }
                    : (ro.allocSurface ? ro.allocSurface(pixelW, pixelH) : allocSurface(pixelW, pixelH));

                if (!surface || !surface.ctx) {
                    return false;
                }

                if (typeof surface.ctx.clearRect === 'function') {
                    surface.ctx.clearRect(0, 0, pixelW, pixelH);
                }

                let pendingSprites = 0;
                const genre = floor.genre;

                for (let li = 0; li < TERRAIN.length; li++) {
                    const layerId = TERRAIN[li];
                    for (let ty = cacheY; ty < cacheY + cacheH; ty++) {
                        for (let tx = cacheX; tx < cacheX + cacheW; tx++) {
                            const pIdx = paletteAt(floor, layerId, tx, ty);
                            if (pIdx <= 0) continue;
                            const placement = floor.palette[pIdx];
                            if (!placement || !placement.catalogId) continue;
                            if (drawPlacement) {
                                const ok = drawPlacement(tx, ty, placement, genre, surface.ctx, cacheX, cacheY, tw, th);
                                if (ok === false) {
                                    pendingSprites++;
                                }
                            }
                        }
                    }
                }

                cache = {
                    canvas: surface.canvas,
                    ctx: surface.ctx,
                    x: cacheX,
                    y: cacheY,
                    w: cacheW,
                    h: cacheH,
                    z: z,
                    mapId: mapId,
                    tw: tw,
                    th: th,
                    viewW: viewW,
                    viewH: viewH,
                    genre: genre,
                    pendingSprites: pendingSprites
                };
                dirty = false;
            }

            const sx = (camX - cache.x) * tw;
            const sy = (camY - cache.y) * th;
            const sw = viewW * tw;
            const sh = viewH * th;
            try {
                targetCtx.drawImage(cache.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
                return true;
            } catch (_e) {
                return false;
            }
        }

        return {
            render: render,
            invalidate: invalidate,
            get cache() { return cache; },
            get dirty() { return dirty; }
        };
    }

    return {
        MARGIN_MIN,
        MAX_WINDOW,
        TERRAIN,
        b64ToU16,
        windowUrl,
        desiredWindow,
        coversView,
        decodeWindow,
        collectWorldProps,
        paletteAt,
        createLoader,
        createTilemapCache
    };
});
