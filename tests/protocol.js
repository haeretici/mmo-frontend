'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fe = require('../static/js/protocol.js');

function main() {
    assert.strictEqual(fe.C2S.ENTER, 1);
    assert.strictEqual(fe.C2S.MOVE_STEP, 10);
    assert.strictEqual(fe.C2S.MOVE_PATH, 18);
    assert.strictEqual(fe.C2S.USE_STAIR, 13);
    assert.strictEqual(fe.C2S.USE, 14);
    assert.strictEqual(fe.C2S.USE_ITEM_WITH, 15);
    assert.strictEqual(fe.C2S.CAST, 16);
    assert.ok(!Object.prototype.hasOwnProperty.call(fe.C2S, 'SET_HOTKEYS'));
    assert.strictEqual(fe.S2C.CAST, 129);
    assert.ok(!Object.prototype.hasOwnProperty.call(fe.S2C, 'HOTKEYS'));
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

    assert.strictEqual(fe.LOC_KIND.CONTAINER, 0);
    assert.strictEqual(fe.LOC_KIND.EQUIPMENT, 1);
    const movePayload = fe.encodeMoveItem(
        { kind: 'container', containerUid: 'root', index: 2 },
        { kind: 'equipment', slot: 'head' },
        5
    );
    assert.ok(movePayload.length > 0);

    const serverPath = path.join(__dirname, '../../server/src/protocol/opcodes.js');
    if (fs.existsSync(serverPath)) {
        const se = require(serverPath);
        assert.deepStrictEqual({ ...fe.C2S }, { ...se.C2S });
        assert.deepStrictEqual({ ...fe.S2C }, { ...se.S2C });
        for (const k of Object.keys(fe.REASON)) {
            assert.strictEqual(fe.REASON[k], se.REASON[k], k);
        }
        assert.strictEqual(fe.APPEAR_FLAG.NPC, se.APPEAR_FLAG.NPC);
        assert.strictEqual(fe.LOC_KIND.CONTAINER, se.LOC_KIND.CONTAINER);
        assert.strictEqual(fe.LOC_KIND.EQUIPMENT, se.LOC_KIND.EQUIPMENT);
        const messages = require(path.join(__dirname, '../../server/src/protocol/messages.js'));
        assert.strictEqual(fe.SWING_ELEMENT.FIRE, se.SWING_ELEMENT.FIRE);
        assert.strictEqual(fe.swingElementName(se.SWING_ELEMENT.FIRE), 'fire');
        const look = messages.decodeAppear(messages.encodeAppear({
            id: 9, name: 'Rat', x: 1, y: 2, z: 6, hp: 5, hpMax: 20, kind: 'rat', dir: 3
        }));
        assert.strictEqual(look.look, 'rat');
        assert.strictEqual(look.name, 'Rat');
        assert.strictEqual(look.dir, 3);
        const feAppear = fe.decodeAppear(messages.encodeAppear({
            id: 9, name: 'Rat', x: 1, y: 2, z: 6, hp: 5, hpMax: 20, kind: 'rat', dir: 3
        }));
        assert.strictEqual(feAppear.dir, 3);
        assert.strictEqual(feAppear.look, 'rat');

        const decodedMove = messages.decodeMoveItem(movePayload);
        assert.strictEqual(decodedMove.from.kind, 'container');
        assert.strictEqual(decodedMove.from.containerUid, 'root');
        assert.strictEqual(decodedMove.from.index, 2);
        assert.strictEqual(decodedMove.to.kind, 'equipment');
        assert.strictEqual(decodedMove.to.slot, 'head');
        assert.strictEqual(decodedMove.count, 5);

        // Cast parity: frontend encoder -> server decoder
        const castBuf = fe.encodeCast({ spellId: 'snap_jab', targetId: 101, x: 12, y: 15, z: 6 });
        const srvDecodedCast = messages.decodeCast(castBuf);
        assert.strictEqual(srvDecodedCast.spellId, 'snap_jab');
        assert.strictEqual(srvDecodedCast.targetId, 101);
        assert.strictEqual(srvDecodedCast.x, 12);
        assert.strictEqual(srvDecodedCast.y, 15);
        assert.strictEqual(srvDecodedCast.z, 6);

        // CastFx parity: server encoder -> frontend decoder
        const srvFxBuf = messages.encodeCastFx({ sourceId: 1, spellId: 'snap_jab', targetId: 2, x: 10, y: 11, z: 7, flags: 0 });
        const feDecodedFx = fe.decodeCastFx(srvFxBuf);
        assert.strictEqual(feDecodedFx.sourceId, 1);
        assert.strictEqual(feDecodedFx.spellId, 'snap_jab');
        assert.strictEqual(feDecodedFx.targetId, 2);
        assert.strictEqual(feDecodedFx.x, 10);
        assert.strictEqual(feDecodedFx.y, 11);
        assert.strictEqual(feDecodedFx.z, 7);

        // Field parity: server encoder -> frontend decoder
        const srvFieldBuf = messages.encodeField({
            x: 14, y: 16, z: 7, kind: 'fire', isObstacle: false, source: 'player', createdTick: 40
        });
        const feDecodedField = fe.decodeField(srvFieldBuf);
        assert.strictEqual(feDecodedField.x, 14);
        assert.strictEqual(feDecodedField.y, 16);
        assert.strictEqual(feDecodedField.z, 7);
        assert.strictEqual(feDecodedField.kind, 'fire');
        assert.strictEqual(feDecodedField.flags, 2);
        assert.strictEqual(feDecodedField.createdTick, 40);
        const oldField = fe.decodeField(srvFieldBuf.subarray(0, srvFieldBuf.length - 4));
        assert.strictEqual(oldField.kind, 'fire');
        assert.strictEqual(oldField.createdTick, null);
        assert.strictEqual(fe.fieldCreatedAtMs(0, 40, 20, 100000), 100000 - 2000);

        const srvSwingBuf = messages.encodeSwing({
            sourceId: 1, targetId: 2, amount: 9, flags: 0, element: 'fire', weaponId: 'ember_wand'
        });
        const feSwing = fe.decodeSwing(srvSwingBuf);
        assert.strictEqual(feSwing.element, fe.SWING_ELEMENT.FIRE);
        assert.strictEqual(feSwing.weaponId, 'ember_wand');
        assert.strictEqual(fe.swingElementName(feSwing.element), 'fire');
        const oldSwing = fe.decodeSwing(srvSwingBuf.subarray(0, 11));
        assert.strictEqual(oldSwing.amount, 9);
        assert.strictEqual(oldSwing.element, 0);

        const srvSayBuf = messages.encodeSay('Need directions?', { speakerId: 42, yell: true });
        const feSay = fe.decodeSay(srvSayBuf);
        assert.strictEqual(feSay.text, 'Need directions?');
        assert.strictEqual(feSay.speakerId, 42);
        assert.strictEqual(feSay.yell, true);
        const oldSay = fe.decodeSay(srvSayBuf.subarray(0, srvSayBuf.length - 5));
        assert.strictEqual(oldSay.text, 'Need directions?');
        assert.strictEqual(oldSay.speakerId, 0);
        assert.strictEqual(oldSay.yell, false);
        const sysSay = fe.decodeSay(messages.encodeSay('You need ammunition.'));
        assert.strictEqual(sysSay.text, 'You need ammunition.');
        assert.strictEqual(sysSay.speakerId, 0);
        assert.strictEqual(sysSay.yell, false);

        // FieldGone parity: server encoder -> frontend decoder
        const srvGoneBuf = messages.encodeFieldGone(14, 16, 7);
        const feDecodedGone = fe.decodeFieldGone(srvGoneBuf);
        assert.strictEqual(feDecodedGone.x, 14);
        assert.strictEqual(feDecodedGone.y, 16);
        assert.strictEqual(feDecodedGone.z, 7);

        assert.ok(typeof fe.encodeHotkeys !== 'function');
        assert.ok(typeof messages.encodeHotkeys !== 'function');

        const pathBuf = fe.encodeMovePath([0, 1, 1, 2]);
        const srvPath = messages.decodeMovePath(pathBuf);
        assert.deepStrictEqual(srvPath, [0, 1, 1, 2]);
        const emptyPath = messages.decodeMovePath(fe.encodeMovePath([]));
        assert.deepStrictEqual(emptyPath, []);
    }

    console.log('ok protocol');
}


main();
