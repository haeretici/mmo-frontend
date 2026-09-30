'use strict';

/**
 * Container drop destinations for play.
 * A window miss and a non-container slot share one loc. Index 255 is outside
 * every container capacity, so the server inserts into that container.
 * A slot whose item is a container keeps its index so the server enters it.
 * Ammo on the paperdoll slot that holds a quiver is MOVE_ITEM to that slot.
 * Stack count matches resolveStackMoveAmount (Shift = 1). Mouse mode is not read.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineContainerDrop = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const CONTAINER_INSERT_INDEX = 255;

    function merged(item, meta) {
        if (!item && !meta) return null;
        if (!meta) return item;
        if (!item) return meta;
        return Object.assign({}, meta, item);
    }

    function typeList(row) {
        if (!row || row.type == null) return [];
        return Array.isArray(row.type) ? row.type : [row.type];
    }

    function itemIsAmmo(item, meta) {
        const row = merged(item, meta);
        if (!row || typeof row !== 'object') return false;
        const cat = row.category != null ? String(row.category).toLowerCase() : '';
        if (cat === 'ammo' || cat === 'ammunition') return true;
        if (row.ammoType) return true;
        const types = typeList(row);
        for (let i = 0; i < types.length; i++) {
            const t = String(types[i]).toLowerCase();
            if (t === 'ammo' || t === 'ammunition') return true;
        }
        return false;
    }

    function itemIsQuiver(item, meta) {
        const row = merged(item, meta);
        if (!row) return false;
        const cat = row.category != null ? String(row.category).toLowerCase() : '';
        if (cat === 'quiver') return true;
        const types = typeList(row);
        for (let i = 0; i < types.length; i++) {
            if (String(types[i]).toLowerCase() === 'quiver') return true;
        }
        const id = String(row.id || '').toLowerCase();
        return id.indexOf('quiver') >= 0;
    }

    function itemIsContainer(item, meta) {
        if (item && ((item.flags | 0) & 1)) return true;
        const row = merged(item, meta);
        if (!row) return false;
        const cat = row.category != null ? String(row.category).toLowerCase() : '';
        if (cat === 'container' || cat === 'backpack' || cat === 'bag' || cat === 'quiver') return true;
        const types = typeList(row);
        for (let i = 0; i < types.length; i++) {
            const t = String(types[i]).toLowerCase();
            if (t === 'container' || t === 'backpack' || t === 'bag' || t === 'quiver') return true;
        }
        const id = String(row.id || '').toLowerCase();
        return id === 'bag' || id === 'backpack' || id.indexOf('quiver') >= 0 || id.indexOf('backpack') >= 0;
    }

    function resolveStackMoveAmount(opts) {
        const o = opts || {};
        let count = Math.floor(Number(o.count));
        if (!Number.isFinite(count) || count < 1) count = 1;
        if (count <= 1) return { kind: 'amount', amount: 1 };
        if (o.shift) return { kind: 'amount', amount: 1 };
        const ctrl = !!o.ctrl;
        const moveStack = !!o.moveStack;
        if (ctrl !== moveStack) return { kind: 'amount', amount: count };
        return { kind: 'modal', max: count };
    }

    function wireCount(total, chosen) {
        const count = Math.floor(Number(total));
        const n = Math.floor(Number(chosen));
        if (!Number.isFinite(count) || count < 1) return 0;
        if (!Number.isFinite(n) || n < 1 || n >= count) return 0;
        return n;
    }

    function dragFromLoc(drag) {
        if (!drag) return null;
        if (drag.kind === 'equipment') return { kind: 'equipment', slot: drag.slot || '' };
        if (drag.kind === 'ground') {
            return {
                kind: 'tile',
                x: drag.x | 0,
                y: drag.y | 0,
                z: drag.z | 0,
                stackIndex: drag.stackIndex | 0
            };
        }
        if (drag.kind === 'container') {
            return {
                kind: 'container',
                containerUid: drag.containerId || 'root',
                index: drag.slotIndex | 0
            };
        }
        return null;
    }

    function resolveContainerDestination(hit) {
        const h = hit || {};
        if (h.surfaceUid == null || h.surfaceUid === '') return null;
        const surfaceUid = String(h.surfaceUid);
        const drag = h.drag || null;
        const hasSlot = h.slotIndex != null && h.slotIndex !== '';
        const slotIndex = hasSlot ? (h.slotIndex | 0) : null;
        let index = CONTAINER_INSERT_INDEX;
        let highlight = 'window';
        if (slotIndex != null && itemIsContainer(h.slotItem, h.slotMeta)) {
            const ownSlot = !!(drag && drag.kind === 'container'
                && String(drag.containerId || '') === surfaceUid
                && (drag.slotIndex | 0) === slotIndex);
            if (!ownSlot) {
                index = slotIndex & 0xff;
                highlight = 'slot';
            }
        }
        return {
            loc: { kind: 'container', containerUid: surfaceUid, index: index },
            highlight: highlight
        };
    }

    function resolvePaperdollDrop(opts) {
        const o = opts || {};
        const drag = o.drag;
        const targetSlot = o.targetSlot;
        if (!drag || !targetSlot) return null;
        const quiver = itemIsQuiver(o.equippedItem, o.equippedMeta);
        const ammo = itemIsAmmo(drag.item, o.dragMeta);
        if (quiver && ammo) {
            return {
                type: 'MOVE_ITEM',
                split: true,
                to: { kind: 'equipment', slot: targetSlot }
            };
        }
        if (drag.kind === 'container') {
            return { type: 'EQUIP', slot: targetSlot };
        }
        if (drag.kind === 'equipment' && drag.slot !== targetSlot) {
            return {
                type: 'MOVE_ITEM',
                split: false,
                to: { kind: 'equipment', slot: targetSlot }
            };
        }
        if (drag.kind === 'ground') {
            return {
                type: 'MOVE_ITEM',
                split: true,
                to: { kind: 'equipment', slot: targetSlot }
            };
        }
        return null;
    }

    function countPlan(item, modifiers, allowSplit) {
        const total = item && item.count > 1 ? (item.count | 0) : 1;
        if (!allowSplit) return { total: total, modal: false, count: 0 };
        const mods = modifiers || {};
        const decision = resolveStackMoveAmount({
            count: total,
            shift: !!mods.shift,
            ctrl: !!mods.ctrl,
            moveStack: !!mods.moveStack
        });
        if (decision.kind === 'modal') {
            if (mods.chosen == null) return { total: total, modal: true, max: decision.max };
            const n = Math.max(1, Math.min(decision.max, Math.floor(Number(mods.chosen)) || 1));
            return { total: total, modal: false, count: wireCount(total, n) };
        }
        return { total: total, modal: false, count: wireCount(total, decision.amount) };
    }

    function planDrop(opts) {
        const o = opts || {};
        const drag = o.drag;
        const from = dragFromLoc(drag);
        if (!from) return { type: 'NONE' };
        if (o.paperdoll) {
            const paper = resolvePaperdollDrop({
                targetSlot: o.paperdoll.targetSlot,
                equippedItem: o.paperdoll.equippedItem,
                equippedMeta: o.paperdoll.equippedMeta,
                drag: drag,
                dragMeta: o.dragMeta
            });
            if (!paper) return { type: 'NONE' };
            if (paper.type === 'EQUIP') {
                return {
                    type: 'EQUIP',
                    containerId: drag.containerId,
                    index: drag.slotIndex | 0,
                    slot: paper.slot
                };
            }
            const counted = countPlan(drag.item, o.modifiers, !!paper.split);
            if (counted.modal) {
                return { type: 'MODAL', max: counted.max, total: counted.total, from: from, to: paper.to };
            }
            return { type: 'MOVE_ITEM', from: from, to: paper.to, count: counted.count, total: counted.total };
        }
        if (o.container) {
            const dest = resolveContainerDestination({
                surfaceUid: o.container.surfaceUid,
                slotIndex: o.container.slotIndex,
                slotItem: o.container.slotItem,
                slotMeta: o.container.slotMeta,
                drag: drag
            });
            if (!dest) return { type: 'NONE' };
            const counted = countPlan(drag.item, o.modifiers, true);
            if (counted.modal) {
                return {
                    type: 'MODAL',
                    max: counted.max,
                    total: counted.total,
                    from: from,
                    to: dest.loc,
                    highlight: dest.highlight
                };
            }
            return {
                type: 'MOVE_ITEM',
                from: from,
                to: dest.loc,
                count: counted.count,
                total: counted.total,
                highlight: dest.highlight
            };
        }
        return { type: 'NONE' };
    }

    return {
        CONTAINER_INSERT_INDEX,
        itemIsAmmo,
        itemIsQuiver,
        itemIsContainer,
        resolveStackMoveAmount,
        wireCount,
        resolveContainerDestination,
        resolvePaperdollDrop,
        planDrop
    };
});
