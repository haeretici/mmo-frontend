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
        SET_AUTO_CHASE: 12,
        USE_STAIR: 13,
        USE: 14,
        USE_ITEM_WITH: 15,
        CAST: 16,
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

    function encodeUnequip(slot) {
        const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
        const slotb = enc ? enc.encode(String(slot || '')) : Buffer.from(String(slot || ''), 'utf8');
        const p = new Uint8Array(1 + slotb.length);
        p[0] = slotb.length;
        p.set(slotb, 1);
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
    }

    return {
        C2S,
        S2C,
        REASON,
        APPEAR_FLAG,
        SWING_FLAG,
        SKILL_ORDER,
        hexToBytes,
        encodeFrame,
        u32buf,
        encodeTileUse,
        encodeUseItemWith,
        encodeStrPayload,
        encodeContainerSlot,
        encodeEquip,
        encodeUnequip,
        Reader
    };
});
