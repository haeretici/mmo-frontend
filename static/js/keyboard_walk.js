'use strict';

/**
 * Keyboard walk KeyPress delay. Same shape as the reference client:
 * first down is immediate, OS key-repeat is ignored, auto-repeat starts after
 * 200ms, then interval is at least the server step delay.
 * Held keys combine per axis (latest key wins on that axis), so north+west
 * is one north-west step. Dirs match the server: N0 E1 S2 W3 SW4 SE5 NW6 NE7.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineKeyboardWalk = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const AUTO_REPEAT_DELAY_MS = 200;
    const KEY_PRESS_REPEAT_MS = 30;
    const DIR_BY_CODE = Object.freeze({
        ArrowUp: 0,
        KeyW: 0,
        ArrowRight: 1,
        KeyD: 1,
        ArrowDown: 2,
        KeyS: 2,
        ArrowLeft: 3,
        KeyA: 3
    });

    const DIR_DELTA = Object.freeze([
        Object.freeze({ dx: 0, dy: -1 }),
        Object.freeze({ dx: 1, dy: 0 }),
        Object.freeze({ dx: 0, dy: 1 }),
        Object.freeze({ dx: -1, dy: 0 }),
        Object.freeze({ dx: -1, dy: 1 }),
        Object.freeze({ dx: 1, dy: 1 }),
        Object.freeze({ dx: -1, dy: -1 }),
        Object.freeze({ dx: 1, dy: -1 })
    ]);

    function dirOf(code) {
        if (code == null) return null;
        const d = DIR_BY_CODE[code];
        return d == null ? null : d;
    }

    function dirFromDelta(dx, dy) {
        if (!dx && !dy) return null;
        if (!dx) return dy < 0 ? 0 : 2;
        if (!dy) return dx > 0 ? 1 : 3;
        if (dy < 0) return dx > 0 ? 7 : 6;
        return dx > 0 ? 5 : 4;
    }

    /**
     * True when a HUD control should keep the key (chat, name fields, dropdowns).
     * Checkboxes / radios (Auto Chase) must not swallow WASD.
     */
    function isTypingTarget(el) {
        if (!el) return false;
        if (el.isContentEditable) return true;
        const tag = String(el.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (tag !== 'INPUT') return false;
        const type = String(el.type || 'text').toLowerCase();
        if (
            type === 'checkbox' || type === 'radio' || type === 'button'
            || type === 'submit' || type === 'reset' || type === 'range'
            || type === 'file' || type === 'color' || type === 'hidden'
        ) {
            return false;
        }
        return true;
    }

    function create(opts) {
        const autoRepeatDelayMs = opts && opts.autoRepeatDelayMs != null
            ? Math.max(0, opts.autoRepeatDelayMs | 0)
            : AUTO_REPEAT_DELAY_MS;
        const resolveDir = opts && typeof opts.dirOf === 'function' ? opts.dirOf : dirOf;
        let held = [];
        let lastEmitTicks = null;

        function combinedDir() {
            let dx = 0;
            let dy = 0;
            for (let i = held.length - 1; i >= 0; i--) {
                if (held[i].dx) dx = held[i].dx;
                if (held[i].dy) dy = held[i].dy;
            }
            return dirFromDelta(dx, dy);
        }

        function currentDir() {
            return combinedDir();
        }

        function isHeld() {
            return held.length > 0;
        }

        function reset() {
            held = [];
            lastEmitTicks = null;
        }

        function keyDown(code, now) {
            const dir = resolveDir(code);
            const delta = dir == null ? null : DIR_DELTA[dir];
            if (!delta) return false;
            if (held.some(function (h) { return h.code === code; })) return false;
            held = held.filter(function (h) { return h.dir !== dir; });
            held.unshift({
                code: code,
                dir: dir,
                dx: delta.dx,
                dy: delta.dy,
                firstTicks: now,
                emitted: false
            });
            return true;
        }

        function keyUp(code) {
            if (resolveDir(code) == null) return;
            held = held.filter(function (h) { return h.code !== code; });
            if (!held.length) lastEmitTicks = null;
        }

        function readyDir(now, stepDelayMs) {
            if (!held.length) return null;
            const dir = combinedDir();
            if (dir == null) return null;
            const h = held[0];
            const interval = Math.max(
                KEY_PRESS_REPEAT_MS,
                stepDelayMs == null ? autoRepeatDelayMs : (stepDelayMs | 0)
            );
            if (lastEmitTicks != null && now - lastEmitTicks < interval) return null;
            if (h.emitted && now - h.firstTicks < autoRepeatDelayMs) return null;
            return dir;
        }

        function markEmitted(now) {
            lastEmitTicks = now;
            if (held[0]) held[0].emitted = true;
        }

        return {
            keyDown,
            keyUp,
            readyDir,
            markEmitted,
            currentDir,
            isHeld,
            reset
        };
    }

    return {
        AUTO_REPEAT_DELAY_MS,
        KEY_PRESS_REPEAT_MS,
        DIR_BY_CODE,
        DIR_DELTA,
        dirOf,
        dirFromDelta,
        isTypingTarget,
        create
    };
});
