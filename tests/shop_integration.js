#!/usr/bin/env node
'use strict';

const assert = require('assert');
const NpcShopUi = require('../static/js/npc_shop_ui.js');
const protocol = require('../static/js/protocol.js');

// Simple DOM mock
function matchesSel(node, sel) {
    if (!node || !sel) return false;
    const parts = sel.split('.').filter(Boolean);
    if (sel.startsWith('.')) {
        const classes = (node.className || '').split(/\s+/).filter(Boolean);
        return parts.every((p) => classes.includes(p));
    }
    if (sel.startsWith('#')) return node.id === sel.slice(1);
    return String(node.tagName || '').toLowerCase() === sel.toLowerCase();
}

function walk(node, visit) {
    visit(node);
    const kids = node.childNodes || [];
    for (let i = 0; i < kids.length; i++) walk(kids[i], visit);
}

function makeNode(tag) {
    const node = {
        tagName: String(tag || 'div').toUpperCase(),
        className: '',
        id: '',
        style: {},
        dataset: {},
        childNodes: [],
        parentNode: null,
        _textContent: '',
        get textContent() {
            if (this.childNodes.length === 0) return this._textContent;
            return this.childNodes.map((c) => c.textContent).join('');
        },
        set textContent(v) {
            this.childNodes = [];
            this._textContent = String(v || '');
        },
        get firstChild() {
            return this.childNodes[0] || null;
        },
        hidden: false,
        disabled: false,
        type: tag === 'button' ? 'button' : tag === 'input' ? 'text' : '',
        value: tag === 'input' ? '' : undefined,
        min: '',
        max: '',
        step: '',
        placeholder: '',
        _listeners: {},
        classList: {
            add(c) {
                const parts = (node.className || '').split(/\s+/).filter(Boolean);
                if (!parts.includes(c)) parts.push(c);
                node.className = parts.join(' ');
            },
            remove(c) {
                const parts = (node.className || '').split(/\s+/).filter(Boolean);
                node.className = parts.filter((x) => x !== c).join(' ');
            },
            contains(c) {
                return (node.className || '').split(/\s+/).filter(Boolean).includes(c);
            }
        },
        setAttribute(name, value) {
            if (name === 'class') node.className = String(value);
            if (name === 'id') node.id = String(value);
            if (name === 'type') node.type = String(value);
            if (name === 'placeholder') node.placeholder = String(value);
            if (name === 'min') node.min = String(value);
            if (name === 'max') node.max = String(value);
            if (name === 'value') node.value = String(value);
            if (name.startsWith('data-')) {
                const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                node.dataset[key] = String(value);
            }
        },
        appendChild(child) {
            child.parentNode = node;
            node.childNodes.push(child);
            return child;
        },
        removeChild(child) {
            node.childNodes = node.childNodes.filter((c) => c !== child);
            child.parentNode = null;
            return child;
        },
        querySelector(sel) {
            let hit = null;
            walk(node, (n) => {
                if (!hit && n !== node && matchesSel(n, sel)) hit = n;
            });
            return hit;
        },
        querySelectorAll(sel) {
            const out = [];
            walk(node, (n) => {
                if (n !== node && matchesSel(n, sel)) out.push(n);
            });
            return out;
        },
        addEventListener(type, fn) {
            if (!node._listeners[type]) node._listeners[type] = [];
            node._listeners[type].push(fn);
        },
        click() {
            fire(node, 'click');
        }
    };
    return node;
}

function fire(node, type, eventProps) {
    const ev = Object.assign({ target: node, preventDefault: () => {} }, eventProps);
    const list = (node._listeners[type] || []).slice();
    for (const fn of list) fn(ev);
}

// Global mocks
global.document = {
    createElement: makeNode
};
global.EngineNpcShopUi = NpcShopUi;
global.EngineProtocol = protocol;

let sentPackets = [];
function send(opcode, payload) {
    sentPackets.push({ opcode, payload });
}

// Test harness
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

// Load play.js components
const fs = require('fs');
const playSource = fs.readFileSync(__dirname + '/../static/js/play.js', 'utf8');

// Build isolated execution context
const vm = require('vm');
const context = {
    document: global.document,
    EngineNpcShopUi: NpcShopUi,
    NpcShopUi: NpcShopUi,
    EngineProtocol: protocol,
    send,
    console,
    Math,
    String,
    Number,
    Array,
    Map,
    Set,
    C2S: protocol.C2S,
    encodeStrPayload: protocol.encodeStrPayload,
    makeItemSprite: (id) => {
        const img = makeNode('img');
        img.src = '/items/' + id + '.png';
        return img;
    },
    bindItemPopover: () => {},
    itemLabel: (id) => {
        if (id === 'gold_coin') return 'Gold Coin';
        if (id === 'bread') return 'Fresh Bread';
        if (id === 'cookie') return 'Crisp Cookie';
        if (id === 'iron_sword') return 'Iron Sword';
        return String(id).replace(/_/g, ' ');
    },
    placeFloat: () => {}
};

