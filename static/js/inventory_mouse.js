'use strict';

/**
 * Inventory / equipment / combat-list mouse matrix.
 * Same mode numbers as the canvas dispatcher (0 Regular / 1 Classic / 2 Smart).
 * Canvas stays in mouse_dispatcher.js — this module has no tile hits.
 *
 * Classic unshifted RMB: use / open container / equip (HuntDL inventoryDirectUseOpenEquip).
 * Classic Ctrl: context menu. Regular/Smart unshifted RMB: menu; Ctrl: direct.
 * Look chord (Classic LMB+RMB) and Shift: LOOK. Combat-list matches OTC
 * battle.lua: LMB = attack; RMB = Attack / Look / Chase menu. Chase itself
 * is the Auto Chase checkbox (Canary ChaseOpponent stance), not RMB.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineInventoryMouse = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const EQUIP_CATS = Object.freeze({
        helmet: 1,
        head: 1,
        armor: 1,
        chest: 1,
        body: 1,
        legs: 1,
        boots: 1,
        feet: 1,
        amulet: 1,
        necklace: 1,
        neck: 1,
        ring: 1,
        shield: 1,
        spellbook: 1,
        quiver: 1,
        backpack: 1,
        bag: 1,
        container: 1,
        wand: 1,
        rod: 1,
        weapon: 1,
        sword: 1,
        axe: 1,
        club: 1,
        distance: 1,
        bow: 1,
        crossbow: 1
    });

    function normalizeModifiers(raw) {
        const o = raw && typeof raw === 'object' ? raw : {};
        return {
            shift: !!o.shift,
            ctrl: !!(o.ctrl || o.meta),
            alt: !!o.alt,
            meta: !!o.meta
        };
    }

    function asList(v) {
        if (Array.isArray(v)) return v;
        if (v == null || v === '') return [];
        return [v];
    }

    function catOf(item) {
        if (!item) return '';
        return String(item.category || '').toLowerCase();
    }

    function typesOf(item) {
        if (!item) return [];
        const out = asList(item.type);
        if (item.weaponType) out.push(item.weaponType);
        return out;
    }

    function typeHas(item, token) {
        const want = String(token).toLowerCase();
        const types = typesOf(item);
        for (let i = 0; i < types.length; i++) {
            if (String(types[i]).toLowerCase() === want) return true;
        }
        return false;
    }

    function itemIsContainer(item) {
        if (!item) return false;
        if ((item.flags | 0) & 1) return true;
        const cat = catOf(item);
        if (cat === 'container' || cat === 'backpack' || cat === 'bag' || cat === 'quiver') {
            return true;
        }
        if (typeHas(item, 'container') || typeHas(item, 'backpack')
            || typeHas(item, 'bag') || typeHas(item, 'quiver')) {
            return true;
        }
        const id = String(item.id || '').toLowerCase();
        if (id === 'bag' || id === 'backpack') return true;
        if (id.indexOf('quiver') >= 0 || id.indexOf('backpack') >= 0) return true;
        return false;
    }

    function itemIsMultiUse(item) {
        if (!item) return false;
        if (item.multiUse === true) return true;
        const cat = catOf(item);
        if (cat === 'rune' || cat === 'tool') return true;
        if (typeHas(item, 'rune') || typeHas(item, 'tool')) return true;
        const id = String(item.id || '').toLowerCase();
        if (id === 'rope' || id === 'shovel') return true;
        if (/(^|_)rope(_|$)/.test(id) || /(^|_)shovel(_|$)/.test(id)) return true;
        return false;
    }

    function itemIsUsable(item) {
        if (!item) return false;
        if (itemIsContainer(item) || itemIsMultiUse(item)) return false;
        if (item.usable === true || item.consumable === true) return true;
        const cat = catOf(item);
        if (cat === 'potion' || cat === 'consumable' || cat === 'food' || cat === 'scroll') {
            return true;
        }
        if (
            item.heal != null ||
            item.restoreMana != null ||
            item.dispel != null ||
            item.condition != null ||
            item.effect != null
        ) {
            return true;
        }
        return false;
    }

    function itemIsEquipable(item) {
        if (!item) return false;
        const cat = catOf(item);
        if (
            cat === 'ammo' || cat === 'ammunition' || cat === 'rune'
            || cat === 'potion' || cat === 'food' || cat === 'consumable'
        ) {
            return false;
        }
        if (item.slot != null && String(item.slot).trim() !== '') return true;
        if (EQUIP_CATS[cat]) return true;
        if (item.atk != null || item.weaponType) return true;
        return false;
    }

    function classifyItem(item) {
        if (!item) {
            return {
                empty: true,
                isContainer: false,
                isUsable: false,
                isMultiUse: false,
                isEquipable: false
            };
        }
        return {
            empty: false,
            isContainer: itemIsContainer(item),
            isUsable: itemIsUsable(item),
            isMultiUse: itemIsMultiUse(item),
            isEquipable: itemIsEquipable(item)
        };
    }

    function slotFromItem(item, extra) {
        const flags = classifyItem(item);
        const o = extra && typeof extra === 'object' ? extra : {};
        return Object.assign({
            kind: o.kind || 'container',
            isMainBackpackSlot: !!o.isMainBackpackSlot,
            alreadyOpen: !!o.alreadyOpen
        }, flags, o);
    }

    function isClassicLookChord(opts) {
        const o = opts || {};
        if (Number(o.mode) !== 1) return false;
        const button = o.button === 'right' || o.button === 2 ? 'right' : 'left';
        if (button === 'right' && o.leftPressed) return true;
        if (button === 'left' && o.rightPressed) return true;
        return false;
    }

    /**
     * HuntDL inventoryDirectUseOpenEquip analog. Container (not the equipped
     * backpack) toggles open/close; usable consumes; multi-use enters use-with;
     * equipable equips from a bag or unequips from paperdoll.
     * @param {object} slot
     * @returns {{ type: string }|null}
     */
    function directUseOpenEquip(slot) {
        if (!slot || slot.empty) return null;
        if (slot.isContainer && !slot.isMainBackpackSlot) {
            return { type: slot.alreadyOpen ? 'CLOSE_BAG' : 'OPEN_BAG' };
        }
        if (slot.isMainBackpackSlot) return { type: 'OPEN_BACKPACK' };
        if (slot.isUsable) return { type: 'USE_ITEM' };
        if (slot.isMultiUse) return { type: 'ENTER_USE_WITH' };
        if (slot.isEquipable) {
            return { type: slot.kind === 'equipment' ? 'UNEQUIP' : 'EQUIP' };
        }
        return null;
    }

    function lookOrIgnore(slot) {
        if (!slot || slot.empty) return [{ type: 'IGNORE' }];
        return [{ type: 'LOOK' }];
    }

    /**
     * @param {object} input
     * @param {'left'|'right'} input.button
     * @param {number} [input.mode]
     * @param {object} [input.modifiers]
     * @param {boolean} [input.leftPressed]
     * @param {boolean} [input.rightPressed]
     * @param {object} input.slot
     * @returns {Array<{ type: string }>}
     */
    function processInventoryAction(input) {
        const i = input || {};
        const slot = i.slot || {};
        const button = i.button === 'right' || i.button === 2 ? 'right' : 'left';
        const mode = i.mode != null ? Number(i.mode) : 1;
        const mods = normalizeModifiers(i.modifiers);

        if (isClassicLookChord({
            mode: mode,
            button: button,
            leftPressed: i.leftPressed,
            rightPressed: i.rightPressed
        })) {
            return lookOrIgnore(slot);
        }
        if (mods.shift) return lookOrIgnore(slot);
        if (mods.alt) return [{ type: 'IGNORE' }];

        if (slot.empty) {
            if (button === 'left' && !(mode === 1 && mods.ctrl)) {
                return [{ type: 'SELECT' }];
            }
            return [{ type: 'IGNORE' }];
        }

        const wantDirect =
            (mode === 1 && !mods.ctrl)
            || ((mode === 0 || mode === 2) && mods.ctrl);

        if (button === 'right') {
            if (wantDirect) {
                const direct = directUseOpenEquip(slot);
                if (direct) return [direct];
            }
            return [{ type: 'OPEN_CONTEXT_MENU' }];
        }

        if (mode === 1 && mods.ctrl) return [{ type: 'OPEN_CONTEXT_MENU' }];
        if ((mode === 0 || mode === 2) && mods.ctrl) {
            const direct = directUseOpenEquip(slot);
            if (direct) return [direct];
            return [{ type: 'OPEN_CONTEXT_MENU' }];
        }
        return [{ type: 'SELECT' }];
    }

    /**
     * OTC battle list: LMB attack, RMB creature menu, look chord + Shift look.
     * Auto-chase is the checkbox stance, not RMB.
     * @param {object} input
     * @returns {Array<{ type: string }>}
     */
    function processCombatRowAction(input) {
        const i = input || {};
        if (i.empty === true || i.row === null) return [{ type: 'IGNORE' }];
        const button = i.button === 'right' || i.button === 2 ? 'right' : 'left';
        const mode = i.mode != null ? Number(i.mode) : 1;
        const mods = normalizeModifiers(i.modifiers);

        if (isClassicLookChord({
            mode: mode,
            button: button,
            leftPressed: i.leftPressed,
            rightPressed: i.rightPressed
        })) {
            return [{ type: 'LOOK' }];
        }
        if (mods.shift) return [{ type: 'LOOK' }];
        if (mods.alt) return [{ type: 'SET_TARGET' }];
        if (button === 'left') return [{ type: 'SET_TARGET' }];
        if (button === 'right') return [{ type: 'OPEN_CONTEXT_MENU' }];
        return [];
    }

    function buildCombatContextMenuEntries() {
        return [
            { action: 'ATTACK', label: 'Attack' },
            { action: 'LOOK', label: 'Look' },
            { action: 'CHASE', label: 'Chase' }
        ];
    }

    return {
        normalizeModifiers,
        itemIsContainer,
        itemIsUsable,
        itemIsMultiUse,
        itemIsEquipable,
        classifyItem,
        slotFromItem,
        isClassicLookChord,
        directUseOpenEquip,
        processInventoryAction,
        processCombatRowAction,
        buildCombatContextMenuEntries
    };
});
