'use strict';

/**
 * NPC Shop UI helpers (Parity with dungeon-engine).
 * Supports deal amount stepping (Shift ±10, Ctrl ±100, Shift+Ctrl ±1000),
 * row filtering by name/id, item affordance checks, and deal count clamping.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineNpcShopUi = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const SHOP_AMOUNT_STEP = 1;
    const SHOP_AMOUNT_STEP_SHIFT = 10;
    const SHOP_AMOUNT_STEP_CTRL = 100;
    const SHOP_AMOUNT_STEP_SHIFT_CTRL = 1000;
    const MAX_DEAL_COUNT = 100;

    /**
     * @param {{ shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, shift?: boolean, ctrl?: boolean }|null|undefined} ev
     * @returns {number}
     */
    function shopAmountStep(ev) {
        const shift = !!(ev && (ev.shiftKey || ev.shift));
        const ctrl = !!(ev && (ev.ctrlKey || ev.metaKey || ev.ctrl));
        if (shift && ctrl) return SHOP_AMOUNT_STEP_SHIFT_CTRL;
        if (ctrl) return SHOP_AMOUNT_STEP_CTRL;
        if (shift) return SHOP_AMOUNT_STEP_SHIFT;
        return SHOP_AMOUNT_STEP;
    }

    /**
     * @param {*} n
     * @param {number} [min]
     * @param {number} [max]
     * @returns {number}
     */
    function clampShopAmount(n, min, max) {
        const lo = Math.max(1, Math.floor(Number(min) || 1));
        const hi = Math.max(lo, Math.floor(Number(max) || lo));
        const v = Math.floor(Number(n));
        if (!Number.isFinite(v)) return lo;
        if (v < lo) return lo;
        if (v > hi) return hi;
        return v;
    }

    /**
     * @param {*} current
     * @param {number} direction +1 or -1
     * @param {object|null|undefined} ev
     * @param {number} [min]
     * @param {number} [max]
     * @returns {number}
     */
    function applyShopAmountDelta(current, direction, ev, min, max) {
        const dir = direction < 0 ? -1 : 1;
        const base = Number(current);
        const from = Number.isFinite(base) ? base : 1;
        return clampShopAmount(from + dir * shopAmountStep(ev), min, max);
    }

    /**
     * Buy defaults to 1; sell defaults to the full sellable stack.
     * @param {'buy'|'sell'|string|null|undefined} side
     * @param {number} max
     * @returns {number}
     */
    function defaultShopAmount(side, max) {
        const cap = Math.max(1, Math.floor(Number(max) || 1));
        if (side === 'sell') return cap;
        return 1;
    }

    /**
     * Resolve item label for display/filtering.
     * @param {string} itemId
     * @param {Function|object|null|undefined} [itemDbOrLabelFn]
     * @returns {string}
     */
    function shopItemLabel(itemId, itemDbOrLabelFn) {
        const id = itemId != null ? String(itemId) : '';
        if (!id) return '';
        if (typeof itemDbOrLabelFn === 'function') {
            const res = itemDbOrLabelFn(id);
            if (res != null && String(res).trim()) return String(res).trim();
        } else if (itemDbOrLabelFn && typeof itemDbOrLabelFn.get === 'function') {
            const meta = itemDbOrLabelFn.get(id);
            if (meta && (meta.label || meta.name)) return String(meta.label || meta.name);
        } else if (itemDbOrLabelFn && typeof itemDbOrLabelFn === 'object') {
            const item = itemDbOrLabelFn[id];
            if (item && (item.label || item.name)) return String(item.label || item.name);
        }
        return id.replace(/_/g, ' ');
    }

    /**
     * Case-insensitive substring search on item label or id.
     * @param {object[]} rows
     * @param {string|null|undefined} query
     * @param {Function|object|null|undefined} [itemDbOrLabelFn]
     * @returns {object[]}
     */
    function filterShopRowsByName(rows, query, itemDbOrLabelFn) {
        const list = Array.isArray(rows) ? rows : [];
        const q = query != null ? String(query).trim().toLowerCase() : '';
        if (!q) return list.slice();
        const out = [];
        for (let i = 0; i < list.length; i++) {
            const row = list[i];
            if (!row) continue;
            const id = row.itemId != null ? String(row.itemId).toLowerCase() : '';
            const label = shopItemLabel(row.itemId, itemDbOrLabelFn).toLowerCase();
            if (id.indexOf(q) >= 0 || label.indexOf(q) >= 0) out.push(row);
        }
        return out;
    }

    /**
     * Helper to get count of item from count function or player object.
     * @param {Function|object|null|undefined} counter
     * @param {string} itemId
     * @returns {number}
     */
    function resolveItemCount(counter, itemId) {
        if (!itemId) return 0;
        if (typeof counter === 'function') return counter(itemId) | 0;
        if (counter && typeof counter.countItem === 'function') return counter.countItem(itemId) | 0;
        if (counter && typeof counter.countPlayerItem === 'function') return counter.countPlayerItem(itemId) | 0;
        if (counter && typeof counter === 'object') {
            if (counter.inventory) return resolveItemCount(counter.inventory, itemId);
            let total = 0;
            if (Array.isArray(counter.slots)) {
                for (let i = 0; i < counter.slots.length; i++) {
                    const s = counter.slots[i];
                    if (s && s.id === itemId) total += (s.count | 0) > 0 ? (s.count | 0) : 1;
                }
            }
            if (counter.openBags) {
                const bags = typeof counter.openBags.values === 'function'
                    ? Array.from(counter.openBags.values())
                    : (Array.isArray(counter.openBags) ? counter.openBags : Object.values(counter.openBags));
                for (let i = 0; i < bags.length; i++) {
                    const ob = bags[i];
                    const view = (ob && ob.view) ? ob.view : ob;
                    const slots = view && Array.isArray(view.slots) ? view.slots : (Array.isArray(ob && ob.slots) ? ob.slots : null);
                    if (slots) {
                        for (let j = 0; j < slots.length; j++) {
                            const s = slots[j];
                            if (s && s.id === itemId) total += (s.count | 0) > 0 ? (s.count | 0) : 1;
                        }
                    }
                }
            }
            return total;
        }
        return 0;
    }

    /**
     * Slider / deal cap for one row. Always >= 1.
     * Buy is limited by player's currency; sell is limited by backpack count.
     * @param {Function|object|null|undefined} counter
     * @param {object|null|undefined} shop
     * @param {object|null|undefined} row
     * @param {'buy'|'sell'|string|null|undefined} side
     * @returns {number}
     */
    function shopDealMax(counter, shop, row, side) {
        if (!row) return 1;
        if (side === 'sell') {
            const have = resolveItemCount(counter, row.itemId);
            if (have < 1) return 1;
            return Math.min(MAX_DEAL_COUNT, have);
        }
        const unit = Number(row.buy) || 0;
        if (unit <= 0) return 1;
        const currency = shop && shop.currency ? shop.currency : 'gold_coin';
        const money = resolveItemCount(counter, currency);
        const byMoney = Math.floor(money / unit);
        if (byMoney < 1) return 1;
        return Math.min(MAX_DEAL_COUNT, byMoney);
    }

    /**
     * Check if player can afford to buy or sell the row item.
     * @param {Function|object|null|undefined} counter
     * @param {object|null|undefined} shop
     * @param {object|null|undefined} row
     * @param {'buy'|'sell'|string|null|undefined} side
     * @returns {boolean}
     */
    function canAffordShopRow(counter, shop, row, side) {
        if (!row) return false;
        if (side === 'sell') {
            return resolveItemCount(counter, row.itemId) > 0;
        }
        const unit = Number(row.buy) || 0;
        const currency = shop && shop.currency ? shop.currency : 'gold_coin';
        return resolveItemCount(counter, currency) >= unit;
    }

    return {
        SHOP_AMOUNT_STEP,
        SHOP_AMOUNT_STEP_SHIFT,
        SHOP_AMOUNT_STEP_CTRL,
        SHOP_AMOUNT_STEP_SHIFT_CTRL,
        MAX_DEAL_COUNT,
        shopAmountStep,
        clampShopAmount,
        applyShopAmountDelta,
        defaultShopAmount,
        shopItemLabel,
        filterShopRowsByName,
        resolveItemCount,
        shopDealMax,
        canAffordShopRow
    };
});
