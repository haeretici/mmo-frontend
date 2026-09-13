'use strict';

/**
 * Canvas mouse action dispatcher — pure hit resolve + intent matrix.
 * Modes 0 Regular / 1 Classic (default) / 2 Smart. See HuntDL [29].
 * Product hits: creature, NPC, corpse, world pin, empty/self tile.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineMouse = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const TALK_NPC_RANGE = 3;
    const OPEN_CORPSE_RANGE = 1;
    const WORLD_USE_RANGE = 1;
    const WORLD_USE_KINDS = Object.freeze([
        'chest', 'lever', 'switch', 'door', 'teleport', 'harvest'
    ]);

    function normalizeModifiers(raw) {
        const o = raw && typeof raw === 'object' ? raw : {};
        return {
            shift: !!o.shift,
            ctrl: !!o.ctrl,
            alt: !!o.alt,
            meta: !!o.meta
        };
    }

    function normalizeLootMode(lootMode) {
        const n = Number(lootMode);
        if (!Number.isFinite(n)) return 0;
        const f = Math.floor(n);
        if (f === 1 || f === 2) return f;
        return 0;
    }

    function chebyshevSameFloor(a, b) {
        if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null) {
            return Infinity;
        }
        if ((a.z | 0) !== (b.z | 0)) return Infinity;
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }

    function isTalkableNpc(creature, hit) {
        if (hit && hit.isNpc === true) return true;
        if (!creature || typeof creature !== 'object') return false;
        return !!(creature.isNpc || creature.npc || creature.talkable);
    }

    function isAttackableCreature(creature, hit) {
        if (!creature) return false;
        if (isTalkableNpc(creature, hit)) return false;
        if (creature.isPlayer) return false;
        return true;
    }

    function isCorpseLike(hit) {
        return !!(hit && (hit.isCorpse || hit.corpse));
    }

    function corpseIdOf(hit) {
        if (!hit) return null;
        if (hit.corpse && hit.corpse.id != null) return hit.corpse.id;
        if (hit.corpseId != null) return hit.corpseId;
        return null;
    }

    function creatureLookText(creature) {
        if (!creature) return 'Creature';
        const name = creature.name || creature.label || creature.id;
        return name != null ? String(name) : 'Creature';
    }

    function tileLookText(hit) {
        if (!hit) return 'Nothing here.';
        const names = {
            0: 'void',
            1: 'grass',
            2: 'a path',
            3: 'a wall',
            4: 'water',
            5: 'a town tile'
        };
        if (hit.tileName) return 'You see ' + hit.tileName + '.';
        const label = names[hit.tileId];
        if (label) return 'You see ' + label + '.';
        return 'You see a tile.';
    }

    function worldPinUseReady(kind) {
        return WORLD_USE_KINDS.indexOf(String(kind || '')) >= 0;
    }

    function isWorldPinHit(hit) {
        return !!(hit && hit.worldPin && hit.worldPin.kind);
    }

    function worldPinLookText(pin) {
        if (!pin) return 'You see an object.';
        const id = pin.catalogId || pin.kind || 'object';
        return 'You see ' + String(id).replace(/_/g, ' ') + '.';
    }

    function worldPinUseThingIntents(hit) {
        if (!isWorldPinHit(hit)) return null;
        const kind = String(hit.worldPin.kind);
        if (kind === 'trap') return null;
        if (kind === 'container') {
            return [{
                type: 'OPEN_CONTAINER',
                tile: { x: hit.x, y: hit.y, z: hit.z },
                worldPin: hit.worldPin
            }];
        }
        return [{
            type: 'USE',
            stub: !worldPinUseReady(kind),
            worldPinKind: kind,
            tile: { x: hit.x, y: hit.y, z: hit.z },
            worldPin: hit.worldPin
        }];
    }

    function buildLookIntent(hit) {
        if (!hit) return { type: 'LOOK', style: 'fct', text: 'Nothing here.' };
        if (hit.creature) {
            return {
                type: 'LOOK',
                style: 'fct',
                text: creatureLookText(hit.creature),
                creature: hit.creature,
                tile: { x: hit.x, y: hit.y, z: hit.z }
            };
        }
        if (hit.corpse) {
            const name = hit.corpse.name || 'a corpse';
            return {
                type: 'LOOK',
                style: 'fct',
                text: String(name),
                corpse: hit.corpse,
                tile: { x: hit.x, y: hit.y, z: hit.z }
            };
        }
        if (isWorldPinHit(hit)) {
            return {
                type: 'LOOK',
                style: 'fct',
                text: worldPinLookText(hit.worldPin),
                worldPin: hit.worldPin,
                tile: { x: hit.x, y: hit.y, z: hit.z }
            };
        }
        return {
            type: 'LOOK',
            style: 'fct',
            text: tileLookText(hit),
            tile: { x: hit.x, y: hit.y, z: hit.z }
        };
    }

    function openContextMenuIntent(hit) {
        return {
            type: 'OPEN_CONTEXT_MENU',
            hit: hit,
            tile: hit ? { x: hit.x, y: hit.y, z: hit.z } : null
        };
    }

    function tryTalkNpc(hit) {
        if (!hit || !hit.creature) return null;
        if (!isTalkableNpc(hit.creature, hit)) return null;
        return [
            {
                type: 'TALK_NPC',
                creature: hit.creature,
                creatureId: hit.creature.id,
                tile: { x: hit.x, y: hit.y, z: hit.z }
            }
        ];
    }

    function openCorpseIntent(hit) {
        return {
            type: 'OPEN_CORPSE',
            corpseId: corpseIdOf(hit),
            tile: hit ? { x: hit.x, y: hit.y, z: hit.z } : null,
            isCorpse: true
        };
    }

    function quicklootStubIntent(hit) {
        return {
            type: 'QUICKLOOT',
            stub: true,
            corpseId: corpseIdOf(hit),
            tile: hit ? { x: hit.x, y: hit.y, z: hit.z } : null,
            isCorpse: true
        };
    }

    function mapStubQuicklootToOpen(intent) {
        if (!intent || intent.type !== 'QUICKLOOT' || intent.stub !== true) return null;
        if (intent.corpseId == null) return null;
        return {
            type: 'OPEN_CORPSE',
            corpseId: intent.corpseId,
            tile: intent.tile || null,
            isCorpse: true
        };
    }

    function useStairIntents(hit) {
        if (!hit || !hit.useStair) return null;
        return [{ type: 'USE_STAIR', dest: { x: hit.x, y: hit.y, z: hit.z } }];
    }

    function classicCorpseLootIntents(hit, lootMode, mods, button) {
        if (!isCorpseLike(hit)) return null;
        if (mods.ctrl || mods.alt) return null;
        const lm = normalizeLootMode(lootMode);
        if (mods.shift) {
            if (lm === 0) return [openCorpseIntent(hit)];
            if (lm === 1) return [quicklootStubIntent(hit)];
            return null;
        }
        if (button === 'right') {
            if (lm === 0) return [quicklootStubIntent(hit)];
            return [openCorpseIntent(hit)];
        }
        if (button === 'left' && lm === 2) return [quicklootStubIntent(hit)];
        return null;
    }

    function unshiftedLeftDefault(hit) {
        if (hit.creature && isAttackableCreature(hit.creature, hit)) {
            return [
                {
                    type: 'SET_TARGET',
                    targetId: hit.creature.id,
                    creature: hit.creature
                }
            ];
        }
        if (hit.isPlayerTile) return [{ type: 'STOP_AUTOWALK' }];
        return [
            {
                type: 'START_AUTOWALK',
                dest: { x: hit.x, y: hit.y, z: hit.z }
            }
        ];
    }

    function walkOrStop(hit, flags) {
        if (flags.playerControlMode !== 'manual' || !flags.playerAlive) return [];
        if (hit.isPlayerTile) return [{ type: 'STOP_AUTOWALK' }];
        return [
            {
                type: 'START_AUTOWALK',
                dest: { x: hit.x, y: hit.y, z: hit.z }
            }
        ];
    }

    function classicUnshiftedRight(hit, flags, lootMode) {
        const talk = tryTalkNpc(hit);
        if (talk) return talk;
        if (hit.creature && isAttackableCreature(hit.creature, hit)) {
            return [
                {
                    type: 'SET_TARGET',
                    targetId: hit.creature.id,
                    creature: hit.creature
                }
            ];
        }
        const corpseLoot = classicCorpseLootIntents(
            hit,
            lootMode,
            { shift: false, ctrl: false, alt: false },
            'right'
        );
        if (corpseLoot) return corpseLoot;
        const pin = worldPinUseThingIntents(hit);
        if (pin) return pin;
        const usePad = useStairIntents(hit);
        if (usePad) return usePad;
        return walkOrStop(hit, flags);
    }

    function smartUnshiftedLeft(hit, flags) {
        const talk = tryTalkNpc(hit);
        if (talk) return talk;
        if (hit.creature && isAttackableCreature(hit.creature, hit)) {
            return [
                {
                    type: 'SET_TARGET',
                    targetId: hit.creature.id,
                    creature: hit.creature
                }
            ];
        }
        if (isCorpseLike(hit)) return [quicklootStubIntent(hit)];
        const pin = worldPinUseThingIntents(hit);
        if (pin) return pin;
        const usePad = useStairIntents(hit);
        if (usePad) return usePad;
        return unshiftedLeftDefault(hit);
    }

    function processMouseAction(input) {
        const i = input || {};
        const hit = i.hit;
        if (!hit) return [];
        const button = i.button;
        const mode = i.mode != null ? Number(i.mode) : 1;
        const lootMode = normalizeLootMode(i.lootMode);
        const talkOnRightClick = i.talkOnRightClick === true;
        const mods = normalizeModifiers(i.modifiers);
        const flags = {
            playerControlMode: i.playerControlMode || 'manual',
            playerAlive: i.playerAlive !== false
        };

        if (button !== 'left' && button !== 'right') return [];

        if (mods.shift) {
            if (mode === 1) {
                const corpseShift = classicCorpseLootIntents(hit, lootMode, mods, button);
                if (corpseShift) return corpseShift;
            }
            return [buildLookIntent(hit)];
        }

        if (mods.alt) {
            if (
                hit.creature &&
                isAttackableCreature(hit.creature, hit) &&
                flags.playerControlMode === 'manual' &&
                flags.playerAlive
            ) {
                return [
                    {
                        type: 'SET_TARGET',
                        targetId: hit.creature.id,
                        creature: hit.creature
                    }
                ];
            }
            return [];
        }

        if (mode === 1) {
            if (mods.ctrl) return [openContextMenuIntent(hit)];
            if (button === 'left') {
                if (flags.playerControlMode !== 'manual' || !flags.playerAlive) return [];
                const corpseLeft = classicCorpseLootIntents(hit, lootMode, mods, 'left');
                if (corpseLeft) return corpseLeft;
                return unshiftedLeftDefault(hit);
            }
            return classicUnshiftedRight(hit, flags, lootMode);
        }

        if (mode === 0) {
            if (mods.ctrl) {
                const pin = worldPinUseThingIntents(hit);
                if (pin) return pin;
                const usePad = useStairIntents(hit);
                if (usePad) return usePad;
                if (isCorpseLike(hit)) return [openCorpseIntent(hit)];
                return [openContextMenuIntent(hit)];
            }
            if (button === 'left') {
                if (flags.playerControlMode !== 'manual' || !flags.playerAlive) return [];
                return unshiftedLeftDefault(hit);
            }
            if (talkOnRightClick) {
                const talk = tryTalkNpc(hit);
                if (talk) return talk;
            }
            return [openContextMenuIntent(hit)];
        }

        if (mode === 2) {
            if (mods.ctrl) {
                if (isCorpseLike(hit)) return [openCorpseIntent(hit)];
                return [openContextMenuIntent(hit)];
            }
            if (button === 'left') {
                if (flags.playerControlMode !== 'manual' || !flags.playerAlive) return [];
                return smartUnshiftedLeft(hit, flags);
            }
            return [openContextMenuIntent(hit)];
        }

        if (button === 'left') {
            if (flags.playerControlMode !== 'manual' || !flags.playerAlive) return [];
            return unshiftedLeftDefault(hit);
        }
        return classicUnshiftedRight(hit, flags, lootMode);
    }

    function isClassicLookChord(opts) {
        const o = opts || {};
        if (Number(o.mode) !== 1) return false;
        const button = o.button === 'right' || o.button === 2 ? 'right' : 'left';
        if (button === 'right' && o.leftPressed) return true;
        if (button === 'left' && o.rightPressed) return true;
        return false;
    }

    function buildCanvasContextMenuEntries(hit) {
        const entries = [];
        entries.push({ action: 'LOOK', label: 'Look' });
        if (!hit) return entries;
        if (isTalkableNpc(hit.creature, hit)) {
            entries.push({ action: 'TALK_NPC', label: 'Talk' });
        } else if (hit.creature && isAttackableCreature(hit.creature, hit)) {
            entries.push({ action: 'ATTACK', label: 'Attack' });
        }
        if (isCorpseLike(hit)) {
            entries.push({ action: 'OPEN_CORPSE', label: 'Open' });
        }
        if (isWorldPinHit(hit) && hit.worldPin.kind !== 'trap') {
            const kind = String(hit.worldPin.kind);
            entries.push({
                action: kind === 'container' ? 'OPEN_CONTAINER' : 'USE',
                label: kind === 'container' ? 'Open' : 'Use'
            });
        }
        if (hit.isPlayerTile || hit.useStair) {
            entries.push({ action: 'USE_STAIR', label: 'Use' });
        }
        if (!hit.isPlayerTile) {
            entries.push({ action: 'WALK', label: 'Walk here' });
        }
        return entries;
    }

    function resolveCanvasHit(opts) {
        const o = opts || {};
        const tile = o.tile;
        const player = o.player;
        if (!tile || tile.x == null || tile.y == null) return null;
        const x = tile.x | 0;
        const y = tile.y | 0;
        const z = tile.z | 0;
        const others = o.others || [];
        const corpses = o.corpses || [];
        const worldPins = o.worldPins || [];
        let creature = null;
        for (let i = 0; i < others.length; i++) {
            const p = others[i];
            if (!p) continue;
            if ((p.x | 0) === x && (p.y | 0) === y && (p.z | 0) === z) {
                if (player && p.id === player.id) continue;
                creature = p;
                break;
            }
        }
        let corpse = null;
        for (let i = 0; i < corpses.length; i++) {
            const c = corpses[i];
            if (!c) continue;
            if ((c.x | 0) === x && (c.y | 0) === y && (c.z | 0) === z) {
                corpse = c;
                break;
            }
        }
        const isNpc = !!(creature && (creature.isNpc || (creature.flags & 1)));
        if (creature && isNpc) creature = Object.assign({}, creature, { isNpc: true });
        const isPlayerTile = !!(
            player &&
            (player.x | 0) === x &&
            (player.y | 0) === y &&
            (player.z | 0) === z
        );
        let worldPin = null;
        for (let i = 0; i < worldPins.length; i++) {
            const p = worldPins[i];
            if (!p) continue;
            if ((p.x | 0) === x && (p.y | 0) === y && (p.z | 0) === z) {
                worldPin = p;
                break;
            }
        }
        return {
            x: x,
            y: y,
            z: z,
            tileId: o.tileId,
            walkable: o.walkable !== false,
            creature: creature,
            creatureId: creature ? creature.id : null,
            isNpc: isNpc,
            corpse: corpse,
            corpseId: corpse ? corpse.id : null,
            isCorpse: !!corpse,
            worldPin: worldPin,
            isPlayerTile: isPlayerTile,
            useStair: !!o.useStair
        };
    }

    return {
        TALK_NPC_RANGE,
        OPEN_CORPSE_RANGE,
        WORLD_USE_RANGE,
        worldPinUseReady,
        worldPinUseThingIntents,
        normalizeModifiers,
        normalizeLootMode,
        chebyshevSameFloor,
        isTalkableNpc,
        isAttackableCreature,
        isCorpseLike,
        creatureLookText,
        buildLookIntent,
        tryTalkNpc,
        openCorpseIntent,
        quicklootStubIntent,
        mapStubQuicklootToOpen,
        useStairIntents,
        processMouseAction,
        isClassicLookChord,
        buildCanvasContextMenuEntries,
        resolveCanvasHit
    };
});
