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

    function spritePath(genre, kind, id, variant) {
        const stem = idToFileStem(id);
        if (!stem) return null;
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
        for (let i = 0; i < variants.length; i++) {
            const url = spritePath(o.genre, o.kind, o.id, variants[i]);
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
        resolveItemSpriteUrl
    };
});

