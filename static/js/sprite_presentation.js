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
    const OPAQUE_ALPHA_MIN = 24;
    const FOOT_BAND_FRAC = 0.33;

    const _auraCache = new Map();
    const _footCache = new Map();
    const _imgIds = typeof WeakMap === 'function' ? new WeakMap() : null;
    let _imgIdSeq = 0;

    function _imageCacheId(img) {
        if (!img || typeof img !== 'object') return 'null';
        if (_imgIds && _imgIds.has(img)) return _imgIds.get(img);
        let id;
        if (img.src) id = String(img.src);
        else if (img._src) id = String(img._src);
        else {
            _imgIdSeq += 1;
            id = 'img#' + _imgIdSeq;
        }
        if (_imgIds) _imgIds.set(img, id);
        return id;
    }

    function _allocAuraCanvas(w, h) {
        const ww = Math.max(1, w | 0);
        const hh = Math.max(1, h | 0);
        if (typeof OffscreenCanvas !== 'undefined') {
            try {
                const canvas = new OffscreenCanvas(ww, hh);
                const ctx = canvas.getContext('2d');
                if (ctx) return { canvas: canvas, ctx: ctx };
            } catch (_e) { /* fall through */ }
        }
        if (typeof document !== 'undefined' && document.createElement) {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = ww;
                canvas.height = hh;
                const ctx = canvas.getContext('2d');
                if (ctx) return { canvas: canvas, ctx: ctx };
            } catch (_e) { /* fall through */ }
        }
        return null;
    }

    function _imageNaturalSize(img) {
        if (!img) return null;
        const iw =
            img._spriteIw > 0 ? Number(img._spriteIw)
            : img.naturalWidth != null && img.naturalWidth > 0 ? Number(img.naturalWidth)
            : img.width != null ? Number(img.width) : 0;
        const ih =
            img._spriteIh > 0 ? Number(img._spriteIh)
            : img.naturalHeight != null && img.naturalHeight > 0 ? Number(img.naturalHeight)
            : img.height != null ? Number(img.height) : 0;
        if (!(iw > 0) || !(ih > 0)) return null;
        return { iw: iw | 0, ih: ih | 0 };
    }

    function buildSpriteOpaqueFoot(img) {
        const size = _imageNaturalSize(img);
        if (!size) return null;
        const iw = size.iw;
        const ih = size.ih;
        if (iw * ih > 512 * 512) return null;
        const alloc = _allocAuraCanvas(iw, ih);
        if (!alloc || typeof alloc.ctx.getImageData !== 'function') return null;
        const ctx = alloc.ctx;
        try {
            ctx.clearRect(0, 0, iw, ih);
            ctx.drawImage(img, 0, 0, iw, ih);
            const imageData = ctx.getImageData(0, 0, iw, ih);
            const src = imageData.data;
            let top = -1;
            let bottom = -1;
            for (let y = 0; y < ih; y++) {
                const row = y * iw * 4;
                for (let x = 0; x < iw; x++) {
                    if (src[row + x * 4 + 3] > OPAQUE_ALPHA_MIN) {
                        if (top < 0) top = y;
                        bottom = y;
                        break;
                    }
                }
            }
            if (bottom < 0 || top < 0) return null;
            const opaqueH = bottom - top + 1;
            const bandH = Math.max(1, Math.round(opaqueH * FOOT_BAND_FRAC));
            const y0 = bottom - bandH + 1;
            let sumX = 0;
            let count = 0;
            for (let y = y0; y <= bottom; y++) {
                const row = y * iw * 4;
                for (let x = 0; x < iw; x++) {
                    if (src[row + x * 4 + 3] > OPAQUE_ALPHA_MIN) {
                        sumX += x;
                        count += 1;
                    }
                }
            }
            const footCx = count > 0 ? sumX / count : iw / 2;
            return { iw: iw, ih: ih, top: top, bottom: bottom, footCx: footCx };
        } catch (_e) {
            return null;
        }
    }

    function getSpriteOpaqueFoot(img) {
        if (!img) return null;
        const key = _imageCacheId(img);
        if (_footCache.has(key)) return _footCache.get(key) || null;
        const built = buildSpriteOpaqueFoot(img);
        _footCache.set(key, built);
        return built;
    }

    function clearSpriteOpaqueFootCache() {
        _footCache.clear();
    }

    function buildRarityAuraSprite(img, tier) {
        const cfg = RARITY_AURA[tier];
        if (!cfg || !img) return null;
        const size = _imageNaturalSize(img);
        if (!size) return null;
        const iw = size.iw;
        const ih = size.ih;
        const radius = Math.max(1, Math.min(6, cfg.radius | 0));
        const pad = radius + 1;
        const cw = iw + pad * 2;
        const ch = ih + pad * 2;
        if (cw * ch > 512 * 512) return null;
        const alloc = _allocAuraCanvas(cw, ch);
        if (!alloc || typeof alloc.ctx.getImageData !== 'function') return null;
        const canvas = alloc.canvas;
        const ctx = alloc.ctx;
        try {
            ctx.clearRect(0, 0, cw, ch);
            ctx.drawImage(img, pad, pad, iw, ih);
            const imageData = ctx.getImageData(0, 0, cw, ch);
            const src = imageData.data;
            const n = cw * ch;
            const opaque = new Uint8Array(n);
            for (let i = 0, p = 3; i < n; i++, p += 4) {
                opaque[i] = src[p] > 24 ? 1 : 0;
            }
            const dil = new Uint8Array(n);
            const r2 = radius * radius;
            for (let y = 0; y < ch; y++) {
                for (let x = 0; x < cw; x++) {
                    const idx = y * cw + x;
                    if (!opaque[idx]) continue;
                    for (let dy = -radius; dy <= radius; dy++) {
                        const ny = y + dy;
                        if (ny < 0 || ny >= ch) continue;
                        const dy2 = dy * dy;
                        for (let dx = -radius; dx <= radius; dx++) {
                            if (dx * dx + dy2 > r2) continue;
                            const nx = x + dx;
                            if (nx < 0 || nx >= cw) continue;
                            dil[ny * cw + nx] = 1;
                        }
                    }
                }
            }
            const out = ctx.createImageData(cw, ch);
            const od = out.data;
            const cr = cfg.r;
            const cg = cfg.g;
            const cb = cfg.b;
            for (let i = 0, p = 0; i < n; i++, p += 4) {
                if (!dil[i] || opaque[i]) continue;
                od[p] = cr;
                od[p + 1] = cg;
                od[p + 2] = cb;
                od[p + 3] = 230;
            }
            ctx.putImageData(out, 0, 0);
        } catch (_e) {
            return null;
        }
        return { canvas: canvas, pad: pad, iw: iw, ih: ih, cw: cw, ch: ch };
    }

    function getRarityAuraSprite(img, tier) {
        if (!img || !RARITY_AURA[tier]) return null;
        const key = _imageCacheId(img) + '|' + tier;
        if (_auraCache.has(key)) return _auraCache.get(key) || null;
        const built = buildRarityAuraSprite(img, tier);
        _auraCache.set(key, built);
        return built;
    }

    function clearRarityAuraCache() {
        _auraCache.clear();
    }

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
        let cx = tilePxX + tw / 2;
        let cy = tilePxY + th - th * 0.1;

        const foot = img ? getSpriteOpaqueFoot(img) : null;
        if (foot && foot.ih > 0 && foot.iw > 0) {
            const scaledH = th * sLayout;
            const scaledW = foot.iw * (scaledH / foot.ih);
            const px = tilePxX + tw / 2 - scaledW / 2;
            const py = tilePxY + th - scaledH;
            cy = py + ((foot.bottom + 1) / foot.ih) * scaledH - th * 0.04;
            let localCx = foot.footCx;
            if (flipH) localCx = foot.iw - 1 - localCx;
            cx = px + ((localCx + 0.5) / foot.iw) * scaledW;
        }

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
        const baked = img ? getRarityAuraSprite(img, tier) : null;

        ctx.save();
        if (flipH) {
            const cx = dx0 + dw / 2;
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-cx, 0);
        }
        ctx.globalAlpha = alpha;
        ctx.shadowColor = cfg.color;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        if (baked && baked.canvas && typeof ctx.drawImage === 'function' && baked.iw > 0) {
            const sx = dw / baked.iw;
            const sy = dh / baked.ih;
            const adx = Math.floor((layout.px != null ? layout.px : layout.dx) - baked.pad * sx);
            const ady = Math.floor((layout.py != null ? layout.py : layout.dy) - baked.pad * sy);
            const adw = Math.max(1, Math.round(baked.cw * sx));
            const adh = Math.max(1, Math.round(baked.ch * sy));
            ctx.shadowBlur = Math.max(2, Math.round(4 * (layout.scale || 1)));
            ctx.drawImage(baked.canvas, adx, ady, adw, adh);
        } else if (img && typeof ctx.drawImage === 'function') {
            ctx.shadowBlur = Math.max(4, Math.round(8 * (layout.scale || 1)));
            ctx.drawImage(img, dx0, dy0, dw, dh);
        } else {
            ctx.strokeStyle = cfg.color;
            ctx.shadowBlur = Math.max(3, Math.round(5 * (layout.scale || 1)));
            ctx.lineWidth = cfg.radius || 2;
            ctx.strokeRect(dx0 - 1, dy0 - 1, dw + 2, dh + 2);
        }
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
        OPAQUE_ALPHA_MIN,
        FOOT_BAND_FRAC,
        RARITY_AURA,
        RARITY_TIER_RANK,
        stepBobOffsetPx,
        beginHitFeedback,
        hitFlashStrength,
        getHitRecoilOffset,
        buildSpriteOpaqueFoot,
        getSpriteOpaqueFoot,
        clearSpriteOpaqueFootCache,
        drawEntityShadow,
        drawSpriteHitFlash,
        resolveEntityRarityTier,
        buildRarityAuraSprite,
        getRarityAuraSprite,
        clearRarityAuraCache,
        drawEntityRarityAura
    };
});
