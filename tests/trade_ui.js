'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Trade = require('../static/js/trade_ui.js');

function matches(node, sel) {
    if (!node || !sel) return false;
    if (sel.charAt(0) === '#') return node.id === sel.slice(1);
    if (sel.charAt(0) === '.') {
        const classes = String(node.className || '').split(/\s+/).filter(Boolean);
        return classes.indexOf(sel.slice(1)) >= 0;
    }
    return String(node.tagName || '').toLowerCase() === sel.toLowerCase();
}

function walk(node, visit) {
    visit(node);
    const kids = node.childNodes || [];
    for (let i = 0; i < kids.length; i++) walk(kids[i], visit);
}

function makeNode(doc, tag) {
    const node = {
        tagName: String(tag || 'div').toUpperCase(),
        className: '',
        id: '',
        type: '',
        src: '',
        alt: '',
        draggable: false,
        disabled: false,
        hidden: false,
        style: {},
        parentNode: null,
        childNodes: [],
        _text: '',
        _attr: {},
        _listeners: {},
        ownerDocument: doc
    };
    Object.defineProperty(node, 'textContent', {
        get: function () {
            if (!node.childNodes.length) return node._text;
            return node.childNodes.map(function (child) { return child.textContent; }).join('');
        },
        set: function (value) {
            node.childNodes = [];
            node._text = value == null ? '' : String(value);
        }
    });
    Object.defineProperty(node, 'firstChild', {
        get: function () { return node.childNodes[0] || null; }
    });
    node.setAttribute = function (name, value) {
        node._attr[name] = String(value);
        if (name === 'id') node.id = String(value);
        if (name === 'class') node.className = String(value);
        if (name === 'draggable') node.draggable = String(value) !== 'false';
    };
    node.getAttribute = function (name) {
        return Object.prototype.hasOwnProperty.call(node._attr, name) ? node._attr[name] : null;
    };
    node.appendChild = function (child) {
        if (child.parentNode && child.parentNode.removeChild) child.parentNode.removeChild(child);
        child.parentNode = node;
        node.childNodes.push(child);
        return child;
    };
    node.removeChild = function (child) {
        const i = node.childNodes.indexOf(child);
        if (i >= 0) node.childNodes.splice(i, 1);
        if (child.parentNode === node) child.parentNode = null;
        return child;
    };
    node.addEventListener = function (type, fn) {
        if (!node._listeners[type]) node._listeners[type] = [];
        node._listeners[type].push(fn);
    };
    node.querySelector = function (sel) {
        const found = node.querySelectorAll(sel);
        return found[0] || null;
    };
    node.querySelectorAll = function (sel) {
        const parts = String(sel || '').trim().split(/\s+/);
        let nodes = [node];
        for (let p = 0; p < parts.length; p++) {
            const next = [];
            for (let i = 0; i < nodes.length; i++) {
                walk(nodes[i], function (el) {
                    if (el !== nodes[i] && matches(el, parts[p])) next.push(el);
                });
            }
            nodes = next;
        }
        return nodes;
    };
    return node;
}

function makeDoc() {
    const doc = {
        createElement: function (tag) { return makeNode(doc, tag); }
    };
    doc.body = makeNode(doc, 'div');
    return doc;
}

function click(el, x, y) {
    const list = el && el._listeners && el._listeners.click ? el._listeners.click : [];
    const ev = {
        clientX: x || 0,
        clientY: y || 0,
        preventDefault: function () {},
        stopPropagation: function () {}
    };
    for (let i = 0; i < list.length; i++) list[i](ev);
}