vm.createContext(context);
vm.runInContext(`
    let shopNpc = 42;
    let talkNpc = 0;
    let currentShop = null;
    let shopUiState = null;
    let bag = {
        containerId: 'root',
        capacity: 20,
        slots: [
            { index: 0, id: 'gold_coin', count: 50 },
            { index: 1, id: 'bread', count: 7 }
        ]
    };
    const openBags = new Map();

    function $(id) {
        return elements[id] || null;
    }
`, context);

// Extract helper functions from play.js into the vm context
const extractFns = [
    'ensureShopUiState',
    'countPlayerItem',
    'makeShopRow',
    'makeShopDeal',
    'buildShopUi',
    'renderShop'
];

for (const fnName of extractFns) {
    const re = new RegExp(`function ${fnName}\\s*\\([\\s\\S]*?\\n\\}`);
    const match = playSource.match(re);
    if (!match) {
        throw new Error('Could not find function ' + fnName + ' in play.js');
    }
    vm.runInContext(match[0], context);
}

test('shop tabs: Buy and Sell tabs exist with Buy active by default', () => {
    const shopPanel = makeNode('div');
    shopPanel.id = 'npc-shop';
    shopPanel.hidden = true;
    const shopBody = makeNode('div');
    shopBody.id = 'shop-body';
    shopPanel.appendChild(shopBody);

    context.elements = {
        'npc-shop': shopPanel,
        'shop-body': shopBody
    };

    const items = [
        { itemId: 'bread', buy: 4, sell: 1 },
        { itemId: 'cookie', buy: 2, sell: 1 },
        { itemId: 'iron_sword', buy: 20, sell: 5 }
    ];

    vm.runInContext(`renderShop('gold_coin', ${JSON.stringify(items)});`, context);

    const tabs = shopBody.querySelectorAll('.inv-npc-shop-tab');
    assert.strictEqual(tabs.length, 2, 'two tabs rendered');
    assert.strictEqual(tabs[0].textContent, 'Buy');
    assert.ok(tabs[0].classList.contains('is-active'), 'buy tab is active');
    assert.strictEqual(tabs[1].textContent, 'Sell');
    assert.ok(!tabs[1].classList.contains('is-active'), 'sell tab is not active');

    // Default selection is first buyable item
    const rows = shopBody.querySelectorAll('.inv-npc-shop-row');
    assert.strictEqual(rows.length, 3);
    assert.ok(rows[0].classList.contains('is-selected'), 'first row is selected');
    assert.strictEqual(rows[0].dataset.itemId, 'bread');

    // Price and Total
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-unit-price').textContent, '4');
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-total').textContent, '4');
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-amount-input').value, '1');
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-currency').textContent, 'Gold Coin: 50');
});

test('shop tabs: switching to Sell tab updates list, amount to owned stack, and confirm button', () => {
    const shopBody = context.elements['shop-body'];
    const tabs = shopBody.querySelectorAll('.inv-npc-shop-tab');
    tabs[1].click(); // click Sell tab

    // Re-query newly rendered tabs from shopBody
    const newTabs = shopBody.querySelectorAll('.inv-npc-shop-tab');
    assert.ok(newTabs[1].classList.contains('is-active'), 'sell tab is now active');
    assert.ok(!newTabs[0].classList.contains('is-active'), 'buy tab is inactive');

    const rows = shopBody.querySelectorAll('.inv-npc-shop-row');
    assert.strictEqual(rows.length, 3);

    // First row is bread, player owns 7 in bag
    const breadRow = rows[0];
    assert.strictEqual(breadRow.dataset.itemId, 'bread');
    assert.ok(breadRow.classList.contains('is-selected'));
    assert.strictEqual(breadRow.querySelector('.inv-npc-shop-have').textContent, '7');
    assert.ok(!breadRow.classList.contains('is-unaffordable'), 'bread is owned so affordable to sell');

    // Third row is iron_sword, player owns 0
    const swordRow = rows[2];
    assert.strictEqual(swordRow.dataset.itemId, 'iron_sword');
    assert.strictEqual(swordRow.querySelector('.inv-npc-shop-have').textContent, '0');
    assert.ok(swordRow.classList.contains('is-unaffordable'), 'unowned item gets is-unaffordable in sell mode');

    // Deal defaults to owned stack (7)
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-amount-input').value, '7');
    // Unit sell price is 1, total is 1 * 7 = 7
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-unit-price').textContent, '1');
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-total').textContent, '7');

    // Confirm button is Sell
    const confirm = shopBody.querySelector('.inv-npc-shop-confirm');
    assert.strictEqual(confirm.textContent, 'Sell');
    assert.ok(confirm.classList.contains('inv-npc-shop-sell'));
});

