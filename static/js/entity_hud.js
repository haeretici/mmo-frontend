'use strict';

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineEntityHud = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const BAR_H = 4;
    const BAR_GAP = 1;
    const STACK_PAD = 2;
    const NAME_GAP = 3;
    const MANA_SHIELD_BAR_FILL = '#a855f7';
    const TARGET_SHADOW_HZ = 2.5 / 3;
    const TARGET_SHADOW_R_DARK = 0xaa;
    const TARGET_SHADOW_R_BRIGHT = 0xff;
    const TARGET_SHADOW_ALPHA = 0.62;
    const HOVER_STROKE = '#ffd700';
    const HOVER_LINE_WIDTH = 2;
    const HOVER_SHADOW_BLUR = 6;

    /**
     * 3-tier HP color ramp matching legacy ShowName:
     * > 70%: Bright green (#00ff00)
     * 40% - 70%: Yellow (#ffff00)
     * < 40%: Red (#ff0000)
     *
     * @param {number} frac 0..1
     * @returns {string}
     */
    function hpFill(frac) {
        if (frac > 0.7) return '#00ff00';
        if (frac > 0.4) return '#ffff00';
        return '#ff0000';
    }

    /**
     * Resolve active mana shield bar condition.
     * @param {object|null|undefined} ent
     * @returns {{ kind: string, frac: number, fill: string }|null}
     */
    function resolveManaShieldBar(ent) {
        if (!ent) return null;
        if (ent.manaShield) {
            const remaining = Number(ent.manaShield.remaining != null ? ent.manaShield.remaining : ent.manaShield.poolRemaining) || 0;
            const max = Number(ent.manaShield.max != null ? ent.manaShield.max : ent.manaShield.poolMax) || remaining;
            if (max > 0 && remaining > 0) {
                return {
                    kind: 'mana_shield',
                    frac: Math.max(0, Math.min(1, remaining / max)),
                    fill: MANA_SHIELD_BAR_FILL
                };
            }
        }
        if (Array.isArray(ent.conditions)) {
            for (let i = 0; i < ent.conditions.length; i++) {
                const c = ent.conditions[i];
                if (!c) continue;
                if (c.kind === 'mana_shield' || c.type === 'mana_shield') {
                    const remaining = Number(c.poolRemaining != null ? c.poolRemaining : c.remaining) || 0;
                    const max = Number(c.poolMax != null ? c.poolMax : (c.max || remaining)) || 0;
                    if (max > 0 && remaining > 0) {
                        return {
                            kind: 'mana_shield',
                            frac: Math.max(0, Math.min(1, remaining / max)),
                            fill: MANA_SHIELD_BAR_FILL
                        };
                    }
                }
            }
        }
        return null;
    }

    /**
     * Resolve resource bars for an entity, stacked top to bottom:
     * [Mana Shield (if active)] -> [HP] -> [Mana (if player/showMana)]
     *
     * @param {object|null|undefined} ent
     * @param {boolean} [showMana=false]
     * @returns {{ kind: string, frac: number, fill: string }[]}
     */
    function nameplateBarsForEntity(ent, showMana) {
        if (!ent) return [];
        const bars = [];

        const shield = resolveManaShieldBar(ent);
        if (shield) {
            bars.push(shield);
        }

        let hpCur = 0;
        let hpMax = 0;
        if (ent.hp && typeof ent.hp === 'object') {
            hpCur = Number(ent.hp.current) || 0;
            hpMax = Number(ent.hp.max) || 0;
        } else {
            hpCur = Number(ent.hp) || 0;
            hpMax = Number(ent.hpMax) || 0;
        }
        if (hpMax > 0) {
            const frac = Math.max(0, Math.min(1, hpCur / hpMax));
            bars.push({ kind: 'hp', frac: frac, fill: hpFill(frac) });
        }

        let mpCur = 0;
        let mpMax = 0;
        if (ent.mp && typeof ent.mp === 'object') {
            mpCur = Number(ent.mp.current) || 0;
            mpMax = Number(ent.mp.max) || 0;
        } else {
            mpCur = Number(ent.mp) || 0;
            mpMax = Number(ent.mpMax) || 0;
        }
        if (showMana && mpMax > 0) {
            const frac = Math.max(0, Math.min(1, mpCur / mpMax));
            bars.push({ kind: 'mp', frac: frac, fill: '#0000ff' });
        }

        return bars;
    }

    /**
     * Draw a single resource bar with background, fill, and 1px stroke outline.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} px
     * @param {number} py
     * @param {number} bw
     * @param {number} frac
     * @param {string} fill
     * @param {number} [barH=4]
     */
    function drawBarAt(ctx, px, py, bw, frac, fill, barH) {
        if (!ctx) return;
        const h = barH || BAR_H;
        const f = Math.max(0, Math.min(1, Number(frac) || 0));
        ctx.fillStyle = '#1a1a24';
        ctx.fillRect(px, py, bw, h);
        ctx.fillStyle = fill;
        ctx.fillRect(px, py, Math.max(0, Math.floor(bw * f)), h);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, bw - 1, h - 1);
    }

    /**
     * Draw centered entity name with 2px stroke outline and white fill,
     * plus stacked resource bars directly above stackTopY.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} ent
     * @param {number} tilePxX left canvas coordinate of the tile
     * @param {number} stackTopY canvas Y of the top of the sprite
     * @param {number} [tw=32] tile width in px
     * @param {boolean} [showMana=false]
     */
    function drawNameplate(ctx, ent, tilePxX, stackTopY, tw, showMana) {
        if (!ctx || !ent) return;
        const width = tw || 32;
        const bars = nameplateBarsForEntity(ent, showMana);
        const name = ent.name ? String(ent.name) : '';
        if (!bars.length && !name) return;

        const barsH = bars.length > 0 ? bars.length * BAR_H + (bars.length - 1) * BAR_GAP : 0;
        const fontPx = Math.max(8, Math.min(11, Math.round(width * 0.55)));
        const cursorY = stackTopY - STACK_PAD - barsH;

        const barW = width;
        const barX = tilePxX + Math.floor((width - barW) / 2);
        const centerX = tilePxX + width / 2;

        let y = cursorY;
        for (let i = 0; i < bars.length; i++) {
            drawBarAt(ctx, barX, y, barW, bars[i].frac, bars[i].fill);
            y += BAR_H + BAR_GAP;
        }

        if (name) {
            ctx.save();
            ctx.font = 'bold ' + fontPx + 'px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const nameX = centerX;
            const nameY = cursorY - NAME_GAP;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.strokeText(name, nameX, nameY);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(name, nameX, nameY);
            ctx.restore();
        }
    }

    /**
     * Calculate target pulse color and blur based on wall-clock seconds.
     * @param {number} [nowSec]
     * @returns {{ u: number, fill: string, alpha: number, blur: number }}
     */
    function targetPulse(nowSec) {
        let t = nowSec != null && Number.isFinite(Number(nowSec)) ? Number(nowSec) : NaN;
        if (!Number.isFinite(t)) {
            t = typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now() / 1000
                : Date.now() / 1000;
        }
        const u = 0.5 + 0.5 * Math.cos(t * TARGET_SHADOW_HZ * Math.PI * 2);
        const r = Math.round(TARGET_SHADOW_R_DARK + (TARGET_SHADOW_R_BRIGHT - TARGET_SHADOW_R_DARK) * u);
        const hex = r.toString(16).padStart(2, '0');
        const fill = '#' + hex + '0000';
        const blur = Math.max(4, Math.round(32 * (0.14 + 0.12 * u)));
        return {
            u: u,
            fill: fill,
            alpha: TARGET_SHADOW_ALPHA,
            blur: blur
        };
    }

    /**
     * Draw a pulsing red circular/elliptical reticle under the feet of the selected target.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} tilePxX
     * @param {number} tilePxY
     * @param {number} [tw=32]
     * @param {number} [th=32]
     * @param {number} [nowSec]
     */
    function drawTargetReticle(ctx, tilePxX, tilePyY, tw, th, nowSec) {
        if (!ctx) return;
        const width = tw || 32;
        const height = th || 32;
        const cx = tilePxX + width / 2;
        const cy = tilePyY + height - height * 0.1;
        const rx = width * 0.35;
        const ry = height * 0.14;

        const pulse = targetPulse(nowSec);

        ctx.save();
        ctx.globalAlpha = pulse.alpha;
        ctx.fillStyle = pulse.fill;
        if (pulse.blur > 0) {
            ctx.shadowColor = pulse.fill;
            ctx.shadowBlur = pulse.blur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
        ctx.beginPath();
        if (typeof ctx.ellipse === 'function') {
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        } else {
            ctx.arc(cx, cy, rx, 0, Math.PI * 2);
        }
        ctx.fill();

        ctx.strokeStyle = pulse.fill;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Draw a glowing gold boundary box outline when hovered.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ dx?: number, dy?: number, dw?: number, dh?: number, x?: number, y?: number, w?: number, h?: number }} box
     */
    function drawHoverHighlight(ctx, box) {
        if (!ctx || !box) return;
        const x = box.dx != null ? box.dx : (box.x != null ? box.x : 0);
        const y = box.dy != null ? box.dy : (box.y != null ? box.y : 0);
        const w = box.dw != null ? box.dw : (box.w != null ? box.w : 32);
        const h = box.dh != null ? box.dh : (box.h != null ? box.h : 32);

        ctx.save();
        ctx.strokeStyle = HOVER_STROKE;
        ctx.lineWidth = HOVER_LINE_WIDTH;
        ctx.shadowColor = HOVER_STROKE;
        ctx.shadowBlur = HOVER_SHADOW_BLUR;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        ctx.restore();
    }

    return {
        BAR_H: BAR_H,
        BAR_GAP: BAR_GAP,
        STACK_PAD: STACK_PAD,
        NAME_GAP: NAME_GAP,
        MANA_SHIELD_BAR_FILL: MANA_SHIELD_BAR_FILL,
        TARGET_SHADOW_HZ: TARGET_SHADOW_HZ,
        TARGET_SHADOW_ALPHA: TARGET_SHADOW_ALPHA,
        HOVER_STROKE: HOVER_STROKE,
        HOVER_LINE_WIDTH: HOVER_LINE_WIDTH,
        HOVER_SHADOW_BLUR: HOVER_SHADOW_BLUR,
        hpFill: hpFill,
        resolveManaShieldBar: resolveManaShieldBar,
        nameplateBarsForEntity: nameplateBarsForEntity,
        drawBarAt: drawBarAt,
        drawNameplate: drawNameplate,
        targetPulse: targetPulse,
        drawTargetReticle: drawTargetReticle,
        drawHoverHighlight: drawHoverHighlight
    };
});
