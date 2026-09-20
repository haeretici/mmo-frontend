'use strict';

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineGroundRenderer = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const MAX_GROUND_RENDER = 10;
    const DEFAULT_TILE_SIZE = 32;

    const FIELD_KINDS = Object.freeze({
        FIRE: 'fire',
        POISON: 'poison',
        ENERGY: 'energy',
        BARRIER: 'barrier',
        VINE: 'vine'
    });

    const FIELD_DURATIONS = Object.freeze({
        fire: { stage1: 200, stage2: 348, total: 446 },
        poison: { total: 248 },
        energy: { total: 98 },
        barrier: { total: 20 },
        vine: { total: 30 }
    });

    const FIELD_COLORS = Object.freeze({
        fire: {
            stage1: { fill: 'rgba(220, 80, 40, 0.55)', stroke: 'rgba(180, 40, 10, 0.7)' },
            stage2: { fill: 'rgba(220, 100, 30, 0.42)', stroke: 'rgba(180, 40, 10, 0.7)' },
            stage3: { fill: 'rgba(200, 120, 40, 0.28)', stroke: 'rgba(180, 40, 10, 0.7)' },
            expired: { fill: 'rgba(120, 80, 60, 0.15)', stroke: 'rgba(120, 80, 60, 0.3)' }
        },
        poison: { fill: 'rgba(80, 180, 70, 0.5)', stroke: 'rgba(40, 120, 40, 0.7)' },
        energy: { fill: 'rgba(90, 140, 255, 0.5)', stroke: 'rgba(40, 80, 200, 0.7)' },
        barrier: {
            fill: 'rgba(120, 160, 255, 0.55)',
            stroke: 'rgba(80, 120, 220, 0.85)',
            hatch: 'rgba(200, 220, 255, 0.45)'
        },
        vine: {
            fill: 'rgba(40, 140, 60, 0.55)',
            stroke: 'rgba(20, 90, 40, 0.85)',
            hatch: 'rgba(160, 220, 160, 0.4)'
        }
    });

    const PIN_SPRITE_MAPPINGS = Object.freeze({
        chest: {
            kinds: ['equipment', 'objects'],
            ids: ['chest', 'treasure_chest_item', 'treasure_chest_ornamented', 'village_crate']
        },
        door: {
            kinds: ['objects', 'tiles'],
            ids: ['sturdy_wooden_door', 'ancient_wooden_door', 'simple_iron_door', 'castle_iron_door', 'enchanted_gate_door']
        },
        lever: {
            kinds: ['objects', 'tiles'],
            ids: ['village_torch_stand', 'switch', 'lever']
        },
        switch: {
            kinds: ['objects', 'tiles'],
            ids: ['switch', 'village_torch_stand', 'lever']
        },
        teleport: {
            kinds: ['objects', 'tiles'],
            ids: ['simple_trapdoor', 'village_trapdoor', 'abandoned_hatch', 'sturdy_hatch']
        },
        container: {
            kinds: ['equipment', 'objects'],
            ids: ['chest', 'village_crate', 'village_barrel', 'bag', 'backpack']
        },
        harvest: {
            kinds: ['objects', 'tiles'],
            ids: ['village_ore_vein', 'simple_dead_tree', 'enchanted_willow_tree']
        },
        trap: {
            kinds: ['objects', 'tiles'],
            ids: ['simple_trapdoor', 'village_trapdoor']
        }
    });

    const CORPSE_CANDIDATE_IDS = Object.freeze([
        'monster_corpse', 'corpse', 'bag', 'backpack', 'chest', 'village_crate'
    ]);

    function slugify(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .replace(/['’]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function normalizeFieldKind(raw) {
        if (!raw) return FIELD_KINDS.FIRE;
        const s = String(raw).trim().toLowerCase();
        if (s === 'fire' || s.startsWith('fire') || s.includes('flame')) return FIELD_KINDS.FIRE;
        if (s === 'poison' || s.startsWith('poison') || s === 'earth' || s.startsWith('earth')) return FIELD_KINDS.POISON;
        if (s === 'energy' || s.startsWith('energy') || s.startsWith('electric')) return FIELD_KINDS.ENERGY;
        if (s === 'barrier' || s.startsWith('barrier') || s === 'magic_wall' || s.includes('magicwall')) return FIELD_KINDS.BARRIER;
        if (s === 'vine' || s.startsWith('vine') || s === 'wild_growth' || s.includes('wildgrowth')) return FIELD_KINDS.VINE;
        return FIELD_KINDS.FIRE;
    }

    function resolveFieldState(field, nowSec) {
        const rawKind = field && (field.kind || field.fieldKind);
        const kind = normalizeFieldKind(rawKind);
        const isObstacle = kind === 'barrier' || kind === 'vine' || !!(field && ((field.flags & 1) || field.isObstacle));
        const t = Number.isFinite(nowSec)
            ? Number(nowSec)
            : (typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now() / 1000
                : Date.now() / 1000);

        let stage = 1;
        let fill = '';
        let stroke = '';
        let hatch = null;
        let alphaMul = 1;

        if (kind === 'fire') {
            const rawCreated = field && field.createdAt ? Number(field.createdAt) : 0;
            const createdAtSec = rawCreated > 1e11 ? rawCreated / 1000 : rawCreated;
            const elapsed = createdAtSec > 0 ? Math.max(0, t - createdAtSec) : 0;
            if (elapsed < FIELD_DURATIONS.fire.stage1) {
                stage = 1;
                fill = FIELD_COLORS.fire.stage1.fill;
                stroke = FIELD_COLORS.fire.stage1.stroke;
            } else if (elapsed < FIELD_DURATIONS.fire.stage2) {
                stage = 2;
                fill = FIELD_COLORS.fire.stage2.fill;
                stroke = FIELD_COLORS.fire.stage2.stroke;
            } else if (elapsed < FIELD_DURATIONS.fire.total) {
                stage = 3;
                fill = FIELD_COLORS.fire.stage3.fill;
                stroke = FIELD_COLORS.fire.stage3.stroke;
            } else {
                stage = 4;
                fill = FIELD_COLORS.fire.expired.fill;
                stroke = FIELD_COLORS.fire.expired.stroke;
            }
            alphaMul = 0.95 + 0.05 * Math.sin(t * 12);
        } else if (kind === 'poison') {
            fill = FIELD_COLORS.poison.fill;
            stroke = FIELD_COLORS.poison.stroke;
            alphaMul = 0.92 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2));
        } else if (kind === 'energy') {
            fill = FIELD_COLORS.energy.fill;
            stroke = FIELD_COLORS.energy.stroke;
            alphaMul = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * 8));
        } else if (kind === 'barrier') {
            fill = FIELD_COLORS.barrier.fill;
            stroke = FIELD_COLORS.barrier.stroke;
            hatch = FIELD_COLORS.barrier.hatch;
            alphaMul = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * Math.PI * 1.1));
        } else if (kind === 'vine') {
            fill = FIELD_COLORS.vine.fill;
            stroke = FIELD_COLORS.vine.stroke;
            hatch = FIELD_COLORS.vine.hatch;
            alphaMul = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * Math.PI * 1.1));
        }

        return {
            kind: kind,
            stage: stage,
            isObstacle: isObstacle,
            fill: fill,
            stroke: stroke,
            hatch: hatch,
            alphaMul: alphaMul
        };
    }

    function drawField(ctx, field, tilePx, tilePy, tw, th, nowSec) {
        if (!ctx || !field) return;
        const w = tw || DEFAULT_TILE_SIZE;
        const h = th || DEFAULT_TILE_SIZE;
        const state = resolveFieldState(field, nowSec);

        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * state.alphaMul;

        const inset = Math.max(1, Math.floor(w * 0.08));
        const fx = tilePx + inset;
        const fy = tilePy + inset;
        const fw = w - inset * 2;
        const fh = h - inset * 2;

        ctx.fillStyle = state.fill;
        ctx.fillRect(fx, fy, fw, fh);

        ctx.strokeStyle = state.stroke;
        ctx.lineWidth = Math.max(1, Math.floor(w / 16));
        ctx.strokeRect(fx, fy, fw, fh);

        if (state.hatch) {
            const pad = inset + Math.max(2, Math.floor(w * 0.12));
            ctx.strokeStyle = state.hatch;
            ctx.lineWidth = Math.max(1, Math.floor(w / 16));
            ctx.beginPath();
            ctx.moveTo(tilePx + pad, tilePy + pad);
            ctx.lineTo(tilePx + w - pad, tilePy + h - pad);
            ctx.moveTo(tilePx + w - pad, tilePy + pad);
            ctx.lineTo(tilePx + pad, tilePy + h - pad);
            ctx.stroke();
        } else if (state.kind === 'energy') {
            const pad = inset + Math.floor(w * 0.2);
            ctx.strokeStyle = 'rgba(210, 235, 255, 0.65)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tilePx + pad, tilePy + h / 2);
            ctx.lineTo(tilePx + w / 2, tilePy + pad);
            ctx.lineTo(tilePx + w - pad, tilePy + h / 2);
            ctx.lineTo(tilePx + w / 2, tilePy + h - pad);
            ctx.closePath();
            ctx.stroke();
        }

        ctx.globalAlpha = prevAlpha;
    }

    function resolveCorpseImage(corpse, opts) {
        const sprites = (opts && opts.sprites) || (typeof EngineSprites !== 'undefined' ? EngineSprites : null);
        if (!sprites || typeof sprites.prefetch !== 'function') return null;

        const genre = (opts && opts.genre) || 'rpg_fantasy';
        const cname = corpse && corpse.name ? slugify(corpse.name) : '';
        const ids = [];
        if (cname) {
            ids.push('corpse_' + cname);
            ids.push(cname + '_corpse');
            ids.push(cname);
        }
        for (let i = 0; i < CORPSE_CANDIDATE_IDS.length; i++) {
            ids.push(CORPSE_CANDIDATE_IDS[i]);
        }

        const kinds = ['equipment', 'objects', 'creatures'];
        for (let ki = 0; ki < kinds.length; ki++) {
            const k = kinds[ki];
            for (let ii = 0; ii < ids.length; ii++) {
                const opt = {
                    genre: genre,
                    kind: k,
                    id: ids[ii],
                    variant: 'icon'
                };
                sprites.prefetch(opt);
                const img = sprites.getReady(opt);
                if (img) return img;
            }
        }
        return null;
    }

    function drawCorpse(ctx, corpse, tilePx, tilePy, tw, th, opts) {
        if (!ctx || !corpse) return;
        const w = tw || DEFAULT_TILE_SIZE;
        const h = th || DEFAULT_TILE_SIZE;
        const drawHelper = (opts && opts.draw) || (typeof EngineTileDraw !== 'undefined' ? EngineTileDraw : null);

        const img = resolveCorpseImage(corpse, opts);
        if (img) {
            const iw = img.naturalWidth || img.width || w;
            const ih = img.naturalHeight || img.height || h;
            if (drawHelper && typeof drawHelper.resolveTileDrawBox === 'function') {
                const box = drawHelper.resolveTileDrawBox(tilePx, tilePy, w, h, iw, ih, 0.85, 'bottom_center');
                try {
                    ctx.drawImage(img, box.dx, box.dy, box.dw, box.dh);
                    return;
                } catch (e) { /* fallback */ }
            } else {
                try {
                    ctx.drawImage(img, tilePx + 2, tilePy + 2, w - 4, h - 4);
                    return;
                } catch (e) { /* fallback */ }
            }
        }

        const cx = tilePx + Math.floor(w * 0.15);
        const cy = tilePy + Math.floor(h * 0.2);
        const cw = Math.floor(w * 0.7);
        const ch = Math.floor(h * 0.65);

        ctx.save();
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = '#3d2614';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);

        ctx.fillStyle = '#9c6644';
        ctx.fillRect(cx + Math.floor(cw * 0.25), cy, Math.max(2, Math.floor(cw * 0.15)), ch);
        ctx.fillRect(cx + Math.floor(cw * 0.6), cy, Math.max(2, Math.floor(cw * 0.15)), ch);

        ctx.fillStyle = '#d4af37';
        ctx.fillRect(cx + Math.floor(cw / 2) - 2, cy + Math.floor(ch / 2) - 2, 4, 4);
        ctx.restore();
    }

    function resolvePinImage(pin, opts) {
        const sprites = (opts && opts.sprites) || (typeof EngineSprites !== 'undefined' ? EngineSprites : null);
        if (!sprites || typeof sprites.prefetch !== 'function') return null;

        const genre = (opts && opts.genre) || 'rpg_fantasy';
        const kind = pin && pin.kind ? slugify(pin.kind) : 'container';
        const mapping = PIN_SPRITE_MAPPINGS[kind] || PIN_SPRITE_MAPPINGS.container;

        const ids = [];
        if (pin && pin.catalogId) {
            ids.push(pin.catalogId);
            ids.push(slugify(pin.catalogId));
        }
        for (let i = 0; i < mapping.ids.length; i++) {
            if (ids.indexOf(mapping.ids[i]) < 0) ids.push(mapping.ids[i]);
        }

        const kinds = mapping.kinds.slice();
        for (let ki = 0; ki < kinds.length; ki++) {
            const k = kinds[ki];
            for (let ii = 0; ii < ids.length; ii++) {
                const opt = {
                    genre: genre,
                    kind: k,
                    id: ids[ii],
                    variant: 'icon'
                };
                sprites.prefetch(opt);
                const img = sprites.getReady(opt);
                if (img) return img;
            }
        }
        return null;
    }

    function drawWorldPin(ctx, pin, tilePx, tilePy, tw, th, opts) {
        if (!ctx || !pin) return;
        const w = tw || DEFAULT_TILE_SIZE;
        const h = th || DEFAULT_TILE_SIZE;
        const drawHelper = (opts && opts.draw) || (typeof EngineTileDraw !== 'undefined' ? EngineTileDraw : null);

        const img = resolvePinImage(pin, opts);
        if (img) {
            const iw = img.naturalWidth || img.width || w;
            const ih = img.naturalHeight || img.height || h;
            if (drawHelper && typeof drawHelper.resolveTileDrawBox === 'function') {
                const box = drawHelper.resolveTileDrawBox(tilePx, tilePy, w, h, iw, ih, 0.9, 'bottom_center');
                try {
                    ctx.drawImage(img, box.dx, box.dy, box.dw, box.dh);
                    return;
                } catch (e) { /* fallback */ }
            } else {
                try {
                    ctx.drawImage(img, tilePx + 2, tilePy + 2, w - 4, h - 4);
                    return;
                } catch (e) { /* fallback */ }
            }
        }

        const k = pin.kind ? slugify(pin.kind) : 'container';
        ctx.save();
        if (k === 'chest') {
            const cx = tilePx + Math.floor(w * 0.15);
            const cy = tilePy + Math.floor(h * 0.25);
            const cw = Math.floor(w * 0.7);
            const ch = Math.floor(h * 0.55);
            ctx.fillStyle = '#b45309';
            ctx.fillRect(cx, cy, cw, ch);
            ctx.fillStyle = '#d97706';
            ctx.fillRect(cx, cy, cw, Math.floor(ch * 0.4));
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(cx + Math.floor(cw / 2) - 2, cy + Math.floor(ch * 0.35), 4, 4);
        } else if (k === 'door') {
            const dx = tilePx + Math.floor(w * 0.2);
            const dy = tilePy + Math.floor(h * 0.1);
            const dw = Math.floor(w * 0.6);
            const dh = Math.floor(h * 0.8);
            ctx.fillStyle = '#854d0e';
            ctx.fillRect(dx, dy, dw, dh);
            ctx.strokeStyle = '#422006';
            ctx.lineWidth = 2;
            ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(dx + dw - 4, dy + dh / 2, 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (k === 'lever' || k === 'switch') {
            const lx = tilePx + Math.floor(w * 0.3);
            const ly = tilePy + Math.floor(h * 0.3);
            const lw = Math.floor(w * 0.4);
            const lh = Math.floor(h * 0.4);
            ctx.fillStyle = '#475569';
            ctx.fillRect(lx, ly + lh - 4, lw, 4);
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lx + lw / 2, ly + lh - 4);
            ctx.lineTo(lx + lw / 2 + 5, ly + 2);
            ctx.stroke();
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(lx + lw / 2 + 5, ly + 2, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (k === 'teleport') {
            const cx = tilePx + w / 2;
            const cy = tilePy + h / 2;
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, Math.floor(w * 0.35), 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
            ctx.fill();
        } else {
            const sx = tilePx + 6;
            const sy = tilePy + 6;
            const sw = w - 12;
            const sh = h - 12;
            ctx.fillStyle = '#8fde5d';
            ctx.fillRect(sx, sy, sw, sh);
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
        }
        ctx.restore();
    }

    function resolveItemImage(itemId, opts) {
        const sprites = (opts && opts.sprites) || (typeof EngineSprites !== 'undefined' ? EngineSprites : null);
        if (!sprites || typeof sprites.prefetch !== 'function' || !itemId) return null;
        const genre = (opts && opts.genre) || 'rpg_fantasy';
        const stem = slugify(itemId);
        const kinds = ['equipment', 'objects'];
        for (let ki = 0; ki < kinds.length; ki++) {
            const opt = {
                genre: genre,
                kind: kinds[ki],
                id: stem,
                variant: 'icon'
            };
            sprites.prefetch(opt);
            const img = sprites.getReady(opt);
            if (img) return img;
        }
        return null;
    }

    function drawGroundItemStack(ctx, items, tilePx, tilePy, tw, th, opts) {
        if (!ctx || !Array.isArray(items) || !items.length) return;
        const w = tw || DEFAULT_TILE_SIZE;
        const h = th || DEFAULT_TILE_SIZE;
        const count = Math.min(items.length, MAX_GROUND_RENDER);
        const step = Math.max(1, Math.floor(w / 10));

        for (let i = 0; i < count; i++) {
            const item = items[i];
            if (!item) continue;
            const id = item.catalogId || item.itemId || item.id || '';
            const px = tilePx + i * step;
            const py = tilePy + i * step;

            const img = resolveItemImage(id, opts);
            let drawn = false;
            if (img) {
                const scale = 0.75;
                const dw = Math.round(w * scale);
                const dh = Math.round(h * scale);
                const dx = px + Math.floor((w - dw) / 2);
                const dy = py + Math.floor((h - dh) / 2);
                try {
                    ctx.drawImage(img, dx, dy, dw, dh);
                    drawn = true;
                } catch (e) { drawn = false; }
            }

            if (!drawn) {
                const pad = Math.max(2, Math.floor(w * 0.25));
                ctx.save();
                ctx.fillStyle = '#c4b5fd';
                ctx.fillRect(px + pad, py + pad, w - pad * 2, h - pad * 2);
                ctx.strokeStyle = '#7c3aed';
                ctx.lineWidth = 1;
                ctx.strokeRect(px + pad + 0.5, py + pad + 0.5, w - pad * 2 - 1, h - pad * 2 - 1);
                ctx.restore();
            }

            if (item.count > 1 && (i === count - 1 || count === 1)) {
                ctx.save();
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                const countStr = String(item.count);
                const cx = px + w - 2;
                const cy = py + h - 2;
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.strokeText(countStr, cx, cy);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(countStr, cx, cy);
                ctx.restore();
            }
        }
    }

    function render(ctx, opts) {
        if (!ctx || !opts) return;
        const tw = opts.tw || opts.TS || DEFAULT_TILE_SIZE;
        const th = opts.th || opts.TS || DEFAULT_TILE_SIZE;
        const camX = opts.camX != null ? Number(opts.camX) : 0;
        const camY = opts.camY != null ? Number(opts.camY) : 0;
        const floorZ = opts.floorZ != null ? (opts.floorZ | 0) : 0;
        const nowSec = opts.nowSec != null && Number.isFinite(opts.nowSec)
            ? Number(opts.nowSec)
            : (typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now() / 1000
                : Date.now() / 1000);

        // 1. Elemental Fields
        const fields = opts.fields;
        if (fields) {
            const fieldList = Array.isArray(fields) ? fields : Array.from(fields.values());
            for (let i = 0; i < fieldList.length; i++) {
                const f = fieldList[i];
                if (!f || (f.z | 0) !== floorZ) continue;
                const px = (f.x - camX) * tw;
                const py = (f.y - camY) * th;
                drawField(ctx, f, px, py, tw, th, nowSec);
            }
        }

        // 2. Corpses
        const corpses = opts.corpses;
        if (corpses) {
            const corpseList = Array.isArray(corpses) ? corpses : Array.from(corpses.values());
            for (let i = 0; i < corpseList.length; i++) {
                const c = corpseList[i];
                if (!c || (c.z | 0) !== floorZ) continue;
                const px = (c.x - camX) * tw;
                const py = (c.y - camY) * th;
                drawCorpse(ctx, c, px, py, tw, th, opts);
            }
        }

        // 3. Ground Items
        const groundItems = opts.groundItems;
        if (groundItems) {
            const itemsList = Array.isArray(groundItems) ? groundItems : Array.from(groundItems.values());
            for (let i = 0; i < itemsList.length; i++) {
                const entry = itemsList[i];
                if (!entry || (entry.z | 0) !== floorZ) continue;
                const px = (entry.x - camX) * tw;
                const py = (entry.y - camY) * th;
                const stack = Array.isArray(entry.items) ? entry.items : (Array.isArray(entry) ? entry : [entry]);
                drawGroundItemStack(ctx, stack, px, py, tw, th, opts);
            }
        }

        // 4. World Pins
        const worldPins = opts.worldPins;
        if (worldPins) {
            const pinList = Array.isArray(worldPins) ? worldPins : Array.from(worldPins.values());
            for (let i = 0; i < pinList.length; i++) {
                const pin = pinList[i];
                if (!pin || (pin.z | 0) !== floorZ) continue;
                const px = (pin.x - camX) * tw;
                const py = (pin.y - camY) * th;
                drawWorldPin(ctx, pin, px, py, tw, th, opts);
            }
        }
    }

    return {
        MAX_GROUND_RENDER: MAX_GROUND_RENDER,
        DEFAULT_TILE_SIZE: DEFAULT_TILE_SIZE,
        FIELD_KINDS: FIELD_KINDS,
        FIELD_DURATIONS: FIELD_DURATIONS,
        FIELD_COLORS: FIELD_COLORS,
        PIN_SPRITE_MAPPINGS: PIN_SPRITE_MAPPINGS,
        CORPSE_CANDIDATE_IDS: CORPSE_CANDIDATE_IDS,
        slugify: slugify,
        normalizeFieldKind: normalizeFieldKind,
        resolveFieldState: resolveFieldState,
        drawField: drawField,
        resolveCorpseImage: resolveCorpseImage,
        drawCorpse: drawCorpse,
        resolvePinImage: resolvePinImage,
        drawWorldPin: drawWorldPin,
        resolveItemImage: resolveItemImage,
        drawGroundItemStack: drawGroundItemStack,
        render: render
    };
});
