'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fe = require('../static/js/protocol.js');

function main() {
    assert.strictEqual(fe.C2S.ENTER, 1);
    assert.strictEqual(fe.C2S.MOVE_STEP, 10);
    assert.strictEqual(fe.C2S.USE_STAIR, 13);
    assert.strictEqual(fe.C2S.USE, 14);
    assert.strictEqual(fe.C2S.USE_ITEM_WITH, 15);
    assert.strictEqual(fe.C2S.SHOP_SELL, 34);
    assert.strictEqual(fe.S2C.HELLO, 100);
    assert.strictEqual(fe.S2C.SHOP, 132);
    assert.strictEqual(fe.S2C.SKILLS, 124);
    assert.strictEqual(fe.S2C.WORLD_PIN, 125);
    assert.strictEqual(fe.S2C.WORLD_PIN_GONE, 126);
    assert.strictEqual(fe.SKILL_ORDER.length, 8);
    assert.strictEqual(fe.REASON.LOGOUT, 16);
    assert.strictEqual(fe.APPEAR_FLAG.NPC, 1);

    const payload = fe.hexToBytes('aa'.repeat(32));
    assert.strictEqual(payload.length, 32);
    assert.strictEqual(payload[0], 0xaa);
    assert.strictEqual(payload[31], 0xaa);

    const frame = fe.encodeFrame(1, 1, payload);
    assert.strictEqual(frame.length, 6 + 32);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    assert.strictEqual(view.getUint16(0, true), 1);
    assert.strictEqual(view.getUint32(2, true), 1);

    const r = new fe.Reader(frame);
    assert.strictEqual(r.u16(), 1);
    assert.strictEqual(r.u32(), 1);

    const shop = fe.encodeStrPayload(42, 3, 'gold_coin');
    const sr = new fe.Reader(shop);
    assert.strictEqual(sr.u32(), 42);
    assert.strictEqual(sr.u16(), 3);
    assert.strictEqual(sr.str(), 'gold_coin');

    const serverPath = path.join(__dirname, '../../server/src/protocol/opcodes.js');
    if (fs.existsSync(serverPath)) {
        const se = require(serverPath);
        assert.deepStrictEqual({ ...fe.C2S }, { ...se.C2S });
        assert.deepStrictEqual({ ...fe.S2C }, { ...se.S2C });
        for (const k of Object.keys(fe.REASON)) {
            assert.strictEqual(fe.REASON[k], se.REASON[k], k);
        }
        assert.strictEqual(fe.APPEAR_FLAG.NPC, se.APPEAR_FLAG.NPC);
        const messages = require(path.join(__dirname, '../../server/src/protocol/messages.js'));
        const look = messages.decodeAppear(messages.encodeAppear({
            id: 9, name: 'Rat', x: 1, y: 2, z: 6, hp: 5, hpMax: 20, kind: 'rat'
        }));
        assert.strictEqual(look.look, 'rat');
        assert.strictEqual(look.name, 'Rat');
    }

    console.log('ok protocol');
}

main();
