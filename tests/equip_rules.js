'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rules = require('../static/js/equip_rules.js');
const server = require('../../server/src/world/items');

const playJs = fs.readFileSync(path.join(__dirname, '../static/js/play.js'), 'utf8');
const playHtml = fs.readFileSync(path.join(__dirname, '../static/play.html'), 'utf8');

const sword = { id: 'sword', slot: 'rightHand', category: 'sword', weaponType: 'melee', atk: 10 };
const twoh = { id: 'twoh', slot: 'rightHand', category: 'sword', weaponType: 'melee', atk: 20, twoHanded: true };
const bow = { id: 'bow', slot: 'rightHand', category: 'bow', weaponType: 'distance', atk: 15, twoHanded: true };
const shield = { id: 'shield', slot: 'leftHand', category: 'shield', weaponType: 'shield', defense: 20 };
const book = { id: 'book', slot: 'leftHand', category: 'spellbook', defense: 12 };
const quiver = { id: 'quiver', slot: 'leftHand', category: 'quiver', volume: 4 };
const arrow = { id: 'arrow', category: 'ammo', ammoType: 'arrow' };
const guard = { id: 'guard', slot: 'weapon', category: 'sword', atk: 30, twoHanded: true, level: 20, vocation: ['guardian'] };

function decide(item, slot, mode, weapon, off, player) {
    return rules.evaluateEquip({
        item: { id: item.id },
        meta: item,
        slot: slot,
        weapon: weapon ? { id: weapon.id } : null,
        weaponMeta: weapon,
        shield: off ? { id: off.id } : null,
        shieldMeta: off,
        player: player || null,
        mode: mode
    });
}

function main() {
    assert.strictEqual(rules.DRESS_DENIED, server.DRESS_DENIED);
    assert.strictEqual(rules.BOTH_HANDS_DENIED, server.BOTH_HANDS_DENIED);

    assert.strictEqual(decide(sword, 'weapon', 'equip', null, shield).ok, true);
    assert.strictEqual(decide(shield, 'shield', 'equip', sword, null).ok, true);
    assert.strictEqual(decide(twoh, 'weapon', 'move', null, shield).error, 'both_hands');
    assert.strictEqual(decide(twoh, 'weapon', 'equip', null, shield).ok, true);
    assert.strictEqual(decide(twoh, 'weapon', 'equip', null, quiver).error, 'both_hands');
    assert.strictEqual(decide(bow, 'weapon', 'move', null, quiver).ok, true);
    assert.strictEqual(decide(bow, 'weapon', 'equip', null, quiver).ok, true);
    assert.strictEqual(decide(bow, 'weapon', 'equip', null, shield).error, 'both_hands');
    assert.strictEqual(decide(bow, 'weapon', 'equip', null, book).error, 'both_hands');
    assert.strictEqual(decide(quiver, 'shield', 'move', bow, null).ok, true);
    assert.strictEqual(decide(quiver, 'shield', 'equip', bow, null).ok, true);
    assert.strictEqual(decide(quiver, 'shield', 'equip', twoh, null).ok, true);
    assert.strictEqual(decide(shield, 'shield', 'move', twoh, null).error, 'both_hands');
    assert.strictEqual(decide(shield, 'shield', 'equip', twoh, null).ok, true);
    assert.strictEqual(decide(shield, 'weapon', 'equip', null, null).error, 'wrong_slot');
    assert.strictEqual(decide(arrow, 'shield', 'move', bow, quiver).ok, true);
    assert.strictEqual(decide(sword, 'shield', 'move', bow, quiver).error, 'wrong_slot');

    const low = decide(guard, '', 'equip', null, null, { level: 1, vocation: 'guardian' });
    assert.strictEqual(low.ok, true);
    assert.strictEqual(low.error, null);
    const highBow = {
        id: 'highbow', slot: 'rightHand', category: 'bow', weaponType: 'distance',
        atk: 7, twoHanded: true, level: 45
    };
    assert.strictEqual(
        decide(highBow, 'weapon', 'equip', null, null, { level: 1, vocation: 'scout' }).error,
        'level'
    );
    const javelin = {
        id: 'javelin', slot: 'rightHand', category: 'spear', weaponType: 'distance', atk: 32, level: 20
    };
    assert.strictEqual(decide(javelin, 'weapon', 'equip', null, null, { level: 1 }).ok, true);
    const heavy = {
        id: 'heavy', slot: 'rightHand', category: 'axe', atk: 100, defense: 80, level: 100
    };
    const split = {
        id: 'split', slot: 'rightHand', category: 'sword', atk: 7, extraAtk: 49, defense: 32, level: 250
    };
    assert.deepStrictEqual(rules.penalizedWeaponStats(heavy, 10), server.penalizedWeaponStats(heavy, 10));
    assert.deepStrictEqual(rules.penalizedWeaponStats(heavy, 50), {
        atk: 50, extraAtk: 0, defense: 30, gap: 50
    });
    assert.strictEqual(rules.penalizedWeaponStats(heavy, 100), null);
    assert.deepStrictEqual(rules.penalizedWeaponStats(split, 202), server.penalizedWeaponStats(split, 202));
    assert.deepStrictEqual(rules.penalizedWeaponStats(split, 202), {
        atk: 1, extraAtk: 7, defense: 0, gap: 48
    });
    const other = decide(guard, 'weapon', 'equip', null, null, { level: 25, vocation: 'scout' });
    assert.strictEqual(other.error, 'vocation');
    const fit = decide(guard, 'weapon', 'equip', null, null, { level: 20, vocation: 'Guardian' });
    assert.strictEqual(fit.ok, true);
    assert.strictEqual(
        rules.wieldSentence(guard),
        'It can only be wielded properly by Guardian of level 20 or higher.'
    );
    assert.strictEqual(rules.itemUseEquips({ id: 'sword' }, sword), true);
    assert.strictEqual(rules.itemUseEquips({ id: 'arrow' }, arrow), false);
    assert.strictEqual(rules.itemUseEquips({ id: 'quiver' }, quiver), false);

    assert.ok(playJs.includes('function blockDress'));
    assert.ok(playJs.includes('EngineEquipRules.evaluateEquip'));
    assert.ok(playJs.includes('EngineEquipRules.wieldSentence'));
    assert.ok(playJs.includes('EngineEquipRules.penalizedWeaponStats'));
    assert.ok(playJs.includes("blockDress(item, plan.slot, 'equip'"));
    assert.ok(playJs.includes("blockDress(item, plan.to.slot, 'move'"));
    const htmlRules = playHtml.indexOf('/js/equip_rules.js');
    const htmlPlay = playHtml.indexOf('/js/play.js');
    assert.ok(htmlRules > 0 && htmlRules < htmlPlay, 'equip_rules.js loads before play.js');
}

main();
