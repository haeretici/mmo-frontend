'use strict';

/**
 * /play action bars (P18). Docks fire intents. Cooldown remaining is
 * tick-based (HELLO.ups + PONG.tickIndex). Wipe paints dirty-only at 100 ms.
 * Assign chrome lives in action_bar_assign.js (HuntDL analog, not a copy).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineActionBars = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const VISIBLE_SLOTS = 12;
    const VISIBLE_SLOTS_VERTICAL = 10;
    const MULTI_ACTION_DEPTH = 3;
    const TEXT_FCT_COLOR = '#93c5fd';
    const BAR1_KEYS = Object.freeze([
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
        'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
    ]);
    const TARGET_MODES = Object.freeze({
        smart_target: true,
        active_target: true,
        cursor_prompt: true,
        self: true
    });
    const SET_DEBOUNCE_MS = 250;
    /** Wipe poll while any slot is on cooldown. Hidden tab is slower. No rAF. */
    const POLL_MS_CD = 100;
    const POLL_MS_HIDDEN = 4000;
    const EQUIP_SLOTS = Object.freeze({
        rightHand: true, leftHand: true, helmet: true, armor: true, legs: true,
        boots: true, amulet: true, ring: true, backpack: true, head: true,
        chest: true, weapon: true, shield: true
    });

    function cdTicks(sec, ups) {
        const s = Number(sec);
        if (!Number.isFinite(s) || s <= 0) return 0;
        const u = Number(ups) > 0 ? Number(ups) : 20;
        return Math.max(1, Math.round(s * u));
    }

    function remainingTicks(readyTick, tickIndex) {
        const rem = (readyTick | 0) - (tickIndex | 0);
        return rem > 0 ? rem : 0;
    }

    function cdProgress(remaining, duration) {
        const d = Number(duration);
        if (!Number.isFinite(d) || d <= 0) return 100;
        const r = Math.max(0, Number(remaining) || 0);
        const done = 1 - (r / d);
        return Math.max(0, Math.min(100, done * 100));
    }

    function formatCdTimer(remainingTicks, ups) {
        const u = Number(ups) > 0 ? Number(ups) : 20;
        const sec = (Number(remainingTicks) || 0) / u;
        if (sec <= 0) return '';
        return sec >= 1 ? String(Math.ceil(sec)) : sec.toFixed(1);
    }

    function cdPaintSig(remaining, duration, ups) {
        if (!(remaining > 0)) return '0';
        const u = Number(ups) > 0 ? Number(ups) : 20;
        const remSec = remaining / u;
        const progress = cdProgress(remaining, duration);
        return Math.ceil(remSec * 10) + ':' + Math.floor(progress);
    }

    function roundCdProgress(progress) {
        return Math.round(Number(progress) * 10) / 10;
    }

    const AUTO_RE = /_auto$/;
    const SKIP_AUTO = Object.freeze({
        melee_auto: true,
        distance_auto: true,
        wand_auto: true
    });
    const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
    const MAX_SLOTS = 50;

    function emptyDoc() {
        return { v: 1, bars: [] };
    }

    function isEmptyDoc(raw) {
        if (raw == null) return true;
        if (typeof raw !== 'object' || Array.isArray(raw)) return true;
        if (Object.keys(raw).length === 0) return true;
        if (!raw.v) return true;
        return !(Array.isArray(raw.bars) && raw.bars.length);
    }

    function skipSpellId(id) {
        if (!id) return true;
        const s = String(id);
        return !!SKIP_AUTO[s] || AUTO_RE.test(s);
    }

    function assignApi() {
        if (typeof EngineActionBarAssign !== 'undefined') return EngineActionBarAssign;
        return null;
    }

    function normalizeHotkey(str) {
        const Assign = assignApi();
        if (Assign && typeof Assign.normalizeHotkey === 'function') {
            return Assign.normalizeHotkey(str);
        }
        if (!str) return '';
        return String(str).trim().toUpperCase().replace(/\s+/g, '');
    }

    function normalizeTargetMode(m) {
        const s = m != null ? String(m) : '';
        return TARGET_MODES[s] ? s : 'smart_target';
    }

    function normalizeMulti(raw) {
        const out = [];
        for (let i = 0; i < MULTI_ACTION_DEPTH; i++) {
            const r = Array.isArray(raw) ? raw[i] : null;
            if (!r || typeof r !== 'object' || !r.t || r.t === 'empty') {
                out.push({ t: 'empty', id: '', m: 'smart_target', text: '' });
                continue;
            }
            const t = r.t === 'item' || r.t === 'spell' || r.t === 'text' ? r.t : 'empty';
            out.push({
                t: t,
                id: (t === 'item' || t === 'spell') && r.id ? String(r.id) : '',
                text: t === 'text' && r.text != null ? String(r.text) : '',
                m: normalizeTargetMode(r.m)
            });
        }
        return out;
    }

    function slotFilled(slot) {
        if (!slot || !slot.t || slot.t === 'empty') return false;
        if (slot.t === 'text') return !!(slot.text && String(slot.text).trim());
        if (slot.t === 'multi') {
            const multi = Array.isArray(slot.multi) ? slot.multi : [];
            for (let i = 0; i < multi.length; i++) {
                const s = multi[i];
                if (s && s.t === 'spell' && s.id) return true;
                if (s && s.t === 'item' && s.id) return true;
                if (s && s.t === 'text' && s.text && String(s.text).trim()) return true;
            }
            return false;
        }
        return !!slot.id;
    }

    function parseDropItemId(raw) {
        if (raw == null || raw === '') return '';
        try {
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (typeof data === 'string') return ID_RE.test(data) ? data : '';
            const item = data && (data.item || data);
            const id = item && (item.id || item.itemId);
            if (id) return String(id);
            if (data && data.id) return String(data.id);
        } catch (e) {
            const s = String(raw).trim();
            if (ID_RE.test(s)) return s;
        }
        return '';
    }

    function forEachBagView(openBag, fn) {
        if (!openBag || typeof fn !== 'function') return;
        if (Array.isArray(openBag)) {
            for (let i = 0; i < openBag.length; i++) {
                if (openBag[i]) fn(openBag[i]);
            }
            return;
        }
        fn(openBag);
    }

    /** Focused window first, then every other open BAG. Dedupes by containerId. */
    function hostOpenBagViews(host) {
        if (!host) return [];
        const seen = Object.create(null);
        const out = [];
        function push(view) {
            if (!view || !Array.isArray(view.slots)) return;
            const key = view.containerId != null ? String(view.containerId) : '';
            const id = key || '#';
            if (seen[id]) return;
            seen[id] = true;
            out.push(view);
        }
        if (typeof host.getOpenBag === 'function') push(host.getOpenBag());
        if (typeof host.getOpenBags === 'function') {
            const list = host.getOpenBags();
            if (Array.isArray(list)) {
                for (let i = 0; i < list.length; i++) push(list[i]);
            }
        }
        return out;
    }

    function countItemId(itemId, bag, openBag, equipment) {
        const id = String(itemId || '');
        if (!id) return 0;
        let n = 0;
        function walk(view) {
            if (!view || !Array.isArray(view.slots)) return;
            for (let i = 0; i < view.slots.length; i++) {
                const s = view.slots[i];
                if (s && s.id === id) n += (s.count | 0) > 0 ? (s.count | 0) : 1;
            }
        }
        walk(bag);
        forEachBagView(openBag, walk);
        if (equipment && typeof equipment === 'object') {
            const keys = Object.keys(equipment);
            for (let i = 0; i < keys.length; i++) {
                const it = equipment[keys[i]];
                if (it && it.id === id) n += (it.count | 0) > 0 ? (it.count | 0) : 1;
            }
        }
        return n;
    }

    function knownSpellsFor(classes, vocation) {
        const voc = String(vocation || '');
        const list = classes && Array.isArray(classes.classes)
            ? classes.classes
            : (Array.isArray(classes) ? classes : []);
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].id === voc && Array.isArray(list[i].spells)) {
                return list[i].spells;
            }
        }
        return [];
    }

    function seedBar1(knownSpells) {
        const slots = [];
        const list = Array.isArray(knownSpells) ? knownSpells : [];
        let i = 0;
        for (let n = 0; n < list.length && i < MAX_SLOTS; n++) {
            const id = list[n] != null ? String(list[n]).trim() : '';
            if (!id || skipSpellId(id) || !ID_RE.test(id)) continue;
            const slot = { i: i, t: 'spell', id: id, m: 'smart_target' };
            if (i < BAR1_KEYS.length) slot.k = BAR1_KEYS[i];
            slots.push(slot);
            i += 1;
        }
        return {
            v: 1,
            bars: [{
                id: 1,
                side: 'bottom',
                visible: true,
                locked: false,
                page: 0,
                slots: slots
            }]
        };
    }

    function bar1Of(doc) {
        return barById(doc, 1);
    }

    function sideOf(barId) {
        const n = barId | 0;
        if (n >= 4 && n <= 6) return 'left';
        if (n >= 7 && n <= 9) return 'right';
        return 'bottom';
    }

    function barsForDock(dock) {
        if (dock === 'left') return [4, 5, 6];
        if (dock === 'right') return [7, 8, 9];
        return [1, 2, 3];
    }

    function visibleCount(barId) {
        return sideOf(barId) === 'bottom' ? VISIBLE_SLOTS : VISIBLE_SLOTS_VERTICAL;
    }

    /** Shown on the HUD. Bar 1 stays shown when an older row omitted `visible`. */
    function barShown(bar) {
        if (!bar) return false;
        if (bar.visible === false) return false;
        if (bar.visible === true) return true;
        return (bar.id | 0) === 1;
    }

    function dockVisibleCount(doc, dock) {
        const ids = barsForDock(dock);
        let n = 0;
        for (let i = 0; i < ids.length; i++) {
            if (barShown(barById(doc, ids[i]))) n += 1;
        }
        return n;
    }

    function maxPageFor(barId) {
        return Math.max(0, MAX_SLOTS - visibleCount(barId));
    }

    function clampPage(bar) {
        if (!bar) return 0;
        const max = maxPageFor(bar.id | 0);
        let page = bar.page == null ? 0 : (bar.page | 0);
        if (page < 0) page = 0;
        if (page > max) page = max;
        bar.page = page;
        return page;
    }

    function hudKeyOf(doc) {
        const parts = [];
        const sides = ['bottom', 'left', 'right'];
        for (let s = 0; s < sides.length; s++) {
            const ids = barsForDock(sides[s]);
            for (let i = 0; i < ids.length; i++) {
                const bar = barById(doc, ids[i]);
                if (!barShown(bar)) continue;
                parts.push(sides[s] + ':' + (bar.id | 0) + ':' + clampPage(bar) + ':' + (bar.locked ? 1 : 0));
            }
        }
        return parts.join(',');
    }

    function barById(doc, barId) {
        const bars = doc && Array.isArray(doc.bars) ? doc.bars : [];
        const id = barId | 0;
        for (let i = 0; i < bars.length; i++) {
            if (bars[i] && (bars[i].id | 0) === id) return bars[i];
        }
        return null;
    }

    function slotMap(bar) {
        const map = Object.create(null);
        const slots = bar && Array.isArray(bar.slots) ? bar.slots : [];
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (!s || s.i == null) continue;
            map[s.i | 0] = s;
        }
        return map;
    }

    function keyOfSlot(i, slot) {
        if (slot && Object.prototype.hasOwnProperty.call(slot, 'k')) {
            return normalizeHotkey(slot.k);
        }
        return BAR1_KEYS[i] || '';
    }

    function defaultKey(i) {
        return BAR1_KEYS[i] || '';
    }

    function bucketEntries(cooldowns) {
        const out = [];
        if (!cooldowns || typeof cooldowns !== 'object') return out;
        const names = ['auto', 'primary', 'secondary', 'spell', 'item'];
        for (let i = 0; i < names.length; i++) {
            const bag = cooldowns[names[i]];
            if (!bag || typeof bag !== 'object') continue;
            const keys = Object.keys(bag);
            for (let k = 0; k < keys.length; k++) {
                const sec = Number(bag[keys[k]]);
                if (!Number.isFinite(sec) || sec <= 0) continue;
                out.push({ bucket: names[i] + '.' + keys[k], sec: sec });
            }
        }
        return out;
    }

    function spellBuckets(spell) {
        const list = bucketEntries(spell && spell.cooldowns);
        if (spell && spell.id) {
            let hasSpell = false;
            for (let i = 0; i < list.length; i++) {
                if (list[i].bucket === 'spell.' + spell.id) hasSpell = true;
            }
            if (!hasSpell) {
                /* spell-id overlay follows primary/attack when present */
            }
        }
        return list;
    }

    function findItemLoc(itemId, bag, openBag, equipment) {
        const id = String(itemId || '');
        if (!id) return null;
        function inBag(view) {
            if (!view || !Array.isArray(view.slots)) return null;
            for (let i = 0; i < view.slots.length; i++) {
                const s = view.slots[i];
                if (s && s.id === id) {
                    return {
                        kind: 'container',
                        containerId: view.containerId || 'root',
                        index: s.index | 0
                    };
                }
            }
            return null;
        }
        const fromBag = inBag(bag);
        if (fromBag) return fromBag;
        let fromOpen = null;
        forEachBagView(openBag, function (view) {
            if (fromOpen) return;
            fromOpen = inBag(view);
        });
        if (fromOpen) return fromOpen;
        if (equipment && typeof equipment === 'object') {
            const keys = Object.keys(equipment);
            for (let i = 0; i < keys.length; i++) {
                const it = equipment[keys[i]];
                if (it && it.id === id) return { kind: 'equipment', slot: keys[i] };
            }
        }
        return null;
    }

    function itemIsEquipable(meta) {
        if (!meta) return false;
        const slot = meta.slot != null ? String(meta.slot) : '';
        if (slot && EQUIP_SLOTS[slot]) return true;
        const cat = String(meta.category || '').toLowerCase();
        if (cat === 'rune' || cat === 'potion' || cat === 'food' || cat === 'ammunition') return false;
        return false;
    }

    function validTarget(ent, self) {
        if (!ent || (ent.hp | 0) <= 0) return false;
        if (self && (ent.z | 0) !== (self.z | 0)) return false;
        return true;
    }

    function isSelfTargetSpell(spell) {
        if (!spell) return false;
        if (spell.selfTarget === true) return true;
        if (spell.selfTarget === false) return false;
        if (spell.requiresTarget) return false;
        if (spell.shape && typeof spell.shape === 'object' && spell.shape.type) return false;
        if (spell.chain) return false;
        const kind = String(spell.kind || '');
        if (kind === 'heal' || kind === 'support') return true;
        return spell.range != null && Number(spell.range) <= 0;
    }

    function nearestOther(self, others) {
        if (!self || !others) return null;
        let best = null;
        let bestD = Infinity;
        const list = others instanceof Map ? Array.from(others.values()) : others;
        for (let i = 0; i < list.length; i++) {
            const o = list[i];
            if (!validTarget(o, self)) continue;
            if (o.id === self.id) continue;
            const d = Math.max(Math.abs((o.x | 0) - (self.x | 0)), Math.abs((o.y | 0) - (self.y | 0)));
            if (d < bestD) {
                bestD = d;
                best = o;
            }
        }
        return best;
    }

    function resolveSpellAim(slot, spell, host) {
        const mode = (slot && slot.m) || 'smart_target';
        const self = host.getSelf && host.getSelf();
        if (!self) return null;
        const targetId = host.getTargetId ? (host.getTargetId() | 0) : 0;
        const others = host.getOthers ? host.getOthers() : new Map();
        const sticky = targetId ? (host.entityById ? host.entityById(targetId) : others.get(targetId)) : null;
        const stickyOk = validTarget(sticky, self);

        if (isSelfTargetSpell(spell)) {
            return { targetId: self.id | 0, x: self.x | 0, y: self.y | 0, z: self.z | 0 };
        }
        if (mode === 'self') {
            return { targetId: self.id | 0, x: self.x | 0, y: self.y | 0, z: self.z | 0 };
        }
        if (mode === 'active_target') {
            if (!stickyOk) return null;
            return { targetId: sticky.id | 0, x: sticky.x | 0, y: sticky.y | 0, z: sticky.z | 0 };
        }
        if (mode === 'cursor_prompt') {
            return { prompt: true };
        }
        if (stickyOk) {
            return { targetId: sticky.id | 0, x: sticky.x | 0, y: sticky.y | 0, z: sticky.z | 0 };
        }
        if (spell && spell.requiresTarget) {
            const near = nearestOther(self, others);
            if (!near) return null;
            return { targetId: near.id | 0, x: near.x | 0, y: near.y | 0, z: near.z | 0 };
        }
        const Area = (typeof EngineAreaCenters !== 'undefined') ? EngineAreaCenters : null;
        const matrix = spell && spell._areaMatrix;
        if (Area && matrix && others && others.size) {
            const ranked = Area.findTopAreaCenters(self, Array.from(others.values()), matrix, 1);
            if (ranked && ranked[0]) {
                return { targetId: 0, x: ranked[0].x | 0, y: ranked[0].y | 0, z: self.z | 0 };
            }
        }
        const near = nearestOther(self, others);
        if (near) return { targetId: near.id | 0, x: near.x | 0, y: near.y | 0, z: near.z | 0 };
        return { targetId: 0, x: self.x | 0, y: self.y | 0, z: self.z | 0 };
    }

    function createController() {
        const state = {
            host: null,
            doc: emptyDoc(),
            spells: Object.create(null),
            items: Object.create(null),
            classes: { classes: [] },
            catalogs: null,
            characterId: null,
            characterName: '',
            vocation: '',
            profileId: '',
            profiles: {},
            editor: { dock: 'bottom', barId: 1, slot: 0 },
            buckets: Object.create(null),
            bucketDur: Object.create(null),
            lastTick: 0,
            lastTickAt: 0,
            ups: 20,
            sendTimer: 0,
            prompt: null,
            pollTimer: 0,
            slotNodes: [],
            hudKey: null,
            anyOnCooldown: false,
            bound: false,
            visibilityBound: false
        };

        function protocol() {
            const h = state.host;
            if (h && h.protocol) return h.protocol;
            return typeof EngineProtocol !== 'undefined' ? EngineProtocol : null;
        }

        function clockTick() {
            const host = state.host;
            const ups = host && host.getUps ? (host.getUps() | 0) || state.ups : state.ups;
            state.ups = ups || 20;
            const t = host && host.getTick ? (host.getTick() >>> 0) : state.lastTick;
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
            if (t !== state.lastTick) {
                state.lastTick = t;
                state.lastTickAt = now;
            }
            if (!state.lastTickAt) {
                return state.lastTick;
            }
            const elapsed = Math.max(0, (now - state.lastTickAt) / 1000);
            return state.lastTick + elapsed * state.ups;
        }

        function send(opcode, payload) {
            if (state.host && typeof state.host.send === 'function') {
                return state.host.send(opcode, payload);
            }
            return 0;
        }

        function dockEl(side) {
            if (typeof document === 'undefined' || !document.getElementById) return null;
            if (side === 'left') return document.getElementById('actionBarDockLeft');
            if (side === 'right') return document.getElementById('actionBarDockRight');
            if (side === 'bottom') return document.getElementById('actionBarDockBottom');
            return null;
        }

        function elBarId(el) {
            if (!el || typeof el.getAttribute !== 'function') return 1;
            const raw = el.getAttribute('data-bar-id');
            if (raw == null || raw === '') {
                const host = el.closest ? el.closest('[data-bar-id]') : null;
                if (!host || typeof host.getAttribute !== 'function') return 1;
                return (host.getAttribute('data-bar-id') | 0) || 1;
            }
            return (raw | 0) || 1;
        }

        function elSlotIndex(el, fallback) {
            if (!el || typeof el.getAttribute !== 'function') return fallback | 0;
            const raw = el.getAttribute('data-slot');
            if (raw == null || raw === '') return fallback | 0;
            return raw | 0;
        }

        function fallbackKey(barId, index) {
            if ((barId | 0) === 1 && (index | 0) < BAR1_KEYS.length) return defaultKey(index);
            return '';
        }

        function spriteUrl(kind, id) {
            if (!id) return '';
            const Sprites = typeof EngineSprites !== 'undefined' ? EngineSprites : null;
            if (kind === 'item') {
                const meta = state.items[id];
                if (Sprites && typeof Sprites.resolveItemSpriteUrl === 'function') {
                    return Sprites.resolveItemSpriteUrl(meta || id, 'rpg_fantasy') || '';
                }
                return '';
            }
            const sp = state.spells[id];
            const spriteId = (sp && sp.customUISprite) || id;
            if (Sprites && typeof Sprites.spritePath === 'function') {
                return Sprites.spritePath('rpg_fantasy', 'ui', spriteId, 'icon') || '';
            }
            return '/sprites/rpg_fantasy/ui/icon/' + String(spriteId) + '.png';
        }

        function labelOf(kind, id, text) {
            if (kind === 'text') return text || '';
            if (kind === 'item') {
                const it = state.items[id];
                return (it && (it.label || it.name)) || id || '';
            }
            const sp = state.spells[id];
            return (sp && sp.label) || id || '';
        }

        function paintKind(slot) {
            if (!slot || !slot.t) return { t: '', id: '', text: '' };
            if (slot.t !== 'multi') {
                return { t: slot.t, id: slot.id || '', text: slot.text || '', m: slot.m };
            }
            const active = activeMultiSub(slot);
            if (!active) return { t: 'multi', id: '', text: '' };
            return {
                t: active.t,
                id: active.id || '',
                text: active.text || '',
                m: active.m
            };
        }

        function slotStructSig(index, slot, paint, key, count) {
            return [
                index | 0,
                key || '',
                slot && slot.t ? slot.t : '',
                paint.t || '',
                paint.id || '',
                paint.text || '',
                count
            ].join('\n');
        }

        function itemCountOf(id) {
            return countItemId(
                id,
                state.host && state.host.getBag && state.host.getBag(),
                hostOpenBagViews(state.host),
                state.host && state.host.getEquipment && state.host.getEquipment()
            );
        }

        /**
         * Rewrite a slot's icon/badge only when its structure signature changes.
         * Cooldown ticks pass recount:false so a walk-time poll never walks bags.
         */
        function paintSlot(el, slot, index, hotkey, opts) {
            if (!el || typeof el.setAttribute !== 'function' || typeof document === 'undefined') return;
            const recount = !opts || opts.recount !== false;
            const filled = slotFilled(slot);
            const paint = paintKind(slot);
            let count = el._abCount || 0;
            if (filled && paint.t === 'item' && paint.id) {
                if (recount) {
                    count = itemCountOf(paint.id);
                    el._abCount = count;
                }
            } else {
                count = 0;
                el._abCount = 0;
            }
            const key = hotkey || '';
            const sig = slotStructSig(index, slot, paint, key, count);
            if (el._abStruct === sig && el._abOverlay) return;
            el._abStruct = sig;
            el._abSig = '';
            el.className = 'action-bar-slot'
                + (filled ? '' : ' action-bar-slot--empty')
                + (slot && slot.t === 'multi' ? ' action-bar-slot--multi' : '');
            el.setAttribute('data-slot', String(index));
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
            if (key) el.setAttribute('data-hotkey', key);
            else el.removeAttribute('data-hotkey');
            const titleCore = filled
                ? (slot.t === 'multi'
                    ? 'Multi · ' + labelOf(paint.t, paint.id, paint.text)
                    : labelOf(paint.t, paint.id, paint.text))
                : 'Empty';
            el.title = titleCore + (key ? ' (' + key + ')' : '');
            el.textContent = '';
            if (key) {
                const badge = document.createElement('span');
                badge.className = 'slot-hotkey-badge';
                badge.textContent = key;
                el.appendChild(badge);
            }
            if (filled && paint.t === 'text') {
                const prev = document.createElement('span');
                prev.className = 'slot-text-preview';
                prev.textContent = paint.text || '';
                el.appendChild(prev);
            } else if (filled && (paint.t === 'spell' || paint.t === 'item') && paint.id) {
                const img = document.createElement('img');
                img.className = 'slot-icon-thumb';
                img.alt = labelOf(paint.t, paint.id, '');
                img.draggable = false;
                img.src = spriteUrl(paint.t, paint.id);
                img.onerror = function () {
                    this.style.display = 'none';
                };
                el.appendChild(img);
            }
            if (filled && paint.t === 'item' && paint.id) {
                const cbadge = document.createElement('span');
                cbadge.className = 'slot-count-badge';
                cbadge.textContent = count > 999 ? '999+' : String(count);
                el.appendChild(cbadge);
            }
            const overlay = document.createElement('span');
            overlay.className = 'slot-cooldown-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            const timer = document.createElement('span');
            timer.className = 'slot-cooldown-timer';
            overlay.appendChild(timer);
            el.appendChild(overlay);
            el._abOverlay = overlay;
            el._abTimer = timer;
        }

        function faIcon(className) {
            const icon = document.createElement('i');
            icon.className = className;
            icon.setAttribute('aria-hidden', 'true');
            return icon;
        }

        function navButton(label, iconClass, disabled, onClick) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'action-bar-nav-btn';
            btn.title = label;
            btn.disabled = !!disabled;
            btn.setAttribute('aria-label', label);
            btn.appendChild(faIcon(iconClass));
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                if (btn.disabled) return;
                onClick();
            });
            return btn;
        }

        function mountBar(bar) {
            const id = bar.id | 0;
            const vertical = sideOf(id) !== 'bottom';
            const page = clampPage(bar);
            const cap = visibleCount(id);
            const max = maxPageFor(id);
            const locked = !!bar.locked;
            const barEl = document.createElement('div');
            barEl.className = 'action-bar action-bar--' + (vertical ? 'vertical' : 'horizontal')
                + (locked ? ' action-bar--locked' : '');
            barEl.setAttribute('data-bar-id', String(id));
            barEl.setAttribute('data-page', String(page));
            barEl.setAttribute('data-locked', locked ? '1' : '0');

            const tools = document.createElement('div');
            tools.className = 'action-bar-tools';
            const lockBtn = document.createElement('button');
            lockBtn.type = 'button';
            lockBtn.className = 'action-bar-nav-btn action-bar-lock-btn' + (locked ? ' is-locked' : '');
            const lockLabel = locked ? 'Unlock bar' : 'Lock bar';
            lockBtn.title = lockLabel;
            lockBtn.setAttribute('aria-label', lockLabel);
            lockBtn.setAttribute('aria-pressed', locked ? 'true' : 'false');
            lockBtn.appendChild(faIcon(locked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open'));
            lockBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                setBarLocked(!isBarLocked(id), id);
            });
            tools.appendChild(lockBtn);
            barEl.appendChild(tools);

            const startNav = document.createElement('div');
            startNav.className = 'action-bar-nav action-bar-nav--start';
            startNav.appendChild(navButton(
                'First slots',
                vertical ? 'fa-solid fa-angles-up' : 'fa-solid fa-angles-left',
                page <= 0,
                function () { setBarPage(id, 0); }
            ));
            startNav.appendChild(navButton(
                'Previous slots',
                vertical ? 'fa-solid fa-angle-up' : 'fa-solid fa-angle-left',
                page <= 0,
                function () { setBarPage(id, page - 1); }
            ));
            barEl.appendChild(startNav);

            const slotsEl = document.createElement('div');
            slotsEl.className = 'action-bar-slots';
            for (let n = 0; n < cap; n++) {
                const index = page + n;
                const btn = document.createElement('div');
                btn.className = 'action-bar-slot action-bar-slot--empty';
                btn.setAttribute('data-slot', String(index));
                btn.setAttribute('data-bar-id', String(id));
                btn.setAttribute('role', 'button');
                btn.setAttribute('tabindex', '0');
                btn.addEventListener('click', onSlotClick);
                btn.addEventListener('keydown', onSlotKey);
                btn.addEventListener('contextmenu', onSlotContext);
                btn.addEventListener('dragover', onDragOver);
                btn.addEventListener('dragleave', onDragLeave);
                btn.addEventListener('drop', onDrop);
                slotsEl.appendChild(btn);
            }
            barEl.appendChild(slotsEl);

            const endNav = document.createElement('div');
            endNav.className = 'action-bar-nav action-bar-nav--end';
            endNav.appendChild(navButton(
                'Next slots',
                vertical ? 'fa-solid fa-angle-down' : 'fa-solid fa-angle-right',
                page >= max,
                function () { setBarPage(id, page + 1); }
            ));
            endNav.appendChild(navButton(
                'Last slots',
                vertical ? 'fa-solid fa-angles-down' : 'fa-solid fa-angles-right',
                page >= max,
                function () { setBarPage(id, max); }
            ));
            barEl.appendChild(endNav);

            barEl.addEventListener('wheel', function (ev) {
                if (max <= 0) return;
                const dx = ev.deltaX || 0;
                const dy = ev.deltaY || 0;
                const raw = Math.abs(dx) > Math.abs(dy) ? dx : dy;
                if (!raw) return;
                ev.preventDefault();
                setBarPage(id, page + (raw > 0 ? 1 : -1));
            }, { passive: false });
            return barEl;
        }

        function mountDocks(key) {
            const sides = ['bottom', 'left', 'right'];
            for (let s = 0; s < sides.length; s++) {
                const el = dockEl(sides[s]);
                if (!el) continue;
                el.textContent = '';
                if (typeof el.setAttribute === 'function') el.setAttribute('data-hud', key);
                const ids = barsForDock(sides[s]);
                for (let i = 0; i < ids.length; i++) {
                    const bar = barById(state.doc, ids[i]);
                    if (!barShown(bar)) continue;
                    el.appendChild(mountBar(bar));
                }
            }
        }

        function docksReady() {
            return !!(dockEl('bottom') || dockEl('left') || dockEl('right'));
        }

        function hudMounted(key) {
            const sides = ['bottom', 'left', 'right'];
            let seen = false;
            for (let s = 0; s < sides.length; s++) {
                const el = dockEl(sides[s]);
                if (!el) continue;
                seen = true;
                if (typeof el.getAttribute !== 'function' || el.getAttribute('data-hud') !== key) return false;
            }
            return seen;
        }

        function paintVisible(recount) {
            state.slotNodes = [];
            if (typeof document === 'undefined' || !document.querySelectorAll) return;
            const nodes = document.querySelectorAll('.action-bar-dock .action-bar-slot');
            for (let i = 0; i < nodes.length; i++) {
                const el = nodes[i];
                const barId = elBarId(el);
                const index = elSlotIndex(el, i);
                const bar = barById(state.doc, barId);
                const map = slotMap(bar);
                paintSlot(el, map[index] || null, index, keyOnBar(bar, index), { recount: recount !== false });
                state.slotNodes.push(el);
            }
        }

        function render() {
            syncSlotEditor();
            if (!docksReady()) return;
            const key = hudKeyOf(state.doc);
            if (!hudMounted(key)) mountDocks(key);
            state.hudKey = key;
            paintVisible(true);
            paintCooldowns();
        }

        function refreshSlots() {
            if (!docksReady()) return;
            if (state.hudKey == null || !hudMounted(hudKeyOf(state.doc))) {
                render();
                return;
            }
            paintVisible(true);
            paintCooldowns();
        }

        function slotBuckets(slot) {
            if (!slot) return [];
            let kind = slot;
            if (slot.t === 'multi') {
                const sub = activeMultiSub(slot);
                if (!sub) return [];
                kind = sub;
            }
            if (kind.t === 'spell') return spellBuckets(state.spells[kind.id]);
            if (kind.t === 'item') {
                return [{ bucket: 'item.use', sec: 0 }];
            }
            return [];
        }

        function slotReady(slot, tick) {
            const list = slotBuckets(slot);
            let ready = 0;
            let dur = 0;
            for (let i = 0; i < list.length; i++) {
                const b = list[i].bucket;
                const r = state.buckets[b] | 0;
                if (r > ready) {
                    ready = r;
                    dur = state.bucketDur[b] | 0;
                }
            }
            if (!ready) return { remaining: 0, duration: 0 };
            return { remaining: remainingTicks(ready, tick), duration: dur };
        }

        function paintCooldowns() {
            const nodes = state.slotNodes;
            if (!nodes || !nodes.length) return;
            const tick = clockTick();
            const ups = state.ups || 20;
            let any = false;
            for (let i = 0; i < nodes.length; i++) {
                const el = nodes[i];
                const barId = elBarId(el);
                const index = elSlotIndex(el, i);
                const bar = barById(state.doc, barId);
                const map = slotMap(bar);
                const slot = map[index] || null;
                const cd = slotReady(slot, tick);
                const on = cd.remaining > 0;
                if (on) any = true;
                const sig = on ? cdPaintSig(cd.remaining, cd.duration, ups) : '0';
                if (sig === el._abSig) continue;
                el._abSig = sig;
                const overlay = el._abOverlay;
                const timer = el._abTimer;
                if (on) {
                    el.classList.add('action-bar-slot--on-cooldown');
                    if (overlay) {
                        overlay.style.setProperty(
                            '--cd-progress',
                            String(roundCdProgress(cdProgress(cd.remaining, cd.duration)))
                        );
                    }
                    if (timer) timer.textContent = formatCdTimer(cd.remaining, ups);
                } else {
                    el.classList.remove('action-bar-slot--on-cooldown');
                    if (overlay) overlay.style.removeProperty('--cd-progress');
                    if (timer) timer.textContent = '';
                }
            }
            state.anyOnCooldown = any;
            schedulePoll();
        }

        function stopPoll() {
            if (state.pollTimer) {
                clearTimeout(state.pollTimer);
                state.pollTimer = 0;
            }
        }

        function schedulePoll() {
            stopPoll();
            if (!state.anyOnCooldown) return;
            if (typeof setTimeout === 'undefined') return;
            const hidden = typeof document !== 'undefined' && document.hidden;
            const ms = hidden ? POLL_MS_HIDDEN : POLL_MS_CD;
            state.pollTimer = setTimeout(function () {
                state.pollTimer = 0;
                paintCooldowns();
            }, ms);
        }

        function onVisibility() {
            if (!state.anyOnCooldown) return;
            stopPoll();
            paintCooldowns();
        }

        function onCast(fx) {
            if (!fx || !fx.spellId) return;
            if (state.host && state.host.getSelf && fx.sourceId && state.host.getSelf()) {
                const me = state.host.getSelf();
                if (me && me.id && fx.sourceId !== me.id) return;
            }
            const spell = state.spells[fx.spellId];
            const tick = clockTick();
            const ups = state.ups || 20;
            const list = spellBuckets(spell);
            if (!list.length) {
                const d = cdTicks(2, ups);
                state.buckets['primary.attack'] = tick + d;
                state.bucketDur['primary.attack'] = d;
            } else {
                for (let i = 0; i < list.length; i++) {
                    const d = cdTicks(list[i].sec, ups);
                    const ready = tick + d;
                    const prev = state.buckets[list[i].bucket] | 0;
                    if (ready >= prev) {
                        state.buckets[list[i].bucket] = ready;
                        state.bucketDur[list[i].bucket] = d;
                    }
                }
            }
            paintCooldowns();
        }

        function fireCast(slot) {
            const P = protocol();
            const spell = state.spells[slot.id] || { id: slot.id };
            const aim = resolveSpellAim(slot, spell, state.host || {});
            if (!aim) return false;
            if (aim.prompt) {
                armCursorPrompt(slot);
                return true;
            }
            if (state.host && typeof state.host.cast === 'function') {
                return !!state.host.cast(slot.id, aim.targetId, aim.x, aim.y, aim.z);
            }
            if (!P || typeof P.encodeCast !== 'function') return false;
            send(P.C2S.CAST, P.encodeCast({
                spellId: slot.id,
                targetId: aim.targetId,
                x: aim.x,
                y: aim.y,
                z: aim.z
            }));
            return true;
        }

        function armCursorPrompt(slot) {
            state.prompt = slot;
            if (typeof document !== 'undefined') {
                document.documentElement.classList.add('cursor-targeting');
            }
        }

        function clearPrompt() {
            state.prompt = null;
            if (typeof document !== 'undefined') {
                document.documentElement.classList.remove('cursor-targeting');
            }
        }

        function isSubReady(sub) {
            if (!sub || !sub.t || sub.t === 'empty') return false;
            if (sub.t === 'text') return !!(sub.text && String(sub.text).trim());
            if (sub.t === 'spell' && sub.id) {
                const cd = slotReady({ t: 'spell', id: sub.id }, clockTick());
                return !(cd && cd.remaining > 0);
            }
            if (sub.t === 'item' && sub.id) {
                const count = countItemId(
                    sub.id,
                    state.host && state.host.getBag && state.host.getBag(),
                    hostOpenBagViews(state.host),
                    state.host && state.host.getEquipment && state.host.getEquipment()
                );
                return count > 0;
            }
            return false;
        }

        function activeMultiSub(slot) {
            if (!slot || slot.t !== 'multi' || !Array.isArray(slot.multi)) return null;
            let first = null;
            for (let i = 0; i < slot.multi.length; i++) {
                const sub = slot.multi[i];
                if (!sub || sub.t === 'empty') continue;
                if (sub.t === 'spell' && !sub.id) continue;
                if (sub.t === 'item' && !sub.id) continue;
                if (sub.t === 'text' && !(sub.text && String(sub.text).trim())) continue;
                if (!first) first = sub;
                if (isSubReady(sub)) return sub;
            }
            return first;
        }

        function fireText(slot) {
            const text = slot && slot.text != null ? String(slot.text) : '';
            if (!text.trim()) return false;
            if (state.host && typeof state.host.fct === 'function') {
                state.host.fct(text, TEXT_FCT_COLOR);
                return true;
            }
            const CombatFx = typeof EngineCombatFx !== 'undefined' ? EngineCombatFx : null;
            const self = state.host && state.host.getSelf && state.host.getSelf();
            if (CombatFx && typeof CombatFx.pushFct === 'function' && self) {
                CombatFx.pushFct({
                    x: self.x,
                    y: self.y,
                    z: self.z,
                    text: text,
                    color: TEXT_FCT_COLOR,
                    life: 1.2
                });
                return true;
            }
            return false;
        }

        function fireItem(slot) {
            const P = protocol();
            if (!P) return false;
            const loc = findItemLoc(
                slot.id,
                state.host && state.host.getBag && state.host.getBag(),
                hostOpenBagViews(state.host),
                state.host && state.host.getEquipment && state.host.getEquipment()
            );
            if (!loc || loc.kind !== 'container') return false;
            const meta = state.items[slot.id];
            if (itemIsEquipable(meta) && typeof P.encodeEquip === 'function') {
                send(P.C2S.EQUIP, P.encodeEquip(loc.containerId, loc.index, ''));
                return true;
            }
            if (typeof P.encodeContainerSlot === 'function') {
                send(P.C2S.USE_ITEM, P.encodeContainerSlot(loc.containerId, loc.index));
                return true;
            }
            return false;
        }

        function fireSlot(slot) {
            if (!slot || !slot.t) return false;
            if (state.host && state.host.isDowned && state.host.isDowned()) return false;
            if (slot.t === 'spell') return fireCast(slot);
            if (slot.t === 'item') return fireItem(slot);
            if (slot.t === 'text') return fireText(slot);
            if (slot.t === 'multi') {
                const sub = activeMultiSub(slot);
                if (!sub || !isSubReady(sub)) return false;
                return fireSlot({
                    t: sub.t,
                    id: sub.id,
                    m: sub.m || 'smart_target',
                    text: sub.text
                });
            }
            return false;
        }

        function slotAtBar(barId, index) {
            const bar = barById(state.doc, barId);
            const map = slotMap(bar);
            return map[index | 0] || null;
        }

        function onSlotClick(ev) {
            ev.preventDefault();
            const el = ev.currentTarget;
            fireSlot(slotAtBar(elBarId(el), elSlotIndex(el, 0)));
        }

        function onSlotKey(ev) {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            ev.preventDefault();
            const el = ev.currentTarget;
            fireSlot(slotAtBar(elBarId(el), elSlotIndex(el, 0)));
        }

        let generalBridge = null;

        function setGeneralBridge(bridge) {
            generalBridge = bridge || null;
        }

        function modalDeps(barId) {
            const id = barId == null ? 1 : (barId | 0);
            return {
                assignSlot: function (index, spec) { return assignBarSlot(id, index, spec); },
                checkHotkeyConflict: function (hotkey, excludeIndex) {
                    return checkHotkeyConflict(hotkey, excludeIndex, id);
                },
                normalizeHotkey: normalizeHotkey,
                getSpellBook: function () { return state.spells; },
                getVocation: function () { return state.vocation; },
                isBarLocked: function () { return isBarLocked(id); },
                setBarLocked: function (locked) { return setBarLocked(locked, id); },
                generalHotkeyLabel: function (hotkey) {
                    if (!generalBridge || typeof generalBridge.labelFor !== 'function') return '';
                    return generalBridge.labelFor(hotkey) || '';
                },
                releaseGeneralHotkey: function (hotkey) {
                    if (generalBridge && typeof generalBridge.release === 'function') {
                        generalBridge.release(hotkey);
                    }
                },
                resolveUiSpriteUrl: function (spellId) {
                    return spriteUrl('spell', spellId);
                }
            };
        }

        function onSlotContext(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            const Assign = assignApi();
            if (!Assign || typeof Assign.showSlotContextMenu !== 'function') return;
            const el = ev.currentTarget;
            const barId = elBarId(el);
            const i = elSlotIndex(el, 0);
            const existing = slotAtBar(barId, i);
            const slot = Object.assign({ i: i }, existing || {}, { i: i });
            if (!Object.prototype.hasOwnProperty.call(existing || {}, 'k')) slot.k = fallbackKey(barId, i);
            Assign.showSlotContextMenu(ev.clientX, ev.clientY, slot, modalDeps(barId));
        }

        function isBarLocked(barId) {
            const id = barId == null ? 1 : (barId | 0);
            const bar = barById(state.doc, id);
            return !!(bar && bar.locked);
        }

        function setBarLocked(locked, barId) {
            const id = barId == null ? 1 : (barId | 0);
            const doc = state.doc && state.doc.v ? JSON.parse(JSON.stringify(state.doc)) : { v: 1, bars: [] };
            const bar = ensureBar(doc, id);
            bar.locked = !!locked;
            state.doc = doc;
            render();
            queueSave();
            return true;
        }

        function setBarPage(barId, page) {
            const id = (barId | 0) || 1;
            const doc = state.doc && state.doc.v ? JSON.parse(JSON.stringify(state.doc)) : { v: 1, bars: [] };
            const bar = ensureBar(doc, id);
            bar.page = page | 0;
            const clamped = clampPage(bar);
            state.doc = doc;
            render();
            queueSave();
            return clamped;
        }

        function setDockCount(dock, count) {
            const side = dock === 'left' || dock === 'right' ? dock : 'bottom';
            let n = count | 0;
            if (n < 0) n = 0;
            if (n > 3) n = 3;
            const doc = state.doc && state.doc.v ? JSON.parse(JSON.stringify(state.doc)) : { v: 1, bars: [] };
            const ids = barsForDock(side);
            for (let i = 0; i < ids.length; i++) {
                const bar = ensureBar(doc, ids[i]);
                bar.visible = i < n;
            }
            state.doc = doc;
            render();
            queueSave();
            return n;
        }

        function checkHotkeyConflict(hotkey, excludeIndex, excludeBarId) {
            const n = normalizeHotkey(hotkey);
            if (!n) return null;
            const skipBar = excludeBarId == null ? 1 : (excludeBarId | 0);
            const hit = findHotkeySlot(n);
            if (!hit) return null;
            if ((hit.barId | 0) === skipBar && (hit.index | 0) === (excludeIndex | 0)) return null;
            return hit.index;
        }

        function onDragOver(ev) {
            if (isBarLocked(elBarId(ev.currentTarget))) {
                if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none';
                return;
            }
            ev.preventDefault();
            if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
            ev.currentTarget.classList.add('drag-over');
        }

        function onDragLeave(ev) {
            ev.currentTarget.classList.remove('drag-over');
        }

        function tryHandleSlotDrop(element, itemId) {
            if (!element || !itemId || !element.closest) return false;
            const slotEl = element.closest('.action-bar-slot');
            if (!slotEl) return false;
            const barId = elBarId(slotEl);
            if (isBarLocked(barId)) return false;
            const i = elSlotIndex(slotEl, 0);
            const existing = slotAtBar(barId, i);
            return assignBarSlot(barId, i, {
                t: 'item',
                id: String(itemId),
                m: (existing && existing.m) || 'smart_target',
                k: existing && Object.prototype.hasOwnProperty.call(existing, 'k')
                    ? existing.k
                    : fallbackKey(barId, i)
            });
        }

        function onDrop(ev) {
            ev.preventDefault();
            ev.currentTarget.classList.remove('drag-over');
            if (isBarLocked(elBarId(ev.currentTarget))) return;
            const raw = ev.dataTransfer ? (ev.dataTransfer.getData('text/plain') || '') : '';
            const id = parseDropItemId(raw);
            if (!id) return;
            tryHandleSlotDrop(ev.currentTarget, id);
        }

        function persistableSlot(index, spec, prev, barId) {
            const fallback = (barId | 0) === 1 ? defaultKey(index) : '';
            const t = spec && spec.t ? String(spec.t) : '';
            const next = { i: index };
            if (spec && Object.prototype.hasOwnProperty.call(spec, 'k')) {
                next.k = normalizeHotkey(spec.k);
            } else if (prev && Object.prototype.hasOwnProperty.call(prev, 'k')) {
                next.k = normalizeHotkey(prev.k);
            } else {
                next.k = fallback;
            }
            if (t === 'spell' || t === 'item') {
                if (!spec.id) return next.k !== fallback ? next : null;
                next.t = t;
                next.id = String(spec.id);
                next.m = normalizeTargetMode(spec.m || (prev && prev.m));
                return next;
            }
            if (t === 'text') {
                const text = spec.text != null ? String(spec.text) : '';
                if (!text.trim()) return next.k !== fallback ? next : null;
                next.t = 'text';
                next.text = text;
                return next;
            }
            if (t === 'multi') {
                const multi = normalizeMulti(spec.multi);
                let any = false;
                for (let i = 0; i < multi.length; i++) {
                    const s = multi[i];
                    if (s.t === 'spell' && s.id) any = true;
                    if (s.t === 'item' && s.id) any = true;
                    if (s.t === 'text' && s.text && String(s.text).trim()) any = true;
                }
                if (!any) return next.k !== fallback ? next : null;
                next.t = 'multi';
                next.multi = multi;
                return next;
            }
            return next.k !== fallback ? next : null;
        }

        function ensureBar(doc, barId) {
            const id = (barId | 0) || 1;
            let bar = barById(doc, id);
            if (bar) return bar;
            bar = {
                id: id,
                side: sideOf(id),
                visible: id === 1,
                locked: false,
                page: 0,
                slots: []
            };
            doc.bars = doc.bars || [];
            doc.bars.push(bar);
            return bar;
        }

        function keyOnBar(bar, index) {
            if (!bar) return '';
            const map = slotMap(bar);
            const slot = map[index] || null;
            if ((bar.id | 0) === 1) return keyOfSlot(index, slot);
            if (slot && Object.prototype.hasOwnProperty.call(slot, 'k')) return normalizeHotkey(slot.k);
            return '';
        }

        function clearHotkeyEverywhere(doc, hotkey, exceptBarId, exceptIndex) {
            const n = normalizeHotkey(hotkey);
            if (!n || !doc) return;
            const bars = Array.isArray(doc.bars) ? doc.bars : [];
            for (let b = 0; b < bars.length; b++) {
                const bar = bars[b];
                if (!bar) continue;
                const id = bar.id | 0;
                if (!Array.isArray(bar.slots)) bar.slots = [];
                if (id === 1) {
                    for (let i = 0; i < MAX_SLOTS; i++) {
                        if (id === (exceptBarId | 0) && i === (exceptIndex | 0)) continue;
                        if (keyOnBar(bar, i) !== n) continue;
                        let slot = null;
                        for (let s = 0; s < bar.slots.length; s++) {
                            if (bar.slots[s] && (bar.slots[s].i | 0) === i) {
                                slot = bar.slots[s];
                                break;
                            }
                        }
                        if (slot) slot.k = '';
                        else bar.slots.push({ i: i, k: '' });
                    }
                    continue;
                }
                for (let s = 0; s < bar.slots.length; s++) {
                    const slot = bar.slots[s];
                    if (!slot) continue;
                    if (id === (exceptBarId | 0) && (slot.i | 0) === (exceptIndex | 0)) continue;
                    if (normalizeHotkey(slot.k) === n) slot.k = '';
                }
            }
        }

        function assignBarSlot(barId, index, spec) {
            const id = (barId | 0) || 1;
            if (isBarLocked(id)) return false;
            const doc = state.doc && state.doc.v ? JSON.parse(JSON.stringify(state.doc)) : { v: 1, bars: [] };
            const bar = ensureBar(doc, id);
            const prevMap = slotMap(bar);
            const prev = prevMap[index] ? JSON.parse(JSON.stringify(prevMap[index])) : null;
            const next = persistableSlot(index, spec || {}, prev, id);
            const wantKey = next && next.k ? normalizeHotkey(next.k) : '';
            if (wantKey) clearHotkeyEverywhere(doc, wantKey, id, index);
            const slots = [];
            const raw = Array.isArray(bar.slots) ? bar.slots : [];
            for (let i = 0; i < raw.length; i++) {
                const s = raw[i];
                if (!s || (s.i | 0) === (index | 0)) continue;
                slots.push(s);
            }
            if (next) slots.push(next);
            slots.sort(function (a, b) { return (a.i | 0) - (b.i | 0); });
            bar.slots = slots;
            state.doc = doc;
            render();
            queueSave();
            return true;
        }

        function assignSlot(index, spec) {
            return assignBarSlot(1, index, spec);
        }

        function findHotkeySlot(hotkey) {
            const n = normalizeHotkey(hotkey);
            if (!n || !state.doc) return null;
            const bars = Array.isArray(state.doc.bars) ? state.doc.bars : [];
            const ordered = [];
            for (let i = 0; i < bars.length; i++) {
                if (bars[i] && (bars[i].id | 0) === 1) ordered.push(bars[i]);
            }
            for (let i = 0; i < bars.length; i++) {
                if (bars[i] && (bars[i].id | 0) !== 1) ordered.push(bars[i]);
            }
            for (let b = 0; b < ordered.length; b++) {
                const bar = ordered[b];
                const id = bar.id | 0;
                if (id === 1) {
                    for (let i = 0; i < MAX_SLOTS; i++) {
                        if (keyOnBar(bar, i) === n) return { barId: 1, index: i };
                    }
                    continue;
                }
                const map = slotMap(bar);
                const indexes = Object.keys(map);
                for (let i = 0; i < indexes.length; i++) {
                    const index = indexes[i] | 0;
                    if (keyOnBar(bar, index) === n) return { barId: id, index: index };
                }
            }
            return null;
        }

        function clearSlotHotkey(barId, index) {
            const id = (barId | 0) || 1;
            const doc = state.doc && state.doc.v ? JSON.parse(JSON.stringify(state.doc)) : { v: 1, bars: [] };
            const bar = ensureBar(doc, id);
            const at = index | 0;
            if (keyOnBar(bar, at)) {
                let slot = null;
                for (let s = 0; s < bar.slots.length; s++) {
                    if (bar.slots[s] && (bar.slots[s].i | 0) === at) {
                        slot = bar.slots[s];
                        break;
                    }
                }
                if (slot) slot.k = '';
                else if (id === 1) bar.slots.push({ i: at, k: '' });
            }
            state.doc = doc;
            render();
            queueSave();
            return true;
        }

        function prefsApi() {
            if (state.host && state.host.prefs) return state.host.prefs;
            if (typeof EnginePrefs !== 'undefined') return EnginePrefs;
            return null;
        }

        function profilesApi() {
            if (typeof EngineActionBarProfiles !== 'undefined') return EngineActionBarProfiles;
            return null;
        }

        function cloneDoc(doc) {
            if (!doc || typeof doc !== 'object') return emptyDoc();
            return JSON.parse(JSON.stringify(doc));
        }

        function persistNow() {
            const api = prefsApi();
            if (!api || typeof api.saveActionBarProfiles !== 'function') return;
            if (!state.profileId) return;
            if (!state.profiles || typeof state.profiles !== 'object') state.profiles = {};
            state.profiles[state.profileId] = state.doc;
            api.saveActionBarProfiles({
                v: 1,
                lastProfileId: state.profileId,
                profiles: state.profiles
            });
        }

        function syncProfileSelect() {
            const ui = (typeof EngineClientWindow !== 'undefined') ? EngineClientWindow : null;
            const win = ui && typeof ui.attached === 'function' ? ui.attached() : null;
            if (!win || typeof win.setProfiles !== 'function') return;
            const ids = state.profiles && typeof state.profiles === 'object'
                ? Object.keys(state.profiles)
                : [];
            win.setProfiles({
                ids: ids,
                activeId: state.profileId || '',
                onChange: function (nextId) { switchProfile(nextId); },
                onAdd: function (name) { return addProfile(name); },
                onCopy: function (name) { return copyProfile(name); },
                onRename: function (name) { return renameProfile(name); },
                onRemove: function () { return removeProfile(); }
            });
        }

        function currentMap() {
            const next = {};
            const src = state.profiles && typeof state.profiles === 'object' ? state.profiles : {};
            const keys = Object.keys(src);
            for (let i = 0; i < keys.length; i++) {
                next[keys[i]] = keys[i] === state.profileId ? cloneDoc(state.doc) : cloneDoc(src[keys[i]]);
            }
            if (state.profileId && !next[state.profileId]) next[state.profileId] = cloneDoc(state.doc);
            return next;
        }

        function adoptProfileMap(profiles, id) {
            state.profiles = profiles || {};
            const key = id && state.profiles[id] ? id : '';
            state.profileId = key;
            state.doc = key ? cloneDoc(state.profiles[key]) : emptyDoc();
            render();
            persistNow();
            syncProfileSelect();
            return !!key;
        }

        function addProfile(name) {
            const Profiles = profilesApi();
            if (!Profiles || typeof Profiles.addProfile !== 'function') return false;
            const seed = seedBar1(knownSpellsFor(state.classes, state.vocation));
            const result = Profiles.addProfile(currentMap(), name, seed);
            if (!result.ok) return false;
            return adoptProfileMap(result.profiles, result.id);
        }

        function copyProfile(name) {
            const Profiles = profilesApi();
            if (!Profiles || typeof Profiles.copyProfile !== 'function' || !state.profileId) return false;
            const result = Profiles.copyProfile(currentMap(), state.profileId, name);
            if (!result.ok) return false;
            return adoptProfileMap(result.profiles, result.id);
        }

        function renameProfile(name) {
            const Profiles = profilesApi();
            if (!Profiles || typeof Profiles.renameProfile !== 'function' || !state.profileId) return false;
            const result = Profiles.renameProfile(currentMap(), state.profileId, name);
            if (!result.ok) return false;
            return adoptProfileMap(result.profiles, result.id);
        }

        function removeProfile() {
            const Profiles = profilesApi();
            if (!Profiles || typeof Profiles.removeProfile !== 'function' || !state.profileId) return false;
            const result = Profiles.removeProfile(currentMap(), state.profileId);
            if (!result.ok) return false;
            return adoptProfileMap(result.profiles, result.nextId);
        }

        function slotSummary(slot) {
            if (!slotFilled(slot)) return 'Empty';
            if (slot.t === 'spell') return 'Spell ' + (slot.id || '');
            if (slot.t === 'item') return 'Object ' + (slot.id || '');
            if (slot.t === 'text') {
                const text = slot.text ? String(slot.text) : '';
                return text.length > 24 ? ('Text ' + text.slice(0, 24) + '…') : ('Text ' + text);
            }
            if (slot.t === 'multi') return 'Multi';
            return slot.t || 'Empty';
        }

        function focusLiveSlot(barId, index) {
            if (typeof document === 'undefined' || !document.querySelectorAll) return;
            const nodes = document.querySelectorAll('.action-bar-slot');
            const wantBar = String(barId | 0);
            for (let i = 0; i < nodes.length; i++) {
                const el = nodes[i];
                if (!el || String(el.getAttribute('data-slot')) !== String(index)) continue;
                if (String(elBarId(el)) !== wantBar) continue;
                if (typeof el.focus === 'function') el.focus();
                return;
            }
        }

        function selectedSlotRecord() {
            const barId = state.editor.barId | 0;
            const bar = barById(state.doc, barId);
            const map = slotMap(bar);
            const index = state.editor.slot | 0;
            const existing = map[index] || { i: index };
            const slot = Object.assign({ i: index }, existing, { i: index });
            if (!Object.prototype.hasOwnProperty.call(existing, 'k')) {
                slot.k = barId === 1 ? defaultKey(index) : '';
            }
            return slot;
        }

        function editSelected(kind) {
            const barId = state.editor.barId | 0;
            if (isBarLocked(barId)) return false;
            const slot = selectedSlotRecord();
            const deps = modalDeps(barId);
            if (kind === 'clear') {
                return deps.assignSlot(slot.i, {
                    t: '',
                    id: '',
                    text: '',
                    multi: null,
                    k: slot.k || ''
                });
            }
            const Assign = assignApi();
            if (!Assign) return false;
            if (kind === 'spell' && Assign.openAssignSpellModal) Assign.openAssignSpellModal(slot, deps);
            else if (kind === 'object' && Assign.openAssignObjectModal) Assign.openAssignObjectModal(slot, deps);
            else if (kind === 'text' && Assign.openAssignTextModal) Assign.openAssignTextModal(slot, deps);
            else if (kind === 'multi' && Assign.openAssignMultiModal) Assign.openAssignMultiModal(slot, deps);
            else if (kind === 'hotkey' && Assign.openAssignHotkeyModal) Assign.openAssignHotkeyModal(slot, deps);
            else return false;
            return true;
        }

        function syncSlotEditor() {
            if (!state.editor) state.editor = { dock: 'bottom', barId: 1, slot: 0 };
            const ui = (typeof EngineClientWindow !== 'undefined') ? EngineClientWindow : null;
            const win = ui && typeof ui.attached === 'function' ? ui.attached() : null;
            if (!win || typeof win.setSlots !== 'function') return;
            const dock = state.editor.dock === 'left' || state.editor.dock === 'right'
                ? state.editor.dock
                : 'bottom';
            state.editor.dock = dock;
            const ids = barsForDock(dock);
            if (ids.indexOf(state.editor.barId | 0) < 0) state.editor.barId = ids[0];
            const barId = state.editor.barId | 0;
            const bar = barById(state.doc, barId);
            const map = slotMap(bar);
            const page = bar ? clampPage(bar) : 0;
            const count = visibleCount(barId);
            const slots = [];
            for (let n = 0; n < count; n++) {
                const i = page + n;
                const slot = map[i] || null;
                let key = '';
                if (barId === 1) key = keyOfSlot(i, slot);
                else if (slot && Object.prototype.hasOwnProperty.call(slot, 'k')) key = normalizeHotkey(slot.k);
                slots.push({ i: i, k: key, label: slotSummary(slot) });
            }
            win.setSlots({
                dock: dock,
                barId: barId,
                bars: ids.map(function (id) { return { id: id, label: 'Bar ' + id }; }),
                counts: {
                    bottom: dockVisibleCount(state.doc, 'bottom'),
                    left: dockVisibleCount(state.doc, 'left'),
                    right: dockVisibleCount(state.doc, 'right')
                },
                slots: slots,
                locked: isBarLocked(barId),
                selected: state.editor.slot | 0,
                onDock: function (next) {
                    state.editor.dock = next === 'left' || next === 'right' ? next : 'bottom';
                    state.editor.barId = barsForDock(state.editor.dock)[0];
                    state.editor.slot = 0;
                    syncSlotEditor();
                },
                onBar: function (next) {
                    state.editor.barId = next | 0;
                    state.editor.slot = 0;
                    syncSlotEditor();
                },
                onSelect: function (index) {
                    state.editor.slot = index | 0;
                    focusLiveSlot(state.editor.barId, state.editor.slot);
                    syncSlotEditor();
                },
                onEdit: function (kind) { editSelected(kind); },
                onCount: function (nextDock, n) { setDockCount(nextDock, n); }
            });
        }

        function switchProfile(id) {
            const Profiles = profilesApi();
            const key = Profiles && typeof Profiles.findProfileKey === 'function'
                ? Profiles.findProfileKey(state.profiles, id)
                : '';
            if (!key) return false;
            if (key === state.profileId) return true;
            if (state.profileId) state.profiles[state.profileId] = cloneDoc(state.doc);
            state.profileId = key;
            state.doc = cloneDoc(state.profiles[key]);
            render();
            persistNow();
            syncProfileSelect();
            return true;
        }

        function queueSave() {
            if (state.sendTimer) {
                clearTimeout(state.sendTimer);
            }
            state.sendTimer = setTimeout(function () {
                state.sendTimer = 0;
                persistNow();
            }, SET_DEBOUNCE_MS);
        }

        function loadProfileMap() {
            const api = prefsApi();
            if (!api || typeof api.loadActionBarProfiles !== 'function') {
                return Promise.resolve({ v: 1, lastProfileId: '', profiles: {} });
            }
            return api.loadActionBarProfiles().then(function (map) {
                if (!map || typeof map !== 'object') {
                    return { v: 1, lastProfileId: '', profiles: {} };
                }
                return map;
            });
        }

        function adoptMap(map) {
            const stored = map && typeof map === 'object' ? map : {};
            const Profiles = profilesApi();
            const seed = seedBar1(knownSpellsFor(state.classes, state.vocation));
            const label = Profiles && typeof Profiles.classLabel === 'function'
                ? Profiles.classLabel(state.vocation, state.classes)
                : state.vocation;
            const resolved = Profiles && typeof Profiles.resolveProfile === 'function'
                ? Profiles.resolveProfile({
                    characterName: state.characterName,
                    vocationId: state.vocation,
                    vocationLabel: label,
                    profiles: stored.profiles || {},
                    lastProfileId: stored.lastProfileId || '',
                    seedDoc: seed
                })
                : { id: '', created: false, profiles: {} };
            state.profiles = resolved.profiles || {};
            state.profileId = resolved.id || '';
            let doc = state.profileId ? state.profiles[state.profileId] : null;
            let dirty = resolved.created === true;
            if (state.profileId && isEmptyDoc(doc)) {
                doc = seed;
                state.profiles[state.profileId] = doc;
                dirty = true;
            }
            state.doc = doc && typeof doc === 'object' ? doc : emptyDoc();
            render();
            syncProfileSelect();
            const last = stored.lastProfileId != null ? String(stored.lastProfileId) : '';
            if (state.profileId && (dirty || last !== state.profileId)) persistNow();
        }

        function onEnter(info) {
            const id = info && (info.characterId != null ? info.characterId : info.id);
            state.characterId = id;
            state.characterName = info && (info.name || info.characterName)
                ? String(info.name || info.characterName)
                : '';
            state.vocation = info && info.vocation ? String(info.vocation) : '';
            return loadCatalogs().then(loadProfileMap).then(adoptMap).catch(function () {
                adoptMap({ v: 1, lastProfileId: '', profiles: {} });
            });
        }

        function onKeyDown(ev) {
            if (!state.host || (state.host.isDowned && state.host.isDowned())) return;
            const Assign = assignApi();
            if (Assign && Assign.isBusy && Assign.isBusy()) return;
            if (typeof EngineKeyboardWalk !== 'undefined'
                && typeof EngineKeyboardWalk.isTypingTarget === 'function') {
                if (EngineKeyboardWalk.isTypingTarget(ev.target)) return;
            } else {
                const tag = ev.target && ev.target.tagName;
                if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            }
            const combo = Assign && Assign.eventToHotkeyString
                ? Assign.eventToHotkeyString(ev)
                : (ev.key ? String(ev.key).toUpperCase() : '');
            if (!combo) return;
            if (Assign && Assign.isBlockedHotkey && Assign.isBlockedHotkey(combo)) return;
            const found = findHotkeySlot(combo);
            if (!found) return;
            const bar = barById(state.doc, found.barId);
            const map = slotMap(bar);
            const slot = map[found.index] || null;
            if (!slotFilled(slot)) return;
            ev.preventDefault();
            fireSlot(slot);
        }

        function onCanvasPointer(ev) {
            if (!state.prompt) return;
            if (ev.button !== 0) return;
            const slot = state.prompt;
            clearPrompt();
            const tile = state.host && state.host.canvasTile && state.host.canvasTile(ev);
            if (!tile) return;
            ev.preventDefault();
            ev.stopPropagation();
            const hit = state.host.entityAtTile ? state.host.entityAtTile(tile) : null;
            const P = protocol();
            const targetId = hit && hit.id ? (hit.id | 0) : 0;
            if (state.host && typeof state.host.cast === 'function') {
                state.host.cast(slot.id, targetId, tile.x, tile.y, tile.z);
                return;
            }
            if (P && typeof P.encodeCast === 'function') {
                send(P.C2S.CAST, P.encodeCast({
                    spellId: slot.id,
                    targetId: targetId,
                    x: tile.x,
                    y: tile.y,
                    z: tile.z
                }));
            }
        }

        function fetchJson(url) {
            if (typeof fetch === 'undefined') return Promise.resolve(null);
            return fetch(url).then(function (res) {
                if (!res.ok) return null;
                return res.json();
            }).catch(function () { return null; });
        }

        function loadCatalogs() {
            if (state.catalogs) return state.catalogs;
            state.catalogs = Promise.all([
                fetchJson('/content/spells-ui.json'),
                fetchJson('/content/equipment.json'),
                fetchJson('/content/classes-ui.json')
            ]).then(function (rows) {
                const spells = rows[0];
                const items = rows[1];
                const classes = rows[2];
                if (spells) {
                    const list = Array.isArray(spells.spells) ? spells.spells : [];
                    for (let i = 0; i < list.length; i++) {
                        if (list[i] && list[i].id) state.spells[list[i].id] = list[i];
                    }
                }
                if (items) {
                    const list = Array.isArray(items.items) ? items.items : [];
                    for (let i = 0; i < list.length; i++) {
                        if (list[i] && list[i].id) state.items[list[i].id] = list[i];
                    }
                }
                if (classes && Array.isArray(classes.classes)) {
                    state.classes = classes;
                }
                render();
            });
            return state.catalogs;
        }

        function bindHost(host) {
            state.host = host || null;
            if (state.bound) {
                render();
                return;
            }
            state.bound = true;
            loadCatalogs();
            if (typeof window !== 'undefined') {
                window.addEventListener('keydown', onKeyDown);
                const canvas = document.getElementById('world');
                if (canvas) {
                    canvas.addEventListener('pointerdown', onCanvasPointer, true);
                }
                if (!state.visibilityBound && typeof document !== 'undefined') {
                    document.addEventListener('visibilitychange', onVisibility);
                    state.visibilityBound = true;
                }
            }
            render();
        }

        function reset() {
            stopPoll();
            state.doc = emptyDoc();
            state.buckets = Object.create(null);
            state.bucketDur = Object.create(null);
            state.characterId = null;
            state.characterName = '';
            state.profileId = '';
            state.profiles = {};
            state.anyOnCooldown = false;
            state.hudKey = null;
            clearPrompt();
            const Assign = assignApi();
            if (Assign && Assign.closeAll) Assign.closeAll();
            render();
            syncProfileSelect();
        }

        return {
            bindHost: bindHost,
            onEnter: onEnter,
            onCast: onCast,
            reset: reset,
            render: render,
            fireSlot: fireSlot,
            assignSlot: assignSlot,
            assignBarSlot: assignBarSlot,
            findHotkeySlot: findHotkeySlot,
            clearSlotHotkey: clearSlotHotkey,
            addProfile: addProfile,
            copyProfile: copyProfile,
            renameProfile: renameProfile,
            removeProfile: removeProfile,
            setGeneralBridge: setGeneralBridge,
            switchProfile: switchProfile,
            setBarLocked: setBarLocked,
            setBarPage: setBarPage,
            setDockCount: setDockCount,
            refreshSlots: refreshSlots,
            tryHandleSlotDrop: tryHandleSlotDrop,
            _state: state
        };
    }

    const live = createController();

    return {
        VISIBLE_SLOTS: VISIBLE_SLOTS,
        VISIBLE_SLOTS_VERTICAL: VISIBLE_SLOTS_VERTICAL,
        MAX_SLOTS: MAX_SLOTS,
        BAR1_KEYS: BAR1_KEYS,
        MULTI_ACTION_DEPTH: MULTI_ACTION_DEPTH,
        SET_DEBOUNCE_MS: SET_DEBOUNCE_MS,
        POLL_MS_CD: POLL_MS_CD,
        POLL_MS_HIDDEN: POLL_MS_HIDDEN,
        cdTicks: cdTicks,
        remainingTicks: remainingTicks,
        cdProgress: cdProgress,
        formatCdTimer: formatCdTimer,
        cdPaintSig: cdPaintSig,
        roundCdProgress: roundCdProgress,
        findItemLoc: findItemLoc,
        itemIsEquipable: itemIsEquipable,
        resolveSpellAim: resolveSpellAim,
        isSelfTargetSpell: isSelfTargetSpell,
        normalizeHotkey: normalizeHotkey,
        normalizeMulti: normalizeMulti,
        parseDropItemId: parseDropItemId,
        countItemId: countItemId,
        slotFilled: slotFilled,
        create: createController,
        seedBar1: seedBar1,
        isEmptyDoc: isEmptyDoc,
        barShown: barShown,
        dockVisibleCount: dockVisibleCount,
        maxPageFor: maxPageFor,
        knownSpellsFor: knownSpellsFor,
        bindHost: function (host) { return live.bindHost(host); },
        onEnter: function (info) { return live.onEnter(info); },
        switchProfile: function (id) { return live.switchProfile(id); },
        addProfile: function (name) { return live.addProfile(name); },
        copyProfile: function (name) { return live.copyProfile(name); },
        renameProfile: function (name) { return live.renameProfile(name); },
        removeProfile: function () { return live.removeProfile(); },
        findHotkeySlot: function (hotkey) { return live.findHotkeySlot(hotkey); },
        clearSlotHotkey: function (barId, index) { return live.clearSlotHotkey(barId, index); },
        setGeneralBridge: function (bridge) { return live.setGeneralBridge(bridge); },
        onCast: function (fx) { return live.onCast(fx); },
        reset: function () { return live.reset(); },
        refreshSlots: function () { return live.refreshSlots(); },
        tryHandleSlotDrop: function (el, id) { return live.tryHandleSlotDrop(el, id); }
    };
});
