'use strict';

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineSpritePresentation = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const HIT_FLASH_SEC = 0.12;
    const HIT_RECOIL_SEC = 0.1;
    const HIT_RECOIL_TILES = 0.1;
    const HIT_FLASH_ALPHA = 0.55;
    const SHADOW_ALPHA = 0.28;
    const TARGET_SHADOW_ALPHA = 0.62;
    const TARGET_SHADOW_HZ = 2.5 / 3;
    const TARGET_SHADOW_R_DARK = 0xaa;
    const TARGET_SHADOW_R_BRIGHT = 0xff;
    const DEFAULT_JUMP_HEIGHT = 0.08;

    const RARITY_AURA = Object.freeze({
        rare: { color: '#3ddc84', r: 61, g: 220, b: 132, radius: 2, alpha: 0.9 },
        champion: { color: '#4da3ff', r: 77, g: 163, b: 255, radius: 2, alpha: 0.92 },
        elite: { color: '#c084fc', r: 192, g: 132, b: 252, radius: 3, alpha: 0.95 },
        boss: { color: '#fbbf24', r: 251, g: 191, b: 36, radius: 3, alpha: 1.0 }
    });

    const RARITY_TIER_RANK = Object.freeze({
        rare: 1,
        champion: 2,
        elite: 3,
        boss: 4
    });

    /**
     * Vertical bob in canvas pixels during a step slide.
     * Negative = up (half-sine arch: 0 -> peak -> 0).
     *
     * @param {object|null|undefined} entity
     * @param {number} [nowMs]
     * @param {number} [tileHeight=32]
     * @param {number} [jumpHeight=0.08]
     * @returns {number}
     */
    function stepBobOffsetPx(entity, nowMs, tileHeight, jumpHeight) {
        if (!entity) return 0;
        const dur = Number(entity.moveDur) || 0;
        const at = Number(entity.moveAt) || 0;
        if (dur <= 0 || at <= 0) return 0;
        const now = nowMs != null && Number.isFinite(Number(nowMs))
            ? Number(nowMs)
            : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
        const t = (now - at) / dur;
        if (t <= 0 || t >= 1) return 0;
        const th = Number(tileHeight) > 0 ? Number(tileHeight) : 32;
        const jump = jumpHeight != null && Number.isFinite(Number(jumpHeight))
            ? Number(jumpHeight)
            : DEFAULT_JUMP_HEIGHT;
        return -Math.sin(Math.PI * t) * th * jump;
    }

    /**
     * Initiate hit flash + recoil on defender.
     *
     * @param {object|null|undefined} defender
     * @param {object|null|undefined} attacker
     * @param {number} [nowSec]
     */
    function beginHitFeedback(defender, attacker, nowSec) {
        if (!defender) return;
        const t = nowSec != null && Number.isFinite(Number(nowSec))
            ? Number(nowSec)
            : (typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : Date.now() / 1000);

        defender._hitFlashUntil = t + HIT_FLASH_SEC;

        let rdx = 0;
        let rdy = 0;
        if (attacker && defender) {
            const ax = attacker.x != null ? Number(attacker.x) : 0;
            const ay = attacker.y != null ? Number(attacker.y) : 0;
            const dx = defender.x != null ? Number(defender.x) : 0;
            const dy = defender.y != null ? Number(defender.y) : 0;
            rdx = dx - ax;
            rdy = dy - ay;
        }
        const len = Math.hypot(rdx, rdy);
        if (len > 1e-6) {
            rdx = (rdx / len) * HIT_RECOIL_TILES;
            rdy = (rdy / len) * HIT_RECOIL_TILES;
        } else {
            const face = (defender.facing === -1 || defender.spriteFacing === -1) ? -1 : 1;
            rdx = face * HIT_RECOIL_TILES;
            rdy = 0;
        }
        defender._hitRecoilDx = rdx;
        defender._hitRecoilDy = rdy;
        defender._hitRecoilUntil = t + HIT_RECOIL_SEC;
        defender._hitRecoilT0 = t;
    }

    /**
     * Remaining hit flash strength 0..1 (0 = none).
     *
     * @param {object|null|undefined} entity
     * @param {number} [nowSec]
     * @returns {number}
     */
    function hitFlashStrength(entity, nowSec) {
        if (!entity) return 0;
        const until = Number(entity._hitFlashUntil) || 0;
        if (until <= 0) return 0;
        const t = nowSec != null && Number.isFinite(Number(nowSec))
            ? Number(nowSec)
            : (typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : Date.now() / 1000);
        if (t >= until) return 0;
        const left = until - t;
        if (left >= HIT_FLASH_SEC) return 1;
        return Math.max(0, Math.min(1, left / HIT_FLASH_SEC));
    }

    /**
     * Decay recoil offset in canvas pixels away from attacker.
     *
     * @param {object|null|undefined} entity
     * @param {number} [nowSec]
     * @param {number} [tileWidth=32]
     * @param {number} [tileHeight=32]
     * @returns {{ x: number, y: number }}
     */
    function getHitRecoilOffset(entity, nowSec, tileWidth, tileHeight) {
        if (!entity) return { x: 0, y: 0 };
        const until = Number(entity._hitRecoilUntil) || 0;
        if (until <= 0) return { x: 0, y: 0 };
        const t = nowSec != null && Number.isFinite(Number(nowSec))
            ? Number(nowSec)
            : (typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : Date.now() / 1000);
        if (t >= until) return { x: 0, y: 0 };
        const t0 = entity._hitRecoilT0 != null ? Number(entity._hitRecoilT0) : until - HIT_RECOIL_SEC;
        const span = Math.max(1e-6, until - t0);
        const u = Math.max(0, Math.min(1, (until - t) / span));
        const tw = Number(tileWidth) || 32;
        const th = Number(tileHeight) || 32;
        return {
            x: (Number(entity._hitRecoilDx) || 0) * u * tw,
            y: (Number(entity._hitRecoilDy) || 0) * u * th
        };
    }

    /**
     * Soft ellipse shadow under feet.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} tilePxX
     * @param {number} tilePxY
     * @param {number} tw
     * @param {number} th
     * @param {number} [scale=1]
     * @param {object|null|undefined} [img]
     * @param {boolean} [flipH=false]
     * @param {{ combatTargetHighlight?: boolean, hoverHighlight?: boolean, now?: number }} [opts]
     */
    function drawEntityShadow(ctx, tilePxX, tilePxY, tw, th, scale, img, flipH, opts) {
        if (!ctx) return;
        const sRaw = scale != null ? Number(scale) : 1;
        const sLayout = Number.isFinite(sRaw) && sRaw > 0 ? sRaw : 1;
        const sRad = Math.min(1.6, sLayout);
        const cx = tilePxX + tw / 2;
        const cy = tilePxY + th - th * 0.1;

        const highlight = !!(opts && opts.combatTargetHighlight);
        const hover = !!(opts && opts.hoverHighlight);
        const radMul = (highlight || hover) ? 1.25 : 1;
        const rx = tw * 0.28 * sRad * radMul;
        const ry = th * 0.11 * Math.min(1.3, sRad) * radMul;

        let fill = '#000000';
        let alpha = SHADOW_ALPHA;
        let blur = 0;

        let t = opts && opts.now != null ? Number(opts.now) : NaN;
        if (!Number.isFinite(t)) {
            t = typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : Date.now() / 1000;
        }

        if (hover && !highlight) {
            const u = 0.5 + 0.5 * Math.cos(t * TARGET_SHADOW_HZ * Math.PI * 2);
            const r = Math.round(0xdd + (0xff - 0xdd) * u);
            const gVal = Math.round(0xaa + (0xd7 - 0xaa) * u);
            fill = '#' + r.toString(16).padStart(2, '0') + gVal.toString(16).padStart(2, '0') + '00';
            alpha = 0.8;
            blur = Math.max(5, Math.round(tw * (0.16 + 0.1 * u)));
        } else if (highlight) {
            const u = 0.5 + 0.5 * Math.cos(t * TARGET_SHADOW_HZ * Math.PI * 2);
            const r = Math.round(TARGET_SHADOW_R_DARK + (TARGET_SHADOW_R_BRIGHT - TARGET_SHADOW_R_DARK) * u);
            fill = '#' + r.toString(16).padStart(2, '0') + '0000';
            alpha = TARGET_SHADOW_ALPHA;
            blur = Math.max(4, Math.round(tw * (0.14 + 0.12 * u)));
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        if (blur > 0 && typeof ctx.shadowBlur === 'number') {
            ctx.shadowColor = fill;
            ctx.shadowBlur = blur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
        if (typeof ctx.ellipse === 'function') {
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
        }
        ctx.restore();
    }

    /**
     * White flash overlay over drawn sprite box on hit.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ dx: number, dy: number, dw: number, dh: number }|{ px: number, py: number, scaledW: number, scaledH: number }} box
     * @param {number} strength 0..1
     */
    function drawSpriteHitFlash(ctx, box, strength) {
        if (!ctx || !box) return;
        const a = Number(strength);
        if (!(a > 0)) return;
        const dx = Math.floor(box.dx != null ? box.dx : box.px);
        const dy = Math.floor(box.dy != null ? box.dy : box.py);
        const dw = box.dw != null ? box.dw : box.scaledW;
        const dh = box.dh != null ? box.dh : box.scaledH;
        if (dw <= 0 || dh <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, a) * HIT_FLASH_ALPHA;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(dx, dy, dw, dh);
        ctx.restore();
    }

    /**
     * Highest rarity tier on entity (null for normal / player).
     *
     * @param {object|null|undefined} entity
     * @returns {'rare'|'champion'|'elite'|'boss'|null}
     */
    function resolveEntityRarityTier(entity) {
        if (!entity) return null;
        if (entity.type === 'player' || entity.isPlayer) return null;
        let best = null;
        let bestRank = 0;
        function consider(raw) {
            if (raw == null || raw === '') return;
            const k = String(raw).toLowerCase();
            const rank = RARITY_TIER_RANK[k];
            if (rank == null) return;
            if (rank > bestRank) {
                bestRank = rank;
                best = k;
            }
        }
        if (entity.rarity != null) consider(entity.rarity);
        if (Array.isArray(entity.affixes)) {
            for (let i = 0; i < entity.affixes.length; i++) consider(entity.affixes[i]);
        }
        if (entity.isBoss || entity.boss) consider('boss');
        if (entity.isElite || entity.elite) consider('elite');
        if (entity.isChampion || entity.champion) consider('champion');
        if (entity.isRare || entity.rare) consider('rare');
        return best;
    }

    /**
     * Rarity aura outline around sprite.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {object|null|undefined} img
     * @param {{ dx: number, dy: number, dw: number, dh: number }} layout
     * @param {boolean} [flipH=false]
     * @param {string|null|undefined} tier
     * @param {number} [nowSec]
     */
    function drawEntityRarityAura(ctx, img, layout, flipH, tier, nowSec) {
        if (!ctx || !layout || !tier) return;
        const cfg = RARITY_AURA[tier];
        if (!cfg) return;
        const dx0 = Math.floor(layout.dx != null ? layout.dx : layout.px);
        const dy0 = Math.floor(layout.dy != null ? layout.dy : layout.py);
        const dw = layout.dw != null ? layout.dw : layout.scaledW;
        const dh = layout.dh != null ? layout.dh : layout.scaledH;
        if (!(dw > 0) || !(dh > 0)) return;

        const t = nowSec != null && Number.isFinite(Number(nowSec))
            ? Number(nowSec)
            : (typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : Date.now() / 1000);
        const pulse = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(t * 3.2));
        const alpha = Math.min(1, cfg.alpha * pulse);

        ctx.save();
        if (flipH) {
            const cx = dx0 + dw / 2;
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-cx, 0);
        }
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = cfg.color;
        ctx.shadowColor = cfg.color;
        ctx.shadowBlur = Math.max(3, Math.round(5 * (layout.scale || 1)));
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.lineWidth = cfg.radius || 2;
        ctx.strokeRect(dx0 - 1, dy0 - 1, dw + 2, dh + 2);
        ctx.restore();
    }

    return {
        HIT_FLASH_SEC,
        HIT_RECOIL_SEC,
        HIT_RECOIL_TILES,
        HIT_FLASH_ALPHA,
        SHADOW_ALPHA,
        TARGET_SHADOW_ALPHA,
        TARGET_SHADOW_HZ,
        TARGET_SHADOW_R_DARK,
        TARGET_SHADOW_R_BRIGHT,
        DEFAULT_JUMP_HEIGHT,
        RARITY_AURA,
        RARITY_TIER_RANK,
        stepBobOffsetPx,
        beginHitFeedback,
        hitFlashStrength,
        getHitRecoilOffset,
        drawEntityShadow,
        drawSpriteHitFlash,
        resolveEntityRarityTier,
        drawEntityRarityAura
    };
});
