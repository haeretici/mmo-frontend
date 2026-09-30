'use strict';

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineSprites = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const SPRITE_VARIANTS = Object.freeze(['icon', 'small', 'medium', 'original', 'alpha', 'retro']);
    const DEFAULT_ENTITY_VARIANT = 'small';
    const DEFAULT_TILE_VARIANT = 'icon';
    const cache = new Map();
    const failed = new Set();
    const sizeCache = typeof WeakMap === 'function' ? new WeakMap() : null;

    function idToFileStem(id) {
        return String(id || '')
            .trim()
            .replace(/\.png$/i, '')
            .split(/[_\s-]+/)
            .filter(Boolean)
            .map(function (part) {
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            })
            .join('_');
    }

    function normalizeVariant(variant, fallback) {
        const v = String(variant || fallback || DEFAULT_TILE_VARIANT).toLowerCase();
        if (SPRITE_VARIANTS.indexOf(v) >= 0) return v;
        return fallback || DEFAULT_TILE_VARIANT;
    }

    function spritePath(genre, kind, id, variant, frame) {
        let stem = idToFileStem(id);
        if (!stem) return null;
        const fi = frame | 0;
        if (fi > 0) stem = stem + '_' + fi;
        const g = String(genre || 'rpg_fantasy').replace(/[^a-z0-9_]/gi, '');
        const k = String(kind || 'tiles');
        const folder =
            k === 'objects' || k === 'overlays' || k === 'creatures' || k === 'equipment' || k === 'ui'
                ? k
                : 'tiles';
        return '/sprites/' + g + '/' + folder + '/' + normalizeVariant(variant, DEFAULT_TILE_VARIANT) + '/' + stem + '.png';
    }

    function spriteUrlCandidates(opts) {
        const o = opts || {};
        const requested = normalizeVariant(o.variant, o.kind === 'creatures' ? DEFAULT_ENTITY_VARIANT : DEFAULT_TILE_VARIANT);
        const variants = [requested];
        if (requested !== 'icon') variants.push('icon');
        if (requested !== 'original') variants.push('original');
        const urls = [];
        const seen = Object.create(null);
        const frame = o.frame | 0;
        for (let i = 0; i < variants.length; i++) {
            const url = spritePath(o.genre, o.kind, o.id, variants[i], frame);
            if (!url || seen[url]) continue;
            seen[url] = true;
            urls.push(url);
        }
        return urls;
    }

    function isReady(img) {
        return !!(img && (img.complete || img.naturalWidth) && img.naturalWidth > 0);
    }

    function prefetch(opts) {
        if (typeof Image === 'undefined') return null;
        const urls = spriteUrlCandidates(opts);
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            if (failed.has(url)) continue;
            if (cache.has(url)) return url;
            const img = new Image();
            img.decoding = 'async';
            img.onload = function () { cache.set(url, img); };
            img.onerror = function () {
                failed.add(url);
                cache.delete(url);
            };
            cache.set(url, img);
            img.src = url;
            return url;
        }
        return null;
    }

    function loadState(opts) {
        const urls = spriteUrlCandidates(opts);
        if (!urls.length) return 'failed';
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            if (failed.has(url)) continue;
            const img = cache.get(url);
            if (isReady(img)) return 'ready';
            if (!img) prefetch(opts);
            return 'pending';
        }
        return 'failed';
    }

    function getReady(opts) {
        if (loadState(opts) !== 'ready') return null;
        const urls = spriteUrlCandidates(opts);
        for (let i = 0; i < urls.length; i++) {
            const img = cache.get(urls[i]);
            if (isReady(img)) return img;
        }
        return null;
    }

    /**
     * Natural size, cached on the drawable (and a WeakMap) so draw loops
     * do not re-probe naturalWidth/Height every frame.
     * @param {object|null|undefined} img
     * @returns {{ iw: number, ih: number }|null}
     */
    function getCachedImageSize(img) {
        if (!img) return null;
        if (img._spriteIw > 0 && img._spriteIh > 0) {
            return { iw: img._spriteIw, ih: img._spriteIh };
        }
        if (sizeCache && sizeCache.has(img)) return sizeCache.get(img);
        const iw =
            img.naturalWidth != null && img.naturalWidth > 0
                ? img.naturalWidth
                : (img.width || 0);
        const ih =
            img.naturalHeight != null && img.naturalHeight > 0
                ? img.naturalHeight
                : (img.height || 0);
        if (!(iw > 0 && ih > 0)) return null;
        const size = { iw: iw, ih: ih };
        img._spriteIw = iw;
        img._spriteIh = ih;
        if (sizeCache) sizeCache.set(img, size);
        return size;
    }

    /**
     * Watch-mode art for a vocation id.
     * Same priority as dungeon-engine resolvePlayerSpriteArt for the class half:
     * class baseSprite (and optional baseSpriteGenre) when the id is a class that has one.
     * Creature catalog looks and vocations without a base sprite pass through unchanged.
     *
     * @param {string} lookOrVocation
     * @param {Array<{id?: string, baseSprite?: string, baseSpriteGenre?: string}>|{classes?: Array}|null|undefined} classes
     * @returns {{ id: string, genre: string|null }}
     */
    function resolveVocationSprite(lookOrVocation, classes) {
        const id = String(lookOrVocation || '').trim();
        if (!id) return { id: '', genre: null };
        const list = Array.isArray(classes)
            ? classes
            : (classes && Array.isArray(classes.classes) ? classes.classes : []);
        const lower = id.toLowerCase();
        let row = null;
        for (let i = 0; i < list.length; i++) {
            const candidate = list[i];
            if (!candidate || candidate.id == null) continue;
            const rid = String(candidate.id);
            if (rid === id) {
                row = candidate;
                break;
            }
            if (!row && rid.toLowerCase() === lower) row = candidate;
        }
        if (!row) return { id: id, genre: null };
        const base = row.baseSprite != null ? String(row.baseSprite).trim() : '';
        if (!base) return { id: id, genre: null };
        const genre = row.baseSpriteGenre != null ? String(row.baseSpriteGenre).trim() : '';
        return { id: base, genre: genre || null };
    }

    /**
     * Sprite ids to try for one entity, first match wins once it loads.
     * Players remap a vocation id to that class baseSprite so the stem is a
     * creature catalog id. Creatures and NPCs keep look as the catalog id.
     *
     * @param {object|null|undefined} ent
     * @param {{ classes?: Array|object|null, genre?: string, player?: boolean }} [opts]
     * @returns {Array<{ id: string, genre: string }>}
     */
    function entitySpriteCandidates(ent, opts) {
        const o = opts || {};
        const e = ent && typeof ent === 'object' ? ent : {};
        const player = o.player != null ? !!o.player : !(e.creature || e.npc);
        const genre = o.genre ? String(o.genre) : 'rpg_fantasy';
        const out = [];
        const seen = Object.create(null);
        function push(id, artGenre) {
            const stem = id == null ? '' : String(id).trim();
            if (!stem) return;
            const g = artGenre || genre;
            const key = g + '\0' + stem;
            if (seen[key]) return;
            seen[key] = true;
            out.push({ id: stem, genre: g });
        }
        function pushLook(id) {
            if (!player) {
                push(id, genre);
                return;
            }
            const art = resolveVocationSprite(id, o.classes);
            if (art && art.id && art.id !== String(id == null ? '' : id).trim()) {
                push(art.id, art.genre || genre);
                return;
            }
            push(id, genre);
        }
        if (e.look) pushLook(e.look);
        if (e.vocation) pushLook(e.vocation);
        if (player) push('adventurer', genre);
        return out;
    }

    function resolveItemSpriteUrl(itemOrId, genre) {
        if (!itemOrId) return null;
        let id = '';
        if (typeof itemOrId === 'string') {
            id = itemOrId;
        } else if (typeof itemOrId === 'object') {
            if (itemOrId.sprites && itemOrId.sprites.alpha) return itemOrId.sprites.alpha;
            if (itemOrId.sprite && typeof itemOrId.sprite === 'string') return itemOrId.sprite;
            id = itemOrId.customSprite || itemOrId.spriteId || itemOrId.id || itemOrId.itemId || '';
        }
        if (!id) return null;
        const stem = idToFileStem(id);
        if (!stem) return null;
        const g = String(genre || 'rpg_fantasy').replace(/[^a-z0-9_]/gi, '') || 'rpg_fantasy';
        return '/sprites/' + g + '/equipment/alpha/' + stem + '.png';
    }

    return {
        SPRITE_VARIANTS,
        DEFAULT_ENTITY_VARIANT,
        DEFAULT_TILE_VARIANT,
        idToFileStem,
        spritePath,
        spriteUrlCandidates,
        prefetch,
        loadState,
        getReady,
        getCachedImageSize,
        resolveVocationSprite,
        entitySpriteCandidates,
        resolveItemSpriteUrl
    };
});

