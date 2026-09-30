'use strict';

/**
 * Title-bar drag shared by bag / dialog / shop / loot floats and the
 * in-page client windows. Callers keep their own z-index and clamp.
 * Does not build panel DOM.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineFloatPanelDrag = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    /**
     * @param {HTMLElement|null|undefined} header
     * @param {HTMLElement|null|undefined} el
     * @param {{
     *   onRaise?: function(): void,
     *   ignoreSelector?: string,
     *   readOrigin?: function(HTMLElement): { left: number, top: number },
     *   onMove?: function(HTMLElement): void,
     *   primaryButtonOnly?: boolean,
     *   stopHeaderEvent?: boolean
     * }} [opts]
     */
    function wireHeaderDrag(header, el, opts) {
        if (!header || !el || header._hasFloatDrag) return;
        header._hasFloatDrag = true;
        const o = opts || {};
        const ignoreSelector = o.ignoreSelector || 'button';
        const onRaise = typeof o.onRaise === 'function' ? o.onRaise : function () {};
        const readOrigin = typeof o.readOrigin === 'function' ? o.readOrigin : function (node) {
            return { left: node.offsetLeft, top: node.offsetTop };
        };
        const onMove = typeof o.onMove === 'function' ? o.onMove : null;
        let pan = null;
        header.addEventListener('pointerdown', function (ev) {
            if (!ev) return;
            const t = ev.target;
            if (t && typeof t.closest === 'function' && t.closest(ignoreSelector)) return;
            if (o.primaryButtonOnly && ev.button != null && ev.button !== 0) return;
            onRaise();
            if (o.stopHeaderEvent && typeof ev.stopPropagation === 'function') ev.stopPropagation();
            const origin = readOrigin(el) || { left: 0, top: 0 };
            pan = {
                x: ev.clientX,
                y: ev.clientY,
                sl: origin.left,
                st: origin.top
            };
            if (header.setPointerCapture && ev.pointerId != null) {
                try { header.setPointerCapture(ev.pointerId); } catch (err) { /* already released */ }
            }
        });
        header.addEventListener('pointermove', function (ev) {
            if (!pan || !ev) return;
            el.style.left = (pan.sl + (ev.clientX - pan.x)) + 'px';
            el.style.top = (pan.st + (ev.clientY - pan.y)) + 'px';
            if (onMove) onMove(el);
        });
        function endDrag() { pan = null; }
        header.addEventListener('pointerup', endDrag);
        header.addEventListener('pointercancel', endDrag);
    }

    return { wireHeaderDrag: wireHeaderDrag };
});
