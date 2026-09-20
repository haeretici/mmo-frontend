#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    SHOP_AMOUNT_STEP,
    SHOP_AMOUNT_STEP_SHIFT,
    SHOP_AMOUNT_STEP_CTRL,
    SHOP_AMOUNT_STEP_SHIFT_CTRL,
    MAX_DEAL_COUNT,
    shopAmountStep,
    clampShopAmount,
    applyShopAmountDelta,
    defaultShopAmount,
    shopItemLabel,
    filterShopRowsByName,
    resolveItemCount,
    shopDealMax,
    canAffordShopRow
} = require('../static/js/npc_shop_ui.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log('ok', name);
    } catch (err) {
        failed += 1;
        console.error('FAIL', name);
        console.error(err && err.stack ? err.stack : err);
    }
}

test('shopAmountStep modifiers (regular 1, Shift 10, Ctrl 100, Shift+Ctrl 1000)', () => {
    assert.strictEqual(shopAmountStep(), 1);
    assert.strictEqual(shopAmountStep({}), 1);
    assert.strictEqual(shopAmountStep({ shiftKey: true }), 10);
    assert.strictEqual(shopAmountStep({ shift: true }), 10);
    assert.strictEqual(shopAmountStep({ ctrlKey: true }), 100);
    assert.strictEqual(shopAmountStep({ metaKey: true }), 100);
    assert.strictEqual(shopAmountStep({ ctrl: true }), 100);
    assert.strictEqual(shopAmountStep({ shiftKey: true, ctrlKey: true }), 1000);
    assert.strictEqual(shopAmountStep({ shift: true, metaKey: true }), 1000);
});

test('clampShopAmount bounds and invalid values', () => {
    assert.strictEqual(clampShopAmount(5, 1, 10), 5);
    assert.strictEqual(clampShopAmount(0, 1, 10), 1);
    assert.strictEqual(clampShopAmount(-10, 1, 10), 1);
    assert.strictEqual(clampShopAmount(15, 1, 10), 10);
    assert.strictEqual(clampShopAmount('7', 1, 10), 7);
    assert.strictEqual(clampShopAmount(NaN, 1, 10), 1);
    assert.strictEqual(clampShopAmount(null, 1, 10), 1);
    assert.strictEqual(clampShopAmount('abc', 1, 10), 1);
    assert.strictEqual(clampShopAmount(5.8, 1, 10), 5);
});

test('applyShopAmountDelta increments and decrements with modifiers', () => {
    assert.strictEqual(applyShopAmountDelta(1, 1, null, 1, 100), 2);
    assert.strictEqual(applyShopAmountDelta(2, -1, null, 1, 100), 1);
    assert.strictEqual(applyShopAmountDelta(1, -1, null, 1, 100), 1, 'cannot drop below min');
    assert.strictEqual(applyShopAmountDelta(1, 1, { shiftKey: true }, 1, 100), 11);
    assert.strictEqual(applyShopAmountDelta(11, 1, { ctrlKey: true }, 1, 100), 100, 'clamps to max');
    assert.strictEqual(applyShopAmountDelta(100, -1, { shiftKey: true }, 1, 100), 90);
    assert.strictEqual(applyShopAmountDelta(50, 1, { shiftKey: true, ctrlKey: true }, 1, 100), 100);
});

test('defaultShopAmount defaults: buy is 1, sell is max stack', () => {
    assert.strictEqual(defaultShopAmount('buy', 50), 1);
    assert.strictEqual(defaultShopAmount('buy', 0), 1);
    assert.strictEqual(defaultShopAmount('sell', 7), 7);
    assert.strictEqual(defaultShopAmount('sell', 0), 1);
    assert.strictEqual(defaultShopAmount('sell', 120), 120);
});

test('shopItemLabel formatting with function, Map or fallback', () => {
    assert.strictEqual(shopItemLabel('gold_coin', (id) => id === 'gold_coin' ? 'Gold Coin' : id), 'Gold Coin');
    const catalog = new Map([['bread', { label: 'Fresh Bread' }]]);
    assert.strictEqual(shopItemLabel('bread', catalog), 'Fresh Bread');
    assert.strictEqual(shopItemLabel('mana_potion'), 'mana potion');
    assert.strictEqual(shopItemLabel(''), '');
});