test('search filter: typing query filters shop items and shows empty feedback', () => {
    const shopBody = context.elements['shop-body'];
    // Switch back to Buy tab
    shopBody.querySelectorAll('.inv-npc-shop-tab')[0].click();

    const search = shopBody.querySelector('.inv-npc-shop-search');
    assert.ok(search, 'search input exists');

    search.value = 'cook';
    fire(search, 'input');

    let rows = shopBody.querySelectorAll('.inv-npc-shop-row');
    assert.strictEqual(rows.length, 1, 'only cookie matches');
    assert.strictEqual(rows[0].dataset.itemId, 'cookie');
    assert.ok(rows[0].classList.contains('is-selected'));
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-unit-price').textContent, '2');

    // Non-matching search
    search.value = 'unknown_xyz';
    fire(search, 'input');
    rows = shopBody.querySelectorAll('.inv-npc-shop-row');
    assert.strictEqual(rows.length, 0);
    const empty = shopBody.querySelector('.inv-npc-shop-empty');
    assert.ok(empty);
    assert.strictEqual(empty.textContent, 'No matching items.');

    // Clear search
    search.value = '';
    fire(search, 'input');
    rows = shopBody.querySelectorAll('.inv-npc-shop-row');
    assert.strictEqual(rows.length, 3);
});

test('quantity controls: step modifiers with Shift, Ctrl and clamping', () => {
    const shopBody = context.elements['shop-body'];
    // Select bread again to test quantity from 1
    const rows = shopBody.querySelectorAll('.inv-npc-shop-row');
    rows[0].click(); // click bread (buy price 4, gold 50 -> max 12)

    const inc = shopBody.querySelector('.inv-npc-shop-amount-inc');
    const dec = shopBody.querySelector('.inv-npc-shop-amount-dec');
    const amountInput = shopBody.querySelector('.inv-npc-shop-amount-input');

    assert.strictEqual(amountInput.value, '1');

    // Click + with shift -> +10 => 11
    fire(inc, 'click', { shiftKey: true });
    assert.strictEqual(amountInput.value, '11');
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-total').textContent, '44');

    // Click + with ctrl -> +100 clamped to deal max (12)
    fire(inc, 'click', { ctrlKey: true });
    assert.strictEqual(amountInput.value, '12', 'clamped to max buy of 12');
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-total').textContent, '48');

    // Click - with regular click -> -1 => 11
    fire(dec, 'click');
    assert.strictEqual(amountInput.value, '11');
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-total').textContent, '44');

    // Click - with shift -> -10 => 1
    fire(dec, 'click', { shiftKey: true });
    assert.strictEqual(amountInput.value, '1');
    assert.strictEqual(shopBody.querySelector('.inv-npc-shop-total').textContent, '4');
});

test('confirm deal sends SHOP_BUY / SHOP_SELL with specified amount', () => {
    sentPackets = [];
    const shopBody = context.elements['shop-body'];
    // Reset selection to bread
    const rows = shopBody.querySelectorAll('.inv-npc-shop-row');
    rows[0].click();

    const inc = shopBody.querySelector('.inv-npc-shop-amount-inc');
    const amountInput = shopBody.querySelector('.inv-npc-shop-amount-input');
    assert.strictEqual(amountInput.value, '1');

    // Buy 3 bread (1 + 1 + 1 = 3)
    fire(inc, 'click');
    fire(inc, 'click');
    assert.strictEqual(amountInput.value, '3');

    const confirm = shopBody.querySelector('.inv-npc-shop-confirm');
    confirm.click();

    assert.strictEqual(sentPackets.length, 1);
    assert.strictEqual(sentPackets[0].opcode, protocol.C2S.SHOP_BUY);

    const r = new protocol.Reader(sentPackets[0].payload);
    assert.strictEqual(r.u32(), 42, 'npcId');
    assert.strictEqual(r.u16(), 3, 'amount is 3');
    assert.strictEqual(r.str(), 'bread', 'itemId is bread');
});

if (failed > 0) {
    console.error(`\n${failed} tests failed!`);
    process.exit(1);
} else {
    console.log(`\nAll ${passed} shop_integration tests passed.`);
}