function main() {
    assert.strictEqual(Trade.MENU_LABEL, 'Trade with …');
    assert.strictEqual(Trade.TITLE, 'Trade');

    const base = [
        { label: 'Look' },
        { label: 'Use' },
        { label: 'Equip' },
        { label: 'Open' }
    ];
    const filled = Trade.withTradeEntry(base, { id: 'sword', count: 1 });
    assert.strictEqual(filled.length, 5);
    assert.strictEqual(filled[4].label, 'Trade with …');
    assert.strictEqual(filled[4].action, 'TRADE');
    assert.strictEqual(base.length, 4);
    assert.strictEqual(Trade.withTradeEntry(base, null).length, 4);
    assert.strictEqual(Trade.withTradeEntry(base, { empty: true, id: 'sword' }).length, 4);
    assert.strictEqual(Trade.withTradeEntry(base, {}).length, 4);
    const equip = Trade.withTradeEntry([{ label: 'Look' }, { label: 'Unequip' }], { id: 'shield' });
    assert.strictEqual(equip[equip.length - 1].label, 'Trade with …');

    assert.deepStrictEqual(Trade.mapAim(null, 1), { send: false, partnerId: 0 });
    assert.deepStrictEqual(
        Trade.mapAim({ x: 2, y: 3, creature: { id: 9, name: 'Ann' } }, 1),
        { send: true, partnerId: 9 }
    );
    assert.deepStrictEqual(
        Trade.mapAim({ x: 2, y: 3, creature: { id: 4, isNpc: true } }, 1),
        { send: true, partnerId: 4 }
    );
    assert.deepStrictEqual(
        Trade.mapAim({ x: 2, y: 3, creature: { id: 8 } }, 1),
        { send: true, partnerId: 8 }
    );
    assert.deepStrictEqual(
        Trade.mapAim({ x: 1, y: 1, isPlayerTile: true }, 3),
        { send: true, partnerId: 3 }
    );
    assert.deepStrictEqual(Trade.mapAim({ x: 4, y: 5, z: 0 }, 3), { send: true, partnerId: 0 });
    assert.deepStrictEqual(
        Trade.mapAim({ x: 4, y: 5, corpseId: 20 }, 3),
        { send: false, partnerId: 0 }
    );
    assert.deepStrictEqual(
        Trade.mapAim({ x: 4, y: 5, worldPin: { id: 1 } }, 3),
        { send: false, partnerId: 0 }
    );
    assert.deepStrictEqual(
        Trade.mapAim({ x: 4, y: 5, groundMoveUid: 'g1' }, 3),
        { send: false, partnerId: 0 }
    );

    assert.strictEqual(Trade.containerAllowsTrade('bag'), true);
    assert.strictEqual(Trade.containerAllowsTrade('nested'), true);
    assert.strictEqual(Trade.containerAllowsTrade('equipment'), false);
    assert.strictEqual(Trade.containerAllowsTrade(''), false);
    assert.strictEqual(Trade.PARTNER_RANGE, 2);
    assert.strictEqual(Trade.ITEM_RANGE, 1);
    assert.strictEqual(Trade.WALK_HOPS, 2);

    assert.deepStrictEqual(
        Trade.groundOffer({
            x: 4, y: 5, z: 7,
            groundMoveItem: { id: 'gold_coin', count: 3, stackIndex: 1 }
        }),
        {
            from: { kind: 'tile', x: 4, y: 5, z: 7, stackIndex: 1 },
            item: { id: 'gold_coin', count: 3 }
        }
    );
    assert.deepStrictEqual(
        Trade.groundOffer({
            x: 2, y: 2, z: 7,
            groundUseItem: { id: 'backpack', count: 1, stackIndex: 0 }
        }).from,
        { kind: 'tile', x: 2, y: 2, z: 7, stackIndex: 0 }
    );
    assert.strictEqual(Trade.groundOffer({ x: 1, y: 1, z: 7, corpseId: 9 }), null);
    assert.strictEqual(Trade.groundOffer({ x: 1, y: 1, z: 7, worldPin: { kind: 'chest' } }), null);
    assert.strictEqual(Trade.groundOffer({ x: 1, y: 1, z: 7, field: { kind: 'fire' } }), null);
    assert.strictEqual(Trade.groundOffer({ x: 1, y: 1, z: 7 }), null);
    assert.strictEqual(Trade.groundOffer(null), null);

    function stepToward(player, tile, range) {
        const dx = (tile.x | 0) - (player.x | 0);
        const dy = (tile.y | 0) - (player.y | 0);
        const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
        const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
        const reach = range | 0;
        if (sy === 0) return { x: (tile.x | 0) - sx * reach, y: tile.y | 0 };
        if (sx === 0) return { x: tile.x | 0, y: (tile.y | 0) - sy * reach };
        return { x: (tile.x | 0) - sx * reach, y: (tile.y | 0) - sy * reach };
    }

    const bagFrom = { kind: 'container', containerUid: 'root', index: 1 };
    const farPartner = { id: 9, x: 0, y: 6, z: 7, player: true };
    const walker = { x: 0, y: 0, z: 7 };
    const offered = [];
    let plan = Trade.planOffer(walker, bagFrom, farPartner, stepToward);
    assert.strictEqual(plan.type, 'walk');
    assert.strictEqual(offered.length, 0);
    walker.x = plan.dest.x;
    walker.y = plan.dest.y;
    plan = Trade.planOffer(walker, bagFrom, farPartner, function () {
        throw new Error('offer sent before the walk finished');
    });
    assert.strictEqual(plan.type, 'send');
    assert.strictEqual(plan.partnerId, 9);
    offered.push(plan.partnerId);
    assert.deepStrictEqual(offered, [9]);

    const groundFrom = { kind: 'tile', x: 0, y: 4, z: 7, stackIndex: 2 };
    const stand = { x: 0, y: 0, z: 7 };
    const beside = { id: 4, x: 0, y: 4, z: 7, player: true };
    plan = Trade.planOffer(stand, groundFrom, beside, stepToward);
    assert.strictEqual(plan.type, 'walk');
    assert.notStrictEqual(plan.type, 'send');
    stand.x = plan.dest.x;
    stand.y = plan.dest.y;
    plan = Trade.planOffer(stand, groundFrom, beside, function () {
        throw new Error('ground offer sent before the walk finished');
    });
    assert.strictEqual(plan.type, 'send');
    assert.strictEqual(plan.partnerId, 4);

    assert.deepStrictEqual(
        Trade.planOffer(
            { x: 0, y: 0, z: 7 },
            { kind: 'tile', x: 1, y: 1, z: 6, stackIndex: 0 },
            { id: 9, x: 0, y: 0, z: 7, player: true },
            function () { throw new Error('other floor must not walk'); }
        ),
        { type: 'fct', text: 'First go upstairs.' }
    );
    assert.deepStrictEqual(
        Trade.planOffer(
            { x: 0, y: 0, z: 7 },
            bagFrom,
            { id: 9, x: 2, y: 2, z: 8, player: true },
            function () { throw new Error('other floor must not walk'); }
        ),
        { type: 'fct', text: 'First go downstairs.' }
    );
    assert.deepStrictEqual(
        Trade.planOffer(
            { x: 0, y: 0, z: 7 },
            bagFrom,
            { id: 9, x: 0, y: 8, z: 7, player: true },
            function () { return null; }
        ),
        { type: 'fct', text: 'There is no way.' }
    );
    assert.strictEqual(
        Trade.planOffer(
            { x: 0, y: 0, z: 7 },
            bagFrom,
            { id: 9, x: 2, y: 0, z: 7, player: true },
            function () { throw new Error('already in range'); }
        ).type,
        'send'
    );
    const monster = Trade.planOffer(
        { x: 0, y: 0, z: 7 },
        bagFrom,
        { id: 1000000001, x: 0, y: 9, z: 7, player: false },
        function () { throw new Error('a battle-list monster is not walked'); }
    );
    assert.strictEqual(monster.type, 'send');
    assert.strictEqual(monster.partnerId, 1000000001);
    assert.deepStrictEqual(
        Trade.planOffer({ x: 0, y: 0, z: 7 }, bagFrom, null, function () {
            throw new Error('empty tile');
        }),
        { type: 'send', from: bagFrom, partnerId: 0 }
    );

    let session = Trade.createSession();
    session = Trade.applySnapshot(session, {
        side: 1,
        name: 'Bob',
        items: [{ id: 'ruby', count: 1, flags: 0 }]
    });
    assert.strictEqual(session.open, false);
    assert.strictEqual(Trade.acceptEnabled(session), false);

    session = Trade.applySnapshot(session, {
        side: 0,
        name: 'Ann',
        items: [{ id: 'sword', count: 1, flags: 0 }]
    });
    assert.strictEqual(session.open, true);
    assert.strictEqual(session.ownName, 'Ann');
    assert.strictEqual(session.ownItems.length, 1);
    assert.strictEqual(Trade.acceptEnabled(session), false);
    const early = Trade.pressAccept(session);
    assert.strictEqual(early.send, false);
    assert.strictEqual(early.session.accepted, false);

    session = Trade.applySnapshot(session, {
        side: 1,
        name: 'Bob',
        items: [{ id: 'gold_coin', count: 4, flags: 0 }]
    });
    assert.strictEqual(Trade.acceptEnabled(session), true);
    assert.strictEqual(session.counterItems.length, 1);
    assert.strictEqual(session.counterItems[0].count, 4);
    session = Trade.applySnapshot(session, {
        side: 1,
        name: 'Bob',
        items: [{ id: 'shield', count: 1, flags: 0 }]
    });
    assert.strictEqual(session.counterItems.length, 1);
    assert.strictEqual(session.counterItems[0].id, 'shield');
    session = Trade.applySnapshot(session, {
        side: 0,
        name: 'Ann',
        items: [{ id: 'bag', count: 1, flags: 1 }, { id: 'rope', count: 1, flags: 0 }]
    });
    assert.strictEqual(session.ownItems.length, 2);
    assert.strictEqual(session.ownItems[0].id, 'bag');
    assert.strictEqual(session.counterItems[0].id, 'shield');

    const pressed = Trade.pressAccept(session);
    assert.strictEqual(pressed.send, true);
    assert.strictEqual(pressed.session.accepted, true);
    assert.strictEqual(Trade.acceptEnabled(pressed.session), false);
    const again = Trade.pressAccept(pressed.session);
    assert.strictEqual(again.send, false);

    const doc = makeDoc();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const actions = [];
    const looks = [];
    const ui = Trade.attach({
        document: doc,
        floatRoot: function () { return root; },
        spriteUrl: function (id) { return '/sprites/' + id + '.png'; },
        itemLabel: function (id) { return id; },
        onLook: function (x, y, id, count) { looks.push([x, y, id, count]); },
        onAccept: function () { actions.push('accept'); },
        onCancel: function () { actions.push('cancel'); }
    });
    ui.applySnapshot({ side: 1, name: 'Bob', items: [{ id: 'ruby', count: 1, flags: 0 }] });
    assert.strictEqual(ui.isOpen(), false);
    assert.strictEqual(ui.panel(), null);

    ui.applySnapshot({
        side: 0,
        name: 'Ann',
        items: [{ id: 'sword', count: 1, flags: 0 }]
    });
    assert.strictEqual(ui.isOpen(), true);
    const panel = ui.panel();
    assert.ok(panel);
    assert.strictEqual(panel.id, 'trade-window');
    assert.strictEqual(panel.getAttribute('data-container-uid'), null);
    assert.strictEqual(panel.querySelector('.inv-panel-title').textContent, 'Trade');
    assert.strictEqual(panel.querySelectorAll('.inv-trade-label')[0].textContent, 'Ann');
    assert.strictEqual(panel.querySelectorAll('.inv-trade-label')[1].textContent, '');
    const accept = panel.querySelector('.inv-trade-accept');
    assert.strictEqual(accept.disabled, true);
    const ownSlots = panel.querySelectorAll('.inv-trade-grid')[0].querySelectorAll('.inv-trade-slot');
    assert.strictEqual(ownSlots.length, 1);
    assert.strictEqual(ownSlots[0].draggable, false);
    assert.strictEqual(ownSlots[0].getAttribute('draggable'), 'false');
    assert.strictEqual(ownSlots[0].querySelector('.inv-stack-count').textContent, '1');
    click(ownSlots[0], 12, 20);
    assert.deepStrictEqual(looks, [[12, 20, 'sword', 1]]);
    click(accept);
    assert.deepStrictEqual(actions, []);

    ui.applySnapshot({
        side: 1,
        name: 'Bob',
        items: [
            { id: 'gold_coin', count: 4, flags: 0 },
            { id: 'rope', count: 2, flags: 0 }
        ]
    });
    assert.strictEqual(panel.querySelectorAll('.inv-trade-label')[1].textContent, 'Bob');
    assert.strictEqual(accept.disabled, false);
    const counterSlots = panel.querySelectorAll('.inv-trade-grid')[1].querySelectorAll('.inv-trade-slot');
    assert.strictEqual(counterSlots.length, 2);
    assert.strictEqual(counterSlots[0].querySelector('.inv-stack-count').textContent, '4');
    assert.strictEqual(panel.querySelectorAll('.inv-trade-grid')[0].querySelectorAll('.inv-trade-slot').length, 1);
    click(accept);
    assert.deepStrictEqual(actions, ['accept']);
    assert.strictEqual(accept.disabled, true);
    click(accept);
    assert.deepStrictEqual(actions, ['accept']);
    assert.strictEqual(ui.isOpen(), true);

    click(panel.querySelector('.inv-trade-reject'));
    assert.deepStrictEqual(actions, ['accept', 'cancel']);
    assert.strictEqual(ui.isOpen(), false);
    assert.strictEqual(root.childNodes.length, 0);

    ui.applySnapshot({ side: 0, name: 'Ann', items: [{ id: 'sword', count: 1, flags: 0 }] });
    ui.applySnapshot({ side: 1, name: 'Bob', items: [{ id: 'shield', count: 1, flags: 0 }] });
    click(ui.panel().querySelector('.inv-panel-close'));
    assert.strictEqual(actions[actions.length - 1], 'cancel');
    assert.strictEqual(ui.isOpen(), false);

    ui.applySnapshot({ side: 0, name: 'Ann', items: [{ id: 'sword', count: 1, flags: 0 }] });
    ui.applyClose();
    assert.strictEqual(ui.isOpen(), false);
    assert.strictEqual(actions.length, 3);

    const play = fs.readFileSync(path.join(__dirname, '../static/js/play.js'), 'utf8');
    const browse = fs.readFileSync(path.join(__dirname, '../static/js/browse_field.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../static/play.html'), 'utf8');
    const scss = fs.readFileSync(path.join(__dirname, '../scss/app.scss'), 'utf8');
    assert.ok(play.includes('TradeUi.containerAllowsTrade(kind)'));
    assert.ok(play.includes('insertGroundTradeEntry'));
    assert.ok(play.includes('commitTradeOffer'));
    assert.ok(play.includes('entityTradePartner'));
    assert.ok(play.includes('#combatCreaturesList .entity-list-row'));
    assert.ok(play.includes("type: 'TRADE_OFFER'"));
    assert.ok(play.includes('tradeLabel'));
    assert.ok(play.includes('armTrade'));
    assert.ok(play.includes('#trade-window'));
    assert.ok(play.includes("kind: 'equipment', slot: slotKey"));
    assert.ok(play.includes('C2S.TRADE_OFFER'));
    assert.ok(play.includes('C2S.TRADE_ACCEPT'));
    assert.ok(play.includes('C2S.TRADE_CANCEL'));
    assert.ok(play.includes('S2C.TRADE_CLOSE'));
    assert.ok(play.includes('EngineTradeUi'));
    assert.ok(html.includes('/js/trade_ui.js'));
    assert.ok(browse.includes('tradeLabel'));
    assert.ok(browse.includes("action: 'TRADE'"));
    assert.ok(browse.includes('menuRows'));
    assert.ok(!browse.includes('Trade with'));
    assert.ok(!browse.includes('TRADE_OFFER'));
    assert.ok(scss.includes('inv-trade-panel'));
    assert.ok(scss.includes('html[data-trade-aim]'));
    assert.ok(scss.includes('cursor: crosshair'));
    assert.ok(play.includes("setAttribute('data-trade-aim', '1')"));
    assert.ok(scss.includes('@media (max-width: 420px)'));
    const combatStart = play.indexOf('function showCombatMenu');
    const combatEnd = play.indexOf('function slotLookChord');
    const combat = play.slice(combatStart, combatEnd);
    assert.ok(combat.indexOf('Trade with') < 0);
    const listStart = play.indexOf('function renderCombat()');
    const listEnd = play.indexOf('function renderCombatList');
    const list = play.slice(listStart, listEnd);
    assert.ok(list.includes('pendingTrade'));
    assert.ok(list.includes('commitTradeOffer'));
    assert.ok(list.indexOf('Trade with') < 0);
    const flushStart = play.indexOf('function flushPendingCanvasAction');
    const flushEnd = play.indexOf('function onCanvasPointer(ev)');
    const flush = play.slice(flushStart, flushEnd);
    assert.ok(flush.includes('commitTradeOffer'));
    assert.ok(flush.indexOf('encodeTradeOffer') < 0);
    const commitStart = play.indexOf('function commitTradeOffer');
    const commitEnd = play.indexOf('function showInvMenu');
    const commit = play.slice(commitStart, commitEnd);
    assert.ok(commit.includes('planOffer'));
    assert.ok(commit.includes('encodeTradeOffer'));
    assert.ok(commit.includes('WALK_HOPS'));
    assert.ok(commit.includes("type: 'TRADE_OFFER'"));

    console.log('ok trade_ui');
}

main();
