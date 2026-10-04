'use strict';

/**
 * Equip restrictions shared by /play drops, Use, and the Equip menu.
 * Same rules as server planEquipmentAdd (legacy Player::queryAdd,
 * Game::playerEquipItem, and MoveEvent::EquipItem).
 * Sword, axe, club, fist, and thrown weapons equip below level.
 * penalizedWeaponStats cuts their attack and defense by one per missing level.
 * right hand on the paperdoll is data-slot weapon. left hand is data-slot shield.
 * mode equip may clear the other hand. mode move rejects the conflict.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineEquipRules = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DRESS_DENIED = 'You cannot dress this object there.';
    const BOTH_HANDS_DENIED = 'Both hands need to be free.';

    const SLOT_ALIAS = {
        head: 'helmet',
        helmet: 'helmet',
        chest: 'armor',
        body: 'armor',
        armor: 'armor',
        weapon: 'rightHand',
        righthand: 'rightHand',
        rightHand: 'rightHand',
        shield: 'leftHand',
        lefthand: 'leftHand',
        leftHand: 'leftHand',
        legs: 'legs',
        boots: 'boots',
        feet: 'boots',
        amulet: 'amulet',
        necklace: 'amulet',
        neck: 'amulet',
        ring: 'ring',
        backpack: 'backpack',
        bag: 'backpack',
        container: 'backpack'
    };

    function canonicalSlot(slot) {
        if (slot == null || slot === '') return null;
        const raw = String(slot);
        if (Object.prototype.hasOwnProperty.call(SLOT_ALIAS, raw)) return SLOT_ALIAS[raw];
        const lower = raw.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(SLOT_ALIAS, lower)) return SLOT_ALIAS[lower];
        return raw;
    }

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

    function hasType(row, name) {
        const types = typeList(row);
        for (let i = 0; i < types.length; i++) {
            if (String(types[i]).toLowerCase() === name) return true;
        }
        return false;
    }

    function category(row) {
        return row && row.category != null ? String(row.category).toLowerCase() : '';
    }

    function itemIsAmmo(row) {
        if (!row) return false;
        const cat = category(row);
        if (cat === 'ammo' || cat === 'ammunition') return true;
        if (row.ammoType) return true;
        return hasType(row, 'ammo') || hasType(row, 'ammunition');
    }

    function itemIsQuiver(row) {
        if (!row) return false;
        if (category(row) === 'quiver') return true;
        return hasType(row, 'quiver');
    }

    function itemIsShield(row) {
        if (!row || itemIsAmmo(row) || itemIsQuiver(row)) return false;
        if (row.weaponType === 'shield' || category(row) === 'shield') return true;
        return category(row) === 'spellbook';
    }

    function itemIsTwoHanded(row) {
        if (!row) return false;
        return row.twoHanded === true || row.twoHanded === 'true' || row.twoHanded === 1;
    }

    function itemIsDistanceWeapon(row) {
        if (!row) return false;
        if (row.weaponType === 'distance') return true;
        const cat = category(row);
        if (cat === 'bow' || cat === 'bows' || cat === 'crossbow' || cat === 'crossbows') return true;
        if (cat === 'spear' || cat === 'throwing') return true;
        const types = typeList(row);
        for (let i = 0; i < types.length; i++) {
            const t = String(types[i]).toLowerCase();
            if (t === 'bow' || t === 'bows' || t === 'crossbow' || t === 'crossbows') return true;
            if (t === 'spear' || t === 'throwing' || t === 'distance') return true;
        }
        return false;
    }

    function itemIsRune(row) {
        if (!row) return false;
        if (category(row) === 'rune') return true;
        return hasType(row, 'rune');
    }

    function itemIsContainer(row) {
        if (!row) return false;
        if (itemIsQuiver(row)) return true;
        const cat = category(row);
        if (cat === 'container' || cat === 'backpack' || cat === 'bag') return true;
        const slot = row.slot != null ? String(row.slot).toLowerCase() : '';
        if (slot === 'backpack' || slot === 'container' || slot === 'bag') return true;
        if (hasType(row, 'container') || hasType(row, 'backpack') || hasType(row, 'bag')) return true;
        return false;
    }

    function itemIsUsable(row) {
        if (!row) return false;
        if (itemIsContainer(row)) return false;
        if (row.usable === true || row.consumable === true) return true;
        const cat = category(row);
        if (cat === 'potion' || cat === 'consumable' || cat === 'food' || cat === 'scroll') return true;
        if (row.heal != null || row.restoreMana != null || row.dispel != null || row.condition != null || row.effect != null) {
            return true;
        }
        return false;
    }

    function itemIsBackpack(row) {
        if (!row || row.slot == null) return false;
        return canonicalSlot(row.slot) === 'backpack';
    }

    function preferredEquipSlot(row) {
        if (!row) return null;
        if (itemIsAmmo(row)) return null;
        if (row.slot != null && String(row.slot).trim() !== '') {
            const named = canonicalSlot(row.slot);
            if (named) return named;
        }
        const cat = category(row);
        if (cat === 'helmet' || cat === 'head') return 'helmet';
        if (cat === 'armor' || cat === 'chest' || cat === 'body') return 'armor';
        if (cat === 'legs') return 'legs';
        if (cat === 'boots' || cat === 'feet') return 'boots';
        if (cat === 'amulet' || cat === 'necklace' || cat === 'neck') return 'amulet';
        if (cat === 'ring') return 'ring';
        if (cat === 'shield' || cat === 'spellbook' || cat === 'quiver') return 'leftHand';
        if (cat === 'container' || cat === 'backpack' || cat === 'bag') return 'backpack';
        if (cat === 'wand' || cat === 'rod') return 'rightHand';
        if (itemIsShield(row)) return 'leftHand';
        if (row.atk != null || row.weaponType) return 'rightHand';
        return null;
    }

    function canEquipInSlot(row, slot) {
        if (!row || !slot) return false;
        if (itemIsAmmo(row)) return false;
        const engine = canonicalSlot(slot) || slot;
        if (engine === 'backpack') return itemIsBackpack(row);
        const preferred = preferredEquipSlot(row);
        if (!preferred) return false;
        return preferred === engine;
    }

    function itemUseEquips(item, meta) {
        const row = merged(item, meta);
        if (!row) return false;
        if (itemIsContainer(row) || itemIsAmmo(row) || itemIsUsable(row) || itemIsRune(row)) return false;
        return preferredEquipSlot(row) != null;
    }

    function itemTakesLevelPenalty(row) {
        if (!row) return false;
        if (itemIsAmmo(row) || itemIsShield(row) || itemIsQuiver(row)) return false;
        const cat = category(row);
        if (cat === 'bow' || cat === 'crossbow' || cat === 'wand' || cat === 'rod') return false;
        if (row.weaponType === 'magic') return false;
        if (hasType(row, 'bow') || hasType(row, 'crossbow') || hasType(row, 'wand') || hasType(row, 'rod')) {
            return false;
        }
        if (cat === 'sword' || cat === 'axe' || cat === 'club' || cat === 'fist') return true;
        if (cat === 'spear' || cat === 'throwing') return true;
        if (hasType(row, 'sword') || hasType(row, 'axe') || hasType(row, 'club') || hasType(row, 'fist')) {
            return true;
        }
        return hasType(row, 'spear') || hasType(row, 'throwing');
    }

    function levelsBelowRequirement(row, level) {
        if (!row || row.level == null || row.level === '') return 0;
        const need = Math.floor(Number(row.level));
        if (!Number.isFinite(need) || need <= 0) return 0;
        const have = Math.floor(Number(level));
        const lv = Number.isFinite(have) ? have : 1;
        return Math.max(0, need - lv);
    }

    function penalizedWeaponStats(row, level) {
        const gap = levelsBelowRequirement(row, level);
        if (!gap || !itemTakesLevelPenalty(row)) return null;
        const phys = Math.max(0, Math.floor(Number(row.atk) || 0));
        const extra = Math.max(0, Math.floor(Number(row.extraAtk) || 0));
        const combined = phys + extra;
        const reduced = Math.max(0, combined - gap);
        let atk = 0;
        let extraAtk = 0;
        if (combined > 0) {
            atk = Math.floor((reduced * phys) / combined);
            extraAtk = reduced - atk;
        }
        const hasDefense = row.defense != null && row.defense !== '';
        const defense = hasDefense
            ? Math.max(0, Math.floor(Number(row.defense) || 0) - gap)
            : null;
        return { atk: atk, extraAtk: extraAtk, defense: defense, gap: gap };
    }

    function wieldBlock(row, player) {
        if (!row || !player) return null;
        if (!itemTakesLevelPenalty(row) && row.level != null && row.level !== '') {
            const need = Math.floor(Number(row.level));
            if (Number.isFinite(need) && need > 0) {
                const have = Math.floor(Number(player.level));
                const level = Number.isFinite(have) ? have : 1;
                if (level < need) return 'level';
            }
        }
        const vocs = Array.isArray(row.vocation) ? row.vocation : [];
        if (!vocs.length) return null;
        const mine = player.vocation != null ? String(player.vocation).trim().toLowerCase() : '';
        for (let i = 0; i < vocs.length; i++) {
            if (String(vocs[i]).trim().toLowerCase() === mine) return null;
        }
        return 'vocation';
    }

    function handConflict(row, slot, other) {
        const engine = canonicalSlot(slot) || slot;
        if (engine === 'rightHand') {
            if (!itemIsTwoHanded(row)) return null;
            if (!other) return null;
            if (itemIsDistanceWeapon(row) && itemIsQuiver(other)) return null;
            return 'both_hands';
        }
        if (engine === 'leftHand') {
            if (other && (itemIsTwoHanded(other) || itemIsTwoHanded(row))) {
                if (itemIsQuiver(row) && itemIsDistanceWeapon(other)) return null;
                return 'both_hands';
            }
            return null;
        }
        return null;
    }

    function denyMessage(error) {
        if (error === 'both_hands') return BOTH_HANDS_DENIED;
        if (
            error === 'level' ||
            error === 'vocation' ||
            error === 'wrong_slot' ||
            error === 'not_equippable' ||
            error === 'cannot_dress'
        ) {
            return DRESS_DENIED;
        }
        return DRESS_DENIED;
    }

    function titleWord(word) {
        const s = String(word || '');
        if (!s) return s;
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function wieldSentence(item, meta) {
        const row = merged(item, meta);
        if (!row) return '';
        const vocs = Array.isArray(row.vocation) ? row.vocation : [];
        let level = 0;
        if (row.level != null && row.level !== '') {
            const n = Math.floor(Number(row.level));
            if (Number.isFinite(n) && n > 0) level = n;
        }
        if (!vocs.length && level <= 0) return '';
        const who = vocs.length ? vocs.map(titleWord).join(', ') : 'players';
        let text = 'It can only be wielded properly by ' + who;
        if (level > 0) text += ' of level ' + level + ' or higher';
        return text + '.';
    }

    function evaluateEquip(opts) {
        const o = opts || {};
        const wear = merged(o.item, o.meta);
        let right = merged(o.weapon, o.weaponMeta);
        let left = merged(o.shield, o.shieldMeta);
        const source = canonicalSlot(o.sourceSlot);
        if (source === 'rightHand') right = null;
        if (source === 'leftHand') left = null;
        const requested = canonicalSlot(o.slot);
        const engine = requested || preferredEquipSlot(wear);
        if (engine === 'leftHand' && itemIsAmmo(wear) && itemIsQuiver(left)) {
            return { ok: true, error: null, message: '', slot: engine };
        }
        if (!wear || !engine || !canEquipInSlot(wear, engine)) {
            return { ok: false, error: 'wrong_slot', message: DRESS_DENIED, slot: engine };
        }
        const mode = o.mode === 'equip' ? 'equip' : 'move';
        if (mode === 'equip') {
            if (engine === 'rightHand' && itemIsTwoHanded(wear) && left) {
                const currentDistance = !!(right && itemIsDistanceWeapon(right));
                if (!itemIsDistanceWeapon(wear) && !itemIsQuiver(left) && !currentDistance) {
                    left = null;
                }
            } else if (engine === 'leftHand') {
                if (left && itemIsQuiver(left) && itemIsQuiver(wear)) {
                    left = null;
                } else if (right && itemIsTwoHanded(right)) {
                    right = null;
                }
            }
        }
        const other = engine === 'rightHand' ? left : right;
        const block = handConflict(wear, engine, other);
        if (block) return { ok: false, error: block, message: denyMessage(block), slot: engine };
        const wield = wieldBlock(wear, o.player);
        if (wield) return { ok: false, error: wield, message: denyMessage(wield), slot: engine };
        return { ok: true, error: null, message: '', slot: engine };
    }

    return {
        DRESS_DENIED: DRESS_DENIED,
        BOTH_HANDS_DENIED: BOTH_HANDS_DENIED,
        canonicalSlot: canonicalSlot,
        preferredEquipSlot: preferredEquipSlot,
        canEquipInSlot: canEquipInSlot,
        itemUseEquips: itemUseEquips,
        wieldSentence: wieldSentence,
        penalizedWeaponStats: penalizedWeaponStats,
        evaluateEquip: evaluateEquip
    };
});
