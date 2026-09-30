#!/usr/bin/env node
'use strict';

/**
 * S5 audit: existing chrome stays put while Settings is open.
 * Escape closes Settings and does not close a bag. The combat sort
 * menu still opens and picks a sort. Shop amount buttons still call
 * npc_shop_ui.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const play = fs.readFileSync(path.join(root, 'static/js/play.js'), 'utf8');
const clientWindow = fs.readFileSync(path.join(root, 'static/js/client_window.js'), 'utf8');
const assign = fs.readFileSync(path.join(root, 'static/js/action_bar_assign.js'), 'utf8');
const shopUi = require('../static/js/npc_shop_ui.js');

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

function extractFunction(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, signature);
    const brace = source.indexOf('{', start);
    let depth = 0;
    for (let i = brace; i < source.length; i++) {
        const ch = source.charAt(i);
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error('unclosed ' + signature);
}

function sliceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    assert.ok(start >= 0, startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(end > start, endMarker);
    return source.slice(start, end);
}

function classListFor(el) {
    return {
        toggle(name, force) {
            const names = String(el.className || '').split(/\s+/).filter(Boolean);
            const has = names.indexOf(name) >= 0;
            const on = arguments.length > 1 ? !!force : !has;
            const next = names.filter((part) => part !== name);
            if (on) next.push(name);
            el.className = next.join(' ');
        }
    };
}

function listenNode(sort) {
    const listeners = {};
    const node = {
        sort: sort || '',
        hidden: false,
        className: '',
        title: '',
        value: '',
        getAttribute(name) {
            return name === 'data-sort' ? node.sort : null;
        },
        addEventListener(type, fn) {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(fn);
        },
        click() {
            const ev = { stopPropagation() {}, target: node };
            (listeners.click || []).forEach((fn) => fn(ev));
        }
    };
    node.classList = classListFor(node);
    return node;
}

test('Escape closes Settings only and leaves bag close on the bag button', () => {
    const branch = extractFunction(play, "if (ev.key === 'Escape')");
    assert.ok(branch.includes('TALK_CLOSE'), 'Escape still closes the talk dialog');
    assert.ok(!branch.includes('requestCloseBag'));
    assert.ok(!branch.includes('closeAllOpenBags'));
    assert.ok(!branch.includes('stopImmediatePropagation'));
    assert.ok(clientWindow.includes("ev.key !== 'Escape'"));
    assert.ok(clientWindow.includes('hide(settingsPanel, settingsBtn)'));
    assert.ok(!clientWindow.includes('requestCloseBag'));
    const bag = extractFunction(play, 'function createFloatBagPanel(uid)');
    assert.ok(bag.includes('wireFloatHeaderDrag(header, el)'));
    assert.ok(bag.includes('requestCloseBag(uid)'));
});

test('combat sort still opens and a picked row becomes the active sort', () => {
    const items = [
        listenNode('display_time_asc'),
        listenNode('name_asc')
    ];
    items[0].className = 'active';
    const sortBtn = listenNode();
    const sortDropdown = listenNode();
    sortDropdown.hidden = true;
    const sortEl = listenNode();
    let placed = 0;
    const sandbox = {
        combatSort: 'display_time_asc',
        sortEl: sortEl,
        sortBtn: sortBtn,
        sortDropdown: sortDropdown,
        sortItems: items,
        document: { addEventListener() {} },
        saveCombatSort(next) { sandbox.saved = next; },
        renderCombat() { sandbox.rendered = sandbox.combatSort; },
        placeCombatSortDropdown() {
            placed += 1;
            sortDropdown.hidden = false;
        }
    };
    vm.createContext(sandbox);
    const fn = extractFunction(play, 'function setCombatSort(next)');
    const wiring = sliceBetween(play, 'if (sortBtn && sortDropdown)', 'setCombatSort(combatSort);');
    vm.runInContext(fn + '\n' + wiring, sandbox);

    sortBtn.click();
    assert.strictEqual(placed, 1);
    assert.strictEqual(sortDropdown.hidden, false);

    items[1].click();
    assert.strictEqual(sandbox.combatSort, 'name_asc');
    assert.strictEqual(sandbox.saved, 'name_asc');
    assert.strictEqual(sortEl.value, 'name_asc');
    assert.strictEqual(sortBtn.title, 'Sort: name asc');
    assert.strictEqual(sandbox.rendered, 'name_asc');
    assert.strictEqual(sortDropdown.hidden, true);
    assert.ok(items[1].className.split(/\s+/).indexOf('active') >= 0);
    assert.ok(items[0].className.split(/\s+/).indexOf('active') < 0);
});

test('shop amount buttons still call npc_shop_ui helpers', () => {
    assert.ok(play.includes('inv-npc-shop-amount-inc'));
    assert.ok(play.includes('inv-npc-shop-amount-dec'));
    const inc = play.indexOf("deal.inc.addEventListener('click'");
    const dec = play.indexOf("deal.dec.addEventListener('click'");
    assert.ok(inc > 0 && dec > 0);
    assert.ok(play.slice(inc, inc + 400).includes('NpcShopUi.applyShopAmountDelta'));
    assert.ok(play.slice(dec, dec + 400).includes('NpcShopUi.applyShopAmountDelta'));
    assert.strictEqual(shopUi.applyShopAmountDelta(3, 1, {}, 1, 12), 4);
    assert.strictEqual(shopUi.applyShopAmountDelta(1, -1, {}, 1, 12), 1);
    assert.ok(assign.includes('action-bar-assign-modal'));
    assert.ok(clientWindow.includes('wireHeaderDrag'));
    assert.ok(!clientWindow.includes('action-bar-assign-modal'));
});

if (failed > 0) {
    console.error(failed + ' failed, ' + passed + ' passed');
    process.exit(1);
}
console.log(passed + ' passed');