test('filterShopRowsByName matches item id or label case-insensitively', () => {
    const rows = [
        { itemId: 'bread', buy: 4, sell: 1 },
        { itemId: 'cookie', buy: 2, sell: 1 },
        { itemId: 'wooden_shield', buy: 20, sell: 5 }
    ];
    const labelFn = (id) => {
        if (id === 'wooden_shield') return 'Oak Shield';
        return id;
    };

    assert.deepStrictEqual(filterShopRowsByName(rows, '', labelFn), rows);
    assert.deepStrictEqual(filterShopRowsByName(rows, 'cook', labelFn), [rows[1]]);
    assert.deepStrictEqual(filterShopRowsByName(rows, 'BREAD', labelFn), [rows[0]]);
    assert.deepStrictEqual(filterShopRowsByName(rows, 'oak', labelFn), [rows[2]]);
    assert.deepStrictEqual(filterShopRowsByName(rows, 'shield', labelFn), [rows[2]]);
    assert.deepStrictEqual(filterShopRowsByName(rows, 'potion', labelFn), []);
});

test('resolveItemCount handles function, slot array, and object', () => {
    const fnCounter = (id) => (id === 'gold_coin' ? 42 : 0);
    assert.strictEqual(resolveItemCount(fnCounter, 'gold_coin'), 42);
    assert.strictEqual(resolveItemCount(fnCounter, 'bread'), 0);

    const slotCounter = {
        slots: [
            { id: 'bread', count: 5 },
            { id: 'bread', count: 3 },
            { id: 'torch', count: 1 }
        ]
    };
    assert.strictEqual(resolveItemCount(slotCounter, 'bread'), 8);
    assert.strictEqual(resolveItemCount(slotCounter, 'torch'), 1);
    assert.strictEqual(resolveItemCount(slotCounter, 'gold_coin'), 0);
});

test('shopDealMax calculates purchase cap and sell stack cap', () => {
    const shop = { currency: 'gold_coin' };
    const items = { gold_coin: 50, bread: 7, cookie: 0 };
    const countFn = (id) => items[id] || 0;

    const breadRow = { itemId: 'bread', buy: 4, sell: 2 };
    // Buy max: 50 / 4 = 12
    assert.strictEqual(shopDealMax(countFn, shop, breadRow, 'buy'), 12);
    // Sell max: 7 owned
    assert.strictEqual(shopDealMax(countFn, shop, breadRow, 'sell'), 7);

    // Unaffordable buy row: price 100, gold 50 -> returns 1
    const armorRow = { itemId: 'plate_armor', buy: 100, sell: 30 };
    assert.strictEqual(shopDealMax(countFn, shop, armorRow, 'buy'), 1);

    // Not owned sell row: returns 1
    assert.strictEqual(shopDealMax(countFn, shop, armorRow, 'sell'), 1);

    // Cap at MAX_DEAL_COUNT (100)
    items.gold_coin = 5000;
    assert.strictEqual(shopDealMax(countFn, shop, breadRow, 'buy'), MAX_DEAL_COUNT);
    items.bread = 250;
    assert.strictEqual(shopDealMax(countFn, shop, breadRow, 'sell'), MAX_DEAL_COUNT);
});

test('canAffordShopRow checks gold for buy and backpack presence for sell', () => {
    const shop = { currency: 'gold_coin' };
    const items = { gold_coin: 10, bread: 3 };
    const countFn = (id) => items[id] || 0;

    const breadRow = { itemId: 'bread', buy: 4, sell: 2 };
    assert.strictEqual(canAffordShopRow(countFn, shop, breadRow, 'buy'), true);
    assert.strictEqual(canAffordShopRow(countFn, shop, breadRow, 'sell'), true);

    const swordRow = { itemId: 'iron_sword', buy: 25, sell: 8 };
    // Buy: 10 gold < 25 -> cannot afford
    assert.strictEqual(canAffordShopRow(countFn, shop, swordRow, 'buy'), false);
    // Sell: 0 swords in backpack -> cannot sell
    assert.strictEqual(canAffordShopRow(countFn, shop, swordRow, 'sell'), false);
});

if (failed > 0) {
    console.error(`\n${failed} tests failed!`);
    process.exit(1);
} else {
    console.log(`\nAll ${passed} npc_shop_ui tests passed.`);
}
