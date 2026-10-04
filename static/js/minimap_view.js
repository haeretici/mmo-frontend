'use strict';

/**
 * Minimap preview for /play.
 * Paints the M1 cache: one pixel per tile at zoom 0, scale 2^zoom from -2 to 2.
 * Unseen pixels use the panel background. Seen tiles use the six debug colors.
 * The camera follows the player except while the pointer is dragging.
 * Floor up and down only change the picture. A left click reports that tile.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineMinimapView = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const VIEW_W = 180;
    const VIEW_H = 140;
    const ZOOM_MIN = -2;
    const ZOOM_MAX = 2;
    const FLOOR_MIN = 0;
    const FLOOR_MAX = 15;
    const DRAG_SLOP = 4;
    const TILE_HEX = ['#0b0b0c', '#3d6b48', '#c4a35a', '#5a4a3a', '#2a4a6a', '#e0c078'];
    const TILE_RGB = [
        [0x0b, 0x0b, 0x0c],
        [0x3d, 0x6b, 0x48],
        [0xc4, 0xa3, 0x5a],
        [0x5a, 0x4a, 0x3a],
        [0x2a, 0x4a, 0x6a],
        [0xe0, 0xc0, 0x78]
    ];
    const EMPTY_HEX = '#151821';
    const EMPTY_RGB = [0x15, 0x18, 0x21];
    const CROSS_RGB = [0xff, 0xcc, 0x00];

    let camera = { x: 0, y: 0, z: 0 };
    let zoom = 0;
    let player = null;
    let hold = null;
    let dragging = false;
    let drag = null;
    let floorPinned = false;
    let mapId = '';
    let live = null;
    let store = null;
    let canvas = null;
    let floorEl = null;
    let zoomInBtn = null;
    let zoomOutBtn = null;
    let floorUpBtn = null;
    let floorDownBtn = null;
    let mounted = false;
    let onTileClick = null;

    function clampZoom(zoomLevel) {
        let z = zoomLevel | 0;
        if (z < ZOOM_MIN) z = ZOOM_MIN;
        if (z > ZOOM_MAX) z = ZOOM_MAX;
        return z;
    }

    function scaleForZoom(zoomLevel) {
        const z = clampZoom(zoomLevel);
        if (z > 0) return 1 << z;
        if (z < 0) return 1 / (1 << -z);
        return 1;
    }

    function pixelToTile(px, py, cam, zoomLevel, width, height) {
        const scale = scaleForZoom(zoomLevel);
        const cx = Math.floor((width - 1) / 2);
        const cy = Math.floor((height - 1) / 2);
        return {
            x: Math.floor(cam.x + (px - cx) / scale),
            y: Math.floor(cam.y + (py - cy) / scale),
            z: cam.z | 0
        };
    }

    function samePos(a, b) {
        return !!a && !!b && (a.x | 0) === (b.x | 0) && (a.y | 0) === (b.y | 0) && (a.z | 0) === (b.z | 0);
    }

    function applyFollow() {
        if (!player || dragging) return;
        if (samePos(hold, player)) return;
        hold = null;
        camera.x = player.x;
        camera.y = player.y;
        if (!floorPinned) camera.z = player.z;
    }

    function cellAt(x, y, z) {
        if (!store || typeof store.queryCell !== 'function' || !mapId) {
            return { seen: false, id: 0 };
        }
        return store.queryCell(mapId, x, y, z, live);
    }

    function plot(buf, width, height, x, y, rgb) {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const i = (y * width + x) * 4;
        buf[i] = rgb[0];
        buf[i + 1] = rgb[1];
        buf[i + 2] = rgb[2];
        buf[i + 3] = 255;
    }

    function tileSpan(tile, camCoord, center, scale, limit) {
        const startF = center + (tile - camCoord) * scale;
        const endF = center + (tile + 1 - camCoord) * scale;
        let start = Math.ceil(startF - 1e-9);
        let end = Math.floor(endF - 1e-9);
        if (end < start || end < 0 || start >= limit) return null;
        if (start < 0) start = 0;
        if (end >= limit) end = limit - 1;
        return { start: start, end: end };
    }

    function paintBuffer(width, height) {
        const w = width | 0;
        const h = height | 0;
        const buf = new Uint8ClampedArray(w * h * 4);
        const scale = scaleForZoom(zoom);
        const cx = Math.floor((w - 1) / 2);
        const cy = Math.floor((h - 1) / 2);
        const z = camera.z | 0;
        for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
                const tile = pixelToTile(px, py, camera, zoom, w, h);
                const cell = cellAt(tile.x, tile.y, z);
                const id = cell && cell.seen ? (cell.id | 0) : -1;
                const rgb = id >= 0 && id <= 5 ? TILE_RGB[id] : EMPTY_RGB;
                const i = (py * w + px) * 4;
                buf[i] = rgb[0];
                buf[i + 1] = rgb[1];
                buf[i + 2] = rgb[2];
                buf[i + 3] = 255;
            }
        }
        if (player && (player.z | 0) === z) {
            const xs = tileSpan(player.x, camera.x, cx, scale, w);
            const ys = tileSpan(player.y, camera.y, cy, scale, h);
            if (xs && ys) {
                const mx = Math.floor((xs.start + xs.end) / 2);
                const my = Math.floor((ys.start + ys.end) / 2);
                plot(buf, w, h, mx, my, CROSS_RGB);
                plot(buf, w, h, mx - 1, my, CROSS_RGB);
                plot(buf, w, h, mx + 1, my, CROSS_RGB);
                plot(buf, w, h, mx, my - 1, CROSS_RGB);
                plot(buf, w, h, mx, my + 1, CROSS_RGB);
            }
        }
        return buf;
    }

    function updateControls() {
        if (floorEl) {
            const text = player ? String(camera.z | 0) : '—';
            if (floorEl.textContent !== text) floorEl.textContent = text;
        }
        if (zoomInBtn) zoomInBtn.disabled = zoom >= ZOOM_MAX;
        if (zoomOutBtn) zoomOutBtn.disabled = zoom <= ZOOM_MIN;
        if (floorUpBtn) floorUpBtn.disabled = (camera.z | 0) <= FLOOR_MIN;
        if (floorDownBtn) floorDownBtn.disabled = (camera.z | 0) >= FLOOR_MAX;
        if (canvas && canvas.classList) canvas.classList.toggle('is-dragging', dragging);
    }

    function draw() {
        updateControls();
        if (!canvas || typeof canvas.getContext !== 'function') return;
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof ctx.createImageData !== 'function') return;
        const w = canvas.width || VIEW_W;
        const h = canvas.height || VIEW_H;
        const buf = paintBuffer(w, h);
        const image = ctx.createImageData(w, h);
        image.data.set(buf);
        ctx.putImageData(image, 0, 0);
    }

    function sync(state) {
        if (!state) return;
        if ('store' in state) store = state.store || null;
        if (state.mapId != null) mapId = String(state.mapId || '').replace(/\t/g, '');
        if ('live' in state) live = state.live || null;
        if ('player' in state) {
            if (state.player) {
                player = {
                    x: state.player.x | 0,
                    y: state.player.y | 0,
                    z: state.player.z | 0
                };
            } else {
                player = null;
                hold = null;
                floorPinned = false;
            }
        }
        if (state.camera) {
            camera = {
                x: +state.camera.x || 0,
                y: +state.camera.y || 0,
                z: state.camera.z | 0
            };
            if (player) hold = { x: player.x, y: player.y, z: player.z };
        } else {
            applyFollow();
        }
        draw();
    }

    function zoomBy(delta) {
        const next = clampZoom((zoom | 0) + (delta | 0));
        if (next === zoom) return false;
        zoom = next;
        draw();
        return true;
    }

    function floorStep(delta) {
        const next = (camera.z | 0) + (delta | 0);
        if (next < FLOOR_MIN || next > FLOOR_MAX) return false;
        camera.z = next;
        floorPinned = true;
        draw();
        return true;
    }

    function center() {
        floorPinned = false;
        hold = null;
        dragging = false;
        drag = null;
        if (player) {
            camera.x = player.x;
            camera.y = player.y;
            camera.z = player.z;
        }
        draw();
    }

    function pointerDown(px, py) {
        drag = {
            x: px,
            y: py,
            camX: camera.x,
            camY: camera.y,
            moved: false
        };
    }

    function pointerMove(px, py) {
        if (!drag) return;
        const dx = px - drag.x;
        const dy = py - drag.y;
        if (!drag.moved && (dx * dx + dy * dy) < (DRAG_SLOP * DRAG_SLOP)) return;
        drag.moved = true;
        dragging = true;
        const scale = scaleForZoom(zoom);
        camera.x = drag.camX + (drag.x - px) / scale;
        camera.y = drag.camY + (drag.y - py) / scale;
        draw();
    }

    function viewSize() {
        return {
            w: canvas && canvas.width ? canvas.width : VIEW_W,
            h: canvas && canvas.height ? canvas.height : VIEW_H
        };
    }

    function pointerUp(px, py) {
        const clicked = drag && !drag.moved;
        let tile = null;
        if (clicked) {
            const size = viewSize();
            const x = px == null ? drag.x : px;
            const y = py == null ? drag.y : py;
            tile = pixelToTile(x, y, camera, zoom, size.w, size.h);
        }
        if (drag && drag.moved && player) {
            hold = { x: player.x, y: player.y, z: player.z };
        }
        dragging = false;
        drag = null;
        draw();
        if (tile && typeof onTileClick === 'function') onTileClick(tile);
    }

    function eventPoint(ev) {
        const rect = canvas.getBoundingClientRect();
        const sx = rect.width ? canvas.width / rect.width : 1;
        const sy = rect.height ? canvas.height / rect.height : 1;
        return {
            x: (ev.clientX - rect.left) * sx,
            y: (ev.clientY - rect.top) * sy
        };
    }

    function onPointerDown(ev) {
        if (!canvas || (ev.button != null && ev.button !== 0)) return;
        const p = eventPoint(ev);
        pointerDown(p.x, p.y);
        if (ev.cancelable) ev.preventDefault();
        if (canvas.setPointerCapture && ev.pointerId != null) {
            try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* already released */ }
        }
    }

    function onPointerMove(ev) {
        if (!drag || !canvas) return;
        const p = eventPoint(ev);
        pointerMove(p.x, p.y);
    }

    function onPointerUp(ev) {
        if (ev && canvas && typeof ev.clientX === 'number') {
            const p = eventPoint(ev);
            pointerUp(p.x, p.y);
            return;
        }
        pointerUp();
    }

    function onWheel(ev) {
        if (ev.cancelable) ev.preventDefault();
        if (ev.deltaY < 0) zoomBy(1);
        else if (ev.deltaY > 0) zoomBy(-1);
    }

    function bindClick(el, fn) {
        if (!el) return;
        el.addEventListener('click', function (ev) {
            ev.preventDefault();
            fn();
        });
    }

    function mount(doc) {
        const root = doc || (typeof document !== 'undefined' ? document : null);
        if (!root || mounted || typeof root.getElementById !== 'function') return;
        canvas = root.getElementById('minimap');
        floorEl = root.getElementById('minimapFloor');
        zoomInBtn = root.getElementById('minimapZoomIn');
        zoomOutBtn = root.getElementById('minimapZoomOut');
        floorUpBtn = root.getElementById('minimapFloorUp');
        floorDownBtn = root.getElementById('minimapFloorDown');
        bindClick(zoomInBtn, function () { zoomBy(1); });
        bindClick(zoomOutBtn, function () { zoomBy(-1); });
        bindClick(floorUpBtn, function () { floorStep(-1); });
        bindClick(floorDownBtn, function () { floorStep(1); });
        bindClick(root.getElementById('minimapCenter'), center);
        if (canvas) {
            canvas.addEventListener('pointerdown', onPointerDown);
            canvas.addEventListener('pointermove', onPointerMove);
            canvas.addEventListener('pointerup', onPointerUp);
            canvas.addEventListener('pointercancel', onPointerUp);
            canvas.addEventListener('wheel', onWheel, { passive: false });
        }
        mounted = true;
        draw();
    }

    function resetForTests() {
        camera = { x: 0, y: 0, z: 0 };
        zoom = 0;
        player = null;
        hold = null;
        dragging = false;
        drag = null;
        floorPinned = false;
        mapId = '';
        live = null;
        store = null;
        onTileClick = null;
    }

    function setTileClick(fn) {
        onTileClick = typeof fn === 'function' ? fn : null;
    }

    return {
        VIEW_W: VIEW_W,
        VIEW_H: VIEW_H,
        ZOOM_MIN: ZOOM_MIN,
        ZOOM_MAX: ZOOM_MAX,
        FLOOR_MIN: FLOOR_MIN,
        FLOOR_MAX: FLOOR_MAX,
        TILE_HEX: TILE_HEX,
        EMPTY_HEX: EMPTY_HEX,
        EMPTY_RGB: EMPTY_RGB,
        CROSS_RGB: CROSS_RGB,
        scaleForZoom: scaleForZoom,
        pixelToTile: pixelToTile,
        paintBuffer: paintBuffer,
        sync: sync,
        zoomBy: zoomBy,
        zoomIn: function () { return zoomBy(1); },
        zoomOut: function () { return zoomBy(-1); },
        floorUp: function () { return floorStep(-1); },
        floorDown: function () { return floorStep(1); },
        center: center,
        pointerDown: pointerDown,
        pointerMove: pointerMove,
        pointerUp: pointerUp,
        setTileClick: setTileClick,
        camera: function () { return { x: camera.x, y: camera.y, z: camera.z | 0 }; },
        zoom: function () { return zoom; },
        mount: mount,
        resetForTests: resetForTests
    };
});
