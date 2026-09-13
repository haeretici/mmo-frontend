'use strict';

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineCombatFx = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const MAX_FCT_ENTRIES = 64;
    const MAX_FX_ENTRIES = 64;

    const ELEMENT_COLORS = Object.freeze({
        physical: '#ffffff',
        crit: '#fbbf24',
        fire: '#f97316',
        ice: '#38bdf8',
        energy: '#a78bfa',
        earth: '#84cc16',
        death: '#c084fc',
        holy: '#fde047',
        healing: '#34d399',
        poison: '#4ade80',
        lifedrain: '#f472b6',
        manadrain: '#60a5fa',
        exp: '#38bdf8',
        miss: '#9ca3af'
    });

    /**
     * Map spell identifier or element string to element color.
     *
     * @param {string} [spellIdOrElement]
     * @returns {string}
     */
    function elementColorForSpell(spellIdOrElement) {
        if (!spellIdOrElement) return ELEMENT_COLORS.physical;
        const str = String(spellIdOrElement).toLowerCase();
        if (ELEMENT_COLORS[str]) return ELEMENT_COLORS[str];
        if (str.includes('fire')) return ELEMENT_COLORS.fire;
        if (str.includes('ice') || str.includes('frost')) return ELEMENT_COLORS.ice;
        if (str.includes('energy') || str.includes('electric')) return ELEMENT_COLORS.energy;
        if (str.includes('earth') || str.includes('terra')) return ELEMENT_COLORS.earth;
        if (str.includes('poison')) return ELEMENT_COLORS.poison;
        if (str.includes('holy') || str.includes('divine')) return ELEMENT_COLORS.holy;
        if (str.includes('death') || str.includes('mort')) return ELEMENT_COLORS.death;
        if (str.includes('heal')) return ELEMENT_COLORS.healing;
        return ELEMENT_COLORS.physical;
    }

    /**
     * Factory to create an isolated CombatFx renderer instance.
     */
    function createCombatFx() {
        /** @type {Array<object>} */
        let fctEntries = [];
        /** @type {Array<object>} */
        let fxEntries = [];
        let lastTimeSec = null;

        function pushFct(opts) {
            if (!opts || !opts.text) return;
            const entry = {
                x: Number(opts.x) || 0,
                y: Number(opts.y) || 0,
                z: opts.z != null ? opts.z : null,
                text: String(opts.text),
                color: opts.color || ELEMENT_COLORS.physical,
                age: 0,
                life: opts.life != null && opts.life > 0 ? Number(opts.life) : 0.9,
                isCrit: !!opts.isCrit,
                pixelSpace: !!opts.pixelSpace
            };
            fctEntries.push(entry);
            while (fctEntries.length > MAX_FCT_ENTRIES) {
                fctEntries.shift();
            }
        }

        function pushProjectile(opts) {
            if (!opts) return;
            const entry = {
                type: 'projectile',
                x0: Number(opts.x0) || 0,
                y0: Number(opts.y0) || 0,
                x1: Number(opts.x1) || 0,
                y1: Number(opts.y1) || 0,
                z: opts.z != null ? opts.z : null,
                color: opts.color || ELEMENT_COLORS.physical,
                spriteId: opts.spriteId || null,
                spriteGenre: opts.spriteGenre || null,
                spriteKind: opts.spriteKind || 'equipment',
                spriteScale: opts.spriteScale != null ? Number(opts.spriteScale) : 0.72,
                age: 0,
                life: opts.life != null && opts.life > 0 ? Number(opts.life) : 0.2
            };
            fxEntries.push(entry);
            while (fxEntries.length > MAX_FX_ENTRIES) {
                fxEntries.shift();
            }
        }

        function pushMelee(opts) {
            if (!opts) return;
            const entry = {
                type: 'melee',
                x0: Number(opts.x0) || 0,
                y0: Number(opts.y0) || 0,
                x1: Number(opts.x1) || 0,
                y1: Number(opts.y1) || 0,
                z: opts.z != null ? opts.z : null,
                color: opts.color || ELEMENT_COLORS.physical,
                age: 0,
                life: opts.life != null && opts.life > 0 ? Number(opts.life) : 0.18
            };
            fxEntries.push(entry);
            while (fxEntries.length > MAX_FX_ENTRIES) {
                fxEntries.shift();
            }
        }

        function pushAoe(opts) {
            if (!opts) return;
            const entry = {
                type: 'aoe',
                x: Number(opts.x) || 0,
                y: Number(opts.y) || 0,
                z: opts.z != null ? opts.z : null,
                radius: opts.radius != null ? Number(opts.radius) : 1,
                tiles: Array.isArray(opts.tiles) ? opts.tiles : null,
                color: opts.color || ELEMENT_COLORS.physical,
                age: 0,
                life: opts.life != null && opts.life > 0 ? Number(opts.life) : 0.35
            };
            fxEntries.push(entry);
            while (fxEntries.length > MAX_FX_ENTRIES) {
                fxEntries.shift();
            }
        }

        function pushDeath(opts) {
            if (!opts) return;
            const entry = {
                type: 'death',
                x: Number(opts.x) || 0,
                y: Number(opts.y) || 0,
                z: opts.z != null ? opts.z : null,
                color: opts.color || '#ff4444',
                age: 0,
                life: opts.life != null && opts.life > 0 ? Number(opts.life) : 0.45
            };
            fxEntries.push(entry);
            while (fxEntries.length > MAX_FX_ENTRIES) {
                fxEntries.shift();
            }
        }

        function update(dtSec) {
            const dt = Number(dtSec) || 0;
            if (dt <= 0) return;

            for (let i = fctEntries.length - 1; i >= 0; i--) {
                fctEntries[i].age += dt;
                if (fctEntries[i].age >= fctEntries[i].life) {
                    fctEntries.splice(i, 1);
                }
            }

            for (let i = fxEntries.length - 1; i >= 0; i--) {
                fxEntries[i].age += dt;
                if (fxEntries[i].age >= fxEntries[i].life) {
                    fxEntries.splice(i, 1);
                }
            }
        }

        function clear() {
            fctEntries.length = 0;
            fxEntries.length = 0;
            lastTimeSec = null;
        }

        function drawProjectile(ctx, e, t, tw, th, camX, camY, sprites) {
            const u = Math.min(1, t * 1.4);
            const x0 = (e.x0 - camX) * tw + tw / 2;
            const y0 = (e.y0 - camY) * th + th / 2;
            const x1 = (e.x1 - camX) * tw + tw / 2;
            const y1 = (e.y1 - camY) * th + th / 2;
            const hx = x0 + (x1 - x0) * u;
            const hy = y0 + (y1 - y0) * u;
            const alpha = Math.max(0, 1 - t);

            ctx.save();
            ctx.globalAlpha = alpha * 0.85;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = Math.max(1.5, tw * 0.08);
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(hx, hy);
            ctx.stroke();

            const r = Math.max(2, tw * 0.18);
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(hx, hy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        function drawMelee(ctx, e, t, tw, th, camX, camY) {
            const x0 = (e.x0 - camX) * tw + tw / 2;
            const y0 = (e.y0 - camY) * th + th / 2;
            const x1 = (e.x1 - camX) * tw + tw / 2;
            const y1 = (e.y1 - camY) * th + th / 2;
            const u = Math.min(1, t * 2.2);
            const hx = x0 + (x1 - x0) * u;
            const hy = y0 + (y1 - y0) * u;
            const alpha = Math.max(0, 1 - t);
            const dx = x1 - x0;
            const dy = y1 - y0;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const arm = Math.min(tw, th) * (0.28 + t * 0.12);

            ctx.save();
            ctx.globalAlpha = alpha * 0.75;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = Math.max(1.5, tw * 0.09);
            ctx.beginPath();
            ctx.moveTo(x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.35);
            ctx.lineTo(hx, hy);
            ctx.stroke();

            // Slash arc at the head
            ctx.globalAlpha = alpha * 0.95;
            ctx.lineWidth = Math.max(1.5, tw * 0.1);
            ctx.beginPath();
            ctx.moveTo(hx - nx * arm, hy - ny * arm);
            ctx.lineTo(hx + nx * arm, hy + ny * arm);
            ctx.stroke();

            // Small impact flash
            const r = Math.max(2, tw * 0.14 * (1 + t * 0.4));
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(hx, hy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        function drawAoe(ctx, e, t, tw, th, camX, camY) {
            const expand = 1 + t * 0.08;
            const alpha = Math.max(0, (1 - t) * 0.45);
            const alphaStroke = Math.max(0, (1 - t) * 0.9);

            ctx.save();
            ctx.fillStyle = e.color;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = Math.max(1, tw * 0.06);

            if (Array.isArray(e.tiles) && e.tiles.length) {
                const pad = ((expand - 1) * 0.5) * Math.min(tw, th);
                for (let i = 0; i < e.tiles.length; i++) {
                    const tile = e.tiles[i];
                    const px = (tile.x - camX) * tw - pad;
                    const py = (tile.y - camY) * th - pad;
                    const w = tw + pad * 2;
                    const h = th + pad * 2;
                    ctx.globalAlpha = alpha;
                    ctx.fillRect(px, py, w, h);
                    ctx.globalAlpha = alphaStroke;
                    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
                }
            } else {
                const rad = e.radius != null ? e.radius : 1;
                const half = (rad + 0.5) * expand;
                const cx = (e.x - camX) * tw + tw / 2;
                const cy = (e.y - camY) * th + th / 2;
                const side = 2 * half * Math.min(tw, th);

                ctx.globalAlpha = alpha;
                ctx.fillRect(cx - side / 2, cy - side / 2, side, side);
                ctx.globalAlpha = alphaStroke;
                ctx.strokeRect(cx - side / 2, cy - side / 2, side, side);
            }
            ctx.restore();
        }

        function drawDeath(ctx, e, t, tw, th, camX, camY) {
            const cx = (e.x - camX) * tw + tw / 2;
            const cy = (e.y - camY) * th + th / 2;
            const r = Math.min(tw, th) * (0.35 + t * 0.55);
            const alpha = Math.max(0, 1 - t);

            ctx.save();
            ctx.globalAlpha = alpha * 0.7;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = Math.max(1.5, tw * 0.1);
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();

            // Shrinking X mark
            const arm = Math.min(tw, th) * 0.28 * (1 - t * 0.5);
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(cx - arm, cy - arm);
            ctx.lineTo(cx + arm, cy + arm);
            ctx.moveTo(cx + arm, cy - arm);
            ctx.lineTo(cx - arm, cy + arm);
            ctx.stroke();
            ctx.restore();
        }

        function render(ctx, opts) {
            if (!ctx || !opts) return;
            const camX = Number(opts.camX) || 0;
            const camY = Number(opts.camY) || 0;
            const floorZ = opts.floorZ != null ? (opts.floorZ | 0) : null;
            const tw = Number(opts.tw) || 32;
            const th = Number(opts.th) || 32;
            const nowSec = opts.nowSec != null ? Number(opts.nowSec) : (Date.now() / 1000);
            const sprites = opts.sprites || null;

            if (lastTimeSec != null && nowSec > lastTimeSec) {
                update(Math.min(0.25, nowSec - lastTimeSec));
            }
            lastTimeSec = nowSec;

            // 1. Draw Combat VFX
            for (let i = 0; i < fxEntries.length; i++) {
                const e = fxEntries[i];
                if (floorZ != null && e.z != null && (e.z | 0) !== floorZ) continue;
                const t = e.life > 0 ? Math.min(1, e.age / e.life) : 1;
                if (e.type === 'projectile') {
                    drawProjectile(ctx, e, t, tw, th, camX, camY, sprites);
                } else if (e.type === 'melee') {
                    drawMelee(ctx, e, t, tw, th, camX, camY);
                } else if (e.type === 'aoe') {
                    drawAoe(ctx, e, t, tw, th, camX, camY);
                } else if (e.type === 'death') {
                    drawDeath(ctx, e, t, tw, th, camX, camY);
                }
            }

            // 2. Draw Floating Combat Text (FCT)
            if (fctEntries.length > 0) {
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                for (let i = 0; i < fctEntries.length; i++) {
                    const e = fctEntries[i];
                    if (floorZ != null && e.z != null && (e.z | 0) !== floorZ) continue;
                    const t = e.life > 0 ? Math.min(1, e.age / e.life) : 1;
                    const rise = Math.floor(t * 22);

                    let px, py;
                    if (e.pixelSpace) {
                        px = e.x;
                        py = e.y - rise;
                    } else {
                        px = (e.x - camX) * tw + tw / 2;
                        py = (e.y - camY) * th - rise;
                    }

                    const alpha = Math.max(0, 1 - t);
                    ctx.globalAlpha = alpha;
                    ctx.font = e.isCrit ? 'bold 13px monospace' : 'bold 11px monospace';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = e.isCrit ? 3 : 2;
                    ctx.strokeText(e.text, px, py);
                    ctx.fillStyle = e.color || '#ffffff';
                    ctx.fillText(e.text, px, py);
                }
                ctx.restore();
            }
        }

        return {
            pushFct,
            pushProjectile,
            pushMelee,
            pushAoe,
            pushDeath,
            update,
            clear,
            render,
            getFctEntries: () => fctEntries,
            getFxEntries: () => fxEntries
        };
    }

    const defaultInstance = createCombatFx();

    return {
        ELEMENT_COLORS,
        elementColorForSpell,
        createCombatFx,
        pushFct: defaultInstance.pushFct,
        pushProjectile: defaultInstance.pushProjectile,
        pushMelee: defaultInstance.pushMelee,
        pushAoe: defaultInstance.pushAoe,
        pushDeath: defaultInstance.pushDeath,
        update: defaultInstance.update,
        clear: defaultInstance.clear,
        render: defaultInstance.render,
        getFctEntries: defaultInstance.getFctEntries,
        getFxEntries: defaultInstance.getFxEntries
    };
});
