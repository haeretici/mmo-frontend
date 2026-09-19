'use strict';

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineProtocol = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const C2S = Object.freeze({
        ENTER: 1,
        PING: 2,
        LOGOUT: 3,
        MOVE_STEP: 10,
        SET_TARGET: 11,
        // 12 unused (chase is local MOVE_PATH)
        USE_STAIR: 13,
        USE: 14,
        USE_ITEM_WITH: 15,
        CAST: 16,
        // 17 unused (was SET_HOTKEYS; bars are client IndexedDB)
        MOVE_PATH: 18,
        OPEN_CORPSE: 20,
        LOOT_TAKE: 21,
        LOOT_CLOSE: 22,
        TALK: 30,
        TALK_REPLY: 31,
        TALK_CLOSE: 32,
        SHOP_BUY: 33,
        SHOP_SELL: 34,
        EQUIP: 40,
        UNEQUIP: 41,
        MOVE_ITEM: 42,
        USE_ITEM: 43,
        OPEN_BAG: 44
    });

    const S2C = Object.freeze({
        HELLO: 100,
        ENTER_WORLD: 101,
        KICK: 102,
        REJECT: 103,
        PONG: 104,
        VIEWPORT: 110,
        APPEAR: 111,
        DISAPPEAR: 112,
        MOVE: 113,
        STATS: 114,
        SWING: 115,
        DEATH: 116,
        CORPSE: 117,
        CORPSE_GONE: 118,
        CONTAINER: 119,
        ITEM_GAIN: 120,
        EXP: 121,
        INVENTORY: 122,
        SAY: 123,
        SKILLS: 124,
        WORLD_PIN: 125,
        WORLD_PIN_GONE: 126,
        EQUIPMENT: 127,
        BAG: 128,
        CAST: 129,
        DIALOG: 130,
        DIALOG_CLOSE: 131,
        SHOP: 132,
        FIELD: 133,
        FIELD_GONE: 134
        // 135 unused (was HOTKEYS; bars are client IndexedDB)
    });

    const REASON = Object.freeze({
        BAD_FRAME: 1,
        BAD_TOKEN: 2,
        UNAUTHORIZED: 5,
        WORLD_FULL: 6,
        ALREADY_ONLINE: 7,
        RATE_LIMITED: 8,
        UNKNOWN_OPCODE: 9,
        NOT_IMPLEMENTED: 10,
        NOT_ENTERED: 11,
        TIMEOUT: 12,
        IP_MISMATCH: 13,
        BANNED: 14,
        REPLACED: 15,
        LOGOUT: 16,
        BAD_SEQ: 17,
        BLOCKED: 18,
        BUSY: 19,
        NO_TARGET: 20,
        OUT_OF_RANGE: 21
    });

    const APPEAR_FLAG = Object.freeze({ NPC: 1 });
    const SWING_FLAG = Object.freeze({ MISS: 1, DEATH: 2, CRIT: 4, FATAL: 8 });
    const SWING_ELEMENT = Object.freeze({
        PHYSICAL: 0,
        FIRE: 1,
        ICE: 2,
        ENERGY: 3,
        EARTH: 4,
        DEATH: 5,
        HOLY: 6,
        HEALING: 7,
        POISON: 8,
        LIFEDRAIN: 9,
        MANADRAIN: 10
    });
    const SWING_ELEMENT_NAMES = Object.freeze([
        'physical', 'fire', 'ice', 'energy', 'earth', 'death', 'holy',
        'healing', 'poison', 'lifedrain', 'manadrain'
    ]);

    function swingElementId(name) {
        if (typeof name === 'number' && Number.isFinite(name)) {
            const n = name | 0;
            return n >= 0 && n < SWING_ELEMENT_NAMES.length ? n : SWING_ELEMENT.PHYSICAL;
        }
        if (name == null || name === '') return SWING_ELEMENT.PHYSICAL;
        const s = String(name).toLowerCase();
        const i = SWING_ELEMENT_NAMES.indexOf(s);
        return i >= 0 ? i : SWING_ELEMENT.PHYSICAL;
    }

    function swingElementName(id) {
        return SWING_ELEMENT_NAMES[id | 0] || 'physical';
    }

    function fieldCreatedAtMs(createdTick, lastTick, ups, nowMs) {
        const now = Number(nowMs) || 0;
        if (createdTick == null || createdTick === '' || lastTick == null) return now;
        const u = Math.max(1, Number(ups) || 20);
        const elapsedSec = Math.max(0, ((lastTick | 0) - (createdTick | 0)) / u);
        return now - elapsedSec * 1000;
    }

    const SKILL_ORDER = Object.freeze([
        'fist', 'club', 'sword', 'axe', 'distance', 'shielding', 'magic', 'fishing'
    ]);

    function hexToBytes(hex) {
        const out = new Uint8Array(32);
        if (typeof hex !== 'string' || hex.length < 64) return out;
        for (let i = 0; i < 32; i++) {
            out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    function encodeFrame(opcode, seq, payload) {
        const p = payload || new Uint8Array(0);
        const out = new Uint8Array(6 + p.length);
        const v = new DataView(out.buffer);
        v.setUint16(0, opcode, true);
        v.setUint32(2, seq >>> 0, true);
        out.set(p, 6);
        return out;
    }

    function u32buf(n) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setUint32(0, n >>> 0, true);
        return b;
    }

    function encodeTileUse(x, y, z) {
        const p = new Uint8Array(5);
        const v = new DataView(p.buffer);
        v.setInt16(0, x | 0, true);
        v.setInt16(2, y | 0, true);
        v.setInt8(4, z | 0);
        return p;
    }

    function encodeUseItemWith(x, y, z, itemId) {
        const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
        const idb = enc ? enc.encode(itemId) : Buffer.from(String(itemId), 'utf8');
        const p = new Uint8Array(5 + 1 + idb.length);
        const v = new DataView(p.buffer);
        v.setInt16(0, x | 0, true);
        v.setInt16(2, y | 0, true);
        v.setInt8(4, z | 0);
        p[5] = idb.length;
        p.set(idb, 6);
        return p;
    }

    function encodeContainerSlot(containerId, index) {
        const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
        const idb = enc ? enc.encode(String(containerId || '')) : Buffer.from(String(containerId || ''), 'utf8');
        const p = new Uint8Array(1 + idb.length + 1);
        p[0] = idb.length;
        p.set(idb, 1);
        p[1 + idb.length] = index & 0xff;
        return p;
    }

    function encodeEquip(containerId, index, slot) {
        const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
        const idb = enc ? enc.encode(String(containerId || '')) : Buffer.from(String(containerId || ''), 'utf8');
        const slotb = enc ? enc.encode(String(slot || '')) : Buffer.from(String(slot || ''), 'utf8');
        const p = new Uint8Array(1 + idb.length + 1 + 1 + slotb.length);
        p[0] = idb.length;
        p.set(idb, 1);
        p[1 + idb.length] = index & 0xff;
        p[2 + idb.length] = slotb.length;
        p.set(slotb, 3 + idb.length);
        return p;
    }

    const LOC_KIND = Object.freeze({
        CONTAINER: 0,
        EQUIPMENT: 1
    });

    function encodeUnequip(slot) {
        const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
        const slotb = enc ? enc.encode(String(slot || '')) : Buffer.from(String(slot || ''), 'utf8');
        const p = new Uint8Array(1 + slotb.length);
        p[0] = slotb.length;
        p.set(slotb, 1);
        return p;
    }

    function writeItemLoc(loc) {
        const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
        const isEquip = loc && (loc.kind === 'equipment' || loc.kind === LOC_KIND.EQUIPMENT || (loc.slot && !loc.containerUid && !loc.containerId));
        if (isEquip) {
            const slotb = enc ? enc.encode(String(loc.slot || '')) : Buffer.from(String(loc.slot || ''), 'utf8');
            const b = new Uint8Array(1 + 1 + slotb.length);
            b[0] = LOC_KIND.EQUIPMENT;
            b[1] = slotb.length;
            b.set(slotb, 2);
            return b;
        }
        const cid = String((loc && (loc.containerUid || loc.containerId)) || 'root');
        const cidb = enc ? enc.encode(cid) : Buffer.from(cid, 'utf8');
        const idx = ((loc && (loc.index != null ? loc.index : loc.slotIndex))) | 0;
        const b = new Uint8Array(1 + 1 + cidb.length + 1);
        b[0] = LOC_KIND.CONTAINER;
        b[1] = cidb.length;
        b.set(cidb, 2);
        b[2 + cidb.length] = idx & 0xff;
        return b;
    }

    function encodeMoveItem(from, to, count) {
        const bFrom = writeItemLoc(from);
        const bTo = writeItemLoc(to);
        const p = new Uint8Array(bFrom.length + bTo.length + 2);
        p.set(bFrom, 0);
        p.set(bTo, bFrom.length);
        const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
        v.setUint16(bFrom.length + bTo.length, (count || 0) & 0xffff, true);
        return p;
    }

    function encodeStrPayload(npcId, count, itemId) {
        const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
        const idb = enc ? enc.encode(itemId) : Buffer.from(String(itemId), 'utf8');
        const p = new Uint8Array(4 + 2 + 1 + idb.length);
        const v = new DataView(p.buffer);
        v.setUint32(0, npcId >>> 0, true);
        v.setUint16(4, count, true);
        p[6] = idb.length;
        p.set(idb, 7);
        return p;
    }

    class Reader {
        constructor(buf) {
            this.b = buf;
            this.v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
            this.o = 0;
        }
        u8() { return this.v.getUint8(this.o++); }
        i8() { const x = this.v.getInt8(this.o); this.o += 1; return x; }
        u16() { const x = this.v.getUint16(this.o, true); this.o += 2; return x; }
        i16() { const x = this.v.getInt16(this.o, true); this.o += 2; return x; }
        u32() { const x = this.v.getUint32(this.o, true); this.o += 4; return x; }
        str() {
            const n = this.u8();
            const slice = this.b.subarray(this.o, this.o + n);
            this.o += n;
            if (typeof TextDecoder === 'function') {
                return new TextDecoder().decode(slice);
            }
            return Buffer.from(slice).toString('utf8');
        }
        rest() {
            return this.b.subarray(this.o);
        }
    }

    function encodeMovePath(dirs) {
        const list = dirs || [];
        const n = Math.min(255, list.length);
        const p = new Uint8Array(1 + n);
        p[0] = n;
        for (let i = 0; i < n; i++) p[1 + i] = list[i] & 0xff;
        return p;
    }

    function encodeCast({ spellId, targetId, x, y, z }) {
        const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
        const sid = enc ? enc.encode(String(spellId || '')) : Buffer.from(String(spellId || ''), 'utf8');
        const p = new Uint8Array(1 + sid.length + 4 + 2 + 2 + 1);
        p[0] = sid.length & 0xff;
        p.set(sid, 1);
        const offset = 1 + sid.length;
        const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
        v.setUint32(offset, (targetId || 0) >>> 0, true);
        v.setInt16(offset + 4, (x || 0) | 0, true);
        v.setInt16(offset + 6, (y || 0) | 0, true);
        v.setInt8(offset + 8, (z || 0) | 0);
        return p;
    }

    function decodeCastFx(payload) {
        const r = new Reader(payload);
        return {
            sourceId: r.u32(),
            spellId: r.str(),
            targetId: r.u32(),
            x: r.i16(),
            y: r.i16(),
            z: r.i8(),
            flags: r.rest().length ? r.u8() : 0
        };
    }

    function decodeAppear(payload) {
        const r = new Reader(payload);
        return {
            id: r.u32(),
            name: r.str(),
            x: r.i16(),
            y: r.i16(),
            z: r.i8(),
            hp: r.u16(),
            hpMax: r.u16(),
            flags: r.rest().length ? r.u8() : 0,
            look: r.rest().length ? r.str() : '',
            dir: r.rest().length ? r.u8() : 0
        };
    }

    function decodeSwing(payload) {
        const r = new Reader(payload);
        const out = {
            sourceId: r.u32(),
            targetId: r.u32(),
            amount: r.u16(),
            flags: r.u8(),
            element: 0,
            weaponId: '',
            ammoId: ''
        };
        if (r.rest().length) out.element = r.u8();
        if (r.rest().length) out.weaponId = r.str();
        if (r.rest().length) out.ammoId = r.str();
        return out;
    }

    function decodeField(payload) {
        const r = new Reader(payload);
        const out = {
            x: r.i16(),
            y: r.i16(),
            z: r.i8(),
            kind: r.str(),
            flags: 0,
            createdTick: null
        };
        if (r.rest().length) out.flags = r.u8();
        if (r.rest().length >= 4) out.createdTick = r.u32();
        return out;
    }

    function decodeFieldGone(payload) {
        const r = new Reader(payload);
        return { x: r.i16(), y: r.i16(), z: r.i8() };
    }

    function decodeSay(payload) {
        const r = new Reader(payload);
        const out = { text: r.str(), speakerId: 0, yell: false };
        if (r.rest().length >= 4) out.speakerId = r.u32();
        if (r.rest().length) out.yell = r.u8() !== 0;
        return out;
    }

    return {
        C2S,
        S2C,
        REASON,
        APPEAR_FLAG,
        SWING_FLAG,
        SWING_ELEMENT,
        SWING_ELEMENT_NAMES,
        SKILL_ORDER,
        LOC_KIND,
        hexToBytes,
        encodeFrame,
        u32buf,
        encodeTileUse,
        encodeUseItemWith,
        encodeStrPayload,
        encodeContainerSlot,
        encodeEquip,
        encodeUnequip,
        encodeMoveItem,
        encodeMovePath,
        encodeCast,
        decodeCastFx,
        decodeAppear,
        decodeSwing,
        decodeField,
        decodeFieldGone,
        decodeSay,
        swingElementId,
        swingElementName,
        fieldCreatedAtMs,
        Reader
    };
});
